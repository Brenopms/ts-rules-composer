import type { Rule } from "../src/lib";
import {
  defineOutcomes,
  fail,
  not,
  pass,
  pipeRules,
  withLazyContext,
  withMemoize,
  withRetry,
  withTimeout,
} from "../src/lib";

// Types
type Prescription = {
  id: string;
  patientId: string;
  prescriberId: string;
  drug: string;
  dailyDoseMg: number;
  issuedDaysAgo: number;
  controlled: boolean;
};

type PatientRecord = {
  allergies: string[];
  currentDrugs: string[];
};

const VALID_FOR_DAYS = 30;
const MAX_DAILY_DOSE_MG: Record<string, number> = {
  amoxicillin: 3000,
  ibuprofen: 2400,
  oxycodone: 80,
};
const DRUG_CLASS: Record<string, string> = {
  amoxicillin: "penicillin",
  ibuprofen: "nsaid",
  oxycodone: "opioid",
};

// Mock services (each a network call)
const patientRecords = {
  load: async (_patientId: string): Promise<PatientRecord> => ({
    allergies: ["sulfa"],
    currentDrugs: ["lisinopril"],
  }),
};

const recallService = {
  isRecalled: async (_drug: string) => false,
};

const interactionService = {
  conflicts: async (
    _drug: string,
    _currentDrugs: string[],
  ): Promise<string[]> => [],
};

const prescriberRegistry = {
  canPrescribeControlled: async (_prescriberId: string) => true,
};

// Every check that could not run is recorded here, for the on-call pharmacist.
const incidents: unknown[] = [];

// 1. The outcomes. Order is precedence: "refuse" outranks
//    "pharmacist_review", which outranks "dispense". A check that could not
//    run (an outage, a timeout) is never read as "safe": it sends the
//    prescription to a pharmacist, and onErrorCaught records the cause.
const pharmacy = defineOutcomes(["refuse", "pharmacist_review", "dispense"], {
  onError: "pharmacist_review",
  onErrorCaught: (error) => incidents.push(error),
});

// 2. Local checks: no network calls, so they run first and a refusal here
//    skips every paid lookup.
const isWithinValidity: Rule<Prescription> = (rx) =>
  rx.issuedDaysAgo <= VALID_FOR_DAYS ? pass() : fail("Prescription expired");

const isKnownDrug: Rule<Prescription> = (rx) =>
  rx.drug in MAX_DAILY_DOSE_MG ? pass() : fail(`Unknown drug: ${rx.drug}`);

const isDoseWithinLimit: Rule<Prescription> = (rx) =>
  rx.dailyDoseMg <= MAX_DAILY_DOSE_MG[rx.drug]
    ? pass()
    : fail("Daily dose above the maximum");

const prescriptionCheck = pharmacy.mapOutcome(
  pipeRules([isWithinValidity, isKnownDrug, isDoseWithinLimit]),
  { failed: "refuse" },
);

// 3. A positive rule ("the drug is recalled"), shared with the stock
//    dashboard, inverted with `not`. A business failure inverts as usual,
//    but an outage stays unknown: `not` keeps it failed and caught, so a
//    recall service outage gives a pharmacist review, never "dispense".
//    (In 1.x, `not` turned that outage into a pass.)
const isRecalled: Rule<Prescription> = async (rx) =>
  (await recallService.isRecalled(rx.drug))
    ? pass()
    : fail("Drug is not recalled");

const recallCheck = pharmacy.mapOutcome(not(isRecalled, "Drug is recalled"), {
  failed: "refuse",
});

// 4. Checks against the patient record, loaded once per prescription with
//    withLazyContext. A loader failure is a caught failure (cause = the
//    error), so a records outage gives a pharmacist review too.
const isNotAllergic: Rule<Prescription, string, PatientRecord> = (
  rx,
  record,
) => {
  if (!record) {
    return fail("Patient record missing");
  }
  return record.allergies.includes(DRUG_CLASS[rx.drug])
    ? fail(`Patient is allergic to ${DRUG_CLASS[rx.drug]}`)
    : pass();
};

const hasNoInteractions: Rule<Prescription, string, PatientRecord> = async (
  rx,
  record,
) => {
  const conflicts = await interactionService.conflicts(
    rx.drug,
    record?.currentDrugs ?? [],
  );
  return conflicts.length === 0
    ? pass()
    : fail(`Interacts with ${conflicts.join(", ")}`);
};

// The interaction service is slow at peak times. Each attempt gets 500 ms;
// a timeout is a caught failure, so retryOn: "thrown" retries it (and a
// throw), but a found interaction is a business failure and is never
// retried. After three timeouts the result is still caught, so it reaches
// onError instead of reading as "no interactions".
const resilientInteractionCheck = withRetry(
  withTimeout(hasNoInteractions, 500, "Interaction check timed out"),
  { attempts: 3, delayMs: 100, retryOn: "thrown" },
);

const recordCheck = pharmacy.mapOutcome(
  withLazyContext(
    (rx: Prescription) => patientRecords.load(rx.patientId),
    pipeRules([isNotAllergic, resilientInteractionCheck]),
  ),
  { failed: "refuse" },
);

// 5. Controlled substances: the prescriber must be licensed for them, and a
//    pharmacist always reviews the hand-over. The registry answer is cached
//    per prescriber for an hour; an outage is never cached, so the next
//    prescription asks the registry again.
const isLicensedForControlled = withMemoize(
  async (rx: Prescription) =>
    (await prescriberRegistry.canPrescribeControlled(rx.prescriberId))
      ? pass()
      : fail("Prescriber not licensed for controlled substances"),
  (rx) => rx.prescriberId,
  { ttl: 60 * 60 * 1000 },
);

const controlledCheck = pharmacy.ifElse(
  (rx: Prescription) => rx.controlled,
  pharmacy.mapOutcome(isLicensedForControlled, {
    failed: "refuse",
    passed: "pharmacist_review",
  }),
  "dispense",
);

// 6. The full policy. combine runs the checks in order and stops at the
//    first "refuse". A pharmacist review is not final: a later refusal
//    still wins.
const dispense = pharmacy.combine([
  prescriptionCheck,
  recallCheck,
  recordCheck,
  controlledCheck,
]);

// Example usage
void (async () => {
  const prescription: Prescription = {
    id: "rx-001",
    patientId: "patient-42",
    prescriberId: "dr-lee",
    drug: "amoxicillin",
    dailyDoseMg: 1500,
    issuedDaysAgo: 3,
    controlled: false,
  };

  // { outcome: "dispense" }
  console.log(await dispense(prescription));

  // { outcome: "refuse" } (dose above the maximum; no service called)
  console.log(await dispense({ ...prescription, dailyDoseMg: 4000 }));

  // { outcome: "pharmacist_review" } (controlled, licensed prescriber)
  console.log(
    await dispense({
      ...prescription,
      drug: "oxycodone",
      dailyDoseMg: 20,
      controlled: true,
    }),
  );

  // { outcome: "refuse" } (penicillin allergy on record)
  const load = patientRecords.load;
  patientRecords.load = async () => ({
    allergies: ["penicillin"],
    currentDrugs: [],
  });
  console.log(await dispense(prescription));
  patientRecords.load = load;

  // { outcome: "pharmacist_review" } (recall service down: unknown, not safe)
  const isRecalledDrug = recallService.isRecalled;
  recallService.isRecalled = async () => {
    throw new Error("recall service unavailable");
  };
  console.log(await dispense(prescription));
  recallService.isRecalled = isRecalledDrug;

  // { outcome: "pharmacist_review" } (interaction service hangs: three
  // timeouts, then onError)
  const conflicts = interactionService.conflicts;
  interactionService.conflicts = () => new Promise<never>(() => {});
  console.log(await dispense(prescription));
  interactionService.conflicts = conflicts;

  // Incidents: [ 'recall service unavailable', 'Interaction check timed out' ]
  console.log(
    "Incidents:",
    incidents.map((error) =>
      error instanceof Error ? error.message : String(error),
    ),
  );
})();

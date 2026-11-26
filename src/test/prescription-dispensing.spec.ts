import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineOutcomes,
  fail,
  not,
  pass,
  pipeRules,
  type Rule,
  withLazyContext,
  withMemoize,
  withRetry,
  withTimeout,
} from "../lib";

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

// Mock services
const patientRecords = {
  load: vi.fn<(patientId: string) => Promise<PatientRecord>>(),
};
const recallService = {
  isRecalled: vi.fn<(drug: string) => Promise<boolean>>(),
};
const interactionService = {
  conflicts:
    vi.fn<(drug: string, currentDrugs: string[]) => Promise<string[]>>(),
};
const prescriberRegistry = {
  canPrescribeControlled: vi.fn<(prescriberId: string) => Promise<boolean>>(),
};
const onErrorCaught = vi.fn<(error: unknown) => void>();

// Policy (copy of examples/prescription-dispensing.example.ts; the incident
// list is replaced by the onErrorCaught mock)
const pharmacy = defineOutcomes(["refuse", "pharmacist_review", "dispense"], {
  onError: "pharmacist_review",
  onErrorCaught,
});

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

const isRecalled: Rule<Prescription> = async (rx) =>
  (await recallService.isRecalled(rx.drug))
    ? pass()
    : fail("Drug is not recalled");

const recallCheck = pharmacy.mapOutcome(not(isRecalled, "Drug is recalled"), {
  failed: "refuse",
});

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

// Module-level, as in the example, so the cache outlives a single test: each
// test that reaches it uses its own prescriberId.
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

const dispense = pharmacy.combine([
  prescriptionCheck,
  recallCheck,
  recordCheck,
  controlledCheck,
]);

describe("prescription-dispensing decision", () => {
  const prescription: Prescription = {
    id: "rx-001",
    patientId: "patient-42",
    prescriberId: "dr-lee",
    drug: "amoxicillin",
    dailyDoseMg: 1500,
    issuedDaysAgo: 3,
    controlled: false,
  };

  const controlled = (prescriberId: string): Prescription => ({
    ...prescription,
    prescriberId,
    drug: "oxycodone",
    dailyDoseMg: 20,
    controlled: true,
  });

  const expectNoServiceCalls = () => {
    expect(recallService.isRecalled).not.toHaveBeenCalled();
    expect(patientRecords.load).not.toHaveBeenCalled();
    expect(interactionService.conflicts).not.toHaveBeenCalled();
    expect(prescriberRegistry.canPrescribeControlled).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    patientRecords.load.mockResolvedValue({
      allergies: ["sulfa"],
      currentDrugs: ["lisinopril"],
    });
    recallService.isRecalled.mockResolvedValue(false);
    interactionService.conflicts.mockResolvedValue([]);
    prescriberRegistry.canPrescribeControlled.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispenses a clean prescription after every check", async () => {
    expect(await dispense(prescription)).toEqual({ outcome: "dispense" });
    expect(recallService.isRecalled).toHaveBeenCalledWith("amoxicillin");
    expect(patientRecords.load).toHaveBeenCalledWith("patient-42");
    expect(interactionService.conflicts).toHaveBeenCalledWith("amoxicillin", [
      "lisinopril",
    ]);
    expect(prescriberRegistry.canPrescribeControlled).not.toHaveBeenCalled();
    expect(onErrorCaught).not.toHaveBeenCalled();
  });

  describe("local checks", () => {
    it.each<[string, Partial<Prescription>]>([
      ["an expired prescription", { issuedDaysAgo: 31 }],
      ["an unknown drug", { drug: "unobtainium" }],
      ["a dose above the maximum", { dailyDoseMg: 4000 }],
    ])("refuses %s before any service call", async (_, change) => {
      expect(await dispense({ ...prescription, ...change })).toEqual({
        outcome: "refuse",
      });
      expectNoServiceCalls();
      expect(onErrorCaught).not.toHaveBeenCalled();
    });

    it("accepts a prescription on its last valid day at the maximum dose", async () => {
      expect(
        await dispense({
          ...prescription,
          issuedDaysAgo: VALID_FOR_DAYS,
          dailyDoseMg: 3000,
        }),
      ).toEqual({ outcome: "dispense" });
    });
  });

  describe("recall check (not)", () => {
    it("refuses a recalled drug and stops: the record is never loaded", async () => {
      recallService.isRecalled.mockResolvedValue(true);
      expect(await dispense(prescription)).toEqual({ outcome: "refuse" });
      expect(patientRecords.load).not.toHaveBeenCalled();
      expect(onErrorCaught).not.toHaveBeenCalled();
    });

    it("sends a recall service outage to a pharmacist, not to dispense", async () => {
      const outage = new Error("recall service unavailable");
      recallService.isRecalled.mockRejectedValue(outage);

      expect(await recallCheck(prescription)).toEqual({
        outcome: "pharmacist_review",
      });
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught.mock.calls[0]?.[0]).toBe(outage);
    });

    it("keeps checking after the outage, so a later refusal still wins", async () => {
      recallService.isRecalled.mockRejectedValue(new Error("down"));
      patientRecords.load.mockResolvedValue({
        allergies: ["penicillin"],
        currentDrugs: [],
      });

      expect(await dispense(prescription)).toEqual({ outcome: "refuse" });
      expect(onErrorCaught).toHaveBeenCalledOnce();
    });
  });

  describe("patient record checks (withLazyContext)", () => {
    it("refuses an allergy and skips the interaction service", async () => {
      patientRecords.load.mockResolvedValue({
        allergies: ["penicillin"],
        currentDrugs: [],
      });
      expect(await dispense(prescription)).toEqual({ outcome: "refuse" });
      expect(interactionService.conflicts).not.toHaveBeenCalled();
    });

    it("sends a records outage to a pharmacist with the loader's error", async () => {
      const outage = new Error("records unavailable");
      patientRecords.load.mockRejectedValue(outage);

      expect(await dispense(prescription)).toEqual({
        outcome: "pharmacist_review",
      });
      expect(interactionService.conflicts).not.toHaveBeenCalled();
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught.mock.calls[0]?.[0]).toBe(outage);
    });
  });

  describe("interaction check (withRetry + withTimeout)", () => {
    it("refuses a found interaction without retrying it", async () => {
      interactionService.conflicts.mockResolvedValue(["warfarin"]);
      expect(await dispense(prescription)).toEqual({ outcome: "refuse" });
      expect(interactionService.conflicts).toHaveBeenCalledOnce();
      expect(onErrorCaught).not.toHaveBeenCalled();
    });

    it("retries a thrown attempt and dispenses once the service answers", async () => {
      interactionService.conflicts
        .mockRejectedValueOnce(new Error("blip"))
        .mockResolvedValueOnce([]);

      expect(await dispense(prescription)).toEqual({ outcome: "dispense" });
      expect(interactionService.conflicts).toHaveBeenCalledTimes(2);
      expect(onErrorCaught).not.toHaveBeenCalled();
    });

    it("sends three timeouts to a pharmacist, reporting the timeout once", async () => {
      vi.useFakeTimers();
      interactionService.conflicts.mockReturnValue(
        new Promise<never>(() => {}),
      );

      const decision = dispense(prescription);
      await vi.advanceTimersByTimeAsync(3 * 500 + 2 * 100);

      expect(await decision).toEqual({ outcome: "pharmacist_review" });
      expect(interactionService.conflicts).toHaveBeenCalledTimes(3);
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught).toHaveBeenCalledWith("Interaction check timed out");
    });
  });

  describe("controlled substances (ifElse + withMemoize)", () => {
    it("sends a licensed prescriber's controlled prescription to a pharmacist", async () => {
      expect(await dispense(controlled("dr-licensed"))).toEqual({
        outcome: "pharmacist_review",
      });
      expect(prescriberRegistry.canPrescribeControlled).toHaveBeenCalledWith(
        "dr-licensed",
      );
      expect(onErrorCaught).not.toHaveBeenCalled();
    });

    it("refuses when the prescriber is not licensed", async () => {
      prescriberRegistry.canPrescribeControlled.mockResolvedValue(false);
      expect(await dispense(controlled("dr-unlicensed"))).toEqual({
        outcome: "refuse",
      });
    });

    it("caches the registry answer per prescriber", async () => {
      await dispense(controlled("dr-cached"));
      await dispense({ ...controlled("dr-cached"), id: "rx-002" });
      expect(prescriberRegistry.canPrescribeControlled).toHaveBeenCalledOnce();
    });

    it("does not cache a registry outage: the next prescription asks again", async () => {
      const outage = new Error("registry unavailable");
      prescriberRegistry.canPrescribeControlled
        .mockRejectedValueOnce(outage)
        .mockResolvedValueOnce(false);

      expect(await dispense(controlled("dr-outage"))).toEqual({
        outcome: "pharmacist_review",
      });
      expect(onErrorCaught).toHaveBeenCalledWith(outage);

      expect(await dispense(controlled("dr-outage"))).toEqual({
        outcome: "refuse",
      });
      expect(prescriberRegistry.canPrescribeControlled).toHaveBeenCalledTimes(
        2,
      );
    });
  });
});

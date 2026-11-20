import type { Rule } from "../src/lib";
import { defineOutcomes, fail, pass, pipeRules } from "../src/lib";

// Types
type DocumentType = "passport" | "id_card" | "drivers_license";

type Applicant = {
  id: string;
  fullName: string;
  age: number;
  country: string;
  documentType: DocumentType;
  documentExpired: boolean;
};

// Mock services (each call costs money)
const sanctionsService = {
  isListed: async (_applicantId: string) => false,
};

const documentService = {
  isAuthentic: async (_applicantId: string, _type: DocumentType) => true,
};

const pepService = {
  // politically exposed person screening
  isExposed: async (_fullName: string) => false,
};

// Failures turned into "manual_review" are kept for the compliance team.
const incidents: unknown[] = [];

// 1. The outcome set. Order is precedence: "rejected" outranks
//    "manual_review", which outranks "verified". Any failure while running
//    (an outage, a malformed result) sends the applicant to a human.
const kyc = defineOutcomes(["rejected", "manual_review", "verified"], {
  onError: "manual_review",
  onErrorCaught: (error) => incidents.push(error),
});

const SUPPORTED_COUNTRIES = ["US", "GB", "DE", "BR"];

// 2. Plain Rules, the same ones a 1.x validator would use.
const isAdult: Rule<Applicant> = (applicant) =>
  applicant.age >= 18 ? pass() : fail("Applicant must be an adult");

const isSupportedCountry: Rule<Applicant> = (applicant) =>
  SUPPORTED_COUNTRIES.includes(applicant.country)
    ? pass()
    : fail(`Unsupported country: ${applicant.country}`);

const hasValidDocument: Rule<Applicant> = (applicant) =>
  applicant.documentExpired ? fail("Document has expired") : pass();

const isNotSanctioned: Rule<Applicant> = async (applicant) =>
  (await sanctionsService.isListed(applicant.id))
    ? fail("Applicant is on a sanctions list")
    : pass();

const isDocumentAuthentic: Rule<Applicant> = async (applicant) =>
  (await documentService.isAuthentic(applicant.id, applicant.documentType))
    ? pass()
    : fail("Document failed the authenticity check");

const isNotExposed: Rule<Applicant> = async (applicant) =>
  (await pepService.isExposed(applicant.fullName))
    ? fail("Applicant is a politically exposed person")
    : pass();

// 3. Rule -> Decision. Only local, side-effect-free checks go in this pipe:
//    a default pipeRules turns an exception into "failed", which mapOutcome
//    would read as a rejection. `passed` is omitted, so it defaults to the
//    last declared outcome ("verified").
const basicChecks = kyc.mapOutcome(
  pipeRules([isAdult, isSupportedCountry, hasValidDocument]),
  { failed: "rejected" },
);

// 4. Each external call gets its own mapOutcome. mapOutcome runs the rule
//    without withSafeError, so a listed applicant is rejected, but a
//    sanctions-service outage is onError ("manual_review"), not a rejection.
const sanctions = kyc.mapOutcome(isNotSanctioned, { failed: "rejected" });

// 5. An explicit `passed`: a driver's licence that passes the authenticity
//    check still needs a human look, because it does not prove nationality.
const documentCheck = kyc.match(
  (applicant: Applicant) => applicant.documentType,
  {
    drivers_license: kyc.mapOutcome(isDocumentAuthentic, {
      failed: "rejected",
      passed: "manual_review",
    }),
  },
  kyc.mapOutcome(isDocumentAuthentic, { failed: "rejected" }),
);

const pepScreening = kyc.mapOutcome(isNotExposed, { failed: "manual_review" });

// 6. The full policy. Sequential: the strongest outcome wins, and the run
//    stops as soon as "rejected" appears, so an applicant who fails the free
//    local checks never triggers the paid sanctions, document and PEP calls.
const onboard = kyc.combine([
  basicChecks,
  sanctions,
  documentCheck,
  pepScreening,
]);

// Example usage
(async () => {
  const applicant: Applicant = {
    id: "kyc-001",
    fullName: "Ana Souza",
    age: 29,
    country: "BR",
    documentType: "passport",
    documentExpired: false,
  };

  // { outcome: "verified" }
  console.log(await onboard(applicant));

  // { outcome: "rejected" } (under 18; no paid calls made)
  console.log(await onboard({ ...applicant, age: 16 }));

  // { outcome: "manual_review" } (driver's licence: explicit passed mapping)
  console.log(await onboard({ ...applicant, documentType: "drivers_license" }));

  // { outcome: "rejected" } (on a sanctions list: the rule returned fail)
  const isListed = sanctionsService.isListed;
  sanctionsService.isListed = async () => true;
  console.log(await onboard(applicant));

  // { outcome: "manual_review" } (sanctions service down -> onError, not a rejection)
  sanctionsService.isListed = async () => {
    throw new Error("sanctions service unavailable");
  };
  console.log(await onboard(applicant));
  sanctionsService.isListed = isListed;

  // Incidents: [ 'sanctions service unavailable' ]
  console.log(
    "Incidents:",
    incidents.map((error) => (error as Error).message),
  );
})();

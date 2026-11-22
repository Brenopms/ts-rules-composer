import type { Decision, OutcomeOf, Rule } from "../src/lib";
import { defineOutcomes, fail, pass } from "../src/lib";

// Types
type Claim = {
  id: string;
  kind: "accident" | "theft" | "damage";
  amount: number;
  policyLimit: number;
  policyActive: boolean;
  hasClaimForm: boolean;
  hasPoliceReport: boolean;
};

// Mock services
const documentStore = {
  receiptCount: async (_claimId: string) => 2,
};

const fraudService = {
  score: async (_claim: Claim) => 0.1,
};

const duplicateService = {
  isDuplicate: async (_claimId: string) => false,
};

// Every check writes here, so an adjuster can see why a claim was settled.
const auditTrail: string[] = [];

// 1. The claim outcomes. Order is precedence: "deny" outranks
//    "investigate", which outranks "pay". A failure while running sends the
//    claim to an investigator.
const claims = defineOutcomes(["deny", "investigate", "pay"], {
  onError: "investigate",
  onErrorCaught: (error) => auditTrail.push(`error: ${String(error)}`),
});
type ClaimOutcome = OutcomeOf<typeof claims>; // "deny" | "investigate" | "pay"

// 2. A binary toolkit. "failed" comes first, so it outranks "passed", and
//    any failure while running is "failed" (fail-closed). Every Rule is a
//    binary decision, so this toolkit's combine takes raw Rules directly.
//    Each toolkit reports only the failures it catches itself: a document
//    store outage is caught here and becomes "failed", so the claims hook
//    never sees it. This toolkit needs its own onErrorCaught.
const paperwork = defineOutcomes(["failed", "passed"], {
  onError: "failed",
  onErrorCaught: (error) =>
    auditTrail.push(`paperwork error: ${String(error)}`),
});

const hasClaimForm: Rule<Claim> = (claim) =>
  claim.hasClaimForm ? pass() : fail("Claim form is missing");

const hasReceipts: Rule<Claim> = async (claim) =>
  (await documentStore.receiptCount(claim.id)) > 0
    ? pass()
    : fail("No receipts uploaded");

const hasPoliceReportForTheft: Rule<Claim> = (claim) =>
  claim.kind !== "theft" || claim.hasPoliceReport
    ? pass()
    : fail("A theft claim needs a police report");

const documentsComplete = paperwork.combine([
  hasClaimForm,
  hasReceipts,
  hasPoliceReportForTheft,
]);

// Incomplete paperwork (or a document store outage) needs a person to
// chase the documents; it is not a reason to deny.
const paperworkCheck = claims.mapOutcome(documentsComplete, {
  failed: "investigate",
});

// 3. An inline predicate: its `claim` parameter is typed from the
//    annotated result, so no annotation is needed inside.
const coverage: Decision<Claim, ClaimOutcome> = claims.ifElse(
  (claim) => claim.policyActive && claim.amount <= claim.policyLimit,
  "pay",
  "deny",
);

// 4. A hand-written decision that records its score. A score the service
//    could not compute (NaN) is handled like an outage: claims.onError.
const fraudCheck: Decision<Claim, ClaimOutcome> = async (claim) => {
  const score = await fraudService.score(claim);
  auditTrail.push(`fraud score: ${score}`);
  if (Number.isNaN(score)) return claims.outcome(claims.onError);
  return claims.outcome(score > 0.7 ? "investigate" : "pay");
};

// 5. Nested combinators with a per-combinator onError. For a claim under
//    500, investigating costs more than paying, so a duplicate-service
//    outage pays. The override covers only that inner ifElse's own
//    predicate; larger claims keep the toolkit's onError ("investigate").
const isDuplicate = async (claim: Claim) =>
  duplicateService.isDuplicate(claim.id);

const duplicateCheck = claims.ifElse(
  (claim: Claim) => claim.amount < 500,
  claims.ifElse(isDuplicate, "deny", "pay", { onError: "pay" }),
  claims.ifElse(isDuplicate, "deny", "pay"),
);

// 6. The full policy, with a built-in resolver. The default stops at the
//    first "deny"; runEveryCheck never stops, so every check runs and the
//    audit trail is complete. It still keeps the strongest outcome.
const settleClaim = claims.combine(
  [coverage, paperworkCheck, fraudCheck, duplicateCheck],
  { resolver: claims.resolvers.runEveryCheck },
);

// Example usage
(async () => {
  const claim: Claim = {
    id: "claim-1",
    kind: "accident",
    amount: 1_200,
    policyLimit: 10_000,
    policyActive: true,
    hasClaimForm: true,
    hasPoliceReport: false,
  };

  // { outcome: "pay" }
  console.log(await settleClaim(claim));

  // { outcome: "deny" } (over the policy limit)
  // Audit trail: [ 'fraud score: 0.1' ] (fraud still checked after the deny)
  auditTrail.length = 0;
  console.log(await settleClaim({ ...claim, amount: 20_000 }));
  console.log("Audit trail:", auditTrail);

  // { outcome: "investigate" } (theft without a police report)
  console.log(await settleClaim({ ...claim, kind: "theft" }));

  // { outcome: "pay" } (small claim, duplicate service down -> override "pay")
  // { outcome: "investigate" } (large claim, duplicate service down -> onError)
  const isDuplicateClaim = duplicateService.isDuplicate;
  duplicateService.isDuplicate = async () => {
    throw new Error("duplicate service unavailable");
  };
  console.log(await settleClaim({ ...claim, amount: 300 }));
  console.log(await settleClaim(claim));
  duplicateService.isDuplicate = isDuplicateClaim;

  // { outcome: "investigate" } (document store down; same outcome as zero
  // receipts, but the paperwork hook records it)
  // Audit trail: [ 'paperwork error: Error: document store unavailable',
  //   'fraud score: 0.1' ]
  auditTrail.length = 0;
  const receiptCount = documentStore.receiptCount;
  documentStore.receiptCount = async () => {
    throw new Error("document store unavailable");
  };
  console.log(await settleClaim(claim));
  console.log("Audit trail:", auditTrail);
  documentStore.receiptCount = receiptCount;
})();

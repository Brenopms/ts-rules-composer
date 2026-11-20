import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Decision,
  defineOutcomes,
  fail,
  type OutcomeOf,
  pass,
  type Resolver,
  type Rule,
} from "../lib";

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
  receiptCount: vi.fn<(claimId: string) => Promise<number>>(),
};
const fraudService = { score: vi.fn<(claim: Claim) => Promise<number>>() };
const duplicateService = {
  isDuplicate: vi.fn<(claimId: string) => Promise<boolean>>(),
};
const onErrorCaught = vi.fn<(error: unknown) => void>();

// Policy (copy of examples/insurance-claim.example.ts; the audit trail is
// replaced by the mocks' call records)
const claims = defineOutcomes(["deny", "investigate", "pay"], {
  onError: "investigate",
  onErrorCaught,
});
type ClaimOutcome = OutcomeOf<typeof claims>;

const paperwork = defineOutcomes(["failed", "passed"], { onError: "failed" });

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

const paperworkCheck = claims.mapOutcome(documentsComplete, {
  failed: "investigate",
});

const coverage: Decision<Claim, ClaimOutcome> = claims.ifElse(
  (claim) => claim.policyActive && claim.amount <= claim.policyLimit,
  "pay",
  "deny",
);

const fraudCheck: Decision<Claim, ClaimOutcome> = async (claim) => {
  const score = await fraudService.score(claim);
  if (Number.isNaN(score)) return claims.outcome(claims.onError);
  return claims.outcome(score > 0.7 ? "investigate" : "pay");
};

const isDuplicate = async (claim: Claim) =>
  duplicateService.isDuplicate(claim.id);

const duplicateCheck = claims.ifElse(
  (claim: Claim) => claim.amount < 500,
  claims.ifElse(isDuplicate, "deny", "pay", { onError: "pay" }),
  claims.ifElse(isDuplicate, "deny", "pay"),
);

const rank = (outcome: ClaimOutcome) => claims.outcomes.indexOf(outcome);

const runEveryCheck: Resolver<ClaimOutcome> = {
  combine: (current, next) => (rank(next) < rank(current) ? next : current),
  isFinal: () => false,
};

const settleClaim = claims.combine(
  [coverage, paperworkCheck, fraudCheck, duplicateCheck],
  { resolver: runEveryCheck },
);

describe("insurance-claim decision", () => {
  const claim: Claim = {
    id: "claim-1",
    kind: "accident",
    amount: 1_200,
    policyLimit: 10_000,
    policyActive: true,
    hasClaimForm: true,
    hasPoliceReport: false,
  };

  const expectEveryCheckCalled = () => {
    expect(documentStore.receiptCount).toHaveBeenCalledOnce();
    expect(fraudService.score).toHaveBeenCalledOnce();
    expect(duplicateService.isDuplicate).toHaveBeenCalledOnce();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    documentStore.receiptCount.mockResolvedValue(2);
    fraudService.score.mockResolvedValue(0.1);
    duplicateService.isDuplicate.mockResolvedValue(false);
  });

  it("pays a covered claim with complete paperwork", async () => {
    expect(await settleClaim(claim)).toEqual({ outcome: "pay" });
    expectEveryCheckCalled();
    expect(onErrorCaught).not.toHaveBeenCalled();
  });

  describe("coverage (ifElse with an inline predicate)", () => {
    it("denies a claim over the policy limit or on an inactive policy", async () => {
      expect(await coverage({ ...claim, amount: 20_000 })).toEqual({
        outcome: "deny",
      });
      expect(await coverage({ ...claim, policyActive: false })).toEqual({
        outcome: "deny",
      });
      expect(await coverage(claim)).toEqual({ outcome: "pay" });
    });
  });

  describe("custom resolver (run every check)", () => {
    it("keeps running after a deny, so every check is on record", async () => {
      expect(await settleClaim({ ...claim, amount: 20_000 })).toEqual({
        outcome: "deny",
      });
      expectEveryCheckCalled();
    });

    it("keeps the strongest outcome whatever order it appears in", async () => {
      fraudService.score.mockResolvedValue(0.9);
      duplicateService.isDuplicate.mockResolvedValue(true);
      expect(await settleClaim(claim)).toEqual({ outcome: "deny" });
    });

    it("differs from the default resolver, which stops at deny", async () => {
      const stopsAtDeny = claims.combine([
        coverage,
        paperworkCheck,
        fraudCheck,
        duplicateCheck,
      ]);
      expect(await stopsAtDeny({ ...claim, amount: 20_000 })).toEqual({
        outcome: "deny",
      });
      expect(documentStore.receiptCount).not.toHaveBeenCalled();
      expect(fraudService.score).not.toHaveBeenCalled();
    });

    it("investigates a high fraud score", async () => {
      fraudService.score.mockResolvedValue(0.9);
      expect(await settleClaim(claim)).toEqual({ outcome: "investigate" });
    });

    it("treats a NaN fraud score like an outage (claims.onError)", async () => {
      fraudService.score.mockResolvedValue(Number.NaN);
      expect(await fraudCheck(claim)).toEqual({ outcome: claims.onError });
      expect(await settleClaim(claim)).toEqual({ outcome: "investigate" });
      // returned on purpose, not caught: the hook is not called
      expect(onErrorCaught).not.toHaveBeenCalled();
    });
  });

  describe("binary paperwork toolkit (raw Rules)", () => {
    it("passes complete paperwork and fails on the first missing document", async () => {
      expect(await documentsComplete(claim)).toEqual({ outcome: "passed" });
      expect(
        await documentsComplete({ ...claim, hasClaimForm: false }),
      ).toEqual({ outcome: "failed" });
      // "failed" is final for the binary toolkit: later rules not called
      expect(documentStore.receiptCount).toHaveBeenCalledOnce();
    });

    it("investigates a theft claim without a police report", async () => {
      expect(await settleClaim({ ...claim, kind: "theft" })).toEqual({
        outcome: "investigate",
      });
      expect(
        await settleClaim({ ...claim, kind: "theft", hasPoliceReport: true }),
      ).toEqual({ outcome: "pay" });
    });

    it("investigates when no receipts were uploaded", async () => {
      documentStore.receiptCount.mockResolvedValue(0);
      expect(await settleClaim(claim)).toEqual({ outcome: "investigate" });
    });

    it("fails closed on a document store outage, using its own onError", async () => {
      const outage = new Error("document store unavailable");
      documentStore.receiptCount.mockRejectedValue(outage);
      expect(await documentsComplete(claim)).toEqual({ outcome: "failed" });
      // the binary toolkit has no onErrorCaught; the claims hook is not called
      expect(onErrorCaught).not.toHaveBeenCalled();
    });
  });

  describe("duplicate check (nested ifElse with an onError override)", () => {
    it("denies a duplicate claim of any size", async () => {
      duplicateService.isDuplicate.mockResolvedValue(true);
      expect(await duplicateCheck({ ...claim, amount: 300 })).toEqual({
        outcome: "deny",
      });
      expect(await duplicateCheck(claim)).toEqual({ outcome: "deny" });
    });

    it("pays a small claim when the duplicate service is down (override wins)", async () => {
      const outage = new Error("duplicate service unavailable");
      duplicateService.isDuplicate.mockRejectedValue(outage);
      expect(await settleClaim({ ...claim, amount: 300 })).toEqual({
        outcome: "pay",
      });
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught).toHaveBeenCalledWith(outage);
    });

    it("investigates a large claim when the duplicate service is down (toolkit onError)", async () => {
      const outage = new Error("duplicate service unavailable");
      duplicateService.isDuplicate.mockRejectedValue(outage);
      expect(claims.onError).toBe("investigate");
      expect(await settleClaim(claim)).toEqual({ outcome: "investigate" });
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught).toHaveBeenCalledWith(outage);
    });
  });

  describe("outages", () => {
    it("investigates when the fraud service is down, and reports it once", async () => {
      const outage = new Error("fraud service unavailable");
      fraudService.score.mockRejectedValue(outage);
      expect(await settleClaim(claim)).toEqual({ outcome: "investigate" });
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught).toHaveBeenCalledWith(outage);
      // the custom resolver still runs the remaining check
      expect(duplicateService.isDuplicate).toHaveBeenCalledOnce();
    });

    it("investigates when the resolver itself throws", async () => {
      const broken = new Error("resolver bug");
      const throwingResolver: Resolver<ClaimOutcome> = {
        combine: () => {
          throw broken;
        },
        isFinal: () => false,
      };
      const policy = claims.combine([coverage, fraudCheck], {
        resolver: throwingResolver,
      });
      expect(await policy(claim)).toEqual({ outcome: "investigate" });
      expect(onErrorCaught).toHaveBeenCalledWith(broken);
    });
  });
});

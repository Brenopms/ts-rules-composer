import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineOutcomes, fail, pass, pipeRules, type Rule } from "../lib";

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

// Mock services
const sanctionsService = {
  isListed: vi.fn<(applicantId: string) => Promise<boolean>>(),
};
const documentService = {
  isAuthentic:
    vi.fn<(applicantId: string, type: DocumentType) => Promise<boolean>>(),
};
const pepService = {
  isExposed: vi.fn<(fullName: string) => Promise<boolean>>(),
};
const onErrorCaught = vi.fn<(error: unknown) => void>();

// Policy (copy of examples/kyc-onboarding.example.ts)
const kyc = defineOutcomes(["rejected", "manual_review", "verified"], {
  onError: "manual_review",
  onErrorCaught,
});

const SUPPORTED_COUNTRIES = ["US", "GB", "DE", "BR"];

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

const basicChecks = kyc.mapOutcome(
  pipeRules([isAdult, isSupportedCountry, hasValidDocument]),
  { failed: "rejected" },
);

const sanctions = kyc.mapOutcome(isNotSanctioned, { failed: "rejected" });

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

const onboard = kyc.combine([
  basicChecks,
  sanctions,
  documentCheck,
  pepScreening,
]);

describe("kyc-onboarding decision", () => {
  const applicant: Applicant = {
    id: "kyc-001",
    fullName: "Ana Souza",
    age: 29,
    country: "BR",
    documentType: "passport",
    documentExpired: false,
  };

  const expectNoPaidCalls = () => {
    expect(sanctionsService.isListed).not.toHaveBeenCalled();
    expect(documentService.isAuthentic).not.toHaveBeenCalled();
    expect(pepService.isExposed).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    sanctionsService.isListed.mockResolvedValue(false);
    documentService.isAuthentic.mockResolvedValue(true);
    pepService.isExposed.mockResolvedValue(false);
  });

  it("verifies a clean applicant after every check", async () => {
    expect(await onboard(applicant)).toEqual({ outcome: "verified" });
    expect(sanctionsService.isListed).toHaveBeenCalledWith(applicant.id);
    expect(documentService.isAuthentic).toHaveBeenCalledWith(
      applicant.id,
      "passport",
    );
    expect(pepService.isExposed).toHaveBeenCalledWith(applicant.fullName);
    expect(onErrorCaught).not.toHaveBeenCalled();
  });

  describe("local rules through mapOutcome (default passed)", () => {
    it("maps a passing pipe to the last declared outcome", async () => {
      expect(await basicChecks(applicant)).toEqual({ outcome: "verified" });
    });

    it.each<[string, Partial<Applicant>]>([
      ["a minor", { age: 16 }],
      ["an unsupported country", { country: "XX" }],
      ["an expired document", { documentExpired: true }],
    ])("rejects %s and stops before any paid call", async (_, change) => {
      expect(await onboard({ ...applicant, ...change })).toEqual({
        outcome: "rejected",
      });
      expectNoPaidCalls();
      expect(onErrorCaught).not.toHaveBeenCalled();
    });
  });

  describe("sequential combine", () => {
    it("stops at a sanctions rejection: document and PEP checks not called", async () => {
      sanctionsService.isListed.mockResolvedValue(true);
      expect(await onboard(applicant)).toEqual({ outcome: "rejected" });
      expect(documentService.isAuthentic).not.toHaveBeenCalled();
      expect(pepService.isExposed).not.toHaveBeenCalled();
    });

    it("keeps going after manual_review, so a later rejection still wins", async () => {
      documentService.isAuthentic.mockResolvedValue(false);
      expect(
        await onboard({ ...applicant, documentType: "drivers_license" }),
      ).toEqual({ outcome: "rejected" });

      vi.clearAllMocks();
      pepService.isExposed.mockResolvedValue(true);
      documentService.isAuthentic.mockResolvedValue(true);
      expect(await onboard(applicant)).toEqual({ outcome: "manual_review" });
      expect(pepService.isExposed).toHaveBeenCalledOnce();
    });
  });

  describe("document check (match + explicit passed)", () => {
    it("sends an authentic driver's licence to manual review", async () => {
      expect(
        await onboard({ ...applicant, documentType: "drivers_license" }),
      ).toEqual({ outcome: "manual_review" });
      // manual_review is not final: the PEP screening still runs
      expect(pepService.isExposed).toHaveBeenCalledOnce();
    });

    it("verifies an authentic passport or ID card (default passed)", async () => {
      expect(await documentCheck(applicant)).toEqual({ outcome: "verified" });
      expect(
        await documentCheck({ ...applicant, documentType: "id_card" }),
      ).toEqual({ outcome: "verified" });
    });

    it("rejects a document that fails the authenticity check", async () => {
      documentService.isAuthentic.mockResolvedValue(false);
      expect(await onboard(applicant)).toEqual({ outcome: "rejected" });
      expect(pepService.isExposed).not.toHaveBeenCalled();
    });
  });

  describe("outage vs. failure", () => {
    it("rejects when the sanctions rule returns fail(...)", async () => {
      sanctionsService.isListed.mockResolvedValue(true);
      expect(await sanctions(applicant)).toEqual({ outcome: "rejected" });
      expect(onErrorCaught).not.toHaveBeenCalled();
    });

    it("sends to manual review when the sanctions rule throws, and reports it once", async () => {
      const outage = new Error("sanctions service unavailable");
      sanctionsService.isListed.mockRejectedValue(outage);

      expect(await onboard(applicant)).toEqual({ outcome: "manual_review" });
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught).toHaveBeenCalledWith(outage);
      // onError is not final: the later checks still run
      expect(documentService.isAuthentic).toHaveBeenCalledOnce();
      expect(pepService.isExposed).toHaveBeenCalledOnce();
    });

    it("lets a later rejection win over an outage", async () => {
      sanctionsService.isListed.mockRejectedValue(new Error("down"));
      documentService.isAuthentic.mockResolvedValue(false);
      expect(await onboard(applicant)).toEqual({ outcome: "rejected" });
    });

    it("shows why outage-prone calls stay out of the pipe: a default pipeRules turns a throw into failed", async () => {
      sanctionsService.isListed.mockRejectedValue(new Error("down"));
      const piped = kyc.mapOutcome(pipeRules([isAdult, isNotSanctioned]), {
        failed: "rejected",
      });
      expect(await piped(applicant)).toEqual({ outcome: "rejected" });
      expect(onErrorCaught).not.toHaveBeenCalled();
    });
  });
});

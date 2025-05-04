import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withFallback,
  withRetry,
  withTimeout,
  allRules,
  unless,
  memoizeRule,
  mapError,
  when,
  oneOf,
  not,
  withDebug,
  match,
} from "../lib/combinators";
import { composeRules } from "../lib/composition";
import { pass, fail } from "../lib/helpers";
import { getRuleError } from "./helpers/get-rule-error";
import { pick } from "../lib/combinators/utility/pick";

describe("Full Integration Test", () => {
  type User = {
    email?: string;
    username?: string;
    age?: number;
    payment: {
      method?: string;
      paymentId?: string;
    };
    profile?: {
      bio?: string;
      avatar?: string;
    };
    id: string;
  };

  // Mock services
  const mockDb = {
    checkEmail: vi.fn(),
    checkUsername: vi.fn(),
    getProfile: vi.fn(),
  };

  const mockPaymentService = {
    validateCard: vi.fn(),
    validatePaypal: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.checkEmail.mockResolvedValue(false);
    mockDb.checkUsername.mockResolvedValue(true);
    mockDb.getProfile.mockResolvedValue({ verified: true });
    mockPaymentService.validateCard.mockResolvedValue(true);
    mockPaymentService.validatePaypal.mockResolvedValue(true);
  });

  // 1. Define individual rules
  const validateEmailFormat = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? pass()
      : fail("Invalid email format");

  const checkEmailUnique = async (email: string) =>
    (await mockDb.checkEmail(email)) ? fail("Email already in use") : pass();

  const validateUserEmail = pick<User, string>(
    (user) => user.email,
    composeRules([validateEmailFormat, checkEmailUnique]),
  );

  const validateUsername = composeRules([
    (username: string) => (username.length >= 3 ? pass() : fail("Too short")),
    async (username: string) =>
      (await mockDb.checkUsername(username)) ? pass() : fail("Username taken"),
  ]);

  const validateUserUsername = pick<User, string>(
    (user) => user.username,
    validateUsername,
  );

  const validateAge = (age: number) =>
    age >= 18 ? pass() : fail("Must be 18+");

  const validateUserAge = pick<User, number>((user) => user.age, validateAge);

  // 2. Payment validation with fallback
  const validateCreditCard = withFallback(
    withRetry(
      async (card: User["payment"]) => {
        const valid = await mockPaymentService.validateCard(card.paymentId);
        return valid ? pass() : fail("Card declined");
      },
      { attempts: 2 },
    ),
    () => fail("Payment system unavailable"),
  );

  const validatePaypal = withTimeout(
    async (paypalAccount: User["payment"]) => {
      const valid = await mockPaymentService.validatePaypal(paypalAccount.paymentId);
      return valid ? pass() : fail("Paypal error");
    },
    3000,
    "Paypal timeout",
  );

  // 3. Profile validation (parallel)
  const validateProfile = mapError(
    allRules([
      (profile: User["profile"]) =>
        !profile?.bio || profile.bio.length <= 500
          ? pass()
          : fail("Bio too long"),
      unless(
        (profile) => !profile?.avatar,
        () => fail("Avatar required"),
      ),
    ]),
    (errors) => errors.join(", "),
  );

  const validateUserProfile = pick<User, User["profile"]>(
    (user) => user.profile,
    validateProfile,
  );

  composeRules<User>([
    memoizeRule(
      pick((user) => user.email, validateEmailFormat),
      (user) => user.id,
    ),
    pick((user) => user.email, checkEmailUnique),
    pick((user) => user.username, validateUsername),
    mapError(
      pick((user) => user.age, validateAge),
      (err) => `Age: ${err}`,
    ),
  ]);

  // 4. Main pipeline
  const validateUserRegistration = composeRules<User>([
    // Account basics
    memoizeRule(validateUserEmail, (user) => user.id + user.email),
    validateUserUsername,
    mapError(validateUserAge, (err) => `Age: ${err}`),
    // Payment method branch
    match(
      (user: User) => user.payment.method || "",
      {
        credit: pick(user => user.payment, validateCreditCard),
        paypal: pick(user => user.payment, validatePaypal),
      },
      "Invalid payment method",
    ),

    // Conditional profile check
    when(
      (user) => user.profile !== undefined,
      mapError(
        oneOf(
          validateUserProfile,
          not(() => fail("Profile blocked"), "Profile must be valid"),
        ),
        (errors) => errors.join(", "),
      ),
    ),

    // Final verification
    withDebug(
      async (user, ctx) => {
        const profile = await mockDb.getProfile(user.id);
        return profile?.verified ? pass() : fail("Unverified");
      },
      { name: "FinalVerification" },
    ),
  ]);

  it("should successfully validate complete registration", async () => {
    const user = {
      email: "test@example.com",
      username: "testuser",
      age: 25,
      payment: { method: "credit", paymentId: "4111111111111111" },
      profile: { bio: "Hello", avatar: "image.jpg" },
      id: "123",
    };

    const result = await validateUserRegistration(user);

    expect(result).toEqual(pass());
    expect(mockDb.checkEmail).toHaveBeenCalledWith("test@example.com");
    expect(mockPaymentService.validateCard).toHaveBeenCalledWith(
      "4111111111111111",
    );
  });

  it("should collect multiple errors from parallel rules", async () => {
    const user = {
      email: "test@example.com",
      username: "testuser",
      age: 25,
      payment: { method: "credit", number: "4111111111111111" },
      profile: { bio: "a".repeat(600) }, // Invalid bio
      id: "123",
    };

    mockDb.getProfile.mockResolvedValue({ verified: false });

    const result = await validateUserRegistration(user);

    if (result.status === "failed") {
      const error = getRuleError(result);
      console.log(error)
      expect(error).toMatch("Unverified");
    } else {
      expect.fail("Expected validation to fail");
    }
  });

  it("should handle payment fallback", async () => {
    const user = {
      email: "test@example.com",
      username: "testuser",
      age: 25,
      payment: { method: "credit", number: "4111111111111111" },
      id: "123",
    };

    mockPaymentService.validateCard.mockRejectedValue(new Error("API down"));

    const result = await validateUserRegistration(user);

    if (result.status === "failed") {
      expect(getRuleError(result)).toBe("Payment system unavailable");
    } else {
      expect.fail("Expected fallback to trigger");
    }
  });

  it("should timeout slow payments", async () => {
    const user = {
      email: "test@example.com",
      username: "testuser",
      age: 25,
      payment: { method: "paypal", email: "test@paypal.com" },
      id: "123",
    };

    mockPaymentService.validatePaypal.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 4000)),
    );

    const result = await validateUserRegistration(user);

    if (result.status === "failed") {
      expect(getRuleError(result)).toBe("Paypal timeout");
    } else {
      expect.fail("Expected timeout to trigger");
    }
  });

  it("should memoize expensive validations", async () => {
    const user = {
      email: "memo@test.com",
      username: "memo_user",
      age: 30,
      payment: { method: "credit", number: "5555555555554444" },
      id: "456",
    };

    // First call
    await validateUserRegistration(user);
    // Second call with same email
    await validateUserRegistration(user);

    expect(mockDb.checkEmail).toHaveBeenCalledTimes(1);
  });
});

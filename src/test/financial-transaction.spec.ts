import { vi, describe, beforeEach, it, expect } from "vitest";
import type { Rule } from "../lib";
import {
  pipeRules,
  match,
  withRetry,
  withMemoize,
  withTimeout,
  when,
  pass,
  fail,
} from "../lib";

// Mock services
const fraudService = {
  assess: vi.fn(),
};

const bankService = {
  authCheck: vi.fn(),
};

// Types
interface Transaction {
  amount: number;
  currency: string;
  userId: string;
  recipient: string;
  paymentType: string;
  accountType: string;
  cardNumber?: string;
  expiry?: string;
  walletAddress?: string;
  iban?: string;
}

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"];

// 1. Basic validators
const validateAmount: Rule<Transaction> = (tx: Transaction) =>
  tx.amount > 0 ? pass() : fail("Amount must be positive");

const validateCurrency: Rule<Transaction> = (tx: Transaction) =>
  SUPPORTED_CURRENCIES.includes(tx.currency)
    ? pass()
    : fail(`Unsupported currency: ${tx.currency}`);

// 2. Payment method specific validators
const validateCardNumber: Rule<Transaction> = (tx: Transaction) => {
  if (!tx.cardNumber) return fail("Card number required");
  // Simple Luhn check for example purposes
  const digits = tx.cardNumber.replace(/\D/g, "").split("").map(Number);
  if (digits.length < 13) return fail("Invalid card number");

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = digits[digits.length - 1 - i];
    if (i % 2 === 1) digit *= 2;
    if (digit > 9) digit -= 9;
    sum += digit;
  }

  return sum % 10 === 0 ? pass() : fail("Invalid card number");
};

const validateExpiry: Rule<Transaction> = (tx: Transaction) => {
  if (!tx.expiry) return fail("Expiry required");
  const [month, year] = tx.expiry.split("/").map(Number);
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return fail("Card expired");
  }
  return pass();
};

const bankAuthCheck: Rule<Transaction> = async (tx: Transaction) => {
  try {
    const isValid = await bankService.authCheck(tx.cardNumber!);
    return isValid ? pass() : fail("Bank authorization failed");
  } catch (error) {
    return fail("Bank service error");
  }
};

const validateWalletAddress: Rule<Transaction> = (tx: Transaction) => {
  if (!tx.walletAddress) return fail("Wallet address required");
  return /^0x[a-fA-F0-9]{40}$/.test(tx.walletAddress)
    ? pass()
    : fail("Invalid wallet address");
};

const validateIBAN: Rule<Transaction> = (tx: Transaction) => {
  if (!tx.iban) return fail("IBAN required");
  // Simple IBAN format check
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(tx.iban)
    ? pass()
    : fail("Invalid IBAN");
};

// 3. Account type specific validators
const validateBusinessTransfer: Rule<Transaction> = (tx: Transaction) => {
  return tx.amount <= 100000
    ? pass()
    : fail("Business transfers limited to $100,000");
};

const validatePersonalTransfer: Rule<Transaction> = (tx: Transaction) => {
  return tx.amount <= 10000
    ? pass()
    : fail("Personal transfers limited to $10,000");
};

// 4. Memoized fraud check (cached for 5 minutes)
const checkFraudRisk: Rule<Transaction> = withMemoize(
  async (tx: Transaction) => {
    const risk = await fraudService.assess(tx);
    return risk.score < 5 ? pass() : fail("High fraud risk");
  },
  (tx) => `${tx.userId}-${tx.amount}-${tx.recipient}`,
  { ttl: 300000 },
);

// 5. Payment method handling
const validatePaymentMethod: Rule<Transaction> = match(
  (tx: Transaction) => tx.paymentType,
  {
    credit_card: pipeRules([
      validateCardNumber,
      validateExpiry,
      withTimeout(bankAuthCheck, 500, "Bank auth timeout"),
    ]),
    crypto: validateWalletAddress,
    bank_transfer: validateIBAN,
  },
);

// 6. Complete pipeline
const validateTransaction: Rule<Transaction> = pipeRules([
  validateAmount,
  validateCurrency,

  // Only run fraud check for transactions > $1000
  when(
    (tx: Transaction) => tx.amount > 1000,
    withRetry(checkFraudRisk, { attempts: 2 }),
  ),

  validatePaymentMethod,

  // Compliance check (different for business/personal)
  match((tx: Transaction) => tx.accountType, {
    business: validateBusinessTransfer,
    personal: validatePersonalTransfer,
  }),
]);

// Test cases
describe("Transaction Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fraudService.assess.mockResolvedValue({ score: 2 }); // Low risk by default
    bankService.authCheck.mockResolvedValue(true); // Success by default
  });

  it("should validate a successful credit card transaction", async () => {
    const transaction = {
      amount: 500,
      currency: "USD",
      userId: "user123",
      recipient: "recipient456",
      paymentType: "credit_card",
      accountType: "personal",
      cardNumber: "4111111111111111", // Valid test Visa number
      expiry: "12/25",
    };

    const result = await validateTransaction(transaction);
    expect(result).toEqual(pass());
  });

  it("should validate a successful crypto transaction", async () => {
    const transaction = {
      amount: 2000,
      currency: "USD",
      userId: "user123",
      recipient: "recipient456",
      paymentType: "crypto",
      accountType: "business",
      walletAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    };

    const result = await validateTransaction(transaction);
    expect(result).toEqual(pass());
    expect(fraudService.assess).toHaveBeenCalled(); // Should check fraud for >$1000
  });

  it("should fail for invalid currency", async () => {
    const transaction = {
      amount: 500,
      currency: "XYZ", // Invalid
      userId: "user123",
      recipient: "recipient456",
      paymentType: "credit_card",
      accountType: "personal",
      cardNumber: "4111111111111111",
      expiry: "12/25",
    };

    const result = await validateTransaction(transaction);
    expect(result).toEqual(fail("Unsupported currency: XYZ"));
  });

  it("should timeout slow bank auth", async () => {
    const transaction = {
      amount: 500,
      currency: "USD",
      userId: "user123",
      recipient: "recipient456",
      paymentType: "credit_card",
      accountType: "personal",
      cardNumber: "4111111111111111",
      expiry: "12/25",
    };

    // Mock a slow response
    bankService.authCheck.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 600)),
    );

    const result = await validateTransaction(transaction);
    expect(result).toEqual(fail("Bank auth timeout"));
  });

  it("should enforce business transfer limits", async () => {
    const transaction = {
      amount: 200000, // Over limit
      currency: "USD",
      userId: "user123",
      recipient: "recipient456",
      paymentType: "crypto",
      accountType: "business",
      walletAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    };

    const result = await validateTransaction(transaction);
    expect(result).toEqual(fail("Business transfers limited to $100,000"));
  });
});

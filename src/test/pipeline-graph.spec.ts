import { describe, expect, it } from "vitest";
import {
  every,
  fail,
  inject,
  mapError,
  match,
  named,
  pass,
  pipeRules,
  type Rule,
  tap,
  toGraph,
  when,
  withLazyContext,
  withMemoize,
  withRetry,
  withTimeout,
} from "../lib";
import { toMermaid } from "../lib/mermaid";

/**
 * The three pipelines from `examples/` rebuilt here (the example files export
 * nothing). Rule bodies are stubs: only the structure and the names matter.
 */

type Tx = { amount: number; paymentType: string; accountType: string };
type User = { username: string; role: string };
type Deployment = { modelId: string };
type Context = { latest: string };

const userRegistration = () => {
  const validateUsernameFormat = () => pass();
  const checkUsernameAvailability = () => pass();
  const validatePasswordStrength = () => pass();
  const validateEmailFormat = () => pass();
  const checkEmailUnique = () => pass();
  const validateAdminPrivileges = () => pass();
  const validateStandardUser = () => pass();

  return pipeRules<User, string>([
    validateUsernameFormat,
    withMemoize(checkUsernameAvailability, (user) => user.username, {
      ttl: 60000,
    }),
    mapError(
      every([validatePasswordStrength, validateEmailFormat, checkEmailUnique]),
      (errors) => errors.join(", "),
    ),
    match<User, string>(
      named("role", (user: User) => user.role),
      { admin: validateAdminPrivileges, user: validateStandardUser },
      "Unknown role",
    ),
  ]);
};

const financialTransaction = () => {
  const validateAmount = () => pass();
  const validateCurrency = () => pass();
  const validateCardNumber = () => pass();
  const validateExpiry = () => pass();
  const bankAuthCheck = () => pass();
  const validateWalletAddress = () => pass();
  const validateIBAN = () => pass();
  const validateBusinessTransfer = () => pass();
  const validatePersonalTransfer = () => pass();
  const checkFraudRisk: Rule<Tx> = withMemoize(
    named("checkFraudRisk", async () => pass()),
    (tx) => `${tx.amount}`,
    { ttl: 300000 },
  );

  const validatePaymentMethod: Rule<Tx> = match(
    named("paymentType", (tx: Tx) => tx.paymentType),
    {
      credit_card: pipeRules([
        validateCardNumber,
        validateExpiry,
        withTimeout(bankAuthCheck, 3000, "Bank auth timeout"),
      ]),
      crypto: validateWalletAddress,
      bank_transfer: validateIBAN,
    },
  );

  return pipeRules<Tx, string>([
    validateAmount,
    validateCurrency,
    when(
      named("amount > 1000", (tx: Tx) => tx.amount > 1000),
      withRetry(checkFraudRisk, { attempts: 2 }),
    ),
    validatePaymentMethod,
    match(
      named("accountType", (tx: Tx) => tx.accountType),
      {
        business: validateBusinessTransfer,
        personal: validatePersonalTransfer,
      },
    ),
  ]);
};

const modelDeployment = () => {
  const validateVersionUpToDate: Rule<Deployment, string, Context> = () =>
    pass();
  const checkDeprecation: Rule<Deployment, string, Context> = () => pass();
  const checkRisk = (): Rule<Deployment> =>
    withMemoize(
      named("checkRisk", async () => fail("Model risk too high")),
      (d) => d.modelId,
      { ttl: 60_000 },
    );

  return inject({}, () =>
    pipeRules<Deployment, string>([
      tap(named("log: started", () => undefined)),
      withLazyContext<Deployment, string, Context>(
        async () => ({ latest: "1.2.0" }),
        pipeRules<Deployment, string, Context>([
          validateVersionUpToDate,
          checkDeprecation,
        ]),
      ),
      checkRisk(),
      tap(named("log: passed", () => undefined)),
    ]),
  );
};

const examples = {
  "user registration": userRegistration,
  "financial transaction": financialTransaction,
  "model deployment": modelDeployment,
} as const;

describe("example pipelines as diagrams", () => {
  for (const [name, build] of Object.entries(examples)) {
    describe(name, () => {
      it("renders the same text on every run", () => {
        expect(toMermaid(build() as Rule<never>)).toBe(
          toMermaid(build() as Rule<never>),
        );
      });

      it("survives a JSON round-trip of its graph", () => {
        const graph = toGraph(build() as Rule<never>);

        expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
      });
    });
  }

  it("user registration", () => {
    expect(toMermaid(userRegistration())).toMatchInlineSnapshot(`
      "flowchart TD
        input([input])
        root_steps_0["validateUsernameFormat"]
        root_steps_1_rule["checkUsernameAvailability #9889; cached"]
        subgraph root_steps_2_rule_sg["all must pass"]
        root_steps_2_rule_in(("fork"))
        root_steps_2_rule_rules_0["validatePasswordStrength"]
        root_steps_2_rule_rules_1["validateEmailFormat"]
        root_steps_2_rule_rules_2["checkEmailUnique"]
        root_steps_2_rule_out(("join"))
        end
        root_steps_3{"role"}
        root_steps_3_cases_0["validateAdminPrivileges"]
        root_steps_3_cases_1["validateStandardUser"]
        passed([passed])
        input --> root_steps_0
        root_steps_2_rule_in --> root_steps_2_rule_rules_0
        root_steps_2_rule_rules_0 --> root_steps_2_rule_out
        root_steps_2_rule_in --> root_steps_2_rule_rules_1
        root_steps_2_rule_rules_1 --> root_steps_2_rule_out
        root_steps_2_rule_in --> root_steps_2_rule_rules_2
        root_steps_2_rule_rules_2 --> root_steps_2_rule_out
        root_steps_3 -->|"admin"| root_steps_3_cases_0
        root_steps_3 -->|"user"| root_steps_3_cases_1
        root_steps_0 --> root_steps_1_rule
        root_steps_1_rule --> root_steps_2_rule_in
        root_steps_2_rule_out --> root_steps_3
        root_steps_3_cases_0 --> passed
        root_steps_3_cases_1 --> passed"
    `);
  });

  it("financial transaction", () => {
    expect(toMermaid(financialTransaction())).toMatchInlineSnapshot(`
      "flowchart TD
        input([input])
        root_steps_0["validateAmount"]
        root_steps_1["validateCurrency"]
        root_steps_2{"amount #62; 1000"}
        root_steps_2_ifTrue_rule_rule["checkFraudRisk #8635; 2x #9889; cached"]
        root_steps_3{"paymentType"}
        root_steps_3_cases_0_steps_0["validateCardNumber"]
        root_steps_3_cases_0_steps_1["validateExpiry"]
        root_steps_3_cases_0_steps_2_rule["bankAuthCheck #9201; 3000ms"]
        root_steps_3_cases_1["validateWalletAddress"]
        root_steps_3_cases_2["validateIBAN"]
        root_steps_4{"accountType"}
        root_steps_4_cases_0["validateBusinessTransfer"]
        root_steps_4_cases_1["validatePersonalTransfer"]
        passed([passed])
        input --> root_steps_0
        root_steps_2 -->|"yes"| root_steps_2_ifTrue_rule_rule
        root_steps_3 -->|"credit_card"| root_steps_3_cases_0_steps_0
        root_steps_3_cases_0_steps_0 --> root_steps_3_cases_0_steps_1
        root_steps_3_cases_0_steps_1 --> root_steps_3_cases_0_steps_2_rule
        root_steps_3 -->|"crypto"| root_steps_3_cases_1
        root_steps_3 -->|"bank_transfer"| root_steps_3_cases_2
        root_steps_4 -->|"business"| root_steps_4_cases_0
        root_steps_4 -->|"personal"| root_steps_4_cases_1
        root_steps_0 --> root_steps_1
        root_steps_1 --> root_steps_2
        root_steps_2_ifTrue_rule_rule --> root_steps_3
        root_steps_2 -->|"no"| root_steps_3
        root_steps_3_cases_0_steps_2_rule --> root_steps_4
        root_steps_3_cases_1 --> root_steps_4
        root_steps_3_cases_2 --> root_steps_4
        root_steps_4_cases_0 --> passed
        root_steps_4_cases_1 --> passed"
    `);
  });

  it("model deployment", () => {
    expect(toMermaid(modelDeployment())).toMatchInlineSnapshot(`
      "flowchart TD
        input([input])
        root_steps_0("log: started")
        root_steps_1["rule #35;1"]
        root_steps_2_rule["checkRisk #9889; cached"]
        root_steps_3("log: passed")
        passed([passed])
        input --> root_steps_0
        root_steps_0 --> root_steps_1
        root_steps_1 --> root_steps_2_rule
        root_steps_2_rule --> root_steps_3
        root_steps_3 --> passed"
    `);
  });

  it("renders the failEdges: true variant for the busiest pipeline", () => {
    expect(
      toMermaid(financialTransaction(), { failEdges: true }),
    ).toMatchInlineSnapshot(`
      "flowchart TD
        input([input])
        root_steps_0["validateAmount"]
        root_steps_1["validateCurrency"]
        root_steps_2{"amount #62; 1000"}
        root_steps_2_ifTrue_rule_rule["checkFraudRisk #8635; 2x #9889; cached"]
        root_steps_3{"paymentType"}
        root_steps_3_cases_0_steps_0["validateCardNumber"]
        root_steps_3_cases_0_steps_1["validateExpiry"]
        root_steps_3_cases_0_steps_2_rule["bankAuthCheck #9201; 3000ms"]
        root_steps_3_cases_1["validateWalletAddress"]
        root_steps_3_cases_2["validateIBAN"]
        root_steps_4{"accountType"}
        root_steps_4_cases_0["validateBusinessTransfer"]
        root_steps_4_cases_1["validatePersonalTransfer"]
        passed([passed])
        failed([failed])
        input --> root_steps_0
        root_steps_2 -->|"yes"| root_steps_2_ifTrue_rule_rule
        root_steps_3 -->|"credit_card"| root_steps_3_cases_0_steps_0
        root_steps_3_cases_0_steps_0 --> root_steps_3_cases_0_steps_1
        root_steps_3_cases_0_steps_1 --> root_steps_3_cases_0_steps_2_rule
        root_steps_3 -->|"crypto"| root_steps_3_cases_1
        root_steps_3 -->|"bank_transfer"| root_steps_3_cases_2
        root_steps_4 -->|"business"| root_steps_4_cases_0
        root_steps_4 -->|"personal"| root_steps_4_cases_1
        root_steps_0 --> root_steps_1
        root_steps_1 --> root_steps_2
        root_steps_2_ifTrue_rule_rule --> root_steps_3
        root_steps_2 -->|"no"| root_steps_3
        root_steps_3_cases_0_steps_2_rule --> root_steps_4
        root_steps_3_cases_1 --> root_steps_4
        root_steps_3_cases_2 --> root_steps_4
        root_steps_4_cases_0 --> passed
        root_steps_4_cases_1 --> passed
        root_steps_0 -.->|"fail"| failed
        root_steps_1 -.->|"fail"| failed
        root_steps_2_ifTrue_rule_rule -.->|"fail"| failed
        root_steps_3_cases_0_steps_0 -.->|"fail"| failed
        root_steps_3_cases_0_steps_1 -.->|"fail"| failed
        root_steps_3_cases_0_steps_2_rule -.->|"fail"| failed
        root_steps_3_cases_1 -.->|"fail"| failed
        root_steps_3_cases_2 -.->|"fail"| failed
        root_steps_3 -.->|"no match"| failed
        root_steps_4_cases_0 -.->|"fail"| failed
        root_steps_4_cases_1 -.->|"fail"| failed
        root_steps_4 -.->|"no match"| failed"
    `);
  });
});

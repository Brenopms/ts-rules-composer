import {
  inject,
  withLazyContext,
  withMemoize,
  withTap,
  pass,
  fail,
  pipeRules,
  Rule,
  tap
} from "../src/lib";

// 1. Define types
type Deployment = {
  modelId: string;
  version: string;
  userId: string;
};

type ModelMetadata = {
  modelId: string;
  latestVersion: string;
  isDeprecated: boolean;
  riskScore: number;
};

type Context = {
  modelMeta: ModelMetadata;
};

type Injected = {
  logger: {
    log: (msg: string, payload: any) => void;
  };
  riskService: {
    assess: (modelId: string) => Promise<number>;
  };
  modelRegistry: {
    getMetadata: (modelId: string) => Promise<ModelMetadata>;
  };
};

// 2. Basic rules
const validateVersionUpToDate: Rule<Deployment, string, Context> = (d, ctx) => {
  return d.version === ctx?.modelMeta.latestVersion
    ? pass()
    : fail("Version is not up to date");
};

const checkDeprecation: Rule<Deployment, string, Context> = (_, ctx) => {
  return ctx?.modelMeta.isDeprecated ? fail("Model is deprecated") : pass();
};

const checkRisk = (services: Injected["riskService"]): Rule<Deployment> =>
  withMemoize(
    async (d) => {
      const score = await services.assess(d.modelId);
      return score < 7 ? pass() : fail("Model risk too high");
    },
    (d) => d.modelId,
    { ttl: 60_000 },
  );

// 3. Factory function with injection
const createDeploymentValidator = (deps: Injected) =>
  pipeRules([
    tap((input) => deps.logger.log("Deployment started", { input })),

    withLazyContext<Deployment, string, Context>(
      async (deployment) => {
        const meta = await deps.modelRegistry.getMetadata(deployment.modelId);
        return { modelMeta: meta };
      },

      pipeRules<Deployment, string, Context>([
        validateVersionUpToDate,
        checkDeprecation,
      ]),
    ),

    checkRisk(deps.riskService),

    tap((_, __) => deps.logger.log("Deployment passed", {})),
  ]);

// 4. Setup
const mockLogger = {
  log: (msg: string, payload: any) =>
    console.log(`[LOG] ${msg}:`, JSON.stringify(payload, null, 2)),
};

const mockRegistry = {
  getMetadata: async (id: string): Promise<ModelMetadata> => ({
    modelId: id,
    latestVersion: "1.2.0",
    isDeprecated: false,
    riskScore: 4,
  }),
};

const mockRiskService = {
  assess: async (modelId: string) => {
    console.log(`Assessing risk for ${modelId}...`);
    return 5;
  },
};

// 5. Compose final rule
const validateDeployment = inject(
  {
    logger: mockLogger,
    modelRegistry: mockRegistry,
    riskService: mockRiskService,
  },
  createDeploymentValidator,
);

// 6. Run it
(async () => {
  const deployment: Deployment = {
    modelId: "gpt-9000",
    version: "1.2.0",
    userId: "u456",
  };

  const result = await validateDeployment(deployment);
  console.log("Result:", result);

  const outdatedDeploymenty: Deployment = {
    modelId: "gpt-9000",
    version: "1.1.0",
    userId: "u456",
  };

  const outdatedResult = await validateDeployment(outdatedDeploymenty);
  console.log("Result 2 (outdated):", outdatedResult);
})();

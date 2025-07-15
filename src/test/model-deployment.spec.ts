import { describe, it, expect, vi, beforeEach } from "vitest";
import { inject, pass, fail } from "../lib";
import {
  type Rule,
  withMemoize,
  pipeRules,
  tap,
  withLazyContext,
} from "../lib";

const mockLogger = {
  log: vi.fn(),
};

const baseMeta = {
  modelId: "model-x",
  latestVersion: "1.2.0",
  isDeprecated: false,
  riskScore: 3,
};

const mockRegistry = {
  getMetadata: vi.fn(async () => ({ ...baseMeta })),
};

const mockRiskService = {
  assess: vi.fn(async () => 5),
};
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
    log: (msg: string, payload: unknown) => void;
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

describe("model-deployment-validator", () => {
  let validateDeployment: Rule<Deployment, string>;
  const validDeployment: Deployment = {
    modelId: "model-x",
    version: "1.2.0",
    userId: "u1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass for a valid deployment", async () => {
    validateDeployment = inject(
      {
        logger: mockLogger,
        modelRegistry: mockRegistry,
        riskService: mockRiskService,
      },
      createDeploymentValidator,
    );
    const result = await validateDeployment(validDeployment);
    expect(result).toEqual(pass());
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Deployment started",
      expect.objectContaining({ input: validDeployment }),
    );
    expect(mockLogger.log).toHaveBeenCalledWith("Deployment passed", {});
  });

  it("should fail if version is outdated", async () => {
    validateDeployment = inject(
      {
        logger: mockLogger,
        modelRegistry: mockRegistry,
        riskService: mockRiskService,
      },
      createDeploymentValidator,
    );
    const result = await validateDeployment({
      ...validDeployment,
      version: "1.0.0",
    });
    expect(result).toEqual(fail("Version is not up to date"));
  });

  it("should fail if model is deprecated", async () => {
    mockRegistry.getMetadata.mockResolvedValueOnce({
      ...baseMeta,
      isDeprecated: true,
    });

    validateDeployment = inject(
      {
        logger: mockLogger,
        modelRegistry: mockRegistry,
        riskService: mockRiskService,
      },
      createDeploymentValidator,
    );
    const result = await validateDeployment(validDeployment);
    expect(result).toEqual(fail("Model is deprecated"));
  });

  it("should fail if risk score is too high", async () => {
    mockRiskService.assess.mockResolvedValueOnce(9);
    validateDeployment = inject(
      {
        logger: mockLogger,
        modelRegistry: mockRegistry,
        riskService: mockRiskService,
      },
      createDeploymentValidator,
    );
    const result = await validateDeployment(validDeployment);
    expect(result).toEqual(fail("Model risk too high"));
  });

  it("should memoize risk check", async () => {
    validateDeployment = inject(
      {
        logger: mockLogger,
        modelRegistry: mockRegistry,
        riskService: mockRiskService,
      },
      createDeploymentValidator,
    );
    const result1 = await validateDeployment(validDeployment);
    const result2 = await validateDeployment(validDeployment);

    expect(result1).toEqual(pass());
    expect(result2).toEqual(pass());
    expect(mockRiskService.assess).toHaveBeenCalledTimes(1); // memoized
  });

  it("should reuse lazy context for multiple rules", async () => {
    validateDeployment = inject(
      {
        logger: mockLogger,
        modelRegistry: mockRegistry,
        riskService: mockRiskService,
      },
      createDeploymentValidator,
    );
    await validateDeployment(validDeployment);
    expect(mockRegistry.getMetadata).toHaveBeenCalledTimes(1);
  });
});

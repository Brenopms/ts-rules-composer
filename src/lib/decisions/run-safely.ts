/**
 * The failure contract for the async callbacks a decision combinator calls
 * (predicates, accessors, child decisions, a mapped rule). Internal.
 */
import { display, expectBoolean, isObject, typeName } from "./guards";

/** Called with every failure that was turned into an onError outcome. */
export type ErrorHook = (error: unknown) => void;

/**
 * Turns the awaited value into the expected type, or throws a `TypeError`
 * describing why it is malformed.
 */
export type Check<T> = (value: unknown) => T;

export type SafeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false };

/**
 * Marks a value that may be a rejected promise as handled, so an ignored
 * rejection never surfaces as an unhandled one.
 */
export const ignoreRejection = (value: unknown): void => {
  Promise.resolve(value).catch(() => {});
};

/** Calls the hook; its throws and rejections are swallowed. */
export const notify = (hook: ErrorHook | undefined, error: unknown): void => {
  if (hook === undefined) {
    return;
  }
  try {
    ignoreRejection(hook(error));
  } catch {
    // The hook never changes the outcome.
  }
};

/**
 * Calls `call` and checks its awaited value. Never throws or rejects: a
 * throw, a rejection or a malformed value notifies `hook` once (synchronously,
 * before returning) and returns `{ ok: false }`, so the caller uses its
 * local `onError`.
 */
export const runSafely = async <T>(
  call: () => unknown,
  check: Check<T>,
  hook: ErrorHook | undefined,
): Promise<SafeResult<T>> => {
  try {
    return { ok: true, value: check(await call()) };
  } catch (error) {
    notify(hook, error);
    return { ok: false };
  }
};

/** Check for predicates: a boolean, no truthiness coercion. */
export const toBoolean: Check<boolean> = expectBoolean("predicate", {
  describe: (value) => typeof value,
});

/** Check for accessors: a property key, no conversion. */
export const toKey: Check<PropertyKey> = (value) => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "symbol"
  ) {
    throw new TypeError(
      `accessor must return a string, number or symbol, got ${typeName(value)}`,
    );
  }
  return value;
};

/**
 * Re-throws the cause of a caught failure: an own `outcome` of `"failed"`
 * (already read and validated by the caller) with an own `caughtCause`,
 * whatever its value. Called inside a check, so `runSafely` notifies the hook
 * once with the cause and the caller uses its local `onError`. Reads the
 * field by name: decisions import no rule-side helper.
 */
export const throwIfCaught = (value: object, outcome: unknown): void => {
  if (outcome === "failed" && Object.hasOwn(value, "caughtCause")) {
    throw (value as { caughtCause: unknown }).caughtCause;
  }
};

/**
 * Check for a rule mapped by `mapOutcome`: an own `outcome` key holding
 * `"passed"` or `"failed"`, checked before mapping. A destination label
 * (e.g. `"approved"`) is malformed here. A caught failure throws its cause.
 */
export const toRuleOutcome: Check<"passed" | "failed"> = (value) => {
  if (!isObject(value) || !Object.hasOwn(value, "outcome")) {
    throw new TypeError("rule must return an object with an own outcome");
  }
  const { outcome } = value as { outcome: unknown };
  if (outcome !== "passed" && outcome !== "failed") {
    throw new TypeError(
      `rule returned ${display(outcome)}, which is not "passed" or "failed"`,
    );
  }
  throwIfCaught(value, outcome);
  return outcome;
};

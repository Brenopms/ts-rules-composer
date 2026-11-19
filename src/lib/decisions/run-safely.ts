/**
 * The failure contract for the async callbacks a decision combinator calls
 * (predicates, accessors, child decisions, a mapped rule). Internal.
 */

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

/** Calls the hook; its throws and rejections are swallowed. */
const notify = (hook: ErrorHook | undefined, error: unknown): void => {
  if (hook === undefined) return;
  try {
    Promise.resolve(hook(error)).catch(() => {});
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
export const toBoolean: Check<boolean> = (value) => {
  if (typeof value !== "boolean") {
    throw new TypeError(`predicate must return a boolean, got ${typeof value}`);
  }
  return value;
};

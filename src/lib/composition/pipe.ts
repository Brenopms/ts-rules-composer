// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

/**
 * Pipes a value through a series of functions (left-to-right composition).
 * @template A - The input type
 * @template B - The output type after first function
 * @param value - The initial value
 * @param fns - Functions to apply sequentially
 * @returns The result of applying all functions to the initial value
 * @example
 * const result = pipe(
 *   5,
 *   (x) => x * 2,
 *   (x) => x + 3,
 *   (x) => `Result: ${x}`
 * ); // "Result: 13"
 * @caveats
 * - Currently supports up to 10 functions with proper type inference
 * - For more functions, type information will be lost
 */
export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, fn1: (arg: A) => B): B;
export function pipe<A, B, C>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
): C;
export function pipe<A, B, C, D>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
  fn5: (arg: E) => F,
): F;
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
  fn5: (arg: E) => F,
  fn6: (arg: F) => G,
): G;
export function pipe<A, B, C, D, E, F, G, H>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
  fn5: (arg: E) => F,
  fn6: (arg: F) => G,
  fn7: (arg: G) => H,
): H;
export function pipe<A, B, C, D, E, F, G, H, I>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
  fn5: (arg: E) => F,
  fn6: (arg: F) => G,
  fn7: (arg: G) => H,
  fn8: (arg: H) => I,
): I;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
  fn5: (arg: E) => F,
  fn6: (arg: F) => G,
  fn7: (arg: G) => H,
  fn8: (arg: H) => I,
  fn9: (arg: I) => J,
): J;
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  value: A,
  fn1: (arg: A) => B,
  fn2: (arg: B) => C,
  fn3: (arg: C) => D,
  fn4: (arg: D) => E,
  fn5: (arg: E) => F,
  fn6: (arg: F) => G,
  fn7: (arg: G) => H,
  fn8: (arg: H) => I,
  fn9: (arg: I) => J,
  fn10: (arg: J) => K,
): K;
export function pipe(value: unknown, ...fns: AnyFunction[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

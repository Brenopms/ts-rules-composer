/**
 * Branch engine shared by rule `ifElse` and `toolkit.ifElse`: selects what
 * to run for a predicate's answer. Callers own failure handling, defaults
 * and normalization. Internal.
 */
export const branch = <T>(condition: boolean, whenTrue: T, whenFalse: T): T =>
  condition ? whenTrue : whenFalse;

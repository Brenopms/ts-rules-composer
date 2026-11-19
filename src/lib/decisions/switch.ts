/**
 * Switch engine shared by rule `match` and `toolkit.match`: selects what to
 * run for a key. The caller passes the lookup, so each keeps its own key
 * semantics (own keys only vs. truthy, inherited included). Callers own
 * failure handling, defaults and normalization. Internal.
 */
export const switchCase = <TKey, T>(
  key: TKey,
  lookup: (key: TKey) => T | undefined,
  fallback: T,
): T => {
  const selected = lookup(key);
  return selected === undefined ? fallback : selected;
};

# Spec: Close targeted test gaps (items 1–4)

Single capability (tests for existing behaviour), so no capability map is needed.

## Objective
Pin down four behaviours that coverage showed as untested or weakly tested, so regressions in the toolchain-modernized codebase are caught. Consumers: maintainers and CI.

1. **`withMemoize` eviction** (`src/lib/combinators/utility/with-memoize.ts`, uncovered lines 64, 83). Suspected bug: size management runs *before* the `cache.has(key)` check, so a cache hit at `maxSize` evicts the oldest entry first, even when that entry is the one being requested.
2. **Clone fallbacks** (`helpers/clone/clone.ts`, `shallowClone.ts`; 57–71% coverage). Falsy input and thrown errors return `{}` and call `console.warn`.
3. **`getCloneFn` strategy selection** (`helpers/clone/getCloneFn.ts`, line 12). `"structured"` falls back to `clone` when `structuredClone` is unavailable.
4. **`calculateDelay`** (`helpers/retry/calculate-delay.ts`, no spec file). Every strategy and fallback branch.

## Tech Stack
TypeScript 6, Vitest 5 (`vitest run`, `@vitest/coverage-v8`), Biome 2. Node >=22.

## Commands
```
Single file:  npx vitest run src/lib/helpers/retry/calculate-delay.spec.ts
All tests:    npm test
Coverage:     npm run test:coverage
Typecheck:    npm run typecheck
Lint/format:  npm run check
```

## Project Structure
Specs sit next to the source file, named `<file>.spec.ts`.
```
src/lib/combinators/utility/with-memoize.spec.ts   → extend (item 1)
src/lib/helpers/clone/clone.spec.ts                → new (item 2)
src/lib/helpers/clone/shallowClone.spec.ts         → new (item 2)
src/lib/helpers/clone/getCloneFn.spec.ts           → new (item 3)
src/lib/helpers/retry/calculate-delay.spec.ts      → new (item 4)
```

## Code Style
Match existing specs: `describe`/`it` from `vitest`, double quotes, 2 spaces, async tests `await` every `expect(...).resolves/rejects`.
```ts
import { describe, expect, it, vi } from "vitest";
import { calculateDelay } from "./calculate-delay";

describe("calculateDelay", () => {
  it("doubles the delay per attempt for exponential", () => {
    expect(calculateDelay("exponential", 3, 100)).toBe(400);
  });
});
```

## Testing Strategy
Red-green per item, one commit each. Test public behaviour, not internals.

| Item | Cases |
|---|---|
| 1 | with `maxSize: 2`: call A, B, then A again → rule ran twice, not three times; a hit never evicts another entry; inserting a third distinct key evicts the oldest; `ttl` expiry still evicts |
| 2 | `clone(null/undefined/0)` → `{}`; circular object → `{}` + one `console.warn`; normal object → deep copy not sharing references. `shallowClone`: falsy → `{}`; copy is shallow (nested ref shared); spread that throws → `{}` + warn (e.g. via a throwing Proxy) |
| 3 | `"shallow"` → shallowClone; `"structured"` → `structuredClone` when present; `"structured"` with `vi.stubGlobal("structuredClone", undefined)` → clone fallback; default/`"json"` → clone |
| 4 | undefined → fixed; `"fixed"`, `"linear"` (attempt 0 → 0), `"exponential"` (attempt 1 → base); unknown string → `initialDelayMs`; custom function called with attempt |

Spy on `console.warn` with `vi.spyOn` and restore it; never leave global stubs behind (`vi.unstubAllGlobals`).

## Boundaries
- **Always:** run the single spec after each change; typecheck + `npm run check` before committing; one conventional commit per item.
- **Ask first:** any change to library source. Item 1 is the only candidate; if the test shows the bug is real, report it and propose the fix before editing `with-memoize.ts`.
- **Never:** weaken, skip or delete existing tests; add `biome-ignore` or `@ts-ignore` to get green; add dependencies; change public types or exports.

## Success Criteria
- Items 1–4 each have specs covering the cases above, all passing (or, for item 1, failing with a clear bug report if the suspected bug is real, pending approval to fix).
- Coverage of `clone.ts`, `shallowClone.ts`, `getCloneFn.ts`, `calculate-delay.ts` reaches 100% lines and branches; `with-memoize.ts` lines 64 and 83 covered.
- `npm test`, `npm run typecheck`, `npm run check` pass with no new warnings.
- Out of scope: items 5+ (`unless`, `with-debug`, `has-context`, `pass`/`fail`), built-package test, property-based tests.

## Open Questions
1. If item 1 confirms the bug, may I fix `with-memoize.ts` (move size management after the hit check, and refresh recency or keep FIFO), or do you want a separate PR/issue?
2. Which semantics do you want for `maxSize`: FIFO (current intent, oldest inserted evicted) or LRU (a hit refreshes recency)?
3. Put this on a new branch off `main` (separate from PR #7), or on `chore/modernize-tooling`? I assume a new branch `test/close-coverage-gaps`.
4. Is a `console.warn` on clone failure the intended contract (so tests may assert it), or incidental?

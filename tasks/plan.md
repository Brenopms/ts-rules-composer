# Implementation Plan: pipeline-graph

Spec: `SPEC-pipeline-graph.md` (approved). Idea: `docs/ideas/pipeline-graph-mermaid.md`. Checklist: `tasks/todo.md`.

## Overview
Record each combinator's structure at construction time as a JSON-serializable graph node (a `Symbol.for` property on the returned function), expose it with `toGraph`, and print it with `toMermaid` (subpath export). Existing code and the `Rule` type don't change.

## Architecture decisions
- **Tracer bullet first.** One end-to-end path (`pipeRules` + `when` → `toGraph` → `toMermaid` through the real built subpath) before touching the other combinators. It tests the two riskiest assumptions: metadata surviving the wrappers, and the subpath export surviving attw/publint/dist tests in ESM and CJS.
- **`graph/node.ts` imports nothing from `combinators/` or `helpers/`.** `helpers/safety/get-normalized-rule.ts` already imports from `combinators/` while combinators import `helpers/`; I don't add to that cycle.
- **Nodes reference original children**, captured from each combinator's arguments before any `withSafeError` wrapping.
- **Labels and ids early** (task 4), because every later snapshot depends on them. Changing them later would rewrite every snapshot.
- **Printer grows by node shape**, not by combinator, so each task adds a coherent set of shapes plus snapshots.
- **Test-first** per task; mutation check (remove `attachNode`, confirm the test fails) per combinator task.

## Spec correction found while planning
The spec's API sketch used `Rule<any, any, any>`, which contradicts its own boundary ("no `any` in public types"). Use generics instead: `toGraph<TInput, TError, TContext>(rule: Rule<TInput, TError, TContext>)`, and the same for `toMermaid`. Spec updated.

## Dependency graph
```
T1 node.ts + attachNode ─┬─ T2 tracer: pipeRules+when → toGraph ─┬─ T4 named + labels/ids ─┬─ T5..T9 remaining combinators (parallelizable after T4)
                         │                                      │                          └─ T10 printer shapes (needs T5..T8)
                         └─ T3 subpath packaging skeleton ──────┴─ (T3 needs T2 for a real printer call)
T11 decorator badges + options (needs T9, T10) → T12 escaping hardening → T13 example snapshots → T14 docs → T15 final verification
```

## Task list

### Phase 1: Foundation and tracer bullet (high risk first)

**T1: Graph node primitives** (S)
- Add `GraphNode`/`RuleGraph` types, the `Symbol.for("ts-rules-composer.node")` key, `attachNode` (non-enumerable, non-writable, returns the same function), `readNode`.
- Acceptance: `attachNode` returns the identical function; property absent from `Object.keys`, spread and `JSON.stringify`; `readNode` returns `undefined` for plain functions; file imports nothing from combinators/helpers.
- Verify: `npx vitest run src/lib/graph/node.spec.ts`; `npm run typecheck`; `npm run check`.
- Files: `src/lib/graph/node.ts`, `src/lib/graph/node.spec.ts`.

**T2: Tracer bullet, `pipeRules` + `when` + `toGraph`** (M)
- `pipeRules` attaches `sequence`, `when` attaches `branch`; plain functions are leaves; `toGraph(rule)` returns `{version: 1, root}` with `fn.name` labels and position-based ids; export from `src/lib/index.ts`.
- Acceptance: children in the node are the **original** rules (identity check, not the safety-wrapped ones); `toGraph` never invokes any function (spy); existing specs untouched and green; `RuleGraph` survives a JSON round-trip.
- Verify: `npm test`; `npm run typecheck`.
- Files: `src/lib/graph/to-graph.ts` (+spec), `src/lib/composition/pipe-rules.ts`, `src/lib/combinators/logic/when.ts`, `src/lib/index.ts`.
- Risk gate: if the original-children assumption fails here, stop and revisit the spec.

**T3: Subpath packaging skeleton** (S)
- Add `src/lib/mermaid/index.ts` with a minimal `toMermaid` (renders `flowchart TD` plus the leaf/sequence from T2), a second tsdown entry, and the `./mermaid` export (types + import + require). **Ask first: this edits `package.json` exports and tsdown entries; approved in the spec decisions.**
- Acceptance: `npm run build` green with attw (node16 profile) and publint; `dist/mermaid` exists in ESM and CJS with `.d.ts`/`.d.cts`; dist test imports `ts-rules-composer/mermaid` in both ESM and CJS.
- Verify: `npm run build`; `npm run test:dist`.
- Files: `src/lib/mermaid/index.ts`, `src/lib/mermaid/to-mermaid.ts`, `tsdown.config.ts`, `package.json`, `test-dist/exports.spec.ts`.

**T4: `named` + label/id resolution** (M)
- `named(name, fn, {params?})` returns a wrapper with the same signature, doesn't mutate its argument. Label order: `named` → `fn.name` (ignoring `""`, `"anonymous"`, `"bound ..."`) → `rule #n` (deterministic traversal order). Ids are position-based and deterministic.
- Acceptance: each resolution step has a test; wrapper keeps sync and async return types; `expectTypeOf` shows `named` preserves `F`; two runs produce identical ids/labels.
- Verify: `npx vitest run src/lib/graph`; `npm run typecheck`.
- Files: `src/lib/graph/named.ts` (+spec), `src/lib/graph/to-graph.ts`, `src/lib/graph/labels.ts` (+spec).

### Checkpoint 1: tracer bullet
- [ ] `npm test`, `typecheck`, `check`, `build`, `test:dist` green
- [ ] `toMermaid(pipeRules([...]))` works from the built subpath in ESM and CJS
- [ ] Review with human: IR shape and label output, before fanning out to all combinators

### Phase 2: Remaining combinators (parallelizable after T4; each independent)

**T5: `unless`, `ifElse`** → `branch` (`ifTrue`/`ifFalse`: `unless` has only `ifFalse`, no negate flag) (S). Files: `unless.ts`, `if-else.ts`, specs. Verify: focused specs + `npm test`.

**T6: `match`** → `switch` (selector label, one node per case key, default node or "no match" marker, string default error) (S). Files: `match.ts`, spec.

**T7: `every`, `oneOf`, `composeRules`** → `all`, `any`, `sequence` with `via: "composeRules"` in **execution order** (reverse of the argument array) (M). Files: `every.ts`, `one-of.ts`, `compose-rules.ts`, specs. Note `every` delegates to `prepareRuleExecution`, so attach in `every`, not in the shared function.

**T8: `not`, `withFallback`, `validateField`, `tap`** → `not`, `fallback` (labelled `onlyFallbackOn` guard), `field` (getter label), `effect` (M). Files: the four combinator files + specs (split specs if over 5 files).

**T9a: visible decorators `withTimeout`, `withRetry`, `withMemoize`** → `decorator` nodes with `{ms}`, `{attempts, retryOn}`, `{}` (S/M). Files: three combinator files + specs.

**T9b: plumbing decorators `withDebug`, `withTap`, `mapError`, `inject`** → `decorator` nodes (`inject` transparent: the configured rule's node; `withDebug` name feeds the label) (M). Files: four combinator files + specs. `withTap` is curried (returns a decorator), so the node attaches to the returned rule.

- Each of T5-T9b acceptance: IR node test per combinator with original-children identity; mutation check (remove `attachNode` → test fails); runtime specs untouched; `toGraph` invokes nothing.

### Checkpoint 2: complete IR
- [ ] Every combinator in the spec table has a node kind and a test
- [ ] Full `toGraph` JSON round-trip on a pipeline using all combinators
- [ ] All existing specs unchanged and green; main-entry size measured (record number)

### Phase 3: Mermaid printer

**T10: Printer shapes** (M): `{entry, exits}` renderer for branch diamond with yes/no, switch with labelled edges, `all`/`any` subgraphs, `not`, `fallback`, `field`, `effect`; `input`/`passed`/`failed` terminals; fail edges on by default. One snapshot per node kind. Files: `to-mermaid.ts`, `render-*.ts` helpers (if split), spec. Depends on T5-T8.

**T11: Decorator badges and options** (S/M): `⏱`/`↻`/`⚡` badges, `verbose` for plumbing decorators, `direction`, `failEdges`, `maxLabelLength` (truncate with `…`). Depends on T9a, T9b, T10.

**T12: Escaping hardening** (S): entity-encode `" < > [ ] { } ( ) | # ; backtick` and newlines; neutralize `%%{...}%%` and `click`; tests including `"]; click x call alert(1)`. (T4/T10 apply basic escaping; this task proves it adversarially.)

**T13: Example snapshots** (M): rebuild the three example pipelines in `src/test/pipeline-graph.spec.ts` (examples export nothing), snapshot `toMermaid` output. **Manual step: paste the three into mermaid.live and confirm they render and read well; adjust shapes/defaults (e.g. fail edges) if too noisy.**

### Checkpoint 3: printer complete
- [ ] Snapshots stable and deterministic; escaping tests pass
- [ ] Human has looked at the three rendered diagrams and approved readability

### Phase 4: Ship

**T14: Docs** (S): README "Diagrams" section with a real generated example, JSDoc with compiling `@example` for `named`, `toGraph`, `toMermaid`; note on naming rules/predicates and the "plain function = leaf" limitation. Files: `README.md`, JSDoc in the three public files.

**T15: Final verification and PR notes** (S): run the full pipeline; add the dual-package dist test (ESM printer reading a CJS-built pipeline); record size numbers against the proposed budgets (main < 1.5 KB, mermaid < 3 KB, min+gzip); write PR description(s) linking the spec.

### Checkpoint: complete
- [ ] All spec success criteria checked
- [ ] Size numbers reported; budgets confirmed or revised
- [ ] Ready for review

## Parallelization
After T4, T5-T9b touch disjoint files and can run in parallel sessions. T10-T13 are sequential (shared printer files).

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Wrapped children break metadata lookup | High | T2 is a gate: identity test on original children; stop and revisit if it fails |
| Subpath export fails attw/publint or CJS/ESM | High | T3 early, before any printer work |
| Dual-package: ESM printer can't read CJS metadata | Med | `Symbol.for`; dedicated dist test in T15 |
| `named` wrapper changes sync/async behavior | Med | Wrapper forwards the return value untouched; type and runtime tests in T4 |
| Diagrams too noisy to be useful | Med | T13 manual review; `failEdges` and `verbose` options; decide before docs |
| Metadata adds measurable bundle size | Low | Measure at Checkpoint 2 and T15; budgets are proposals |
| Escaping gaps allow Mermaid directive injection | Med | T12 adversarial tests; labels never interpolated raw |

## Decisions
- **PR granularity (decided):** 4 PRs, one per phase. PR 1 = T1-T4 + Checkpoint 1; PR 2 = T5-T9b + Checkpoint 2 (may split logic/utility if the diff is large); PR 3 = T10-T13 + Checkpoint 3; PR 4 = T14-T15.

## Open questions
1. **Size budgets** (1.5 KB main, 3 KB mermaid) are placeholders; accept them as soft targets to be revised after the first measurement?

# Spec: pipeline-graph (ts-rules-composer)

Status: **approved** (decisions on Open Questions 1-4 confirmed by the owner: subpath export, `Symbol.for` property, `named` returns a wrapper, fail edges on by default; 5 and 6 follow the stated leanings: snapshots plus manual check, no public `attachNode` in v1). Source: `docs/ideas/pipeline-graph-mermaid.md`. Single capability (graph IR + Mermaid printer), so no capability map. All changes are **additive and non-breaking**; they ship as `feat:` minors through the existing release flow.

## Objective
Make any pipeline built with `ts-rules-composer` inspectable as a JSON-serializable graph, and renderable as a Mermaid flowchart, without changing how rules are written or how they run.

- **User (v1):** developers reading or reviewing pipelines (README, PR descriptions, generated docs). Business-readable wording is a later version.
- **Why a graph IR and not just Mermaid:** the planned drag-and-drop editor assembles pipelines from a registry of named rules and needs a loadable format. Mermaid is the first printer over that IR; the editor will be another view.
- **Why this is needed at all:** every combinator returns an opaque closure (`Rule = (input, ctx) => result`), so structure is lost after composition. The fix is to record structure at construction time.

Success: `toMermaid(pipeline)` produces a correct, readable diagram for the three example pipelines (financial-transaction, user-registration, model-deployment), with all existing tests passing untouched.

## Assumptions (correct me now or I'll proceed)
1. Metadata is attached **at construction**, to the function a combinator returns. Children are read from the combinator's original arguments, **before** `withSafeError` wrapping. I checked `getNormalizedRule(s)`, `prepareRuleExecution`, `when`, `ifElse`, `unless`, `not`, `withFallback`, `oneOf`: all wrap children into new functions, but none of that matters because the node stores the original child references. This resolves the one-pager's first assumption on paper; a spike test still proves it.
2. **Revision to the one-pager:** metadata is stored as a non-enumerable property under `Symbol.for("ts-rules-composer.node")`, not a `WeakMap`. Reason: the package ships ESM and CJS (`exports.import`/`require`); an app can load both, and two module instances would hold two separate WeakMaps, hiding ESM-built metadata from a CJS printer. `Symbol.for` is shared across instances.
3. The IR is a **tree** (a rule used twice appears as two nodes). A DAG is not needed for v1.
4. Leaf rules are plain functions. A user-written wrapper combinator (no metadata) is indistinguishable from a leaf and renders as one box. That is the accepted degradation, not an error.
5. Rendering **never executes** rules, predicates, accessors or getters.
6. The printer lives behind a subpath export `ts-rules-composer/mermaid` so the main entry doesn't pay for it. *Needs your confirmation (see Boundaries / Open Questions).*

## Tech Stack
TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 5, Biome, tsdown (`platform: "neutral"`, ESM + CJS), attw + publint. Zero runtime dependencies; no Node-only APIs (browser-portable).

## Commands
```
Typecheck:   npm run typecheck
Unit tests:  npm test
Single file: npx vitest run src/lib/graph/to-graph.spec.ts
Coverage:    npm run test:coverage
Lint/format: npm run check        # npm run check:fix to apply
Build:       npm run build        # attw/publint must stay green
Dist test:   npm run test:dist
```

## Project Structure
```
src/lib/graph/
  node.ts               → GraphNode types, Symbol key, attachNode/readNode (no imports from combinators: avoid new cycles)
  named.ts              → named(name, fn, opts?) public helper
  to-graph.ts           → toGraph(rule): RuleGraph; label + id resolution
  *.spec.ts             → co-located tests
src/lib/mermaid/
  to-mermaid.ts         → printer, escaping, layout of entry/exit points
  to-mermaid.spec.ts
src/lib/combinators/**  → each combinator attaches its node (one-line change each)
src/lib/composition/**  → pipeRules, composeRules attach nodes
src/lib/index.ts        → export named, toGraph, graph types
src/lib/mermaid/index.ts→ subpath entry exporting toMermaid
src/test/pipeline-graph.spec.ts → snapshot tests of the three example pipelines
tsdown.config.ts, package.json  → second entry + `./mermaid` export (needs approval)
docs/ideas/, README.md  → README "Diagrams" section
```

## Code Style
Existing conventions: double quotes, 2 spaces, Biome-formatted, JSDoc with compiling `@example`. Combinator change is minimal and keeps behavior identical:

```ts
export const not = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  error: TError,
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError, TContext> =>
  attachNode(
    async (input, context) => {
      const result = await getNormalizedRule(rule, options)(input, context);
      return result.status === "passed" ? fail(error) : pass();
    },
    { kind: "not", child: rule },
  );
```

`attachNode(fn, node)` defines the symbol property (non-enumerable, non-writable) and returns the same `fn`.

## Specified behavior

### Public API
```ts
// main entry
named<F extends (...args: never[]) => unknown>(name: string, fn: F, opts?: { params?: Record<string, unknown> }): F
toGraph<TInput, TError, TContext>(rule: Rule<TInput, TError, TContext>): RuleGraph
type RuleGraph = { version: 1; root: GraphNode }

// ts-rules-composer/mermaid
toMermaid<TInput, TError, TContext>(rule: Rule<TInput, TError, TContext>, options?: MermaidOptions): string

type MermaidOptions = {
  direction?: "TD" | "LR";      // default "TD"
  failEdges?: boolean;           // default true: dotted edge from each step to the failed terminal
  verbose?: boolean;             // default false: also show debug/tap/inject/mapError decorators
  maxLabelLength?: number;       // default 40, truncates with "…"
};
```
`named` returns a thin wrapper with the same call signature and carries the label; it **does not mutate** the function passed in. One helper serves rules, predicates, `match` accessors and `validateField` getters. Return value is the Mermaid source only (no code fence).

### IR node kinds (shape to be finalized in the plan; this is the contract)
Steps are stored in **execution order** (`composeRules` runs in reverse; the IR records the run order and `via: "composeRules"`).

| Node kind | Produced by | Mermaid shape |
|---|---|---|
| `rule` (leaf) | any plain function, `named(...)` | rectangle |
| `sequence` | `pipeRules`, `composeRules` | chain of steps, fail-fast edges |
| `all` | `every` | fork/join subgraph "all must pass, collects errors" |
| `any` | `oneOf` | fork/join subgraph "at least one passes" |
| `branch` | `when`, `unless` (only `ifFalse`), `ifElse` | diamond, yes/no edges; no `else` falls through |
| `switch` | `match` | diamond, one labelled edge per case key, default or "no match → fail" |
| `not` | `not` | rectangle "not: …" wrapping the child |
| `fallback` | `withFallback` | child, then dotted "on fail" edge to fallback (guard label if `onlyFallbackOn` is named) |
| `field` | `validateField` | rectangle "field: <getter label>" wrapping the child |
| `effect` | `tap` | rounded rectangle (always passes) |
| `decorator` | `withTimeout`, `withRetry`, `withMemoize`, `withDebug`, `withTap`, `mapError`, `inject` | **badge** on the child's label, no separate box |

Decorators: `withTimeout` (`⏱ 500ms`), `withRetry` (`↻ 3x`), `withMemoize` (`⚡ cached`) always show. `withDebug`, `withTap`, `mapError`, `inject` are plumbing and hidden unless `verbose: true`; `inject` is otherwise transparent (the configured rule's node). `withDebug`'s `name` option feeds the label.

### Labels and ids
Label resolution, first match wins: explicit `named` name → `withDebug` name → `fn.name` (ignoring `""`, `"anonymous"`, `"bound ..."`) → `rule #n` (n = traversal order among unlabelled nodes, deterministic). Const-assigned arrows (`const hasItems = (o) => ...`) are labelled free; inline lambdas and parameterized factory results (`minAge(18)`) need `named`. Raw identifier text in v1 (no humanizing).

Node ids derive from tree position (e.g. `root.steps.2.cases.card`), so the same pipeline always yields the same ids and the same Mermaid text. Mermaid ids are a sanitized form of these.

### Mermaid rendering
- Starts with `flowchart TD`, an `input` start node, and `passed` / `failed` terminal nodes.
- Renderer returns `{ entry, exits }` per node so branching and sequencing compose.
- **Escaping is mandatory.** Labels come from function names and user strings. Encode `"`, `<`, `>`, `[`, `]`, `{`, `}`, `(`, `)`, `|`, `#`, `;`, newlines and backticks as entities, and strip anything that could open a Mermaid directive (`click`, `%%{ }%%`), so output is safe under `securityLevel: "loose"`.
- Unknown or unexpected values never throw: they render as a leaf.

## Testing Strategy
Vitest, co-located `*.spec.ts`, type tests via `expectTypeOf`.

| Level | What |
|---|---|
| Unit: IR | each combinator attaches the right node; children are the **original** rules (not safety wrappers); `composeRules` order; `named` doesn't mutate its argument |
| Unit: no behavior change | every existing spec passes untouched; `attachNode` returns the same function; property is non-enumerable (spread/`JSON.stringify` of a rule is unchanged) |
| Unit: labels/ids | resolution order, `rule #n` determinism, same input gives identical output across runs |
| Unit: Mermaid | one snapshot per node kind; escaping cases (quotes, brackets, `%%{init}%%`, long names); `failEdges`/`verbose`/`direction`/`maxLabelLength` options |
| Safety | spies prove `toGraph`/`toMermaid` never invoke any rule, predicate, accessor or getter |
| Integration | snapshot diagrams of the three example pipelines (rebuilt in `src/test/pipeline-graph.spec.ts`, since the example files export nothing) |
| Packaging | `npm run build` (attw, publint) and `npm run test:dist` cover both entries in ESM and CJS; a dist test loads the ESM printer against a CJS-built pipeline (dual-package case) |
| Manual | paste the three snapshots into mermaid.live once and confirm they render and read well |

Test-first per combinator; mutation check: remove each `attachNode` and confirm its test fails.

## Boundaries
- Always: write the failing test first; keep runtime behavior and existing public signatures identical; never execute user functions while describing; run typecheck, tests, check and build before committing; conventional commits, one concern per commit.
- Ask first: adding any dependency (including a `mermaid` devDependency to parse-check output); editing `package.json` `exports` or the tsdown entries; naming of public API (`named`, `toGraph`, `toMermaid`); changing the `Rule` type or any combinator's generics; README claims about the feature.
- Never: change `Rule`, `RuleResult` or any default behavior; mutate a user's function; add a runtime dependency; use Node-only APIs; weaken or delete existing tests; use `any`/`@ts-ignore` in public types; publish.

## Success Criteria
- [ ] All existing tests pass unchanged; `npm run typecheck`, `check`, `build`, `test:dist` green (attw, publint)
- [ ] Every combinator in the table has a node kind, a unit test and a snapshot
- [ ] `toMermaid` on the three example pipelines gives a readable diagram, confirmed by eye in mermaid.live
- [ ] Output is deterministic: two runs produce byte-identical text
- [ ] Escaping tests pass, including a malicious name (`"]; click x call alert(1)`) producing inert output
- [ ] No rule/predicate is ever invoked by `toGraph`/`toMermaid` (spy tests)
- [ ] `RuleGraph` is plain JSON: `JSON.parse(JSON.stringify(g))` deep-equals `g`
- [ ] Node ids and child references are stable, so the future trace overlay can key results by node id (not built now)
- [ ] Size: main-entry growth reported in the PR (proposed budget: under 1.5 KB min+gzip); mermaid entry reported separately (proposed under 3 KB). Numbers are proposals; adjust after the first measurement.
- [ ] README has a "Diagrams" section with a real generated example

## Not in scope (see one-pager)
`fromGraph` and the registry, the editor, the trace overlay, business-readable wording, themes, parameter schemas, static source analysis.

## Open Questions
1. **Subpath export** `ts-rules-composer/mermaid` (my recommendation) versus exporting `toMermaid` from the main entry (simpler, small cost) versus a separate package. Needs a decision before the packaging task.
2. **Symbol property vs WeakMap** (assumption 2): I recommend `Symbol.for` because of the dual-package hazard. Confirm you accept a property on the returned function, even though it is non-enumerable.
3. **`named` returns a wrapper** (one extra call per invocation at runtime, no mutation) versus mutating the function in place (free, but a shared rule can only carry one name). I recommend the wrapper. Confirm.
4. **Fail edges on by default** (honest about fail-fast, but busy on long pipelines) versus off by default. I chose on; say if the three example diagrams look too noisy and I'll flip it.
5. **Automated Mermaid syntax check:** add `mermaid` as a devDependency and parse in tests (it may need a DOM shim in Node), or rely on snapshots plus the manual check? I lean on snapshots plus manual for v1.
6. **Should custom combinator authors get a public `attachNode`/describe hook** in v1? I lean on keeping it internal until the IR has settled.

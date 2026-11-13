# Tasks: pipeline-graph

Details, acceptance criteria and verification per task: `tasks/plan.md`. Spec: `SPEC-pipeline-graph.md`.

## Phase 1: Foundation and tracer bullet
- [x] T1: Graph node primitives (`attachNode`, `readNode`, types, Symbol key)
- [x] T2: Tracer bullet: `pipeRules` + `when` + `toGraph` (gate: original children survive wrappers)
- [x] T3: Subpath packaging skeleton (`ts-rules-composer/mermaid`, ESM + CJS, attw/publint, dist test)
- [x] T4: `named` + label/id resolution
- [ ] Checkpoint 1: tracer bullet green; human reviews IR and label output

## Phase 2: Remaining combinators (parallelizable)
- [ ] T5: `unless`, `ifElse`
- [ ] T6: `match`
- [ ] T7: `every`, `oneOf`, `composeRules`
- [ ] T8: `not`, `withFallback`, `validateField`, `tap`
- [ ] T9a: `withTimeout`, `withRetry`, `withMemoize`
- [ ] T9b: `withDebug`, `withTap`, `mapError`, `inject`
- [ ] Checkpoint 2: complete IR, JSON round-trip, size measured

## Phase 3: Mermaid printer
- [ ] T10: Printer shapes (branch, switch, all/any, not, fallback, field, effect)
- [ ] T11: Decorator badges and options (`verbose`, `direction`, `failEdges`, `maxLabelLength`)
- [ ] T12: Escaping hardening (adversarial tests)
- [ ] T13: Snapshots of the three example pipelines + manual mermaid.live check
- [ ] Checkpoint 3: printer complete; human approves the rendered diagrams

## Phase 4: Ship
- [ ] T14: Docs (README "Diagrams", JSDoc examples)
- [ ] T15: Final verification, dual-package dist test, size numbers, PR notes
- [ ] Checkpoint: all spec success criteria met

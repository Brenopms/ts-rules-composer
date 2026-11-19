/**
 * Decisions: `defineOutcomes` and its toolkit. Every builder checks its
 * arguments when built and never throws while running; engines only route.
 * Layers and files: docs/adr/0001-decisions-build-run-pipeline.md.
 */
export type { OutcomeOf, OutcomeToolkit } from "./define-outcomes";
export { defineOutcomes } from "./define-outcomes";

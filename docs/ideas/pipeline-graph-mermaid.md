# Pipeline Graph & Mermaid Export

## Problem Statement
How might we make a composed rule pipeline visible as a diagram, and loadable
from a serializable graph, without breaking the engine's plain-function,
zero-dependency ergonomics?

## Recommended Direction
Introduce a JSON-serializable graph IR as the shared model. Combinators attach
their node description (kind, label, children, options) to the function they
return, via a WeakMap, so existing code and the `Rule` type are untouched.
`toMermaid(pipeline)` is a printer over that IR. Later, `fromGraph(json,
registry)` rebuilds pipelines from the same node types, and the drag-and-drop
editor becomes another view on the IR.

Labels are opt-in: explicit name/describe metadata first, then `fn.name`, then
"rule #n". Opaque custom rules degrade to a single "custom" box instead of
failing. Drawing is best-effort; serialization is strict and only works for
registry-built pipelines.

The trace overlay (colour the path a real input took) is deliberately deferred.
The IR carries stable node ids and child references so it can be added without
redesign.

## Key Assumptions to Validate
- [ ] Metadata survives the safety/normalization wrappers - read
      getNormalizedRule and prepareRuleExecution; spike on `when` + `pipeRules`.
- [ ] Every combinator maps to a clear Mermaid shape (pipe, when/unless/ifElse,
      match, every, oneOf, not, withFallback) - draw all by hand first.
- [ ] Diagrams of the three examples (financial-transaction, user-registration,
      model-deployment) are readable with minimal naming.
- [ ] The IR is not Mermaid-shaped - review it against the editor needs
      (stable ids, params, registry references) before freezing.

## MVP Scope
In: IR node types for all existing combinators; WeakMap metadata in core;
`toMermaid` (flowchart, top-down); opt-in naming helpers; decorations
(inject, mapError, tap, withDebug, retry/timeout) rendered as badges/notes;
snapshot tests on the three examples; a README section.
Out: fromGraph/registry, editor, trace overlay, business wording, themes.

## Not Doing (and Why)
- Drag-and-drop editor - a separate product; v1 only commits to a JSON-serializable IR.
- Round-trip loading (`fromGraph`) - needs the registry; do it once the IR has proven itself.
- Trace overlay - touches execution, not construction; revisit after seeing real diagrams.
- Static source analysis - can't see dynamically built pipelines.
- Parameter schemas for editor forms - later, once a registry exists.
- Business-readable output - v1 targets developers.

## Open Questions
- Subpath export in core (`ts-rules-composer/mermaid`) or a separate package?
- How should anonymous predicates be labelled when no name is given?
- Are custom user-written combinators supported through a public "describe" hook, or always opaque?
- Should the metadata API be public (for custom combinators) or internal at first?

# ADR 0001: Decisions build/run pipeline

- **Status:** Accepted
- **Date:** 2026-11-19
- **Scope:** `src/lib/decisions/` (the `defineOutcomes` toolkit)

## Context

Decision combinators (`ifElse`, `match`, `combine`, `combineAll`, later
`mapOutcome`) take
user input from TypeScript and plain JavaScript callers, and they call user
callbacks (predicates, accessors, child decisions, resolvers). The module's
contract:

- **Fail closed.** A decision never throws or rejects while running. Any
  failure (a throw, a rejection, a malformed result) becomes the
  combinator's `onError` outcome.
- **Bad configuration fails early.** Every argument a builder checks
  (outcome labels, predicates, accessors, branches, cases, `decisions`,
  `resolver`, an `onError` override, `onErrorCaught`) throws a
  `TypeError` with a fixed message when the combinator is built, never when
  it runs.
- **Read once.** Each user object, property and array entry is read once,
  so getters and later mutation can't change what was checked.
- **Shared routing.** Rule `ifElse`/`match` reuse the same routing engines
  but keep their own failure policy.

The checks this needs were first written inline in `define-outcomes.ts`,
and the same few patterns were copied across builders.

## Decision

Every builder is the same pipeline in two phases:

```text
BUILD: once per builder call; may throw TypeError
  raw arguments ──check + copy──▶ trusted arguments

RUN: once per input; never throws or rejects
  trusted arguments ──wrap──▶ safe calls
                   ──route──▶ engine
                   ──decide─▶ wrapper semantics
```

**The rule: checks happen at build, failures become values at run, engines
stay pure.**

| Layer | Job | Files |
|---|---|---|
| Value checks | Small checks that know nothing about outcomes: `isObject`, `typeName`, `display`, `checkFunction`, `toList` (array, not empty, length read once, own entries only), `expectBoolean`. Imports nothing. | `guards.ts` |
| Trusted arguments (build) | Turn raw builder arguments into trusted values or throw a fixed `TypeError` (`<method>: <where> …`): `localOnError`, `toDecision`, `toCaseTable`, `toChildren`, `toResolver`, `toMerger` (a `combine`-only resolver for `combineAll`). | `inputs.ts`, plus `validateOutcomes` in `define-outcomes.ts` |
| Safe calls (run) | Async callbacks go through `runSafely`: catch throw or rejection, check the awaited value (`toBoolean`, `toKey`, `toLabel`), notify `onErrorCaught` once, return `{ ok: false }`. Resolver methods are synchronous: `toResolver` wraps them at build time, and the wrapper checks each result when called and throws on a malformed one. | `run-safely.ts`, `toResolver` in `inputs.ts`, `toLabel`/`runDecision` in `define-outcomes.ts` |
| Engines (run) | Choose what runs next. No checks, no failure policy. Shared with rule combinators where it applies. | `branch.ts`, `switch.ts`, `combine.ts` (`foldSequential` for `combine`, `foldParallel` for `combineAll`), `precedence.ts` (default resolver) |
| Wrapper semantics (run) | The function each builder returns decides what a failure means: failure ⇒ local `onError`, the hook called once, a fresh `{ outcome }`. In `combine` and `combineAll` (shared `folding` wrapper), a child failure joins the merge as `onError`, while a resolver failure ends the whole combinator. Rule wrappers keep their own policy. | the toolkit methods in `define-outcomes.ts` |

A new builder answers three questions: what does it check at build time,
which calls does it make safe, and which engine does it route through.

## Consequences

- Each run-time path can trust its inputs. Engines are a few lines and are
  shared with rule `ifElse`/`match` without leaking decision semantics into
  them.
- Error messages and read order are defined in one place per pattern, so
  tests can assert exact text.
- Some indirection: builder setup lives in `inputs.ts`, apart from the
  toolkit wiring, and takes the outcome set (`OutcomeSet`) as a parameter.
- Production files in `decisions/` import only from `types/` (type-only)
  and from each other. See the import-boundary rule in the module plan.

## Alternatives considered

- **A validation or schema library** (for example zod): rejected. It adds a
  runtime dependency to a small library for a handful of checks, and it
  can't express the module's specifics (own keys only, read once, symbol
  keys, fixed messages) without custom code anyway.
- **Checking at run time instead of build time:** rejected. A
  misconfiguration would become an `onError` outcome on every input, which
  looks like a business outcome, instead of an immediate error the
  developer sees.
- **Keeping the checks inline in each builder:** rejected after D6. The same
  patterns (object check, type name, list walk, boolean check) were copied
  three to five times, and D8 would add more.

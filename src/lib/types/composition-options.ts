import type { Prettify } from "./prettify";
import type { RuleSafetyOptions } from "./rule-safety-options";

/**
 * Options for rule composition functions.
 * @property cloneContext - Whether to clone the context for each rule
 * @property cloneStrategy - Which strategy to use when cloning the context
 * @property errorHandling - Determines how the combinator handles thrown errors
 *   - "safe": (default) Catches errors and converts them to failed RuleResults
 *   - "unsafe": Lets errors propagate normally (for performance-critical cases)
 *
 * @property errorTransform - Optional custom error transformation function
 *   Only used when errorHandling="safe". Allows customizing how thrown errors
 *   are converted to the rule's error type.
 *
 *
 *  @warn
 * - Cloning behavior follows this priority:
 *   1. Uses shallowClone if options.cloneStrategy = "shallow"
 *   2. Uses structuredClone if available and options.cloneStrategy = "structured"
 *   3. Falls back to JSON clone otherwise
 * - structuredClone requires Node 17+ or modern browsers
 * - JSON clone will lose special types (Date, Map, etc.)
 * - All clones convert undefined/null to empty object {}
 * - Circular references fail silently in JSON clone mode
 */
export type CompositionOptions<TError = string> = Prettify<
  {
    cloneContext?: boolean;
    cloneStrategy?: "shallow" | "json" | "structured";
  } & RuleSafetyOptions<TError>
>;

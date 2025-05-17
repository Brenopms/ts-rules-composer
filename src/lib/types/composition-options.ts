/**
 * Options for rule composition functions.
 * @property cloneContext - Whether to clone the context for each rule
 * @property cloneStrategy - Which strategy to use when cloning the context
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
export type CompositionOptions = {
  cloneContext?: boolean;
  cloneStrategy?: "shallow" | "json" | "structured";
};

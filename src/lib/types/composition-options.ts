/**
 * Options for rule composition functions.
 * @property cloneContext - Whether to clone the context for each rule
 * @property structuredClone - Whether to use structuredClone or simple clone
 *
 * - Cloning behavior follows this priority:
 *   1. Uses shallowClone if options.shallowClone = true
 *   2. Uses structuredClone if available and options.structuredClone = true
 *   3. Falls back to JSON clone otherwise
 * - structuredClone requires Node 17+ or modern browsers
 * - JSON clone will lose special types (Date, Map, etc.)
 * - All clones convert undefined/null to empty object {}
 * - Circular references fail silently in JSON clone mode
 */
export type CompositionOptions = {
  cloneContext?: boolean;
  structuredClone?: boolean;
  shallowClone?: boolean;
};

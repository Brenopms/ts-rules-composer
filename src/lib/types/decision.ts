/**
 * The result of a decision: one label from a declared outcome set.
 * @template O - The outcome labels, e.g. `"declined" | "review" | "approved"`
 * @example
 * const result: DecisionResult<"declined" | "approved"> = { outcome: "approved" };
 */
export type DecisionResult<O extends string> = { readonly outcome: O };

/**
 * A function that picks one outcome for an input. Every `Rule` is a
 * `Decision<TInput, "passed" | "failed", TContext>`.
 * @template TInput - The type of the input to decide on
 * @template O - The outcome labels it can return
 * @template TContext - The type of the context object (optional)
 * @example
 * const bureauScore: Decision<CreditApplication, CreditOutcome> = async (app) => {
 *   const score = await creditBureau.score(app.applicantId);
 *   return score >= 700 ? credit.outcome("approved") : credit.outcome("review");
 * };
 */
export type Decision<TInput, O extends string, TContext = unknown> = (
  input: TInput,
  context?: TContext,
) => DecisionResult<O> | Promise<DecisionResult<O>>;

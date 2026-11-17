import { pass } from "../index";
import type { Rule } from "../types";
import { type MermaidOptions, toMermaid as printDefault } from "./to-mermaid";

/**
 * Most tests pin how failures are drawn, so they print with fail edges on.
 * `printDefault` is the real default, covered in "fail edges" below.
 */
export const toMermaid = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  options: MermaidOptions = {},
) => printDefault(rule, { failEdges: true, ...options });

export const hasItems = () => pass();
export const withinLimit = () => pass();
export const lines = (...rows: string[]) =>
  ["flowchart TD", ...rows].join("\n");
export const isLarge = () => true;
export const isRetryable = () => true;
export const tier = (): "large" | "small" => "large";
export const getTotal = (order: { total: number }) => order.total;
export const positive = () => pass();
export const logOrder = () => {};

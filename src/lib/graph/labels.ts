/**
 * The function's own name, unless it carries no information: empty,
 * "anonymous", or the "bound x" name given by `Function.prototype.bind`.
 */
export const usableName = (fn: { name: string }): string | undefined => {
  const { name } = fn;
  return name === "" || name === "anonymous" || name.startsWith("bound ")
    ? undefined
    : name;
};

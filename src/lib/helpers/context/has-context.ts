export const hasContext = <T>(ctx: T | undefined): ctx is T => {
  return ctx !== undefined;
};

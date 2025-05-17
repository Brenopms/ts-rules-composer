export const clone = <T>(obj: T): T => {
  if (!obj) return {} as T;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.warn(
      `Clone failed for ${obj?.constructor?.name}, returning empty object`,
      e,
    );
    return {} as T;
  }
};

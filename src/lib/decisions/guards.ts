/**
 * Small value checks shared by the decisions module, with no knowledge of
 * outcomes. They never convert a value: an object's `toString` may throw and
 * replace the `TypeError` being built. Internal; imports nothing.
 */

/** A non-null object (arrays included), so its properties can be read. */
export const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

/** `typeof`, except that `null` is `"null"`. For error messages. */
export const typeName = (value: unknown): string =>
  value === null ? "null" : typeof value;

/** A string in quotes, anything else as `(type)`. For error messages. */
export const display = (value: unknown): string =>
  typeof value === "string" ? `"${value}"` : `(${typeName(value)})`;

/**
 * Checks a list argument and copies it: an array, not empty, each entry
 * passed to `checkEntry` with its position (`where[index]`). The length is
 * read once and each entry once; a hole is `undefined`, never an entry
 * inherited from the prototype. Throws `TypeError` (`<where> must be an
 * array`, `<where> must not be empty`, or whatever `checkEntry` throws).
 */
export const toList = <T>(
  value: unknown,
  where: string,
  checkEntry: (entry: unknown, at: string) => T,
): T[] => {
  if (!Array.isArray(value)) throw new TypeError(`${where} must be an array`);
  const length = value.length;
  if (length === 0) throw new TypeError(`${where} must not be empty`);
  const list: T[] = [];
  for (let index = 0; index < length; index++) {
    const entry: unknown = Object.hasOwn(value, index)
      ? value[index]
      : undefined;
    list.push(checkEntry(entry, `${where}[${index}]`));
  }
  return list;
};

/**
 * A check for callbacks that must return a boolean, with no truthiness
 * coercion. Throws `TypeError` (`<what> must return a boolean, got <type>`).
 */
export const expectBoolean =
  (what: string) =>
  (value: unknown): boolean => {
    if (typeof value !== "boolean") {
      throw new TypeError(
        `${what} must return a boolean, got ${typeName(value)}`,
      );
    }
    return value;
  };

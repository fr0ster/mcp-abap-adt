/**
 * The zod type of an argument whose values a projection lists: one value is
 * that literal, more an enum — as a JSON Schema `enum` was registered before
 * the definitions moved to zod (one value listed as `const`).
 */
import * as z from 'zod';

export function listedValues<const T extends readonly string[]>(
  values: T,
): z.ZodType<T[number]> {
  const [only] = values;
  return values.length === 1 && only !== undefined
    ? z.literal(only)
    : z.enum(values);
}

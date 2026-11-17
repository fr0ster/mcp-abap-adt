/**
 * The words a tool's schema refuses `args` in ('' when it takes them): the
 * one check of a call (24.0.0), read without a handler, a connection or a
 * request — what the SDK, the exporter and the entry's call answer.
 */

import type * as z from 'zod';
import { invalidArgumentsWords } from '../../lib/handlers/interfaces';

export function schemaWords(
  definition: { readonly name: string; readonly inputSchema: z.ZodObject },
  args: Readonly<Record<string, unknown>>,
): string {
  const parsed = definition.inputSchema.safeParse(args);
  return parsed.success
    ? ''
    : invalidArgumentsWords(definition.name, parsed.error.issues);
}

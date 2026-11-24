import * as z from 'zod';
import { checkTool, purpose, results } from '../../../lib/description';
/**
 * CheckTableType: a delegating wrapper over its low-tier sibling. It reaches
 * the sibling's `detail`-bearing projection through that delegation but
 * forwards no `detail` of its own, so the sibling answers at its default,
 * terse; a caller who wants `full`/`raw` calls the low-tier sibling.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckTableType as handleCheckTableTypeLow } from '../low/handleCheckTableType';

export const TOOL_DEFINITION = {
  name: 'CheckTableType',
  available_in: ['onprem', 'cloud'] as const,
  description: checkTool({
    tag: 'read-only',
    purpose: purpose('Checks an ABAP table type for errors and warnings.'),
    result: results.CHECKED_NAMED,
  }),
  inputSchema: z.object({
    table_type_name: z.string().describe('Table type name.'),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        'Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      ),
  }),
} as const;

/** What the caller sent: arguments from outside the type system. */
type CheckTableTypeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCheckTableType(
  context: HandlerContext,
  args: CheckTableTypeArgs,
) {
  const result = await handleCheckTableTypeLow(context, args);
  // An absent name was refused by the sibling (an error, passed through).
  return normalizeCheckResponse(
    result,
    (args.table_type_name ?? '').toUpperCase(),
  );
}

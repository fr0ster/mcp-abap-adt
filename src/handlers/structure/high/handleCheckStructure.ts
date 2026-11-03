import * as z from 'zod';
/**
 * Task 28: why this delegating wrapper carries no `detail` of its own.
 *
 * This high-tier tool exists to call its low-tier sibling and run
 * `normalizeCheckResponse` over the answer — it reaches a REAL,
 * `detail`-bearing projection through that delegation (the sibling's own
 * `project(detail, terseCheck)`), but never forwards a `detail` argument,
 * so the sibling always answers at its default, terse. This is a fourth
 * shape the brief's three rows do not name: a tool with a real reading
 * behind it, reached only through another handler it delegates to, not
 * through its own client call.
 *
 * Leaving `detail` off this wrapper's own surface is deliberate, not an
 * oversight. The high tier is
 * the opinionated, reduced surface; the low tier is where the full set of
 * knobs — `detail` included — lives for a caller who needs them. A caller
 * who wants `full`/`raw` calls the low-tier sibling
 * directly.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckStructure as handleCheckStructureLow } from '../low/handleCheckStructure';

export const TOOL_DEFINITION = {
  name: 'CheckStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Runs a syntax check on the ABAP structure named by structure_name. Can check existing structure (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.',
  inputSchema: z.object({
    structure_name: z.string().describe('Structure name.'),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        "Version to check: 'active' or 'inactive'. Without `version` the active version is checked.",
      ),
    ddl_code: z
      .string()
      .optional()
      .describe(
        'Optional: DDL source code to validate instead of the saved version.',
      ),
  }),
} as const;

export async function handleCheckStructure(
  context: HandlerContext,
  args: { structure_name: string; version?: string; ddl_code?: string },
) {
  const result = await handleCheckStructureLow(context, args);
  return normalizeCheckResponse(result, args.structure_name?.toUpperCase());
}

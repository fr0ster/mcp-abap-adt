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
import { handleCheckProgram as handleCheckProgramLow } from '../low/handleCheckProgram';

export const TOOL_DEFINITION = {
  name: 'CheckProgram',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Runs a syntax check on the ABAP program (report) named by program_name. Returns syntax errors, warnings, and messages. On ABAP Cloud, the programs are SAP's standard programs.",
  inputSchema: z.object({
    program_name: z.string().describe('Program name.'),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      ),
  }),
} as const;

export async function handleCheckProgram(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const result = await handleCheckProgramLow(context, args);
  return normalizeCheckResponse(result, args.program_name?.toUpperCase());
}

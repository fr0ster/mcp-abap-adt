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
 * oversight — the same simplification this wrapper already makes for
 * `session_id`/`session_state`: neither is in this tool's own schema
 * either, even though the low-tier sibling accepts both. The high tier is
 * the opinionated, reduced surface; the low tier is where the full set of
 * knobs — `detail` included — lives for a caller who needs them. A caller
 * who wants `full`/`raw` or session control calls the low-tier sibling
 * directly.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckTable as handleCheckTableLow } from '../low/handleCheckTable';

export const TOOL_DEFINITION = {
  name: 'CheckTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP table. Can check existing table (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., ZMCP_MY_TABLE).',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active', 'inactive', or 'new'. Default: new.",
        enum: ['active', 'inactive', 'new'],
      },
      ddl_code: {
        type: 'string',
        description:
          'Optional: DDL source code to validate instead of the saved version.',
      },
    },
    required: ['table_name'],
  },
} as const;

export async function handleCheckTable(
  context: HandlerContext,
  args: { table_name: string; version?: string; ddl_code?: string },
) {
  const result = await handleCheckTableLow(context, args);
  return normalizeCheckResponse(result, args.table_name?.toUpperCase());
}

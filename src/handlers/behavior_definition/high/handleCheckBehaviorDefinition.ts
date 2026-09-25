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
import { handleCheckBehaviorDefinition as handleCheckBdefLow } from '../low/handleCheckBehaviorDefinition';

export const TOOL_DEFINITION = {
  name: 'CheckBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP behavior definition (BDEF). Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., ZI_MY_BDEF).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.',
      },
    },
    required: ['name'],
  },
} as const;

export async function handleCheckBehaviorDefinition(
  context: HandlerContext,
  args: { name: string; version?: 'active' | 'inactive' },
) {
  const result = await handleCheckBdefLow(context, args);
  return normalizeCheckResponse(result, args.name?.toUpperCase());
}

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
import { handleCheckDataElement as handleCheckDataElementLow } from '../low/handleCheckDataElement';

export const TOOL_DEFINITION = {
  name: 'CheckDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., ZDE_MY_ELEMENT).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check. Defaults to the inactive one, what a caller wants right after a write; an object that is only active has no inactive version, and SAP answers such a check with "Error while importing object … from the database" — ask for active.',
      },
    },
    required: ['data_element_name'],
  },
} as const;

export async function handleCheckDataElement(
  context: HandlerContext,
  args: { data_element_name: string; version?: 'active' | 'inactive' },
) {
  const result = await handleCheckDataElementLow(context, args);
  return normalizeCheckResponse(result, args.data_element_name?.toUpperCase());
}

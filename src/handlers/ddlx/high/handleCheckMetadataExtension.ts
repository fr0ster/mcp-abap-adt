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
import { handleCheckMetadataExtension as handleCheckMetadataExtensionLow } from '../low/handleCheckMetadataExtension';

export const TOOL_DEFINITION = {
  name: 'CheckMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Runs a syntax check on the CDS metadata extension (DDLX) named by name. Returns syntax errors, warnings, and messages.',
  inputSchema: z.object({
    name: z.string().describe('Metadata extension name.'),
    version: z
      .enum(['active', 'inactive'])
      .default('active')
      .optional()
      .describe(
        "Which version to check: 'active' (default) or 'inactive', the unsaved one right after a write. This endpoint does not fall back to whichever exists.",
      ),
  }),
} as const;

export async function handleCheckMetadataExtension(
  context: HandlerContext,
  args: { name: string; version?: 'active' | 'inactive' },
) {
  const result = await handleCheckMetadataExtensionLow(context, args);
  return normalizeCheckResponse(result, args.name?.toUpperCase());
}

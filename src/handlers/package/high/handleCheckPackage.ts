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
import { handleCheckPackage as handleCheckPackageLow } from '../low/handleCheckPackage';

export const TOOL_DEFINITION = {
  name: 'CheckPackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Runs a syntax check on the ABAP package named by package_name. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name.',
      },
      super_package: {
        type: 'string',
        description:
          'Optional, and not read by the check endpoint — see CheckPackageLow. Requiring it refused the call before any request was made, for a package with no parent.',
      },
    },
    required: ['package_name'],
  },
} as const;

export async function handleCheckPackage(
  context: HandlerContext,
  args: { package_name: string; super_package?: string },
) {
  const result = await handleCheckPackageLow(context, args);
  return normalizeCheckResponse(result, args.package_name?.toUpperCase());
}

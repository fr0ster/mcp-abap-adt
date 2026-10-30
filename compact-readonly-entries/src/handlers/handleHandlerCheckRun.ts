/**
 * Task 28: why this compact facade carries no `detail` of its own.
 *
 * `handleCheckObject` (`common/low/handleCheckObject.ts`) — what this
 * facade delegates every call to — genuinely reaches a `detail`-bearing
 * projection: `project(detail, terseCheck)` over a real `AdtReading`, same
 * shape as the low set's check tools had. This facade never forwards a
 * `detail` argument, so that sibling always answers at its default, terse.
 * A fourth shape the brief's three rows do not name: a tool with a real
 * reading behind it, reached only through another handler it delegates to.
 *
 * `handleCheckObject`'s own `TOOL_DEFINITION` (`CheckObjectLow`) is not
 * a registered tool — and since 19.0.0 no low set is served at all — so
 * this compact facade is the ONLY way a caller
 * reaches that function's logic at all. Deliberately kept off this facade's
 * own reduced, `compactCheckRunSchema` surface (the same simplification
 * `compact/` tools make everywhere: no `detail`, no low-level session
 * knobs) rather than exposed here for the first time.
 */

import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  byVariant,
  COMPACT_CHECK,
  compactCheckRunDescription,
  compactCheckRunSchemaFor,
  toLowObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleCheckObject } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerCheckRun',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactCheckRunDescription(variant),
    inputSchema: compactCheckRunSchemaFor(COMPACT_CHECK[variant]),
  })),
} as const;

type HandlerCheckRunArgs = {
  object_type: CompactObjectType;
  object_name: string;
  version?: 'active' | 'inactive';
  source_code?: string;
};

export async function handleHandlerCheckRun(
  context: HandlerContext,
  args: HandlerCheckRunArgs,
) {
  const lowType = toLowObjectType(args.object_type);
  if (!lowType) {
    throw new Error(
      `CheckRun is not supported for object_type: ${args.object_type}`,
    );
  }

  return handleCheckObject(context, {
    object_name: args.object_name,
    object_type: lowType,
    version: args.version,
    source_code: args.source_code,
  });
}

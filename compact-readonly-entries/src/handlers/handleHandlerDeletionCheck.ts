import {
  byVariant,
  COMPACT_DELETION_CHECK,
  compactDeletionCheckDescription,
  compactDeletionCheckSchemaFor,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleDeletionCheck } from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerDeletionCheck',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactDeletionCheckDescription(variant),
    inputSchema: compactDeletionCheckSchemaFor(COMPACT_DELETION_CHECK[variant]),
    members: COMPACT_DELETION_CHECK[variant],
  })),
} as const;

type HandlerDeletionCheckArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerDeletionCheck(
  context: HandlerContext,
  args: HandlerDeletionCheckArgs,
) {
  return handleDeletionCheck(context, args);
}

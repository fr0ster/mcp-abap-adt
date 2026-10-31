import {
  byVariant,
  COMPACT_DELETION_CHECK,
  compactDeletionCheckDescription,
  compactDeletionCheckSchemaFor,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleDeletionCheck } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerDeletionCheck',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactDeletionCheckDescription(variant),
    inputSchema: compactDeletionCheckSchemaFor(COMPACT_DELETION_CHECK[variant]),
  })),
} as const;

type HandlerDeletionCheckArgs = {
  object_type: string;
  object_name: string;
};

export async function handleHandlerDeletionCheck(
  context: HandlerContext,
  args: HandlerDeletionCheckArgs,
) {
  return handleDeletionCheck(context, args);
}

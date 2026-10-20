import { compactTransportMoveObjectsSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleMoveTransportObjects } from '@mcp-abap-adt/lib/handlers/write';
import { namingHandlerGet } from './compactConfirmWith';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportMoveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Transport move objects: moves object entries from one task to another. Required: transport_number* (the source task), target_number* (the target task), objects* (at least one: object_name*, object_type*, position* in the source task's object list, pgmid). The positions come from HandlerGet with object_type TRANSPORT on the source task. Response: JSON — acceptance only; a re-read of both tasks with HandlerGet (object_type TRANSPORT) confirms it.",
  inputSchema: compactTransportMoveObjectsSchema,
} as const;

type HandlerTransportMoveObjectsArgs = {
  transport_number: string;
  target_number: string;
  objects: {
    object_name: string;
    object_type: string;
    position: string;
    pgmid?: string;
  }[];
};

export async function handleHandlerTransportMoveObjects(
  context: HandlerContext,
  args: HandlerTransportMoveObjectsArgs,
) {
  return namingHandlerGet(await handleMoveTransportObjects(context, args));
}

import { compactTransportMoveObjectsSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleMoveTransportObjects } from '@mcp-abap-adt/lib/handlers/write';
import { namingHandlerGet } from './compactConfirmWith';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportMoveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Moves the object entries named by objects from the transport task named by transport_number to the task named by target_number. Required: transport_number* (the source task), target_number* (the target task), objects* (at least one: object_name*, object_type*, position* in the source task's object list, pgmid). The positions come from a read of the source task's objects (object_type TRANSPORT). Response: JSON — acceptance only; a re-read of both tasks' objects (object_type TRANSPORT) confirms it.",
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

import { compactTransportMoveObjectsSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleMoveTransportObjects } from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportMoveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Transport move objects: moves object entries from one task to another. Top-level object_type: not used. Required: transport_number* (the source task), target_number* (the target task), objects* (at least one: object_name*, object_type*, position* in the source task's object list, pgmid). Response: JSON — acceptance only; a re-read of both tasks confirms it.",
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
  return handleMoveTransportObjects(context, args);
}

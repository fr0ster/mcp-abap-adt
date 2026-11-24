import {
  compactOf,
  compactTransportMoveObjectsSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleMoveTransportObjects,
  WRITE_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/write';
import type * as z from 'zod';
import { namingHandlerGet } from './compactConfirmWith';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportMoveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(WRITE_DEFINITIONS.MoveTransportObjects.description),
  inputSchema: compactTransportMoveObjectsSchema,
} as const;

type HandlerTransportMoveObjectsArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerTransportMoveObjects(
  context: HandlerContext,
  args: HandlerTransportMoveObjectsArgs,
) {
  return namingHandlerGet(await handleMoveTransportObjects(context, args));
}

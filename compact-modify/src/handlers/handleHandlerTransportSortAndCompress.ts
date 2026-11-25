import {
  compactOf,
  compactTransportSortAndCompressSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleSortAndCompressTransportTask,
  WRITE_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/write';
import type * as z from 'zod';
import { namingHandlerGet } from './compactConfirmWith';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportSortAndCompress',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(
    WRITE_DEFINITIONS.SortAndCompressTransportTask.description,
  ),
  inputSchema: compactTransportSortAndCompressSchema,
} as const;

type HandlerTransportSortAndCompressArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerTransportSortAndCompress(
  context: HandlerContext,
  args: HandlerTransportSortAndCompressArgs,
) {
  return namingHandlerGet(
    await handleSortAndCompressTransportTask(context, args),
  );
}

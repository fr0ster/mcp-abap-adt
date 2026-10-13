import { compactTransportSortAndCompressSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleSortAndCompressTransportTask } from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportSortAndCompress',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Transport task sort and compress: sorts a task's object list and merges its duplicate entries. object_type: not used. Required: transport_number* (a task). A task holding the same entry twice refuses removing an entry until this has run. Response: JSON — acceptance only; a re-read of the task's objects confirms it.",
  inputSchema: compactTransportSortAndCompressSchema,
} as const;

type HandlerTransportSortAndCompressArgs = {
  transport_number: string;
};

export async function handleHandlerTransportSortAndCompress(
  context: HandlerContext,
  args: HandlerTransportSortAndCompressArgs,
) {
  return handleSortAndCompressTransportTask(context, args);
}

import { compactTransportSortAndCompressSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleSortAndCompressTransportTask } from '@mcp-abap-adt/lib/handlers/write';
import { namingHandlerGet } from './compactConfirmWith';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportSortAndCompress',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Sorts the object list of the transport task named by transport_number and merges its duplicate entries. Required: transport_number* (a task). A task holding the same entry twice refuses removing an entry until this has run. Response: JSON — acceptance only; a re-read of the task's objects (object_type TRANSPORT) confirms it.",
  inputSchema: compactTransportSortAndCompressSchema,
} as const;

type HandlerTransportSortAndCompressArgs = {
  transport_number: string;
};

export async function handleHandlerTransportSortAndCompress(
  context: HandlerContext,
  args: HandlerTransportSortAndCompressArgs,
) {
  return namingHandlerGet(
    await handleSortAndCompressTransportTask(context, args),
  );
}

import { compactDeletionCheckSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleDeletionCheck } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerDeletionCheck',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Asks SAP whether the object can be deleted: sends the deletion check request for the given type, and answers SAP's verdict as it came: deletable true with the object and SAP's message when it carries one, or SAP's refusal with its words. object_type and object_name required: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST (its test class), PROGRAM [onprem only], INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE (object_name GROUP|MODULE), BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.",
  inputSchema: compactDeletionCheckSchema,
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

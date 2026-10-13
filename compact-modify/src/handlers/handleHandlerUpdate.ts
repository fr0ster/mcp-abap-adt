import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import { compactUpdateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleUpdateUnderLock } from '@mcp-abap-adt/lib/handlers/write';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerUpdate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update operation. With lock_handle (from HandlerLock) the write is sent under the lock already held — no lock, unlock, check or activation of its own — for PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION and METADATA_EXTENSION; without it the update locks and unlocks itself. object_type required: PACKAGE(package_name*, description*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, source_code*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, implementation_code*), METADATA_EXTENSION(name*, source_code*), UNIT_TEST(class_name*, test_class_source*), CDS_UNIT_TEST(class_name*, test_class_source*).',
  inputSchema: compactUpdateSchema,
} as const;

type HandlerUpdateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerUpdate(
  context: HandlerContext,
  args: HandlerUpdateArgs,
) {
  if (args.lock_handle !== undefined) {
    return handleUpdateUnderLock(context, args);
  }
  return routeCompactWrite(context, 'update', args);
}

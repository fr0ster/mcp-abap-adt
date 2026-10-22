import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import { compactDeleteSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerDelete',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Deletes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the deletion request for its type, and answers SAP's result. object_type required: PACKAGE(package_name*, transport_request), DOMAIN(domain_name*, transport_request), DATA_ELEMENT(data_element_name*, transport_request), TABLE(table_name*, transport_request), STRUCTURE(structure_name*, transport_request), DDL(ddl_name*, transport_request), SERVICE_DEFINITION(service_definition_name*, transport_request), SERVICE_BINDING(service_binding_name*, transport_request), CLASS(class_name*, transport_request), CDS_UNIT_TEST(class_name*, transport_request), PROGRAM(program_name*, transport_request) [onprem only], INTERFACE(interface_name*, transport_request), FUNCTION_GROUP(function_group_name*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, transport_request), BEHAVIOR_DEFINITION(behavior_definition_name*, transport_request), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*, transport_request), METADATA_EXTENSION(metadata_extension_name*, transport_request), LOCAL_TEST_CLASS(class_name*, lock_handle*, transport_request), LOCAL_TYPES(class_name*, lock_handle*, transport_request), LOCAL_DEFINITIONS(class_name*, lock_handle*, transport_request), LOCAL_MACROS(class_name*, lock_handle*, transport_request), UNIT_TEST(class_name*, lock_handle*, transport_request). CDS_UNIT_TEST deletes its test class. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS and LOCAL_MACROS (the class's local includes) and UNIT_TEST (its test classes include) the include is written empty under lock_handle, the class's lock handle. transport_request is sent with the request. Over Streamable HTTP an include write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); it is sent only under a lock the instance it reaches holds.",
  inputSchema: compactDeleteSchema,
} as const;

type HandlerDeleteArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerDelete(
  context: HandlerContext,
  args: HandlerDeleteArgs,
) {
  return routeCompactWrite(context, 'delete', args);
}

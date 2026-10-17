import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import { compactUpdateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerUpdate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Writes the object under its lock: sends the one write request of the given type under lock_handle, the lock handle of the object, and answers SAP's result. The write replaces the whole content with the one given. lock_handle and object_type required: PACKAGE(package_name*, source_code*, transport_request), DOMAIN(domain_name*, source_code*, transport_request), DATA_ELEMENT(data_element_name*, source_code*, transport_request), FUNCTION_GROUP(function_group_name*, source_code*, transport_request), TABLE(table_name*, ddl_code*, transport_request), STRUCTURE(structure_name*, ddl_code*, transport_request), DDL(ddl_name*, ddl_source*, transport_request), SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request), CLASS(class_name*, source_code*, transport_request), LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request), LOCAL_TYPES(class_name*, local_types_code*, transport_request), LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request), LOCAL_MACROS(class_name*, macros_code*, transport_request), UNIT_TEST(class_name*, test_class_source*, transport_request), CDS_UNIT_TEST(class_name*, test_class_source*, transport_request), PROGRAM(program_name*, source_code*, transport_request) [onprem only], INTERFACE(interface_name*, source_code*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request), BEHAVIOR_DEFINITION(name*, source_code*, transport_request), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request), METADATA_EXTENSION(name*, source_code*, transport_request), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version). For PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP, source_code is the whole metadata document, sent as given. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST and BEHAVIOR_IMPLEMENTATION, lock_handle is the class's lock handle. For SERVICE_BINDING the write is its publication request; service_name and service_version (default 0001) name the service of an OData V2 binding. transport_request is sent as the write's corrNr.",
  inputSchema: compactUpdateSchema,
} as const;

type HandlerUpdateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

/** One request: the type's write under `lock_handle` (`handleUpdateUnderLock`, spec §4.6). */
export async function handleHandlerUpdate(
  context: HandlerContext,
  args: HandlerUpdateArgs,
) {
  return routeCompactWrite(context, 'update', args);
}

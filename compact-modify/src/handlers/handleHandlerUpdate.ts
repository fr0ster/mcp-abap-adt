import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import { compactUpdateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerUpdate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Writes the object under the lock the caller holds: sends the one write request of the given type under lock_handle (the handle HandlerLock answered) and answers SAP's result. The write replaces the whole content with the one given. lock_handle and object_type required: PACKAGE(package_name*, source_code*), DOMAIN(domain_name*, source_code*), DATA_ELEMENT(data_element_name*, source_code*), FUNCTION_GROUP(function_group_name*, source_code*), TABLE(table_name*, ddl_code*), STRUCTURE(structure_name*, ddl_code*), DDL(ddl_name*, ddl_source*), SERVICE_DEFINITION(service_definition_name*, source_code*), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version), CLASS(class_name*, source_code*), LOCAL_TEST_CLASS(class_name*, test_class_code*), LOCAL_TYPES(class_name*, local_types_code*), LOCAL_DEFINITIONS(class_name*, definitions_code*), LOCAL_MACROS(class_name*, macros_code*), UNIT_TEST(class_name*, test_class_source*), CDS_UNIT_TEST(class_name*, test_class_source*), PROGRAM(program_name*, source_code*) [onprem only], INTERFACE(interface_name*, source_code*), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*), BEHAVIOR_DEFINITION(name*, source_code*), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*), METADATA_EXTENSION(name*, source_code*). For PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP, source_code is the whole metadata document, sent as given (HandlerGet part metadata answers it). For SERVICE_BINDING the write is its publication request; service_name and service_version (default 0001) name the service of an OData V2 binding. Optional for every type: transport_request.",
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

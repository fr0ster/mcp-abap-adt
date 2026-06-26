import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactOperation } from './compactRouter';
import { compactUpdateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUpdate',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Update operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, source_code*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, implementation_code*), METADATA_EXTENSION(name*, source_code*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*, test_class_source*).',
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
  return routeCompactOperation(context, 'update', args);
}

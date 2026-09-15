import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactOperation } from './compactRouter';
import { compactCreateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCreate',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Create operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*), UNIT_TEST(tests*), CDS_UNIT_TEST(class_name*, package_name*, cds_view_name*).',
  inputSchema: compactCreateSchema,
} as const;

type HandlerCreateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerCreate(
  context: HandlerContext,
  args: HandlerCreateArgs,
) {
  return routeCompactOperation(context, 'create', args);
}

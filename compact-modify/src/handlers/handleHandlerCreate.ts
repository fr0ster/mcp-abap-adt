import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import { compactCreateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerCreate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create an object: one request, the create alone — nothing is validated, locked, written, checked or activated; the object is created inactive with what its create carries. Write its content with HandlerLock, HandlerUpdate with the lock_handle and HandlerUnlock, then HandlerActivate. An argument the create does not send is refused, naming it. object_type required: PACKAGE(package_name*, super_package*), DOMAIN(domain_name*, package_name*), DATA_ELEMENT(data_element_name*, package_name*), TRANSPORT(description*), TABLE(table_name*, package_name*), STRUCTURE(structure_name*, package_name*), DDL(ddl_name*, package_name*), SERVICE_DEFINITION(service_definition_name*, package_name*), SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*), CLASS(class_name*, package_name*), PROGRAM(program_name*, package_name*) [onprem only], INTERFACE(interface_name*, package_name*), FUNCTION_GROUP(function_group_name*, package_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, package_name*), METADATA_EXTENSION(name*, package_name*). UNIT_TEST and CDS_UNIT_TEST are refused: their create is a chain of requests — the full set serves CreateUnitTest and CreateCdsUnitTest.',
  inputSchema: compactCreateSchema,
} as const;

type HandlerCreateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

/** One request: the type's create alone (`handleCreateOnly`, spec §4.6). */
export async function handleHandlerCreate(
  context: HandlerContext,
  args: HandlerCreateArgs,
) {
  return routeCompactWrite(context, 'create', args);
}

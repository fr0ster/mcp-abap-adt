import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import { compactGetSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  type CompactReadPart,
  partsFor,
  routeCompactPart,
} from './compactPartRoutes';
import { compactReadRouterMap, routeCompactRead } from './compactReadRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerGet',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read operation. part selects the aspect: source (default), metadata, or urls; a part the type does not offer is refused, naming the ones it does. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).',
  inputSchema: compactGetSchema,
} as const;

type HandlerGetArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerGet(
  context: HandlerContext,
  args: HandlerGetArgs,
) {
  const part = (args.part as CompactReadPart | undefined) ?? 'source';
  const hasSource = compactReadRouterMap[args.object_type]?.get !== undefined;

  if (part === 'source') {
    // A type with no source read is the router's refusal too, and it names the
    // operation; adding a second voice here would only muddle it.
    return routeCompactRead(context, args);
  }

  return routeCompactPart(context, part, args, hasSource);
}

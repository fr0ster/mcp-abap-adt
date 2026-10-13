import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  compactGetSchema,
  withLongToolAdvice,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetNodeStructure,
  handleGetObjectStructure,
  handleGetVirtualFolders,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';
import {
  type CompactReadPart,
  partsFor,
  routeCompactPart,
} from './compactPartRoutes';
import { compactReadRouterMap, routeCompactRead } from './compactReadRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerGet',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    'Read operation. part selects the aspect: source (default), metadata, urls, or contents (the objects of a PACKAGE); a part the type does not offer is refused, naming the ones it does. Three parts read the repository by ADT address and take no object_type: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Otherwise object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*). TRANSPORT answers the objects the transport request or task holds, each with the position HandlerTransportMoveObjects takes. timeout applies to the reads only: UNIT_TEST and CDS_UNIT_TEST take none.',
  ),
  inputSchema: compactGetSchema,
} as const;

type HandlerGetArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

/** The parts that read the repository by ADT address rather than by object_type. */
const ADDRESS_PARTS = ['object_structure', 'node_structure', 'virtual_folders'];

function routeAddressPart(
  context: HandlerContext,
  part: string,
  args: Record<string, unknown>,
): Promise<unknown> | unknown {
  if (part === 'virtual_folders') {
    return handleGetVirtualFolders(context, {
      object_search_pattern: args.object_search_pattern,
      preselection: args.preselection,
      facet_order: args.facet_order,
      with_versions: args.with_versions,
      ignore_short_descriptions: args.ignore_short_descriptions,
    } as never);
  }
  if (!args.object_adt_type || !args.object_name) {
    return return_error(
      new Error(`part=${part} requires object_adt_type and object_name`),
    );
  }
  if (part === 'node_structure') {
    return handleGetNodeStructure(context, {
      parent_type: args.object_adt_type,
      parent_name: args.object_name,
      node_id: args.node_id,
      with_short_descriptions: args.with_short_descriptions,
    } as never);
  }
  return handleGetObjectStructure(context, {
    object_type: args.object_adt_type,
    object_name: args.object_name,
  } as never);
}

export async function handleHandlerGet(
  context: HandlerContext,
  args: HandlerGetArgs,
) {
  const requested = (args.part as string | undefined) ?? 'source';
  if (ADDRESS_PARTS.includes(requested)) {
    return routeAddressPart(context, requested, args);
  }
  const part = requested as CompactReadPart;
  // Every other part reads an object: without object_type the router
  // refuses it, in its own words and through its log, whatever the part.
  if (!args.object_type) {
    return routeCompactRead(context, args);
  }
  const hasSource = compactReadRouterMap[args.object_type]?.get !== undefined;

  if (part === 'source') {
    // A type with no source read is the router's refusal too, and it names the
    // operation; adding a second voice here would only muddle it.
    return routeCompactRead(context, args);
  }

  return routeCompactPart(context, part, args, hasSource);
}

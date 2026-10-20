import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  compactGetSchema,
  withLongToolAdvice,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetActivationResults,
  handleGetActivationStatus,
  handleGetNodeStructureOnce,
  handleGetObjectStructure,
  handleGetVirtualFolders,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';
import {
  type CompactReadPart,
  hasSourcePart,
  partsFor,
  routeCompactPart,
} from './compactPartRoutes';
import { routeCompactRead } from './compactReadRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerGet',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "Reads one part of an object. part selects it: source (default) the source alone, in one request; metadata the ADT metadata document alone, in one request; urls (SERVICE_BINDING) the service URL, its $metadata and the browser preview, contents (PACKAGE) the objects the package holds, its walk read level by level in ADT batch envelopes; package_names lists several packages, read together, one entry per package in the order given. A source document answers { part: 'source', source } and a metadata document { part: 'metadata', metadata }, beside the object's name. Parts per type: PACKAGE metadata, contents; DOMAIN, DATA_ELEMENT, FUNCTION_GROUP metadata; LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, TRANSPORT, UNIT_TEST, CDS_UNIT_TEST source; SERVICE_BINDING source, metadata, urls; every other type source, metadata. A part outside the type's list is answered with that list. Three parts read the repository by ADT address: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions; one node level; a package's blank answer is the empty listing with blank stating its two readings: an empty package, or an unknown package name) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by its id, in one request each: activation_status(run_id*) answers { run_id, part, status, document }, the run's status (finished, error, failed, or its progress while it runs) and its status document as SAP answered it; activation_results(run_id*) answers { run_id, part, messages, document }, the messages the run produced and its results document as SAP answered it. Otherwise object_type required: PACKAGE(package_name*; part contents: package_name* or package_names*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name* as GROUP|MODULE, or function_module_name* with function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*). TRANSPORT answers the objects a task holds, each with its position in the task's object list; for a request, every task's entries, each once, with its task number and position. UNIT_TEST and CDS_UNIT_TEST read the run's result in one request and answer { success, run_id, run_result }, run_result the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime.",
  ),
  inputSchema: compactGetSchema,
} as const;

type HandlerGetArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

/** The parts that read the repository by ADT address rather than by object_type. */
const ADDRESS_PARTS = ['object_structure', 'node_structure', 'virtual_folders'];

/** The parts that read an activation run by its run_id. */
const RUN_PARTS = ['activation_status', 'activation_results'];

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
    return handleGetNodeStructureOnce(context, {
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

/**
 * A function module is read at its group, given in the arguments:
 * `function_module_name` as `GROUP|MODULE`, or the module's name with
 * `function_group_name`. Both may be given when they name the same group.
 * Answers the arguments with the module and its group apart, or the
 * refusal — tagged, so nothing of the caller's arguments reads as an answer.
 */
function functionModuleArgs(
  args: HandlerGetArgs,
):
  | { ok: true; args: HandlerGetArgs }
  | { ok: false; refusal: ReturnType<typeof return_error> } {
  const given =
    typeof args.function_module_name === 'string'
      ? args.function_module_name.trim()
      : '';
  const separate =
    typeof args.function_group_name === 'string'
      ? args.function_group_name.trim().toUpperCase()
      : '';
  const segments = given.split('|');
  const named = segments.length > 1;
  const [first = '', second = ''] = named ? segments : ['', given];
  const group = named ? first.trim().toUpperCase() : separate;
  const module = second.trim();
  if (segments.length > 2 || !group || !module) {
    return {
      ok: false,
      refusal: return_error(
        new Error(
          'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name: the function group and the module are both required',
        ),
      ),
    };
  }
  if (named && separate && separate !== group) {
    return {
      ok: false,
      refusal: return_error(
        new Error(
          `function_module_name names group ${group}, function_group_name names ${separate}: give the group once`,
        ),
      ),
    };
  }
  return {
    ok: true,
    args: {
      ...args,
      function_module_name: module,
      function_group_name: group,
    },
  };
}

export async function handleHandlerGet(
  context: HandlerContext,
  args: HandlerGetArgs,
) {
  const requested = (args.part as string | undefined) ?? 'source';
  if (ADDRESS_PARTS.includes(requested)) {
    return routeAddressPart(context, requested, args);
  }
  if (RUN_PARTS.includes(requested)) {
    const read =
      requested === 'activation_status'
        ? handleGetActivationStatus
        : handleGetActivationResults;
    return read(context, { run_id: args.run_id });
  }
  const part = requested as CompactReadPart;
  // Every other part reads an object: without object_type the router
  // refuses it, in its own words and through its log, whatever the part.
  if (!args.object_type) {
    return routeCompactRead(context, args);
  }
  const hasSource = hasSourcePart(args.object_type);

  let read = args;
  if (
    args.object_type === 'FUNCTION_MODULE' &&
    (part === 'source' || part === 'metadata')
  ) {
    const named = functionModuleArgs(args);
    if (!named.ok) return named.refusal;
    read = named.args;
  }

  if (part === 'source') {
    if (!hasSource && partsFor(args.object_type, false).length > 0) {
      // A type with a metadata document and no source: what it has, named.
      return return_error(
        new Error(
          `part=source is not available for object_type=${args.object_type}. ` +
            `It offers: ${partsFor(args.object_type, false).join(', ')}.`,
        ),
      );
    }
    // The source read, one request; a type with no read at all is the
    // router's refusal, naming the operation.
    return routeCompactRead(context, read);
  }

  return routeCompactPart(context, part, read, hasSource);
}

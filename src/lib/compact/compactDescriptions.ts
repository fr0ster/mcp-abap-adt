/**
 * The descriptions of the compact tools whose `object_type` (or
 * `target_type`) picks the object, written from the members a variant serves
 * (`adtProjections.ts`): each member is named with the arguments it takes,
 * and a member the variant does not serve is not named.
 */
import {
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  COMPACT_DELETION_CHECK,
  COMPACT_LOCK,
  COMPACT_PROFILE,
  COMPACT_READ,
  COMPACT_SINGLE_ACTIVATION,
  COMPACT_UNLOCK,
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  COMPACT_WHERE_USED,
  type ProjectionVariant,
} from '../adtProjections';
import { withLongToolAdvice } from '../longTools';

/** Each member as the description names it, with the arguments it takes. */
type Tokens<M extends string> = { readonly [K in M]: string };

/** The members, each as `tokens` names it, joined by commas. */
function named<M extends string>(
  members: readonly M[],
  tokens: Tokens<M>,
): string {
  return members.map((member) => tokens[member]).join(', ');
}

/** `A, B and C`. */
function listed(members: readonly string[]): string {
  if (members.length <= 1) return members.join('');
  return `${members.slice(0, -1).join(', ')} and ${members[members.length - 1]}`;
}

/** `A, B or C`. */
function either(members: readonly string[]): string {
  if (members.length <= 1) return members.join('');
  return `${members.slice(0, -1).join(', ')} or ${members[members.length - 1]}`;
}

const CREATE_TOKENS: Tokens<(typeof COMPACT_CREATE.onprem)[number]> = {
  PACKAGE: 'PACKAGE(package_name*, super_package*)',
  DOMAIN: 'DOMAIN(domain_name*, package_name*)',
  DATA_ELEMENT: 'DATA_ELEMENT(data_element_name*, package_name*)',
  TRANSPORT: 'TRANSPORT(description*)',
  TABLE: 'TABLE(table_name*, package_name*)',
  STRUCTURE: 'STRUCTURE(structure_name*, package_name*)',
  DDL: 'DDL(ddl_name*, package_name*)',
  SERVICE_DEFINITION:
    'SERVICE_DEFINITION(service_definition_name*, package_name*)',
  SERVICE_BINDING:
    'SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*)',
  CLASS: 'CLASS(class_name*, package_name*)',
  PROGRAM: 'PROGRAM(program_name*, package_name*)',
  INTERFACE: 'INTERFACE(interface_name*, package_name*)',
  FUNCTION_GROUP: 'FUNCTION_GROUP(function_group_name*, package_name*)',
  FUNCTION_MODULE:
    'FUNCTION_MODULE(function_module_name*, function_group_name*)',
  BEHAVIOR_DEFINITION:
    'BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*)',
  BEHAVIOR_IMPLEMENTATION:
    'BEHAVIOR_IMPLEMENTATION(class_name*, package_name*)',
  METADATA_EXTENSION: 'METADATA_EXTENSION(name*, package_name*)',
};

/** HandlerCreate's description on `variant`. */
export function compactCreateDescription(variant: ProjectionVariant): string {
  return `Creates the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the create request for its type with the given parameters, and answers SAP's result. The object is created inactive. object_type required: ${named(COMPACT_CREATE[variant], CREATE_TOKENS)}. Optional for every type: description, transport_request.`;
}

const READ_TOKENS: Tokens<(typeof COMPACT_READ.onprem)[number]> = {
  PACKAGE:
    'PACKAGE(package_name*; part contents: package_name* or package_names*)',
  DOMAIN: 'DOMAIN(domain_name*)',
  DATA_ELEMENT: 'DATA_ELEMENT(data_element_name*)',
  TABLE: 'TABLE(table_name*)',
  STRUCTURE: 'STRUCTURE(structure_name*)',
  DDL: 'DDL(ddl_name*)',
  SERVICE_DEFINITION: 'SERVICE_DEFINITION(service_definition_name*)',
  SERVICE_BINDING: 'SERVICE_BINDING(service_binding_name*)',
  CLASS: 'CLASS(class_name*)',
  LOCAL_TEST_CLASS: 'LOCAL_TEST_CLASS(class_name*)',
  LOCAL_TYPES: 'LOCAL_TYPES(class_name*)',
  LOCAL_DEFINITIONS: 'LOCAL_DEFINITIONS(class_name*)',
  LOCAL_MACROS: 'LOCAL_MACROS(class_name*)',
  PROGRAM: 'PROGRAM(program_name*)',
  INTERFACE: 'INTERFACE(interface_name*)',
  FUNCTION_GROUP: 'FUNCTION_GROUP(function_group_name*)',
  FUNCTION_MODULE:
    'FUNCTION_MODULE(function_module_name* as GROUP|MODULE, or function_module_name* with function_group_name*)',
  BEHAVIOR_DEFINITION: 'BEHAVIOR_DEFINITION(behavior_definition_name*)',
  BEHAVIOR_IMPLEMENTATION:
    'BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*)',
  METADATA_EXTENSION: 'METADATA_EXTENSION(metadata_extension_name*)',
  UNIT_TEST: 'UNIT_TEST(run_id*)',
  CDS_UNIT_TEST: 'CDS_UNIT_TEST(run_id*)',
  TRANSPORT: 'TRANSPORT(transport_number*)',
};

/** HandlerGet's description on `variant`. */
export function compactGetDescription(variant: ProjectionVariant): string {
  return withLongToolAdvice(
    `[read-only] Reads one part of the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …). part selects it: source (default) the source alone, in one request; metadata the ADT metadata document alone, in one request; urls (SERVICE_BINDING) the service URL, its $metadata and the browser preview, contents (PACKAGE) the objects the package holds, its walk read level by level in ADT batch envelopes; package_names lists several packages, read together, one entry per package in the order given. A source document answers { part: 'source', source } and a metadata document { part: 'metadata', metadata }, beside the object's name. Parts per type: PACKAGE metadata, contents; DOMAIN, DATA_ELEMENT, FUNCTION_GROUP metadata; LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, TRANSPORT, UNIT_TEST, CDS_UNIT_TEST source; SERVICE_BINDING source, metadata, urls; every other type source, metadata. A part outside the type's list is answered with that list. Three parts read the repository by ADT address: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions; one node level; a package's blank answer is the empty listing with blank stating its two readings: an empty package, or an unknown package name) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by its id, in one request each: activation_status(run_id*) answers { run_id, part, status, document }, the run's status (finished, error, failed, or its progress while it runs) and its status document as SAP answered it; activation_results(run_id*) answers { run_id, part, messages, document }, the messages the run produced and its results document as SAP answered it. Otherwise object_type required: ${named(COMPACT_READ[variant], READ_TOKENS)}. TRANSPORT answers the objects a task holds, each with its position in the task's object list; for a request, every task's entries, each once, with its task number and position. UNIT_TEST and CDS_UNIT_TEST read the run's result in one request and answer { success, run_id, run_result }, run_result the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime.`,
  );
}

const UPDATE_TOKENS: Tokens<(typeof COMPACT_UPDATE.onprem)[number]> = {
  PACKAGE: 'PACKAGE(package_name*, source_code*, transport_request)',
  DOMAIN: 'DOMAIN(domain_name*, source_code*, transport_request)',
  DATA_ELEMENT:
    'DATA_ELEMENT(data_element_name*, source_code*, transport_request)',
  FUNCTION_GROUP:
    'FUNCTION_GROUP(function_group_name*, source_code*, transport_request)',
  TABLE: 'TABLE(table_name*, ddl_code*, transport_request)',
  STRUCTURE: 'STRUCTURE(structure_name*, ddl_code*, transport_request)',
  DDL: 'DDL(ddl_name*, ddl_source*, transport_request)',
  SERVICE_DEFINITION:
    'SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request)',
  CLASS: 'CLASS(class_name*, source_code*, transport_request)',
  LOCAL_TEST_CLASS:
    'LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request)',
  LOCAL_TYPES: 'LOCAL_TYPES(class_name*, local_types_code*, transport_request)',
  LOCAL_DEFINITIONS:
    'LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request)',
  LOCAL_MACROS: 'LOCAL_MACROS(class_name*, macros_code*, transport_request)',
  UNIT_TEST: 'UNIT_TEST(class_name*, test_class_source*, transport_request)',
  CDS_UNIT_TEST:
    'CDS_UNIT_TEST(class_name*, test_class_source*, transport_request)',
  PROGRAM: 'PROGRAM(program_name*, source_code*, transport_request)',
  INTERFACE: 'INTERFACE(interface_name*, source_code*, transport_request)',
  FUNCTION_MODULE:
    'FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request)',
  BEHAVIOR_DEFINITION:
    'BEHAVIOR_DEFINITION(name*, source_code*, transport_request)',
  BEHAVIOR_IMPLEMENTATION:
    'BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request)',
  METADATA_EXTENSION:
    'METADATA_EXTENSION(name*, source_code*, transport_request)',
  SERVICE_BINDING:
    'SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version)',
};

/** HandlerUpdate's description on `variant`. */
export function compactUpdateDescription(variant: ProjectionVariant): string {
  return `Writes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …) under its lock: sends the one write request of its type under lock_handle, the lock handle of the object, and answers SAP's result. The write sets the whole content to the one given. lock_handle and object_type required: ${named(COMPACT_UPDATE[variant], UPDATE_TOKENS)}. For PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP, source_code is the whole metadata document, sent as given. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST and BEHAVIOR_IMPLEMENTATION, lock_handle is the class's lock handle. For SERVICE_BINDING the write is its publication request, sent under the lock_handle given, an empty one included; service_name and service_version (default 0001) name the service of an OData V2 binding. transport_request is sent as the write's corrNr. Over Streamable HTTP the write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); the write is sent only under a lock the instance it reaches holds.`;
}

const DELETE_TOKENS: Tokens<(typeof COMPACT_DELETE.onprem)[number]> = {
  PACKAGE: 'PACKAGE(package_name*, transport_request)',
  DOMAIN: 'DOMAIN(domain_name*, transport_request)',
  DATA_ELEMENT: 'DATA_ELEMENT(data_element_name*, transport_request)',
  TABLE: 'TABLE(table_name*, transport_request)',
  STRUCTURE: 'STRUCTURE(structure_name*, transport_request)',
  DDL: 'DDL(ddl_name*, transport_request)',
  SERVICE_DEFINITION:
    'SERVICE_DEFINITION(service_definition_name*, transport_request)',
  SERVICE_BINDING: 'SERVICE_BINDING(service_binding_name*, transport_request)',
  CLASS: 'CLASS(class_name*, transport_request)',
  CDS_UNIT_TEST: 'CDS_UNIT_TEST(class_name*, transport_request)',
  PROGRAM: 'PROGRAM(program_name*, transport_request)',
  INTERFACE: 'INTERFACE(interface_name*, transport_request)',
  FUNCTION_GROUP: 'FUNCTION_GROUP(function_group_name*, transport_request)',
  FUNCTION_MODULE:
    'FUNCTION_MODULE(function_module_name*, function_group_name*, transport_request)',
  BEHAVIOR_DEFINITION:
    'BEHAVIOR_DEFINITION(behavior_definition_name*, transport_request)',
  BEHAVIOR_IMPLEMENTATION:
    'BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*, transport_request)',
  METADATA_EXTENSION:
    'METADATA_EXTENSION(metadata_extension_name*, transport_request)',
  LOCAL_TEST_CLASS:
    'LOCAL_TEST_CLASS(class_name*, lock_handle*, transport_request)',
  LOCAL_TYPES: 'LOCAL_TYPES(class_name*, lock_handle*, transport_request)',
  LOCAL_DEFINITIONS:
    'LOCAL_DEFINITIONS(class_name*, lock_handle*, transport_request)',
  LOCAL_MACROS: 'LOCAL_MACROS(class_name*, lock_handle*, transport_request)',
  UNIT_TEST: 'UNIT_TEST(class_name*, lock_handle*, transport_request)',
};

/** HandlerDelete's description on `variant`. */
export function compactDeleteDescription(variant: ProjectionVariant): string {
  return `Deletes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the deletion request for its type, and answers SAP's result. object_type required: ${named(COMPACT_DELETE[variant], DELETE_TOKENS)}. CDS_UNIT_TEST deletes its test class. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS and LOCAL_MACROS (the class's local includes) and UNIT_TEST (its test classes include) the include is written empty under lock_handle, the class's lock handle. transport_request is sent with the request. Over Streamable HTTP an include write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); it is sent only under a lock the instance it reaches holds.`;
}

/** `M(object_name*)` for every member of a lifecycle list. */
function objectNamed<M extends string>(
  members: readonly M[],
  special: Partial<Tokens<M>>,
  rest: string,
): string {
  return members
    .map((member) => special[member] ?? `${member}(${rest})`)
    .join(', ');
}

/** HandlerLock's description on `variant`. */
export function compactLockDescription(variant: ProjectionVariant): string {
  return `Lock operation. object_type required: ${objectNamed(COMPACT_LOCK[variant], { PACKAGE: 'PACKAGE(object_name*, super_package*)' }, 'object_name*')}. Answers the lock_handle; a SERVICE_BINDING open in an editing session answers an empty one, under which its publication runs. Over Streamable HTTP the answer also carries the state_handle of the instance that holds the lock: send it as the state_handle argument of every call under this lock, the write and the unlock (or in the x-mcp-state-handle header).`;
}

/** HandlerUnlock's description on `variant`. */
export function compactUnlockDescription(variant: ProjectionVariant): string {
  return `Unlock operation. object_type required: ${objectNamed(COMPACT_UNLOCK[variant], {}, 'object_name*, lock_handle*')}; an empty lock_handle of a SERVICE_BINDING answers that the binding is already unlocked. Over Streamable HTTP the unlock takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); the unlock ends the instance's hold on the lock.`;
}

/** HandlerValidate's description on `variant`. */
export function compactValidateDescription(variant: ProjectionVariant): string {
  return `[read-only] Validates a new object named by object_type and object_name before it is created. object_type required: ${objectNamed(
    COMPACT_VALIDATE[variant],
    {
      CLASS: 'CLASS(object_name*, superclass)',
      FUNCTION_MODULE: 'FUNCTION_MODULE(object_name* as GROUP|MODULE)',
      PACKAGE: 'PACKAGE(object_name*, super_package)',
      BEHAVIOR_DEFINITION:
        'BEHAVIOR_DEFINITION(object_name*, package_name*, description*, root_entity*, implementation_type*)',
      BEHAVIOR_IMPLEMENTATION:
        'BEHAVIOR_IMPLEMENTATION(object_name*, package_name*, behavior_definition)',
      METADATA_EXTENSION:
        'METADATA_EXTENSION(object_name*, description*, package_name*)',
      SERVICE_BINDING:
        'SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*, package_name*)',
    },
    'object_name*',
  )}.`;
}

/** HandlerCheckRun's description on `variant`. */
export function compactCheckRunDescription(variant: ProjectionVariant): string {
  return `[read-only] Runs a syntax check on the object named by object_type and object_name. object_type required: ${objectNamed(
    COMPACT_CHECK[variant],
    { FUNCTION_MODULE: 'FUNCTION_MODULE(object_name* as GROUP|MODULE)' },
    'object_name*',
  )}. source_code checks unsaved source given in the call, for CLASS, STRUCTURE and DDL.`;
}

/** HandlerDeletionCheck's description on `variant`. */
export function compactDeletionCheckDescription(
  variant: ProjectionVariant,
): string {
  const members = COMPACT_DELETION_CHECK[variant].map((member) =>
    member === 'CDS_UNIT_TEST'
      ? 'CDS_UNIT_TEST (its test class)'
      : member === 'FUNCTION_MODULE'
        ? 'FUNCTION_MODULE (object_name GROUP|MODULE)'
        : member,
  );
  return `[read-only] Asks SAP whether the object named by object_type and object_name can be deleted: sends the deletion check request for its type, and answers SAP's verdict as it came: deletable true with the object and SAP's message when it carries one, or SAP's refusal with its words. object_type and object_name required: ${members.join(', ')}.`;
}

/** HandlerActivate's description on `variant`. */
export function compactActivateDescription(variant: ProjectionVariant): string {
  const byName = COMPACT_ACTIVATE[variant].filter(
    (member) => member !== 'FUNCTION_MODULE',
  );
  return `Activates the object named by object_name and object_type (or object_adt_type), or the objects named by objects, in one request. Single form (object_name*, object_type or object_adt_type*): object_type is enough for ${listed(byName)}; FUNCTION_MODULE(object_name* as GROUP|MODULE, or object_name* with function_group_name*) is activated under its function group; any other type takes object_adt_type (e.g. "CLAS/OC"). List form (objects[].name*, objects[].type*, objects[].parentName, objects[].uri); a function module is listed with objects[].parentName set to its function group, type FUGR/FF. One object of ${either(COMPACT_SINGLE_ACTIVATION[variant])} (by object_type or its ADT type code) is activated directly and answers the activation verdict. Every other call starts an activation run and answers { run_id }: the id of the accepted run, whose status and messages are read by that id.`;
}

/** HandlerProfileRun's description on `variant`. */
export function compactProfileRunDescription(
  variant: ProjectionVariant,
): string {
  const members = COMPACT_PROFILE[variant];
  const names = members.map((member) =>
    member === 'CLASS' ? 'class_name* for CLASS' : 'program_name* for PROGRAM',
  );
  return `Runs ${either(
    members.map((member) => (member === 'CLASS' ? 'a class' : 'a program')),
  )} in one request. Required: target_type*(${members.join('|')}) + ${either(names)}. Optional: profiler_id (the profiler id of a scheduled trace; given, the run goes under that trace; absent, the run is plain), background. Response: JSON { success, class_name | program_name, output }, plus profile: { profiler_id } for a run under a trace.`;
}

const WHERE_USED_WORDS: Tokens<(typeof COMPACT_WHERE_USED.onprem)[number]> = {
  CLASS: 'class',
  INTERFACE: 'interface',
  PROGRAM: 'program',
  INCLUDE: 'include',
  FUNCTION_GROUP: 'function group',
  FUNCTION_MODULE: 'function module (BAPI included)',
  PACKAGE: 'package',
  TABLE: 'table',
  STRUCTURE: 'structure',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'data element',
  DDL: 'CDS DDL source',
};

/** HandlerWhereUsed's description on `variant`. */
export function compactWhereUsedDescription(
  variant: ProjectionVariant,
): string {
  const kinds = COMPACT_WHERE_USED[variant].map(
    (member) => WHERE_USED_WORDS[member],
  );
  return withLongToolAdvice(
    `[read-only] Lists where the object named by object_type and object_name is used — a ${either(kinds)}: the objects that use, call or reference it, with type and package. Required: object_type*, object_name*. Optional: function_group_name (FUNCTION_MODULE), max_results (default 100). Response: JSON.`,
  );
}

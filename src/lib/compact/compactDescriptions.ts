/**
 * The descriptions of the compact tools whose `object_type` (or
 * `target_type`) picks the object, written from the members a variant serves
 * (`adtProjections.ts`): each member is named with the arguments it takes,
 * and a member the variant does not serve is not named.
 */
import {
  ACTIVATION_CODES,
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
  type ProjectionVariant,
} from '../adtProjections';
import { parentedCodesOf } from '../adtTypeCode';
import {
  type DescriptionParts,
  membersTaken,
  purpose,
  resultReturns,
  toolDescription,
  underLock,
} from '../description/index';
import {
  DELETED,
  HELD_LOCK,
  PUBLISHED,
  UNLOCKED,
  WRITTEN,
  WRITTEN_UNDER_LOCK,
} from '../description/results';
import { CLASS_RUN, PROGRAM_RUN } from '../description/runs';
import { TRANSPORT_CREATED } from '../description/sessions';
import { draftPartWords, HANDLER_GET_DRAFT_TYPES } from '../draft/draftTypes';
import { withLongToolAdvice } from '../longTools';
import {
  either,
  exampleCodes,
  type Left,
  leftOf,
  listed,
  when,
} from './memberTexts';

/** Each member as the description names it, with the arguments it takes. */
type Tokens<M extends string> = { readonly [K in M]: string };

/** The members, each as `token` names it, joined by commas. */
function named<M extends string>(
  members: readonly M[],
  token: (member: M) => string,
): string {
  return members.map(token).join(', ');
}

type CreateMember = (typeof COMPACT_CREATE.onprem)[number];

const CREATE_TOKENS: Tokens<CreateMember> = {
  PACKAGE: 'PACKAGE(package_name*, super_package)',
  DOMAIN: 'DOMAIN(domain_name*, package_name*)',
  DATA_ELEMENT: 'DATA_ELEMENT(data_element_name*, package_name*)',
  TRANSPORT: 'TRANSPORT(description*)',
  TABLE: 'TABLE(table_name*, package_name*)',
  STRUCTURE: 'STRUCTURE(structure_name*, package_name*)',
  TABLE_TYPE: 'TABLE_TYPE(table_type_name*, package_name*)',
  DDL: 'DDL(ddl_name*, package_name*)',
  SERVICE_DEFINITION:
    'SERVICE_DEFINITION(service_definition_name*, package_name*)',
  SERVICE_BINDING:
    'SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*)',
  CLASS: 'CLASS(class_name*, package_name*)',
  PROGRAM: 'PROGRAM(program_name*, package_name*)',
  INCLUDE: 'INCLUDE(include_name*, package_name*)',
  INTERFACE: 'INTERFACE(interface_name*, package_name*)',
  FUNCTION_GROUP: 'FUNCTION_GROUP(function_group_name*, package_name*)',
  FUNCTION_MODULE:
    'FUNCTION_MODULE(function_module_name*, function_group_name*)',
  BEHAVIOR_DEFINITION:
    'BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*)',
  BEHAVIOR_IMPLEMENTATION:
    'BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*)',
  METADATA_EXTENSION: 'METADATA_EXTENSION(name*, package_name*)',
};

/** A HandlerCreate member with the arguments it takes, as the description names it. */
export function createToken(member: CreateMember): string {
  return CREATE_TOKENS[member];
}

/** HandlerCreate's parts on `variant`, naming `members` (default: all the variant's). */
export function compactCreateParts(
  variant: ProjectionVariant,
  members: readonly CreateMember[] = COMPACT_CREATE[variant],
): DescriptionParts {
  const transport = members.includes('TRANSPORT');
  return {
    purpose: purpose(
      `Creates the ABAP repository object of the type object_type names, inactive${when(transport, ', or a transport')}.`,
    ),
    returns: [
      ...resultReturns(WRITTEN),
      ...(transport ? resultReturns(TRANSPORT_CREATED, 'for TRANSPORT:') : []),
    ],
    members: membersTaken('object_type', members.map(createToken)),
  };
}

/** HandlerCreate's description on `variant`, naming `members` (default: all the variant's). */
export function compactCreateDescription(
  variant: ProjectionVariant,
  members: readonly CreateMember[] = COMPACT_CREATE[variant],
): string {
  return toolDescription(compactCreateParts(variant, members));
}

type ReadMember = (typeof COMPACT_READ.onprem)[number];

const READ_TOKENS: Tokens<ReadMember> = {
  PACKAGE:
    'PACKAGE(package_name*; part contents: package_name* or package_names*)',
  DOMAIN: 'DOMAIN(domain_name*)',
  DATA_ELEMENT: 'DATA_ELEMENT(data_element_name*)',
  TABLE: 'TABLE(table_name*)',
  STRUCTURE: 'STRUCTURE(structure_name*)',
  TABLE_TYPE: 'TABLE_TYPE(table_type_name*)',
  DDL: 'DDL(ddl_name*)',
  SERVICE_DEFINITION: 'SERVICE_DEFINITION(service_definition_name*)',
  SERVICE_BINDING: 'SERVICE_BINDING(service_binding_name*)',
  CLASS: 'CLASS(class_name*)',
  LOCAL_TEST_CLASS: 'LOCAL_TEST_CLASS(class_name*)',
  LOCAL_TYPES: 'LOCAL_TYPES(class_name*)',
  LOCAL_DEFINITIONS: 'LOCAL_DEFINITIONS(class_name*)',
  LOCAL_MACROS: 'LOCAL_MACROS(class_name*)',
  PROGRAM: 'PROGRAM(program_name*)',
  INCLUDE: 'INCLUDE(include_name*)',
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
  TABLE_SETTINGS: 'TABLE_SETTINGS(table_name*)',
  PROGRAM_TEXT_ELEMENTS: 'PROGRAM_TEXT_ELEMENTS(program_name*)',
  FUNCTION_GROUP_TEXT_ELEMENTS:
    'FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*)',
  CLASS_TEXT_ELEMENTS: 'CLASS_TEXT_ELEMENTS(class_name*)',
};

/** A HandlerGet member with the arguments it takes, as the description names it. */
export function readToken(member: ReadMember): string {
  return READ_TOKENS[member];
}

/** The parts each kind of type has, the kinds whose members are all removed left out. */
const PARTS_PER_TYPE: ReadonlyArray<readonly [readonly ReadMember[], string]> =
  [
    [['PACKAGE'], 'metadata, contents'],
    [['DOMAIN', 'DATA_ELEMENT', 'FUNCTION_GROUP', 'TABLE_TYPE'], 'metadata'],
    [
      [
        'LOCAL_TEST_CLASS',
        'LOCAL_TYPES',
        'LOCAL_DEFINITIONS',
        'LOCAL_MACROS',
        'UNIT_TEST',
        'CDS_UNIT_TEST',
      ],
      'source',
    ],
    [['TRANSPORT'], 'source, metadata'],
    [['SERVICE_BINDING'], 'source, metadata, urls'],
    [['TABLE_SETTINGS'], 'source (the technical settings, in one request)'],
    [['CLASS_TEXT_ELEMENTS'], 'source (the text symbols, in one request)'],
    [
      ['PROGRAM_TEXT_ELEMENTS', 'FUNCTION_GROUP_TEXT_ELEMENTS'],
      'source (symbols, selections and headings, one request each)',
    ],
  ];

function partsPerType(left: Left): string {
  return PARTS_PER_TYPE.map(
    ([types, parts]) => [left.of(types), parts] as const,
  )
    .filter(([types]) => types.length > 0)
    .map(([types, parts]) => `${types.join(', ')} ${parts}; `)
    .join('');
}

/** The sentence on `part: 'draft'`, for the draft types left. */
function draftPart(variant: ProjectionVariant, left: Left): string {
  const types = left.of(HANDLER_GET_DRAFT_TYPES[variant]);
  if (types.length === 0) return '';
  const timeless = left.of<ReadMember>([
    'METADATA_EXTENSION',
    'SERVICE_DEFINITION',
  ]);
  return ` draft (${listed(types)}) reads the active, inactive and working versions of each part of the object together (${draftPartWords(variant, types)}) and answers { object_type, object_name, has_draft, parts }: per part draft states whose unactivated change it holds — own (the caller's), other (another user's), undetermined (its three ETags in another pattern), and the active state when its versions are equal — with changed_at (the change's last write, UTC) and age_seconds by the server's clock for own and other${when(timeless.length > 0, ` (null for ${listed(timeless)}, whose ETag carries a constant time)`)}, and the three ETags (active, inactive, workspace); has_draft is true when any part holds a change of a user's.`;
}

/** The sentence on reading a unit-test run's result, for the run types left. */
function unitTestRuns(left: Left): string {
  const runs = left.of<ReadMember>(['UNIT_TEST', 'CDS_UNIT_TEST']);
  if (runs.length === 0) return '';
  const [read, answer] =
    runs.length === 1 ? ['reads', 'answers'] : ['read', 'answer'];
  return ` ${listed(runs)} ${read} the run's result in one request and ${answer} { success, run_id, run_result }, run_result the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime.`;
}

/** HandlerGet's description on `variant`, naming `members` (default: all the variant's). */
export function compactGetDescription(
  variant: ProjectionVariant,
  members: readonly ReadMember[] = COMPACT_READ[variant],
): string {
  const left = leftOf(COMPACT_READ[variant], members);
  return withLongToolAdvice(
    `[read-only] Reads one part of the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …). part selects it: source (default) the source alone, in one request; metadata the ADT metadata document alone, in one request; urls${when(left.has('SERVICE_BINDING'), ' (SERVICE_BINDING)')} the service URL, its $metadata and the browser preview, contents${when(left.has('PACKAGE'), ' (PACKAGE)')} the objects the package holds, its walk read level by level in ADT batch envelopes${when(left.has('PACKAGE'), '; package_names lists several packages, read together, one entry per package in the order given')}. A source document answers { part: 'source', source } and a metadata document { part: 'metadata', metadata }, beside the object's name. Parts per type: ${partsPerType(left)}every other type source, metadata. A part outside the type's list is answered with that list. Three parts read the repository by ADT address: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions; one node level; a package's blank answer is the empty listing with blank stating its two readings: an empty package, or an unknown package name) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by its id, in one request each: activation_status(run_id*) answers { run_id, part, status, document }, the run's status (finished, error, failed, or its progress while it runs) and its status document as SAP answered it; activation_results(run_id*) answers { run_id, part, activated, messages, document }: activated is SAP's verdict as the results state it: true where they say activationExecuted="true" and every message is below error severity, false where they say activationExecuted="false" (a run SAP cancelled, or one whose message list is empty) or carry an error-severity message, null where they leave activationExecuted out; beside the messages the run produced and its results document as SAP answered it. ${when(members.length > 0, `Otherwise object_type required: ${named(members, readToken)}.`)}${when(left.has('TRANSPORT'), " TRANSPORT answers the objects a task holds, each with its position in the task's object list; for a request, every task's entries, each once, with its task number and position. TRANSPORT with part metadata reads the request or task itself, kind saying which: a request's header and its tasks with their object counts; a task's header, its parent request and its objects with their positions.")}${unitTestRuns(left)}${draftPart(variant, left)}`,
  );
}

type UpdateMember = (typeof COMPACT_UPDATE.onprem)[number];

const UPDATE_TOKENS: Tokens<UpdateMember> = {
  PACKAGE: 'PACKAGE(package_name*, source_code*, transport_request)',
  DOMAIN: 'DOMAIN(domain_name*, source_code*, transport_request)',
  DATA_ELEMENT:
    'DATA_ELEMENT(data_element_name*, source_code*, transport_request)',
  TABLE_TYPE: 'TABLE_TYPE(table_type_name*, source_code*, transport_request)',
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
  INCLUDE: 'INCLUDE(include_name*, source_code*, part, transport_request)',
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
  TABLE_SETTINGS:
    'TABLE_SETTINGS(table_name*, data_class, size_category, buffering, storage_type, sharing_type, load_unit, translation, logging_enabled, is_writable_by_amdp, transport_request)',
  PROGRAM_TEXT_ELEMENTS:
    'PROGRAM_TEXT_ELEMENTS(program_name*, symbols, selections, headings, transport_request)',
  FUNCTION_GROUP_TEXT_ELEMENTS:
    'FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*, symbols, selections, headings, transport_request)',
  CLASS_TEXT_ELEMENTS:
    'CLASS_TEXT_ELEMENTS(class_name*, symbols, transport_request)',
};

/** A HandlerUpdate member with the arguments it takes, as the description names it. */
export function updateToken(member: UpdateMember): string {
  return UPDATE_TOKENS[member];
}

/** HandlerUpdate's parts on `variant`, naming `members` (default: all the variant's). */
export function compactUpdateParts(
  variant: ProjectionVariant,
  members: readonly UpdateMember[] = COMPACT_UPDATE[variant],
): DescriptionParts {
  return {
    purpose: purpose(
      'Writes the whole content of the ABAP repository object of the type object_type names, under the lock its lock handle names.',
    ),
    returns: [
      ...resultReturns(WRITTEN_UNDER_LOCK),
      ...(members.includes('SERVICE_BINDING')
        ? resultReturns(PUBLISHED, 'for SERVICE_BINDING:')
        : []),
    ],
    members: membersTaken('object_type', members.map(updateToken)),
    notes: [underLock],
  };
}

/** HandlerUpdate's description on `variant`, naming `members` (default: all the variant's). */
export function compactUpdateDescription(
  variant: ProjectionVariant,
  members: readonly UpdateMember[] = COMPACT_UPDATE[variant],
): string {
  return toolDescription(compactUpdateParts(variant, members));
}

type DeleteMember = (typeof COMPACT_DELETE.onprem)[number];

const DELETE_TOKENS: Tokens<DeleteMember> = {
  PACKAGE: 'PACKAGE(package_name*, transport_request)',
  DOMAIN: 'DOMAIN(domain_name*, transport_request)',
  DATA_ELEMENT: 'DATA_ELEMENT(data_element_name*, transport_request)',
  TABLE: 'TABLE(table_name*, transport_request)',
  STRUCTURE: 'STRUCTURE(structure_name*, transport_request)',
  TABLE_TYPE: 'TABLE_TYPE(table_type_name*, transport_request)',
  DDL: 'DDL(ddl_name*, transport_request)',
  SERVICE_DEFINITION:
    'SERVICE_DEFINITION(service_definition_name*, transport_request)',
  SERVICE_BINDING: 'SERVICE_BINDING(service_binding_name*, transport_request)',
  CLASS: 'CLASS(class_name*, transport_request)',
  CDS_UNIT_TEST: 'CDS_UNIT_TEST(class_name*, transport_request)',
  PROGRAM: 'PROGRAM(program_name*, transport_request)',
  INCLUDE: 'INCLUDE(include_name*, transport_request)',
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

/** A HandlerDelete member with the arguments it takes, as the description names it. */
export function deleteToken(member: DeleteMember): string {
  return DELETE_TOKENS[member];
}

/** HandlerDelete's parts on `variant`, naming `members` (default: all the variant's). */
export function compactDeleteParts(
  variant: ProjectionVariant,
  members: readonly DeleteMember[] = COMPACT_DELETE[variant],
): DescriptionParts {
  const includes = leftOf(COMPACT_DELETE[variant], members).of<DeleteMember>([
    'LOCAL_TEST_CLASS',
    'LOCAL_TYPES',
    'LOCAL_DEFINITIONS',
    'LOCAL_MACROS',
    'UNIT_TEST',
  ]);
  return {
    purpose: purpose(
      `Deletes the ABAP repository object of the type object_type names${when(includes.length > 0, ", or empties a class include under the class's lock")}.`,
    ),
    returns: resultReturns(DELETED),
    members: membersTaken('object_type', members.map(deleteToken)),
    notes: [underLock],
  };
}

/** HandlerDelete's description on `variant`, naming `members` (default: all the variant's). */
export function compactDeleteDescription(
  variant: ProjectionVariant,
  members: readonly DeleteMember[] = COMPACT_DELETE[variant],
): string {
  return toolDescription(compactDeleteParts(variant, members));
}

/** `M(rest)` for a member of a lifecycle list, unless `special` names it otherwise. */
function objectNamed<M extends string>(
  member: M,
  special: Partial<Tokens<M>>,
  rest: string,
): string {
  return special[member] ?? `${member}(${rest})`;
}

type LockMember = (typeof COMPACT_LOCK.onprem)[number];

/** A HandlerLock member with the arguments it takes, as the description names it. */
export function lockToken(member: LockMember): string {
  return objectNamed<LockMember>(
    member,
    { PACKAGE: 'PACKAGE(object_name*, super_package)' },
    'object_name*',
  );
}

/** HandlerLock's parts on `variant`, naming `members` (default: all the variant's). */
export function compactLockParts(
  variant: ProjectionVariant,
  members: readonly LockMember[] = COMPACT_LOCK[variant],
): DescriptionParts {
  return {
    purpose: purpose(
      'Locks the ABAP repository object of the type object_type names on the server instance that then holds the lock for its write, delete and unlock.',
    ),
    returns: resultReturns(HELD_LOCK),
    members: membersTaken('object_type', members.map(lockToken)),
  };
}

/** HandlerLock's description on `variant`, naming `members` (default: all the variant's). */
export function compactLockDescription(
  variant: ProjectionVariant,
  members: readonly LockMember[] = COMPACT_LOCK[variant],
): string {
  return toolDescription(compactLockParts(variant, members));
}

type UnlockMember = (typeof COMPACT_UNLOCK.onprem)[number];

/** A HandlerUnlock member with the arguments it takes, as the description names it. */
export function unlockToken(member: UnlockMember): string {
  return objectNamed<UnlockMember>(member, {}, 'object_name*, lock_handle*');
}

/** HandlerUnlock's parts on `variant`, naming `members` (default: all the variant's). */
export function compactUnlockParts(
  variant: ProjectionVariant,
  members: readonly UnlockMember[] = COMPACT_UNLOCK[variant],
): DescriptionParts {
  return {
    purpose: purpose(
      'Releases the lock this server instance holds on the ABAP repository object of the type object_type names, under its lock handle.',
    ),
    returns: resultReturns(UNLOCKED),
    members: membersTaken('object_type', members.map(unlockToken)),
    notes: [underLock],
  };
}

/** HandlerUnlock's description on `variant`, naming `members` (default: all the variant's). */
export function compactUnlockDescription(
  variant: ProjectionVariant,
  members: readonly UnlockMember[] = COMPACT_UNLOCK[variant],
): string {
  return toolDescription(compactUnlockParts(variant, members));
}

type ValidateMember = (typeof COMPACT_VALIDATE.onprem)[number];

/** A HandlerValidate member with the arguments it takes, as the description names it. */
function validateToken(member: ValidateMember): string {
  return objectNamed<ValidateMember>(
    member,
    {
      CLASS: 'CLASS(object_name*, superclass)',
      PROGRAM: 'PROGRAM(object_name*, package_name*)',
      INCLUDE: 'INCLUDE(object_name*, package_name*)',
      TABLE_TYPE: 'TABLE_TYPE(object_name*, description)',
      FUNCTION_MODULE:
        'FUNCTION_MODULE(object_name* as GROUP|MODULE, description*)',
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
  );
}

/** HandlerValidate's description on `variant`, naming `members` (default: all the variant's). */
export function compactValidateDescription(
  variant: ProjectionVariant,
  members: readonly ValidateMember[] = COMPACT_VALIDATE[variant],
): string {
  const left = leftOf(COMPACT_VALIDATE[variant], members);
  return `[read-only] Validates a new object named by object_type and object_name before it is created. object_type required: ${named(members, validateToken)}.${when(left.has('SERVICE_BINDING'), " For SERVICE_BINDING the answer is the verdict of SAP's transport check for the binding's name and package: admissible true where SAP answers S, false where it answers E, each with SAP's messages, and any other value as result; creating the binding checks the name, the package and the service definition itself.")}`;
}

type CheckMember = (typeof COMPACT_CHECK.onprem)[number];

/** A HandlerCheckRun member with the arguments it takes, as the description names it. */
export function checkToken(member: CheckMember): string {
  return objectNamed<CheckMember>(
    member,
    { FUNCTION_MODULE: 'FUNCTION_MODULE(object_name* as GROUP|MODULE)' },
    'object_name*',
  );
}

/** HandlerCheckRun's description on `variant`, naming `members` (default: all the variant's). */
export function compactCheckRunDescription(
  variant: ProjectionVariant,
  members: readonly CheckMember[] = COMPACT_CHECK[variant],
): string {
  const unsaved = leftOf(COMPACT_CHECK[variant], members).of<CheckMember>([
    'CLASS',
    'STRUCTURE',
    'DDL',
  ]);
  return `[read-only] Runs a syntax check on the object named by object_type and object_name. object_type required: ${named(members, checkToken)}.${when(unsaved.length > 0, ` source_code checks unsaved source given in the call, for ${listed(unsaved)}.`)}`;
}

type DeletionCheckMember = (typeof COMPACT_DELETION_CHECK.onprem)[number];

/** HandlerDeletionCheck's description on `variant`, naming `given` (default: all the variant's). */
export function compactDeletionCheckDescription(
  variant: ProjectionVariant,
  given: readonly DeletionCheckMember[] = COMPACT_DELETION_CHECK[variant],
): string {
  const members = given.map((member) =>
    member === 'CDS_UNIT_TEST'
      ? 'CDS_UNIT_TEST (its test class)'
      : member === 'FUNCTION_MODULE'
        ? 'FUNCTION_MODULE (object_name GROUP|MODULE)'
        : member,
  );
  return `[read-only] Asks SAP whether the object named by object_type and object_name can be deleted: sends the deletion check request for its type, and answers SAP's verdict as it came: deletable true with the object and SAP's message when it carries one, or SAP's refusal with its words. object_type and object_name required: ${members.join(', ')}.`;
}

type ActivateMember = (typeof COMPACT_ACTIVATE.onprem)[number];
type ActivationCode = (typeof ACTIVATION_CODES.onprem)[number];

/**
 * A HandlerActivate member as the description's single form names it: the type
 * alone where object_type is enough, FUNCTION_MODULE with the arguments that
 * name it under its function group.
 */
export function activateToken(member: ActivateMember): string {
  return member === 'FUNCTION_MODULE'
    ? 'FUNCTION_MODULE(object_name* as GROUP|MODULE, or object_name* with function_group_name*)'
    : member;
}

/** The code HandlerActivate's description names as its example. */
const ACTIVATE_EXAMPLE: readonly ActivationCode[] = ['CLAS/OC'];

/**
 * HandlerActivate's description on `variant`, naming `members` and `codes`
 * (default: all the variant's).
 */
export function compactActivateDescription(
  variant: ProjectionVariant,
  members: readonly ActivateMember[] = COMPACT_ACTIVATE[variant],
  codes: readonly ActivationCode[] = ACTIVATION_CODES[variant],
): string {
  const left = leftOf(COMPACT_ACTIVATE[variant], members);
  const byName = members
    .filter((member) => member !== 'FUNCTION_MODULE')
    .map(activateToken);
  const example = exampleCodes(ACTIVATE_EXAMPLE, codes, 1)
    .map((code) => `"${code}"`)
    .join(', ');
  return `Activates the object named by object_name and object_type (or object_adt_type), or the objects named by objects, in one request. Single form (object_name*, object_type or object_adt_type*): ${when(byName.length > 0, `object_type is enough for ${listed(byName)}; `)}${when(left.has('FUNCTION_MODULE'), `${activateToken('FUNCTION_MODULE')} is activated under its function group; `)}any other type takes object_adt_type (e.g. ${example}), with parentName for a part of a function group (${parentedCodesOf(codes).join(', ')}). List form (objects[].name*, objects[].type*, objects[].parentName, objects[].uri); an object of ${parentedCodesOf(codes).join(', ')} is listed with objects[].parentName set to its function group. One object of ${either(left.of(COMPACT_SINGLE_ACTIVATION[variant]))} (by object_type or its ADT type code) is activated directly and answers the activation verdict. Every other call starts an activation run and answers { run_id }: the id of the accepted run, whose status and messages are read by that id. Where the system's discovery leaves out the activation runs (SAP_BASIS 751, 7.40), that call answers SAP's refusal; a group activation there is ActivateObjects (the full set) or ActivateObjectLow (the low handlers group).`;
}

/** What each HandlerProfileRun member runs, by its function: the full run tool's result. */
const PROFILE_RUNS = {
  CLASS: {
    value: 'CLASS',
    purpose: purpose(
      'Runs an ABAP class implementing if_oo_adt_classrun and gives its console output.',
    ),
    returns: resultReturns(CLASS_RUN),
  },
  PROGRAM: {
    value: 'PROGRAM',
    purpose: purpose('Runs an ABAP report and gives its output.'),
    returns: resultReturns(PROGRAM_RUN),
  },
} as const;

/** HandlerProfileRun's parts on `variant`, naming `members` (default: all the variant's). */
export function compactProfileRunParts(
  variant: ProjectionVariant,
  members: readonly (typeof COMPACT_PROFILE.onprem)[number][] = COMPACT_PROFILE[
    variant
  ],
): DescriptionParts {
  return {
    purpose: purpose(
      `Runs ${either(members.map((member) => (member === 'CLASS' ? 'an ABAP class' : 'an ABAP report')))}, under a scheduled profiler trace when its profiler id is given.`,
    ),
    returns: [],
    values: {
      of: 'target_type',
      each: members.map((member) => PROFILE_RUNS[member]),
    },
  };
}

/** HandlerProfileRun's description on `variant`. */
export function compactProfileRunDescription(
  variant: ProjectionVariant,
  members: readonly (typeof COMPACT_PROFILE.onprem)[number][] = COMPACT_PROFILE[
    variant
  ],
): string {
  return toolDescription(compactProfileRunParts(variant, members));
}

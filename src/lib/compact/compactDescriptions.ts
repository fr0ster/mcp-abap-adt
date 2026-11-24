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
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  type ProjectionVariant,
} from '../adtProjections';
import {
  type DescriptionParts,
  longRunning,
  pairsPurpose,
  stateHandleAnswered,
  toolDescription,
  underLock,
  withArticle,
} from '../description/index';
import type { CompactObjectType } from './compactObjectTypes';
import { leftOf } from './memberTexts';

/** Each member as the description names it, with the arguments it takes. */
type Tokens<M extends string> = { readonly [K in M]: string };

/** Each object type in words, as a purpose names it. */
const TYPE_WORDS: { readonly [K in CompactObjectType]: string } = {
  PACKAGE: 'package',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'data element',
  TRANSPORT: 'transport',
  TABLE: 'table',
  STRUCTURE: 'structure',
  TABLE_TYPE: 'table type',
  DDL: 'CDS view',
  SERVICE_DEFINITION: 'service definition',
  SERVICE_BINDING: 'service binding',
  CLASS: 'class',
  UNIT_TEST: 'the unit tests of a class',
  CDS_UNIT_TEST: 'the unit tests of a CDS view',
  LOCAL_TEST_CLASS: 'the local test classes of a class',
  LOCAL_TYPES: 'the local types of a class',
  LOCAL_DEFINITIONS: 'the local definitions of a class',
  LOCAL_MACROS: 'the local macros of a class',
  PROGRAM: 'program',
  INCLUDE: 'include',
  INTERFACE: 'interface',
  FUNCTION_GROUP: 'function group',
  FUNCTION_MODULE: 'function module',
  BEHAVIOR_DEFINITION: 'behavior definition',
  BEHAVIOR_IMPLEMENTATION: 'behavior implementation',
  METADATA_EXTENSION: 'metadata extension',
  RUNTIME_PROFILE: 'profiler trace',
  RUNTIME_DUMP: 'short dump',
  PROGRAM_TEXT_ELEMENTS: 'the text elements of a program',
  FUNCTION_GROUP_TEXT_ELEMENTS: 'the text elements of a function group',
  CLASS_TEXT_ELEMENTS: 'the text elements of a class',
  TABLE_SETTINGS: 'the technical settings of a table',
};

/** One pair per object type: `verb` and the type in words, with its article. */
function pairsOf(
  verb: string,
  members: readonly CompactObjectType[],
): string[] {
  return typeWords(members).map((type) => `${verb} ${withArticle(type)}`);
}

/** The object types `members` names, in words, each once. */
function typeWords(members: readonly CompactObjectType[]): string[] {
  return [...new Set(members.map((member) => TYPE_WORDS[member]))];
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
  return {
    purpose: pairsPurpose(pairsOf('creates', members)),
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

/** The members whose word names a part of an object: read as it is, not by its source. */
const PART_WORDS: readonly ReadMember[] = [
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'TABLE_SETTINGS',
  'PROGRAM_TEXT_ELEMENTS',
  'FUNCTION_GROUP_TEXT_ELEMENTS',
  'CLASS_TEXT_ELEMENTS',
];

/** The members whose one part is their metadata. */
const METADATA_ONLY: readonly ReadMember[] = [
  'DOMAIN',
  'DATA_ELEMENT',
  'FUNCTION_GROUP',
  'TABLE_TYPE',
];

/** What HandlerGet reads of `member`, one pair per part it offers. */
function readPairs(member: ReadMember): string[] {
  const word = TYPE_WORDS[member];
  const of = (part: string) => `reads the ${part} of ${withArticle(word)}`;
  switch (member) {
    case 'PACKAGE':
      return [of('metadata'), of('contents')];
    case 'TRANSPORT':
      return [of('objects'), of('header')];
    case 'SERVICE_BINDING':
      return [of('source code'), of('metadata'), of('URLs')];
    case 'UNIT_TEST':
      return ["reads an ABAP Unit run's result"];
    case 'CDS_UNIT_TEST':
      return ["reads a CDS unit test run's result"];
    default:
      if (PART_WORDS.includes(member)) return [`reads ${withArticle(word)}`];
      if (METADATA_ONLY.includes(member)) return [of('metadata')];
      return [of('source code'), of('metadata')];
  }
}

/** The members left on `variant`. */
function left(variant: ProjectionVariant, members: readonly ReadMember[]) {
  return leftOf(COMPACT_READ[variant], members);
}

/** HandlerGet's parts on `variant`: one pair per object type and part it reads. */
export function compactGetParts(
  variant: ProjectionVariant,
  members: readonly ReadMember[] = COMPACT_READ[variant],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: pairsPurpose([
      ...members.flatMap(readPairs),
      ...(variant === 'onprem' && left(variant, members).has('INCLUDE')
        ? ['reads the main programs of an include']
        : []),
      "reads a repository object's unactivated change",
      "reads a repository object's structure",
      'reads a repository browser node',
      'reads virtual folders',
      "reads an activation run's status",
      "reads an activation run's results",
    ]),
    notes: [longRunning],
  };
}

/** HandlerGet's description on `variant`, naming `members` (default: all the variant's). */
export function compactGetDescription(
  variant: ProjectionVariant,
  members: readonly ReadMember[] = COMPACT_READ[variant],
): string {
  return toolDescription(compactGetParts(variant, members));
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
    purpose: pairsPurpose(pairsOf('updates', members)),
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
  return {
    purpose: pairsPurpose(pairsOf('deletes', members)),
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

/** A HandlerLock member with the arguments it takes, as the member table names it. */
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
    purpose: pairsPurpose(
      pairsOf('locks or unlocks', members),
      ' for editing.',
    ),
    notes: [stateHandleAnswered, underLock],
  };
}

/** HandlerLock's description on `variant`, naming `members` (default: all the variant's). */
export function compactLockDescription(
  variant: ProjectionVariant,
  members: readonly LockMember[] = COMPACT_LOCK[variant],
): string {
  return toolDescription(compactLockParts(variant, members));
}

type ValidateMember = (typeof COMPACT_VALIDATE.onprem)[number];

/** A HandlerValidate member with the arguments it takes. */
export function validateToken(member: ValidateMember): string {
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

/** HandlerValidate's parts on `variant`, naming `members` (default: all the variant's). */
export function compactValidateParts(
  variant: ProjectionVariant,
  members: readonly ValidateMember[] = COMPACT_VALIDATE[variant],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: pairsPurpose(
      typeWords(members).map((type) => `validates the name of a new ${type}`),
    ),
  };
}

/** HandlerValidate's description on `variant`, naming `members` (default: all the variant's). */
export function compactValidateDescription(
  variant: ProjectionVariant,
  members: readonly ValidateMember[] = COMPACT_VALIDATE[variant],
): string {
  return toolDescription(compactValidateParts(variant, members));
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

/** HandlerCheckRun's parts on `variant`, naming `members` (default: all the variant's). */
export function compactCheckRunParts(
  variant: ProjectionVariant,
  members: readonly CheckMember[] = COMPACT_CHECK[variant],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: pairsPurpose(pairsOf('checks the syntax of', members)),
  };
}

/** HandlerCheckRun's description on `variant`, naming `members` (default: all the variant's). */
export function compactCheckRunDescription(
  variant: ProjectionVariant,
  members: readonly CheckMember[] = COMPACT_CHECK[variant],
): string {
  return toolDescription(compactCheckRunParts(variant, members));
}

type DeletionCheckMember = (typeof COMPACT_DELETION_CHECK.onprem)[number];

/** A HandlerDeletionCheck member with what names it. */
export function deletionCheckToken(member: DeletionCheckMember): string {
  return member === 'CDS_UNIT_TEST'
    ? 'CDS_UNIT_TEST (its test class)'
    : member === 'FUNCTION_MODULE'
      ? 'FUNCTION_MODULE (object_name GROUP|MODULE)'
      : member;
}

/** HandlerDeletionCheck's parts on `variant`, naming `given` (default: all the variant's). */
export function compactDeletionCheckParts(
  variant: ProjectionVariant,
  given: readonly DeletionCheckMember[] = COMPACT_DELETION_CHECK[variant],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: pairsPurpose(
      typeWords(given).map(
        (type) => `checks whether ${withArticle(type)} can be deleted`,
      ),
    ),
  };
}

/** HandlerDeletionCheck's description on `variant`, naming `given` (default: all the variant's). */
export function compactDeletionCheckDescription(
  variant: ProjectionVariant,
  given: readonly DeletionCheckMember[] = COMPACT_DELETION_CHECK[variant],
): string {
  return toolDescription(compactDeletionCheckParts(variant, given));
}

type ActivateMember = (typeof COMPACT_ACTIVATE.onprem)[number];

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

/** HandlerActivate's parts on `variant`, naming `members` (default: all the variant's). */
export function compactActivateParts(
  variant: ProjectionVariant,
  members: readonly ActivateMember[] = COMPACT_ACTIVATE[variant],
): DescriptionParts {
  return {
    purpose: pairsPurpose([
      ...pairsOf('activates', members),
      'activates another object by its ADT type',
      'activates several objects together',
    ]),
  };
}

/** HandlerActivate's description on `variant`, naming `members` (default: all the variant's). */
export function compactActivateDescription(
  variant: ProjectionVariant,
  members: readonly ActivateMember[] = COMPACT_ACTIVATE[variant],
): string {
  return toolDescription(compactActivateParts(variant, members));
}

/** HandlerProfileRun's parts on `variant`, naming `members` (default: all the variant's). */
export function compactProfileRunParts(
  variant: ProjectionVariant,
  members: readonly (typeof COMPACT_PROFILE.onprem)[number][] = COMPACT_PROFILE[
    variant
  ],
): DescriptionParts {
  return {
    purpose: pairsPurpose(
      members.map((member) =>
        member === 'CLASS' ? 'runs an ABAP class' : 'runs an ABAP report',
      ),
    ),
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

/** The compact tools whose `object_type` picks the object. */
export const OBJECT_TYPE_TOOLS = [
  'HandlerCreate',
  'HandlerGet',
  'HandlerUpdate',
  'HandlerDelete',
  'HandlerLock',
  'HandlerValidate',
  'HandlerCheckRun',
  'HandlerDeletionCheck',
  'HandlerActivate',
] as const;
export type ObjectTypeTool = (typeof OBJECT_TYPE_TOOLS)[number];

/** Whether `name` is a compact tool whose `object_type` picks the object. */
export function isObjectTypeTool(name: string): name is ObjectTypeTool {
  return OBJECT_TYPE_TOOLS.some((tool) => tool === name);
}

/**
 * The members `tool` takes on `variant`, each with the arguments it needs:
 * `object_type required: A(a*), B(b*).` — the member table the schema
 * serves and the prompts quote; a description names no parameter (owner),
 * so this is the one place the members are written as text.
 */
export function memberTokens(
  tool: ObjectTypeTool,
  variant: ProjectionVariant,
): string {
  const tokens: Record<ObjectTypeTool, () => readonly string[]> = {
    HandlerCreate: () => COMPACT_CREATE[variant].map(createToken),
    HandlerGet: () => COMPACT_READ[variant].map(readToken),
    HandlerUpdate: () => COMPACT_UPDATE[variant].map(updateToken),
    HandlerDelete: () => COMPACT_DELETE[variant].map(deleteToken),
    HandlerLock: () => COMPACT_LOCK[variant].map(lockToken),
    HandlerValidate: () => COMPACT_VALIDATE[variant].map(validateToken),
    HandlerCheckRun: () => COMPACT_CHECK[variant].map(checkToken),
    HandlerDeletionCheck: () =>
      COMPACT_DELETION_CHECK[variant].map(deletionCheckToken),
    HandlerActivate: () => COMPACT_ACTIVATE[variant].map(activateToken),
  };
  return `object_type required: ${tokens[tool]().join(', ')}.`;
}

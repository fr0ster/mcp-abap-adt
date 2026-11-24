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
  COMPACT_UNLOCK,
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  type ProjectionVariant,
} from '../adtProjections';
import {
  type DescriptionParts,
  longRunning,
  membersTaken,
  purpose,
  resultReturns,
  sourceReader,
  toolDescription,
  underLock,
  valueFrom,
  valueParts,
} from '../description/index';
import {
  ACTIVATION_RUN_RESULTS,
  ACTIVATION_RUN_STATUS,
  DELETED,
  DELETION_CHECKED,
  HELD_LOCK,
  PUBLISHED,
  UNLOCKED,
  WRITTEN,
  WRITTEN_UNDER_LOCK,
} from '../description/results';
import { CLASS_RUN, PROGRAM_RUN } from '../description/runs';
import { TRANSPORT_CREATED } from '../description/sessions';
import { HANDLER_GET_DRAFT_TYPES } from '../draft/draftTypes';
import { COMPACT_MAIN_PROGRAMS } from './compactSchemas';
import type { HandlerGetSources } from './handlerGetSources';
import { either, leftOf, when } from './memberTexts';

/** Each member as the description names it, with the arguments it takes. */
type Tokens<M extends string> = { readonly [K in M]: string };

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
    members: membersTaken('object_type required', members.map(createToken)),
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

export type { HandlerGetSources } from './handlerGetSources';

/** The parts HandlerGet reads whatever the members, by their function. */
const ACTIVATION_PARTS = [
  valueParts('activation_status', {
    purpose: purpose('Reads the status of an activation run by its id.'),
    returns: resultReturns(ACTIVATION_RUN_STATUS),
  }),
  valueParts('activation_results', {
    purpose: purpose(
      "Reads the results of an activation run by its id: SAP's verdict and the messages the run produced.",
    ),
    returns: resultReturns(ACTIVATION_RUN_RESULTS),
  }),
] as const;

/**
 * HandlerGet's parts on `variant`, naming `members` (default: all the
 * variant's): each part by its function, a part whose members are all
 * removed left out.
 */
export function compactGetParts(
  variant: ProjectionVariant,
  sources: HandlerGetSources,
  members: readonly ReadMember[] = COMPACT_READ[variant],
): DescriptionParts {
  const left = leftOf(COMPACT_READ[variant], members);
  const mainPrograms = left.of<ReadMember>(COMPACT_MAIN_PROGRAMS[variant]);
  const drafts = left.of(HANDLER_GET_DRAFT_TYPES[variant]);
  return {
    tag: 'read-only',
    purpose: purpose(
      'Reads one part of the ABAP repository object of the type object_type names, of the repository by ADT address, or of an activation run by its id.',
    ),
    returns: [],
    values: {
      of: 'part',
      each: [
        valueParts('source', sourceReader({ object: 'the object' })),
        valueParts('metadata', {
          purpose: purpose(
            'Reads the metadata of the object at the version asked, as its type keeps it.',
          ),
          returns: [],
        }),
        ...(left.has('SERVICE_BINDING')
          ? [valueFrom('urls', sources.urls)]
          : []),
        ...(left.has('PACKAGE')
          ? [valueFrom('contents', sources.contents)]
          : []),
        ...(mainPrograms.length > 0
          ? [valueFrom('main_programs', sources.main_programs)]
          : []),
        ...(drafts.length > 0 ? [valueFrom('draft', sources.draft)] : []),
        valueFrom('object_structure', sources.object_structure),
        valueFrom('node_structure', sources.node_structure),
        valueFrom('virtual_folders', sources.virtual_folders),
        ...ACTIVATION_PARTS,
      ],
    },
    members: membersTaken('object_type required', members.map(readToken)),
    notes: [longRunning],
  };
}

/** HandlerGet's description on `variant`, naming `members` (default: all the variant's). */
export function compactGetDescription(
  variant: ProjectionVariant,
  sources: HandlerGetSources,
  members: readonly ReadMember[] = COMPACT_READ[variant],
): string {
  return toolDescription(compactGetParts(variant, sources, members));
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
    members: membersTaken('object_type required', members.map(updateToken)),
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
    members: membersTaken('object_type required', members.map(deleteToken)),
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
    members: membersTaken('object_type required', members.map(lockToken)),
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
    members: membersTaken('object_type required', members.map(unlockToken)),
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

/** HandlerValidate's parts on `variant`, naming `members` (default: all the variant's). */
export function compactValidateParts(
  variant: ProjectionVariant,
  members: readonly ValidateMember[] = COMPACT_VALIDATE[variant],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(
      'Validates the name of a new ABAP repository object of the type object_type names, before it is created.',
    ),
    returns: [],
    members: membersTaken('object_type required', members.map(validateToken)),
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
  const unsaved = leftOf(COMPACT_CHECK[variant], members).of<CheckMember>([
    'CLASS',
    'STRUCTURE',
    'DDL',
  ]);
  return {
    tag: 'read-only',
    purpose: purpose(
      `Checks the syntax of the ABAP repository object of the type object_type names${when(unsaved.length > 0, ', as stored or as the source given')}.`,
    ),
    returns: [],
    members: membersTaken('object_type required', members.map(checkToken)),
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

/** A HandlerDeletionCheck member as the description names it. */
function deletionCheckToken(member: DeletionCheckMember): string {
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
    purpose: purpose(
      'Asks SAP whether the ABAP repository object of the type object_type names can be deleted.',
    ),
    returns: resultReturns(DELETION_CHECKED),
    members: membersTaken(
      'object_type and object_name required',
      given.map(deletionCheckToken),
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
    purpose: purpose(
      'Activates the ABAP repository object named, by its type or its ADT type, or the objects listed, at once or by an activation run it starts.',
    ),
    returns: [],
    members: membersTaken('object_type', members.map(activateToken)),
  };
}

/** HandlerActivate's description on `variant`, naming `members` (default: all the variant's). */
export function compactActivateDescription(
  variant: ProjectionVariant,
  members: readonly ActivateMember[] = COMPACT_ACTIVATE[variant],
): string {
  return toolDescription(compactActivateParts(variant, members));
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

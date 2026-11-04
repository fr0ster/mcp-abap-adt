import * as z from 'zod';
import { RUN_TARGET_OPTIONAL } from '../../handlers/unit_test/shared/runTarget';
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
  COMPACT_WHERE_USED,
  type ProjectionVariant,
  supported,
} from '../adtProjections';
import { activationParentDescription } from '../adtTypeCode';
import { COMPACT_BACKGROUND_FIELD } from '../backgroundRuns/tools';
import { createArguments } from '../handlers/createArguments';
import { listedValues } from '../handlers/listedValues';
import { READ_VERSION_FIELD } from '../handlers/readVersion';
import { TIMEOUT_DESCRIPTION, TIMEOUT_FIELD } from '../longTools';
import { MASTER_LANGUAGE_DESCRIPTION } from '../masterLanguage';
import { SEARCH_TYPE_DESCRIPTION } from '../searchTypes';
import { DETAIL_SHAPE } from '../strategies/detail';

/**
 * A compact tool's `object_type`: the members it routes on its variant (a
 * projection of `adtProjections.ts`).
 */
const objectTypeOf = <const M extends readonly string[]>(
  members: M,
  description = 'ABAP object type for routed compact operation.',
) => listedValues(members).optional().describe(description);

/**
 * `field` required: its type without the optional wrapper, described as the
 * optional one is — how a field a schema requires was always listed.
 */
function requiredField<T extends z.ZodType>(field: z.ZodOptional<T>): T {
  const words = field.description;
  return words === undefined ? field.unwrap() : field.unwrap().describe(words);
}

/**
 * What one compact tool's calls take: the properties every call reads
 * (`every`), and the ones each member's request reads beside them
 * (`members`; a member reading only `every` has no entry).
 */
interface CompactTakes<P extends string, M extends string> {
  readonly every: readonly P[];
  readonly members: { readonly [K in M]?: readonly P[] };
}

/** The properties `T` names, in `every` or in any member's list. */
type TakenIn<T> = T extends {
  readonly every: readonly (infer E)[];
  readonly members: infer Ms;
}
  ?
      | E
      | {
          [K in keyof Ms]-?: Ms[K] extends readonly (infer X)[] | undefined
            ? X
            : never;
        }[keyof Ms]
  : never;

/** Compiles only when `T` names every property of `P`. */
type EveryPropertyTaken<P, T> = [Exclude<P, TakenIn<T>>] extends [never]
  ? unknown
  : { readonly untaken: Exclude<P, TakenIn<T>> };

/**
 * A tool's takes over its properties `P` and members `M`:
 * `takesOf<Property, Member>()({ every, members })`. A property no list
 * names does not compile, nor a member outside `M`.
 */
function takesOf<P extends string, M extends string>() {
  return <const T extends CompactTakes<P, M>>(
    takes: T & EveryPropertyTaken<P, T>,
  ): T => takes;
}

/**
 * The properties of `properties` some call on `members` takes — in `every`,
 * or in the list of one of `members` — in their declared order, the others
 * left out. Its type names every property: each a tool may leave out is
 * optional, so a schema spreading it types a left-out one as an optional
 * argument no call gives.
 */
function offered<P extends object, M extends string>(
  properties: P,
  takes: CompactTakes<Extract<keyof P, string>, M>,
  members: readonly M[],
): P {
  const taken = new Set<keyof P>([
    ...takes.every,
    ...members.flatMap((member) => takes.members[member] ?? []),
  ]);
  const kept = { ...properties };
  for (const key in kept) {
    if (!taken.has(key)) delete kept[key];
  }
  return kept;
}

/**
 * `HandlerCreate`: one request, the type's create alone (spec §4.6). Only what
 * some type's create sends is named; anything else a caller gives is refused
 * by `handleCreateOnly`, naming it.
 */
const CREATE_PROPERTIES = {
  class_name: z
    .string()
    .optional()
    .describe('ABAP class name (CLASS, BEHAVIOR_IMPLEMENTATION).'),
  behavior_definition: z
    .string()
    .optional()
    .describe(
      'Behavior definition the implementation is for (BEHAVIOR_IMPLEMENTATION, required there).',
    ),
  program_name: z.string().optional().describe('ABAP program name.'),
  domain_name: z.string().optional().describe('ABAP domain name.'),
  function_module_name: z
    .string()
    .optional()
    .describe('ABAP function module name.'),
  function_group_name: z
    .string()
    .optional()
    .describe(
      'ABAP function group name (FUNCTION_GROUP; the group of a FUNCTION_MODULE).',
    ),
  package_name: z.string().optional().describe('ABAP package name.'),
  ddl_name: z
    .string()
    .optional()
    .describe('DDL source name (CDS view, AMDP table function, etc.).'),
  description: z
    .string()
    .optional()
    .describe('Human-readable object description.'),
  transport_request: z
    .string()
    .optional()
    .describe('Transport request id (if required by system).'),
  master_language: z.string().optional().describe(MASTER_LANGUAGE_DESCRIPTION),
  super_package: z
    .string()
    .optional()
    .describe('Super package (PACKAGE create).'),
  package_type: z
    .string()
    .optional()
    .describe('Package type (PACKAGE create).'),
  software_component: z
    .string()
    .optional()
    .describe('Software component (PACKAGE create).'),
  transport_layer: z
    .string()
    .optional()
    .describe('Transport layer (PACKAGE create).'),
  record_changes: z
    .boolean()
    .optional()
    .describe('Record changes (PACKAGE create).'),
  application_component: z
    .string()
    .optional()
    .describe('Application component (PACKAGE create).'),
  transport_type: z
    .enum(['workbench', 'customizing'])
    .optional()
    .describe('Transport request type (TRANSPORT create).'),
  target_system: z
    .string()
    .optional()
    .describe('Target system of the transport request (TRANSPORT create).'),
  owner: z
    .string()
    .optional()
    .describe('Owner of the transport request (TRANSPORT create).'),
  superclass: z.string().optional().describe('Superclass name (CLASS create).'),
  final: z
    .boolean()
    .optional()
    .describe('Mark the class final (CLASS create).'),
  create_protected: z
    .boolean()
    .optional()
    .describe('Protected constructor (CLASS create).'),
  application: z
    .string()
    .optional()
    .describe('Application area (PROGRAM create).'),
  table_name: z.string().optional().describe('Table name.'),
  structure_name: z.string().optional().describe('Structure name.'),
  data_element_name: z.string().optional().describe('Data element name.'),
  interface_name: z.string().optional().describe('Interface name.'),
  include_name: z.string().optional().describe('Include name.'),
  table_type_name: z.string().optional().describe('Table type name.'),
  service_definition_name: z
    .string()
    .optional()
    .describe(
      'Service definition name (SERVICE_DEFINITION; the definition a SERVICE_BINDING binds).',
    ),
  service_binding_name: z.string().optional().describe('Service binding name.'),
  service_name: z
    .string()
    .optional()
    .describe(
      'Service name of the binding (SERVICE_BINDING create); the binding name when absent.',
    ),
  service_version: z
    .string()
    .optional()
    .describe(
      'Service version of the binding (SERVICE_BINDING create); 0001 when absent.',
    ),
  binding_variant: z
    .enum([
      'ODATA_V2_UI',
      'ODATA_V2_WEB_API',
      'ODATA_V4_UI',
      'ODATA_V4_WEB_API',
    ])
    .optional()
    .describe(
      'Binding variant (SERVICE_BINDING create); ODATA_V4_UI when absent.',
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Object name for handlers that require a generic `name` (behavior definition, metadata extension).',
    ),
  implementation_type: z
    .enum(['Managed', 'Unmanaged', 'Abstract', 'Projection'])
    .optional()
    .describe('Behavior definition implementation type.'),
  ...DETAIL_SHAPE,
};

/** A member of `HandlerCreate`'s `object_type`. */
type CreateMember = (typeof COMPACT_CREATE.onprem)[number];

/**
 * What `HandlerCreate` takes: `transport_request`, `package_name` and
 * `description` for every type (the controller's ruling), and per type the
 * arguments its create request carries — measured: each string argument's
 * value found in the request sent, each boolean or enum read off the
 * adt-clients create that builds it. `handleCreateOnly` refuses any other.
 */
export const COMPACT_CREATE_TAKES = takesOf<
  'object_type' | keyof typeof CREATE_PROPERTIES,
  CreateMember
>()({
  every: [
    'object_type',
    'transport_request',
    'package_name',
    'description',
    'detail',
  ],
  members: {
    PACKAGE: [
      'package_name',
      'super_package',
      'package_type',
      'software_component',
      'transport_layer',
      'record_changes',
      'application_component',
      'master_language',
    ],
    DOMAIN: ['domain_name', 'master_language'],
    DATA_ELEMENT: ['data_element_name', 'master_language'],
    TRANSPORT: ['transport_type', 'target_system', 'owner'],
    TABLE: ['table_name', 'master_language'],
    STRUCTURE: ['structure_name', 'master_language'],
    TABLE_TYPE: ['table_type_name', 'master_language'],
    DDL: ['ddl_name', 'master_language'],
    SERVICE_DEFINITION: ['service_definition_name', 'master_language'],
    SERVICE_BINDING: [
      'service_binding_name',
      'service_definition_name',
      'service_name',
      'service_version',
      'binding_variant',
      'master_language',
    ],
    CLASS: [
      'class_name',
      'superclass',
      'final',
      'create_protected',
      'master_language',
    ],
    PROGRAM: ['program_name', 'application', 'master_language'],
    INCLUDE: ['include_name', 'master_language'],
    INTERFACE: ['interface_name', 'master_language'],
    FUNCTION_GROUP: ['function_group_name', 'master_language'],
    FUNCTION_MODULE: ['function_module_name', 'function_group_name'],
    BEHAVIOR_DEFINITION: ['name', 'implementation_type', 'master_language'],
    BEHAVIOR_IMPLEMENTATION: ['class_name', 'behavior_definition'],
    METADATA_EXTENSION: ['name', 'master_language'],
  },
});

export function compactCreateSchemaFor<const M extends readonly CreateMember[]>(
  members: M,
) {
  const properties = {
    object_type: objectTypeOf(members),
    ...CREATE_PROPERTIES,
  } as const;
  return createArguments('HandlerCreate', {
    ...offered(properties, COMPACT_CREATE_TAKES, members),
    object_type: requiredField(properties.object_type),
  });
}

export const compactCreateSchema = compactCreateSchemaFor(
  COMPACT_CREATE.onprem,
);

/**
 * Which aspect of an object a read answers.
 *
 * The compact surface is one tool per OPERATION, so "source or metadata or the URLs"
 * is an argument of the read, not three tools. A part the object does not have is
 * refused by name — silently answering the source instead would be a success that
 * means something other than what was asked.
 */
const READ_PARTS = [
  'source',
  'metadata',
  'urls',
  'contents',
  'object_structure',
  'node_structure',
  'virtual_folders',
  'activation_status',
  'activation_results',
] as const;

const READ_PART_WORDS =
  'The part to read: source (the source alone), metadata (the ADT metadata document alone), urls (the service and preview URLs), contents (the objects a package holds); each object type answers the parts it has, and a part outside them is answered with the list of its parts. Three parts read the repository by ADT address: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by run_id*: activation_status (its status) and activation_results (the messages it produced).';

const readPartSchema = z
  .enum(READ_PARTS)
  .default('source')
  .optional()
  .describe(READ_PART_WORDS);

const GET_TIMEOUT = TIMEOUT_FIELD.describe(
  `${TIMEOUT_DESCRIPTION} Applies to the repository reads: object_type PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, TRANSPORT, and the parts object_structure, node_structure, virtual_folders.`,
);

const GET_PROPERTIES = {
  part: readPartSchema,
  package_name: z.string().optional().describe('Package name.'),
  package_names: z
    .array(z.string())
    .optional()
    .describe(
      'Several package names (part contents), read together: one entry per package, in the order given, each { package_name, contents } or { package_name, error }.',
    ),
  max_results: z
    .number()
    .default(100)
    .optional()
    .describe('Maximum number of members listed per package (part contents).'),
  include_descriptions: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      "Include each member's description (part contents). The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes.",
    ),
  class_name: z.string().optional().describe('Class name.'),
  interface_name: z.string().optional().describe('Interface name.'),
  program_name: z.string().optional().describe('Program name.'),
  include_name: z.string().optional().describe('Include name.'),
  domain_name: z.string().optional().describe('Domain name.'),
  data_element_name: z.string().optional().describe('Data element name.'),
  table_name: z.string().optional().describe('Table name.'),
  structure_name: z.string().optional().describe('Structure name.'),
  table_type_name: z.string().optional().describe('Table type name.'),
  ddl_name: z.string().optional().describe('DDL source name.'),
  function_module_name: z
    .string()
    .optional()
    .describe(
      'Function module name: GROUP|MODULE, its function group first, or the module alone with function_group_name.',
    ),
  function_group_name: z
    .string()
    .optional()
    .describe(
      "Function group name (FUNCTION_GROUP; FUNCTION_MODULE given as the module's name).",
    ),
  behavior_definition_name: z
    .string()
    .optional()
    .describe('Behavior definition name.'),
  behavior_implementation_name: z
    .string()
    .optional()
    .describe('Behavior implementation name.'),
  metadata_extension_name: z
    .string()
    .optional()
    .describe('Metadata extension name.'),
  service_definition_name: z
    .string()
    .optional()
    .describe('Service definition name.'),
  service_binding_name: z.string().optional().describe('Service binding name.'),
  transport_number: z
    .string()
    .optional()
    .describe(
      'Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own.',
    ),
  run_id: z
    .string()
    .optional()
    .describe(
      'Run id: a unit test run (UNIT_TEST, CDS_UNIT_TEST) or an activation run (parts activation_status, activation_results).',
    ),
  with_long_polling: z
    .boolean()
    .optional()
    .describe(
      'With part activation_status: when true, the status read is held by SAP until the activation run ends, and answers its final status.',
    ),
  response_format: z
    .enum(['xml', 'json', 'plain'])
    .optional()
    .describe('Response format for SERVICE_BINDING reads.'),
  version: READ_VERSION_FIELD,
  object_adt_type: z
    .string()
    .optional()
    .describe(
      'ADT type code of the object (object_structure) or of the parent node (node_structure).',
    ),
  object_name: z
    .string()
    .optional()
    .describe(
      'Object name (object_structure) or parent name (node_structure).',
    ),
  node_id: z
    .string()
    .optional()
    .describe('Node id to expand (node_structure); the root when absent.'),
  with_short_descriptions: z
    .boolean()
    .optional()
    .describe('Include short descriptions (node_structure).'),
  object_search_pattern: z
    .string()
    .optional()
    .describe('Object name pattern (virtual_folders).'),
  preselection: z
    .array(
      z.object({
        facet: z.string().describe('Facet name.'),
        values: z.array(z.string()).describe('Facet values.'),
      }),
    )
    .optional()
    .describe('Facet preselections (virtual_folders).'),
  facet_order: z
    .array(z.string())
    .optional()
    .describe('Facet order (virtual_folders).'),
  with_versions: z
    .boolean()
    .optional()
    .describe('Include versions (virtual_folders).'),
  ignore_short_descriptions: z
    .boolean()
    .optional()
    .describe('Leave out short descriptions (virtual_folders).'),
};

/** A member of `HandlerGet`'s `object_type`. */
type ReadMember = (typeof COMPACT_READ.onprem)[number];

/**
 * The read members whose `part: 'main_programs'` is served, per system type:
 * an include's main programs are read on premise only (the ABAP cloud table
 * lists no `mainPrograms`).
 */
export const COMPACT_MAIN_PROGRAMS = {
  onprem: ['INCLUDE'],
  cloud: [],
} as const satisfies Record<ProjectionVariant, readonly ReadMember[]>;

/** `HandlerGet`'s `part`, with `main_programs` where a member serves it. */
function readPartFor(mainPrograms: readonly ReadMember[]) {
  return mainPrograms.length === 0
    ? readPartSchema
    : z
        .enum([...READ_PARTS, 'main_programs'])
        .default('source')
        .optional()
        .describe(
          `${READ_PART_WORDS} main_programs (${mainPrograms.join(', ')}): the include's main programs.`,
        );
}

/**
 * What `HandlerGet` takes: the part, and the repository-address and
 * activation-run parts' arguments, on every call; per type the name its read
 * takes, and `version` where its `Get<Type>` reads one.
 */
export const COMPACT_READ_TAKES = takesOf<
  'timeout' | 'object_type' | keyof typeof GET_PROPERTIES,
  ReadMember
>()({
  every: [
    'timeout',
    'object_type',
    'part',
    'run_id',
    'with_long_polling',
    'object_adt_type',
    'object_name',
    'node_id',
    'with_short_descriptions',
    'object_search_pattern',
    'preselection',
    'facet_order',
    'with_versions',
    'ignore_short_descriptions',
  ],
  members: {
    PACKAGE: [
      'package_name',
      'package_names',
      'max_results',
      'include_descriptions',
      'version',
    ],
    DOMAIN: ['domain_name', 'version'],
    DATA_ELEMENT: ['data_element_name', 'version'],
    TABLE: ['table_name', 'version'],
    STRUCTURE: ['structure_name', 'version'],
    TABLE_TYPE: ['table_type_name', 'version'],
    DDL: ['ddl_name', 'version'],
    SERVICE_DEFINITION: ['service_definition_name', 'version'],
    SERVICE_BINDING: ['service_binding_name', 'response_format'],
    CLASS: ['class_name', 'version'],
    LOCAL_TEST_CLASS: ['class_name', 'version'],
    LOCAL_TYPES: ['class_name', 'version'],
    LOCAL_DEFINITIONS: ['class_name', 'version'],
    LOCAL_MACROS: ['class_name', 'version'],
    PROGRAM: ['program_name', 'version'],
    INCLUDE: ['include_name', 'version'],
    INTERFACE: ['interface_name', 'version'],
    FUNCTION_GROUP: ['function_group_name', 'version'],
    FUNCTION_MODULE: ['function_module_name', 'function_group_name', 'version'],
    BEHAVIOR_DEFINITION: ['behavior_definition_name', 'version'],
    BEHAVIOR_IMPLEMENTATION: ['behavior_implementation_name', 'version'],
    METADATA_EXTENSION: ['metadata_extension_name', 'version'],
    UNIT_TEST: ['run_id'],
    CDS_UNIT_TEST: ['run_id'],
    TRANSPORT: ['transport_number'],
  },
});

export function compactGetSchemaFor<const M extends readonly ReadMember[]>(
  members: M,
  mainPrograms: readonly ReadMember[] = [],
) {
  const properties = {
    timeout: GET_TIMEOUT,
    object_type: objectTypeOf(members),
    ...GET_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_READ_TAKES, members),
    timeout: properties.timeout,
    object_type: properties.object_type,
    part: readPartFor(mainPrograms),
  });
}

export const compactGetSchema = compactGetSchemaFor(
  COMPACT_READ.onprem,
  COMPACT_MAIN_PROGRAMS.onprem,
);

const UPDATE_PROPERTIES = {
  lock_handle: z
    .string()
    .optional()
    .describe(
      'The lock handle of the object (for a class include, of the class): the write is sent under it.',
    ),
  transport_request: z
    .string()
    .optional()
    .describe(
      "Transport request id, sent as the write's corrNr (the types whose description names it).",
    ),
  class_name: z.string().optional().describe('ABAP class name.'),
  program_name: z.string().optional().describe('ABAP program name.'),
  domain_name: z.string().optional().describe('ABAP domain name.'),
  function_module_name: z
    .string()
    .optional()
    .describe('ABAP function module name.'),
  function_group_name: z
    .string()
    .optional()
    .describe('ABAP function group name.'),
  package_name: z.string().optional().describe('ABAP package name.'),
  ddl_name: z
    .string()
    .optional()
    .describe('DDL source name (CDS view, AMDP table function, etc.).'),
  source_code: z
    .string()
    .optional()
    .describe(
      'The content written: the source, or for PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE_TYPE and INCLUDE with part metadata the whole metadata document.',
    ),
  part: z
    .enum(['source', 'metadata'])
    .optional()
    .describe(
      'The part of an INCLUDE written: source (when absent) its source, metadata its metadata document. Taken by INCLUDE alone.',
    ),
  ddl_source: z
    .string()
    .optional()
    .describe('Complete DDL source code (for DDL update).'),
  table_name: z.string().optional().describe('Table name.'),
  structure_name: z.string().optional().describe('Structure name.'),
  data_element_name: z.string().optional().describe('Data element name.'),
  interface_name: z.string().optional().describe('Interface name.'),
  include_name: z.string().optional().describe('Include name.'),
  table_type_name: z.string().optional().describe('Table type name.'),
  service_definition_name: z
    .string()
    .optional()
    .describe('Service definition name.'),
  service_binding_name: z.string().optional().describe('Service binding name.'),
  service_name: z
    .string()
    .optional()
    .describe('Published service name (SERVICE_BINDING, an OData V2 binding).'),
  service_version: z
    .string()
    .optional()
    .describe(
      'Published service version (SERVICE_BINDING, an OData V2 binding). Default 0001.',
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Object name for handlers that require a generic `name` (behavior definition, metadata extension).',
    ),
  ddl_code: z
    .string()
    .optional()
    .describe('Complete DDL source code (for TABLE/STRUCTURE update).'),
  implementation_code: z
    .string()
    .optional()
    .describe('Behavior implementation methods source code.'),
  test_class_source: z
    .string()
    .optional()
    .describe(
      'ABAP source of the local test classes (UNIT_TEST and CDS_UNIT_TEST update).',
    ),
  test_class_code: z
    .string()
    .optional()
    .describe('Updated source for the local test class.'),
  local_types_code: z
    .string()
    .optional()
    .describe('Updated source for class local types.'),
  definitions_code: z
    .string()
    .optional()
    .describe('Updated source for class local definitions.'),
  macros_code: z
    .string()
    .optional()
    .describe('Updated source for class local macros.'),
  binding_variant: z
    .enum([
      'ODATA_V2_UI',
      'ODATA_V2_WEB_API',
      'ODATA_V4_UI',
      'ODATA_V4_WEB_API',
    ])
    .optional()
    .describe('Service binding variant (service binding update).'),
  desired_publication_state: z
    .enum(['published', 'unpublished'])
    .optional()
    .describe('Target publication state (service binding update).'),
};

/** A member of `HandlerUpdate`'s `object_type`. */
type UpdateMember = (typeof COMPACT_UPDATE.onprem)[number];

/**
 * What `HandlerUpdate` takes (`handleUpdateUnderLock`): `lock_handle` and
 * `transport_request` on every call, and per type its name and the content
 * it writes — `source_code`, or the source argument the type names otherwise
 * (`source_code` taken beside it).
 */
export const COMPACT_UPDATE_TAKES = takesOf<
  'object_type' | keyof typeof UPDATE_PROPERTIES,
  UpdateMember
>()({
  every: ['object_type', 'lock_handle', 'transport_request'],
  members: {
    PACKAGE: ['package_name', 'source_code'],
    DOMAIN: ['domain_name', 'source_code'],
    DATA_ELEMENT: ['data_element_name', 'source_code'],
    TABLE_TYPE: ['table_type_name', 'source_code'],
    FUNCTION_GROUP: ['function_group_name', 'source_code'],
    TABLE: ['table_name', 'ddl_code', 'source_code'],
    STRUCTURE: ['structure_name', 'ddl_code', 'source_code'],
    DDL: ['ddl_name', 'ddl_source', 'source_code'],
    SERVICE_DEFINITION: ['service_definition_name', 'source_code'],
    CLASS: ['class_name', 'source_code'],
    LOCAL_TEST_CLASS: ['class_name', 'test_class_code', 'source_code'],
    LOCAL_TYPES: ['class_name', 'local_types_code', 'source_code'],
    LOCAL_DEFINITIONS: ['class_name', 'definitions_code', 'source_code'],
    LOCAL_MACROS: ['class_name', 'macros_code', 'source_code'],
    UNIT_TEST: ['class_name', 'test_class_source', 'source_code'],
    CDS_UNIT_TEST: ['class_name', 'test_class_source', 'source_code'],
    PROGRAM: ['program_name', 'source_code'],
    INCLUDE: ['include_name', 'source_code', 'part'],
    INTERFACE: ['interface_name', 'source_code'],
    FUNCTION_MODULE: [
      'function_module_name',
      'function_group_name',
      'source_code',
    ],
    BEHAVIOR_DEFINITION: ['name', 'source_code'],
    BEHAVIOR_IMPLEMENTATION: [
      'class_name',
      'implementation_code',
      'source_code',
    ],
    METADATA_EXTENSION: ['name', 'source_code'],
    SERVICE_BINDING: [
      'service_binding_name',
      'desired_publication_state',
      'binding_variant',
      'service_name',
      'service_version',
    ],
  },
});

export function compactUpdateSchemaFor<const M extends readonly UpdateMember[]>(
  members: M,
) {
  const properties = {
    object_type: objectTypeOf(members),
    ...UPDATE_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_UPDATE_TAKES, members),
    object_type: requiredField(properties.object_type),
    lock_handle: requiredField(properties.lock_handle),
    transport_request: properties.transport_request,
  });
}

export const compactUpdateSchema = compactUpdateSchemaFor(
  COMPACT_UPDATE.onprem,
);

/** The types a deletion request removes, each with its deletion check. */
export const DELETION_CHECK_TYPES = COMPACT_DELETION_CHECK.onprem;

/**
 * The class includes compact's delete writes empty under the class lock (a
 * `DELETE` on an include answers `405`).
 */
export const EMPTIED_INCLUDE_TYPES = [
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'UNIT_TEST',
] as const;

/** The types `HandlerDelete` removes: by the deletion request, or by an empty include write. */
export const DELETABLE_TYPES = [
  ...DELETION_CHECK_TYPES,
  ...EMPTIED_INCLUDE_TYPES,
] as const;

/**
 * `HandlerDelete`: one request (spec §4.6) — the deletion request, or for a
 * class include and the unit tests the include written empty under
 * `lock_handle`. Only what that request sends is named.
 */
const DELETE_PROPERTIES = {
  lock_handle: z
    .string()
    .optional()
    .describe(
      'The lock handle of the class (LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST): the include is written empty under it.',
    ),
  package_name: z.string().optional().describe('ABAP package name.'),
  class_name: z.string().optional().describe('ABAP class name.'),
  program_name: z.string().optional().describe('ABAP program name.'),
  domain_name: z.string().optional().describe('ABAP domain name.'),
  function_module_name: z
    .string()
    .optional()
    .describe('ABAP function module name.'),
  function_group_name: z
    .string()
    .optional()
    .describe('ABAP function group name.'),
  ddl_name: z
    .string()
    .optional()
    .describe('DDL source name (CDS view, AMDP table function, etc.).'),
  transport_request: z
    .string()
    .optional()
    .describe(
      'Transport request id, sent with the deletion (or the include write).',
    ),
  table_name: z.string().optional().describe('Table name.'),
  structure_name: z.string().optional().describe('Structure name.'),
  data_element_name: z.string().optional().describe('Data element name.'),
  interface_name: z.string().optional().describe('Interface name.'),
  include_name: z.string().optional().describe('Include name.'),
  table_type_name: z.string().optional().describe('Table type name.'),
  service_definition_name: z
    .string()
    .optional()
    .describe('Service definition name.'),
  service_binding_name: z.string().optional().describe('Service binding name.'),
  behavior_definition_name: z
    .string()
    .optional()
    .describe('Behavior definition name.'),
  behavior_implementation_name: z
    .string()
    .optional()
    .describe('Behavior implementation name.'),
  metadata_extension_name: z
    .string()
    .optional()
    .describe('Metadata extension name.'),
};

/** A type a deletion request removes. */
type DeletionMember = (typeof DELETION_CHECK_TYPES)[number];

/** The argument naming the object, per type a deletion request removes. */
export const DELETION_NAME_FIELDS = {
  PACKAGE: 'package_name',
  DOMAIN: 'domain_name',
  DATA_ELEMENT: 'data_element_name',
  TABLE: 'table_name',
  STRUCTURE: 'structure_name',
  TABLE_TYPE: 'table_type_name',
  DDL: 'ddl_name',
  SERVICE_DEFINITION: 'service_definition_name',
  SERVICE_BINDING: 'service_binding_name',
  CLASS: 'class_name',
  CDS_UNIT_TEST: 'class_name',
  PROGRAM: 'program_name',
  INCLUDE: 'include_name',
  INTERFACE: 'interface_name',
  FUNCTION_GROUP: 'function_group_name',
  FUNCTION_MODULE: 'function_module_name',
  BEHAVIOR_DEFINITION: 'behavior_definition_name',
  BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
  METADATA_EXTENSION: 'metadata_extension_name',
} as const satisfies Readonly<
  Record<DeletionMember, keyof typeof DELETE_PROPERTIES>
>;

/** A member of `HandlerDelete`'s `object_type`. */
type DeleteMember = (typeof COMPACT_DELETE.onprem)[number];

/**
 * What `HandlerDelete` takes (`handleDeleteOnly`): `transport_request` on
 * every call; a type a deletion request removes its name (and a function
 * module its group); a class include and the unit tests the class's name and
 * lock handle.
 */
export const COMPACT_DELETE_TAKES = takesOf<
  'object_type' | keyof typeof DELETE_PROPERTIES,
  DeleteMember
>()({
  every: ['object_type', 'transport_request'],
  members: {
    PACKAGE: [DELETION_NAME_FIELDS.PACKAGE],
    DOMAIN: [DELETION_NAME_FIELDS.DOMAIN],
    DATA_ELEMENT: [DELETION_NAME_FIELDS.DATA_ELEMENT],
    TABLE: [DELETION_NAME_FIELDS.TABLE],
    STRUCTURE: [DELETION_NAME_FIELDS.STRUCTURE],
    TABLE_TYPE: [DELETION_NAME_FIELDS.TABLE_TYPE],
    DDL: [DELETION_NAME_FIELDS.DDL],
    SERVICE_DEFINITION: [DELETION_NAME_FIELDS.SERVICE_DEFINITION],
    SERVICE_BINDING: [DELETION_NAME_FIELDS.SERVICE_BINDING],
    CLASS: [DELETION_NAME_FIELDS.CLASS],
    CDS_UNIT_TEST: [DELETION_NAME_FIELDS.CDS_UNIT_TEST],
    PROGRAM: [DELETION_NAME_FIELDS.PROGRAM],
    INCLUDE: [DELETION_NAME_FIELDS.INCLUDE],
    INTERFACE: [DELETION_NAME_FIELDS.INTERFACE],
    FUNCTION_GROUP: [DELETION_NAME_FIELDS.FUNCTION_GROUP],
    FUNCTION_MODULE: [
      DELETION_NAME_FIELDS.FUNCTION_MODULE,
      'function_group_name',
    ],
    BEHAVIOR_DEFINITION: [DELETION_NAME_FIELDS.BEHAVIOR_DEFINITION],
    BEHAVIOR_IMPLEMENTATION: [DELETION_NAME_FIELDS.BEHAVIOR_IMPLEMENTATION],
    METADATA_EXTENSION: [DELETION_NAME_FIELDS.METADATA_EXTENSION],
    LOCAL_TEST_CLASS: ['class_name', 'lock_handle'],
    LOCAL_TYPES: ['class_name', 'lock_handle'],
    LOCAL_DEFINITIONS: ['class_name', 'lock_handle'],
    LOCAL_MACROS: ['class_name', 'lock_handle'],
    UNIT_TEST: ['class_name', 'lock_handle'],
  },
});

export function compactDeleteSchemaFor<const M extends readonly DeleteMember[]>(
  members: M,
) {
  const properties = {
    object_type: listedValues(members)
      .optional()
      .describe(`Object type. ${supported(members)}`),
    ...DELETE_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_DELETE_TAKES, members),
    object_type: requiredField(properties.object_type),
  });
}

export const compactDeleteSchema = compactDeleteSchemaFor(
  COMPACT_DELETE.onprem,
);

export const compactUnitTestRunSchema = z.object({
  tests: z
    .array(
      z.object({
        container_class: z
          .string()
          .describe('Productive class containing tests.'),
        test_class: z.string().describe('Local/unit test class.'),
      }),
    )
    .optional()
    .describe(
      'Test classes to run, each named by its global class and its local test class (exactly one of tests and target).',
    ),
  target: RUN_TARGET_OPTIONAL,
  runner: z
    .enum(['async', 'sync'])
    .default('async')
    .optional()
    .describe(
      'async (default): starts the run and returns its run_id, whose status and result are read by run_id; suited to long suites. sync (tests only): one request that runs every test class of each container_class and returns the finished result. A target run is async.',
    ),
  title: z
    .string()
    .optional()
    .describe(
      'Run title shown in ABAP Unit test logs; sent by the async runner.',
    ),
  context: z
    .string()
    .optional()
    .describe('Run context label; sent by the async runner.'),
  scope: z
    .object({
      own_tests: z.boolean().optional().describe('Include own tests.'),
      foreign_tests: z.boolean().optional().describe('Include foreign tests.'),
      add_foreign_tests_as_preview: z
        .boolean()
        .optional()
        .describe('Preview foreign tests without full inclusion.'),
    })
    .optional()
    .describe('ABAP Unit test scope flags.'),
  risk_level: z
    .object({
      harmless: z.boolean().optional().describe('Allow harmless tests.'),
      dangerous: z.boolean().optional().describe('Allow dangerous tests.'),
      critical: z.boolean().optional().describe('Allow critical tests.'),
    })
    .optional()
    .describe('Allowed risk levels.'),
  duration: z
    .object({
      short: z.boolean().optional().describe('Allow short tests.'),
      medium: z.boolean().optional().describe('Allow medium tests.'),
      long: z.boolean().optional().describe('Allow long tests.'),
    })
    .optional()
    .describe('Allowed duration classes.'),
});

export const compactUnitTestStatusSchema = z.object({
  run_id: z.string().describe('Unit test run id.'),
  with_long_polling: z
    .boolean()
    .default(true)
    .optional()
    .describe('Use long polling while waiting for completion.'),
});

export const compactUnitTestResultSchema = z.object({
  run_id: z.string().describe('Unit test run id.'),
  with_navigation_uris: z
    .boolean()
    .default(false)
    .optional()
    .describe('Include ADT navigation URIs in the result payload.'),
  format: z.enum(['abapunit', 'junit']).optional().describe('Result format.'),
  ...DETAIL_SHAPE,
});

export const compactCdsUnitTestStatusSchema = compactUnitTestStatusSchema;
export const compactCdsUnitTestResultSchema = compactUnitTestResultSchema;

export const compactProfileScheduleSchema = z.object({
  description: z.string().optional().describe('Profiler trace description.'),
  all_procedural_units: z
    .boolean()
    .optional()
    .describe('Trace all procedural units.'),
  all_misc_abap_statements: z
    .boolean()
    .optional()
    .describe('Trace miscellaneous ABAP statements.'),
  all_internal_table_events: z
    .boolean()
    .optional()
    .describe('Trace internal table events.'),
  all_dynpro_events: z.boolean().optional().describe('Trace dynpro events.'),
  aggregate: z.boolean().optional().describe('Aggregate profiling data.'),
  explicit_on_off: z
    .boolean()
    .optional()
    .describe('Use explicit on/off trace sections.'),
  with_rfc_tracing: z.boolean().optional().describe('Enable RFC tracing.'),
  all_system_kernel_events: z
    .boolean()
    .optional()
    .describe('Trace system kernel events.'),
  sql_trace: z.boolean().optional().describe('Enable SQL trace.'),
  all_db_events: z.boolean().optional().describe('Trace all DB events.'),
  max_size_for_trace_file: z
    .number()
    .optional()
    .describe('Maximum trace file size.'),
  amdp_trace: z.boolean().optional().describe('Enable AMDP tracing.'),
  max_time_for_tracing: z.number().optional().describe('Maximum tracing time.'),
});

const PROFILE_RUN_PROPERTIES = {
  class_name: z.string().optional().describe('Class to run.'),
  program_name: z.string().optional().describe('Program to run.'),
  profiler_id: z
    .string()
    .optional()
    .describe(
      'The profiler id of a scheduled trace. Given, the run goes under that trace; absent, the run is plain.',
    ),
  background: COMPACT_BACKGROUND_FIELD,
};

/** A member of `HandlerProfileRun`'s `target_type`. */
type ProfileMember = (typeof COMPACT_PROFILE.onprem)[number];

/** What `HandlerProfileRun` takes: the run's name per target kind. */
export const COMPACT_PROFILE_TAKES = takesOf<
  'target_type' | keyof typeof PROFILE_RUN_PROPERTIES,
  ProfileMember
>()({
  every: ['target_type', 'profiler_id', 'background'],
  members: {
    CLASS: ['class_name'],
    PROGRAM: ['program_name'],
  },
});

export function compactProfileRunSchemaFor<
  const M extends readonly ProfileMember[],
>(members: M) {
  const properties = {
    target_type: listedValues(members).optional().describe('Run target kind.'),
    ...PROFILE_RUN_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_PROFILE_TAKES, members),
    target_type: requiredField(properties.target_type),
  });
}

export const compactProfileRunSchema = compactProfileRunSchemaFor(
  COMPACT_PROFILE.onprem,
);

export const compactProfileListSchema = z.object({});

export const compactProfileViewSchema = z.object({
  timeout: TIMEOUT_FIELD,
  trace_id_or_uri: z.string().describe('Profiler trace id or URI.'),
  view: z
    .enum(['hitlist', 'statements', 'db_accesses'])
    .describe('Profiler trace view kind.'),
  mode: z
    .enum(['raw', 'analyze'])
    .default('raw')
    .optional()
    .describe(
      '"raw" returns the parsed trace payload as-is (default). "analyze" returns a compact summary instead — totals plus the top-ranked entries — via the same trace view.',
    ),
  top: z
    .number()
    .optional()
    .describe(
      'Number of top-ranked rows to include when mode is "analyze". Default 10. Ignored for mode "raw".',
    ),
  with_system_events: z
    .boolean()
    .optional()
    .describe('Include system events in analysis.'),
  id: z.number().optional().describe('Optional statement/access id.'),
  with_details: z.boolean().optional().describe('Include detailed payload.'),
  auto_drill_down_threshold: z
    .number()
    .optional()
    .describe('Auto drill-down threshold.'),
});

export const compactDumpListSchema = z.object({
  timeout: TIMEOUT_FIELD,
  feed_type: z
    .enum(['dumps', 'system_messages', 'gateway_errors'])
    .default('dumps')
    .optional()
    .describe(
      'Which runtime feed to list. Default "dumps" (ABAP short dumps). "system_messages" and "gateway_errors" read the other two ADT runtime feeds through the same call.',
    ),
  user: z.string().optional().describe('Entries of this user.'),
  runtime_error: z
    .string()
    .optional()
    .describe('Dumps whose runtime error contains this text, in any case.'),
  exception: z
    .string()
    .optional()
    .describe('Dumps whose exception class contains this text, in any case.'),
  object_name: z
    .string()
    .optional()
    .describe(
      'Dumps whose terminated object name contains this text, in any case.',
    ),
  package: z
    .string()
    .optional()
    .describe('Dumps whose object package contains this text, in any case.'),
  component: z
    .string()
    .optional()
    .describe(
      'Dumps whose application component contains this text, in any case.',
    ),
  top: z
    .number()
    .optional()
    .describe(
      'Entries the page holds, 1 to 100 (SAP answers 100 when top is absent).',
    ),
  from: z.string().optional().describe('Start of time range (YYYYMMDDHHMMSS).'),
  to: z
    .string()
    .optional()
    .describe(
      "End of time range (YYYYMMDDHHMMSS), inclusive: the page holds the entries up to that second; a previous answer's next_to is the next page's to, and that page starts at the boundary second, inclusive.",
    ),
});

export const compactDumpViewSchema = z.object({
  dump_id: z.string().describe("The dump's dump_id, or its URI."),
  view: z
    .enum(['default', 'summary', 'formatted'])
    .default('default')
    .optional()
    .describe(
      '"summary" — runtime error, exception, terminated program, time, user and termination position; "default" — that summary and the parsed dump; "formatted" — the dump as formatted text.',
    ),
});

export const compactServiceBindingListTypesSchema = z.object({
  response_format: z
    .enum(['xml', 'json', 'plain'])
    .default('xml')
    .optional()
    .describe('Response format for protocol types list.'),
});

export const compactServiceBindingValidateSchema = z.object({
  service_binding_name: z
    .string()
    .describe('Service binding name to validate.'),
  service_definition_name: z
    .string()
    .describe('Service definition name to pair with binding.'),
  service_binding_version: z
    .string()
    .optional()
    .describe('Service binding version.'),
  package_name: z
    .string()
    .describe("The binding's package, which the validation checks."),
  description: z.string().optional().describe('Binding description.'),
});

export const compactTransportCreateSchema = z.object({
  transport_type: z
    .enum(['workbench', 'customizing'])
    .default('workbench')
    .optional()
    .describe('Transport type.'),
  description: z.string().describe('Transport description.'),
  target_system: z.string().optional().describe('Target system id.'),
  owner: z.string().optional().describe('Transport owner user.'),
});

export const compactTransportSortAndCompressSchema = z.object({
  transport_number: z
    .string()
    .describe('Number of the transport task to sort and compress.'),
});

/**
 * One entry of `objects`, as a constant of its own: the tool docs are read
 * from the sources as text, and a nested `default` inside the `objects`
 * property would be reported as the default of `objects` itself.
 */
const compactMovedTransportEntry = z.object({
  object_name: z.string().describe('Object name.'),
  object_type: z
    .string()
    .describe(
      'Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.',
    ),
  position: z
    .string()
    .describe(
      "Position of the object's entry in the source task's object list.",
    ),
  pgmid: z
    .string()
    .default('R3TR')
    .optional()
    .describe("Program id. Defaults to R3TR, a workbench object's."),
});

export const compactTransportMoveObjectsSchema = z.object({
  transport_number: z
    .string()
    .describe('Number of the transport task that holds the entries.'),
  target_number: z
    .string()
    .describe('Number of the transport task the entries move to.'),
  objects: z
    .array(compactMovedTransportEntry)
    .min(1)
    .describe(
      'The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.',
    ),
});

const lifecycleObjectSchema = <const M extends readonly string[]>(
  types: M,
) => ({
  object_type: listedValues(types)
    .optional()
    .describe(`Object type. ${supported(types)}`),
  object_name: z
    .string()
    .optional()
    .describe(
      'Object name. A function module is named GROUP|MODULE, its function group first.',
    ),
});

const VALIDATE_PROPERTIES = {
  object_name: z
    .string()
    .optional()
    .describe(
      'Required object name. For SERVICE_BINDING this is the service binding name; a function module is named GROUP|MODULE.',
    ),
  package_name: z
    .string()
    .optional()
    .describe(
      'Package of the object to validate. Required for BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION and SERVICE_BINDING.',
    ),
  super_package: z
    .string()
    .optional()
    .describe('Super package of the package to validate (PACKAGE).'),
  superclass: z
    .string()
    .optional()
    .describe('Superclass of the class to validate (CLASS).'),
  description: z
    .string()
    .optional()
    .describe(
      'Object description used during validation. Required for FUNCTION_MODULE, BEHAVIOR_DEFINITION and METADATA_EXTENSION.',
    ),
  behavior_definition: z
    .string()
    .optional()
    .describe(
      'Behavior definition the behavior implementation is for (BEHAVIOR_IMPLEMENTATION).',
    ),
  root_entity: z
    .string()
    .optional()
    .describe(
      'CDS root entity of the behavior definition to validate. Required for BEHAVIOR_DEFINITION.',
    ),
  implementation_type: z
    .string()
    .optional()
    .describe(
      'Implementation type of the behavior definition to validate (Managed, Unmanaged, Abstract or Projection). Required for BEHAVIOR_DEFINITION.',
    ),
  service_definition_name: z
    .string()
    .optional()
    .describe(
      'Required when object_type=SERVICE_BINDING. Service definition paired with the binding.',
    ),
  service_binding_version: z
    .string()
    .optional()
    .describe('Optional service binding version for SERVICE_BINDING.'),
};

/** A member of `HandlerValidate`'s `object_type`. */
type ValidateMember = (typeof COMPACT_VALIDATE.onprem)[number];

/**
 * What `HandlerValidate` takes: the name, package and description on every
 * call (sent with every validation), and per type the arguments of its own
 * validation.
 */
export const COMPACT_VALIDATE_TAKES = takesOf<
  'object_type' | keyof typeof VALIDATE_PROPERTIES,
  ValidateMember
>()({
  every: ['object_type', 'object_name', 'package_name', 'description'],
  members: {
    PACKAGE: ['super_package'],
    CLASS: ['superclass'],
    BEHAVIOR_DEFINITION: ['root_entity', 'implementation_type'],
    BEHAVIOR_IMPLEMENTATION: ['behavior_definition'],
    SERVICE_BINDING: ['service_definition_name', 'service_binding_version'],
  },
});

export function compactValidateSchemaFor<
  const M extends readonly ValidateMember[],
>(members: M) {
  const properties = {
    object_type: listedValues(members)
      .optional()
      .describe(`Object type to validate before create. ${supported(members)}`),
    ...VALIDATE_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_VALIDATE_TAKES, members),
    object_type: requiredField(properties.object_type),
    object_name: requiredField(properties.object_name),
  });
}

export const compactValidateSchema = compactValidateSchemaFor(
  COMPACT_VALIDATE.onprem,
);

/** A member of `HandlerDeletionCheck`'s `object_type`. */
type DeletionCheckMember = (typeof COMPACT_DELETION_CHECK.onprem)[number];

/** What `HandlerDeletionCheck` takes: the object's type and name, on every call. */
export const COMPACT_DELETION_CHECK_TAKES = takesOf<
  keyof ReturnType<typeof lifecycleObjectSchema>,
  DeletionCheckMember
>()({ every: ['object_type', 'object_name'], members: {} });

/** `HandlerDeletionCheck`: the one deletion-check request. */
export function compactDeletionCheckSchemaFor<
  const M extends readonly DeletionCheckMember[],
>(members: M) {
  const properties = {
    ...lifecycleObjectSchema(members),
  } as const;
  return z.object({
    ...offered(properties, COMPACT_DELETION_CHECK_TAKES, members),
    object_type: requiredField(properties.object_type),
    object_name: requiredField(properties.object_name),
  });
}

export const compactDeletionCheckSchema = compactDeletionCheckSchemaFor(
  COMPACT_DELETION_CHECK.onprem,
);

const LOCK_PROPERTIES = {
  super_package: z
    .string()
    .optional()
    .describe('Super package of the package to lock. Required for PACKAGE.'),
};

/** A member of `HandlerLock`'s `object_type`. */
type LockMember = (typeof COMPACT_LOCK.onprem)[number];

/** What `HandlerLock` takes: the object's type and name; a package its super package. */
export const COMPACT_LOCK_TAKES = takesOf<
  keyof ReturnType<typeof lifecycleObjectSchema> | keyof typeof LOCK_PROPERTIES,
  LockMember
>()({
  every: ['object_type', 'object_name'],
  members: { PACKAGE: ['super_package'] },
});

export function compactLockSchemaFor<const M extends readonly LockMember[]>(
  members: M,
) {
  const properties = {
    ...lifecycleObjectSchema(members),
    ...LOCK_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_LOCK_TAKES, members),
    object_type: requiredField(properties.object_type),
    object_name: requiredField(properties.object_name),
  });
}

export const compactLockSchema = compactLockSchemaFor(COMPACT_LOCK.onprem);

const UNLOCK_PROPERTIES = {
  lock_handle: z.string().optional().describe('Lock handle returned by lock.'),
};

/** A member of `HandlerUnlock`'s `object_type`. */
type UnlockMember = (typeof COMPACT_UNLOCK.onprem)[number];

/** What `HandlerUnlock` takes: the object's type, name and lock handle, on every call. */
export const COMPACT_UNLOCK_TAKES = takesOf<
  | keyof ReturnType<typeof lifecycleObjectSchema>
  | keyof typeof UNLOCK_PROPERTIES,
  UnlockMember
>()({ every: ['object_type', 'object_name', 'lock_handle'], members: {} });

export function compactUnlockSchemaFor<const M extends readonly UnlockMember[]>(
  members: M,
) {
  const properties = {
    ...lifecycleObjectSchema(members),
    ...UNLOCK_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_UNLOCK_TAKES, members),
    object_type: requiredField(properties.object_type),
    object_name: requiredField(properties.object_name),
    lock_handle: requiredField(properties.lock_handle),
  });
}

export const compactUnlockSchema = compactUnlockSchemaFor(
  COMPACT_UNLOCK.onprem,
);

const CHECK_RUN_PROPERTIES = {
  version: z
    .enum(['active', 'inactive'])
    .default('active')
    .optional()
    .describe('Version to syntax-check.'),
  source_code: z
    .string()
    .optional()
    .describe(
      'Source to check instead of the saved one; nothing is saved. CLASS, STRUCTURE and DDL only.',
    ),
};

/** A member of `HandlerCheckRun`'s `object_type`. */
type CheckMember = (typeof COMPACT_CHECK.onprem)[number];

/**
 * What `HandlerCheckRun` takes: the object's type, name and version; the
 * types whose check takes unsaved source, `source_code`.
 */
export const COMPACT_CHECK_TAKES = takesOf<
  | keyof ReturnType<typeof lifecycleObjectSchema>
  | keyof typeof CHECK_RUN_PROPERTIES,
  CheckMember
>()({
  every: ['object_type', 'object_name', 'version'],
  members: {
    CLASS: ['source_code'],
    STRUCTURE: ['source_code'],
    DDL: ['source_code'],
  },
});

export function compactCheckRunSchemaFor<
  const M extends readonly CheckMember[],
>(members: M) {
  const properties = {
    ...lifecycleObjectSchema(members),
    ...CHECK_RUN_PROPERTIES,
  } as const;
  return z.object({
    ...offered(properties, COMPACT_CHECK_TAKES, members),
    object_type: requiredField(properties.object_type),
    object_name: requiredField(properties.object_name),
    version: properties.version,
  });
}

export const compactCheckRunSchema = compactCheckRunSchemaFor(
  COMPACT_CHECK.onprem,
);

/** A member of `HandlerActivate`'s `object_type`. */
type ActivateMember = (typeof COMPACT_ACTIVATE.onprem)[number];

function activateProperties<const M extends readonly ActivateMember[]>(
  members: M,
  variant: ProjectionVariant,
) {
  return {
    object_type: objectTypeOf(
      members,
      "ABAP object type for routed compact operation. Names the object's type in the single form.",
    ),
    object_name: z
      .string()
      .optional()
      .describe(
        'Object name (single form). A function module is named GROUP|MODULE, its function group first, or the module alone with function_group_name.',
      ),
    function_group_name: z
      .string()
      .optional()
      .describe(
        "A function module's function group (single form, FUNCTION_MODULE).",
      ),
    object_adt_type: z
      .string()
      .optional()
      .describe(
        'ADT object type code (e.g. CLAS/OC, PROG/P) of the object (single form).',
      ),
    parentName: z
      .string()
      .optional()
      .describe(
        `With object_adt_type (single form): ${activationParentDescription(variant)}`,
      ),
    objects: z
      .array(
        z.object({
          name: z.string().describe('Object name.'),
          type: z.string().describe('ADT object type code.'),
          uri: z.string().optional().describe('Optional ADT object URI.'),
          parentName: z
            .string()
            .optional()
            .describe(activationParentDescription(variant)),
        }),
      )
      .optional()
      .describe('The objects activated together (list form).'),
    preaudit: z
      .boolean()
      .optional()
      .describe('Run pre-audit checks before activation.'),
  } as const;
}

/**
 * What `HandlerActivate` takes: the single form's name and ADT type, the
 * list form's objects and the pre-audit flag on every call; a function
 * module named alone, its function group.
 */
export const COMPACT_ACTIVATE_TAKES = takesOf<
  keyof ReturnType<typeof activateProperties<readonly ActivateMember[]>>,
  ActivateMember
>()({
  every: [
    'object_type',
    'object_name',
    'object_adt_type',
    'parentName',
    'objects',
    'preaudit',
  ],
  members: { FUNCTION_MODULE: ['function_group_name'] },
});

export function compactActivateSchemaFor<
  const M extends readonly ActivateMember[],
>(members: M, variant: ProjectionVariant) {
  const properties = activateProperties(members, variant);
  return z.object({
    ...offered(properties, COMPACT_ACTIVATE_TAKES, members),
    object_type: properties.object_type,
    object_name: properties.object_name,
    object_adt_type: properties.object_adt_type,
    parentName: properties.parentName,
    objects: properties.objects,
    preaudit: properties.preaudit,
  });
}

export const compactActivateSchema = compactActivateSchemaFor(
  COMPACT_ACTIVATE.onprem,
  'onprem',
);

/** Object search by name or mask. */
export const compactSearchSchema = z.object({
  timeout: TIMEOUT_FIELD,
  query: z.string().describe('Object name or mask, with * as a wildcard.'),
  object_type: z.string().optional().describe(SEARCH_TYPE_DESCRIPTION),
  max_results: z
    .number()
    .default(100)
    .optional()
    .describe('Maximum number of objects returned.'),
});

/** A member of `HandlerWhereUsed`'s `object_type`. */
type WhereUsedMember = (typeof COMPACT_WHERE_USED.onprem)[number];

function whereUsedProperties<const M extends readonly WhereUsedMember[]>(
  members: M,
) {
  return {
    timeout: TIMEOUT_FIELD,
    object_type: listedValues(members)
      .optional()
      .describe('Type of the object whose usages are listed.'),
    object_name: z.string().optional().describe('Object name.'),
    function_group_name: z
      .string()
      .optional()
      .describe('Function group of the function module (FUNCTION_MODULE).'),
    max_results: z
      .number()
      .default(100)
      .optional()
      .describe('Maximum number of referencing objects returned.'),
  } as const;
}

/** What `HandlerWhereUsed` takes: a function module's group beside the object every call names. */
export const COMPACT_WHERE_USED_TAKES = takesOf<
  keyof ReturnType<typeof whereUsedProperties<readonly WhereUsedMember[]>>,
  WhereUsedMember
>()({
  every: ['timeout', 'object_type', 'object_name', 'max_results'],
  members: { FUNCTION_MODULE: ['function_group_name'] },
});

/** Where-used list of one object. */
export function compactWhereUsedSchemaFor<
  const M extends readonly WhereUsedMember[],
>(members: M) {
  const properties = whereUsedProperties(members);
  return z.object({
    ...offered(properties, COMPACT_WHERE_USED_TAKES, members),
    timeout: properties.timeout,
    object_type: requiredField(properties.object_type),
    object_name: requiredField(properties.object_name),
    max_results: properties.max_results,
  });
}

export const compactWhereUsedSchema = compactWhereUsedSchemaFor(
  COMPACT_WHERE_USED.onprem,
);

/** Rows of a table or CDS view, or of an SQL SELECT. */
export const compactGetDataSchema = z.object({
  timeout: TIMEOUT_FIELD,
  object_name: z
    .string()
    .optional()
    .describe(
      'Table or CDS view whose rows are read, all columns. Used when sql_query is absent.',
    ),
  sql_query: z
    .string()
    .optional()
    .describe(
      'ABAP SQL SELECT naming the columns, conditions and order to read.',
    ),
  max_rows: z
    .number()
    .default(100)
    .optional()
    .describe('Maximum number of rows returned.'),
});

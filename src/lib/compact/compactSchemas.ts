import * as z from 'zod';
import {
  AMDP_FLAG,
  SETTINGS_SHAPE,
} from '../../handlers/table/tableSettingsFields';
import {
  HEADINGS,
  SELECTIONS,
  SYMBOLS,
} from '../../handlers/text_elements/textElementsShared';
import { RUN_TARGET_OPTIONAL } from '../../handlers/unit_test/shared/runTarget';
import {
  type ACTIVATION_CODES,
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
  supported,
  whereUsedTypeDescription,
} from '../adtProjections';
import { activationParentDescription } from '../adtTypeCode';
import { COMPACT_BACKGROUND_FIELD } from '../backgroundRuns/tools';
import {
  type DescriptionParts,
  longRunning,
  pairsPurpose,
  purpose,
  toolDescription,
} from '../description/index';
import { DETAIL_LEVELS } from '../detail/levels';
import { HANDLER_GET_DRAFT_TYPES } from '../draft/draftTypes';
import { dumpFiltersRefusal } from '../dumpFilters';
import {
  requiredText,
  stated,
  withInCallSchema,
} from '../handlers/argumentRules';
import { createArguments } from '../handlers/createArguments';
import type { ToolDefinition } from '../handlers/interfaces';
import { listedValues } from '../handlers/listedValues';
import { READ_DEFINITIONS } from '../handlers/readDefinitions';
import { READ_VERSION_FIELD } from '../handlers/readVersion';
import {
  COMPACT_LONG_BACKGROUND_DESCRIPTION,
  COMPACT_LONG_BACKGROUND_FIELD,
} from '../longTools';
import { MASTER_LANGUAGE_DESCRIPTION } from '../masterLanguage';
import { ANSWER_LEVELS } from '../search-source/answerLevel';
import { SCAN_OBJECT_TYPES } from '../search-source/packageEnumerator';
import { SEARCH_TYPE_DESCRIPTION } from '../searchTypes';
import { DETAIL_SHAPE } from '../strategies/detail';
import { FEED_PAGE_MAX } from '../strategies/feedPages';
import { byVariant } from '../variantDefinition';
import { exampleCodes, type Left, leftOf, listed, when } from './memberTexts';

/**
 * A compact tool's `object_type`: the members it routes on its variant (a
 * projection of `adtProjections.ts`).
 */
const objectTypeOf = <const M extends readonly string[]>(
  members: M,
  description = 'ABAP object type for routed compact operation.',
) => listedValues(members).optional().describe(description);

/**
 * A code argument narrowed by the deny list: an enum of the codes left,
 * taken as written (upper case) only.
 */
const codeEnum = (codes: readonly string[]) => listedValues(codes).optional();

/**
 * `properties` with the descriptions of `texts` in place of their own: the
 * texts that name members, rendered from those the deny list left.
 */
function redescribed<P extends Record<string, z.ZodType>>(
  properties: P,
  texts: { readonly [K in keyof P]?: string },
): P {
  const out = { ...properties };
  for (const key in texts) {
    const text = texts[key];
    if (text !== undefined) out[key] = out[key].describe(text);
  }
  return out;
}

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
  ? Record<never, never>
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
    .describe(
      'PACKAGE create. Optional: the package this package belongs to, which must exist (SAP creates the package with no super package when the named one is missing). Without one the package is top level, which SAP allows for a structure package or a package in software component LOCAL ($ or TEST names, no transport layer); in an ABAP Cloud software component the top level is a structure package (SAP answers TR 462 to any other).',
    ),
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
  task_type: z
    .enum(['S', 'R', 'X'])
    .optional()
    .describe(
      "The type given to the request's task (TRANSPORT create): S — Development/Correction (default), R — Repair, X — Unclassified, as SAP creates it.",
    ),
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
    TRANSPORT: ['transport_type', 'target_system', 'owner', 'task_type'],
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

/** HandlerCreate's texts that name more than one member. */
function createTexts(left: Left) {
  const groupOf = [
    ...(left.has('FUNCTION_GROUP') ? ['FUNCTION_GROUP'] : []),
    ...(left.has('FUNCTION_MODULE') ? ['the group of a FUNCTION_MODULE'] : []),
  ];
  const definitionOf = [
    ...(left.has('SERVICE_DEFINITION') ? ['SERVICE_DEFINITION'] : []),
    ...(left.has('SERVICE_BINDING')
      ? ['the definition a SERVICE_BINDING binds']
      : []),
  ];
  return {
    class_name: `ABAP class name (${left.of<CreateMember>(['CLASS', 'BEHAVIOR_IMPLEMENTATION']).join(', ')}).`,
    function_group_name: `ABAP function group name (${groupOf.join('; ')}).`,
    service_definition_name: `Service definition name (${definitionOf.join('; ')}).`,
  };
}

export function compactCreateSchemaFor<const M extends readonly CreateMember[]>(
  members: M,
  full: readonly CreateMember[] = members,
) {
  const properties = {
    object_type: objectTypeOf(members),
    ...redescribed(CREATE_PROPERTIES, createTexts(leftOf(full, members))),
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

/** The read types a background read applies to, as its description lists them. */
const BACKGROUND_READS = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TABLE',
  'STRUCTURE',
  'TABLE_TYPE',
  'DDL',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'CLASS',
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'PROGRAM',
  'INCLUDE',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
  'TRANSPORT',
  'TABLE_SETTINGS',
  'PROGRAM_TEXT_ELEMENTS',
  'FUNCTION_GROUP_TEXT_ELEMENTS',
  'CLASS_TEXT_ELEMENTS',
] as const;

/** HandlerGet's `background`, listing the read types left. */
function getBackground(left: Left) {
  const types = left.of(BACKGROUND_READS);
  return COMPACT_LONG_BACKGROUND_FIELD.describe(
    `${COMPACT_LONG_BACKGROUND_DESCRIPTION} Applies to the repository reads: ${types.length > 0 ? `object_type ${types.join(', ')}, and ` : ''}the parts object_structure, node_structure, virtual_folders.`,
  );
}

const GET_PROPERTIES = {
  part: readPartSchema,
  // The level of a read a changed full tool answers (compact parity): a
  // package's contents, an include's main programs, a transport's entries
  // and its own document, an object's structure.
  detail: DETAIL_SHAPE.detail,
  package_name: z.string().optional().describe('Package name.'),
  package_names: z
    .array(z.string())
    .optional()
    .describe(
      "Several package names (part contents), read together, as GetPackageContents answers them: at detail terse each package's rows under its '# asked' line, else one entry per package, in the order given.",
    ),
  max_results: z
    .number()
    .optional()
    .describe(
      'Accepted for compatibility (part contents): every member is answered.',
    ),
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
      'Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own. With part metadata: the request or task itself.',
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

/**
 * `HandlerGet`'s `part`, with `main_programs` where a member serves it and
 * `draft` for the members the draft part reads.
 */
function readPartFor(
  mainPrograms: readonly ReadMember[],
  draftTypes: readonly ReadMember[],
) {
  const extra: ('main_programs' | 'draft')[] = [
    ...(mainPrograms.length > 0 ? (['main_programs'] as const) : []),
    ...(draftTypes.length > 0 ? (['draft'] as const) : []),
  ];
  const words = [
    ...(mainPrograms.length > 0
      ? [
          `main_programs (${mainPrograms.join(', ')}): the include's main programs.`,
        ]
      : []),
    ...(draftTypes.length > 0
      ? [
          `draft (${draftTypes.join(', ')}): whether each part of the object holds an unactivated change, and whose.`,
        ]
      : []),
  ];
  return z
    .enum([...READ_PARTS, ...extra])
    .default('source')
    .optional()
    .describe(
      words.length === 0
        ? READ_PART_WORDS
        : `${READ_PART_WORDS} ${words.join(' ')}`,
    );
}

/**
 * What `HandlerGet` takes: the part, and the repository-address and
 * activation-run parts' arguments, on every call; per type the name its read
 * takes, and `version` where its `Get<Type>` reads one.
 */
export const COMPACT_READ_TAKES = takesOf<
  'background' | 'object_type' | keyof typeof GET_PROPERTIES,
  ReadMember
>()({
  every: [
    'background',
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
    'detail',
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
    TABLE_SETTINGS: ['table_name', 'version'],
    PROGRAM_TEXT_ELEMENTS: ['program_name', 'version'],
    FUNCTION_GROUP_TEXT_ELEMENTS: ['function_group_name', 'version'],
    CLASS_TEXT_ELEMENTS: ['class_name', 'version'],
  },
});

/** HandlerGet's texts that name more than one member. */
function getTexts(left: Left) {
  const groupOf = [
    ...(left.has('FUNCTION_GROUP') ? ['FUNCTION_GROUP'] : []),
    ...(left.has('FUNCTION_MODULE')
      ? ["FUNCTION_MODULE given as the module's name"]
      : []),
  ];
  const runs = left.of<ReadMember>(['UNIT_TEST', 'CDS_UNIT_TEST']);
  return {
    function_group_name: `Function group name (${groupOf.join('; ')}).`,
    run_id: `Run id: ${runs.length > 0 ? `a unit test run (${runs.join(', ')}) or ` : ''}an activation run (parts activation_status, activation_results).`,
  };
}

/** HandlerGet's properties on `members`, and its `object_adt_type` when `codes` are given. */
function getParts<const M extends readonly ReadMember[]>(
  members: M,
  codes: readonly string[] | undefined,
  full: readonly ReadMember[],
) {
  const left = leftOf(full, members);
  const properties = {
    background: getBackground(left),
    object_type: objectTypeOf(members),
    ...redescribed(GET_PROPERTIES, getTexts(left)),
  } as const;
  const codeArgument =
    codes === undefined
      ? {}
      : {
          object_adt_type: codeEnum(codes).describe(
            'ADT type code of the object (object_structure) or of the parent node (node_structure).',
          ),
        };
  return {
    properties,
    codeArgument,
    offeredProperties: offered(properties, COMPACT_READ_TAKES, members),
  };
}

/**
 * HandlerGet's schema when the deny list leaves it names (`members`): it
 * takes `object_type`. The definition's own schema is this one.
 */
export function compactGetSchemaWithNamesFor<
  const M extends readonly ReadMember[],
>(
  members: M,
  mainPrograms: readonly ReadMember[] = [],
  codes?: readonly string[],
  full: readonly ReadMember[] = members,
  draftTypes: readonly ReadMember[] = [],
) {
  const { properties, codeArgument, offeredProperties } = getParts(
    members,
    codes,
    full,
  );
  return z.object({
    ...offeredProperties,
    background: properties.background,
    object_type: properties.object_type,
    part: readPartFor(mainPrograms, draftTypes),
    ...codeArgument,
  });
}

/**
 * HandlerGet's schema when the deny list denies every name: the parts that
 * read no object are left, and it takes no `object_type`.
 */
export function compactGetSchemaWithoutNamesFor(
  mainPrograms: readonly ReadMember[] = [],
  codes?: readonly string[],
  full: readonly ReadMember[] = [],
  draftTypes: readonly ReadMember[] = [],
) {
  const { properties, codeArgument, offeredProperties } = getParts(
    [],
    codes,
    full,
  );
  const { object_type: _none, ...rest } = offeredProperties;
  return z.object({
    ...rest,
    background: properties.background,
    part: readPartFor(mainPrograms, draftTypes),
    ...codeArgument,
  });
}

/** HandlerGet's schema on `members`: with names, or without when none is left. */
export function compactGetSchemaFor<const M extends readonly ReadMember[]>(
  members: M,
  mainPrograms: readonly ReadMember[] = [],
  codes?: readonly string[],
  full: readonly ReadMember[] = members,
  draftTypes: readonly ReadMember[] = [],
) {
  return members.length > 0
    ? compactGetSchemaWithNamesFor(
        members,
        mainPrograms,
        codes,
        full,
        draftTypes,
      )
    : compactGetSchemaWithoutNamesFor(mainPrograms, codes, full, draftTypes);
}

export const compactGetSchema = compactGetSchemaWithNamesFor(
  COMPACT_READ.onprem,
  COMPACT_MAIN_PROGRAMS.onprem,
  undefined,
  COMPACT_READ.onprem,
  HANDLER_GET_DRAFT_TYPES.onprem,
);

/** UpdateTableSettings' settings, each written over the stored one (TABLE_SETTINGS). */
function settingsFields() {
  const { table_name: _name, ...settings } = SETTINGS_SHAPE;
  return settings;
}

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
  ...settingsFields(),
  is_writable_by_amdp: AMDP_FLAG.describe(
    `TABLE_SETTINGS on the cloud: ${AMDP_FLAG.description ?? ''}`,
  ),
  symbols: SYMBOLS,
  selections: SELECTIONS,
  headings: HEADINGS,
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
    TABLE_SETTINGS: [
      'table_name',
      'data_class',
      'size_category',
      'buffering',
      'storage_type',
      'sharing_type',
      'load_unit',
      'translation',
      'logging_enabled',
      'is_writable_by_amdp',
    ],
    PROGRAM_TEXT_ELEMENTS: [
      'program_name',
      'symbols',
      'selections',
      'headings',
    ],
    FUNCTION_GROUP_TEXT_ELEMENTS: [
      'function_group_name',
      'symbols',
      'selections',
      'headings',
    ],
    CLASS_TEXT_ELEMENTS: ['class_name', 'symbols'],
  },
});

/** HandlerUpdate's texts that name more than one member. */
function updateTexts(left: Left) {
  const metadata = [
    ...left.of<UpdateMember>([
      'PACKAGE',
      'DOMAIN',
      'DATA_ELEMENT',
      'FUNCTION_GROUP',
      'TABLE_TYPE',
    ]),
    ...(left.has('INCLUDE') ? ['INCLUDE with part metadata'] : []),
  ];
  return {
    source_code: `The content written: the source${when(metadata.length > 0, `, or for ${listed(metadata)} the whole metadata document`)}.`,
    ddl_code: `Complete DDL source code (for ${left.of<UpdateMember>(['TABLE', 'STRUCTURE']).join('/')} update).`,
    test_class_source: `ABAP source of the local test classes (${listed(left.of<UpdateMember>(['UNIT_TEST', 'CDS_UNIT_TEST']))} update).`,
  };
}

export function compactUpdateSchemaFor<const M extends readonly UpdateMember[]>(
  members: M,
  full: readonly UpdateMember[] = members,
) {
  const properties = {
    object_type: objectTypeOf(members),
    ...redescribed(UPDATE_PROPERTIES, updateTexts(leftOf(full, members))),
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

/** HandlerDelete's texts that name more than one member. */
function deleteTexts(left: Left) {
  return {
    lock_handle: `The lock handle of the class (${left.of(EMPTIED_INCLUDE_TYPES).join(', ')}): the include is written empty under it.`,
  };
}

export function compactDeleteSchemaFor<const M extends readonly DeleteMember[]>(
  members: M,
  full: readonly DeleteMember[] = members,
) {
  const properties = {
    object_type: listedValues(members)
      .optional()
      .describe(`Object type. ${supported(members)}`),
    ...redescribed(DELETE_PROPERTIES, deleteTexts(leftOf(full, members))),
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

export const compactProfileListSchema = z.object({ ...DETAIL_SHAPE });

export const compactProfileViewSchema = z.object({
  background: COMPACT_LONG_BACKGROUND_FIELD,
  trace_id_or_uri: requiredText(
    'Parameter "trace_id_or_uri" is required',
  ).describe('Profiler trace id or URI.'),
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

/** `HandlerDumpList`'s arguments but `background`. */
const DUMP_LIST_FIELDS = {
  ...DETAIL_SHAPE,
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
};

/** The refusal of a `top` outside one page. */
const DUMP_LIST_TOP_WORDS = `top must be a whole number from 1 to ${FEED_PAGE_MAX}, the most entries SAP answers in one request; read on with the next_to of the answer as to.`;

/** `top` one page at most; the dumps filters only on the dumps feed, each one operand. */
function dumpListRules(
  args: z.output<z.ZodObject<typeof DUMP_LIST_FIELDS>>,
  ctx: z.RefinementCtx,
): void {
  const top = args.top;
  if (
    top !== undefined &&
    (!Number.isInteger(top) || top < 1 || top > FEED_PAGE_MAX)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: DUMP_LIST_TOP_WORDS,
      path: ['top'],
    });
  }
  const refused = dumpFiltersRefusal(args.feed_type ?? 'dumps', args);
  if (refused !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: refused.words,
      path: [refused.path],
    });
  }
}

export const compactDumpListSchema = withInCallSchema(
  z
    .object({ background: COMPACT_LONG_BACKGROUND_FIELD, ...DUMP_LIST_FIELDS })
    .superRefine(dumpListRules),
  z.object(DUMP_LIST_FIELDS).superRefine(dumpListRules),
);

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
  task_type: z
    .enum(['S', 'R', 'X'])
    .default('S')
    .optional()
    .describe(
      "Type given to the request's task: S Development/Correction (default), R Repair, X Unclassified.",
    ),
  ...DETAIL_SHAPE,
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

/** HandlerValidate's texts that name more than one member. */
function validateTexts(left: Left) {
  const packaged = left.of<ValidateMember>([
    'BEHAVIOR_DEFINITION',
    'BEHAVIOR_IMPLEMENTATION',
    'METADATA_EXTENSION',
    'SERVICE_BINDING',
  ]);
  const described = left.of<ValidateMember>([
    'FUNCTION_MODULE',
    'BEHAVIOR_DEFINITION',
    'METADATA_EXTENSION',
  ]);
  return {
    object_name: `Required object name.${when(left.has('SERVICE_BINDING'), ' For SERVICE_BINDING this is the service binding name;')} ${left.has('SERVICE_BINDING') ? 'a' : 'A'} function module is named GROUP|MODULE.`,
    package_name: `Package of the object to validate.${when(packaged.length > 0, ` Required for ${listed(packaged)}.`)}`,
    description: `Object description used during validation.${when(described.length > 0, ` Required for ${listed(described)}.`)}`,
  };
}

export function compactValidateSchemaFor<
  const M extends readonly ValidateMember[],
>(members: M, full: readonly ValidateMember[] = members) {
  const properties = {
    object_type: listedValues(members)
      .optional()
      .describe(`Object type to validate before create. ${supported(members)}`),
    ...redescribed(VALIDATE_PROPERTIES, validateTexts(leftOf(full, members))),
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

/** HandlerLock's actions: a deny entry may close either (`HandlerLock.unlock`). */
export const LOCK_ACTIONS = ['lock', 'unlock'] as const;
type LockAction = (typeof LOCK_ACTIONS)[number];

/** The words of an unlock asked with no lock handle. */
export const UNLOCK_NEEDS_HANDLE_WORDS =
  'lock_handle is required for action unlock: the handle the lock gave; nothing was sent';

const LOCK_PROPERTIES = {
  action: z
    .enum(LOCK_ACTIONS)
    .default('lock')
    .optional()
    .describe(
      'lock (default): lock the object for editing; unlock: release the lock lock_handle names.',
    ),
  lock_handle: z
    .string()
    .optional()
    .describe('unlock: the lock handle the lock gave.'),
  super_package: z
    .string()
    .optional()
    .describe(
      "PACKAGE: accepted for compatibility; the lock uses the package's name.",
    ),
};

/** A member of `HandlerLock`'s `object_type`. */
type LockMember = (typeof COMPACT_LOCK.onprem)[number];

/**
 * What `HandlerLock` takes: the action, the object's type and name, the lock
 * handle an unlock releases; a package also its super package.
 */
export const COMPACT_LOCK_TAKES = takesOf<
  keyof ReturnType<typeof lifecycleObjectSchema> | keyof typeof LOCK_PROPERTIES,
  LockMember
>()({
  every: ['action', 'object_type', 'object_name', 'lock_handle'],
  members: { PACKAGE: ['super_package'] },
});

/** HandlerLock's fields for `members`, before its rule. */
function lockObject<const M extends readonly LockMember[]>(members: M) {
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

/** An unlock names the lock it releases: without lock_handle it is refused. */
function unlockNamesItsLock(
  value: {
    readonly action?: LockAction | undefined;
    readonly lock_handle?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    value.action === 'unlock' &&
    (value.lock_handle === undefined || value.lock_handle.trim() === '')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['lock_handle'],
      message: UNLOCK_NEEDS_HANDLE_WORDS,
    });
  }
}

/**
 * What `HandlerLock` takes for `members`: lock (the default) the object, or
 * unlock it under the lock_handle the lock gave — required for an unlock,
 * refused without it before anything is sent.
 */
export function compactLockSchemaFor<const M extends readonly LockMember[]>(
  members: M,
) {
  return lockObject(members).superRefine(unlockNamesItsLock);
}

/**
 * HandlerLock's schema with `actions` left by a deny list: the lock alone
 * takes no lock_handle; the unlock alone states its action and requires its
 * lock_handle.
 */
export function compactLockSchemaOf(
  members: readonly LockMember[],
  actions: readonly LockAction[],
): z.ZodObject {
  if (actions.includes('lock') && actions.includes('unlock')) {
    return compactLockSchemaFor(members);
  }
  if (actions.includes('lock')) {
    return lockObject(members)
      .omit({ lock_handle: true })
      .extend({
        action: z
          .enum(['lock'])
          .default('lock')
          .optional()
          .describe('lock (default): lock the object for editing.'),
      });
  }
  return lockObject(members).extend({
    action: z
      .enum(['unlock'])
      .describe('unlock: release the lock lock_handle names.'),
    lock_handle: requiredText(UNLOCK_NEEDS_HANDLE_WORDS).describe(
      'unlock: the lock handle the lock gave.',
    ),
  });
}

export const compactLockSchema = compactLockSchemaFor(COMPACT_LOCK.onprem);

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

/** HandlerCheckRun's texts that name more than one member. */
function checkRunTexts(left: Left) {
  return {
    source_code: `Source to check instead of the saved one; nothing is saved. ${listed(left.of<CheckMember>(['CLASS', 'STRUCTURE', 'DDL']))} only.`,
  };
}

export function compactCheckRunSchemaFor<
  const M extends readonly CheckMember[],
>(members: M, full: readonly CheckMember[] = members) {
  const properties = {
    ...lifecycleObjectSchema(members),
    ...redescribed(CHECK_RUN_PROPERTIES, checkRunTexts(leftOf(full, members))),
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

/** The codes `object_adt_type`'s description names as its examples. */
const ADT_TYPE_EXAMPLES: readonly (typeof ACTIVATION_CODES.onprem)[number][] = [
  'CLAS/OC',
  'PROG/P',
];

/** A member of `HandlerActivate`'s `object_type`. */
type ActivateMember = (typeof COMPACT_ACTIVATE.onprem)[number];

function activateProperties<const M extends readonly ActivateMember[]>(
  members: M,
  variant: ProjectionVariant,
  codes?: readonly string[],
) {
  const parent = activationParentDescription(variant, codes);
  const examples =
    codes === undefined
      ? 'CLAS/OC, PROG/P'
      : exampleCodes(ADT_TYPE_EXAMPLES, codes, 2).join(', ');
  const codeType =
    codes === undefined
      ? z.string().describe('ADT object type code.')
      : listedValues(codes).describe('ADT object type code.');
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
    object_adt_type: (codes === undefined
      ? z.string().optional()
      : codeEnum(codes)
    ).describe(
      `ADT object type code (e.g. ${examples}) of the object (single form).`,
    ),
    parentName: z
      .string()
      .optional()
      .describe(`With object_adt_type (single form): ${parent}`),
    objects: z
      .array(
        z.object({
          name: z.string().describe('Object name.'),
          type: codeType,
          uri: z.string().optional().describe('Optional ADT object URI.'),
          parentName: z.string().optional().describe(parent),
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

/**
 * HandlerActivate's schema when the deny list leaves it names (`members`):
 * it takes `object_type`. The definition's own schema is this one.
 */
export function compactActivateSchemaWithNamesFor<
  const M extends readonly ActivateMember[],
>(members: M, variant: ProjectionVariant, codes?: readonly string[]) {
  const properties = activateProperties(members, variant, codes);
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

/**
 * HandlerActivate's schema when the deny list denies every name: the objects
 * are named by their codes, and it takes no `object_type`.
 */
export function compactActivateSchemaWithoutNamesFor(
  variant: ProjectionVariant,
  codes?: readonly string[],
) {
  const properties = activateProperties([], variant, codes);
  const { object_type: _none, ...rest } = offered(
    properties,
    COMPACT_ACTIVATE_TAKES,
    [],
  );
  return z.object({
    ...rest,
    object_name: properties.object_name,
    object_adt_type: properties.object_adt_type,
    parentName: properties.parentName,
    objects: properties.objects,
    preaudit: properties.preaudit,
  });
}

/** HandlerActivate's schema on `members`: with names, or without when none is left. */
export function compactActivateSchemaFor<
  const M extends readonly ActivateMember[],
>(members: M, variant: ProjectionVariant, codes?: readonly string[]) {
  return members.length > 0
    ? compactActivateSchemaWithNamesFor(members, variant, codes)
    : compactActivateSchemaWithoutNamesFor(variant, codes);
}

export const compactActivateSchema = compactActivateSchemaWithNamesFor(
  COMPACT_ACTIVATE.onprem,
  'onprem',
);

/**
 * `HandlerSystem`'s actions, each one full tool's read (DO21): the action
 * alone picks the tool.
 */
export const SYSTEM_ACTIONS = [
  'search_source',
  'search_object',
  'where_used',
  'package_tree',
  'transports',
  'atc_findings',
  'atc_results',
  'atc_result',
] as const;

/** One of {@link SYSTEM_ACTIONS}. */
export type SystemAction = (typeof SYSTEM_ACTIONS)[number];

/** The full tool each action calls, by its entry. */
export const SYSTEM_ACTION_TOOLS = {
  search_source: 'SearchSource',
  search_object: 'SearchObject',
  where_used: 'GetWhereUsed',
  package_tree: 'GetPackageTree',
  transports: 'ListTransports',
  atc_findings: 'GetATCFindings',
  atc_results: 'ListATCResults',
  atc_result: 'GetATCResult',
} as const satisfies Readonly<Record<SystemAction, string>>;

/** What a property's words say, per action that takes it. */
type SaidPerAction = { readonly [A in SystemAction]?: string };

/**
 * The words of `said` for the actions of `actions` that take the property,
 * each prefixed by the actions that say the same: `a, b: words`. A narrowed
 * definition names only the actions left.
 */
function said(actions: readonly SystemAction[], words: SaidPerAction): string {
  const groups: Array<{
    readonly names: SystemAction[];
    readonly text: string;
  }> = [];
  for (const action of actions) {
    const text = words[action];
    if (text === undefined) continue;
    const same = groups.find((group) => group.text === text);
    if (same === undefined) groups.push({ names: [action], text });
    else same.names.push(action);
  }
  return groups
    .map((group) => `${group.names.join(', ')}: ${group.text}`)
    .join(' ');
}

/** The words of `detail`: the full tool's own, for each action that takes it. */
const DETAIL_WORDS = DETAIL_SHAPE.detail.description ?? '';

/** Each action as `action` lists it. */
const ACTION_WORDS: Readonly<Record<SystemAction, string>> = {
  search_source: 'search_source (source text in packages)',
  search_object: 'search_object (objects by name or mask)',
  where_used: 'where_used (the objects that use an object)',
  package_tree: 'package_tree (a package tree)',
  transports: 'transports (transport requests)',
  atc_findings: 'atc_findings (the findings of an ATC run)',
  atc_results: 'atc_results (the stored ATC results)',
  atc_result: 'atc_result (one stored ATC result)',
};

/**
 * Every property an action of `HandlerSystem` takes on `variant`, each typed
 * as its full tool types it, optional, with no default (the full tool's own
 * parse applies its defaults), its words naming those of `actions` that take
 * it.
 */
function systemProperties(
  variant: ProjectionVariant,
  actions: readonly SystemAction[],
) {
  return {
    background: COMPACT_LONG_BACKGROUND_FIELD,
    action: listedValues(actions).describe(
      `The read: ${actions.map((action) => ACTION_WORDS[action]).join(', ')}.`,
    ),
    query: z
      .string()
      .min(1)
      .optional()
      .describe(
        said(actions, {
          search_source:
            'primary substring to match (case-insensitive, ABAP CS).',
        }),
      ),
    query2: z
      .string()
      .optional()
      .describe(
        said(actions, {
          search_source:
            'a second substring; when set, both query and query2 must appear on the same line.',
        }),
      ),
    exclude: z
      .array(z.string())
      .max(3)
      .optional()
      .describe(
        said(actions, {
          search_source:
            'up to 3 substrings; a line containing any of them is dropped.',
        }),
      ),
    packages: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe(
        said(actions, {
          search_source:
            'packages to scan, each an exact package name or a mask (`*` zero or more characters, `?` one character; `+`, `_`, `%` and `#` are characters of the name).',
        }),
      ),
    include_subpackages: z
      .boolean()
      .optional()
      .describe(
        said(actions, {
          search_source: 'recurse into subpackages (default true).',
          package_tree: 'expand subpackages recursively (default true).',
        }),
      ),
    object_filter: z
      .string()
      .optional()
      .describe(
        said(actions, {
          search_source:
            'glob applied to object names within each package (e.g. "Z*").',
        }),
      ),
    object_types: z
      .array(z.enum(SCAN_OBJECT_TYPES))
      .optional()
      .describe(
        said(actions, {
          search_source:
            'object types to scan, by main type: PROG (programs and program includes), FUGR, CLAS, INTF, DDLS, BDEF, DDLX, SRVD (default all of them).',
        }),
      ),
    exclude_comments: z
      .boolean()
      .optional()
      .describe(
        said(actions, {
          search_source:
            "skip col-1 '*' and full-line '\"' comment lines (default false).",
        }),
      ),
    max_hits_per_object: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        said(actions, {
          search_source:
            'the most hits answered per object; absent, every hit.',
        }),
      ),
    max_hits: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        said(actions, {
          search_source:
            'the most hits of the whole answer; reached, the scan stops reading. Absent, every hit.',
        }),
      ),
    answer: z
      .enum(ANSWER_LEVELS)
      .optional()
      .describe(
        said(actions, {
          search_source:
            'what each hit is answered as: lines (the default at detail terse), snippets (the default at medium and full) or objects.',
        }),
      ),
    version: z
      .enum(['active', 'inactive', 'workingArea'])
      .optional()
      .describe(
        said(actions, {
          search_source:
            'the version every source is read at (default active).',
        }),
      ),
    object_name: z
      .string()
      .optional()
      .describe(
        said(actions, {
          search_object: "object name or mask (e.g. 'MARA*').",
          where_used:
            "name of the object (with object_type), a function module as 'GROUP|FM_NAME'.",
        }),
      ),
    object_type: z
      .string()
      .optional()
      .describe(
        said(actions, {
          search_object: SEARCH_TYPE_DESCRIPTION,
          where_used: whereUsedTypeDescription(variant),
        }),
      ),
    container: z
      .enum(['program', 'function_group'])
      .optional()
      .describe(
        said(actions, {
          where_used:
            'with object_type PROG/PX, required: whose text elements they are, program or function_group; taken by PROG/PX alone.',
        }),
      ),
    maxResults: z
      .number()
      .optional()
      .describe(
        said(actions, {
          search_object: 'maximum number of results to return (default 100).',
        }),
      ),
    detail: z
      .enum(DETAIL_LEVELS)
      .optional()
      .describe(
        said(actions, {
          search_source: DETAIL_WORDS,
          search_object: DETAIL_WORDS,
          where_used: DETAIL_WORDS,
          package_tree: DETAIL_WORDS,
          transports: DETAIL_WORDS,
          atc_findings: DETAIL_WORDS,
          atc_result: DETAIL_WORDS,
        }),
      ),
    objects: z
      .array(
        z.object({
          object_name: z
            .string()
            .describe(
              "Name of the ABAP object; a function module as 'GROUP|FM_NAME'",
            ),
          object_type: z
            .string()
            .describe('Type of the ABAP object, as object_type takes it'),
          container: z
            .enum(['program', 'function_group'])
            .optional()
            .describe(
              'With object_type PROG/PX, required: whose text elements they are, program or function_group. Taken by PROG/PX alone.',
            ),
        }),
      )
      .optional()
      .describe(
        said(actions, {
          where_used:
            'several objects, read together (give this or object_name and object_type); the type filters apply to every object.',
        }),
      ),
    enable_all_types: z
      .boolean()
      .optional()
      .describe(
        said(actions, {
          where_used:
            'true selects every object type of the where-used scope (default false, the SAP default scope).',
        }),
      ),
    enable_only_types: z
      .array(z.string())
      .optional()
      .describe(
        said(actions, {
          where_used:
            "the only ADT object types searched, codes of the object's where-used scope (e.g. 'CLAS/OC', 'DDLS/DF').",
        }),
      ),
    disable_types: z
      .array(z.string())
      .optional()
      .describe(
        said(actions, {
          where_used:
            "ADT object types removed from the scope (e.g. ['CLAS/OC']).",
        }),
      ),
    package_name: z
      .string()
      .optional()
      .describe(
        said(actions, {
          package_tree: 'package name (give this or package_names).',
        }),
      ),
    package_names: z
      .array(z.string())
      .optional()
      .describe(
        said(actions, {
          package_tree:
            'several package names, read together (give this or package_name).',
        }),
      ),
    max_depth: z
      .number()
      .int()
      .optional()
      .describe(
        said(actions, {
          package_tree: 'maximum depth of the walk (default 5).',
        }),
      ),
    include_descriptions: z
      .boolean()
      .optional()
      .describe(
        said(actions, {
          package_tree:
            "each object's description in the answer (default false).",
        }),
      ),
    debug: z
      .boolean()
      .optional()
      .describe(
        said(actions, {
          package_tree:
            'diagnostic metadata in the answer (counts, types, hierarchy; default false).',
        }),
      ),
    user: z
      .string()
      .optional()
      .describe(
        said(actions, {
          transports:
            "the SAP user id whose requests are listed (default the session's user).",
        }),
      ),
    modifiable_only: z
      .boolean()
      .optional()
      .describe(
        said(actions, {
          transports: 'only modifiable (unreleased) requests (default true).',
        }),
      ),
    worklist_id: z
      .string()
      .optional()
      .describe(
        said(actions, {
          atc_findings: 'worklist identifier an ATC run answered.',
        }),
      ),
    created_by: z
      .string()
      .optional()
      .describe(
        said(actions, {
          atc_results: 'whose results: a user name, or * for every user.',
        }),
      ),
    central_only: z
      .boolean()
      .optional()
      .describe(
        said(actions, { atc_results: 'true lists central results only.' }),
      ),
    age_min: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        said(actions, { atc_results: 'youngest age to list, in days.' }),
      ),
    age_max: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(said(actions, { atc_results: 'oldest age to list, in days.' })),
    display_id: z
      .string()
      .optional()
      .describe(
        said(actions, { atc_result: 'display ID of a stored ATC result.' }),
      ),
  } as const;
}

/** A property of `HandlerSystem`. */
type SystemProperty = keyof ReturnType<typeof systemProperties>;

/**
 * What each action of `HandlerSystem` takes: exactly its full tool's
 * arguments, `background` the tool's own.
 */
export const COMPACT_SYSTEM_TAKES = takesOf<SystemProperty, SystemAction>()({
  every: ['background', 'action'],
  members: {
    search_source: [
      'query',
      'query2',
      'exclude',
      'packages',
      'include_subpackages',
      'object_filter',
      'object_types',
      'exclude_comments',
      'max_hits_per_object',
      'max_hits',
      'answer',
      'version',
      'detail',
    ],
    search_object: ['object_name', 'object_type', 'maxResults', 'detail'],
    where_used: [
      'object_name',
      'object_type',
      'container',
      'objects',
      'enable_all_types',
      'enable_only_types',
      'disable_types',
      'detail',
    ],
    package_tree: [
      'package_name',
      'package_names',
      'include_subpackages',
      'max_depth',
      'include_descriptions',
      'debug',
      'detail',
    ],
    transports: ['user', 'modifiable_only', 'detail'],
    atc_findings: ['worklist_id', 'detail'],
    atc_results: ['created_by', 'central_only', 'age_min', 'age_max'],
    atc_result: ['display_id', 'detail'],
  },
});

/**
 * `HandlerSystem`'s input on `variant` with `actions`: one flat object,
 * `action` required, the properties no action of `actions` takes left out.
 */
export function compactSystemSchemaFor(
  variant: ProjectionVariant,
  actions: readonly SystemAction[],
  // Stated by every caller, `undefined` included: a default here would
  // turn the no-variant schema into the on-premise one.
  rules: ProjectionVariant | undefined,
) {
  const properties = systemProperties(variant, actions);
  const { background, ...taken } = offered(
    properties,
    COMPACT_SYSTEM_TAKES,
    actions,
  );
  const rule = actionTargetRule(rules);
  return withInCallSchema(
    z
      .object({ background, ...taken, action: properties.action })
      .superRefine(rule),
    z.object({ ...taken, action: properties.action }).superRefine(rule),
  );
}

/**
 * Each action's arguments are its full tool's, checked by that tool's own
 * schema on `variant` (`SYSTEM_ACTION_TOOLS`; none: its own, the variant's
 * type lists unread): a refusal names the tool and says its words, at the
 * argument.
 */
function actionTargetRule(variant: ProjectionVariant | undefined) {
  return (
    args: { action: SystemAction; background?: boolean | undefined },
    ctx: z.RefinementCtx,
  ): void => {
    const { action, background: _background, ...given } = args;
    const definition: ToolDefinition =
      READ_DEFINITIONS[SYSTEM_ACTION_TOOLS[action]];
    const schema =
      variant === undefined
        ? definition.inputSchema
        : (definition.variants?.[variant].inputSchema ??
          definition.inputSchema);
    const parsed = schema.safeParse(given);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: 'custom',
        message: `${definition.name}: ${issue.message}`,
        path: issue.path,
      });
    }
  };
}

/** What each read gives, in the purpose's words. */
const SYSTEM_PAIRS: Readonly<Record<SystemAction, string>> = {
  search_source: 'searches the source code of packages for text',
  search_object: 'finds repository objects by name',
  where_used: 'finds where a repository object is used',
  package_tree: 'reads a package with its subpackages and their objects',
  transports: "reads a user's transports",
  atc_findings: "reads an ATC run's findings",
  atc_results: 'reads the stored ATC results',
  atc_result: 'reads one stored ATC result with its findings',
};

/**
 * `HandlerSystem`'s parts with `actions`: what its actions find and read,
 * in action words.
 */
export function handlerSystemParts(
  actions: readonly SystemAction[] = SYSTEM_ACTIONS,
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: pairsPurpose(actions.map((action) => SYSTEM_PAIRS[action])),
    notes: [longRunning],
  };
}

/** `HandlerSystem`'s description with `actions`, naming only those actions. */
export function handlerSystemDescription(
  actions: readonly SystemAction[] = SYSTEM_ACTIONS,
): string {
  return toolDescription(handlerSystemParts(actions));
}

/** `HandlerSystem`'s description with every action. */
export const HANDLER_SYSTEM_DESCRIPTION = handlerSystemDescription();

/**
 * `HandlerSystem`'s description, schema and members on `variant` with
 * `actions`: its members are the actions it offers.
 */
export function handlerSystemDefinitionFor(
  variant: ProjectionVariant,
  actions: readonly SystemAction[],
) {
  return {
    description: handlerSystemDescription(actions),
    inputSchema: compactSystemSchemaFor(variant, actions, variant),
    members: actions,
  };
}

/** `HandlerSystem`'s description and schema, per variant, every action. */
export function handlerSystemDefinition() {
  return {
    ...byVariant((variant) =>
      handlerSystemDefinitionFor(variant, SYSTEM_ACTIONS),
    ),
    // No variant stated: the targets' own schemas, their type lists unread.
    inputSchema: compactSystemSchemaFor('onprem', SYSTEM_ACTIONS, undefined),
  };
}

/** The properties of `HandlerGetData` beside its `sql_query`. */
function getDataProperties(sql: boolean) {
  return {
    object_name: z
      .string()
      .optional()
      .describe(
        `Table or CDS view whose rows are read, all columns.${sql ? ' Used when sql_query is absent.' : ''}`,
      ),
  };
}

const MAX_ROWS = {
  max_rows: z
    .number()
    .default(100)
    .optional()
    .describe('Maximum number of rows returned.'),
};

/** `detail`, the data tools' own: how much of the rows' answer to return. */
const DATA_DETAIL = { detail: DETAIL_SHAPE.detail };

/** Rows of a table or CDS view, or of an SQL SELECT. */
/** What `HandlerGetData` reads: `sql_query` when stated, else `object_name`; one of them. */
function oneDataRead(
  args: { object_name?: string | undefined; sql_query?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (!stated(args.sql_query) && !stated(args.object_name)) {
    ctx.addIssue({
      code: 'custom',
      message: 'object_name or sql_query is required',
      path: ['object_name'],
    });
  }
}

/** Rows of a table or CDS view, or of an SQL SELECT: the fields but `background`. */
const GET_DATA_FIELDS = {
  ...getDataProperties(true),
  sql_query: z
    .string()
    .optional()
    .describe(
      'ABAP SQL SELECT naming the columns, conditions and order to read.',
    ),
  ...MAX_ROWS,
  ...DATA_DETAIL,
};

export const compactGetDataSchema = withInCallSchema(
  z
    .object({ background: COMPACT_LONG_BACKGROUND_FIELD, ...GET_DATA_FIELDS })
    .superRefine(oneDataRead),
  z.object(GET_DATA_FIELDS).superRefine(oneDataRead),
);

/** The table read alone: the fields but `background`. */
const GET_TABLE_DATA_FIELDS = {
  ...getDataProperties(false),
  ...MAX_ROWS,
  ...DATA_DETAIL,
};

/**
 * `HandlerGetData`'s description and schema: with `sql`, the table read and
 * `sql_query`; without, the table read alone, `sql_query` named nowhere.
 */
export function handlerGetDataDefinition(sql: boolean) {
  return sql
    ? handlerGetDataWithSqlDefinition()
    : handlerGetDataWithoutSqlDefinition();
}

/** `HandlerGetData` with `sql_query`: the definition's own statement. */
export function handlerGetDataWithSqlDefinition() {
  return {
    description: toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Reads the data of an ABAP database table or CDS view, or the data an ABAP SQL SELECT selects, up to the number of records asked.',
      ),
      notes: [longRunning],
    }),
    inputSchema: compactGetDataSchema,
  };
}

/** `HandlerGetData` without `sql_query`: the table read alone. */
export function handlerGetDataWithoutSqlDefinition() {
  return {
    description: toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Reads the data of an ABAP database table or CDS view, up to the number of records asked.',
      ),
      notes: [longRunning],
    }),
    inputSchema: withInCallSchema(
      z
        .object({
          background: COMPACT_LONG_BACKGROUND_FIELD,
          ...GET_TABLE_DATA_FIELDS,
        })
        .superRefine(oneDataRead),
      z.object(GET_TABLE_DATA_FIELDS).superRefine(oneDataRead),
    ),
  };
}

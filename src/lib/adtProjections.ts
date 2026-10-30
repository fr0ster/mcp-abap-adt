/**
 * What each operation of a tool accepts, per variant, projected from the ADT
 * type tables (#329, spec 5): the **accepted ADT codes** and the **accepted
 * friendly names** of each argument that names an object's type.
 *
 * **Derived by the compiler, listed once.** Each projection is a type over
 * the variant's table (`ADT_TYPES_ONPREM`, `ADT_TYPES_CLOUD`): the codes
 * whose entry lists an operation ({@link AcceptedCode}), the APIs and kinds
 * that do ({@link AcceptedApi}, {@link AcceptedKind}), or, for a tool's own
 * names, the names of its route table whose need the table serves
 * ({@link ServedName}, {@link ServedCodeName}). The runtime list a schema
 * enum and a description need is written out once, `as const`, and handed to
 * {@link projected}, which compiles only when the list is exactly its
 * projection — a member missing or one too many fails at the list. A table
 * that changes fails the build here, never a tool at run time.
 *
 * A list holds what the tool's handler routes and the table serves: a name
 * the handler does not route is in no list, whatever the table says, and a
 * name the table does not list for the operation is in no list, whatever
 * the handler routes.
 */
import type {
  AdtActivationCode,
  AdtWhereUsedCode,
} from '@mcp-abap-adt/adt-clients';
import type {
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  AdtApiName,
  AdtApiWith,
  AdtOperation,
  AdtTypeCode,
  AdtTypeCodeWith,
} from '@mcp-abap-adt/interfaces-adt';
import type { CompactObjectType } from './compact/compactObjectTypes';
import type { AbapSystemKind } from './systemKind';

/** A variant the server serves: the table its tool set is built from. */
export type ProjectionVariant = AbapSystemKind;

/** The variants, in the order every per-variant record is written. */
export const PROJECTION_VARIANTS = [
  'onprem',
  'cloud',
] as const satisfies readonly ProjectionVariant[];

/** The table of each variant, as a type. */
interface VariantTables {
  readonly onprem: typeof ADT_TYPES_ONPREM;
  readonly cloud: typeof ADT_TYPES_CLOUD;
}

/** The accepted ADT codes of `Op` on `V`: the codes whose entry lists it. */
export type AcceptedCode<
  V extends ProjectionVariant,
  Op extends AdtOperation,
> = AdtTypeCodeWith<V, Op>;

/** The APIs one code (or the codeless entry) of which lists `Op` on `V`. */
export type AcceptedApi<
  V extends ProjectionVariant,
  Op extends AdtOperation,
> = AdtApiWith<V, Op>;

/** The kind `V`'s table gives API `A`. */
type KindOf<V extends ProjectionVariant, A> = A extends keyof VariantTables[V]
  ? VariantTables[V][A] extends { readonly kind: infer K }
    ? K
    : never
  : never;

/** The accepted kinds of `Op` on `V`: the kinds of {@link AcceptedApi}. */
export type AcceptedKind<
  V extends ProjectionVariant,
  Op extends AdtOperation,
> = KindOf<V, AcceptedApi<V, Op>>;

/**
 * The operations some table lists for API `A` (one of its codes, or its
 * codeless entry): a need naming another does not compile.
 */
type AdtOperationOf<A extends AdtApiName> = {
  [Op in AdtOperation]: A extends
    | AdtApiWith<'onprem', Op>
    | AdtApiWith<'cloud', Op>
    | AdtApiWith<'basis740', Op>
    ? Op
    : never;
}[AdtOperation];

/** What a route needs of the variant's table: one operation of one API. */
export type AdtNeed = {
  [A in AdtApiName]: {
    readonly api: A;
    readonly operation: AdtOperationOf<A>;
  };
}[AdtApiName];

/** Whether `V`'s table serves need `N`. */
type Serves<V extends ProjectionVariant, N> = N extends {
  readonly api: infer A;
  readonly operation: infer Op extends AdtOperation;
}
  ? [A] extends [AcceptedApi<V, Op>]
    ? true
    : false
  : false;

/** The names of route table `R` (name → need) whose need `V` serves. */
export type ServedName<V extends ProjectionVariant, R> = {
  [K in keyof R]: Serves<V, R[K]> extends true ? K : never;
}[keyof R] &
  string;

/** The names of route table `R` (name → code) whose code is one of `P`. */
export type ServedCodeName<R, P> = {
  [K in keyof R]: R[K] extends P ? K : never;
}[keyof R] &
  string;

/** Compiles only when `Listed` names every member of `All`. */
type Complete<Listed, All> = [Exclude<All, Listed>] extends [never]
  ? unknown
  : { readonly missingFromTheList: Exclude<All, Listed> };

/** One argument's values on each variant. */
export interface VariantValues<
  On extends string = string,
  Cl extends string = string,
> {
  readonly onprem: readonly On[];
  readonly cloud: readonly Cl[];
}

/**
 * The values of one argument on each variant, each list exactly its
 * projection: `projected<OnPremProjection, CloudProjection>()({ onprem,
 * cloud })`. A list naming a value outside its projection does not compile
 * (the element type), nor one leaving a value of it out ({@link Complete}).
 */
export function projected<On extends string, Cl extends string>() {
  return <
    const LO extends readonly On[],
    const LC extends readonly Cl[],
  >(values: {
    readonly onprem: LO & Complete<LO[number], On>;
    readonly cloud: LC & Complete<LC[number], Cl>;
  }): { readonly onprem: LO; readonly cloud: LC } => values;
}

/** `Supported: A, B, C.` — the values an argument's description names. */
export function supported(values: readonly string[]): string {
  return `Supported: ${values.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// The names the tools have always taken for a code
// ---------------------------------------------------------------------------

/**
 * The names the tools took for a type before adt-clients 38 stopped reading
 * them, each with the code of the tables it addressed: the friendly names of
 * its where-used aliases and the main types its address builder read
 * (adt-clients 37.2.0). The tools' arguments name them, so the server reads
 * them now; each code is checked against the tables here.
 */
export const TYPE_NAMES = {
  class: 'CLAS/OC',
  program: 'PROG/P',
  include: 'PROG/I',
  function: 'FUGR/F',
  functiongroup: 'FUGR/F',
  interface: 'INTF/OI',
  package: 'DEVC/K',
  table: 'TABL/DT',
  structure: 'TABL/DS',
  domain: 'DOMA/DD',
  dataelement: 'DTEL/DE',
  view: 'DDLS/DF',
  functionmodule: 'FUGR/FF',
  function_module: 'FUGR/FF',
  clas: 'CLAS/OC',
  prog: 'PROG/P',
  fugr: 'FUGR/F',
  func: 'FUGR/F',
  tabl: 'TABL/DT',
  stru: 'TABL/DS',
  'stru/ds': 'TABL/DS',
  ddls: 'DDLS/DF',
  dtel: 'DTEL/DE',
  doma: 'DOMA/DD',
  intf: 'INTF/OI',
  ttyp: 'TTYP/DA',
  srvd: 'SRVD/SRV',
  srvb: 'SRVB/SVB',
  ddlx: 'DDLX/EX',
  bdef: 'BDEF/BDO',
  dcls: 'DCLS/DL',
  xslt: 'XSLT/VT',
  ftg2: 'FTG2/FT',
  devc: 'DEVC/K',
} as const satisfies Readonly<Record<string, AdtTypeCode>>;

/** A name of {@link TYPE_NAMES}. */
export type TypeName = keyof typeof TYPE_NAMES;

/** The names of {@link TYPE_NAMES} whose code is one of `P`. */
export type TypeNameFor<P> = ServedCodeName<typeof TYPE_NAMES, P>;

// ---------------------------------------------------------------------------
// Where-used (GetWhereUsed, HandlerWhereUsed)
// ---------------------------------------------------------------------------

/** The codes where-used is asked of on `V` (adt-clients' `getWhereUsed`). */
export type WhereUsedCode<V extends ProjectionVariant> = AdtWhereUsedCode<V>;

/** GetWhereUsed's `object_type` codes. */
export const WHERE_USED_CODES = projected<
  WhereUsedCode<'onprem'>,
  WhereUsedCode<'cloud'>
>()({
  onprem: [
    'CLAS/OC',
    'INTF/OI',
    'PROG/P',
    'PROG/I',
    'FUGR/F',
    'FUGR/FF',
    'DEVC/K',
    'DDLS/DF',
    'TABL/DT',
    'TABL/DS',
    'TTYP/DA',
    'DOMA/DD',
    'DTEL/DE',
    'DCLS/DL',
    'BDEF/BDO',
    'DDLX/EX',
    'SRVD/SRV',
    'SRVB/SVB',
    'DSFD/SCF',
    'DSFI/SFI',
    'XSLT/VT',
    'MSAG/N',
    'FTG2/FT',
    'AUTH',
    'ENHO/XHH',
    'ENHO/XHB',
    'ENHS/XSB',
  ],
  cloud: [
    'CLAS/OC',
    'INTF/OI',
    'PROG/P',
    'PROG/I',
    'FUGR/F',
    'FUGR/FF',
    'DEVC/K',
    'DDLS/DF',
    'TABL/DT',
    'TABL/DS',
    'TTYP/DA',
    'DOMA/DD',
    'DTEL/DE',
    'DCLS/DL',
    'BDEF/BDO',
    'DDLX/EX',
    'SRVD/SRV',
    'SRVB/SVB',
    'DSFD/SCF',
    'DSFI/SFI',
    'XSLT/VT',
    'MSAG/N',
    'FTG2/FT',
    'AUTH',
    'ENHO/XHH',
    'ENHO/XHB',
    'ENHS/XSB',
  ],
});

/** Every name of {@link TYPE_NAMES}, in its order. */
const TYPE_NAME_LIST = [
  'class',
  'program',
  'include',
  'function',
  'functiongroup',
  'interface',
  'package',
  'table',
  'structure',
  'domain',
  'dataelement',
  'view',
  'functionmodule',
  'function_module',
  'clas',
  'prog',
  'fugr',
  'func',
  'tabl',
  'stru',
  'stru/ds',
  'ddls',
  'dtel',
  'doma',
  'intf',
  'ttyp',
  'srvd',
  'srvb',
  'ddlx',
  'bdef',
  'dcls',
  'xslt',
  'ftg2',
  'devc',
] as const;

/** The names of {@link TYPE_NAMES} GetWhereUsed takes for a where-used code. */
export const WHERE_USED_NAMES = projected<
  TypeNameFor<WhereUsedCode<'onprem'>>,
  TypeNameFor<WhereUsedCode<'cloud'>>
>()({ onprem: TYPE_NAME_LIST, cloud: TYPE_NAME_LIST });

/**
 * The codes of `codes`, each followed by the names of `names` that stand for
 * it: `CLAS/OC (class, clas), INTF/OI (interface, intf), DSFD/SCF`.
 */
export function codesWithNames(
  codes: readonly AdtTypeCode[],
  names: readonly TypeName[],
): string {
  return codes
    .map((code) => {
      const standing = names.filter((name) => TYPE_NAMES[name] === code);
      return standing.length === 0 ? code : `${code} (${standing.join(', ')})`;
    })
    .join(', ');
}

/**
 * HandlerWhereUsed's `object_type`: each compact name with the name of
 * {@link TYPE_NAMES} it is handed to GetWhereUsed as.
 */
export const COMPACT_WHERE_USED_ROUTES = {
  CLASS: 'class',
  INTERFACE: 'interface',
  PROGRAM: 'program',
  INCLUDE: 'include',
  FUNCTION_GROUP: 'functiongroup',
  FUNCTION_MODULE: 'functionmodule',
  PACKAGE: 'package',
  TABLE: 'table',
  STRUCTURE: 'structure',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'dataelement',
  DDL: 'view',
} as const satisfies Readonly<Record<string, TypeName>>;

/** The compact names whose where-used name stands for a code of `P`. */
type CompactWhereUsedName<P> = {
  [K in keyof typeof COMPACT_WHERE_USED_ROUTES]: (typeof TYPE_NAMES)[(typeof COMPACT_WHERE_USED_ROUTES)[K]] extends P
    ? K
    : never;
}[keyof typeof COMPACT_WHERE_USED_ROUTES];

/** HandlerWhereUsed's `object_type`. */
export const COMPACT_WHERE_USED = projected<
  CompactWhereUsedName<WhereUsedCode<'onprem'>>,
  CompactWhereUsedName<WhereUsedCode<'cloud'>>
>()({
  onprem: [
    'CLASS',
    'INTERFACE',
    'PROGRAM',
    'INCLUDE',
    'FUNCTION_GROUP',
    'FUNCTION_MODULE',
    'PACKAGE',
    'TABLE',
    'STRUCTURE',
    'DOMAIN',
    'DATA_ELEMENT',
    'DDL',
  ],
  cloud: [
    'CLASS',
    'INTERFACE',
    'PROGRAM',
    'INCLUDE',
    'FUNCTION_GROUP',
    'FUNCTION_MODULE',
    'PACKAGE',
    'TABLE',
    'STRUCTURE',
    'DOMAIN',
    'DATA_ELEMENT',
    'DDL',
  ],
});

// ---------------------------------------------------------------------------
// Activation (ActivateObjects, HandlerActivate)
// ---------------------------------------------------------------------------

/** The codes a group activation activates on `V` (`activateObjectsGroup`). */
export type ActivationCode<V extends ProjectionVariant> = AdtActivationCode<V>;

/** ActivateObjects' `objects[].type` codes: what a group activation takes. */
export const ACTIVATION_CODES = projected<
  ActivationCode<'onprem'>,
  ActivationCode<'cloud'>
>()({
  onprem: [
    'CLAS/OC',
    'INTF/OI',
    'PROG/P',
    'PROG/I',
    'FUGR/F',
    'FUGR/FF',
    'FUGR/I',
    'DEVC/K',
    'DDLS/DF',
    'TABL/DT',
    'TABL/DS',
    'TTYP/DA',
    'DOMA/DD',
    'DTEL/DE',
    'DCLS/DL',
    'BDEF/BDO',
    'DDLX/EX',
    'SRVD/SRV',
    'SRVB/SVB',
    'DSFD/SCF',
    'DSFI/SFI',
    'XSLT/VT',
    'FTG2/FT',
    'AUTH',
    'ENHO/XHH',
    'ENHO/XHB',
    'ENHS/XSB',
  ],
  cloud: [
    'CLAS/OC',
    'INTF/OI',
    'FUGR/F',
    'FUGR/FF',
    'FUGR/I',
    'DEVC/K',
    'DDLS/DF',
    'TABL/DT',
    'TABL/DS',
    'TTYP/DA',
    'DOMA/DD',
    'DTEL/DE',
    'DCLS/DL',
    'BDEF/BDO',
    'DDLX/EX',
    'SRVD/SRV',
    'SRVB/SVB',
    'DSFD/SCF',
    'DSFI/SFI',
    'XSLT/VT',
    'AUTH',
    'ENHO/XHH',
    'ENHO/XHB',
    'ENHS/XSB',
  ],
});

/** The names of {@link TYPE_NAMES} a group activation takes for its code. */
export const ACTIVATION_NAMES = projected<
  TypeNameFor<ActivationCode<'onprem'>>,
  TypeNameFor<ActivationCode<'cloud'>>
>()({
  onprem: TYPE_NAME_LIST,
  cloud: TYPE_NAME_LIST.filter(
    (name) =>
      name !== 'program' &&
      name !== 'prog' &&
      name !== 'include' &&
      name !== 'ftg2',
  ),
});

/**
 * The single objects the activation tools activate through their family's
 * own `activate()` (`handleActivateObject`): each code, and each friendly
 * name, with the API whose activation it is.
 */
export const SINGLE_ACTIVATION_ROUTES = {
  'CLAS/OC': { api: 'class', operation: 'activate' },
  class: { api: 'class', operation: 'activate' },
  'PROG/P': { api: 'program', operation: 'activate' },
  program: { api: 'program', operation: 'activate' },
  'INTF/OI': { api: 'interface', operation: 'activate' },
  interface: { api: 'interface', operation: 'activate' },
  'FUGR/F': { api: 'functionGroup', operation: 'activate' },
  function_group: { api: 'functionGroup', operation: 'activate' },
  'TABL/DT': { api: 'table', operation: 'activate' },
  table: { api: 'table', operation: 'activate' },
  'TABL/DS': { api: 'structure', operation: 'activate' },
  structure: { api: 'structure', operation: 'activate' },
  'DDLS/DF': { api: 'ddl', operation: 'activate' },
  ddl: { api: 'ddl', operation: 'activate' },
  'DOMA/DD': { api: 'domain', operation: 'activate' },
  domain: { api: 'domain', operation: 'activate' },
  'DTEL/DE': { api: 'dataElement', operation: 'activate' },
  data_element: { api: 'dataElement', operation: 'activate' },
  'BDEF/BDO': { api: 'behaviorDefinition', operation: 'activate' },
  behavior_definition: { api: 'behaviorDefinition', operation: 'activate' },
  'DDLX/EX': { api: 'metadataExtension', operation: 'activate' },
  metadata_extension: { api: 'metadataExtension', operation: 'activate' },
} as const satisfies Readonly<Record<string, AdtNeed>>;

/** The codes and names of a single-object activation on each variant. */
export const SINGLE_ACTIVATION = projected<
  ServedName<'onprem', typeof SINGLE_ACTIVATION_ROUTES>,
  ServedName<'cloud', typeof SINGLE_ACTIVATION_ROUTES>
>()({
  onprem: [
    'CLAS/OC',
    'class',
    'PROG/P',
    'program',
    'INTF/OI',
    'interface',
    'FUGR/F',
    'function_group',
    'TABL/DT',
    'table',
    'TABL/DS',
    'structure',
    'DDLS/DF',
    'ddl',
    'DOMA/DD',
    'domain',
    'DTEL/DE',
    'data_element',
    'BDEF/BDO',
    'behavior_definition',
    'DDLX/EX',
    'metadata_extension',
  ],
  cloud: [
    'CLAS/OC',
    'class',
    'INTF/OI',
    'interface',
    'FUGR/F',
    'function_group',
    'TABL/DT',
    'table',
    'TABL/DS',
    'structure',
    'DDLS/DF',
    'ddl',
    'DOMA/DD',
    'domain',
    'DTEL/DE',
    'data_element',
    'BDEF/BDO',
    'behavior_definition',
    'DDLX/EX',
    'metadata_extension',
  ],
});

/**
 * HandlerActivate's `object_type`: each compact name with the code it is
 * activated as — through its family when {@link SINGLE_ACTIVATION} names it,
 * else in a group activation.
 */
export const COMPACT_ACTIVATE_ROUTES = {
  CLASS: 'CLAS/OC',
  PROGRAM: 'PROG/P',
  INTERFACE: 'INTF/OI',
  FUNCTION_GROUP: 'FUGR/F',
  TABLE: 'TABL/DT',
  STRUCTURE: 'TABL/DS',
  DDL: 'DDLS/DF',
  DOMAIN: 'DOMA/DD',
  DATA_ELEMENT: 'DTEL/DE',
  BEHAVIOR_DEFINITION: 'BDEF/BDO',
  METADATA_EXTENSION: 'DDLX/EX',
  PACKAGE: 'DEVC/K',
  SERVICE_DEFINITION: 'SRVD/SRV',
  SERVICE_BINDING: 'SRVB/SVB',
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtTypeCode>>>;

/** HandlerActivate's `object_type`. */
export const COMPACT_ACTIVATE = projected<
  ServedCodeName<typeof COMPACT_ACTIVATE_ROUTES, ActivationCode<'onprem'>>,
  ServedCodeName<typeof COMPACT_ACTIVATE_ROUTES, ActivationCode<'cloud'>>
>()({
  onprem: [
    'CLASS',
    'PROGRAM',
    'INTERFACE',
    'FUNCTION_GROUP',
    'TABLE',
    'STRUCTURE',
    'DDL',
    'DOMAIN',
    'DATA_ELEMENT',
    'BEHAVIOR_DEFINITION',
    'METADATA_EXTENSION',
    'PACKAGE',
    'SERVICE_DEFINITION',
    'SERVICE_BINDING',
  ],
  cloud: [
    'CLASS',
    'INTERFACE',
    'FUNCTION_GROUP',
    'TABLE',
    'STRUCTURE',
    'DDL',
    'DOMAIN',
    'DATA_ELEMENT',
    'BEHAVIOR_DEFINITION',
    'METADATA_EXTENSION',
    'PACKAGE',
    'SERVICE_DEFINITION',
    'SERVICE_BINDING',
  ],
});

/** The compact names whose code {@link SINGLE_ACTIVATION_ROUTES} activates directly on `V`. */
type CompactSingleActivation<V extends ProjectionVariant> = {
  [K in keyof typeof COMPACT_ACTIVATE_ROUTES]: (typeof COMPACT_ACTIVATE_ROUTES)[K] extends ServedName<
    V,
    typeof SINGLE_ACTIVATION_ROUTES
  >
    ? K
    : never;
}[keyof typeof COMPACT_ACTIVATE_ROUTES];

/** The compact names HandlerActivate activates directly, one object alone. */
export const COMPACT_SINGLE_ACTIVATION = projected<
  CompactSingleActivation<'onprem'>,
  CompactSingleActivation<'cloud'>
>()({
  onprem: [
    'CLASS',
    'PROGRAM',
    'INTERFACE',
    'FUNCTION_GROUP',
    'TABLE',
    'STRUCTURE',
    'DDL',
    'DOMAIN',
    'DATA_ELEMENT',
    'BEHAVIOR_DEFINITION',
    'METADATA_EXTENSION',
  ],
  cloud: [
    'CLASS',
    'INTERFACE',
    'FUNCTION_GROUP',
    'TABLE',
    'STRUCTURE',
    'DDL',
    'DOMAIN',
    'DATA_ELEMENT',
    'BEHAVIOR_DEFINITION',
    'METADATA_EXTENSION',
  ],
});

// ---------------------------------------------------------------------------
// Includes (GetIncludesList)
// ---------------------------------------------------------------------------

/**
 * The parents GetIncludesList walks, by code: a program's and an include's
 * source names its includes, a class's metadata its includes, a function
 * group's structure its includes.
 */
export const INCLUDES_PARENT_ROUTES = {
  'PROG/P': { api: 'program', operation: 'source' },
  'PROG/I': { api: 'include', operation: 'source' },
  'FUGR/F': { api: 'functionGroup', operation: 'readMetadata' },
  'CLAS/OC': { api: 'class', operation: 'readMetadata' },
} as const satisfies Readonly<Partial<Record<AdtTypeCode, AdtNeed>>>;

/** GetIncludesList's `object_type`. */
export const INCLUDES_PARENTS = projected<
  ServedName<'onprem', typeof INCLUDES_PARENT_ROUTES>,
  ServedName<'cloud', typeof INCLUDES_PARENT_ROUTES>
>()({
  onprem: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC'],
  cloud: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC'],
});

// ---------------------------------------------------------------------------
// Versions (GetObjectVersions, GetObjectVersionSource, GetObjectVersionDiff)
// ---------------------------------------------------------------------------

/** The kinds the generic version tools read, each with its API. */
export const VERSIONED_ROUTES = {
  class: { api: 'class', operation: 'versions' },
  program: { api: 'program', operation: 'versions' },
  interface: { api: 'interface', operation: 'versions' },
  function_module: { api: 'functionModule', operation: 'versions' },
  table: { api: 'table', operation: 'versions' },
  structure: { api: 'structure', operation: 'versions' },
  ddl: { api: 'ddl', operation: 'versions' },
  behavior_definition: { api: 'behaviorDefinition', operation: 'versions' },
  metadata_extension: { api: 'metadataExtension', operation: 'versions' },
} as const satisfies Readonly<Record<string, AdtNeed>>;

/** The generic version tools' `object_type`. */
export const VERSIONED_KINDS = projected<
  ServedName<'onprem', typeof VERSIONED_ROUTES>,
  ServedName<'cloud', typeof VERSIONED_ROUTES>
>()({
  onprem: [
    'class',
    'program',
    'interface',
    'function_module',
    'table',
    'structure',
    'ddl',
    'behavior_definition',
    'metadata_extension',
  ],
  cloud: [
    'class',
    'program',
    'interface',
    'function_module',
    'table',
    'structure',
    'ddl',
    'behavior_definition',
    'metadata_extension',
  ],
});

// ---------------------------------------------------------------------------
// The compact tools whose `object_type` (or `target_type`) picks the API
// ---------------------------------------------------------------------------
//
// A cloud list is its on-premise list without `PROGRAM` where ABAP cloud
// serves no program for the operation: the filter's narrowed element type is
// what `projected` checks against the cloud projection.

/** What `HandlerCreate` creates, each with its API. */
export const COMPACT_CREATE_ROUTES = {
  PACKAGE: { api: 'package', operation: 'create' },
  DOMAIN: { api: 'domain', operation: 'create' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'create' },
  TRANSPORT: { api: 'request', operation: 'create' },
  TABLE: { api: 'table', operation: 'create' },
  STRUCTURE: { api: 'structure', operation: 'create' },
  DDL: { api: 'ddl', operation: 'create' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'create' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'create' },
  CLASS: { api: 'class', operation: 'create' },
  PROGRAM: { api: 'program', operation: 'create' },
  INTERFACE: { api: 'interface', operation: 'create' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'create' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'create' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'create' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'create',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'create' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const CREATE_ONPREM = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TRANSPORT',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'CLASS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
] as const;

/** HandlerCreate's `object_type`. */
export const COMPACT_CREATE = projected<
  ServedName<'onprem', typeof COMPACT_CREATE_ROUTES>,
  ServedName<'cloud', typeof COMPACT_CREATE_ROUTES>
>()({
  onprem: CREATE_ONPREM,
  cloud: CREATE_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/** What `HandlerGet` reads, each with its API. */
export const COMPACT_READ_ROUTES = {
  PACKAGE: { api: 'package', operation: 'readMetadata' },
  DOMAIN: { api: 'domain', operation: 'readMetadata' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'readMetadata' },
  TABLE: { api: 'table', operation: 'read' },
  STRUCTURE: { api: 'structure', operation: 'read' },
  DDL: { api: 'ddl', operation: 'read' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'read' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'read' },
  CLASS: { api: 'class', operation: 'read' },
  LOCAL_TEST_CLASS: { api: 'localTestClass', operation: 'read' },
  LOCAL_TYPES: { api: 'localTypes', operation: 'read' },
  LOCAL_DEFINITIONS: { api: 'localDefinitions', operation: 'read' },
  LOCAL_MACROS: { api: 'localMacros', operation: 'read' },
  PROGRAM: { api: 'program', operation: 'read' },
  INTERFACE: { api: 'interface', operation: 'read' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'read' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'read' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'read' },
  BEHAVIOR_IMPLEMENTATION: { api: 'behaviorImplementation', operation: 'read' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'read' },
  UNIT_TEST: { api: 'class', operation: 'unitTestResult' },
  CDS_UNIT_TEST: { api: 'class', operation: 'unitTestResult' },
  TRANSPORT: { api: 'request', operation: 'readObjects' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const READ_ONPREM = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'CLASS',
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
  'UNIT_TEST',
  'CDS_UNIT_TEST',
  'TRANSPORT',
] as const;

/** HandlerGet's `object_type`: a program is read on both variants. */
export const COMPACT_READ = projected<
  ServedName<'onprem', typeof COMPACT_READ_ROUTES>,
  ServedName<'cloud', typeof COMPACT_READ_ROUTES>
>()({ onprem: READ_ONPREM, cloud: READ_ONPREM });

/** What `HandlerUpdate` writes, each with its API. */
export const COMPACT_UPDATE_ROUTES = {
  PACKAGE: { api: 'package', operation: 'updateMetadata' },
  DOMAIN: { api: 'domain', operation: 'updateMetadata' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'updateMetadata' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'update' },
  TABLE: { api: 'table', operation: 'update' },
  STRUCTURE: { api: 'structure', operation: 'update' },
  DDL: { api: 'ddl', operation: 'update' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'update' },
  CLASS: { api: 'class', operation: 'update' },
  LOCAL_TEST_CLASS: { api: 'localTestClass', operation: 'update' },
  LOCAL_TYPES: { api: 'localTypes', operation: 'update' },
  LOCAL_DEFINITIONS: { api: 'localDefinitions', operation: 'update' },
  LOCAL_MACROS: { api: 'localMacros', operation: 'update' },
  UNIT_TEST: { api: 'localTestClass', operation: 'update' },
  CDS_UNIT_TEST: { api: 'localTestClass', operation: 'update' },
  PROGRAM: { api: 'program', operation: 'update' },
  INTERFACE: { api: 'interface', operation: 'update' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'update' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'update' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'update',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'update' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'update' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const UPDATE_ONPREM = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'FUNCTION_GROUP',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'SERVICE_DEFINITION',
  'CLASS',
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'UNIT_TEST',
  'CDS_UNIT_TEST',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
  'SERVICE_BINDING',
] as const;

/** HandlerUpdate's `object_type`. */
export const COMPACT_UPDATE = projected<
  ServedName<'onprem', typeof COMPACT_UPDATE_ROUTES>,
  ServedName<'cloud', typeof COMPACT_UPDATE_ROUTES>
>()({
  onprem: UPDATE_ONPREM,
  cloud: UPDATE_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/**
 * What `HandlerDelete` removes, each with its API. A class include and the
 * unit tests are deleted by writing the include empty under the class's
 * lock (`handleDeleteOnly`).
 */
export const COMPACT_DELETE_ROUTES = {
  PACKAGE: { api: 'package', operation: 'delete' },
  DOMAIN: { api: 'domain', operation: 'delete' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'delete' },
  TABLE: { api: 'table', operation: 'delete' },
  STRUCTURE: { api: 'structure', operation: 'delete' },
  DDL: { api: 'ddl', operation: 'delete' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'delete' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'delete' },
  CLASS: { api: 'class', operation: 'delete' },
  CDS_UNIT_TEST: { api: 'class', operation: 'delete' },
  PROGRAM: { api: 'program', operation: 'delete' },
  INTERFACE: { api: 'interface', operation: 'delete' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'delete' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'delete' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'delete' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'delete',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'delete' },
  LOCAL_TEST_CLASS: { api: 'localTestClass', operation: 'update' },
  LOCAL_TYPES: { api: 'localTypes', operation: 'update' },
  LOCAL_DEFINITIONS: { api: 'localDefinitions', operation: 'update' },
  LOCAL_MACROS: { api: 'localMacros', operation: 'update' },
  UNIT_TEST: { api: 'localTestClass', operation: 'update' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const DELETE_ONPREM = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'CLASS',
  'CDS_UNIT_TEST',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'UNIT_TEST',
] as const;

/** HandlerDelete's `object_type`. */
export const COMPACT_DELETE = projected<
  ServedName<'onprem', typeof COMPACT_DELETE_ROUTES>,
  ServedName<'cloud', typeof COMPACT_DELETE_ROUTES>
>()({
  onprem: DELETE_ONPREM,
  cloud: DELETE_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/** What `HandlerLock` locks, each with its API. */
export const COMPACT_LOCK_ROUTES = {
  CLASS: { api: 'class', operation: 'lock' },
  PROGRAM: { api: 'program', operation: 'lock' },
  INTERFACE: { api: 'interface', operation: 'lock' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'lock' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'lock' },
  TABLE: { api: 'table', operation: 'lock' },
  STRUCTURE: { api: 'structure', operation: 'lock' },
  DDL: { api: 'ddl', operation: 'lock' },
  DOMAIN: { api: 'domain', operation: 'lock' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'lock' },
  PACKAGE: { api: 'package', operation: 'lock' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'lock' },
  BEHAVIOR_IMPLEMENTATION: { api: 'behaviorImplementation', operation: 'lock' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'lock' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'lock' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'lock' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

/** What `HandlerUnlock` unlocks, each with its API. */
export const COMPACT_UNLOCK_ROUTES = {
  CLASS: { api: 'class', operation: 'unlock' },
  PROGRAM: { api: 'program', operation: 'unlock' },
  INTERFACE: { api: 'interface', operation: 'unlock' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'unlock' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'unlock' },
  TABLE: { api: 'table', operation: 'unlock' },
  STRUCTURE: { api: 'structure', operation: 'unlock' },
  DDL: { api: 'ddl', operation: 'unlock' },
  DOMAIN: { api: 'domain', operation: 'unlock' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'unlock' },
  PACKAGE: { api: 'package', operation: 'unlock' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'unlock' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'unlock',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'unlock' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'unlock' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'unlock' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const LOCK_ONPREM = [
  'CLASS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'DOMAIN',
  'DATA_ELEMENT',
  'PACKAGE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
] as const;

/** HandlerLock's `object_type`. */
export const COMPACT_LOCK = projected<
  ServedName<'onprem', typeof COMPACT_LOCK_ROUTES>,
  ServedName<'cloud', typeof COMPACT_LOCK_ROUTES>
>()({
  onprem: LOCK_ONPREM,
  cloud: LOCK_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/** HandlerUnlock's `object_type`. */
export const COMPACT_UNLOCK = projected<
  ServedName<'onprem', typeof COMPACT_UNLOCK_ROUTES>,
  ServedName<'cloud', typeof COMPACT_UNLOCK_ROUTES>
>()({
  onprem: LOCK_ONPREM,
  cloud: LOCK_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/** What `HandlerValidate` validates, each with its API. */
export const COMPACT_VALIDATE_ROUTES = {
  CLASS: { api: 'class', operation: 'validate' },
  PROGRAM: { api: 'program', operation: 'validate' },
  INTERFACE: { api: 'interface', operation: 'validate' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'validate' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'validate' },
  TABLE: { api: 'table', operation: 'validate' },
  STRUCTURE: { api: 'structure', operation: 'validate' },
  DDL: { api: 'ddl', operation: 'validate' },
  DOMAIN: { api: 'domain', operation: 'validate' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'validate' },
  PACKAGE: { api: 'package', operation: 'validate' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'validate' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'validate',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'validate' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'validate' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const VALIDATE_ONPREM = [
  'CLASS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'DOMAIN',
  'DATA_ELEMENT',
  'PACKAGE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
  'SERVICE_BINDING',
] as const;

/** HandlerValidate's `object_type`. */
export const COMPACT_VALIDATE = projected<
  ServedName<'onprem', typeof COMPACT_VALIDATE_ROUTES>,
  ServedName<'cloud', typeof COMPACT_VALIDATE_ROUTES>
>()({
  onprem: VALIDATE_ONPREM,
  cloud: VALIDATE_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/** What `HandlerCheckRun` checks, each with its API. */
export const COMPACT_CHECK_ROUTES = {
  CLASS: { api: 'class', operation: 'check' },
  PROGRAM: { api: 'program', operation: 'check' },
  INTERFACE: { api: 'interface', operation: 'check' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'check' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'check' },
  TABLE: { api: 'table', operation: 'check' },
  STRUCTURE: { api: 'structure', operation: 'check' },
  DDL: { api: 'ddl', operation: 'check' },
  DOMAIN: { api: 'domain', operation: 'check' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'check' },
  PACKAGE: { api: 'package', operation: 'check' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'check' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'check' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const CHECK_ONPREM = [
  'CLASS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'DOMAIN',
  'DATA_ELEMENT',
  'PACKAGE',
  'BEHAVIOR_DEFINITION',
  'METADATA_EXTENSION',
] as const;

/** HandlerCheckRun's `object_type`: a program is checked on both variants. */
export const COMPACT_CHECK = projected<
  ServedName<'onprem', typeof COMPACT_CHECK_ROUTES>,
  ServedName<'cloud', typeof COMPACT_CHECK_ROUTES>
>()({ onprem: CHECK_ONPREM, cloud: CHECK_ONPREM });

/** What `HandlerDeletionCheck` asks about, each with its API. */
export const COMPACT_DELETION_CHECK_ROUTES = {
  PACKAGE: { api: 'package', operation: 'deletionCheck' },
  DOMAIN: { api: 'domain', operation: 'deletionCheck' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'deletionCheck' },
  TABLE: { api: 'table', operation: 'deletionCheck' },
  STRUCTURE: { api: 'structure', operation: 'deletionCheck' },
  DDL: { api: 'ddl', operation: 'deletionCheck' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'deletionCheck' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'deletionCheck' },
  CLASS: { api: 'class', operation: 'deletionCheck' },
  CDS_UNIT_TEST: { api: 'class', operation: 'deletionCheck' },
  PROGRAM: { api: 'program', operation: 'deletionCheck' },
  INTERFACE: { api: 'interface', operation: 'deletionCheck' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'deletionCheck' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'deletionCheck' },
  BEHAVIOR_DEFINITION: {
    api: 'behaviorDefinition',
    operation: 'deletionCheck',
  },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'deletionCheck',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'deletionCheck' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const DELETION_CHECK_ONPREM = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'CLASS',
  'CDS_UNIT_TEST',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
] as const;

/** HandlerDeletionCheck's `object_type`: a program's on both variants. */
export const COMPACT_DELETION_CHECK = projected<
  ServedName<'onprem', typeof COMPACT_DELETION_CHECK_ROUTES>,
  ServedName<'cloud', typeof COMPACT_DELETION_CHECK_ROUTES>
>()({ onprem: DELETION_CHECK_ONPREM, cloud: DELETION_CHECK_ONPREM });

/** What `HandlerProfileRun` runs under the profiler, each with its API. */
export const COMPACT_PROFILE_ROUTES = {
  CLASS: { api: 'class', operation: 'profile' },
  PROGRAM: { api: 'program', operation: 'profile' },
} as const satisfies Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;

const PROFILE_ONPREM = ['CLASS', 'PROGRAM'] as const;

/** HandlerProfileRun's `target_type`. */
export const COMPACT_PROFILE = projected<
  ServedName<'onprem', typeof COMPACT_PROFILE_ROUTES>,
  ServedName<'cloud', typeof COMPACT_PROFILE_ROUTES>
>()({
  onprem: PROFILE_ONPREM,
  cloud: PROFILE_ONPREM.filter((member) => member !== 'PROGRAM'),
});

/**
 * The boundary's types and the server's maps (#329, S4), checked by the
 * compiler: `npm run test:check` compiles this file, and each
 * `@ts-expect-error` below fails the check the moment the line it marks
 * compiles.
 *
 * Each negative check stands beside the positive one it differs from, so a
 * check cannot pass because the whole line is broken.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import type {
  AdtMainTypeOf,
  AdtSearchTypeOf,
  AdtTypeCodeOf,
} from '@mcp-abap-adt/interfaces-adt';
import {
  ACTIVATION_CODES,
  type ActivationCode,
  type AmbiguousMainTypes,
  type CHECK_KIND_ROUTES,
  CHECK_KINDS,
  type COMPACT_ACTIVATE_ROUTES,
  type COMPACT_CHECK_ROUTES,
  type INCLUDES_PARENT_ROUTES,
  type KindsOf,
  type LOCK_KINDS,
  type MainTypeCodes,
  type MainTypeOfOne,
  type ServedName,
  type SINGLE_ACTIVATION_ROUTES,
  type TABLE_CODES,
  type TableMainOf,
  type VersionedKind,
  WHERE_USED_CODES,
  WHERE_USED_NAMES,
  type WhereUsedCode,
} from '../../lib/adtProjections';
import {
  acceptedCodeOf,
  acceptedOf,
  mainTypeCodeOf,
} from '../../lib/adtTypeCode';
import type {
  BREAKPOINT_OBJECT_CODES,
  BreakpointLabel,
  RunKind,
} from '../../lib/debugger/objectUri';
import { PACKAGE_SEARCH_NAME } from '../../lib/search-source/packageResolver';
import { searchNameOf } from '../../lib/searchTypes';

// --- Past the boundary, a value is typed as its projection -----------------

/** A check kind, past the boundary, is one of the check kinds… */
export const checked: (typeof CHECK_KINDS.onprem)[number] | undefined =
  acceptedOf('class', CHECK_KINDS.onprem);
// @ts-expect-error …and not a lock kind the check does not take.
export const checkedAsLock: 'service_binding' | undefined = acceptedOf(
  'class',
  CHECK_KINDS.onprem,
);

/** A where-used argument is a where-used code, named by a code or a name. */
export const whereUsed: (typeof WHERE_USED_CODES.cloud)[number] | undefined =
  acceptedCodeOf('class', WHERE_USED_CODES.cloud, WHERE_USED_NAMES.cloud);
// @ts-expect-error …never a function include, which has no where-used.
export const whereUsedInclude: 'FUGR/I' | undefined = acceptedCodeOf(
  'class',
  WHERE_USED_CODES.cloud,
  WHERE_USED_NAMES.cloud,
);

// --- The low kinds per variant ---------------------------------------------

export const classLockedOnCloud: (typeof LOCK_KINDS.cloud)[number] = 'class';
// @ts-expect-error a program is locked on premise only.
export const programLockedOnCloud: (typeof LOCK_KINDS.cloud)[number] =
  'program';

/** A compact member is handed on as the kind of its own API… */
export const checkKinds = {
  CLASS: 'class',
  PROGRAM: 'program',
  INTERFACE: 'interface',
  FUNCTION_GROUP: 'function_group',
  FUNCTION_MODULE: 'function_module',
  TABLE: 'table',
  STRUCTURE: 'structure',
  DDL: 'ddl',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'data_element',
  PACKAGE: 'package',
  BEHAVIOR_DEFINITION: 'behavior_definition',
  METADATA_EXTENSION: 'metadata_extension',
} as const satisfies KindsOf<
  typeof COMPACT_CHECK_ROUTES,
  typeof CHECK_KIND_ROUTES
>;
export const checkKindsCrossed = {
  ...checkKinds,
  // @ts-expect-error …never the kind of another API.
  CLASS: 'program',
} as const satisfies KindsOf<
  typeof COMPACT_CHECK_ROUTES,
  typeof CHECK_KIND_ROUTES
>;

// --- The version tools' kinds ----------------------------------------------

export const classVersioned: VersionedKind = 'class';
// @ts-expect-error a domain has no version history: no table lists `versions`.
export const domainVersioned: VersionedKind = 'domain';

// --- HandlerActivate's routes ----------------------------------------------

/** A function module is activated as `FUGR/FF`, under its group… */
export const moduleActivated: (typeof COMPACT_ACTIVATE_ROUTES)['FUNCTION_MODULE'] =
  'FUGR/FF';
// @ts-expect-error …never as the group itself.
export const moduleAsGroup: (typeof COMPACT_ACTIVATE_ROUTES)['FUNCTION_MODULE'] =
  'FUGR/F';

/** A behaviour implementation is activated as a class. */
export const implementationActivated: (typeof COMPACT_ACTIVATE_ROUTES)['BEHAVIOR_IMPLEMENTATION'] =
  'CLAS/OC';

// --- The debugger's labels -------------------------------------------------

/** `FUNC` is a function module (`FUGR/FF`)… */
export const funcIsModule: (typeof BREAKPOINT_OBJECT_CODES)['FUNC'] = 'FUGR/FF';
// @ts-expect-error …not a function group.
export const funcIsGroup: (typeof BREAKPOINT_OBJECT_CODES)['FUNC'] = 'FUGR/F';

export const classLabel: BreakpointLabel = 'CLAS';
// @ts-expect-error a group holds no breakpoint of its own: no label.
export const groupLabel: BreakpointLabel = 'FUGR';

export const classRun: RunKind = 'class';
// @ts-expect-error an interface is not run: no table lists `run` for it.
export const interfaceRun: RunKind = 'interface';

// --- Main types (S4b): one code, or refused naming the codes ---------------

type WhereUsedOnPremMains = MainTypeCodes<WhereUsedCode<'onprem'>>;
type WhereUsedOnPremShared = AmbiguousMainTypes<WhereUsedCode<'onprem'>>;

/** Where-used has one message class code: `MSAG` stands for it… */
export const msagWhereUsed: WhereUsedOnPremMains['MSAG'] = 'MSAG/N';
// @ts-expect-error …a table and a structure share `TABL`: no single code…
export const tablWhereUsed: WhereUsedOnPremMains['TABL'] = 'TABL/DT';
/** …it is ambiguous, with both its codes… */
export const tablShared: WhereUsedOnPremShared['TABL'] = ['TABL/DT', 'TABL/DS'];
// @ts-expect-error …and `MSAG`, with one code, is not ambiguous.
export const msagShared: WhereUsedOnPremShared['MSAG'] = ['MSAG/N'];

/** A code equal to its main type is a code, never a main type of the map. */
export const authIsACode: WhereUsedCode<'onprem'> = 'AUTH';
// @ts-expect-error `AUTH` has no slash: the map does not hold it.
export const authAsMain: WhereUsedOnPremMains['AUTH'] = 'AUTH';

type TableMains = MainTypeCodes<(typeof TABLE_CODES.onprem)[number]>;
type TableShared = AmbiguousMainTypes<(typeof TABLE_CODES.onprem)[number]>;

/** The table holds one data source code… */
export const dsfdInTable: TableMains['DSFD'] = 'DSFD/SCF';
// @ts-expect-error …but two message class codes, so `MSAG` is no code there…
export const msagInTable: TableMains['MSAG'] = 'MSAG/N';
/** …it is ambiguous there, with both. */
export const msagSharedInTable: TableShared['MSAG'] = ['MSAG/N', 'MSAG/NN'];

/** An enhancement spot is one code on cloud's group activation… */
export const enhsOnCloud: MainTypeOfOne<ActivationCode<'cloud'>> = 'ENHS';
// @ts-expect-error …an enhancement implementation is two (`XHH`, `XHB`).
export const enhoOnCloud: MainTypeOfOne<ActivationCode<'cloud'>> = 'ENHO';
// @ts-expect-error A program is not activated on cloud: no `PROG` at all.
export const progOnCloud: MainTypeOfOne<ActivationCode<'cloud'>> = 'PROG';

/** GetIncludesList reads `CLAS` as its one class parent… */
export const clasParent: MainTypeOfOne<
  ServedName<'onprem', typeof INCLUDES_PARENT_ROUTES>
> = 'CLAS';
// @ts-expect-error …while a program and an include share `PROG`.
export const progParent: MainTypeOfOne<
  ServedName<'onprem', typeof INCLUDES_PARENT_ROUTES>
> = 'PROG';

/** Past the boundary, a main type is the projection's code… */
export const mainOfActivation:
  | (typeof ACTIVATION_CODES.cloud)[number]
  | undefined = mainTypeCodeOf('ENHS', ACTIVATION_CODES.cloud);
// @ts-expect-error …never a code the projection does not hold.
export const mainOfActivationProgram: 'PROG/P' | undefined = mainTypeCodeOf(
  'ENHS',
  ACTIVATION_CODES.cloud,
);

/**
 * Every single-object activation code is a group activation code on its
 * variant, so a main type is read over the group's codes alone
 * (`activationTextOf`).
 */
type SingleCodes<V extends 'onprem' | 'cloud'> = Extract<
  ServedName<V, typeof SINGLE_ACTIVATION_ROUTES>,
  `${string}/${string}`
>;
export const singleCodesAreGroupCodes: [
  SingleCodes<'onprem'>,
  SingleCodes<'cloud'>,
] extends [ActivationCode<'onprem'>, ActivationCode<'cloud'>]
  ? true
  : false = true;

// ---------------------------------------------------------------------------
// Main types from the tables' `main`, and the search names (interfaces-adt 24)
// ---------------------------------------------------------------------------

/** `true` when every member of `T` is `true`. */
type AllTrue<T> = [Exclude<T, true>] extends [never] ? true : false;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The codes of the two modern tables. */
type ModernCode = AdtTypeCodeOf<'onprem'> | AdtTypeCodeOf<'cloud'>;

// `TableMainOf` reads a code's entry: `ENHO/XHH` states `ENHO`.
export const enhoMain: TableMainOf<'ENHO/XHH'> = 'ENHO';
// @ts-expect-error the entry of ENHO/XHH states ENHO, not ENHS
export const enhoIsNotEnhs: TableMainOf<'ENHO/XHH'> = 'ENHS';
// A code no API table holds has no main type: nothing is cut from its text.
// @ts-expect-error VIEW/DV is a group-only code: no entry states its main type (a prefix rule would give VIEW)
export const groupOnlyHasNone: TableMainOf<'VIEW/DV'> = 'VIEW';

/**
 * No code of the modern tables states a main type other than the text
 * before its slash (interfaces-adt's `AdtCheckedTable` requires `main` to be
 * `AdtMainTypeOf` its key), so reading `main` sends what the prefix did.
 */
export const everyMainIsItsPrefix: AllTrue<
  { [C in ModernCode]: Same<TableMainOf<C>, AdtMainTypeOf<C>> }[ModernCode]
> = true;

// The package search sends the main type the package code's entry states.
export const packageSearch: 'DEVC' = PACKAGE_SEARCH_NAME;
// @ts-expect-error the package search sends no code
export const packageSearchIsNoCode: 'DEVC/K' = PACKAGE_SEARCH_NAME;

// SearchObject's filter is the declared variant's names.
export const onPremName: AdtSearchTypeOf<'onprem'> | undefined = searchNameOf(
  'onprem',
  'STRU',
);
export const cloudName: AdtSearchTypeOf<'cloud'> | undefined = searchNameOf(
  'cloud',
  'STRU',
);
// @ts-expect-error an on-premise name is not a name of every variant
export const onPremAsModern: AdtSearchTypeOf<'onprem' | 'cloud'> | undefined =
  searchNameOf('onprem', 'STRU');

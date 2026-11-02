/**
 * The per-operation projections (`src/lib/adtProjections.ts`), checked by
 * the compiler: `npm run test:check` compiles this file, and each
 * `@ts-expect-error` below fails the check the moment the line it marks
 * compiles — a code an operation's projection does not hold typed as that
 * projection, a list one value too many or one value short of it.
 *
 * Each negative check stands beside the positive one it differs from, so a
 * check cannot pass because the whole line is broken.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import {
  type AcceptedCode,
  type AcceptedKind,
  type ActivationCode,
  type AdtCodes,
  type AtcKindOn,
  type COMPACT_ACTIVATE,
  type COMPACT_CHECK,
  type COMPACT_CREATE,
  type COMPACT_CREATE_ROUTES,
  type COMPACT_DELETE,
  type COMPACT_DELETION_CHECK,
  type COMPACT_LOCK,
  type COMPACT_READ_ROUTES,
  type COMPACT_UNLOCK,
  type COMPACT_UPDATE,
  type COMPACT_VALIDATE,
  type COMPACT_WHERE_USED,
  type COMPACT_WHERE_USED_ROUTES,
  type INCLUDES_PARENT_ROUTES,
  projected,
  type ServedName,
  type TYPE_NAMES,
  type TypeName,
  type TypeNameFor,
  type VERSIONED_ROUTES,
  type WhereUsedCode,
} from '../../lib/adtProjections';

// --- The accepted ADT codes of an operation -------------------------------

/** A program is created on premise (`ADT_TYPES_ONPREM`)… */
export const programCreatedOnPrem: AcceptedCode<'onprem', 'create'> = 'PROG/P';
// @ts-expect-error …and not on ABAP cloud (`ADT_TYPES_CLOUD`).
export const programCreatedOnCloud: AcceptedCode<'cloud', 'create'> = 'PROG/P';

/** A program is read on ABAP cloud… */
export const programReadOnCloud: AcceptedCode<'cloud', 'read'> = 'PROG/P';
// @ts-expect-error …a domain has no source to read on either variant.
export const domainRead: AcceptedCode<'onprem', 'read'> = 'DOMA/DD';

/** A code no table holds is no accepted code of any operation. */
export const interfaceRead: AcceptedCode<'onprem', 'read'> = 'INTF/OI';
// @ts-expect-error `INTF/IF` is in no table (`INTF/OI` is the interface).
export const unlistedInterfaceRead: AcceptedCode<'onprem', 'read'> = 'INTF/IF';

// --- The accepted kinds of an operation ------------------------------------

export const classActivatedOnCloud: AcceptedKind<'cloud', 'activate'> = 'class';
// @ts-expect-error a program is activated on premise only.
export const programActivatedOnCloud: AcceptedKind<'cloud', 'activate'> =
  'program';

/** Compiles only for `true`. */
type Holds<T extends true> = T;

/** The version tools' kinds are kinds the table lists `versions` for. */
export type VersionedKindsAreServed = Holds<
  [keyof typeof VERSIONED_ROUTES] extends [AcceptedKind<'onprem', 'versions'>]
    ? true
    : false
>;

// --- The utility members' code sets ----------------------------------------

export const whereUsedClass: WhereUsedCode<'cloud'> = 'CLAS/OC';
// @ts-expect-error a function include has no where-used of its own.
export const whereUsedFunctionInclude: WhereUsedCode<'cloud'> = 'FUGR/I';

export const groupActivatedPackage: ActivationCode<'onprem'> = 'DEVC/K';
// @ts-expect-error an include is activated on premise only.
export const groupActivatedIncludeOnCloud: ActivationCode<'cloud'> = 'PROG/I';

/** A name stands for its code: `program` is `PROG/P`, activated on premise only. */
export const programOnPrem: TypeNameFor<ActivationCode<'onprem'>> = 'program';
// @ts-expect-error …so not a name a cloud activation takes.
export const programOnCloud: TypeNameFor<ActivationCode<'cloud'>> = 'program';
// @ts-expect-error a main type is no name: `prog` reads only through the projection.
export const progIsNoName: TypeName = 'prog';
// @ts-expect-error `stru/ds` is no code a release lists, so no name either.
export const struDsIsNoName: TypeName = 'stru/ds';
/** `func` is the function module, the releases' quick-search name `FUNC`. */
export const funcIsTheModule: (typeof TYPE_NAMES)['func'] = 'FUGR/FF';
// @ts-expect-error …not the function group.
export const funcIsNoGroup: (typeof TYPE_NAMES)['func'] = 'FUGR/F';
/** `function` is the function module too, as `func` is. */
export const functionIsTheModule: (typeof TYPE_NAMES)['function'] = 'FUGR/FF';
// @ts-expect-error …not the function group.
export const functionIsNoGroup: (typeof TYPE_NAMES)['function'] = 'FUGR/F';
/** `functiongroup` is the function group. */
export const functiongroupIsTheGroup: (typeof TYPE_NAMES)['functiongroup'] =
  'FUGR/F';
// @ts-expect-error …not the function module.
export const functiongroupIsNoModule: (typeof TYPE_NAMES)['functiongroup'] =
  'FUGR/FF';

// --- A tool's names: its routes the table serves ---------------------------

type CreateOnCloud = ServedName<'cloud', typeof COMPACT_CREATE_ROUTES>;
export const classCreatedOnCloud: CreateOnCloud = 'CLASS';
// @ts-expect-error HandlerCreate does not offer PROGRAM on ABAP cloud.
export const programCreatedCompactOnCloud: CreateOnCloud = 'PROGRAM';

/** A table type is created on both variants… */
export const tableTypeCreatedCompactOnCloud: CreateOnCloud = 'TABLE_TYPE';
/** …an include on premise… */
export const includeCreatedCompactOnPrem: ServedName<
  'onprem',
  typeof COMPACT_CREATE_ROUTES
> = 'INCLUDE';
// @ts-expect-error …and not on ABAP cloud.
export const includeCreatedCompactOnCloud: CreateOnCloud = 'INCLUDE';
/** HandlerCreate's cloud list holds the table type… */
export const tableTypeInCloudCreate: (typeof COMPACT_CREATE.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and leaves the include out, as it leaves PROGRAM.
export const includeInCloudCreate: (typeof COMPACT_CREATE.cloud)[number] =
  'INCLUDE';

/** HandlerGet reads a table type's metadata on ABAP cloud. */
export const tableTypeReadCompactOnCloud: ServedName<
  'cloud',
  typeof COMPACT_READ_ROUTES
> = 'TABLE_TYPE';

/** HandlerUpdate's cloud list holds the table type… */
export const tableTypeInCloudUpdate: (typeof COMPACT_UPDATE.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and leaves the include out, as it leaves PROGRAM.
export const includeInCloudUpdate: (typeof COMPACT_UPDATE.cloud)[number] =
  'INCLUDE';

/** HandlerDelete's cloud list holds the table type… */
export const tableTypeInCloudDelete: (typeof COMPACT_DELETE.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and leaves the include out, as it leaves PROGRAM.
export const includeInCloudDelete: (typeof COMPACT_DELETE.cloud)[number] =
  'INCLUDE';
/** HandlerDeletionCheck asks about an include on ABAP cloud too. */
export const includeInCloudDeletionCheck: (typeof COMPACT_DELETION_CHECK.cloud)[number] =
  'INCLUDE';

/** HandlerLock and HandlerUnlock lock a table type on ABAP cloud… */
export const tableTypeInCloudLock: (typeof COMPACT_LOCK.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and no include, as no program.
export const includeInCloudLock: (typeof COMPACT_LOCK.cloud)[number] =
  'INCLUDE';
// @ts-expect-error the unlock follows the lock.
export const includeInCloudUnlock: (typeof COMPACT_UNLOCK.cloud)[number] =
  'INCLUDE';

/** HandlerValidate validates a table type on ABAP cloud… */
export const tableTypeInCloudValidate: (typeof COMPACT_VALIDATE.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and no include, as no program.
export const includeInCloudValidate: (typeof COMPACT_VALIDATE.cloud)[number] =
  'INCLUDE';
/** HandlerCheckRun checks a table type on ABAP cloud… */
export const tableTypeInCloudCheck: (typeof COMPACT_CHECK.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and an include on neither variant: it has no check.
export const includeInCheck: (typeof COMPACT_CHECK.onprem)[number] = 'INCLUDE';

/** HandlerActivate activates a table type on ABAP cloud… */
export const tableTypeInCloudActivate: (typeof COMPACT_ACTIVATE.cloud)[number] =
  'TABLE_TYPE';
// @ts-expect-error …and no include, activated on premise only.
export const includeInCloudActivate: (typeof COMPACT_ACTIVATE.cloud)[number] =
  'INCLUDE';

/** HandlerWhereUsed takes a table type on both variants, by its code. */
export const tableTypeInCloudWhereUsed: (typeof COMPACT_WHERE_USED.cloud)[number] =
  'TABLE_TYPE';
export const tableTypeWhereUsedRoute: (typeof COMPACT_WHERE_USED_ROUTES)['TABLE_TYPE'] =
  'TTYP/DA';

// --- A list is exactly its projection --------------------------------------

type Parents = ServedName<'onprem', typeof INCLUDES_PARENT_ROUTES>;

export const exactParents = projected<Parents, Parents>()({
  onprem: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC'],
  cloud: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC'],
});

export const parentMissing = projected<Parents, Parents>()({
  // @ts-expect-error a list one value short of its projection (`CLAS/OC`).
  onprem: ['PROG/P', 'PROG/I', 'FUGR/F'],
  cloud: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC'],
});

export const parentTooMany = projected<Parents, Parents>()({
  onprem: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC'],
  // @ts-expect-error a list one value too many (`FUGR`, a main type, no code).
  cloud: ['PROG/P', 'PROG/I', 'FUGR/F', 'CLAS/OC', 'FUGR'],
});

// --- Codes written out in a type -------------------------------------------

/** A function module's code is a code of the tables… */
export type FunctionModuleCode = AdtCodes<'FUGR/FF'>;
// @ts-expect-error …`FUNC`, a run's and the symbols tool's short word, is none.
export type FunctionShortWord = AdtCodes<'FUNC'>;

// --- RunATC's object kinds per variant -------------------------------------

/** A program is checked by ATC on premise… */
export const programAtcOnPrem: AtcKindOn<'onprem'> = 'program';
// @ts-expect-error …and offered on no cloud system, which holds no program of the caller's.
export const programAtcOnCloud: AtcKindOn<'cloud'> = 'program';

/**
 * Which arguments of which tools name a package, a request or a table
 * (spec §3.3, Appendix B), and the `AccessCall` a call's arguments make.
 * Packages and requests are checked only on a tool that changes something —
 * one the `-ro` twin does not serve; tables on the tools that read a table's
 * rows by its name.
 */
import { isAbapGitTool } from '../abapGit/tools';
import {
  ACTIVATION_CODES,
  ACTIVATION_NAMES,
  type TableMainOf,
} from '../adtProjections.js';
import { acceptedCodeOf } from '../adtTypeCode.js';
import { givenName } from '../givenName.js';
import type {
  ToolArgs,
  ToolArgValue,
  ToolDefinition,
} from '../handlers/interfaces.js';
import { isArgList, isArgObject } from '../toolArgValue.js';
import type { AccessCall, NamedValue } from './accessChecks.js';

/** The arguments that name a package. */
export const PACKAGE_ARGUMENTS: readonly string[] = [
  'package_name',
  'super_package',
];

/**
 * The argument naming a package's parent, checked only where it is sent: on
 * a package create (`isPackageCreate`). Elsewhere (a lock, a check) the
 * tool accepts it and sends nothing of it.
 */
const PARENT_ARGUMENT = 'super_package';

/** The tools that can create a package, and so send its parent. */
const PACKAGE_CREATE_TOOLS: ReadonlySet<string> = new Set([
  'CreatePackage',
  'HandlerCreate',
]);

/**
 * The tools that lock or unlock an object named by `object_type` and
 * `object_name`: with `PACKAGE`, the object is a package, checked by that
 * name.
 */
const PACKAGE_OBJECT_TOOLS: ReadonlySet<string> = new Set([
  'HandlerLock',
  'HandlerUnlock',
  'LockObjectLow',
  'UnlockObjectLow',
]);

/** The arguments naming a call's object and its type. */
const OBJECT_NAME = 'object_name';
const OBJECT_TYPE = 'object_type';

/** The arguments that name a transport request or task. */
export const REQUEST_ARGUMENTS: readonly string[] = [
  'transport_request',
  'transport_number',
  'target_number',
];

/** The tools that read a table's rows, and the argument naming the table. */
export const TABLE_ARGUMENTS: ReadonlyMap<string, string> = new Map([
  ['GetTableContents', 'table_name'],
  ['HandlerGetData', 'object_name'],
]);

/**
 * The tools that take an ABAP Unit run target, and the argument holding it:
 * a target of kind `package` names a package in its `name`, checked as
 * `<argument>.name`. The named package alone is checked, not the
 * subpackages a run with `include_subpackages` covers; an object target
 * names no package.
 */
export const PACKAGE_TARGET_ARGUMENTS: ReadonlyMap<string, string> = new Map([
  ['RunAbapUnit', 'target'],
  ['HandlerUnitTestRun', 'target'],
]);

/**
 * The tools that activate a list of objects, `objects[]`, each a `name` and a
 * `type`: an entry whose type the activation reads as a package (`DEVC/K`)
 * names that package. `HandlerActivate` also takes one object by
 * `object_name` with `object_type` or `object_adt_type`.
 */
const ACTIVATION_TOOLS: ReadonlySet<string> = new Set([
  'ActivateObjects',
  'ActivateObjectLow',
  'HandlerActivate',
]);
const ACTIVATION_OBJECTS = 'objects';
const ACTIVATION_ADT_TYPE = 'object_adt_type';

/**
 * The tools that send transport entries, each `pgmid` `type` `name`: a move
 * sends a list, `objects[]` of `object_name`, `object_type` and `pgmid`; an
 * add or a remove one object by the same arguments. An entry of type
 * `DEVC` names a package, whatever its program id (`pgmid`).
 */
const TRANSPORT_LIST_TOOLS: ReadonlySet<string> = new Set([
  'MoveTransportObjects',
  'HandlerTransportMoveObjects',
]);
const TRANSPORT_OBJECT_TOOLS: ReadonlySet<string> = new Set([
  'AddTransportObject',
  'RemoveTransportObject',
]);
const TRANSPORT_OBJECTS = 'objects';
/** A package's object-directory type: the main type of its code. */
const PACKAGE_DIRECTORY_TYPE: TableMainOf<'DEVC/K'> = 'DEVC';

/** The arguments a tool dispatches on. */
const DISPATCH_ARGUMENTS: readonly string[] = [
  'object_type',
  'target_type',
  'action',
  'operation',
];

/** What a tool's calls are checked on, computed once at registration. */
export interface CheckedArguments {
  readonly packages: readonly string[];
  /** The run-target argument whose package kind names a package (`PACKAGE_TARGET_ARGUMENTS`). */
  readonly packageTarget: string | undefined;
  readonly requests: readonly string[];
  readonly table: string | undefined;
  readonly dispatch: string | undefined;
  /**
   * The argument naming the object of a call whose `object_type` is
   * `PACKAGE`: the package itself, checked as a package.
   */
  readonly packageObject: string | undefined;
  /**
   * An activation (`ACTIVATION_TOOLS`): its package entries of `objects[]`
   * are checked, and with `single` its one object named by `object_name`.
   */
  readonly activation: { readonly single: boolean } | undefined;
  /**
   * Transport entries (`TRANSPORT_LIST_TOOLS`, `TRANSPORT_OBJECT_TOOLS`):
   * a `DEVC` entry's name is checked as a package.
   */
  readonly transportEntries: 'list' | 'object' | undefined;
}

/** Every property a definition declares, on any variant. */
function declaredArguments(definition: ToolDefinition): ReadonlySet<string> {
  const keys = new Set(Object.keys(definition.inputSchema.shape));
  for (const stated of Object.values(definition.variants ?? {})) {
    for (const key of Object.keys(stated.inputSchema.shape)) keys.add(key);
  }
  return keys;
}

/**
 * The arguments of `definition` a call is checked on: its package and
 * request arguments when `readOnly` (the tools the `-ro` twins serve) lacks
 * it, its table argument; `undefined` when nothing is checked.
 */
export function checkedArgumentsOf(
  definition: ToolDefinition,
  readOnly: ReadonlySet<string>,
): CheckedArguments | undefined {
  // An abapGit tool is checked by its own admission (spec §4.3, §4.4):
  // link and pull refused under any restriction, the rest against the
  // repository's package — never by its arguments here.
  if (isAbapGitTool(definition.name)) return undefined;
  const declared = declaredArguments(definition);
  const changes = !readOnly.has(definition.name);
  const packages = changes
    ? PACKAGE_ARGUMENTS.filter(
        (argument) =>
          declared.has(argument) &&
          (argument !== PARENT_ARGUMENT ||
            PACKAGE_CREATE_TOOLS.has(definition.name)),
      )
    : [];
  const targetArgument = PACKAGE_TARGET_ARGUMENTS.get(definition.name);
  const packageTarget =
    changes && targetArgument !== undefined && declared.has(targetArgument)
      ? targetArgument
      : undefined;
  // A lock or unlock: with `object_type` `PACKAGE` its `object_name` is the
  // package itself.
  const packageObject =
    changes &&
    PACKAGE_OBJECT_TOOLS.has(definition.name) &&
    declared.has(OBJECT_NAME) &&
    declared.has(OBJECT_TYPE)
      ? OBJECT_NAME
      : undefined;
  const activation =
    changes &&
    ACTIVATION_TOOLS.has(definition.name) &&
    declared.has(ACTIVATION_OBJECTS)
      ? {
          single:
            declared.has(OBJECT_NAME) &&
            (declared.has(OBJECT_TYPE) || declared.has(ACTIVATION_ADT_TYPE)),
        }
      : undefined;
  const transportEntries = !changes
    ? undefined
    : TRANSPORT_LIST_TOOLS.has(definition.name) &&
        declared.has(TRANSPORT_OBJECTS)
      ? 'list'
      : TRANSPORT_OBJECT_TOOLS.has(definition.name) &&
          declared.has(OBJECT_NAME) &&
          declared.has(OBJECT_TYPE)
        ? 'object'
        : undefined;
  const requests = changes
    ? REQUEST_ARGUMENTS.filter((argument) => declared.has(argument))
    : [];
  const tableArgument = TABLE_ARGUMENTS.get(definition.name);
  const table =
    tableArgument !== undefined && declared.has(tableArgument)
      ? tableArgument
      : undefined;
  if (
    packages.length === 0 &&
    packageTarget === undefined &&
    requests.length === 0 &&
    table === undefined &&
    packageObject === undefined &&
    activation === undefined &&
    transportEntries === undefined
  ) {
    return undefined;
  }
  return {
    packages,
    packageTarget,
    requests,
    table,
    dispatch: DISPATCH_ARGUMENTS.find((argument) => declared.has(argument)),
    packageObject,
    activation,
    transportEntries,
  };
}

/** `args[argument]` trimmed and upper-cased, when it is a non-blank string. */
function named(args: ToolArgs, argument: string): string | undefined {
  const value = args[argument];
  return typeof value === 'string' ? givenName(value) : undefined;
}

function namedValues(
  args: ToolArgs,
  argumentsOf: readonly string[],
): NamedValue[] {
  const values: NamedValue[] = [];
  for (const argument of argumentsOf) {
    const value = named(args, argument);
    if (value !== undefined) values.push({ argument, value });
  }
  return values;
}

/**
 * The package a run target names: `<argument>.name` when the target's kind
 * is `package`, trimmed and upper-cased; nothing for an object target.
 */
function packageTargetValues(
  args: ToolArgs,
  argument: string | undefined,
): NamedValue[] {
  if (argument === undefined) return [];
  const target = args[argument];
  if (!isArgObject(target) || target.kind !== 'package') return [];
  const value = named(target, 'name');
  return value === undefined ? [] : [{ argument: `${argument}.name`, value }];
}

/**
 * Whether an activation reads `type` as a package: the code `DEVC/K` in
 * either case, its main type, or a name standing for it, as the activation's
 * own boundary reads a type (`acceptedCodeOf`, `activationPlan`), on either
 * variant.
 */
function activatesPackage(type: ToolArgValue): boolean {
  if (typeof type !== 'string') return false;
  return (
    acceptedCodeOf(type, ACTIVATION_CODES.onprem, ACTIVATION_NAMES.onprem) ===
      'DEVC/K' ||
    acceptedCodeOf(type, ACTIVATION_CODES.cloud, ACTIVATION_NAMES.cloud) ===
      'DEVC/K'
  );
}

/**
 * The packages an activation names, in the order the handler reads its
 * arguments: a non-empty `objects[]` alone (each package entry's `name`, as
 * `objects[].name`); else, with `single`, `object_name` when
 * `object_adt_type` is read as a package or, without it, `object_type` is
 * `PACKAGE`.
 */
function activationValues(
  args: ToolArgs,
  activation: CheckedArguments['activation'],
): NamedValue[] {
  if (activation === undefined) return [];
  const objects = args[ACTIVATION_OBJECTS];
  if (isArgList(objects) && objects.length > 0) {
    const values: NamedValue[] = [];
    for (const entry of objects) {
      if (!isArgObject(entry) || !activatesPackage(entry.type)) continue;
      const value = named(entry, 'name');
      if (value !== undefined) {
        values.push({ argument: `${ACTIVATION_OBJECTS}[].name`, value });
      }
    }
    return values;
  }
  if (!activation.single) return [];
  const adtType = args[ACTIVATION_ADT_TYPE];
  const single =
    typeof adtType === 'string' && adtType !== ''
      ? activatesPackage(adtType)
      : named(args, OBJECT_TYPE) === 'PACKAGE';
  if (!single) return [];
  return namedValues(args, [OBJECT_NAME]);
}

/**
 * Whether a transport entry names a package: its type `DEVC`, trimmed and in
 * any case. The program id is not read: a `DEVC` entry under any program id
 * is checked.
 */
function namesPackageEntry(entry: ToolArgs): boolean {
  return named(entry, OBJECT_TYPE) === PACKAGE_DIRECTORY_TYPE;
}

/**
 * The packages a call's transport entries name: each `DEVC` entry of
 * `objects[]` as `objects[].object_name`, or the one object as `object_name`.
 */
function transportEntryValues(
  args: ToolArgs,
  entries: CheckedArguments['transportEntries'],
): NamedValue[] {
  if (entries === 'object') {
    return namesPackageEntry(args) ? namedValues(args, [OBJECT_NAME]) : [];
  }
  if (entries !== 'list') return [];
  const objects = args[TRANSPORT_OBJECTS];
  if (!isArgList(objects)) return [];
  const values: NamedValue[] = [];
  for (const entry of objects) {
    if (!isArgObject(entry) || !namesPackageEntry(entry)) continue;
    const value = named(entry, OBJECT_NAME);
    if (value !== undefined) {
      values.push({ argument: `${TRANSPORT_OBJECTS}[].${OBJECT_NAME}`, value });
    }
  }
  return values;
}

/**
 * Whether the call creates the package `package_name` under
 * `super_package`: `CreatePackage`, or `HandlerCreate` with `object_type`
 * `PACKAGE`. No other call: `CheckPackage` declares `super_package` and never
 * sends it.
 */
export function isPackageCreate(tool: string, args: ToolArgs): boolean {
  if (tool === 'CreatePackage') return true;
  return tool === 'HandlerCreate' && named(args, 'object_type') === 'PACKAGE';
}

/**
 * What a call's arguments name, as given: string values only, trimmed and
 * upper-cased, a blank one left out; `undefined` when it names nothing
 * checked.
 */
export function accessCallOf(
  tool: string,
  checked: CheckedArguments,
  args: ToolArgs,
): AccessCall | undefined {
  const packageCreate = isPackageCreate(tool, args);
  const packages = [
    ...namedValues(
      args,
      checked.packages.filter(
        (argument) => argument !== PARENT_ARGUMENT || packageCreate,
      ),
    ),
    ...packageTargetValues(args, checked.packageTarget),
    ...activationValues(args, checked.activation),
    ...transportEntryValues(args, checked.transportEntries),
  ];
  if (
    checked.packageObject !== undefined &&
    named(args, OBJECT_TYPE) === 'PACKAGE'
  ) {
    packages.push(...namedValues(args, [checked.packageObject]));
  }
  const requests = namedValues(args, checked.requests);
  const tables =
    checked.table === undefined ? [] : namedValues(args, [checked.table]);
  if (packages.length === 0 && requests.length === 0 && tables.length === 0) {
    return undefined;
  }
  const dispatchValue =
    checked.dispatch === undefined ? undefined : args[checked.dispatch];
  return {
    tool,
    dispatch: typeof dispatchValue === 'string' ? dispatchValue : undefined,
    packages,
    requests,
    tables,
    packageCreate,
  };
}

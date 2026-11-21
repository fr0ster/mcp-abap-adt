/**
 * Which arguments of which tools name a package, a request or a table
 * (spec §3.3, Appendix B), and the `AccessCall` a call's arguments make.
 * Packages and requests are checked only on a tool that changes something —
 * one the `-ro` twin does not serve; tables on the tools that read a table's
 * rows by its name.
 */
import type { ToolArgs, ToolDefinition } from '../handlers/interfaces.js';
import { isArgObject } from '../toolArgValue.js';
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
    packageObject === undefined
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
  };
}

/** `args[argument]` trimmed and upper-cased, when it is a non-blank string. */
function named(args: ToolArgs, argument: string): string | undefined {
  const value = args[argument];
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length === 0 ? undefined : text.toUpperCase();
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

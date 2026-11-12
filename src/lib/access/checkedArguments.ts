/**
 * Which arguments of which tools name a package, a request or a table
 * (spec §3.3, Appendix B), and the `AccessCall` a call's arguments make.
 * Packages and requests are checked only on a tool that changes something —
 * one the `-ro` twin does not serve; tables on the tools that read a table's
 * rows by its name.
 */
import type { ToolArgs, ToolDefinition } from '../handlers/interfaces.js';
import type { AccessCall, NamedValue } from './accessChecks.js';

/** The arguments that name a package. */
export const PACKAGE_ARGUMENTS: readonly string[] = [
  'package_name',
  'super_package',
];

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
  readonly requests: readonly string[];
  readonly table: string | undefined;
  readonly dispatch: string | undefined;
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
    ? PACKAGE_ARGUMENTS.filter((argument) => declared.has(argument))
    : [];
  const requests = changes
    ? REQUEST_ARGUMENTS.filter((argument) => declared.has(argument))
    : [];
  const tableArgument = TABLE_ARGUMENTS.get(definition.name);
  const table =
    tableArgument !== undefined && declared.has(tableArgument)
      ? tableArgument
      : undefined;
  if (packages.length === 0 && requests.length === 0 && table === undefined) {
    return undefined;
  }
  return {
    packages,
    requests,
    table,
    dispatch: DISPATCH_ARGUMENTS.find((argument) => declared.has(argument)),
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
  const packages = namedValues(args, checked.packages);
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
    packageCreate: isPackageCreate(tool, args),
  };
}

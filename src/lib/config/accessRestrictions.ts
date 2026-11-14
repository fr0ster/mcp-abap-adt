/**
 * The five access-restriction rows (spec §2), in every binary's table:
 * `--deny-actions`, `--allowed-packages`, `--allowed-requests`,
 * `--denied-tables`, `--allowed-tables`, each with its environment and YAML
 * form (`restrictions.*`). None has a default: a row given in no form
 * restricts nothing. CLI and environment take entries separated by `,`,
 * each trimmed; YAML a sequence of strings or one such string. An empty
 * entry, a stray separator, a non-string YAML item or a malformed entry
 * stops the start, named in the form it was given. A form given with
 * nothing at all (`MCP_DENY_ACTIONS=`, a YAML `[]`) is absent. Plain code,
 * no regular expression.
 */

import {
  type AccessLists,
  type AccessRestrictions,
  type NameEntry,
  type PackageEntry,
  parsePackageEntry,
  parseRequestEntry,
  parseTableEntry,
} from '../access/accessLists.js';
import { type DeniedEntry, parseDeniedEntry } from '../access/deniedActions.js';
import type { JsonValue } from '../json.js';
import {
  type Parameter,
  ParameterRefusal,
  type ParameterTable,
  type ParameterValue,
  parameterSource,
  readParameters,
} from './authParameters.js';
import type { YamlConfig } from './yamlConfig.js';

const SECTION = 'ACCESS RESTRICTIONS';

/** The entries of one form's value, each trimmed. */
function entriesOf(raw: JsonValue, name: string): readonly string[] {
  if (Array.isArray(raw)) {
    const entries: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') {
        throw new ParameterRefusal(
          `Invalid ${name}: every item is a string (an entry)`,
        );
      }
      entries.push(item.trim());
    }
    return entries;
  }
  if (typeof raw !== 'string') {
    throw new ParameterRefusal(
      `Invalid ${name}: a list of entries separated by ","`,
    );
  }
  const entries: string[] = [];
  let current = '';
  for (const c of raw) {
    if (c === ',') {
      entries.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  entries.push(current.trim());
  // An empty entry (a stray ",") is refused by the row's entry grammar.
  return entries;
}

/** A row's reader: its entries, each checked by `check`, as given. */
function listReader(
  check: (text: string, name: string) => void,
): (raw: JsonValue, name: string) => readonly string[] {
  return (raw, name) => {
    const entries = entriesOf(raw, name);
    for (const entry of entries) check(entry, name);
    return entries;
  };
}

function row(
  key: string,
  cli: string,
  env: string,
  yaml: string,
  check: (text: string, name: string) => void,
  help: string,
): Parameter {
  return {
    key,
    cli,
    env,
    yaml: `restrictions.${yaml}`,
    kind: 'custom',
    parse: listReader(check),
    valueHint: '=<a,b>',
    section: SECTION,
    help,
  };
}

export const DENY_ACTIONS_ROW: Parameter = row(
  'denyActions',
  '--deny-actions',
  'MCP_DENY_ACTIONS',
  'deny-actions',
  parseDeniedEntry,
  'Tools or tool actions this server does not register: Tool (DeleteClass), Prefix* (Delete*), Tool.value (HandlerDelete.CLASS, HandlerActivate.CLAS/OC, HandlerGetData.sql) or Tool.prefix* (HandlerDebugSession.get*). Matched exactly, case included; an entry that matches nothing in this binary is ignored and named at start. Default: none.',
);

export const ALLOWED_PACKAGES_ROW: Parameter = row(
  'allowedPackages',
  '--allowed-packages',
  'MCP_ALLOWED_PACKAGES',
  'allowed-packages',
  parsePackageEntry,
  'The only packages a call may name in its package arguments: a name (ZFOO, $TMP), a prefix (Z*) or a subtree (ZFOO/**, read from the package tree). A call naming no package is not checked. Default: none (every package).',
);

export const ALLOWED_REQUESTS_ROW: Parameter = row(
  'allowedRequests',
  '--allowed-requests',
  'MCP_ALLOWED_REQUESTS',
  'allowed-requests',
  parseRequestEntry,
  'The only transport requests a call that changes something may name: a number or a prefix (A4HK*). A task is matched as given. A call naming no request is not checked. Default: none (every request).',
);

export const DENIED_TABLES_ROW: Parameter = row(
  'deniedTables',
  '--denied-tables',
  'MCP_DENIED_TABLES',
  'denied-tables',
  parseTableEntry,
  'Tables and views whose data is not read through this server (GetTableContents, HandlerGetData by object_name, when the data tools are served): a name or a prefix (ZT*). Not with --allowed-tables. Default: none.',
);

export const ALLOWED_TABLES_ROW: Parameter = row(
  'allowedTables',
  '--allowed-tables',
  'MCP_ALLOWED_TABLES',
  'allowed-tables',
  parseTableEntry,
  'The only tables and views whose data is read through this server (GetTableContents, HandlerGetData by object_name, when the data tools are served): a name or a prefix (ZT*). Not with --denied-tables. Default: none.',
);

/** The five rows, in every binary's table after the shared rows. */
export const ACCESS_RESTRICTION_ROWS: readonly Parameter[] = [
  DENY_ACTIONS_ROW,
  ALLOWED_PACKAGES_ROW,
  ALLOWED_REQUESTS_ROW,
  DENIED_TABLES_ROW,
  ALLOWED_TABLES_ROW,
];

const RESTRICTIONS_ONLY: ParameterTable = {
  program: 'access-restrictions',
  rows: ACCESS_RESTRICTION_ROWS,
  removed: [],
};

/** A row's entries as read, or `undefined` when no form gives any. */
function entriesRead(
  values: Record<string, ParameterValue>,
  key: string,
): readonly string[] | undefined {
  const value = values[key];
  // A list row's value is its entries (`listReader`); the other kinds of
  // ParameterValue are not objects.
  if (typeof value !== 'object') return undefined;
  return value.length > 0 ? value : undefined;
}

function parsed<E>(
  values: Record<string, ParameterValue>,
  key: string,
  name: string,
  parse: (text: string, name: string) => E,
): readonly E[] | undefined {
  return entriesRead(values, key)?.map((entry) => parse(entry, name));
}

/**
 * The restrictions a start configured: CLI beats env beats YAML, row by
 * row; a row given in no form is absent (`deniedActions: []`, a list left
 * out). Denied tables beside allowed tables stop the start.
 */
export function readAccessRestrictions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: YamlConfig | null,
): AccessRestrictions {
  const values = readParameters(RESTRICTIONS_ONLY, argv, env, yaml);
  const formOf = (key: string): string =>
    parameterSource(RESTRICTIONS_ONLY, key, argv, env, yaml) ?? key;
  const deniedActions: readonly DeniedEntry[] =
    parsed(values, 'denyActions', formOf('denyActions'), parseDeniedEntry) ??
    [];
  const allowedPackages: readonly PackageEntry[] | undefined = parsed(
    values,
    'allowedPackages',
    formOf('allowedPackages'),
    parsePackageEntry,
  );
  const allowedRequests: readonly NameEntry[] | undefined = parsed(
    values,
    'allowedRequests',
    formOf('allowedRequests'),
    parseRequestEntry,
  );
  const deniedTables: readonly NameEntry[] | undefined = parsed(
    values,
    'deniedTables',
    formOf('deniedTables'),
    parseTableEntry,
  );
  const allowedTables: readonly NameEntry[] | undefined = parsed(
    values,
    'allowedTables',
    formOf('allowedTables'),
    parseTableEntry,
  );
  if (deniedTables !== undefined && allowedTables !== undefined) {
    throw new ParameterRefusal(
      `${formOf('deniedTables')} and ${formOf('allowedTables')} are not given together: list the tables whose data is not read, or the only tables whose data is`,
    );
  }
  const lists: AccessLists = {
    ...(allowedPackages !== undefined ? { allowedPackages } : {}),
    ...(allowedRequests !== undefined ? { allowedRequests } : {}),
    ...(deniedTables !== undefined ? { deniedTables } : {}),
    ...(allowedTables !== undefined ? { allowedTables } : {}),
  };
  return { deniedActions, lists };
}

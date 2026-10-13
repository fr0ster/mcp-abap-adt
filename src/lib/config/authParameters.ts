/**
 * The parameter machinery, and the rows every binary shares.
 *
 * Each binary has a table of its own (D38): `mcp-abap-adt` (core) the
 * destination, browser and login rows; `mcp-abap-adt-http` the Streamable HTTP
 * rows; `mcp-abap-adt-sse` the SSE rows. Each row names a parameter in its
 * forms — CLI, environment variable and YAML key. The reader, the YAML
 * validator, the `--conf` template and the help text all read the table, so a
 * form cannot exist in one place and be missing in another, and an option of
 * another binary is in none of them. Precedence: CLI, then env, then YAML.
 *
 * A parameter of another binary, or one that is gone, is a removed parameter
 * of the table: its CLI and YAML forms stop the start, naming where it went
 * (D39). Its environment variable is not read (an environment is inherited);
 * only `MCP_TRANSPORT`, which stated the transport, is refused there.
 *
 * A refusal names the parameter in the form the user used. It may quote the
 * user's own value (a port, an enum word): those are not secrets.
 *
 * Plain code over the arguments, no regular expression (D26).
 */

import {
  DEFAULT_STATE_IDLE_MINUTES,
  MAX_STATE_IDLE_MINUTES,
  parseStateIdleMinutes,
} from '../state/idleBound.js';
import type { TlsConfig } from './IServerConfig.js';

/** A start the parameters refuse, in words that name parameters only. */
export class ParameterRefusal extends Error {
  readonly words: string;

  constructor(words: string) {
    super(words);
    this.name = 'ParameterRefusal';
    this.words = words;
  }
}

/** Whether `text` is one or more ASCII digits. Plain code (D26). */
function isDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

export type ParameterKind =
  | 'string'
  | 'flag'
  | 'port'
  | 'enum'
  | 'list'
  | 'custom';

export type ParameterValue = string | number | boolean | readonly string[];

export interface Parameter {
  /** The field the value is read into. */
  readonly key: string;
  /** The CLI form the help shows first. */
  readonly cli: string;
  /** Further CLI forms, read after `cli` (`--http-host` beside `--host`). */
  readonly cliAliases?: readonly string[];
  /** Absent where the parameter has no environment form. */
  readonly env?: string;
  /** The YAML key; a dotted path for a nested one (`http.port`). Absent: no YAML form. */
  readonly yaml?: string;
  readonly kind: ParameterKind;
  /** An enum's words. */
  readonly values?: readonly string[];
  /** A custom row's reader: the typed value, or a throw in its own words. */
  readonly parse?: (raw: unknown, name: string) => ParameterValue;
  /** The value when no form gives one; also the template's value. */
  readonly default?: ParameterValue;
  /** The value placeholder of the help (`=<minutes>`); default by kind. */
  readonly valueHint?: string;
  /** The help section the row is listed under. */
  readonly section: string;
  /** The help sentence(s). */
  readonly help: string;
}

/**
 * A parameter that is not this binary's: gone (`--transport`), or another
 * binary's (`--sse-port` in core). Its CLI and YAML forms — and, for a
 * parameter that is gone, its environment names — stop the start with
 * `words(form)`.
 */
export interface RemovedParameter {
  /** CLI names, matched as `--x` or `--x=…`. */
  readonly cli?: readonly string[];
  /** CLI name prefixes (`--http-`): every name that starts with one. */
  readonly cliPrefixes?: readonly string[];
  /**
   * Environment names of a parameter that is gone (`MCP_TRANSPORT`). Another
   * binary's environment variables are not listed: an environment is
   * inherited, so they are not read at all (§10.1, the user's ruling).
   */
  readonly env?: readonly string[];
  /** Top-level YAML keys. */
  readonly yaml?: readonly string[];
  /**
   * The refusal, given the form the user used (`--sse-port`, `MCP_SSE_PORT`,
   * `sse (config file)`) and the value it carried, as given: the text after
   * `=` or the next argument (CLI), the variable's value (env), the key's
   * value (YAML); `undefined` when the form carried none. Most refusals read
   * the form alone; a removed `--exposition` names the binary its words ask
   * for.
   */
  readonly words: (form: string, value?: unknown) => string;
}

export interface ParameterTable {
  /** The binary, for USAGE and the template's header. */
  readonly program: string;
  readonly rows: readonly Parameter[];
  readonly removed: readonly RemovedParameter[];
}

type Source = 'cli' | 'env' | 'yaml';

function cliNames(p: Parameter): readonly string[] {
  return [p.cli, ...(p.cliAliases ?? [])];
}

/** `--x` of `--x=v`, else the argument itself. */
function argName(arg: string): string {
  const eq = arg.indexOf('=');
  return eq === -1 ? arg : arg.slice(0, eq);
}

/** The value at a dotted YAML path, or undefined. Plain code. */
function yamlAt(
  yaml: Record<string, unknown> | null | undefined,
  dotted: string | undefined,
): unknown {
  if (!yaml || dotted === undefined) return undefined;
  let node: unknown = yaml;
  for (const segment of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

interface RemovedHit {
  readonly form: string;
  readonly value: unknown;
  readonly removed: RemovedParameter;
}

function removedYamlHits(
  table: ParameterTable,
  yaml?: Record<string, unknown> | null,
): RemovedHit[] {
  if (!yaml || typeof yaml !== 'object') return [];
  const found: RemovedHit[] = [];
  for (const removed of table.removed) {
    for (const key of removed.yaml ?? []) {
      if (key in yaml) {
        found.push({
          form: `${key} (config file)`,
          value: (yaml as Record<string, unknown>)[key],
          removed,
        });
      }
    }
  }
  return found;
}

/** The first form of a removed parameter, as the user used it: CLI, then env, then YAML. */
function removedHit(
  table: ParameterTable,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): RemovedHit | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const name = argName(arg);
    for (const removed of table.removed) {
      if (
        removed.cli?.includes(name) ||
        removed.cliPrefixes?.some((prefix) => name.startsWith(prefix))
      ) {
        // `--x=v` carries `v`; `--x v` the next argument unless it is a flag.
        const next = argv[index + 1];
        const value =
          arg.length > name.length
            ? arg.slice(name.length + 1)
            : next !== undefined && !next.startsWith('-')
              ? next
              : undefined;
        return { form: name, value, removed };
      }
    }
  }
  for (const removed of table.removed) {
    for (const name of removed.env ?? []) {
      if (env[name] !== undefined) {
        return { form: name, value: env[name], removed };
      }
    }
  }
  return removedYamlHits(table, yaml)[0];
}

/** Throws naming the first removed parameter found, in the form it was used. */
export function refuseRemovedParameters(
  table: ParameterTable,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): void {
  const hit = removedHit(table, argv, env, yaml);
  if (hit) throw new ParameterRefusal(hit.removed.words(hit.form, hit.value));
}

function nameIn(p: Parameter, source: Source, cliName?: string): string {
  if (source === 'cli') return cliName ?? p.cli;
  if (source === 'env') return p.env ?? p.cli;
  return `${p.yaml} (config file)`;
}

function valueHint(p: Parameter): string {
  if (p.valueHint !== undefined) return p.valueHint;
  if (p.kind === 'flag') return '';
  if (p.kind === 'port') return '=<port>';
  if (p.kind === 'enum') return `=<${p.values?.join('|')}>`;
  if (p.kind === 'list') return '=<a,b>';
  return '=<value>';
}

/** `a,b;c` → `['a', 'b', 'c']`, blanks dropped. Plain code. */
function splitList(text: string): string[] {
  const items: string[] = [];
  let current = '';
  for (const c of text) {
    if (c === ',' || c === ';') {
      items.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  items.push(current);
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

/** Convert one raw value to its typed form, or say why not. */
function convert(
  p: Parameter,
  name: string,
  raw: unknown,
): ParameterValue | undefined {
  if (raw === undefined || raw === null) return undefined;

  if (p.kind === 'custom') {
    if (typeof raw === 'string' && raw.trim() === '') return undefined;
    try {
      return p.parse?.(raw, name);
    } catch (error) {
      // A row's reader words its refusal as a ParameterRefusal; any other
      // throw gets fixed words — its message never reaches the refusal.
      throw new ParameterRefusal(
        error instanceof ParameterRefusal ? error.words : `Invalid ${name}`,
      );
    }
  }

  if (p.kind === 'flag') {
    if (typeof raw === 'boolean') return raw;
    const word = String(raw).trim().toLowerCase();
    if (word === '') return undefined;
    if (word === 'true') return true;
    if (word === 'false') return false;
    throw new ParameterRefusal(
      `Invalid ${name}: "${String(raw)}". Must be true or false`,
    );
  }

  if (p.kind === 'list') {
    const items = Array.isArray(raw)
      ? raw.flatMap((item) => splitList(String(item)))
      : splitList(String(raw));
    return items.length > 0 ? items : undefined;
  }

  const text = String(raw).trim();
  if (text === '') return undefined;

  if (p.kind === 'port') {
    const port = isDigits(text) ? Number.parseInt(text, 10) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ParameterRefusal(
        `Invalid ${name}: "${text}". Must be a port between 1 and 65535`,
      );
    }
    return port;
  }

  if (p.kind === 'enum') {
    const word = text.toLowerCase();
    if (!p.values?.includes(word)) {
      throw new ParameterRefusal(
        `Invalid ${name}: "${text}". Must be one of: ${p.values?.join(', ')}`,
      );
    }
    return word;
  }

  return text;
}

/** The CLI form: `--x=v`, `--x v`, or a bare flag, by the first name given. */
function readCli(
  p: Parameter,
  argv: readonly string[],
): { name: string; raw: string | boolean } | undefined {
  for (const name of cliNames(p)) {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === name) {
        if (p.kind === 'flag') return { name, raw: true };
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('-')) {
          throw new ParameterRefusal(
            `${name} needs a value: ${name}${valueHint(p)}`,
          );
        }
        return { name, raw: next };
      }
      if (arg.startsWith(`${name}=`)) {
        return { name, raw: arg.slice(name.length + 1) };
      }
    }
  }
  return undefined;
}

/** One row's value and the form it came from; undefined when set nowhere. */
function readRow(
  p: Parameter,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): { value: ParameterValue; source: string } | undefined {
  const cli = readCli(p, argv);
  const sources: [Source, unknown, string | undefined][] = [
    ['cli', cli?.raw, cli?.name],
    ['env', p.env === undefined ? undefined : env[p.env], undefined],
    ['yaml', yamlAt(yaml, p.yaml), undefined],
  ];
  for (const [source, raw, cliName] of sources) {
    const name = nameIn(p, source, cliName);
    const value = convert(p, name, raw);
    if (value !== undefined) return { value, source: name };
  }
  return undefined;
}

/**
 * Read every row of the table: CLI beats env beats YAML; a row set nowhere
 * takes its default, or is absent. A removed parameter's CLI or YAML form (or
 * the env name of one that is gone) is refused first.
 */
export function readParameters(
  table: ParameterTable,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): Record<string, ParameterValue> {
  refuseRemovedParameters(table, argv, env, yaml);
  const out: Record<string, ParameterValue> = {};
  for (const p of table.rows) {
    const read = readRow(p, argv, env, yaml);
    if (read !== undefined) out[p.key] = read.value;
    else if (p.default !== undefined) out[p.key] = p.default;
  }
  return out;
}

/**
 * The form a parameter was read from, named as a refusal names it: `--env`,
 * `MCP_ENV_PATH`, `env-path (config file)`. Undefined when it is set nowhere.
 * Same precedence as `readParameters`.
 */
export function parameterSource(
  table: ParameterTable,
  key: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): string | undefined {
  const p = table.rows.find((row) => row.key === key);
  if (!p) return undefined;
  return readRow(p, argv, env, yaml)?.source;
}

/**
 * A YAML key that names a secret or a session value. YAML is configuration
 * only: secrets and the session live in .env or the environment.
 */
const SECRET_KEY_FRAGMENTS = [
  'password',
  'passphrase',
  'secret',
  'token',
  'cookie',
  'refresh',
  'credential',
] as const;

/** Every secret- or session-looking key at any depth, by its dotted path. Never a value. */
export function findSecretYamlKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  for (const [key, inner] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    const lower = key.toLowerCase();
    if (
      !Array.isArray(value) &&
      SECRET_KEY_FRAGMENTS.some((f) => lower.includes(f))
    ) {
      found.push(path);
    }
    found.push(...findSecretYamlKeys(inner, path));
  }
  return found;
}

/** Every refusal of a YAML file against the table: removed keys, secrets, values. */
export function validateYamlParameters(
  table: ParameterTable,
  yaml: Record<string, unknown>,
): string[] {
  const errors: string[] = removedYamlHits(table, yaml).map(
    ({ form, value, removed }) => removed.words(form, value),
  );
  errors.push(
    ...findSecretYamlKeys(yaml).map(
      (key) =>
        `Config file key "${key}" looks like a secret or a session value. YAML is configuration only: put secrets and the session in .env or the environment`,
    ),
  );
  for (const p of table.rows) {
    if (p.yaml === undefined) continue;
    try {
      convert(p, nameIn(p, 'yaml'), yamlAt(yaml, p.yaml));
    } catch (error) {
      errors.push(
        error instanceof ParameterRefusal ? error.words : `Invalid ${p.yaml}`,
      );
    }
  }
  return errors;
}

const HELP_COLUMN = 35;
const HELP_WIDTH = 100;

/** `text` wrapped at word boundaries, each further line indented by `indent`. */
function wrap(text: string, indent: number): string {
  const words = text.split(' ').filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (
      line.length > 0 &&
      indent + line.length + 1 + word.length > HELP_WIDTH
    ) {
      lines.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join(`\n${' '.repeat(indent)}`);
}

function rowHelp(p: Parameter): string {
  const head = `  ${p.cli}${valueHint(p)}`;
  const pad =
    head.length < HELP_COLUMN
      ? head.padEnd(HELP_COLUMN)
      : `${head}\n${' '.repeat(HELP_COLUMN)}`;
  const forms: string[] = [];
  if (p.cliAliases?.length) forms.push(`also: ${p.cliAliases.join(', ')}`);
  if (p.env) forms.push(`env: ${p.env}`);
  if (p.yaml) forms.push(`yaml: ${p.yaml}`);
  const formLine =
    forms.length > 0 ? `\n${' '.repeat(HELP_COLUMN)}${forms.join(', ')}` : '';
  return `${pad}${wrap(p.help, HELP_COLUMN)}${formLine}`;
}

/** The table's rows, under their sections, in the table's order. */
export function parametersHelp(table: ParameterTable): string {
  const sections: string[] = [];
  const rows = new Map<string, Parameter[]>();
  for (const p of table.rows) {
    if (!rows.has(p.section)) {
      rows.set(p.section, []);
      sections.push(p.section);
    }
    rows.get(p.section)?.push(p);
  }
  return sections
    .map(
      (section) =>
        `${section}:\n${(rows.get(section) ?? []).map(rowHelp).join('\n')}`,
    )
    .join('\n\n');
}

/**
 * The help text of a binary: USAGE, its description, its table, then the
 * sections it adds (the tools, the environment, examples). Every
 * option listed is one the binary reads; none of another binary's is.
 */
export function generateHelp(
  table: ParameterTable,
  options: { description: string; sections?: readonly string[] },
): string {
  return `
MCP ABAP ADT Server - SAP ABAP Development Tools MCP Integration

USAGE:
  ${table.program} [options]

DESCRIPTION:
${options.description}

  --help, -h                       Show this help message
  --version, -v                    Show the version

  Each parameter has a CLI form, and an environment and a YAML form where listed; the
  CLI wins over the environment, which wins over the YAML file. An invalid value is
  refused at startup, and so is a parameter of another binary, naming the binary that
  serves it. Secrets and the session live in .env or the environment, never in YAML:
  the server refuses a YAML key that looks like one.

${parametersHelp(table)}
${(options.sections ?? []).join('\n')}
`;
}

/** A YAML scalar for the template. */
function templateValue(value: ParameterValue | undefined): string {
  if (value === undefined) return '';
  if (Array.isArray(value)) return ` ${value.join(',')}`;
  return ` ${String(value)}`;
}

interface TemplateNode {
  readonly leaves: Map<string, Parameter>;
  readonly children: Map<string, TemplateNode>;
  readonly order: string[];
}

function newNode(): TemplateNode {
  return { leaves: new Map(), children: new Map(), order: [] };
}

function renderNode(node: TemplateNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const parts: string[] = [];
  for (const entry of node.order) {
    const child = node.children.get(entry);
    if (child) {
      parts.push(`${indent}${entry}:\n${renderNode(child, depth + 1)}`);
      continue;
    }
    const p = node.leaves.get(entry);
    if (!p) continue;
    const values = p.values ? ` (${p.values.join(' | ')})` : '';
    const value =
      p.kind === 'flag'
        ? templateValue(p.default ?? false)
        : templateValue(p.default);
    const forms = [p.cli, ...(p.cliAliases ?? []), ...(p.env ? [p.env] : [])];
    parts.push(
      `${indent}# ${p.help}${values}\n${indent}# Also: ${forms.join(', ')}\n${indent}${entry}:${value}\n`,
    );
  }
  return parts.join('\n');
}

/** The `--conf` template: every row with a YAML form, nested by its dotted key. */
export function parametersTemplate(table: ParameterTable): string {
  const root = newNode();
  for (const p of table.rows) {
    if (p.yaml === undefined) continue;
    const segments = p.yaml.split('.');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let child = node.children.get(segment);
      if (!child) {
        child = newNode();
        node.children.set(segment, child);
        node.order.push(segment);
      }
      node = child;
    }
    const leaf = segments[segments.length - 1];
    node.leaves.set(leaf, p);
    node.order.push(leaf);
  }
  return `# MCP ABAP ADT Server configuration: ${table.program}
# Startup parameters of ${table.program}; each also has a CLI form, and most an
# environment form. The CLI wins over the environment, which wins over this file.
# This file is configuration only: secrets and the session belong in .env files or
# the environment, and a key that looks like a secret is refused. A parameter of
# another binary is refused, naming the binary that serves it.

${renderNode(root, 0)}`;
}

// ============================================================================
// The shared rows (D38, D50; spec §10.1)
// ============================================================================

/** `--conf` / `--config`: the YAML file. Read before the others; no env or YAML form. */
export const CONF_ROW: Parameter = {
  key: 'configFile',
  cli: '--conf',
  cliAliases: ['--config'],
  kind: 'string',
  valueHint: '=<path>',
  section: 'OPTIONS',
  help: 'Path to the YAML config file. If the file does not exist, a template of this binary is written there and the start ends. Command-line arguments and the environment override its values',
};

/** `--system-type` / `SAP_SYSTEM_TYPE`. */
export const SYSTEM_TYPE_ROW: Parameter = {
  key: 'systemType',
  cli: '--system-type',
  env: 'SAP_SYSTEM_TYPE',
  yaml: 'system-type',
  kind: 'enum',
  values: ['onprem', 'cloud', 'legacy'],
  section: 'OPTIONS',
  help: 'SAP system type: the tools offered (default cloud), the connector and whether the master system is asked of the system',
};

export const STATE_IDLE_CLI = '--state-idle-minutes';
export const STATE_IDLE_ENV = 'MCP_STATE_IDLE_MINUTES';
export const STATE_IDLE_YAML = 'state-idle-minutes';

/**
 * `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` / `state-idle-minutes`:
 * the idle bound on held state, the owner's one exception to "no timeouts",
 * as main reads it (a whole number, 30 to 35 791, default 30), in every
 * binary's table (§3.8).
 */
export const STATE_IDLE_ROW: Parameter = {
  key: 'stateIdleMinutes',
  cli: STATE_IDLE_CLI,
  env: STATE_IDLE_ENV,
  yaml: STATE_IDLE_YAML,
  kind: 'custom',
  parse: (raw, name) => {
    try {
      return parseStateIdleMinutes(raw, name);
    } catch (error) {
      // main's own reader words the refusal (it quotes only the user's value);
      // the row hands those words on as its refusal, as main prints them.
      throw new ParameterRefusal(
        error instanceof Error ? error.message : `Invalid ${name}`,
      );
    }
  },
  default: DEFAULT_STATE_IDLE_MINUTES,
  valueHint: '=<minutes>',
  section: 'HELD STATE',
  help: `Held state (a debug session) ends after this many minutes without a tool call. Default and minimum: 30; maximum: ${MAX_STATE_IDLE_MINUTES}; a whole number. Activity is a tool call on the instance; a call in flight (a wait on the server) pauses the bound, and a listener's own background re-poll does not count.`,
};

/** The longest `--shutdown-timeout`: a day. */
export const MAX_SHUTDOWN_TIMEOUT_SECONDS = 86_400;

/**
 * `--shutdown-timeout`'s value: a whole number of seconds from 1 to 86 400,
 * read by plain code — ASCII digits only, as a string or a YAML number.
 */
export function parseShutdownTimeout(raw: unknown, name: string): number {
  const text = typeof raw === 'string' ? raw.trim() : String(raw);
  let digits = text.length > 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) digits = false;
  }
  const value =
    typeof raw === 'number'
      ? raw
      : digits
        ? Number.parseInt(text, 10)
        : Number.NaN;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SHUTDOWN_TIMEOUT_SECONDS
  ) {
    throw new ParameterRefusal(
      `Invalid ${name}: "${text}". Must be a whole number of seconds from 1 to ${MAX_SHUTDOWN_TIMEOUT_SECONDS}`,
    );
  }
  return value;
}

/**
 * `--shutdown-timeout` / `MCP_SHUTDOWN_TIMEOUT` / `shutdown-timeout` (D33),
 * in every binary's table: the forced close after this many seconds of a
 * shutdown. **No default**: without it a shutdown waits for every running
 * tool, every state undo and every session write, as long as they take; a
 * second `SIGTERM` / `SIGINT` is the other way to end the waiting.
 */
export const SHUTDOWN_TIMEOUT_ROW: Parameter = {
  key: 'shutdownTimeout',
  cli: '--shutdown-timeout',
  env: 'MCP_SHUTDOWN_TIMEOUT',
  yaml: 'shutdown-timeout',
  kind: 'custom',
  parse: parseShutdownTimeout,
  valueHint: '=<seconds>',
  section: 'OPTIONS',
  help: `Ends a shutdown that has not finished after this many seconds (1-${MAX_SHUTDOWN_TIMEOUT_SECONDS}): running tools are no longer waited for, every ADT session is logged off, exit 1 naming what was still running. Default: none — a shutdown waits for running tools to finish and session writes to land; a second SIGTERM/SIGINT ends the waiting the same way. What it costs: a tool cut short, a session write lost (a discarded refresh token can come back)`,
};

/**
 * The TLS rows (D50), read by `mcp-abap-adt-http` and `mcp-abap-adt-sse`:
 * `--tls-cert` / `--tls-key` / `--tls-ca`, `MCP_TLS_*`, YAML
 * `<transport>.tls.*` as before.
 */
export function tlsRows(yamlPrefix: 'http' | 'sse'): readonly Parameter[] {
  return [
    {
      key: 'tlsCert',
      cli: '--tls-cert',
      env: 'MCP_TLS_CERT',
      yaml: `${yamlPrefix}.tls.cert`,
      kind: 'string',
      valueHint: '=<path>',
      section: 'TLS/HTTPS',
      help: 'TLS certificate file (PEM). With --tls-key, the server starts in HTTPS mode',
    },
    {
      key: 'tlsKey',
      cli: '--tls-key',
      env: 'MCP_TLS_KEY',
      yaml: `${yamlPrefix}.tls.key`,
      kind: 'string',
      valueHint: '=<path>',
      section: 'TLS/HTTPS',
      help: 'TLS private key file (PEM). With --tls-cert, the server starts in HTTPS mode',
    },
    {
      key: 'tlsCa',
      cli: '--tls-ca',
      env: 'MCP_TLS_CA',
      yaml: `${yamlPrefix}.tls.ca`,
      kind: 'string',
      valueHint: '=<path>',
      section: 'TLS/HTTPS',
      help: 'CA certificate file (PEM), optional',
    },
  ];
}

/** The TLS configuration of the read values: cert and key together, or no TLS. */
export function tlsConfigOf(
  values: Record<string, ParameterValue>,
): TlsConfig | undefined {
  const cert = values.tlsCert as string | undefined;
  const key = values.tlsKey as string | undefined;
  const ca = values.tlsCa as string | undefined;
  if (cert === undefined && key === undefined && ca === undefined) {
    return undefined;
  }
  if (cert === undefined || key === undefined) {
    throw new ParameterRefusal(
      'TLS needs both --tls-cert and --tls-key (MCP_TLS_CERT, MCP_TLS_KEY); --tls-ca only beside them',
    );
  }
  return { cert, key, ...(ca !== undefined && { ca }) };
}

// ============================================================================
// The removed parameters the binaries share (D39, §10.1)
// ============================================================================

/** The D39 sentences, per binary family (verbatim, §10.1). */
export const TRANSPORT_GONE = {
  stdio:
    '`--transport` is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse` (compact: `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`)',
  http: '`--transport` is gone: `mcp-abap-adt-http` serves Streamable HTTP; for stdio run `mcp-abap-adt`, for SSE `mcp-abap-adt-sse`',
  sse: '`--transport` is gone: `mcp-abap-adt-sse` serves SSE; for stdio run `mcp-abap-adt`, for Streamable HTTP `mcp-abap-adt-http`',
} as const;

/** `--transport` / `MCP_TRANSPORT` / YAML `transport`, with any value: the binary's sentence. */
export function transportRemoved(
  family: keyof typeof TRANSPORT_GONE,
): RemovedParameter {
  return {
    cli: ['--transport'],
    env: ['MCP_TRANSPORT'],
    yaml: ['transport'],
    words: () => TRANSPORT_GONE[family],
  };
}

export const SSE_ELSEWHERE =
  'SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)';
export const HTTP_ELSEWHERE =
  'Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)';
export const TLS_ELSEWHERE =
  'TLS is an option of `mcp-abap-adt-http` and `mcp-abap-adt-sse`';
export const DESTINATIONS_ELSEWHERE =
  'destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers';

/** The SSE options, in a binary that is not `mcp-abap-adt-sse`. */
export const SSE_OPTIONS_REMOVED: RemovedParameter = {
  cli: [
    '--sse-host',
    '--sse-port',
    '--sse-path',
    '--post-path',
    '--sse-enable-dns-protection',
  ],
  cliPrefixes: ['--sse-allowed-'],
  yaml: ['sse'],
  words: (form) => `${form}: ${SSE_ELSEWHERE}`,
};

/** The Streamable HTTP options, in a binary that is not `mcp-abap-adt-http`. */
export const HTTP_OPTIONS_REMOVED: RemovedParameter = {
  cli: ['--host', '--port', '--path'],
  cliPrefixes: ['--http-'],
  yaml: ['http'],
  words: (form) => `${form}: ${HTTP_ELSEWHERE}`,
};

/** The TLS options, in the stdio binary. */
export const TLS_OPTIONS_REMOVED: RemovedParameter = {
  cliPrefixes: ['--tls-'],
  words: (form) => `${form}: ${TLS_ELSEWHERE}`,
};

/**
 * The destination and login options, in the HTTP and SSE binaries: their
 * credentials come only from the `x-sap-*` headers (D39, D48).
 */
export const DESTINATION_OPTIONS_REMOVED: RemovedParameter = {
  cli: [
    '--mcp',
    '--env',
    '--env-path',
    '--auth-broker-path',
    '--allow-destination-header',
    '--unsafe',
    '--connection-type',
    '--login-timeout',
    '--renewal',
    '--auth-debug',
  ],
  cliPrefixes: ['--browser'],
  yaml: [
    'mcp',
    'env',
    'env-path',
    'auth-broker-path',
    'allow-destination-header',
    'unsafe',
    'connection-type',
    'browser',
    'browser-program',
    'browser-auth-port',
    'login-timeout',
    'renewal',
    'auth-debug',
  ],
  words: (form) => `${form}: ${DESTINATIONS_ELSEWHERE}`,
};

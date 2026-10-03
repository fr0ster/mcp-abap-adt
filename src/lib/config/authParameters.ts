/**
 * The auth and connection parameters, in one table.
 *
 * Each row names a parameter in its three forms — CLI, environment variable and
 * YAML key. The argument parser, the YAML loader and validator, the template
 * `--config` generates and the help text all read this table, so a form cannot
 * exist in one place and be missing in another. Precedence: CLI, then env, then
 * YAML.
 *
 * A refusal names the parameter in the form the user used. It may quote the
 * user's own value (a port, an enum word): those are not secrets.
 */

import type { IServerConfig } from './IServerConfig.js';

export type AuthParameterKind = 'string' | 'flag' | 'port' | 'enum';

/** A parameter's resolved key in `IServerConfig`, or the raw form of the env-file pair. */
export type AuthParameterKey =
  | keyof IServerConfig
  | 'envDestination'
  | 'envPath';

export interface AuthParameter {
  readonly key: AuthParameterKey;
  readonly cli: string;
  /** Absent where the parameter has no environment form (it never had one released). */
  readonly env?: string;
  readonly yaml: string;
  readonly kind: AuthParameterKind;
  readonly values?: readonly string[];
  /** One sentence for the help text and the template. */
  readonly help: string;
}

export const AUTH_PARAMETERS: readonly AuthParameter[] = [
  {
    key: 'mcpDestination',
    cli: '--mcp',
    yaml: 'mcp',
    kind: 'string',
    help: 'Default destination name (stores under the auth-broker path). Example: TRIAL',
  },
  {
    key: 'envDestination',
    cli: '--env',
    yaml: 'env',
    kind: 'string',
    help: 'Env file by destination name (resolved to sessions/<name>.env)',
  },
  {
    key: 'envPath',
    cli: '--env-path',
    env: 'MCP_ENV_PATH',
    yaml: 'env-path',
    kind: 'string',
    help: 'Env file by explicit path (or a file name relative to the working directory)',
  },
  {
    key: 'authBrokerPath',
    cli: '--auth-broker-path',
    env: 'AUTH_BROKER_PATH',
    yaml: 'auth-broker-path',
    kind: 'string',
    help: "The stores' base directory (default: the platform paths)",
  },
  {
    key: 'unsafe',
    cli: '--unsafe',
    env: 'MCP_UNSAFE',
    yaml: 'unsafe',
    kind: 'flag',
    help: 'Write named sessions to disk instead of keeping them in memory',
  },
  {
    key: 'browser',
    cli: '--browser',
    env: 'MCP_BROWSER',
    yaml: 'browser',
    kind: 'string',
    help: 'Browser for a login: chrome, edge, firefox, system (default), headless, none',
  },
  {
    key: 'browserAuthPort',
    cli: '--browser-auth-port',
    env: 'MCP_BROWSER_AUTH_PORT',
    yaml: 'browser-auth-port',
    kind: 'port',
    help: 'Login callback port, 1-65535 (default: 61001)',
  },
  {
    key: 'allowDestinationHeader',
    cli: '--allow-destination-header',
    yaml: 'allow-destination-header',
    kind: 'flag',
    help: 'Honour the x-mcp-destination header (HTTP/SSE only, off by default)',
  },
  {
    key: 'connectionType',
    cli: '--connection-type',
    env: 'SAP_CONNECTION_TYPE',
    yaml: 'connection-type',
    kind: 'enum',
    values: ['http', 'rfc'],
    help: 'SAP connection type (default: http). rfc needs the SAP NW RFC SDK',
  },
  {
    key: 'systemType',
    cli: '--system-type',
    env: 'SAP_SYSTEM_TYPE',
    yaml: 'system-type',
    kind: 'enum',
    values: ['onprem', 'cloud', 'legacy'],
    help: 'SAP system type, overriding auto-detection (default: cloud)',
  },
];

type Source = 'cli' | 'env' | 'yaml';

function nameIn(p: AuthParameter, source: Source): string {
  if (source === 'cli') return p.cli;
  if (source === 'env') return p.env ?? p.cli;
  return `${p.yaml} (config file)`;
}

function valueHint(p: AuthParameter): string {
  if (p.kind === 'flag') return '';
  if (p.kind === 'port') return '=<port>';
  if (p.kind === 'enum') return `=<${p.values?.join('|')}>`;
  return '=<value>';
}

/** Convert one raw value to its typed form, or say why not (without quoting it unless vetted). */
function convert(
  p: AuthParameter,
  source: Source,
  raw: unknown,
): string | number | boolean | undefined {
  const name = nameIn(p, source);
  if (raw === undefined || raw === null) return undefined;

  if (p.kind === 'flag') {
    if (typeof raw === 'boolean') return raw;
    const word = String(raw).trim().toLowerCase();
    if (word === '') return undefined;
    if (word === 'true') return true;
    if (word === 'false') return false;
    throw new Error(`Invalid ${name}: "${String(raw)}". Must be true or false`);
  }

  const text = String(raw).trim();
  if (text === '') return undefined;

  if (p.kind === 'port') {
    const port = /^\d+$/.test(text) ? Number.parseInt(text, 10) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(
        `Invalid ${name}: "${text}". Must be a port between 1 and 65535`,
      );
    }
    return port;
  }

  if (p.kind === 'enum') {
    const word = text.toLowerCase();
    if (!p.values?.includes(word)) {
      throw new Error(
        `Invalid ${name}: "${text}". Must be one of: ${p.values?.join(', ')}`,
      );
    }
    return word;
  }

  return text;
}

/** The CLI form: `--x=v`, `--x v`, or a bare flag. Undefined when absent. */
function readCli(
  p: AuthParameter,
  argv: readonly string[],
): string | boolean | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === p.cli) {
      if (p.kind === 'flag') return true;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error(`${p.cli} needs a value${valueHint(p)}`);
      }
      return next;
    }
    if (arg.startsWith(`${p.cli}=`)) return arg.slice(p.cli.length + 1);
  }
  return undefined;
}

/**
 * Read every row: CLI beats env beats YAML. A parameter set nowhere is absent
 * from the result (the consumer's default applies later).
 */
export function readAuthParameters(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): Partial<IServerConfig> {
  const out: Record<string, string | number | boolean> = {};
  for (const p of AUTH_PARAMETERS) {
    const sources: [Source, unknown][] = [
      ['cli', readCli(p, argv)],
      ['env', p.env === undefined ? undefined : env[p.env]],
      ['yaml', yaml?.[p.yaml]],
    ];
    for (const [source, raw] of sources) {
      const value = convert(p, source, raw);
      if (value !== undefined) {
        out[p.key] = value;
        break;
      }
    }
  }
  return out as Partial<IServerConfig>;
}

/**
 * The form a parameter was read from, named as a refusal names it: `--env`,
 * `MCP_ENV_PATH`, `env-path (config file)`. Undefined when it is set nowhere.
 * Same precedence as `readAuthParameters`.
 */
export function authParameterSource(
  key: AuthParameterKey,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): string | undefined {
  const p = AUTH_PARAMETERS.find((row) => row.key === key);
  if (!p) return undefined;
  const sources: [Source, unknown][] = [
    ['cli', readCli(p, argv)],
    ['env', p.env === undefined ? undefined : env[p.env]],
    ['yaml', yaml?.[p.yaml]],
  ];
  for (const [source, raw] of sources) {
    if (convert(p, source, raw) !== undefined) return nameIn(p, source);
  }
  return undefined;
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

/** Errors for the YAML forms alone, for `validateYamlConfig`. */
export function validateAuthYaml(yaml: Record<string, unknown>): string[] {
  const errors: string[] = findSecretYamlKeys(yaml).map(
    (key) =>
      `Config file key "${key}" looks like a secret or a session value. YAML is configuration only: put secrets and the session in .env or the environment`,
  );
  for (const p of AUTH_PARAMETERS) {
    try {
      convert(p, 'yaml', yaml[p.yaml]);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return errors;
}

/** The AUTHENTICATION block of the help text. */
export function authParametersHelp(): string {
  return AUTH_PARAMETERS.map((p) => {
    const head = `  ${p.cli}${valueHint(p)}`.padEnd(35);
    const forms = p.env ? `env: ${p.env}, yaml: ${p.yaml}` : `yaml: ${p.yaml}`;
    return `${head}${p.help}\n${' '.repeat(35)}${forms}`;
  }).join('\n');
}

/** The auth block of the `--config` template: every row, by its YAML key. */
export function authParametersTemplate(): string {
  return AUTH_PARAMETERS.map((p) => {
    const value = p.kind === 'flag' ? ' false' : '';
    const values = p.values ? ` (${p.values.join(' | ')})` : '';
    return `# ${p.help}${values}\n${p.yaml}:${value}\n`;
  }).join('\n');
}

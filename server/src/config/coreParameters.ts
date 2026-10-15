/**
 * `mcp-abap-adt`'s parameter table: the destination, the
 * browser and the login, beside lib's shared rows. Nothing of the HTTP or SSE
 * binaries is here; the CLI or YAML form of one of their options — or any
 * form of `--transport`, which is gone — stops the start naming the binary
 * that serves it. Their environment variables are not read.
 */

import {
  CONF_ROW,
  HTTP_OPTIONS_REMOVED,
  type IServerConfig,
  type Parameter,
  ParameterRefusal,
  type ParameterTable,
  type ParameterValue,
  parameterSource,
  readParameters,
  SHUTDOWN_TIMEOUT_ROW,
  SSE_OPTIONS_REMOVED,
  STATE_IDLE_ROW,
  TLS_OPTIONS_REMOVED,
  transportRemoved,
  type YamlConfig,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { SYSTEM_TYPE_ROW } from '@mcp-abap-adt/responsible-rules';
import { resolveEnvFilePath } from './envResolver';

const DESTINATION = 'DESTINATION AND LOGIN';

/** The destination, browser and login rows: core's own. */
export const CORE_ROWS: readonly Parameter[] = [
  {
    key: 'mcpDestination',
    cli: '--mcp',
    yaml: 'mcp',
    kind: 'string',
    section: DESTINATION,
    help: 'Default destination name (stores under the auth-broker path). Example: TRIAL',
  },
  {
    key: 'envDestination',
    cli: '--env',
    yaml: 'env',
    kind: 'string',
    section: DESTINATION,
    help: 'Env file by destination name (resolved to sessions/<name>.env)',
  },
  {
    key: 'envPath',
    cli: '--env-path',
    env: 'MCP_ENV_PATH',
    yaml: 'env-path',
    kind: 'string',
    section: DESTINATION,
    help: 'Env file by explicit path (or a file name relative to the working directory)',
  },
  {
    key: 'authBrokerPath',
    cli: '--auth-broker-path',
    env: 'AUTH_BROKER_PATH',
    yaml: 'auth-broker-path',
    kind: 'string',
    section: DESTINATION,
    help: "The stores' base directory (default: the platform paths)",
  },
  {
    key: 'unsafe',
    cli: '--unsafe',
    env: 'MCP_UNSAFE',
    yaml: 'unsafe',
    kind: 'flag',
    section: DESTINATION,
    help: 'Write named sessions to disk instead of keeping them in memory',
  },
  {
    key: 'browser',
    cli: '--browser',
    env: 'MCP_BROWSER',
    yaml: 'browser',
    kind: 'string',
    section: DESTINATION,
    help: 'Browser for a login: system (default), auto, chrome, edge, firefox, none, headless (none and headless: the URL on stderr). Excludes --browser-program',
  },
  {
    key: 'browserProgram',
    cli: '--browser-program',
    env: 'MCP_BROWSER_PROGRAM',
    yaml: 'browser-program',
    kind: 'string',
    section: DESTINATION,
    help: 'The program that opens the login URL instead of a --browser name (Linux: an executable, macOS: an application, Windows: a program). Excludes --browser',
  },
  {
    key: 'renewal',
    cli: '--renewal',
    env: 'MCP_RENEWAL',
    yaml: 'renewal',
    kind: 'enum',
    values: ['refresh-then-login', 'refresh-only'],
    section: DESTINATION,
    help: 'How an expired session is renewed: refresh, then log in (default); or refresh only, never a login',
  },
  {
    key: 'browserAuthPort',
    cli: '--browser-auth-port',
    env: 'MCP_BROWSER_AUTH_PORT',
    yaml: 'browser-auth-port',
    kind: 'port',
    section: DESTINATION,
    help: 'Login callback port, 1-65535 (default: 61001)',
  },
  {
    key: 'connectionType',
    cli: '--connection-type',
    env: 'SAP_CONNECTION_TYPE',
    yaml: 'connection-type',
    kind: 'enum',
    values: ['http', 'rfc'],
    section: DESTINATION,
    help: 'SAP connection type (default: http). rfc needs the SAP NW RFC SDK',
  },
];

/** The longest login bound: a day. */
export const MAX_LOGIN_TIMEOUT_SECONDS = 86_400;

/** Whether `text` is one or more ASCII digits. Plain code. */
function isDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/**
 * `--login-timeout`'s value: a whole number of seconds from 1 to 86 400,
 * read by plain code — digits only, as a string or a YAML number.
 */
export function parseLoginTimeout(raw: unknown, name: string): number {
  const text = typeof raw === 'string' ? raw.trim() : String(raw);
  const value =
    typeof raw === 'number'
      ? raw
      : isDigits(text)
        ? Number.parseInt(text, 10)
        : Number.NaN;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LOGIN_TIMEOUT_SECONDS
  ) {
    throw new ParameterRefusal(
      `Invalid ${name}: "${text}". Must be a whole number of seconds from 1 to ${MAX_LOGIN_TIMEOUT_SECONDS}`,
    );
  }
  return value;
}

/**
 * `--login-timeout` / `MCP_LOGIN_TIMEOUT` / `login-timeout`: the bound
 * on each login, opt-in. No default: without it a login ends on its result,
 * the user's refusal or its request's end.
 */
export const LOGIN_TIMEOUT_ROW: Parameter = {
  key: 'loginTimeout',
  cli: '--login-timeout',
  env: 'MCP_LOGIN_TIMEOUT',
  yaml: 'login-timeout',
  kind: 'custom',
  parse: parseLoginTimeout,
  valueHint: '=<seconds>',
  section: DESTINATION,
  help: `Ends a browser login that has not finished after this many seconds (1-${MAX_LOGIN_TIMEOUT_SECONDS}). Default: none — a login ends when it finishes, the user refuses it, or its request ends`,
};

/**
 * `--auth-debug` / `auth-debug`: the token providers' debug line names
 * a refused request's secrets by their first and last four characters. The
 * command line and the configuration file only — no environment variable
 * turns it on.
 */
export const AUTH_DEBUG_ROW: Parameter = {
  key: 'authDebug',
  cli: '--auth-debug',
  yaml: 'auth-debug',
  kind: 'flag',
  section: DESTINATION,
  help: "Auth debugging: the token providers' debug lines go to stderr, and a refused token request's line names the first and last four characters of each secret it sent. No environment variable. Off by default",
};

/**
 * The login bound as the user set it, for the login-bound sentence: the form it came
 * from (`parameterSource`) with its value — `` `--login-timeout=300` ``,
 * `` `MCP_LOGIN_TIMEOUT=300` ``, or `` `login-timeout: 300` in the
 * configuration file ``.
 */
export function statedLoginTimeout(seconds: number, source?: string): string {
  if (source === LOGIN_TIMEOUT_ROW.env) {
    return `\`${LOGIN_TIMEOUT_ROW.env}=${seconds}\``;
  }
  if (source !== undefined && !source.startsWith('--')) {
    return `\`${LOGIN_TIMEOUT_ROW.yaml}: ${seconds}\` in the configuration file`;
  }
  return `\`${LOGIN_TIMEOUT_ROW.cli}=${seconds}\``;
}

/** `--allow-destination-header`: there is no header to allow any more. */
const ALLOW_DESTINATION_HEADER_REMOVED = {
  cli: ['--allow-destination-header'],
  yaml: ['allow-destination-header'],
  words: (form: string) =>
    `${form} is gone: \`mcp-abap-adt\` serves the destination it is started with (--mcp, --env, --env-path); the HTTP and SSE binaries take credentials only from \`x-sap-*\` headers`,
};

/** Removed in 16.0.0: its only purpose was to switch off the working directory's .env. */
const AUTH_BROKER_REMOVED = {
  cli: ['--auth-broker'],
  env: ['MCP_USE_AUTH_BROKER'],
  yaml: ['auth-broker'],
  words: (form: string) =>
    `${form} was removed in 16.0.0 — remove it from the configuration`,
};

/**
 * core's table for a tool set: its rows, the shared rows, and what it
 * refuses — the set's removed `--exposition` among them, naming the stdio
 * binary its words asked for. `mcp-abap-adt-ro`, `mcp-abap-adt-compact` and
 * `mcp-abap-adt-compact-ro` are this table with their own set, nothing else
 *.
 */
export function coreParameters(
  toolSet: ToolSet,
  program = 'mcp-abap-adt',
): ParameterTable {
  return {
    program,
    rows: [
      CONF_ROW,
      SYSTEM_TYPE_ROW,
      ...CORE_ROWS,
      LOGIN_TIMEOUT_ROW,
      AUTH_DEBUG_ROW,
      STATE_IDLE_ROW,
      SHUTDOWN_TIMEOUT_ROW,
    ],
    removed: [
      toolSet.expositionRemoved('stdio'),
      transportRemoved('stdio'),
      ALLOW_DESTINATION_HEADER_REMOVED,
      AUTH_BROKER_REMOVED,
      SSE_OPTIONS_REMOVED,
      HTTP_OPTIONS_REMOVED,
      TLS_OPTIONS_REMOVED,
    ],
  };
}

/** `mcp-abap-adt`'s table: core's, with the full tool set. */
export const CORE_PARAMETERS: ParameterTable = coreParameters(fullToolSet);

/** What `mcp-abap-adt` reads: the shared values and the destination's. */
export interface CoreConfig extends IServerConfig {
  /** The env file, resolved (`--env` / `--env-path` / `MCP_ENV_PATH`). */
  envFile?: string;
  /** Alias of `envFile`, kept for configs made by hand. */
  envFilePath?: string;
  /** `--env` / `env` as the user gave it: a destination name or a path */
  envDestination?: string;
  /** `--env-path` / `MCP_ENV_PATH` / `env-path` as the user gave it */
  envPath?: string;
  /**
   * The parameter `envFile` came from, as the user gave it: `--env`,
   * `--env-path`, `MCP_ENV_PATH`, `env (config file)`, or
   * `env-path (config file)`.
   */
  envFileSource?: string;
  /** The stores' base directory */
  authBrokerPath?: string;
  /** Default MCP destination from --mcp parameter */
  mcpDestination?: string;
  /** Write named sessions to disk (`--unsafe`) */
  unsafe?: boolean;
  /**
   * The browser of a login (`--browser`): system (default), auto, chrome,
   * edge, firefox, none, headless — mapped by the platform to one of
   * auth-providers' browsers.
   */
  browser?: string;
  /** The program that opens the login URL (`--browser-program`); excludes `browser`. */
  browserProgram?: string;
  /** How an expired session is renewed (`--renewal`); default `refresh-then-login`. */
  renewal?: 'refresh-then-login' | 'refresh-only';
  /** Port for the login's callback (`--browser-auth-port`) */
  browserAuthPort?: number;
  /** `--login-timeout` in seconds: the bound on each login; absent: none. */
  loginTimeout?: number;
  /**
   * The form `loginTimeout` came from: `--login-timeout`,
   * `MCP_LOGIN_TIMEOUT`, or `login-timeout (config file)`.
   */
  loginTimeoutSource?: string;
  /** `--auth-debug`: the providers' debug lines on stderr, secrets in their prepared form. */
  authDebug?: boolean;
  /** SAP connection type: http (default) or rfc */
  connectionType?: 'http' | 'rfc';
  /**
   * The form `connectionType` came from: `--connection-type`,
   * `SAP_CONNECTION_TYPE`, or `connection-type (config file)`. Only the CLI
   * form beats an `SAP_CONNECTION_TYPE` the env file brings (as in 15.x).
   */
  connectionTypeSource?: string;
}

const str = (v: ParameterValue | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;

/**
 * core's configuration from the arguments (without the program's own two),
 * the environment and the loaded config file, read by core's table for
 * `toolSet` (the full set unless a sibling command passes its own). A removed
 * parameter (`--exposition` among them) or an invalid value throws a
 * `ParameterRefusal` in its words.
 */
export function readCoreConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml: YamlConfig | null = null,
  toolSet: ToolSet = fullToolSet,
): CoreConfig {
  const table = coreParameters(toolSet);
  const values = readParameters(table, argv, env, yaml);
  const source = (key: string) => parameterSource(table, key, argv, env, yaml);

  const envDestination = str(values.envDestination);
  const envPath = str(values.envPath);
  const authBrokerPath = str(values.authBrokerPath);
  // --env: a destination name (sessions/<name>.env under the platform paths);
  // --env-path: an explicit path. Nothing is looked up in the working
  // directory: a .env there is read only when named (--env-path=./.env).
  const envFile = resolveEnvFilePath({
    envDestination,
    envPath,
    authBrokerPath,
  });

  return {
    configFile: str(values.configFile),
    systemType: values.systemType as CoreConfig['systemType'],
    // Not written to process.env here: the env file's SAP_SYSTEM_TYPE joins
    // the environment later, and the launcher resolves the precedence then
    // (effectiveSystemType), as for the connection type.
    systemTypeSource: source('systemType'),
    stateIdleMinutes: values.stateIdleMinutes as number,
    shutdownTimeout: values.shutdownTimeout as number | undefined,
    mcpDestination: str(values.mcpDestination),
    envDestination,
    envPath,
    envFile,
    envFilePath: envFile,
    // The resolver prefers the path over the name; so does the source.
    envFileSource:
      envFile === undefined
        ? undefined
        : envPath
          ? source('envPath')
          : source('envDestination'),
    authBrokerPath,
    unsafe: (values.unsafe as boolean | undefined) ?? false,
    browser: str(values.browser),
    browserProgram: str(values.browserProgram),
    renewal: values.renewal as CoreConfig['renewal'],
    browserAuthPort: values.browserAuthPort as number | undefined,
    loginTimeout: values.loginTimeout as number | undefined,
    authDebug: values.authDebug === true,
    loginTimeoutSource:
      values.loginTimeout === undefined ? undefined : source('loginTimeout'),
    connectionType: values.connectionType as CoreConfig['connectionType'],
    connectionTypeSource: source('connectionType'),
  };
}

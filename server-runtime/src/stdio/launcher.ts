import { classify, logFields } from '@mcp-abap-adt/auth-errors';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { IBrowser } from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  assertDestinationName,
  browserCallbackStrategy,
  errorClassOf,
} from '@mcp-abap-adt/lib/auth';
import {
  answerVersionOrHelp,
  generateHelp,
  type LauncherEdges,
  libInstances,
  MESSAGE_SERVER_ENV,
  MESSAGE_SERVER_FIELDS,
  type MessageServerField,
  processEdges,
  readStartupConfig,
  rfcAddressRefusalOf,
} from '@mcp-abap-adt/lib/config';
import {
  InstanceBatch,
  LeftoverSessions,
  runtimeDirectory,
  sapAnswerOf,
} from '@mcp-abap-adt/lib/embeddable';
import {
  logOffAtOnce,
  type StateLogger,
  stderrStateLogger,
} from '@mcp-abap-adt/lib/state';
import {
  fullToolSet,
  registryOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import {
  type AuthDisplayConfig,
  formatAuthConfigForDisplay,
} from '@mcp-abap-adt/lib/utils';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { secondCopyLine } from '../secondCopy.js';
import {
  AuthBrokerFactory,
  BrowserChoiceError,
  browserFor,
  browserOf,
  destinationFailureOf,
  destinationFailureWords,
  type IAuthBrokerFactoryConfig,
  promptLogger,
} from './auth';
import {
  type CoreConfig,
  coreParameters,
  readCoreConfig,
  statedLoginTimeout,
} from './config/coreParameters';
import { hydrateSystemContextFromEnvFile } from './config/envFileContext';
import { getPlatformPaths } from './config/platformPaths';
import { StdioServer } from './StdioServer.js';
import {
  installShutdown,
  type ShutdownProcess,
  startBirth,
} from './shutdown.js';

const stderrLogger: ILogger = {
  info: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.error(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => console.error(...args),
};

const silentLogger: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
const loggerForTransport =
  process.env.DEBUG_AUTH_LOG === 'true' ? stderrLogger : silentLogger;

/** The one line `--auth-debug` prints at the start. */
export const AUTH_DEBUG_WARNING =
  "[MCP] --auth-debug is on: a refused token request's debug line on stderr names the first and last four characters of each secret it sent";

/**
 * The state's lifecycle lines — the idle bound's end of a state, a cleanup
 * that failed — on stderr whatever DEBUG_AUTH_LOG says: they are what an
 * operator needs to see, and the transport logger is silent by default.
 */
export const stateLoggerForTransport: StateLogger = stderrStateLogger;

// Keep strong reference to running server instance to avoid premature GC/exit
let activeServer: StdioServer | undefined;

/**
 * Additional help sections specific to v2 server
 */
const V2_HELP_SECTIONS = `
ENVIRONMENT VARIABLES:

  MCP Server Configuration:
    MCP_ENV_PATH                   Explicit .env file path (same as --env-path)
    MCP_UNSAFE                     Write named destinations' sessions to disk (true|false)
    MCP_BROWSER                    Browser for a login: system|auto|chrome|edge|firefox|none|headless
    MCP_BROWSER_PROGRAM            The program that opens the login URL (excludes MCP_BROWSER)
    MCP_RENEWAL                    refresh-then-login (default) | refresh-only (never a login)
    MCP_BROWSER_AUTH_PORT          Login callback port, 1-65535 (default: 61001)
    MCP_STATE_IDLE_MINUTES         Held state (a debug session) ends after this many minutes
                                   without a tool call: at least 30 (default: 30)

  Auth-Broker:
    DEBUG_AUTH_LOG                 Enable debug logging for auth-broker (true|false)
    DEBUG_AUTH_BROKER              Alias for DEBUG_AUTH_LOG
    AUTH_BROKER_PATH               Base directory of service-keys/ and sessions/

  Debug Options:
    DEBUG_HANDLERS                 Enable handler debug logging (true|false)
    DEBUG_CONNECTORS               Enable connector debug logging (true|false)
    DEBUG_CONNECTION_MANAGER       Enable connection manager debug logging (true|false)
    HANDLER_LOG_SILENT             Disable all handler logs (true|false)

AUTHENTICATIONS (exactly three; a .env or service key stating another is refused):
    basic   SAP_AUTH_TYPE=basic            user and password, HTTP or RFC
    snc     SAP_AUTH_TYPE=snc              RFC only, no user, no password
    jwt     SAP_AUTH_TYPE=jwt, SAP_GRANT_TYPE=authorization_code   browser login
  A token you hold (SAP_GRANT_TYPE=none) is not served over stdio: send it in the
  x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse, or create the
  session with mcp-auth.

SAP CONNECTION (.env file; secrets and the session live here, never in YAML):

  Basic Authentication (on-premise):
    SAP_URL                        SAP system URL (required)
    SAP_CLIENT                     SAP client number (required for basic auth)
    SAP_AUTH_TYPE                  Authentication type: basic|snc|jwt (required)
    SAP_CONNECTION_TYPE            Connection type: http|rfc (default: http)
                                   Precedence: --connection-type, then the environment
                                   (this file joins it, never over a value set), then YAML
    SAP_SYSTEM_TYPE                SAP system type: cloud | onprem | legacy (same as --system-type)
                                   Required for a destination: no default, never guessed (not
                                   from the auth type, not from the URL); it decides the tools
                                   offered (e.g. Programs need onprem), the connector and how
                                   the system's answers are read
    SAP_USERNAME                   SAP username (required for basic auth)
    SAP_PASSWORD                   SAP password (required for basic auth)
    SAP_LANGUAGE                   SAP language (optional, e.g., EN, DE)

  SNC (passwordless logon over RFC; no SAP_USERNAME, no SAP_PASSWORD):
    SAP_AUTH_TYPE=snc with SAP_CONNECTION_TYPE=rfc (or --connection-type=rfc)
    SAP_SNC_PARTNERNAME            The system's SNC name (required)
    SAP_SNC_QOP, SAP_SNC_LIB, SAP_SNC_MYNAME   Optional

  JWT/OAuth2 Authentication (SAP_GRANT_TYPE is required with jwt):
    SAP_GRANT_TYPE                 authorization_code (browser login)
    SAP_JWT_TOKEN                  The session's token (written by mcp-auth or the server)
    SAP_REFRESH_TOKEN              Refresh token (the server stores the one it obtains)
    SAP_UAA_URL                    UAA URL for OAuth2
    SAP_UAA_CLIENT_ID              UAA Client ID
    SAP_UAA_CLIENT_SECRET          UAA Client Secret
    An XSUAA service key needs XSUAA_MCP_URL (the system's URL) in sessions/<destination>.env

  RFC Connection (any system with SAP NW RFC SDK):
    --connection-type=rfc          Enables RFC transport via SADT_REST_RFC_ENDPOINT
                                   (or SAP_CONNECTION_TYPE=rfc in the .env or the environment)
    SAP_URL                        SAP system URL (host:port used to derive RFC params)
    SAP_USERNAME                   SAP username
    SAP_PASSWORD                   SAP password
    SAP_CLIENT                     SAP client number
    Through a message server and a logon group (load-balanced logon); each also
    --mshost, --msserv, --sysid, --group, --saprouter, or the YAML key of that name.
    Precedence: the CLI, then the environment (this file joins it), then YAML:
    SAP_MSHOST                     Message server host. With it, the URL gives no RFC host
                                   and no system number (SAP_SYSNR is not read)
    SAP_MSSERV                     Message server service (name or port)
    SAP_SYSID                      System id; SAP_MSSERV or SAP_SYSID is required with
                                   SAP_MSHOST (refused naming both otherwise)
    SAP_GROUP                      Logon group (connection default: PUBLIC)
    SAP_SAPROUTER                  SAProuter string, with either addressing
    Requires: SAP NW RFC SDK + @mcp-abap-adt/sap-rfc-lite (an optional dependency,
    compiled by npm install: SAPNWRFC_HOME and a C++ toolchain must be there before it;
    npm ls -g @mcp-abap-adt/sap-rfc-lite shows (empty) when it was left out)

  System Context (first found wins; reads are unaffected):
    SAP_RESPONSIBLE                Responsible person of created objects, always sent. First
                                   found: the tool's argument; SAP_RESPONSIBLE in the
                                   destination's own .env (--env / --env-path file, or
                                   sessions/<destination>.env), then in the environment. Else
                                   the login: on-premise the destination's SAP_USERNAME, the
                                   environment's SAP_USERNAME; on a cloud system only the
                                   system's user. A create that finds none is refused (SNC, a
                                   token), a message class included.
    SAP_MASTER_SYSTEM              Master system of created objects (no tool takes it as an
                                   argument). First found: the destination's .env; the
                                   environment; on a cloud system, the system id.
                                   Otherwise left out of the request, never refused
                                   The environment is read once: later changes are not picked up
    SAP_DEBUG_TERMINAL_ID          The debugger's terminal id and IDE id (where the debugger is served),
    SAP_DEBUG_IDE_ID               each on its own. First found: the destination's .env; the
                                   environment. Else random per instance. A shared IDE id shares
                                   the user's catches without the system's listener conflict
    SAP_DEBUG_BREAKPOINT_CONFLICT  replace (default) or refuse-if-held: whether a take-over of
                                   the debugger, and every later change of its breakpoints, first
                                   asks if another debugger listens for the same SAP user, and
                                   refuses if so (a start without take-over always asks). First
                                   found: the destination's .env; the environment

  Streamable HTTP and SSE are served by mcp-abap-adt-http (@mcp-abap-adt/http) and
  mcp-abap-adt-sse (@mcp-abap-adt/sse), with credentials from each request's x-sap-* headers.

GENERATING A .ENV:
  Install the CLI: npm install -g @mcp-abap-adt/auth-broker-cli
  Generate .env: mcp-auth --service-key <key.json> --output <file.env> --type abap|xsuaa
             or: mcp-auth --destination <name> --type abap|xsuaa   (mcp-auth --help lists the rest)
  A jwt .env must state SAP_GRANT_TYPE.
`;

/** The examples of core's help: stdio only, under the command's own name. */
function examples(program: string): string {
  return `
EXAMPLES:
  # A named destination (for MCP clients)
  ${program} --mcp=TRIAL

  # An env file by destination name, from the sessions store
  ${program} --env=trial

  # An explicit env file (a .env in the working directory is read only when named)
  ${program} --env-path=./.env

  # RFC connection (any system with SAP NW RFC SDK)
  # (or SAP_CONNECTION_TYPE=rfc in the .env file)
  ${program} --env-path=my-system.env --connection-type=rfc

  # RFC through a message server and a logon group
  ${program} --env-path=my-system.env --connection-type=rfc --mshost=<host> --sysid=<SID> --group=<group>

  # Explicit system type (required: onprem, cloud or legacy)
  ${program} --env-path=<system>.env --system-type=onprem

  # A YAML config file (a template is written when it does not exist)
  ${program} --conf=my-config.yaml
`;
}

/**
 * core's help: its own table (no HTTP or SSE option), the set's TOOLS
 * section, the environment. A sibling command (`mcp-abap-adt-ro`,
 * `mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro`) passes its own set and
 * name.
 */
export function coreHelp(
  options: { toolSet?: ToolSet; program?: string } = {},
): string {
  const toolSet = options.toolSet ?? fullToolSet;
  const program = options.program ?? 'mcp-abap-adt';
  return generateHelp(coreParameters(toolSet, program), {
    description:
      '  MCP server for SAP ABAP systems via ADT (ABAP Development Tools), over stdio:\n' +
      '  one destination through the auth broker. Streamable HTTP is mcp-abap-adt-http,\n' +
      '  SSE mcp-abap-adt-sse; a binary is its transport.',
    sections: [toolSet.toolsHelp('stdio'), V2_HELP_SECTIONS, examples(program)],
  });
}

/**
 * What a command passes the stdio launcher: the tools it serves, its own
 * name, its own version and its own npm package — nothing else. Everything the
 * launcher does — options, the destination, credentials, cancellation,
 * failures, shutdown — is stdio's, the same for any tool set:
 * `mcp-abap-adt` passes `fullToolSet`, `mcp-abap-adt-ro` `fullReadOnlyToolSet`,
 * `mcp-abap-adt-compact` and `mcp-abap-adt-compact-ro` the compact sets.
 */
export interface LauncherOptions {
  /** The tools served: fixed by the command, never by a flag. */
  toolSet: ToolSet;
  /** The command's own name: USAGE in `--help`, the `--conf` template's header. */
  program: string;
  /** The version `--version` and `initialize` report: the command's own package's. */
  version: string;
  /** The command's own npm package: the one a second copy of lib asks to reinstall. */
  packageName: string;
}

/** The process as the stdio `main` meets it: lib's edges, and the MCP transport. */
export interface StdioLauncherEdges extends LauncherEdges {
  /** The MCP transport; stdio unless a host passes its own (a test's). */
  transport?: Transport;
}

export async function main(
  options: LauncherOptions,
  edges: StdioLauncherEdges = processEdges(),
): Promise<void> {
  // A second copy of lib stops the start before anything is read.
  const secondCopy = secondCopyLine(libInstances(), options.packageName);
  if (secondCopy !== undefined) {
    edges.stderr(secondCopy);
    edges.exit(1);
    return;
  }
  const { argv, stderr, exit } = edges;
  if (
    answerVersionOrHelp(edges, {
      version: options.version,
      help: () => coreHelp(options),
    })
  ) {
    return;
  }

  // core's own table: an option of another binary, --transport, or the
  // removed --exposition stops here.
  const config = readStartupConfig(
    coreParameters(options.toolSet, options.program),
    argv,
    process.env,
    { stderr, exit },
    (args, env, yaml) => readCoreConfig(args, env, yaml, options.toolSet),
  );
  if (config === undefined) return;
  await launch(config, options, {
    browserStrategy: browserCallbackStrategy,
    stderr,
    exit,
    processLike: edges.processLike,
    ...(edges.transport !== undefined && { transport: edges.transport }),
  });
}

/** What the launcher takes from the program: the process's edges, and the login strategy. */
export interface LauncherDeps {
  /** auth-providers' `browserCallbackStrategy` in the program (Ruling 1). */
  browserStrategy: IAuthBrokerFactoryConfig['browserStrategy'];
  /** One line to stderr; nothing the launcher says goes to stdout (H3). */
  stderr: (line: string) => void;
  exit: (code: number) => void;
  /** Where the shutdown listens: `process` in the program. */
  processLike: ShutdownProcess;
  /** The platform `--browser` is mapped for; `process.platform` when absent. */
  platform?: string;
  /** The MCP transport; stdio when absent. */
  transport?: Transport;
}

/**
 * The env file and the parameter it came from. `envFilePath` is
 * `CoreConfig`'s alias of `envFile`; `readCoreConfig` sets both and
 * states the source. A config made by hand names the field it set.
 */
function envFileOf(
  config: CoreConfig,
): Pick<IAuthBrokerFactoryConfig, 'envFile'> {
  const field = config.envFile
    ? 'envFile'
    : config.envFilePath
      ? 'envFilePath'
      : undefined;
  if (!field) return {};
  return {
    envFile: {
      path: config[field] as string,
      source: config.envFileSource ?? `CoreConfig.${field}`,
    },
  };
}

/** A start the launcher refuses, in words that name parameters only. */
class LauncherRefusal extends Error {
  readonly words: string;

  constructor(words: string) {
    super(words);
    this.name = 'LauncherRefusal';
    this.words = words;
  }
}

/**
 * A parameter the env file may state: the CLI, then the process environment
 * — which by now holds what the env file states, never over a value set
 * before — then YAML. A config made by hand, with no source, is taken as it
 * is. A word in the environment that is not one of `values` is refused naming
 * the key, never quoting it: it may come from a file.
 */
function effectiveFromEnvironment<T extends string>(
  value: T | undefined,
  source: string | undefined,
  key: string,
  values: readonly T[],
  env: NodeJS.ProcessEnv,
): T | undefined {
  const overridable =
    source === key ||
    (source?.endsWith('(config file)') ?? false) ||
    value === undefined;
  if (!overridable) return value;
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return value;
  if (!(values as readonly string[]).includes(raw)) {
    const words =
      values.length === 2
        ? values.join(' or ')
        : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
    throw new LauncherRefusal(
      `${key} (environment or env file) must be ${words}`,
    );
  }
  return raw as T;
}

/** `config` without its message-server fields: they are read again after the env file. */
function withoutMessageServer(config: CoreConfig): CoreConfig {
  const rest: CoreConfig = { ...config };
  for (const field of MESSAGE_SERVER_FIELDS) delete rest[field];
  return rest;
}

/** The connection type: see {@link effectiveFromEnvironment}. */
export function effectiveConnectionType(
  config: CoreConfig,
  env: NodeJS.ProcessEnv,
): CoreConfig['connectionType'] {
  return effectiveFromEnvironment(
    config.connectionType,
    config.connectionTypeSource,
    'SAP_CONNECTION_TYPE',
    ['http', 'rfc'] as const,
    env,
  );
}

/**
 * The message server's fields (RFC, connection 18), each as
 * {@link effectiveFromEnvironment} reads the connection type: the CLI, then
 * the process environment — which by now holds what the env file states,
 * never over a value set before — then YAML. Taken as given, trimmed; no
 * default, no check: connection refuses what it cannot dial.
 */
export function effectiveMessageServer(
  config: CoreConfig,
  env: NodeJS.ProcessEnv,
): Pick<CoreConfig, MessageServerField> {
  const out: Pick<CoreConfig, MessageServerField> = {};
  for (const field of MESSAGE_SERVER_FIELDS) {
    const value = config[field];
    const source = config.messageServerSource?.[field];
    const fromCli = value !== undefined && (source?.startsWith('--') ?? true);
    const stated = fromCli
      ? value
      : env[MESSAGE_SERVER_ENV[field]]?.trim() || value;
    if (stated) out[field] = stated;
  }
  return out;
}

/** The message-server fields set on `config`, as `SapConfig` takes them. */
function messageServerOf(
  config: Pick<CoreConfig, MessageServerField>,
): Pick<IAuthBrokerFactoryConfig, MessageServerField> {
  const out: Pick<IAuthBrokerFactoryConfig, MessageServerField> = {};
  for (const field of MESSAGE_SERVER_FIELDS) {
    const value = config[field];
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/**
 * The system type: see {@link effectiveFromEnvironment}. The parser no longer
 * writes it into the environment, where it used to sit before the env file
 * was read and so beat the file's SAP_SYSTEM_TYPE even from YAML.
 */
export function effectiveSystemType(
  config: CoreConfig,
  env: NodeJS.ProcessEnv,
): CoreConfig['systemType'] {
  return effectiveFromEnvironment(
    config.systemType,
    config.systemTypeSource,
    'SAP_SYSTEM_TYPE',
    ['onprem', 'cloud', 'legacy'] as const,
    env,
  );
}

/**
 * The factory's configuration, read from the parameters and the browser the
 * launcher mapped (`browserFor`). The callback port is left to the strategy
 * (61001) when none is given; the env file carries the parameter it came
 * from, as the user gave it.
 */
export function factoryConfigFrom(
  config: CoreConfig,
  collaborators: Pick<
    IAuthBrokerFactoryConfig,
    'browserStrategy' | 'logger' | 'promptLogger'
  > & {
    browser?: IBrowser | undefined;
    browserUnavailable?: string | undefined;
  },
): IAuthBrokerFactoryConfig {
  return {
    ...envFileOf(config),
    ...(config.mcpDestination && { mcpDestination: config.mcpDestination }),
    ...(config.authBrokerPath && { authBrokerPath: config.authBrokerPath }),
    unsafe: config.unsafe ?? false,
    ...(collaborators.browser !== undefined && {
      browser: collaborators.browser,
    }),
    ...(collaborators.browserUnavailable !== undefined && {
      browserUnavailable: collaborators.browserUnavailable,
    }),
    ...(config.browserAuthPort !== undefined && {
      browserAuthPort: config.browserAuthPort,
    }),
    ...(config.connectionType && { connectionType: config.connectionType }),
    ...messageServerOf(config),
    ...(config.renewal && { renewal: config.renewal }),
    ...(config.authDebug === true && { authDebug: true }),
    ...(config.loginTimeout !== undefined && {
      loginTimeoutMs: config.loginTimeout * 1000,
      loginTimeoutStated: statedLoginTimeout(
        config.loginTimeout,
        config.loginTimeoutSource,
      ),
    }),
    browserStrategy: collaborators.browserStrategy,
    promptLogger: collaborators.promptLogger,
    ...(collaborators.logger && { logger: collaborators.logger }),
  };
}

/**
 * The words a startup failure is reported in: what the failure reader makes
 * of it (`destinationFailureWords`: the failure message, its hint, the server's
 * sentence), else the destination and the error's class — never its
 * message, which may quote a file it could not parse.
 */
function startupWords(
  error: unknown,
  destination: string,
  factory: AuthBrokerFactory,
  platform: string,
): string {
  return destinationFailureWords(error, destination, {
    platform,
    sentenceFor: (e) => factory.sentenceFor(e),
  });
}

/**
 * The start's words for a system that gave no information where it must
 * (ABAP Cloud): a problem of the ABAP system with a valid configuration.
 */
export function startLookupFailedWords(destination: string): string {
  return `Destination "${destination}": the ABAP system gave no session user and system id: systeminformation answered without them or with an error, a problem of the ABAP system with a valid configuration; the server did not start`;
}

/**
 * The start's words for a destination whose system kind no parameter states.
 */
export function startSystemTypeRequiredWords(destination: string): string {
  return `Destination "${destination}": the SAP system type is required — set --system-type, SAP_SYSTEM_TYPE (the environment or the --env file) or system-type (YAML) to onprem, cloud or legacy; the server did not start`;
}

/**
 * The start's words for an ABAP Cloud destination whose system has no
 * systeminformation endpoint (`404`): the configuration is inconsistent.
 */
export function startCloudWithoutSystemInformationWords(
  destination: string,
): string {
  return `Destination "${destination}": the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration is inconsistent; the server did not start`;
}

/**
 * The start's words for an on-premise system that gave no information
 * whose destination states no user.
 */
export function startSystemUserUnknownWords(destination: string): string {
  return `Destination "${destination}": the system gave no session user (systeminformation) and the destination states no user: set SAP_RESPONSIBLE or SAP_USERNAME in the destination or the environment, so the session user is known; the server did not start`;
}

/**
 * The words the connection at start failed in: what the failure reader
 * makes of it (a chain failure, the server's own refusal — a system lookup
 * that failed — or the destination layer's), else the destination, the
 * error's class and the status SAP answered — never its message.
 */
export function startConnectionWords(
  error: unknown,
  destination: string,
  factory: Pick<AuthBrokerFactory, 'sentenceFor'>,
  platform: string,
): string {
  const options = {
    platform,
    sentenceFor: (e: Parameters<AuthBrokerFactory['sentenceFor']>[0]) =>
      factory.sentenceFor(e),
  };
  const read = destinationFailureOf(error, { ...options, destination });
  if (read?.error === 'system_lookup_failed') {
    return startLookupFailedWords(destination);
  }
  if (read?.error === 'cloud_without_systeminformation') {
    return startCloudWithoutSystemInformationWords(destination);
  }
  if (read?.error === 'system_user_unknown') {
    return startSystemUserUnknownWords(destination);
  }
  if (read !== undefined) {
    return destinationFailureWords(error, destination, options);
  }
  // connection's refusal of an RFC address it cannot dial (a message server
  // with neither msserv nor sysid): its own fixed words, as it came.
  const address = rfcAddressRefusalOf(error);
  if (address !== undefined) {
    return `Destination "${destination}" could not be connected at start: ${address}`;
  }
  const sap = sapAnswerOf(error);
  return `Destination "${destination}" could not be connected at start: ${errorClassOf(error)}${sap === undefined ? '' : `, SAP answered ${sap.status}`}`;
}

/**
 * The startup check, then the summary. The destination's settings are
 * read and its provider is built — `getProvider(destination, { signal })`
 * with the start's own signal, aborted once the check ends — so a
 * destination the broker refuses stops the start; building sends nothing.
 * Then what its stores hold, masked as before (H4's one exception).
 */
async function checkAndSummarise(
  factory: AuthBrokerFactory,
  destination: string,
  config: CoreConfig,
  stderr: (line: string) => void,
  platform: string,
): Promise<void> {
  const settings = await factory.settingsFor(destination);
  const startup = new AbortController();
  try {
    await factory.getProvider(destination, { signal: startup.signal });
  } finally {
    startup.abort();
  }
  try {
    const broker = await factory.getBroker(destination);
    const connConfig = await broker.getConnectionConfig(destination);
    const displayConfig: AuthDisplayConfig = {
      serviceUrl: settings.url,
      sapClient: settings.client,
      authType: settings.authType,
      username: connConfig?.username,
      password: connConfig?.password,
      jwtToken: connConfig?.authorizationToken,
    };
    try {
      const authConfig = await broker.getAuthorizationConfig(destination);
      if (authConfig) {
        displayConfig.uaaUrl = authConfig.uaaUrl;
        displayConfig.uaaClientId = authConfig.uaaClientId;
        displayConfig.uaaClientSecret = authConfig.uaaClientSecret;
        displayConfig.refreshToken = authConfig.refreshToken;
      }
    } catch {
      // The client is optional: a destination without one shows none.
    }
    const source = config.mcpDestination
      ? `service-key: ${config.mcpDestination}`
      : (config.envFile ?? config.envFilePath ?? 'unknown');
    stderr(formatAuthConfigForDisplay(displayConfig, source));
  } catch (error) {
    // The summary is information: it never stops a start the settings allowed.
    stderr(
      `[MCP] Warning: Could not display auth config: ${startupWords(error, destination, factory, platform)}`,
    );
  }
}

/**
 * Everything after the parameters are read: the tool list, one factory, the
 * destination the process serves checked and summarised, the shutdown, the
 * connection born (`connectAtStart`: the destination's one leftover session
 * taken up, or a logon — a browser login included — with the system
 * information), and only then the transport. A destination that cannot be
 * served, a logon or resume that fails, a system lookup that fails: each
 * ends the process with exit `1` and the failure's words on stderr, before
 * any transport opens.
 *
 * No exit and no rejection comes before the logoffs are answered: a start
 * that fails after its logon exits `1` only once SAP answered the logoff
 * (`logOffAtOnce`: every connection the process owns logged off, each
 * logoff followed to its answer, no timer), and a launch that rejects — the
 * bin's exit follows — rejects only then. SAP ends a security session only
 * once it received the logoff whole.
 */
export async function launch(
  config: CoreConfig,
  options: LauncherOptions,
  deps: LauncherDeps,
): Promise<void> {
  try {
    await launchStdio(config, options, deps);
  } catch (error) {
    await logOffAtOnce();
    throw error;
  }
}

async function launchStdio(
  config: CoreConfig,
  options: LauncherOptions,
  deps: LauncherDeps,
): Promise<void> {
  // The env file's context joins the process environment first — never over
  // a value already there — so its SAP_CONNECTION_TYPE and SAP_SYSTEM_TYPE
  // count (as in 15.x).
  hydrateSystemContextFromEnvFile(config.envFile ?? config.envFilePath);
  let connectionType: CoreConfig['connectionType'];
  let systemType: CoreConfig['systemType'];
  try {
    connectionType = effectiveConnectionType(config, process.env);
    systemType = effectiveSystemType(config, process.env);
  } catch (error) {
    deps.stderr(
      `[MCP] ${error instanceof LauncherRefusal ? error.words : 'SAP_CONNECTION_TYPE or SAP_SYSTEM_TYPE: refused'}`,
    );
    deps.exit(1);
    return;
  }
  if (connectionType) process.env.SAP_CONNECTION_TYPE = connectionType;
  // The connector reads the system type from the environment.
  if (systemType) process.env.SAP_SYSTEM_TYPE = systemType;
  config = {
    ...withoutMessageServer(config),
    connectionType,
    systemType,
    ...effectiveMessageServer(config, process.env),
  };

  // The command's tool set: fixed by the command, never by a flag.
  const handlersRegistry = registryOf(options.toolSet, 'stdio');

  // The browser of a login, mapped by the platform; a choice that
  // cannot be served stops the start before anything is read.
  let browser: IBrowser | undefined;
  let browserUnavailable: string | undefined;
  try {
    const mapping = browserFor(
      { browser: config.browser, program: config.browserProgram },
      deps.platform ?? process.platform,
    );
    // No browser on this platform refuses only a destination that logs in,
    // at the startup check; the others start.
    if (mapping.unavailable !== undefined) {
      browserUnavailable = mapping.unavailable;
    } else {
      browser = browserOf(mapping);
    }
  } catch (error) {
    if (!(error instanceof BrowserChoiceError)) throw error;
    deps.stderr(`[MCP] ${error.words}`);
    deps.exit(1);
    return;
  }

  if (config.authDebug === true) {
    deps.stderr(AUTH_DEBUG_WARNING);
  }

  const factory = new AuthBrokerFactory(
    factoryConfigFrom(config, {
      browserStrategy: deps.browserStrategy,
      browser,
      browserUnavailable,
      // A login prompts on stderr whatever DEBUG_AUTH_LOG says; the broker's
      // diagnostics stay gated.
      promptLogger: promptLogger(deps.stderr, loggerForTransport),
      // --auth-debug routes the providers' debug lines to stderr.
      logger: config.authDebug === true ? stderrLogger : loggerForTransport,
    }),
  );

  // The start is tracked, and the shutdown installed, before anything
  // is read: a signal or the client closing stdin during the startup check
  // is latched like one later — latch, every owned connection logged off at
  // once and the running tools interrupted, the MCP server closed (none yet
  // is nothing to close), then the gate, the logins, the drain and the
  // flush. A shutdown during the start ends it with exit 1.
  const birth = startBirth();
  installShutdown({
    factory,
    instance: { close: async () => activeServer?.close() },
    onStdinEnd: true,
    exit: deps.exit,
    stderr: deps.stderr,
    processLike: deps.processLike,
    shutdownTimeoutMs:
      config.shutdownTimeout === undefined
        ? undefined
        : config.shutdownTimeout * 1000,
    birth,
  });

  // --mcp=X → X; an --env file → default; neither → none (one destination either way).
  const destination = factory.defaultDestination;
  if (destination) {
    try {
      if (config.mcpDestination) {
        assertDestinationName(config.mcpDestination, '--mcp');
      }
      await checkAndSummarise(
        factory,
        destination,
        config,
        deps.stderr,
        deps.platform ?? process.platform,
      );
    } catch (error) {
      // A shutdown began meanwhile: its exit 1 is the process's one exit.
      if (birth.shutdownBegan()) return;
      deps.stderr(
        `[MCP] ${startupWords(error, destination, factory, deps.platform ?? process.platform)}`,
      );
      deps.exit(1);
      return;
    }
  }
  // The shutdown began during the check: no connector is born, no transport
  // opens.
  if (birth.shutdownBegan()) return;

  // A destination's system kind is required: never guessed. After the
  // destination's own check (which sends nothing), the start ends here
  // without it — before anything is sent and before the transport.
  if (destination && systemType === undefined) {
    deps.stderr(`[MCP] ${startSystemTypeRequiredWords(destination)}`);
    deps.exit(1);
    return;
  }

  if (!destination) {
    // Inspection-only mode: no connection parameters provided
    deps.stderr(
      '[MCP] Starting in inspection-only mode (no connection parameters).',
    );
    deps.stderr(
      '[MCP] To connect to SAP system, use --mcp=<destination> or --env-path=<path>',
    );
  }

  const server = new StdioServer(
    handlersRegistry,
    destination ? factory : undefined,
    {
      version: options.version,
      // The process's runtime session files, beside the destination's
      // sessions (`--auth-broker-path` moves both).
      leftoverSessions: new LeftoverSessions({
        directory: runtimeDirectory(getPlatformPaths(config.authBrokerPath)[0]),
      }),
      // Background runs of the run tools, kept in this process's memory;
      // they end with the process. Only where the set serves them: a -ro
      // command has none, so a run's `background: true` is refused.
      ...(options.toolSet.backgroundRuns && {
        backgroundRuns: new InMemoryBackgroundRuns(),
      }),
      // Batch mode: the one instance's batch state, owned here.
      batch: new InstanceBatch({
        keepRawParts: config.batchKeepRawParts === true,
      }),
      stateIdleMinutes: config.stateIdleMinutes,
      stateLogger: stateLoggerForTransport,
      logger: loggerForTransport,
      sentenceFor: (error) => factory.sentenceFor(error),
    },
  );
  activeServer = server;
  // The connection is born before the transport opens: nothing to retry,
  // the process ends with what failed. A shutdown during the birth (stdin
  // closed, a signal) ends it, and its exit — 1, the start failed — is the
  // process's one exit.
  if (destination) {
    try {
      await birth.joining(server.connectAtStart(destination));
    } catch (error) {
      deps.stderr(
        `[MCP] ${startConnectionWords(error, destination, factory, deps.platform ?? process.platform)}`,
      );
      // The birth logged off what it logged on; the exit waits for SAP's
      // answer to that logoff, so the session ends with the process.
      if (!birth.shutdownBegan()) await logOffAtOnce();
      if (!birth.shutdownBegan()) deps.exit(1);
      return;
    }
  }
  // The shutdown began meanwhile: the transport never opens.
  if (!birth.open()) return;
  // stdio unless the edges carry a transport of their own (a test's).
  await (deps.transport === undefined
    ? server.start(destination)
    : server.start(destination, deps.transport));
}

/**
 * The launcher's last line when `main()` rejects: fixed words and auth-errors'
 * `logFields` of what the value classifies as — never its message.
 */
export function launcherFailedLine(thrown: unknown): string {
  return `[MCP] launcher failed: ${JSON.stringify(logFields(classify(thrown, 'unfamiliar-error')))}`;
}

// The bin calls `main({ toolSet: fullToolSet, … })` itself, and a sibling
// command imports it with its own set — nothing starts a server on import.

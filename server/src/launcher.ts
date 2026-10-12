import { classify, logFields } from '@mcp-abap-adt/auth-errors';
import type { IBrowser } from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  assertDestinationName,
  browserCallbackStrategy,
} from '@mcp-abap-adt/lib/auth';
import { generateHelp, readStartupConfig } from '@mcp-abap-adt/lib/config';
import { type StateLogger, stderrStateLogger } from '@mcp-abap-adt/lib/state';
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
import {
  AuthBrokerFactory,
  BrowserChoiceError,
  browserFor,
  browserOf,
  destinationFailureWords,
  type IAuthBrokerFactoryConfig,
  promptLogger,
} from './auth';
import {
  type CoreConfig,
  coreParameters,
  readCoreConfig,
} from './config/coreParameters';
import { hydrateSystemContextFromEnvFile } from './config/envFileContext';
import { StdioServer } from './StdioServer.js';
import { installShutdown, type ShutdownProcess } from './shutdown.js';
import { closeInstanceState } from './stateClose.js';

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
                                   Tools offered: default cloud (e.g. Programs need onprem)
                                   Connector and master-system lookup: default cloud for a
                                   jwt destination, else onprem — never guessed from the URL
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
    SAP_DEBUG_TERMINAL_ID          The debugger's terminal id and IDE id (with --exposition=...,debug),
    SAP_DEBUG_IDE_ID               each on its own. First found: the destination's .env; the
                                   environment. Else random per instance. A shared IDE id shares
                                   the user's catches without the system's listener conflict

  Streamable HTTP and SSE are served by mcp-abap-adt-http (@mcp-abap-adt/http) and
  mcp-abap-adt-sse (@mcp-abap-adt/sse), with credentials from each request's x-sap-* headers.

GENERATING A .ENV:
  Install the CLI: npm install -g @mcp-abap-adt/auth-broker-cli
  Generate .env: mcp-auth --service-key <key.json> --output <file.env> --type abap|xsuaa
             or: mcp-auth --destination <name> --type abap|xsuaa   (mcp-auth --help lists the rest)
  A jwt .env must state SAP_GRANT_TYPE.
`;

/** The examples of core's help: stdio only. */
const EXAMPLES = `
EXAMPLES:
  # A named destination (for MCP clients)
  mcp-abap-adt --mcp=TRIAL

  # An env file by destination name, from the sessions store
  mcp-abap-adt --env=trial

  # An explicit env file (a .env in the working directory is read only when named)
  mcp-abap-adt --env-path=./.env

  # RFC connection (any system with SAP NW RFC SDK)
  # (or SAP_CONNECTION_TYPE=rfc in the .env file)
  mcp-abap-adt --env-path=my-system.env --connection-type=rfc

  # Explicit system type (tools default to cloud; the connector to cloud for a jwt, else onprem)
  mcp-abap-adt --env-path=<system>.env --system-type=onprem

  # Readonly operations only
  mcp-abap-adt --mcp=TRIAL --exposition=readonly

  # A YAML config file (a template is written when it does not exist)
  mcp-abap-adt --conf=my-config.yaml
`;

/**
 * core's help: its own table (no HTTP or SSE option) with the tool set's
 * `--exposition` row, the set's exposition section, the environment. A
 * sibling command (`mcp-abap-adt-compact`) passes its own set and name.
 */
export function coreHelp(
  options: { toolSet?: ToolSet; program?: string } = {},
): string {
  const toolSet = options.toolSet ?? fullToolSet;
  return generateHelp(coreParameters(toolSet, options.program), {
    description:
      '  MCP server for SAP ABAP systems via ADT (ABAP Development Tools), over stdio:\n' +
      '  one destination through the auth broker. Streamable HTTP is mcp-abap-adt-http,\n' +
      '  SSE mcp-abap-adt-sse; a binary is its transport.',
    sections: [toolSet.expositionHelp, V2_HELP_SECTIONS, EXAMPLES],
  });
}

/**
 * What a command passes core's launcher (spec §3.5, D37, D49): the tools it
 * serves, and its own name and version — nothing else. Everything the
 * launcher does — options, the destination, credentials, cancellation,
 * failures, shutdown — is stdio's, the same for any tool set:
 * `mcp-abap-adt` passes `fullToolSet`, `mcp-abap-adt-compact` the compact set.
 */
export interface LauncherOptions {
  /** The tools served, and the `--exposition` they are chosen by. */
  toolSet: ToolSet;
  /** The command's own name: USAGE in `--help`, the `--conf` template's header. */
  program: string;
  /** The version `--version` and `initialize` report: the command's own package's. */
  version: string;
}

/** The process as the launcher meets it; a test passes its own. */
export interface LauncherEdges {
  /** The arguments, without node's and the script's. */
  argv: readonly string[];
  /** `--version`'s one line; nothing else is written to stdout (H3). */
  stdout: (line: string) => void;
  /** One line to stderr. */
  stderr: (line: string) => void;
  exit: (code: number) => void;
  /** Where the shutdown listens. */
  processLike: ShutdownProcess;
  /** The MCP transport; stdio unless a host passes its own. */
  transport?: Transport;
}

/** The edges of the program: `process`. */
export function processEdges(): LauncherEdges {
  return {
    argv: process.argv.slice(2),
    stdout: (line) => console.log(line),
    stderr: (line) => process.stderr.write(`${line}\n`),
    exit: (code) => process.exit(code),
    processLike: process,
  };
}

export async function main(
  options: LauncherOptions,
  edges: LauncherEdges = processEdges(),
): Promise<void> {
  const { argv, stderr, exit } = edges;
  if (argv.includes('--version') || argv.includes('-v')) {
    edges.stdout(options.version);
    exit(0);
    return;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    stderr(coreHelp(options));
    exit(0);
    return;
  }

  // core's own table with the set's exposition row: an option of another
  // binary, --transport, or an exposition the set does not serve stops here.
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
    ...(config.renewal && { renewal: config.renewal }),
    browserStrategy: collaborators.browserStrategy,
    promptLogger: collaborators.promptLogger,
    ...(collaborators.logger && { logger: collaborators.logger }),
  };
}

/**
 * The words a startup failure is reported in: what the failure reader makes
 * of it (`destinationFailureWords`: the §7.3 message, its hint, the server's
 * sentence), else the destination and the error's class — never its
 * message, which may quote a file it could not parse (H4).
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
 * The startup check (D18), then the summary. The destination's settings are
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
 * destination the process serves checked and summarised, the transport, and
 * the shutdown. A destination that cannot be served stops the start before
 * any transport does.
 */
export async function launch(
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
  config = { ...config, connectionType, systemType };

  // The tool set's groups for the exposition read (a config made by hand
  // without one: the set's default).
  const handlersRegistry = registryOf(
    options.toolSet,
    config.exposition ??
      options.toolSet.exposition(options.toolSet.expositionRow.default, []),
  );

  // The browser of a login, mapped by the platform (D9); a choice that
  // cannot be served stops the start before anything is read.
  let browser: IBrowser | undefined;
  let browserUnavailable: string | undefined;
  try {
    const mapping = browserFor(
      { browser: config.browser, program: config.browserProgram },
      deps.platform ?? process.platform,
    );
    // No browser on this platform refuses only a destination that logs in,
    // at the startup check (D18); the others start.
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

  const factory = new AuthBrokerFactory(
    factoryConfigFrom(config, {
      browserStrategy: deps.browserStrategy,
      browser,
      browserUnavailable,
      // A login prompts on stderr whatever DEBUG_AUTH_LOG says; the broker's
      // diagnostics stay gated (§9).
      promptLogger: promptLogger(deps.stderr, loggerForTransport),
      logger: loggerForTransport,
    }),
  );

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
      deps.stderr(
        `[MCP] ${startupWords(error, destination, factory, deps.platform ?? process.platform)}`,
      );
      deps.exit(1);
      return;
    }
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
      stateIdleMinutes: config.stateIdleMinutes,
      stateLogger: stateLoggerForTransport,
      logger: loggerForTransport,
      sentenceFor: (error) => factory.sentenceFor(error),
    },
  );
  activeServer = server;
  // Under stdio a signal is not the end of input: the factory's gate holds.
  installShutdown({
    factory,
    servers: [
      {
        // The instance owns what it holds (a listener, a session) until it is
        // gone; the close waits for that and reports what was left.
        close: () => closeInstanceState(server),
      },
    ],
    onStdinEnd: true,
    exit: deps.exit,
    stderr: deps.stderr,
    processLike: deps.processLike,
  });
  // stdio unless the edges carry a transport of their own (a test's).
  await (deps.transport === undefined
    ? server.start(destination)
    : server.start(destination, deps.transport));
}

/**
 * The launcher's last line when `main()` rejects: fixed words and auth-errors'
 * `logFields` of what the value classifies as — never its message (§9).
 */
export function launcherFailedLine(thrown: unknown): string {
  return `[MCP] launcher failed: ${JSON.stringify(logFields(classify(thrown, 'unfamiliar-error')))}`;
}

// The bin calls `main({ toolSet: fullToolSet, … })` itself, and a sibling
// command imports it with its own set — nothing starts a server on import.

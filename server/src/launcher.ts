import { classify, logFields } from '@mcp-abap-adt/auth-errors';
import type { IBrowser } from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  assertDestinationName,
  browserCallbackStrategy,
} from '@mcp-abap-adt/lib/auth';
import type { HandlerSet, IServerConfig } from '@mcp-abap-adt/lib/config';
import {
  hydrateSystemContextFromEnvFile,
  ServerConfigManager,
  validateExposition,
} from '@mcp-abap-adt/lib/config';
import {
  type HandlerContext,
  type IHandlerGroup,
  registryForExposition,
} from '@mcp-abap-adt/lib/handlers';
import { type StateLogger, stderrStateLogger } from '@mcp-abap-adt/lib/state';
import {
  type AuthDisplayConfig,
  formatAuthConfigForDisplay,
} from '@mcp-abap-adt/lib/utils';
import {
  AuthBrokerFactory,
  BrowserChoiceError,
  browserFor,
  browserOf,
  destinationFailureWords,
  type IAuthBrokerFactoryConfig,
  promptLogger,
} from './auth';
import { CORE_VERSION } from './coreVersion.js';
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
 * core serves stdio only (D35): the other transports are packages of their
 * own, and a start that asks for one stops naming the binary that serves it
 * (§10.1's words).
 */
const TRANSPORT_ELSEWHERE: Readonly<Record<'http' | 'sse', string>> = {
  http: 'Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)',
  sse: 'SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)',
};

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * This package's own version, read from this package's own manifest.
 *
 * **It was two levels up, and that only works inside the repository.** From
 * `server/dist/` two steps reach the repo root, whose `package.json` is
 * `@mcp-abap-adt/lib` — so `--version` printed the LIBRARY's version, and only
 * because a checkout happens to have a manifest there. From an installed
 * package the same two steps land on `node_modules/@mcp-abap-adt/`, which is the
 * scope DIRECTORY and never has a `package.json`: every `mcp-abap-adt --version`
 * from npm died with `ENOENT … node_modules/@mcp-abap-adt/package.json`.
 * Measured on 13.0.0 by installing the published tarball into an empty directory
 * — the check `bin-smoke.test.ts` now performs, because the three other bins in
 * this family were fixed for the same class of defect one release earlier and
 * nothing here would have caught ours.
 *
 * One step up is `server/` in a checkout and the package root when installed,
 * and in both it is `@mcp-abap-adt/core`'s manifest — which is what this CLI
 * should answer with.
 */
function showVersion(): void {
  console.log(CORE_VERSION);
  process.exit(0);
}

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

  System Context (per request, first found wins; reads are unaffected):
    SAP_RESPONSIBLE                Responsible person of created objects, always sent. First
                                   found: the tool's argument; x-sap-responsible; SAP_RESPONSIBLE
                                   in the destination's own .env (--env / --env-path file, or
                                   sessions/<destination>.env), then in the environment. Else
                                   the login: on-premise the destination's SAP_USERNAME, the
                                   x-sap-login of an x-sap-url connection, the environment's
                                   SAP_USERNAME; on a cloud system only the system's user. A create
                                   that finds none is refused (SNC, a token), a message class
                                   included.
    SAP_MASTER_SYSTEM              Master system of created objects (no tool takes it as an
                                   argument). First found: x-sap-master-system; the destination's
                                   .env; the environment; on a cloud system, the system id.
                                   Otherwise left out of the request, never refused
                                   The environment is read once: later changes are not picked up
    SAP_DEBUG_TERMINAL_ID          The debugger's terminal id and IDE id (with --exposition=...,debug),
    SAP_DEBUG_IDE_ID               each on its own. First found: x-sap-debug-terminal-id /
                                   x-sap-debug-ide-id; the destination's .env; the environment.
                                   Else random per instance. A shared IDE id shares the user's
                                   catches without the system's listener conflict

  Streamable HTTP and SSE are served by mcp-abap-adt-http (@mcp-abap-adt/http) and
  mcp-abap-adt-sse (@mcp-abap-adt/sse), with credentials from each request's x-sap-* headers.

GENERATING A .ENV:
  Install the CLI: npm install -g @mcp-abap-adt/auth-broker-cli
  Generate .env: mcp-auth --service-key <key.json> --output <file.env> --type abap|xsuaa
             or: mcp-auth --destination <name> --type abap|xsuaa   (mcp-auth --help lists the rest)
  A jwt .env must state SAP_GRANT_TYPE.
`;

function showHelp(options: LauncherOptions = {}): void {
  console.error(
    ServerConfigManager.generateHelp(V2_HELP_SECTIONS, {
      program: options.program,
      // A sibling command documents its OWN exposition vocabulary, not this one's.
      expositionSection: options.helpExposition,
    }),
  );
}

/**
 * What a command may add to the tool list this launcher serves.
 *
 * `@mcp-abap-adt/compact` is a second command over the same server: same config,
 * same transports, same auth, a different DECOMPOSITION of the tool list. Rather
 * than copy four hundred lines of launcher into it, it calls `main` with its own
 * groups. `exposition` decides the sets this package knows (`readonly`, `high`,
 * `low`), and `extraGroups` adds what it does not — so the compact command passes
 * an exposition of its own and its two halves, and nothing about the flags changes
 * here.
 */
export interface LauncherOptions {
  /** Built against the launcher's own base context, once, at startup. */
  extraGroups?: (context: HandlerContext) => IHandlerGroup[];
  /** Overrides the configured exposition, for a command with a fixed tool list. */
  exposition?: readonly HandlerSet[];
  /** The command's own name, for USAGE in `--help`. */
  program?: string;
  /**
   * Replaces the HANDLER EXPOSITION section of `--help`.
   *
   * A sibling command has its own sets — `mcp-abap-adt-compact` takes `ro` and
   * `rw` over the compact facade — and parses them itself before calling here.
   */
  helpExposition?: string;
  /**
   * Whether the search tools join the list. They always do for `mcp-abap-adt`;
   * a command whose whole point is a tool list of a known size says `false`.
   */
  includeSearch?: boolean;
  /**
   * The version `initialize` reports in `serverInfo`. Defaults to core's own; a
   * sibling command passes ITS version, as it does for `--version`.
   */
  version?: string;
}

export async function main(options: LauncherOptions = {}) {
  // Check for --version first
  if (hasArg('--version') || hasArg('-v')) {
    showVersion();
  }

  // Check for --help
  if (hasArg('--help') || hasArg('-h')) {
    showHelp(options);
    process.exit(0);
  }

  // Use ServerConfigManager for all config parsing
  const configManager = new ServerConfigManager();
  const config = await configManager.getConfig();
  await launch(config, options, {
    browserStrategy: browserCallbackStrategy,
    stderr: (line) => process.stderr.write(`${line}\n`),
    exit: (code) => process.exit(code),
    processLike: process,
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
}

/**
 * The env file and the parameter it came from. `envFilePath` is
 * `IServerConfig`'s alias of `envFile`; ServerConfigManager sets both and
 * states the source. A config made by hand names the field it set.
 */
function envFileOf(
  config: IServerConfig,
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
      source: config.envFileSource ?? `IServerConfig.${field}`,
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
  config: IServerConfig,
  env: NodeJS.ProcessEnv,
): IServerConfig['connectionType'] {
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
  config: IServerConfig,
  env: NodeJS.ProcessEnv,
): IServerConfig['systemType'] {
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
  config: IServerConfig,
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
  config: IServerConfig,
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
  config: IServerConfig,
  options: LauncherOptions,
  deps: LauncherDeps,
): Promise<void> {
  if (config.transport === 'http' || config.transport === 'sse') {
    deps.stderr(`[MCP] ${TRANSPORT_ELSEWHERE[config.transport]}`);
    deps.exit(1);
    return;
  }
  // The env file's context joins the process environment first — never over
  // a value already there — so its SAP_CONNECTION_TYPE and SAP_SYSTEM_TYPE
  // count (as in 15.x).
  hydrateSystemContextFromEnvFile(config.envFile ?? config.envFilePath);
  let connectionType: IServerConfig['connectionType'];
  let systemType: IServerConfig['systemType'];
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

  // Build handlers based on exposition config (default to readonly,high)
  const exposition = options.exposition ??
    config.exposition ?? ['readonly', 'high'];
  validateExposition(exposition);
  const handlersRegistry = registryForExposition(exposition, {
    extraGroups: options.extraGroups,
    includeSearch: options.includeSearch,
  });

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
  await server.start(destination);
}

/**
 * The launcher's last line when `main()` rejects: fixed words and auth-errors'
 * `logFields` of what the value classifies as — never its message (§9).
 */
export function launcherFailedLine(thrown: unknown): string {
  return `[MCP] launcher failed: ${JSON.stringify(logFields(classify(thrown, 'unfamiliar-error')))}`;
}

// Run only when this module is the program. The bin calls `main()` itself, and a
// sibling command imports it — neither wants a server started by an import.
if (require.main === module) {
  void main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(launcherFailedLine(err));
    process.exit(1);
  });
}

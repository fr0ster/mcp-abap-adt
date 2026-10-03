import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AuthBrokerFactory,
  assertDestinationName,
  browserCallbackStrategy,
  describeAuthError,
  errorClassOf,
  type IAuthBrokerFactoryConfig,
  type IDestinations,
} from '@mcp-abap-adt/lib/auth';
import type { HandlerSet, IServerConfig } from '@mcp-abap-adt/lib/config';
import {
  hydrateSystemContextFromEnvFile,
  ServerConfigManager,
  validateExposition,
} from '@mcp-abap-adt/lib/config';
import type { HandlerContext, IHandlerGroup } from '@mcp-abap-adt/lib/handlers';
import {
  CompositeHandlersRegistry,
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  ReadVsGetDedupStrategy,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '@mcp-abap-adt/lib/handlers';
import {
  type AuthDisplayConfig,
  formatAuthConfigForDisplay,
} from '@mcp-abap-adt/lib/utils';
import { SseServer } from './SseServer.js';
import { inspectionOnlyDestinations, StdioServer } from './StdioServer.js';
import { StreamableHttpServer } from './StreamableHttpServer.js';
import { installShutdown, type ShutdownProcess } from './shutdown.js';

const stderrLogger = {
  info: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.error(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => console.error(...args),
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
const loggerForTransport =
  process.env.DEBUG_AUTH_LOG === 'true' ? stderrLogger : silentLogger;

type Transport = 'stdio' | 'sse' | 'http';

// Keep strong reference to running server instance to avoid premature GC/exit
let activeServer: StdioServer | SseServer | StreamableHttpServer | undefined;

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
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  console.log(packageJson.version);
  process.exit(0);
}

/**
 * Additional help sections specific to v2 server
 */
const V2_HELP_SECTIONS = `
ENVIRONMENT VARIABLES:

  MCP Server Configuration:
    MCP_TRANSPORT                  Transport type: stdio|http|sse (default: stdio)
    MCP_HTTP_HOST                  HTTP server host (default: 127.0.0.1)
    MCP_HTTP_PORT                  HTTP server port (default: 3000)
    MCP_SSE_HOST                   SSE server host (default: 127.0.0.1)
    MCP_SSE_PORT                   SSE server port (default: 3001)
    MCP_ENV_PATH                   Explicit .env file path (same as --env-path)
    MCP_UNSAFE                     Write named destinations' sessions to disk (true|false)
    MCP_BROWSER                    Browser for a login: chrome|edge|firefox|system|headless|none
    MCP_BROWSER_AUTH_PORT          Login callback port, 1-65535 (default: 61001)
    MCP_TLS_CERT                   Path to TLS certificate file (PEM)
    MCP_TLS_KEY                    Path to TLS private key file (PEM)
    MCP_TLS_CA                     Path to TLS CA certificate file (PEM, optional)

  Auth-Broker:
    DEBUG_AUTH_LOG                 Enable debug logging for auth-broker (true|false)
    DEBUG_AUTH_BROKER              Alias for DEBUG_AUTH_LOG
    AUTH_BROKER_PATH               Base directory of service-keys/ and sessions/

  Debug Options:
    DEBUG_HANDLERS                 Enable handler debug logging (true|false)
    DEBUG_CONNECTORS               Enable connector debug logging (true|false)
    DEBUG_CONNECTION_MANAGER       Enable connection manager debug logging (true|false)
    HANDLER_LOG_SILENT             Disable all handler logs (true|false)

AUTHENTICATIONS (exactly four; a .env or service key stating another is refused):
    basic   SAP_AUTH_TYPE=basic            user and password, HTTP or RFC
    snc     SAP_AUTH_TYPE=snc              RFC only, no user, no password
    jwt     SAP_AUTH_TYPE=jwt, SAP_GRANT_TYPE=authorization_code   browser login
    jwt     SAP_AUTH_TYPE=jwt, SAP_GRANT_TYPE=none                 a token you hold

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
    SAP_GRANT_TYPE                 authorization_code (browser login) | none (a token you hold)
    SAP_JWT_TOKEN                  JWT token (with SAP_GRANT_TYPE=none)
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
    Requires: SAP NW RFC SDK + @mcp-abap-adt/sap-rfc-lite (an optional dependency)

  System Context (per request, first found wins; reads are unaffected):
    SAP_RESPONSIBLE                Responsible person of created objects, always sent. First
                                   found: the tool's argument; x-sap-responsible; SAP_RESPONSIBLE
                                   in the destination's own .env (--env / --env-path file, or
                                   sessions/<destination>.env), then in the environment. Else
                                   the login: on-premise the destination's SAP_USERNAME, the
                                   x-sap-login of an x-sap-url connection, the environment's
                                   SAP_USERNAME; on a cloud system only the system's user. A create
                                   that finds none is refused (SNC, a token). A message class
                                   takes the system's own default responsible.
    SAP_MASTER_SYSTEM              Master system of created objects (no tool takes it as an
                                   argument). First found: x-sap-master-system; the destination's
                                   .env; the environment; on a cloud system, the system id.
                                   Otherwise left out of the request, never refused
                                   The environment is read once: later changes are not picked up

  HTTP/SSE Headers (System Context; SSE: the session's opening request):
    x-sap-master-system            Master system for this request (wins over the .env and env)
    x-sap-responsible              Responsible for this request (wins over the .env and env)
    x-sap-login                    With x-sap-url (on-premise): the login, the responsible when
                                   none is stated; on a destination request it is not read
    x-sap-language                 Master/original language for created objects (overrides SAP_LANGUAGE)

GENERATING A .ENV:
  Install the CLI: npm install -g @mcp-abap-adt/auth-broker-cli
  Generate .env: mcp-auth generate-env --grant authorization_code   (mcp-auth --help lists the other flags)
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

/**
 * The connection type: the CLI, then the process environment — which by now
 * holds what the env file states, never over a value set before — then YAML.
 * A config made by hand, with no source, is taken as it is. A word in the
 * environment that is not a connection type is refused naming the key, never
 * quoting it: it may come from a file.
 */
export function effectiveConnectionType(
  config: IServerConfig,
  env: NodeJS.ProcessEnv,
): IServerConfig['connectionType'] {
  const source = config.connectionTypeSource;
  const overridable =
    source === 'SAP_CONNECTION_TYPE' ||
    (source?.endsWith('(config file)') ?? false) ||
    config.connectionType === undefined;
  if (!overridable) return config.connectionType;
  const raw = env.SAP_CONNECTION_TYPE?.trim().toLowerCase();
  if (!raw) return config.connectionType;
  if (raw !== 'http' && raw !== 'rfc') {
    throw new Error(
      'SAP_CONNECTION_TYPE (environment or env file) must be http or rfc',
    );
  }
  return raw;
}

/** The browser of a login when none is given. */
const DEFAULT_BROWSER = 'system';

/**
 * The factory's configuration, read from the parameters alone. The callback
 * port is left to the strategy (61001) when none is given; the env file
 * carries the parameter it came from, as the user gave it.
 */
export function factoryConfigFrom(
  config: IServerConfig,
  collaborators: Pick<IAuthBrokerFactoryConfig, 'browserStrategy' | 'logger'>,
): IAuthBrokerFactoryConfig {
  return {
    ...envFileOf(config),
    ...(config.mcpDestination && { mcpDestination: config.mcpDestination }),
    ...(config.authBrokerPath && { authBrokerPath: config.authBrokerPath }),
    unsafe: config.unsafe ?? false,
    browser: config.browser ?? DEFAULT_BROWSER,
    ...(config.browserAuthPort !== undefined && {
      browserAuthPort: config.browserAuthPort,
    }),
    ...(config.connectionType && { connectionType: config.connectionType }),
    browserStrategy: collaborators.browserStrategy,
    ...(collaborators.logger && { logger: collaborators.logger }),
  };
}

/**
 * The words a startup failure is reported in: the error's own vetted words
 * when the server knows them, else the destination and the error's class —
 * never its message, which may quote a file it could not parse (H4).
 */
function startupWords(error: unknown, destination: string): string {
  return (
    describeAuthError(error) ??
    `Destination "${destination}" cannot be read: ${errorClassOf(error)}`
  );
}

/**
 * The startup summary: the destination's settings, then what its stores
 * hold, masked as before (H4's one exception). The settings are read first
 * and their failure is the caller's: a destination that cannot be served
 * stops the start.
 */
async function checkAndSummarise(
  factory: AuthBrokerFactory,
  destination: string,
  config: IServerConfig,
  stderr: (line: string) => void,
): Promise<void> {
  const settings = await factory.settingsFor(destination);
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
      `[MCP] Warning: Could not display auth config: ${startupWords(error, destination)}`,
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
  // The env file's context joins the process environment first — never over
  // a value already there — so its SAP_CONNECTION_TYPE counts (as in 15.x).
  hydrateSystemContextFromEnvFile(config.envFile ?? config.envFilePath);
  let connectionType: IServerConfig['connectionType'];
  try {
    connectionType = effectiveConnectionType(config, process.env);
  } catch (error) {
    deps.stderr(
      `[MCP] ${error instanceof Error ? error.message : 'SAP_CONNECTION_TYPE: refused'}`,
    );
    deps.exit(1);
    return;
  }
  if (connectionType) process.env.SAP_CONNECTION_TYPE = connectionType;
  config = { ...config, connectionType };

  const baseContext = {
    connection: undefined as any,
    logger: undefined,
  } satisfies HandlerContext;

  // Build handlers based on exposition config (default to readonly,high)
  const exposition = options.exposition ??
    config.exposition ?? ['readonly', 'high'];
  validateExposition(exposition);

  // Non-readonly groups are built first so that their tool names can be fed
  // into ReadOnlyHandlersGroup for duplicate suppression (e.g. hide
  // ReadFunctionModule when GetFunctionModule is also exposed).
  const overridingGroups: IHandlerGroup[] = [];
  if (exposition.includes('high')) {
    overridingGroups.push(new HighLevelHandlersGroup(baseContext));
  }
  if (exposition.includes('low')) {
    overridingGroups.push(new LowLevelHandlersGroup(baseContext));
  }

  for (const group of options.extraGroups?.(baseContext) ?? []) {
    overridingGroups.push(group);
  }

  const overridingToolNames = new Set<string>();
  for (const g of overridingGroups) {
    for (const e of g.getHandlers()) {
      overridingToolNames.add(e.toolDefinition.name);
    }
  }

  const handlerGroups: IHandlerGroup[] = [];
  if (exposition.includes('readonly')) {
    handlerGroups.push(
      new ReadOnlyHandlersGroup(
        baseContext,
        overridingToolNames,
        new ReadVsGetDedupStrategy(),
      ),
    );
    handlerGroups.push(new SystemHandlersGroup(baseContext));
  }
  handlerGroups.push(...overridingGroups);
  // Search joins every list but a fixed one — see LauncherOptions.includeSearch.
  if (options.includeSearch !== false) {
    handlerGroups.push(new SearchHandlersGroup(baseContext));
  }

  const handlersRegistry = new CompositeHandlersRegistry(handlerGroups);

  const factory = new AuthBrokerFactory(
    factoryConfigFrom(config, {
      browserStrategy: deps.browserStrategy,
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
      await checkAndSummarise(factory, destination, config, deps.stderr);
    } catch (error) {
      deps.stderr(`[MCP] ${startupWords(error, destination)}`);
      deps.exit(1);
      return;
    }
  }

  if (config.transport === 'stdio') {
    let destinations: IDestinations = factory;
    let served: string;

    if (destination) {
      served = destination;
    } else {
      // Inspection-only mode: no connection parameters provided
      destinations = inspectionOnlyDestinations();
      served = 'mock';
      deps.stderr(
        '[MCP] Starting in inspection-only mode (no connection parameters).',
      );
      deps.stderr(
        '[MCP] To connect to SAP system, use --mcp=<destination> or --env-path=<path>',
      );
    }

    const server = new StdioServer(handlersRegistry, destinations, {
      logger: loggerForTransport,
    });
    activeServer = server;
    // Under stdio a signal is not the end of input: the factory's gate holds.
    installShutdown({
      factory,
      servers: [],
      onStdinEnd: true,
      exit: deps.exit,
      stderr: deps.stderr,
      processLike: deps.processLike,
    });
    await server.start(served);
    return;
  }

  if (config.transport === 'sse') {
    const server = new SseServer(handlersRegistry, factory, {
      host: config.host,
      port: config.port,
      ssePath: config.ssePath,
      postPath: config.postPath,
      defaultDestination: destination,
      logger: loggerForTransport,
      tls: config.tls,
      allowDestinationHeader: config.allowDestinationHeader,
      allowedHosts: config.allowedHosts,
      allowedOrigins: config.allowedOrigins,
      enableDnsRebindingProtection: config.enableDnsRebindingProtection,
    });
    activeServer = server;
    installShutdown({
      factory,
      servers: [{ close: () => server.stop() }],
      exit: deps.exit,
      stderr: deps.stderr,
      processLike: deps.processLike,
    });
    await server.start();
    return;
  }

  // http
  const server = new StreamableHttpServer(handlersRegistry, factory, {
    host: config.host,
    port: config.port,
    enableJsonResponse: config.httpJsonResponse,
    path: config.httpPath,
    defaultDestination: destination,
    logger: loggerForTransport,
    tls: config.tls,
    allowDestinationHeader: config.allowDestinationHeader,
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
    enableDnsRebindingProtection: config.enableDnsRebindingProtection,
  });
  activeServer = server;
  installShutdown({
    factory,
    servers: [{ close: () => server.stop() }],
    exit: deps.exit,
    stderr: deps.stderr,
    processLike: deps.processLike,
  });
  await server.start();
}

// Run only when this module is the program. The bin calls `main()` itself, and a
// sibling command imports it — neither wants a server started by an import.
if (require.main === module) {
  void main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      '[MCP] launcher failed:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  });
}

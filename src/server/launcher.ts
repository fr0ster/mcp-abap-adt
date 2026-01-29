import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthBrokerFactory } from '../lib/auth/index.js';
import { ServerConfigManager } from '../lib/config/index.js';
import {
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../lib/handlers/groups/index.js';
import type { HandlerContext } from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
import {
  type AuthDisplayConfig,
  formatAuthConfigForDisplay,
} from '../lib/utils.js';
import { AuthBrokerConfig } from './AuthBrokerConfig.js';
import { SseServer } from './SseServer.js';
import { StdioServer } from './StdioServer.js';
import { StreamableHttpServer } from './StreamableHttpServer.js';

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

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function showVersion(): void {
  const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
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
    MCP_ENV_PATH                   Path to .env file
    MCP_UNSAFE                     Disable connection validation (true|false)
    MCP_USE_AUTH_BROKER            Force auth-broker usage (true|false)
    MCP_BROWSER                    Browser for OAuth2 flow (e.g., chrome, firefox)

  Auth-Broker:
    DEBUG_AUTH_LOG                 Enable debug logging for auth-broker (true|false)
    DEBUG_AUTH_BROKER              Alias for DEBUG_AUTH_LOG
    AUTH_BROKER_PATH               Custom paths for service keys and sessions
                                   Unix: colon-separated (e.g., /path1:/path2)
                                   Windows: semicolon-separated (e.g., C:\\\\path1;C:\\\\path2)

  Debug Options:
    DEBUG_HANDLERS                 Enable handler debug logging (true|false)
    DEBUG_CONNECTORS               Enable connector debug logging (true|false)
    DEBUG_CONNECTION_MANAGER       Enable connection manager debug logging (true|false)
    HANDLER_LOG_SILENT             Disable all handler logs (true|false)

SAP CONNECTION (.env file):

  Basic Authentication:
    SAP_URL                        SAP system URL (required)
    SAP_CLIENT                     SAP client number (required)
    SAP_AUTH_TYPE                  Authentication type: basic|jwt (default: basic)
    SAP_USERNAME                   SAP username (required for basic auth)
    SAP_PASSWORD                   SAP password (required for basic auth)
    SAP_LANGUAGE                   SAP language (optional, e.g., EN, DE)

  JWT/OAuth2 Authentication:
    SAP_JWT_TOKEN                  JWT token (required for jwt auth)
    SAP_REFRESH_TOKEN              Refresh token for token renewal
    SAP_UAA_URL                    UAA URL for OAuth2 (or UAA_URL)
    SAP_UAA_CLIENT_ID              UAA Client ID (or UAA_CLIENT_ID)
    SAP_UAA_CLIENT_SECRET          UAA Client Secret (or UAA_CLIENT_SECRET)

GENERATING .ENV FROM SERVICE KEY:
  Install connection package: npm install -g @mcp-abap-adt/connection
  Generate .env: sap-abap-auth auth -k path/to/service-key.json
`;

function showHelp(): void {
  console.error(ServerConfigManager.generateHelp(V2_HELP_SECTIONS));
}

async function main() {
  // Check for --version first
  if (hasArg('--version') || hasArg('-v')) {
    showVersion();
  }

  // Check for --help
  if (hasArg('--help') || hasArg('-h')) {
    showHelp();
    process.exit(0);
  }

  // Use ServerConfigManager for all config parsing
  const configManager = new ServerConfigManager();
  const config = await configManager.getConfig();

  const baseContext = {
    connection: undefined as any,
    logger: undefined,
  } satisfies HandlerContext;

  // Build handlers based on exposition config (default to readonly,high)
  const exposition = config.exposition || ['readonly', 'high'];
  const handlerGroups: any[] = [];
  if (exposition.includes('readonly')) {
    handlerGroups.push(new ReadOnlyHandlersGroup(baseContext));
    handlerGroups.push(new SystemHandlersGroup(baseContext));
  }
  if (exposition.includes('high')) {
    handlerGroups.push(new HighLevelHandlersGroup(baseContext));
  }
  if (exposition.includes('low')) {
    handlerGroups.push(new LowLevelHandlersGroup(baseContext));
  }
  // SearchHandlersGroup is always included
  handlerGroups.push(new SearchHandlersGroup(baseContext));

  const handlersRegistry = new CompositeHandlersRegistry(handlerGroups);

  // Create auth broker config using adapter
  const brokerConfig = AuthBrokerConfig.fromServerConfig(
    config,
    loggerForTransport,
  );
  const authBrokerFactory = new AuthBrokerFactory(brokerConfig);

  // Initialize default broker (important for .env file support)
  await authBrokerFactory.initializeDefaultBroker();

  // Display auth configuration at startup (always show for transparency)
  const defaultBroker = authBrokerFactory.getDefaultBroker();
  if (defaultBroker) {
    try {
      // Get connection config from broker to display
      const connConfig = await defaultBroker.getConnectionConfig(
        config.mcpDestination || 'default',
      );

      if (connConfig) {
        const displayConfig: AuthDisplayConfig = {
          serviceUrl: connConfig.serviceUrl,
          sapClient: connConfig.sapClient,
          authType: connConfig.authType,
          username: connConfig.username,
          password: connConfig.password,
          jwtToken: connConfig.authorizationToken,
        };

        // Try to get auth config for UAA details
        try {
          const authConfig = await (
            defaultBroker as any
          ).sessionStore?.getAuthorizationConfig?.(
            config.mcpDestination || 'default',
          );
          if (authConfig) {
            displayConfig.uaaUrl = authConfig.uaaUrl;
            displayConfig.uaaClientId = authConfig.uaaClientId;
            displayConfig.uaaClientSecret = authConfig.uaaClientSecret;
            displayConfig.refreshToken = authConfig.refreshToken;
          }
        } catch {
          // Ignore - auth config is optional
        }

        // Determine source
        let source = 'unknown';
        if (config.envFile) {
          source = config.envFile;
        } else if (config.mcpDestination) {
          source = `service-key: ${config.mcpDestination}`;
        }

        console.error(formatAuthConfigForDisplay(displayConfig, source));
      }
    } catch (error) {
      // Don't fail startup if we can't display config
      console.error(
        `[MCP] Warning: Could not display auth config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (config.envFile || config.mcpDestination) {
    // Broker not created but config was expected
    console.error(
      `[MCP] Warning: Auth broker not initialized. Config source: ${config.envFile || config.mcpDestination}`,
    );
  }

  if (config.transport === 'stdio') {
    // For .env file, use 'default' broker; for --mcp, use specified destination
    const configuredBrokerKey =
      config.mcpDestination ?? (config.envFile ? 'default' : undefined);
    const configuredBroker = configuredBrokerKey
      ? await authBrokerFactory.getOrCreateAuthBroker(configuredBrokerKey)
      : undefined;

    let broker: typeof configuredBroker;
    let brokerKey: string;

    if (configuredBroker) {
      broker = configuredBroker;
      brokerKey = configuredBrokerKey!;
    } else {
      // Inspection-only mode: no connection parameters provided
      const { MockAbapConnection } = await import('./MockAbapConnection.js');
      const mockConnection = new MockAbapConnection();
      broker = {
        getSession: async () => ({
          connection: mockConnection as any,
          client: {} as any,
          config: { url: 'http://mock', authType: 'basic' } as any,
          getHeaders: () => ({}),
        }),
        getConnectionConfig: async () => ({
          serviceUrl: 'http://mock',
          authType: 'basic',
          username: 'mock',
          password: 'mock',
        }),
        getToken: async () => undefined,
      } as any;
      brokerKey = 'mock';
      console.error(
        '[MCP] Starting in inspection-only mode (no connection parameters).',
      );
      console.error(
        '[MCP] To connect to SAP system, use --mcp=<destination> or --env=<path>',
      );
    }

    const server = new StdioServer(handlersRegistry, broker!, {
      logger: loggerForTransport,
    });
    await server.start(brokerKey);
    return;
  }

  if (config.transport === 'sse') {
    const server = new SseServer(handlersRegistry, authBrokerFactory, {
      host: config.host,
      port: config.port,
      ssePath: config.ssePath,
      postPath: config.postPath,
      defaultDestination:
        config.mcpDestination ?? (config.envFile ? 'default' : undefined),
      logger: loggerForTransport,
    });
    await server.start();
    return;
  }

  // http
  const server = new StreamableHttpServer(handlersRegistry, authBrokerFactory, {
    host: config.host,
    port: config.port,
    enableJsonResponse: config.httpJsonResponse,
    path: config.httpPath,
    defaultDestination:
      config.mcpDestination ?? (config.envFile ? 'default' : undefined),
    logger: loggerForTransport,
  });
  await server.start();
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    '[MCP] launcher failed:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});

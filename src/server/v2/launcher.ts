import { CompositeHandlersRegistry } from "../../lib/handlers/registry/CompositeHandlersRegistry.js";
import {
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from "../../lib/handlers/groups/index.js";
import { StdioServer } from "./StdioServer.js";
import { StreamableHttpServer } from "./StreamableHttpServer.js";
import { SseServer } from "./SseServer.js";
import { AuthBrokerFactory } from "../../lib/auth/index.js";
import { AuthBrokerConfig } from "./AuthBrokerConfig.js";
import type { HandlerContext } from "../../lib/handlers/interfaces.js";
import { ServerConfigManager } from "../../lib/config/index.js";

const stderrLogger = {
  info: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.error(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => console.error(...args),
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const loggerForTransport = process.env.DEBUG_AUTH_LOG === "true" ? stderrLogger : silentLogger;

type Transport = "stdio" | "sse" | "http";

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Additional help sections specific to v2 server
 */
const V2_HELP_SECTIONS = `
ENVIRONMENT VARIABLES:
  DEBUG_AUTH_LOG                   Enable debug logging for auth-broker (true|false)
                                   Default: false (only info messages shown)
  DEBUG_AUTH_BROKER                Alias for DEBUG_AUTH_LOG
  AUTH_BROKER_PATH                 Custom paths for service keys and sessions
                                   Unix: colon-separated (e.g., /path1:/path2)
                                   Windows: semicolon-separated (e.g., C:\\\\path1;C:\\\\path2)

SAP CONNECTION (.env file):
  SAP_URL                          SAP system URL (required)
  SAP_CLIENT                       SAP client number (required)
  SAP_AUTH_TYPE                    Authentication type: basic|jwt (default: basic)
  SAP_USERNAME                     SAP username (required for basic auth)
  SAP_PASSWORD                     SAP password (required for basic auth)
  SAP_JWT_TOKEN                    JWT token (required for jwt auth)

GENERATING .ENV FROM SERVICE KEY:
  Install connection package: npm install -g @mcp-abap-adt/connection
  Generate .env: sap-abap-auth auth -k path/to/service-key.json
`;

function showHelp(): void {
  console.error(ServerConfigManager.generateHelp(V2_HELP_SECTIONS));
}

async function main() {
  // Check for --help first
  if (hasArg("--help") || hasArg("-h")) {
    showHelp();
    process.exit(0);
  }

  // Use ServerConfigManager for all config parsing
  const configManager = new ServerConfigManager();
  const config = await configManager.getConfig();

  const baseContext = { connection: undefined as any, logger: undefined } satisfies HandlerContext;

  // Build handlers based on exposition config
  const handlerGroups: any[] = [];
  if (config.exposition.includes('readonly')) {
    handlerGroups.push(new ReadOnlyHandlersGroup(baseContext));
    handlerGroups.push(new SystemHandlersGroup(baseContext));
  }
  if (config.exposition.includes('high')) {
    handlerGroups.push(new HighLevelHandlersGroup(baseContext));
  }
  if (config.exposition.includes('low')) {
    handlerGroups.push(new LowLevelHandlersGroup(baseContext));
  }
  // SearchHandlersGroup is always included
  handlerGroups.push(new SearchHandlersGroup(baseContext));

  const handlersRegistry = new CompositeHandlersRegistry(handlerGroups);

  // Create auth broker config using adapter
  const brokerConfig = AuthBrokerConfig.fromServerConfig(config, loggerForTransport);
  const authBrokerFactory = new AuthBrokerFactory(brokerConfig);

  // Initialize default broker (important for .env file support)
  await authBrokerFactory.initializeDefaultBroker();

  if (config.transport === "stdio") {
    if (!config.mcpDestination && !config.envFile) {
      throw new Error("stdio requires --mcp=<destination> or --env=<path>");
    }
    // For .env file, use 'default' broker; for --mcp, use specified destination
    const brokerKey = config.envFile ? 'default' : config.mcpDestination;
    const broker = await authBrokerFactory.getOrCreateAuthBroker(brokerKey);
    if (!broker) {
      throw new Error(`Auth broker not available for ${brokerKey ?? 'default'}`);
    }
    const server = new StdioServer(handlersRegistry, broker, { logger: loggerForTransport });
    await server.start(brokerKey ?? 'default');
    return;
  }

  if (config.transport === "sse") {
    const server = new SseServer(handlersRegistry, authBrokerFactory, {
      host: config.host,
      port: config.port,
      defaultDestination: config.envFile ? 'default' : config.mcpDestination,
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
    defaultDestination: config.envFile ? 'default' : config.mcpDestination,
    logger: loggerForTransport,
  });
  await server.start();
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[MCP] launcher failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

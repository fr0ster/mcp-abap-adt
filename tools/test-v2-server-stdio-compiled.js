#!/usr/bin/env node
/**
 * Test script for v2 server with stdio transport (compiled version for Inspector)
 *
 * Usage:
 *   node ./tools/test-v2-server-stdio-compiled.js --mcp=my-destination
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { McpServer: V2McpServer } = require('../../dist/lib/servers/v2/server/index.js');
const { StdioTransport } = require('../../dist/lib/servers/v2/transports/index.js');
const { SessionManager } = require('../../dist/lib/servers/v2/session/index.js');
const { ProtocolHandler } = require('../../dist/lib/servers/v2/protocol/index.js');
const { CompositeHandlersRegistry } = require('../../dist/lib/servers/handlers/registry/CompositeHandlersRegistry.js');
const {
  ReadOnlyHandlersGroup,
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  SystemHandlersGroup,
  SearchHandlersGroup,
} = require('../../dist/lib/servers/handlers/groups/index.js');
const { LocalModeFactory } = require('../../dist/lib/servers/v2/factory/index.js');
const {
  AbapServiceKeyStore,
  AbapSessionStore,
} = require('@mcp-abap-adt/auth-stores');
const { XsuaaTokenProvider } = require('@mcp-abap-adt/auth-providers');
const { createLogger } = require('@mcp-abap-adt/logger');

// Parse command line arguments
const args = process.argv.slice(2);
const mcpArg = args.find((arg) => arg.startsWith('--mcp='));
const destination = mcpArg ? mcpArg.split('=')[1] : undefined;

if (!destination) {
  console.error('Error: --mcp=destination parameter is required');
  console.error('Usage: node ./tools/test-v2-server-stdio-compiled.js --mcp=my-destination');
  process.exit(1);
}

const logger = createLogger({ level: 'info' });

async function main() {
  try {
    logger.info('Starting MCP Server v2 (stdio transport)...', { destination });

    // 1. Create stores and providers
    const serviceKeyStore = new AbapServiceKeyStore();
    const sessionStore = new AbapSessionStore();
    const tokenProvider = new XsuaaTokenProvider();

    // 2. Create LocalModeFactory
    const localModeFactory = new LocalModeFactory({
      serviceKeyStore,
      sessionStore,
      tokenProvider,
      logger,
    });

    // 3. Create connection provider
    const connectionProvider = localModeFactory.createConnectionProvider();

    // 4. Create session manager
    const sessionManager = new SessionManager();

    // 5. Create protocol handler
    const protocolHandler = new ProtocolHandler();

    // 6. Create handlers registry
    const handlersRegistry = new CompositeHandlersRegistry([
      new ReadOnlyHandlersGroup(),
      new HighLevelHandlersGroup(),
      new LowLevelHandlersGroup(),
      new SystemHandlersGroup(),
      new SearchHandlersGroup(),
    ]);

    // 7. Create SDK MCP server
    const sdkServer = new McpServer(
      {
        name: 'mcp-abap-adt-v2',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 8. Create transport
    const transport = new StdioTransport(sdkServer);

    // 9. Create v2 server
    const server = new V2McpServer(
      transport,
      sessionManager,
      connectionProvider,
      protocolHandler,
      handlersRegistry,
      sdkServer,
      logger
    );

    // 10. Validate configuration
    server.validateConfiguration();

    // 11. Start server
    await server.start();

    logger.info('MCP Server v2 started successfully (stdio transport)');
    logger.info('Server is ready to accept connections');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

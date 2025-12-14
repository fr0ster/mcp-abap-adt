#!/usr/bin/env node
/**
 * Test script for v2 server with SSE transport (compiled version)
 *
 * Usage:
 *   node ./tools/test-v2-server-sse-compiled.js --mcp=my-destination [--port=3000]
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { McpServer: V2McpServer } = require('../../dist/lib/servers/v2/server/index.js');
const { SseTransport } = require('../../dist/lib/servers/v2/transports/index.js');
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
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const mcpArg = args.find((arg) => arg.startsWith('--mcp='));
const portArg = args.find((arg) => arg.startsWith('--port='));
const destination = mcpArg ? mcpArg.split('=')[1] : undefined;
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3001;

if (!destination) {
  console.error('Error: --mcp=destination parameter is required');
  console.error('Usage: node ./tools/test-v2-server-sse-compiled.js --mcp=my-destination [--port=3001]');
  process.exit(1);
}

const logger = createLogger({ level: 'info' });

async function main() {
  try {
    logger.info('Starting MCP Server v2 (SSE transport)...', { destination, port });

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

    // 8. Create HTTP server for SSE
    const httpServer = http.createServer();

    // 9. Create SSE transport
    const transport = new SseTransport(sdkServer, httpServer);

    // 10. Create v2 server
    const server = new V2McpServer(
      transport,
      sessionManager,
      connectionProvider,
      protocolHandler,
      handlersRegistry,
      sdkServer,
      logger
    );

    // 11. Validate configuration
    server.validateConfiguration();

    // 12. Start HTTP server
    httpServer.listen(port, '127.0.0.1', () => {
      logger.info(`HTTP server listening on http://127.0.0.1:${port}`);
    });

    // 13. Start server
    await server.start();

    logger.info('MCP Server v2 started successfully (SSE transport)');
    logger.info(`Server is ready at http://127.0.0.1:${port}/sse`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      httpServer.close();
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      httpServer.close();
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

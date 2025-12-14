#!/usr/bin/env node
/**
 * Test script for v2 server with HTTP transport (compiled version)
 *
 * Usage:
 *   node ./tools/test-v2-server-http-compiled.js --mcp=my-destination [--port=3000]
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { McpServer: V2McpServer } = require('../../dist/lib/servers/v2/server/index.js');
const { StreamableHttpTransport } = require('../../dist/lib/servers/v2/transports/index.js');
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
const portArg = args.find((arg) => arg.startsWith('--http-port=') || arg.startsWith('--port='));
const hostArg = args.find((arg) => arg.startsWith('--host='));
const destination = mcpArg ? mcpArg.split('=')[1] : undefined;
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;
// Default to 127.0.0.1 (LOCAL mode), use 0.0.0.0 for REMOTE mode
const host = hostArg ? hostArg.split('=')[1] : '127.0.0.1';

if (!destination) {
  console.error('Error: --mcp=destination parameter is required');
  console.error('Usage: node ./tools/test-v2-server-http-compiled.js --mcp=my-destination [--http-port=3000] [--host=127.0.0.1|0.0.0.0]');
  console.error('  --host=127.0.0.1 (default): LOCAL mode - only local connections');
  console.error('  --host=0.0.0.0: REMOTE mode - accepts connections from any IP');
  process.exit(1);
}

const logger = createLogger({ level: 'info' });

async function main() {
  try {
    const mode = host === '0.0.0.0' ? 'REMOTE' : 'LOCAL';
    logger.info('Starting MCP Server v2 (HTTP transport)...', { destination, port, host, mode });

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

    // 8. Create HTTP server
    const httpServer = http.createServer();

    // 9. Create HTTP transport
    // host = 0.0.0.0 -> REMOTE mode, host = 127.0.0.1 -> LOCAL mode
    const transport = new StreamableHttpTransport({
      port: port,
      host: host,
    });

    // 10. Setup HTTP server to handle requests via transport
    httpServer.on('request', async (req, res) => {
      await transport.handleRequest(req, res);
    });

    // 11. Create v2 server
    const server = new V2McpServer(
      transport,
      sessionManager,
      connectionProvider,
      protocolHandler,
      handlersRegistry,
      sdkServer,
      logger
    );

    // 12. Validate configuration
    server.validateConfiguration();

    // 13. Start HTTP server
    httpServer.listen(port, host, () => {
      logger.info(`HTTP server listening on http://${host}:${port} (${mode} mode)`);
    });

    // 14. Start server
    await server.start();

    logger.info('MCP Server v2 started successfully (HTTP transport)');
    logger.info(`Server is ready at http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (${mode} mode)`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

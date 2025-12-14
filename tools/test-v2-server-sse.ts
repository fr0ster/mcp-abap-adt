#!/usr/bin/env node
/**
 * Test script for v2 server with SSE transport
 *
 * Usage:
 *   npm run test:v2:sse
 *   npm run test:v2:sse -- --mcp=my-destination --port=3000
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServer as V2McpServer } from '../src/lib/servers/v2/server/McpServer.js';
import { SseTransport } from '../src/lib/servers/v2/transports/SseTransport.js';
import { SessionManager } from '../src/lib/servers/v2/session/SessionManager.js';
import { ProtocolHandler } from '../src/lib/servers/v2/protocol/ProtocolHandler.js';
import { CompositeHandlersRegistry } from '../src/lib/servers/handlers/registry/CompositeHandlersRegistry.js';
import {
  ReadOnlyHandlersGroup,
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  SystemHandlersGroup,
  SearchHandlersGroup,
} from '../src/lib/servers/handlers/groups/index.js';
import { LocalModeFactory } from '../src/lib/servers/v2/factory/LocalModeFactory.js';
import {
  AbapServiceKeyStore,
  AbapSessionStore,
} from '@mcp-abap-adt/auth-stores';
import { XsuaaTokenProvider } from '@mcp-abap-adt/auth-providers';
import { createLogger } from '@mcp-abap-adt/logger';
import http from 'http';

// Parse command line arguments
const args = process.argv.slice(2);
const mcpArg = args.find((arg) => arg.startsWith('--mcp='));
const portArg = args.find((arg) => arg.startsWith('--port='));
const destination = mcpArg ? mcpArg.split('=')[1] : undefined;
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;

if (!destination) {
  console.error('Error: --mcp=destination parameter is required');
  console.error('Usage: npm run test:v2:sse -- --mcp=my-destination [--port=3000]');
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

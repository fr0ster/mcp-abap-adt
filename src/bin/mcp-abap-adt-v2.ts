#!/usr/bin/env node
/**
 * MCP ABAP ADT Server v2 Entry Point
 *
 * Main entry point for v2 server architecture
 * Compiles to dist/bin/mcp-abap-adt-v2.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServer as V2McpServer } from '../lib/servers/v2/server/McpServer.js';
import { StdioTransport } from '../lib/servers/v2/transports/StdioTransport.js';
import { SseTransport } from '../lib/servers/v2/transports/SseTransport.js';
import { StreamableHttpTransport } from '../lib/servers/v2/transports/StreamableHttpTransport.js';
import { SessionManager } from '../lib/servers/v2/session/SessionManager.js';
import { ProtocolHandler } from '../lib/servers/v2/protocol/ProtocolHandler.js';
import { CompositeHandlersRegistry } from '../lib/servers/handlers/registry/CompositeHandlersRegistry.js';
import {
  ReadOnlyHandlersGroup,
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  SystemHandlersGroup,
  SearchHandlersGroup,
} from '../lib/servers/handlers/groups/index.js';
import { LocalModeFactory } from '../lib/servers/v2/factory/LocalModeFactory.js';
import {
  AbapServiceKeyStore,
  AbapSessionStore,
} from '@mcp-abap-adt/auth-stores';
import { BtpTokenProvider } from '@mcp-abap-adt/auth-providers';
import { DefaultLogger } from '@mcp-abap-adt/logger';
import { showHelp, showVersion } from './help.js';
import http from 'http';

interface ParsedArgs {
  help?: boolean;
  version?: boolean;
  mcp?: string;
  transport?: 'stdio' | 'sse' | 'http';
  httpPort?: number;
  ssePort?: number;
  httpHost?: string;
  sseHost?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {};

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (arg.startsWith('--mcp=')) {
      result.mcp = arg.split('=')[1];
    } else if (arg.startsWith('--transport=')) {
      const transport = arg.split('=')[1];
      if (transport === 'stdio' || transport === 'sse' || transport === 'http') {
        result.transport = transport;
      }
    } else if (arg.startsWith('--http-port=')) {
      result.httpPort = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--sse-port=')) {
      result.ssePort = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--http-host=')) {
      result.httpHost = arg.split('=')[1];
    } else if (arg.startsWith('--sse-host=')) {
      result.sseHost = arg.split('=')[1];
    }
  }

  // Defaults from environment variables
  if (!result.transport) {
    result.transport = (process.env.MCP_TRANSPORT as any) || 'stdio';
  }
  if (!result.httpPort) {
    result.httpPort = parseInt(process.env.MCP_HTTP_PORT || '3000', 10);
  }
  if (!result.ssePort) {
    result.ssePort = parseInt(process.env.MCP_SSE_PORT || '3001', 10);
  }
  if (!result.httpHost) {
    result.httpHost = process.env.MCP_HTTP_HOST || '127.0.0.1';
  }
  if (!result.sseHost) {
    result.sseHost = process.env.MCP_SSE_HOST || '127.0.0.1';
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  if (!args.mcp) {
    console.error('Error: --mcp=destination parameter is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const logger = new DefaultLogger();

  try {
    logger.info('Starting MCP Server v2...', {
      destination: args.mcp,
      transport: args.transport
    });

    // 1. Create stores and providers
    const serviceKeyStore = new AbapServiceKeyStore(
      process.env.AUTH_BROKER_PATH?.split(process.platform === 'win32' ? ';' : ':')[0] || './service-keys',
      logger,
    );
    const sessionStore = new AbapSessionStore(
      process.env.AUTH_BROKER_PATH?.split(process.platform === 'win32' ? ';' : ':')[1] || './sessions',
      logger,
    );
    const tokenProvider = new BtpTokenProvider();

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

    // 8. Create transport based on type
    let transport: any;
    let httpServer: http.Server | undefined;

    if (args.transport === 'sse') {
      httpServer = http.createServer();
      transport = new SseTransport({
        port: args.ssePort!,
        host: args.sseHost!,
        endpoint: '/sse',
      });
      // SSE transport needs HTTP server integration
      // This will be handled by the transport's start() method
    } else if (args.transport === 'http') {
      httpServer = http.createServer();
      transport = new StreamableHttpTransport({
        port: args.httpPort!,
        host: args.httpHost!,
      });
      httpServer.on('request', async (req, res) => {
        await transport.handleRequest(req, res);
      });
    } else {
      // stdio
      transport = new StdioTransport();
    }

    // 9. Create v2 server
    const server = new V2McpServer(
      transport,
      sessionManager,
      connectionProvider,
      protocolHandler,
      handlersRegistry,
      sdkServer,
      logger,
      args.mcp // Pass default destination from --mcp argument
    );

    // 10. Validate configuration
    server.validateConfiguration();

    // 11. Start HTTP server if needed
    if (httpServer) {
      const port = args.transport === 'sse' ? args.ssePort! : args.httpPort!;
      const host = args.transport === 'sse' ? args.sseHost! : args.httpHost!;
      httpServer.listen(port, host, () => {
        logger.info(`HTTP server listening on http://${host}:${port}`);
      });
    }

    // 12. Start server
    await server.start();

    logger.info('MCP Server v2 started successfully');
    if (args.transport === 'stdio') {
      logger.info('Server is ready to accept connections (stdio)');
    } else {
      const port = args.transport === 'sse' ? args.ssePort! : args.httpPort!;
      logger.info(`Server is ready at http://${args.transport === 'sse' ? args.sseHost : args.httpHost}:${port}${args.transport === 'sse' ? '/sse' : ''}`);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      if (httpServer) {
        httpServer.close();
      }
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      if (httpServer) {
        httpServer.close();
      }
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

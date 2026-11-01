/**
 * The examples of docs/architecture/HANDLER_EXPORTER.md, checked by the
 * compiler: `npm run test:check` compiles this file against the real API
 * (`@mcp-abap-adt/lib/handlers` is `src/lib/handlers`). A change of the API
 * an example uses fails the check; keep the guide and this file together.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  BasicAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import { createConnection } from '@mcp-abap-adt/connection';
import type { ISapConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { Logger } from '@mcp-abap-adt/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../embeddable';
import {
  type ConnectionProvider,
  callInItsForm,
  type HandlerContext,
  HandlerExporter,
  isArgsOnly,
} from '../../lib/handlers';

// Basic usage
export function basicUsage(): McpServer {
  const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
  const exporter = new HandlerExporter({ systemType: 'onprem' });
  const connection = createConnection({
    system: 'onprem',
    transport: 'http',
    config: {
      url: 'https://your-sap-system.com',
      client: '100',
      authType: 'basic',
    },
    credential: new BasicAuthProvider('user', 'pass'),
  });
  exporter.registerOnServer(mcpServer, () => connection);
  return mcpServer;
}

// The provider's type, as exported
export const given: ConnectionProvider = () =>
  createConnection({
    system: 'onprem',
    transport: 'http',
    config: { url: 'https://your-sap-system.com', authType: 'basic' },
    credential: new BasicAuthProvider('user', 'pass'),
  });

// Async connection provider
declare function getJwtToken(): Promise<string>;
declare const sapUrl: string;
export function asyncProvider(
  mcpServer: McpServer,
  exporter: HandlerExporter,
): void {
  exporter.registerOnServer(mcpServer, async () => {
    const connection = createConnection({
      system: 'cloud',
      transport: 'http',
      config: { url: sapUrl, authType: 'jwt' },
      credential: TokenAuthProvider.fixed(await getJwtToken()),
    });
    await connection.connect();
    return connection;
  });
}

// Per-request context (AsyncLocalStorage)
interface RequestContext {
  sapConfig: ISapConfig;
  token: string;
}
const requestContext = new AsyncLocalStorage<RequestContext>();
export function perRequest(
  mcpServer: McpServer,
  exporter: HandlerExporter,
): void {
  exporter.registerOnServer(mcpServer, async () => {
    const ctx = requestContext.getStore();
    if (!ctx) throw new Error('No request context');
    const connection = createConnection({
      system: 'cloud',
      transport: 'http',
      config: ctx.sapConfig,
      credential: TokenAuthProvider.fixed(ctx.token),
    });
    await connection.connect();
    return connection;
  });
}

// Handler groups
export const customized = new HandlerExporter({
  systemType: 'cloud',
  includeReadOnly: true,
  includeHighLevel: true,
  includeSystem: true,
  includeSearch: true,
  includeDebug: false,
});
export const readOnly = new HandlerExporter({
  systemType: 'cloud',
  includeReadOnly: true,
  includeHighLevel: false,
  includeSystem: true,
  includeSearch: true,
});

// Inspecting handlers
export async function inspect(
  exporter: HandlerExporter,
  context: HandlerContext,
): Promise<string[]> {
  const toolNames = exporter.getToolNames();
  const entries = exporter.getHandlerEntries();
  for (const entry of entries) {
    console.error(`Tool: ${entry.toolDefinition.name}`);
    if (isArgsOnly(entry.handler)) await entry.handler({});
    await callInItsForm(entry.handler, context, {}, (_given, call) => call());
  }
  return toolNames;
}

// Logging
export function logged(logger: Logger): HandlerExporter {
  return new HandlerExporter({ logger });
}

// A server instance instead
export function embeddable(context: HandlerContext): EmbeddableMcpServer {
  const exporter = new HandlerExporter({ systemType: 'onprem' });
  return new EmbeddableMcpServer({
    connection: context.connection,
    systemType: 'onprem',
    handlersRegistry: exporter.createRegistry(),
  });
}

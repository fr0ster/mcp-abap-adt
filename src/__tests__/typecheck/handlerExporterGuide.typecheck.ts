/**
 * The examples of docs/architecture/HANDLER_EXPORTER.md and of the
 * "Embedding the handlers" snippet in docs/architecture/README.md, checked by
 * the compiler: `npm run test:check` compiles this file against the real API
 * (`@mcp-abap-adt/lib/handlers` is `src/lib/handlers`,
 * `@mcp-abap-adt/lib/embeddable` is `src/embeddable`). A change of the API an
 * example uses fails the check; keep the docs and this file together. What
 * an example leaves to the embedder (its pool, its web framework, its user)
 * is declared here.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { createConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { Logger } from '@mcp-abap-adt/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../embeddable';
import {
  type CallContext,
  type ConnectionProvider,
  callInItsForm,
  type HandlerContext,
  HandlerExporter,
  isArgsOnly,
} from '../../lib/handlers';

// Basic usage
export async function basicUsage(): Promise<McpServer> {
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
  await connection.connect();
  exporter.registerOnServer(mcpServer, () => connection);
  await connection.disconnect();
  return mcpServer;
}

// The provider's type, as exported
export const given =
  (connection: IAbapConnection): ConnectionProvider =>
  () =>
    connection;

// Async connection provider: the embedder's pool
interface ConnectionPool {
  connectionFor(user: string): Promise<IAbapConnection>;
}
declare const pool: ConnectionPool;
declare function currentUser(): string;
export function asyncProvider(
  mcpServer: McpServer,
  exporter: HandlerExporter,
): void {
  exporter.registerOnServer(mcpServer, async () => {
    const user = currentUser();
    return pool.connectionFor(user);
  });
}

// Per-request context (AsyncLocalStorage); the web framework is the embedder's
interface HttpRequest {
  readonly headers: Record<string, string | undefined>;
}
interface HttpResponse {
  end(): void;
}
declare const app: {
  post(
    path: string,
    handler: (req: HttpRequest, res: HttpResponse) => void,
  ): void;
};
declare function userOf(req: HttpRequest): string;
declare function handleMcpRequest(
  req: HttpRequest,
  res: HttpResponse,
): Promise<void>;
export function perRequest(
  mcpServer: McpServer,
  exporter: HandlerExporter,
): void {
  const requestContext = new AsyncLocalStorage<{ user: string }>();
  const held = new Map<string, IAbapConnection>();

  exporter.registerOnServer(mcpServer, () => {
    const ctx = requestContext.getStore();
    if (!ctx) throw new Error('No request context');
    const connection = held.get(ctx.user);
    if (!connection) throw new Error('No connection held for this user');
    return connection;
  });

  app.post('/mcp', (req, res) => {
    requestContext.run({ user: userOf(req) }, async () => {
      await handleMcpRequest(req, res);
    });
  });
}

// Handler groups
export const customized = new HandlerExporter({
  systemType: 'cloud',
  includeReadOnly: true,
  includeHighLevel: true,
  includeSystem: true,
  includeSearch: true,
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

// A server instance instead (also the README's embedding snippet)
export function embeddable(connection: IAbapConnection): EmbeddableMcpServer {
  return new EmbeddableMcpServer({
    connection,
    systemType: 'onprem',
    handlersRegistry: new HandlerExporter({
      systemType: 'onprem',
    }).createRegistry(),
  });
}

// The README's embedding snippet: the tools on a server of your own
export async function readmeEmbedding(): Promise<McpServer> {
  const exporter = new HandlerExporter({
    systemType: 'onprem',
    includeReadOnly: true,
    includeHighLevel: true,
    includeSystem: true,
    includeSearch: true,
  });
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
  await connection.connect();
  const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
  exporter.registerOnServer(mcpServer, () => connection);
  return mcpServer;
}

// Logging
export function logged(logger: Logger): HandlerExporter {
  return new HandlerExporter({ logger });
}

// The per-call context a registration asks for (in public signatures:
// BaseHandlerGroup.registerHandlersOnCall, registerAllToolsOnCall)
declare function heldConnection(): HandlerContext['connection'];
export const perCall: CallContext = async () => ({
  connection: heldConnection(),
});

// HandlerExporterOptions has no `includeDebug`: the debugger is served by
// EmbeddableMcpServer. This line fails the check the moment the option exists again.
export const noDebugOption = new HandlerExporter({
  systemType: 'onprem',
  // @ts-expect-error HandlerExporterOptions has no includeDebug
  includeDebug: true,
});

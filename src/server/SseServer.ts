import type { Logger } from '@mcp-abap-adt/logger';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import type { AuthBrokerFactory } from '../lib/auth/index.js';
import { noopLogger } from '../lib/handlerLogger.js';
import type { IHandlersRegistry } from '../lib/handlers/interfaces.js';
import { BaseMcpServer } from './BaseMcpServer.js';
import type {
  IHttpApplication,
  RouteRegistrationOptions,
} from './IHttpApplication.js';

const DEFAULT_VERSION = process.env.npm_package_version ?? '1.0.0';

export interface SseServerOptions {
  /**
   * Host to bind to (only used when no external app is provided)
   * @default "127.0.0.1"
   */
  host?: string;
  /**
   * Port to listen on (only used when no external app is provided)
   * @default 3001
   */
  port?: number;
  /**
   * Path for SSE GET endpoint
   * @default "/sse"
   */
  ssePath?: string;
  /**
   * Path for POST messages endpoint
   * @default "/messages"
   */
  postPath?: string;
  /**
   * Default SAP destination to use if not specified in headers
   */
  defaultDestination?: string;
  /**
   * Logger instance
   */
  logger?: Logger;
  /**
   * Server version
   */
  version?: string;
  /**
   * External HTTP application to register routes on
   * When provided, start() will only register routes without creating a server
   * This enables integration with existing Express/CDS/CAP servers
   */
  app?: IHttpApplication;
}

type SessionEntry = {
  server: BaseMcpServer;
  transport: SSEServerTransport;
};

/**
 * Minimal SSE server: creates a new BaseMcpServer per GET connection, routes POST by sessionId.
 *
 * Supports two modes:
 * 1. Standalone mode: Creates its own Express server (when no app option provided)
 * 2. Embedded mode: Registers routes on external app (when app option provided)
 */
export class SseServer {
  private readonly host: string;
  private readonly port: number;
  private readonly ssePath: string;
  private readonly postPath: string;
  private readonly defaultDestination?: string;
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly logger: Logger;
  private readonly version: string;
  private readonly externalApp?: IHttpApplication;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly authBrokerFactory: AuthBrokerFactory,
    opts?: SseServerOptions,
  ) {
    this.host = opts?.host ?? '127.0.0.1';
    this.port = opts?.port ?? 3001;
    this.ssePath = opts?.ssePath ?? '/sse';
    this.postPath = opts?.postPath ?? '/messages';
    this.defaultDestination = opts?.defaultDestination;
    this.logger = opts?.logger ?? noopLogger;
    this.version = opts?.version ?? DEFAULT_VERSION;
    this.externalApp = opts?.app;
  }

  /**
   * Register routes on an external HTTP application
   * Use this when integrating with existing Express/CDS/CAP server
   *
   * @param app - External HTTP application (Express, CDS, etc.)
   * @param options - Route registration options
   */
  registerRoutes(
    app: IHttpApplication,
    _options?: RouteRegistrationOptions,
  ): void {
    app.get(this.ssePath, (async (req: any, res: any) => {
      await this.handleGet(req, res);
    }) as any);

    app.post(this.postPath, (async (req: any, res: any) => {
      const url = new URL(req.originalUrl, `http://${req.headers.host}`);
      await this.handlePost(req, res, url);
    }) as any);

    console.error(`[SseServer] Routes registered on external app`);
    console.error(`[SseServer] SSE endpoint: ${this.ssePath}`);
    console.error(`[SseServer] POST endpoint: ${this.postPath}`);
    if (this.defaultDestination) {
      console.error(
        `[SseServer] Default destination: ${this.defaultDestination}`,
      );
    }
  }

  /**
   * Get the configured SSE endpoint path
   */
  getSsePath(): string {
    return this.ssePath;
  }

  /**
   * Get the configured POST endpoint path
   */
  getPostPath(): string {
    return this.postPath;
  }

  /**
   * Start the server
   *
   * In standalone mode (no external app): Creates Express server and starts listening
   * In embedded mode (external app provided): Only registers routes on external app
   */
  async start(): Promise<void> {
    // If external app was provided in constructor, register routes on it
    if (this.externalApp) {
      this.registerRoutes(this.externalApp);
      return;
    }

    // Standalone mode: create own Express server
    const app = express();
    app.use(express.json());

    this.registerRoutes(app as unknown as IHttpApplication);

    await new Promise<void>((resolve, reject) => {
      const _srv = app
        .listen(this.port, this.host, () => {
          console.error(
            `[SseServer] Server started on ${this.host}:${this.port}`,
          );
          console.error(
            `[SseServer] SSE endpoint: http://${this.host}:${this.port}${this.ssePath}`,
          );
          console.error(
            `[SseServer] POST endpoint: http://${this.host}:${this.port}${this.postPath}`,
          );
          resolve();
        })
        .on('error', reject);
    });
  }

  private async handleGet(req: any, res: any): Promise<void> {
    let destination: string | undefined;
    let broker: any;

    // Priority 1: Check x-mcp-destination header
    const destinationHeader =
      (req.headers['x-mcp-destination'] as string | undefined) ??
      (req.headers['X-MCP-Destination'] as string | undefined);

    if (destinationHeader) {
      destination = destinationHeader;
      broker = await this.authBrokerFactory.getOrCreateAuthBroker(destination);
    }
    // Priority 2: Check SAP connection headers (x-sap-url + auth params)
    // Headers will be passed directly to handlers, no broker needed
    else if (this.hasSapConnectionHeaders(req.headers)) {
      // No destination, no broker - handlers will use headers directly
      destination = undefined;
      broker = undefined;
    }
    // Priority 3: Use default destination
    else if (this.defaultDestination) {
      destination = this.defaultDestination;
      broker = await this.authBrokerFactory.getOrCreateAuthBroker(destination);
    }
    // Priority 4: No auth params at all
    // Allow request to proceed - metadata methods (tools/list, etc.) will work
    // tools/call will fail with appropriate error in handler

    this.logger.debug(`SSE GET: destination=${destination ?? 'none'}`);

    class SessionServer extends BaseMcpServer {
      constructor(
        private readonly registry: IHandlersRegistry,
        readonly loggerImpl: Logger,
        readonly ver: string,
      ) {
        super({ name: 'mcp-abap-adt-sse', version: ver, logger: loggerImpl });
      }
      async init(dest: string | undefined, b: any, hdrs?: any) {
        if (dest && b) {
          await this.setConnectionContext(dest, b);
        } else if (hdrs) {
          this.setConnectionContextFromHeaders(hdrs);
        }
        this.registerHandlers(this.registry);
      }
    }

    const server = new SessionServer(
      this.handlersRegistry,
      this.logger,
      this.version,
    );
    await server.init(
      destination,
      broker,
      this.hasSapConnectionHeaders(req.headers) ? req.headers : undefined,
    );

    const transport = new SSEServerTransport(this.postPath, res);
    const sessionId = transport.sessionId;

    console.error(
      `[SSE GET] Created session ${sessionId} for destination ${destination}`,
    );
    this.sessions.set(sessionId, { server, transport });
    console.error(
      `[SSE GET] Session stored, total sessions: ${this.sessions.size}`,
    );

    // Connect transport to server BEFORE registering close handler
    // This ensures connection is established before any cleanup can happen
    try {
      await server.connect(transport);
      this.logger.debug(`SSE GET: server connected for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `SSE GET: failed to connect for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.sessions.delete(sessionId);
      if (!res.headersSent) {
        res.writeHead(500).end('Internal Server Error');
      }
      return;
    }

    // Register cleanup handler AFTER successful connection
    res.on('close', () => {
      console.error(`[SSE CLOSE] Connection closed for session ${sessionId}`);
      this.sessions.delete(sessionId);
      void transport.close();
      void server.close();
    });
  }

  private async handlePost(req: any, res: any, url?: URL): Promise<void> {
    const sessionId = (url?.searchParams.get('sessionId') ||
      req.headers['x-session-id'] ||
      '') as string;

    console.error(
      `[SSE POST] sessionId=${sessionId}, activeSessions=${this.sessions.size}, keys=[${Array.from(this.sessions.keys()).join(', ')}]`,
    );

    const entry = this.sessions.get(sessionId);
    if (!entry) {
      console.error(
        `[SSE POST] Invalid session ${sessionId} - session not found!`,
      );
      res.writeHead(400).end('Invalid session');
      return;
    }

    // Pass pre-parsed body from express.json() middleware (like reference implementation)
    // express.json() already read and parsed the body into req.body
    console.error(
      `[SSE POST] Calling handlePostMessage with req.body for session ${sessionId}`,
    );

    try {
      await entry.transport.handlePostMessage(req, res, req.body);
      console.error(
        `[SSE POST] Successfully processed for session ${sessionId}`,
      );
    } catch (error) {
      console.error(
        `[SSE POST] FAILED for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error(`[SSE POST] Error stack:`, error);
      if (!res.headersSent) {
        res.writeHead(500).end('Internal Server Error');
      }
    }
  }

  /**
   * Check if request has SAP connection headers
   */
  private hasSapConnectionHeaders(headers: any): boolean {
    const hasUrl = headers['x-sap-url'] || headers['X-SAP-URL'];
    const hasJwtAuth = headers['x-sap-jwt-token'] || headers['X-SAP-JWT-Token'];
    const hasBasicAuth =
      (headers['x-sap-login'] || headers['X-SAP-Login']) &&
      (headers['x-sap-password'] || headers['X-SAP-Password']);

    return !!(hasUrl && (hasJwtAuth || hasBasicAuth));
  }
}

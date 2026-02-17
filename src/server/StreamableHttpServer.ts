import type { Server as HttpServer } from 'node:http';
import type { Logger } from '@mcp-abap-adt/logger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import type { AuthBrokerFactory } from '../lib/auth/index.js';
import { noopLogger } from '../lib/handlerLogger.js';
import type { IHandlersRegistry } from '../lib/handlers/interfaces.js';
import { BaseMcpServer } from './BaseMcpServer.js';
import type {
  IHttpApplication,
  RouteRegistrationOptions,
} from './IHttpApplication.js';

const DEFAULT_VERSION = process.env.npm_package_version ?? '1.0.0';

export interface StreamableHttpServerOptions {
  /**
   * Host to bind to (only used when no external app is provided)
   * @default "127.0.0.1"
   */
  host?: string;
  /**
   * Port to listen on (only used when no external app is provided)
   * @default 3000
   */
  port?: number;
  /**
   * Whether to return JSON responses (vs SSE streams)
   * @default true
   */
  enableJsonResponse?: boolean;
  /**
   * Default SAP destination to use if not specified in headers
   */
  defaultDestination?: string;
  /**
   * Path for the MCP endpoint
   * @default "/mcp/stream/http"
   */
  path?: string;
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

/**
 * Minimal Streamable HTTP server implementation.
 * Creates new transport for each HTTP POST and forwards request to the MCP server.
 * Destination is taken from x-mcp-destination header or defaultDestination.
 *
 * Supports two modes:
 * 1. Standalone mode: Creates its own Express server (when no app option provided)
 * 2. Embedded mode: Registers routes on external app (when app option provided)
 */
export class StreamableHttpServer extends BaseMcpServer {
  private readonly host: string;
  private readonly port: number;
  private readonly enableJsonResponse: boolean;
  private readonly defaultDestination?: string;
  private readonly path: string;
  private readonly externalApp?: IHttpApplication;
  private readonly version: string;
  private standaloneServer?: HttpServer;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly authBrokerFactory: AuthBrokerFactory,
    opts?: StreamableHttpServerOptions,
  ) {
    super({
      name: 'mcp-abap-adt',
      version: opts?.version ?? DEFAULT_VERSION,
      logger: opts?.logger ?? noopLogger,
    });
    this.version = opts?.version ?? DEFAULT_VERSION;
    this.host = opts?.host ?? '127.0.0.1';
    this.port = opts?.port ?? 3000;
    this.enableJsonResponse = opts?.enableJsonResponse ?? true;
    this.defaultDestination = opts?.defaultDestination;
    this.path = opts?.path ?? '/mcp/stream/http';
    this.externalApp = opts?.app;
    // Register handlers once for shared MCP server
    this.registerHandlers(this.handlersRegistry);
  }

  /**
   * Creates the request handler function
   * Can be used to register on external app or internal Express
   */
  private createRequestHandler(): (
    req: Request,
    res: Response,
  ) => Promise<void> {
    return async (req: Request, res: Response) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      console.error(
        `[StreamableHttpServer] ${req.method} ${req.path} from ${clientId}`,
      );

      try {
        const server = this.createPerRequestServer();
        let destination: string | undefined;
        let broker: Awaited<
          ReturnType<AuthBrokerFactory['getOrCreateAuthBroker']>
        >;

        // Priority 1: Check x-mcp-destination header
        const destinationHeader =
          (req.headers['x-mcp-destination'] as string | undefined) ??
          (req.headers['X-MCP-Destination'] as string | undefined);

        if (destinationHeader) {
          destination = destinationHeader;
          broker =
            await this.authBrokerFactory.getOrCreateAuthBroker(destination);
        }
        // Priority 2: Check SAP connection headers (x-sap-url + auth params)
        // Headers will be passed directly to handlers, no broker needed
        else if (this.hasSapConnectionHeaders(req.headers)) {
          // No destination, no broker - create connection directly from headers
          destination = undefined;
          broker = undefined;
          server.setConnectionContextFromHeadersPublic(req.headers);
        }
        // Priority 3: Use default destination
        else if (this.defaultDestination) {
          destination = this.defaultDestination;
          // Initialize broker for the selected default destination
          broker =
            await this.authBrokerFactory.getOrCreateAuthBroker(destination);
        }
        // Priority 4: No auth params at all -> reject request
        else {
          res
            .status(400)
            .send(
              'Missing SAP connection context. Provide x-mcp-destination header, configure default destination (--mcp/--env-path), or pass x-sap-* headers.',
            );
          return;
        }

        if (destination && !broker) {
          throw new Error(
            `Auth broker not initialized for destination: ${destination}`,
          );
        }

        if (destination && broker) {
          await server.setConnectionContextPublic(destination, broker);
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode to avoid ID collisions
          enableJsonResponse: this.enableJsonResponse,
        });

        res.on('close', () => {
          void transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('[StreamableHttpServer] Error handling request:', err);
        if (!res.headersSent) {
          res.status(500).send('Internal Server Error');
        }
      }
    };
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
    const handler = this.createRequestHandler();

    // Only handle POST requests - GET SSE streams cause abort errors on disconnect
    app.post(this.path, handler);

    // Return 405 for other methods to avoid SSE stream issues
    app.all(this.path, (_req: Request, res: Response) => {
      res.status(405).send('Method Not Allowed');
    });

    console.error(
      `[StreamableHttpServer] Routes registered on external app at ${this.path}`,
    );
    console.error(
      `[StreamableHttpServer] JSON response mode: ${this.enableJsonResponse}`,
    );
    if (this.defaultDestination) {
      console.error(
        `[StreamableHttpServer] Default destination: ${this.defaultDestination}`,
      );
    }
  }

  /**
   * Get the configured endpoint path
   */
  getPath(): string {
    return this.path;
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
      const server = app.listen(this.port, this.host);
      this.standaloneServer = server;

      server.once('listening', () => {
        console.error(
          `[StreamableHttpServer] Server started on ${this.host}:${this.port}`,
        );
        console.error(
          `[StreamableHttpServer] Endpoint: http://${this.host}:${this.port}${this.path}`,
        );
        resolve();
      });
      server.once('error', reject);
    });
  }

  /**
   * Check if request has SAP connection headers
   */
  private hasSapConnectionHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const hasUrl = headers['x-sap-url'] || headers['X-SAP-URL'];
    const hasJwtAuth = headers['x-sap-jwt-token'] || headers['X-SAP-JWT-Token'];
    const hasBasicAuth =
      (headers['x-sap-login'] || headers['X-SAP-Login']) &&
      (headers['x-sap-password'] || headers['X-SAP-Password']);

    return !!(hasUrl && (hasJwtAuth || hasBasicAuth));
  }

  private createPerRequestServer(): {
    connect: BaseMcpServer['connect'];
    setConnectionContextPublic: (
      destination: string,
      broker: Awaited<ReturnType<AuthBrokerFactory['getOrCreateAuthBroker']>>,
    ) => Promise<void>;
    setConnectionContextFromHeadersPublic: (
      headers: Record<string, string | string[] | undefined>,
    ) => void;
  } {
    class PerRequestServer extends BaseMcpServer {
      constructor(
        private readonly registry: IHandlersRegistry,
        version: string,
        logger: Logger,
      ) {
        super({ name: 'mcp-abap-adt', version, logger });
        this.registerHandlers(this.registry);
      }

      public setConnectionContextPublic(
        destination: string,
        broker: Awaited<ReturnType<AuthBrokerFactory['getOrCreateAuthBroker']>>,
      ): Promise<void> {
        if (!broker) {
          return Promise.resolve();
        }
        return this.setConnectionContext(destination, broker);
      }

      public setConnectionContextFromHeadersPublic(
        headers: Record<string, string | string[] | undefined>,
      ): void {
        this.setConnectionContextFromHeaders(headers);
      }
    }
    return new PerRequestServer(
      this.handlersRegistry,
      this.version,
      this.logger,
    );
  }
}

import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import { errorClassOf } from '@mcp-abap-adt/lib/auth';
import type { TlsConfig } from '@mcp-abap-adt/lib/config';
import type {
  ConnectionContext,
  IHttpApplication,
  RouteRegistrationOptions,
} from '@mcp-abap-adt/lib/embeddable';
import {
  BaseMcpServer,
  type IBackgroundRuns,
  type LeftoverSessions,
} from '@mcp-abap-adt/lib/embeddable';
import type { IHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import {
  createServerListener,
  getProtocol,
  headerContext,
  refuseDestinationHeader,
  requestFailureAnswer,
  withDnsRebindingProtection,
} from '@mcp-abap-adt/lib/http-transport';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import {
  requestContextFromHeaders,
  runWithRequestContext,
} from '@mcp-abap-adt/lib/request-context';
import { type StateLogger, stateLoggerOf } from '@mcp-abap-adt/lib/state';
import type { Logger } from '@mcp-abap-adt/logger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { HTTP_VERSION } from './httpVersion.js';
import {
  BATCH_WITH_HANDLE_WORDS,
  BatchWithHandleError,
  handleOf,
  InstancePool,
  POOL_CLOSED_WORDS,
  type Poolable,
  PoolClosedError,
} from './InstancePool.js';

export interface StreamableHttpServerOptions {
  /**
   * The idle bound on held state, in minutes: each instance's state ends
   * after this long without a tool call. At least 30; default 30.
   */
  stateIdleMinutes?: number;
  /** Where the state's lifecycle lines go; default stderr, always on. */
  stateLogger?: StateLogger;
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
  /**
   * TLS configuration for HTTPS support
   */
  tls?: TlsConfig;
  /** Allowed Host header values (DNS-rebinding protection; exact, incl. port) */
  allowedHosts?: string[];
  /** Allowed Origin header values (DNS-rebinding protection; exact, incl. scheme) */
  allowedOrigins?: string[];
  /** Enable DNS-rebinding protection (requires allowedHosts and/or allowedOrigins) */
  enableDnsRebindingProtection?: boolean;
  /**
   * The owner of the process's runtime session files, handed to every
   * per-request instance: the SAP sessions they hold, kept until their
   * logoff is written, and the leftover-session tools. Absent: none kept,
   * the tools not available.
   */
  leftoverSessions?: LeftoverSessions;
  /**
   * Where background runs and their answers are kept, handed to every
   * instance (the launcher's `InMemoryBackgroundRuns`). Absent:
   * `background: true` is refused.
   */
  backgroundRuns?: IBackgroundRuns;
}

/** What the pool keeps of a per-request server, and what the request handler drives on it. */
interface PerRequestServerApi extends Poolable {
  connect: BaseMcpServer['connect'];
  idle(): Promise<void>;
  /** The request's own source (its `x-sap-*` headers), set on every request. */
  useConnectionContext(context: ConnectionContext): void;
}

/**
 * The Streamable HTTP server. Each HTTP POST is an MCP session of its own, on
 * a new server instance or the pooled one its `state_handle` names.
 * Credentials come only from each request's `x-sap-*` headers (D39), through
 * lib's `headerSource`: nothing is stored, shared or cached across requests,
 * except the connections held state opened (§3.8). A request without them is
 * answered `400` (`ping` excepted), and so is one carrying
 * `x-mcp-destination` — destinations are core's (stdio).
 *
 * Supports two modes:
 * 1. Standalone mode: Creates its own Express server (when no app option provided)
 * 2. Embedded mode: Registers routes on external app (when app option provided)
 */
export class StreamableHttpServer extends BaseMcpServer {
  private readonly host: string;
  private readonly port: number;
  private readonly enableJsonResponse: boolean;
  private readonly path: string;
  private readonly externalApp?: IHttpApplication;
  private readonly version: string;
  private standaloneServer?: HttpServer | HttpsServer;
  /** The listener stopped, until its last connections are closed after the last step. */
  private stoppedListener?: HttpServer | HttpsServer;
  private readonly tls?: TlsConfig;
  private readonly allowedHosts?: string[];
  private readonly allowedOrigins?: string[];
  private readonly enableDnsRebindingProtection?: boolean;
  /** The instances that hold state between requests (spec D9). */
  private readonly pool = new InstancePool<PerRequestServerApi>();
  private readonly stateIdleMinutes?: number;
  private readonly stateLogger: StateLogger;
  private readonly sessionFilesOwner: LeftoverSessions | undefined;
  private readonly backgroundRunsStore: IBackgroundRuns | undefined;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    opts?: StreamableHttpServerOptions,
  ) {
    super({
      name: 'mcp-abap-adt',
      version: opts?.version ?? HTTP_VERSION,
      logger: opts?.logger ?? noopLogger,
      // Validated by the base: a misconfiguration stops the start.
      stateIdleMinutes: opts?.stateIdleMinutes,
      // From the options as given: the silent default above is never the state's.
      stateLogger: stateLoggerOf(opts ?? {}),
    });
    this.stateIdleMinutes = opts?.stateIdleMinutes;
    this.stateLogger = stateLoggerOf(opts ?? {});
    this.sessionFilesOwner = opts?.leftoverSessions;
    this.backgroundRunsStore = opts?.backgroundRuns;
    this.version = opts?.version ?? HTTP_VERSION;
    this.host = opts?.host ?? '127.0.0.1';
    this.port = opts?.port ?? 3000;
    this.enableJsonResponse = opts?.enableJsonResponse ?? true;
    this.path = opts?.path ?? '/mcp/stream/http';
    this.externalApp = opts?.app;
    this.tls = opts?.tls;
    this.allowedHosts = opts?.allowedHosts;
    this.allowedOrigins = opts?.allowedOrigins;
    this.enableDnsRebindingProtection = opts?.enableDnsRebindingProtection;
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
      const mcpMethod = req.body?.method as string | undefined;
      const mcpId = req.body?.id;
      const toolName =
        mcpMethod === 'tools/call'
          ? (req.body?.params?.name as string | undefined)
          : undefined;
      const methodInfo = toolName
        ? `${mcpMethod} -> ${toolName}`
        : (mcpMethod ?? 'unknown');
      const isPing = mcpMethod === 'ping';
      if (!isPing) {
        console.error(
          `[StreamableHttpServer] ${req.method} ${req.path} from ${clientId} | ${methodInfo} (id=${mcpId ?? '-'})`,
        );
      }

      try {
        // A header this server no longer serves is refused, never ignored.
        refuseDestinationHeader(req.headers);
        // The request's own source, from its x-sap-* headers alone; `ping`
        // is a protocol-level check and answers without them.
        const context = isPing ? undefined : headerContext(req.headers);

        let handle: string | undefined;
        try {
          handle = handleOf(req.body);
        } catch (err) {
          if (err instanceof BatchWithHandleError) {
            res.status(400).send(BATCH_WITH_HANDLE_WORDS);
            return;
          }
          throw err;
        }

        if (!isPing) {
          console.error(
            `[StreamableHttpServer] ${methodInfo} | auth: x-sap-* headers`,
          );
        }

        await this.pool.serve(
          { handle },
          () => this.createPerRequestServer(),
          async (server) => {
            // A client that left while this request waited for the lease gets nothing.
            if (res.destroyed) return;
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: undefined, // stateless mode to avoid ID collisions
              enableJsonResponse: this.enableJsonResponse,
            });
            let transportClosed: Promise<void> | undefined;
            const closeTransport = () => {
              transportClosed ??= transport.close().catch(() => undefined);
              return transportClosed;
            };
            const disconnected = new Promise<void>((resolve) =>
              res.once('close', () => {
                void closeTransport();
                resolve();
              }),
            );
            try {
              // The request's own credentials, every time — also on a kept
              // instance: its tool calls build their connections from them.
              if (context) server.useConnectionContext(context);

              await server.connect(transport);
              // Scope what the request states — x-sap-language, x-sap-responsible,
              // x-sap-master-system — to this request's dispatch, so it cannot
              // leak into other requests/modes via a process-global cache (#110).
              const dispatch = runWithRequestContext(
                requestContextFromHeaders(req.headers),
                () => transport.handleRequest(req, res, req.body),
              );
              // JSON mode answers when the handler has; SSE mode when the stream
              // ends. A client that disconnects first must not hold the lease on
              // a dispatch that waits for a handler.
              let failed: { error: unknown } | undefined;
              await Promise.race([
                dispatch.catch((error) => {
                  failed = { error };
                }),
                disconnected,
              ]);
              // A dispatch that failed is answered below, as before the pool.
              if (failed) throw failed.error;
            } finally {
              await closeTransport();
              // The instance goes back only when its tool handlers have settled:
              // they do not consume the transport's abort signal.
              await server.idle();
            }
          },
        );
        if (!isPing) {
          console.error(
            `[StreamableHttpServer] ${methodInfo} (id=${mcpId ?? '-'}) completed`,
          );
        }
      } catch (err) {
        if (err instanceof PoolClosedError) {
          if (!res.headersSent) res.status(503).send(POOL_CLOSED_WORDS);
          return;
        }
        const answer = requestFailureAnswer(err);
        if (answer.logLine !== undefined) console.error(answer.logLine);
        if (!answer.known) {
          // No words for it: its class only — a message may quote a file (H4).
          console.error(
            `[StreamableHttpServer] ${methodInfo} (id=${mcpId ?? '-'}) FAILED: ${errorClassOf(err)}`,
          );
        } else {
          console.error(
            `[StreamableHttpServer] ${methodInfo} (id=${mcpId ?? '-'}) FAILED: ${answer.text}`,
          );
        }
        if (!res.headersSent) {
          res.status(answer.status).send(answer.text);
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

    // Health check endpoint — lightweight, no MCP protocol logic
    app.get('/mcp/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        version: this.version,
        transport: 'http',
      });
    });

    const dnsOpts = {
      enable: this.enableDnsRebindingProtection,
      allowedHosts: this.allowedHosts,
      allowedOrigins: this.allowedOrigins,
    };

    // Only handle POST requests - GET SSE streams cause abort errors on disconnect
    app.post(this.path, withDnsRebindingProtection(handler, dnsOpts) as any);

    // Return 405 for other methods to avoid SSE stream issues
    app.all(
      this.path,
      withDnsRebindingProtection((_req: Request, res: Response) => {
        res.status(405).send('Method Not Allowed');
      }, dnsOpts) as any,
    );

    console.error(
      `[StreamableHttpServer] Routes registered on external app at ${this.path}`,
    );
    console.error(
      `[StreamableHttpServer] JSON response mode: ${this.enableJsonResponse}`,
    );
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
      const protocol = getProtocol(this.tls);
      const server = createServerListener(app as any, this.tls);
      this.standaloneServer = server;

      server.listen(this.port, this.host);
      server.once('listening', () => {
        console.error(
          `[StreamableHttpServer] Server started on ${this.host}:${this.port}`,
        );
        console.error(
          `[StreamableHttpServer] Endpoint: ${protocol}://${this.host}:${this.port}${this.path}`,
        );
        resolve();
      });
      server.once('error', reject);
    });
  }

  /**
   * The shutdown's first step, in the latch's tick (spec §6.4): the pool stops
   * admitting — every later request is answered `503`.
   */
  beginShutdown(): void {
    this.pool.stopAdmitting();
  }

  /** Stops taking connections. Embedded on an external app there is no listener of its own. */
  stopListening(): void {
    const server = this.standaloneServer;
    if (server) {
      this.standaloneServer = undefined;
      this.stoppedListener = server;
      server.close();
      server.closeIdleConnections();
    }
  }

  /**
   * After the last step nothing is answered any more: the connections still
   * open on the stopped listener (a client's idle keep-alive) are closed, so
   * none keeps the process alive.
   */
  private closeLeftConnections(): void {
    this.stoppedListener?.closeAllConnections();
    this.stoppedListener = undefined;
  }

  /**
   * The shutdown's last step, after every registered tool settled (D33,
   * ruling 16): the pool's own shutdown — the requests and disposals still
   * running awaited, every held or retained instance disposed, retried once,
   * and closed with a logoff whatever its undo answered — answering one line
   * per leftover, each instance by its ordinal, never its handle.
   */
  async lastStep(): Promise<string[]> {
    const failures = await this.pool.shutdown();
    this.closeLeftConnections();
    return failures.map(
      (failure) => `[MCP] State not undone at shutdown: ${failure}`,
    );
  }

  /**
   * For a host that stops the server itself (embedded): admission stops, the
   * listener closes, then the pool's shutdown (no timer). Rejects with what
   * could not be undone. A launcher's shutdown awaits every registered tool
   * between the two (lib's `installTransportShutdown`).
   */
  async stop(): Promise<void> {
    this.beginShutdown();
    this.stopListening();
    const failures = await this.pool.shutdown();
    this.closeLeftConnections();
    if (failures.length) {
      throw new Error(`state cleanup failed: ${failures.join('; ')}`);
    }
  }

  private createPerRequestServer(): PerRequestServerApi {
    class PerRequestServer extends BaseMcpServer {
      constructor(
        private readonly registry: IHandlersRegistry,
        version: string,
        logger: Logger,
        state: {
          stateIdleMinutes?: number;
          stateLogger?: StateLogger;
          leftoverSessions?: LeftoverSessions;
          backgroundRuns?: IBackgroundRuns;
        },
      ) {
        super({ name: 'mcp-abap-adt', version, logger, ...state });
        this.registerHandlers(this.registry);
      }

      public useConnectionContext(context: ConnectionContext): void {
        this.setConnectionContext(context);
      }

      /**
       * A pooled instance ends with its state: after the idle bound's stop,
       * whatever its undo answered, every connection it owns is closed with
       * a logoff (§3.8, §6.4) — not only the state's own.
       */
      protected override idleStopped(): Promise<void> {
        return this.terminalClose();
      }
    }
    return new PerRequestServer(
      this.handlersRegistry,
      this.version,
      this.logger,
      {
        stateIdleMinutes: this.stateIdleMinutes,
        stateLogger: this.stateLogger,
        ...(this.sessionFilesOwner !== undefined && {
          leftoverSessions: this.sessionFilesOwner,
        }),
        ...(this.backgroundRunsStore !== undefined && {
          backgroundRuns: this.backgroundRunsStore,
        }),
      },
    );
  }
}

import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import { errorClassOf } from '@mcp-abap-adt/lib/auth';
import type { TlsConfig } from '@mcp-abap-adt/lib/config';
import type {
  ConnectionContext,
  IHttpApplication,
  LeftoverSessions,
  RouteRegistrationOptions,
} from '@mcp-abap-adt/lib/embeddable';
import { BaseMcpServer, closeInstance } from '@mcp-abap-adt/lib/embeddable';
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
  type RequestContext,
  requestContextFromHeaders,
  runWithRequestContext,
} from '@mcp-abap-adt/lib/request-context';
import {
  isLatched,
  parseStateIdleMinutes,
  type StateLogger,
  stateLoggerOf,
} from '@mcp-abap-adt/lib/state';
import type { Logger } from '@mcp-abap-adt/logger';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { SSE_VERSION } from './sseVersion.js';

export interface SseServerOptions {
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
   * The owner of the process's runtime session files, handed to every SSE
   * session's instance: the SAP sessions they hold, kept until their logoff
   * is written, and the leftover-session tools. Absent: none kept, the tools
   * not available.
   */
  leftoverSessions?: LeftoverSessions;
}

type SessionEntry = {
  server: BaseMcpServer;
  transport: SSEServerTransport;
  /**
   * What the session's headers state (x-sap-language, x-sap-responsible,
   * x-sap-master-system), scoped around each POST dispatch (#110).
   */
  requestContext: RequestContext;
};

/**
 * The SSE server (D48): a `GET` opens a connection and builds one
 * `BaseMcpServer` for it, whose source is that `GET`'s `x-sap-*` headers
 * (lib's `headerSource`) — one per connection, shared with no other and
 * outliving none. A `POST` is routed by its `sessionId` alone: its own
 * `x-sap-*` headers are not read. A `GET` without credentials, and a `GET` or
 * a `POST` carrying `x-mcp-destination`, are answered `400`.
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
  private readonly sessions = new Map<string, SessionEntry>();
  /**
   * Every connection from its `GET` until its close settled — being set up,
   * open, or closing — with its one cleanup (the instance close, D51): a
   * shutdown runs it for the open ones and joins the ones already closing
   * (RF7, RF8). A close that settled before the shutdown is only logged.
   */
  private readonly connections = new Map<
    BaseMcpServer,
    { sessionId: string; close: () => Promise<string[]> }
  >();
  private readonly logger: Logger;
  private readonly version: string;
  private readonly externalApp?: IHttpApplication;
  private standaloneServer?: HttpServer | HttpsServer;
  /** The listener stopped, until its last connections are closed after the last step. */
  private stoppedListener?: HttpServer | HttpsServer;
  private readonly tls?: TlsConfig;
  private readonly allowedHosts?: string[];
  private readonly allowedOrigins?: string[];
  private readonly enableDnsRebindingProtection?: boolean;
  private readonly stateIdleMinutes?: number;
  private readonly stateLogger: StateLogger;
  private readonly leftoverSessions: LeftoverSessions | undefined;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    opts?: SseServerOptions,
  ) {
    this.host = opts?.host ?? '127.0.0.1';
    this.port = opts?.port ?? 3001;
    this.ssePath = opts?.ssePath ?? '/sse';
    this.postPath = opts?.postPath ?? '/messages';
    this.logger = opts?.logger ?? noopLogger;
    this.version = opts?.version ?? SSE_VERSION;
    this.externalApp = opts?.app;
    this.tls = opts?.tls;
    this.allowedHosts = opts?.allowedHosts;
    this.allowedOrigins = opts?.allowedOrigins;
    this.enableDnsRebindingProtection = opts?.enableDnsRebindingProtection;
    // Refused here, at startup, rather than at a session's first request.
    this.stateIdleMinutes =
      opts?.stateIdleMinutes === undefined
        ? undefined
        : parseStateIdleMinutes(opts.stateIdleMinutes, 'stateIdleMinutes');
    // From the options as given: the silent default of `this.logger` is never the state's.
    this.stateLogger = stateLoggerOf(opts ?? {});
    this.leftoverSessions = opts?.leftoverSessions;
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
    // Health check endpoint — lightweight, no MCP protocol logic
    app.get('/mcp/health', ((_req: any, res: any) => {
      res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        version: this.version,
        transport: 'sse',
        activeSessions: this.sessions.size,
      });
    }) as any);

    const dnsOpts = {
      enable: this.enableDnsRebindingProtection,
      allowedHosts: this.allowedHosts,
      allowedOrigins: this.allowedOrigins,
    };

    app.get(
      this.ssePath,
      withDnsRebindingProtection(
        (async (req: any, res: any) => {
          await this.handleGet(req, res);
        }) as any,
        dnsOpts,
      ) as any,
    );

    app.post(
      this.postPath,
      withDnsRebindingProtection(
        (async (req: any, res: any) => {
          const url = new URL(req.originalUrl, `http://${req.headers.host}`);
          await this.handlePost(req, res, url);
        }) as any,
        dnsOpts,
      ) as any,
    );

    console.error(`[SseServer] Routes registered on external app`);
    console.error(`[SseServer] SSE endpoint: ${this.ssePath}`);
    console.error(`[SseServer] POST endpoint: ${this.postPath}`);
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
      const protocol = getProtocol(this.tls);
      const server = createServerListener(app as any, this.tls);
      this.standaloneServer = server;

      server.listen(this.port, this.host);
      server.once('listening', () => {
        console.error(
          `[SseServer] Server started on ${this.host}:${this.port}`,
        );
        console.error(
          `[SseServer] SSE endpoint: ${protocol}://${this.host}:${this.port}${this.ssePath}`,
        );
        console.error(
          `[SseServer] POST endpoint: ${protocol}://${this.host}:${this.port}${this.postPath}`,
        );
        resolve();
      });
      server.once('error', reject);
    });
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
   * D51): the instance close of every connection — run for the open ones,
   * joined for those already closing — each ending its stream, its
   * connections closed with a logoff whatever its undo answered. Answers one
   * line per leftover. No timer.
   */
  async lastStep(): Promise<string[]> {
    const failures = await this.closeAll();
    this.closeLeftConnections();
    return failures.map(
      (failure) => `[MCP] State not undone at shutdown: ${failure}`,
    );
  }

  /**
   * For a host that stops the server itself (embedded): the listener
   * closes, then every connection's instance close (no timer). Rejects with
   * what could not be undone. A launcher's shutdown awaits every registered
   * tool between the two (lib's `installTransportShutdown`).
   */
  async stop(): Promise<void> {
    this.stopListening();
    const failures = await this.closeAll();
    this.closeLeftConnections();
    if (failures.length) {
      throw new Error(`state cleanup failed: ${failures.join('; ')}`);
    }
  }

  /** The instance close of every connection, joined where one runs already. */
  private async closeAll(): Promise<string[]> {
    const closes = [...this.connections.values()].map((c) => c.close());
    return (await Promise.all(closes)).flat();
  }

  private async handleGet(req: any, res: any): Promise<void> {
    // The shutdown began: no new connection (embedded hosts keep their
    // listener; a launcher's is closed already).
    if (isLatched()) {
      if (!res.headersSent)
        res.writeHead(503).end('the server is shutting down');
      return;
    }
    // The connection's source, from this GET's x-sap-* headers alone; a
    // header this server no longer serves is refused, never ignored.
    let context: ConnectionContext;
    try {
      context = headerContext(req.headers);
    } catch (error) {
      this.answerFailure(res, error);
      return;
    }

    this.logger.debug('SSE GET: credentials from x-sap-* headers');

    class SessionServer extends BaseMcpServer {
      constructor(
        private readonly registry: IHandlersRegistry,
        readonly loggerImpl: Logger,
        readonly ver: string,
        state: {
          stateIdleMinutes?: number;
          stateLogger?: StateLogger;
          leftoverSessions?: LeftoverSessions;
        },
      ) {
        super({
          name: 'mcp-abap-adt-sse',
          version: ver,
          logger: loggerImpl,
          ...state,
        });
      }

      init(connectionContext: ConnectionContext) {
        this.setConnectionContext(connectionContext);
        this.registerHandlers(this.registry);
      }
    }

    const server = new SessionServer(
      this.handlersRegistry,
      this.logger,
      this.version,
      {
        stateIdleMinutes: this.stateIdleMinutes,
        stateLogger: this.stateLogger,
        ...(this.leftoverSessions !== undefined && {
          leftoverSessions: this.leftoverSessions,
        }),
      },
    );
    server.init(context);

    const transport = new SSEServerTransport(this.postPath, res);
    const sessionId = transport.sessionId;

    console.error(`[SSE GET] Created session ${sessionId}`);
    // Capture what the session states (x-sap-language, x-sap-responsible,
    // x-sap-master-system) once at connection time; it is scoped around each
    // POST dispatch below so it never leaks into other sessions via a
    // process-global cache (#110).
    const requestContext = requestContextFromHeaders(req.headers);

    // The close tracking comes first, before the first setup await (D51,
    // RF8): the response's close, the stream's failure and a rejected
    // connect all reach this one cleanup — the instance close, once.
    let cleanup: Promise<string[]> | undefined;
    const close = (): Promise<string[]> => {
      cleanup ??= this.closeConnection(sessionId, server);
      return cleanup;
    };
    this.connections.set(server, { sessionId, close });
    res.on('close', () => {
      console.error(`[SSE CLOSE] Connection closed for session ${sessionId}`);
      void close();
    });
    res.on('error', () => {
      void close();
    });

    try {
      await server.connect(transport);
      this.logger.debug(`SSE GET: server connected for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `SSE GET: failed to connect for session ${sessionId}: ${this.failureWords(error)}`,
      );
      if (!res.headersSent) {
        res.writeHead(500).end('Internal Server Error');
      }
      void close();
      return;
    }

    // An instance whose connection closed during setup is never published.
    if (cleanup !== undefined) return;
    this.sessions.set(sessionId, { server, transport, requestContext });
    console.error(
      `[SSE GET] Session stored, total sessions: ${this.sessions.size}`,
    );
  }

  /**
   * One connection's cleanup (D51): the session leaves the routing map first
   * (main's: a later `POST` for it is an unknown session), then the instance
   * close — the instance latch in this tick, its tools awaited (none
   * aborted), its state undone, its connections closed with a logoff
   * whatever the undo answered, its MCP server and stream closed. What the
   * undo left is written on the state logger and answered.
   */
  private async closeConnection(
    sessionId: string,
    server: BaseMcpServer,
  ): Promise<string[]> {
    if (this.sessions.get(sessionId)?.server === server) {
      this.sessions.delete(sessionId);
    }
    try {
      const left = await closeInstance(server);
      if (left.length) {
        // The state's line: always written (stderr unless an embedder chose a logger).
        this.stateLogger.error(
          `[SSE CLOSE] state cleanup for session ${sessionId} left: ${left.join('; ')}`,
        );
      }
      return left.map((l) => `${sessionId}: ${l}`);
    } finally {
      this.connections.delete(server);
    }
  }

  private async handlePost(req: any, res: any, url?: URL): Promise<void> {
    // A header this server no longer serves is refused on a POST too; the
    // POST's own x-sap-* headers are not read (the connection's are its GET's).
    try {
      refuseDestinationHeader(req.headers);
    } catch (error) {
      this.answerFailure(res, error);
      return;
    }

    const sessionId = (url?.searchParams.get('sessionId') ||
      req.headers['x-session-id'] ||
      '') as string;

    const mcpMethod = req.body?.method as string | undefined;
    const isPing = mcpMethod === 'ping';

    if (!isPing) {
      console.error(
        `[SSE POST] sessionId=${sessionId}, activeSessions=${this.sessions.size}, keys=[${Array.from(this.sessions.keys()).join(', ')}]`,
      );
    }

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
    if (!isPing) {
      console.error(
        `[SSE POST] Calling handlePostMessage with req.body for session ${sessionId}`,
      );
    }

    try {
      await runWithRequestContext({ ...entry.requestContext }, () =>
        entry.transport.handlePostMessage(req, res, req.body),
      );
      if (!isPing) {
        console.error(
          `[SSE POST] Successfully processed for session ${sessionId}`,
        );
      }
    } catch (error) {
      // Fixed words and what the reader makes of it — never its message (§9).
      console.error(
        `[SSE POST] FAILED for session ${sessionId}: ${this.failureWords(error)}`,
      );
      if (!res.headersSent) {
        res.writeHead(500).end('Internal Server Error');
      }
    }
  }

  /**
   * What a log line says of a thrown value: `logFields` of the failure the
   * reader knows, else its class only — a message may quote a file (H4).
   */
  private failureWords(error: unknown): string {
    const answer = requestFailureAnswer(error);
    return answer.logLine ?? errorClassOf(error);
  }

  /** A request refused or failed: the refusal's words (400), the reader's, or as before. */
  private answerFailure(res: any, error: unknown): void {
    const answer = requestFailureAnswer(error);
    if (answer.logLine !== undefined) console.error(answer.logLine);
    if (answer.known) {
      console.error(`[SSE] FAILED: ${answer.text}`);
    } else {
      // No words for it: its class only — a message may quote a file (H4).
      console.error(`[SSE] FAILED: ${errorClassOf(error)}`);
    }
    if (!res.headersSent) {
      res.status(answer.status).send(answer.text);
    }
  }
}

import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { IAccessChecks } from '@mcp-abap-adt/lib';
import { errorClassOf } from '@mcp-abap-adt/lib/auth';
import type { TlsConfig } from '@mcp-abap-adt/lib/config';
import type {
  ConnectionContext,
  IBackgroundRuns,
  IHttpApplication,
  LineMatchStrategy,
  RouteRegistrationOptions,
  SapAnswerStrategy,
} from '@mcp-abap-adt/lib/embeddable';
import {
  AdtHeaderPairs,
  BackgroundRunOwner,
  BaseMcpServer,
  closeInstance,
  InstanceBatch,
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
  defaultSystemContextResolver,
  type RequestContext,
  requestContextFromHeaders,
  runWithRequestContext,
} from '@mcp-abap-adt/lib/request-context';
import {
  HeldLocks,
  isLatched,
  type StateLogger,
  stateIdleMinutesOf,
  stateLoggerOf,
} from '@mcp-abap-adt/lib/state';
import { child } from '@mcp-abap-adt/lib/utils';
import type { Logger } from '@mcp-abap-adt/logger';
import { responsibleRules } from '@mcp-abap-adt/responsible-rules';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express, { type Request, type Response } from 'express';
import { RUNTIME_VERSION } from '../runtimeVersion.js';
import { SdkTransport } from '../sdkTransport.js';

export interface SseServerOptions {
  /**
   * The idle bound on held state, in minutes: each instance's state ends
   * after this long without a tool call. At least 30; default 30.
   */
  stateIdleMinutes?: number | undefined;
  /** Where the state's lifecycle lines go; default stderr, always on. */
  stateLogger?: StateLogger | undefined;
  /**
   * Batch mode: each SSE connection's instance gets an `InstanceBatch` of
   * its own, created with these settings (the launcher's). Absent: no
   * instance has one, and the batch tools answer `batch_mode_unavailable`.
   */
  batch?: { keepRawParts: boolean };
  /**
   * Host to bind to (only used when no external app is provided)
   * @default "127.0.0.1"
   */
  host?: string | undefined;
  /**
   * Port to listen on (only used when no external app is provided)
   * @default 3001
   */
  port?: number | undefined;
  /**
   * Path for SSE GET endpoint
   * @default "/sse"
   */
  ssePath?: string | undefined;
  /**
   * Path for POST messages endpoint
   * @default "/messages"
   */
  postPath?: string | undefined;
  /**
   * Logger instance
   */
  logger?: Logger | undefined;
  /**
   * Server version
   */
  version?: string | undefined;
  /**
   * External HTTP application to register routes on
   * When provided, start() will only register routes without creating a server
   * This enables integration with existing Express/CDS/CAP servers
   */
  app?: IHttpApplication | undefined;
  /**
   * TLS configuration for HTTPS support
   */
  tls?: TlsConfig | undefined;
  /** Allowed Host header values (DNS-rebinding protection; exact, incl. port) */
  allowedHosts?: string[] | undefined;
  /** Allowed Origin header values (DNS-rebinding protection; exact, incl. scheme) */
  allowedOrigins?: string[] | undefined;
  /** Enable DNS-rebinding protection (requires allowedHosts and/or allowedOrigins) */
  enableDnsRebindingProtection?: boolean | undefined;
  /**
   * Where background runs and their answers are kept, handed to every
   * instance (the launcher's `InMemoryBackgroundRuns` of
   * `@mcp-abap-adt/background-runs-memory`). Absent:
   * `background: true` is refused.
   */
  backgroundRuns?: IBackgroundRuns | undefined;
  /**
   * The access checks every call of this server is checked by (spec
   * §3.2); one strategy for every instance it makes. Absent: none.
   */
  accessChecks?: IAccessChecks | undefined;
  /**
   * `SearchSource`'s SAP-answer strategy, handed to every instance (the
   * launcher's: the shipped `skipSapAnswers`). Absent: the handler's default.
   */
  sapAnswerStrategy?: SapAnswerStrategy | undefined;
  /**
   * `SearchSource`'s line-match strategy, handed to every instance (the
   * launcher's: the shipped `substringLineMatch`). Absent: the handler's default.
   */
  lineMatchStrategy?: LineMatchStrategy | undefined;
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
 * The SSE server: a `GET` opens a connection and builds one
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
   * open, or closing — with its one cleanup (the instance close): a
   * shutdown runs it for the open ones and joins the ones already closing
   * A close that settled before the shutdown is only logged.
   */
  private readonly connections = new Map<
    BaseMcpServer,
    { sessionId: string; close: () => Promise<void> }
  >();
  private readonly logger: Logger;
  private readonly version: string;
  private readonly externalApp?: IHttpApplication | undefined;
  private standaloneServer?: HttpServer | HttpsServer | undefined;
  /** The listener stopped, until its last connections are closed after the last step. */
  private stoppedListener?: HttpServer | HttpsServer | undefined;
  private readonly tls?: TlsConfig | undefined;
  private readonly allowedHosts?: string[] | undefined;
  private readonly allowedOrigins?: string[] | undefined;
  private readonly enableDnsRebindingProtection?: boolean | undefined;
  private readonly stateIdleMinutes?: number | undefined;
  private readonly stateLogger: StateLogger;
  private readonly backgroundRuns: IBackgroundRuns | undefined;
  private readonly accessChecks: IAccessChecks | undefined;
  private readonly sapAnswerStrategy: SapAnswerStrategy | undefined;
  private readonly lineMatchStrategy: LineMatchStrategy | undefined;
  /** The running background runs' owner: this server's, shared by every stream's instance. */
  private readonly runOwner = new BackgroundRunOwner();
  private readonly batchSettings: { keepRawParts: boolean } | undefined;
  /** The corrected header pairs: the process's, shared by every stream's instance. */
  private readonly adtHeaderPairs = new AdtHeaderPairs();

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    opts?: SseServerOptions,
  ) {
    this.host = opts?.host ?? '127.0.0.1';
    this.port = opts?.port ?? 3001;
    this.ssePath = opts?.ssePath ?? '/sse';
    this.postPath = opts?.postPath ?? '/messages';
    this.logger = opts?.logger ?? noopLogger;
    this.version = opts?.version ?? RUNTIME_VERSION;
    this.externalApp = opts?.app;
    this.tls = opts?.tls;
    this.allowedHosts = opts?.allowedHosts;
    this.allowedOrigins = opts?.allowedOrigins;
    this.enableDnsRebindingProtection = opts?.enableDnsRebindingProtection;
    // Refused here, at startup, rather than at a session's first request.
    this.stateIdleMinutes =
      opts?.stateIdleMinutes === undefined
        ? undefined
        : stateIdleMinutesOf(opts.stateIdleMinutes, 'stateIdleMinutes');
    // From the options as given: the silent default of `this.logger` is never the state's.
    this.stateLogger = stateLoggerOf(opts ?? {});
    this.backgroundRuns = opts?.backgroundRuns;
    this.accessChecks = opts?.accessChecks;
    this.sapAnswerStrategy = opts?.sapAnswerStrategy;
    this.lineMatchStrategy = opts?.lineMatchStrategy;
    this.batchSettings =
      opts?.batch === undefined
        ? undefined
        : { keepRawParts: opts.batch.keepRawParts === true };
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
    app.get('/mcp/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        version: this.version,
        transport: 'sse',
        activeSessions: this.sessions.size,
      });
    });

    const dnsOpts = {
      enable: this.enableDnsRebindingProtection,
      allowedHosts: this.allowedHosts,
      allowedOrigins: this.allowedOrigins,
    };

    app.get(
      this.ssePath,
      withDnsRebindingProtection(async (req: Request, res: Response) => {
        await this.handleGet(req, res);
      }, dnsOpts),
    );

    app.post(
      this.postPath,
      withDnsRebindingProtection(async (req: Request, res: Response) => {
        const url = new URL(req.originalUrl, `http://${req.headers.host}`);
        await this.handlePost(req, res, url);
      }, dnsOpts),
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

    this.registerRoutes(app);

    await new Promise<void>((resolve, reject) => {
      const protocol = getProtocol(this.tls);
      const server = createServerListener(app, this.tls);
      this.standaloneServer = server;

      server.listen(this.port, this.host);
      server.once('listening', () => {
        // The port bound, not the one configured: 0 is the system's choice.
        const port = this.listeningPort() ?? this.port;
        console.error(`[SseServer] Server started on ${this.host}:${port}`);
        console.error(
          `[SseServer] SSE endpoint: ${protocol}://${this.host}:${port}${this.ssePath}`,
        );
        console.error(
          `[SseServer] POST endpoint: ${protocol}://${this.host}:${port}${this.postPath}`,
        );
        resolve();
      });
      server.once('error', (error: Error) => reject(error));
    });
  }

  /**
   * The port the standalone listener is bound to — the system's choice when
   * the configured port is 0 — while it listens; undefined before the start,
   * after the stop and on an external app.
   */
  listeningPort(): number | undefined {
    const address = this.standaloneServer?.address();
    return address !== null && typeof address === 'object'
      ? address.port
      : undefined;
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
   * The launcher's shutdown, after the logoffs (lib's
   * `installTransportShutdown`), and `stop()`: nothing is answered any more —
   * the connections still open on the stopped listener (a request whose tool
   * was interrupted, a client's idle keep-alive) are closed, so none keeps
   * the process alive.
   */
  releaseConnections(): void {
    this.stoppedListener?.closeAllConnections();
    this.stoppedListener = undefined;
  }

  /**
   * For a host that stops the server itself (embedded): the listener
   * closes, then every connection's instance close — its connections logged
   * off at once, its calls interrupted (no tool awaited, no timer). A
   * launcher's shutdown does not run this: it logs every connection the
   * process owns off at once and interrupts every running tool (lib's
   * `installTransportShutdown`).
   */
  async stop(): Promise<void> {
    this.stopListening();
    await this.closeAll();
    this.releaseConnections();
  }

  /** The instance close of every connection, joined where one runs already. */
  private async closeAll(): Promise<void> {
    await Promise.all([...this.connections.values()].map((c) => c.close()));
  }

  private async handleGet(req: Request, res: Response): Promise<void> {
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
          stateIdleMinutes?: number | undefined;
          stateLogger?: StateLogger;
          backgroundRuns?: IBackgroundRuns;
          accessChecks?: IAccessChecks;
          backgroundRunOwner?: BackgroundRunOwner;
          sapAnswerStrategy?: SapAnswerStrategy;
          lineMatchStrategy?: LineMatchStrategy;
          batch?: InstanceBatch;
          heldLocks: HeldLocks;
          adtHeaderPairs?: AdtHeaderPairs;
        },
      ) {
        super({
          name: 'mcp-abap-adt-sse',
          version: ver,
          logger: loggerImpl,
          ...state,
          // The responsible rules, once per stream, when its connection is
          // created.
          systemContextResolver: defaultSystemContextResolver,
          systemContextRules: responsibleRules,
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
        ...(this.sapAnswerStrategy !== undefined && {
          sapAnswerStrategy: this.sapAnswerStrategy,
        }),
        ...(this.lineMatchStrategy !== undefined && {
          lineMatchStrategy: this.lineMatchStrategy,
        }),
        ...(this.accessChecks !== undefined && {
          accessChecks: this.accessChecks,
        }),
        ...(this.backgroundRuns !== undefined && {
          backgroundRuns: this.backgroundRuns,
          // The running runs' owner is this server's, shared by every
          // instance it makes: a discard reaching any of them cancels.
          backgroundRunOwner: this.runOwner,
        }),
        // Batch mode: this connection's own, never shared with another.
        ...(this.batchSettings !== undefined && {
          batch: new InstanceBatch(this.batchSettings),
        }),
        // The locks this connection's instance took: a write, a delete or
        // an unlock under a lock_handle is sent only under one it holds.
        heldLocks: new HeldLocks(),
        adtHeaderPairs: this.adtHeaderPairs,
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

    // The close tracking comes first, before the first setup await: the response's close, the stream's failure and a rejected
    // connect all reach this one cleanup — the instance close, once.
    let cleanup: Promise<void> | undefined;
    const close = (): Promise<void> => {
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
      await server.connect(new SdkTransport(transport));
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
   * One connection's cleanup — the client closed its stream, as a
   * stdio client closes stdin: the session leaves the routing map first
   * (main's: a later `POST` for it is an unknown session), then the instance
   * close — the instance latch, its connections logged off at once and its
   * running and queued calls interrupted in the same tick (no tool awaited),
   * its state let go, its MCP server and stream closed.
   */
  private async closeConnection(
    sessionId: string,
    server: BaseMcpServer,
  ): Promise<void> {
    if (this.sessions.get(sessionId)?.server === server) {
      this.sessions.delete(sessionId);
    }
    try {
      await closeInstance(server);
    } finally {
      this.connections.delete(server);
    }
  }

  private async handlePost(
    req: Request,
    res: Response,
    url?: URL,
  ): Promise<void> {
    // A header this server no longer serves is refused on a POST too; the
    // POST's own x-sap-* headers are not read (the connection's are its GET's).
    try {
      refuseDestinationHeader(req.headers);
    } catch (error) {
      this.answerFailure(res, error);
      return;
    }

    const header = req.headers['x-session-id'];
    const sessionId =
      url?.searchParams.get('sessionId') ||
      (typeof header === 'string' ? header : undefined) ||
      '';

    const body: unknown = req.body;
    const isPing = child(body, 'method') === 'ping';

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
      // Fixed words and what the reader makes of it — never its message.
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
   * reader knows, else its class only — a message may quote a file.
   */
  private failureWords(error: unknown): string {
    const answer = requestFailureAnswer(error);
    return answer.logLine ?? errorClassOf(error);
  }

  /** A request refused or failed: the refusal's words (400), the reader's, or as before. */
  private answerFailure(res: Response, error: unknown): void {
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

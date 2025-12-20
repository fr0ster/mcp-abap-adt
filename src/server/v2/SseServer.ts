import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Logger } from "@mcp-abap-adt/logger";
import { noopLogger } from "../../lib/handlerLogger.js";
import { BaseMcpServer } from "./BaseMcpServer.js";
import { IHandlersRegistry } from "../../lib/handlers/interfaces.js";
import { AuthBrokerFactory } from "../../lib/auth/index.js";
const DEFAULT_VERSION = process.env.npm_package_version ?? "1.0.0";

export interface SseServerOptions {
  host?: string;
  port?: number;
  ssePath?: string;
  postPath?: string;
  defaultDestination?: string;
  logger?: Logger;
  version?: string;
}

type SessionEntry = {
  server: BaseMcpServer;
  transport: SSEServerTransport;
};

/**
 * Minimal SSE server: creates a new BaseMcpServer per GET connection, routes POST by sessionId.
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

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly authBrokerFactory: AuthBrokerFactory,
    opts?: SseServerOptions
  ) {
    this.host = opts?.host ?? "127.0.0.1";
    this.port = opts?.port ?? 3001;
    this.ssePath = opts?.ssePath ?? "/sse";
    this.postPath = opts?.postPath ?? "/messages";
    this.defaultDestination = opts?.defaultDestination;
    this.logger = opts?.logger ?? noopLogger;
    this.version = opts?.version ?? DEFAULT_VERSION;
  }

  async start(): Promise<void> {
    const app = express();
    app.use(express.json());

    app.get(this.ssePath, async (req, res) => {
      await this.handleGet(req, res);
    });

    app.post(this.postPath, async (req, res) => {
      const url = new URL(req.originalUrl, `http://${req.headers.host}`);
      await this.handlePost(req, res, url);
    });

    await new Promise<void>((resolve, reject) => {
      const srv = app
        .listen(this.port, this.host, () => resolve())
        .on("error", reject);
    });
  }

  private async handleGet(req: any, res: any): Promise<void> {
    let destination: string | undefined;
    let broker: any = undefined;

    // Priority 1: Check x-mcp-destination header
    const destinationHeader =
      (req.headers["x-mcp-destination"] as string | undefined) ??
      (req.headers["X-MCP-Destination"] as string | undefined);

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
      constructor(private readonly registry: IHandlersRegistry, private readonly loggerImpl: Logger, private readonly ver: string) {
        super({ name: "mcp-abap-adt-sse", version: ver, logger: loggerImpl });
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

    const server = new SessionServer(this.handlersRegistry, this.logger, this.version);
    await server.init(destination, broker, this.hasSapConnectionHeaders(req.headers) ? req.headers : undefined);

    const transport = new SSEServerTransport(this.postPath, res);
    const sessionId = transport.sessionId;

    console.error(`[SSE GET] Created session ${sessionId} for destination ${destination}`);
    this.sessions.set(sessionId, { server, transport });
    console.error(`[SSE GET] Session stored, total sessions: ${this.sessions.size}`);

    // Connect transport to server BEFORE registering close handler
    // This ensures connection is established before any cleanup can happen
    try {
      await server.connect(transport);
      this.logger.debug(`SSE GET: server connected for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`SSE GET: failed to connect for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      this.sessions.delete(sessionId);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal Server Error");
      }
      return;
    }

    // Register cleanup handler AFTER successful connection
    res.on("close", () => {
      console.error(`[SSE CLOSE] Connection closed for session ${sessionId}`);
      this.sessions.delete(sessionId);
      void transport.close();
      void server.close();
    });
  }

  private async handlePost(req: any, res: any, url?: URL): Promise<void> {
    const sessionId = (url?.searchParams.get("sessionId") || req.headers["x-session-id"] || "") as string;

    console.error(`[SSE POST] sessionId=${sessionId}, activeSessions=${this.sessions.size}, keys=[${Array.from(this.sessions.keys()).join(', ')}]`);

    const entry = this.sessions.get(sessionId);
    if (!entry) {
      console.error(`[SSE POST] Invalid session ${sessionId} - session not found!`);
      res.writeHead(400).end("Invalid session");
      return;
    }

    // Pass pre-parsed body from express.json() middleware (like reference implementation)
    // express.json() already read and parsed the body into req.body
    console.error(`[SSE POST] Calling handlePostMessage with req.body for session ${sessionId}`);

    try {
      await entry.transport.handlePostMessage(req, res, req.body);
      console.error(`[SSE POST] Successfully processed for session ${sessionId}`);
    } catch (error) {
      console.error(`[SSE POST] FAILED for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[SSE POST] Error stack:`, error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal Server Error");
      }
    }
  }

  /**
   * Check if request has SAP connection headers
   */
  private hasSapConnectionHeaders(headers: any): boolean {
    const hasUrl = headers["x-sap-url"] || headers["X-SAP-URL"];
    const hasJwtAuth = headers["x-sap-jwt-token"] || headers["X-SAP-JWT-Token"];
    const hasBasicAuth =
      (headers["x-sap-login"] || headers["X-SAP-Login"]) &&
      (headers["x-sap-password"] || headers["X-SAP-Password"]);

    return !!(hasUrl && (hasJwtAuth || hasBasicAuth));
  }
}

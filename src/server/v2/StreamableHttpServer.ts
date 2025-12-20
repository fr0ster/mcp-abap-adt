import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "@mcp-abap-adt/logger";
import { noopLogger } from "../../lib/handlerLogger.js";
import { BaseMcpServer } from "./BaseMcpServer.js";
import { IHandlersRegistry } from "../../lib/handlers/interfaces.js";
import { AuthBrokerFactory } from "../../lib/auth/index.js";
const DEFAULT_VERSION = process.env.npm_package_version ?? "1.0.0";

export interface StreamableHttpServerOptions {
  host?: string;
  port?: number;
  enableJsonResponse?: boolean;
  defaultDestination?: string;
  path?: string;
  logger?: Logger;
  version?: string;
}

/**
 * Minimal Streamable HTTP server implementation.
 * Creates new transport for each HTTP POST and forwards request to the MCP server.
 * Destination is taken from x-mcp-destination header or defaultDestination.
 */
export class StreamableHttpServer extends BaseMcpServer {
  private readonly host: string;
  private readonly port: number;
  private readonly enableJsonResponse: boolean;
  private readonly defaultDestination?: string;
  private readonly path: string;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly authBrokerFactory: AuthBrokerFactory,
    opts?: StreamableHttpServerOptions
  ) {
    super({
      name: "mcp-abap-adt",
      version: opts?.version ?? DEFAULT_VERSION,
      logger: opts?.logger ?? noopLogger,
    });
    this.host = opts?.host ?? "127.0.0.1";
    this.port = opts?.port ?? 3000;
    this.enableJsonResponse = opts?.enableJsonResponse ?? true;
    this.defaultDestination = opts?.defaultDestination;
    this.path = opts?.path ?? "/mcp/stream/http";
    // Register handlers once for shared MCP server
    this.registerHandlers(this.handlersRegistry);
  }

  async start(): Promise<void> {
    const app = express();
    app.use(express.json());

    const handle = async (req: Request, res: Response) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      console.error(`[StreamableHttpServer] ${req.method} ${req.path} from ${clientId}`);

      try {
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
          // No destination, no broker - create connection directly from headers
          destination = undefined;
          broker = undefined;
          this.setConnectionContextFromHeaders(req.headers);
        }
        // Priority 3: Use default destination
        else if (this.defaultDestination) {
          destination = this.defaultDestination;
          broker = await this.authBrokerFactory.getOrCreateAuthBroker(destination);
        }
        // Priority 4: No auth params at all
        // Allow request to proceed - metadata methods (tools/list, etc.) will work
        // tools/call will fail with appropriate error in handler

        // Set connection context only if we have destination or broker
        if (destination && broker) {
          await this.setConnectionContext(destination, broker);
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode to avoid ID collisions
          enableJsonResponse: this.enableJsonResponse,
        });

        res.on("close", () => {
          void transport.close();
        });

        await this.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error("[StreamableHttpServer] Error handling request:", err);
        if (!res.headersSent) {
          res.status(500).send("Internal Server Error");
        }
      }
    };

    // Only handle POST requests - GET SSE streams cause abort errors on disconnect
    app.post(this.path, handle);

    // Return 405 for other methods to avoid SSE stream issues
    app.all(this.path, (req, res) => {
      res.status(405).send("Method Not Allowed");
    });

    await new Promise<void>((resolve, reject) => {
      const srv = app
        .listen(this.port, this.host, () => {
          console.error(`[StreamableHttpServer] Server started on ${this.host}:${this.port}`);
          console.error(`[StreamableHttpServer] Endpoint: http://${this.host}:${this.port}${this.path}`);
          console.error(`[StreamableHttpServer] JSON response mode: ${this.enableJsonResponse}`);
          if (this.defaultDestination) {
            console.error(`[StreamableHttpServer] Default destination: ${this.defaultDestination}`);
          }
          resolve();
        })
        .on("error", reject);
    });
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

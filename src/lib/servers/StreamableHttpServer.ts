import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "@mcp-abap-adt/logger";
import { noopLogger } from "../handlerLogger.js";
import { BaseMcpServer } from "./BaseMcpServer.js";
import { IHandlersRegistry } from "./handlers/interfaces.js";
import { AuthBrokerFactory } from "../authBrokerFactory.js";
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
 * Для кожного HTTP POST створюємо новий транспорт і прокидуємо запит у вже створений MCP сервер.
 * Destination береться з header `x-mcp-destination` або з defaultDestination, інакше 400.
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
    this.enableJsonResponse = opts?.enableJsonResponse ?? false;
    this.defaultDestination = opts?.defaultDestination;
    this.path = opts?.path ?? "/";
    // Регіструємо хендлери один раз для спільного MCP сервера
    this.registerHandlers(this.handlersRegistry);
  }

  async start(): Promise<void> {
    const app = express();
    app.use(express.json());

    const handle = async (req: Request, res: Response) => {
      const destinationHeader =
        (req.headers["x-mcp-destination"] as string | undefined) ??
        (req.headers["X-MCP-Destination"] as string | undefined);
      const destination = destinationHeader || this.defaultDestination;

      if (!destination) {
        res.status(400).send("Destination not provided");
        return;
      }

      try {
        const broker = await this.authBrokerFactory.getOrCreateAuthBroker(destination);
        if (!broker) {
          res.status(400).send("Auth broker not available");
          return;
        }

        await this.setConnectionContext(destination, broker);

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
        res.status(500).send("Internal Server Error");
      }
    };

    app.get(this.path, handle);
    app.post(this.path, handle);

    await new Promise<void>((resolve, reject) => {
      const srv = app
        .listen(this.port, this.host, () => resolve())
        .on("error", reject);
    });
  }

}

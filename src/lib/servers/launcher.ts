import { CompositeHandlersRegistry } from "./handlers/registry/CompositeHandlersRegistry.js";
import {
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
} from "./handlers/groups/index.js";
import { StdioServer } from "./StdioServer.js";
import { StreamableHttpServer } from "./StreamableHttpServer.js";
import { SseServer } from "./SseServer.js";
import { AuthBrokerFactory } from "../authBrokerFactory.js";
import type { HandlerContext } from "../handlers/interfaces.js";

const stderrLogger = {
  info: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.error(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => console.error(...args),
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const loggerForTransport = process.env.DEBUG_AUTH_LOG === "true" ? stderrLogger : silentLogger;

type Transport = "stdio" | "sse" | "http";

function getArgValue(name: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    if (arg === name && i + 1 < args.length) return args[i + 1];
  }
  return undefined;
}

function parseTransport(): Transport {
  const value = getArgValue("--transport");
  if (value === "sse") return "sse";
  if (value === "http" || value === "streamable-http") return "http";
  return "stdio";
}

async function main() {
  const transport = parseTransport();
  const destination = getArgValue("--mcp");
  const host = getArgValue("--host") ?? "127.0.0.1";
  const portRaw = getArgValue("--port");
  const port = portRaw ? Number.parseInt(portRaw, 10) : transport === "http" ? 3000 : 3001;
  const enableJsonResponse = getArgValue("--http-json-response") === "true";
  const authBrokerPath = getArgValue("--auth-broker-path");

  const baseContext = { connection: undefined as any, logger: undefined } satisfies HandlerContext;
  const handlersRegistry = new CompositeHandlersRegistry([
    // SystemHandlersGroup duplicates some readonly tools (e.g., GetTypeInfo), so it's omitted here
    new ReadOnlyHandlersGroup(baseContext),
    new HighLevelHandlersGroup(baseContext),
    new LowLevelHandlersGroup(baseContext),
    new SearchHandlersGroup(baseContext),
  ]);

  const authBrokerFactory = new AuthBrokerFactory({
    defaultMcpDestination: destination,
    defaultDestination: destination,
    envFilePath: undefined,
    authBrokerPath,
    unsafe: false,
    transportType: transport,
    useAuthBroker: true,
    logger: loggerForTransport,
  });

  if (transport === "stdio") {
    if (!destination) {
      throw new Error("stdio requires --mcp=<destination>");
    }
    const broker = await authBrokerFactory.getOrCreateAuthBroker(destination);
    if (!broker) {
      throw new Error(`Auth broker not available for destination ${destination}`);
    }
    const server = new StdioServer(handlersRegistry, broker, { logger: loggerForTransport });
    await server.start(destination);
    return;
  }

  if (transport === "sse") {
    const server = new SseServer(handlersRegistry, authBrokerFactory, {
      host,
      port,
      defaultDestination: destination,
      logger: loggerForTransport,
    });
    await server.start();
    return;
  }

  // http
  const server = new StreamableHttpServer(handlersRegistry, authBrokerFactory, {
    host,
    port,
    enableJsonResponse,
    defaultDestination: destination,
    logger: loggerForTransport,
  });
  await server.start();
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[MCP] launcher failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

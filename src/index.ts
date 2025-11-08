#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import dotenv from "dotenv";
import { createServer, Server as HttpServer } from "http";
import { randomUUID } from "crypto";

// Import handler functions
import { handleGetProgram } from "./handlers/handleGetProgram";
import { handleGetClass } from "./handlers/handleGetClass";
import { handleGetFunctionGroup } from "./handlers/handleGetFunctionGroup";
import { handleGetFunction } from "./handlers/handleGetFunction";
import { handleGetTable } from "./handlers/handleGetTable";
import { handleGetStructure } from "./handlers/handleGetStructure";
import { handleGetTableContents } from "./handlers/handleGetTableContents";
import { handleGetPackage } from "./handlers/handleGetPackage";
import { handleGetInclude } from "./handlers/handleGetInclude";
import { handleGetIncludesList } from "./handlers/handleGetIncludesList";
import { handleGetTypeInfo } from "./handlers/handleGetTypeInfo";
import { handleGetInterface } from "./handlers/handleGetInterface";
import { handleGetTransaction } from "./handlers/handleGetTransaction";
import { handleSearchObject } from "./handlers/handleSearchObject";
import { handleGetEnhancements } from "./handlers/handleGetEnhancements";
import { handleGetEnhancementImpl } from "./handlers/handleGetEnhancementImpl";
import { handleGetEnhancementSpot } from "./handlers/handleGetEnhancementSpot";
import { handleGetBdef } from "./handlers/handleGetBdef";
import { handleGetSqlQuery } from "./handlers/handleGetSqlQuery";
import { handleGetObjectsByType } from "./handlers/handleGetObjectsByType";
import { handleGetWhereUsed } from "./handlers/handleGetWhereUsed";
import { handleGetObjectInfo } from "./handlers/handleGetObjectInfo";
import { handleDescribeByList } from "./handlers/handleDescribeByList";
import { handleGetAbapAST } from "./handlers/handleGetAbapAST";
import { handleGetAbapSemanticAnalysis } from "./handlers/handleGetAbapSemanticAnalysis";
import { handleGetAbapSystemSymbols } from "./handlers/handleGetAbapSystemSymbols";
import { handleGetDomain } from "./handlers/handleGetDomain";
import { handleCreateDomain } from "./handlers/handleCreateDomain";
import { handleCreateDataElement } from "./handlers/handleCreateDataElement";
import { handleGetDataElement } from "./handlers/handleGetDataElement";
import { handleCreateTransport } from "./handlers/handleCreateTransport";
import { handleGetTransport } from "./handlers/handleGetTransport";
import { handleCreateTable } from "./handlers/handleCreateTable";
import { handleCreateStructure } from "./handlers/handleCreateStructure";
import { handleCreateView } from "./handlers/handleCreateView";
import { handleGetView } from "./handlers/handleGetView";
import { handleCreateClass } from "./handlers/handleCreateClass";
import { handleCreateProgram } from "./handlers/handleCreateProgram";
import { handleCreateInterface } from "./handlers/handleCreateInterface";
import { handleCreateFunctionGroup } from "./handlers/handleCreateFunctionGroup";
import { handleCreateFunctionModule } from "./handlers/handleCreateFunctionModule";
import { handleActivateObject } from "./handlers/handleActivateObject";
import { handleDeleteObject } from "./handlers/handleDeleteObject";
import { handleCheckObject } from "./handlers/handleCheckObject";
import { handleUpdateClassSource } from "./handlers/handleUpdateClassSource";
import { handleUpdateProgramSource } from "./handlers/handleUpdateProgramSource";
import { handleUpdateViewSource } from "./handlers/handleUpdateViewSource";
import { handleUpdateInterfaceSource } from "./handlers/handleUpdateInterfaceSource";

// Import shared utility functions and types
import {
  getBaseUrl,
  getAuthHeaders,
  makeAdtRequest,
  return_error,
  return_response,
  setConfigOverride,
  setConnectionOverride,
} from "./lib/utils";
import { SapConfig } from "./lib/sapConfig";
import { AbapConnection } from "./lib/connection/AbapConnection";

// Import logger
import { logger } from "./lib/logger";

// Import tools registry
import { getAllTools } from "./lib/toolsRegistry";

// --- ENV FILE LOADING LOGIC ---
import fs from "fs";

/**
 * Parses command line arguments to find env file path
 * Supports both formats:
 * 1. --env=/path/to/.env
 * 2. --env /path/to/.env
 */
function parseEnvArg(): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    // Format: --env=/path/to/.env
    if (args[i].startsWith("--env=")) {
      return args[i].slice("--env=".length);
    }
    // Format: --env /path/to/.env
    else if (args[i] === "--env" && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

// Find .env file path from arguments
const skipEnvAutoload = process.env.MCP_SKIP_ENV_LOAD === "true";

let envFilePath = parseEnvArg() ?? process.env.MCP_ENV_PATH;

if (!skipEnvAutoload) {
  if (!envFilePath) {
    const possiblePaths = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(__dirname, "../.env")
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        envFilePath = possiblePath;
        process.stderr.write(`[MCP-ENV] No --env specified, using found .env: ${envFilePath}\n`);
        break;
      }
    }

    if (!envFilePath) {
      envFilePath = path.resolve(__dirname, "../.env");
      process.stderr.write(`[MCP-ENV] WARNING: No .env file found, will use path: ${envFilePath}\n`);
    }
  }

  if (!path.isAbsolute(envFilePath)) {
    envFilePath = path.resolve(process.cwd(), envFilePath);
  }

  process.stderr.write(`[MCP-ENV] Using .env path: ${envFilePath}\n`);

  if (fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath });
    process.stderr.write(`[MCP-ENV] Successfully loaded environment from: ${envFilePath}\n`);
  } else {
    logger.error(".env file not found at provided path", { path: envFilePath });
    process.stderr.write(`ERROR: .env file not found at: ${envFilePath}\n`);
    process.exit(1);
  }
} else if (envFilePath) {
  if (!path.isAbsolute(envFilePath)) {
    envFilePath = path.resolve(process.cwd(), envFilePath);
  }
  process.stderr.write(`[MCP-ENV] Environment autoload skipped; using provided path reference: ${envFilePath}\n`);
} else {
  process.stderr.write(`[MCP-ENV] Environment autoload skipped (MCP_SKIP_ENV_LOAD=true).\n`);
}
// --- END ENV FILE LOADING LOGIC ---

// Debug: Log loaded SAP_URL and SAP_CLIENT using the MCP-compatible logger
const envLogPath = envFilePath ?? "(skipped)";

logger.info("SAP configuration loaded", {
  type: "CONFIG_INFO",
  SAP_URL: process.env.SAP_URL,
  SAP_CLIENT: process.env.SAP_CLIENT || "(not set)",
  SAP_AUTH_TYPE: process.env.SAP_AUTH_TYPE || "(not set)",
  SAP_JWT_TOKEN: process.env.SAP_JWT_TOKEN ? "[set]" : "(not set)",
  ENV_PATH: envLogPath,
  CWD: process.cwd(),
  DIRNAME: __dirname,
});

type TransportConfig =
  | { type: "stdio" }
  | {
      type: "streamable-http";
      host: string;
      port: number;
      enableJsonResponse: boolean;
      allowedOrigins?: string[];
      allowedHosts?: string[];
      enableDnsRebindingProtection: boolean;
    }
  | {
      type: "sse";
      host: string;
      port: number;
      allowedOrigins?: string[];
      allowedHosts?: string[];
      enableDnsRebindingProtection: boolean;
    };

function getArgValue(name: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
    if (arg === name && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseBoolean(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolvePortOption(argName: string, envName: string, defaultValue: number): number {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return defaultValue;
  }

  const port = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port value for ${argName}: ${rawValue}`);
  }

  return port;
}

function resolveBooleanOption(argName: string, envName: string, defaultValue: boolean): boolean {
  const argValue = getArgValue(argName);
  if (argValue !== undefined) {
    return parseBoolean(argValue);
  }
  if (hasFlag(argName)) {
    return true;
  }
  const envValue = process.env[envName];
  if (envValue !== undefined) {
    return parseBoolean(envValue);
  }
  return defaultValue;
}

function resolveListOption(argName: string, envName: string): string[] | undefined {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return undefined;
  }
  const items = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

function parseTransportConfig(): TransportConfig {
  const transportInput = getArgValue("--transport") ?? process.env.MCP_TRANSPORT;
  const normalized = transportInput ? transportInput.trim().toLowerCase() : undefined;

  if (
    normalized &&
    normalized !== "stdio" &&
    normalized !== "http" &&
    normalized !== "streamable-http" &&
    normalized !== "server" &&
    normalized !== "sse"
  ) {
    throw new Error(`Unsupported transport: ${transportInput}`);
  }

  const sseRequested =
    normalized === "sse" ||
    hasFlag("--sse");

  if (sseRequested) {
    const port = resolvePortOption("--sse-port", "MCP_SSE_PORT", 3001);
    const host = getArgValue("--sse-host") ?? process.env.MCP_SSE_HOST ?? "0.0.0.0";
    const allowedOrigins = resolveListOption("--sse-allowed-origins", "MCP_SSE_ALLOWED_ORIGINS");
    const allowedHosts = resolveListOption("--sse-allowed-hosts", "MCP_SSE_ALLOWED_HOSTS");
    const enableDnsRebindingProtection = resolveBooleanOption(
      "--sse-enable-dns-protection",
      "MCP_SSE_ENABLE_DNS_PROTECTION",
      false
    );

    return {
      type: "sse",
      host,
      port,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  const httpRequested =
    normalized === "http" ||
    normalized === "streamable-http" ||
    normalized === "server" ||
    hasFlag("--http");

  if (httpRequested) {
    const port = resolvePortOption("--http-port", "MCP_HTTP_PORT", 3000);
    const host = getArgValue("--http-host") ?? process.env.MCP_HTTP_HOST ?? "0.0.0.0";
    const enableJsonResponse = resolveBooleanOption(
      "--http-json-response",
      "MCP_HTTP_ENABLE_JSON_RESPONSE",
      false
    );
    const allowedOrigins = resolveListOption("--http-allowed-origins", "MCP_HTTP_ALLOWED_ORIGINS");
    const allowedHosts = resolveListOption("--http-allowed-hosts", "MCP_HTTP_ALLOWED_HOSTS");
    const enableDnsRebindingProtection = resolveBooleanOption(
      "--http-enable-dns-protection",
      "MCP_HTTP_ENABLE_DNS_PROTECTION",
      false
    );

    return {
      type: "streamable-http",
      host,
      port,
      enableJsonResponse,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  return { type: "stdio" };
}

let sapConfigOverride: SapConfig | undefined;

export interface ServerOptions {
  sapConfig?: SapConfig;
  connection?: AbapConnection;
  transportConfig?: TransportConfig;
  allowProcessExit?: boolean;
  registerSignalHandlers?: boolean;
}

export function setSapConfigOverride(config?: SapConfig) {
  sapConfigOverride = config;
  setConfigOverride(config);
}

export function setAbapConnectionOverride(connection?: AbapConnection) {
  setConnectionOverride(connection);
}

/**
 * Retrieves SAP configuration from environment variables.
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function getConfig(): SapConfig {
  if (sapConfigOverride) {
    return sapConfigOverride;
  }
  // Clean all environment variables from comments (everything after # symbol)
  const rawUrl = process.env.SAP_URL;
  const url = rawUrl ? rawUrl.split('#')[0].trim() : rawUrl;
  const rawClient = process.env.SAP_CLIENT;
  const client = rawClient ? rawClient.split('#')[0].trim() : rawClient;
  const rawAuthType = process.env.SAP_AUTH_TYPE || "basic";
  const authType = rawAuthType.split('#')[0].trim();

  // Enhanced check for SAP_URL
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(
      `Missing or invalid SAP_URL. Got: '${url}'.\nRequired variables:\n- SAP_URL (must be a valid URL, e.g. https://<host>)\n- SAP_AUTH_TYPE (optional, defaults to 'basic')`
    );
  }

  // Client is only required for basic auth
  if (authType === "basic" && !client) {
    throw new Error(
      `Missing required environment variable: SAP_CLIENT. This is required for basic authentication.`
    );
  }

  // Config object
  const config: SapConfig = {
    url,
    authType: authType === "xsuaa" ? "jwt" : (authType as "basic" | "jwt"),
  };

  // Add client only if it's provided
  if (client) {
    config.client = client;
  }

  // For basic auth, username and password are required
  if (authType === "basic") {
    const rawUsername = process.env.SAP_USERNAME;
    const username = rawUsername ? rawUsername.split('#')[0].trim() : rawUsername;
    const rawPassword = process.env.SAP_PASSWORD;
    const password = rawPassword ? rawPassword.split('#')[0].trim() : rawPassword;

    if (!username || !password) {
      throw new Error(
        `Basic authentication requires username and password. Missing variables:\n- SAP_USERNAME\n- SAP_PASSWORD`
      );
    }

    config.username = username;
    config.password = password;
  }
  // For JWT, the token is required
  else if (authType === "xsuaa" || authType === "jwt") {
    const rawJwtToken = process.env.SAP_JWT_TOKEN;
    const jwtToken = rawJwtToken ? rawJwtToken.split('#')[0].trim() : rawJwtToken;

    if (!jwtToken) {
      throw new Error(
        `JWT authentication requires a token. Missing variable:\n- SAP_JWT_TOKEN`
      );
    }
    config.jwtToken = jwtToken;
  }

  return config;
}

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class mcp_abap_adt_server {
  private readonly allowProcessExit: boolean;
  private readonly registerSignalHandlers: boolean;
  private server: Server; // Instance of the MCP server
  private sapConfig: SapConfig; // SAP configuration
  private transportConfig: TransportConfig;
  private httpServer?: HttpServer;
  private currentSseTransport?: SSEServerTransport;
  private shuttingDown = false;

  /**
   * Constructor for the mcp_abap_adt_server class.
   */
  constructor(options?: ServerOptions) {
    this.allowProcessExit = options?.allowProcessExit ?? true;
    this.registerSignalHandlers = options?.registerSignalHandlers ?? true;

    if (options?.connection) {
      setAbapConnectionOverride(options.connection);
    } else {
      setAbapConnectionOverride(undefined);
    }

    if (!options?.connection) {
      setSapConfigOverride(options?.sapConfig);
    }

    // CHANGED: Don't validate config in constructor - will validate on actual ABAP requests
    // This allows creating server instance without .env file when using runtime config (e.g., from HTTP headers)
    try {
      if (options?.sapConfig) {
        this.sapConfig = options.sapConfig;
      } else if (!options?.connection) {
        this.sapConfig = getConfig();
      } else {
        this.sapConfig = { url: "http://injected-connection", authType: "jwt", jwtToken: "injected" };
      }
    } catch (error) {
      // If config is not available yet, that's OK - it will be provided later via setSapConfigOverride or DI
      logger.warn("SAP config not available at initialization, will use runtime config", {
        type: "CONFIG_DEFERRED",
        error: error instanceof Error ? error.message : String(error),
      });
      // Set a placeholder that will be replaced
      this.sapConfig = { url: "http://placeholder", authType: "jwt", jwtToken: "placeholder" };
    }

    try {
      this.transportConfig = options?.transportConfig ?? parseTransportConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to parse transport configuration", {
        type: "TRANSPORT_CONFIG_ERROR",
        error: message,
      });
      process.stderr.write(`ERROR: ${message}\n`);
      if (this.allowProcessExit) {
        process.exit(1);
      }
      throw error instanceof Error ? error : new Error(message);
    }
    this.server = new Server(
      {
        name: "mcp-abap-adt",
        version: "0.1.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers(); // Setup request handlers
    if (this.registerSignalHandlers) {
      this.setupSignalHandlers();
    }

    if (this.transportConfig.type === "streamable-http") {
      logger.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
        host: this.transportConfig.host,
        port: this.transportConfig.port,
        enableJsonResponse: this.transportConfig.enableJsonResponse,
        allowedOrigins: this.transportConfig.allowedOrigins ?? [],
        allowedHosts: this.transportConfig.allowedHosts ?? [],
        enableDnsRebindingProtection: this.transportConfig.enableDnsRebindingProtection,
      });
    } else if (this.transportConfig.type === "sse") {
      logger.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
        host: this.transportConfig.host,
        port: this.transportConfig.port,
        allowedOrigins: this.transportConfig.allowedOrigins ?? [],
        allowedHosts: this.transportConfig.allowedHosts ?? [],
        enableDnsRebindingProtection: this.transportConfig.enableDnsRebindingProtection,
      });
    } else {
      logger.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
      });
    }
  }

  /**
   * Sets up request handlers for listing and calling tools.
   * @private
   */
  private setupHandlers() {
  // Handler for ListToolsRequest - relies on the dynamic tool registry
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getAllTools()
    }));

    // Handler for CallToolRequest
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "GetProgram":
          return await handleGetProgram(request.params.arguments);
        case "GetClass":
          return await handleGetClass(request.params.arguments);
        case "GetFunction":
          return await handleGetFunction(request.params.arguments);
        case "GetFunctionGroup":
          return await handleGetFunctionGroup(request.params.arguments);
        case "GetStructure":
          return await handleGetStructure(request.params.arguments);
        case "GetTable":
          return await handleGetTable(request.params.arguments);
        case "GetDomain":
          return await handleGetDomain(request.params.arguments);
        case "GetTableContents":
          return await handleGetTableContents(request.params.arguments);
        case "GetPackage":
          return await handleGetPackage(request.params.arguments);
        case "GetTypeInfo":
          return await handleGetTypeInfo(request.params.arguments);
        case "GetInclude":
          return await handleGetInclude(request.params.arguments);
        case "SearchObject":
          return await handleSearchObject(request.params.arguments);
        case "GetInterface":
          return await handleGetInterface(request.params.arguments);
        case "GetTransaction":
          return await handleGetTransaction(request.params.arguments);
        case "GetEnhancements":
          return await handleGetEnhancements(request.params.arguments);
        case "GetEnhancementSpot":
          return await handleGetEnhancementSpot(request.params.arguments);
        case "GetEnhancementImpl":
          return await handleGetEnhancementImpl(request.params.arguments);
        case "GetSqlQuery":
          return await handleGetSqlQuery(request.params.arguments);
        case "GetIncludesList":
          return await handleGetIncludesList(request.params.arguments);
        case "GetWhereUsed":
          return await handleGetWhereUsed(request.params.arguments);
        case "GetBdef":
          return await handleGetBdef(request.params.arguments);
        case "GetObjectInfo":
          if (!request.params.arguments || typeof request.params.arguments !== "object") {
            throw new McpError(ErrorCode.InvalidParams, "Missing or invalid arguments for GetObjectInfo");
          }
          return await handleGetObjectInfo(request.params.arguments as { parent_type: string; parent_name: string });
        case "GetAdtTypes":
          return await (await import("./handlers/handleGetAllTypes.js")).handleGetAdtTypes(request.params.arguments as any);
        case "GetObjectStructure":
          return await (await import("./handlers/handleGetObjectStructure.js")).handleGetObjectStructure(request.params.arguments as any);
        case "GetObjectsList":
          return await (await import("./handlers/handleGetObjectsList.js")).handleGetObjectsList(request.params.arguments as any);
        case "GetObjectsByType":
          return await (await import("./handlers/handleGetObjectsByType.js")).handleGetObjectsByType(request.params.arguments as any);
        case "GetProgFullCode":
          return await (await import("./handlers/handleGetProgFullCode.js")).handleGetProgFullCode(request.params.arguments as any);
        case "GetObjectNodeFromCache":
          return await (await import("./handlers/handleGetObjectNodeFromCache.js")).handleGetObjectNodeFromCache(request.params.arguments as any);
        // case "GetDescription":
          // return await (await import("./handlers/handleGetDescription.js")).handleGetDescription(request.params.arguments as any);
        // case "DetectObjectType":
        //   return await (await import("./handlers/handleDetectObjectType.js")).handleSearchObject(request.params.arguments as any);
        case "DescribeByList":
          return await (await import("./handlers/handleDescribeByList.js")).handleDescribeByList(request.params.arguments as any);
        case "GetAbapAST":
          return await handleGetAbapAST(request.params.arguments);
        case "GetAbapSemanticAnalysis":
          return await handleGetAbapSemanticAnalysis(request.params.arguments);
        case "GetAbapSystemSymbols":
          return await handleGetAbapSystemSymbols(request.params.arguments);
        case "CreateDomain":
          return await handleCreateDomain(request.params.arguments);
        case "CreateDataElement":
          return await handleCreateDataElement(request.params.arguments);
        case "GetDataElement":
          return await handleGetDataElement(request.params.arguments);
        case "CreateTransport":
          return await handleCreateTransport(request.params.arguments);
        case "GetTransport":
          return await handleGetTransport(request.params.arguments);
        case "CreateTable":
          return await handleCreateTable(request.params.arguments);
        case "CreateStructure":
          return await handleCreateStructure(request.params.arguments);
        case "CreateView":
          return await handleCreateView(request.params.arguments);
        case "GetView":
          return await handleGetView(request.params.arguments);
        case "CreateClass":
          return await handleCreateClass(request.params.arguments);
        case "UpdateClassSource":
          return await handleUpdateClassSource(request.params.arguments);
        case "CreateProgram":
          return await handleCreateProgram(request.params.arguments);
        case "UpdateProgramSource":
          return await handleUpdateProgramSource(request.params.arguments);
        case "CreateInterface":
          return await handleCreateInterface(request.params.arguments);
        case "CreateFunctionGroup":
          return await handleCreateFunctionGroup(request.params.arguments);
        case "CreateFunctionModule":
          return await handleCreateFunctionModule(request.params.arguments);
        case "UpdateViewSource":
          return await handleUpdateViewSource(request.params.arguments);
        case "UpdateInterfaceSource":
          return await handleUpdateInterfaceSource(request.params.arguments);
        case "ActivateObject":
          return await handleActivateObject(request.params.arguments);
        case "DeleteObject":
          return await handleDeleteObject(request.params.arguments);
        case "CheckObject":
          return await handleCheckObject(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });

  }

  private setupSignalHandlers() {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, () => {
        if (this.shuttingDown) {
          return;
        }
        this.shuttingDown = true;
        logger.info("Received shutdown signal", {
          type: "SERVER_SHUTDOWN_SIGNAL",
          signal,
          transport: this.transportConfig.type,
        });
        void this.shutdown().finally(() => {
          if (this.allowProcessExit) {
            process.exit(0);
          }
        });
      });
    }
  }

  private async shutdown() {
    try {
      await this.server.close();
    } catch (error) {
      logger.error("Failed to close MCP server", {
        type: "SERVER_SHUTDOWN_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (this.currentSseTransport) {
      try {
        await this.currentSseTransport.close();
      } catch (error) {
        logger.error("Failed to close SSE transport", {
          type: "SSE_SHUTDOWN_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.currentSseTransport = undefined;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close((closeError) => {
          if (closeError) {
            logger.error("Failed to close HTTP server", {
              type: "HTTP_SERVER_SHUTDOWN_ERROR",
              error: closeError instanceof Error ? closeError.message : String(closeError),
            });
          }
          resolve();
        });
      });
      this.httpServer = undefined;
    }
  }

  /**
   * Starts the MCP server and connects it to the transport.
   */
  async run() {
    if (this.transportConfig.type === "stdio") {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("Server connected", {
        type: "SERVER_READY",
        transport: "stdio",
      });
      return;
    }

    if (this.transportConfig.type === "streamable-http") {
      const httpConfig = this.transportConfig;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: httpConfig.enableJsonResponse,
        allowedOrigins: httpConfig.allowedOrigins,
        allowedHosts: httpConfig.allowedHosts,
        enableDnsRebindingProtection: httpConfig.enableDnsRebindingProtection,
      });

      await this.server.connect(transport);

      const httpServer = createServer(async (req, res) => {
        try {
          await transport.handleRequest(req, res);
        } catch (error) {
          logger.error("Failed to handle HTTP request", {
            type: "HTTP_REQUEST_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
      });

      httpServer.on("clientError", (err, socket) => {
        logger.error("HTTP client error", {
          type: "HTTP_CLIENT_ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          logger.error("HTTP server failed to start", {
            type: "HTTP_SERVER_ERROR",
            error: error.message,
          });
          httpServer.off("error", onError);
          reject(error);
        };

        httpServer.once("error", onError);
        httpServer.listen(httpConfig.port, httpConfig.host, () => {
          httpServer.off("error", onError);
          logger.info("HTTP server listening", {
            type: "HTTP_SERVER_LISTENING",
            host: httpConfig.host,
            port: httpConfig.port,
            enableJsonResponse: httpConfig.enableJsonResponse,
          });
          resolve();
        });
      });

      this.httpServer = httpServer;
      return;
    }

    const sseConfig = this.transportConfig;
    const streamPathMap = new Map<string, string>([
      ["/", "/messages"],
      ["/mcp/events", "/mcp/messages"],
      ["/sse", "/sse"],
    ]);
    const streamPaths = Array.from(streamPathMap.keys());
    const postPathSet = new Set(streamPathMap.values());
    postPathSet.add("/messages");

    const httpServer = createServer(async (req, res) => {
      const requestUrl = req.url ? new URL(req.url, `http://${req.headers.host ?? `${sseConfig.host}:${sseConfig.port}`}`) : undefined;
      let pathname = requestUrl?.pathname ?? "/";
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      logger.debug("SSE request received", {
        type: "SSE_HTTP_REQUEST",
        method: req.method,
        pathname,
        originalUrl: req.url,
        headers: {
          accept: req.headers.accept,
          "content-type": req.headers["content-type"],
        },
      });

      if (req.method === "GET" && streamPathMap.has(pathname)) {
        if (this.currentSseTransport) {
          res.writeHead(409, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: "SSE session already established" })
          );
          return;
        }

        const postEndpoint = streamPathMap.get(pathname) ?? "/mcp/messages";

        const transport = new SSEServerTransport(postEndpoint, res, {
          allowedHosts: sseConfig.allowedHosts,
          allowedOrigins: sseConfig.allowedOrigins,
          enableDnsRebindingProtection: sseConfig.enableDnsRebindingProtection,
        });

        this.currentSseTransport = transport;

        transport.onclose = () => {
          logger.info("SSE connection closed", {
            type: "SSE_CONNECTION_CLOSED",
            streamPath: pathname,
          });
          this.currentSseTransport = undefined;
        };

        transport.onerror = (error) => {
          logger.error("SSE transport error", {
            type: "SSE_TRANSPORT_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
        };

        try {
          await this.server.connect(transport);
          logger.info("SSE transport connected", {
            type: "SSE_CONNECTION_READY",
            streamPath: pathname,
            postEndpoint,
          });
        } catch (error) {
          logger.error("Failed to connect SSE transport", {
            type: "SSE_CONNECT_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
          this.currentSseTransport = undefined;
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
        return;
      }

      if (req.method === "POST" && postPathSet.has(pathname)) {
        const transport = this.currentSseTransport;
        if (!transport) {
          res.writeHead(503, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: "SSE session not initialized" })
          );
          return;
        }

        try {
          await transport.handlePostMessage(req, res);
        } catch (error) {
          logger.error("Failed to handle SSE POST message", {
            type: "SSE_POST_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
        return;
      }

  if (req.method === "OPTIONS" && (streamPathMap.has(pathname) || postPathSet.has(pathname))) {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }).end();
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: "Not Found" })
      );
    });

    httpServer.on("clientError", (err, socket) => {
      logger.error("SSE HTTP client error", {
        type: "SSE_HTTP_CLIENT_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        logger.error("SSE HTTP server failed to start", {
          type: "SSE_HTTP_SERVER_ERROR",
          error: error.message,
        });
        httpServer.off("error", onError);
        reject(error);
      };

      httpServer.once("error", onError);
      httpServer.listen(sseConfig.port, sseConfig.host, () => {
        httpServer.off("error", onError);
        logger.info("SSE HTTP server listening", {
          type: "SSE_HTTP_SERVER_LISTENING",
          host: sseConfig.host,
          port: sseConfig.port,
          streamPaths,
          postPaths: Array.from(postPathSet.values()),
        });
        resolve();
      });
    });

    this.httpServer = httpServer;
  }
}

if (process.env.MCP_SKIP_AUTO_START !== "true") {
  const server = new mcp_abap_adt_server();
  server.run().catch((error) => {
    logger.error("Fatal error while running MCP server", {
      type: "SERVER_FATAL_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

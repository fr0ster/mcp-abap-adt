#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import path from "path";
import dotenv from "dotenv";
import { createServer, Server as HttpServer, IncomingHttpHeaders } from "http";
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
import { handleCreatePackage } from "./handlers/handleCreatePackage";
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
import { handleUpdateDomain } from "./handlers/handleUpdateDomain";
import { handleCreateDataElement } from "./handlers/handleCreateDataElement";
import { handleUpdateDataElement } from "./handlers/handleUpdateDataElement";
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
import { handleUpdateFunctionModuleSource } from "./handlers/handleUpdateFunctionModuleSource";
import { handleGetSession } from "./handlers/handleGetSession";
import { handleValidateObject } from "./handlers/handleValidateObject";
import { handleLockObject } from "./handlers/handleLockObject";
import { handleUnlockObject } from "./handlers/handleUnlockObject";
import { handleValidateClass } from "./handlers/handleValidateClass";
import { handleCheckClass } from "./handlers/handleCheckClass";
import { handleValidateTable } from "./handlers/handleValidateTable";
import { handleCheckTable } from "./handlers/handleCheckTable";
import { handleValidateFunctionModule } from "./handlers/handleValidateFunctionModule";
import { handleCheckFunctionModule } from "./handlers/handleCheckFunctionModule";

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
import { SapConfig, AbapConnection, getConfigFromEnv } from "@mcp-abap-adt/connection";

// Import logger
import { logger } from "./lib/logger";

// Import tool registry
import { getAllTools } from "./lib/toolsRegistry";

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as GetProgram_Tool } from "./handlers/handleGetProgram";
import { TOOL_DEFINITION as GetClass_Tool } from "./handlers/handleGetClass";
import { TOOL_DEFINITION as GetFunction_Tool } from "./handlers/handleGetFunction";
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from "./handlers/handleGetFunctionGroup";
import { TOOL_DEFINITION as GetTable_Tool } from "./handlers/handleGetTable";
import { TOOL_DEFINITION as GetStructure_Tool } from "./handlers/handleGetStructure";
import { TOOL_DEFINITION as GetTableContents_Tool } from "./handlers/handleGetTableContents";
import { TOOL_DEFINITION as GetPackage_Tool } from "./handlers/handleGetPackage";
import { TOOL_DEFINITION as CreatePackage_Tool } from "./handlers/handleCreatePackage";
import { TOOL_DEFINITION as GetInclude_Tool } from "./handlers/handleGetInclude";
import { TOOL_DEFINITION as GetIncludesList_Tool } from "./handlers/handleGetIncludesList";
import { TOOL_DEFINITION as GetTypeInfo_Tool } from "./handlers/handleGetTypeInfo";
import { TOOL_DEFINITION as GetInterface_Tool } from "./handlers/handleGetInterface";
import { TOOL_DEFINITION as GetTransaction_Tool } from "./handlers/handleGetTransaction";
import { TOOL_DEFINITION as SearchObject_Tool } from "./handlers/handleSearchObject";
import { TOOL_DEFINITION as GetEnhancements_Tool } from "./handlers/handleGetEnhancements";
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from "./handlers/handleGetEnhancementImpl";
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from "./handlers/handleGetEnhancementSpot";
import { TOOL_DEFINITION as GetBdef_Tool } from "./handlers/handleGetBdef";
import { TOOL_DEFINITION as GetSqlQuery_Tool } from "./handlers/handleGetSqlQuery";
import { TOOL_DEFINITION as GetWhereUsed_Tool } from "./handlers/handleGetWhereUsed";
import { TOOL_DEFINITION as GetObjectInfo_Tool } from "./handlers/handleGetObjectInfo";
import { TOOL_DEFINITION as GetAbapAST_Tool } from "./handlers/handleGetAbapAST";
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from "./handlers/handleGetAbapSemanticAnalysis";
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from "./handlers/handleGetAbapSystemSymbols";
import { TOOL_DEFINITION as GetDomain_Tool } from "./handlers/handleGetDomain";
import { TOOL_DEFINITION as CreateDomain_Tool } from "./handlers/handleCreateDomain";
import { TOOL_DEFINITION as UpdateDomain_Tool } from "./handlers/handleUpdateDomain";
import { TOOL_DEFINITION as CreateDataElement_Tool } from "./handlers/handleCreateDataElement";
import { TOOL_DEFINITION as UpdateDataElement_Tool } from "./handlers/handleUpdateDataElement";
import { TOOL_DEFINITION as GetDataElement_Tool } from "./handlers/handleGetDataElement";
import { TOOL_DEFINITION as CreateTransport_Tool } from "./handlers/handleCreateTransport";
import { TOOL_DEFINITION as GetTransport_Tool } from "./handlers/handleGetTransport";
import { TOOL_DEFINITION as CreateTable_Tool } from "./handlers/handleCreateTable";
import { TOOL_DEFINITION as CreateStructure_Tool } from "./handlers/handleCreateStructure";
import { TOOL_DEFINITION as CreateView_Tool } from "./handlers/handleCreateView";
import { TOOL_DEFINITION as GetView_Tool } from "./handlers/handleGetView";
import { TOOL_DEFINITION as CreateClass_Tool } from "./handlers/handleCreateClass";
import { TOOL_DEFINITION as CreateProgram_Tool } from "./handlers/handleCreateProgram";
import { TOOL_DEFINITION as CreateInterface_Tool } from "./handlers/handleCreateInterface";
import { TOOL_DEFINITION as CreateFunctionGroup_Tool } from "./handlers/handleCreateFunctionGroup";
import { TOOL_DEFINITION as CreateFunctionModule_Tool } from "./handlers/handleCreateFunctionModule";
import { TOOL_DEFINITION as ActivateObject_Tool } from "./handlers/handleActivateObject";
import { TOOL_DEFINITION as DeleteObject_Tool } from "./handlers/handleDeleteObject";
import { TOOL_DEFINITION as CheckObject_Tool } from "./handlers/handleCheckObject";
import { TOOL_DEFINITION as UpdateClassSource_Tool } from "./handlers/handleUpdateClassSource";
import { TOOL_DEFINITION as UpdateProgramSource_Tool } from "./handlers/handleUpdateProgramSource";
import { TOOL_DEFINITION as UpdateViewSource_Tool } from "./handlers/handleUpdateViewSource";
import { TOOL_DEFINITION as UpdateInterfaceSource_Tool } from "./handlers/handleUpdateInterfaceSource";
import { TOOL_DEFINITION as UpdateFunctionModuleSource_Tool } from "./handlers/handleUpdateFunctionModuleSource";
import { TOOL_DEFINITION as GetSession_Tool } from "./handlers/handleGetSession";
import { TOOL_DEFINITION as ValidateObject_Tool } from "./handlers/handleValidateObject";
import { TOOL_DEFINITION as LockObject_Tool } from "./handlers/handleLockObject";
import { TOOL_DEFINITION as UnlockObject_Tool } from "./handlers/handleUnlockObject";
import { TOOL_DEFINITION as ValidateClass_Tool } from "./handlers/handleValidateClass";
import { TOOL_DEFINITION as CheckClass_Tool } from "./handlers/handleCheckClass";
import { TOOL_DEFINITION as ValidateTable_Tool } from "./handlers/handleValidateTable";
import { TOOL_DEFINITION as CheckTable_Tool } from "./handlers/handleCheckTable";
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from "./handlers/handleValidateFunctionModule";
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from "./handlers/handleCheckFunctionModule";

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
 * Uses getConfigFromEnv from @mcp-abap-adt/connection package.
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function getConfig(): SapConfig {
  if (sapConfigOverride) {
    return sapConfigOverride;
  }
  return getConfigFromEnv();
}

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class mcp_abap_adt_server {
  private readonly allowProcessExit: boolean;
  private readonly registerSignalHandlers: boolean;
  private mcpServer: McpServer; // MCP server for all transports
  private sapConfig: SapConfig; // SAP configuration
  private transportConfig: TransportConfig;
  private httpServer?: HttpServer;
  private shuttingDown = false;

  // Client session tracking for StreamableHTTP (like the example)
  private streamableHttpSessions = new Map<string, {
    sessionId: string;
    clientIP: string;
    connectedAt: Date;
    requestCount: number;
  }>();

  // SSE session tracking (McpServer + SSEServerTransport per session)
  private sseSessions = new Map<string, {
    server: McpServer;
    transport: SSEServerTransport;
  }>();
  private applyAuthHeaders(headers?: IncomingHttpHeaders) {
    if (!headers) {
      return;
    }

    const getHeaderValue = (value?: string | string[]) => {
      if (!value) {
        return undefined;
      }
      return Array.isArray(value) ? value[0] : value;
    };

    // Extract JWT token from Authorization header (Bearer) or x-sap-jwt-token
    let jwtToken: string | undefined;
    const authorizationHeader = getHeaderValue(headers["authorization"]);
    if (authorizationHeader) {
      const bearerMatch = authorizationHeader.match(/Bearer\s+(.+)/i);
      if (bearerMatch) {
        jwtToken = bearerMatch[1]?.trim();
      }
    }

    // Fallback to x-sap-jwt-token if Authorization header is not present
    if (!jwtToken) {
      jwtToken = getHeaderValue(headers["x-sap-jwt-token"])?.trim();
    }

    // If no JWT token found, skip processing
    if (!jwtToken) {
      return;
    }

    // Extract refresh token
    const refreshToken = getHeaderValue(headers["x-sap-refresh-token"]);

    // Extract UAA credentials for token refresh
    const uaaUrl = getHeaderValue(headers["x-sap-uaa-url"])?.trim();
    const uaaClientId = getHeaderValue(headers["x-sap-uaa-client-id"])?.trim();
    const uaaClientSecret = getHeaderValue(headers["x-sap-uaa-client-secret"])?.trim();

    // Extract SAP URL and auth type from headers
    const sapUrl = getHeaderValue(headers["x-sap-url"])?.trim();
    const sapAuthType = getHeaderValue(headers["x-sap-auth-type"])?.trim();

    const sanitizeToken = (token: string) =>
      token.length <= 10 ? token : `${token.substring(0, 6)}…${token.substring(token.length - 4)}`;

    let baseConfig: SapConfig | undefined = this.sapConfig;
    if (!baseConfig || baseConfig.url === "http://placeholder") {
      try {
        baseConfig = getConfig();
      } catch (error) {
        logger.warn("Failed to load base SAP config when applying headers", {
          type: "SAP_CONFIG_HEADER_APPLY_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        // If base config is not available, create a minimal config from headers
        if (sapUrl) {
          baseConfig = {
            url: sapUrl,
            authType: (sapAuthType === "jwt" || sapAuthType === "xsuaa") ? "jwt" : "basic",
          };
        } else {
          return;
        }
      }
    }

    // Check if any configuration changed
    const urlChanged = sapUrl && sapUrl !== baseConfig.url;
    const authTypeChanged = sapAuthType &&
      ((sapAuthType === "jwt" || sapAuthType === "xsuaa") ? "jwt" : "basic") !== baseConfig.authType;
    const tokenChanged =
      baseConfig.jwtToken !== jwtToken ||
      (!!refreshToken && refreshToken.trim() !== baseConfig.refreshToken);

    if (!urlChanged && !authTypeChanged && !tokenChanged) {
      return;
    }

    const newConfig: SapConfig = {
      ...baseConfig,
      authType: sapAuthType ?
        ((sapAuthType === "jwt" || sapAuthType === "xsuaa") ? "jwt" : "basic") :
        baseConfig.authType,
      jwtToken,
    };

    if (sapUrl) {
      newConfig.url = sapUrl;
    }

    if (refreshToken && refreshToken.trim()) {
      newConfig.refreshToken = refreshToken.trim();
    }

    // Add UAA credentials if provided (required for token refresh)
    if (uaaUrl) {
      newConfig.uaaUrl = uaaUrl;
    }
    if (uaaClientId) {
      newConfig.uaaClientId = uaaClientId;
    }
    if (uaaClientSecret) {
      newConfig.uaaClientSecret = uaaClientSecret;
    }

    setSapConfigOverride(newConfig);
    this.sapConfig = newConfig;

    // Force connection cache invalidation to ensure next getManagedConnection()
    // will recreate connection with updated token
    // Import synchronously to avoid async issues
    const { invalidateConnectionCache } = require('./lib/utils');
    try {
      // Invalidate cache so that next getManagedConnection() will recreate connection
      // with updated config (including new JWT token)
      invalidateConnectionCache();
    } catch (error) {
      // If invalidation fails, log but continue - connection will be recreated on next use
      logger.debug("Connection cache invalidation failed", {
        type: "CONNECTION_CACHE_INVALIDATION_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("Updated SAP configuration from HTTP headers", {
      type: "SAP_CONFIG_UPDATED",
      urlChanged: Boolean(urlChanged),
      authTypeChanged: Boolean(authTypeChanged),
      tokenChanged: Boolean(tokenChanged),
      hasRefreshToken: Boolean(refreshToken),
      jwtPreview: sanitizeToken(jwtToken),
    });
  }

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

    // Create McpServer (for all transports)
    this.mcpServer = new McpServer({
      name: "mcp-abap-adt",
      version: "0.1.0"
    });

    this.setupMcpServerHandlers(); // Setup handlers for McpServer
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
   * Creates a new McpServer instance with all handlers registered
   * Used for SSE sessions where each session needs its own server instance
   * @private
   */
  private createMcpServerForSession(): McpServer {
    const server = new McpServer({
      name: "mcp-abap-adt",
      version: "0.1.0"
    });

    // Register all tools using the same method as main server
    this.registerAllToolsOnServer(server);

    return server;
  }

  /**
   * Converts JSON Schema to Zod schema object (not z.object(), but object with Zod fields)
   * SDK expects inputSchema to be an object with Zod schemas as values, not z.object()
   */
  private jsonSchemaToZod(jsonSchema: any): any {
    // If already a Zod schema object (object with Zod fields), return as-is
    if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type && !jsonSchema.properties) {
      // Check if it looks like a Zod schema object (has Zod types as values)
      const firstValue = Object.values(jsonSchema)[0];
      if (firstValue && ((firstValue as any).def || (firstValue as any)._def || typeof (firstValue as any).parse === 'function')) {
        return jsonSchema;
      }
    }

    // If it's a JSON Schema object
    if (jsonSchema && typeof jsonSchema === 'object' && jsonSchema.type === 'object' && jsonSchema.properties) {
      const zodShape: Record<string, z.ZodTypeAny> = {};
      const required = jsonSchema.required || [];

      for (const [key, prop] of Object.entries(jsonSchema.properties)) {
        const propSchema = prop as any;
        let zodType: z.ZodTypeAny;

        if (propSchema.type === 'string') {
          if (propSchema.enum && Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
            // Use z.enum() for enum values (requires at least 1 element, but z.enum needs 2+)
            if (propSchema.enum.length === 1) {
              zodType = z.literal(propSchema.enum[0]);
            } else {
              zodType = z.enum(propSchema.enum as [string, ...string[]]);
            }
          } else {
            zodType = z.string();
          }
        } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
          zodType = z.number();
        } else if (propSchema.type === 'boolean') {
          zodType = z.boolean();
        } else if (propSchema.type === 'array') {
          const items = propSchema.items;
          if (items?.type === 'string') {
            zodType = z.array(z.string());
          } else if (items?.type === 'number' || items?.type === 'integer') {
            zodType = z.array(z.number());
          } else if (items?.type === 'boolean') {
            zodType = z.array(z.boolean());
          } else if (items?.type === 'object' && items.properties) {
            // For nested objects in arrays, create object schema
            const nestedShape: Record<string, z.ZodTypeAny> = {};
            const nestedRequired = items.required || [];
            for (const [nestedKey, nestedProp] of Object.entries(items.properties)) {
              const nestedPropSchema = nestedProp as any;
              let nestedZodType: z.ZodTypeAny;
              if (nestedPropSchema.type === 'string') {
                if (nestedPropSchema.enum && Array.isArray(nestedPropSchema.enum) && nestedPropSchema.enum.length > 0) {
                  if (nestedPropSchema.enum.length === 1) {
                    nestedZodType = z.literal(nestedPropSchema.enum[0]);
                  } else {
                    nestedZodType = z.enum(nestedPropSchema.enum as [string, ...string[]]);
                  }
                } else {
                  nestedZodType = z.string();
                }
              } else if (nestedPropSchema.type === 'number' || nestedPropSchema.type === 'integer') {
                nestedZodType = z.number();
              } else if (nestedPropSchema.type === 'boolean') {
                nestedZodType = z.boolean();
              } else {
                nestedZodType = z.any();
              }
              if (nestedPropSchema.default !== undefined) {
                nestedZodType = nestedZodType.default(nestedPropSchema.default);
              }
              if (!nestedRequired.includes(nestedKey)) {
                nestedZodType = nestedZodType.optional();
              }
              if (nestedPropSchema.description) {
                nestedZodType = nestedZodType.describe(nestedPropSchema.description);
              }
              nestedShape[nestedKey] = nestedZodType;
            }
            zodType = z.array(z.object(nestedShape));
          } else {
            zodType = z.array(z.any());
          }
        } else if (propSchema.type === 'object' && propSchema.properties) {
          // For nested objects, create object schema
          const nestedShape: Record<string, z.ZodTypeAny> = {};
          const nestedRequired = propSchema.required || [];
          for (const [nestedKey, nestedProp] of Object.entries(propSchema.properties)) {
            const nestedPropSchema = nestedProp as any;
            let nestedZodType: z.ZodTypeAny;
            if (nestedPropSchema.type === 'string') {
              if (nestedPropSchema.enum && Array.isArray(nestedPropSchema.enum)) {
                nestedZodType = z.enum(nestedPropSchema.enum as [string, ...string[]]);
              } else {
                nestedZodType = z.string();
              }
            } else if (nestedPropSchema.type === 'number' || nestedPropSchema.type === 'integer') {
              nestedZodType = z.number();
            } else if (nestedPropSchema.type === 'boolean') {
              nestedZodType = z.boolean();
            } else {
              nestedZodType = z.any();
            }
            if (nestedPropSchema.default !== undefined) {
              nestedZodType = nestedZodType.default(nestedPropSchema.default);
            }
            if (!nestedRequired.includes(nestedKey)) {
              nestedZodType = nestedZodType.optional();
            }
            if (nestedPropSchema.description) {
              nestedZodType = nestedZodType.describe(nestedPropSchema.description);
            }
            nestedShape[nestedKey] = nestedZodType;
          }
          zodType = z.object(nestedShape);
        } else {
          zodType = z.any();
        }

        // Add default value if present (before optional)
        if (propSchema.default !== undefined) {
          zodType = zodType.default(propSchema.default);
        }

        // Make optional if not in required array (must be after default, before describe)
        if (!required.includes(key)) {
          zodType = zodType.optional();
        }

        // Add description if present (after optional)
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description);
        }

        zodShape[key] = zodType;
      }

      // Return object with Zod fields, not z.object()
      return zodShape;
    }

    // Fallback: if it's already a Zod schema object, return as-is
    if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type) {
      return jsonSchema;
    }

    // Fallback: return empty object for unknown schemas
    return {};
  }

  /**
   * Helper function to register a tool on McpServer
   * Wraps handler to convert our response format to MCP format
   */
  private registerToolOnServer(
    server: McpServer,
    toolName: string,
    description: string,
    inputSchema: any,
    handler: (args: any) => Promise<any>
  ) {
    // Convert JSON Schema to Zod if needed, otherwise pass as-is (like in the example)
    const zodSchema = (inputSchema && typeof inputSchema === 'object' && inputSchema.type === 'object' && inputSchema.properties)
      ? this.jsonSchemaToZod(inputSchema)
      : inputSchema;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: zodSchema,
      },
      async (args: any) => {
        const result = await handler(args);

        // If error, throw it
        if (result.isError) {
          const errorText = result.content
            ?.map((item: any) => {
              if (item?.type === "json" && item.json !== undefined) {
                return JSON.stringify(item.json);
              }
              return item?.text || String(item);
            })
            .join("\n") || "Unknown error";
          throw new McpError(ErrorCode.InternalError, errorText);
        }

        // Convert content to MCP format - JSON items become text
        const content = (result.content || []).map((item: any) => {
          if (item?.type === "json" && item.json !== undefined) {
            return {
              type: "text" as const,
              text: JSON.stringify(item.json),
            };
          }
          return {
            type: "text" as const,
            text: item?.text || String(item || ""),
          };
        });

        return { content };
      }
    );
  }

  /**
   * Registers all tools on a McpServer instance
   * Used for both main server and per-session servers
   */
  private registerAllToolsOnServer(server: McpServer) {
    this.registerToolOnServer(server, GetProgram_Tool.name, GetProgram_Tool.description, GetProgram_Tool.inputSchema as any, handleGetProgram);
    this.registerToolOnServer(server, GetClass_Tool.name, GetClass_Tool.description, GetClass_Tool.inputSchema as any, handleGetClass);
    this.registerToolOnServer(server, GetFunction_Tool.name, GetFunction_Tool.description, GetFunction_Tool.inputSchema as any, handleGetFunction);
    this.registerToolOnServer(server, GetFunctionGroup_Tool.name, GetFunctionGroup_Tool.description, GetFunctionGroup_Tool.inputSchema as any, handleGetFunctionGroup);
    this.registerToolOnServer(server, GetTable_Tool.name, GetTable_Tool.description, GetTable_Tool.inputSchema as any, handleGetTable);
    this.registerToolOnServer(server, GetStructure_Tool.name, GetStructure_Tool.description, GetStructure_Tool.inputSchema as any, handleGetStructure);
    this.registerToolOnServer(server, GetTableContents_Tool.name, GetTableContents_Tool.description, GetTableContents_Tool.inputSchema as any, handleGetTableContents);
    this.registerToolOnServer(server, GetPackage_Tool.name, GetPackage_Tool.description, GetPackage_Tool.inputSchema as any, handleGetPackage);
    this.registerToolOnServer(server, CreatePackage_Tool.name, CreatePackage_Tool.description, CreatePackage_Tool.inputSchema as any, handleCreatePackage);
    this.registerToolOnServer(server, GetInclude_Tool.name, GetInclude_Tool.description, GetInclude_Tool.inputSchema as any, handleGetInclude);
    this.registerToolOnServer(server, GetIncludesList_Tool.name, GetIncludesList_Tool.description, GetIncludesList_Tool.inputSchema as any, handleGetIncludesList);
    this.registerToolOnServer(server, GetTypeInfo_Tool.name, GetTypeInfo_Tool.description, GetTypeInfo_Tool.inputSchema as any, handleGetTypeInfo);
    this.registerToolOnServer(server, GetInterface_Tool.name, GetInterface_Tool.description, GetInterface_Tool.inputSchema as any, handleGetInterface);
    this.registerToolOnServer(server, GetTransaction_Tool.name, GetTransaction_Tool.description, GetTransaction_Tool.inputSchema as any, handleGetTransaction);
    this.registerToolOnServer(server, SearchObject_Tool.name, SearchObject_Tool.description, SearchObject_Tool.inputSchema as any, handleSearchObject);
    this.registerToolOnServer(server, GetEnhancements_Tool.name, GetEnhancements_Tool.description, GetEnhancements_Tool.inputSchema as any, handleGetEnhancements);
    this.registerToolOnServer(server, GetEnhancementSpot_Tool.name, GetEnhancementSpot_Tool.description, GetEnhancementSpot_Tool.inputSchema as any, handleGetEnhancementSpot);
    this.registerToolOnServer(server, GetEnhancementImpl_Tool.name, GetEnhancementImpl_Tool.description, GetEnhancementImpl_Tool.inputSchema as any, handleGetEnhancementImpl);
    this.registerToolOnServer(server, GetBdef_Tool.name, GetBdef_Tool.description, GetBdef_Tool.inputSchema as any, handleGetBdef);
    this.registerToolOnServer(server, GetSqlQuery_Tool.name, GetSqlQuery_Tool.description, GetSqlQuery_Tool.inputSchema as any, handleGetSqlQuery);
    this.registerToolOnServer(server, GetWhereUsed_Tool.name, GetWhereUsed_Tool.description, GetWhereUsed_Tool.inputSchema as any, handleGetWhereUsed);
    this.registerToolOnServer(server, GetObjectInfo_Tool.name, GetObjectInfo_Tool.description, GetObjectInfo_Tool.inputSchema as any, async (args: any) => {
      if (!args || typeof args !== "object") {
        throw new McpError(ErrorCode.InvalidParams, "Missing or invalid arguments for GetObjectInfo");
      }
      return await handleGetObjectInfo(args as { parent_type: string; parent_name: string });
    });
    this.registerToolOnServer(server, GetAbapAST_Tool.name, GetAbapAST_Tool.description, GetAbapAST_Tool.inputSchema as any, handleGetAbapAST);
    this.registerToolOnServer(server, GetAbapSemanticAnalysis_Tool.name, GetAbapSemanticAnalysis_Tool.description, GetAbapSemanticAnalysis_Tool.inputSchema as any, handleGetAbapSemanticAnalysis);
    this.registerToolOnServer(server, GetAbapSystemSymbols_Tool.name, GetAbapSystemSymbols_Tool.description, GetAbapSystemSymbols_Tool.inputSchema as any, handleGetAbapSystemSymbols);
    this.registerToolOnServer(server, GetDomain_Tool.name, GetDomain_Tool.description, GetDomain_Tool.inputSchema as any, handleGetDomain);
    this.registerToolOnServer(server, CreateDomain_Tool.name, CreateDomain_Tool.description, CreateDomain_Tool.inputSchema as any, handleCreateDomain);
    this.registerToolOnServer(server, UpdateDomain_Tool.name, UpdateDomain_Tool.description, UpdateDomain_Tool.inputSchema as any, handleUpdateDomain);
    this.registerToolOnServer(server, CreateDataElement_Tool.name, CreateDataElement_Tool.description, CreateDataElement_Tool.inputSchema as any, handleCreateDataElement);
    this.registerToolOnServer(server, UpdateDataElement_Tool.name, UpdateDataElement_Tool.description, UpdateDataElement_Tool.inputSchema as any, handleUpdateDataElement);
    this.registerToolOnServer(server, GetDataElement_Tool.name, GetDataElement_Tool.description, GetDataElement_Tool.inputSchema as any, handleGetDataElement);
    this.registerToolOnServer(server, CreateTransport_Tool.name, CreateTransport_Tool.description, CreateTransport_Tool.inputSchema as any, handleCreateTransport);
    this.registerToolOnServer(server, GetTransport_Tool.name, GetTransport_Tool.description, GetTransport_Tool.inputSchema as any, handleGetTransport);
    this.registerToolOnServer(server, CreateTable_Tool.name, CreateTable_Tool.description, CreateTable_Tool.inputSchema as any, handleCreateTable);
    this.registerToolOnServer(server, CreateStructure_Tool.name, CreateStructure_Tool.description, CreateStructure_Tool.inputSchema as any, handleCreateStructure);
    this.registerToolOnServer(server, CreateView_Tool.name, CreateView_Tool.description, CreateView_Tool.inputSchema as any, handleCreateView);
    this.registerToolOnServer(server, GetView_Tool.name, GetView_Tool.description, GetView_Tool.inputSchema as any, handleGetView);
    this.registerToolOnServer(server, CreateClass_Tool.name, CreateClass_Tool.description, CreateClass_Tool.inputSchema as any, handleCreateClass);
    this.registerToolOnServer(server, UpdateClassSource_Tool.name, UpdateClassSource_Tool.description, UpdateClassSource_Tool.inputSchema as any, handleUpdateClassSource);
    this.registerToolOnServer(server, CreateProgram_Tool.name, CreateProgram_Tool.description, CreateProgram_Tool.inputSchema as any, handleCreateProgram);
    this.registerToolOnServer(server, UpdateProgramSource_Tool.name, UpdateProgramSource_Tool.description, UpdateProgramSource_Tool.inputSchema as any, handleUpdateProgramSource);
    this.registerToolOnServer(server, CreateInterface_Tool.name, CreateInterface_Tool.description, CreateInterface_Tool.inputSchema as any, handleCreateInterface);
    this.registerToolOnServer(server, CreateFunctionGroup_Tool.name, CreateFunctionGroup_Tool.description, CreateFunctionGroup_Tool.inputSchema as any, handleCreateFunctionGroup);
    this.registerToolOnServer(server, CreateFunctionModule_Tool.name, CreateFunctionModule_Tool.description, CreateFunctionModule_Tool.inputSchema as any, handleCreateFunctionModule);
    this.registerToolOnServer(server, UpdateViewSource_Tool.name, UpdateViewSource_Tool.description, UpdateViewSource_Tool.inputSchema as any, handleUpdateViewSource);
    this.registerToolOnServer(server, UpdateInterfaceSource_Tool.name, UpdateInterfaceSource_Tool.description, UpdateInterfaceSource_Tool.inputSchema as any, handleUpdateInterfaceSource);
    this.registerToolOnServer(server, UpdateFunctionModuleSource_Tool.name, UpdateFunctionModuleSource_Tool.description, UpdateFunctionModuleSource_Tool.inputSchema as any, handleUpdateFunctionModuleSource);
    this.registerToolOnServer(server, ActivateObject_Tool.name, ActivateObject_Tool.description, ActivateObject_Tool.inputSchema as any, handleActivateObject);
    this.registerToolOnServer(server, DeleteObject_Tool.name, DeleteObject_Tool.description, DeleteObject_Tool.inputSchema as any, handleDeleteObject);
    this.registerToolOnServer(server, CheckObject_Tool.name, CheckObject_Tool.description, CheckObject_Tool.inputSchema as any, handleCheckObject);
    this.registerToolOnServer(server, GetSession_Tool.name, GetSession_Tool.description, GetSession_Tool.inputSchema as any, handleGetSession);
    this.registerToolOnServer(server, ValidateObject_Tool.name, ValidateObject_Tool.description, ValidateObject_Tool.inputSchema as any, handleValidateObject);
    this.registerToolOnServer(server, LockObject_Tool.name, LockObject_Tool.description, LockObject_Tool.inputSchema as any, handleLockObject);
    this.registerToolOnServer(server, UnlockObject_Tool.name, UnlockObject_Tool.description, UnlockObject_Tool.inputSchema as any, handleUnlockObject);
    this.registerToolOnServer(server, ValidateClass_Tool.name, ValidateClass_Tool.description, ValidateClass_Tool.inputSchema as any, handleValidateClass);
    this.registerToolOnServer(server, CheckClass_Tool.name, CheckClass_Tool.description, CheckClass_Tool.inputSchema as any, handleCheckClass);
    this.registerToolOnServer(server, ValidateTable_Tool.name, ValidateTable_Tool.description, ValidateTable_Tool.inputSchema as any, handleValidateTable);
    this.registerToolOnServer(server, CheckTable_Tool.name, CheckTable_Tool.description, CheckTable_Tool.inputSchema as any, handleCheckTable);
    this.registerToolOnServer(server, ValidateFunctionModule_Tool.name, ValidateFunctionModule_Tool.description, ValidateFunctionModule_Tool.inputSchema as any, handleValidateFunctionModule);
    this.registerToolOnServer(server, CheckFunctionModule_Tool.name, CheckFunctionModule_Tool.description, CheckFunctionModule_Tool.inputSchema as any, handleCheckFunctionModule);

    // Dynamic import tools
    this.registerToolOnServer(server, "GetAdtTypes", "Get all ADT types available in the system", { type: "object", properties: {}, required: [] } as any, async (args: any) => {
      return await (await import("./handlers/handleGetAllTypes.js")).handleGetAdtTypes(args);
    });
    this.registerToolOnServer(server, "GetObjectStructure", "Get object structure with includes hierarchy", { type: "object", properties: { object_name: { type: "string" }, object_type: { type: "string" } }, required: ["object_name", "object_type"] } as any, async (args: any) => {
      return await (await import("./handlers/handleGetObjectStructure.js")).handleGetObjectStructure(args);
    });
    this.registerToolOnServer(server, "GetObjectsList", "Get list of objects by package", { type: "object", properties: { package_name: { type: "string" } }, required: ["package_name"] } as any, async (args: any) => {
      return await (await import("./handlers/handleGetObjectsList.js")).handleGetObjectsList(args);
    });
    this.registerToolOnServer(server, "GetObjectsByType", "Get objects by type", { type: "object", properties: { object_type: { type: "string" }, package_name: { type: "string" } }, required: ["object_type"] } as any, async (args: any) => {
      return await (await import("./handlers/handleGetObjectsByType.js")).handleGetObjectsByType(args);
    });
    this.registerToolOnServer(server, "GetProgFullCode", "Get full program code with includes", { type: "object", properties: { program_name: { type: "string" } }, required: ["program_name"] } as any, async (args: any) => {
      return await (await import("./handlers/handleGetProgFullCode.js")).handleGetProgFullCode(args);
    });
    this.registerToolOnServer(server, "GetObjectNodeFromCache", "Get object node from cache", { type: "object", properties: { object_name: { type: "string" }, object_type: { type: "string" } }, required: ["object_name", "object_type"] } as any, async (args: any) => {
      return await (await import("./handlers/handleGetObjectNodeFromCache.js")).handleGetObjectNodeFromCache(args);
    });
    this.registerToolOnServer(server, "DescribeByList", "Describe objects by list", { type: "object", properties: { objects: { type: "array", items: { type: "string" } } }, required: ["objects"] } as any, async (args: any) => {
      return await (await import("./handlers/handleDescribeByList.js")).handleDescribeByList(args);
    });
  }

  /**
   * Sets up handlers for new McpServer using registerTool (recommended API)
   * @private
   */
  private setupMcpServerHandlers() {
    // Register all tools using TOOL_DEFINITION from handlers
    // McpServer automatically handles listTools requests for registered tools
    this.registerAllToolsOnServer(this.mcpServer);
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
      await this.mcpServer.close();
    } catch (error) {
      logger.error("Failed to close MCP server", {
        type: "SERVER_SHUTDOWN_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Close all SSE sessions
    for (const [sessionId, session] of this.sseSessions.entries()) {
      try {
        await session.transport.close();
        session.server.server.close();
        logger.debug("SSE session closed during shutdown", {
          type: "SSE_SESSION_SHUTDOWN",
          sessionId,
        });
      } catch (error) {
        logger.error("Failed to close SSE session", {
          type: "SSE_SHUTDOWN_ERROR",
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }
    }
    this.sseSessions.clear();

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
      await this.mcpServer.server.connect(transport);
      logger.info("Server connected", {
        type: "SERVER_READY",
        transport: "stdio",
      });
      return;
    }

    if (this.transportConfig.type === "streamable-http") {
      const httpConfig = this.transportConfig;

      // HTTP Server wrapper for StreamableHTTP transport (like the SDK example)
      const httpServer = createServer(async (req, res) => {
        // Only handle POST requests (like the example)
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }

        // Track client (like the example)
        const clientID = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        logger.debug("Client connected", {
          type: "STREAMABLE_HTTP_CLIENT_CONNECTED",
          clientID,
        });

        // Extract session ID from headers (like the example)
        const clientSessionId = (req.headers["x-session-id"] || req.headers["mcp-session-id"]) as string | undefined;

        let session = this.streamableHttpSessions.get(clientID);

        // If client sent session ID, try to find existing session
        if (clientSessionId && !session) {
          // Search for existing session by sessionId (client might have new IP:PORT)
          for (const [key, sess] of this.streamableHttpSessions.entries()) {
            if (sess.sessionId === clientSessionId) {
              session = sess;
              // Update clientID (port might have changed)
              this.streamableHttpSessions.delete(key);
              this.streamableHttpSessions.set(clientID, session);
              logger.debug("Existing session restored", {
                type: "STREAMABLE_HTTP_SESSION_RESTORED",
                sessionId: session.sessionId,
                clientID,
              });
              break;
            }
          }
        }

        // If no session found, create new one
        if (!session) {
          session = {
            sessionId: randomUUID(),
            clientIP: req.socket.remoteAddress || "unknown",
            connectedAt: new Date(),
            requestCount: 0,
          };
          this.streamableHttpSessions.set(clientID, session);
          logger.debug("New session created", {
            type: "STREAMABLE_HTTP_SESSION_CREATED",
            sessionId: session.sessionId,
            clientID,
            totalSessions: this.streamableHttpSessions.size,
          });
        }

        session.requestCount++;

        logger.debug("Request received", {
          type: "STREAMABLE_HTTP_REQUEST",
          sessionId: session.sessionId,
          requestNumber: session.requestCount,
          clientID,
        });

        // Handle client disconnect (like the example)
        req.on("close", () => {
          this.streamableHttpSessions.delete(clientID);
          logger.debug("Session closed", {
            type: "STREAMABLE_HTTP_SESSION_CLOSED",
            sessionId: session!.sessionId,
            requestCount: session!.requestCount,
            totalSessions: this.streamableHttpSessions.size,
          });
        });

        try {
          // Apply auth headers before processing
          this.applyAuthHeaders(req.headers);

          // Read request body (like the SDK example with Express)
          let body: any = null;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            const bodyString = Buffer.concat(chunks).toString('utf-8');
            try {
              body = JSON.parse(bodyString);
            } catch (parseError) {
              // If body is not JSON, pass as string or null
              body = bodyString || null;
            }
          }

          // KEY MOMENT: Create new StreamableHTTP transport for each request (like the SDK example)
          // SDK automatically handles:
          // - Chunked transfer encoding
          // - Session tracking
          // - JSON-RPC protocol
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // Stateless mode (like the SDK example)
            enableJsonResponse: httpConfig.enableJsonResponse,
            allowedOrigins: httpConfig.allowedOrigins,
            allowedHosts: httpConfig.allowedHosts,
            enableDnsRebindingProtection: httpConfig.enableDnsRebindingProtection,
          });

          // Close transport when response closes (like the SDK example)
          res.on("close", () => {
            transport.close();
          });

          // Connect transport to new McpServer (like the SDK example)
          await this.mcpServer.connect(transport);

          logger.debug("Transport connected", {
            type: "STREAMABLE_HTTP_TRANSPORT_CONNECTED",
            sessionId: session.sessionId,
            clientID,
          });

          // Handle HTTP request through transport (like the SDK example)
          // Pass body as third parameter if available (like the SDK example)
          await transport.handleRequest(req, res, body);

          logger.debug("Request completed", {
            type: "STREAMABLE_HTTP_REQUEST_COMPLETED",
            sessionId: session.sessionId,
            clientID,
          });
        } catch (error) {
          logger.error("Failed to handle HTTP request", {
            type: "HTTP_REQUEST_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId: session.sessionId,
            clientID,
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
      ["/sse", "/messages"],
    ]);
    const streamPaths = Array.from(streamPathMap.keys());
    const postPathSet = new Set(streamPathMap.values());
    postPathSet.add("/messages");
    postPathSet.add("/mcp/messages");

    const httpServer = createServer(async (req, res) => {
      const requestUrl = req.url ? new URL(req.url, `http://${req.headers.host ?? `${sseConfig.host}:${sseConfig.port}`}`) : undefined;
      let pathname = requestUrl?.pathname ?? "/";
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      this.applyAuthHeaders(req.headers);

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

      // GET /sse, /mcp/events, or / - establish SSE connection
      if (req.method === "GET" && streamPathMap.has(pathname)) {
        const postEndpoint = streamPathMap.get(pathname) ?? "/messages";

        logger.debug("SSE client connecting", {
          type: "SSE_CLIENT_CONNECTING",
          pathname,
          postEndpoint,
        });

        // Create new McpServer instance for this session (like the working example)
        const server = this.createMcpServerForSession();

        // Create SSE transport
        const transport = new SSEServerTransport(postEndpoint, res, {
          allowedHosts: sseConfig.allowedHosts,
          allowedOrigins: sseConfig.allowedOrigins,
          enableDnsRebindingProtection: sseConfig.enableDnsRebindingProtection,
        });

        const sessionId = transport.sessionId;
        logger.info("New SSE session created", {
          type: "SSE_SESSION_CREATED",
          sessionId,
          pathname,
        });

        // Store transport and server for this session
        this.sseSessions.set(sessionId, {
          server,
          transport,
        });

        // Connect transport to server (using server.server like in the example)
        try {
          await server.server.connect(transport);
          logger.info("SSE transport connected", {
            type: "SSE_CONNECTION_READY",
            sessionId,
            pathname,
            postEndpoint,
          });
        } catch (error) {
          logger.error("Failed to connect SSE transport", {
            type: "SSE_CONNECT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
          this.sseSessions.delete(sessionId);
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
          return;
        }

        // Cleanup on connection close
        res.on("close", () => {
          logger.info("SSE connection closed", {
            type: "SSE_CONNECTION_CLOSED",
            sessionId,
            pathname,
          });
          this.sseSessions.delete(sessionId);
          server.server.close();
        });

        transport.onerror = (error) => {
          logger.error("SSE transport error", {
            type: "SSE_TRANSPORT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
        };

        return;
      }

      // POST /messages or /mcp/messages - handle client messages
      if (req.method === "POST" && postPathSet.has(pathname)) {
        // Extract sessionId from query string or header
        let sessionId: string | undefined;
        if (requestUrl) {
          sessionId = requestUrl.searchParams.get("sessionId") || undefined;
        }
        if (!sessionId) {
          sessionId = req.headers["x-session-id"] as string | undefined;
        }

        logger.debug("SSE POST request received", {
          type: "SSE_POST_REQUEST",
          sessionId,
          pathname,
        });

        if (!sessionId || !this.sseSessions.has(sessionId)) {
          logger.error("Invalid or missing SSE session", {
            type: "SSE_INVALID_SESSION",
            sessionId,
          });
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Invalid or missing sessionId",
              },
              id: null,
            })
          );
          return;
        }

        const session = this.sseSessions.get(sessionId)!;
        const { transport } = session;

        try {
          // Read request body
          let body: any = null;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            const bodyString = Buffer.concat(chunks).toString('utf-8');
            try {
              body = JSON.parse(bodyString);
            } catch (parseError) {
              body = bodyString || null;
            }
          }

          // Handle POST message through transport (like the working example)
          await transport.handlePostMessage(req, res, body);

          logger.debug("SSE POST request processed", {
            type: "SSE_POST_PROCESSED",
            sessionId,
          });
        } catch (error) {
          logger.error("Failed to handle SSE POST message", {
            type: "SSE_POST_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
        return;
      }

      // OPTIONS - CORS preflight
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

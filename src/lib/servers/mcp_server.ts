#!/usr/bin/env node
// Simple stdio mode detection (like reference implementation)
// No output suppression needed - dotenv removed, manual .env parsing used

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as z from "zod";
import path from "path";
import * as os from "os";
// dotenv removed - using manual .env parsing for all modes to avoid stdout pollution
import { createServer, Server as HttpServer, IncomingHttpHeaders } from "http";
import { randomUUID } from "crypto";
import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { validateAuthHeaders, AuthMethodPriority } from "@mcp-abap-adt/header-validator";
import {
  HEADER_MCP_DESTINATION,
  HEADER_SAP_DESTINATION_SERVICE,
  HEADER_SAP_URL,
  HEADER_SAP_AUTH_TYPE,
  HEADER_SAP_JWT_TOKEN,
  HEADER_SAP_LOGIN,
  HEADER_SAP_PASSWORD,
  HEADER_SAP_REFRESH_TOKEN,
  HEADER_SAP_UAA_CLIENT_SECRET,
  HEADER_AUTHORIZATION,
} from "@mcp-abap-adt/interfaces";
import { getPlatformStoresAsync } from "../stores";
import { getPlatformPaths } from "../stores/platformPaths";
import { BtpTokenProvider } from "@mcp-abap-adt/auth-providers";
import { defaultLogger } from "@mcp-abap-adt/logger";
import {
  buildRuntimeConfig,
} from "../runtimeConfig";
import {
  parseConfigArg,
  loadYamlConfig,
  generateConfigTemplateIfNeeded,
  applyYamlConfigToArgs,
} from "../yamlConfig";

// Import shared utility functions and types
import {
  setConfigOverride,
  sessionContext,
  removeConnectionForSession,
  setConnectionOverride,
} from "../utils";
import { SapConfig, AbapConnection } from "@mcp-abap-adt/connection";

// Import logger
import { logger } from "../logger";

import { McpHandlers } from "./mcp_handlers";
import { TransportConfig } from "./utils";

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class mcp_abap_adt_server {
}

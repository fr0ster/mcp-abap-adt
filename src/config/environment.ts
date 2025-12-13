/**
 * Environment configuration and SAP config management
 */

import fs from "fs";
import path from "path";
import { SapConfig } from "@mcp-abap-adt/connection";
import { logger } from "../lib/logger";

// Config override for testing
let sapConfigOverride: SapConfig | undefined;

/**
 * Helper function for Windows-compatible debug logging
 * Only logs when DEBUG_CONNECTORS, DEBUG_TESTS, or DEBUG_ADT_TESTS is enabled
 */
function debugLog(message: string): void {
  const debugEnabled = process.env.DEBUG_CONNECTORS === 'true' ||
                       process.env.DEBUG_TESTS === 'true' ||
                       process.env.DEBUG_ADT_TESTS === 'true';

  if (!debugEnabled) {
    return;
  }

  try {
    process.stderr.write(message);
  } catch (e) {
    console.error(message.trim());
  }

  if (process.platform === 'win32') {
    try {
      const debugFile = path.join(process.cwd(), 'mcp-debug.log');
      fs.appendFileSync(debugFile, `${new Date().toISOString()} ${message}`, 'utf8');
    } catch (e) {
      // Ignore file write errors
    }
  }
}

/**
 * Set SAP config override (for testing)
 */
export function setSapConfigOverride(config?: SapConfig): void {
  sapConfigOverride = config;
}

/**
 * Get current SAP config override
 */
export function getSapConfigOverride(): SapConfig | undefined {
  return sapConfigOverride;
}

/**
 * Retrieves SAP configuration from environment variables.
 * Reads configuration from process.env (caller is responsible for loading .env file if needed).
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function getConfig(): SapConfig {
  debugLog(`[MCP-CONFIG] getConfig() called\n`);

  if (sapConfigOverride) {
    debugLog(`[MCP-CONFIG] Using override config\n`);
    return sapConfigOverride;
  }

  // Read from process.env (already loaded and cleaned by launcher or at startup)
  let url = process.env.SAP_URL;
  let client = process.env.SAP_CLIENT;

  debugLog(`[MCP-CONFIG] Raw process.env.SAP_URL: "${url}" (type: ${typeof url}, length: ${url?.length || 0})\n`);

  // URLs from .env files are expected to be clean - just trim
  if (url) {
    url = url.trim();
  } else {
    debugLog(`[MCP-CONFIG] SAP_URL is missing from process.env\n`);
    debugLog(`[MCP-CONFIG] Available env vars: ${Object.keys(process.env).filter(k => k.startsWith('SAP_')).join(', ')}\n`);
  }

  if (client) {
    client = client.trim();
  }

  // Auto-detect auth type: if JWT token is present, use JWT; otherwise check SAP_AUTH_TYPE or default to basic
  let authType: SapConfig["authType"] = 'basic';
  if (process.env.SAP_JWT_TOKEN) {
    authType = 'jwt';
  } else if (process.env.SAP_AUTH_TYPE) {
    const rawAuthType = process.env.SAP_AUTH_TYPE.trim();
    authType = rawAuthType === 'xsuaa' ? 'jwt' : (rawAuthType as SapConfig["authType"]);
  }

  if (!url) {
    throw new Error(`Missing SAP_URL in environment variables. Please check your .env file.`);
  }

  // Final validation - URL should be clean now
  if (!/^https?:\/\//.test(url)) {
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(`Invalid SAP_URL format: "${url}" (hex: ${urlHex.substring(0, 100)}...). Expected format: https://your-system.sap.com`);
  }

  // Additional validation: try to create URL object to catch any remaining issues
  try {
    const testUrl = new URL(url);
    url = testUrl.href.replace(/\/$/, ''); // Remove trailing slash if present
  } catch (urlError) {
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(`Invalid SAP_URL: "${url}" (hex: ${urlHex.substring(0, 100)}...). Error: ${urlError instanceof Error ? urlError.message : urlError}`);
  }

  debugLog(`[MCP-CONFIG] Final SAP_URL: "${url}" (length: ${url.length})\n`);

  const config: SapConfig = {
    url,
    authType,
  };

  if (client) {
    config.client = client;
  }

  if (authType === 'jwt') {
    const jwtToken = process.env.SAP_JWT_TOKEN;
    if (!jwtToken) {
      throw new Error('Missing SAP_JWT_TOKEN for JWT authentication');
    }
    config.jwtToken = jwtToken.trim();
    const refreshToken = process.env.SAP_REFRESH_TOKEN;
    if (refreshToken) {
      config.refreshToken = refreshToken.trim();
    }
    const uaaUrl = process.env.SAP_UAA_URL || process.env.UAA_URL;
    const uaaClientId = process.env.SAP_UAA_CLIENT_ID || process.env.UAA_CLIENT_ID;
    const uaaClientSecret = process.env.SAP_UAA_CLIENT_SECRET || process.env.UAA_CLIENT_SECRET;
    if (uaaUrl) config.uaaUrl = uaaUrl.trim();
    if (uaaClientId) config.uaaClientId = uaaClientId.trim();
    if (uaaClientSecret) config.uaaClientSecret = uaaClientSecret.trim();
  } else {
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing SAP_USERNAME or SAP_PASSWORD for basic authentication');
    }
    config.username = username.trim();
    config.password = password.trim();
  }

  return config;
}

/**
 * Parse .env file content and set environment variables
 */
export function parseEnvContent(envContent: string, isStdio: boolean): void {
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1);

    // Remove inline comments
    const commentIndex = value.indexOf('#');
    if (commentIndex !== -1) {
      const beforeComment = value.substring(0, commentIndex);
      value = beforeComment.trim();
    } else {
      value = value.trim();
    }

    // Parse value: remove quotes and trim
    let unquotedValue = value.trim();
    unquotedValue = unquotedValue.replace(/^["']+|["']+$/g, '').trim();

    // Debug logging for SAP_URL on Windows
    if (key === 'SAP_URL' && process.platform === 'win32' && !isStdio) {
      process.stderr.write(`[MCP-ENV] Parsed SAP_URL: "${unquotedValue}" (length: ${unquotedValue.length})\n`);
    }

    // Only set if not already in process.env
    if (key && !process.env[key]) {
      process.env[key] = unquotedValue;
    }
  }
}

/**
 * Load .env file and set environment variables
 */
export function loadEnvFile(envFilePath: string, isStdio: boolean): boolean {
  if (!fs.existsSync(envFilePath)) {
    return false;
  }

  try {
    const envContent = fs.readFileSync(envFilePath, "utf8");
    parseEnvContent(envContent, isStdio);

    if (!isStdio) {
      process.stderr.write(`[MCP-ENV] Successfully loaded: ${envFilePath}\n`);
      if (process.env.SAP_URL) {
        process.stderr.write(`[MCP-ENV] SAP_URL loaded: "${process.env.SAP_URL}" (length: ${process.env.SAP_URL.length})\n`);
      } else {
        process.stderr.write(`[MCP-ENV] WARNING: SAP_URL not found in .env file\n`);
      }
    }
    return true;
  } catch (error) {
    if (!isStdio) {
      process.stderr.write(`[MCP-ENV] Failed to load: ${envFilePath}\n`);
      if (error instanceof Error) {
        process.stderr.write(`[MCP-ENV] Error: ${error.message}\n`);
      }
    }
    return false;
  }
}

/**
 * Resolve .env file path from arguments and check existence
 */
export function resolveEnvFilePath(
  initialEnvFilePath: string | undefined,
  isStdio: boolean
): string | undefined {
  let envFilePath = initialEnvFilePath;

  // Debug: Log on Windows
  if (process.platform === 'win32' && !isStdio) {
    process.stderr.write(`[MCP-ENV] Initial envFilePath: ${envFilePath || '(undefined)'}\n`);
  }

  if (!envFilePath) {
    // Search in current working directory
    const cwdEnvPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(cwdEnvPath)) {
      envFilePath = cwdEnvPath;
      if (!isStdio) {
        process.stderr.write(`[MCP-ENV] Found .env file: ${envFilePath}\n`);
      }
    }
  } else {
    if (!isStdio) {
      process.stderr.write(`[MCP-ENV] Using .env from argument/env: ${envFilePath}\n`);
    }
  }

  if (envFilePath) {
    // Normalize path for cross-platform compatibility
    const normalizedPath = envFilePath.replace(/\\/g, '/');

    if (!path.isAbsolute(normalizedPath)) {
      envFilePath = path.resolve(process.cwd(), normalizedPath);
      if (!isStdio) {
        process.stderr.write(`[MCP-ENV] Resolved relative path to: ${envFilePath}\n`);
      }
    } else {
      envFilePath = path.normalize(envFilePath);
    }

    // Verify file exists
    if (!fs.existsSync(envFilePath)) {
      const errorMsg = `[MCP-ENV] ERROR: .env file not found at: ${envFilePath}\n` +
                      `[MCP-ENV]   Current working directory: ${process.cwd()}\n`;
      process.stderr.write(errorMsg);
      return undefined;
    }
  }

  return envFilePath;
}

/**
 * Log SAP configuration (for debugging)
 */
export function logSapConfig(envFilePath: string | undefined, transportType: string): void {
  const envLogPath = envFilePath ?? "(skipped)";
  logger.info("SAP configuration loaded", {
    type: "CONFIG_INFO",
    SAP_URL: process.env.SAP_URL,
    SAP_CLIENT: process.env.SAP_CLIENT || "(not set)",
    SAP_AUTH_TYPE: process.env.SAP_AUTH_TYPE || "(not set)",
    SAP_JWT_TOKEN: process.env.SAP_JWT_TOKEN ? "[set]" : "(not set)",
    ENV_PATH: envLogPath,
    CWD: process.cwd(),
    TRANSPORT: transportType
  });
}

/**
 * Configuration module for SAP connection
 *
 * Extracted from index.ts to avoid circular dependencies
 * when v2 server imports handlers that use lib/utils
 */

import type { SapConfig } from '@mcp-abap-adt/connection';

// Don't import setConfigOverride from utils.ts to avoid circular dependency
// setConfigOverride will be called lazily if needed

let sapConfigOverride: SapConfig | undefined;

function debugLog(message: string): void {
  // Only log if DEBUG_CONNECTORS is enabled
  const debugEnabled =
    process.env.DEBUG_CONNECTORS === 'true' ||
    process.env.DEBUG_TESTS === 'true' ||
    process.env.DEBUG_ADT_TESTS === 'true';
  if (debugEnabled) {
    process.stderr.write(message);
  }
}

export function getConfig(): SapConfig {
  debugLog(`[MCP-CONFIG] getConfig() called\n`);

  if (sapConfigOverride) {
    debugLog(`[MCP-CONFIG] Using override config\n`);
    return sapConfigOverride;
  }

  // Read from process.env (already loaded and cleaned by launcher or at startup)
  // No need to reload .env here - it's already in process.env
  let url = process.env.SAP_URL;
  let client = process.env.SAP_CLIENT;

  debugLog(
    `[MCP-CONFIG] Raw process.env.SAP_URL: "${url}" (type: ${typeof url}, length: ${url?.length || 0})\n`,
  );

  // URLs from .env files are expected to be clean - just trim
  if (url) {
    url = url.trim();
  } else {
    // Log if URL is missing
    debugLog(`[MCP-CONFIG] ✗ SAP_URL is missing from process.env\n`);
    debugLog(
      `[MCP-CONFIG] Available env vars: ${Object.keys(process.env)
        .filter((k) => k.startsWith('SAP_'))
        .join(', ')}\n`,
    );
  }

  if (client) {
    client = client.trim();
  }

  // Auto-detect auth type: if JWT token is present, use JWT; otherwise check SAP_AUTH_TYPE or default to basic
  let authType: SapConfig['authType'] = 'basic';
  if (process.env.SAP_JWT_TOKEN) {
    authType = 'jwt';
  } else if (process.env.SAP_AUTH_TYPE) {
    const rawAuthType = process.env.SAP_AUTH_TYPE.trim();
    authType =
      rawAuthType === 'xsuaa' ? 'jwt' : (rawAuthType as SapConfig['authType']);
  }

  if (!url) {
    throw new Error(
      `Missing SAP_URL in environment variables. Please check your .env file.`,
    );
  }

  // Final validation - URL should be clean now
  if (!/^https?:\/\//.test(url)) {
    // Log URL in hex for debugging
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(
      `Invalid SAP_URL format: "${url}" (hex: ${urlHex.substring(0, 100)}...). Expected format: https://your-system.sap.com`,
    );
  }

  // Additional validation: try to create URL object to catch any remaining issues
  try {
    const testUrl = new URL(url);
    // If URL object creation succeeds, use the normalized URL
    url = testUrl.href.replace(/\/$/, ''); // Remove trailing slash if present
  } catch (urlError) {
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(
      `Invalid SAP_URL: "${url}" (hex: ${urlHex.substring(0, 100)}...). Error: ${urlError instanceof Error ? urlError.message : urlError}`,
    );
  }

  // Log URL for debugging
  debugLog(`[MCP-CONFIG] Final SAP_URL: "${url}" (length: ${url.length})\n`);

  const config: SapConfig = {
    url, // Already cleaned and validated above
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
    // Values from .env are expected to be clean
    config.jwtToken = jwtToken.trim();
    const refreshToken = process.env.SAP_REFRESH_TOKEN;
    if (refreshToken) {
      config.refreshToken = refreshToken.trim();
    }
    const uaaUrl = process.env.SAP_UAA_URL || process.env.UAA_URL;
    const uaaClientId =
      process.env.SAP_UAA_CLIENT_ID || process.env.UAA_CLIENT_ID;
    const uaaClientSecret =
      process.env.SAP_UAA_CLIENT_SECRET || process.env.UAA_CLIENT_SECRET;
    if (uaaUrl) config.uaaUrl = uaaUrl.trim();
    if (uaaClientId) config.uaaClientId = uaaClientId.trim();
    if (uaaClientSecret) config.uaaClientSecret = uaaClientSecret.trim();
  } else {
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'Missing SAP_USERNAME or SAP_PASSWORD for basic authentication',
      );
    }
    config.username = username.trim();
    config.password = password.trim();
  }

  return config;
}

export function setSapConfigOverride(config?: SapConfig) {
  sapConfigOverride = config;
  // Lazy import setConfigOverride to avoid circular dependency
  // Only import when actually needed (when config is set)
  if (config !== undefined) {
    const { setConfigOverride } = require('./utils.js');
    setConfigOverride(config);
  }
}

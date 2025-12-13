/**
 * YAML configuration file support for mcp-abap-adt
 * Allows loading startup parameters from YAML file instead of command-line arguments
 */

import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

export interface YamlConfig {
  transport?: string;
  mcp?: string;
  env?: string;
  unsafe?: boolean;
  "auth-broker"?: boolean;
  "auth-broker-path"?: string;
  http?: {
    port?: number;
    host?: string;
    "json-response"?: boolean;
    "allowed-origins"?: string[];
    "allowed-hosts"?: string[];
    "enable-dns-protection"?: boolean;
  };
  sse?: {
    port?: number;
    host?: string;
    "allowed-origins"?: string[];
    "allowed-hosts"?: string[];
    "enable-dns-protection"?: boolean;
  };
}

/**
 * Parse --config argument from command line
 */
export function parseConfigArg(): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--config=")) {
      return arg.slice("--config=".length);
    } else if (arg === "--config" && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

/**
 * Validate YAML configuration
 * @returns Object with valid flag and array of error messages
 */
export function validateYamlConfig(config: YamlConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate transport
  if (config.transport) {
    const validTransports = ["stdio", "http", "streamable-http", "sse"];
    if (!validTransports.includes(config.transport)) {
      errors.push(
        `Invalid transport: "${config.transport}". Must be one of: ${validTransports.join(", ")}`
      );
    }
  }

  // Validate HTTP port
  if (config.http?.port !== undefined) {
    const port = config.http.port;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push(`Invalid HTTP port: ${port}. Must be between 1 and 65535`);
    }
  }

  // Validate HTTP host
  if (config.http?.host) {
    const host = config.http.host;
    if (host !== "127.0.0.1" && host !== "0.0.0.0" && host !== "localhost" && host !== "::") {
      // Allow other hosts but warn (validation passes, just log)
      // This allows custom hostnames/IPs
    }
  }

  // Validate SSE port
  if (config.sse?.port !== undefined) {
    const port = config.sse.port;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push(`Invalid SSE port: ${port}. Must be between 1 and 65535`);
    }
  }

  // Validate SSE host
  if (config.sse?.host) {
    const host = config.sse.host;
    if (host !== "127.0.0.1" && host !== "0.0.0.0" && host !== "localhost" && host !== "::") {
      // Allow other hosts but warn (validation passes, just log)
      // This allows custom hostnames/IPs
    }
  }

  // Validate that HTTP and SSE ports are different if both are set
  if (config.http?.port && config.sse?.port) {
    if (config.http.port === config.sse.port) {
      errors.push(`HTTP port and SSE port cannot be the same: ${config.http.port}`);
    }
  }

  // Validate allowed-origins format (should be array or string)
  if (config.http?.["allowed-origins"]) {
    const origins = config.http["allowed-origins"];
    if (!Array.isArray(origins) && typeof origins !== "string") {
      errors.push(`HTTP allowed-origins must be an array or comma-separated string`);
    }
  }

  if (config.sse?.["allowed-origins"]) {
    const origins = config.sse["allowed-origins"];
    if (!Array.isArray(origins) && typeof origins !== "string") {
      errors.push(`SSE allowed-origins must be an array or comma-separated string`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load YAML configuration from file
 */
export function loadYamlConfig(configPath: string): YamlConfig | null {
  try {
    const resolvedPath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    const config = parseYaml(fileContent) as YamlConfig;

    // Validate configuration
    const validation = validateYamlConfig(config);
    if (!validation.valid) {
      throw new Error(
        `YAML config validation failed:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`
      );
    }

    return config;
  } catch (error) {
    throw new Error(
      `Failed to load YAML config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate YAML configuration template
 */
export function generateYamlConfigTemplate(): string {
  return `# MCP ABAP ADT Server Configuration
# This file contains startup parameters for the MCP ABAP ADT server
# Command-line arguments override values from this file

# Transport type: stdio | http | streamable-http | sse
# Default: stdio (for MCP clients)
transport: stdio

# Default MCP destination (uses auth-broker)
# If not specified, will use .env file if available
mcp:

# Path to .env file (alternative to mcp destination)
# If not specified, will look for .env in current directory
env:

# Use unsafe mode (file-based session store instead of in-memory)
# Default: false
unsafe: false

# Force use of auth-broker (service keys) instead of .env file
# Default: false
auth-broker: false

# Custom path for auth-broker storage
# If not specified, uses platform-specific default paths
auth-broker-path:

# HTTP/StreamableHTTP transport options
http:
  # Server port
  port: 3000

  # Server host
  # 127.0.0.1 (default) - localhost only (secure, uses default destination)
  # 0.0.0.0 - all interfaces (less secure, client must provide all headers)
  host: 127.0.0.1

  # Enable JSON response format
  json-response: false

  # Allowed CORS origins (comma-separated or array)
  allowed-origins: []

  # Allowed hosts (comma-separated or array)
  allowed-hosts: []

  # Enable DNS rebinding protection
  enable-dns-protection: false

# SSE (Server-Sent Events) transport options
sse:
  # Server port
  port: 3001

  # Server host
  # 127.0.0.1 (default) - localhost only (secure, uses default destination)
  # 0.0.0.0 - all interfaces (less secure, client must provide all headers)
  host: 127.0.0.1

  # Allowed CORS origins (comma-separated or array)
  allowed-origins: []

  # Allowed hosts (comma-separated or array)
  allowed-hosts: []

  # Enable DNS rebinding protection
  enable-dns-protection: false

# Examples:
#
# stdio mode with MCP destination:
# transport: stdio
# mcp: TRIAL
#
# HTTP mode with custom port:
# transport: http
# http:
#   port: 8080
#
# SSE mode with CORS:
# transport: sse
# sse:
#   port: 3001
#   allowed-origins:
#     - http://localhost:3000
#     - http://localhost:5173
`;
}

/**
 * Generate YAML config template file if it doesn't exist
 * @returns true if template was generated (file didn't exist), false if file already existed
 */
export function generateConfigTemplateIfNeeded(configPath: string): boolean {
  const resolvedPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolvedPath)) {
    const template = generateYamlConfigTemplate();
    fs.writeFileSync(resolvedPath, template, "utf-8");
    process.stderr.write(`[MCP-CONFIG] Generated YAML config template: ${resolvedPath}\n`);
    process.stderr.write(`[MCP-CONFIG] Please edit the file and fill in your configuration.\n`);
    return true;
  }
  return false;
}

/**
 * Apply YAML config values to process.argv (for compatibility with existing parsers)
 * Only applies values that are not already set in command-line arguments
 */
export function applyYamlConfigToArgs(config: YamlConfig): void {
  // Helper to check if argument exists
  const hasArg = (name: string): boolean => {
    return process.argv.some(
      (arg) => arg === name || arg.startsWith(`${name}=`)
    );
  };

  // Helper to add argument if not present
  const addArg = (name: string, value: string | number | boolean): void => {
    if (!hasArg(name)) {
      if (typeof value === "boolean" && value) {
        process.argv.push(name);
      } else if (typeof value !== "boolean") {
        process.argv.push(`${name}=${value}`);
      }
    }
  };

  // Apply transport
  if (config.transport && !hasArg("--transport")) {
    addArg("--transport", config.transport);
  }

  // Apply mcp destination
  if (config.mcp && !hasArg("--mcp")) {
    addArg("--mcp", config.mcp);
  }

  // Apply env path
  if (config.env && !hasArg("--env")) {
    addArg("--env", config.env);
  }

  // Apply unsafe flag
  if (config.unsafe && !hasArg("--unsafe")) {
    addArg("--unsafe", true);
  }

  // Apply auth-broker flag
  if (config["auth-broker"] && !hasArg("--auth-broker")) {
    addArg("--auth-broker", true);
  }

  // Apply auth-broker-path
  if (config["auth-broker-path"] && !hasArg("--auth-broker-path")) {
    addArg("--auth-broker-path", config["auth-broker-path"]);
  }

  // Apply HTTP options
  if (config.http) {
    if (config.http.port && !hasArg("--http-port")) {
      addArg("--http-port", config.http.port);
    }
    if (config.http.host && !hasArg("--http-host")) {
      addArg("--http-host", config.http.host);
    }
    if (config.http["json-response"] && !hasArg("--http-json-response")) {
      addArg("--http-json-response", true);
    }
    if (config.http["allowed-origins"] && !hasArg("--http-allowed-origins")) {
      const origins = Array.isArray(config.http["allowed-origins"])
        ? config.http["allowed-origins"].join(",")
        : config.http["allowed-origins"];
      addArg("--http-allowed-origins", origins);
    }
    if (config.http["allowed-hosts"] && !hasArg("--http-allowed-hosts")) {
      const hosts = Array.isArray(config.http["allowed-hosts"])
        ? config.http["allowed-hosts"].join(",")
        : config.http["allowed-hosts"];
      addArg("--http-allowed-hosts", hosts);
    }
    if (config.http["enable-dns-protection"] && !hasArg("--http-enable-dns-protection")) {
      addArg("--http-enable-dns-protection", true);
    }
  }

  // Apply SSE options
  if (config.sse) {
    if (config.sse.port && !hasArg("--sse-port")) {
      addArg("--sse-port", config.sse.port);
    }
    if (config.sse.host && !hasArg("--sse-host")) {
      addArg("--sse-host", config.sse.host);
    }
    if (config.sse["allowed-origins"] && !hasArg("--sse-allowed-origins")) {
      const origins = Array.isArray(config.sse["allowed-origins"])
        ? config.sse["allowed-origins"].join(",")
        : config.sse["allowed-origins"];
      addArg("--sse-allowed-origins", origins);
    }
    if (config.sse["allowed-hosts"] && !hasArg("--sse-allowed-hosts")) {
      const hosts = Array.isArray(config.sse["allowed-hosts"])
        ? config.sse["allowed-hosts"].join(",")
        : config.sse["allowed-hosts"];
      addArg("--sse-allowed-hosts", hosts);
    }
    if (config.sse["enable-dns-protection"] && !hasArg("--sse-enable-dns-protection")) {
      addArg("--sse-enable-dns-protection", true);
    }
  }
}


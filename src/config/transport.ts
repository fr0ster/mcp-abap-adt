/**
 * Transport configuration types and parsing utilities
 */

/**
 * Transport configuration types
 */
export type TransportConfig =
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

/**
 * Get argument value from command line
 */
export function getArgValue(name: string): string | undefined {
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

/**
 * Check if a flag is present in command line arguments
 */
export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Parse boolean value from string
 */
export function parseBoolean(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Resolve port option from arguments or environment
 */
export function resolvePortOption(argName: string, envName: string, defaultValue: number): number {
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

/**
 * Resolve boolean option from arguments or environment
 */
export function resolveBooleanOption(argName: string, envName: string, defaultValue: boolean): boolean {
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

/**
 * Resolve list option from arguments or environment (comma-separated)
 */
export function resolveListOption(argName: string, envName: string): string[] | undefined {
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

/**
 * Parse transport configuration from command line and environment
 */
export function parseTransportConfig(transportType: string): TransportConfig {
  const normalized = transportType;

  if (
    normalized &&
    normalized !== "stdio" &&
    normalized !== "http" &&
    normalized !== "streamable-http" &&
    normalized !== "server" &&
    normalized !== "sse"
  ) {
    throw new Error(`Unsupported transport: ${normalized}`);
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
    hasFlag("--http") ||
    // Default to HTTP if not stdio/sse
    (!sseRequested && normalized !== "stdio");

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

/**
 * Unified CLI arguments parser
 * Parses command-line arguments and environment variables
 * Used by both old server (mcp_abap_adt_server) and new servers
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveEnvFilePath } from './envResolver';

export interface ParsedArguments {
  /** Default MCP destination from --mcp parameter */
  mcp?: string;
  /** Path to .env file */
  env?: string;
  /** Custom path for auth broker storage */
  authBrokerPath?: string;
  /** Use unsafe mode */
  unsafe: boolean;
  /** Use auth-broker instead of .env file */
  useAuthBroker: boolean;
  /** Transport type */
  transport?: string;
  /** Path to YAML config file */
  config?: string;
  /** HTTP port */
  httpPort?: number;
  /** HTTP host */
  httpHost?: string;
  /** HTTP JSON response */
  httpJsonResponse?: boolean;
  /** HTTP allowed origins */
  httpAllowedOrigins?: string[];
  /** HTTP allowed hosts */
  httpAllowedHosts?: string[];
  /** HTTP enable DNS protection */
  httpEnableDnsProtection?: boolean;
  /** SSE port */
  ssePort?: number;
  /** SSE host */
  sseHost?: string;
  /** SSE allowed origins */
  sseAllowedOrigins?: string[];
  /** SSE allowed hosts */
  sseAllowedHosts?: string[];
  /** SSE enable DNS protection */
  sseEnableDnsProtection?: boolean;
}

export class ArgumentsParser {
  /**
   * Parse command-line arguments and environment variables
   */
  static parse(): ParsedArguments {
    const args = process.argv;
    const result: ParsedArguments = {
      unsafe: false,
      useAuthBroker: false,
    };

    // Helper to get argument value
    const getArgValue = (name: string): string | undefined => {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith(`${name}=`)) {
          return arg.slice(`${name}=`.length);
        } else if (arg === name && i + 1 < args.length) {
          return args[i + 1];
        }
      }
      return undefined;
    };

    // Helper to check if flag exists
    const hasFlag = (name: string): boolean => {
      return args.includes(name);
    };

    // Helper to resolve port option
    const resolvePortOption = (
      argName: string,
      envName: string,
      defaultValue: number,
    ): number => {
      const argValue = getArgValue(argName);
      if (argValue) {
        const port = parseInt(argValue, 10);
        if (!Number.isNaN(port) && port > 0 && port <= 65535) {
          return port;
        }
      }
      const envValue = process.env[envName];
      if (envValue) {
        const port = parseInt(envValue, 10);
        if (!Number.isNaN(port) && port > 0 && port <= 65535) {
          return port;
        }
      }
      return defaultValue;
    };

    // Helper to resolve list option
    const resolveListOption = (
      argName: string,
      envName: string,
    ): string[] | undefined => {
      const argValue = getArgValue(argName);
      const envValue = process.env[envName];
      const combined = argValue || envValue;
      if (!combined) return undefined;
      const items = combined
        .split(/[,;]/)
        .map((item) => item.trim())
        .filter((entry) => entry.length > 0);
      return items.length > 0 ? items : undefined;
    };

    // Helper to resolve boolean option
    const resolveBooleanOption = (
      argName: string,
      envName: string,
      defaultValue: boolean,
    ): boolean => {
      if (hasFlag(argName)) return true;
      const envValue = process.env[envName];
      if (envValue === 'true') return true;
      if (envValue === 'false') return false;
      return defaultValue;
    };

    // Parse --mcp
    result.mcp = getArgValue('--mcp');

    // Parse --auth-broker-path
    result.authBrokerPath = getArgValue('--auth-broker-path');

    // Parse --env and --env-path
    // --env: destination name (resolved to sessions/<name>.env in platform path)
    // --env-path: explicit file path or file name (resolved against cwd if relative)
    const envDestination = getArgValue('--env');
    const envPathArg = getArgValue('--env-path');
    const envPathFromEnv = process.env.MCP_ENV_PATH;

    const resolvedEnv = resolveEnvFilePath({
      envDestination,
      envPath: envPathArg || envPathFromEnv,
      authBrokerPath: result.authBrokerPath,
    });

    if (resolvedEnv) {
      result.env = resolvedEnv;
    } else {
      // Backward-compatible fallback: .env in current directory
      const cwdEnvPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(cwdEnvPath)) {
        result.env = cwdEnvPath;
      }
    }

    // Parse --unsafe
    result.unsafe = hasFlag('--unsafe') || process.env.MCP_UNSAFE === 'true';

    // Parse --auth-broker
    result.useAuthBroker =
      hasFlag('--auth-broker') || process.env.MCP_USE_AUTH_BROKER === 'true';

    // Parse --conf / --config
    result.config = getArgValue('--conf') || getArgValue('--config');

    // Parse transport
    result.transport = getArgValue('--transport') || process.env.MCP_TRANSPORT;
    // Auto-detect stdio mode when stdin is not a TTY
    if (!result.transport && !process.stdin.isTTY) {
      result.transport = 'stdio';
    }
    // Default to stdio if not specified
    if (!result.transport) {
      result.transport = 'stdio';
    }

    // Parse HTTP options
    result.httpPort = resolvePortOption('--http-port', 'MCP_HTTP_PORT', 3000);
    result.httpHost =
      getArgValue('--http-host') || process.env.MCP_HTTP_HOST || '127.0.0.1';
    result.httpJsonResponse = resolveBooleanOption(
      '--http-json-response',
      'MCP_HTTP_ENABLE_JSON_RESPONSE',
      false,
    );
    result.httpAllowedOrigins = resolveListOption(
      '--http-allowed-origins',
      'MCP_HTTP_ALLOWED_ORIGINS',
    );
    result.httpAllowedHosts = resolveListOption(
      '--http-allowed-hosts',
      'MCP_HTTP_ALLOWED_HOSTS',
    );
    result.httpEnableDnsProtection = resolveBooleanOption(
      '--http-enable-dns-protection',
      'MCP_HTTP_ENABLE_DNS_PROTECTION',
      false,
    );

    // Parse SSE options
    result.ssePort = resolvePortOption('--sse-port', 'MCP_SSE_PORT', 3001);
    result.sseHost =
      getArgValue('--sse-host') || process.env.MCP_SSE_HOST || '127.0.0.1';
    result.sseAllowedOrigins = resolveListOption(
      '--sse-allowed-origins',
      'MCP_SSE_ALLOWED_ORIGINS',
    );
    result.sseAllowedHosts = resolveListOption(
      '--sse-allowed-hosts',
      'MCP_SSE_ALLOWED_HOSTS',
    );
    result.sseEnableDnsProtection = resolveBooleanOption(
      '--sse-enable-dns-protection',
      'MCP_SSE_ENABLE_DNS_PROTECTION',
      false,
    );

    return result;
  }

  /**
   * Get argument value by name
   */
  static getArgument(name: string): string | undefined {
    const args = process.argv;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith(`${name}=`)) {
        return arg.slice(`${name}=`.length);
      } else if (arg === name && i + 1 < args.length) {
        return args[i + 1];
      }
    }
    return undefined;
  }

  /**
   * Check if flag exists
   */
  static hasFlag(name: string): boolean {
    return process.argv.includes(name);
  }
}

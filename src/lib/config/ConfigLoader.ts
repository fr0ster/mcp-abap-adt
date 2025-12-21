/**
 * Unified configuration loader
 * Loads YAML config and merges with CLI arguments (CLI overrides YAML)
 * Used by both old server (mcp_abap_adt_server) and new servers
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { ArgumentsParser, ParsedArguments } from "./ArgumentsParser.js";
import type { IServerConfig } from "../../server/v1/IServerConfig.js";
import { TransportConfig } from "../utils.js";
import { YamlConfig, loadYamlConfig, generateConfigTemplateIfNeeded } from "./yamlConfig.js";

export class ConfigLoader {
  /**
   * Load and merge configuration from CLI arguments and YAML file
   * CLI arguments override YAML values
   */
  static load(): IServerConfig {
    // Parse CLI arguments first
    const cliArgs = ArgumentsParser.parse();

    // Load YAML config if --config is specified
    let yamlConfig: YamlConfig | null = null;
    if (cliArgs.config) {
      try {
        // Generate template if file doesn't exist
        const templateGenerated = generateConfigTemplateIfNeeded(cliArgs.config);
        if (templateGenerated) {
          // Template was generated, exit (handled by caller)
          throw new Error("Config template generated");
        }

        // Load YAML config
        yamlConfig = loadYamlConfig(cliArgs.config);
      } catch (error) {
        // If template was generated, re-throw to let caller handle
        if (error instanceof Error && error.message === "Config template generated") {
          throw error;
        }
        // Otherwise, log warning and continue without YAML
        console.error(`[MCP-CONFIG] Failed to load YAML config: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Merge YAML into CLI args (CLI has priority)
    const mergedArgs = this.mergeConfig(cliArgs, yamlConfig);

    // Build transport config
    const transportConfig = this.buildTransportConfig(mergedArgs);

    // Build server config
    const config: IServerConfig = {
      defaultMcpDestination: mergedArgs.mcp,
      defaultDestination: mergedArgs.mcp || (mergedArgs.env ? undefined : undefined), // Will be resolved later
      envFilePath: mergedArgs.env,
      authBrokerPath: mergedArgs.authBrokerPath,
      unsafe: mergedArgs.unsafe,
      useAuthBroker: mergedArgs.useAuthBroker,
      transportConfig,
      transport: transportConfig.type === 'streamable-http' ? 'http' : transportConfig.type as 'stdio' | 'sse',
    };

    return config;
  }

  /**
   * Merge YAML config into CLI arguments (CLI overrides YAML)
   */
  private static mergeConfig(cliArgs: ParsedArguments, yamlConfig: YamlConfig | null): ParsedArguments {
    if (!yamlConfig) {
      return cliArgs;
    }

    const merged: ParsedArguments = { ...cliArgs };

    // Merge transport (CLI overrides YAML)
    if (!merged.transport && yamlConfig.transport) {
      merged.transport = yamlConfig.transport;
    }

    // Merge mcp destination (CLI overrides YAML)
    if (!merged.mcp && yamlConfig.mcp) {
      merged.mcp = yamlConfig.mcp;
    }

    // Merge env path (CLI overrides YAML)
    if (!merged.env && yamlConfig.env) {
      merged.env = yamlConfig.env;
    }

    // Merge unsafe flag (CLI overrides YAML)
    if (!merged.unsafe && yamlConfig.unsafe) {
      merged.unsafe = yamlConfig.unsafe;
    }

    // Merge auth-broker flag (CLI overrides YAML)
    if (!merged.useAuthBroker && yamlConfig["auth-broker"]) {
      merged.useAuthBroker = yamlConfig["auth-broker"];
    }

    // Merge auth-broker-path (CLI overrides YAML)
    if (!merged.authBrokerPath && yamlConfig["auth-broker-path"]) {
      merged.authBrokerPath = yamlConfig["auth-broker-path"];
    }

    // Merge HTTP options (CLI overrides YAML)
    if (yamlConfig.http) {
      if (!merged.httpPort && yamlConfig.http.port !== undefined) {
        merged.httpPort = yamlConfig.http.port;
      }
      if (!merged.httpHost && yamlConfig.http.host) {
        merged.httpHost = yamlConfig.http.host;
      }
      if (!merged.httpJsonResponse && yamlConfig.http["json-response"]) {
        merged.httpJsonResponse = yamlConfig.http["json-response"];
      }
      if (!merged.httpAllowedOrigins && yamlConfig.http["allowed-origins"]) {
        merged.httpAllowedOrigins = yamlConfig.http["allowed-origins"];
      }
      if (!merged.httpAllowedHosts && yamlConfig.http["allowed-hosts"]) {
        merged.httpAllowedHosts = yamlConfig.http["allowed-hosts"];
      }
      if (!merged.httpEnableDnsProtection && yamlConfig.http["enable-dns-protection"]) {
        merged.httpEnableDnsProtection = yamlConfig.http["enable-dns-protection"];
      }
    }

    // Merge SSE options (CLI overrides YAML)
    if (yamlConfig.sse) {
      if (!merged.ssePort && yamlConfig.sse.port !== undefined) {
        merged.ssePort = yamlConfig.sse.port;
      }
      if (!merged.sseHost && yamlConfig.sse.host) {
        merged.sseHost = yamlConfig.sse.host;
      }
      if (!merged.sseAllowedOrigins && yamlConfig.sse["allowed-origins"]) {
        merged.sseAllowedOrigins = yamlConfig.sse["allowed-origins"];
      }
      if (!merged.sseAllowedHosts && yamlConfig.sse["allowed-hosts"]) {
        merged.sseAllowedHosts = yamlConfig.sse["allowed-hosts"];
      }
      if (!merged.sseEnableDnsProtection && yamlConfig.sse["enable-dns-protection"]) {
        merged.sseEnableDnsProtection = yamlConfig.sse["enable-dns-protection"];
      }
    }

    return merged;
  }

  /**
   * Build transport configuration from parsed arguments
   */
  private static buildTransportConfig(args: ParsedArguments): TransportConfig {
    const transportType = args.transport || "stdio";

    // Normalize transport type
    let normalized = transportType;
    if (normalized === "http" || normalized === "server") {
      normalized = "streamable-http";
    }

    // Validate transport type
    if (
      normalized !== "stdio" &&
      normalized !== "streamable-http" &&
      normalized !== "sse"
    ) {
      throw new Error(`Unsupported transport: ${normalized}`);
    }

    // Build transport config based on type
    if (normalized === "sse") {
      return {
        type: "sse",
        host: args.sseHost || "127.0.0.1",
        port: args.ssePort || 3001,
        allowedOrigins: args.sseAllowedOrigins,
        allowedHosts: args.sseAllowedHosts,
        enableDnsRebindingProtection: args.sseEnableDnsProtection || false,
      };
    }

    if (normalized === "streamable-http") {
      return {
        type: "streamable-http",
        host: args.httpHost || "127.0.0.1",
        port: args.httpPort || 3000,
        enableJsonResponse: args.httpJsonResponse || false,
        allowedOrigins: args.httpAllowedOrigins,
        allowedHosts: args.httpAllowedHosts,
        enableDnsRebindingProtection: args.httpEnableDnsProtection || false,
      };
    }

    // stdio transport (default)
    return {
      type: "stdio",
    };
  }
}


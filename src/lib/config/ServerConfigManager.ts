/**
 * Server Configuration Manager
 *
 * Central configuration management for MCP ABAP ADT Server
 * Handles:
 * - Command line arguments parsing
 * - YAML configuration file loading (via yamlConfig DI)
 * - Configuration template generation (via yamlConfig DI)
 * - Handler exposition control
 *
 * Uses dependency injection pattern to reuse existing yamlConfig infrastructure
 */

import { ArgumentsParser } from './ArgumentsParser.js';
import { authParametersHelp } from './authParameters.js';
import type { HandlerSet, IServerConfig, Transport } from './IServerConfig.js';
import {
  applyYamlConfigToArgs,
  generateConfigTemplateIfNeeded,
  loadYamlConfig,
  parseConfigArg,
  type YamlConfig,
} from './yamlConfig.js';

export type { HandlerSet, Transport } from './IServerConfig.js';

// ============================================================================
// SERVER CONFIGURATION MANAGER CLASS
// ============================================================================

/**
 * Server Configuration Manager
 */
export class ServerConfigManager {
  private config: IServerConfig | null = null;
  private yamlConfig: YamlConfig | null = null;

  // --------------------------------------------------------------------------
  // PUBLIC API - Configuration Access
  // --------------------------------------------------------------------------

  /**
   * Get current configuration with async YAML support
   * Uses existing yamlConfig infrastructure via DI
   */
  async getConfig(): Promise<IServerConfig> {
    if (this.config) {
      return { ...this.config };
    }

    // Load and apply YAML config if specified
    this.loadYamlConfigIfNeeded();

    // Parse final config from process.argv (after YAML applied)
    this.config = this.parseCommandLine();
    return { ...this.config };
  }

  /**
   * Get current configuration synchronously (for backward compatibility)
   * Note: If used before getConfig(), will not include YAML config values
   */
  getConfigSync(): IServerConfig {
    if (!this.config) {
      this.config = this.parseCommandLine();
    }
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // PRIVATE - YAML Configuration Loading
  // --------------------------------------------------------------------------

  /**
   * Load YAML configuration if --conf parameter is present
   * Delegates to yamlConfig module via DI
   */
  private loadYamlConfigIfNeeded(): void {
    const configPath = parseConfigArg();
    if (!configPath) return;

    // Generate template if needed (from yamlConfig)
    const templateGenerated = generateConfigTemplateIfNeeded(configPath);
    if (templateGenerated) {
      process.stderr.write(
        '[MCP-CONFIG] Template generated. Edit it and rerun with --conf.\n',
      );
      process.exit(0);
    }

    // Load YAML config and apply to process.argv
    const yamlConfig = loadYamlConfig(configPath);
    if (yamlConfig) {
      // The auth parameters stay out of argv, so env still beats YAML for them
      this.yamlConfig = yamlConfig;
      applyYamlConfigToArgs(yamlConfig);
    }
  }

  // --------------------------------------------------------------------------
  // PRIVATE - Command Line Parsing
  // --------------------------------------------------------------------------

  /**
   * Parse command line arguments
   * Note: Should be called after applyYamlConfigToArgs for proper YAML support
   * Uses ArgumentsParser for unified CLI parsing
   */
  private parseCommandLine(): IServerConfig {
    // Use unified ArgumentsParser for CLI args
    const parsed = ArgumentsParser.parse(this.yamlConfig);

    const transport = this.parseTransport();
    const exposition = this.parseExposition();

    // Resolve final host/port in a transport-aware way: SSE must fall back to
    // the SSE-specific defaults/flags (--sse-host/--sse-port, MCP_SSE_HOST/PORT,
    // 3001) rather than the HTTP ones, so `--transport=sse` listens on 3001 and
    // the SSE flags/env actually take effect. The generic --host/--port still
    // win when provided.
    const isSse = transport === 'sse';
    const transportHost = isSse ? parsed.sseHost : parsed.httpHost;
    const transportPort = isSse ? parsed.ssePort : parsed.httpPort;
    const transportAllowedOrigins = isSse
      ? parsed.sseAllowedOrigins
      : parsed.httpAllowedOrigins;
    const transportAllowedHosts = isSse
      ? parsed.sseAllowedHosts
      : parsed.httpAllowedHosts;
    const transportEnableDns = isSse
      ? parsed.sseEnableDnsProtection
      : parsed.httpEnableDnsProtection;

    return {
      transport: transport || 'stdio',
      exposition: exposition.length > 0 ? exposition : ['readonly', 'high'],
      configFile: parseConfigArg(),
      host: ArgumentsParser.getArgument('--host') || transportHost,
      port: this.parsePort() || transportPort,
      allowedOrigins: transportAllowedOrigins,
      allowedHosts: transportAllowedHosts,
      enableDnsRebindingProtection: transportEnableDns ?? false,
      httpJsonResponse: parsed.httpJsonResponse || undefined,
      httpPath:
        ArgumentsParser.getArgument('--path') ||
        ArgumentsParser.getArgument('--http-path'),
      ssePath: ArgumentsParser.getArgument('--sse-path'),
      postPath: ArgumentsParser.getArgument('--post-path'),
      envFile: parsed.env,
      envFilePath: parsed.env,
      authBrokerPath: parsed.authBrokerPath,
      mcpDestination: parsed.mcp,
      unsafe: parsed.unsafe,
      browserAuthPort: parsed.browserAuthPort,
      allowDestinationHeader: parsed.allowDestinationHeader,
      browser: parsed.browser,
      envDestination: parsed.envDestination,
      envPath: parsed.envPath,
      envFileSource: parsed.envFileSource,
      connectionType: parsed.connectionType,
      connectionTypeSource: parsed.connectionTypeSource,
      systemType: parsed.systemType,
      systemTypeSource: parsed.systemTypeSource,
      tls:
        parsed.tlsCert && parsed.tlsKey
          ? {
              cert: parsed.tlsCert,
              key: parsed.tlsKey,
              ca: parsed.tlsCa,
            }
          : undefined,
    };
  }

  /**
   * Parse transport from command line or environment variable
   */
  private parseTransport(): Transport | undefined {
    // Priority 1: Command line argument --transport
    const cliValue = ArgumentsParser.getArgument('--transport');
    if (cliValue === 'sse') return 'sse';
    if (cliValue === 'http' || cliValue === 'streamable-http') return 'http';
    if (cliValue === 'stdio') return 'stdio';

    // Priority 2: Environment variable MCP_TRANSPORT
    const envValue = process.env.MCP_TRANSPORT;
    if (envValue === 'sse') return 'sse';
    if (envValue === 'http' || envValue === 'streamable-http') return 'http';
    if (envValue === 'stdio') return 'stdio';

    return undefined;
  }

  /**
   * Parse port from command line
   */
  private parsePort(): number | undefined {
    const port = ArgumentsParser.getArgument('--port');
    return port ? parseInt(port, 10) : undefined;
  }

  /**
   * Parse handler exposition from command line
   * Format: --exposition=readonly,high — a comma-separated list of
   * `readonly`, `high` and `low`, of which `high` and `low` are mutually
   * exclusive (`validateExposition` refuses the pair).
   *
   * `compact` is still ACCEPTED here on purpose, so `validateExposition` can refuse
   * it by name and say which command serves it. Dropping it from the filter would
   * turn a wrong value into silence — the exposition would come out empty and the
   * server would start with a tool list nobody asked for.
   */
  private parseExposition(): HandlerSet[] {
    const value = ArgumentsParser.getArgument('--exposition');
    if (!value) return [];

    return value
      .split(',')
      .map((s) => s.trim())
      .filter(
        (s): s is HandlerSet =>
          s === 'readonly' || s === 'high' || s === 'low' || s === 'compact',
      );
  }

  // --------------------------------------------------------------------------
  // STATIC - Help Text Generation
  // --------------------------------------------------------------------------

  /**
   * Get handler sets description for help text
   */
  static getHandlerSetsDescription(): string {
    return `
HANDLER EXPOSITION:
  --exposition=<sets>              Comma-separated handler sets to expose
                                   Options: readonly, high, low
                                   Default: readonly,high

                                   Handler Sets:
                                   - readonly: Get*, Check*, Validate*, Lock*, Unlock*
                                               (read operations, validation, locking)
                                               Also includes: search, system
                                   - high:     Create*, Update*High
                                               (safe create/update via ADT)
                                   - low:      Update*Low, Delete*, Activate*
                                               (direct/dangerous operations)
                                   - search:   SearchObject (included with readonly)
                                   - system:   GetWhereUsed, GetTypeInfo, GetObjectInfo,
                                               GetAbapAST, GetSession, etc.
                                               (included with readonly)

                                   Examples:
                                   --exposition=readonly       (readonly + search + system)
                                   --exposition=readonly,high  (readonly + high + search + system)
                                   --exposition=readonly,low   (readonly + low + search + system)
                                   --exposition=high           (high only, NO search/system)

                                   'high' and 'low' are mutually exclusive and the
                                   pair is refused at startup, so there is no value
                                   that serves every handler at once.

                                   The compact facade is NOT an exposition of this
                                   command any more. It is its own command, with
                                   that tool list as its default and no exposition
                                   to get wrong:
                                     npm i -g @mcp-abap-adt/compact
                                     mcp-abap-adt-compact
                                   This command refuses --exposition=compact and
                                   says the same.

                                   For details: docs/user-guide/HANDLERS_MANAGEMENT.md
`;
  }

  /**
   * Generate complete help text with all configuration options.
   *
   * `program` and `expositionSection` exist for the sibling command:
   * `mcp-abap-adt-compact` shares this launcher, so it shares this help — but it
   * must not print `mcp-abap-adt` in USAGE, and its exposition is a different
   * vocabulary: `ro` and `rw` over the compact facade rather than
   * `readonly`/`high`/`low` over the object-oriented one. It passes its own section;
   * an empty string prints none. A help text that documents values the command does
   * not accept is worse than no help.
   */
  static generateHelp(
    additionalSections?: string,
    options?: { program?: string; expositionSection?: string },
  ): string {
    const program = options?.program ?? 'mcp-abap-adt';
    return `
MCP ABAP ADT Server - SAP ABAP Development Tools MCP Integration

USAGE:
  ${program} [options]

DESCRIPTION:
  MCP server for interacting with SAP ABAP systems via ADT (ABAP Development Tools).
  Supports multiple transport modes and handler set filtering.

OPTIONS:
  --help, -h                       Show this help message
  --conf=<path>                    Path to YAML config file
                                   If file does not exist, a template will be generated
                                   Command line arguments override config file values

TRANSPORT SELECTION:
  --transport=<type>               Transport type: stdio|http|streamable-http|sse
                                   Default: stdio (for MCP clients)
  --host=<host>                    Server host (default: 127.0.0.1)
                                   Use 0.0.0.0 for all interfaces
  --port=<port>                    Server port (default: 3000 for http, 3001 for sse)
  --path=<path>                    HTTP endpoint path (default: /mcp/stream/http)
  --http-path=<path>               Alias for --path
  --sse-path=<path>                SSE connection path (default: /sse)
  --post-path=<path>               SSE message post path (default: /messages)

AUTHENTICATION AND CONNECTION:
  Each parameter has a CLI, an environment and a YAML form; the CLI wins over the
  environment, which wins over the YAML file. An invalid port, enum or flag value is
  refused at startup. Secrets and the session live in .env or the environment, never
  in YAML: the server refuses a YAML key that looks like one.
${authParametersHelp()}

${options?.expositionSection ?? ServerConfigManager.getHandlerSetsDescription()}
HTTP OPTIONS:
  --http-json-response             Enable JSON response format

TLS/HTTPS:
  --tls-cert=<path>                Path to TLS certificate file (PEM)
  --tls-key=<path>                 Path to TLS private key file (PEM)
  --tls-ca=<path>                  Path to CA certificate file (PEM, optional)
                                   When cert and key are provided, server starts in HTTPS mode

YAML CONFIG FILE:
  Use --conf to specify YAML config file with all settings.
  Template will be generated automatically if file doesn't exist.

EXAMPLES:
  # Stdio with a named destination (for MCP clients)
  mcp-abap-adt --mcp=TRIAL

  # Stdio with env destination from sessions store
  mcp-abap-adt --env=trial

  # Stdio with explicit env file (a .env in the working directory is read only when named)
  mcp-abap-adt --env-path=./.env

  # RFC connection (any system with SAP NW RFC SDK)
  # (or SAP_CONNECTION_TYPE=rfc in the .env file)
  mcp-abap-adt --env-path=my-system.env --connection-type=rfc

  # Explicit system type (tools default to cloud; the connector to cloud for a jwt, else onprem)
  mcp-abap-adt --env-path=e96.env --system-type=onprem
  # Or set SAP_SYSTEM_TYPE=onprem in .env file

  # Limit to readonly operations only
  mcp-abap-adt --mcp=TRIAL --exposition=readonly

  # HTTP server (default path /mcp/stream/http)
  mcp-abap-adt --transport=http --port=8080

  # HTTP server with custom path
  mcp-abap-adt --transport=http --path=/api/mcp

  # SSE transport
  mcp-abap-adt --transport=sse --mcp=TRIAL

  # SSE transport with custom paths
  mcp-abap-adt --transport=sse --sse-path=/events --post-path=/msgs

  # Use YAML config file
  mcp-abap-adt --conf=my-config.yaml

${additionalSections || ''}
`;
  }
}

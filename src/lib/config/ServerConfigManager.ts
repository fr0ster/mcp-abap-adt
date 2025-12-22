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
import type { HandlerSet, IServerConfig, Transport } from './IServerConfig.js';
import {
  applyYamlConfigToArgs,
  generateConfigTemplateIfNeeded,
  loadYamlConfig,
  parseConfigArg,
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
    if (templateGenerated) return;

    // Load YAML config and apply to process.argv
    const yamlConfig = loadYamlConfig(configPath);
    if (yamlConfig) {
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
    const parsed = ArgumentsParser.parse();

    const transport = this.parseTransport();
    const exposition = this.parseExposition();

    return {
      transport: transport || 'stdio',
      exposition: exposition.length > 0 ? exposition : ['readonly', 'high'],
      configFile: parseConfigArg(),
      host: ArgumentsParser.getArgument('--host') || parsed.httpHost,
      port: this.parsePort() || parsed.httpPort,
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
      useAuthBroker: parsed.useAuthBroker,
    };
  }

  /**
   * Parse transport from command line
   */
  private parseTransport(): Transport | undefined {
    const value = ArgumentsParser.getArgument('--transport');
    if (value === 'sse') return 'sse';
    if (value === 'http' || value === 'streamable-http') return 'http';
    if (value === 'stdio') return 'stdio';
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
   * Format: --exposition=readonly,high,low
   */
  private parseExposition(): HandlerSet[] {
    const value = ArgumentsParser.getArgument('--exposition');
    if (!value) return [];

    return value
      .split(',')
      .map((s) => s.trim())
      .filter(
        (s): s is HandlerSet => s === 'readonly' || s === 'high' || s === 'low',
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
                                   --exposition=high           (high only, NO search/system)
                                   --exposition=readonly,high,low (all handlers)

                                   For details: docs/user-guide/HANDLERS_MANAGEMENT.md
`;
  }

  /**
   * Generate complete help text with all configuration options
   */
  static generateHelp(additionalSections?: string): string {
    return `
MCP ABAP ADT Server - SAP ABAP Development Tools MCP Integration

USAGE:
  mcp-abap-adt [options]

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

AUTHENTICATION:
  --env=<path>                     Path to .env file (uses .env instead of auth-broker)
  --mcp=<destination>              Default MCP destination name (for auth-broker mode)
                                   Example: --mcp=TRIAL
  --auth-broker-path=<path>        Custom path for auth-broker storage
                                   Example: --auth-broker-path=~/prj/tmp/

${ServerConfigManager.getHandlerSetsDescription()}
HTTP OPTIONS:
  --http-json-response             Enable JSON response format

YAML CONFIG FILE:
  Use --conf to specify YAML config file with all settings.
  Template will be generated automatically if file doesn't exist.

EXAMPLES:
  # Stdio with auth-broker (for MCP clients)
  mcp-abap-adt --mcp=TRIAL

  # Stdio with .env file
  mcp-abap-adt --env=.env

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

/**
 * Unified server configuration interface
 * Shared by both v1 and v2 servers
 */

import type { TransportConfig } from '../utils.js';

/** TLS configuration for HTTPS server */
export interface TlsConfig {
  /** Path to TLS certificate file (PEM) */
  cert: string;
  /** Path to TLS private key file (PEM) */
  key: string;
  /** Path to CA certificate file (PEM), optional */
  ca?: string;
}

/** Transport type (simple string for v2) */
export type Transport = 'stdio' | 'sse' | 'http';

/** Handler set for exposition control */
export type HandlerSet = 'readonly' | 'high' | 'low' | 'compact';

export interface IServerConfig {
  // ============================================================================
  // COMMON FIELDS (used by both v1 and v2)
  // ============================================================================

  /** Path to .env file */
  envFilePath?: string;
  /** Alias for envFilePath (v2 compatibility) */
  envFile?: string;
  /** Custom path for auth broker storage */
  authBrokerPath?: string;
  /** Default MCP destination from --mcp parameter */
  mcpDestination?: string;
  /** Use unsafe mode (file-based session store) */
  unsafe?: boolean;
  /** Use auth-broker instead of .env file */
  useAuthBroker?: boolean;
  /**
   * Browser type for authentication (chrome, edge, firefox, system, headless, none)
   * - 'system' (default): Opens system default browser
   * - 'headless': Logs URL and waits for manual callback (SSH/remote sessions)
   * - 'none': Logs URL and rejects immediately (automated tests)
   */
  browser?: string;
  /** Port for browser auth callback server */
  browserAuthPort?: number;
  /** Allow x-mcp-destination header to override default destination (--allow-destination-header) */
  allowDestinationHeader?: boolean;

  // ============================================================================
  // TRANSPORT CONFIGURATION
  // ============================================================================

  /** Transport type (simple string) */
  transport?: Transport;
  /** Full transport configuration (v1 style, complex object) */
  transportConfig?: TransportConfig;
  /** Server host */
  host?: string;
  /** Server port */
  port?: number;

  // ============================================================================
  // HTTP/SSE SPECIFIC
  // ============================================================================

  /** Enable JSON response format for HTTP */
  httpJsonResponse?: boolean;
  /** HTTP endpoint path */
  httpPath?: string;
  /** SSE connection path */
  ssePath?: string;
  /** SSE message post path */
  postPath?: string;
  /** TLS configuration for HTTPS (cert + key enables HTTPS automatically) */
  tls?: TlsConfig;

  // ============================================================================
  // HANDLER EXPOSITION (v2)
  // ============================================================================

  /** Handler sets to expose */
  exposition?: HandlerSet[];

  // ============================================================================
  // CONFIG FILE
  // ============================================================================

  /** Path to YAML config file */
  configFile?: string;

  /** SAP connection type: http (default) or rfc */
  connectionType?: 'http' | 'rfc';

  /** SAP system type override: onprem | cloud | legacy (overrides auto-detection) */
  systemType?: 'onprem' | 'cloud' | 'legacy';

  // ============================================================================
  // LEGACY FIELDS (for v1 backward compatibility)
  // ============================================================================

  /** @deprecated Use mcpDestination instead */
  defaultMcpDestination?: string;
  /** @deprecated Use mcpDestination or envFilePath instead */
  defaultDestination?: string;
  /** Logger instance (v1 only) */
  logger?: any;
}

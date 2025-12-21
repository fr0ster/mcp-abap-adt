/**
 * Base server configuration interface
 * Shared by both v1 and v2 servers
 */

export interface IServerConfig {
  /** Path to .env file */
  envFilePath?: string;
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
}


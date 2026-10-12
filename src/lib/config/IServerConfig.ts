/**
 * What every binary's configuration holds: the values of lib's shared rows
 * (`--exposition`, `--system-type`, `--conf`, `--state-idle-minutes`).
 *
 * The transport, HTTP, SSE and destination fields are not here (D38): each
 * belongs to the package that reads it — core's `CoreConfig` (the
 * destination, the browser, the login), http's `HttpConfig` (the Streamable
 * HTTP listener), sse's `SseConfig` (the SSE listener).
 */

/** TLS configuration for HTTPS server */
export interface TlsConfig {
  /** Path to TLS certificate file (PEM) */
  cert: string;
  /** Path to TLS private key file (PEM) */
  key: string;
  /** Path to CA certificate file (PEM), optional */
  ca?: string;
}

/**
 * The handler sets a configuration may name.
 *
 * `compact` is still a member and is deliberately NOT served here: the facade is
 * `@mcp-abap-adt/compact`, its own command. Keeping the value means a configuration
 * that asks for it is recognised and refused with that pointer
 * (`validateExposition`) rather than parsed as a typo or silently ignored.
 */
export type HandlerSet = 'readonly' | 'high' | 'low' | 'compact' | 'debug';

export interface IServerConfig {
  /**
   * The exposition served (`--exposition`), in the words of the binary's tool
   * set (`ToolSet.exposition`): `readonly,high` by default for the full set,
   * `rw` for the compact one.
   */
  exposition?: readonly string[];

  /** Path to YAML config file (`--conf`). */
  configFile?: string;

  /**
   * SAP system type: onprem | cloud | legacy (`--system-type`, `SAP_SYSTEM_TYPE`).
   * The tools offered default to cloud. The connector, and whether the master
   * system is asked of the system, default to cloud for a jwt destination and
   * on-premise otherwise — stated, never guessed from the URL.
   */
  systemType?: 'onprem' | 'cloud' | 'legacy';
  /**
   * The form `systemType` came from: `--system-type`, `SAP_SYSTEM_TYPE`, or
   * `system-type (config file)`. Only the CLI form beats an `SAP_SYSTEM_TYPE`
   * a destination's env file brings (core).
   */
  systemTypeSource?: string;

  /**
   * The idle bound on held state: it ends after this many minutes without a
   * tool call (`--state-idle-minutes`, `MCP_STATE_IDLE_MINUTES`,
   * `state-idle-minutes`). A whole number, at least 30; default 30.
   */
  stateIdleMinutes?: number;
}

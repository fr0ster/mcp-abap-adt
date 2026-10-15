/**
 * What every binary's configuration holds: the values of lib's shared rows
 * (`--system-type`, `--conf`, `--state-idle-minutes`). The tools are not
 * among them: the binary fixes its tool set.
 *
 * The transport, HTTP, SSE and destination fields are not here: each
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
 * The object-oriented handler sets an embedder may combine
 * (`registryForExposition`, `expositionGroups`). The binaries take no set: each
 * fixes its own. `compact` is not served by these groups: the facade is
 * the compact binaries'.
 */
export type HandlerSet = 'readonly' | 'high' | 'compact' | 'debug';

export interface IServerConfig {
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
   * `--shutdown-timeout` in seconds (`MCP_SHUTDOWN_TIMEOUT`,
   * `shutdown-timeout`): the forced close after this long; absent: none.
   */
  shutdownTimeout?: number;

  /**
   * The idle bound on held state: it ends after this many minutes without a
   * tool call (`--state-idle-minutes`, `MCP_STATE_IDLE_MINUTES`,
   * `state-idle-minutes`). A whole number, at least 30; default 30.
   */
  stateIdleMinutes?: number;
}

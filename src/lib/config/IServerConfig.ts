/**
 * What every binary's configuration holds: the values of lib's shared rows
 * (`--system-type`, `--conf`; `--state-idle-minutes` in the HTTP and SSE
 * binaries only). The tools are not among them: the binary fixes its tool
 * set.
 *
 * The transport, HTTP, SSE and destination fields are not here: each
 * belongs to the package that reads it — core's `CoreConfig` (the
 * destination, the browser, the login), http's `HttpConfig` (the Streamable
 * HTTP listener), sse's `SseConfig` (the SSE listener).
 */

/** TLS configuration for HTTPS server */
import type { AccessRestrictions } from '../access/accessLists.js';

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
 * the compact binaries'. `data` is the data tools (`DataHandlersGroup`),
 * opt-in: served only when named.
 */
export type HandlerSet = 'readonly' | 'high' | 'compact' | 'debug' | 'data';

export interface IServerConfig {
  /** Path to YAML config file (`--conf`). */
  configFile?: string | undefined;

  /**
   * SAP system type: onprem | cloud | legacy (`--system-type`, `SAP_SYSTEM_TYPE`).
   * Stated, never defaulted: a connection is not built without it
   * (`system_type_required`). It is never read from the credential (a JWT
   * reaches an on-premise system as well) nor guessed from the URL.
   */
  systemType?: 'onprem' | 'cloud' | 'legacy' | undefined;
  /**
   * The form `systemType` came from: `--system-type`, `SAP_SYSTEM_TYPE`, or
   * `system-type (config file)`. Only the CLI form beats an `SAP_SYSTEM_TYPE`
   * a destination's env file brings (core).
   */
  systemTypeSource?: string | undefined;

  /**
   * `--shutdown-timeout` in seconds (`MCP_SHUTDOWN_TIMEOUT`,
   * `shutdown-timeout`): the forced close after this long; absent: none.
   */
  shutdownTimeout?: number | undefined;

  /**
   * The idle bound on held state: it ends after this many minutes without a
   * tool call (`--state-idle-minutes`, `MCP_STATE_IDLE_MINUTES`,
   * `state-idle-minutes`). A whole number, at least 30; default 30. The
   * HTTP and SSE binaries only: stdio has no idle bound (core's `CoreConfig`
   * leaves this field out).
   */
  stateIdleMinutes?: number | undefined;

  /**
   * Whether a batch's answers keep the raw part each came in
   * (`--batch-keep-raw-parts`, `MCP_BATCH_KEEP_RAW_PARTS`,
   * `batch.keepRawParts`). Default `false`.
   */
  batchKeepRawParts?: boolean | undefined;

  /**
   * Whether the binary serves the data tools (`--enable-data-tools`,
   * `MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`). Default `false`.
   */
  enableDataTools?: boolean | undefined;

  /**
   * The access restrictions (`--deny-actions`, `--allowed-packages`,
   * `--allowed-requests`, `--denied-tables`, `--allowed-tables`, and their
   * environment and YAML forms; `readAccessRestrictions`). Absent: none.
   */
  accessRestrictions?: AccessRestrictions | undefined;
}

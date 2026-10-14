import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { DestinationSystemContext } from '../lib/auth/destinationSystemContext.js';

/**
 * What a connection source answers for one request: the connector's settings
 * and the credential it presents — separate facts from separate sources.
 */
export interface ResolvedConnection {
  /**
   * The connector's settings (URL, client, auth type, connection type).
   * They hold no secret: the credential holds it.
   */
  settings: SapConfig;
  /**
   * The credential the connector presents: a destination's provider (core:
   * the broker's `getProvider`) or the one a request's headers carry
   * (`credentialFromHeaders`).
   */
  credential: IAuthProvider;
  /**
   * Who creates objects and on which system, as the source states it: the
   * destination's own `.env`, or an `x-sap-*` basic connection's login.
   * Entered into each call's scope below the request's headers.
   */
  systemContext?: DestinationSystemContext;
}

/**
 * Where an instance's connections come from, filled by the package that
 * serves it (spec §4): core a destination through the broker, http and sse
 * the request's headers (`headerSource`).
 */
export interface ConnectionSource {
  /** The settings and the credential for one request; the request's signal bounds the waits. */
  resolve(signal: AbortSignal): Promise<ResolvedConnection>;
}

/**
 * How an instance gets its connection: built from a source, or injected by
 * an embedder and used as given (no `resolve`, no `connect()`, no wrap).
 */
export type Source =
  | { kind: 'built'; source: ConnectionSource }
  | { kind: 'injected'; connection: AbapConnection };

/**
 * Connection context for an MCP server instance: its source, and what
 * identifies it.
 */
export type ConnectionContext = Source & {
  /** Session ID for this connection context. */
  sessionId: string;
  /**
   * The destination the instance serves for its life (stdio's): who calls,
   * for its leftover sessions — a runtime file is the caller's when it names
   * this destination and points where the source's settings point. Absent:
   * the instance keeps no runtime file, and its leftover-session tools are
   * not available.
   */
  destination?: string;
  /** Optional metadata for additional context information. */
  metadata?: Record<string, unknown>;
};

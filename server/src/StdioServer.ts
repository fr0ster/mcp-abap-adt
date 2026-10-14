import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';
import {
  failureOf,
  type ReadFailure,
  ServerRefusal,
} from '@mcp-abap-adt/lib/auth';
import {
  BaseMcpServer,
  type IBackgroundRuns,
  type LeftoverSessions,
  type ResolvedConnection,
} from '@mcp-abap-adt/lib/embeddable';
import type { IHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { type StateLogger, stateLoggerOf } from '@mcp-abap-adt/lib/state';
import type { Logger } from '@mcp-abap-adt/logger';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { destinationFailureOf } from './auth/destinationFailure';
import type { IDestinations } from './auth/IAuthBrokerFactory.js';
import { CORE_VERSION } from './coreVersion.js';
import { destinationSource } from './destinationSource.js';

export interface StdioServerOptions {
  name?: string;
  version?: string;
  logger?: Logger;
  /** The idle bound on held state, in minutes (at least 30, default 30). */
  stateIdleMinutes?: number;
  /** Where the state's lifecycle lines go; default stderr, always on. */
  stateLogger?: StateLogger;
  /** The server's own sentence beside a chain failure (§7.4): the factory's `sentenceFor`. */
  sentenceFor?: (error: IAuthProviderError) => string | undefined;
  /**
   * Whether the server itself ended a login (the bound, the shutdown): the
   * factory's `abortedByServer`. Such a login is not retried (D7).
   */
  abortedByServer?: (error: IAuthProviderError) => boolean;
  /**
   * The owner of the process's runtime session files (the launcher's): the
   * SAP sessions this server holds, kept until their logoff is written, and
   * the leftover-session tools. Absent: none kept, the tools not available.
   */
  leftoverSessions?: LeftoverSessions;
  /**
   * Where background runs and their answers are kept (the launcher's
   * `InMemoryBackgroundRuns` of
   * `@mcp-abap-adt/background-runs-memory`). Absent: `background: true` is refused.
   */
  backgroundRuns?: IBackgroundRuns;
}

/**
 * The stdio server: one instance, one destination. Its source is the
 * destination (`destinationSource`), set once at startup; the settings and
 * the provider come from `IDestinations` — the factory — per request.
 * Without destinations the server is in inspection-only mode: the tools are
 * listed, and a tool call answers the server's own `inspection_only` refusal
 * before any connection is built (D17).
 */
export class StdioServer extends BaseMcpServer {
  private readonly sentenceFor:
    | ((error: IAuthProviderError) => string | undefined)
    | undefined;
  private readonly abortedByServer:
    | ((error: IAuthProviderError) => boolean)
    | undefined;
  /** The destination served, named by a refusal whose error does not carry it. */
  private destination: string | undefined;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly destinations: IDestinations | undefined,
    opts?: StdioServerOptions,
  ) {
    super({
      name: opts?.name ?? 'mcp-abap-adt',
      version: opts?.version ?? CORE_VERSION,
      logger: opts?.logger ?? noopLogger,
      stateIdleMinutes: opts?.stateIdleMinutes,
      // From the options as given: the silent default above is never the state's.
      stateLogger: stateLoggerOf(opts ?? {}),
      ...(opts?.leftoverSessions !== undefined && {
        leftoverSessions: opts.leftoverSessions,
      }),
      ...(opts?.backgroundRuns !== undefined && {
        backgroundRuns: opts.backgroundRuns,
      }),
    });
    this.sentenceFor = opts?.sentenceFor;
    this.abortedByServer = opts?.abortedByServer;
  }

  /** The destination layer's failures first, then lib's reader (§7.1). */
  protected override readFailure(thrown: unknown): ReadFailure | undefined {
    return destinationFailureOf(thrown, {
      sentenceFor: this.sentenceFor,
      ...(this.destination !== undefined && { destination: this.destination }),
    });
  }

  /**
   * Serves `destination` (none: inspection-only mode) over `transport` —
   * stdio unless a host passes its own.
   */
  async start(
    destination: string | undefined,
    transport: Transport = new StdioServerTransport(),
  ): Promise<void> {
    if (destination !== undefined && this.destinations) {
      this.destination = destination;
      this.setConnectionContext({
        kind: 'built',
        // The user is fixed for the process: getProvider answers the same
        // provider while the session is renewed (refresh, or a new login when
        // the refresh fails) and written back, so the connection is replaced
        // only when SAP lost its session (D13, D56).
        source: destinationSource(destination, this.destinations),
        sessionId: destination,
        // Who calls, for the leftover sessions: on stdio the destination —
        // its user and credential are fixed for the process.
        destination,
        metadata: { destination },
      });
    }
    this.registerHandlers(this.handlersRegistry);
    await this.connect(transport);
  }

  /**
   * Inspection-only mode refuses here, before any connection is built.
   *
   * One retry after another caller's abort (D7): a request that joined a
   * connect whose login another request's cancel ended — inside that abort
   * window — fails `interactive-login` `aborted` although its own signal is
   * live; it starts afresh, once. Read by `kind`, never by words; a login the
   * server itself ended (the bound, the shutdown) is answered as it is.
   */
  protected override async getConnection(
    signal: AbortSignal,
  ): Promise<AbapConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    try {
      return await super.getConnection(signal);
    } catch (error) {
      if (signal.aborted || !this.loginAbortedByAnother(error)) throw error;
      return super.getConnection(signal);
    }
  }

  /** Inspection-only mode refuses the leftover-session tools too, before anything is read. */
  protected override resolveCaller(
    signal: AbortSignal,
  ): Promise<ResolvedConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    return super.resolveCaller(signal);
  }

  /** Whether `thrown` is a login another caller's abort ended. */
  private loginAbortedByAnother(thrown: unknown): boolean {
    const chain = failureOf(thrown)?.authError;
    if (chain?.kind !== 'interactive-login') return false;
    if ((chain.facts as { outcome?: unknown }).outcome !== 'aborted') {
      return false;
    }
    return !(this.abortedByServer?.(chain) ?? false);
  }
}

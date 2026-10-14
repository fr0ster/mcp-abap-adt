import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';
import { type ReadFailure, ServerRefusal } from '@mcp-abap-adt/lib/auth';
import {
  BaseMcpServer,
  type IBackgroundRuns,
  type LeftoverSessions,
  type ResolvedConnection,
  type StartedConnection,
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
 * the provider come from `IDestinations` — the factory — per request. The
 * launcher has its connection born before the transport opens
 * (`connectAtStart`): the destination's one leftover session taken up, or a
 * logon, and the system information with it.
 * Without destinations the server is in inspection-only mode: the tools are
 * listed, and a tool call answers the server's own `inspection_only` refusal
 * before any connection is built (D17).
 */
export class StdioServer extends BaseMcpServer {
  private readonly sentenceFor:
    | ((error: IAuthProviderError) => string | undefined)
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
  }

  /** The destination layer's failures first, then lib's reader (§7.1). */
  protected override readFailure(thrown: unknown): ReadFailure | undefined {
    return destinationFailureOf(thrown, {
      sentenceFor: this.sentenceFor,
      ...(this.destination !== undefined && { destination: this.destination }),
    });
  }

  /**
   * The connection to `destination` born before the transport opens: the
   * destination's one leftover session taken up, or a logon (an interactive
   * login included: its prompts go to stderr), and the system information
   * (BaseMcpServer's `bornAtStart`). Rejects with what failed; the
   * launcher ends the process with it. The start's own signal, aborted once
   * the birth ended, as the startup check's.
   */
  async connectAtStart(destination: string): Promise<StartedConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    this.serve(destination);
    const startup = new AbortController();
    try {
      return await this.bornAtStart(startup.signal);
    } finally {
      startup.abort();
    }
  }

  /**
   * Serves `destination` (none: inspection-only mode) over `transport` —
   * stdio unless a host passes its own. Its connection is the one
   * `connectAtStart` made, when the launcher called it; otherwise the first
   * tool call makes it.
   */
  async start(
    destination: string | undefined,
    transport: Transport = new StdioServerTransport(),
  ): Promise<void> {
    if (destination !== undefined && this.destinations) {
      this.serve(destination);
    }
    this.registerHandlers(this.handlersRegistry);
    await this.connect(transport);
  }

  /** The destination's source, set once. */
  private serve(destination: string): void {
    if (this.destination !== undefined || !this.destinations) return;
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

  /**
   * Inspection-only mode refuses here, before any connection is built. A
   * login ends with its result, the server (the bound, the shutdown) or the
   * session — never by another call's cancel, since a tool call cannot be
   * cancelled — so nothing is retried.
   */
  protected override async getConnection(
    signal: AbortSignal,
  ): Promise<AbapConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    return super.getConnection(signal);
  }

  /** Inspection-only mode refuses the leftover-session tools too, before anything is read. */
  protected override resolveCaller(
    signal: AbortSignal,
  ): Promise<ResolvedConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    return super.resolveCaller(signal);
  }
}

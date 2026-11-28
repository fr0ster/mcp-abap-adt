import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';
import type { IAccessChecks } from '@mcp-abap-adt/lib';
import {
  connectionCauseOf,
  noConnectionWords,
  type ReadFailure,
  readGuarded,
  ServerRefusal,
} from '@mcp-abap-adt/lib/auth';
import type {
  AbapGitRestrictionSignal,
  ApprovedEndpoint,
} from '@mcp-abap-adt/lib/config';
import {
  BaseMcpServer,
  type IBackgroundRuns,
  type InstanceBatch,
  type InstanceEnvelopes,
  type LeftoverSessions,
  type LineMatchStrategy,
  type ResolvedConnection,
  type SapAnswerStrategy,
  type StartedConnection,
  sapAnswerOf,
} from '@mcp-abap-adt/lib/embeddable';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '@mcp-abap-adt/lib/handlers';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { defaultSystemContextResolver } from '@mcp-abap-adt/lib/request-context';
import {
  HeldLocks,
  NO_IDLE_BOUND,
  type StateLogger,
  stateLoggerOf,
} from '@mcp-abap-adt/lib/state';
import type { Logger } from '@mcp-abap-adt/logger';
import { responsibleRules } from '@mcp-abap-adt/responsible-rules';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { RUNTIME_VERSION } from '../runtimeVersion.js';
import { destinationFailureOf } from './auth/destinationFailure';
import type { IDestinations } from './auth/IAuthBrokerFactory.js';
import {
  BoundedStdioServerTransport,
  frameCapOf,
  STDIO_MESSAGE_LIMIT,
} from './boundedStdioTransport.js';
import { destinationSource } from './destinationSource.js';

export interface StdioServerOptions {
  name?: string;
  /**
   * The SAP system type: the kind of every connection the server builds and
   * hands a tool, and the tools it lists. The launcher passes the one it
   * resolved; absent, `SAP_SYSTEM_TYPE` answers.
   */
  systemType?: SapEnvironment | undefined;
  version?: string;
  logger?: Logger;
  /** Where the state's lifecycle lines go; default stderr, always on. */
  stateLogger?: StateLogger;
  /** The server's own sentence beside a chain failure: the factory's `sentenceFor`. */
  sentenceFor?: (error: IAuthProviderError) => string | undefined;
  /**
   * The owner of the process's runtime session files (the launcher's): the
   * SAP sessions this server holds, kept until their logoff completed (written and answered), and
   * the leftover-session tools. Absent: none kept, the tools not available.
   */
  leftoverSessions?: LeftoverSessions;
  /**
   * Where background runs and their answers are kept (the launcher's
   * `InMemoryBackgroundRuns` of
   * `@mcp-abap-adt/background-runs-memory`). Absent: `background: true` is refused.
   */
  backgroundRuns?: IBackgroundRuns;
  /**
   * The access checks every call of this server is checked by (spec
   * §3.2); one strategy for every instance it makes. Absent: none.
   */
  accessChecks?: IAccessChecks | undefined;
  /**
   * `SearchSource`'s SAP-answer strategy, handed to the instance (the
   * launcher's: the shipped `skipSapAnswers`). Absent: the handler's default.
   */
  sapAnswerStrategy?: SapAnswerStrategy;
  /**
   * `SearchSource`'s line-match strategy, handed to the instance (the
   * launcher's: the shipped `substringLineMatch`). Absent: the handler's default.
   */
  lineMatchStrategy?: LineMatchStrategy;
  /**
   * The consumer's bound on the parts (requests) one ADT batch envelope of a call
   * carries (`--batch-parts-per-envelope`), handed to the instance. Absent:
   * no bound.
   */
  partsPerEnvelope?: number | undefined;
  /**
   * The owner of this instance's batch state (the launcher's, one for the
   * process's one instance). Absent: the batch tools answer
   * `batch_mode_unavailable`.
   */
  batch?: InstanceBatch;
  /**
   * The owner of this instance's read envelopes (the launcher's, one for
   * the process's one instance). Absent: the envelope tools answer
   * `envelopes_unavailable`.
   */
  envelopes?: InstanceEnvelopes;
  /**
   * `--deferred-logon`: the launcher calls no `connectAtStart`; the first
   * tool call that needs the connection makes it. Absent: `false`.
   */
  deferredLogon?: boolean;
  /**
   * `--stdio-message-limit`: the most bytes the stdio client buffers for one
   * message. Absent: the MCP SDK client's default read buffer
   * (`STDIO_DEFAULT_MAX_BUFFER_SIZE`, 10 MiB).
   */
  stdioMessageLimit?: number | undefined;
  /**
   * `--deferred-logon` with `--restore-session`: the instance's first birth
   * takes up the destination's one leftover session. Absent: `false`.
   */
  restoreAtFirstBirth?: boolean;
  /**
   * The session keep-alive's interval in milliseconds, for each instance
   * (`--session-keep-alive-minutes` × 60 000): its built connection is
   * pinged once no request went over it for that long. `0`: off. Absent:
   * the base's default, 10 minutes.
   */
  sessionKeepAliveMs?: number | undefined;
  /**
   * The approved git endpoints of the destination (its endpoints file beside
   * its `.env`, read at the start; spec §5.2). Absent: none.
   */
  abapGitEndpoints?: readonly ApprovedEndpoint[] | undefined;
  /** Which access restrictions the start configured (`restrictedStart`). Absent: none. */
  abapGitRestrictions?: AbapGitRestrictionSignal | undefined;
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
 * before any connection is built.
 */
export class StdioServer extends BaseMcpServer {
  private readonly sentenceFor:
    | ((error: IAuthProviderError) => string | undefined)
    | undefined;
  /** The destination served, named by a refusal whose error does not carry it. */
  private destination: string | undefined;
  /** `--deferred-logon`: a failed build answers `no_connection` (#353). */
  private readonly deferredLogon: boolean;
  /** `--stdio-message-limit`: what the stdio client buffers at most, in bytes. */
  private readonly stdioMessageLimit: number;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly destinations: IDestinations | undefined,
    opts?: StdioServerOptions,
  ) {
    super({
      name: opts?.name ?? 'mcp-abap-adt',
      version: opts?.version ?? RUNTIME_VERSION,
      logger: opts?.logger ?? noopLogger,
      systemType: opts?.systemType,
      // No idle bound on stdio: the server's life and its state are the
      // client's — a stop tool, the client closing stdin, the backend's
      // answer or the process's shutdown ends them, never the server's clock.
      stateIdleMinutes: NO_IDLE_BOUND,
      // From the options as given: the silent default above is never the state's.
      stateLogger: stateLoggerOf(opts ?? {}),
      ...(opts?.leftoverSessions !== undefined && {
        leftoverSessions: opts.leftoverSessions,
      }),
      ...(opts?.accessChecks !== undefined && {
        accessChecks: opts.accessChecks,
      }),
      ...(opts?.backgroundRuns !== undefined && {
        backgroundRuns: opts.backgroundRuns,
      }),
      ...(opts?.sapAnswerStrategy !== undefined && {
        sapAnswerStrategy: opts.sapAnswerStrategy,
      }),
      ...(opts?.lineMatchStrategy !== undefined && {
        lineMatchStrategy: opts.lineMatchStrategy,
      }),
      ...(opts?.partsPerEnvelope !== undefined && {
        partsPerEnvelope: opts.partsPerEnvelope,
      }),
      ...(opts?.batch !== undefined && { batch: opts.batch }),
      ...(opts?.envelopes !== undefined && { envelopes: opts.envelopes }),
      // --deferred-logon --restore-session: the first call's birth takes up
      // the destination's leftover session.
      restoreAtFirstBirth: opts?.restoreAtFirstBirth === true,
      ...(opts?.sessionKeepAliveMs !== undefined && {
        sessionKeepAliveMs: opts.sessionKeepAliveMs,
      }),
      ...(opts?.abapGitEndpoints !== undefined && {
        abapGitEndpoints: opts.abapGitEndpoints,
      }),
      ...(opts?.abapGitRestrictions !== undefined && {
        abapGitRestrictions: opts.abapGitRestrictions,
      }),
      // The locks the instance took: a write, a delete or an unlock under a
      // lock_handle is sent only under one it holds.
      heldLocks: new HeldLocks(),
      // The responsible rules, once, at the start (`connectAtStart`).
      systemContextResolver: defaultSystemContextResolver,
      systemContextRules: responsibleRules,
    });
    this.sentenceFor = opts?.sentenceFor;
    this.deferredLogon = opts?.deferredLogon === true;
    this.stdioMessageLimit = opts?.stdioMessageLimit ?? STDIO_MESSAGE_LIMIT;
  }

  /** The destination layer's failures first, then lib's reader. */
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
   * The stdio transport this server serves on when no other is passed: no
   * frame longer than `--stdio-message-limit` less one pipe read.
   */
  stdioTransport(): BoundedStdioServerTransport {
    return new BoundedStdioServerTransport(frameCapOf(this.stdioMessageLimit));
  }

  /**
   * Serves `destination` (none: inspection-only mode) over `transport` —
   * stdio unless a host passes its own. Its connection is the one
   * `connectAtStart` made, when the launcher called it; otherwise the first
   * tool call makes it. The stdio transport writes no message longer than a
   * stdio client reads (`BoundedStdioServerTransport`, its cap from
   * `stdioMessageLimit`).
   */
  async start(
    destination: string | undefined,
    transport: Transport = this.stdioTransport(),
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
      // only when SAP lost its session.
      source: destinationSource(destination, this.destinations),
      // Who calls, for the leftover sessions: on stdio the destination —
      // its user and credential are fixed for the process.
      destination,
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
  ): Promise<IAbapConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    if (!this.deferredLogon) return super.getConnection(signal);
    try {
      return await super.getConnection(signal);
    } catch (thrown) {
      throw this.noConnectionOf(thrown) ?? thrown;
    }
  }

  /**
   * `--deferred-logon`: a build of the instance's connection that failed
   * because the system cannot be reached — no failure the reader reads, no
   * answer from SAP, and a listed cause code (`connectionCauseOf`) — is
   * `no_connection`, naming the code alone. Anything else is answered as
   * it came. The value is from outside the type system: read guarded.
   */
  private noConnectionOf(thrown: unknown): ServerRefusal | undefined {
    if (readGuarded((t) => this.readFailure(t), thrown) !== undefined) {
      return undefined;
    }
    if (sapAnswerOf(thrown) !== undefined) return undefined;
    const cause = connectionCauseOf(thrown);
    return cause === undefined
      ? undefined
      : new ServerRefusal('no_connection', cause);
  }

  /**
   * `--deferred-logon`: a request on the connection already made that
   * reached no answer — no response, and a cause code adt-clients names from
   * its listed codes (`IAdtError.connectionCause`) — is `no_connection`,
   * naming the code alone. Its message, request and anything else of the
   * failure are not read. Anything else is answered as it came.
   */
  protected override readAdtFailure(
    failed: IAdtError,
  ): ReadFailure | undefined {
    if (!this.deferredLogon) return undefined;
    if (failed.response !== undefined) return undefined;
    const cause = failed.connectionCause;
    if (cause === undefined) return undefined;
    return { error: 'no_connection', message: noConnectionWords(cause) };
  }

  /** Inspection-only mode refuses the leftover-session tools too, before anything is read. */
  protected override resolveCaller(
    signal: AbortSignal,
  ): Promise<ResolvedConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    return super.resolveCaller(signal);
  }
}

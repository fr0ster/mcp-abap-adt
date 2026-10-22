import { AsyncLocalStorage } from 'node:async_hooks';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { Logger } from '@mcp-abap-adt/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../handlers/interfaces.js';
import {
  registerActiveTool,
  shutdownRefusalAnswer,
} from '../lib/activeTools.js';
import {
  AdtHeaderPairs,
  type AdtHeaderPort,
} from '../lib/adtHeaders/AdtHeaderPairs.js';
import { asRecordedCall } from '../lib/adtHeaders/scope.js';
import {
  adtSystemKey,
  withoutTrailingSlashes,
} from '../lib/adtHeaders/systemKey.js';
import { answerRead } from '../lib/auth/answerFailure.js';
import { CurrentCredential } from '../lib/auth/currentCredential.js';
import type { DestinationSystemContext } from '../lib/auth/destinationSystemContext.js';
import {
  failureOf,
  type ReadFailure,
  readGuarded,
} from '../lib/auth/failures.js';
import {
  batchNotRecordableWords,
  batchNotServedWords,
  ServerRefusal,
} from '../lib/auth/serverRefusal.js';
import { answerBackgroundStarted } from '../lib/backgroundRuns/answers.js';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  IBackgroundRuns,
} from '../lib/backgroundRuns/contract.js';
import { backgroundRunTools } from '../lib/backgroundRuns/port.js';
import { startBackgroundRun } from '../lib/backgroundRuns/run.js';
import {
  BACKGROUND_INVALID_WORDS,
  backgroundObjectOf,
  isBackgroundTool,
  readBackground,
  withoutBackground,
} from '../lib/backgroundRuns/tools.js';
import {
  type BatchAvailability,
  createBatchAvailability,
} from '../lib/batch/availability.js';
import { endsBatch, runsBesideBatch } from '../lib/batch/batchTools.js';
import { eligible } from '../lib/batch/eligibility.js';
import { batchRefusal, endWithFailure } from '../lib/batch/execute.js';
import type {
  BatchAnswer,
  InstanceBatch,
  OpenBatch,
} from '../lib/batch/InstanceBatch.js';
import { createRecorder, untilSent } from '../lib/batch/recorder.js';
import {
  OUTSIDE_BATCH_SENTENCE,
  withBatchSentence,
} from '../lib/batch/sentence.js';
import {
  createAbapConnection,
  systemKindOf,
} from '../lib/connectionFactory.js';
import { isRfcConnection } from '../lib/connectionKind.js';
import {
  createDebuggerInstance,
  type DebuggerInstance,
} from '../lib/debugger/DebuggerInstance.js';
import {
  isDebuggerOwnConnectionTool,
  recordableInDebugBatch,
} from '../lib/debugger/ownConnectionTools.js';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
import { jsonSchemaToZod } from '../lib/handlers/utils/schemaUtils.js';
import { closeInstance } from '../lib/instanceClose.js';
import {
  type ClaimedSession,
  type LeftoverSessions,
  type SessionIdentity,
  sessionIdentity,
} from '../lib/leftoverSessions/LeftoverSessions.js';
import {
  type LeftoverSessionTools,
  type LogoffOutcome,
  sapAnswerOf,
} from '../lib/leftoverSessions/port.js';
import { runLongCall } from '../lib/longCall.js';
import {
  isLongRead,
  isLongTool,
  readTimeout,
  TIMEOUT_INVALID_WORDS,
  TIMEOUT_NOT_FOR_RUN_WORDS,
  withoutTimeout,
} from '../lib/longTools.js';
import {
  closeOwnedConnections,
  endConnection,
  isEnded,
  logoffCompleted,
  own,
  refuseIfClosed,
  refuseWhenClosed,
  runAsOwner,
} from '../lib/ownedConnections.js';
import { freshConnectionAvailable } from '../lib/packageSessions.js';
import {
  raceRequestSignal,
  runWithRequestSignal,
  throwIfRequestAborted,
} from '../lib/requestSignal.js';
import {
  parametersOf,
  parametersOnce,
  type ResolvedSystemContext,
  type SystemCall,
  type SystemContextResolver,
  type SystemContextRules,
  type SystemLookup,
  statedCallOf,
  statedResponsibleOf,
  withDestinationSystemContext,
  withKnownSystemContext,
} from '../lib/requestSystemResolution.js';
import type { HeldLocks } from '../lib/state/heldLocks.js';
import {
  InstanceState,
  type StateLogger,
  stateLoggerOf,
} from '../lib/state/InstanceState.js';
import type { LongSession } from '../lib/state/longSession.js';
import {
  withoutStateHandle,
  withStateHandle,
} from '../lib/state/stateHandleArgument.js';
import {
  getStatedSystemContext,
  systemContextFromConfiguration,
} from '../lib/systemContext.js';
import {
  normalizeToolContent,
  type ToolResultLike,
} from '../lib/toolResult.js';
import {
  TOOL_SEARCH_META_KEY,
  toolSearchText,
} from '../lib/toolSearch/index.js';
import { return_error } from '../lib/utils.js';
import type {
  ConnectionContext,
  ResolvedConnection,
} from './ConnectionContext.js';

/**
 * How a stdio instance's connection was born at its start
 * (`bornAtStart`): a logon (`logged_on`), or the one leftover session of
 * its destination taken up — picked up (`picked_up`), or, SAP answering it
 * ended, a new session with the normal logon (`new`) — under that
 * session's `handle`.
 */
export type StartedConnection =
  | { session: 'logged_on' }
  | { session: 'picked_up' | 'new'; handle: string };

/**
 * A connection being built, shared by every call that asks for it while it
 * is. A connect that completes after every caller left is still
 * the instance's: kept, used by the next call.
 */
interface BuiltConnection {
  /**
   * The credential the connection presents: the latest one a call put in
   * force (`CurrentCredential.take`).
   */
  credential: CurrentCredential;
  connection: Promise<AbapConnection>;
  /** The connection once its connect completed. */
  ready?: AbapConnection;
  /**
   * Calls handed this entry's connection and not yet done with it — counted
   * in the same turn it is handed out, before any await, so a replacement
   * never ends it under a call that received it.
   */
  users: number;
  /** Replaced: it ends with its logoff once no call works on it. */
  retired: boolean;
}

/**
 * The instances whose main flow the current async context holds: a call that
 * entered its instance's flow runs inside it, so a send on the instance's
 * connection made from within (an identity lookup) runs directly instead of
 * queueing behind itself. The value is the connection the holding call works
 * on; `null` when the holder took its turn without a connection (a tool its
 * own registry registered on an instance with no connection source), so a
 * send made from within takes the instance's connection itself, inside that
 * turn.
 */
const heldFlows = new AsyncLocalStorage<
  ReadonlyMap<object, AbapConnection | null>
>();

/**
 * Whether a call of `tool` works on a connection of its own and takes no
 * place in the instance's main flow: a background run, a listed long read,
 * a debugger tool whose SAP work is on the debugger's own connections. Read
 * only for a handler group's tools, whose handlers are known: a callback a
 * registry registers itself always takes its turn.
 */
function worksOnOwnConnection(
  tool: string,
  args: unknown,
  inBackground: boolean,
): boolean {
  return (
    inBackground ||
    (isLongTool(tool) && isLongRead(tool, args)) ||
    isDebuggerOwnConnectionTool(tool)
  );
}

/**
 * Base MCP Server class that extends SDK McpServer
 * Manages connection context and provides connection injection for handlers
 */
export abstract class BaseMcpServer extends McpServer {
  /**
   * Logger used for handler context
   */
  protected readonly logger: Logger;

  /**
   * Connection context: the instance's one source — set once for
   * stdio, per request for Streamable HTTP (also on a pooled instance), once
   * per SSE connection, at construction for an embedder's injected connection.
   */
  protected connectionContext: ConnectionContext | null = null;

  /**
   * The connection built from the source, kept until SAP ended its session.
   * It presents the credential the source answered last: stdio's provider
   * (the same one for the process's life), an SSE connection's headers, each
   * Streamable HTTP request's headers (`CurrentCredential`).
   */
  private built: BuiltConnection | undefined;

  /** What each built connection's source stated about who creates objects. */
  private readonly systemContexts = new WeakMap<
    AbapConnection,
    DestinationSystemContext | undefined
  >();

  /**
   * Per-instance SAP system type. Overrides process.env.SAP_SYSTEM_TYPE
   * for `available_in` filtering at handler registration time.
   */
  protected readonly systemType?: SapEnvironment;

  /**
   * Asks a connection's system for its information, when its parameters are
   * made; `null` (the default): nothing is looked up. See
   * src/lib/requestSystemResolution.ts.
   */
  protected readonly systemContextResolver: SystemContextResolver | null;

  /**
   * The rules that make a connection's parameters (the responsible, the
   * master system) from its lookup — a host's
   * (`@mcp-abap-adt/responsible-rules`); `null` (the default): none — the
   * information is applied, no information leaves the configured values.
   */
  protected readonly systemContextRules: SystemContextRules | null;

  /** What this instance holds between tool calls, and its handle (MCP SEP-2567). */
  readonly state: InstanceState;

  private debuggerInstance?: DebuggerInstance;

  /** Every tool call of this instance still running, tracked from its entry. */
  private readonly inFlight = new Set<Promise<unknown>>();

  /** The built entry of each connection handed out: what a release counts down. */
  private readonly entries = new WeakMap<AbapConnection, BuiltConnection>();

  /**
   * The process's runtime files of the SAP sessions it holds — their owner,
   * given by the host (`leftoverSessions` option); absent, this instance
   * keeps none and its leftover-session tools answer "not available here".
   */
  protected readonly leftoverSessions: LeftoverSessions | undefined;

  /**
   * Where background runs and their answers are kept — the host's strategy
   * (`backgroundRuns` option); absent, `background: true` and the
   * background-run tools answer "not available here".
   */
  protected readonly backgroundRuns: IBackgroundRuns | undefined;

  /**
   * The owner of this instance's batch state (`batch` option), given by the
   * host, one per instance; attached to the state. Absent: the batch tools
   * answer `batch_mode_unavailable`.
   */
  protected readonly batch: InstanceBatch | undefined;

  /** The locks this instance holds between requests (`heldLocks` option). */
  protected readonly heldLocks: HeldLocks | undefined;

  /** The instance's long session (`longSession` option). */
  protected readonly longSession: LongSession | undefined;

  /** Whether every tool declares `state_handle` (`stateHandleArgument` option). */
  private readonly stateHandleArgument: boolean;

  /**
   * The corrected request header pairs of the systems this instance talks
   * to (`adtHeaderPairs` option), keyed by system: the host's, shared by its
   * instances; this instance's own when the host gave none.
   */
  protected readonly adtHeaderPairs: AdtHeaderPairs;

  constructor(options: {
    name: string;
    version?: string;
    logger?: Logger;
    systemType?: SapEnvironment;
    /** Asks a connection's system for its information; default none. */
    systemContextResolver?: SystemContextResolver | null;
    /** The rules that make a connection's parameters; default none. */
    systemContextRules?: SystemContextRules | null;
    /** The idle bound on held state, in minutes: at least 30, default 30. */
    stateIdleMinutes?: number;
    /**
     * Where the state's lifecycle lines go (the bound's end of a state, a
     * failed cleanup, a failing observer). Default: the `logger` passed
     * explicitly, else stderr, always on — never a transport logger a host
     * defaulted to silence (such a host passes this option itself).
     */
    stateLogger?: StateLogger;
    /**
     * The host's index of state handles in use (a pool): a handle it answers
     * `true` for is drawn again, so no two instances of the host share one.
     */
    isStateHandleTaken?: (handle: string) => boolean;
    /**
     * The owner of the process's runtime session files, created by the host
     * and shared by its instances: each owned HTTP connection holding a
     * session keeps a file there until its logoff completed (written, and its
     * `flushGoodbye()` settled), and the
     * leftover-session tools read it. Absent: no file, and those tools
     * answer "not available here".
     */
    leftoverSessions?: LeftoverSessions;
    /**
     * Where background runs and their answers are kept: the host's strategy,
     * shared by its instances (the launchers' `InMemoryBackgroundRuns` of
     * `@mcp-abap-adt/background-runs-memory`, an
     * embedder's own). Absent: `background: true` and the background-run
     * tools are refused.
     */
    backgroundRuns?: IBackgroundRuns;
    /**
     * The owner of this instance's batch state, created by the host for this
     * instance alone (never shared between instances): the open batch and
     * the last batch's answers, held state under the idle bound. Absent:
     * the batch tools answer `batch_mode_unavailable`.
     */
    batch?: InstanceBatch;
    /**
     * The locks this instance holds between requests, created by a host
     * whose instances last one request each (Streamable HTTP) for this
     * instance alone: held state, ended by the UNLOCK. Absent: the lock
     * tools keep nothing (stdio, SSE: the instance keeps its session).
     */
    heldLocks?: HeldLocks;
    /**
     * The long session of this instance, created by a host whose instances
     * last one request each (Streamable HTTP) for this instance alone: held
     * state while open, so the host keeps the instance and its SAP
     * connection for the calls that carry its handle. Absent: the session
     * tools answer `long_session_unavailable` (stdio, SSE: the instance
     * keeps its session).
     */
    longSession?: LongSession;
    /**
     * The corrected request header pairs of the systems the process talks
     * to, created by the host and shared by its instances: a pair SAP
     * answered `406`/`415` to, corrected, is sent from then on to that
     * system for that operation. Absent: this instance keeps its own.
     */
    adtHeaderPairs?: AdtHeaderPairs;
    /**
     * Whether the transport's close is the end of this instance's session
     * (default `true`): stdio's transport, an SSE stream, an embedder's
     * connected transport — its close is then the instance's close
     * (`closeInstance`): the instance latched, the logoff sent at once to
     * every connection it owns, every live call interrupted, its state let
     * go. `false`
     * for a host that connects a transport per request (Streamable HTTP):
     * the client's disconnect closes that request's transport and ends no
     * call — an admitted call (waiting for its connection, its system
     * lookup, its turn in the main flow, or running) goes on to its end.
     * Its calls are interrupted only by the instance's close
     * (`closeInstance`) or the process shutdown.
     */
    transportCloseEndsSession?: boolean;
    /**
     * Whether every tool's input schema declares an optional string
     * `state_handle` (`withStateHandle`; a tool declaring its own keeps it):
     * stated by a host that routes a call to the instance holding its state
     * by that argument (Streamable HTTP's pool), so a client that sets no
     * header can send it. Default `false`: stdio and SSE register the
     * schemas as the tools declare them.
     */
    stateHandleArgument?: boolean;
  }) {
    super({ name: options.name, version: options.version ?? '1.0.0' });
    this.logger = options.logger ?? getDefaultLogger();
    this.leftoverSessions = options.leftoverSessions;
    this.backgroundRuns = options.backgroundRuns;
    this.state = new InstanceState({
      idleMinutes: options.stateIdleMinutes,
      ...(options.isStateHandleTaken !== undefined && {
        isTaken: options.isStateHandleTaken,
      }),
      logger: stateLoggerOf(options),
      // The idle bound's stop is a terminal disposal of what the state
      // owns: its connections are closed whatever the undo answered.
      onIdleStop: () => this.idleStopped(),
    });
    this.batch = options.batch;
    if (this.batch !== undefined) this.state.attach(this.batch);
    this.heldLocks = options.heldLocks;
    if (this.heldLocks !== undefined) this.state.attach(this.heldLocks);
    this.longSession = options.longSession;
    if (this.longSession !== undefined) this.state.attach(this.longSession);
    this.stateHandleArgument = options.stateHandleArgument === true;
    this.adtHeaderPairs = options.adtHeaderPairs ?? new AdtHeaderPairs();
    this.systemType = options.systemType;
    this.systemContextResolver = options.systemContextResolver ?? null;
    this.systemContextRules = options.systemContextRules ?? null;
    // The session's end: the transport closed (the SDK calls the protocol's
    // `onclose` once per transport). It is the instance's close
    // (`closeInstance`), in that tick: the instance latched, every connection
    // it owns sent its logoff, every live call interrupted, its state let go.
    // A client's cancel aborts nothing (`trackCall`). The close is one per
    // instance: a launcher's or an SSE stream's close joins it, nothing runs
    // twice. A host with a transport per request (http) states that its
    // transport's close is no session's end: nothing is wired, and a dropped
    // request ends no call.
    if (options.transportCloseEndsSession !== false) {
      const previousOnClose = this.server.onclose;
      this.server.onclose = () => {
        previousOnClose?.();
        void closeInstance(this);
      };
    }
  }

  /**
   * The instance's debugger: created on first use inside a call's scope, so
   * stated ids are read there; attached to the state.
   */
  protected debuggerFor(): DebuggerInstance {
    if (!this.debuggerInstance) {
      const created = createDebuggerInstance();
      this.state.attach(created);
      this.debuggerInstance = created;
    }
    return this.debuggerInstance;
  }

  get stateHandle(): string {
    return this.state.handle;
  }

  holdsState(): boolean {
    return this.state.holdsState();
  }

  /**
   * The state undo: undoes what the instance holds; callable again — each
   * call retries what the state could not undo (the pool's retry and
   * `shutdownState()` rely on it). It closes no connection: that is the
   * terminal close (`terminalClose()`), which every terminal disposal runs
   * after it, whatever it answered.
   */
  dispose(): Promise<void> {
    return this.state.dispose();
  }

  /**
   * **The terminal close**: `disconnect()` — the logoff — of
   * every connection this instance owns (the one it built, held state's own,
   * package lock sessions, fresh connections still open), each once; a
   * failure logged in fixed words. An injected connection is the consumer's
   * and is never closed. Run by every terminal disposal after the state undo,
   * never conditional on it.
   */
  terminalClose(): Promise<void> {
    return closeOwnedConnections(this);
  }

  /**
   * After the idle bound's stop, whatever its undo answered: the connections
   * held state owns are closed with a logoff. The instance itself lives on
   * (stdio's, an SSE connection's): its own connection is not touched. A
   * host whose instance ends with its state (the pool) closes all of them.
   */
  protected idleStopped(): Promise<void> {
    return closeOwnedConnections(this, ['state']);
  }

  /**
   * The state let go after this instance's connections were logged off (the
   * instance close, `closeInstance`): the idle bound never arms again, and
   * nothing is undone — the logoff ended in SAP what the state held.
   */
  letGoOfState(): void {
    this.state.letGo();
  }

  /**
   * The instance close's drop of the open batch (`closeInstance`, beside
   * the logoffs): nothing recorded is sent, the batch's signal aborts so
   * every recorded handler settles, the batch connection and the answers
   * are let go. The close lets go of the state without `dispose()`, so the
   * batch is dropped here.
   */
  dropBatch(): void {
    this.batch?.drop();
  }

  /** Dispose, settle, once more, settle — what a host awaits before letting the instance go; answers what is left. */
  shutdownState(): Promise<string[]> {
    return this.state.shutdown();
  }

  /** Resolves when every tool call of this instance has settled — a host releases the instance only then. */
  async idle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }

  /**
   * Sets the instance's source: a `ConnectionSource` to build from
   * (core: the destination; http and sse: the request's headers), or an
   * injected connection used as given. Nothing is read or sent here; the
   * process configuration joins the process context (the fallback after the
   * request's headers and the source's own statement).
   */
  protected setConnectionContext(context: ConnectionContext): void {
    systemContextFromConfiguration();
    this.connectionContext = context;
  }

  /**
   * Gets current connection context
   */
  protected getConnectionContext(): ConnectionContext | null {
    return this.connectionContext;
  }

  /**
   * What a thrown value is, as the client's answer: lib's
   * `failureOf`. A server that knows more failures (core: the destination
   * layer's) reads those first, then this.
   */
  protected readFailure(thrown: unknown): ReadFailure | undefined {
    return failureOf(thrown);
  }

  /** The tail of the instance's main flow (`enterMainFlow`). */
  private mainFlow: Promise<void> = Promise.resolve();

  /**
   * The connection a tool call works on. Injected: the connection as given —
   * no `resolve`, no `connect()`, no wrap. Built: the source resolves the
   * settings and the credential with the request's `signal` (its own waits
   * race it), and the connection is built and connected once and kept: it
   * is replaced only when SAP ended its session (`isSpent`: a timeout, a
   * logoff, an administrator). The credential the source answers is put in
   * force on the held connection (`CurrentCredential.take`) — http: the
   * request's; a changed credential (a renewed token, a new basic pair) is
   * the same user, and its next sends carry it in the same SAP session, its
   * locks kept; a credential that is not right is SAP's to answer, and its
   * refusal reaches the caller as it came. On stdio the source answers the
   * same provider for the process's life: a renewed token (refresh, or a
   * new login when the refresh fails) lives inside that provider. The
   * credential renews itself (a 401 reaches its `rejected()`), so nothing is
   * looked up here for refreshing.
   *
   * The connect is shared by every call that asks while it runs, and each
   * caller awaits it to its end whatever its signal says: it is a send on
   * the instance's connection, so a call whose session ended still waits for
   * it, and the instance's close comes after (no logoff under it). A login
   * inside it ends with the session (its party is the call's signal). A
   * success is the instance's connection, kept and used by the next call; it
   * is closed only by the instance's terminal close.
   *
   * Every connection it returns is a use the caller must end with exactly
   * one `connectionReleased(connection)`.
   */
  protected async getConnection(signal: AbortSignal): Promise<AbapConnection> {
    const context = this.connectionContext;
    if (!context) {
      throw new Error(
        'Connection context not set. Call setConnectionContext() first.',
      );
    }
    if (context.kind === 'injected') {
      // The host's connection, as given: its parameters are made before the
      // first tool on it runs (`systemBeforeTool`).
      throwIfRequestAborted(signal);
      return context.connection;
    }

    throwIfRequestAborted(signal);
    const resolved = await context.source.resolve(signal);
    let held = this.built;
    if (!held || (held.ready !== undefined && isSpent(held.ready))) {
      // None yet, or a session SAP already ended: the connection is
      // replaced, and the replaced one ends with its logoff — once no call
      // works on it any more. Its locks ended with the session.
      // The parameters are the destination's — the credential and the
      // target system they were made for — not the session's: a
      // replacement for the same ones has them at birth (`buildConnection`)
      // and asks nothing.
      if (held) this.retire(held);
      held = this.buildConnection(resolved, (born) => this.logOn(born));
    } else {
      // The held connection takes the source's credential (http: the
      // request's): the next sends carry it, in the same SAP session.
      held.credential.take(resolved.credential);
    }
    // This call is the entry's user from now on — counted before the await,
    // so a replacement in between cannot end the connection under it.
    held.users += 1;
    let connection: AbapConnection;
    try {
      // Awaited whatever the signal says: the connect is a send on the
      // instance's connection. The instance close and the process shutdown
      // do not wait for it: they log the connection off at once, under it.
      // A login inside it ends with the session: its party is the call's
      // signal.
      connection = await held.connection;
    } catch (error) {
      this.release(held);
      throw error;
    }
    this.entries.set(connection, held);
    this.systemContexts.set(connection, resolved.systemContext);
    return connection;
  }

  /**
   * The instance's main flow: the calls that work on its connection, one
   * after another. Resolves with the call's `leave` once every call queued
   * before it has left; no timeout on the wait. A client's cancel aborts
   * nothing (`trackCall`): the call keeps its place. A call whose session
   * ended while it waits (its signal aborted) leaves the queue at once — its
   * place passes on, and it ends without reaching its tool. The process
   * shutdown (stdio's client close included) interrupts every call — the
   * queued ones leave without sending — and logs the connector off at once,
   * under the running call (`logOffAtOnce`); an SSE close ends the session,
   * so its queued calls leave too.
   */
  private enterMainFlow(signal: AbortSignal): Promise<() => void> {
    const before = this.mainFlow;
    let leave!: () => void;
    const mine = new Promise<void>((resolve) => {
      leave = resolve;
    });
    this.mainFlow = before.then(() => mine);
    return raceRequestSignal(before, signal).then(
      () => leave,
      (error: unknown) => {
        leave();
        throw error;
      },
    );
  }

  /**
   * Each connection's parameters, as kept (`knowParameters`): what the
   * rules made, or the information. A connection without an entry has none
   * made yet (or none kept), and its next call makes them.
   */
  private readonly systems = new WeakMap<object, KnownParameters>();

  /**
   * The record of each destination: the resolved credential object, then
   * the target system (`targetOf`). The same credential on the same system
   * has the same parameters, whichever session made them: a new session of
   * them is never asked again. Its batch availability is kept beside them,
   * learned once per destination (`BatchAvailability`).
   */
  private readonly destinationSystems = new WeakMap<
    IAuthProvider,
    Map<string, DestinationRecord>
  >();

  /** The destination each built connection was born for (`buildConnection`). */
  private readonly destinationOf = new WeakMap<object, Destination>();

  /** The information a connection was born with (a leftover's file). */
  private readonly bornSystems = new WeakMap<object, KnownSystemContext>();

  /** A destination's parameters, when already known. */
  private destinationSystem(
    credential: IAuthProvider,
    target: string,
  ): KnownParameters | undefined {
    return this.destinationSystems.get(credential)?.get(target)?.known;
  }

  /** A destination's record, made on first use. */
  private destinationRecord(destination: Destination): DestinationRecord {
    let targets = this.destinationSystems.get(destination.credential);
    if (targets === undefined) {
      targets = new Map();
      this.destinationSystems.set(destination.credential, targets);
    }
    let record = targets.get(destination.target);
    if (record === undefined) {
      record = { batchAvailability: createBatchAvailability() };
      targets.set(destination.target, record);
    }
    return record;
  }

  /**
   * The batch availability of the destination `connection` was born for
   * (`buildConnection`); `undefined` for a connection with no destination
   * (a host's injected one).
   */
  private batchAvailabilityOf(
    connection: object,
  ): BatchAvailability | undefined {
    const destination = this.destinationOf.get(connection);
    return destination === undefined
      ? undefined
      : this.destinationRecord(destination).batchAvailability;
  }

  /**
   * The header pairs of the system `connection` talks to: its destination's
   * target system (credentials aside), else the connection itself (a
   * host's injected one).
   */
  private adtHeadersOf(connection: object): AdtHeaderPort {
    const destination = this.destinationOf.get(connection);
    return destination === undefined
      ? this.adtHeaderPairs.forConnection(connection)
      : this.adtHeaderPairs.forSystem(destination.target);
  }

  /**
   * Keeps `known` as `connection`'s parameters — and its destination's
   * (credential and target system), so a new session of the same ones needs
   * nothing made — and, when they came with the information, that in its
   * runtime file when the instance keeps one (a resume then needs no
   * lookup).
   */
  private knowParameters(connection: object, known: KnownParameters): void {
    this.systems.set(connection, known);
    const destination = this.destinationOf.get(connection);
    if (destination !== undefined) {
      this.destinationRecord(destination).known = known;
    }
    if (known.information !== undefined) {
      this.leftoverSessions?.describeSystem(connection, known.information);
    }
  }

  /**
   * What `connection` states for its parameters, as the call that makes
   * them sees it: a built connection's destination — its stated
   * responsible (the request's headers, its own `SAP_RESPONSIBLE`, the
   * process's), its login (its settings' `SAP_USERNAME`, else its source's
   * `x-sap-login`), its master system —; a host's connection's
   * (`statedCallOf`). The kind is the connection's (`systemKindOf`).
   */
  private statedCall(connection: object): SystemCall {
    const warn = (message: string) => this.logger?.warn?.(message);
    const destination = this.destinationOf.get(connection);
    if (destination === undefined) {
      return { ...statedCallOf(connection, this.systemType), warn };
    }
    return withDestinationSystemContext(
      this.systemContexts.get(connection as AbapConnection),
      () => ({
        kind: systemKindOf(connection, process.env, this.systemType),
        responsible: statedResponsibleOf(destination.responsible),
        login: destination.user,
        masterSystem: getStatedSystemContext().masterSystem,
        warn,
      }),
    );
  }

  /**
   * `connection`'s parameters from `lookup` (made by the rules, else the
   * information); kept when they are (`knowParameters`). A refusal of the
   * rules is thrown, and nothing is kept.
   */
  private parametersFrom(
    connection: object,
    lookup: SystemLookup,
  ): ResolvedSystemContext {
    const made = parametersOf(lookup, this.systemContextRules, () =>
      this.statedCall(connection),
    );
    if (made.kept) {
      this.knowParameters(connection, {
        parameters: made.parameters,
        information: lookup.system ?? undefined,
      });
    }
    return made.parameters;
  }

  /**
   * `connection`'s parameters, made when none are known: its system asked
   * (the resolver), then the rules (`parametersOnce`; concurrent askers
   * share one request). Kept when they are (`knowParameters`), so a later
   * call sends nothing. A credential failure is the call's as it came, and
   * a refusal of the rules the call's; nothing is kept. `undefined`: nothing
   * to make (no resolver).
   */
  private async requireSystem(
    connection: AbapConnection,
  ): Promise<ResolvedSystemContext | undefined> {
    const resolver = this.systemContextResolver;
    if (resolver === null) return undefined;
    const known = this.systems.get(connection);
    if (known !== undefined) return known.parameters;
    // Awaited whatever the signal says: the lookup is a send on the
    // instance's connection, and the call — its turn in the main flow, its
    // tracking — lasts until it settled, so nothing overlaps it and no
    // logoff comes under it when the session ends.
    const made = await parametersOnce(
      resolver,
      connection,
      this.systemContextRules,
      () => this.statedCall(connection),
    );
    if (made.kept) {
      this.knowParameters(connection, {
        parameters: made.parameters,
        information: made.lookup.system ?? undefined,
      });
    }
    return made.parameters;
  }

  /**
   * Before a tool runs on `connection`: its parameters — known with the
   * connection (made at its birth), else made now (a host's connection, or
   * none kept) — never after the tool, so no tool runs twice. A call that
   * holds the main flow makes them there; one outside it (a background run,
   * a long read, a debugger tool) takes a turn in the flow for the lookup
   * alone, so nothing is sent on the instance's connection outside it.
   * Answers the connection the tool runs on and its parameters
   * (`requireSystem`).
   */
  private async systemBeforeTool(
    connection: AbapConnection,
    holdsFlow: boolean,
    signal: AbortSignal,
    taken: (connection: AbapConnection | undefined) => void,
  ): Promise<{
    connection: AbapConnection;
    system: ResolvedSystemContext | undefined;
  }> {
    if (this.systemContextResolver === null) {
      return { connection, system: undefined };
    }
    // Known: nothing is sent, so no turn in the flow is needed.
    if (holdsFlow || this.systems.get(connection) !== undefined) {
      return { connection, system: await this.requireSystem(connection) };
    }
    const leave = await this.enterMainFlow(signal);
    try {
      // Its turn came: the connection taken before the wait may be one whose
      // session SAP lost meanwhile. Given back and taken again, inside the
      // flow, before asking — as a queued call does.
      let current = connection;
      if (this.isStaleBuilt(current)) {
        taken(undefined);
        this.connectionReleased(current);
        current = await this.getConnection(signal);
        taken(current);
      }
      return {
        connection: current,
        system: await this.requireSystem(current),
      };
    } finally {
      leave();
    }
  }

  /**
   * Whether `connection`, taken before its call waited in the main flow, is
   * no longer usable once the call's turn came: one this instance built (not
   * a host's) whose session SAP already lost — the next `getConnection`
   * replaces it. Nothing else replaces the instance's connection: a
   * changed credential is put in force on it (`getConnection`).
   */
  private isStaleBuilt(connection: AbapConnection): boolean {
    if (this.connectionContext?.kind !== 'built') return false;
    if (!this.entries.has(connection)) return false;
    return isSpent(connection);
  }

  /**
   * Runs `fn` with this instance's flow marked held — on `connection`, the
   * connection the holding call works on — when `holds`.
   */
  private inHeldFlow<T>(
    holds: boolean,
    connection: AbapConnection | undefined,
    fn: () => T,
  ): T {
    if (!holds || connection === undefined) return fn();
    const held = new Map(heldFlows.getStore() ?? []);
    held.set(this, connection);
    return heldFlows.run(held, fn);
  }

  /**
   * A send on the instance's connection made outside a tool's own run — an
   * identity lookup (`systeminformation`) of the background-run tools, or of
   * the debugger. `send` is handed the
   * connection to send on, and captures none of its own: inside a call that
   * holds the flow it runs directly, on the connection that call holds;
   * outside, it takes its turn in the main flow and then takes the
   * instance's connection (`getConnection`, inside the flow — so a session
   * the call ahead lost is replaced first), given back when it is done.
   */
  protected async onMainConnection<T>(
    signal: AbortSignal,
    send: (connection: AbapConnection) => Promise<T>,
  ): Promise<T> {
    const held = heldFlows.getStore()?.get(this);
    // Held without a connection: the turn is this call's already.
    if (held === null) return this.sendInTurn(signal, send);
    if (held !== undefined) return send(held);
    // Its turn: no timeout; a wait whose session ended leaves at once.
    const leave = await this.enterMainFlow(signal);
    try {
      return await this.sendInTurn(signal, send);
    } finally {
      leave();
    }
  }

  /**
   * Inside a turn of the main flow: `send` on the instance's connection,
   * taken now (`getConnection`) and given back when it is done.
   */
  private async sendInTurn<T>(
    signal: AbortSignal,
    send: (connection: AbapConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.getConnection(signal);
    try {
      return await this.inHeldFlow(true, connection, () => send(connection));
    } finally {
      this.connectionReleased(connection);
    }
  }

  /**
   * Runs `fn` with this instance's flow marked held without a connection:
   * a send made from within (`onMainConnection`) takes the instance's
   * connection inside this turn instead of queueing behind it.
   */
  private inHeldTurn<T>(fn: () => T): T {
    const held = new Map(heldFlows.getStore() ?? []);
    held.set(this, null);
    return heldFlows.run(held, fn);
  }

  /**
   * A call is done with the connection `getConnection` handed it: a
   * replaced one with no call left ends with its logoff. Called **exactly
   * once per `getConnection`** that returned a connection: the tool wrapper
   * does; a subclass that calls `getConnection` itself does too. A missing
   * release keeps a replaced connection open until the terminal close; a
   * second one would end it under another call.
   */
  protected connectionReleased(connection: AbapConnection): void {
    const entry = this.entries.get(connection);
    if (entry !== undefined) this.release(entry);
  }

  private release(entry: BuiltConnection): void {
    if (entry.users > 0) entry.users -= 1;
    if (entry.users === 0 && entry.retired && entry.ready !== undefined) {
      void endConnection(entry.ready);
    }
  }

  /** A built connection replaced: ended now, or when its last call ends. */
  private retire(entry: BuiltConnection): void {
    if (this.built === entry) this.built = undefined;
    entry.retired = true;
    // The locks the instance held in that session end with it.
    if (entry.ready !== undefined) this.heldLocks?.mainSessionEnded();
    entry.connection.then(
      (connection) => {
        if (entry.users === 0) void endConnection(connection);
      },
      () => undefined, // a failed connect was ended where it failed
    );
  }

  /**
   * The instance's connection is born: `birth` makes it — a logon
   * (`logOn`), or a leftover session taken up at a stdio start
   * (`resumedSession`) — and it is kept as `built` for `credential`, with
   * its parameters made together with it: the file's information (the
   * rules read it, nothing is sent); else its destination's when already
   * known for the same credential and target system — a replacement after
   * a lost session, a new logon after a gone leftover —; else its system
   * asked and the rules applied (`requireSystem`). A credential failure or
   * a refusal of the rules fails the birth: nothing is kept, the
   * connection ends (`failed`: its logoff, by default) and the next call
   * makes a new one. Set as `built` in the turn it is called, so every call
   * that asks for a connection meanwhile waits for this one.
   */
  private buildConnection(
    resolved: ResolvedConnection,
    birth: (born: ResolvedConnection) => Promise<AbapConnection>,
    failed: (connection: AbapConnection) => Promise<void> = (connection) =>
      endConnection(connection),
  ): BuiltConnection {
    const credential = resolved.credential;
    const destination: Destination = {
      credential,
      target: targetOf(resolved.settings),
      user: resolved.settings.username ?? resolved.systemContext?.login,
      responsible: resolved.systemContext?.responsible,
    };
    // The connection presents the credential in force: this one, until a
    // call puts another in force (`getConnection`).
    const current = new CurrentCredential(credential);
    const entry: BuiltConnection = {
      credential: current,
      connection: Promise.resolve() as unknown as Promise<AbapConnection>,
      users: 0,
      retired: false,
    };
    entry.connection = (async () => {
      const connection = await birth({ ...resolved, credential: current });
      this.destinationOf.set(connection, destination);
      this.systemContexts.set(connection, resolved.systemContext);
      try {
        const born = this.bornSystems.get(connection);
        const known = this.destinationSystem(
          destination.credential,
          destination.target,
        );
        if (born !== undefined) {
          // The birth knew it (a leftover's file): read by the rules.
          this.parametersFrom(connection, { system: born });
        } else if (known !== undefined) {
          this.knowParameters(connection, known);
        } else {
          await this.requireSystem(connection);
        }
      } catch (error) {
        await failed(connection);
        throw error;
      }
      entry.ready = connection;
      return connection;
    })();
    this.built = entry;
    // A completed connect stays the instance's whoever still waits for it
    //; a failed one is not kept: the next call connects again.
    entry.connection.catch(() => {
      if (this.built === entry) this.built = undefined;
    });
    return entry;
  }

  /**
   * A logon: the connection built from `resolved` and connected; once
   * connected, its session is kept in a runtime file when the instance keeps
   * them (`sessionOf`).
   */
  private async logOn(resolved: ResolvedConnection): Promise<AbapConnection> {
    const connection = await this.connectedLogon(resolved);
    const identity = this.sessionOf(resolved);
    if (identity !== undefined) {
      this.leftoverSessions?.track(connection, 'built', identity);
    }
    return connection;
  }

  /** A connection built from `resolved`, owned as `built`, and connected with its logon. */
  private async connectedLogon(
    resolved: ResolvedConnection,
  ): Promise<AbapConnection> {
    // A closed instance logs on nowhere: nothing is built or sent.
    refuseIfClosed(this);
    const connection = createAbapConnection(
      resolved.settings,
      resolved.credential,
    ) as AbapConnection;
    // The instance's own from here on: it ends with a logoff.
    own(connection, { owner: this, role: 'built' });
    // Establish session (CSRF token + cookies) before first request.
    // RFC needs this for the stateful session; HTTP needs it because some
    // SAP systems reject the very first request (403) when no session
    // cookie is present.
    try {
      await connection.connect();
    } catch (error) {
      // A failed connect is not kept, and still ends with its one
      // `disconnect()` (connection 16 logs off a session it received).
      await endConnection(connection);
      // A connect the instance's close cut short: the close's refusal.
      refuseWhenClosed(connection);
      throw error;
    }
    // Closed while it connected: its close swept it; it is not handed out.
    refuseWhenClosed(connection);
    return connection;
  }

  /**
   * A leftover session taken up at a stdio start (`bornAtStart`): the
   * connection built from `resolved` on the
   * session's cookies (connection 17's `session`) — `connect()` logs on
   * nowhere and asks SAP, without the credential, whether the session lives.
   * Alive: picked up. SAP answering it is gone (`sessionGone`): that
   * instance is spent and logged nothing on — connection's "a new session is
   * a new instance" — so a new one is built with the normal logon, with the
   * process's settings and credential, and starts a new session. Either way
   * the file is this process's under the same handle (`adopt`), rewritten
   * with the connection's cookies; `outcome.session` says which. The system
   * information the file carries is the connection's (same destination, same
   * system): nothing is looked up. Any other failure — the old session's
   * answer or the new logon's — is the start's, as SAP gave it, and gives
   * the file back as a leftover. So does a close (the process shutdown, the
   * instance's) that latched while either connected: the connection is not
   * adopted, and the start is refused (`refuseWhenClosed`).
   */
  private async resumedSession(
    resolved: ResolvedConnection,
    owner: LeftoverSessions,
    claimed: ClaimedSession,
    identity: SessionIdentity,
    outcome: { session?: 'picked_up' | 'new' },
  ): Promise<AbapConnection> {
    let connection: AbapConnection;
    try {
      connection = createAbapConnection(
        resolved.settings,
        resolved.credential,
        undefined,
        undefined,
        claimed.cookies,
      ) as AbapConnection;
    } catch (error) {
      owner.release(claimed);
      throw error;
    }
    // The instance's own from here on, like any built connection. A
    // closed owner refuses it: the claimed file is given back as a leftover.
    try {
      own(connection, { owner: this, role: 'built' });
    } catch (error) {
      owner.release(claimed);
      throw error;
    }
    try {
      await connection.connect();
    } catch (error) {
      // Spent either way; connection logs nothing off for a session it
      // did not take.
      await endConnection(connection);
      const sap = sapAnswerOf(error);
      if (sap === undefined || !sessionGone(sap.status)) {
        owner.release(claimed);
        throw error;
      }
      let fresh: AbapConnection;
      try {
        fresh = await this.connectedLogon(resolved);
        // Closed since the logon settled: its close swept it; not adopted.
        refuseWhenClosed(fresh);
      } catch (logonError) {
        owner.release(claimed);
        throw logonError;
      }
      owner.adopt(claimed, fresh, identity);
      if (claimed.system !== undefined)
        this.bornSystems.set(fresh, claimed.system);
      outcome.session = 'new';
      return fresh;
    }
    // Closed while it connected (the process shutdown, the instance's
    // close): its close swept it. Not adopted, not handed out; the claimed
    // file is given back as a leftover.
    try {
      refuseWhenClosed(connection);
    } catch (error) {
      owner.release(claimed);
      throw error;
    }
    owner.adopt(claimed, connection, identity);
    if (claimed.system !== undefined)
      this.bornSystems.set(connection, claimed.system);
    outcome.session = 'picked_up';
    return connection;
  }

  /**
   * stdio: the instance's connection born at the process's start, before
   * its transport opens. The one leftover session of the destination
   * (`claimTheOne`: a dead process's, role `built`) is taken up
   * (`resumedSession`); none, or more than one — none picked, they stay for
   * the list and the logoff — is a normal logon. Its parameters
   * are made with it (`buildConnection`): from the file's information when
   * it carries it, else its system asked — the rules (a host's) read it
   * once, here. Any failure is thrown for the start to end the
   * process with; a logon made for it is logged off first, a picked-up
   * session is left as it is (its file is a leftover again once the process
   * ended). A tool call after the start runs on this connection: the
   * source answers the same credential for the process's life.
   */
  protected async bornAtStart(signal: AbortSignal): Promise<StartedConnection> {
    const context = this.connectionContext;
    if (context?.kind !== 'built') {
      throw new Error(
        'Connection context not set. Call setConnectionContext() first.',
      );
    }
    throwIfRequestAborted(signal);
    const resolved = await context.source.resolve(signal);
    const owner = this.leftoverSessions;
    const identity = this.sessionOf(resolved);
    const claimed =
      owner !== undefined && identity !== undefined
        ? owner.claimTheOne(identity)
        : undefined;
    const outcome: { session?: 'picked_up' | 'new' } = {};
    const entry =
      claimed !== undefined && owner !== undefined && identity !== undefined
        ? this.buildConnection(
            resolved,
            (born) =>
              this.resumedSession(born, owner, claimed, identity, outcome),
            // A picked-up session is left as it is: its file is a leftover
            // again once the process ended.
            async (connection) => {
              if (outcome.session !== 'picked_up') {
                await endConnection(connection);
              }
            },
          )
        : this.buildConnection(resolved, (born) => this.logOn(born));
    // Its parameters are made with it (`buildConnection`): a refusal of the
    // rules ends the start.
    const connection = await entry.connection;
    try {
      // Closed meanwhile (during the birth): the start is refused —
      // the launcher never opens the transport — and the close's sweep has
      // the connection's logoff.
      refuseWhenClosed(connection);
    } catch (error) {
      if (this.built === entry) this.built = undefined;
      if (outcome.session !== 'picked_up') await endConnection(connection);
      throw error;
    }
    return claimed === undefined
      ? { session: 'logged_on' }
      : { session: outcome.session ?? 'picked_up', handle: claimed.handle };
  }

  /**
   * Registers handlers from registry
   * Wraps handlers to inject connection as first parameter
   *
   * Handler signature: (connection: AbapConnection, args: any) => Promise<any>
   * Registered as: (args: any) => handler(getConnection(), args)
   *
   * This ensures connection is injected but NOT exposed in MCP tool signature
   */
  protected registerHandlers(handlersRegistry: IHandlersRegistry): void {
    // Get handler groups from registry
    if (handlersRegistry instanceof CompositeHandlersRegistry) {
      const groups = handlersRegistry.getHandlerGroups();
      // Where the instance has a batch owner, every tool's description but
      // a batch tool's ends with its batch sentence (spec §3).
      const sentenced = this.batch !== undefined;

      for (const group of groups) {
        const handlers = group.getHandlers();
        for (const entry of handlers) {
          // Wrap handler to inject connection from context
          // Original handler: (context: HandlerContext, args: any) => Promise<any>
          type HandlerFnWithContext = (
            context: HandlerContext,
            args: unknown,
          ) => Promise<unknown>;
          type HandlerFnArgsOnly = (args: unknown) => Promise<unknown>;

          const runCall = async (args: unknown, signal: AbortSignal) => {
            // A tool that works on no connection (the leftover-session
            // tools): called without one being built or connected first.
            if (
              entry.connectionless === true ||
              (typeof entry.connectionless === 'function' &&
                entry.connectionless(args))
            ) {
              // While a batch is open such a tool is not served: it is
              // neither a batch tool nor recordable.
              if (this.batchOpenFor(entry.toolDefinition.name)) {
                return this.refusalAnswer(
                  new ServerRefusal(
                    'batch_not_recordable',
                    batchNotServedWords(entry.toolDefinition.name),
                  ),
                );
              }
              return this.runConnectionless(entry.handler, group, args, signal);
            }
            let inUse: AbapConnection | undefined;
            let leaveFlow: (() => void) | undefined;
            // The batch a `BatchEnd` (or `DebugBatchEnd`) call ends: the one
            // of its kind open when it came.
            const endingKind = endsBatch(entry.toolDefinition.name, args);
            const ending =
              endingKind !== undefined ? this.batch?.opened() : undefined;
            // An end with nothing to end is refused before a connection is
            // taken (spec §5.2 step 1).
            const nothingToEnd =
              endingKind !== undefined
                ? batchRefusal(this.batch, endingKind)
                : undefined;
            if (nothingToEnd !== undefined) {
              return this.refusalAnswer(nothingToEnd);
            }
            try {
              // A run tool's `background` is the wrapper's: read, refused
              // when it is not a boolean or when the host gave no strategy —
              // before any connection — and never handed to the handler.
              const runsInBackground =
                isBackgroundTool(entry.toolDefinition.name) &&
                this.backgroundRequested(args);
              const handlerArgs = isBackgroundTool(entry.toolDefinition.name)
                ? withoutBackground(args)
                : args;
              // Get connection from context (this.connectionContext), with
              // the call's signal (the session's end).
              let connection = await this.getConnection(signal);
              inUse = connection;
              // One instance, one connection, one main flow: a call that works
              // on the instance's connection waits until the call before it
              // settled, whatever the client sends at once. Entered after the
              // connection is ready, so concurrent callers still share one
              // connect(). A background run and a listed long read work
              // on a connection of their own and take no place in it; so do the
              // debugger tools whose SAP work is on the debugger's own
              // connections — their sends on this one (`onMainConnection`)
              // still take their turn.
              // While a batch is open every call but a batch tool's takes its
              // turn: a recorded call is recorded in call order, a refused one
              // is refused there — a long read in batch mode gets no
              // connection of its own. The debugger batch is the debugger
              // tools': they keep working outside the flow, their numbers
              // in record order (spec §7).
              const ownConnection =
                (!this.batchOpenFor(entry.toolDefinition.name) ||
                  this.inDebuggerBatch(entry.toolDefinition.name)) &&
                worksOnOwnConnection(
                  entry.toolDefinition.name,
                  args,
                  runsInBackground,
                );
              if (!ownConnection) {
                leaveFlow = await this.enterMainFlow(signal);
                // The connection this call took before it waited may be one
                // whose session SAP already lost while the call ahead ran. It
                // is given back and the instance's connection taken again —
                // inside the flow, before the tool runs — so a queued batch
                // does not fail on the one lost session.
                if (this.isStaleBuilt(connection)) {
                  inUse = undefined;
                  this.connectionReleased(connection);
                  connection = await this.getConnection(signal);
                  inUse = connection;
                }
              }
              // The connection's system information, asked before the tool
              // runs when it has none; its failure is this call's answer, and
              // the tool never runs twice.
              const before = await this.systemBeforeTool(
                connection,
                leaveFlow !== undefined,
                signal,
                (taken) => {
                  inUse = taken;
                },
              );
              connection = before.connection;
              const system = before.system;
              // The call's destination's port, whichever connection
              // its reads go on (a long read's own one included).
              const batchAvailability = this.batchAvailabilityOf(connection);
              const context: HandlerContext = {
                connection,
                logger: this.logger,
                adtHeaders: this.adtHeadersOf(connection),
                state: this.state,
                debugger: () => this.debuggerFor(),
                onMainConnection: (send) => this.onMainConnection(signal, send),
                ...(this.batch !== undefined ? { batch: this.batch } : {}),
                ...(batchAvailability !== undefined
                  ? { batchAvailability }
                  : {}),
                ...(this.heldLocks !== undefined
                  ? { heldLocks: this.heldLocks }
                  : {}),
                ...(this.longSession !== undefined
                  ? { longSession: this.longSession }
                  : {}),
                ...(this.systemType !== undefined
                  ? { systemType: this.systemType }
                  : {}),
                ...(this.leftoverSessions !== undefined
                  ? { sessionFiles: this.leftoverSessions }
                  : {}),
              };

              // If handler expects context+args (preferred), pass both.
              // Otherwise, update group context and call with args only for backward compatibility.
              // NOTE: Always await the handler result to ensure we get the resolved value for normalization
              // Both branches run inside withKnownSystemContext: the
              // responsible/master system are what the system names
              // (src/lib/requestSystemResolution.ts), over anything stated.
              // The destination's own .env enters the scope first, below the
              // request's headers; it stands only where an on-premise system
              // has no systeminformation.
              // The whole call runs in the request signal scope, and
              // a call whose signal aborted before its tool starts — after
              // the connection is ready, after the system lookup — never
              // reaches the tool.
              const holdsFlow = leaveFlow !== undefined;
              const resolved = <T>(fn: () => Promise<T>) =>
                this.inHeldFlow(holdsFlow, context.connection, () =>
                  runWithRequestSignal(signal, () =>
                    withDestinationSystemContext(
                      this.systemContexts.get(context.connection),
                      () =>
                        // Asked before the tool (`systemBeforeTool`):
                        // nothing is sent here.
                        withKnownSystemContext(system, () => {
                          throwIfRequestAborted(signal);
                          return fn();
                        }),
                    ),
                  ),
                );
              // Batch mode (read inside the call's turn): an eligible call is
              // recorded, every other refused — before any handler is chosen.
              if (this.batchOpenFor(entry.toolDefinition.name)) {
                return await this.recordCall({
                  tool: entry.toolDefinition.name,
                  handler: entry.handler,
                  group,
                  context,
                  args: handlerArgs,
                  holdsFlow,
                  runsInBackground,
                  system,
                  signal,
                });
              }
              let handlerPromise: Promise<unknown>;
              const listed = isLongTool(entry.toolDefinition.name);
              const read =
                listed && isLongRead(entry.toolDefinition.name, args);
              if (listed && !read && readTimeout(args) !== undefined) {
                // A listed tool's run mode takes no `timeout`.
                return return_error(new Error(TIMEOUT_NOT_FOR_RUN_WORDS)) as {
                  isError: true;
                  content: { type: 'text'; text: string }[];
                };
              }
              if (runsInBackground) {
                // A background run: on a connection of its own, answered at
                // once with its handle; its answer goes to the strategy.
                handlerPromise = resolved(() =>
                  this.startBackground(
                    entry.toolDefinition.name,
                    entry.handler,
                    group,
                    context,
                    handlerArgs,
                    signal,
                  ),
                );
              } else if (read) {
                // A listed long tool: a read on a connection of
                // its own, its `timeout` cutting the read.
                const timeoutSeconds = readTimeout(args);
                if (timeoutSeconds === null) {
                  return return_error(new Error(TIMEOUT_INVALID_WORDS)) as {
                    isError: true;
                    content: { type: 'text'; text: string }[];
                  };
                }
                handlerPromise = resolved(() =>
                  runLongCall({
                    name: entry.toolDefinition.name,
                    connection,
                    logger: this.logger,
                    timeoutSeconds,
                    run: (own) =>
                      callHandler(
                        entry.handler,
                        group,
                        { ...context, connection: own as AbapConnection },
                        withoutTimeout(args),
                      ),
                  }),
                );
              } else if ((entry.handler as HandlerFnWithContext).length >= 2) {
                handlerPromise = resolved(() =>
                  (entry.handler as HandlerFnWithContext)(context, handlerArgs),
                );
              } else {
                try {
                  const contextAwareGroup = group as Partial<{
                    setContext: (ctx: HandlerContext) => void;
                    context: HandlerContext;
                  }>;
                  if (typeof contextAwareGroup.setContext === 'function') {
                    contextAwareGroup.setContext(context);
                  } else {
                    contextAwareGroup.context = context;
                  }
                } catch {
                  // ignore if group doesn't expose context setter
                }
                handlerPromise = resolved(() =>
                  (entry.handler as HandlerFnArgsOnly)(handlerArgs),
                );
              }

              const result = await handlerPromise;

              // Shared with BaseHandlerGroup so the two registration paths
              // cannot drift apart.
              const content = normalizeToolContent(result);

              // A failed tool returns an isError result — it does not throw.
              // Throwing would make the SDK re-wrap the text with "MCP error -32603: ".
              if ((result as ToolResultLike | undefined)?.isError) {
                // `BatchEnd` answering its own error: every number of its
                // batch answers the same (spec §5.3).
                if (this.batch !== undefined && ending !== undefined) {
                  endWithFailure(
                    this.batch,
                    { content, isError: true },
                    ending,
                  );
                }
                return { content, isError: true };
              }

              return { content };
            } catch (error) {
              // The failure reader first: a chain failure or the
              // server's own refusal is answered as the failure answer, its diagnostics on
              // stderr only.
              // The reader may be an override or a host's: guarded, so its
              // own throw answers fixed words, never itself.
              // An uncaught throw (connection setup, handler, transport) becomes a
              // structured result. return_error extracts the ADT response body,
              // which the SDK's own error.message would discard.
              const failed = this.refusalAnswer(error);
              // `BatchEnd` failing before `execute()` — taking the connection,
              // the system lookup — ends batch mode with no map: every number
              // answers this failure, as the call answers it; nothing is
              // sent. Failing after (its own error thrown: a credential
              // refusal, `batch_parts_mismatch`, `batch_unsplit`), its batch
              // has already ended with no map, and its numbers answer this
              // same answer. A batch begun since is not this call's to end.
              if (this.batch !== undefined && ending !== undefined) {
                endWithFailure(this.batch, failed, ending);
              }
              return failed;
            } finally {
              if (inUse !== undefined) this.connectionReleased(inUse);
              leaveFlow?.();
            }
          };

          // The host's `state_handle` declaration, where it states one and
          // the tool declares none of its own: the argument routes the call
          // (the pool) and reaches no handler — the handler gets the
          // arguments it got before.
          // `declared`: the declaration was added — a schema that declares
          // its own, or one it cannot extend, is registered as it is and
          // its arguments reach the handler as they came.
          const withHandle = this.stateHandleArgument
            ? (withStateHandle(
                entry.toolDefinition.inputSchema,
              ) as typeof entry.toolDefinition.inputSchema)
            : entry.toolDefinition.inputSchema;
          const declared = withHandle !== entry.toolDefinition.inputSchema;
          const inputSchema = withHandle;

          // Tracked from its entry, with its own request signal (`trackCall`).
          const toolName = entry.toolDefinition.name;
          const wrappedHandler = (args: unknown) =>
            this.trackCall(toolName, (signal) =>
              runCall(declared ? withoutStateHandle(args) : args, signal),
            );
          // Convert JSON Schema to Zod if needed, otherwise pass as-is
          const zodSchema =
            inputSchema &&
            typeof inputSchema === 'object' &&
            inputSchema.type === 'object' &&
            inputSchema.properties
              ? jsonSchemaToZod(inputSchema)
              : inputSchema;

          // Skip tools not available in the stated SAP environment. The
          // kind is never guessed: with none stated (stdio's inspection-only
          // mode, which has no system; an embedder's own transport host that
          // states none) nothing is filtered — every tool of the set is
          // listed, and a call that would reach a system is refused
          // `system_type_required` before anything is sent.
          const availableIn = entry.toolDefinition.available_in;
          const currentEnv = statedEnvironment(
            this.systemType ?? process.env.SAP_SYSTEM_TYPE,
          );
          if (
            availableIn &&
            availableIn.length > 0 &&
            currentEnv !== undefined
          ) {
            if (!availableIn.includes(currentEnv)) {
              this.logger.debug(
                `[BaseMcpServer] Skipping tool ${entry.toolDefinition.name}: available_in=${JSON.stringify(availableIn)}, currentEnv=${currentEnv}, source=${this.systemType ? 'option' : 'env'}, SAP_SYSTEM_TYPE=${process.env.SAP_SYSTEM_TYPE || '(not set)'}`,
              );
              continue;
            }
          }

          // Register wrapped handler via SDK registerTool
          // Note: connection is NOT part of MCP tool signature
          this.registerTool(
            entry.toolDefinition.name,
            {
              description:
                sentenced && !runsBesideBatch(entry.toolDefinition.name)
                  ? withBatchSentence(
                      entry.toolDefinition.description,
                      entry.toolDefinition.name,
                    )
                  : entry.toolDefinition.description,
              inputSchema: zodSchema,
              ...searchMeta(entry.toolDefinition.name),
            },
            wrappedHandler,
          );
        }
      }
    } else {
      // A registry that registers its own tools: no connection is injected,
      // but every tool it registers goes through the same call tracking —
      // its request signal, the registry of live calls, the request signal
      // scope, the abort check, and its turn in the main flow — as the tools above.
      handlersRegistry.registerAllTools(this.trackingRegistrations());
    }
  }
  /**
   * Whether a call of `tool` meets an open batch: a batch is open and `tool`
   * is neither a batch tool nor a long-session tool — those run beside it,
   * at once, never recorded (`runsBesideBatch`).
   */
  private batchOpenFor(tool: string): boolean {
    return (
      this.batch !== undefined &&
      this.batch.mode() !== 'off' &&
      !runsBesideBatch(tool)
    );
  }

  /** Whether a call of `tool` meets the open debugger batch as a debugger tool. */
  private inDebuggerBatch(tool: string): boolean {
    return (
      this.batch !== undefined &&
      this.batch.mode() === 'debugger' &&
      isDebuggerOwnConnectionTool(tool)
    );
  }

  /** A failure answered as a tool's: through the failure reader, else `return_error`. */
  private refusalAnswer(error: unknown): {
    content: { type: 'text'; text: string }[];
    isError: true;
  } {
    const read = readGuarded((t) => this.readFailure(t), error);
    if (read !== undefined) {
      return answerRead(read) as {
        content: { type: 'text'; text: string }[];
        isError: true;
      };
    }
    return return_error(error) as {
      content: { type: 'text'; text: string }[];
      isError: true;
    };
  }

  /**
   * A call in its turn while a batch is open (spec §4.1). Refused — thrown
   * as the server's refusal, answered by the caller — unless the open
   * batch is a communication batch that admits it: a tool that works on a
   * connection of its own (a debugger tool, a background run) or a call
   * that holds no turn is not served; a listed long read given `timeout` is
   * refused `batch_no_timeout`; a call no entry of the eligibility table
   * admits — read on the arguments the handler receives, over the kind of
   * the instance's connection — is refused `batch_not_recordable`. A refusal
   * takes no number.
   *
   * Admitted, the handler runs on a recorder over the batch connection, in
   * the call's scopes but under the batch's signal, and the call waits until
   * it has recorded everything it sends before an answer, or settled. It
   * answers nothing (`{ content: [] }`) once it recorded; the handler goes on
   * and builds its answer when `BatchEnd` settles its parts — the answer of
   * its number. A handler that settled without recording answers its own
   * answer, with no number — or, when its request was of another session
   * kind than the batch holds, the refusal `batch_other_kind` (every batch
   * end sends one envelope). The late-bound target points at the call's
   * connection for its turn.
   */
  private async recordCall(call: {
    tool: string;
    handler: unknown;
    group: unknown;
    context: HandlerContext;
    args: unknown;
    holdsFlow: boolean;
    runsInBackground: boolean;
    system: ResolvedSystemContext | undefined;
    signal: AbortSignal;
  }): Promise<{
    content: { type: 'text'; text: string }[];
    isError?: true;
  }> {
    const owner = this.batch;
    const open = owner?.opened();
    const notServed = () =>
      new ServerRefusal('batch_not_recordable', batchNotServedWords(call.tool));
    if (owner === undefined || open === undefined) throw notServed();
    // The debugger batch records the operations of spec §7's table alone,
    // each at the stop it was opened on — the ABAP stop or the AMDP break;
    // every other call is refused.
    if (owner.mode() === 'debugger') {
      if (
        !recordableInDebugBatch(call.tool, call.args, open.debuggee ?? 'abap')
      )
        throw notServed();
      throwIfRequestAborted(call.signal);
      return this.runRecorded(call, owner, open);
    }
    if (owner.mode() !== 'communication') throw notServed();
    if (
      !call.holdsFlow ||
      call.runsInBackground ||
      isDebuggerOwnConnectionTool(call.tool)
    ) {
      throw notServed();
    }
    if (isLongTool(call.tool) && readTimeout(call.args) !== undefined) {
      throw new ServerRefusal('batch_no_timeout');
    }
    const connection = call.context.connection;
    const kind = isRfcConnection(connection) ? 'rfc' : 'http';
    if (!eligible(call.tool, call.args, kind).ok) {
      throw new ServerRefusal(
        'batch_not_recordable',
        batchNotRecordableWords(call.tool),
      );
    }
    throwIfRequestAborted(call.signal);
    return this.runRecorded(call, owner, open);
  }

  /**
   * An admitted call recorded: its handler runs on a per-call recorder over
   * `open`'s batch connection, in the call's scopes but under the batch's
   * signal, and the call waits until it has recorded everything it sends
   * before an answer, or settled (`recordCall`). A communication batch's
   * late-bound target points at the call's connection for its turn.
   */
  private async runRecorded(
    call: {
      tool: string;
      handler: unknown;
      group: unknown;
      context: HandlerContext;
      args: unknown;
      holdsFlow: boolean;
      system: ResolvedSystemContext | undefined;
    },
    owner: InstanceBatch,
    open: OpenBatch,
  ): Promise<{
    content: { type: 'text'; text: string }[];
    isError?: true;
  }> {
    const connection = call.context.connection;
    // The handler's promise, known only once it is started; its number is
    // taken at its first request, possibly before. Boxed: a promise resolved
    // with the handler's promise would adopt it, and a handler that throws
    // would then reject the answer instead of reaching `recordedAnswer`.
    let started!: (started: { handler: Promise<unknown> }) => void;
    const handlerStarted = new Promise<{ handler: Promise<unknown> }>(
      (resolve) => {
        started = resolve;
      },
    );
    const recorder = createRecorder(
      open.connection,
      owner,
      (number) => {
        open.recorded.push({
          number,
          parts: () => recorder.parts(),
          // Read by its number: the handler, waiting at its first request,
          // meets its parts now and builds the number's answer.
          resume: () =>
            handlerStarted.then(({ handler }) => {
              recorder.release();
              return this.recordedAnswer(
                number,
                handler,
                owner,
                () => recorder.rawParts(),
                () => recorder.otherKind(),
              );
            }),
        });
      },
      call.tool,
    );
    const recordedContext: HandlerContext = {
      ...call.context,
      connection: recorder as unknown as AbapConnection,
      // The debug sessions are bound to the call's own context, whose
      // connection outlives the batch (`requireDebugger`).
      ...(owner.mode() === 'debugger' ? { recordedFrom: call.context } : {}),
      // Its number is read later: a lock it answers is held only while the
      // SAP session its envelope went out on is still the instance's.
      ...(this.heldLocks !== undefined
        ? { heldLocks: this.heldLocks.heldIn(() => open.lockSession) }
        : {}),
    };
    open.target?.point(connection);
    try {
      let handler: Promise<unknown>;
      try {
        handler = Promise.resolve(
          this.inHeldFlow(call.holdsFlow, connection, () =>
            runWithRequestSignal(owner.signal(), () =>
              withDestinationSystemContext(
                this.systemContexts.get(connection),
                () =>
                  withKnownSystemContext(call.system, () =>
                    asRecordedCall(() =>
                      callHandler(
                        call.handler,
                        call.group,
                        recordedContext,
                        call.args,
                      ),
                    ),
                  ),
              ),
            ),
          ),
        );
      } catch (error) {
        handler = Promise.reject(error);
      }
      // It never rejects unhandled: its answer is read by its number, or
      // below when it recorded nothing.
      handler.catch(() => undefined);
      started({ handler });
      await untilSent(handler, recorder);
      // A request of another session kind than the batch holds: refused
      // before it was recorded, whatever the handler made of it. With no
      // part recorded the call has no number; with an earlier part recorded
      // the words name its number, and that number answers the refusal too.
      const otherKind = recorder.otherKind();
      if (otherKind !== undefined) throw otherKind;
      if (recorder.number() !== undefined) return { content: [] };
      // Settled without recording: nothing went into an envelope.
      const result = await handler;
      const content = normalizeToolContent(result) as {
        type: 'text';
        text: string;
      }[];
      return (result as ToolResultLike | undefined)?.isError
        ? { content, isError: true }
        : { content };
    } finally {
      open.target?.point(undefined);
    }
  }

  /**
   * A recorded call's answer under its number, built when the number is
   * first read: the tool's answer its handler, resumed then, built from all
   * its parts, as this wrapper answers a tool — its
   * content, `isError` when it failed; a throw read by the failure reader,
   * else `return_error`. A call a part of which was refused for its session
   * kind (`otherKind`) answers that refusal, whatever its handler built.
   * Never rejects.
   */
  private async recordedAnswer(
    number: number,
    handler: Promise<unknown>,
    owner: InstanceBatch,
    rawParts: () => BatchAnswer['raw'],
    otherKind: () => ServerRefusal | undefined,
  ): Promise<BatchAnswer> {
    let answer: Pick<BatchAnswer, 'content' | 'isError'>;
    try {
      const result = await handler;
      const refused = otherKind();
      if (refused !== undefined) throw refused;
      const content = normalizeToolContent(result) as BatchAnswer['content'];
      answer = (result as ToolResultLike | undefined)?.isError
        ? { content, isError: true }
        : { content };
    } catch (error) {
      answer = this.refusalAnswer(otherKind() ?? error);
    }
    return {
      number,
      ...answer,
      ...(owner.keepRawParts ? { raw: rawParts() } : {}),
    };
  }

  /**
   * A tool that works on no connection of the instance (`connectionless`):
   * the call's context has none, and the leftover-session port when the host
   * gave an owner. Answered like any tool: its failure through the failure
   * reader, else `return_error`.
   */
  private async runConnectionless(
    handler: unknown,
    group: unknown,
    args: unknown,
    signal: AbortSignal,
  ): Promise<{
    content: { type: 'text'; text: string }[];
    isError?: true;
  }> {
    try {
      const context: HandlerContext = {
        connection: undefined as never,
        logger: this.logger,
        state: this.state,
        debugger: () => this.debuggerFor(),
        ...(this.batch !== undefined ? { batch: this.batch } : {}),
        ...(this.heldLocks !== undefined ? { heldLocks: this.heldLocks } : {}),
        ...(this.longSession !== undefined
          ? { longSession: this.longSession }
          : {}),
        ...(this.systemType !== undefined
          ? { systemType: this.systemType }
          : {}),
        ...(this.leftoverSessions !== undefined
          ? {
              sessionFiles: this.leftoverSessions,
              leftoverSessions: this.leftoverPort(signal),
            }
          : {}),
        ...(this.backgroundRuns !== undefined
          ? {
              backgroundRuns: backgroundRunTools(this.backgroundRuns, () =>
                this.backgroundCaller(signal),
              ),
            }
          : {}),
      };
      const result = await runWithRequestSignal(signal, () => {
        throwIfRequestAborted(signal);
        return callHandler(handler, group, context, args);
      });
      const content = normalizeToolContent(result) as {
        type: 'text';
        text: string;
      }[];
      if ((result as ToolResultLike | undefined)?.isError) {
        return { content, isError: true };
      }
      return { content };
    } catch (error) {
      const read = readGuarded((t) => this.readFailure(t), error);
      if (read !== undefined) {
        return answerRead(read) as {
          content: { type: 'text'; text: string }[];
          isError: true;
        };
      }
      return return_error(error) as {
        isError: true;
        content: { type: 'text'; text: string }[];
      };
    }
  }

  /**
   * Whether a run tool's call asks for a background run: `background: true`.
   * Refused in fixed words when the value is not a boolean, and when the
   * host gave no strategy (`background_runs_unavailable`) — as a
   * fresh-connection operation is without `freshConnection`, before any
   * connection.
   */
  private backgroundRequested(args: unknown): boolean {
    const background = readBackground(args);
    if (background === null) throw new Error(BACKGROUND_INVALID_WORDS);
    if (background && this.backgroundRuns === undefined) {
      throw new ServerRefusal('background_runs_unavailable');
    }
    return background;
  }

  /**
   * Starts a background run of a run tool (lib's `startBackgroundRun`): the
   * caller resolved, the run's own connection opened from the call's, the
   * handler run on it without the call waiting, its answer — as this
   * wrapper would answer it, an error included — handed to the strategy.
   * Answers the handle at once; the shutdown refusal once the shutdown or
   * this instance's close began.
   */
  private async startBackground(
    tool: string,
    handler: unknown,
    group: unknown,
    context: HandlerContext,
    args: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const strategy = this.backgroundRuns;
    if (strategy === undefined) {
      throw new ServerRefusal('background_runs_unavailable');
    }
    // No connection of its own to be had: the refusal for a missing fresh connection, before the caller
    // is asked of the system or anything is kept.
    if (!freshConnectionAvailable(context.connection)) {
      throw new ServerRefusal('fresh_connection_unavailable');
    }
    const caller = await this.backgroundCaller(signal);
    const started = await startBackgroundRun({
      strategy,
      caller,
      tool,
      object: backgroundObjectOf(args),
      instance: this,
      connection: context.connection,
      logger: this.logger,
      track: (own) => this.trackRun(own),
      run: (own) =>
        this.backgroundAnswer(
          handler,
          group,
          { ...context, connection: own },
          args,
        ),
    });
    if (started === undefined) return shutdownRefusalAnswer();
    return answerBackgroundStarted(started);
  }

  /**
   * The connections of the background runs this instance started, while
   * they run: the instance close cuts them (`cutBackgroundRuns`). Per
   * instance — another instance's runs are not here.
   */
  private readonly startedRuns = new Set<object>();

  /**
   * Tracks a run's own connection; answers its untracking. Refused once
   * this instance is closed: a run that connected after the close's sweep
   * would never be cut.
   */
  private trackRun(connection: object): () => void {
    refuseIfClosed(this);
    this.startedRuns.add(connection);
    return () => {
      this.startedRuns.delete(connection);
    };
  }

  /**
   * The instance close (`closeInstance`): every background run this
   * instance started gets its logoff at once, which cuts it — as the
   * process's end does. Each run then ends in its strategy by its own end
   * (the run tool's answer once its request settled).
   */
  cutBackgroundRuns(): Promise<void> {
    const runs = [...this.startedRuns].map((connection) =>
      endConnection(connection),
    );
    return Promise.all(runs).then(() => undefined);
  }

  /**
   * The run tool on the run's own connection, answered as this wrapper
   * answers a tool: its content, `isError` when it failed; a throw read by
   * the failure reader, else `return_error`. Its own request scope: the
   * call that started it ends long before, and nothing of it reaches here.
   */
  private async backgroundAnswer(
    handler: unknown,
    group: unknown,
    context: HandlerContext,
    args: unknown,
  ): Promise<BackgroundRunAnswer> {
    try {
      const result = await runWithRequestSignal(
        new AbortController().signal,
        () => callHandler(handler, group, context, args),
      );
      const content = normalizeToolContent(result) as {
        type: 'text';
        text: string;
      }[];
      return (result as ToolResultLike | undefined)?.isError
        ? { content, isError: true }
        : { content };
    } catch (error) {
      const read = readGuarded((t) => this.readFailure(t), error);
      if (read !== undefined) {
        return answerRead(read) as BackgroundRunAnswer;
      }
      return return_error(error) as BackgroundRunAnswer;
    }
  }

  /**
   * Who calls, for the background runs: the destination (URL, client) and
   * the user its parameters name (`callerUserOf`: the responsible the rules
   * made with the connection — the system's user, else on-premise the
   * stated responsible, else the login), else the stated responsible, else
   * the login (`SAP_USERNAME`, `x-sap-login`), upper case. An injected
   * connection names its URL. A user that cannot be determined is refused
   * (`system_user_unknown`): a run is kept only for a known caller.
   */
  protected async backgroundCaller(
    signal: AbortSignal,
  ): Promise<BackgroundRunCaller> {
    const context = this.connectionContext;
    if (context === null) {
      throw new ServerRefusal('background_runs_unavailable');
    }
    if (context.kind === 'injected') {
      const connection = context.connection;
      const url = await connection.getBaseUrl();
      const named = await this.callerUserOf(signal, () =>
        this.systems.get(connection),
      );
      const stated = statedCallOf(connection, this.systemType);
      return {
        url: withoutTrailingSlashes(url.trim()),
        client: '',
        user: callerUser(named, stated.responsible ?? stated.login),
      };
    }
    const resolved = await this.resolveCaller(signal);
    const url = withoutTrailingSlashes((resolved.settings.url ?? '').trim());
    const client = (resolved.settings.client ?? '').trim();
    const named = await this.callerUserOf(signal, () =>
      this.destinationSystem(resolved.credential, targetOf(resolved.settings)),
    );
    return {
      url,
      client,
      user: callerUser(
        named,
        statedResponsibleOf(resolved.systemContext?.responsible) ??
          resolved.settings.username ??
          resolved.systemContext?.login,
      ),
    };
  }

  /**
   * The user the caller's parameters name (`known`), upper case: known at
   * once, without entering the main flow; else made with the instance's
   * connection, on the connection the main flow hands (its birth, or
   * `requireSystem`). `undefined`: no resolver (nothing is made), or the
   * parameters name none.
   */
  private async callerUserOf(
    signal: AbortSignal,
    known: () => KnownParameters | undefined,
  ): Promise<string | undefined> {
    if (this.systemContextResolver === null) return undefined;
    const parameters = known();
    if (parameters !== undefined) return userNamed(parameters.parameters);
    return this.onMainConnection(signal, async (connection) =>
      userNamed(await this.requireSystem(connection)),
    );
  }

  /**
   * Who calls, for the leftover-session tools: the request's settings and
   * credential, resolved from the instance's source. An instance whose
   * connection the host gave has none to resolve: not available here. A
   * server that refuses before any connection (core's inspection-only mode)
   * overrides this.
   */
  protected async resolveCaller(
    signal: AbortSignal,
  ): Promise<ResolvedConnection> {
    const context = this.connectionContext;
    if (context?.kind !== 'built') {
      throw new ServerRefusal('leftover_sessions_unavailable');
    }
    throwIfRequestAborted(signal);
    return context.source.resolve(signal);
  }

  /**
   * What a session opened from `resolved` is kept as, when the instance
   * keeps runtime files — the host gave an owner and the instance serves a
   * destination (`ConnectionContext.destination`): the destination's name,
   * where its settings point, and the user they state (none for a token
   * credential). Read from the destination alone: nothing is asked of SAP.
   * None over RFC.
   */
  private sessionOf(resolved: ResolvedConnection): SessionIdentity | undefined {
    if (this.leftoverSessions === undefined) return undefined;
    const context = this.connectionContext;
    if (context?.kind !== 'built' || context.destination === undefined) {
      return undefined;
    }
    return sessionIdentity(
      context.destination,
      resolved.settings,
      resolved.systemContext?.login,
    );
  }

  /**
   * The owner, the caller's resolution and identity — the destination the
   * instance serves, where its settings point (`sessionOf`): nothing is
   * asked of SAP and no connection is built. Refused without an owner, and
   * on an instance that serves no destination.
   */
  private async leftoverCaller(signal: AbortSignal): Promise<{
    owner: LeftoverSessions;
    resolved: ResolvedConnection;
    identity: SessionIdentity | undefined;
  }> {
    const owner = this.leftoverSessions;
    if (owner === undefined) {
      throw new ServerRefusal('leftover_sessions_unavailable');
    }
    const resolved = await this.resolveCaller(signal);
    const context = this.connectionContext;
    if (context?.kind !== 'built' || context.destination === undefined) {
      throw new ServerRefusal('leftover_sessions_unavailable');
    }
    return { owner, resolved, identity: this.sessionOf(resolved) };
  }

  /** The leftover-session tools' port for one call. */
  private leftoverPort(signal: AbortSignal): LeftoverSessionTools {
    return {
      list: async () => {
        const { owner, identity } = await this.leftoverCaller(signal);
        // Over RFC no session is kept, and none is the caller's.
        return identity === undefined ? [] : owner.list(identity);
      },
      logoff: (handle) => this.logoffLeftover(handle, signal),
    };
  }

  /** The caller's leftover session `handle`, claimed; refused the same way whatever the reason. */
  private claimLeftover(
    owner: LeftoverSessions,
    identity: SessionIdentity | undefined,
    handle: string,
  ): ClaimedSession {
    const claimed =
      identity === undefined ? undefined : owner.claim(handle, identity);
    if (claimed === undefined) {
      throw new ServerRefusal('leftover_session_not_available');
    }
    return claimed;
  }

  /**
   * Logoff (any role): the platform's ICF logoff with the session's cookies
   * and no credential, then the file deleted — only once the logoff
   * completed: written, and the connection's `flushGoodbye()` settled
   * (`logoffCompleted`, no timer). connection 17.1 sends it from an instance
   * built on the session and disconnected without `connect()`: the logoff
   * and nothing else — no CSRF fetch before it, the credential's `prepare()`
   * never called. Its answer is not read, so whether the session still
   * lived is SAP's to know. A logoff not written, or not completed, gives
   * the file back as a leftover. It touches neither the instance's
   * connection nor its main flow.
   */
  private async logoffLeftover(
    handle: string,
    signal: AbortSignal,
  ): Promise<LogoffOutcome> {
    const { owner, resolved, identity } = await this.leftoverCaller(signal);
    const claimed = this.claimLeftover(owner, identity, handle);
    let settled = false;
    try {
      // A closed instance sends nothing, a logoff included.
      refuseIfClosed(this);
      const connection = createAbapConnection(
        resolved.settings,
        resolved.credential,
        undefined,
        undefined,
        claimed.cookies,
      );
      // For this one operation: ended here, or by the instance's close.
      own(connection, { owner: this, role: 'fresh' });
      let failed = false;
      await endConnection(connection, () => {
        failed = true;
      });
      if (failed) throw new Error(LEFTOVER_LOGOFF_NOT_WRITTEN_WORDS);
      // The file goes only once the logoff completed, never on the write.
      if (!(await logoffCompleted(connection))) {
        throw new Error(LEFTOVER_LOGOFF_NOT_COMPLETED_WORDS);
      }
      owner.forget(claimed);
      settled = true;
      return { handle: claimed.handle, state: 'logged_off' };
    } finally {
      if (!settled) owner.release(claimed);
    }
  }

  /**
   * One tool call, tracked from its entry — before the connection is
   * acquired — so idle() cannot miss a call still acquiring its connection.
   * The same entry and end are the user activity the state's idle bound
   * counts: it pauses while the call runs and counts from its end.
   *
   * Each call has a request signal of its own: aborted when the
   * session ends — the instance's transport closed (`closeInstance`), unless
   * the host connects a transport per request (`transportCloseEndsSession:
   * false`, http: a dropped request ends no call) — and
   * when the call ends whatever its outcome (the broker releases the
   * party it attached only then). A tool call cannot be cancelled: the
   * request's `extra.signal`, which the SDK also aborts for a client's
   * `notifications/cancelled`, is not read — the call runs to its end (the
   * SDK then sends no answer to a cancelled request). The registry of live
   * calls, where the call is registered here before anything else, keeps
   * its controller: the instance close (`closeInstance`) and the process
   * shutdown (`logOffAtOnce`) abort it — the call is interrupted, its
   * connections logged off at once. Once the process or this instance is latched, the
   * call is refused here — the shutdown refusal, before any connection or
   * handler.
   *
   * The call runs as this instance's (`runAsOwner`): a connection it opens is
   * this instance's, closed by its terminal close.
   */
  private trackCall<T>(
    name: string,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const unregister = registerActiveTool(controller, {
      instance: this,
      name,
    });
    if (unregister === undefined) {
      return Promise.resolve(shutdownRefusalAnswer() as T);
    }
    this.state.callStarted();
    const call = runAsOwner(this, () => run(controller.signal));
    this.inFlight.add(call);
    call
      .finally(() => {
        controller.abort();
        unregister();
        this.inFlight.delete(call);
        this.state.callEnded();
      })
      .catch(() => undefined); // the caller answers the failure; nothing rejects unhandled
    return call;
  }

  /**
   * This server, as a registry that registers its own tools sees it: each
   * callback given to `registerTool` (or the older `tool`) is tracked like
   * the tools of a handler group — its request signal, the registry of live
   * calls, the request signal scope — and a call whose signal aborted before
   * the tool starts ends without reaching it.
   *
   * Such a callback can reach the instance's connection: the server it is
   * handed is this instance (every member bound, `getConnection` and
   * `onMainConnection` included), and a subclass's own registry may call its
   * protected members. So every call takes its turn in the main flow and
   * leaves it when the callback settled — whatever its name or its
   * arguments: no list exempts it (`worksOnOwnConnection` reads only a
   * handler group's tools, which are known). Inside the turn the instance's
   * connection is taken and its system information asked before the
   * callback runs, as before a handler group's tool (`systemBeforeTool`):
   * a failure is that call's answer, the
   * callback does not run, and the next call asks again. The callback runs
   * in the same system context scope, and a send through `onMainConnection`
   * runs at once on the connection its turn holds. An instance with no
   * connection source has nothing to reach and nothing to look up: the
   * callback runs in its turn alone.
   */
  private trackingRegistrations(): McpServer {
    const track =
      (name: string, callback: (...callbackArgs: unknown[]) => unknown) =>
      (...callbackArgs: unknown[]) => {
        return this.trackCall(name, async (signal) => {
          // The SDK passes `extra` last: `(args, extra)` or `(extra)`. The
          // callback sees the call's own signal there — the session's end —
          // never the SDK's, which a client's cancel aborts.
          const last = callbackArgs[callbackArgs.length - 1];
          const args =
            typeof last === 'object' && last !== null
              ? [...callbackArgs.slice(0, -1), { ...last, signal }]
              : callbackArgs;
          let leaveFlow: (() => void) | undefined;
          let inUse: AbapConnection | undefined;
          try {
            throwIfRequestAborted(signal);
            // Every call takes its turn, whatever its name or arguments: a
            // callback can reach the instance's connection, and nothing in
            // its name proves it works on a connection of its own.
            leaveFlow = await this.enterMainFlow(signal);
            // A registry's own tool is not served while a batch is open: it
            // is no batch tool, and nothing proves it records.
            if (this.batchOpenFor(name)) {
              throw new ServerRefusal(
                'batch_not_recordable',
                batchNotServedWords(name),
              );
            }
            const run = () =>
              runWithRequestSignal(signal, async () => {
                // Its turn came after the session ended: it never runs.
                throwIfRequestAborted(signal);
                return callback(...args);
              });
            // No connection source: nothing of the instance's to reach, so
            // nothing to look up; a send from within takes its turn's
            // connection itself (and finds none).
            if (this.connectionContext === null) {
              return await this.inHeldTurn(run);
            }
            // Taken inside the turn, so no session the call ahead lost is
            // handed on. Its system information is asked before the callback
            // runs, as before a handler group's tool: a failure is this
            // call's answer, the callback does not run, and the next call
            // asks again.
            const connection = await this.getConnection(signal);
            inUse = connection;
            const { system } = await this.systemBeforeTool(
              connection,
              true,
              signal,
              (taken) => {
                inUse = taken;
              },
            );
            return await this.inHeldFlow(true, connection, () =>
              withDestinationSystemContext(
                this.systemContexts.get(connection),
                () => withKnownSystemContext(system, () => run()),
              ),
            );
          } catch (error) {
            const read = readGuarded((t) => this.readFailure(t), error);
            if (read !== undefined) return answerRead(read);
            throw error;
          } finally {
            if (inUse !== undefined) this.connectionReleased(inUse);
            leaveFlow?.();
          }
        });
      };
    const wrapLast = (registerArgs: unknown[]): unknown[] => {
      const last = registerArgs[registerArgs.length - 1];
      const name =
        typeof registerArgs[0] === 'string' ? registerArgs[0] : 'a tool';
      return typeof last === 'function'
        ? [
            ...registerArgs.slice(0, -1),
            track(name, last as (...callbackArgs: unknown[]) => unknown),
          ]
        : registerArgs;
    };
    // A registry's own tool runs outside batch mode: where the instance has
    // a batch owner, its description says so (spec §3) — the same rule as a
    // handler group's tools the eligibility table does not list.
    const described = (registerArgs: unknown[]): unknown[] => {
      if (this.batch === undefined) return registerArgs;
      const name = registerArgs[0];
      if (typeof name !== 'string' || runsBesideBatch(name))
        return registerArgs;
      const sentence = OUTSIDE_BATCH_SENTENCE;
      const second = registerArgs[1];
      const appended = (description: string) =>
        description.trimEnd().length === 0
          ? sentence
          : `${description.trimEnd()} ${sentence}`;
      if (typeof second === 'string') {
        // `tool(name, description, …)`.
        return [name, appended(second), ...registerArgs.slice(2)];
      }
      if (
        second !== null &&
        typeof second === 'object' &&
        typeof second !== 'function'
      ) {
        // `registerTool(name, config, callback)`.
        const config = second as { description?: unknown };
        const description =
          typeof config.description === 'string' ? config.description : '';
        return [
          name,
          { ...config, description: appended(description) },
          ...registerArgs.slice(2),
        ];
      }
      return registerArgs;
    };
    return new Proxy(this, {
      get: (target, property) => {
        if (property === 'registerTool' || property === 'tool') {
          const register = Reflect.get(target, property) as (
            ...registerArgs: unknown[]
          ) => unknown;
          // Its search texts are attached whatever the batch owner, in
          // either form (`registerTool` or `tool`), once it is registered.
          return (...registerArgs: unknown[]) =>
            withSearchMeta(
              registerArgs[0],
              register.apply(target, wrapLast(described(registerArgs))),
            );
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
}

/**
 * Calls a group's handler with `context`: one that takes `(context, args)`
 * directly, an older one that reads its group's context after it was set.
 */
function callHandler(
  handler: unknown,
  group: unknown,
  context: HandlerContext,
  args: unknown,
): Promise<unknown> {
  const withContext = handler as (
    context: HandlerContext,
    args: unknown,
  ) => Promise<unknown>;
  if (withContext.length >= 2) return withContext(context, args);
  const contextAwareGroup = group as Partial<{
    setContext: (ctx: HandlerContext) => void;
    context: HandlerContext;
  }>;
  try {
    if (typeof contextAwareGroup.setContext === 'function') {
      contextAwareGroup.setContext(context);
    } else {
      contextAwareGroup.context = context;
    }
  } catch {
    // ignore if group doesn't expose context setter
  }
  return (handler as (args: unknown) => Promise<unknown>)(args);
}

/**
 * Whether SAP already ended `connection`'s session: ended here, or the
 * connection says it is no longer connected (connection 16: a lost session
 * spends the instance). Such a connection is replaced, never reused.
 */
function isSpent(connection: AbapConnection): boolean {
  if (isEnded(connection)) return true;
  const aware = connection as { isConnected?: () => boolean };
  try {
    return typeof aware.isConnected === 'function'
      ? aware.isConnected() === false
      : false;
  } catch {
    return false;
  }
}

/** The fixed words of a leftover session's logoff that was not written. */
export const LEFTOVER_LOGOFF_NOT_WRITTEN_WORDS =
  'the logoff of the leftover session could not be written; its record is kept';

/** The fixed words of a leftover session's logoff that was written and did not complete. */
export const LEFTOVER_LOGOFF_NOT_COMPLETED_WORDS =
  'the logoff of the leftover session did not complete; its record is kept';

/**
 * Whether SAP's answer to the request in a resumed session says the session
 * is gone (connection 17, read by status from the error's `response`, never
 * its words): a `401`, or an answer that is not that session's (a `2xx`
 * naming another session, none, or no token). Any other status — a redirect
 * (not followed), a server failure — is the call's error as SAP gave it: the
 * session may still live.
 */
function sessionGone(status: number): boolean {
  return status === 401 || (status >= 200 && status < 300);
}

/** `url` without its trailing slashes. Plain code. */
/**
 * A destination: the resolved credential object and the target system its
 * settings point at (`targetOf`) — what `systeminformation` answers for.
 */
/** The user `parameters` name, upper case; `undefined`: none. */
function userNamed(
  parameters: ResolvedSystemContext | undefined,
): string | undefined {
  const user = parameters?.responsible?.trim().toUpperCase();
  return user === undefined || user === '' ? undefined : user;
}

/**
 * A background run's caller user: the one its parameters name, else the
 * stated one (upper case); none is `system_user_unknown`.
 */
function callerUser(
  named: string | undefined,
  stated: string | undefined,
): string {
  if (named !== undefined) return named;
  const user = (stated ?? '').trim().toUpperCase();
  if (user === '') throw new ServerRefusal('system_user_unknown');
  return user;
}

/** System information as a lookup gives it: an answer naming the user. */
type KnownSystemContext = Exclude<ResolvedSystemContext, null>;

/** A connection's parameters as kept, and the information they came with. */
interface KnownParameters {
  parameters: ResolvedSystemContext;
  information: KnownSystemContext | undefined;
}

/**
 * What the instance keeps per destination: its parameters once known, and
 * whether it has the communication batch.
 */
interface DestinationRecord {
  known?: KnownParameters;
  batchAvailability: BatchAvailability;
}

interface Destination {
  credential: IAuthProvider;
  target: string;
  /**
   * The user it states — its settings' `SAP_USERNAME`, else its source's
   * login (`x-sap-login`); what an on-premise system without
   * `systeminformation` needs. Not part of the key.
   */
  user: string | undefined;
  /** The destination's own `SAP_RESPONSIBLE`, taken before `user`. */
  responsible: string | undefined;
}

/**
 * The target system settings point at, as a key: the URL (no trailing
 * slash), the client and the wire.
 */
function targetOf(settings: {
  url?: string;
  client?: string;
  connectionType?: string;
}): string {
  return adtSystemKey(settings);
}

function getDefaultLogger(): Logger {
  return stderrLogger;
}

/**
 * Logger that writes all levels to stderr.
 * Safe for stdio mode — never writes to stdout (reserved for JSON-RPC protocol).
 */
const stderrLogger: Logger = {
  info: (msg: string) => process.stderr.write(`[INFO] ${msg}\n`),
  debug: (msg: string) => process.stderr.write(`[DEBUG] ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`[WARN] ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[ERROR] ${msg}\n`),
};

/**
 * The SAP environment a stated system type names (`onprem`, `cloud`,
 * `legacy`, any case); `undefined` for none or any other value — never a
 * default.
 */
function statedEnvironment(
  value: string | undefined,
): SapEnvironment | undefined {
  const declared = value?.trim().toLowerCase();
  return declared === 'onprem' || declared === 'cloud' || declared === 'legacy'
    ? declared
    : undefined;
}

/**
 * A registry's own registered tool, given the `_meta` its name has in the
 * search table (merged into what it carries); a tool the table does not name,
 * or a registration that answered no updatable tool, is left as it is.
 */
function withSearchMeta(name: unknown, registered: unknown): unknown {
  if (typeof name !== 'string') return registered;
  const search = searchMeta(name)._meta;
  if (search === undefined || registered === null) return registered;
  if (typeof registered !== 'object') return registered;
  const tool = registered as {
    _meta?: Record<string, unknown>;
    update?: (updates: { _meta?: Record<string, unknown> }) => void;
  };
  if (typeof tool.update !== 'function') return registered;
  tool.update({ _meta: { ...tool._meta, ...search } });
  return registered;
}

/**
 * The `_meta` a tool is listed with: its search texts under
 * `mcp-abap-adt/search` (`tools/tool-search.json`), for a consumer's tool
 * search; none for a tool the table does not name.
 */
function searchMeta(name: string): { _meta?: Record<string, unknown> } {
  const text = toolSearchText(name);
  if (text === undefined) return {};
  return {
    _meta: {
      [TOOL_SEARCH_META_KEY]: {
        keywords: [...text.keywords],
        semantic: text.semantic,
      },
    },
  };
}

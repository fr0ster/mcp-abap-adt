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
import { answerRead } from '../lib/auth/answerFailure.js';
import type { DestinationSystemContext } from '../lib/auth/destinationSystemContext.js';
import { errorClassOf } from '../lib/auth/errors.js';
import {
  failureOf,
  type ReadFailure,
  readGuarded,
} from '../lib/auth/failures.js';
import { ServerRefusal } from '../lib/auth/serverRefusal.js';
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
import { createAbapConnection } from '../lib/connectionFactory.js';
import {
  createDebuggerInstance,
  type DebuggerInstance,
} from '../lib/debugger/DebuggerInstance.js';
import { isDebuggerOwnConnectionTool } from '../lib/debugger/ownConnectionTools.js';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
import { jsonSchemaToZod } from '../lib/handlers/utils/schemaUtils.js';
import {
  type ClaimedSession,
  type LeftoverSessions,
  type SessionIdentity,
  sessionIdentity,
} from '../lib/leftoverSessions/LeftoverSessions.js';
import {
  type LeftoverSessionTools,
  type LogoffOutcome,
  type ResumeOutcome,
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
  own,
  runAsOwner,
} from '../lib/ownedConnections.js';
import { freshConnectionAvailable } from '../lib/packageSessions.js';
import {
  raceRequestSignal,
  runWithRequestSignal,
  throwIfRequestAborted,
} from '../lib/requestSignal.js';
import {
  defaultSystemContextResolver,
  type ResolvedSystemContext,
  resolveOnce,
  type SystemContextResolver,
  systemContextResolverFor,
  withDestinationSystemContext,
  withKnownSystemContext,
} from '../lib/requestSystemResolution.js';
import {
  InstanceState,
  type StateLogger,
  stateLoggerOf,
} from '../lib/state/InstanceState.js';
import { systemContextFromConfiguration } from '../lib/systemContext.js';
import { watchSystemContextGuard } from '../lib/systemContextGuard.js';
import { systemUserOf } from '../lib/systemUser.js';
import {
  normalizeToolContent,
  type ToolResultLike,
} from '../lib/toolResult.js';
import { return_error } from '../lib/utils.js';
import type {
  ConnectionContext,
  ResolvedConnection,
} from './ConnectionContext.js';

/** What the SDK hands a tool callback beside its arguments: the request's signal. */
interface ToolCallExtra {
  readonly signal?: AbortSignal;
}

/**
 * A connection being built, shared by every call that asks for it while it
 * is (D13, D32). A connect that completes after every caller left is still
 * the instance's (D56): kept, used by the next call.
 */
interface BuiltConnection {
  credential: IAuthProvider;
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
 * on.
 */
const heldFlows = new AsyncLocalStorage<ReadonlyMap<object, AbapConnection>>();

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
   * Connection context: the instance's one source (spec §4) — set once for
   * stdio, per request for Streamable HTTP (also on a pooled instance), once
   * per SSE connection, at construction for an embedder's injected connection.
   */
  protected connectionContext: ConnectionContext | null = null;

  /**
   * The connection built from the source, kept while the source answers the
   * same credential object (D13): stdio's provider (the same one for the
   * process's life), an SSE connection's headers. A new credential — a new
   * HTTP request's headers — builds a new connection.
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
   * Fills a call's missing responsible/master system from its connection.
   * `null` disables. See src/lib/requestSystemResolution.ts.
   */
  protected readonly systemContextResolver: SystemContextResolver | null;

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
   * The backend user SAP answered for a caller (a token credential names
   * none), keyed by the credential object a built source resolved, or by the
   * host's injected connection. A cached user is valid only for the
   * connection it was asked on: whenever the instance's connection is
   * replaced, the whole cache is forgotten (`forgetCallers`) —
   * every credential's entry, whatever credential the old or the new
   * connection was built for — and an answer asked on a connection that was
   * replaced meanwhile is not kept (the generation it was asked in). A known
   * user is answered without entering the flow.
   */
  private callerUsers = new WeakMap<object, string>();
  /** Bumped by `forgetCallers`: an answer asked before it is not kept. */
  private callerGeneration = 0;

  /** Forgets every cached caller user: the instance's connection changed. */
  private forgetCallers(): void {
    this.callerGeneration += 1;
    this.callerUsers = new WeakMap();
  }

  /** Keeps `user` for `key` if no connection change came since `generation`. */
  private keepCallerUser(
    key: object,
    user: string | undefined,
    generation: number,
  ): void {
    if (user !== undefined && generation === this.callerGeneration) {
      this.callerUsers.set(key, user);
    }
  }

  constructor(options: {
    name: string;
    version?: string;
    logger?: Logger;
    systemType?: SapEnvironment;
    systemContextResolver?: SystemContextResolver | null;
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
     * The owner of the process's runtime session files, created by the host
     * and shared by its instances: each owned HTTP connection holding a
     * session keeps a file there until its logoff is written, and the
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
  }) {
    super({ name: options.name, version: options.version ?? '1.0.0' });
    this.logger = options.logger ?? getDefaultLogger();
    this.leftoverSessions = options.leftoverSessions;
    this.backgroundRuns = options.backgroundRuns;
    this.state = new InstanceState({
      idleMinutes: options.stateIdleMinutes,
      logger: stateLoggerOf(options),
      // The idle bound's stop is a terminal disposal of what the state
      // owns: its connections are closed whatever the undo answered (§6.4).
      onIdleStop: () => this.idleStopped(),
    });
    this.systemType = options.systemType;
    this.systemContextResolver =
      options.systemContextResolver === undefined
        ? options.systemType
          ? systemContextResolverFor(options.systemType)
          : defaultSystemContextResolver
        : options.systemContextResolver;
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
   * after it, whatever it answered (spec §6.4, D51, D55).
   */
  dispose(): Promise<void> {
    return this.state.dispose();
  }

  /**
   * **The terminal close** (spec §6.4): `disconnect()` — the logoff — of
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

  /** Dispose, settle, once more, settle — what a host awaits before letting the instance go; answers what is left. */
  shutdownState(): Promise<string[]> {
    return this.state.shutdown();
  }

  /** Resolves when every tool call of this instance has settled — a host releases the instance only then. */
  async idle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }

  /**
   * Sets the instance's source (spec §4): a `ConnectionSource` to build from
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
   * What a thrown value is, as the client's answer (spec §7.1): lib's
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
   * race it), and the connection is built and connected once per credential
   * object — kept while the source answers the same one (D13), replaced
   * only when SAP already lost the session or the source answers another
   * credential object (http: the request's; sse: fixed per connection). On stdio the source
   * answers the same provider for the process's life: the user is fixed, and
   * a renewed token (refresh, or a new login when the refresh fails) lives
   * inside that provider. The credential renews itself (a 401 reaches its
   * `rejected()`), so nothing is looked up here for refreshing.
   *
   * The connect is shared by every call that asks while it runs, and each
   * caller's wait races its own signal (D32): a cancelled caller settles at
   * once, the connect runs on for the others, its late rejection is handled,
   * and a late success is the instance's connection — kept and used by the
   * next call even when every caller that waited for it cancelled (D56: a
   * cancel causes no logoff). It is closed only by the instance's terminal
   * close (spec §6.4).
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
      // The host's connection: its system looked up once, on first use,
      // before any tool on it proceeds (a failed lookup fails nothing).
      await raceRequestSignal(this.lookupSystem(context.connection), signal);
      return context.connection;
    }

    throwIfRequestAborted(signal);
    const resolved = await context.source.resolve(signal);
    let held = this.built;
    if (
      !held ||
      held.credential !== resolved.credential ||
      (held.ready !== undefined && isSpent(held.ready))
    ) {
      // A new credential (http: the request's; sse: fixed per connection), or a session SAP
      // already lost (D56): the connection is replaced, and the replaced one
      // ends with its logoff — once no call works on it any more (spec §6.4).
      // stdio's source answers the same provider for the process's life, so
      // only a lost session replaces its connection (D13).
      if (held) {
        this.retire(held);
        // A cached caller user is valid only for the connection it was asked
        // on: asked again on the replacement.
        this.forgetCallers();
      }
      held = this.buildConnection(resolved.credential, () =>
        this.logOn(resolved),
      );
    }
    // This call is the entry's user from now on — counted before the await,
    // so a replacement in between cannot end the connection under it.
    held.users += 1;
    let connection: AbapConnection;
    try {
      connection = await raceRequestSignal(held.connection, signal);
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
   * before it has left; no timeout on the wait. A call whose signal aborts
   * while it waits leaves the queue at once — its place passes on, and it
   * answers `aborted` without reaching its tool (D5). A shutdown or an
   * instance close aborts no call (D55): it waits for the running call and
   * every queued one to run to their end; only an SSE close, whose transport
   * aborts the request signals, makes the queued calls leave.
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

  /** Each connection's system context, resolved at connect (`lookupSystem`). */
  private readonly systems = new WeakMap<object, ResolvedSystemContext>();
  private readonly systemLookups = new WeakMap<object, Promise<void>>();

  /**
   * The connections whose lookup at connect failed: they carry no system
   * context, and only a tool that needs it asks again (`retryLookup`).
   */
  private readonly lookupFailedAt = new WeakSet<object>();

  /**
   * Resolves `connection`'s system context once, at connect (on-premise:
   * nothing sent, `null`); concurrent callers share the attempt. A failure
   * fails nothing: the connection carries no system context, nothing failed
   * is kept, and no later connect of it asks again — only a tool that needs
   * the context does, from inside the main flow (`retryLookup`).
   */
  private lookupSystem(connection: object): Promise<void> {
    const resolver = this.systemContextResolver;
    if (
      resolver === null ||
      this.systems.has(connection) ||
      this.lookupFailedAt.has(connection)
    ) {
      return Promise.resolve();
    }
    const running = this.systemLookups.get(connection);
    if (running) return running;
    const attempt = (async () => {
      try {
        // Shared across instances on one connection (`resolveOnce`): one
        // lookup per connection; a failure is not kept.
        this.systems.set(
          connection,
          await resolveOnce(resolver, connection as AbapConnection),
        );
      } catch (error) {
        // The class only: a lookup's message may quote what the system
        // answered (H4).
        this.logger?.warn?.(
          `Could not resolve responsible/master system from the connection: ${errorClassOf(error)}`,
        );
        this.lookupFailedAt.add(connection);
      } finally {
        this.systemLookups.delete(connection);
      }
    })();
    this.systemLookups.set(connection, attempt);
    return attempt;
  }

  /**
   * A tool that needs the system context, on a connection whose lookup at
   * connect failed, asks again — on the instance's connection, through the
   * main flow it already holds (`onMainConnection`). A chain failure is
   * answered as it is; any other refuses the tool, `system_lookup_failed`.
   */
  private async retryLookup(
    connection: object,
    signal: AbortSignal,
  ): Promise<void> {
    const resolver = this.systemContextResolver;
    if (resolver === null) return;
    try {
      // From inside the flow: the connection the holding call holds.
      const resolved = await this.onMainConnection(signal, (held) =>
        resolveOnce(resolver, held),
      );
      this.systems.set(connection, resolved);
      this.lookupFailedAt.delete(connection);
    } catch (error) {
      if (readGuarded(failureOf, error) !== undefined) throw error;
      this.logger?.warn?.(
        `Could not resolve responsible/master system from the connection: ${errorClassOf(error)}`,
      );
      throw new ServerRefusal('system_lookup_failed');
    }
  }

  /**
   * What `lookupSystem` resolved for `connection`; `{}` when its lookup
   * failed (on ABAP Cloud the login never stands in); `undefined`: nothing to
   * resolve.
   */
  private systemOf(connection: object): ResolvedSystemContext | undefined {
    if (this.systemContextResolver === null) return undefined;
    if (this.lookupFailedAt.has(connection)) return {};
    return this.systems.get(connection);
  }

  /**
   * Runs a tool with its connection's system context, sending nothing. When
   * the tool needed the context — the guard refused it for want of a
   * responsible (`SystemContextMissingError`) — on a connection whose lookup
   * at connect failed, and the call holds the main flow, the lookup is asked
   * again (`retryLookup`) and the tool runs again with its answer: the guard
   * refuses before the change is sent. Out of the flow no lookup is sent; the
   * tool's refusal stands.
   */
  private async withSystemContextOf<T>(
    connection: object,
    holdsFlow: boolean,
    signal: AbortSignal,
    run: () => Promise<T>,
  ): Promise<T> {
    const failed = () => this.lookupFailedAt.has(connection);
    const first = await watchSystemContextGuard(() =>
      withKnownSystemContext(this.systemOf(connection), run, failed()),
    );
    if (!first.fired || !holdsFlow || !failed()) return first.settled();
    await this.retryLookup(connection, signal);
    return withKnownSystemContext(this.systemOf(connection), run, failed());
  }

  /**
   * Whether `connection`, taken before its call waited in the main flow, is
   * no longer usable once the call's turn came: one this instance built (not
   * a host's) whose session SAP already lost — the next `getConnection`
   * replaces it. On stdio nothing else replaces the instance's connection
   * (its credential is fixed for the process); a host that hands an instance
   * another credential builds a connection for it, and a call queued with
   * its own credential's connection keeps that one.
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
    if (held !== undefined) return send(held);
    // Its turn: no timeout, a cancelled wait leaves at once.
    const leave = await this.enterMainFlow(signal);
    try {
      const connection = await this.getConnection(signal);
      try {
        return await this.inHeldFlow(true, connection, () => send(connection));
      } finally {
        this.connectionReleased(connection);
      }
    } finally {
      leave();
    }
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
    entry.connection.then(
      (connection) => {
        if (entry.users === 0) void endConnection(connection);
      },
      () => undefined, // a failed connect was ended where it failed
    );
  }

  /**
   * The instance's connection is born: `birth` makes it — a logon
   * (`logOn`), or a leftover session taken up (`resumedSession`) — and it is
   * kept as `built` for `credential`. Its system context (ABAP Cloud:
   * `systeminformation`) is part of the birth: once per connection, before
   * any tool proceeds, never a send outside the main flow; a failed lookup
   * fails nothing. Set as `built` in the turn it is called, so every call
   * that asks for a connection meanwhile waits for this one.
   */
  private buildConnection(
    credential: IAuthProvider,
    birth: () => Promise<AbapConnection>,
  ): BuiltConnection {
    const entry: BuiltConnection = {
      credential,
      connection: Promise.resolve() as unknown as Promise<AbapConnection>,
      users: 0,
      retired: false,
    };
    entry.connection = (async () => {
      const connection = await birth();
      await this.lookupSystem(connection);
      entry.ready = connection;
      return connection;
    })();
    this.built = entry;
    // A completed connect stays the instance's whoever still waits for it
    // (D32, D56); a failed one is not kept: the next call connects again.
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
    const connection = createAbapConnection(
      resolved.settings,
      resolved.credential,
    ) as AbapConnection;
    // The instance's own from here on: it ends with a logoff (§6.4, D55).
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
      throw error;
    }
    return connection;
  }

  /**
   * A leftover session taken up: the connection built from `resolved` on the
   * session's cookies (connection 17's `session`) — `connect()` logs on
   * nowhere and asks SAP, without the credential, whether the session lives.
   * Alive: picked up. SAP answering it is gone (`sessionGone`): that
   * instance is spent and logged nothing on — connection's "a new session is
   * a new instance" — so a new one is built with the normal logon, with the
   * process's settings and credential, and starts a new session. Either way
   * the file is this process's under the same handle (`adopt`), rewritten
   * with the connection's cookies; `outcome.session` says which. Any other
   * failure — the old session's answer or the new logon's — is the call's,
   * as SAP gave it, and gives the file back as a leftover.
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
    // The instance's own from here on, like any built connection (§6.4).
    own(connection, { owner: this, role: 'built' });
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
      } catch (logonError) {
        owner.release(claimed);
        throw logonError;
      }
      owner.adopt(claimed, fresh, identity);
      outcome.session = 'new';
      return fresh;
    }
    owner.adopt(claimed, connection, identity);
    outcome.session = 'picked_up';
    return connection;
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
            if (entry.connectionless === true) {
              return this.runConnectionless(entry.handler, group, args, signal);
            }
            let inUse: AbapConnection | undefined;
            let leaveFlow: (() => void) | undefined;
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
              // the request's signal: a cancelled call settles at once.
              let connection = await this.getConnection(signal);
              inUse = connection;
              // One instance, one connection, one main flow: a call that works
              // on the instance's connection waits until the call before it
              // settled, whatever the client sends at once. Entered after the
              // connection is ready, so concurrent callers still share one
              // connect() (D32). A background run and a listed long read work
              // on a connection of their own and take no place in it; so do the
              // debugger tools whose SAP work is on the debugger's own
              // connections — their sends on this one (`onMainConnection`)
              // still take their turn.
              const ownConnection =
                runsInBackground ||
                (isLongTool(entry.toolDefinition.name) &&
                  isLongRead(entry.toolDefinition.name, args)) ||
                isDebuggerOwnConnectionTool(entry.toolDefinition.name);
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
              const context: HandlerContext = {
                connection,
                logger: this.logger,
                state: this.state,
                debugger: () => this.debuggerFor(),
                onMainConnection: (send) => this.onMainConnection(signal, send),
                ...(this.leftoverSessions !== undefined
                  ? { sessionFiles: this.leftoverSessions }
                  : {}),
              };

              // If handler expects context+args (preferred), pass both.
              // Otherwise, update group context and call with args only for backward compatibility.
              // NOTE: Always await the handler result to ensure we get the resolved value for normalization
              // Both branches run inside withKnownSystemContext: a call that
              // lacks responsible/master system gets them from an ABAP Cloud
              // connection (src/lib/requestSystemResolution.ts).
              // The destination's own .env enters the scope first, below the
              // request's headers, so the cloud lookup fills only what neither
              // states.
              // The whole call runs in the request signal scope (§5.2), and
              // a call whose signal aborted before its tool starts — after
              // the connection is ready, after the system lookup — never
              // reaches the tool (D5).
              const holdsFlow = leaveFlow !== undefined;
              const resolved = <T>(fn: () => Promise<T>) =>
                this.inHeldFlow(holdsFlow, context.connection, () =>
                  runWithRequestSignal(signal, () =>
                    withDestinationSystemContext(
                      this.systemContexts.get(context.connection),
                      () =>
                        // Resolved at connect (`lookupSystem`): nothing is
                        // sent here, so no call sends outside the flow.
                        this.withSystemContextOf(
                          context.connection,
                          holdsFlow,
                          signal,
                          () => {
                            throwIfRequestAborted(signal);
                            return fn();
                          },
                        ),
                    ),
                  ),
                );
              let handlerPromise: Promise<unknown>;
              const listed = isLongTool(entry.toolDefinition.name);
              const read =
                listed && isLongRead(entry.toolDefinition.name, args);
              if (listed && !read && readTimeout(args) !== undefined) {
                // A listed tool's run mode takes no `timeout` (spec §5.8).
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
                // A listed long tool (spec §5.8): a read on a connection of
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
                return { content, isError: true };
              }

              return { content };
            } catch (error) {
              // The failure reader first (§7.2): a chain failure or the
              // server's own refusal is answered as §7.3, its diagnostics on
              // stderr only.
              // The reader may be an override or a host's: guarded, so its
              // own throw answers fixed words, never itself.
              const read = readGuarded((t) => this.readFailure(t), error);
              if (read !== undefined) return answerRead(read);
              // An uncaught throw (connection setup, handler, transport) becomes a
              // structured result. return_error extracts the ADT response body,
              // which the SDK's own error.message would discard.
              return return_error(error) as {
                isError: true;
                content: { type: 'text'; text: string }[];
              };
            } finally {
              if (inUse !== undefined) this.connectionReleased(inUse);
              leaveFlow?.();
            }
          };

          // Tracked from its entry, with its own request signal (`trackCall`).
          const toolName = entry.toolDefinition.name;
          const wrappedHandler = (args: unknown, extra?: ToolCallExtra) =>
            this.trackCall(toolName, extra, (signal) => runCall(args, signal));

          // Convert JSON Schema to Zod if needed, otherwise pass as-is
          const zodSchema =
            entry.toolDefinition.inputSchema &&
            typeof entry.toolDefinition.inputSchema === 'object' &&
            entry.toolDefinition.inputSchema.type === 'object' &&
            entry.toolDefinition.inputSchema.properties
              ? jsonSchemaToZod(entry.toolDefinition.inputSchema)
              : entry.toolDefinition.inputSchema;

          // Skip tools not available in the current SAP environment
          const availableIn = entry.toolDefinition.available_in;
          if (availableIn && availableIn.length > 0) {
            const resolvedType =
              this.systemType ?? process.env.SAP_SYSTEM_TYPE?.toLowerCase();
            const currentEnv: SapEnvironment =
              resolvedType === 'legacy'
                ? 'legacy'
                : resolvedType === 'onprem'
                  ? 'onprem'
                  : 'cloud';
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
              description: entry.toolDefinition.description,
              inputSchema: zodSchema,
            },
            wrappedHandler,
          );
        }
      }
    } else {
      // A registry that registers its own tools: no connection is injected,
      // but every tool it registers goes through the same call tracking —
      // its request signal, the registry of live calls, the request signal
      // scope, and D5 — as the tools above.
      handlersRegistry.registerAllTools(this.trackingRegistrations());
    }
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
    // No connection of its own to be had: D20's refusal, before the caller
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
   * the backend user the request resolved — the one it names
   * (`SAP_USERNAME`, `x-sap-login`), else the one SAP answers for the
   * session (`systemUserOf`, a token credential). An injected connection
   * names its URL; its user is SAP's. A user that cannot be determined is
   * refused: a run is kept only for a known caller.
   */
  protected async backgroundCaller(
    signal: AbortSignal,
  ): Promise<BackgroundRunCaller> {
    const context = this.connectionContext;
    if (context === null) {
      throw new ServerRefusal('background_runs_unavailable');
    }
    if (context.kind === 'injected') {
      const url = await context.connection.getBaseUrl();
      return {
        url: withoutTrailingSlashes(url.trim()),
        client: '',
        user: await this.sapUserOf(signal, context.connection),
      };
    }
    const resolved = await this.resolveCaller(signal);
    const url = withoutTrailingSlashes((resolved.settings.url ?? '').trim());
    const client = (resolved.settings.client ?? '').trim();
    const stated = (
      resolved.settings.username ??
      resolved.systemContext?.login ??
      ''
    )
      .trim()
      .toUpperCase();
    if (stated !== '') return { url, client, user: stated };
    return {
      url,
      client,
      user: await this.sapUserOf(signal, resolved.credential),
    };
  }

  /**
   * The backend user SAP answers for the caller `key` names (see
   * `callerUsers`): a known one at once, without entering the main flow;
   * else asked once, on the connection the main flow hands the send.
   */
  private async sapUserOf(signal: AbortSignal, key: object): Promise<string> {
    const user = await this.callerUserOf(signal, key);
    if (user === undefined) {
      throw new ServerRefusal('background_run_caller_unknown');
    }
    return user;
  }

  /** `sapUserOf`'s lookup: `undefined` when SAP names no user. */
  private async callerUserOf(
    signal: AbortSignal,
    key: object,
  ): Promise<string | undefined> {
    const known = this.callerUsers.get(key);
    if (known !== undefined) return known;
    return this.onMainConnection(signal, async (connection) => {
      // Asked on the connection the flow handed: kept unless that
      // connection was replaced meanwhile.
      const generation = this.callerGeneration;
      const asked = await systemUserOf(connection);
      this.keepCallerUser(key, asked, generation);
      return asked;
    });
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
      resume: (handle) => this.resumeLeftover(handle, signal),
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
   * Resume (`built` role only): how the instance's connection is born when
   * it has none yet — built on the session instead of logging on
   * (`resumedSession`), and the instance's connection from then on, as a
   * logon's would be. It takes no place in the main flow and never replaces
   * a connection: an instance that already has one refuses, before the
   * handle is read (`leftover_session_connector_exists`). The connection is
   * set as the instance's in the same turn as that check, so a tool call
   * asking meanwhile waits for it. A session SAP says is gone is replaced
   * by a new one with the normal logon (`resumedSession`): the answer is
   * `resumed` either way, `session` saying which.
   */
  private async resumeLeftover(
    handle: string,
    signal: AbortSignal,
  ): Promise<ResumeOutcome> {
    const { owner, resolved, identity } = await this.leftoverCaller(signal);
    if (this.built !== undefined) {
      throw new ServerRefusal('leftover_session_connector_exists');
    }
    const claimed = this.claimLeftover(owner, identity, handle);
    if (claimed.role !== 'built' || identity === undefined) {
      owner.release(claimed);
      throw new ServerRefusal('leftover_session_not_resumable');
    }
    const outcome: { session?: 'picked_up' | 'new' } = {};
    const entry = this.buildConnection(resolved.credential, () =>
      this.resumedSession(resolved, owner, claimed, identity, outcome),
    );
    await raceRequestSignal(entry.connection, signal);
    return {
      handle: claimed.handle,
      state: 'resumed',
      session: outcome.session ?? 'picked_up',
    };
  }

  /**
   * Logoff (any role): the platform's ICF logoff with the session's cookies
   * and no credential, then the file deleted. connection 17.1 sends it from
   * an instance built on the session and disconnected without `connect()`:
   * the logoff and nothing else — no CSRF fetch before it, the credential's
   * `prepare()` never called — resolving once it is written. Its answer is
   * not read, so whether the session still lived is SAP's to know. It
   * touches neither the instance's connection nor its main flow.
   */
  private async logoffLeftover(
    handle: string,
    signal: AbortSignal,
  ): Promise<LogoffOutcome> {
    const { owner, resolved, identity } = await this.leftoverCaller(signal);
    const claimed = this.claimLeftover(owner, identity, handle);
    let settled = false;
    try {
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
   * Each call has a request signal of its own (§5.1): aborted when the
   * request's `extra.signal` aborts (the client cancelled, its transport
   * closed) and when the call ends whatever its outcome (D4: the broker
   * releases the party it attached only then). Nothing else aborts it: the
   * registry of live calls, where the call is registered here before
   * anything else, keeps its settlement for the shutdown and the instance
   * close to await (D55). Once the process or this instance is latched, the
   * call is refused here — the shutdown refusal, before any connection or
   * handler (§6.4).
   *
   * The call runs as this instance's (`runAsOwner`): a connection it opens is
   * this instance's, closed by its terminal close.
   */
  private trackCall<T>(
    name: string,
    extra: ToolCallExtra | undefined,
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
    const requestSignal = extra?.signal;
    const onRequestAbort = () => controller.abort();
    if (requestSignal?.aborted) controller.abort();
    else requestSignal?.addEventListener('abort', onRequestAbort);
    this.state.callStarted();
    const call = runAsOwner(this, () => run(controller.signal));
    this.inFlight.add(call);
    call
      .finally(() => {
        requestSignal?.removeEventListener('abort', onRequestAbort);
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
   * the tool starts ends without reaching it (D5).
   */
  private trackingRegistrations(): McpServer {
    const track =
      (name: string, callback: (...callbackArgs: unknown[]) => unknown) =>
      (...callbackArgs: unknown[]) => {
        // The SDK passes `extra` last: `(args, extra)` or `(extra)`.
        const extra = callbackArgs[callbackArgs.length - 1] as
          | ToolCallExtra
          | undefined;
        return this.trackCall(name, extra, async (signal) => {
          try {
            throwIfRequestAborted(signal);
            return await runWithRequestSignal(signal, async () =>
              callback(...callbackArgs),
            );
          } catch (error) {
            const read = readGuarded((t) => this.readFailure(t), error);
            if (read !== undefined) return answerRead(read);
            throw error;
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
    return new Proxy(this, {
      get: (target, property) => {
        if (property === 'registerTool' || property === 'tool') {
          const register = Reflect.get(target, property) as (
            ...registerArgs: unknown[]
          ) => unknown;
          return (...registerArgs: unknown[]) =>
            register.apply(target, wrapLast(registerArgs));
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
 * spends the instance). Such a connection is replaced, never reused (D56).
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

/**
 * Whether SAP's answer to the request in a resumed session says the session
 * is gone (connection 17, read by status from the error's `response`, never
 * its words): a `401`, a redirect (not followed), or an answer that is not
 * that session's (a `2xx` naming another session, none, or no token). Any
 * other status — a server failure — is the call's error: the session may
 * still live.
 */
function sessionGone(status: number): boolean {
  return status === 401 || (status >= 200 && status < 400);
}

/** `url` without its trailing slashes. Plain code. */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
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

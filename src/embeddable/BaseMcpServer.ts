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
import {
  failureOf,
  type ReadFailure,
  readGuarded,
} from '../lib/auth/failures.js';
import { ServerRefusal } from '../lib/auth/serverRefusal.js';
import { createAbapConnection } from '../lib/connectionFactory.js';
import {
  createDebuggerInstance,
  type DebuggerInstance,
} from '../lib/debugger/DebuggerInstance.js';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
import { jsonSchemaToZod } from '../lib/handlers/utils/schemaUtils.js';
import {
  type ClaimedSession,
  type LeftoverSessions,
  type SessionDestination,
  type SessionIdentity,
  sessionDestination,
  sessionIdentity,
  withUser,
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
import {
  raceRequestSignal,
  runWithRequestSignal,
  throwIfRequestAborted,
} from '../lib/requestSignal.js';
import {
  defaultSystemContextResolver,
  type SystemContextResolver,
  systemContextResolverFor,
  withDestinationSystemContext,
  withResolvedSystemContext,
} from '../lib/requestSystemResolution.js';
import {
  InstanceState,
  type StateLogger,
  stateLoggerOf,
} from '../lib/state/InstanceState.js';
import { systemContextFromConfiguration } from '../lib/systemContext.js';
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
   * same credential object (D13): stdio's provider, an SSE connection's
   * headers. A new credential — the broker built a new provider, a new HTTP
   * request — builds a new connection.
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
  }) {
    super({ name: options.name, version: options.version ?? '1.0.0' });
    this.logger = options.logger ?? getDefaultLogger();
    this.leftoverSessions = options.leftoverSessions;
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

  /**
   * The connection a tool call works on. Injected: the connection as given —
   * no `resolve`, no `connect()`, no wrap. Built: the source resolves the
   * settings and the credential with the request's `signal` (its own waits
   * race it), and the connection is built and connected once per credential
   * object — kept while the source answers the same one (D13). The credential
   * renews itself (a 401 reaches its `rejected()`), so nothing is looked up
   * here for refreshing.
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
    if (context.kind === 'injected') return context.connection;

    throwIfRequestAborted(signal);
    const resolved = await context.source.resolve(signal);
    let held = this.built;
    if (
      !held ||
      held.credential !== resolved.credential ||
      (held.ready !== undefined && isSpent(held.ready))
    ) {
      // A new credential, or a session SAP already lost (D56): the
      // connection is replaced, and the replaced one ends with its logoff —
      // once no call works on it any more (spec §6.4).
      if (held) this.retire(held);
      held = this.buildConnection(
        resolved.credential,
        () => createAbapConnection(resolved.settings, resolved.credential),
        this.sessionOf(resolved),
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
   * Connects what `create` builds for `credential`, kept as `built`; once
   * connected, its session is kept in a runtime file when the host gave an
   * owner (`session`): under the backend user the request names, else the
   * one SAP answers for the session (a token credential names none).
   */
  private buildConnection(
    credential: IAuthProvider,
    create: () => AbapConnection,
    session: KnownSession | undefined,
  ): BuiltConnection {
    const entry: BuiltConnection = {
      credential,
      connection: Promise.resolve() as unknown as Promise<AbapConnection>,
      users: 0,
      retired: false,
    };
    entry.connection = (async () => {
      const connection = create();
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
      if (session !== undefined) await this.keepSession(connection, session);
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
            try {
              // Get connection from context (this.connectionContext), with
              // the request's signal: a cancelled call settles at once.
              const connection = await this.getConnection(signal);
              inUse = connection;
              const context: HandlerContext = {
                connection,
                logger: this.logger,
                state: this.state,
                debugger: () => this.debuggerFor(),
                ...(this.leftoverSessions !== undefined
                  ? { sessionFiles: this.leftoverSessions }
                  : {}),
              };

              // If handler expects context+args (preferred), pass both.
              // Otherwise, update group context and call with args only for backward compatibility.
              // NOTE: Always await the handler result to ensure we get the resolved value for normalization
              // Both branches run inside withResolvedSystemContext: a call that
              // lacks responsible/master system gets them from an ABAP Cloud
              // connection (src/lib/requestSystemResolution.ts).
              // The destination's own .env enters the scope first, below the
              // request's headers, so the cloud lookup fills only what neither
              // states.
              // The whole call runs in the request signal scope (§5.2), and
              // a call whose signal aborted before its tool starts — after
              // the connection is ready, after the system lookup — never
              // reaches the tool (D5).
              const resolved = <T>(fn: () => Promise<T>) =>
                runWithRequestSignal(signal, () =>
                  withDestinationSystemContext(
                    this.systemContexts.get(context.connection),
                    () =>
                      withResolvedSystemContext(
                        context.connection,
                        () => {
                          throwIfRequestAborted(signal);
                          return fn();
                        },
                        this.systemContextResolver,
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
              if (read) {
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
                  (entry.handler as HandlerFnWithContext)(context, args),
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
                  (entry.handler as HandlerFnArgsOnly)(args),
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
   * What a request's session is kept as, when the host gave an owner: the
   * destination, and the backend user the request names (absent for a token
   * credential: SAP answers it after `connect()`). None over RFC.
   */
  private sessionOf(resolved: ResolvedConnection): KnownSession | undefined {
    if (this.leftoverSessions === undefined) return undefined;
    const destination = sessionDestination(resolved.settings);
    if (destination === undefined) return undefined;
    const stated = sessionIdentity(
      resolved.settings,
      resolved.systemContext?.login,
    );
    return stated === undefined
      ? { destination }
      : { destination, user: stated.user };
  }

  /**
   * Keeps `connection`'s session in a runtime file: under the stated user,
   * else the one SAP answers (`systemUserOf`, as the debugger's request user
   * is read). A system that names none, or a failed question, keeps no file
   * and fails nothing.
   */
  private async keepSession(
    connection: AbapConnection,
    session: KnownSession,
  ): Promise<void> {
    const owner = this.leftoverSessions;
    if (owner === undefined) return;
    let user = session.user;
    if (user === undefined) {
      try {
        user = await systemUserOf(connection);
      } catch {
        user = undefined;
      }
    }
    const identity = withUser(session.destination, user);
    if (identity !== undefined) owner.track(connection, 'built', identity);
  }

  /**
   * The owner, the caller's resolution and identity; refused without an
   * owner. A request that names no backend user (a token credential) is
   * asked of SAP: the user of the instance's own connection — which this
   * builds, with its logon, when the instance holds none yet.
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
    const session = this.sessionOf(resolved);
    if (session === undefined) return { owner, resolved, identity: undefined };
    if (session.user !== undefined) {
      return {
        owner,
        resolved,
        identity: withUser(session.destination, session.user),
      };
    }
    const connection = await this.getConnection(signal);
    try {
      const identity =
        owner.identityOf(connection) ??
        withUser(session.destination, await systemUserOf(connection));
      return { owner, resolved, identity };
    } finally {
      this.connectionReleased(connection);
    }
  }

  /** The leftover-session tools' port for one call. */
  private leftoverPort(signal: AbortSignal): LeftoverSessionTools {
    return {
      list: async () => {
        const { owner, identity } = await this.leftoverCaller(signal);
        // A caller whose backend user is not stated owns no file.
        return identity === undefined ? [] : owner.list(identity);
      },
      resume: (handle) => this.resumeLeftover(handle, signal),
      logoff: (handle) => this.logoffLeftover(handle, signal),
    };
  }

  /** The caller's leftover session `handle`, claimed; refused the same way whatever the reason. */
  private async claimLeftover(
    handle: string,
    signal: AbortSignal,
  ): Promise<{
    owner: LeftoverSessions;
    resolved: ResolvedConnection;
    identity: SessionIdentity;
    claimed: ClaimedSession;
  }> {
    const { owner, resolved, identity } = await this.leftoverCaller(signal);
    const claimed =
      identity === undefined ? undefined : owner.claim(handle, identity);
    if (identity === undefined || claimed === undefined) {
      throw new ServerRefusal('leftover_session_not_available');
    }
    return { owner, resolved, identity, claimed };
  }

  /**
   * Resume (`built` role only): this instance's own connection is built on
   * the session instead of logging on (connection 17's `session`), and the
   * file is this process's from then on. SAP's answer that the session is
   * gone is the call's answer, and the file is deleted. A connection the
   * instance already held is ended as a replaced one: its logoff after the
   * last call that uses it.
   */
  private async resumeLeftover(
    handle: string,
    signal: AbortSignal,
  ): Promise<ResumeOutcome> {
    const { owner, resolved, identity, claimed } = await this.claimLeftover(
      handle,
      signal,
    );
    let settled = false;
    try {
      if (claimed.role !== 'built') {
        throw new ServerRefusal('leftover_session_not_resumable');
      }
      const connection = createAbapConnection(
        resolved.settings,
        resolved.credential,
        undefined,
        undefined,
        claimed.cookies,
      ) as AbapConnection;
      // The instance's own from here on, like any built connection (§6.4).
      own(connection, { owner: this, role: 'built' });
      try {
        await connection.connect();
      } catch (error) {
        // Spent either way; connection logs nothing off for a session it
        // did not take.
        await endConnection(connection);
        const sap = sapAnswerOf(error);
        if (sap === undefined || !sessionGone(sap.status)) throw error;
        owner.forget(claimed);
        settled = true;
        return { handle: claimed.handle, state: 'gone', sap };
      }
      owner.adopt(claimed, connection, identity);
      settled = true;
      this.takeAsBuilt(resolved, connection);
      return { handle: claimed.handle, state: 'resumed' };
    } finally {
      // Not settled: the session stays a leftover, its file named again.
      if (!settled) owner.release(claimed);
    }
  }

  /**
   * Logoff (any role): the platform's ICF logoff with the session's cookies
   * and no credential, then the file deleted. connection 17.1 sends it from
   * an instance built on the session and disconnected without `connect()`:
   * the logoff and nothing else — no CSRF fetch before it, the credential's
   * `prepare()` never called — resolving once it is written. Its answer is
   * not read, so whether the session still lived is SAP's to know.
   */
  private async logoffLeftover(
    handle: string,
    signal: AbortSignal,
  ): Promise<LogoffOutcome> {
    const { owner, resolved, claimed } = await this.claimLeftover(
      handle,
      signal,
    );
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
   * A resumed connection becomes this instance's own (`built`): the one it
   * held before is retired — ended with its logoff once no call uses it.
   */
  private takeAsBuilt(
    resolved: ResolvedConnection,
    connection: AbapConnection,
  ): void {
    const previous = this.built;
    if (previous) this.retire(previous);
    this.built = {
      credential: resolved.credential,
      connection: Promise.resolve(connection),
      ready: connection,
      users: 0,
      retired: false,
    };
    this.systemContexts.set(connection, resolved.systemContext);
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

/** What a request's session is kept as: its destination, and the user it names. */
interface KnownSession {
  destination: SessionDestination;
  /** Absent for a token credential: SAP answers it after `connect()`. */
  user?: string;
}

/** The fixed words of a leftover session's logoff that was not written. */
export const LEFTOVER_LOGOFF_NOT_WRITTEN_WORDS =
  'the logoff of the leftover session could not be written; its record is kept';

/**
 * Whether SAP's answer to the request in a resumed session says the session
 * is gone (connection 17): a `401`, a redirect (not followed), or an answer
 * that is not that session's (a `2xx` naming another session, none, or no
 * token). Any other status — a server failure — leaves the file: the session
 * may still live.
 */
function sessionGone(status: number): boolean {
  return status === 401 || (status >= 200 && status < 400);
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

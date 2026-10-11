import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { Logger } from '@mcp-abap-adt/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../handlers/interfaces.js';
import { answerRead } from '../lib/auth/answerFailure.js';
import type { DestinationSystemContext } from '../lib/auth/destinationSystemContext.js';
import {
  failureOf,
  type ReadFailure,
  readGuarded,
} from '../lib/auth/failures.js';
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
import {
  normalizeToolContent,
  type ToolResultLike,
} from '../lib/toolResult.js';
import { return_error } from '../lib/utils.js';
import type { ConnectionContext } from './ConnectionContext.js';

/**
 * The signal a tool call's connection is acquired with until the request's own
 * reaches here (A8 supplies it): never aborted.
 */
const NO_REQUEST_SIGNAL: AbortSignal = new AbortController().signal;

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
  private built:
    | { credential: IAuthProvider; connection: Promise<AbapConnection> }
    | undefined;

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
  }) {
    super({ name: options.name, version: options.version ?? '1.0.0' });
    this.logger = options.logger ?? getDefaultLogger();
    this.state = new InstanceState({
      idleMinutes: options.stateIdleMinutes,
      logger: stateLoggerOf(options),
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

  /** Undoes what the instance holds; awaited by every host before it lets the instance go. */
  dispose(): Promise<void> {
    return this.state.dispose();
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
   * settings and the credential with `signal` (the request's, from A8), and
   * the connection is built and connected once per credential object — kept
   * while the source answers the same one (D13). The credential renews
   * itself (a 401 reaches its `rejected()`), so nothing is looked up here for
   * refreshing.
   */
  protected async getConnection(signal: AbortSignal): Promise<AbapConnection> {
    const context = this.connectionContext;
    if (!context) {
      throw new Error(
        'Connection context not set. Call setConnectionContext() first.',
      );
    }
    if (context.kind === 'injected') return context.connection;

    const resolved = await context.source.resolve(signal);
    let held = this.built;
    if (!held || held.credential !== resolved.credential) {
      const connecting = (async () => {
        const connection = createAbapConnection(
          resolved.settings,
          resolved.credential,
        );
        // Establish session (CSRF token + cookies) before first request.
        // RFC needs this for the stateful session; HTTP needs it because some
        // SAP systems reject the very first request (403) when no session
        // cookie is present.
        await connection.connect();
        return connection;
      })();
      const entry = { credential: resolved.credential, connection: connecting };
      held = entry;
      this.built = entry;
      // A failed connect is not kept: the next call connects again.
      connecting.catch(() => {
        if (this.built === entry) this.built = undefined;
      });
    }
    const connection = await held.connection;
    this.systemContexts.set(connection, resolved.systemContext);
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

          const runCall = async (args: unknown) => {
            try {
              // Get connection from context (this.connectionContext)
              // Token will be automatically refreshed via AuthBroker if needed
              const context: HandlerContext = {
                connection: await this.getConnection(NO_REQUEST_SIGNAL),
                logger: this.logger,
                state: this.state,
                debugger: () => this.debuggerFor(),
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
              const resolved = <T>(fn: () => Promise<T>) =>
                withDestinationSystemContext(
                  this.systemContexts.get(context.connection),
                  () =>
                    withResolvedSystemContext(
                      context.connection,
                      fn,
                      this.systemContextResolver,
                    ),
                );
              let handlerPromise: Promise<unknown>;
              if ((entry.handler as HandlerFnWithContext).length >= 2) {
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
              // The failure reader first (§7.2): a chain failure, an aborted
              // request or the server's own refusal is answered as §7.3, its
              // diagnostics on stderr only.
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
            }
          };

          // Tracked from its entry — before the connection is acquired — so
          // idle() cannot miss a call still acquiring its connection. The same
          // entry and end are the user activity the state's idle bound counts:
          // it pauses while the call runs and counts from its end.
          const wrappedHandler = (args: unknown) => {
            this.state.callStarted();
            const call = runCall(args);
            this.inFlight.add(call);
            call
              .finally(() => {
                this.inFlight.delete(call);
                this.state.callEnded();
              })
              .catch(() => undefined); // runCall answers every failure; nothing rejects unhandled
            return call;
          };

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
      // Fallback: use registerAllTools directly (handlers won't have connection injected)
      // This should not happen in normal flow
      handlersRegistry.registerAllTools(this);
    }
  }
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

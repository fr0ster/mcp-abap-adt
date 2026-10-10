import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { Logger } from '@mcp-abap-adt/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../handlers/interfaces.js';
import type {
  DestinationSystemContext,
  IDestinations,
} from '../lib/auth/IAuthBrokerFactory.js';
import { createAbapConnection } from '../lib/connectionFactory.js';
import { credentialFromHeaders } from '../lib/credentialSources.js';
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
import { InstanceState } from '../lib/state/InstanceState.js';
import { systemContextFromConfiguration } from '../lib/systemContext.js';
import {
  normalizeToolContent,
  type ToolResultLike,
} from '../lib/toolResult.js';
import { return_error } from '../lib/utils.js';
import type { ConnectionContext } from './ConnectionContext.js';

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
   * Connection context (set per request for SSE/HTTP, once for stdio)
   */
  protected connectionContext: ConnectionContext | null = null;

  /**
   * Cached connection for stdio mode (created once, reused for all requests)
   */
  private cachedConnection: AbapConnection | null = null;

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

  /**
   * The responsible, login and master system the destination's own `.env`
   * states (`IDestinations.systemContextFor`) — or, for an `x-sap-*` basic
   * connection, its `x-sap-login` as the login — entered into each call's
   * request scope below the request's headers. Per server instance: HTTP builds one
   * per request, SSE one per session.
   */
  private destinationSystemContext: DestinationSystemContext | undefined;

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
  }) {
    super({ name: options.name, version: options.version ?? '1.0.0' });
    this.logger = options.logger ?? getDefaultLogger();
    // The instance's own logger: the bound's end of a state reaches the host's log.
    this.state = new InstanceState({
      idleMinutes: options.stateIdleMinutes,
      logger: this.logger,
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
   * Sets the connection context of a destination: its settings
   * (`settingsFor`) and its provider (`getProvider`, the counted one). No
   * token is read here and no auth type is branched on: the credential is
   * the destination's, and it renews itself.
   * For stdio: called once on startup. For SSE/HTTP: per request or session.
   */
  protected async setConnectionContext(
    destination: string,
    destinations: IDestinations,
  ): Promise<void> {
    this.logger.debug(
      `[BaseMcpServer] Getting connection settings for destination: ${destination}`,
    );

    const settings = await destinations.settingsFor(destination);
    const credential = await destinations.getProvider(destination);
    const connectionParams: SapConfig = { ...settings };

    // No setup-time lookup and no connection. Per call, in this order: the
    // tool's arguments, the request's headers, the destination's own .env
    // (read here, nothing sent), the process configuration (read here into
    // the process context); for the responsible then the login (the
    // destination's SAP_USERNAME, x-sap-login, the process SAP_USERNAME);
    // and — in the cloud only — the connected
    // connection (withResolvedSystemContext). A cloud destination without
    // SAP_CLIENT uses the system's default client.
    this.destinationSystemContext =
      await destinations.systemContextFor?.(destination);
    systemContextFromConfiguration();
    this.connectionContext = {
      sessionId: destination,
      connectionParams,
      credential,
      metadata: {
        destination,
      },
    };
  }

  /**
   * Sets connection context from HTTP headers (direct SAP connection, no broker)
   * Used when x-sap-url + auth headers are provided: the settings and the
   * credential are what `credentialFromHeaders` answers.
   */
  protected setConnectionContextFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const getHeader = (name: string): string | undefined => {
      const value = headers[name] ?? headers[name.toUpperCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    const { settings, credential } = credentialFromHeaders(headers);
    // No destination: the headers (the request scope), then the process
    // configuration, then — in the cloud only — the connected connection.
    // A basic connection logs on as x-sap-login: that is this connection's
    // login, the responsible when none is stated. Only here — on a
    // destination request x-sap-login logs nobody on (Ruling 19).
    const login =
      settings.authType === 'basic' ? getHeader('x-sap-login') : undefined;
    this.destinationSystemContext = login ? { login } : undefined;
    systemContextFromConfiguration();
    const masterSystem = getHeader('x-sap-master-system');
    const responsible = getHeader('x-sap-responsible');
    const masterLanguage = getHeader('x-sap-language');

    const metadata: Record<string, string> = {};
    if (masterSystem) metadata.masterSystem = masterSystem;
    if (responsible) metadata.responsible = responsible;
    if (masterLanguage) metadata.masterLanguage = masterLanguage;

    // Per-request master/original language (x-sap-language) is carried in the
    // per-request connection metadata above and, for HTTP/SSE, in the
    // request-scoped context the transport establishes around dispatch (see
    // runWithRequestContext in StreamableHttpServer/SseServer). It is NOT
    // written to the process-global system-context cache, which would leak the
    // value across requests, sessions, and connection modes (#110).

    this.connectionContext = {
      sessionId: settings.authType === 'jwt' ? 'direct-jwt' : 'direct-basic',
      connectionParams: settings,
      credential,
      metadata,
    };
  }

  /**
   * Gets current connection context
   */
  protected getConnectionContext(): ConnectionContext | null {
    return this.connectionContext;
  }

  /**
   * Gets ABAP connection from connection context: the connector built from
   * the context's settings and credential, then connected. The credential
   * renews itself (a 401 reaches its `rejected()`), so nothing is looked up
   * here for refreshing.
   * For stdio mode: caches connection and reuses it for all requests (like v1)
   * For SSE/HTTP: creates new connection per request
   */
  protected async getConnection(): Promise<AbapConnection> {
    if (!this.connectionContext?.connectionParams) {
      throw new Error(
        'Connection context not set. Call setConnectionContext() first.',
      );
    }

    const destination = this.connectionContext.metadata?.destination as
      | string
      | undefined;
    const sessionId = this.connectionContext.sessionId;

    // For stdio mode: cache connection and reuse it (like v1)
    // This prevents creating new connection on each request, which would trigger browser auth
    // Check if we have cached connection with same sessionId (stdio uses destination as sessionId)
    if (destination && this.cachedConnection && sessionId === destination) {
      // Reuse cached connection for stdio mode
      return this.cachedConnection;
    }

    const connection = createAbapConnection(
      this.connectionContext.connectionParams,
      this.connectionContext.credential,
    );

    // Establish session (CSRF token + cookies) before first request.
    // RFC needs this for the stateful session; HTTP needs it because some SAP systems
    // reject the very first request (403) when no session cookie is present.
    await connection.connect();

    // Cache connection for stdio mode (when sessionId === destination, it's stdio)
    // SSE/HTTP modes use different sessionId per request, so caching won't interfere
    if (destination && sessionId === destination) {
      this.cachedConnection = connection;
    }

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
                connection: await this.getConnection(),
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
                  this.destinationSystemContext,
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

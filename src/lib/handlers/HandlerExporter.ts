import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { Logger } from '@mcp-abap-adt/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../handlers/interfaces.js';
import type { IAccessChecks } from '../access/accessChecks.js';
import {
  accessCallOf,
  checkedArgumentsOf,
} from '../access/checkedArguments.js';
import type { DeniedActions } from '../access/deniedActions.js';
import { refusalOf } from '../access/listedAccessChecks.js';
import { lazyPackageReader } from '../access/packageReader.js';
import { withoutDenied } from '../access/withoutDenied.js';
import { ServerRefusal } from '../auth/serverRefusal.js';
import {
  longToolInTheCall,
  withoutBackgroundParameter,
} from '../backgroundRuns/tools.js';
import { partsPerEnvelopeOf } from '../batch/phases.js';
import { noopLogger } from '../handlerLogger.js';
import { isLongTool } from '../longTools.js';
import {
  isCredentialFailure,
  type SystemContextResolver,
  type SystemContextRules,
} from '../requestSystemResolution.js';
import type { LineMatchStrategy } from '../search-source/lineMatch.js';
import type { SapAnswerStrategy } from '../search-source/readFailure.js';
import { statedSystemKind } from '../systemKind.js';
import { readOnlyToolNames } from '../toolSet.js';
import { return_error } from '../utils.js';
import type { BaseHandlerGroup } from './base/BaseHandlerGroup.js';
import { DataHandlersGroup } from './groups/DataHandlersGroup.js';
import { HighLevelHandlersGroup } from './groups/HighLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './groups/ReadOnlyHandlersGroup.js';
import { RuntimeRunHandlersGroup } from './groups/RuntimeRunHandlersGroup.js';
import { SearchHandlersGroup } from './groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './groups/SystemHandlersGroup.js';
import { NoDedupStrategy } from './groups/strategies/index.js';
import type { HandlerEntry, SapEnvironment } from './interfaces.js';
import { argumentsRefusalOf } from './interfaces.js';
import { noConnection } from './noConnection.js';
import { CompositeHandlersRegistry } from './registry/CompositeHandlersRegistry.js';
import { type CallContext, inStatedScope } from './utils/handlerCall.js';

/**
 * The run tools as the exporter hands them out: without `background`, since
 * it keeps no background-run store (`withoutBackgroundParameter`).
 */
class ExportedRuntimeRunHandlersGroup extends RuntimeRunHandlersGroup {
  override getHandlers(): HandlerEntry[] {
    return super.getHandlers().map((entry) => ({
      ...entry,
      toolDefinition: withoutBackgroundParameter(entry.toolDefinition),
    }));
  }
}

/**
 * The registry `createRegistry()` hands out. A server (`BaseMcpServer`)
 * reads its groups and runs the run tools as it runs its own: `background`
 * kept, served with the server's background runs and refused in words
 * without them. A plain registration (`registerAllTools` on an
 * `McpServer`) keeps no runs: it registers the run tools without
 * `background`, as `getHandlerEntries()` hands them out.
 */
class ExportedRegistry extends CompositeHandlersRegistry {
  constructor(
    private readonly servedGroups: BaseHandlerGroup[],
    plainGroups: BaseHandlerGroup[],
  ) {
    super(plainGroups);
  }

  override getHandlerGroups(): BaseHandlerGroup[] {
    return [...this.servedGroups];
  }
}

/**
 * The connection one call of a tool registered with
 * `HandlerExporter.registerOnServer` runs on: called for each call, sync or
 * async. What it returns is the call's; its lifetime is the embedder's.
 */
export type ConnectionProvider = () =>
  | IAbapConnection
  | Promise<IAbapConnection>;

/**
 * Options for creating handler exporter
 */
export interface HandlerExporterOptions {
  /**
   * The logger of the handlers' context: the handlers `getHandlerEntries()`
   * hands out run with it, over the embedder's context logger, and a plain
   * registration (`registerOnServer`) uses it. On `createRegistry()` the
   * hosting server's logger applies. Absent: the embedder's context logger
   * (no logging on the exporter's own paths).
   */
  logger?: Logger | undefined;

  /**
   * `SearchSource`'s SAP-answer strategy (DO22): what a SAP answer to a
   * failed read leads to (`'skip' | 'end' | 'throw'`). Only SAP answers
   * reach it: a credential refusal ends the call, a failed batch envelope
   * and anything that is no SAP answer are thrown. It applies to the entries
   * of `getHandlerEntries()` and to `registerOnServer`; on `createRegistry()`
   * the tools run in the contexts of the server the registry is handed to,
   * with that server's own `sapAnswerStrategy` option. Absent: the shipped
   * one, `skipSapAnswers`.
   */
  sapAnswerStrategy?: SapAnswerStrategy;

  /**
   * `SearchSource`'s line-match strategy (DO24): which lines of a source are
   * hits. As `sapAnswerStrategy`, on `getHandlerEntries()` and
   * `registerOnServer`; on `createRegistry()` the hosting server's option
   * applies. Absent: the shipped one, `substringLineMatch`.
   */
  lineMatchStrategy?: LineMatchStrategy;

  /**
   * The consumer's bound on the parts (requests) one ADT batch envelope of a call
   * carries: a whole number from 2, else the constructor throws. As
   * `sapAnswerStrategy`, on `getHandlerEntries()` and `registerOnServer`;
   * on `createRegistry()` the hosting server's option applies. Absent: no
   * bound — a phase's independent reads go in one envelope.
   */
  partsPerEnvelope?: number;

  /**
   * The denied actions (`readAccessRestrictions`, `parseDeniedEntry`):
   * applied once to the exporter's groups (`withoutDenied`), so a denied
   * tool is in none of `getHandlerEntries()`, `registerOnServer()` and
   * `createRegistry()`. A `Tool.value` entry matches only a compact tool's
   * values; the full set's tools carry none. Absent or empty: nothing denied.
   */
  deniedActions?: DeniedActions | undefined;

  /**
   * The access checks (spec §3.2): applied to every call of the entries
   * `getHandlerEntries()` hands out (before the handler runs, on the
   * connection the embedder gives) and of the tools `registerOnServer()`
   * registers (before the call's connection is asked for). On
   * `createRegistry()` the hosting server's own `accessChecks` applies.
   * Absent: no call is checked.
   */
  accessChecks?: IAccessChecks | undefined;

  /**
   * Include readonly handlers (getProgram, getClass, etc.)
   * @default true
   */
  includeReadOnly?: boolean;

  /**
   * Include high-level handlers
   * @default true
   */
  includeHighLevel?: boolean;

  /**
   * Include system handlers
   * @default true
   */
  includeSystem?: boolean;

  /**
   * Include search handlers
   * @default true
   */
  includeSearch?: boolean;

  /**
   * Include the data tools (`GetSqlQuery`, `GetTableContents`). Unlike the
   * other `include…` options, off unless stated: `true` turns them on, and
   * nothing else does. SAP API Policy FAQ v1.3 (June 2026), Q33, says ADT
   * APIs are not intended for reading application tables, exporting
   * business data or running SQL against SAP systems; whether to serve them
   * is the customer's decision.
   * @default false
   */
  includeData?: boolean;

  /**
   * The SAP system kind the exporter's own paths serve: the kind every
   * handler `getHandlerEntries()` hands out runs on, the variant a plain
   * registration (`registerOnServer`, `createRegistry().registerAllTools(mcpServer)`)
   * lists and calls on — that variant's tools, descriptions and schemas —
   * and the kind the rules (`systemContextRules`) read a lookup by. Never
   * guessed: without it the definitions are listed as they are and every
   * call that would reach a system is refused `system_type_required`;
   * `SAP_SYSTEM_TYPE` is not read on either path. A `createRegistry()`
   * registry handed to a server (`EmbeddableMcpServer`, `BaseMcpServer`)
   * runs in that server's contexts: the server's `systemType`, resolver,
   * rules and logger apply there, never this option.
   */
  systemType?: SapEnvironment;

  /**
   * Asks the connection's system for the responsible person and master
   * system before each wrapped handler runs, once per connection: an
   * answer naming the user is the information. A credential failure (a
   * chain failure, a `401`) is thrown as it came, and the handler does not
   * run. Default: none — nothing is looked up (`getHandlerEntries()` still
   * wraps each handler in the call-transport scope). `defaultSystemContextResolver`
   * (`@mcp-abap-adt/lib/request-context`) asks `systeminformation`.
   */
  systemContextResolver?: SystemContextResolver | null;

  /**
   * The rules that make the connection's parameters from the lookup
   * (`@mcp-abap-adt/responsible-rules`), once per connection; a refusal of
   * theirs is thrown and the handler does not run. Default: none — the
   * information is applied, no information leaves the configured values.
   */
  systemContextRules?: SystemContextRules | null;
}

/**
 * Handler Exporter - factory for creating handlers registry
 *
 * This class provides a way to create handlers registry with configurable
 * exposition levels. Use with EmbeddableMcpServer for external integration,
 * or register the tools on your own `McpServer` with `registerOnServer`,
 * each call on the connection your provider returns.
 *
 * Usage:
 * ```typescript
 * import { HandlerExporter, EmbeddableMcpServer } from '@mcp-abap-adt/core';
 *
 * // Create exporter with specific handlers
 * const exporter = new HandlerExporter({
 *   systemType: 'onprem',
 *   includeReadOnly: true,
 *   includeHighLevel: true,
 * });
 *
 * // Use with EmbeddableMcpServer
 * const server = new EmbeddableMcpServer({
 *   connection: myConnection,
 *   systemType: 'onprem',
 *   handlersRegistry: exporter.createRegistry(),
 * });
 * ```
 */
export class HandlerExporter {
  private readonly logger: Logger;
  /** The `logger` option as given: a handed-out handler's logger when stated. */
  private readonly statedLogger: Logger | undefined;
  private readonly handlerGroups: BaseHandlerGroup[];
  /**
   * The groups `createRegistry()` hands a server: the same, but the run
   * tools keep `background` — the hosting server lists it when it has
   * background runs, and strips it when it has none.
   */
  private readonly registryGroups: BaseHandlerGroup[];
  private readonly systemContextResolver: SystemContextResolver | null;
  private readonly systemContextRules: SystemContextRules | null;
  private readonly systemType: string | undefined;
  private readonly sapAnswerStrategy: SapAnswerStrategy | undefined;
  private readonly lineMatchStrategy: LineMatchStrategy | undefined;
  private readonly partsPerEnvelope: number | undefined;
  private readonly access:
    | { readonly checks: IAccessChecks; readonly readOnly: ReadonlySet<string> }
    | undefined;

  constructor(options?: HandlerExporterOptions) {
    this.logger = options?.logger ?? noopLogger;
    this.statedLogger = options?.logger;
    this.sapAnswerStrategy = options?.sapAnswerStrategy;
    this.lineMatchStrategy = options?.lineMatchStrategy;
    this.partsPerEnvelope =
      options?.partsPerEnvelope === undefined
        ? undefined
        : partsPerEnvelopeOf(options.partsPerEnvelope, 'partsPerEnvelope');
    this.systemType = options?.systemType;
    this.systemContextResolver = options?.systemContextResolver ?? null;
    this.systemContextRules = options?.systemContextRules ?? null;
    this.access =
      options?.accessChecks === undefined
        ? undefined
        : { checks: options.accessChecks, readOnly: readOnlyToolNames() };

    // Create dummy context for group instantiation. A call's real context
    // is given by the server instance (BaseMcpServer.registerHandlers(), via
    // getConnection()) or made per call by registerOnServer (its provider's
    // connection).
    const dummyContext: HandlerContext = {
      connection: noConnection,
      logger: this.logger,
      ...(options?.systemType !== undefined && {
        systemType: options.systemType,
      }),
      // A plain registration's calls (`registerOnServer`) are checked by
      // the groups (`BaseHandlerGroup.registerToolOnServer`).
      ...(this.access !== undefined && { accessChecks: this.access }),
    };

    // Build handler groups based on options
    this.handlerGroups = [];

    // High is built first: a readonly tool that is a copy of one of
    // theirs under the same name is withheld from the readonly group, so a
    // tool appears once and comes from high. No other readonly tool is hidden
    // here (NoDedupStrategy).
    const overridingGroups: BaseHandlerGroup[] = [];
    if (options?.includeHighLevel !== false) {
      overridingGroups.push(new HighLevelHandlersGroup(dummyContext));
    }
    const overridingToolNames = new Set<string>();
    for (const g of overridingGroups) {
      for (const e of g.getHandlers()) {
        overridingToolNames.add(e.toolDefinition.name);
      }
    }

    if (options?.includeReadOnly !== false) {
      this.handlerGroups.push(
        new ReadOnlyHandlersGroup(
          dummyContext,
          overridingToolNames,
          new NoDedupStrategy(),
        ),
      );
    }
    this.handlerGroups.push(...overridingGroups);
    if (options?.includeSystem !== false) {
      this.handlerGroups.push(new SystemHandlersGroup(dummyContext));
      // The run tools without `background`: the exporter keeps no
      // background-run store, so it hands out neither the parameter nor the
      // background-run tools.
      this.handlerGroups.push(
        new ExportedRuntimeRunHandlersGroup(dummyContext),
      );
    }
    if (options?.includeSearch !== false) {
      this.handlerGroups.push(new SearchHandlersGroup(dummyContext));
    }
    // The data tools, opt-in: only when stated.
    if (options?.includeData === true) {
      this.handlerGroups.push(new DataHandlersGroup(dummyContext));
    }
    const registryGroups = this.handlerGroups.map((group) =>
      group instanceof ExportedRuntimeRunHandlersGroup
        ? new RuntimeRunHandlersGroup(dummyContext)
        : group,
    );
    // The denied actions, applied once: every path starts from these groups.
    this.handlerGroups = withoutDenied(
      this.handlerGroups,
      options?.deniedActions ?? [],
    );
    this.registryGroups = withoutDenied(
      registryGroups,
      options?.deniedActions ?? [],
    );
  }

  /**
   * Get all handler entries
   * Useful for inspection or custom registration logic
   *
   * Embedders call these handlers themselves, so each one is wrapped: it
   * runs on the kind this exporter states (`systemType`, stated on the
   * call's connection; none stated, none — `SAP_SYSTEM_TYPE` is not read),
   * and with a resolver the responsible person and master system are filled
   * from the connection's parameters (see `systemContextResolver`,
   * `systemContextRules`) before it runs — a credential failure or a
   * refusal of the rules is thrown, and the handler does not run. An
   * embedder calls an entry as `entry.call(context, args)`.
   */
  getHandlerEntries(): HandlerEntry[] {
    const entries: HandlerEntry[] = [];
    for (const group of this.handlerGroups) {
      for (const entry of group.getHandlers()) {
        // The exporter keeps no background runs: a listed long tool is
        // handed out without `background`, as the run tools are.
        entries.push(
          this.wrapEntry(
            isLongTool(entry.toolDefinition.name)
              ? {
                  ...entry,
                  toolDefinition: longToolInTheCall(entry.toolDefinition),
                }
              : entry,
          ),
        );
      }
    }
    return entries;
  }

  /**
   * Every handed-out handler runs on the system kind this exporter states
   * (`systemType`), stated on the call's connection before it runs — or
   * none, when it states none: `SAP_SYSTEM_TYPE` is not read for that
   * connection (`stateSystemKind`); a connection `createAbapConnection`
   * built keeps the kind it was built for. It runs in the call-transport
   * scope with its own call's `transport_request` (`callTransport.ts`, the
   * failure renderer's transport hint), and with the system lookup when a
   * resolver is given.
   */
  private wrapEntry(entry: HandlerEntry): HandlerEntry {
    const original = entry.call;
    const access = this.access;
    const checked =
      access === undefined
        ? undefined
        : checkedArgumentsOf(entry.toolDefinition, access.readOnly);
    return {
      ...entry,
      call: (context, args) => {
        // The tool's schema first — the one check of a call, the SDK's parse
        // on the other paths: a refused call reaches no scope, no resolver,
        // no access check and no handler. Read on the kind this exporter
        // states, else the one the connection was built for.
        // One kind: the exporter's. A tool stated per variant is checked on
        // it; stating none, the tool has no kind — `system_type_required`,
        // before anything else. A connection recorded or declared for
        // another kind is refused `system_type_conflict` (`inStatedScope`).
        const kind = statedSystemKind(this.systemType);
        if (entry.toolDefinition.variants !== undefined && kind === undefined) {
          return Promise.reject(new ServerRefusal('system_type_required'));
        }
        const refused = argumentsRefusalOf(entry.toolDefinition, args, kind);
        if (refused !== undefined) return Promise.reject(refused);
        return inStatedScope(
          { ...this.stated(), connection: context?.connection },
          args,
          async () => {
            // The access checks (spec §3.2, path 5): before the handler,
            // on the connection the embedder gave.
            const accessCall =
              checked === undefined
                ? undefined
                : accessCallOf(entry.toolDefinition.name, checked, args);
            if (access !== undefined && accessCall !== undefined) {
              const verdict = await access.checks.check(
                accessCall,
                lazyPackageReader(
                  async () => context.connection,
                  this.logger,
                  new AbortController().signal,
                ),
              );
              if (!verdict.allowed) return return_error(refusalOf(verdict));
            }
            return original(this.withStrategies(context), args);
          },
        );
      },
    };
  }

  /**
   * `context` with this exporter's `SearchSource` strategies — the field of
   * each is the option when given and absent when not, whatever the
   * embedder's context held: a context is no way to pass a strategy — and
   * with the exporter's `logger` when one was given (the embedder's
   * context logger otherwise).
   */
  private withStrategies(context: HandlerContext): HandlerContext {
    const {
      sapAnswerStrategy: _sap,
      lineMatchStrategy: _lines,
      partsPerEnvelope: _bound,
      ...rest
    } = context;
    return {
      ...rest,
      ...(this.statedLogger !== undefined && { logger: this.statedLogger }),
      ...this.strategies(),
    };
  }

  /** This exporter's `SearchSource` strategies and envelope bound: a field per option given. */
  private strategies(): Pick<
    HandlerContext,
    'sapAnswerStrategy' | 'lineMatchStrategy' | 'partsPerEnvelope'
  > {
    return {
      ...(this.partsPerEnvelope !== undefined && {
        partsPerEnvelope: this.partsPerEnvelope,
      }),
      ...(this.sapAnswerStrategy !== undefined && {
        sapAnswerStrategy: this.sapAnswerStrategy,
      }),
      ...(this.lineMatchStrategy !== undefined && {
        lineMatchStrategy: this.lineMatchStrategy,
      }),
    };
  }

  /**
   * What this exporter states for every call: its `systemType`, and the
   * system-context resolver and rules when it has them.
   */
  private stated(): Pick<
    HandlerContext,
    'systemType' | 'systemContextResolver' | 'systemContextRules'
  > {
    return {
      ...(this.systemType !== undefined && { systemType: this.systemType }),
      ...(this.systemContextResolver !== null && {
        systemContextResolver: this.systemContextResolver,
      }),
      ...(this.systemContextRules !== null && {
        systemContextRules: this.systemContextRules,
      }),
    };
  }

  /**
   * Registers this exporter's tools on an embedder's `McpServer`, each call
   * on the connection `connectionProvider` returns for it.
   *
   * The listing is a plain registration's (`createRegistry().registerAllTools`)
   * for the stated `systemType`: that variant's tools, descriptions, schemas
   * and search members; none stated, the definitions as they are. Each call
   * awaits the provider, then runs the entry's call on what it returned, on
   * the stated kind (none stated: refused `system_type_required` before
   * anything is sent; `SAP_SYSTEM_TYPE` is not read), and with the
   * `systemContextResolver` / `systemContextRules` when given, as
   * `getHandlerEntries()` applies them.
   *
   * A provider that throws or rejects is the call's answer and the handler
   * does not run: a credential failure (a chain failure, a `401`) as it came,
   * anything else `connection_provider_failed` in fixed words. Nothing waits
   * on a clock and nothing is retried. The connection is the provider's: each
   * call uses what it returns, and a lock held across calls needs the
   * provider to return the same connection.
   *
   * It registers no prompt. The prompts of the common ABAP work are an
   * opt-in: `registerAbapPrompts(server, registry)`
   * (`@mcp-abap-adt/lib/prompts`), given the registry `createRegistry()`
   * returns, registers the prompts of these tools on the same server.
   */
  registerOnServer(
    server: McpServer,
    connectionProvider: ConnectionProvider,
  ): void {
    const callContext: CallContext = async () => {
      let connection: IAbapConnection;
      try {
        connection = await connectionProvider();
      } catch (error) {
        if (isCredentialFailure(error)) throw error;
        throw new ServerRefusal('connection_provider_failed');
      }
      return {
        connection,
        logger: this.logger,
        ...this.stated(),
        ...this.strategies(),
      };
    };
    new CompositeHandlersRegistry(this.handlerGroups).registerAllToolsOnCall(
      server,
      callContext,
    );
  }

  /**
   * Get list of tool names
   */
  getToolNames(): string[] {
    return this.getHandlerEntries().map((e) => e.toolDefinition.name);
  }

  /**
   * Create handlers registry for use with EmbeddableMcpServer or BaseMcpServer.
   * Its tools run in the contexts that server builds: its `systemType`,
   * resolver, rules, logger and `SearchSource` strategies
   * (`sapAnswerStrategy`, `lineMatchStrategy`) are that server's options,
   * and this exporter's do not apply.
   *
   * Handed to a server, it gets that server's prompts, built from the tools
   * the server lists (its `prompts` option turns them off). Registered
   * plainly (`registerAllTools`), it registers no prompt:
   * `registerAbapPrompts(mcpServer, registry)` (`@mcp-abap-adt/lib/prompts`)
   * is the opt-in, and takes this registry as it is returned.
   */
  createRegistry(): CompositeHandlersRegistry {
    return new ExportedRegistry(this.registryGroups, this.handlerGroups);
  }
}

/**
 * Create default handler exporter with all handler groups.
 */
export function createDefaultHandlerExporter(
  logger?: Logger,
  systemType?: SapEnvironment,
): HandlerExporter {
  return new HandlerExporter({
    logger,
    ...(systemType !== undefined && { systemType }),
  });
}

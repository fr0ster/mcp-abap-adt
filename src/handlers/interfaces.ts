import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { AdtHeaderPort } from '../lib/adtHeaders/AdtHeaderPairs';
import type { BackgroundRunTools } from '../lib/backgroundRuns/port';
import type { BatchAvailability } from '../lib/batch/availability';
import type { InstanceBatch } from '../lib/batch/InstanceBatch';
import type { DebuggerInstance } from '../lib/debugger/DebuggerInstance';
import type { LeftoverSessions } from '../lib/leftoverSessions/LeftoverSessions';
import type { LeftoverSessionTools } from '../lib/leftoverSessions/port';
import type {
  SystemContextResolver,
  SystemContextRules,
} from '../lib/requestSystemResolution';
import type { LineMatchStrategy } from '../lib/search-source/lineMatch';
import type { SapAnswerStrategy } from '../lib/search-source/readFailure';
import type { HeldLockPort } from '../lib/state/heldLocks';
import type { InstanceState } from '../lib/state/InstanceState';
import type { LongSessionPort } from '../lib/state/longSession';

/**
 * Handler context containing connection and logger
 * Injected automatically by BaseMcpServer.registerHandlers()
 */
export interface HandlerContext {
  connection: IAbapConnection;
  logger?: ILogger;
  /** What the server instance holds between tool calls, and its handle; absent where no instance state is served. */
  state?: InstanceState;
  /** The instance's debugger, created on first use and attached to `state`. */
  debugger?: () => DebuggerInstance;
  /**
   * The process's runtime files of the SAP sessions it holds (their owner,
   * given by the host); absent where none was given. A connection opened
   * beside the call's (a debugger's own) is kept there.
   */
  sessionFiles?: LeftoverSessions;
  /** The leftover-session tools' port, for this instance and this call. */
  leftoverSessions?: LeftoverSessionTools;
  /**
   * The background-run tools' port, for this instance and this call: the
   * host's strategy and the call's caller; absent where the host gave none.
   */
  backgroundRuns?: BackgroundRunTools;
  /**
   * The owner of this instance's batch state (the host's, `batch` option),
   * for the batch tools; absent where the host gave none — they answer
   * `batch_mode_unavailable` then.
   */
  batch?: InstanceBatch;
  /**
   * Whether the call's destination has the communication batch, for the
   * internal batches of the multi-request reads (`runPhase`,
   * `withSequentialFallback`): the port of the destination record the
   * dispatch found for the call — one per destination, never per
   * connection — kept in every context derived from this one (a long
   * call's own connection, an inner handler's). Absent where the call has
   * no destination record — a host's injected connection, and a host's own
   * registration of a handler group (`BaseHandlerGroup.registerHandlers` on
   * a plain McpServer, whose calls take the group's constructor context):
   * every phase then sends its envelope, and only that call falls back.
   */
  batchAvailability?: BatchAvailability;
  /**
   * @internal Set by the server from its options; not part of the context a
   * consumer builds. `SearchSource`'s SAP-answer strategy (DO22): what a SAP
   * answer to a failed read leads to. Absent, the handler takes the shipped
   * one (`skipSapAnswers`). Kept in every context derived from this one.
   */
  sapAnswerStrategy?: SapAnswerStrategy;
  /**
   * @internal Set by the server from its options; not part of the context a
   * consumer builds. `SearchSource`'s line-match strategy (DO24): which lines
   * of a source are hits. Absent, the handler takes the shipped one
   * (`substringLineMatch`). Kept in every context derived from this one.
   */
  lineMatchStrategy?: LineMatchStrategy;
  /**
   * The request header pairs of the call's system (`AdtHeaderPairs`): the
   * pair a header-taking member is called with (`withAdtHeaders`), and
   * where a corrected one is kept. Kept in every context derived from this
   * one. Absent: the default pairs, nothing kept.
   */
  adtHeaders?: AdtHeaderPort;
  /**
   * The locks this instance holds between requests (`HeldLocks`): every
   * server instance's own. Absent (a group registered on a plain McpServer):
   * no lock is taken, and nothing is sent under a `lock_handle`.
   */
  heldLocks?: HeldLockPort;
  /**
   * The instance's long session (`LongSession`), given by a host whose
   * instances last one request each (Streamable HTTP); absent on stdio and
   * SSE, whose instance keeps its session between calls.
   */
  longSession?: LongSessionPort;
  /**
   * Sends on the instance's connection through its main flow: directly from a
   * call that holds it, else in turn. `send` is handed the connection to send
   * on — the holding call's, or the one taken inside the flow (a session lost
   * by the call ahead already replaced) — and must capture none of its own. For a tool outside the flow (the
   * debugger's) that still asks something of the instance's connection.
   */
  onMainConnection?: <T>(
    send: (connection: IAbapConnection) => Promise<T>,
  ) => Promise<T>;
  /**
   * The system kind stated for a connection the factory did not build: in a
   * server instance's context, its `systemType` option — absent where it
   * states none, and `SAP_SYSTEM_TYPE` then decides; in the context of a
   * handler group registered on a plain McpServer (`HandlerExporter`'s
   * `systemType`), the only source — its tools are listed and called on
   * this kind, `SAP_SYSTEM_TYPE` is not read, and with none stated every
   * call that would reach a system is refused `system_type_required`. See
   * `systemKindOf`.
   */
  systemType?: string;
  /**
   * For a handler group registered on its own (`registerHandlers` on a
   * plain McpServer): the resolver its tools ask before they run, and the
   * rules that make the connection's parameters from it. Absent: nothing is
   * looked up, no rule applied. The server's own instances use their
   * options, not these.
   */
  systemContextResolver?: SystemContextResolver;
  systemContextRules?: SystemContextRules;
  /**
   * A call recorded in the debugger batch: its own context, before the
   * dispatch handed it the per-call recorder as its connection. The debug
   * sessions are bound to it, so a connection they open later derives from
   * the call's connection, never from a recorder of an ended batch.
   */
  recordedFrom?: HandlerContext;
}

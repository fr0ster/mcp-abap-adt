import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
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
import type { HeldLocks } from '../lib/state/heldLocks';
import type { InstanceState } from '../lib/state/InstanceState';

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
   * no destination record (a host's injected connection): every phase then
   * sends its envelope, and only that call falls back.
   */
  batchAvailability?: BatchAvailability;
  /**
   * The locks this instance holds between requests (`HeldLocks`), given by a
   * host whose instances last one request each (Streamable HTTP); absent on
   * stdio and SSE, whose instance keeps its session between calls.
   */
  heldLocks?: HeldLocks;
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
   * The system kind the server states (its `systemType` option), for a
   * connection the factory did not build; absent where none is stated
   * (`SAP_SYSTEM_TYPE` then decides — see `systemKindOf`).
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
}

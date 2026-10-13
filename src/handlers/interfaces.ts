import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { DebuggerInstance } from '../lib/debugger/DebuggerInstance';
import type { LeftoverSessions } from '../lib/leftoverSessions/LeftoverSessions';
import type { LeftoverSessionTools } from '../lib/leftoverSessions/port';
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
}

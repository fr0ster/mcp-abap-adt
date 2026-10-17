/**
 * Who creates objects and on which system, as a connection source states it:
 * a destination's own `.env` (core's destination reader fills it), or, for an
 * `x-sap-*` basic connection, its `x-sap-login` as the login. A key the source
 * does not state is absent.
 */
export interface DestinationSystemContext {
  /** `SAP_RESPONSIBLE`. */
  responsible?: string;
  /**
   * The destination's own `SAP_USERNAME` (or `x-sap-login`) — the login,
   * which is the responsible only when no `SAP_RESPONSIBLE` is stated anywhere
   * (the request, the destination, the process).
   */
  login?: string;
  /** `SAP_MASTER_SYSTEM`. */
  masterSystem?: string;
  /** `SAP_DEBUG_TERMINAL_ID`. */
  debugTerminalId?: string;
  /** `SAP_DEBUG_IDE_ID`. */
  debugIdeId?: string;
  /** `SAP_DEBUG_BREAKPOINT_CONFLICT`. */
  debugBreakpointConflict?: string;
}

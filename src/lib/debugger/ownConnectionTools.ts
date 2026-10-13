/**
 * The debugger tools whose SAP work runs on the debugger's own connections
 * (`openStateful`: the listener, the debuggee, the AMDP events and commands),
 * never on the instance's: they take no place in the instance's main flow,
 * as a background run does not (spec §5.7). What they still ask of the
 * instance's connection — the request user (`requestUserOf`) — goes through
 * the flow (`HandlerContext.onMainConnection`).
 */
export const DEBUGGER_OWN_CONNECTION_TOOLS: readonly string[] = [
  'DebugWait',
  'AmdpDebugWait',
  'HandlerDebugWait',
  'DebugStep',
  'DebugStepToLine',
  'AmdpDebugStep',
  'HandlerDebugStep',
  'DebugStartListener',
  'DebugTakeOverListener',
  'AmdpDebugStart',
  'HandlerDebugStart',
];

const LISTED = new Set(DEBUGGER_OWN_CONNECTION_TOOLS);

/** Whether `name` is a debugger tool that works on the debugger's own connections. */
export function isDebuggerOwnConnectionTool(name: string): boolean {
  return LISTED.has(name);
}

/**
 * The debugger tools whose SAP work runs on the debugger's own connections
 * (`openStateful`: the listener, the debuggee, the AMDP events and commands),
 * never on the instance's: they take no place in the instance's main flow,
 * as a background run does not. Each was audited:
 * its handler reads no `context.connection` — it reaches the debugger through
 * `requireDebugger` / the compact `branchByKind` — and the debugger touches
 * the instance's connection only to open its own (`openFreshConnection`,
 * which sends nothing on it); the request user is the call's stated context
 * (`requestUserOf`, which sends nothing).
 * `src/__tests__/unit/sources/debuggerOwnConnection.test.ts` holds each listed
 * handler to that. The memory-snapshot tools (`MemorySnapshotList`, `…Get`,
 * `…Delta`) read the instance's connection and stay in the flow.
 */
export const DEBUGGER_OWN_CONNECTION_TOOLS: readonly string[] = [
  'AmdpDebugCancel',
  'AmdpDebugGetTable',
  'AmdpDebugSetBreakpoints',
  'AmdpDebugStart',
  'AmdpDebugStep',
  'AmdpDebugStop',
  'AmdpDebugWait',
  'DebugCreateMemorySnapshot',
  'DebugCreateWatchpoint',
  'DebugDeleteBreakpoint',
  'DebugDeleteWatchpoint',
  'DebugGetMemorySizes',
  'DebugGetStack',
  'DebugGetVariables',
  'DebugListBreakpoints',
  'DebugListWatchpoints',
  'DebugSetBreakpoints',
  'DebugSetSettings',
  'DebugSetStackPosition',
  'DebugSetVariable',
  'DebugStartListener',
  'DebugStep',
  'DebugStepToLine',
  'DebugStop',
  'DebugTakeOverListener',
  'DebugTerminate',
  'DebugWait',
  'HandlerDebugBreakpoints',
  'HandlerDebugMaintain',
  'HandlerDebugSession',
  'HandlerDebugStep',
];

const LISTED = new Set(DEBUGGER_OWN_CONNECTION_TOOLS);

/** Whether `name` is a debugger tool that works on the debugger's own connections. */
export function isDebuggerOwnConnectionTool(name: string): boolean {
  return LISTED.has(name);
}

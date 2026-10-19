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
 * The debugger batch tools (`DebugBatchBegin`, `DebugBatchEnd`,
 * `HandlerDebugBatch`) work on the stop's connection.
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
  'DebugBatchBegin',
  'DebugBatchEnd',
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
  'HandlerDebugBatch',
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

/** The ABAP step actions of `DebugStep` (its `detach` and `release_debugger` excepted). */
const FULL_STEPS = new Set(['into', 'over', 'return', 'continue']);
const COMPACT_STEPS = new Set([
  'stepInto',
  'stepOver',
  'stepReturn',
  'stepContinue',
  'stepRunToLine',
  'stepJumpToLine',
  'setStackPosition',
]);
const COMPACT_READS = new Set([
  'getStack',
  'getVariables',
  'getChildVariables',
  'setVariableValue',
]);

/** `args[name]`, when `args` is an object. */
function argument(args: unknown, name: string): unknown {
  return args !== null && typeof args === 'object'
    ? (args as Record<string, unknown>)[name]
    : undefined;
}

/**
 * Whether a call of `tool` with `args` is recorded in the debugger batch
 * opened at `debuggee` (spec §7's table). At the ABAP stop: step, step to
 * line, stack, variables, child variables, stack position and setting a
 * variable — in the full set `DebugStep` (into, over, return, continue),
 * `DebugStepToLine`, `DebugGetStack`, `DebugGetVariables`,
 * `DebugSetStackPosition`, `DebugSetVariable`; in the compact set
 * `HandlerDebugStep` and `HandlerDebugMaintain` of kind abap with those
 * operations. At the AMDP break: step over, continue and the data preview —
 * in the full set `AmdpDebugStep` and `AmdpDebugGetTable`; in the compact
 * set `HandlerDebugStep` (stepOver, stepContinue) and `HandlerDebugMaintain`
 * (getDataPreview) of kind amdp. Every other call is refused while the
 * debugger batch is open.
 */
export function recordableInDebugBatch(
  tool: string,
  args: unknown,
  debuggee: 'abap' | 'amdp',
): boolean {
  if (debuggee === 'amdp') return recordableAtAmdpBreak(tool, args);
  switch (tool) {
    case 'DebugStep':
      return FULL_STEPS.has(String(argument(args, 'action')));
    case 'DebugStepToLine':
    case 'DebugGetStack':
    case 'DebugGetVariables':
    case 'DebugSetStackPosition':
    case 'DebugSetVariable':
      return true;
    case 'HandlerDebugStep':
      return (
        argument(args, 'kind') === 'abap' &&
        COMPACT_STEPS.has(String(argument(args, 'operation')))
      );
    case 'HandlerDebugMaintain':
      return (
        argument(args, 'kind') === 'abap' &&
        COMPACT_READS.has(String(argument(args, 'operation')))
      );
    default:
      return false;
  }
}

const AMDP_STEPS = new Set(['stepOver', 'stepContinue']);

/** The AMDP half of `recordableInDebugBatch`. */
function recordableAtAmdpBreak(tool: string, args: unknown): boolean {
  switch (tool) {
    case 'AmdpDebugStep':
    case 'AmdpDebugGetTable':
      return true;
    case 'HandlerDebugStep':
      return (
        argument(args, 'kind') === 'amdp' &&
        AMDP_STEPS.has(String(argument(args, 'operation')))
      );
    case 'HandlerDebugMaintain':
      return (
        argument(args, 'kind') === 'amdp' &&
        argument(args, 'operation') === 'getDataPreview'
      );
    default:
      return false;
  }
}

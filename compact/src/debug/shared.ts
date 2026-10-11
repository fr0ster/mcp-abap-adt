import {
  type DebuggerInstance,
  debugAnswer,
  requireDebugger,
} from '@mcp-abap-adt/lib/debugger';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';

/**
 * The kind a compact debug session holds. One instance holds ABAP or AMDP, never
 * both: the start fixes the kind and every later verb reads it from the instance.
 */
export function kindOf(instance: DebuggerInstance): 'abap' | 'amdp' {
  return instance.amdp.holdsState() ? 'amdp' : 'abap';
}

/** A start of one kind is refused while the instance holds the other. */
export function refuseOtherKind(
  context: HandlerContext,
  wanted: 'abap' | 'amdp',
): void {
  const held = context.debugger?.();
  if (!held) return;
  const other = wanted === 'abap' ? held.amdp : held.abap;
  if (other.holdsState()) {
    throw new Error(
      `a ${wanted === 'abap' ? 'amdp' : 'abap'} debug session is already open on this server; end it first`,
    );
  }
}

/**
 * Runs the branch of the kind the instance holds. The handle is checked first; a
 * handle that is not available is answered by `onFailure` with the same text a
 * tool of the full surface gives.
 */
export function branchByKind<R>(
  context: HandlerContext,
  args: { state_handle: string },
  branches: {
    abap: (d: DebuggerInstance) => R;
    amdp: (d: DebuggerInstance) => R;
  },
  onFailure: (error: unknown) => R,
): R {
  let d: DebuggerInstance;
  try {
    d = requireDebugger(context, args, 'use');
  } catch (error) {
    return onFailure(error);
  }
  return branches[kindOf(d)](d);
}

/** The answer for a call that failed before it reached a reading: the tool error. */
export const failedAnswer = (args: unknown) => (error: unknown) =>
  debugAnswer(
    args,
    async () => {
      throw error;
    },
    (v) => v,
  );

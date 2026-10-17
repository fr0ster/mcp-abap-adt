import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import type { DebuggerInstance } from './DebuggerInstance';

/**
 * create: a starting tool — nothing of ours refuses it; SAP's answer to a
 * listener of the same user (see `ids.ts`) reaches the model as it is.
 * use: the handle must be this instance's with state held. Either way the
 * sessions are bound to this call's context.
 */
export function requireDebugger(
  context: HandlerContext,
  args: { state_handle: string },
  mode: 'use',
): DebuggerInstance;
export function requireDebugger(
  context: HandlerContext,
  args: object,
  mode: { create: 'abap' | 'amdp' },
): DebuggerInstance;
export function requireDebugger(
  context: HandlerContext,
  args: { state_handle?: string },
  mode: { create: 'abap' | 'amdp' } | 'use',
): DebuggerInstance {
  if (!context.state || !context.debugger) {
    throw new Error('debugging is not served by this server');
  }
  if (mode === 'use') context.state.check(args.state_handle);
  const instance = context.debugger();
  instance.abap.bind(context);
  instance.amdp.bind(context);
  return instance;
}

/**
 * For a start's error answer: the handle, while the state still holds
 * something (a start that could not undo everything) — the model stops it
 * with this handle. Nothing held: nothing to answer.
 */
export function heldStateHandle(
  context: HandlerContext,
): Record<string, unknown> {
  return context.state?.holdsState()
    ? { state_handle: context.state.handle }
    : {};
}

/** What a start answers beside its state: the handle, the SAP ids, and the identity in force. */
export function startedExtra(context: HandlerContext): Record<string, unknown> {
  const abap = context.debugger!().abap;
  const identity = abap.currentIdentity();
  return {
    state_handle: context.state!.handle,
    terminal_id: identity?.terminalId ?? abap.ids.terminalId,
    ide_id: abap.ids.ideId,
    ...(identity ? { debugging_mode: identity.debuggingMode } : {}),
    ...(identity?.debuggingMode === 'user'
      ? { request_user: identity.requestUser }
      : {}),
  };
}

/**
 * The per-call recorder of the debugger batch, when this call is recorded in
 * it: the dispatch hands a recorded call its recorder as the call's
 * connection. `undefined` outside the debugger batch.
 */
export function debugBatchRecorder(
  context: HandlerContext,
): IAbapConnection | undefined {
  return context.batch?.mode() === 'debugger' ? context.connection : undefined;
}

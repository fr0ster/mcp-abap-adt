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

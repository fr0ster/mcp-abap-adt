import type { HandlerContext } from '../../handlers/interfaces';
import type { DebuggerInstance } from './DebuggerInstance';

/**
 * create: a starting tool — the kind is admitted (identity, per-owner slot);
 * use: the handle must be this instance's with state held. Either way the
 * sessions are bound to this call's context.
 */
export function requireDebugger(
  context: HandlerContext,
  args: unknown,
  mode: { create: 'abap' | 'amdp' } | 'use',
): DebuggerInstance {
  if (!context.state || !context.debugger) {
    throw new Error('debugging is not served by this server');
  }
  if (mode === 'use') {
    context.state.check(
      (args as { state_handle?: unknown } | undefined)?.state_handle,
    );
  } else {
    context.state.admit(mode.create);
  }
  const instance = context.debugger();
  instance.abap.bind(context);
  instance.amdp.bind(context);
  return instance;
}

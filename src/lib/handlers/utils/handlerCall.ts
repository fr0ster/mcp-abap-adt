import type { HandlerContext } from '../../../handlers/interfaces.js';
import type { ToolHandler } from '../interfaces.js';

/**
 * Runs `call` with the handler's group holding `context`: how an args-only
 * handler (`(args) => handleX(this.context, args)`) reads the call's context.
 * Each registration path sets its group's context its own way.
 */
export type InGroupContext = (
  context: HandlerContext,
  call: () => Promise<unknown>,
) => Promise<unknown>;

/**
 * Calls a group's handler in the form it takes, the one rule every
 * registration path follows: a handler declaring two parameters gets
 * `(context, args)`; an args-only one gets `args`, called inside
 * `inGroupContext` so its group's context is the call's when it reads it.
 */
export function callInItsForm(
  handler: ToolHandler,
  context: HandlerContext,
  args: unknown,
  inGroupContext: InGroupContext,
): Promise<unknown> {
  if (handler.length >= 2) return handler(context, args);
  // An args-only handler takes its arguments as its first parameter; the
  // erased `ToolHandler` type of every entry declares only the two-parameter
  // form, so its `length` (a runtime fact) decides, and this is the one
  // place the args-only form is named.
  const argsOnly = handler as (args: unknown) => Promise<unknown>;
  return inGroupContext(context, () => argsOnly(args));
}

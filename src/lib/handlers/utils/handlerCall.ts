import type { HandlerContext } from '../../../handlers/interfaces.js';
import type { ArgsOnlyHandler, ToolHandler } from '../interfaces.js';

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
 * registration path follows (`isArgsOnly`): a handler declaring two parameters gets
 * `(context, args)`; an args-only one gets `args`, called inside
 * `inGroupContext` so its group's context is the call's when it reads it.
 */
export function callInItsForm(
  handler: ToolHandler,
  context: HandlerContext,
  args: unknown,
  inGroupContext: InGroupContext,
): Promise<unknown> {
  if (isArgsOnly(handler)) {
    return inGroupContext(context, () => handler(args));
  }
  return handler(context, args);
}

/**
 * The handler takes its arguments alone: it declares fewer than two
 * parameters. Its `length` is a runtime fact; the guard narrows the other
 * branch to exactly `(context, args)`.
 */
export function isArgsOnly(handler: ToolHandler): handler is ArgsOnlyHandler {
  return handler.length < 2;
}

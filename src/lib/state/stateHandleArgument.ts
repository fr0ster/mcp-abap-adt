/**
 * The `state_handle` argument a host whose instances last one request each
 * (Streamable HTTP) declares on every tool: the pool routes a call by it, and
 * an LLM — which sets no header — can only send what a schema declares.
 * stdio and SSE keep their instance between calls and declare nothing.
 */
import * as z from 'zod';
import type { ToolArgs } from '../handlers/interfaces.js';

/** The declared argument's description (spec §1). */
export const STATE_HANDLE_ARGUMENT_WORDS =
  'The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.';

/**
 * The arguments a tool that does not declare `state_handle` receives: those
 * of the call without it, as the schema's strip gave it before the host
 * declared the argument — it routes the call and reaches no handler.
 */
export function withoutStateHandle(args: ToolArgs): ToolArgs {
  if (!('state_handle' in args)) return args;
  const { state_handle: _routed, ...rest } = args;
  return rest;
}

/**
 * `inputSchema` with an optional string `state_handle` added. A schema that
 * already declares `state_handle` (the debugger's) is answered as it is,
 * required where it is required.
 */
export function withStateHandle(inputSchema: z.ZodObject): z.ZodObject {
  return 'state_handle' in inputSchema.shape
    ? inputSchema
    : inputSchema.extend({
        state_handle: z
          .string()
          .optional()
          .describe(STATE_HANDLE_ARGUMENT_WORDS),
      });
}

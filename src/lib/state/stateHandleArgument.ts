/**
 * The `state_handle` argument a host whose instances last one request each
 * (Streamable HTTP) declares on every tool: the pool routes a call by it, and
 * an LLM — which sets no header — can only send what a schema declares.
 * stdio and SSE keep their instance between calls and declare nothing.
 */
import * as z from 'zod';

/** The declared argument's description (spec §1). */
export const STATE_HANDLE_ARGUMENT_WORDS =
  'The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.';

const isZodType = (value: unknown): boolean =>
  !!value &&
  typeof value === 'object' &&
  ('def' in value ||
    '_def' in value ||
    typeof (value as { parse?: unknown }).parse === 'function');

/** The object of a JSON Schema's `properties`, or the zod raw shape itself. */
function fieldsOf(inputSchema: unknown): Record<string, unknown> | undefined {
  if (!inputSchema || typeof inputSchema !== 'object') return undefined;
  const schema = inputSchema as Record<string, unknown>;
  if (schema.type === 'object') {
    return (schema.properties ?? {}) as Record<string, unknown>;
  }
  const values = Object.values(schema);
  return schema.type === undefined &&
    values.length > 0 &&
    values.every(isZodType)
    ? schema
    : undefined;
}

/** Whether the tool's own schema declares `state_handle` (the debugger's). */
export function declaresStateHandle(inputSchema: unknown): boolean {
  const fields = fieldsOf(inputSchema);
  return fields !== undefined && 'state_handle' in fields;
}

/**
 * The arguments a tool that does not declare `state_handle` receives: those
 * of the call without it, as the schema's strip gave it before the host
 * declared the argument — it routes the call and reaches no handler.
 */
export function withoutStateHandle(args: unknown): unknown {
  if (!args || typeof args !== 'object' || !('state_handle' in args)) {
    return args;
  }
  const { state_handle: _routed, ...rest } = args as Record<string, unknown>;
  return rest;
}

/**
 * `inputSchema` with an optional string `state_handle` added — a JSON
 * Schema object's property, or a zod raw shape's field. A schema that
 * already declares `state_handle` (the debugger's) is answered as it is,
 * required where it is required; anything else unknown too.
 */
export function withStateHandle(inputSchema: unknown): unknown {
  const fields = fieldsOf(inputSchema);
  if (fields === undefined || 'state_handle' in fields) return inputSchema;
  const schema = inputSchema as Record<string, unknown>;
  if (schema.type === 'object') {
    return {
      ...schema,
      properties: {
        ...fields,
        state_handle: {
          type: 'string',
          description: STATE_HANDLE_ARGUMENT_WORDS,
        },
      },
    };
  }
  return {
    ...schema,
    state_handle: z.string().optional().describe(STATE_HANDLE_ARGUMENT_WORDS),
  };
}

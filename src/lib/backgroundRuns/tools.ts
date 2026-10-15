/**
 * The tools that may run in the background, and the `background` parameter
 * each declares. A leaf module — no import of the server's — so every
 * handler's definition can read it; the run itself is `run.ts`.
 *
 * The list is exactly the code-running tools whose run may write and run
 * long: `RuntimeRunClass`, `RuntimeRunProgram` and compact's
 * `HandlerProfileRun` (both its modes). A source test keeps every tool's
 * schema equal to it: a listed tool without the parameter, or a tool outside
 * the list with it, fails.
 */

/** The tools that take `background`, with the names of the tools that read and discard their runs. */
export const BACKGROUND_TOOLS: Readonly<
  Record<string, { readonly get: string; readonly discard: string }>
> = {
  RuntimeRunClass: { get: 'GetBackgroundRun', discard: 'DiscardBackgroundRun' },
  RuntimeRunProgram: {
    get: 'GetBackgroundRun',
    discard: 'DiscardBackgroundRun',
  },
  HandlerProfileRun: {
    get: 'HandlerBackgroundRunGet',
    discard: 'HandlerBackgroundRunDiscard',
  },
};

/** Whether `name` takes `background`. */
export function isBackgroundTool(name: string): boolean {
  return Object.hasOwn(BACKGROUND_TOOLS, name);
}

/**
 * A tool definition without the `background` parameter: the same name,
 * description and schema otherwise. The definition passed is not changed.
 * A read-only binary serves the run tools so: it keeps no background
 * run, so the parameter does not exist there. A call carrying it anyway is
 * an ordinary run — the server's object schema drops a key it does not
 * declare before the wrapper reads anything (measured through the binary,
 * `toolSetParity.test.ts`), so nothing refuses it.
 */
export function withoutBackgroundParameter<T extends { inputSchema: unknown }>(
  definition: T,
): T {
  const schema = definition.inputSchema as {
    properties?: Record<string, unknown>;
    required?: readonly string[];
  };
  if (
    schema === null ||
    typeof schema !== 'object' ||
    schema.properties === undefined ||
    !Object.hasOwn(schema.properties, 'background')
  ) {
    return definition;
  }
  const { background: _dropped, ...properties } = schema.properties;
  return {
    ...definition,
    inputSchema: {
      ...schema,
      properties,
      ...(schema.required !== undefined && {
        required: schema.required.filter((name) => name !== 'background'),
      }),
    },
  };
}

/** The `background` property of a full run tool's JSON Schema. */
export const BACKGROUND_PROPERTY = {
  type: 'boolean',
  description:
    'When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.',
} as const;

/** The `background` property of compact's run tool. */
export const COMPACT_BACKGROUND_PROPERTY = {
  type: 'boolean',
  description:
    'When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.',
} as const;

/**
 * The call's `background`: `true` asks for a background run; `undefined` or
 * `false` is an ordinary run; `null` is a value that is not a boolean.
 */
export function readBackground(args: unknown): boolean | null {
  const value = (args as { background?: unknown } | null | undefined)
    ?.background;
  if (value === undefined) return false;
  return typeof value === 'boolean' ? value : null;
}

/** The arguments a run tool's handler receives: `background` is the wrapper's. */
export function withoutBackground<T>(args: T): T {
  if (args === null || typeof args !== 'object' || !('background' in args)) {
    return args;
  }
  const { background: _taken, ...rest } = args as Record<string, unknown>;
  return rest as T;
}

/** The fixed words of a `background` that is not a boolean. */
export const BACKGROUND_INVALID_WORDS = 'background must be true or false.';

/** What a run tool's call runs: its class or program, upper case; `''` when none is named. */
export function backgroundObjectOf(args: unknown): string {
  const named = args as
    | {
        class_name?: unknown;
        program_name?: unknown;
        target_type?: unknown;
      }
    | null
    | undefined;
  const pick =
    named?.target_type === 'PROGRAM'
      ? named.program_name
      : named?.target_type === 'CLASS'
        ? named.class_name
        : (named?.class_name ?? named?.program_name);
  return typeof pick === 'string' ? pick.trim().toUpperCase() : '';
}

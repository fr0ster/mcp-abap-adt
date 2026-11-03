/**
 * The tools that may run in the background, and the `background` parameter
 * each declares. A leaf module — no import of the server's — so every
 * handler's definition can read it; the run itself is `run.ts`.
 *
 * The list is exactly the code-running tools whose run may write and run
 * long: `RuntimeRunClass`, `RuntimeRunProgram` and compact's
 * `HandlerProfileRun`. A source test keeps every tool's
 * schema equal to it: a listed tool without the parameter, or a tool outside
 * the list with it, fails.
 */

import * as z from 'zod';
import type { ToolDefinition } from '../handlers/interfaces.js';
import { child } from '../xml/tree';

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

/** The `background` property of a full run tool's JSON Schema. */
const BACKGROUND_WORDS =
  'When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.';

/** The `background` field of a full run tool's zod input schema. */
export const BACKGROUND_FIELD = z
  .boolean()
  .optional()
  .describe(BACKGROUND_WORDS);

/**
 * `definition` without its `background` parameter, on every variant it
 * states: a run tool as a host with no background-run store hands it out
 * (`HandlerExporter`), so the parameter is not offered at all.
 */
export function withoutBackgroundParameter(
  definition: ToolDefinition,
): ToolDefinition {
  const { variants } = definition;
  return {
    ...definition,
    inputSchema: schemaWithoutBackground(definition.inputSchema),
    ...(variants !== undefined && {
      variants: {
        onprem: {
          ...variants.onprem,
          inputSchema: schemaWithoutBackground(variants.onprem.inputSchema),
        },
        cloud: {
          ...variants.cloud,
          inputSchema: schemaWithoutBackground(variants.cloud.inputSchema),
        },
      },
    }),
  };
}

function schemaWithoutBackground(
  schema: ToolDefinition['inputSchema'],
): ToolDefinition['inputSchema'] {
  return 'background' in schema.shape
    ? schema.omit({ background: true })
    : schema;
}

/** The `background` property of compact's run tool. */
const COMPACT_BACKGROUND_WORDS =
  'When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.';

/** The `background` field of compact's run tool's zod input schema. */
export const COMPACT_BACKGROUND_FIELD = z
  .boolean()
  .optional()
  .describe(COMPACT_BACKGROUND_WORDS);

/**
 * The call's `background`: `true` asks for a background run; `undefined` or
 * `false` is an ordinary run; `null` is a value that is not a boolean.
 */
export function readBackground(args: unknown): boolean | null {
  const value = child(args, 'background');
  if (value === undefined) return false;
  return typeof value === 'boolean' ? value : null;
}

/** The arguments a run tool's handler receives: `background` is the wrapper's. */
export function withoutBackground(
  args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!('background' in args)) return args;
  const { background: _taken, ...rest } = args;
  return rest;
}

/** The fixed words of a `background` that is not a boolean. */
export const BACKGROUND_INVALID_WORDS = 'background must be true or false.';

/** What a run tool's call runs: its class or program, upper case; `''` when none is named. */
export function backgroundObjectOf(args: unknown): string {
  const targetType = child(args, 'target_type');
  const className = child(args, 'class_name');
  const programName = child(args, 'program_name');
  const pick =
    targetType === 'PROGRAM'
      ? programName
      : targetType === 'CLASS'
        ? className
        : (className ?? programName);
  return typeof pick === 'string' ? pick.trim().toUpperCase() : '';
}

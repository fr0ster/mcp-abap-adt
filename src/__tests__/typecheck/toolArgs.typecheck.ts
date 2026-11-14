/**
 * A tool's arguments typed by its zod schema, checked by the compiler with
 * the installed zod and MCP SDK (plan step 4): `npm run test:check` compiles
 * this file. Nothing runs here: it is not a test file, and Jest never loads it.
 *
 * In order:
 * (a) a zod `inputSchema`, whose output is the handler's argument type;
 * (b) `defineTool` answering an entry whose `call(context, args: ToolArgs)`
 *     hides the handler's argument type in a closure, with no cast: the
 *     closure parses with the entry's own schema;
 * (c) registering on `McpServer.registerTool` with a zod schema, the
 *     callback's arguments typed `z.output` — for a schema of a known type;
 *     and the entry, its schema typed `z.ZodObject`, registered through `call`;
 * (d) that output after `.extend` (the state handle) and `.omit`
 *     (`background`, `timeout`).
 *
 * The negative checks are assertions on types: `Assert<…>` takes `true`
 * only, so a wrong usage the types accepted would make this file fail to
 * compile. What does not hold — a generic `defineTool` registering its own
 * schema on the SDK with the callback typed, and the output of a generic
 * schema's `.extend` / `.omit` reaching its handler — cannot be written as
 * compiling code: it is recorded, with the compiler's words, in the plan's
 * step 4 Outcome.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { HandlerContext } from '../../lib/handlers/interfaces';

/** Accepts `true` only. */
type Assert<T extends true> = T;
/** `true` when each of `A` and `B` is assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** `true` when `T` is `any`. */
type IsAny<T> = 0 extends 1 & T ? true : false;
type Not<T extends boolean> = T extends true ? false : true;
/** `true` when `Value` is assignable to `Target`. */
type Accepts<Target, Value> = [Value] extends [Target] ? true : false;

// (a) A zod inputSchema: its output is the argument type.

const GET_CLASS_SCHEMA = z.object({
  class_name: z.string().describe('Class name.'),
  part: z.enum(['source', 'metadata']).optional().describe('What to read.'),
  version: z.enum(['active', 'inactive', 'workingArea']).optional(),
});

type GetClassArgs = z.output<typeof GET_CLASS_SCHEMA>;

export type SchemaOutputIsTheArguments = Assert<
  Same<
    GetClassArgs,
    {
      class_name: string;
      part?: 'source' | 'metadata' | undefined;
      version?: 'active' | 'inactive' | 'workingArea' | undefined;
    }
  >
>;
export type SchemaOutputIsNotAny = Assert<Not<IsAny<GetClassArgs>>>;
// Negative: a wrong type for a declared argument is not the output.
export type WrongArgumentTypeIsNotTheOutput = Assert<
  Not<Same<GetClassArgs, { class_name: number }>>
>;

// (b) defineTool: the entry's call hides the handler's argument type.

/** The arguments as the model sends them, before any check. */
type ToolArgs = Readonly<Record<string, unknown>>;

interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: S;
}

interface HandlerEntry {
  readonly toolDefinition: ToolDefinition;
  call(context: HandlerContext, args: ToolArgs): Promise<CallToolResult>;
}

const refusal = (text: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text }],
});

function defineTool<S extends z.ZodObject>(
  definition: ToolDefinition<S>,
  handler: (
    context: HandlerContext,
    args: z.output<S>,
  ) => Promise<CallToolResult>,
): HandlerEntry {
  return {
    toolDefinition: definition,
    call: async (context, args) => {
      const parsed = definition.inputSchema.safeParse(args);
      return parsed.success
        ? handler(context, parsed.data)
        : refusal(parsed.error.message);
    },
  };
}

async function handleGetClass(
  _context: HandlerContext,
  args: GetClassArgs,
): Promise<CallToolResult> {
  return { content: [{ type: 'text', text: args.class_name }] };
}

const GET_PACKAGE_SCHEMA = z.object({
  package_name: z.string(),
  max_results: z.number().int().optional(),
});

async function handleGetPackage(
  _context: HandlerContext,
  args: z.output<typeof GET_PACKAGE_SCHEMA>,
): Promise<CallToolResult> {
  return {
    content: [
      { type: 'text', text: `${args.package_name} ${args.max_results}` },
    ],
  };
}

/** Handlers of different argument types in one registry, no cast. */
export const REGISTRY: readonly HandlerEntry[] = [
  defineTool(
    {
      name: 'GetClass',
      description: 'Reads a class.',
      inputSchema: GET_CLASS_SCHEMA,
    },
    handleGetClass,
  ),
  defineTool(
    {
      name: 'GetPackage',
      description: 'Reads a package.',
      inputSchema: GET_PACKAGE_SCHEMA,
    },
    handleGetPackage,
  ),
];

/** The handler `defineTool` takes for the schema `S`. */
type HandlerFor<S extends z.ZodObject> = Parameters<typeof defineTool<S>>[1];

export type TheHandlerOfItsSchemaIsTaken = Assert<
  Accepts<HandlerFor<typeof GET_CLASS_SCHEMA>, typeof handleGetClass>
>;
// Negative: a handler of another schema's arguments is refused.
export type AnotherSchemasHandlerIsRefused = Assert<
  Not<Accepts<HandlerFor<typeof GET_CLASS_SCHEMA>, typeof handleGetPackage>>
>;
// Negative: a handler taking a declared argument at a wrong type is refused.
export type AWrongArgumentTypeIsRefused = Assert<
  Not<
    Accepts<
      HandlerFor<typeof GET_CLASS_SCHEMA>,
      (
        context: HandlerContext,
        args: { class_name: number },
      ) => Promise<CallToolResult>
    >
  >
>;

// (c) Registering on the SDK with a zod schema.

/** A schema of a known type: the SDK's callback gets its output, typed. */
export function registerGetClass(
  server: McpServer,
  context: HandlerContext,
): void {
  server.registerTool(
    'GetClass',
    { description: 'Reads a class.', inputSchema: GET_CLASS_SCHEMA },
    async (args) => {
      const typed: Assert<Same<typeof args, GetClassArgs>> = true;
      const notAny: Assert<Not<IsAny<typeof args>>> = true;
      return typed && notAny ? handleGetClass(context, args) : refusal('');
    },
  );
}

/**
 * The entry, its schema typed `z.ZodObject`: the SDK's callback gets a
 * record of unknown values, which `call` parses with the entry's own schema.
 */
export function registerEntry(
  server: McpServer,
  context: HandlerContext,
  entry: HandlerEntry,
): void {
  const listed: z.ZodObject = entry.toolDefinition.inputSchema;
  server.registerTool(
    entry.toolDefinition.name,
    { description: entry.toolDefinition.description, inputSchema: listed },
    async (args) => {
      const record: Assert<Accepts<ToolArgs, typeof args>> = true;
      const notAny: Assert<Not<IsAny<typeof args>>> = true;
      return record && notAny ? entry.call(context, args) : refusal('');
    },
  );
}

// (d) The output after .extend (state handle) and .omit (background, timeout).

const RUN_SCHEMA = z.object({
  class_name: z.string(),
  background: z.boolean().optional(),
  timeout: z.number().optional(),
});

const WITH_STATE_HANDLE = RUN_SCHEMA.extend({
  state_handle: z.string().optional(),
});
const WITHOUT_BACKGROUND = RUN_SCHEMA.omit({ background: true, timeout: true });
const LISTED_ON_HTTP = WITHOUT_BACKGROUND.extend({
  state_handle: z.string().optional(),
});

export type ExtendAddsTheStateHandle = Assert<
  Same<
    z.output<typeof WITH_STATE_HANDLE>,
    z.output<typeof RUN_SCHEMA> & { state_handle?: string | undefined }
  >
>;
export type OmitDropsBackgroundAndTimeout = Assert<
  Same<z.output<typeof WITHOUT_BACKGROUND>, { class_name: string }>
>;
// Negative: the omitted keys are not in the output.
export type OmittedKeysAreGone = Assert<
  Not<Accepts<keyof z.output<typeof WITHOUT_BACKGROUND>, 'background'>>
>;

async function handleRun(
  _context: HandlerContext,
  args: z.output<typeof RUN_SCHEMA>,
): Promise<CallToolResult> {
  return { content: [{ type: 'text', text: args.class_name }] };
}

/** The edited schemas' output reaches the handler, typed, for a known schema. */
export function registerRun(server: McpServer, context: HandlerContext): void {
  server.registerTool(
    'RunWithHandle',
    { inputSchema: WITH_STATE_HANDLE },
    async (args) => {
      const { state_handle: _routed, ...rest } = args;
      return handleRun(context, rest);
    },
  );
  server.registerTool(
    'RunExported',
    { inputSchema: WITHOUT_BACKGROUND },
    async (args) => handleRun(context, args),
  );
  server.registerTool(
    'RunOnHttp',
    { inputSchema: LISTED_ON_HTTP },
    async (args) => {
      const { state_handle: _routed, ...rest } = args;
      return handleRun(context, rest);
    },
  );
}

/** The edits on a schema typed `z.ZodObject`, as the erased entry holds it. */
export function listedSchemas(schema: z.ZodObject): readonly z.ZodObject[] {
  return [
    schema.extend({ state_handle: z.string().optional() }),
    schema.omit({ background: true, timeout: true }),
  ];
}

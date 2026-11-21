/**
 * What a prompt reads of a listed tool: the tool as the server lists it on its
 * kind, its members there, its properties and its required arguments.
 */
import * as z from 'zod';
import type { SapEnvironment, ToolDefinition } from '../handlers/interfaces.js';
import { listedTool } from '../listedTool.js';
import { withStateHandle } from '../state/stateHandleArgument.js';
import type { AbapSystemKind } from '../systemKind.js';
import type {
  ArgumentValue,
  ListedPromptTool,
  PromptSource,
  PromptStep,
  RequiredArgument,
} from './types.js';

/**
 * `definition` as the server lists it on `kind` (`listedTool`), with
 * `state_handle` declared when `stateHandle`: `undefined` when the kind does
 * not list it. `definition` is the one `listedTool` is given — for a long
 * tool answered in the call, `longToolInTheCall`'s.
 */
export function listedPromptTool(
  definition: ToolDefinition,
  kind: AbapSystemKind | undefined,
  stateHandle: boolean,
): ListedPromptTool | undefined {
  const listed = listedTool(definition, kind);
  if (!listed.listed) return undefined;
  return {
    definition,
    inputSchema: stateHandle
      ? withStateHandle(listed.inputSchema)
      : listed.inputSchema,
  };
}

/**
 * The kind the prompts read for a listing on `environment`: the stated kind,
 * or none stated (the on-premise statement, as tools are listed then);
 * `undefined` for `legacy`, where no prompt is listed.
 */
export function promptKindOf(
  environment: SapEnvironment | undefined,
): { readonly kind: AbapSystemKind | undefined } | undefined {
  switch (environment) {
    case 'onprem':
    case 'cloud':
    case undefined:
      return { kind: environment };
    case 'legacy':
      return undefined;
  }
}

/** The prompts' source: the listed tools by name, the kind and the `state_handle` declaration. */
export function promptSourceOf(
  kind: AbapSystemKind | undefined,
  stateHandle: boolean,
  tools: Iterable<ListedPromptTool>,
): PromptSource {
  const byName = new Map<string, ListedPromptTool>();
  for (const tool of tools) byName.set(tool.definition.name, tool);
  return { kind, stateHandle, tools: byName };
}

/**
 * The members `tool` offers on `kind` — its variant's, the on-premise one's
 * when no kind is stated (the statement a listing with no kind serves).
 * `undefined` for a tool that states none.
 */
export function membersOn(
  tool: ListedPromptTool,
  kind: AbapSystemKind | undefined,
): readonly string[] | undefined {
  return tool.definition.variants?.[kind ?? 'onprem'].members;
}

/** Whether the listed schema of `tool` has the property `key`. */
export function hasProperty(tool: ListedPromptTool, key: string): boolean {
  return Object.hasOwn(tool.inputSchema.shape, key);
}

/**
 * The arguments a caller of `tool` must send, each with its listed
 * description: the listed schema's input side, so a defaulted argument is
 * left out.
 */
export function requiredArguments(
  tool: ListedPromptTool,
): readonly RequiredArgument[] {
  const json = z.toJSONSchema(tool.inputSchema, {
    target: 'draft-7',
    io: 'input',
  });
  const properties = json.properties ?? {};
  return (json.required ?? []).map((name) => {
    const property = properties[name];
    return {
      name,
      description:
        typeof property === 'object' ? property.description : undefined,
    };
  });
}

/** A property of a listed schema as a caller reads it: its description and the values its enum lists. */
export interface ListedProperty {
  readonly description: string | undefined;
  /** The string values of its enum; empty when it lists none. */
  readonly values: readonly string[];
}

/** The property `key` of `tool`'s listed schema, read on its input side; `undefined` when it has none. */
export function listedProperty(
  tool: ListedPromptTool,
  key: string,
): ListedProperty | undefined {
  const property = z.toJSONSchema(tool.inputSchema, {
    target: 'draft-7',
    io: 'input',
  }).properties?.[key];
  if (typeof property !== 'object') return undefined;
  return {
    description: property.description,
    values: (property.enum ?? []).filter((value) => typeof value === 'string'),
  };
}

/** Optional parts of a step: everything but its tool, arguments and what is still to fill. */
export type StepWords = Omit<PromptStep, 'tool' | 'arguments' | 'stillToFill'>;

/** The prompt arguments the values of `args` wait for, each once, in order. */
function awaited(
  args: readonly (readonly [string, ArgumentValue])[],
): readonly RequiredArgument[] {
  const awaits = new Map<string, RequiredArgument>();
  for (const [, value] of args) {
    if (value.from === 'model' && value.awaits !== undefined) {
      awaits.set(value.awaits.name, value.awaits);
    }
  }
  return [...awaits.values()];
}

/**
 * A step calling `tool` with `args`; its still-to-fill list is the tool's
 * required arguments `args` sets none of, then the prompt arguments its
 * values wait for.
 */
export function toolStep(
  tool: ListedPromptTool,
  args: readonly (readonly [string, ArgumentValue])[],
  words: StepWords = {},
): PromptStep {
  const set = new Set(args.map(([name]) => name));
  return {
    ...words,
    tool: tool.definition.name,
    arguments: args,
    stillToFill: [
      ...requiredArguments(tool).filter(({ name }) => !set.has(name)),
      ...awaited(args),
    ],
  };
}

/**
 * A step calling a long tool: `background: false` is passed exactly when its
 * listed schema has `background`, so the call answers the content itself; a
 * tool listed without it answers in the call already.
 */
export function longToolStep(
  tool: ListedPromptTool,
  args: readonly (readonly [string, ArgumentValue])[],
  words: StepWords = {},
): PromptStep {
  return toolStep(
    tool,
    hasProperty(tool, 'background')
      ? [...args, ['background', { from: 'user', value: false }]]
      : args,
    words,
  );
}

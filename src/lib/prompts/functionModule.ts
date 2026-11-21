/**
 * An object as a prompt names it: its name, and for a function module its
 * function group. Each step names a function module in the form its own tool
 * takes: `function_module_name` beside `function_group_name` where the tool
 * has both, else `GROUP|MODULE` built from the two values.
 */
import * as z from 'zod';
import { jsonLiteral } from './instruction.js';
import { requiredArgument } from './served.js';
import { hasProperty } from './source.js';
import type {
  ArgumentValue,
  ListedPromptTool,
  PromptArgumentsSchema,
  RequiredArgument,
} from './types.js';

/** An object's name as the prompt was given it; `group` is a function module's function group. */
export interface ObjectName {
  readonly name: string;
  readonly group: string | undefined;
}

export const FUNCTION_GROUP_WORDS =
  'The function group the function module belongs to.';

/** The prompt argument a step without the function group waits for. */
const FUNCTION_GROUP: RequiredArgument = {
  name: 'function_group',
  description: FUNCTION_GROUP_WORDS,
};

/** The `function_group` argument, for a prompt whose served types include a function module. */
export function functionGroupArgument(
  served: readonly string[],
): PromptArgumentsSchema {
  return served.some((type) => type.toUpperCase() === 'FUNCTION_MODULE')
    ? {
        function_group: z.string().optional().describe(FUNCTION_GROUP_WORDS),
      }
    : {};
}

/** The name `name` with the function group `args` give, when they give one. */
export function objectNameOf(
  name: string,
  args: Readonly<Record<string, string | undefined>>,
): ObjectName {
  return { name, group: requiredArgument(args, 'function_group') };
}

/** The function group as a step sends it: the user's, else what the model fills in. */
function groupValue(group: string | undefined): ArgumentValue {
  return group === undefined
    ? { from: 'model', writes: 'the function group', awaits: FUNCTION_GROUP }
    : { from: 'user', value: group };
}

/** `GROUP|MODULE`, built from the two values. */
function groupedValue(named: ObjectName): ArgumentValue {
  return named.group === undefined
    ? {
        from: 'model',
        writes: `the function group, "|" and ${jsonLiteral(named.name)}`,
        awaits: FUNCTION_GROUP,
      }
    : { from: 'user', value: `${named.group}|${named.name}` };
}

/**
 * The arguments naming `named`, of `type`, in `key` of `tool`: the name
 * itself; for a function module, `function_module_name` with
 * `function_group_name` where the tool has both, else `GROUP|MODULE`.
 */
export function nameArguments(
  tool: ListedPromptTool,
  type: string,
  key: string,
  named: ObjectName,
): readonly (readonly [string, ArgumentValue])[] {
  if (type !== 'FUNCTION_MODULE') {
    return [[key, { from: 'user', value: named.name }]];
  }
  if (
    key === 'function_module_name' &&
    hasProperty(tool, 'function_group_name')
  ) {
    return [
      [key, { from: 'user', value: named.name }],
      ['function_group_name', groupValue(named.group)],
    ];
  }
  return [[key, groupedValue(named)]];
}

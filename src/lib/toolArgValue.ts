/**
 * Reading tool-argument input (`ToolArgValue`): a value read out of a tool's
 * arguments and not yet checked. Each predicate checks what it claims; a
 * nested object read so is `ToolArgs` again, a list's element a
 * `ToolArgValue`.
 */
import type { ToolArgs, ToolArgValue } from './handlers/interfaces';

/** Whether `value` is an object of the arguments: non-null, not an array. */
export function isArgObject(value: ToolArgValue): value is ToolArgs {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `value` is a list of the arguments. */
export function isArgList(
  value: ToolArgValue,
): value is readonly ToolArgValue[] {
  return Array.isArray(value);
}

/** The member `name` of `value` when it is an object, else `undefined`. */
export function argMember(value: ToolArgValue, name: string): ToolArgValue {
  return isArgObject(value) ? value[name] : undefined;
}

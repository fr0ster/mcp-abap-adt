/** A compact abapGit action run as its full tool: the tool's own entry, the call's context. */

import type {
  HandlerContext,
  HandlerEntry,
  ToolArgs,
} from '../../handlers/interfaces';

/** The answer of `tool`'s entry among `entries` for `args`, in `context`. */
export async function runFullTool(
  entries: readonly HandlerEntry[],
  tool: string,
  context: HandlerContext,
  args: ToolArgs,
) {
  const entry = entries.find((each) => each.toolDefinition.name === tool);
  if (entry === undefined) {
    throw new Error(`the compact abapGit action has no tool ${tool}`);
  }
  return entry.call(context, args);
}

/**
 * `HandlerAbapGit`: the abapGit writes in the compact set, one `action` per
 * full write. The action's arguments are handed to that full tool's entry as
 * they came, in the call's context — the same admission, the same request,
 * the same answer; a refusal of its arguments names that tool.
 */

import type * as z from 'zod';
import { abapGitWriteEntries } from '../../handlers/groups/AbapGitHandlersGroup';
import type { HandlerContext } from '../../handlers/interfaces';
import { ABAPGIT_ACTION_TOOLS, handlerAbapGitDefinition } from './definitions';
import { runFullTool } from './runFullTool';

export const TOOL_DEFINITION = {
  name: 'HandlerAbapGit',
  ...handlerAbapGitDefinition(),
} as const;

export async function handleHandlerAbapGit(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { action, ...rest } = args;
  return runFullTool(
    abapGitWriteEntries(),
    ABAPGIT_ACTION_TOOLS[action],
    context,
    rest,
  );
}

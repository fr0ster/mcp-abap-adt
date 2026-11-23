/**
 * `HandlerAbapGitGet`: the abapGit reads in the compact sets, one `action`
 * per full read. The action's arguments are handed to that full tool's entry
 * as they came, in the call's context — the same admission, the same request,
 * the same answer; a refusal of its arguments names that tool.
 */

import type * as z from 'zod';
import { abapGitReadEntries } from '../../handlers/groups/AbapGitHandlersGroup';
import type { HandlerContext } from '../../handlers/interfaces';
import {
  ABAPGIT_ACTION_TOOLS,
  handlerAbapGitGetDefinition,
} from './definitions';
import { runFullTool } from './runFullTool';

export const TOOL_DEFINITION = {
  name: 'HandlerAbapGitGet',
  ...handlerAbapGitGetDefinition(),
} as const;

export async function handleHandlerAbapGitGet(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { action, ...rest } = args;
  return runFullTool(
    abapGitReadEntries(),
    ABAPGIT_ACTION_TOOLS[action],
    context,
    rest,
  );
}

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListDumps } from '../../system/readonly/handleRuntimeListDumps';
import { compactDumpListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpList',
  description: 'Compact runtime dump list. Returns runtime dumps with filters.',
  inputSchema: compactDumpListSchema,
} as const;

type HandlerDumpListArgs = {
  user?: string;
  inlinecount?: 'allpages' | 'none';
  top?: number;
  skip?: number;
  orderby?: string;
};

export async function handleHandlerDumpList(
  context: HandlerContext,
  args: HandlerDumpListArgs,
) {
  return handleRuntimeListDumps(context, args);
}


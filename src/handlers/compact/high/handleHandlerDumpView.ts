import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeGetDumpById } from '../../system/readonly/handleRuntimeGetDumpById';
import { compactDumpViewSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpView',
  description: 'Compact runtime dump view. Reads one dump by dump_id.',
  inputSchema: compactDumpViewSchema,
} as const;

type HandlerDumpViewArgs = {
  dump_id: string;
  view?: 'default' | 'summary' | 'formatted';
};

export async function handleHandlerDumpView(
  context: HandlerContext,
  args: HandlerDumpViewArgs,
) {
  return handleRuntimeGetDumpById(context, args);
}


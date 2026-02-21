import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeGetDumpById } from '../../system/readonly/handleRuntimeGetDumpById';
import { compactDumpViewSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpView',
  description:
    'Runtime dump view. object_type: not used. Required: dump_id*. Optional: view(default|summary|formatted). Response: JSON.',
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

import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugSetSettings.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseSettings } from '../../../lib/debugger/readings';
import {
  SETTINGS_FIELDS,
  STATE_HANDLE_PROPERTY,
  settingsFromArgs,
} from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetSettings',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Changes the debugger settings at the current stop and answers the settings in force; a field left out keeps its value. The debug session applies them again after each later attach.',
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    ...SETTINGS_FIELDS,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugSetSettings(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.setSettings(
        settingsFromArgs(args),
      ),
    terseSettings,
  );
}

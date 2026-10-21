// src/handlers/debugger/debug/handleDebugSetSettings.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseSettings } from '../../../lib/debugger/readings';
import {
  SETTINGS_FIELDS,
  STATE_HANDLE_PROPERTY,
  settingsFromArgs,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetSettings',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] Changes the debugger settings at the current stop and answers the settings in force; a field left out keeps its value. The debug session applies them again after each later attach.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...SETTINGS_FIELDS,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugSetSettings(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
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

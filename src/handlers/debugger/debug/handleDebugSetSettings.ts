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
import { purpose, toolDescription } from '../../../lib/description';
import { SETTINGS } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetSettings',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Changes the debugger settings of an ABAP debug session at its current stop, applied again after each later attach.',
      ),
      result: SETTINGS,
    }),
  ),
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

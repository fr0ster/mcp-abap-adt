import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugGetMemorySizes.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  readMemorySizes,
  readXmlDocument,
  terseMemorySizes,
} from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetMemorySizes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] Memory the stopped debuggee uses. Needs a stopped debuggee.',
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleDebugGetMemorySizes(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => requireDebugger(context, args, 'use').abap.getMemorySizes(),
    (xml) => terseMemorySizes(readMemorySizes(xml)),
    readXmlDocument,
  );
}

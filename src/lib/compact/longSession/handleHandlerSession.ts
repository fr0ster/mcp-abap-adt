import * as z from 'zod';
/**
 * `HandlerSession`: the long session in the compact sets, one tool whose
 * `action` names what it does — `open`, as the full set's `SessionOpen`;
 * `close`, as its `SessionClose`.
 * Works on no connection of the instance.
 */
import type { HandlerContext } from '../../handlers/index';
import {
  CLOSE_SESSION_WORDS,
  closeLongSession,
  OPEN_SESSION_WORDS,
  openLongSession,
} from '../../longSession/tools';

export const TOOL_DEFINITION = {
  name: 'HandlerSession',
  description: `[read-only] action 'open': ${OPEN_SESSION_WORDS} action 'close': ${CLOSE_SESSION_WORDS}`,
  inputSchema: z.object({
    action: z
      .enum(['open', 'close'])
      .describe(
        'open: open a long session and answer its state_handle. close: close the long session the state_handle names.',
      ),
  }),
} as const;

type SessionArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerSession(
  context: HandlerContext,
  args: SessionArgs,
) {
  return args.action === 'close'
    ? closeLongSession(context)
    : openLongSession(context);
}

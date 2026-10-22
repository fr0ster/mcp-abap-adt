/**
 * `HandlerSession`: the long session in the compact sets, one tool whose
 * `action` names what it does — `open`, as the full set's `SessionOpen`.
 * Works on no connection of the instance.
 */
import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { OPEN_SESSION_WORDS, openLongSession } from '../../longSession/tools';

export const TOOL_DEFINITION = {
  name: 'HandlerSession',
  description: `[read-only] action 'open': ${OPEN_SESSION_WORDS}`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['open'],
        description: 'open: open a long session and answer its state_handle.',
      },
    },
    required: ['action'],
  },
} as const;

type SessionArgs = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerSession(
  context: HandlerContext,
  _args: SessionArgs,
) {
  return openLongSession(context);
}

import * as z from 'zod';
/**
 * `HandlerSession`: the long session in the compact sets, one tool whose
 * `action` names what it does — `open`, as the full set's `SessionOpen`;
 * `close`, as its `SessionClose`.
 * Works on no connection of the instance.
 */
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import {
  CLOSE_SESSION_WORDS,
  closeLongSession,
  OPEN_SESSION_WORDS,
  openLongSession,
} from '../../longSession/tools';
import { textsOf } from '../memberTexts';

/** `HandlerSession`'s actions. */
export const SESSION_ACTIONS = ['open', 'close'] as const;
type SessionAction = (typeof SESSION_ACTIONS)[number];

const ACTION_SENTENCES: ReadonlyArray<readonly [SessionAction, string]> = [
  ['open', `action 'open': ${OPEN_SESSION_WORDS}`],
  ['close', `action 'close': ${CLOSE_SESSION_WORDS}`],
];

const ACTION_WORDS: ReadonlyArray<readonly [SessionAction, string]> = [
  ['open', 'open: open a long session and answer its state_handle.'],
  ['close', 'close: close the long session the state_handle names.'],
];

/** `HandlerSession`'s description and schema with `actions`. */
export function handlerSessionDefinition(actions: readonly SessionAction[]) {
  return {
    description: `[read-only] ${textsOf(actions, ACTION_SENTENCES).join(' ')}`,
    inputSchema: z.object({
      action: listedValues(actions).describe(
        textsOf(actions, ACTION_WORDS).join(' '),
      ),
    }),
  };
}

export const TOOL_DEFINITION = {
  name: 'HandlerSession',
  ...handlerSessionDefinition(SESSION_ACTIONS),
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

import * as z from 'zod';
import {
  type DescriptionParts,
  pairsPurpose,
  toolDescription,
} from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { closeLongSession, openLongSession } from '../../longSession/tools';
import { textsOf } from '../memberTexts';

/** `HandlerSession`'s actions. */
export const SESSION_ACTIONS = ['open', 'close'] as const;
type SessionAction = (typeof SESSION_ACTIONS)[number];

/** Each action as an action and object pair (owner). */
const PAIRS: { readonly [K in SessionAction]: string } = {
  open: 'opens a long session on this server',
  close: 'closes a long session',
};

/** `HandlerSession`'s parts with `actions`: each action by its function. */
export function handlerSessionParts(
  actions: readonly SessionAction[],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: pairsPurpose(actions.map((action) => PAIRS[action])),
  };
}

const ACTION_WORDS: ReadonlyArray<readonly [SessionAction, string]> = [
  ['open', 'open: open a long session and answer its state_handle.'],
  ['close', 'close: close the long session the state_handle names.'],
];

/** `HandlerSession`'s description and schema with `actions`. */
export function handlerSessionDefinition(actions: readonly SessionAction[]) {
  return {
    description: toolDescription(handlerSessionParts(actions)),
    inputSchema: z.object({
      action: listedValues(actions).describe(
        textsOf(actions, ACTION_WORDS).join(' '),
      ),
    }),
  };
}

export const TOOL_DEFINITION = {
  name: 'HandlerSession',
  description: toolDescription(handlerSessionParts(SESSION_ACTIONS)),
  inputSchema: handlerSessionDefinition(SESSION_ACTIONS).inputSchema,
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

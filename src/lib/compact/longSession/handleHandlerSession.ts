import * as z from 'zod';
/**
 * `HandlerSession`: the long session in the compact sets, one tool whose
 * `action` names what it does — `open`, as the full set's `SessionOpen`;
 * `close`, as its `SessionClose`.
 * Works on no connection of the instance.
 */
import { TOOL_DEFINITION as SessionClose } from '../../../handlers/long_session/session/handleSessionClose';
import { TOOL_DEFINITION as SessionOpen } from '../../../handlers/long_session/session/handleSessionOpen';
import {
  type DescriptionParts,
  purpose,
  toolDescription,
  valueFrom,
} from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { closeLongSession, openLongSession } from '../../longSession/tools';
import { textsOf } from '../memberTexts';

/** `HandlerSession`'s actions. */
export const SESSION_ACTIONS = ['open', 'close'] as const;
type SessionAction = (typeof SESSION_ACTIONS)[number];

/** What each action does: the full set's tool of its meaning. */
const ACTION_VALUES = {
  open: valueFrom('open', SessionOpen.description),
  close: valueFrom('close', SessionClose.description),
} as const;

/** `HandlerSession`'s parts with `actions`: each action by its function. */
export function handlerSessionParts(
  actions: readonly SessionAction[],
): DescriptionParts {
  const verbs = actions.map((action) =>
    action === 'open' ? 'opens' : 'closes',
  );
  const verb = verbs.join(' or ');
  return {
    tag: 'read-only',
    purpose: purpose(
      `${verb.charAt(0).toUpperCase()}${verb.slice(1)} a long session on this server, which keeps its server instance and SAP connection between calls.`,
    ),
    values: {
      of: 'action',
      each: actions.map((action) => ACTION_VALUES[action]),
    },
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

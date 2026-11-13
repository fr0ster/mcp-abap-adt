/**
 * The two leftover-session tools' answers, shared by the full and the
 * compact names: the instance's port does the work; this turns its outcome
 * into the tool's answer. No answer carries a cookie.
 */

import type { HandlerContext } from '../../handlers/interfaces';
import type { IAnswerSerializer } from '../answerSerializer';
import { ServerRefusal } from '../auth/serverRefusal';
import type { LeftoverSessionTools } from './port';

export interface LeftoverAnswer {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

/** A value as a leftover-session answer's JSON text. */
const answers: IAnswerSerializer<LeftoverAnswer> = {
  json(payload: unknown, isError = false): LeftoverAnswer {
    return {
      isError,
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  },
};

function portOf(context: HandlerContext): LeftoverSessionTools {
  const port = context.leftoverSessions;
  if (port === undefined) {
    throw new ServerRefusal('leftover_sessions_unavailable');
  }
  return port;
}

export async function answerLeftoverList(
  context: HandlerContext,
): Promise<LeftoverAnswer> {
  const sessions = await portOf(context).list();
  return answers.json({ sessions });
}

export async function answerLeftoverLogoff(
  context: HandlerContext,
  handle: string,
): Promise<LeftoverAnswer> {
  return answers.json(await portOf(context).logoff(handle));
}

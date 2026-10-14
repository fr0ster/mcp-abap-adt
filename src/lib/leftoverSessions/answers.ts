/**
 * The three leftover-session tools' answers, shared by the full and the
 * compact names: the instance's port does the work; this turns its outcome
 * into the tool's answer. No answer carries a cookie.
 */

import type { HandlerContext } from '../../handlers/interfaces';
import { ServerRefusal } from '../auth/serverRefusal';
import type { LeftoverSessionTools } from './port';

export interface LeftoverAnswer {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

const json = (payload: unknown, isError = false): LeftoverAnswer => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

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
  return json({ sessions });
}

export async function answerLeftoverResume(
  context: HandlerContext,
  handle: string,
): Promise<LeftoverAnswer> {
  return json(await portOf(context).resume(handle));
}

export async function answerLeftoverLogoff(
  context: HandlerContext,
  handle: string,
): Promise<LeftoverAnswer> {
  return json(await portOf(context).logoff(handle));
}

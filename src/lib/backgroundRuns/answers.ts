/**
 * The background-run answers, shared by the full and the compact names: the
 * start's, and the three tools' — the instance's port does the work; this
 * turns its outcome into the tool's answer.
 */

import type { HandlerContext } from '../../handlers/interfaces';
import { ServerRefusal } from '../auth/serverRefusal';
import type { BackgroundRunTools } from './port';
import type { StartedBackgroundRun } from './run';
import { BACKGROUND_TOOLS } from './tools';

export interface BackgroundAnswer {
  isError?: true;
  content: Array<{ type: 'text'; text: string }>;
}

const json = (payload: unknown): BackgroundAnswer => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

function portOf(context: HandlerContext): BackgroundRunTools {
  const port = context.backgroundRuns;
  if (port === undefined) {
    throw new ServerRefusal('background_runs_unavailable');
  }
  return port;
}

/** What a start answers at once: the handle, and where to read the run's answer. */
export function answerBackgroundStarted(
  started: StartedBackgroundRun,
): BackgroundAnswer {
  const names = BACKGROUND_TOOLS[started.tool] ?? {
    get: 'GetBackgroundRun',
    discard: 'DiscardBackgroundRun',
  };
  return json({
    run_handle: started.run_handle,
    state: 'running',
    tool: started.tool,
    object: started.object,
    started_at: started.started_at,
    message: `Started in the background on an ABAP session of its own; it runs until SAP answers and cannot be stopped. Read its answer with ${names.get} (run_handle); it is kept until you remove it with ${names.discard}.`,
  });
}

/**
 * A run as read: `running`, or `finished` — its header, then what the run
 * tool answered, as it answered it (`isError` included).
 */
export async function answerBackgroundGet(
  context: HandlerContext,
  handle: unknown,
): Promise<BackgroundAnswer> {
  const record = await portOf(context).get(handle);
  if (record.state === 'running') {
    return json({
      run_handle: record.run_handle,
      state: 'running',
      tool: record.tool,
      object: record.object,
      started_at: record.started_at,
    });
  }
  const header = json({
    run_handle: record.run_handle,
    state: 'finished',
    tool: record.tool,
    object: record.object,
    started_at: record.started_at,
    finished_at: record.finished_at,
  });
  return {
    ...(record.answer.isError === true ? { isError: true as const } : {}),
    content: [...header.content, ...record.answer.content],
  };
}

export async function answerBackgroundList(
  context: HandlerContext,
): Promise<BackgroundAnswer> {
  return json({ runs: await portOf(context).list() });
}

export async function answerBackgroundDiscard(
  context: HandlerContext,
  handle: unknown,
): Promise<BackgroundAnswer> {
  return json(await portOf(context).discard(handle));
}

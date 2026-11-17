/**
 * `HandlerSystem`'s background runs, read as the live cases read them: a
 * call without `background` starts a run on a session of its own and
 * answers its `run_handle` at once; the run's answer is read once with
 * `HandlerBackgroundRunGet`, after the in-process server's store has kept
 * it (`backgroundRunsEnded`: waited for on the store, never polled).
 *
 * Use it inside a `throughServer` describe: the server dispatches the long
 * tool, and its store is the one waited on.
 */
import assert from 'node:assert/strict';
import {
  backgroundRunsEnded,
  type LiveAnswer,
  livePrepare,
} from '../helpers/live';
import { member, succeeded } from './ownObjects';

/** The JSON of an answer's `at`-th content item. */
function itemOf(answer: LiveAnswer, at: number): unknown {
  const item = answer.content[at];
  if (item === undefined) {
    throw new Error(`the answer has no item ${at}: ${answer.text}`);
  }
  return JSON.parse(item.text);
}

/** The run a call without `background` started: running, `HandlerSystem`'s, its handle. */
export function startedRun(answer: LiveAnswer): string {
  const started = itemOf(succeeded('HandlerSystem (background)', answer), 0);
  assert.equal(member(started, 'state'), 'running');
  assert.equal(member(started, 'tool'), 'HandlerSystem');
  const handle = member(started, 'run_handle');
  if (typeof handle !== 'string' || handle === '') {
    throw new Error(`HandlerSystem answered no run_handle: ${answer.text}`);
  }
  return handle;
}

/**
 * The run `handle`'s answer, once it ended: read with
 * `HandlerBackgroundRunGet`, its header `finished` and `HandlerSystem`'s,
 * then the action's answer as it answered it; a second read answers "not
 * available" (a finished run is answered once).
 */
export async function finishedRun(handle: string): Promise<LiveAnswer> {
  await backgroundRunsEnded();
  const read = await livePrepare('HandlerBackgroundRunGet', {
    run_handle: handle,
  });
  const header = itemOf(read, 0);
  assert.equal(member(header, 'state'), 'finished');
  assert.equal(member(header, 'run_handle'), handle);
  assert.equal(member(header, 'tool'), 'HandlerSystem');
  const content = read.content.slice(1);
  const again = await livePrepare('HandlerBackgroundRunGet', {
    run_handle: handle,
  });
  assert.equal(again.isError, true);
  assert.equal(
    member(itemOf(again, 0), 'error'),
    'background_run_not_available',
  );
  return {
    isError: read.isError,
    content,
    text: content.map((item) => item.text).join('\n'),
  };
}

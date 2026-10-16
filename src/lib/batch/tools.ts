/**
 * What the batch tools do, shared by the full sets' `BatchBegin`,
 * `BatchEnd`, `BatchAnswers` and the compact sets' `HandlerBatch`: each
 * reaches the instance's owner through its call's context (`batch`), and
 * without one answers `batch_mode_unavailable`.
 *
 * - begin: opens a communication batch over a late-bound target (nothing
 *   is sent, no connection taken) and answers the instance's state handle,
 *   which the client sends in the `x-mcp-state-handle` header over HTTP.
 * - end: executes the open batch on the connection the call took; the
 *   dispatch holds that use until the call settles, so the envelopes go on
 *   it for the whole `execute()`. A failure it knows is thrown, never
 *   answered: the dispatch answers it as for any call.
 * - answers: the kept answers by number; nothing is sent.
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../handlers/interfaces';
import type { McpResult } from '../answer';
import { ServerRefusal } from '../auth/serverRefusal';
import { type AnswersAsk, batchAnswersAnswer, readAnswers } from './answers';
import {
  batchEndAnswer,
  communicationBatchRefusal,
  executeBatch,
} from './execute';
import type { InstanceBatch } from './InstanceBatch';
import { LateBoundConnection } from './lateBound';

/** The instance's owner; refused `batch_mode_unavailable` where the host gave none. */
function ownerOf(context: HandlerContext): InstanceBatch {
  const owner = context.batch;
  if (owner === undefined) throw new ServerRefusal('batch_mode_unavailable');
  return owner;
}

/** `BatchBegin`: a communication batch opened; answers `{ batch: 'on', state_handle }`. */
export async function beginBatch(context: HandlerContext): Promise<McpResult> {
  const owner = ownerOf(context);
  const target = new LateBoundConnection();
  const connection = new AdtBatchConnection(target, {
    endpoint: 'communication',
    ...(context.logger !== undefined ? { logger: context.logger } : {}),
  });
  owner.begin('communication', { connection, target, recorded: [] });
  const answer: Record<string, unknown> = { batch: 'on' };
  if (context.state !== undefined) answer.state_handle = context.state.handle;
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }],
  };
}

/** `BatchEnd`: the open communication batch executed on the call's connection. */
export async function endBatch(context: HandlerContext): Promise<McpResult> {
  const owner = ownerOf(context);
  const refusal = communicationBatchRefusal(owner);
  const open = owner.opened();
  if (refusal !== undefined) throw refusal;
  if (open === undefined) throw new ServerRefusal('batch_mode_off');
  return batchEndAnswer(
    await executeBatch(owner, open.target, context.connection),
  );
}

/** `BatchAnswers`: the kept answers of the last batch, by number. */
export async function answersOf(
  context: HandlerContext,
  ask: AnswersAsk,
): Promise<McpResult> {
  return batchAnswersAnswer(readAnswers(ownerOf(context), ask));
}

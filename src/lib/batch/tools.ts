/**
 * What the batch tools do, shared by the full sets' `BatchBegin`,
 * `BatchEnd`, `BatchAnswers` and the compact sets' `HandlerBatch`: each
 * reaches the instance's owner through its call's context (`batch`), and
 * without one answers `batch_mode_unavailable`.
 *
 * - begin: opens a communication batch over a late-bound target (nothing
 *   is sent, no connection taken) and answers the instance's state handle.
 * - end: executes the open batch on the connection the call took; the
 *   dispatch holds that use until the call settles, so the envelopes go on
 *   it for the whole `execute()`. A failure it knows is thrown, never
 *   answered: the dispatch answers it as for any call.
 * - answers: the kept answers by number; nothing is sent.
 *
 * The debugger batch (`DebugBatchBegin`, `DebugBatchEnd`, the compact
 * `HandlerDebugBatch`, spec §7) opens on the ABAP stop's connection, or on
 * the AMDP session's command connection at an AMDP break, and executes
 * there; its answers are kept as the communication batch's.
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../handlers/interfaces';
import type { McpResult } from '../answer';
import { ServerRefusal } from '../auth/serverRefusal';
import { requireDebugger } from '../debugger/access';
import { DebugStateError } from '../debugger/DebugSession';
import { type AnswersAsk, batchAnswersAnswer, readAnswers } from './answers';
import { batchEndAnswer, executeBatch, openBatchOf } from './execute';
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
  const open = openBatchOf(owner, 'communication');
  return batchEndAnswer(await executeBatch(owner, open, context.connection));
}

/**
 * `DebugBatchBegin`: the debugger batch opened on the ABAP stop's
 * connection, or — with no ABAP stop — at an AMDP break on the AMDP
 * session's command connection (nothing is sent); answers
 * `{ debug_batch: 'on', state_handle }`. Refused while a batch is open
 * (`batch_mode_on` / `batch_mode_other`) and with neither stop held.
 */
export async function beginDebugBatch(
  context: HandlerContext,
): Promise<McpResult> {
  const owner = ownerOf(context);
  owner.refuseBegin('debugger');
  const debug = requireDebugger(context, {}, { create: 'abap' });
  const options =
    context.logger !== undefined ? { logger: context.logger } : {};
  let connection: ReturnType<typeof debug.abap.openBatch>;
  let debuggee: 'abap' | 'amdp' = 'abap';
  try {
    connection = debug.abap.openBatch(options);
  } catch (error) {
    if (!(error instanceof DebugStateError) || !debug.amdp.atBreak())
      throw error;
    connection = debug.amdp.openBatch(options);
    debuggee = 'amdp';
  }
  owner.begin('debugger', { connection, recorded: [], debuggee });
  const answer: Record<string, unknown> = { debug_batch: 'on' };
  if (context.state !== undefined) answer.state_handle = context.state.handle;
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }],
  };
}

/** `DebugBatchEnd`: the open debugger batch executed on the connection it was opened on. */
export async function endDebugBatch(
  context: HandlerContext,
): Promise<McpResult> {
  const owner = ownerOf(context);
  const open = openBatchOf(owner, 'debugger');
  return batchEndAnswer(await executeBatch(owner, open));
}

/** `BatchAnswers`: the kept answers of the last batch, by number. */
export async function answersOf(
  context: HandlerContext,
  ask: AnswersAsk,
): Promise<McpResult> {
  return batchAnswersAnswer(readAnswers(ownerOf(context), ask));
}

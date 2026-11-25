/**
 * What the batch tools do, shared by the compact sets' `HandlerBatch`, the
 * debugger batch's tools and `DebugBatchAnswers`: each
 * reaches the instance's owner through its call's context (`batch`), and
 * without one answers `batch_mode_unavailable`.
 *
 * - begin: opens a communication batch over a late-bound target (nothing
 *   is sent, no connection taken) and answers the instance's state handle.
 * - end: executes the open batch on the connection the call took; the
 *   dispatch holds that use until the call settles, so the envelopes go on
 *   it for the whole `execute()`. A failure it knows is thrown, never
 *   answered: the dispatch answers it as for any call.
 * - answers: the map's numbers, each answered by its handler when first
 *   read (in parallel, once); nothing is sent.
 *
 * The debugger batch (`DebugBatchBegin`, `DebugBatchEnd`, the compact
 * `HandlerDebugBatch`, spec §7) opens on the ABAP stop's connection, or on
 * the AMDP session's command connection at an AMDP break, and executes
 * there; its answers are kept as the communication batch's.
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { HandlerContext } from '../../handlers/interfaces';
import type { McpResult } from '../answer';
import { ServerRefusal } from '../auth/serverRefusal';
import { requireDebugger } from '../debugger/access';
import { DebugStateError } from '../debugger/DebugSession';
import { thrownAs } from '../thrownValue';
import { type AnswersAsk, batchAnswersAnswer, readAnswers } from './answers';
import { EnvelopeWatch } from './envelopeWatch';
import { executeBatch, openBatchOf } from './execute';
import type { InstanceBatch, OpenBatch } from './InstanceBatch';
import { LateBoundConnection } from './lateBound';

/** The instance's owner; refused `batch_mode_unavailable` where the host gave none. */
function ownerOf(context: HandlerContext): InstanceBatch {
  const owner = context.batch;
  if (owner === undefined) throw new ServerRefusal('batch_mode_unavailable');
  return owner;
}

/**
 * A communication batch to open: its batch connection over a late-bound
 * target, seen by the envelope watch (nothing is sent, no connection taken).
 */
export function communicationBatch(logger?: ILogger): OpenBatch {
  const target = new LateBoundConnection(logger);
  const envelopes = new EnvelopeWatch();
  const connection = new AdtBatchConnection(envelopes.over(target), {
    endpoint: 'communication',
    ...(logger !== undefined ? { logger } : {}),
  });
  return { connection, target, envelopes, recorded: [] };
}

/** What the batch's start answers: it is on, and the handle its calls carry. */
export type BatchBegun = { batch: 'on'; state_handle?: string };

/** The batch begin: a communication batch opened; answers `{ batch: 'on', state_handle }`. */
export async function beginBatch(context: HandlerContext): Promise<McpResult> {
  const owner = ownerOf(context);
  owner.begin('communication', communicationBatch(context.logger));
  const answer: BatchBegun = { batch: 'on' };
  if (context.state !== undefined) answer.state_handle = context.state.handle;
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(answer) }],
  };
}

/** The batch end: the open communication batch executed on the call's connection. */
export async function endBatch(context: HandlerContext): Promise<McpResult> {
  const owner = ownerOf(context);
  const open = openBatchOf(owner, 'communication');
  // The session the envelope goes out on: the connection this call took.
  const locks = context.heldLocks;
  if (locks !== undefined) open.lockSession = locks.session();
  return executeBatch(owner, open, context.connection);
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
  const envelopes = new EnvelopeWatch();
  const options = {
    through: (connection: IAbapConnection) => envelopes.over(connection),
    ...(context.logger !== undefined ? { logger: context.logger } : {}),
  };
  let connection: ReturnType<typeof debug.abap.openBatch>;
  let debuggee: 'abap' | 'amdp' = 'abap';
  try {
    connection = debug.abap.openBatch(options);
  } catch (error) {
    if (
      thrownAs(error, DebugStateError) === undefined ||
      !debug.amdp.atBreak()
    ) {
      throw error;
    }
    connection = debug.amdp.openBatch(options);
    debuggee = 'amdp';
  }
  owner.begin('debugger', { connection, envelopes, recorded: [], debuggee });
  const answer: DebugBatchBegun = {
    debug_batch: 'on',
  };
  if (context.state !== undefined) answer.state_handle = context.state.handle;
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(answer) }],
  };
}

/** `DebugBatchEnd`: the open debugger batch executed on the connection it was opened on. */
export async function endDebugBatch(
  context: HandlerContext,
): Promise<McpResult> {
  const owner = ownerOf(context);
  const open = openBatchOf(owner, 'debugger');
  return executeBatch(owner, open);
}

/** The answers read: the last batch's numbers, each answered when read. */
export async function answersOf(
  context: HandlerContext,
  ask: AnswersAsk,
): Promise<McpResult> {
  return batchAnswersAnswer(await readAnswers(ownerOf(context), ask));
}

/** What the debugger batch's start answers: it is on, and the handle its calls carry. */
export type DebugBatchBegun = { debug_batch: 'on'; state_handle?: string };

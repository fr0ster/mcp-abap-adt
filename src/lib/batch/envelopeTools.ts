/**
 * The read envelopes' work (spec §2, §5.3, §6): what records a call into an
 * envelope, and what the four tools do.
 *
 * - **Recording.** A call's recorder records into the envelope through
 *   `envelopeTarget`: every request is kept as a pending part of the
 *   envelope, under the call's number, nothing sent — so execution can plan
 *   the parts into one ADT envelope, or several under the consumer's bound.
 *   The envelope holds stateless requests only, and at most one node
 *   structure (§5.4).
 * - **Create, discard, list** send nothing and take no connection.
 * - **Execute** claims the envelope (synchronously, before anything is
 *   awaited), plans its parts (`packByParts`, `checkedEnvelopes`), sends
 *   the runs one after another through the phases' sender (`sendPlanned`,
 *   no format correction, the first failed run ends the sending), and
 *   answers every number at once: an answered run's calls resume with their
 *   parts first; only then are the calls of a failed or unsent run let go,
 *   each through its own signal, and answered the failure itself.
 */

import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import type { McpResult } from '../answer';
import { failureOf } from '../auth/failures';
import {
  batchPartsMismatchWords,
  envelopeNodeStructureWords,
  ServerRefusal,
} from '../auth/serverRefusal';
import { return_error } from '../utils';
import { failureAnswer } from './execute';
import type { BatchAnswer } from './InstanceBatch';
import type {
  Envelope,
  InstanceEnvelopes,
  SessionKey,
} from './InstanceEnvelopes';
import {
  oversizedReadWords,
  type PartAnswer,
  type Pending,
  packByParts,
  type SentEnvelope,
  sendPlanned,
} from './phases';
import type { RecordingTarget } from './recorder';
import type { SessionKind } from './sessionKind';

/** The request a node structure is read with (§5.4). */
const NODE_STRUCTURE_PATH = '/sap/bc/adt/repository/nodestructure';

/** Whether `request` reads a node structure: a POST to its path, whatever its query. */
export function isNodeStructure(request: IAbapRequestOptions): boolean {
  const path = request.url.split('?')[0] ?? '';
  return (
    request.method.toUpperCase() === 'POST' &&
    path.endsWith(NODE_STRUCTURE_PATH)
  );
}

/** One recorded call of an envelope, as execution answers it. */
export interface EnvelopeCall {
  readonly number: number;
  /** Resumes the call's handler with its parts: the number's answer. Never rejects. */
  resume(): Promise<BatchAnswer>;
  /** Lets the call go: its own signal aborted, its handler ends its wait. */
  letGo(): void;
  /** The refusal that is the call's answer whatever its run came to (a node structure refused), if any. */
  refusal(): ServerRefusal | undefined;
}

/** What an envelope keeps of its recorded calls: their pending parts and their calls, by number. */
export interface EnvelopeRecord {
  readonly parts: Pending[];
  readonly calls: EnvelopeCall[];
  /** Whether a node-structure request was recorded. */
  nodeStructure: boolean;
  /** Validates a request's shape as an ADT batch envelope takes it, recording nothing that is sent. */
  readonly validator: AdtBatchConnection;
}

const records = new WeakMap<Envelope, EnvelopeRecord>();

/** A connection that never sends: the validator's, which is never executed. */
const NEVER_SENT: IAbapConnection = {
  connect: async () => undefined,
  getBaseUrl: async () => undefined,
  getSessionId: () => null,
  setSessionType: () => undefined,
  makeAdtRequest: async () => {
    throw new ServerRefusal('batch_ended');
  },
};

/** The record of `envelope`'s calls, made at its first use. */
export function recordOf(envelope: Envelope): EnvelopeRecord {
  let record = records.get(envelope);
  if (record === undefined) {
    record = {
      parts: [],
      calls: [],
      nodeStructure: false,
      validator: new AdtBatchConnection(NEVER_SENT, {
        endpoint: 'communication',
      }),
    };
    records.set(envelope, record);
  }
  return record;
}

/**
 * The recording target of one call into `envelope`, its waits racing
 * `signal` (the call's own). Stateless requests only: the target holds the
 * stateless kind from the start, so a LOCK or UNLOCK is refused
 * `batch_other_kind`. A second node structure is refused
 * `envelope_node_structure` before it is recorded (`admit`).
 */
export function envelopeTarget(
  envelope: Envelope,
  signal: AbortSignal,
  keepRawParts: boolean,
): RecordingTarget & {
  /** The refusal of `request` before it is recorded, when the envelope refuses it. */
  admit(
    request: IAbapRequestOptions,
    number: number | undefined,
  ): ServerRefusal | undefined;
} {
  const record = recordOf(envelope);
  let number: number | undefined;
  const holds: SessionKind = 'stateless';
  return {
    endpoint: 'communication',
    keepRawParts,
    signal: () => signal,
    open: () => envelope.isOpen(),
    kind: () => holds,
    recorded: () => undefined,
    nextNumber: () => {
      number = envelope.nextNumber();
      return number;
    },
    admit: (request, taken) => {
      if (!isNodeStructure(request)) return undefined;
      if (!record.nodeStructure) return undefined;
      return new ServerRefusal(
        'envelope_node_structure',
        envelopeNodeStructureWords(taken),
      );
    },
    record: (request) => {
      // The request's shape as an envelope takes it, checked now: a shape
      // the envelope refuses throws here and the call takes no number.
      void record.validator.makeAdtRequest(request).catch(() => undefined);
      if (isNodeStructure(request)) record.nodeStructure = true;
      // The call's item: its number less one — the number is taken right
      // after its first request is recorded.
      const item = (number ?? envelope.recorded() + 1) - 1;
      let answer: (final: PartAnswer) => void = () => {};
      const final = new Promise<PartAnswer>((resolve) => {
        answer = resolve;
      });
      record.parts.push({
        item,
        request,
        first: final,
        answer,
        invocation: undefined,
      });
      return final.then((settled) =>
        settled.ok ? settled.response : Promise.reject(settled.error),
      );
    },
    connect: async () => undefined,
    getBaseUrl: async () => undefined,
    getSessionId: () => null,
    setSessionType: () => undefined,
    getSessionType: () => 'stateless',
  };
}

/** What creating an envelope answers. */
export type EnvelopeCreated = {
  envelope_handle: string;
  state_handle?: string;
};

const json = (value: unknown): McpResult => ({
  isError: false,
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

/** The instance's owner; refused `envelopes_unavailable` where the host gave none. */
function ownerOf(context: HandlerContext): {
  owner: InstanceEnvelopes;
  key: SessionKey;
} {
  const owner = context.envelopes;
  const key = context.envelopeKey?.();
  if (owner === undefined || key === undefined) {
    throw new ServerRefusal('envelopes_unavailable');
  }
  return { owner, key };
}

/** `CreateReadEnvelope`: a new envelope of the call's session; nothing is sent. */
export function createEnvelope(context: HandlerContext): McpResult {
  const { owner, key } = ownerOf(context);
  const envelope = owner.create(key);
  const answer: EnvelopeCreated = { envelope_handle: envelope.handle };
  if (context.state !== undefined) answer.state_handle = context.state.handle;
  return json(answer);
}

/** `DiscardReadEnvelope`: the envelope ended with nothing sent. */
export function discardEnvelope(
  context: HandlerContext,
  handle: string,
): McpResult {
  const { owner, key } = ownerOf(context);
  const envelope = owner.discard(handle, key);
  return json({ envelope_handle: handle, discarded: envelope.recorded() });
}

/** `ListReadEnvelopes`: the session's open envelopes, in creation order. */
export function listEnvelopes(context: HandlerContext): McpResult {
  const { owner, key } = ownerOf(context);
  return json(
    owner.list(key).map((envelope) => ({
      envelope_handle: envelope.handle,
      recorded: envelope.recorded(),
    })),
  );
}

/**
 * The refusal a call naming `handle` meets before anything else — the owner
 * absent, the envelope not of this session — or `undefined`: checked before
 * the dispatch takes a connection (spec §6.1 step 1), so a refused call
 * sends nothing.
 */
export function envelopeRefusal(
  context: Pick<HandlerContext, 'envelopes' | 'envelopeKey'>,
  handle: string,
): ServerRefusal | undefined {
  const owner = context.envelopes;
  const key = context.envelopeKey?.();
  if (owner === undefined || key === undefined) {
    return new ServerRefusal('envelopes_unavailable');
  }
  try {
    owner.find(handle, key);
    return undefined;
  } catch (error) {
    if (error instanceof ServerRefusal) return error;
    throw error;
  }
}

/** A failure answered under a number. */
function failureUnder(number: number, answer: McpResult): BatchAnswer {
  return {
    number,
    content: answer.content,
    ...(answer.isError ? { isError: true as const } : {}),
  };
}

/**
 * The failure answer of a run whose envelope failed: what the failure
 * reader knows (a credential refusal, the server's own refusal) as it
 * answers it; an envelope SAP answered with a success status whose parts
 * came short or did not split, `batch_parts_mismatch` / `batch_unsplit`;
 * anything else SAP's answer to the envelope, or the transport's error,
 * with the step.
 */
function runFailureAnswer(
  sent: SentEnvelope | undefined,
  error: unknown,
  parts: readonly PartAnswer[],
): McpResult {
  if (failureOf(error) !== undefined) return failureAnswer(error);
  const outer = sent?.failed?.outer;
  if (outer !== undefined && outer >= 200 && outer < 300) {
    const came = parts.filter((part) => part.ok || part.error !== error).length;
    return failureAnswer(
      came > 0 && came < parts.length
        ? new ServerRefusal(
            'batch_parts_mismatch',
            batchPartsMismatchWords(came, parts.length),
          )
        : new ServerRefusal('batch_unsplit'),
    );
  }
  return failureAnswer(error);
}

/**
 * Executes `envelope`, already claimed, on the call's connection (spec
 * §6.1 steps 4–7): every number's answer, in recording order.
 */
export async function executeEnvelope(
  context: HandlerContext,
  envelope: Envelope,
): Promise<BatchAnswer[]> {
  const record = recordOf(envelope);
  const calls = [...record.calls].sort((a, b) => a.number - b.number);
  if (calls.length === 0) return [];
  const indexes = calls.map((call) => call.number - 1);
  const partsOf: number[] = indexes.map(() => 0);
  for (const part of record.parts) {
    partsOf[part.item] = (partsOf[part.item] ?? 0) + 1;
  }
  const bound = context.partsPerEnvelope;
  const planned =
    bound === undefined ? [indexes] : packByParts(indexes, partsOf, bound);
  if (bound !== undefined) {
    for (const run of planned) {
      let parts = 0;
      for (const item of run) parts += partsOf[item] ?? 0;
      if (parts > bound) {
        // Nothing is sent: every number answers the oversized words.
        const oversized = return_error(
          new Error(oversizedReadWords(parts, bound)),
        );
        for (const call of calls) call.letGo();
        return calls.map((call) =>
          call.refusal() !== undefined
            ? failureUnder(call.number, return_error(call.refusal()))
            : failureUnder(call.number, oversized),
        );
      }
    }
  }
  const firsts = new Map<Pending, PartAnswer>();
  for (const part of record.parts) {
    void part.first.then((settled) => firsts.set(part, settled));
  }
  const sent = await sendPlanned<never>(
    context,
    envelope,
    record.parts,
    planned,
    {
      correction: false,
      endsOn: ({ sent: run }) =>
        run.failed !== undefined
          ? { error: run.failed.error }
          : (run.end ?? undefined),
    },
  );
  // Every part settled: let the settlements land.
  await new Promise((resolve) => setImmediate(resolve));
  // Each item's run, and what it came to.
  type RunAnswer =
    | { readonly answered: true }
    | { readonly answered: false; readonly answer: McpResult };
  const byItem = new Map<number, RunAnswer>();
  let ending: McpResult | undefined;
  for (const run of sent.runs) {
    const runParts = record.parts.filter((part) => run.run.includes(part.item));
    const settled = runParts.map(
      (part): PartAnswer => firsts.get(part) ?? { ok: false, error: undefined },
    );
    let outcome: RunAnswer;
    if (run.sent === undefined) {
      outcome = {
        answered: false,
        answer:
          ending ??
          failureAnswer(
            sent.stopped?.error ?? new ServerRefusal('batch_unsplit'),
          ),
      };
    } else if (
      run.sent.oversized !== undefined ||
      run.sent.absent !== undefined
    ) {
      const error = run.sent.oversized ?? run.sent.absent;
      ending = failureAnswer(error);
      outcome = { answered: false, answer: ending };
    } else if (run.sent.failed !== undefined) {
      ending = runFailureAnswer(run.sent, run.sent.failed.error, settled);
      outcome = { answered: false, answer: ending };
    } else if (run.sent.refused !== undefined) {
      ending = failureAnswer(run.sent.refused);
      outcome = { answered: false, answer: ending };
    } else {
      if (run.sent.end !== undefined)
        ending = failureAnswer(run.sent.end.error);
      outcome = { answered: true };
    }
    for (const item of run.run) byItem.set(item, outcome);
  }
  // The answered runs first: their handlers resume and settle before
  // anything is let go.
  const answered = new Map<number, BatchAnswer>();
  await Promise.all(
    calls.map(async (call) => {
      const outcome = byItem.get(call.number - 1);
      if (outcome?.answered !== true) return;
      answered.set(call.number, await call.resume());
    }),
  );
  // Then the rest, each call let go through its own signal.
  return calls.map((call) => {
    const refusal = call.refusal();
    const done = answered.get(call.number);
    if (refusal !== undefined) {
      if (done === undefined) call.letGo();
      return failureUnder(call.number, return_error(refusal));
    }
    if (done !== undefined) return done;
    call.letGo();
    const outcome = byItem.get(call.number - 1);
    return failureUnder(
      call.number,
      outcome !== undefined && !outcome.answered
        ? outcome.answer
        : failureAnswer(new ServerRefusal('batch_unsplit')),
    );
  });
}

/** `ExecuteReadEnvelope`'s handler: the claim, then the answers as JSON. */
export async function executeEnvelopeTool(
  context: HandlerContext,
  handle: string,
): Promise<McpResult> {
  const { owner, key } = ownerOf(context);
  const envelope = owner.claim(handle, key);
  return json(await executeEnvelope(context, envelope));
}

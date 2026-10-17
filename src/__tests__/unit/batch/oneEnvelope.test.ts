/**
 * Every batch end sends one envelope (spec §4.1): a batch is homogeneous by
 * session kind — the first recorded call decides LOCK, UNLOCK or stateless,
 * as adt-clients partitions its queue — and a call of another kind is
 * refused `batch_other_kind` before it records anything: no number, its
 * request in no envelope.
 *
 * The batch connection is adt-clients' own `AdtBatchConnection`; every built
 * connection is a fake that answers envelopes part by part (`batchStand`).
 * The full set ends with `BatchEnd`, the compact set with `HandlerBatch`.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import type {
  HandlerContext,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import {
  batchStand,
  LOCK_HANDLE_OF_XML,
  LOCK_SUCCESS_XML,
  payloadOf,
  type Stand,
} from '../../helpers/batchStand';

/** SAP: a lock answers its handle, an unlock nothing, any other read its address. */
function sap(inner: InnerRequest): PartAnswer {
  if (inner.url.includes('_action=LOCK')) {
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/vnd.sap.as+xml' },
      body: LOCK_SUCCESS_XML,
    };
  }
  if (inner.url.includes('_action=UNLOCK')) {
    return { status: 200, statusText: 'OK' };
  }
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    body: `source of ${inner.url}`,
  };
}

const TOOLS = ['GetProgram', 'ReadClass', 'HandlerLock', 'HandlerUnlock'];

const lock = (name: string) => ({ object_type: 'CLASS', object_name: name });
const unlock = (name: string) => ({
  ...lock(name),
  lock_handle: LOCK_HANDLE_OF_XML,
});

/** Every envelope sent on every connection built: its session and its parts' methods. */
function envelopes(s: Stand) {
  return s.built.flatMap((b) =>
    b.envelopes.map((e) => ({
      session: e.session,
      parts: e.parts.map((p) => `${p.method} ${p.url}`),
    })),
  );
}

function refusedOtherKind(
  answer: { isError?: boolean; content?: Array<{ text?: string }> },
  tool: string,
  kind: string,
  holds: string,
) {
  expect(answer.isError).toBe(true);
  expect(payloadOf(answer)).toEqual({
    error: 'batch_other_kind',
    message: `${tool} is a ${kind} request; this batch holds ${holds} requests — record it in the next batch`,
  });
}

/** The two sets: how each begins, ends and reads a batch. */
const SETS = [
  {
    set: 'full',
    begin: (s: Stand) => s.call('BatchBegin'),
    end: async (s: Stand) => payloadOf(await s.call('BatchEnd')),
    answers: (s: Stand, numbers: number[]) => s.answers(numbers),
  },
  {
    set: 'compact',
    begin: (s: Stand) => s.call('HandlerBatch', { action: 'begin' }),
    end: async (s: Stand) =>
      payloadOf(await s.call('HandlerBatch', { action: 'end' })),
    answers: async (s: Stand, numbers: number[]) =>
      payloadOf(await s.call('HandlerBatch', { action: 'answers', numbers })),
  },
] as const;

afterEach(() => jest.restoreAllMocks());

describe.each(SETS)('every batch end sends one envelope ($set)', (set) => {
  it('a LOCK batch: the first call decides LOCK; a read and an UNLOCK are refused batch_other_kind, nothing recorded, no number; one stateful envelope', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    await set.begin(s);
    expect(s.owner.kind()).toBeUndefined();
    expect(await s.call('HandlerLock', lock('CLAS_A'))).toEqual({
      content: [],
    });
    expect(s.owner.kind()).toBe('lock');
    refusedOtherKind(
      await s.call('GetProgram', { program_name: 'PROG_A' }),
      'GetProgram',
      'stateless',
      'LOCK',
    );
    refusedOtherKind(
      await s.call('HandlerUnlock', unlock('CLAS_A')),
      'HandlerUnlock',
      'UNLOCK',
      'LOCK',
    );
    // The refused calls took no number: the next lock is 2.
    expect(await s.call('HandlerLock', lock('CLAS_B'))).toEqual({
      content: [],
    });
    expect(await set.end(s)).toEqual({ recorded: 2, failed: [] });
    expect(envelopes(s)).toEqual([
      {
        session: 'stateful',
        parts: [
          expect.stringMatching(/^POST .*clas_a\?_action=LOCK/),
          expect.stringMatching(/^POST .*clas_b\?_action=LOCK/),
        ],
      },
    ]);
    const entries = await set.answers(s, [1, 2, 3]);
    expect((entries as Array<{ number: number }>).map((e) => e.number)).toEqual(
      [1, 2, 3],
    );
    expect(payloadOf(entries[0] as never).lock_handle).toBe(LOCK_HANDLE_OF_XML);
    expect(entries[2]).toEqual({
      number: 3,
      error: 'no_answer',
      message: 'no answer with that number',
    });
    await s.close();
  });

  it('a stateless batch: the first read decides stateless; a LOCK and an UNLOCK are refused, no number; one stateless envelope', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    await set.begin(s);
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    expect(s.owner.kind()).toBe('stateless');
    refusedOtherKind(
      await s.call('HandlerLock', lock('CLAS_A')),
      'HandlerLock',
      'LOCK',
      'stateless',
    );
    refusedOtherKind(
      await s.call('HandlerUnlock', unlock('CLAS_A')),
      'HandlerUnlock',
      'UNLOCK',
      'stateless',
    );
    // A call of two independent parts, both stateless: one number.
    expect(await s.call('ReadClass', { class_name: 'CLAS_A' })).toEqual({
      content: [],
    });
    expect(await set.end(s)).toEqual({ recorded: 2, failed: [] });
    const sent = envelopes(s);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.session).toBe('stateless');
    expect(sent[0]?.parts).toHaveLength(3);
    // The refused calls left no session switch behind: no part is stateful.
    expect(sent[0]?.parts.some((p) => p.includes('_action='))).toBe(false);
    await s.close();
  });

  it('an UNLOCK batch: the first call decides UNLOCK; a LOCK and a read are refused, no number; one stateful envelope', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    await set.begin(s);
    expect(await s.call('HandlerUnlock', unlock('CLAS_A'))).toEqual({
      content: [],
    });
    expect(s.owner.kind()).toBe('unlock');
    refusedOtherKind(
      await s.call('HandlerLock', lock('CLAS_B')),
      'HandlerLock',
      'LOCK',
      'UNLOCK',
    );
    refusedOtherKind(
      await s.call('ReadClass', { class_name: 'CLAS_A' }),
      'ReadClass',
      'stateless',
      'UNLOCK',
    );
    expect(await s.call('HandlerUnlock', unlock('CLAS_B'))).toEqual({
      content: [],
    });
    expect(await set.end(s)).toEqual({ recorded: 2, failed: [] });
    expect(envelopes(s)).toEqual([
      {
        session: 'stateful',
        parts: [
          expect.stringMatching(/^POST .*clas_a\?_action=UNLOCK/),
          expect.stringMatching(/^POST .*clas_b\?_action=UNLOCK/),
        ],
      },
    ]);
    await s.close();
  });

  it('the next batch decides its kind anew: each phase its own batch, one envelope each', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    await set.begin(s);
    await s.call('HandlerLock', lock('CLAS_A'));
    expect(await set.end(s)).toEqual({ recorded: 1, failed: [] });
    expect(s.owner.kind()).toBeUndefined();
    await set.begin(s);
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    expect(s.owner.kind()).toBe('stateless');
    expect(await set.end(s)).toEqual({ recorded: 1, failed: [] });
    await set.begin(s);
    expect(await s.call('HandlerUnlock', unlock('CLAS_A'))).toEqual({
      content: [],
    });
    expect(await set.end(s)).toEqual({ recorded: 1, failed: [] });
    expect(envelopes(s).map((e) => [e.session, e.parts.length])).toEqual([
      ['stateful', 1],
      ['stateless', 1],
      ['stateful', 1],
    ]);
    await s.close();
  });
});

describe('a refused request leaves nothing of its kind behind', () => {
  it("its member's stateful switch is undone: the call's next part, recorded at once, goes stateless into the batch's one envelope", async () => {
    // A member that asks for stateful, records a LOCK, and records a read
    // before its own restore could run (adt-clients restores after the
    // deferred answer).
    const both = {
      getName: () => 'lock-then-read',
      getHandlers: () => [
        {
          toolDefinition: {
            name: 'GetProgram',
            description: 'GetProgram',
            inputSchema: {
              type: 'object',
              properties: { program_name: { type: 'string' } },
            },
          },
          handler: async (context: HandlerContext, _args: unknown) => {
            context.connection.setSessionType('stateful');
            const locked = context.connection.makeAdtRequest({
              url: '/sap/bc/adt/programs/programs/prog_a?_action=LOCK&accessMode=MODIFY',
              method: 'POST',
              timeout: 0,
            });
            const read = context.connection.makeAdtRequest({
              url: '/sap/bc/adt/programs/programs/prog_a/source/main',
              method: 'GET',
              timeout: 0,
            });
            await Promise.allSettled([locked, read]);
            return { isError: false, content: [{ type: 'text', text: 'a' }] };
          },
        },
      ],
      registerHandlers: () => {},
    } as unknown as IHandlerGroup;
    const s = await batchStand({
      tools: ['ReadClass'],
      part: sap,
      groups: [both],
    });
    s.begin();
    expect(await s.call('ReadClass', { class_name: 'CLAS_A' })).toEqual({
      content: [],
    });
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    expect(s.owner.kind()).toBe('stateless');
    expect((await s.end()).summary).toEqual({ recorded: 2, failed: [] });
    const sent = envelopes(s);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.session).toBe('stateless');
    expect(sent[0]?.parts).toEqual([
      expect.stringMatching(/^GET .*clas_a\/source\/main/),
      expect.stringMatching(/^GET .*clas_a$/),
      expect.stringMatching(/^GET .*prog_a\/source\/main$/),
    ]);
    await s.close();
  });
});

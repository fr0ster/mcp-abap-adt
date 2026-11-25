/**
 * Every batch end sends one envelope (spec §4.1): a batch is homogeneous by
 * session kind — the first recorded call decides LOCK, UNLOCK or stateless,
 * as adt-clients partitions its queue — and a call of another kind is
 * refused `batch_other_kind` before it records anything: no number, its
 * request in no envelope.
 *
 * The batch connection is adt-clients' own `AdtBatchConnection`; every built
 * connection is a fake that answers envelopes part by part (`batchStand`).
 * Batch mode is the compact sets': a batch ends with `HandlerBatch`.
 */

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// Every case restores every mock after it: they are replaced before each.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import * as z from 'zod';
import * as connectionFactory from '../../../lib/connectionFactory';
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
import { holding } from '../../helpers/heldLocks';

beforeEach(() => {
  mock.method(connectionFactory, 'createAbapConnection', () => undefined);
});

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

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

const TOOLS = ['HandlerGet', 'HandlerLock'];

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
  assert.equal(answer.isError, true);
  assert.deepStrictEqual(payloadOf(answer), {
    error: 'batch_other_kind',
    message: `${tool} is a ${kind} request; this batch holds ${holds} requests — record it in the next batch`,
  });
}

/** The two sets: how each begins, ends and reads a batch. */
const SETS = [
  {
    set: 'compact',
    begin: (s: Stand) => s.call('HandlerBatch', { action: 'begin' }),
    end: async (s: Stand) =>
      payloadOf(await s.call('HandlerBatch', { action: 'end' })),
    answers: async (s: Stand, numbers: number[]) =>
      payloadOf(await s.call('HandlerBatch', { action: 'answers', numbers })),
  },
] as const;

afterEach(() => mock.restoreAll());

for (const set of SETS) {
  describe(`every batch end sends one envelope (${set.set})`, () => {
    it('a LOCK batch: the first call decides LOCK; a read and an UNLOCK are refused batch_other_kind, nothing recorded, no number; one stateful envelope', async () => {
      const s = await batchStand({
        heldLocks: holding(LOCK_HANDLE_OF_XML),
        tools: TOOLS,
        part: sap,
      });
      await set.begin(s);
      assert.equal(s.owner.kind(), undefined);
      assert.deepStrictEqual(await s.call('HandlerLock', lock('CLAS_A')), {
        content: [],
      });
      assert.equal(s.owner.kind(), 'lock');
      refusedOtherKind(
        await s.call('HandlerGet', {
          object_type: 'PROGRAM',
          program_name: 'PROG_A',
        }),
        'HandlerGet',
        'stateless',
        'LOCK',
      );
      refusedOtherKind(
        await s.call('HandlerLock', { action: 'unlock', ...unlock('CLAS_A') }),
        'HandlerLock',
        'UNLOCK',
        'LOCK',
      );
      // The refused calls took no number: the next lock is 2.
      assert.deepStrictEqual(await s.call('HandlerLock', lock('CLAS_B')), {
        content: [],
      });
      assert.deepStrictEqual(await set.end(s), {
        recorded: 2,
        sent: 2,
        received: 2,
      });
      {
        // Each part matched by its pattern, then the envelopes compared whole.
        const sent = envelopes(s);
        const parts = sent[0]?.parts ?? [];
        assert.match(parts[0] ?? '', /^POST .*clas_a\?_action=LOCK/);
        assert.match(parts[1] ?? '', /^POST .*clas_b\?_action=LOCK/);
        assert.deepStrictEqual(sent, [
          { session: 'stateful', parts: [parts[0], parts[1]] },
        ]);
      }
      const entries = await set.answers(s, [1, 2, 3]);
      assert.deepStrictEqual(
        (entries as Array<{ number: number }>).map((e) => e.number),
        [1, 2, 3],
      );
      assert.equal(
        payloadOf(entries[0] as never).lock_handle,
        LOCK_HANDLE_OF_XML,
      );
      assert.deepStrictEqual(entries[2], {
        number: 3,
        error: 'no_answer',
        message: 'no answer with that number',
      });
      await s.close();
    });

    it('a stateless batch: the first read decides stateless; a LOCK and an UNLOCK are refused, no number; one stateless envelope', async () => {
      const s = await batchStand({
        heldLocks: holding(LOCK_HANDLE_OF_XML),
        tools: TOOLS,
        part: sap,
      });
      await set.begin(s);
      assert.deepStrictEqual(
        await s.call('HandlerGet', {
          object_type: 'PROGRAM',
          program_name: 'PROG_A',
        }),
        {
          content: [],
        },
      );
      assert.equal(s.owner.kind(), 'stateless');
      refusedOtherKind(
        await s.call('HandlerLock', lock('CLAS_A')),
        'HandlerLock',
        'LOCK',
        'stateless',
      );
      refusedOtherKind(
        await s.call('HandlerLock', { action: 'unlock', ...unlock('CLAS_A') }),
        'HandlerLock',
        'UNLOCK',
        'stateless',
      );
      // A stateless read: one number.
      assert.deepStrictEqual(
        await s.call('HandlerGet', {
          object_type: 'CLASS',
          class_name: 'CLAS_A',
        }),
        {
          content: [],
        },
      );
      assert.deepStrictEqual(await set.end(s), {
        recorded: 2,
        sent: 2,
        received: 2,
      });
      const sent = envelopes(s);
      assert.equal(sent.length, 1);
      assert.equal(sent[0]?.session, 'stateless');
      assert.equal(sent[0]?.parts.length, 2);
      // The refused calls left no session switch behind: no part is stateful.
      assert.equal(
        sent[0]?.parts.some((p) => p.includes('_action=')),
        false,
      );
      await s.close();
    });

    it('an UNLOCK batch: the first call decides UNLOCK; a LOCK and a read are refused, no number; one stateful envelope', async () => {
      const s = await batchStand({
        heldLocks: holding(LOCK_HANDLE_OF_XML),
        tools: TOOLS,
        part: sap,
      });
      await set.begin(s);
      assert.deepStrictEqual(
        await s.call('HandlerLock', { action: 'unlock', ...unlock('CLAS_A') }),
        {
          content: [],
        },
      );
      assert.equal(s.owner.kind(), 'unlock');
      refusedOtherKind(
        await s.call('HandlerLock', lock('CLAS_B')),
        'HandlerLock',
        'LOCK',
        'UNLOCK',
      );
      refusedOtherKind(
        await s.call('HandlerGet', {
          object_type: 'CLASS',
          class_name: 'CLAS_A',
        }),
        'HandlerGet',
        'stateless',
        'UNLOCK',
      );
      assert.deepStrictEqual(
        await s.call('HandlerLock', { action: 'unlock', ...unlock('CLAS_B') }),
        {
          content: [],
        },
      );
      assert.deepStrictEqual(await set.end(s), {
        recorded: 2,
        sent: 2,
        received: 2,
      });
      {
        // Each part matched by its pattern, then the envelopes compared whole.
        const sent = envelopes(s);
        const parts = sent[0]?.parts ?? [];
        assert.match(parts[0] ?? '', /^POST .*clas_a\?_action=UNLOCK/);
        assert.match(parts[1] ?? '', /^POST .*clas_b\?_action=UNLOCK/);
        assert.deepStrictEqual(sent, [
          { session: 'stateful', parts: [parts[0], parts[1]] },
        ]);
      }
      await s.close();
    });

    it('the next batch decides its kind anew: each phase its own batch, one envelope each', async () => {
      const s = await batchStand({
        heldLocks: holding(LOCK_HANDLE_OF_XML),
        tools: TOOLS,
        part: sap,
      });
      await set.begin(s);
      await s.call('HandlerLock', lock('CLAS_A'));
      assert.deepStrictEqual(await set.end(s), {
        recorded: 1,
        sent: 1,
        received: 1,
      });
      assert.equal(s.owner.kind(), undefined);
      await set.begin(s);
      assert.deepStrictEqual(
        await s.call('HandlerGet', {
          object_type: 'PROGRAM',
          program_name: 'PROG_A',
        }),
        {
          content: [],
        },
      );
      assert.equal(s.owner.kind(), 'stateless');
      assert.deepStrictEqual(await set.end(s), {
        recorded: 1,
        sent: 1,
        received: 1,
      });
      await set.begin(s);
      assert.deepStrictEqual(
        await s.call('HandlerLock', { action: 'unlock', ...unlock('CLAS_A') }),
        {
          content: [],
        },
      );
      assert.deepStrictEqual(await set.end(s), {
        recorded: 1,
        sent: 1,
        received: 1,
      });
      assert.deepStrictEqual(
        envelopes(s).map((e) => [e.session, e.parts.length]),
        [
          ['stateful', 1],
          ['stateless', 1],
          ['stateful', 1],
        ],
      );
      await s.close();
    });
  });
}

type Step = 'lock' | 'read' | 'stateful';

/**
 * `HandlerProfileList` served by a member of the test's own: it records its parts
 * in `steps` order, synchronously, before awaiting any answer — a `lock`
 * asks for stateful and records a LOCK, a `read` records a GET, and
 * `stateful` asks for stateful and records a LOCK without ever restoring.
 */
function memberOf(steps: Step[]): IHandlerGroup {
  return {
    getName: () => 'mixed-member',
    getHandlers: () => [
      {
        toolDefinition: {
          name: 'HandlerProfileList',
          description: 'HandlerProfileList',
          inputSchema: z.object({ program_name: z.string().optional() }),
        },
        call: async (context: HandlerContext, _args: unknown) => {
          const parts: Promise<unknown>[] = [];
          for (const step of steps) {
            if (step === 'read') {
              parts.push(
                context.connection.makeAdtRequest({
                  url: '/sap/bc/adt/programs/programs/prog_a/source/main',
                  method: 'GET',
                  timeout: 0,
                }),
              );
              continue;
            }
            context.connection.setSessionType('stateful');
            parts.push(
              context.connection.makeAdtRequest({
                url: '/sap/bc/adt/programs/programs/prog_a?_action=LOCK&accessMode=MODIFY',
                method: 'POST',
                timeout: 0,
              }),
            );
            if (step === 'lock') context.connection.setSessionType('stateless');
          }
          await Promise.allSettled(parts);
          return { isError: false, content: [{ type: 'text', text: 'a' }] };
        },
      },
    ],
    registerHandlers: () => {},
  } as unknown as IHandlerGroup;
}

describe('a call with a part of another kind', () => {
  it('first part refused: the call answers batch_other_kind, its later part of the batch kind is not recorded, no number', async () => {
    const s = await batchStand({
      heldLocks: holding(LOCK_HANDLE_OF_XML),
      tools: ['HandlerGet'],
      part: sap,
      groups: [memberOf(['lock', 'read'])],
    });
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'CLASS',
        class_name: 'CLAS_A',
      }),
      {
        content: [],
      },
    );
    refusedOtherKind(
      await s.call('HandlerProfileList', { program_name: 'PROG_A' }),
      'HandlerProfileList',
      'LOCK',
      'stateless',
    );
    // No number for it: the next call is 2.
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'CLASS',
        class_name: 'CLAS_B',
      }),
      {
        content: [],
      },
    );
    assert.deepStrictEqual((await s.end()).summary, {
      recorded: 2,
      sent: 2,
      received: 2,
    });
    const sent = envelopes(s);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.session, 'stateless');
    assert.equal(
      sent[0]?.parts.some((p) => p.includes('prog_a')),
      false,
    );
    await s.close();
  });

  it('a later part refused: the call answers batch_other_kind naming its number, the earlier part is sent, its number answers the refusal', async () => {
    const s = await batchStand({
      heldLocks: holding(LOCK_HANDLE_OF_XML),
      tools: ['HandlerGet'],
      part: sap,
      groups: [memberOf(['read', 'lock', 'read'])],
    });
    s.begin();
    const answer = await s.call('HandlerProfileList', {
      program_name: 'PROG_A',
    });
    const words =
      'HandlerProfileList is a LOCK request; this batch holds stateless requests — record it in the next batch. An earlier part of this call was recorded, under number 1, and will be sent at the batch end; its answer under that number is this refusal';
    assert.equal(answer.isError, true);
    assert.deepStrictEqual(payloadOf(answer), {
      error: 'batch_other_kind',
      message: words,
    });
    assert.equal(s.owner.kind(), 'stateless');
    assert.deepStrictEqual((await s.end()).summary, {
      recorded: 1,
      sent: 1,
      received: 1,
    });
    // The earlier part went; nothing after the refused one, nothing stateful.
    {
      // The part matched by its pattern, then the envelopes compared whole.
      const sent = envelopes(s);
      const parts = sent[0]?.parts ?? [];
      assert.match(parts[0] ?? '', /^GET .*prog_a\/source\/main$/);
      assert.deepStrictEqual(sent, [
        { session: 'stateless', parts: [parts[0]] },
      ]);
    }
    const [first] = await s.answers([1]);
    assert.deepStrictEqual(payloadOf(first as never), {
      error: 'batch_other_kind',
      message: words,
    });
    await s.close();
  });

  it("a refused part's stateful switch is undone: the next call's read goes stateless into the batch's one envelope", async () => {
    const s = await batchStand({
      heldLocks: holding(LOCK_HANDLE_OF_XML),
      tools: ['HandlerGet'],
      part: sap,
      groups: [memberOf(['stateful'])],
    });
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'CLASS',
        class_name: 'CLAS_A',
      }),
      {
        content: [],
      },
    );
    refusedOtherKind(
      await s.call('HandlerProfileList', { program_name: 'PROG_A' }),
      'HandlerProfileList',
      'LOCK',
      'stateless',
    );
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'CLASS',
        class_name: 'CLAS_B',
      }),
      {
        content: [],
      },
    );
    assert.deepStrictEqual((await s.end()).summary, {
      recorded: 2,
      sent: 2,
      received: 2,
    });
    const sent = envelopes(s);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.session, 'stateless');
    assert.equal(sent[0]?.parts.length, 2);
    await s.close();
  });
});

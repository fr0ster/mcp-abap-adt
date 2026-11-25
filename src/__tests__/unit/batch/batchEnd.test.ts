/**
 * The batch end (spec §5), `HandlerBatch` with `action: 'end'` (named
 * BatchEnd below, as the spec does): the open communication batch executed
 * on the connection the end took, every recorded call's answer the one its
 * handler builds from what came, batch mode off whatever fails.
 *
 * The batch connection is adt-clients' own `AdtBatchConnection`; every built
 * connection is a fake that answers envelopes part by part (`batchStand`).
 * The batch tool is the served `HandlerBatch` (batch mode is the compact
 * sets'); the dispatch is the real one. The calls recorded are the compact
 * tools' (`HandlerGet`, `HandlerLock`, `HandlerUnlock`) and the test's own.
 */

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// Every case restores every mock after it: they are replaced before each.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import * as z from 'zod';
import { answerRead } from '../../../lib/auth/answerFailure';
import { failureOf } from '../../../lib/auth/failures';
import {
  BATCH_ENDED_WORDS,
  BATCH_MODE_OFF_WORDS,
  BATCH_UNSPLIT_WORDS,
  batchMorePartsWords,
  batchPartsMismatchWords,
} from '../../../lib/auth/serverRefusal';
import { endsCommunicationBatch } from '../../../lib/batch/batchTools';
import type { BatchAnswer } from '../../../lib/batch/InstanceBatch';
import * as connectionFactory from '../../../lib/connectionFactory';
import type {
  HandlerContext,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { HeldLocks } from '../../../lib/state/heldLocks';
import { assertMatchObject, assertNoProperty } from '../../helpers/assertions';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { envelopeResponse, statusError } from '../../helpers/batchEnvelope';
import {
  type Answer,
  batchStand,
  LOCK_HANDLE_OF_XML,
  LOCK_SUCCESS_XML,
  payloadOf,
} from '../../helpers/batchStand';
import { holding } from '../../helpers/heldLocks';
import { withinTurns } from '../../helpers/withinTurns';

beforeEach(() => {
  mock.method(connectionFactory, 'createAbapConnection', () => undefined);
  mock.method(connectionFactory, 'systemKindOf', () => 'onprem');
  // A long read outside a batch opens a connection of its own: a sibling
  // of the stand's, built by the mock above.
  mock.method(connectionFactory, 'siblingRecordOf', () => ({
    settings: {},
    credential: {},
    kind: 'onprem',
  }));
  // A view over a connection keeps its kind: the kind is mocked above.
  mock.method(connectionFactory, 'withSystemKindOf', (view: object) => view);
});

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** SAP: a lock answers its handle, an unlock nothing, `missing` 404, any other read its address. */
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
  if (inner.url.includes('missing')) {
    return { status: 404, statusText: 'Not Found', body: 'not here' };
  }
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    body: `source of ${inner.url}`,
  };
}

const TOOLS = ['HandlerGet', 'HandlerLock'];

/** The program's source, whose three versions a draft read sends. */
const DRAFT_SOURCE = '/sap/bc/adt/programs/programs/prog_a/source/main';

/** A draft read: the one part's three versions, sent together. */
const DRAFT_ARGS = {
  object_type: 'PROGRAM',
  program_name: 'PROG_A',
  part: 'draft',
};

const asAnswer = (entry: unknown) => {
  const { content, isError } = entry as BatchAnswer;
  return isError === true ? { content, isError } : { content };
};

/** connection's `refusedAgain('request')`: a refusal it words itself. */
const refusal = () =>
  authError.connection({ problem: 'refused-after-renewal', at: 'request' });

afterEach(() => mock.restoreAll());

const READ = {
  url: '/sap/bc/adt/programs/programs/prog_a/source/main',
  method: 'GET',
  timeout: 0,
} as const;

/**
 * A group serving `name` with `handler`, as the shipped groups do: two
 * parameters, so the server hands `(context, args)` by the arity.
 */
function own(
  name: string,
  handler: (context: HandlerContext) => Promise<unknown>,
): IHandlerGroup {
  return {
    getName: () => `own-${name}`,
    getHandlers: () => [
      {
        toolDefinition: {
          name,
          description: name,
          inputSchema: z.object({
            program_name: z.string().optional(),
            class_name: z.string().optional(),
          }),
        },
        call: async (context: HandlerContext, _args: unknown) =>
          handler(context),
      },
    ],
    registerHandlers: () => {},
  } as unknown as IHandlerGroup;
}

const built = (text: string) => ({
  isError: false,
  content: [{ type: 'text', text }],
});

describe('BatchEnd', () => {
  it('envelopes go on the connection BatchEnd took; none on the replaced one; the replaced one is not logged off under BatchEnd', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let entered!: () => void;
    const sent = new Promise<void>((r) => {
      entered = r;
    });
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async (parts) => {
        entered();
        await gate;
        return envelopeResponse(parts.map(sap));
      },
    });
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
      {
        content: [],
      },
    );
    const [recording] = s.built;
    // SAP ended the session between recording and BatchEnd: BatchEnd
    // takes a new connection; the recording call's is replaced.
    s.loseSession();
    const ending = s.end();
    await sent;
    const [, taken] = s.built;
    assert.equal(s.built.length, 2);
    assert.equal(recording?.calls.disconnect, 1);
    // While the envelope runs, SAP ends BatchEnd's session too: the next
    // call replaces it, and BatchEnd holds its use, so no logoff comes
    // under it.
    s.loseSession();
    const later = s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_B',
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(s.built.length, 3);
    assert.equal(taken?.calls.disconnect, 0);
    release();
    const { summary } = await ending;
    assert.deepStrictEqual(summary, { recorded: 1, sent: 1, received: 1 });
    await later;
    assert.deepStrictEqual(recording?.envelopes, []);
    assert.equal(taken?.envelopes.length, 1);
    assert.equal(taken?.calls.disconnect, 1);
    await s.close();
  });

  it('execute rejecting: mode off, a second BatchEnd refused batch_mode_off, each envelope seen once', async () => {
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async () => {
        throw Object.assign(new Error('socket hang up'), {
          code: 'ECONNRESET',
        });
      },
    });
    s.begin();
    await s.call('HandlerLock', {
      object_type: 'CLASS',
      object_name: 'CLAS_A',
    });
    await s.call('HandlerLock', {
      object_type: 'CLASS',
      object_name: 'CLAS_B',
    });
    const { answer, summary } = await s.end();
    assert.equal(answer.isError, true);
    assertMatchObject(summary, {
      origin: 'connection',
      message: 'socket hang up',
      step: 'execute',
    });
    assert.equal(s.owner.mode(), 'off');
    // No map: every number of the batch answers BatchEnd's error.
    for (const entry of await s.answers([1, 2])) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    const again = await s.call('HandlerBatch', { action: 'end' });
    assert.equal(again.isError, true);
    assert.deepStrictEqual(payloadOf(again), {
      error: 'batch_mode_off',
      message: BATCH_MODE_OFF_WORDS,
    });
    // The batch's one envelope failed; nothing twice.
    const [connection] = s.built;
    assert.deepStrictEqual(
      connection?.envelopes.map((e) => e.parts.length),
      [2],
    );
    assert.equal(s.executes.mock.callCount(), 1);
    await s.close();
  });

  it("a lock part answers the tool's lock answer with its lock handle; a read part its projection; a 404 part the C6 failure", async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    // The same tools outside batch mode, on the same SAP answers.
    const direct = [
      await s.call('HandlerLock', {
        object_type: 'CLASS',
        object_name: 'CLAS_A',
      }),
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'MISSING',
      }),
    ];
    // The LOCK phase and the read phase, each its own batch.
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerLock', {
        object_type: 'CLASS',
        object_name: 'CLAS_A',
      }),
      { content: [] },
    );
    assert.deepStrictEqual((await s.end()).summary, {
      recorded: 1,
      sent: 1,
      received: 1,
    });
    const locked = await s.answers([1]);
    s.begin();
    for (const answer of [
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'MISSING',
      }),
    ]) {
      assert.deepStrictEqual(answer, { content: [] });
    }
    const { summary } = await s.end();
    assert.deepStrictEqual(summary, { recorded: 2, sent: 2, received: 2 });
    const entries = [...locked, ...(await s.answers([1, 2]))];
    assert.deepStrictEqual(
      entries.map((e) => e.number),
      [1, 1, 2],
    );
    assert.deepStrictEqual(entries.map(asAnswer), direct);
    assert.equal(
      payloadOf(entries[0] as Answer).lock_handle,
      LOCK_HANDLE_OF_XML,
    );
    assert.ok(
      payloadOf(entries[1] as Answer).source.includes(
        'source of /sap/bc/adt/programs/programs/prog_a/source/main',
      ),
    );
    assertMatchObject(payloadOf(entries[2] as Answer), {
      origin: 'connection',
      status: 404,
      raw_body: 'not here',
    });
    await s.close();
  });

  it("a call with two independent parts answers the handler's one answer built from both, under its one number", async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    const direct = await s.call('HandlerGet', DRAFT_ARGS);
    s.begin();
    await s.call('HandlerGet', DRAFT_ARGS);
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    const { summary } = await s.end();
    assert.deepStrictEqual(summary, { recorded: 2, sent: 4, received: 4 });
    const [envelope] = s.built[0]?.envelopes ?? [];
    assert.equal(envelope?.parts.length, 4);
    const [first] = await s.answers([1]);
    assert.deepStrictEqual(asAnswer(first), direct);
    // The draft's three reads went together, ahead of the program read.
    assert.deepStrictEqual(
      envelope?.parts.slice(0, 3).map((part) => part.url),
      ['active', 'inactive', 'workingArea'].map(
        (version) => `${DRAFT_SOURCE}?version=${version}`,
      ),
    );
    await s.close();
  });

  it("an envelope answered 500: BatchEnd answers SAP's outer answer as it came, every number the same", async () => {
    const outer = () =>
      statusError(
        500,
        'Internal Server Error',
        '<html>dump placeholder</html>',
      );
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async () => {
        throw outer();
      },
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.call('HandlerGet', {
      object_type: 'INTERFACE',
      interface_name: 'INTF_A',
    });
    const { answer, summary } = await s.end();
    assert.equal(answer.isError, true);
    assert.ok(Array.isArray(summary.messages));
    assert.deepStrictEqual(summary, {
      message: 'Request failed with status code 500',
      origin: 'connection',
      step: 'execute',
      status: 500,
      messages: summary.messages,
      raw_body: '<html>dump placeholder</html>',
    });
    for (const entry of await s.answers([1, 2])) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    assert.equal(s.owner.mode(), 'off');
    await s.close();
  });

  it('BatchEnd answers { recorded, sent, received }; a 404 part is no failure of BatchEnd', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'MISSING',
    });
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.call('HandlerGet', {
      object_type: 'INTERFACE',
      interface_name: 'MISSING_TOO',
    });
    const { answer, summary } = await s.end();
    assert.ok(!answer.isError);
    assert.deepStrictEqual(summary, { recorded: 3, sent: 3, received: 3 });
    await s.close();
  });

  it('the served HandlerBatch begin opens the batch; its end and answers execute and read it', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    const begun = await s.call('HandlerBatch', { action: 'begin' });
    {
      const begunPayload = payloadOf(begun);
      assert.equal(typeof begunPayload.state_handle, 'string');
      assert.deepStrictEqual(begunPayload, {
        batch: 'on',
        state_handle: begunPayload.state_handle,
      });
    }
    assert.equal(s.owner.mode(), 'communication');
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'MISSING',
      }),
      {
        content: [],
      },
    );
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    // Nothing was sent while recording.
    assert.equal(s.built.flatMap((b) => b.envelopes).length, 0);
    const ended = await s.call('HandlerBatch', { action: 'end' });
    assert.ok(!ended.isError);
    assert.deepStrictEqual(payloadOf(ended), {
      recorded: 2,
      sent: 2,
      received: 2,
    });
    assert.equal(s.owner.mode(), 'off');
    assert.equal(s.built.flatMap((b) => b.envelopes).length, 1);
    const read = await s.call('HandlerBatch', {
      action: 'answers',
      numbers: [2, 1],
    });
    const entries = payloadOf(read) as BatchAnswer[];
    assert.deepStrictEqual(
      entries.map((e) => [e.number, e.isError === true]),
      [
        [2, false],
        [1, true],
      ],
    );
    assert.deepStrictEqual(await s.answers([2, 1]), entries);
    await s.close();
  });

  it('empty batch answers { recorded: 0, sent: 0, received: 0 } and replaces the map with an empty one', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.end();
    assertMatchObject((await s.answers([1]))[0], { number: 1 });
    assertNoProperty((await s.answers([1]))[0], 'error');
    s.begin();
    const { summary } = await s.end();
    assert.deepStrictEqual(summary, { recorded: 0, sent: 0, received: 0 });
    assert.deepStrictEqual(await s.answers([1]), [
      { number: 1, error: 'no_answer', message: 'no answer with that number' },
    ]);
    assert.equal(s.built[0]?.envelopes.length, 1);
    assert.equal(s.owner.mode(), 'off');
    assert.equal(s.owner.holdsState(), false);
    await s.close();
  });

  it('credential refusal (own refusal.kind, refusal.reason, at; no response): BatchEnd answers it as answerRead does, no map, every number read answers it, mode off', async () => {
    const refused = new AuthRefusedError(refusal(), 'request');
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async () => {
        throw refused;
      },
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'INTERFACE',
      interface_name: 'INTF_A',
    });
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.call('HandlerGet', { object_type: 'CLASS', class_name: 'CLAS_A' });
    const { answer } = await s.end();
    const read = failureOf(refused);
    assert.equal(read?.error, 'authentication_failed');
    const expected = answerRead(read as never);
    assert.deepStrictEqual(answer, {
      content: expected.content,
      isError: true,
    });
    assert.equal(s.owner.mode(), 'off');
    const entries = await s.answers([1, 2, 3]);
    for (const entry of entries) {
      assert.deepStrictEqual(asAnswer(entry), {
        content: expected.content,
        isError: true,
      });
    }
    // The batch's one envelope went out; nothing after it.
    assert.equal(s.built[0]?.envelopes.length, 1);
    await s.close();
  });

  it('answered refusal (cause.response.status === 401): BatchEnd answers it as it came; no map, every number read answers the same refusal', async () => {
    const refused = new AuthRefusedError(
      refusal(),
      'request',
      statusError(401, 'Unauthorized'),
    );
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async () => {
        throw refused;
      },
    });
    s.begin();
    await s.call('HandlerLock', {
      object_type: 'CLASS',
      object_name: 'CLAS_A',
    });
    await s.call('HandlerLock', {
      object_type: 'CLASS',
      object_name: 'CLAS_B',
    });
    const { answer } = await s.end();
    const expected = answerRead(failureOf(refused) as never);
    assert.deepStrictEqual(answer, {
      content: expected.content,
      isError: true,
    });
    assert.equal(s.owner.mode(), 'off');
    for (const entry of await s.answers([1, 2])) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    assert.equal(s.built[0]?.envelopes.length, 1);
    await s.close();
  });

  it('a resolve failing at BatchEnd: the call answers it, mode off, no map, every number read answers it as it came, nothing sent', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.call('HandlerGet', { object_type: 'CLASS', class_name: 'CLAS_A' });
    s.failResolve(new AuthRefusedError(refusal(), 'logon'));
    const { answer } = await s.end();
    assert.equal(answer.isError, true);
    assert.equal(payloadOf(answer).error, 'authentication_failed');
    assert.equal(s.owner.mode(), 'off');
    const entries = await s.answers([1, 2]);
    for (const entry of entries) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    assert.equal(s.executes.mock.callCount(), 0);
    assert.deepStrictEqual(
      s.built.flatMap((b) => b.envelopes),
      [],
    );
    assert.deepStrictEqual(
      s.built.flatMap((b) => b.directs),
      [],
    );
    // Ended: a second BatchEnd is refused, and nothing recorded is sent.
    assert.equal(
      payloadOf(await s.call('HandlerBatch', { action: 'end' })).error,
      'batch_mode_off',
    );
    assert.equal(s.executes.mock.callCount(), 0);
    await s.close();
  });

  it('keepRawParts off: no raw; on: raw is one entry per part, in the order sent, each { status, status_text, headers, body: "" for a bodyless 200 }', async () => {
    const off = await batchStand({ tools: TOOLS, part: sap });
    off.begin();
    await off.call('HandlerGet', DRAFT_ARGS);
    await off.end();
    assertNoProperty((await off.answers([1]))[0], 'raw');
    await off.close();

    const on = await batchStand({
      tools: TOOLS,
      part: sap,
      keepRawParts: true,
      // The instance locked what it unlocks.
      heldLocks: holding(LOCK_HANDLE_OF_XML),
    });
    on.begin();
    await on.call('HandlerGet', DRAFT_ARGS);
    await on.end();
    const [read] = await on.answers([1]);
    on.begin();
    await on.call('HandlerLock', {
      action: 'unlock',
      object_type: 'CLASS',
      object_name: 'CLAS_A',
      lock_handle: LOCK_HANDLE_OF_XML,
    });
    await on.end();
    const [unlock] = await on.answers([1]);
    assert.deepStrictEqual(
      (read as BatchAnswer).raw,
      ['active', 'inactive', 'workingArea'].map((version) => ({
        status: 200,
        status_text: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: `source of ${DRAFT_SOURCE}?version=${version}`,
      })),
    );
    assert.deepStrictEqual((unlock as BatchAnswer).raw, [
      { status: 200, status_text: 'OK', headers: {}, body: '' },
    ]);
    await on.close();
  });

  it("LOCK, read, UNLOCK, read as four phases, each its own batch: one envelope each, each number its own call's answer", async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    const direct = [
      await s.call('HandlerLock', {
        object_type: 'CLASS',
        object_name: 'CLAS_A',
      }),
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
      await s.call('HandlerLock', {
        action: 'unlock',
        object_type: 'CLASS',
        object_name: 'CLAS_A',
        lock_handle: LOCK_HANDLE_OF_XML,
      }),
      await s.call('HandlerGet', {
        object_type: 'INTERFACE',
        interface_name: 'INTF_A',
      }),
    ];
    const entries: unknown[] = [];
    for (const [name, args] of [
      ['HandlerLock', { object_type: 'CLASS', object_name: 'CLAS_A' }],
      ['HandlerGet', { object_type: 'PROGRAM', program_name: 'PROG_A' }],
      [
        'HandlerLock',
        {
          action: 'unlock',
          object_type: 'CLASS',
          object_name: 'CLAS_A',
          lock_handle: LOCK_HANDLE_OF_XML,
        },
      ],
      ['HandlerGet', { object_type: 'INTERFACE', interface_name: 'INTF_A' }],
    ] as const) {
      s.begin();
      await s.call(name, args);
      assert.deepStrictEqual((await s.end()).summary, {
        recorded: 1,
        sent: 1,
        received: 1,
      });
      entries.push(...(await s.answers([1])));
    }
    assert.deepStrictEqual(
      s.built[0]?.envelopes.map((e) => ({
        session: e.session,
        parts: e.parts.map((p) => p.method),
      })),
      [
        { session: 'stateful', parts: ['POST'] },
        { session: 'stateless', parts: ['GET'] },
        { session: 'stateful', parts: ['POST'] },
        { session: 'stateless', parts: ['GET'] },
      ],
    );
    assert.deepStrictEqual(entries.map(asAnswer), direct);
    await s.close();
  });

  it("a batch begun after BatchEnd's batch ended is not ended by BatchEnd's failure", async () => {
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async () => {
        throw new AuthRefusedError(refusal(), 'request');
      },
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    const first = s.owner.opened();
    // The moment BatchEnd's batch ends, before its failure reaches the
    // dispatch's catch, the next batch begins.
    let begun = false;
    s.owner.observe(() => {
      if (!begun && s.owner.opened() === undefined) {
        begun = true;
        s.begin();
      }
    });
    const { answer } = await s.end();
    assert.equal(answer.isError, true);
    assert.equal(s.owner.mode(), 'communication');
    assert.notEqual(s.owner.opened(), first);
    await s.close();
  });

  it("a recorded handler that throws: its number answers the handler's failure, nothing rejects", async () => {
    const throwing = {
      getName: () => 'throwing',
      getHandlers: () => [
        {
          toolDefinition: {
            name: 'HandlerProfileList',
            description: 'HandlerProfileList',
            inputSchema: z.object({ program_name: z.string().optional() }),
          },
          // Two parameters: the server hands `(context, args)` by the arity.
          call: async (context: HandlerContext, _args: unknown) => {
            await context.connection.makeAdtRequest({
              url: '/sap/bc/adt/programs/programs/prog_a/source/main',
              method: 'GET',
              timeout: 0,
            });
            throw new Error('the handler failed after its part');
          },
        },
      ],
      registerHandlers: () => {},
    } as unknown as IHandlerGroup;
    const s = await batchStand({
      tools: ['HandlerServiceBindingListTypes'],
      part: sap,
      groups: [throwing],
    });
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerProfileList', { program_name: 'PROG_A' }),
      {
        content: [],
      },
    );
    assert.deepStrictEqual(
      await s.call('HandlerServiceBindingListTypes', { class_name: 'CL_A' }),
      {
        content: [],
      },
    );
    const { answer, summary } = await s.end();
    assert.ok(!answer.isError);
    assert.deepStrictEqual(summary, { recorded: 2, sent: 2, received: 2 });
    const [first, second] = await s.answers([1, 2]);
    assertMatchObject(first, { number: 1, isError: true });
    assert.ok(
      JSON.stringify((first as BatchAnswer | undefined)?.content).includes(
        'the handler failed after its part',
      ),
    );
    assert.equal(second?.number, 2);
    assert.equal((second as BatchAnswer | undefined)?.isError, undefined);
    assert.equal(s.executes.mock.callCount(), 1);
    await s.close();
  });

  it("the dispatch ends the batch on a failure of HandlerBatch with action 'end' alone", () => {
    assert.equal(
      endsCommunicationBatch('HandlerBatch', { action: 'end' }),
      true,
    );
    for (const action of ['begin', 'answers', undefined]) {
      assert.equal(endsCommunicationBatch('HandlerBatch', { action }), false);
    }
    // The full set's tools of that name are gone; none ends a batch.
    for (const tool of [
      'BatchBegin',
      'BatchEnd',
      'BatchAnswers',
      'DebugBatchEnd',
      'DebugBatchAnswers',
      'GetProgram',
    ]) {
      assert.equal(endsCommunicationBatch(tool, { action: 'end' }), false);
    }
  });
});

describe('BatchEnd splits, the read answers', () => {
  it("BatchEnd resumes no handler: a handler's code after its request runs only when its number is read", async () => {
    let after = false;
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('HandlerProfileList', async (context) => {
          await context.connection.makeAdtRequest(READ);
          after = true;
          return built('built when read');
        }),
      ],
    });
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerProfileList', { program_name: 'PROG_A' }),
      {
        content: [],
      },
    );
    const { answer, summary } = await s.end();
    assert.ok(!answer.isError);
    assert.deepStrictEqual(summary, { recorded: 1, sent: 1, received: 1 });
    assert.equal(after, false);
    const [entry] = await s.answers([1]);
    assert.equal(after, true);
    assert.deepStrictEqual(asAnswer(entry), {
      content: [{ type: 'text', text: 'built when read' }],
    });
    await s.close();
  });

  it('the numbers asked in one BatchAnswers are processed in parallel', async () => {
    let resumed = 0;
    let bothResumed!: () => void;
    const both = new Promise<void>((resolve) => {
      bothResumed = resolve;
    });
    // Each handler, resumed, waits until the other is resumed too: read one
    // after the other, the first would wait for ever.
    const waitsForTheOther =
      (text: string) => async (context: HandlerContext) => {
        await context.connection.makeAdtRequest(READ);
        resumed += 1;
        if (resumed === 2) bothResumed();
        await both;
        return built(text);
      };
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('HandlerProfileList', waitsForTheOther('first')),
        own('HandlerServiceBindingListTypes', waitsForTheOther('second')),
      ],
    });
    s.begin();
    await s.call('HandlerProfileList', { program_name: 'PROG_A' });
    await s.call('HandlerServiceBindingListTypes', { class_name: 'CLAS_B' });
    await s.end();
    const entries = await withinTurns(s.answers([1, 2]), 500);
    assert.deepStrictEqual(entries.map(asAnswer), [
      { content: [{ type: 'text', text: 'first' }] },
      { content: [{ type: 'text', text: 'second' }] },
    ]);
    await s.close();
  });

  it('a number read twice runs its handler once: the answer is kept', async () => {
    let runs = 0;
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('HandlerProfileList', async (context) => {
          await context.connection.makeAdtRequest(READ);
          runs += 1;
          return built(`run ${runs}`);
        }),
      ],
    });
    s.begin();
    await s.call('HandlerProfileList', { program_name: 'PROG_A' });
    await s.end();
    const twice = await s.answers([1, 1]);
    const again = await s.answers([1]);
    assert.equal(runs, 1);
    assert.deepStrictEqual(
      [...twice, ...again].map(asAnswer),
      new Array(3).fill({ content: [{ type: 'text', text: 'run 1' }] }),
    );
    await s.close();
  });

  it("a resumed handler's further request is refused batch_ended, and that is its answer; nothing is sent", async () => {
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('HandlerProfileList', async (context) => {
          await context.connection.makeAdtRequest(READ);
          await context.connection.makeAdtRequest({
            ...READ,
            url: '/sap/bc/adt/programs/programs/prog_a',
          });
          return built('never');
        }),
      ],
    });
    s.begin();
    await s.call('HandlerProfileList', { program_name: 'PROG_A' });
    assert.deepStrictEqual((await s.end()).summary, {
      recorded: 1,
      sent: 1,
      received: 1,
    });
    const [entry] = await s.answers([1]);
    {
      const asked = asAnswer(entry);
      assert.ok(Array.isArray(asked.content));
      assert.deepStrictEqual(asked, { content: asked.content, isError: true });
    }
    assert.deepStrictEqual(payloadOf(entry as Answer), {
      error: 'batch_ended',
      message: BATCH_ENDED_WORDS,
    });
    assert.equal(s.built.flatMap((b) => b.envelopes).length, 1);
    assert.deepStrictEqual(
      s.built.flatMap((b) => b.directs),
      [],
    );
    await s.close();
  });

  it('a number never read is awaited by nothing: replacing the map lets its handler finish', async () => {
    let finished = false;
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('HandlerProfileList', async (context) => {
          try {
            await context.connection.makeAdtRequest(READ);
            return built('read');
          } finally {
            finished = true;
          }
        }),
      ],
    });
    s.begin();
    await s.call('HandlerProfileList', { program_name: 'PROG_A' });
    await s.end();
    for (let turn = 0; turn < 20; turn += 1) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(finished, false);
    // The next batch's end replaces the map: number 1 is never read.
    s.begin();
    await s.end();
    for (let turn = 0; turn < 20 && !finished; turn += 1) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(finished, true);
    assert.deepStrictEqual(await s.answers([1]), [
      { number: 1, error: 'no_answer', message: 'no answer with that number' },
    ]);
    await s.close();
  });
});

describe("BatchEnd's error, no map", () => {
  /** A batch of two recorded calls whose handlers note when they run on. */
  async function twoCalls(
    envelope: Parameters<typeof batchStand>[0]['envelope'],
  ) {
    const ran: string[] = [];
    const noting = (name: string) => async (context: HandlerContext) => {
      await context.connection.makeAdtRequest(READ);
      ran.push(name);
      return built(name);
    };
    const s = await batchStand({
      tools: [],
      part: sap,
      envelope,
      groups: [
        own('HandlerProfileList', noting('a')),
        own('HandlerServiceBindingListTypes', noting('b')),
      ],
    });
    s.begin();
    await s.call('HandlerProfileList', { program_name: 'PROG_A' });
    await s.call('HandlerServiceBindingListTypes', { class_name: 'CLAS_B' });
    return { s, ran };
  }

  it('fewer parts than requests: batch_parts_mismatch, every number answers it, no handler resumed', async () => {
    const { s, ran } = await twoCalls(async (parts) =>
      envelopeResponse(parts.slice(0, 1).map(sap)),
    );
    const { answer, summary } = await s.end();
    assert.equal(answer.isError, true);
    assert.deepStrictEqual(summary, {
      error: 'batch_parts_mismatch',
      message: batchPartsMismatchWords(1, 2),
    });
    assert.equal(
      batchPartsMismatchWords(1, 2),
      '1 of 2 parts came; the answers cannot be matched to the calls',
    );
    for (const entry of await s.answers([1, 2])) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    assert.deepStrictEqual(ran, []);
    assert.equal(s.owner.mode(), 'off');
    await s.close();
  });

  it('an answer that cannot be split: batch_unsplit, every number answers it, no handler resumed', async () => {
    const { s, ran } = await twoCalls(async () => ({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      data: 'not a multipart answer',
    }));
    const { answer, summary } = await s.end();
    assert.equal(answer.isError, true);
    assert.deepStrictEqual(summary, {
      error: 'batch_unsplit',
      message: BATCH_UNSPLIT_WORDS,
    });
    assert.equal(
      BATCH_UNSPLIT_WORDS,
      "the envelope's answer could not be split into the calls' parts",
    );
    for (const entry of await s.answers([1, 2])) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    assert.deepStrictEqual(ran, []);
    await s.close();
  });

  it('the kept map is replaced by none: a number of the failed batch answers its error, any other no answer', async () => {
    let fail = false;
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async (parts) => {
        if (fail) {
          throw Object.assign(new Error('socket hang up'), {
            code: 'ECONNRESET',
          });
        }
        return envelopeResponse(parts.map(sap));
      },
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_B',
    });
    await s.end();
    assertNoProperty((await s.answers([2]))[0], 'error');
    fail = true;
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_C',
    });
    const { answer } = await s.end();
    assert.equal(answer.isError, true);
    const [first, second] = await s.answers([1, 2]);
    assert.deepStrictEqual(asAnswer(first), answer);
    assert.deepStrictEqual(second, {
      number: 2,
      error: 'no_answer',
      message: 'no answer with that number',
    });
    await s.close();
  });
});

describe('a lock read by number', () => {
  const LOCK = { object_type: 'CLASS', object_name: 'CLAS_A' };

  it("is held by the instance once its number is read, in the session BatchEnd sent it on — also when that session replaced the recording call's", async () => {
    const heldLocks = new HeldLocks();
    const s = await batchStand({ tools: TOOLS, part: sap, heldLocks });
    s.begin();
    await s.call('HandlerLock', LOCK);
    // SAP ended the recording call's session: BatchEnd sends on a new one.
    s.loseSession();
    await s.end();
    assert.equal(s.built.length, 2);
    assert.equal(heldLocks.holds(LOCK_HANDLE_OF_XML), false); // not read yet
    const [entry] = await s.answers([1]);
    assert.equal(payloadOf(entry as Answer).lock_handle, LOCK_HANDLE_OF_XML);
    assert.equal(heldLocks.holds(LOCK_HANDLE_OF_XML), true);
    await s.close();
  });

  it("read after the instance's SAP session ended: answers the lock, and the instance holds it no more", async () => {
    const heldLocks = new HeldLocks();
    const s = await batchStand({
      tools: [...TOOLS, 'HandlerServiceBindingListTypes'],
      part: sap,
      heldLocks,
    });
    s.begin();
    await s.call('HandlerLock', LOCK);
    await s.end();
    // SAP ends the session the lock lives in; the next call (a read on the
    // instance's own connection) replaces it.
    s.loseSession();
    await s.call('HandlerServiceBindingListTypes', {});
    assert.equal(s.built.length, 2);
    const [entry] = await s.answers([1]);
    assert.equal((entry as BatchAnswer).isError, undefined);
    assert.equal(payloadOf(entry as Answer).lock_handle, LOCK_HANDLE_OF_XML);
    assert.equal(heldLocks.holds(LOCK_HANDLE_OF_XML), false);
    // A write under it is refused here, sending nothing.
    assert.equal(heldLocks.holdsState(), false);
    await s.close();
  });
});

describe('BatchEnd: more parts than requests', () => {
  it('batch_parts_mismatch in words that say more came, never "<n> of <n>"', async () => {
    const s = await batchStand({
      tools: [],
      part: sap,
      envelope: async (parts) =>
        envelopeResponse([...parts, ...parts].map(sap)),
      groups: [
        own('HandlerProfileList', async (context) => {
          await context.connection.makeAdtRequest(READ);
          return built('a');
        }),
      ],
    });
    s.begin();
    await s.call('HandlerProfileList', { program_name: 'PROG_A' });
    const { answer, summary } = await s.end();
    assert.equal(answer.isError, true);
    assert.deepStrictEqual(summary, {
      error: 'batch_parts_mismatch',
      message: batchMorePartsWords(1),
    });
    assert.equal(
      batchMorePartsWords(1),
      'more parts came than the 1 requests sent; the answers cannot be matched to the calls',
    );
    for (const entry of await s.answers([1])) {
      assert.deepStrictEqual(asAnswer(entry), answer);
    }
    await s.close();
  });
});

describe('a resumed handler reaching the connection after its part', () => {
  for (const member of ['getBaseUrl', 'connect'] as const) {
    it(
      format('%s is refused batch_ended, and that is its answer', member),
      async () => {
        const s = await batchStand({
          tools: [],
          part: sap,
          groups: [
            own('HandlerProfileList', async (context) => {
              await context.connection.makeAdtRequest(READ);
              await context.connection[member]();
              return built('never');
            }),
          ],
        });
        s.begin();
        await s.call('HandlerProfileList', { program_name: 'PROG_A' });
        await s.end();
        const [entry] = await s.answers([1]);
        assert.deepStrictEqual(payloadOf(entry as Answer), {
          error: 'batch_ended',
          message: BATCH_ENDED_WORDS,
        });
        await s.close();
      },
    );
  }
});

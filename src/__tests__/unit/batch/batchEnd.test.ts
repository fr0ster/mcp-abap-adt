/**
 * `BatchEnd` (spec §5): the open communication batch executed on the
 * connection `BatchEnd` took, every recorded call's answer the one its
 * handler builds from what came, batch mode off whatever fails.
 *
 * The batch connection is adt-clients' own `AdtBatchConnection`; every built
 * connection is a fake that answers envelopes part by part (`batchStand`).
 * The batch tools are the served ones (`BatchEnd`, `BatchAnswers`,
 * `HandlerBatch`); the dispatch is the real one.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { answerRead } from '../../../lib/auth/answerFailure';
import { failureOf } from '../../../lib/auth/failures';
import { BATCH_MODE_OFF_WORDS } from '../../../lib/auth/serverRefusal';
import { endsCommunicationBatch } from '../../../lib/batch/batchTools';
import type { BatchAnswer } from '../../../lib/batch/InstanceBatch';
import type {
  HandlerContext,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { envelopeResponse, statusError } from '../../helpers/batchEnvelope';
import {
  type Answer,
  batchStand,
  LOCK_HANDLE_OF_XML,
  LOCK_SUCCESS_XML,
  payloadOf,
} from '../../helpers/batchStand';

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

const TOOLS = [
  'GetProgram',
  'GetClass',
  'HandlerLock',
  'HandlerUnlock',
  'GetInterface',
  'GetObjectVersionDiff',
];

const VERSION_FROM =
  '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00001';
const VERSION_TO = '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00002';
const DIFF_ARGS = {
  object_type: 'class',
  content_uri_from: VERSION_FROM,
  content_uri_to: VERSION_TO,
};

const asAnswer = (entry: unknown) => {
  const { content, isError } = entry as BatchAnswer;
  return isError === true ? { content, isError } : { content };
};

/** connection's `refusedAgain('request')`: a refusal it words itself. */
const refusal = () =>
  authError.connection({ problem: 'refused-after-renewal', at: 'request' });

afterEach(() => jest.restoreAllMocks());

describe('BatchEnd', () => {
  it('envelopes go on the connection BatchEnd took; none on the retired one; the retired one is not logged off under BatchEnd', async () => {
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
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    const [recording] = s.built;
    // A new credential object between recording and BatchEnd: BatchEnd
    // takes a new connection; the recording call's is retired.
    s.newCredential();
    const ending = s.end();
    await sent;
    const [, taken] = s.built;
    expect(s.built).toHaveLength(2);
    expect(recording?.connection.disconnect).toHaveBeenCalledTimes(1);
    // While the envelope runs, another credential retires BatchEnd's
    // connection too: BatchEnd holds its use, so no logoff comes under it.
    s.newCredential();
    const later = s.call('GetProgram', { program_name: 'PROG_B' });
    await new Promise((r) => setImmediate(r));
    expect(s.built).toHaveLength(3);
    expect(taken?.connection.disconnect).not.toHaveBeenCalled();
    release();
    const { summary } = await ending;
    expect(summary).toEqual({ recorded: 1, failed: [] });
    await later;
    expect(recording?.envelopes).toEqual([]);
    expect(taken?.envelopes).toHaveLength(1);
    expect(taken?.connection.disconnect).toHaveBeenCalledTimes(1);
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
    expect(answer.isError).toBeFalsy();
    expect(summary).toMatchObject({ recorded: 2, failed: [1, 2] });
    expect(summary.came).toMatchObject({
      origin: 'connection',
      message: 'socket hang up',
      step: 'execute',
    });
    expect(s.owner.mode()).toBe('off');
    const again = await s.call('BatchEnd');
    expect(again.isError).toBe(true);
    expect(payloadOf(again)).toEqual({
      error: 'batch_mode_off',
      message: BATCH_MODE_OFF_WORDS,
    });
    // The batch's one envelope failed; nothing twice.
    const [connection] = s.built;
    expect(connection?.envelopes.map((e) => e.parts.length)).toEqual([2]);
    expect(s.executes).toHaveBeenCalledTimes(1);
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
      await s.call('GetProgram', { program_name: 'PROG_A' }),
      await s.call('GetProgram', { program_name: 'MISSING' }),
    ];
    // The LOCK phase and the read phase, each its own batch.
    s.begin();
    expect(
      await s.call('HandlerLock', {
        object_type: 'CLASS',
        object_name: 'CLAS_A',
      }),
    ).toEqual({ content: [] });
    expect((await s.end()).summary).toEqual({ recorded: 1, failed: [] });
    const locked = await s.answers([1]);
    s.begin();
    for (const answer of [
      await s.call('GetProgram', { program_name: 'PROG_A' }),
      await s.call('GetProgram', { program_name: 'MISSING' }),
    ]) {
      expect(answer).toEqual({ content: [] });
    }
    const { summary } = await s.end();
    expect(summary).toEqual({ recorded: 2, failed: [2] });
    const entries = [...locked, ...(await s.answers([1, 2]))];
    expect(entries.map((e) => e.number)).toEqual([1, 1, 2]);
    expect(entries.map(asAnswer)).toEqual(direct);
    expect(payloadOf(entries[0] as Answer).lock_handle).toBe(
      LOCK_HANDLE_OF_XML,
    );
    expect(payloadOf(entries[1] as Answer).source).toContain(
      'source of /sap/bc/adt/programs/programs/prog_a/source/main',
    );
    expect(payloadOf(entries[2] as Answer)).toMatchObject({
      origin: 'connection',
      status: 404,
      raw_body: 'not here',
    });
    await s.close();
  });

  it("a call with two independent parts answers the handler's one answer built from both, under its one number", async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    const direct = await s.call('GetObjectVersionDiff', DIFF_ARGS);
    s.begin();
    await s.call('GetObjectVersionDiff', DIFF_ARGS);
    await s.call('GetProgram', { program_name: 'PROG_A' });
    const { summary } = await s.end();
    expect(summary).toEqual({ recorded: 2, failed: [] });
    const [envelope] = s.built[0]?.envelopes ?? [];
    expect(envelope?.parts).toHaveLength(3);
    const [first] = await s.answers([1]);
    expect(asAnswer(first)).toEqual(direct);
    expect(JSON.stringify(first)).toContain(`source of ${VERSION_FROM}`);
    expect(JSON.stringify(first)).toContain(`source of ${VERSION_TO}`);
    await s.close();
  });

  it("an envelope answered 500: every part's answer and BatchEnd's carry it as it came", async () => {
    // Outside batch mode, the same tools on a request SAP answers 500 the same way.
    const plain = await batchStand({
      tools: TOOLS,
      part: () => ({
        status: 500,
        statusText: 'Internal Server Error',
        body: '<html>dump placeholder</html>',
      }),
    });
    const direct = [
      await plain.call('GetProgram', { program_name: 'PROG_A' }),
      await plain.call('GetInterface', { interface_name: 'INTF_A' }),
    ];
    await plain.close();
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
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetInterface', { interface_name: 'INTF_A' });
    const { summary } = await s.end();
    expect(summary).toEqual({
      recorded: 2,
      failed: [1, 2],
      came: {
        message: 'Request failed with status code 500',
        origin: 'connection',
        step: 'execute',
        status: 500,
        messages: expect.any(Array),
        raw_body: '<html>dump placeholder</html>',
      },
    });
    const entries = await s.answers([1, 2]);
    for (const [index, entry] of entries.entries()) {
      expect(payloadOf(entry as Answer)).toMatchObject({
        status: 500,
        raw_body: '<html>dump placeholder</html>',
      });
      // As the tool answers SAP's 500 outside batch mode, but for the
      // request: the envelope's failure names none of the call's own.
      const { request: _a, ...inBatch } = payloadOf(entry as Answer);
      const { request: _b, ...outside } = payloadOf(direct[index] as Answer);
      expect(inBatch).toEqual(outside);
    }
    await s.close();
  });

  it('the one envelope failing with no answer: every part answers that failure, none "not sent"', async () => {
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
    await s.end();
    for (const entry of await s.answers([1, 2])) {
      expect((entry as BatchAnswer).isError).toBe(true);
      expect(payloadOf(entry as Answer).message).toBe('socket hang up');
    }
    expect(s.built[0]?.envelopes).toHaveLength(1);
    await s.close();
  });

  it('summary { recorded, failed }', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('GetProgram', { program_name: 'MISSING' });
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetInterface', { interface_name: 'MISSING_TOO' });
    const { answer, summary } = await s.end();
    expect(answer.isError).toBeFalsy();
    expect(summary).toEqual({ recorded: 3, failed: [1, 3] });
    await s.close();
  });

  it("the served BatchBegin opens the batch; HandlerBatch's end and answers execute and read it as BatchEnd and BatchAnswers do", async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    const begun = await s.call('BatchBegin');
    expect(payloadOf(begun)).toEqual({
      batch: 'on',
      state_handle: expect.any(String),
    });
    expect(s.owner.mode()).toBe('communication');
    expect(await s.call('GetProgram', { program_name: 'MISSING' })).toEqual({
      content: [],
    });
    await s.call('GetProgram', { program_name: 'PROG_A' });
    // Nothing was sent while recording.
    expect(s.built.flatMap((b) => b.envelopes)).toHaveLength(0);
    const ended = await s.call('HandlerBatch', { action: 'end' });
    expect(ended.isError).toBeFalsy();
    expect(payloadOf(ended)).toEqual({ recorded: 2, failed: [1] });
    expect(s.owner.mode()).toBe('off');
    expect(s.built.flatMap((b) => b.envelopes)).toHaveLength(1);
    const read = await s.call('HandlerBatch', {
      action: 'answers',
      numbers: [2, 1],
    });
    const entries = payloadOf(read) as BatchAnswer[];
    expect(entries.map((e) => [e.number, e.isError === true])).toEqual([
      [2, false],
      [1, true],
    ]);
    expect(await s.answers([2, 1])).toEqual(entries);
    await s.close();
  });

  it('empty batch answers { recorded: 0, failed: [] } and replaces the answers with none', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.end();
    expect((await s.answers([1]))[0]).toMatchObject({ number: 1 });
    expect((await s.answers([1]))[0]).not.toHaveProperty('error');
    s.begin();
    const { summary } = await s.end();
    expect(summary).toEqual({ recorded: 0, failed: [] });
    expect(await s.answers([1])).toEqual([
      { number: 1, error: 'no_answer', message: 'no answer with that number' },
    ]);
    expect(s.built[0]?.envelopes).toHaveLength(1);
    expect(s.owner.mode()).toBe('off');
    expect(s.owner.holdsState()).toBe(false);
    await s.close();
  });

  it('credential refusal (own refusal.kind, refusal.reason, at; no response): BatchEnd answers it as answerRead does, every number answers it, mode off', async () => {
    const refused = new AuthRefusedError(refusal(), 'request');
    const s = await batchStand({
      tools: TOOLS,
      part: sap,
      envelope: async () => {
        throw refused;
      },
    });
    s.begin();
    await s.call('GetInterface', { interface_name: 'INTF_A' });
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetClass', { class_name: 'CLAS_A' });
    const { answer } = await s.end();
    const read = failureOf(refused);
    expect(read?.error).toBe('authentication_failed');
    const expected = answerRead(read as never);
    expect(answer).toEqual({
      content: expected.content,
      isError: true,
    });
    expect(s.owner.mode()).toBe('off');
    const entries = await s.answers([1, 2, 3]);
    for (const entry of entries) {
      expect(asAnswer(entry)).toEqual({
        content: expected.content,
        isError: true,
      });
    }
    // The batch's one envelope went out; nothing after it.
    expect(s.built[0]?.envelopes).toHaveLength(1);
    await s.close();
  });

  it("answered refusal (cause.response.status === 401): BatchEnd answers it; every part of the one envelope its handler's answer for it", async () => {
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
    expect(answer).toEqual({ content: expected.content, isError: true });
    expect(s.owner.mode()).toBe('off');
    // SAP answered: each handler reads SAP's 401 as the method's error.
    for (const lock of await s.answers([1, 2])) {
      expect((lock as BatchAnswer).isError).toBe(true);
      expect(payloadOf(lock as Answer)).toMatchObject({
        origin: 'connection',
        status: 401,
        message: failureOf(refused)?.message,
      });
    }
    expect(s.built[0]?.envelopes).toHaveLength(1);
    await s.close();
  });

  it("a resolve failing at BatchEnd: the call answers it, mode off, every recorded call's answer is it, nothing sent", async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetClass', { class_name: 'CLAS_A' });
    s.failResolve(new AuthRefusedError(refusal(), 'logon'));
    const { answer } = await s.end();
    expect(answer.isError).toBe(true);
    expect(payloadOf(answer).error).toBe('authentication_failed');
    expect(s.owner.mode()).toBe('off');
    const entries = await s.answers([1, 2]);
    for (const entry of entries) {
      expect(asAnswer(entry)).toEqual(answer);
    }
    expect(s.executes).not.toHaveBeenCalled();
    expect(s.built.flatMap((b) => b.envelopes)).toEqual([]);
    expect(s.built.flatMap((b) => b.directs)).toEqual([]);
    // Ended: a second BatchEnd is refused, and nothing recorded is sent.
    expect(payloadOf(await s.call('BatchEnd')).error).toBe('batch_mode_off');
    expect(s.executes).not.toHaveBeenCalled();
    await s.close();
  });

  it('keepRawParts off: no raw; on: raw is one entry per part, in the order sent, each { status, status_text, headers, body: "" for a bodyless 200 }', async () => {
    const off = await batchStand({ tools: TOOLS, part: sap });
    off.begin();
    await off.call('GetObjectVersionDiff', DIFF_ARGS);
    await off.end();
    expect((await off.answers([1]))[0]).not.toHaveProperty('raw');
    await off.close();

    const on = await batchStand({
      tools: TOOLS,
      part: sap,
      keepRawParts: true,
    });
    on.begin();
    await on.call('GetObjectVersionDiff', DIFF_ARGS);
    await on.end();
    const [read] = await on.answers([1]);
    on.begin();
    await on.call('HandlerUnlock', {
      object_type: 'CLASS',
      object_name: 'CLAS_A',
      lock_handle: LOCK_HANDLE_OF_XML,
    });
    await on.end();
    const [unlock] = await on.answers([1]);
    expect((read as BatchAnswer).raw).toEqual([
      {
        status: 200,
        status_text: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: `source of ${VERSION_FROM}`,
      },
      {
        status: 200,
        status_text: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: `source of ${VERSION_TO}`,
      },
    ]);
    expect((unlock as BatchAnswer).raw).toEqual([
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
      await s.call('GetProgram', { program_name: 'PROG_A' }),
      await s.call('HandlerUnlock', {
        object_type: 'CLASS',
        object_name: 'CLAS_A',
        lock_handle: LOCK_HANDLE_OF_XML,
      }),
      await s.call('GetInterface', { interface_name: 'INTF_A' }),
    ];
    const entries: unknown[] = [];
    for (const [name, args] of [
      ['HandlerLock', { object_type: 'CLASS', object_name: 'CLAS_A' }],
      ['GetProgram', { program_name: 'PROG_A' }],
      [
        'HandlerUnlock',
        {
          object_type: 'CLASS',
          object_name: 'CLAS_A',
          lock_handle: LOCK_HANDLE_OF_XML,
        },
      ],
      ['GetInterface', { interface_name: 'INTF_A' }],
    ] as const) {
      s.begin();
      await s.call(name, args);
      expect((await s.end()).summary).toEqual({ recorded: 1, failed: [] });
      entries.push(...(await s.answers([1])));
    }
    expect(
      s.built[0]?.envelopes.map((e) => ({
        session: e.session,
        parts: e.parts.map((p) => p.method),
      })),
    ).toEqual([
      { session: 'stateful', parts: ['POST'] },
      { session: 'stateless', parts: ['GET'] },
      { session: 'stateful', parts: ['POST'] },
      { session: 'stateless', parts: ['GET'] },
    ]);
    expect(entries.map(asAnswer)).toEqual(direct);
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
    await s.call('GetProgram', { program_name: 'PROG_A' });
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
    expect(answer.isError).toBe(true);
    expect(s.owner.mode()).toBe('communication');
    expect(s.owner.opened()).not.toBe(first);
    await s.close();
  });

  it("a recorded handler that throws: its number answers the handler's failure, the summary lists it, nothing rejects", async () => {
    const throwing = {
      getName: () => 'throwing',
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
          // Two parameters: the server hands `(context, args)` by the arity.
          handler: async (context: HandlerContext, _args: unknown) => {
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
      tools: ['GetClass'],
      part: sap,
      groups: [throwing],
    });
    s.begin();
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    expect(await s.call('GetClass', { class_name: 'CL_A' })).toEqual({
      content: [],
    });
    const { answer, summary } = await s.end();
    expect(answer.isError).toBeFalsy();
    expect(summary).toEqual({ recorded: 2, failed: [1] });
    const [first, second] = await s.answers([1, 2]);
    expect(first).toMatchObject({ number: 1, isError: true });
    expect(
      JSON.stringify((first as BatchAnswer | undefined)?.content),
    ).toContain('the handler failed after its part');
    expect(second?.number).toBe(2);
    expect((second as BatchAnswer | undefined)?.isError).toBeUndefined();
    expect(s.executes).toHaveBeenCalledTimes(1);
    await s.close();
  });

  it("the dispatch ends the batch on a failure of BatchEnd, or of HandlerBatch with action 'end', alone", () => {
    expect(endsCommunicationBatch('BatchEnd', {})).toBe(true);
    expect(endsCommunicationBatch('HandlerBatch', { action: 'end' })).toBe(
      true,
    );
    for (const action of ['begin', 'answers', undefined]) {
      expect(endsCommunicationBatch('HandlerBatch', { action })).toBe(false);
    }
    for (const tool of [
      'BatchBegin',
      'BatchAnswers',
      'DebugBatchEnd',
      'GetProgram',
    ]) {
      expect(endsCommunicationBatch(tool, { action: 'end' })).toBe(false);
    }
  });
});

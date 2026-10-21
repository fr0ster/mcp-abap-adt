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
import {
  BATCH_ENDED_WORDS,
  BATCH_MODE_OFF_WORDS,
  BATCH_UNSPLIT_WORDS,
  batchMorePartsWords,
  batchPartsMismatchWords,
} from '../../../lib/auth/serverRefusal';
import { endsCommunicationBatch } from '../../../lib/batch/batchTools';
import type { BatchAnswer } from '../../../lib/batch/InstanceBatch';
import type {
  HandlerContext,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { HeldLocks } from '../../../lib/state/heldLocks';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { envelopeResponse, statusError } from '../../helpers/batchEnvelope';
import {
  type Answer,
  batchStand,
  LOCK_HANDLE_OF_XML,
  LOCK_SUCCESS_XML,
  payloadOf,
} from '../../helpers/batchStand';
import { withinTurns } from '../../helpers/withinTurns';

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
          inputSchema: {
            type: 'object',
            properties: {
              program_name: { type: 'string' },
              class_name: { type: 'string' },
            },
          },
        },
        handler: async (context: HandlerContext, _args: unknown) =>
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
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    const [recording] = s.built;
    // SAP ended the session between recording and BatchEnd: BatchEnd
    // takes a new connection; the recording call's is replaced.
    s.loseSession();
    const ending = s.end();
    await sent;
    const [, taken] = s.built;
    expect(s.built).toHaveLength(2);
    expect(recording?.connection.disconnect).toHaveBeenCalledTimes(1);
    // While the envelope runs, SAP ends BatchEnd's session too: the next
    // call replaces it, and BatchEnd holds its use, so no logoff comes
    // under it.
    s.loseSession();
    const later = s.call('GetProgram', { program_name: 'PROG_B' });
    await new Promise((r) => setImmediate(r));
    expect(s.built).toHaveLength(3);
    expect(taken?.connection.disconnect).not.toHaveBeenCalled();
    release();
    const { summary } = await ending;
    expect(summary).toEqual({ recorded: 1, sent: 1, received: 1 });
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
    expect(answer.isError).toBe(true);
    expect(summary).toMatchObject({
      origin: 'connection',
      message: 'socket hang up',
      step: 'execute',
    });
    expect(s.owner.mode()).toBe('off');
    // No map: every number of the batch answers BatchEnd's error.
    for (const entry of await s.answers([1, 2])) {
      expect(asAnswer(entry)).toEqual(answer);
    }
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
    expect((await s.end()).summary).toEqual({
      recorded: 1,
      sent: 1,
      received: 1,
    });
    const locked = await s.answers([1]);
    s.begin();
    for (const answer of [
      await s.call('GetProgram', { program_name: 'PROG_A' }),
      await s.call('GetProgram', { program_name: 'MISSING' }),
    ]) {
      expect(answer).toEqual({ content: [] });
    }
    const { summary } = await s.end();
    expect(summary).toEqual({ recorded: 2, sent: 2, received: 2 });
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
    expect(summary).toEqual({ recorded: 2, sent: 3, received: 3 });
    const [envelope] = s.built[0]?.envelopes ?? [];
    expect(envelope?.parts).toHaveLength(3);
    const [first] = await s.answers([1]);
    expect(asAnswer(first)).toEqual(direct);
    expect(JSON.stringify(first)).toContain(`source of ${VERSION_FROM}`);
    expect(JSON.stringify(first)).toContain(`source of ${VERSION_TO}`);
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
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetInterface', { interface_name: 'INTF_A' });
    const { answer, summary } = await s.end();
    expect(answer.isError).toBe(true);
    expect(summary).toEqual({
      message: 'Request failed with status code 500',
      origin: 'connection',
      step: 'execute',
      status: 500,
      messages: expect.any(Array),
      raw_body: '<html>dump placeholder</html>',
    });
    for (const entry of await s.answers([1, 2])) {
      expect(asAnswer(entry)).toEqual(answer);
    }
    expect(s.owner.mode()).toBe('off');
    await s.close();
  });

  it('BatchEnd answers { recorded, sent, received }; a 404 part is no failure of BatchEnd', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('GetProgram', { program_name: 'MISSING' });
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetInterface', { interface_name: 'MISSING_TOO' });
    const { answer, summary } = await s.end();
    expect(answer.isError).toBeFalsy();
    expect(summary).toEqual({ recorded: 3, sent: 3, received: 3 });
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
    expect(payloadOf(ended)).toEqual({ recorded: 2, sent: 2, received: 2 });
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

  it('empty batch answers { recorded: 0, sent: 0, received: 0 } and replaces the map with an empty one', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.end();
    expect((await s.answers([1]))[0]).toMatchObject({ number: 1 });
    expect((await s.answers([1]))[0]).not.toHaveProperty('error');
    s.begin();
    const { summary } = await s.end();
    expect(summary).toEqual({ recorded: 0, sent: 0, received: 0 });
    expect(await s.answers([1])).toEqual([
      { number: 1, error: 'no_answer', message: 'no answer with that number' },
    ]);
    expect(s.built[0]?.envelopes).toHaveLength(1);
    expect(s.owner.mode()).toBe('off');
    expect(s.owner.holdsState()).toBe(false);
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
    expect(answer).toEqual({ content: expected.content, isError: true });
    expect(s.owner.mode()).toBe('off');
    for (const entry of await s.answers([1, 2])) {
      expect(asAnswer(entry)).toEqual(answer);
    }
    expect(s.built[0]?.envelopes).toHaveLength(1);
    await s.close();
  });

  it('a resolve failing at BatchEnd: the call answers it, mode off, no map, every number read answers it as it came, nothing sent', async () => {
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
      expect((await s.end()).summary).toEqual({
        recorded: 1,
        sent: 1,
        received: 1,
      });
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

  it("a recorded handler that throws: its number answers the handler's failure, nothing rejects", async () => {
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
    expect(summary).toEqual({ recorded: 2, sent: 2, received: 2 });
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

describe('BatchEnd splits, the read answers', () => {
  it("BatchEnd resumes no handler: a handler's code after its request runs only when its number is read", async () => {
    let after = false;
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('GetProgram', async (context) => {
          await context.connection.makeAdtRequest(READ);
          after = true;
          return built('built when read');
        }),
      ],
    });
    s.begin();
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    const { answer, summary } = await s.end();
    expect(answer.isError).toBeFalsy();
    expect(summary).toEqual({ recorded: 1, sent: 1, received: 1 });
    expect(after).toBe(false);
    const [entry] = await s.answers([1]);
    expect(after).toBe(true);
    expect(asAnswer(entry)).toEqual({
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
        own('GetProgram', waitsForTheOther('first')),
        own('GetClass', waitsForTheOther('second')),
      ],
    });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetClass', { class_name: 'CLAS_B' });
    await s.end();
    const entries = await withinTurns(s.answers([1, 2]), 500);
    expect(entries.map(asAnswer)).toEqual([
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
        own('GetProgram', async (context) => {
          await context.connection.makeAdtRequest(READ);
          runs += 1;
          return built(`run ${runs}`);
        }),
      ],
    });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.end();
    const twice = await s.answers([1, 1]);
    const again = await s.answers([1]);
    expect(runs).toBe(1);
    expect([...twice, ...again].map(asAnswer)).toEqual(
      new Array(3).fill({ content: [{ type: 'text', text: 'run 1' }] }),
    );
    await s.close();
  });

  it("a resumed handler's further request is refused batch_ended, and that is its answer; nothing is sent", async () => {
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('GetProgram', async (context) => {
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
    await s.call('GetProgram', { program_name: 'PROG_A' });
    expect((await s.end()).summary).toEqual({
      recorded: 1,
      sent: 1,
      received: 1,
    });
    const [entry] = await s.answers([1]);
    expect(asAnswer(entry)).toEqual({
      content: expect.any(Array),
      isError: true,
    });
    expect(payloadOf(entry as Answer)).toEqual({
      error: 'batch_ended',
      message: BATCH_ENDED_WORDS,
    });
    expect(s.built.flatMap((b) => b.envelopes)).toHaveLength(1);
    expect(s.built.flatMap((b) => b.directs)).toEqual([]);
    await s.close();
  });

  it('a number never read is awaited by nothing: replacing the map lets its handler finish', async () => {
    let finished = false;
    const s = await batchStand({
      tools: [],
      part: sap,
      groups: [
        own('GetProgram', async (context) => {
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
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.end();
    for (let turn = 0; turn < 20; turn += 1) {
      await new Promise((r) => setImmediate(r));
    }
    expect(finished).toBe(false);
    // The next batch's end replaces the map: number 1 is never read.
    s.begin();
    await s.end();
    for (let turn = 0; turn < 20 && !finished; turn += 1) {
      await new Promise((r) => setImmediate(r));
    }
    expect(finished).toBe(true);
    expect(await s.answers([1])).toEqual([
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
      groups: [own('GetProgram', noting('a')), own('GetClass', noting('b'))],
    });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetClass', { class_name: 'CLAS_B' });
    return { s, ran };
  }

  it('fewer parts than requests: batch_parts_mismatch, every number answers it, no handler resumed', async () => {
    const { s, ran } = await twoCalls(async (parts) =>
      envelopeResponse(parts.slice(0, 1).map(sap)),
    );
    const { answer, summary } = await s.end();
    expect(answer.isError).toBe(true);
    expect(summary).toEqual({
      error: 'batch_parts_mismatch',
      message: batchPartsMismatchWords(1, 2),
    });
    expect(batchPartsMismatchWords(1, 2)).toBe(
      '1 of 2 parts came; the answers cannot be matched to the calls',
    );
    for (const entry of await s.answers([1, 2])) {
      expect(asAnswer(entry)).toEqual(answer);
    }
    expect(ran).toEqual([]);
    expect(s.owner.mode()).toBe('off');
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
    expect(answer.isError).toBe(true);
    expect(summary).toEqual({
      error: 'batch_unsplit',
      message: BATCH_UNSPLIT_WORDS,
    });
    expect(BATCH_UNSPLIT_WORDS).toBe(
      "the envelope's answer could not be split into the calls' parts",
    );
    for (const entry of await s.answers([1, 2])) {
      expect(asAnswer(entry)).toEqual(answer);
    }
    expect(ran).toEqual([]);
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
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('GetProgram', { program_name: 'PROG_B' });
    await s.end();
    expect((await s.answers([2]))[0]).not.toHaveProperty('error');
    fail = true;
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_C' });
    const { answer } = await s.end();
    expect(answer.isError).toBe(true);
    const [first, second] = await s.answers([1, 2]);
    expect(asAnswer(first)).toEqual(answer);
    expect(second).toEqual({
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
    expect(s.built).toHaveLength(2);
    expect(heldLocks.holds(LOCK_HANDLE_OF_XML)).toBe(false); // not read yet
    const [entry] = await s.answers([1]);
    expect(payloadOf(entry as Answer).lock_handle).toBe(LOCK_HANDLE_OF_XML);
    expect(heldLocks.holds(LOCK_HANDLE_OF_XML)).toBe(true);
    await s.close();
  });

  it("read after the instance's SAP session ended: answers the lock, and the instance holds it no more", async () => {
    const heldLocks = new HeldLocks();
    const s = await batchStand({ tools: TOOLS, part: sap, heldLocks });
    s.begin();
    await s.call('HandlerLock', LOCK);
    await s.end();
    // SAP ends the session the lock lives in; the next call replaces it.
    s.loseSession();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    expect(s.built).toHaveLength(2);
    const [entry] = await s.answers([1]);
    expect((entry as BatchAnswer).isError).toBeUndefined();
    expect(payloadOf(entry as Answer).lock_handle).toBe(LOCK_HANDLE_OF_XML);
    expect(heldLocks.holds(LOCK_HANDLE_OF_XML)).toBe(false);
    // A write under it is refused here, sending nothing.
    expect(heldLocks.holdsState()).toBe(false);
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
        own('GetProgram', async (context) => {
          await context.connection.makeAdtRequest(READ);
          return built('a');
        }),
      ],
    });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    const { answer, summary } = await s.end();
    expect(answer.isError).toBe(true);
    expect(summary).toEqual({
      error: 'batch_parts_mismatch',
      message: batchMorePartsWords(1),
    });
    expect(batchMorePartsWords(1)).toBe(
      'more parts came than the 1 requests sent; the answers cannot be matched to the calls',
    );
    for (const entry of await s.answers([1])) {
      expect(asAnswer(entry)).toEqual(answer);
    }
    await s.close();
  });
});

describe('a resumed handler reaching the connection after its part', () => {
  it.each(['getBaseUrl', 'connect'] as const)(
    '%s is refused batch_ended, and that is its answer',
    async (member) => {
      const s = await batchStand({
        tools: [],
        part: sap,
        groups: [
          own('GetProgram', async (context) => {
            await context.connection.makeAdtRequest(READ);
            await context.connection[member]();
            return built('never');
          }),
        ],
      });
      s.begin();
      await s.call('GetProgram', { program_name: 'PROG_A' });
      await s.end();
      const [entry] = await s.answers([1]);
      expect(payloadOf(entry as Answer)).toEqual({
        error: 'batch_ended',
        message: BATCH_ENDED_WORDS,
      });
      await s.close();
    },
  );
});

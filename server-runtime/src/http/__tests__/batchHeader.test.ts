/**
 * Batch mode over Streamable HTTP (spec §2, "How each transport reaches
 * it"): every request is an MCP session of its own, so a batch is the pooled
 * instance's, and the client's calls reach it by the instance's handle — the
 * `x-mcp-state-handle` request header first, else the `tools/call`'s
 * `state_handle` argument, which the debugger tools keep. `BatchBegin` holds
 * state and answers the handle; a call without it reaches a new instance,
 * where no batch is open. Every call goes over real HTTP to a server whose
 * per-request connections talk to the ADT stand-in; the envelope is answered
 * part by part, each part naming the inner request it answers.
 */

import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import {
  BatchHandlersGroup,
  type HandlerContext,
  HighLevelHandlersGroup,
  type IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import type { InstanceState } from '@mcp-abap-adt/lib/state';
import {
  envelopeResponse,
  innerRequests,
} from '../../../../src/__tests__/helpers/batchEnvelope';
import { InstancePool } from '../InstancePool.js';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
  until,
} from './shutdown/harness';

jest.setTimeout(30_000);

const placeholder = { connection: undefined } as unknown as HandlerContext;

/** `EchoHandle`: answers the handle of the instance the call reached; touches no system. */
const echoGroup: IHandlerGroup = {
  getName: () => 'echo-handle',
  registerHandlers: () => {},
  getHandlers: () => [
    {
      toolDefinition: {
        name: 'EchoHandle',
        description: 'answers the handle of the instance it ran on',
        inputSchema: {
          type: 'object',
          properties: { state_handle: { type: 'string' } },
        },
      } as never,
      // Two parameters: the registration hands `(context, args)` only then.
      handler: (async (context: { state: InstanceState }, _args: unknown) => ({
        content: [{ type: 'text', text: context.state.handle }],
      })) as never,
    },
  ],
} as unknown as IHandlerGroup;

let s: HttpStand;

const isEnvelope = (url: string) => url.includes('/communication/batch');
const envelopes = () => s.standIn.requests.filter((r) => isEnvelope(r.url));
const programReads = () =>
  s.standIn.requests.filter((r) => r.url.includes('/programs/programs/'));
/** What the stand-in answered the part reading `program`'s source: the part, not the call's arguments. */
const partOf = (program: string) =>
  `answered GET /sap/bc/adt/programs/programs/${program.toLowerCase()}/source/main`;
const poolSize = () =>
  (s.mcp as unknown as { pool: { size(): number } }).pool.size();

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand({
    server: { batch: { keepRawParts: false } },
    groups: [
      echoGroup,
      new HighLevelHandlersGroup(placeholder),
      new BatchHandlersGroup(placeholder),
    ],
  });
  // Each part answers `200` with the inner request it answers, so an answer
  // tells which recorded call it belongs to.
  s.standIn.respond(
    (r) => isEnvelope(r.url) && r.method === 'POST',
    (r) => {
      const parts = innerRequests({
        url: r.url,
        method: r.method,
        headers: { 'content-type': r.contentType ?? '' },
        data: r.body,
        timeout: 0,
      });
      const answer = envelopeResponse(
        parts.map((part) => ({
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/plain' },
          body: `answered ${part.method} ${part.url}`,
        })),
      );
      return {
        status: answer.status,
        headers: answer.headers as Record<string, string>,
        text: String(answer.data),
      };
    },
  );
});

afterEach(async () => {
  await s.close();
  jest.restoreAllMocks();
});

/** The basic connection's headers, with the handle in `x-mcp-state-handle`. */
const withHeader = (handle: string) => ({
  ...basicHeaders(s.standIn.url),
  'x-mcp-state-handle': handle,
});

async function begin(): Promise<string> {
  const begun = await s.call('BatchBegin', {});
  expect(begun.status).toBe(200);
  expect(begun.isError).toBe(false);
  const answer = JSON.parse(begun.text) as {
    batch: string;
    state_handle: string;
  };
  expect(answer.batch).toBe('on');
  expect(typeof answer.state_handle).toBe('string');
  return answer.state_handle;
}

it('the header routes to the pooled instance, ahead of the tools/call argument', async () => {
  const a = (await s.call('HoldState', { id: 'A' })).text;
  const b = (await s.call('HoldState', { id: 'B' })).text;
  expect(a).not.toBe(b);
  expect(poolSize()).toBe(2);

  // The header alone.
  expect((await s.call('EchoHandle', {}, withHeader(a))).text).toBe(a);
  // Both: the header wins over the argument.
  expect(
    (await s.call('EchoHandle', { state_handle: b }, withHeader(a))).text,
  ).toBe(a);
  // A header the pool does not know: a new instance, whatever the argument.
  const fresh = (
    await s.call('EchoHandle', { state_handle: b }, withHeader('unknown'))
  ).text;
  expect([a, b]).not.toContain(fresh);
  expect(poolSize()).toBe(2);
});

it("a debugger tool's argument still routes", async () => {
  const a = (await s.call('HoldState', { id: 'A' })).text;
  // No header: the `state_handle` argument, as the debugger tools send it.
  expect((await s.call('EchoHandle', { state_handle: a })).text).toBe(a);
  // The state's own tool, by its argument: the complete stop reaches it.
  const stopped = await s.call('StopState', { state_handle: a });
  expect(stopped.isError).toBe(false);
  await until(() => poolSize() === 0);
});

it('BatchBegin holds state and answers the handle; a later call with the header is recorded there', async () => {
  const handle = await begin();
  // It holds state: the instance stays in the pool between requests.
  expect(poolSize()).toBe(1);

  const recorded = await s.call(
    'GetProgram',
    { program_name: 'PROG_A' },
    withHeader(handle),
  );
  expect(recorded).toEqual({ status: 200, text: '', isError: false });
  // Recorded, not sent.
  expect(programReads()).toEqual([]);
  expect(envelopes()).toEqual([]);

  const ended = await s.call('BatchEnd', {}, withHeader(handle));
  expect(ended.isError).toBe(false);
  expect(JSON.parse(ended.text)).toMatchObject({
    recorded: 1,
    sent: 1,
    received: 1,
  });
  expect(envelopes().filter((r) => r.method === 'POST')).toHaveLength(1);

  const answers = await s.call(
    'BatchAnswers',
    { number: 1 },
    withHeader(handle),
  );
  expect(answers.isError).toBe(false);
  expect(answers.text).toContain(partOf('PROG_A'));
  // The handle is a bearer value: no log line names it.
  const logged = (console.error as jest.Mock).mock.calls.flat().map(String);
  expect(logged.join('\n')).not.toContain(handle);
  expect(s.stderr.join('\n')).not.toContain(handle);
});

it('no header → a fresh instance: BatchAnswers no answer with that number', async () => {
  const handle = await begin();
  await s.call('GetProgram', { program_name: 'PROG_A' }, withHeader(handle));
  const ended = await s.call('BatchEnd', {}, withHeader(handle));
  expect(JSON.parse(ended.text)).toMatchObject({ recorded: 1 });
  // With the header, the answer is there.
  expect(
    (await s.call('BatchAnswers', { number: 1 }, withHeader(handle))).text,
  ).toContain(partOf('PROG_A'));

  // Without it, a new instance, where no batch ran.
  const lost = await s.call('BatchAnswers', { number: 1 });
  expect(lost.text).toContain('no answer with that number');
  expect(lost.text).not.toContain(partOf('PROG_A'));
});

it('a call without the header while a batch is open is not recorded there', async () => {
  const handle = await begin();
  const direct = await s.call('GetProgram', { program_name: 'PROG_D' });
  expect(direct.status).toBe(200);
  // Sent at once, on a new instance.
  expect(programReads().map((r) => r.url)).toEqual([
    expect.stringContaining('/prog_d/'),
  ]);
  const ended = await s.call('BatchEnd', {}, withHeader(handle));
  expect(JSON.parse(ended.text)).toMatchObject({
    recorded: 0,
    sent: 0,
    received: 0,
  });
});

it('a dropped BatchEnd request keeps its answers', async () => {
  const handle = await begin();
  await s.call('GetProgram', { program_name: 'PROG_A' }, withHeader(handle));
  const held = s.standIn.hold((r) => isEnvelope(r.url) && r.method === 'POST');

  const client = new AbortController();
  const dropped = fetch(s.url, {
    method: 'POST',
    signal: client.signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...withHeader(handle),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 9100,
      method: 'tools/call',
      params: { name: 'BatchEnd', arguments: {} },
    }),
  }).catch(() => 'dropped');
  await held.arrived;
  client.abort();
  expect(await dropped).toBe('dropped');
  await turns(20);

  // The next call with the header waits for BatchEnd's lease, then reads
  // what came.
  const reading = s.call('BatchAnswers', { number: 1 }, withHeader(handle));
  await turns(20);
  held.release();
  const answers = await reading;
  expect(answers.isError).toBe(false);
  expect(answers.text).toContain(partOf('PROG_A'));
  expect(envelopes().filter((r) => r.method === 'POST')).toHaveLength(1);
});

it('two requests with the same header at once: both recorded, numbered in arrival order', async () => {
  const handle = await begin();

  // The first request holds the instance's lease until told to go on.
  let entered!: () => void;
  const leaseHeld = new Promise<void>((r) => {
    entered = r;
  });
  let goOn!: () => void;
  const released = new Promise<void>((r) => {
    goOn = r;
  });
  const connect = BaseMcpServer.prototype.connect;
  let connects = 0;
  jest
    .spyOn(BaseMcpServer.prototype, 'connect')
    .mockImplementation(async function (this: BaseMcpServer, ...args) {
      connects += 1;
      if (connects === 1) {
        entered();
        await released;
      }
      return connect.apply(this, args);
    });
  const serve = InstancePool.prototype.serve;
  let served = 0;
  jest.spyOn(InstancePool.prototype, 'serve').mockImplementation(function (
    this: InstancePool<never>,
    ...args
  ) {
    served += 1;
    return serve.apply(this, args);
  });

  const first = s.call(
    'GetProgram',
    { program_name: 'PROG_A' },
    withHeader(handle),
  );
  await leaseHeld;
  const second = s.call(
    'GetProgram',
    { program_name: 'PROG_B' },
    withHeader(handle),
  );
  // Both are at the pool; the second waits for the lease.
  await until(() => served === 2);
  await turns(20);
  expect(connects).toBe(1);

  goOn();
  expect(await first).toEqual({ status: 200, text: '', isError: false });
  expect(await second).toEqual({ status: 200, text: '', isError: false });
  expect(programReads()).toEqual([]);

  const ended = await s.call('BatchEnd', {}, withHeader(handle));
  expect(JSON.parse(ended.text)).toMatchObject({
    recorded: 2,
    sent: 2,
    received: 2,
  });
  const one = await s.call('BatchAnswers', { number: 1 }, withHeader(handle));
  const two = await s.call('BatchAnswers', { number: 2 }, withHeader(handle));
  expect(one.text).toContain(partOf('PROG_A'));
  expect(one.text).not.toContain(partOf('PROG_B'));
  expect(two.text).toContain(partOf('PROG_B'));
  expect(two.text).not.toContain(partOf('PROG_A'));
});

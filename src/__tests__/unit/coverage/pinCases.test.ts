/**
 * `pinCases`' own behaviour (plan C1 Step 3): what it refuses, what it
 * asserts, the deterministic inputs and the one adapter `toPinned`. Each
 * case runs through `runPinCase` / `recordCase` — the body every
 * `pinCases` test runs — so a refusal is asserted as a rejection here.
 */

import * as z from 'zod';
import type {
  HandlerContext,
  HandlerEntry,
  ToolArgs,
} from '../../../lib/handlers/interfaces';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  installPinFakes,
  PIN_PORTS,
  type PinCase,
  recordCase,
  runPinCase,
  toPinned,
} from '../../helpers/pinCases';
import { pinServer } from '../../helpers/pinServer';
import { recordingConnection } from '../../helpers/recordingConnection';

jest.setTimeout(120_000);

/** This file's fixed stand-in port. */
const PORT = PIN_PORTS.first;

const getProgram: PinCase = {
  tool: 'GetProgram',
  variant: 'onprem',
  stand: 'recording',
  args: { program_name: 'ZPIN_PROGRAM' },
  expected: [],
};

/** A stub tool: `run` is its whole body. */
function stub(
  name: string,
  run: (context: HandlerContext, args: ToolArgs) => Promise<unknown>,
): HandlerEntry {
  return {
    toolDefinition: {
      name,
      description: 'a stub',
      inputSchema: z.object({}).passthrough(),
    },
    call: run,
  };
}

const entries = (...tools: HandlerEntry[]): ReadonlyMap<string, HandlerEntry> =>
  new Map(tools.map((tool) => [tool.toolDefinition.name, tool]));

const textAnswer = (text: string) => ({
  isError: false,
  content: [{ type: 'text', text }],
});

describe('pinCases', () => {
  it('refuses an empty expected', async () => {
    await expect(runPinCase(getProgram)).rejects.toThrow(
      'an empty expected is refused; recorded:',
    );
    await expect(runPinCase(getProgram)).rejects.toThrow('zpin_program');
  });

  it('refuses a tool the variant does not serve', async () => {
    await expect(
      runPinCase({ ...getProgram, tool: 'DeleteProgram', variant: 'cloud' }),
    ).rejects.toThrow('the cloud variant serves no tool DeleteProgram');
  });

  it('fails when one request more is recorded than expected', async () => {
    const recorded = await recordCase(getProgram);
    expect(recorded.requests.length).toBeGreaterThan(0);
    await expect(
      runPinCase({ ...getProgram, expected: recorded.requests.slice(1) }),
    ).rejects.toThrow();
    await expect(
      runPinCase({ ...getProgram, expected: recorded.requests }),
    ).resolves.toBeUndefined();
  });

  it('a none case fails when the tool never ran', async () => {
    const early = stub('StubBegin', async () => textAnswer('{}'));
    const ran = (answer: { content: Array<{ text: string }> }) => {
      const parsed: unknown = JSON.parse(answer.content[0]?.text ?? '');
      expect(parsed).toHaveProperty('state_handle');
    };
    await expect(
      runPinCase(
        {
          tool: 'StubBegin',
          variant: 'onprem',
          stand: 'recording',
          args: {},
          expected: 'none',
          ran,
        },
        { entries: entries(early) },
      ),
    ).rejects.toThrow('state_handle');
    const begun = stub('StubBegin', async () =>
      textAnswer('{"state_handle":"H"}'),
    );
    await expect(
      runPinCase(
        {
          tool: 'StubBegin',
          variant: 'onprem',
          stand: 'recording',
          args: {},
          expected: 'none',
          ran,
        },
        { entries: entries(begun) },
      ),
    ).resolves.toBeUndefined();
  });

  it('a none case fails when the tool sends a request', async () => {
    await expect(
      runPinCase({ ...getProgram, expected: 'none', ran: () => {} }),
    ).rejects.toThrow();
  });

  it('a thrown refusal is asserted as thrown, with zero requests', async () => {
    await expect(
      runPinCase({
        ...getProgram,
        args: { program_name: 7 },
        refusal: 'thrown',
        expected: 'nothing-sent',
      }),
    ).resolves.toBeUndefined();
    const sendsThenThrows = stub('StubSends', async (context) => {
      await context.connection.makeAdtRequest({
        url: '/sap/bc/adt/stub',
        method: 'GET',
        timeout: 0,
      });
      throw new Error(
        'Input validation error: Invalid arguments for tool StubSends: late',
      );
    });
    await expect(
      runPinCase(
        {
          tool: 'StubSends',
          variant: 'onprem',
          stand: 'recording',
          args: {},
          refusal: 'thrown',
          expected: 'nothing-sent',
        },
        { entries: entries(sendsThenThrows) },
      ),
    ).rejects.toThrow();
    await expect(
      runPinCase({
        ...getProgram,
        args: { program_name: 7 },
        expected: 'nothing-sent',
      }),
    ).rejects.toThrow(
      "expected: 'nothing-sent' is legal only with refusal: 'thrown'",
    );
  });

  it('the fakes are installed before the server is built', async () => {
    const begin: PinCase = {
      tool: 'BatchBegin',
      variant: 'onprem',
      stand: 'server',
      args: {},
      expected: 'none',
      ran: () => {},
    };
    const first = await recordCase(begin, { port: PORT });
    const second = await recordCase(begin, { port: PORT });
    expect(first.answer?.content[0]?.text).toContain('state_handle');
    expect(second.answer).toEqual(first.answer);

    // Built before the fakes, a server keeps the real random source: the
    // same seed gives two different handles.
    const handles: string[] = [];
    for (const _ of [1, 2]) {
      const stand: AdtStandIn = await adtStandIn({ port: PORT });
      const server = await pinServer('onprem', stand);
      const restore = installPinFakes('BatchBegin onprem');
      try {
        const answer = await server.call('BatchBegin', {});
        handles.push(answer.content[0]?.text ?? '');
      } finally {
        restore();
        await server.close();
        await stand.close();
      }
    }
    expect(handles[0]).not.toEqual(handles[1]);
  });

  it('two runs of one case record the same requests', async () => {
    const onStand: PinCase = { ...getProgram, stand: 'adtStandIn' };
    const first = await recordCase(onStand, { port: PORT });
    const second = await recordCase(onStand, { port: PORT });
    expect(first.requests.length).toBeGreaterThan(0);
    expect(first.requests[0]?.headers.host).toBe(`127.0.0.1:${PORT}`);
    expect(second.requests).toEqual(first.requests);
  });

  it('a pin whose two recordings differ fails, naming the first differing field', async () => {
    // A source no fake reaches: a count kept outside the case.
    let sent = 0;
    const drifting = stub('StubDrifts', async (context) => {
      sent += 1;
      await context.connection.makeAdtRequest({
        url: `/sap/bc/adt/stub/${sent}`,
        method: 'GET',
        timeout: 0,
      });
      return textAnswer('{}');
    });
    await expect(
      runPinCase(
        {
          tool: 'StubDrifts',
          variant: 'onprem',
          stand: 'recording',
          args: {},
          expected: [
            {
              method: 'GET',
              url: '/sap/bc/adt/stub/1',
              headers: {},
              body: undefined,
            },
          ],
        },
        { entries: entries(drifting) },
      ),
    ).rejects.toThrow('two recordings of the case differ at request 0: url');
  });

  it("a thrown case's recording leaves out its before steps, on both stands", async () => {
    const before = stub('StubBefore', async (context) => {
      await context.connection.makeAdtRequest({
        url: '/sap/bc/adt/stub/before',
        method: 'GET',
        timeout: 0,
      });
      return textAnswer('{}');
    });
    const throws = stub('StubThrows', async () => {
      throw new Error(
        'Input validation error: Invalid arguments for tool StubThrows: x',
      );
    });
    for (const stand of ['recording', 'adtStandIn'] as const) {
      const recorded = await recordCase(
        {
          tool: 'StubThrows',
          variant: 'onprem',
          stand,
          before: [{ tool: 'StubBefore', args: {} }],
          args: {},
          refusal: 'thrown',
          expected: 'nothing-sent',
        },
        { port: PORT, entries: entries(before, throws) },
      );
      expect({
        stand,
        thrown: recorded.thrown instanceof Error,
        requests: recorded.requests,
      }).toEqual({
        stand,
        thrown: true,
        requests: [],
      });
    }
  });

  it('a binding reads the earlier answer', async () => {
    const seen: ToolArgs[] = [];
    const start = stub('StubStart', async () =>
      textAnswer('{"run_id":"RUN_7"}'),
    );
    const read = stub('StubRead', async (context, args) => {
      seen.push(args);
      await context.connection.makeAdtRequest({
        url: '/sap/bc/adt/stub/read',
        method: 'GET',
        timeout: 0,
      });
      return textAnswer('{}');
    });
    await runPinCase(
      {
        tool: 'StubRead',
        variant: 'onprem',
        stand: 'recording',
        before: [{ tool: 'StubStart', args: {} }],
        bind: { run_id: { from: 0, field: 'run_id' } },
        args: {},
        expected: [
          {
            method: 'GET',
            url: '/sap/bc/adt/stub/read',
            headers: {},
            body: undefined,
          },
        ],
      },
      { entries: entries(start, read) },
    );
    expect(seen).toEqual([{ run_id: 'RUN_7' }, { run_id: 'RUN_7' }]);
  });

  it('a binding of a key-bearing field is refused', async () => {
    const start = stub('StubStart', async () => textAnswer('{"type":"CLASS"}'));
    const read = stub('StubRead', async () => textAnswer('{}'));
    await expect(
      runPinCase(
        {
          tool: 'StubRead',
          variant: 'onprem',
          stand: 'recording',
          before: [{ tool: 'StubStart', args: {} }],
          bind: { object_type: { from: 0, field: 'type' } },
          args: {},
          expected: 'nothing-sent',
          refusal: 'thrown',
        },
        { entries: entries(start, read) },
      ),
    ).rejects.toThrow('a binding of object_type is refused');
  });

  it('toPinned excludes session and nothing else', () => {
    const record: StandInRequest = {
      method: 'GET',
      url: '/sap/bc/adt/x?a=1',
      authorization: 'Basic eA==',
      session: 'session-1',
      sessionType: undefined,
      cookie: undefined,
      contentType: undefined,
      accept: 'application/xml',
      body: '',
      headers: { accept: 'application/xml', authorization: 'Basic eA==' },
      query: 'a=1',
    };
    expect(toPinned(record)).toEqual({
      method: 'GET',
      url: '/sap/bc/adt/x?a=1',
      headers: { accept: 'application/xml', authorization: 'Basic eA==' },
      body: undefined,
    });
    expect(() => toPinned(Object.assign({}, record, { extra: 'x' }))).toThrow(
      'the stand-in record carries extra: the pinned shape has no place for it',
    );
    expect(() =>
      toPinned(Object.assign({ method: 'GET', url: '/x' }, { timeout: 5 })),
    ).toThrow('the recorded request carries timeout');
  });

  it('toPinned keeps the query, every header and the body', async () => {
    const headers = { 'x-one': '1', 'x-two': '2', 'x-three': '3' };
    const connection = recordingConnection();
    await connection.makeAdtRequest({
      url: '/sap/bc/adt/x',
      method: 'POST',
      timeout: 0,
      params: { b: 'two words', a: '1' },
      headers,
      data: '<x/>',
    });
    const recorded = connection.requests[0];
    if (recorded === undefined) throw new Error('nothing was recorded');
    expect(toPinned(recorded)).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/x?b=two+words&a=1',
      headers,
      body: '<x/>',
    });

    const stand = await adtStandIn({ port: PORT });
    try {
      await fetch(`${stand.url}/sap/bc/adt/x?b=two&a=1`, {
        method: 'POST',
        headers,
        body: '<x/>',
      });
      const sent = stand.requests[0];
      if (sent === undefined) throw new Error('the stand-in got nothing');
      const pinned = toPinned(sent);
      expect(pinned.url).toBe('/sap/bc/adt/x?b=two&a=1');
      expect(pinned.body).toBe('<x/>');
      expect(pinned.headers).toMatchObject(headers);
      expect(pinned.headers.host).toBe(`127.0.0.1:${PORT}`);
    } finally {
      await stand.close();
    }
  });
});

import * as net from 'node:net';
import * as ts from 'typescript';
/**
 * `pinCases`' own behaviour (plan C1 Step 3): what it refuses, what it
 * asserts, the deterministic inputs and the one adapter `toPinned`. Each
 * case runs through `runPinCase` / `recordCase` — the body every
 * `pinCases` test runs — so a refusal is asserted as a rejection here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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
  PIN_STAND_HOST,
  type PinCase,
  recordCase,
  runPinCase,
  toPinned,
} from '../../helpers/pinCases';
import { pinServer } from '../../helpers/pinServer';
import { recordingConnection } from '../../helpers/recordingConnection';

jest.setTimeout(120_000);

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
    const first = await recordCase(begin);
    const second = await recordCase(begin);
    expect(first.answer?.content[0]?.text).toContain('state_handle');
    expect(second.answer).toEqual(first.answer);

    // Built before the fakes, a server keeps the real random source: the
    // same seed gives two different handles.
    const handles: string[] = [];
    for (const _ of [1, 2]) {
      const stand: AdtStandIn = await adtStandIn();
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

  it('a stand case runs while a port of the old fixed pin range is taken', async () => {
    // 47100: the port this file's stand-in listened on, inside Linux's
    // ephemeral range; held here as any socket of the machine may hold it
    // (this file is the guard's one exception, below). The port itself is
    // what the case is about, so it stays fixed; when another socket of the
    // machine already holds it, the condition already holds and the case
    // runs with that holder (EADDRINUSE is not a failure here).
    const holder = net.createServer();
    const held = await new Promise<boolean>((resolve, reject) => {
      holder.once('error', (error: NodeJS.ErrnoException) =>
        error.code === 'EADDRINUSE' ? resolve(false) : reject(error),
      );
      holder.listen(47100, '127.0.0.1', () => resolve(true));
    });
    try {
      const onStand: PinCase = { ...getProgram, stand: 'adtStandIn' };
      const recorded = await recordCase(onStand);
      expect(recorded.requests.length).toBeGreaterThan(0);
    } finally {
      if (held)
        await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  it('two runs of one case record the same requests', async () => {
    const onStand: PinCase = { ...getProgram, stand: 'adtStandIn' };
    const first = await recordCase(onStand);
    const second = await recordCase(onStand);
    expect(first.requests.length).toBeGreaterThan(0);
    expect(first.requests[0]?.headers.host).toBe(PIN_STAND_HOST);
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
        { entries: entries(before, throws) },
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

  // adt-clients hands a LOCK and an UNLOCK `data: null`; an HTTP client
  // sends no body for it, as for `undefined`.
  it('toPinned reads a null body as none', () => {
    expect(
      toPinned({ method: 'POST', url: '/sap/bc/adt/x', data: null }),
    ).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/x',
      headers: {},
      body: undefined,
    });
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

    const stand = await adtStandIn();
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
      expect(pinned.headers.host).toBe(new URL(stand.url).host);
    } finally {
      await stand.close();
    }
  });
});

describe('no test server listens on a fixed port', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');

  /** Every test source under `dir`. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          sources(full, out);
        }
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  /** The `.listen(<number>, …)` calls of `file` whose port is a number other than 0. */
  function fixedListens(file: string): string[] {
    const text = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'listen'
      ) {
        const [first] = node.arguments;
        if (
          first !== undefined &&
          ts.isNumericLiteral(first) &&
          Number(first.text) !== 0
        ) {
          const at = tree.getLineAndCharacterOfPosition(node.getStart());
          found.push(
            `${path.relative(repo, file)}:${at.line + 1} listen(${first.text})`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    return found;
  }

  it('every test server listens on port 0: a fixed port can be held by any socket of the machine', () => {
    const roots = [
      path.join(repo, 'src', '__tests__'),
      ...fs
        .readdirSync(repo, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(repo, entry.name, 'src'))
        .filter((dir) => fs.existsSync(dir) && dir !== path.join(repo, 'src')),
    ];
    const self = __filename;
    const found = roots
      .flatMap((root) => sources(root))
      .filter((file) => file.includes(`${path.sep}__tests__${path.sep}`))
      .filter((file) => file !== self)
      .flatMap(fixedListens);
    expect(found).toEqual([]);
  });

  it('the ADT stand-in takes no port', () => {
    const arity: Parameters<typeof adtStandIn>['length'] = 0;
    expect(adtStandIn.length).toBe(arity);
  });
});

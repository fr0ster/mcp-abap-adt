import assert from 'node:assert/strict';
import * as net from 'node:net';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import {
  assertMatchObject,
  assertRejects,
  assertThrows,
} from '../../helpers/assertions';
import { repositoryRoot } from '../../helpers/repoRoot';
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
import type { ToolResultLike } from '../../../lib/toolResult';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  installPinFakes,
  type MatchedRequest,
  PIN_STAND_HOST,
  type PinCase,
  recordCase,
  runPinCase,
  toPinned,
} from '../../helpers/pinCases';
import { pinServer } from '../../helpers/pinServer';
import { recordingConnection } from '../../helpers/recordingConnection';

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
  run: (context: HandlerContext, args: ToolArgs) => Promise<ToolResultLike>,
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
    await assertRejects(
      runPinCase(getProgram),
      'an empty expected is refused; recorded:',
    );
    await assertRejects(runPinCase(getProgram), 'zpin_program');
  });

  it('refuses a tool the variant does not serve', async () => {
    await assertRejects(
      runPinCase({ ...getProgram, tool: 'DeleteProgram', variant: 'cloud' }),
      'the cloud variant serves no tool DeleteProgram',
    );
  });

  it('fails when one request more is recorded than expected', async () => {
    const recorded = await recordCase(getProgram);
    assert.ok(recorded.requests.length > 0);
    await assertRejects(
      runPinCase({ ...getProgram, expected: recorded.requests.slice(1) }),
    );
    assert.equal(
      await runPinCase({ ...getProgram, expected: recorded.requests }),
      undefined,
    );
  });

  it('a none case fails when the tool never ran', async () => {
    const early = stub('StubBegin', async () => textAnswer('{}'));
    const ran = (answer: { content: Array<{ text: string }> }) => {
      const parsed: unknown = JSON.parse(answer.content[0]?.text ?? '');
      assert.ok('state_handle' in Object(parsed));
    };
    await assertRejects(
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
      'state_handle',
    );
    const begun = stub('StubBegin', async () =>
      textAnswer('{"state_handle":"H"}'),
    );
    assert.equal(
      await runPinCase(
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
      undefined,
    );
  });

  it('a none case fails when the tool sends a request', async () => {
    await assertRejects(
      runPinCase({ ...getProgram, expected: 'none', ran: () => {} }),
    );
  });

  it('a thrown refusal is asserted as thrown, with zero requests', async () => {
    assert.equal(
      await runPinCase({
        ...getProgram,
        args: { program_name: 7 },
        refusal: 'thrown',
        expected: 'nothing-sent',
      }),
      undefined,
    );
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
    await assertRejects(
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
    );
    await assertRejects(
      runPinCase({
        ...getProgram,
        args: { program_name: 7 },
        expected: 'nothing-sent',
      }),
      "expected: 'nothing-sent' is legal only with refusal: 'thrown'",
    );
  });

  it('the fakes are installed before the server is built', async () => {
    const begin: PinCase = {
      tool: 'HandlerBatch',
      variant: 'onprem',
      stand: 'server',
      args: { action: 'begin' },
      expected: 'none',
      ran: () => {},
    };
    const first = await recordCase(begin);
    const second = await recordCase(begin);
    assert.ok(first.answer?.content[0]?.text.includes('state_handle'));
    assert.deepStrictEqual(second.answer, first.answer);

    // Built before the fakes, a server keeps the real random source: the
    // same seed gives two different handles.
    const handles: string[] = [];
    for (const _ of [1, 2]) {
      const stand: AdtStandIn = await adtStandIn();
      const server = await pinServer('onprem', stand);
      const restore = installPinFakes('HandlerBatch#begin onprem');
      try {
        const answer = await server.call('HandlerBatch', { action: 'begin' });
        handles.push(answer.content[0]?.text ?? '');
      } finally {
        restore();
        await server.close();
        await stand.close();
      }
    }
    assert.notDeepStrictEqual(handles[0], handles[1]);
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
      assert.ok(recorded.requests.length > 0);
    } finally {
      if (held)
        await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  it('two runs of one case record the same requests', async () => {
    const onStand: PinCase = { ...getProgram, stand: 'adtStandIn' };
    const first = await recordCase(onStand);
    const second = await recordCase(onStand);
    assert.ok(first.requests.length > 0);
    assert.equal(first.requests[0]?.headers.host, PIN_STAND_HOST);
    assert.deepStrictEqual(second.requests, first.requests);
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
    await assertRejects(
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
      'two recordings of the case differ at request 0: url',
    );
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
      assert.deepStrictEqual(
        {
          stand,
          thrown: recorded.thrown instanceof Error,
          requests: recorded.requests,
        },
        {
          stand,
          thrown: true,
          requests: [],
        },
      );
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
    assert.deepStrictEqual(seen, [{ run_id: 'RUN_7' }, { run_id: 'RUN_7' }]);
  });

  it('a binding of a key-bearing field is refused', async () => {
    const start = stub('StubStart', async () => textAnswer('{"type":"CLASS"}'));
    const read = stub('StubRead', async () => textAnswer('{}'));
    await assertRejects(
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
      'a binding of object_type is refused',
    );
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
    assert.deepStrictEqual(toPinned(record), {
      method: 'GET',
      url: '/sap/bc/adt/x?a=1',
      headers: { accept: 'application/xml', authorization: 'Basic eA==' },
      body: undefined,
    });
    assertThrows(
      () => toPinned(Object.assign({}, record, { extra: 'x' })),
      'the stand-in record carries extra: the pinned shape has no place for it',
    );
    assertThrows(
      () =>
        toPinned(Object.assign({ method: 'GET', url: '/x' }, { timeout: 5 })),
      'the recorded request carries timeout',
    );
  });

  // adt-clients hands a LOCK and an UNLOCK `data: null`; an HTTP client
  // sends no body for it, as for `undefined`.
  it('toPinned reads a null body as none', () => {
    assert.deepStrictEqual(
      toPinned({ method: 'POST', url: '/sap/bc/adt/x', data: null }),
      {
        method: 'POST',
        url: '/sap/bc/adt/x',
        headers: {},
        body: undefined,
      },
    );
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
    assert.deepStrictEqual(toPinned(recorded), {
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
      assert.equal(pinned.url, '/sap/bc/adt/x?b=two&a=1');
      assert.equal(pinned.body, '<x/>');
      assertMatchObject(pinned.headers, headers);
      assert.equal(pinned.headers.host, new URL(stand.url).host);
    } finally {
      await stand.close();
    }
  });
});

describe('no test server listens on a fixed port', () => {
  const repo = repositoryRoot(__dirname);

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
    // This file's source (it names fixed ports as the refused example), not
    // the compiled file `__filename` names under the node:test build.
    const self = path.join(
      repo,
      'src',
      '__tests__',
      'unit',
      'coverage',
      'pinCases.test.ts',
    );
    const found = roots
      .flatMap((root) => sources(root))
      .filter((file) => file.includes(`${path.sep}__tests__${path.sep}`))
      .filter((file) => file !== self)
      .flatMap(fixedListens);
    assert.deepStrictEqual(found, []);
  });

  it('the ADT stand-in takes no port', () => {
    const arity: Parameters<typeof adtStandIn>['length'] = 0;
    assert.equal(adtStandIn.length, arity);
  });
});

describe('a matched case', () => {
  /** What the stub's connection sends on its own: its logon and its logoff. */
  const SESSION: MatchedRequest[] = [
    { method: 'GET', path: '/sap/bc/adt/core/discovery' },
    { method: 'GET', path: '/sap/public/bc/icf/logoff' },
  ];

  /** A stub that sends a GET to each of `paths`, one after another. */
  const sender = (...paths: string[]) =>
    stub('StubSends', async (context) => {
      for (const url of paths) {
        await context.connection.makeAdtRequest({
          url,
          method: 'GET',
          timeout: 0,
        });
      }
      return textAnswer('{}');
    });

  const sends = (matched: MatchedRequest[]): PinCase => ({
    tool: 'StubSends',
    variant: 'onprem',
    stand: 'adtStandIn',
    args: {},
    matched,
    expected: [],
  });

  it('answers by the matcher and compares the window sorted, whatever the order sent', async () => {
    const tools = {
      entries: entries(sender('/sap/bc/adt/b', '/sap/bc/adt/a')),
    };
    const c = sends([
      ...SESSION,
      {
        method: 'GET',
        path: '/sap/bc/adt/a',
        answer: { status: 200, text: 'A' },
      },
      { method: 'GET', path: '/sap/bc/adt/b' },
    ]);
    const recorded = await recordCase(c, tools);
    assert.deepStrictEqual(
      recorded.requests.map((r) => r.url),
      ['/sap/bc/adt/a', '/sap/bc/adt/b'],
    );
    assert.equal(
      await runPinCase({ ...c, expected: recorded.requests }, tools),
      undefined,
    );
  });

  it('fails on a request no matcher fits', async () => {
    const tools = { entries: entries(sender('/sap/bc/adt/a')) };
    await assertRejects(
      recordCase(sends([...SESSION]), tools),
      'no matcher fits GET /sap/bc/adt/a',
    );
  });

  it('fails on a request sent more often than its matcher states', async () => {
    const tools = {
      entries: entries(sender('/sap/bc/adt/a', '/sap/bc/adt/a')),
    };
    await assertRejects(
      recordCase(
        sends([...SESSION, { method: 'GET', path: '/sap/bc/adt/a' }]),
        tools,
      ),
      'GET /sap/bc/adt/a was sent 2 time(s), not 1',
    );
  });

  it('a held request never answered has settled once the case returned', async () => {
    let settled = false;
    const tools = {
      entries: entries(
        stub('StubSends', async (context) => {
          // Not awaited: a read SAP keeps open beside the call.
          context.connection
            .makeAdtRequest({
              url: '/sap/bc/adt/held',
              method: 'GET',
              timeout: 0,
            })
            .then(
              () => {
                settled = true;
              },
              () => {
                settled = true;
              },
            );
          await context.connection.makeAdtRequest({
            url: '/sap/bc/adt/a',
            method: 'GET',
            timeout: 0,
          });
          return textAnswer('{}');
        }),
      ),
    };
    const recorded = await recordCase(
      sends([
        ...SESSION,
        { method: 'GET', path: '/sap/bc/adt/a' },
        { method: 'GET', path: '/sap/bc/adt/held', hold: true },
      ]),
      tools,
    );
    assert.deepStrictEqual(
      recorded.requests.map((r) => r.url),
      ['/sap/bc/adt/a', '/sap/bc/adt/held'],
    );
    // Settled by the stand-in's close, before the case returned: nothing
    // of it outlives the case.
    assert.equal(settled, true);
  });

  it('is refused beside answers, and on the recording stand', async () => {
    await assertRejects(
      recordCase({ ...sends([...SESSION]), answers: [] }),
      'a case answers by matched or by answers, not both',
    );
    await assertRejects(
      recordCase({ ...sends([...SESSION]), stand: 'recording' }),
      "matched needs a stand-in: stand 'adtStandIn' or 'server'",
    );
  });
});

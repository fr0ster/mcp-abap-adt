/**
 * The one registry of live tool calls: every
 * call of every server instance registers at the wrapper's entry, is removed
 * when it ends — on success, on failure and when its request is cancelled —
 * and `settled()` waits for each without aborting any. After the latch
 * `register` refuses, and a call registered just before it is still awaited.
 * Per instance: `settled(instance)` leaves another instance's calls alone,
 * and `latch(instance)` refuses only that instance's calls.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import {
  activeTools,
  isLatched,
  latch,
  pending,
  registerActiveTool,
  resetProcessLatchForTests,
  SHUTDOWN_SENTENCE,
  settled,
} from '../../lib/activeTools';
import type { IHandlersRegistry } from '../../lib/handlers/interfaces';
import { assertMatchObject } from '../helpers/assertions';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

/** A registry with one tool, `Held`, that waits on what the test hands it. */
function heldRegistry(
  next: () => Promise<string>,
  reached: () => void,
): IHandlersRegistry {
  return {
    registerAllTools(server) {
      server.registerTool('Held', { description: 'waits' }, async () => {
        reached();
        const text = await next();
        return { content: [{ type: 'text', text }] };
      });
    },
    registerTool() {},
    getRegisteredTools: () => ['Held'],
  };
}

class Instance extends BaseMcpServer {
  constructor(registry: IHandlersRegistry) {
    super({ name: 'registry-test', version: '1.0.0', logger: silent });
    this.registerHandlers(registry);
  }
}

/**
 * Every stand a test served, ended in afterEach whatever the test's checks
 * said: a call still waiting keeps the SDK's request timer (600 s) alive, and
 * with it the file's process.
 */
const opened: Array<{
  work: Array<ReturnType<typeof deferred<string>>>;
  close(): Promise<void>;
}> = [];

async function serve() {
  const work: Array<ReturnType<typeof deferred<string>>> = [];
  let reached = 0;
  const server = new Instance(
    heldRegistry(
      () => {
        const d = deferred<string>();
        work.push(d);
        return d.promise;
      },
      () => {
        reached += 1;
      },
    ),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = (signal?: AbortSignal) =>
    client
      .callTool({ name: 'Held', arguments: {} }, undefined, {
        ...(signal ? { signal } : {}),
        timeout: 600_000,
      })
      .then(
        (r) => r as { content: { text: string }[]; isError?: boolean },
        () => 'cancelled' as const,
      );
  let closed = false;
  const stand = {
    server,
    work,
    reached: () => reached,
    call,
    close: async () => {
      if (closed) return;
      closed = true;
      await client.close();
      await server.close();
    },
  };
  opened.push(stand);
  return stand;
}

beforeEach(() => {
  resetProcessLatchForTests();
  mock.method(process.stderr, 'write', () => true);
});

afterEach(async () => {
  for (const stand of opened.splice(0)) {
    for (const held of stand.work) held.resolve('ended by the file');
    await stand.close();
  }
  mock.restoreAll();
  resetProcessLatchForTests();
});

it('registers calls of two server instances in the one registry, and removes each when it ends (success and failure)', async () => {
  const a = await serve();
  const b = await serve();
  const ca = a.call();
  const cb = b.call();
  await turns();
  assert.equal(activeTools().length, 2);
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['Held', 'Held'],
  );

  a.work[0]?.resolve('a');
  assertMatchObject(await ca, { content: [{ text: 'a' }] });
  assert.equal(activeTools().length, 1);

  b.work[0]?.reject(new Error('the tool failed'));
  await cb;
  assert.equal(activeTools().length, 0);
  await a.close();
  await b.close();
});

it('removes a call whose request was cancelled once it ends — its tool is not aborted by the registry', async () => {
  const a = await serve();
  const controller = new AbortController();
  const ca = a.call(controller.signal);
  await turns();
  assert.equal(activeTools().length, 1);
  controller.abort();
  assert.equal(await ca, 'cancelled');
  // The tool still runs: nothing of the registry aborted it.
  assert.equal(activeTools().length, 1);
  a.work[0]?.resolve('ran to its end');
  await settled();
  assert.equal(activeTools().length, 0);
  await a.close();
});

it('settled() waits for every registered call, across instances, without aborting any', async () => {
  const a = await serve();
  const b = await serve();
  void a.call();
  void b.call();
  await turns();
  let done = false;
  const waiting = settled().then(() => {
    done = true;
  });
  await turns();
  assert.equal(done, false);
  assert.equal(
    activeTools().every((t) => !t.signal.aborted),
    true,
  );
  a.work[0]?.resolve('a');
  await turns();
  assert.equal(done, false);
  b.work[0]?.resolve('b');
  await waiting;
  assert.equal(done, true);
  await a.close();
  await b.close();
});

it('after latch() register refuses, and the wrapper answers the shutdown refusal before the tool', async () => {
  const a = await serve();
  latch();
  assert.equal(isLatched(), true);
  assert.equal(registerActiveTool(new AbortController()), undefined);
  const answer = await a.call();
  assert.equal(a.reached(), 0);
  assert.notEqual(answer, 'cancelled');
  const result = answer as { content: { text: string }[]; isError?: boolean };
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0]?.text ?? '{}');
  assertMatchObject(payload, {
    error: 'authentication_failed',
    kind: 'interactive-login',
    server: SHUTDOWN_SENTENCE,
  });
  assert.equal(activeTools().length, 0);
  await a.close();
});

it('a call registered just before the latch is still awaited by settled()', async () => {
  const a = await serve();
  void a.call();
  await turns();
  latch();
  let done = false;
  const waiting = settled().then(() => {
    done = true;
  });
  await turns();
  assert.equal(done, false);
  assert.deepStrictEqual(pending(), ['Held']);
  a.work[0]?.resolve('a');
  await waiting;
  assert.deepStrictEqual(pending(), []);
  await a.close();
});

describe('per instance', () => {
  it("settled(instance) waits for that instance's calls and leaves another's alone", async () => {
    const a = await serve();
    const b = await serve();
    void a.call();
    void b.call();
    await turns();
    let aDone = false;
    const aSettled = settled(a.server).then(() => {
      aDone = true;
    });
    a.work[0]?.resolve('a');
    await aSettled;
    assert.equal(aDone, true);
    // b's call still runs, untouched.
    assert.equal(activeTools().length, 1);
    assert.equal(activeTools()[0]?.signal.aborted, false);
    b.work[0]?.resolve('b');
    await settled();
    await a.close();
    await b.close();
  });

  it("after latch(instance) only that instance's registration refuses", async () => {
    const a = await serve();
    const b = await serve();
    latch(a.server);
    assert.equal(isLatched(a.server), true);
    assert.equal(isLatched(b.server), false);
    assert.equal(isLatched(), false);
    const refused = (await a.call()) as { isError?: boolean };
    assert.equal(refused.isError, true);
    assert.equal(a.reached(), 0);
    const cb = b.call();
    await turns();
    assert.equal(b.reached(), 1);
    b.work[0]?.resolve('b');
    assertMatchObject(await cb, { content: [{ text: 'b' }] });
    await a.close();
    await b.close();
  });
});

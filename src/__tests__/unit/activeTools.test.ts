/**
 * The one registry of live tool calls (spec §6.4, D33, D51, D55): every
 * call of every server instance registers at the wrapper's entry, is removed
 * when it ends — on success, on failure and when its request is cancelled —
 * and `settled()` waits for each without aborting any. After the latch
 * `register` refuses, and a call registered just before it is still awaited.
 * Per instance: `settled(instance)` leaves another instance's calls alone,
 * and `latch(instance)` refuses only that instance's calls.
 */

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
  return {
    server,
    work,
    reached: () => reached,
    call,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

beforeEach(() => {
  resetProcessLatchForTests();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
  resetProcessLatchForTests();
});

it('registers calls of two server instances in the one registry, and removes each when it ends (success and failure)', async () => {
  const a = await serve();
  const b = await serve();
  const ca = a.call();
  const cb = b.call();
  await turns();
  expect(activeTools()).toHaveLength(2);
  expect(activeTools().map((t) => t.name)).toEqual(['Held', 'Held']);

  a.work[0]?.resolve('a');
  expect(await ca).toMatchObject({ content: [{ text: 'a' }] });
  expect(activeTools()).toHaveLength(1);

  b.work[0]?.reject(new Error('the tool failed'));
  await cb;
  expect(activeTools()).toHaveLength(0);
  await a.close();
  await b.close();
});

it('removes a call whose request was cancelled once it ends — its tool is not aborted by the registry', async () => {
  const a = await serve();
  const controller = new AbortController();
  const ca = a.call(controller.signal);
  await turns();
  expect(activeTools()).toHaveLength(1);
  controller.abort();
  expect(await ca).toBe('cancelled');
  // The tool still runs: nothing of the registry aborted it.
  expect(activeTools()).toHaveLength(1);
  a.work[0]?.resolve('ran to its end');
  await settled();
  expect(activeTools()).toHaveLength(0);
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
  expect(done).toBe(false);
  expect(activeTools().every((t) => !t.signal.aborted)).toBe(true);
  a.work[0]?.resolve('a');
  await turns();
  expect(done).toBe(false);
  b.work[0]?.resolve('b');
  await waiting;
  expect(done).toBe(true);
  await a.close();
  await b.close();
});

it('after latch() register refuses, and the wrapper answers the shutdown refusal before the tool', async () => {
  const a = await serve();
  latch();
  expect(isLatched()).toBe(true);
  expect(registerActiveTool(new AbortController())).toBeUndefined();
  const answer = await a.call();
  expect(a.reached()).toBe(0);
  expect(answer).not.toBe('cancelled');
  const result = answer as { content: { text: string }[]; isError?: boolean };
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]?.text ?? '{}');
  expect(payload).toMatchObject({
    error: 'authentication_failed',
    kind: 'interactive-login',
    server: SHUTDOWN_SENTENCE,
  });
  expect(activeTools()).toHaveLength(0);
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
  expect(done).toBe(false);
  expect(pending()).toEqual(['Held']);
  a.work[0]?.resolve('a');
  await waiting;
  expect(pending()).toEqual([]);
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
    expect(aDone).toBe(true);
    // b's call still runs, untouched.
    expect(activeTools()).toHaveLength(1);
    expect(activeTools()[0]?.signal.aborted).toBe(false);
    b.work[0]?.resolve('b');
    await settled();
    await a.close();
    await b.close();
  });

  it("after latch(instance) only that instance's registration refuses", async () => {
    const a = await serve();
    const b = await serve();
    latch(a.server);
    expect(isLatched(a.server)).toBe(true);
    expect(isLatched(b.server)).toBe(false);
    expect(isLatched()).toBe(false);
    const refused = (await a.call()) as { isError?: boolean };
    expect(refused.isError).toBe(true);
    expect(a.reached()).toBe(0);
    const cb = b.call();
    await turns();
    expect(b.reached()).toBe(1);
    b.work[0]?.resolve('b');
    expect(await cb).toMatchObject({ content: [{ text: 'b' }] });
    await a.close();
    await b.close();
  });
});

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import * as z from 'zod';
/**
 * The idle bound ends a long session (spec §2, "Idle bound"): an open long
 * session is held state, so the bound (`stateIdleMinutes`) arms between
 * calls; at expiry the instance's SAP session is logged off and the instance
 * leaves the pool, and the handle answers `state is not available`. A call
 * within the bound restarts it. The bound's timer is run by the test's own
 * clock (below); the HTTP calls run over real sockets.
 */

import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import type { StatePart } from '@mcp-abap-adt/lib/state';
import { CompactLongSessionHandlersGroup } from '../../../../src/lib/compact/longSession/group';
import { LongSessionHandlersGroup } from '../../../../src/lib/handlers/groups/LongSessionHandlersGroup';
import { type HttpStand, httpStand, turns } from './shutdown/harness';

const MINUTE = 60_000;
const placeholder = { connection: undefined } as unknown as HandlerContext;
const NOT_AVAILABLE = 'state is not available';

let s: HttpStand;

/**
 * A held part whose cleanup finishes only when the test lets it — as a
 * debugger's stop awaits SAP: the state is ending while it runs.
 */
let letCleanupFinish: () => void = () => {};
function slowPart(): StatePart {
  let holding = true;
  const listeners: Array<() => void> = [];
  return {
    holdsState: () => holding,
    pending: () => false,
    failures: () => [],
    observe: (l) => {
      listeners.push(l);
    },
    dispose: () =>
      new Promise<void>((resolve) => {
        if (!holding) {
          resolve();
          return;
        }
        letCleanupFinish = () => {
          holding = false;
          for (const l of listeners) l();
          resolve();
        };
      }),
  };
}

/** `HoldSlowPart`: attaches a slow-cleanup part to the instance state. */
const slowPartGroup: IHandlerGroup = {
  getName: () => 'slow-part',
  registerHandlers: () => {},
  getHandlers: (): HandlerEntry[] => [
    {
      toolDefinition: {
        name: 'HoldSlowPart',
        description: 'holds a part whose cleanup is slow',
        inputSchema: z.object({}),
      } as never,
      call: (async (context: HandlerContext, _args: unknown) => {
        context.state?.attach(slowPart());
        return { content: [{ type: 'text', text: 'held' }] };
      }) as never,
      connectionless: true,
    },
  ],
} as unknown as IHandlerGroup;

interface PoolInternals {
  size(): number;
}
const poolSize = () =>
  (s.mcp as unknown as { pool: PoolInternals }).pool.size();

/** Real-socket progress without a timer: setImmediate turns. */
const settle = () => turns(40);

const handleOf = (text: string): string =>
  (JSON.parse(text) as { state_handle: string }).state_handle;

/**
 * The test's clock for the idle bound: a `setTimeout` of a minute or more is
 * the bound's (nothing else in the HTTP path waits that long) and is held
 * here, to be run by `advance`; every other timer is the real one. Faking
 * all timers stalls the real sockets.
 */
interface Held {
  fn: () => void;
  due: number;
  handle: object;
}
let held: Held[];
let now: number;
const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;

function advance(ms: number): void {
  now += ms;
  for (const h of [...held].sort((x, y) => x.due - y.due)) {
    if (h.due <= now) {
      held = held.filter((x) => x !== h);
      h.fn();
    }
  }
}

beforeEach(async () => {
  held = [];
  now = 0;
  mock.method(console, 'error', () => {});
  s = await httpStand({
    stateIdleMinutes: 30,
    groups: [
      new LongSessionHandlersGroup(placeholder),
      new CompactLongSessionHandlersGroup(placeholder),
      slowPartGroup,
    ],
  });
  global.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (typeof ms === 'number' && ms >= MINUTE) {
      const handle = { unref() {}, ref() {} };
      held.push({ fn, due: now + ms, handle });
      return handle;
    }
    return (realSetTimeout as (...a: unknown[]) => unknown)(fn, ms, ...rest);
  }) as unknown as typeof setTimeout;
  global.clearTimeout = ((handle: object) => {
    const before = held.length;
    held = held.filter((h) => h.handle !== handle);
    if (held.length === before) realClearTimeout(handle as never);
  }) as unknown as typeof clearTimeout;
});

afterEach(async () => {
  global.setTimeout = realSetTimeout;
  global.clearTimeout = realClearTimeout;
  await s.close();
  mock.restoreAll();
});

it('no call for the bound ends the long session: SAP session logged off, instance out of the pool, handle unknown, nothing created', async () => {
  const opened = await s.call('SessionOpen', {});
  assert.equal(opened.isError, false);
  const handle = handleOf(opened.text);
  const probed = await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  assert.equal(probed.isError, false);
  assert.equal(poolSize(), 1);
  assert.equal(s.standIn.logoffs(), 0);

  advance(30 * MINUTE - 1);
  await settle();
  assert.equal(poolSize(), 1);
  assert.equal(s.standIn.logoffs(), 0);

  advance(1);
  await settle();
  assert.equal(s.standIn.logoffs(), 1);
  assert.equal(poolSize(), 0);

  const sent = s.standIn.requests.length;
  const after = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  assert.deepStrictEqual(after, {
    status: 200,
    text: NOT_AVAILABLE,
    isError: true,
  });
  await settle();
  assert.equal(s.standIn.requests.length, sent);
  assert.equal(poolSize(), 0);
});

it('a call within the bound restarts it: the session outlives the original deadline and ends one bound after its last call', async () => {
  const handle = handleOf((await s.call('SessionOpen', {})).text);
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });

  advance(20 * MINUTE);
  const again = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  assert.equal(again.isError, false);

  advance(20 * MINUTE); // 40 minutes after open
  await settle();
  assert.equal(poolSize(), 1);
  assert.equal(s.standIn.logoffs(), 0);

  advance(10 * MINUTE); // 30 after the last call
  await settle();
  assert.equal(s.standIn.logoffs(), 1);
  assert.equal(poolSize(), 0);
  const gone = await s.call('ProbeAdt', { id: 'three', state_handle: handle });
  assert.equal(gone.text, NOT_AVAILABLE);
});

it('an ending session is never reopened: open with its handle while the expiry cleanup runs is refused; the handle then ends', async () => {
  const handle = handleOf((await s.call('SessionOpen', {})).text);
  const heldPart = await s.call('HoldSlowPart', { state_handle: handle });
  assert.equal(heldPart.isError, false);

  advance(30 * MINUTE); // the bound fires; the cleanup waits
  await settle();
  assert.equal(poolSize(), 1);

  const reopened = await s.call('SessionOpen', { state_handle: handle });
  assert.deepStrictEqual(reopened, {
    status: 200,
    text: NOT_AVAILABLE,
    isError: true,
  });
  const compact = await s.call('HandlerSession', {
    action: 'open',
    state_handle: handle,
  });
  assert.deepStrictEqual(compact, {
    status: 200,
    text: NOT_AVAILABLE,
    isError: true,
  });

  letCleanupFinish();
  await settle();
  assert.equal(poolSize(), 0);
  const after = await s.call('SessionOpen', { state_handle: handle });
  assert.deepStrictEqual(after, {
    status: 200,
    text: NOT_AVAILABLE,
    isError: true,
  });
  // A new session gets a new handle.
  const fresh = await s.call('SessionOpen', {});
  assert.notEqual(handleOf(fresh.text), handle);
});

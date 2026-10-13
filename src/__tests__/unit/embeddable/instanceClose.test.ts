/**
 * The instance close (spec §6.4, D51), main's `closeInstanceState` grown up:
 * in order — the instance latch (in the tick it begins), its calls settle
 * (none aborted), the state undo, the terminal close whatever the undo
 * answered, the MCP server's close. One promise per instance: a second
 * caller joins it. What the undo left is answered, never thrown.
 */

import {
  isLatched,
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../lib/activeTools';
import { closeInstance, isClosing } from '../../../lib/instanceClose';
import { own } from '../../../lib/ownedConnections';

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

function instance(left: string[] | Error = []) {
  const order: string[] = [];
  const connection = {
    disconnect: async () => {
      order.push('logoff');
    },
  };
  const self = {
    order,
    shutdownState: async () => {
      order.push('undo');
      if (left instanceof Error) throw left;
      return left;
    },
    close: async () => {
      order.push('mcp close');
    },
  };
  own(connection, { owner: self, role: 'built' });
  return self;
}

beforeEach(() => resetProcessLatchForTests());

it('latch in its tick, then the calls settle, the undo, the logoffs, the MCP server', async () => {
  const one = instance();
  const call = registerActiveTool(new AbortController(), {
    instance: one,
    name: 'UpdateClass',
  });
  const closing = closeInstance(one);
  expect(isLatched(one)).toBe(true);
  expect(isClosing(one)).toBe(true);
  expect(isLatched()).toBe(false);
  await turns();
  expect(one.order).toEqual([]);
  call?.();
  expect(await closing).toEqual([]);
  expect(one.order).toEqual(['undo', 'logoff', 'mcp close']);
});

it('a second caller joins the first: one undo, one logoff', async () => {
  const one = instance();
  const [a, b] = await Promise.all([closeInstance(one), closeInstance(one)]);
  expect(a).toBe(b);
  expect(one.order).toEqual(['undo', 'logoff', 'mcp close']);
});

it('an undo that left something: answered, and the logoffs are still written', async () => {
  const one = instance(['a debuggee was left']);
  expect(await closeInstance(one)).toEqual(['a debuggee was left']);
  expect(one.order).toEqual(['undo', 'logoff', 'mcp close']);
});

it('an undo that threw: fixed words, never its message, and the logoffs are still written', async () => {
  const one = instance(new Error('a secret-looking detail'));
  const left = await closeInstance(one);
  expect(left).toEqual(['the state could not be shut down']);
  expect(one.order).toEqual(['undo', 'logoff', 'mcp close']);
});

it("another instance's calls are not awaited", async () => {
  const one = instance();
  const other = {};
  const call = registerActiveTool(new AbortController(), {
    instance: other,
    name: 'GetClass',
  });
  expect(await closeInstance(one)).toEqual([]);
  call?.();
});

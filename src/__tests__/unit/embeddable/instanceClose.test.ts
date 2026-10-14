/**
 * The instance close (spec §6.4, D51) — the client closed its connection
 * (an SSE stream, an embedder's own close): in the tick it begins, the
 * instance latch, the logoff of every connection the instance owns and the
 * interruption of every call of the instance; nothing waits for a running
 * call. Then the state let go (no undo sent) and the MCP server's close. One
 * promise per instance: a second caller joins it.
 */

import {
  isLatched,
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../lib/activeTools';
import { closeInstance, isClosing } from '../../../lib/instanceClose';
import { closeOwnedConnections, own } from '../../../lib/ownedConnections';

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

function instance(letGo: () => void = () => {}) {
  const order: string[] = [];
  const connection = (name: string) => ({
    disconnect: async () => {
      order.push(`logoff ${name}`);
    },
  });
  const self = {
    order,
    letGoOfState: () => {
      order.push('let go');
      letGo();
    },
    close: async () => {
      order.push('mcp close');
    },
  };
  own(connection('built'), { owner: self, role: 'built' });
  own(connection('state'), { owner: self, role: 'state' });
  own(connection('long'), { owner: self, role: 'long' });
  return self;
}

const LOGOFFS = ['logoff built', 'logoff state', 'logoff long'];

beforeEach(() => resetProcessLatchForTests());

it('in its tick: the latch, every owned connection logged off, every call interrupted — the running call is not awaited', async () => {
  const one = instance();
  const running = new AbortController();
  const queued = new AbortController();
  const call = registerActiveTool(running, {
    instance: one,
    name: 'UpdateClass',
  });
  registerActiveTool(queued, { instance: one, name: 'UpdateClass' });
  const closing = closeInstance(one);
  expect(isLatched(one)).toBe(true);
  expect(isClosing(one)).toBe(true);
  expect(isLatched()).toBe(false);
  expect(running.signal.aborted).toBe(true);
  expect(queued.signal.aborted).toBe(true);
  expect(one.order).toEqual(LOGOFFS);
  // The running call never settled: the close ends without it.
  await closing;
  expect(one.order).toEqual([...LOGOFFS, 'let go', 'mcp close']);
  call?.();
});

it('a second caller joins the first: one logoff each, one let-go', async () => {
  const one = instance();
  const a = closeInstance(one);
  const b = closeInstance(one);
  expect(a).toBe(b);
  await a;
  expect(one.order).toEqual([...LOGOFFS, 'let go', 'mcp close']);
});

it('a let-go that throws changes nothing: the MCP server is still closed', async () => {
  const one = instance(() => {
    throw new Error('a secret-looking detail');
  });
  await closeInstance(one);
  expect(one.order.slice(-2)).toEqual(['let go', 'mcp close']);
});

it("another instance's calls are neither interrupted nor awaited, and its connections stay", async () => {
  const one = instance();
  const other = instance();
  const theirs = new AbortController();
  const call = registerActiveTool(theirs, {
    instance: other,
    name: 'GetClass',
  });
  await closeInstance(one);
  await turns();
  expect(theirs.signal.aborted).toBe(false);
  expect(other.order).toEqual([]);
  call?.();
});

it('a terminal close after the instance close began joins its logoffs: no second logoff, settled only once they are written', async () => {
  let write: () => void = () => {};
  const written = new Promise<void>((resolve) => {
    write = resolve;
  });
  let logoffs = 0;
  const self = {
    letGoOfState: () => {},
    close: async () => {},
  };
  own(
    {
      disconnect: async () => {
        logoffs += 1;
        await written;
      },
    },
    { owner: self, role: 'built' },
  );
  void closeInstance(self);
  let joined = false;
  const terminal = closeOwnedConnections(self).then(() => {
    joined = true;
  });
  await turns();
  expect(logoffs).toBe(1);
  expect(joined).toBe(false);
  write();
  await terminal;
  expect(logoffs).toBe(1);
});

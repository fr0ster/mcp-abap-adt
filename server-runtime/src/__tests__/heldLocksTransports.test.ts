/**
 * Held locks on every transport (#4): stdio, Streamable HTTP and SSE. Each
 * instance owns a `HeldLocks`, so a write, a delete or an unlock under a
 * `lock_handle` is sent only when that instance's own `HandlerLock` issued
 * the handle. SAP releases the session's lock on an UNLOCK whatever handle
 * it names (measured on premise), so the refusal is the server's to make:
 * a handle this instance did not issue is refused before any request.
 *
 * Every transport runs over its real server and the ADT stand-in; the tools
 * under test are compact `HandlerLock` / `HandlerUnlock` / `HandlerUpdate` /
 * `HandlerDelete`. An unknown handle and another instance's get one answer:
 * on Streamable HTTP it names the `state_handle` that routes a call to its
 * instance; on stdio and SSE, which route nothing by it, it says a lock
 * handle works only in the instance that issued it.
 */

import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import { noConnectionContext } from '@mcp-abap-adt/lib/handlers';
import { HeldLocks } from '@mcp-abap-adt/lib/state';
import type {
  AdtStandIn,
  StandInRequest,
} from '../../../src/__tests__/helpers/adtStandIn';
import { httpStand, until } from '../http/__tests__/shutdown/harness';
import { sseStand } from '../sse/__tests__/shutdown/harness';
import { stand as stdioStand } from '../stdio/__tests__/helpers/loginStand';

jest.setTimeout(60_000);

// The words a write or an unlock under a handle the instance does not hold
// answers, copied here, never imported: the test is the copy. Streamable
// HTTP routes by the state_handle, stdio and SSE do not.
const NOT_HELD_ROUTED =
  'lock_handle is not held by this instance: send the state_handle HandlerLock answered as the state_handle argument (or in the x-mcp-state-handle header)';
const NOT_HELD_HERE =
  'lock_handle is not held by this instance: a lock handle works only in the server instance whose HandlerLock issued it';

/** The handle the stand-in's every LOCK answers. */
const ISSUED = 'B92E65858E83454C783181344F429D4BFD8E395D';
/** A handle no instance issued. */
const FOREIGN = 'F0REIGN0000000000000000000000000000000000';

type Answer = { text: string; isError: boolean };

/** Calls on one instance of the transport. */
interface Session {
  call(name: string, args: Record<string, unknown>): Promise<Answer>;
}

interface TransportStand {
  adt: AdtStandIn;
  /** The words of a handle the instance does not hold, on this transport. */
  notHeld: string;
  /** A session on an instance of its own. */
  session(): Promise<Session>;
  /**
   * Settles once what the release of the instance's last lock started has
   * reached SAP: on Streamable HTTP the instance holds nothing more, leaves
   * the pool and is logged off; stdio and SSE keep their instance.
   */
  released(): Promise<void>;
  close(): Promise<void>;
}

const groups = () => {
  const context = noConnectionContext();
  return [new CompactModifyHandlersGroup(context)];
};

const textOf = (answer: Answer | 'cancelled'): Answer =>
  answer === 'cancelled' ? { text: 'cancelled', isError: true } : answer;

/** stdio: the process's one instance; every session is it. */
async function onStdio(): Promise<TransportStand> {
  const s = await stdioStand({ kind: 'onprem', groups: groups() });
  return {
    adt: s.adt,
    notHeld: NOT_HELD_HERE,
    session: async () => ({
      call: async (name, args) => textOf(await s.callTool(name, args)),
    }),
    released: async () => {},
    close: () => s.close(),
  };
}

/** SSE: a session is a connection, its instance its own. */
async function onSse(): Promise<TransportStand> {
  const s = await sseStand({ groups: groups() });
  return {
    adt: s.standIn,
    notHeld: NOT_HELD_HERE,
    session: async () => {
      const connection = await s.open();
      let id = 0;
      return {
        call: async (name, args) => {
          id += 1;
          await connection.call(name, args, id);
          return connection.answer(id);
        },
      };
    },
    released: async () => {},
    close: () => s.close(),
  };
}

/**
 * Streamable HTTP: a session sends the `state_handle` its instance answered
 * (a lock's), so its later calls reach that instance; before one, each call
 * reaches an instance of its own.
 */
async function onHttp(): Promise<TransportStand> {
  const s = await httpStand({ groups: groups() });
  return {
    adt: s.standIn,
    notHeld: NOT_HELD_ROUTED,
    session: async () => {
      let stateHandle: string | undefined;
      return {
        call: async (name, args) => {
          const answered = await s.call(
            name,
            stateHandle === undefined
              ? args
              : { ...args, state_handle: stateHandle },
          );
          if (stateHandle === undefined && !answered.isError) {
            const read: unknown = JSON.parse(answered.text);
            if (
              typeof read === 'object' &&
              read !== null &&
              'state_handle' in read &&
              typeof read.state_handle === 'string'
            ) {
              stateHandle = read.state_handle;
            }
          }
          return { text: answered.text, isError: answered.isError };
        },
      };
    },
    released: () => until(() => s.standIn.logoffs() === 1),
    close: () => s.close(),
  };
}

const TRANSPORTS: Array<[string, () => Promise<TransportStand>]> = [
  ['stdio', onStdio],
  ['Streamable HTTP', onHttp],
  ['SSE', onSse],
];

const sent = (requests: StandInRequest[]) =>
  requests.map((r) => `${r.method} ${r.url}`);

/** A tool that writes under a lock: how it locks, and its call. */
interface UnderLock {
  lock: { object_type: string; object_name: string };
  args: (lockHandle: string) => Record<string, unknown>;
  /** The requests the call sends under its own handle, by literal. */
  requests: string[];
}

const SOURCE = 'placeholder source';

const UNDER_LOCK: Array<[string, UnderLock]> = [
  [
    'HandlerUnlock',
    {
      lock: { object_type: 'CLASS', object_name: 'ZCL_HELD' },
      args: (lock_handle) => ({
        object_type: 'CLASS',
        object_name: 'ZCL_HELD',
        lock_handle,
      }),
      requests: [
        `POST /sap/bc/adt/oo/classes/zcl_held?_action=UNLOCK&lockHandle=${ISSUED}`,
      ],
    },
  ],
  [
    'HandlerUpdate',
    {
      lock: { object_type: 'CLASS', object_name: 'ZCL_HELD' },
      args: (lock_handle) => ({
        object_type: 'CLASS',
        class_name: 'ZCL_HELD',
        source_code: SOURCE,
        lock_handle,
      }),
      requests: [
        `PUT /sap/bc/adt/oo/classes/zcl_held/source/main?lockHandle=${ISSUED}`,
      ],
    },
  ],
  [
    'HandlerDelete',
    {
      lock: { object_type: 'CLASS', object_name: 'ZCL_HELD' },
      args: (lock_handle) => ({
        object_type: 'LOCAL_TYPES',
        class_name: 'ZCL_HELD',
        lock_handle,
      }),
      requests: [
        `PUT /sap/bc/adt/oo/classes/zcl_held/includes/implementations?lockHandle=${ISSUED}`,
      ],
    },
  ],
];

/** Locks through `HandlerLock`: answers the handle it issued. */
async function lock(
  session: Session,
  target: { object_type: string; object_name: string },
): Promise<string> {
  const locked = await session.call('HandlerLock', target);
  expect(locked.isError).toBe(false);
  const read: unknown = JSON.parse(locked.text);
  if (
    typeof read !== 'object' ||
    read === null ||
    !('lock_handle' in read) ||
    typeof read.lock_handle !== 'string'
  ) {
    throw new Error(`no lock_handle in ${locked.text}`);
  }
  return read.lock_handle;
}

describe.each(TRANSPORTS)('%s', (_transport, standOf) => {
  let s: TransportStand;
  let owners: HeldLocks[];

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    owners = [];
    const hold = HeldLocks.prototype.hold;
    jest.spyOn(HeldLocks.prototype, 'hold').mockImplementation(function (
      this: HeldLocks,
      ...args
    ) {
      if (!owners.includes(this)) owners.push(this);
      return hold.apply(this, args);
    });
    s = await standOf();
  });

  afterEach(async () => {
    await s.close();
    jest.restoreAllMocks();
  });

  it('HandlerLock registers its handle', async () => {
    const session = await s.session();
    const handle = await lock(session, {
      object_type: 'CLASS',
      object_name: 'ZCL_HELD',
    });
    expect(handle).toBe(ISSUED);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.holds(ISSUED)).toBe(true);
  });

  it.each(UNDER_LOCK)(
    '%s under a handle this instance did not issue is refused with zero requests',
    async (tool, underLock) => {
      const session = await s.session();
      // The instance holds a lock of its own, so it is connected and kept.
      await lock(session, underLock.lock);
      const before = s.adt.requests.length;
      const answered = await session.call(tool, underLock.args(FOREIGN));
      expect(answered.isError).toBe(true);
      expect(answered.text).toContain(s.notHeld);
      expect(sent(s.adt.requests.slice(before))).toEqual([]);
    },
  );

  it.each(UNDER_LOCK)(
    '%s under the handle HandlerLock gave is sent',
    async (tool, underLock) => {
      const session = await s.session();
      const handle = await lock(session, underLock.lock);
      const before = s.adt.requests.length;
      const answered = await session.call(tool, underLock.args(handle));
      expect(answered.isError).toBe(false);
      expect(sent(s.adt.requests.slice(before))).toEqual(underLock.requests);
    },
  );

  it('HandlerUnlock releases the handle, and a second unlock with it is refused', async () => {
    const session = await s.session();
    const handle = await lock(session, {
      object_type: 'CLASS',
      object_name: 'ZCL_HELD',
    });
    const unlock = {
      object_type: 'CLASS',
      object_name: 'ZCL_HELD',
      lock_handle: handle,
    };
    const first = await session.call('HandlerUnlock', unlock);
    expect(first.isError).toBe(false);
    expect(owners[0]?.holds(handle)).toBe(false);
    await s.released();
    const before = s.adt.requests.length;
    const second = await session.call('HandlerUnlock', unlock);
    expect(second.isError).toBe(true);
    expect(sent(s.adt.requests.slice(before))).toEqual([]);
  });
});

describe("every transport's instance has its own held-lock owner", () => {
  let owners: HeldLocks[];

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    owners = [];
    const hold = HeldLocks.prototype.hold;
    jest.spyOn(HeldLocks.prototype, 'hold').mockImplementation(function (
      this: HeldLocks,
      ...args
    ) {
      if (!owners.includes(this)) owners.push(this);
      return hold.apply(this, args);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const LOCKED = { object_type: 'CLASS', object_name: 'ZCL_HELD' };
  const UPDATE = (lock_handle: string) => ({
    object_type: 'CLASS',
    class_name: 'ZCL_HELD',
    source_code: SOURCE,
    lock_handle,
  });

  it('stdio: the instance holds the handle its lock issued', async () => {
    const s = await onStdio();
    try {
      const handle = await lock(await s.session(), LOCKED);
      expect(owners).toHaveLength(1);
      expect(owners[0]?.holds(handle)).toBe(true);
    } finally {
      await s.close();
    }
  });

  it.each([
    ['Streamable HTTP', onHttp],
    ['SSE', onSse],
  ])(
    "%s: another instance refuses the first one's handle, and locks into an owner of its own",
    async (_transport, standOf) => {
      const s = await standOf();
      try {
        const first = await s.session();
        const handle = await lock(first, LOCKED);
        expect(owners).toHaveLength(1);

        const second = await s.session();
        const refused = await second.call('HandlerUpdate', UPDATE(handle));
        expect(refused.isError).toBe(true);
        expect(refused.text).toContain(s.notHeld);
        // An unknown handle gets the same answer as another instance's.
        const unknown = await second.call('HandlerUpdate', UPDATE(FOREIGN));
        expect(unknown).toEqual(refused);
        expect(
          s.adt.requests.filter(
            (r) => r.method === 'PUT' || r.url.includes('_action=UNLOCK'),
          ),
        ).toEqual([]);

        await lock(second, LOCKED);
        expect(owners).toHaveLength(2);
        expect(owners[0]).not.toBe(owners[1]);
      } finally {
        await s.close();
      }
    },
  );
});

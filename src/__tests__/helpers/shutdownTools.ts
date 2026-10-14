/**
 * Tools the shutdown and connection-end suites run against the ADT stand-in
 * (`adtStandIn.ts`): each sends real requests on its call's connection, so
 * the stand-in's log shows what reached the system and in which order —
 * the update, the `UNLOCK`, and the session's logoff after them.
 *
 * - `LockedUpdate { id }`: `LOCK`, the update (`PUT`), `UNLOCK` — the shape
 *   of every write; answers `id`, or an error when the `UNLOCK` is refused
 *   (the lock is then left in the session, for its logoff to release);
 * - `LockOnly { id }`: `LOCK`, nothing else — a lock tool's session;
 * - `HoldState { id }`: held state with a connection of its own (opened
 *   fresh, recorded as the state's), whose undo sends a debugger stop on it —
 *   refused while the stand-in refuses `/debugger/stop`; answers the handle;
 * - `StopState { state_handle }`: the state's stop tool — a complete stop;
 * - `LongRead { id }`: a long read's shape — a fresh connection of its own
 *   (role `long`, the calling instance's), one `GET` on it, then its end;
 * - `MainThenFresh { id }`: the debugger start's shape — one `GET` on the
 *   instance's connection, then a fresh connection of its own (role
 *   `state`) and a listen on it.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { endConnection, own } from '../../lib/ownedConnections';
import { openFreshConnection } from '../../lib/packageSessions';
import type { InstanceState, StatePart } from '../../lib/state/InstanceState';

export const classUrl = (id: string) => `/sap/bc/adt/oo/classes/${id}`;
export const lockUrl = (id: string) => `${classUrl(id)}?_action=LOCK`;
export const updateUrl = (id: string) => `${classUrl(id)}/source/main`;
export const unlockUrl = (id: string) => `${classUrl(id)}?_action=UNLOCK`;
export const listenUrl = (id: string) => `/sap/bc/adt/debugger/listen/${id}`;
export const stopUrl = (id: string) => `/sap/bc/adt/debugger/stop/${id}`;
export const longReadUrl = (id: string) => `/sap/bc/adt/longread/${id}`;
export const mainReadUrl = (id: string) => `/sap/bc/adt/mainread/${id}`;

/** Whether the stand-in's `url` is the `UNLOCK` of `id` (and so on). */
export const isUnlockOf = (id: string) => (url: string) =>
  url.startsWith(unlockUrl(id));
export const isUpdateOf = (id: string) => (url: string) =>
  url.startsWith(updateUrl(id));
export const isLockOf = (id: string) => (url: string) =>
  url.startsWith(lockUrl(id));

interface Ctx {
  connection: IAbapConnection;
  state: InstanceState;
  logger?: unknown;
}

const send = (
  connection: IAbapConnection,
  method: string,
  url: string,
): Promise<unknown> =>
  connection.makeAdtRequest({ url, method, timeout: 600_000 });

/** Held state with a connection of its own, released by its undo. */
class HeldDebugState implements StatePart {
  private holding = true;
  private left: string[] = [];
  private notify: () => void = () => {};

  constructor(
    private readonly id: string,
    private readonly own: IAbapConnection,
  ) {}

  holdsState() {
    return this.holding;
  }
  pending() {
    return false;
  }
  failures() {
    return this.holding ? this.left : [];
  }
  observe(onChange: () => void) {
    this.notify = onChange;
  }
  async dispose() {
    if (!this.holding) return;
    try {
      await send(this.own, 'POST', stopUrl(this.id));
    } catch {
      this.left = ['the debugger stop was refused'];
      throw new Error('the debugger stop was refused');
    }
    this.holding = false;
    await endConnection(this.own);
    this.notify();
  }
}

function entry(
  name: string,
  properties: Record<string, { type: string }>,
  handler: (ctx: Ctx, args: Record<string, string>) => Promise<unknown>,
): HandlerEntry {
  return {
    toolDefinition: {
      name,
      description: name,
      inputSchema: {
        type: 'object',
        // Every tool takes a handle: the pool routes by it.
        properties: { ...properties, state_handle: { type: 'string' } },
        required: Object.keys(properties).filter((k) => k !== 'state_handle'),
      },
    },
    handler,
  } as unknown as HandlerEntry;
}

const text = (value: string) => ({ content: [{ type: 'text', text: value }] });

export function shutdownTools(): HandlerEntry[] {
  return [
    entry('LockedUpdate', { id: { type: 'string' } }, async (ctx, args) => {
      const id = args.id ?? '';
      await send(ctx.connection, 'POST', lockUrl(id));
      await send(ctx.connection, 'PUT', updateUrl(id));
      try {
        await send(ctx.connection, 'POST', unlockUrl(id));
      } catch {
        return { ...text(`${id}: the unlock was refused`), isError: true };
      }
      return text(id);
    }),
    entry('LockOnly', { id: { type: 'string' } }, async (ctx, args) => {
      await send(ctx.connection, 'POST', lockUrl(args.id ?? ''));
      return text(args.id ?? '');
    }),
    entry('HoldState', { id: { type: 'string' } }, async (ctx, args) => {
      const id = args.id ?? '';
      const own_ = await openFreshConnection(ctx.connection, undefined);
      own(own_, { role: 'state' });
      await send(own_, 'GET', listenUrl(id));
      ctx.state.attach(new HeldDebugState(id, own_));
      return text(ctx.state.handle);
    }),
    entry('LongRead', { id: { type: 'string' } }, async (ctx, args) => {
      const id = args.id ?? '';
      const own_ = await openFreshConnection(ctx.connection, undefined);
      own(own_, { role: 'long' });
      try {
        await send(own_, 'GET', longReadUrl(id));
      } finally {
        await endConnection(own_);
      }
      return text(id);
    }),
    entry('MainThenFresh', { id: { type: 'string' } }, async (ctx, args) => {
      const id = args.id ?? '';
      await send(ctx.connection, 'GET', mainReadUrl(id));
      const own_ = await openFreshConnection(ctx.connection, undefined);
      own(own_, { role: 'state' });
      await send(own_, 'GET', listenUrl(id));
      return text(id);
    }),
    entry(
      'StopState',
      { state_handle: { type: 'string' } },
      async (ctx, args) => {
        ctx.state.check(args.state_handle);
        ctx.state.endWhenEmpty();
        await ctx.state.dispose();
        return text('stopped');
      },
    ),
  ];
}

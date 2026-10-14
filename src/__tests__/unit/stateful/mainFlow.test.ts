/**
 * One MCP session, one connection, ONE main flow: the calls that work on the
 * instance's connection run one after another, whatever the client sends at
 * once; the server enforces it and does not trust the client. Work on a
 * connection of its own — a background run — takes no place in it.
 *
 * Against the stand-in, which records each request's order and session type:
 *
 * - two `UpdateClass` sent at once over stdio: the second's first request
 *   comes only after the first's `UNLOCK`;
 * - a background run answers while a call holds the flow; a run of the same
 *   tool that is not in the background waits;
 * - the crossing measured before the flow (F2): an `UNLOCK` whose credential
 *   is still being asked (an `authorize` that awaits I/O) while another call's
 *   `LOCK` ends — it now goes out stateful, in the lock's context.
 * (A cancel sent to a queued call aborts nothing: `noCallCancel.test.ts`.)
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { IDestinations } from '../../../../server/src/auth/IAuthBrokerFactory';
import { StdioServer } from '../../../../server/src/StdioServer';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { callerOn, isClassRun } from '../backgroundRuns/harness';
import {
  carriesContext,
  isLock,
  isStateful,
  isUnlock,
  oneToolGroup,
  statefulStand,
} from './harness';

jest.setTimeout(30_000);

const SOURCE = 'CLASS zcl_placeholder DEFINITION. ENDCLASS.';
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** Real time for a call that is not queued to reach the stand-in. */
const settleWhile = () => new Promise((resolve) => setTimeout(resolve, 100));

const of =
  (name: string) =>
  (r: { url: string }): boolean =>
    r.url.toLowerCase().includes(name.toLowerCase());

/** The index of the first request `match` accepts. */
const firstIndex = (
  standIn: AdtStandIn,
  match: (r: { url: string }) => boolean,
) => standIn.requests.findIndex(match);
const lastIndex = (
  standIn: AdtStandIn,
  match: (r: { url: string }) => boolean,
) => {
  for (let i = standIn.requests.length - 1; i >= 0; i -= 1) {
    const request = standIn.requests[i];
    if (request !== undefined && match(request)) return i;
  }
  return -1;
};

/** stdio's server over the ADT stand-in, serving the shipped `tools`. */
async function stdio(standIn: AdtStandIn, tools: string[]) {
  const previous = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const provider = new BasicAuthProvider('FLOW_USER', 'flow-password');
  const destinations: IDestinations = {
    settingsFor: async () => ({
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'FLOW_USER',
    }),
    getProvider: async () => provider,
  };
  const server = new StdioServer(
    new CompositeHandlersRegistry(tools.map(oneToolGroup)),
    destinations,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'main-flow', version: '1.0.0' });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  return {
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }, undefined, {
        timeout: 60_000,
      }) as Promise<{ isError?: boolean }>,
    close: async () => {
      await client.close().catch(() => undefined);
      await server.terminalClose().catch(() => undefined);
      if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = previous;
    },
  };
}

describe('one main flow per instance', () => {
  it('stdio: two UpdateClass sent at once — the second starts only after the first’s UNLOCK', async () => {
    const standIn = await adtStandIn();
    const s = await stdio(standIn, ['UpdateClass']);
    try {
      const held = standIn.hold((r) => isLock(r) && of('ZCL_FIRST')(r));
      const first = s.call('UpdateClass', {
        class_name: 'ZCL_FIRST',
        source_code: SOURCE,
      });
      await held.arrived;
      const second = s.call('UpdateClass', {
        class_name: 'ZCL_SECOND',
        source_code: SOURCE,
      });
      await settleWhile();
      // The first holds the flow: nothing of the second has reached SAP.
      expect(firstIndex(standIn, of('ZCL_SECOND'))).toBe(-1);
      held.release();
      await Promise.all([first, second]);

      const firstUnlock = lastIndex(
        standIn,
        (r) => isUnlock(r as never) && of('ZCL_FIRST')(r),
      );
      expect(firstUnlock).toBeGreaterThanOrEqual(0);
      expect(firstIndex(standIn, of('ZCL_SECOND'))).toBeGreaterThan(
        firstUnlock,
      );
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a background run does not wait behind the flow; the same run in the foreground does', async () => {
    const standIn = await adtStandIn();
    const caller = await callerOn(standIn, new InMemoryBackgroundRuns(), {
      user: 'RUN_USER',
    });
    // UpdateClass beside the shipped run tools.
    (
      caller.server as unknown as {
        register(registry: CompositeHandlersRegistry): void;
      }
    ).register(new CompositeHandlersRegistry([oneToolGroup('UpdateClass')]));
    try {
      const held = standIn.hold((r) => isLock(r) && of('ZCL_HOLDER')(r));
      const holder = caller.call('UpdateClass', {
        class_name: 'ZCL_HOLDER',
        source_code: SOURCE,
      });
      await held.arrived;

      const background = await caller.call('RuntimeRunClass', {
        class_name: 'ZCL_BACKGROUND',
        background: true,
      });
      expect(background.isError).toBe(false);
      await until(() => standIn.requests.some(isClassRun));

      let foregroundDone = false;
      const foreground = caller
        .call('RuntimeRunClass', { class_name: 'ZCL_FOREGROUND' })
        .then((answer) => {
          foregroundDone = true;
          return answer;
        });
      await settleWhile();
      expect(foregroundDone).toBe(false);
      expect(firstIndex(standIn, of('ZCL_FOREGROUND'))).toBe(-1);

      held.release();
      await holder;
      expect((await foreground).isError).toBe(false);
    } finally {
      await caller.close();
      await standIn.close();
    }
  });

  it('F2: an UNLOCK whose authorize awaits I/O while another call’s LOCK ends goes out stateful', async () => {
    const gate: { armed: boolean; open: () => void; opened: Promise<void> } =
      (() => {
        let open!: () => void;
        const opened = new Promise<void>((resolve) => {
          open = resolve;
        });
        return { armed: false, open, opened };
      })();
    const s = await statefulStand(['HandlerLock', 'HandlerUnlock'], {
      credential: (basic: IAuthProvider): IAuthProvider => ({
        kind: basic.kind,
        prepare: () => basic.prepare(),
        establish: (logon) => basic.establish(logon),
        // As a token renewal would: the request waits on I/O for its credential.
        authorize: async (request) => {
          if (gate.armed) await gate.opened;
          return basic.authorize(request);
        },
        rejected: (rejection) => basic.rejected(rejection),
      }),
    });
    try {
      const held = s.standIn.hold((r) => isLock(r) && of('ZCL_B')(r));
      const lock = s.call('HandlerLock', {
        object_type: 'CLASS',
        object_name: 'ZCL_B',
      });
      await held.arrived;
      gate.armed = true;
      const unlock = s.call('HandlerUnlock', {
        object_type: 'CLASS',
        object_name: 'ZCL_A',
        lock_handle: HANDLE,
      });
      await settleWhile();
      // B's LOCK ends; its `finally` sets the connection stateless.
      held.release();
      await lock;
      gate.open();
      await unlock;

      const sent = s.standIn.requests.filter(
        (r) => isUnlock(r) && of('ZCL_A')(r),
      );
      expect(sent).toHaveLength(1);
      expect(sent.every(isStateful)).toBe(true);
      expect(sent.every(carriesContext)).toBe(true);
    } finally {
      await s.close();
    }
  });
});

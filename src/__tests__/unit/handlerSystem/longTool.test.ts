/**
 * `HandlerSystem` is a listed long tool (D25, D24's rules), one case per
 * action, against the ADT stand-in, on a host that gave a background-run
 * strategy and on one that gave none:
 *
 * - called without `background`, it answers a `run_handle` at once while
 *   its first request is held; the read runs on an ABAP session of its own,
 *   logged off after SAP's answer; `HandlerBackgroundRunGet` answers it
 *   `finished` once;
 * - `background: false` answers the result in the call, on a session of its
 *   own;
 * - `HandlerBackgroundRunDiscard` cancels a running read: its session's
 *   logoff is sent, the run is `cancelled`;
 * - a background run opens one fresh connection: the action's call into the
 *   full entry opens no second one and starts no second run;
 * - with no strategy it lists no `background` and answers in the call.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { runToolsOf } from '../../../lib/backgroundRuns/tools';
import { SYSTEM_ACTIONS, type SystemAction } from '../../../lib/compact';
import * as longCall from '../../../lib/longCall';
import { isLongRead, isLongTool, LONG_TOOLS } from '../../../lib/longTools';
import * as packageSessions from '../../../lib/packageSessions';
import { assertMatchObject } from '../../helpers/assertions';
import {
  type CallAnswer,
  type LongStand,
  longStand,
  payloadOf,
  until,
} from '../longTools/harness';

beforeEach(() => {
  mock.method(console, 'error', () => {});
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

const TOOL = 'HandlerSystem';

/** Each action's arguments: valid, enough for its first request. Placeholder names only. */
const ARGS: Readonly<Record<SystemAction, Record<string, unknown>>> = {
  search_source: { query: 'placeholder', packages: ['PLACEHOLDER_PACKAGE'] },
  search_object: { object_name: 'PLACEHOLDER*' },
  where_used: { object_name: 'PLACEHOLDER_CLASS', object_type: 'class' },
  package_tree: { package_name: 'PLACEHOLDER_PACKAGE' },
  transports: {},
  atc_findings: { worklist_id: 'worklist-placeholder-1' },
  atc_results: { created_by: '*' },
  atc_result: { display_id: 'result-placeholder-1' },
};

const argsOf = (action: SystemAction) => ({ action, ...ARGS[action] });

const handleOf = (answer: CallAnswer): string => {
  const handle = payloadOf(answer).run_handle;
  return typeof handle === 'string' ? handle : '';
};

/** The run `handle`'s state as `HandlerBackgroundRunList` lists it. */
async function listedState(
  stand: LongStand,
  handle: string,
): Promise<string | undefined> {
  const listed = payloadOf(await stand.call('HandlerBackgroundRunList', {}));
  const runs = Array.isArray(listed.runs) ? listed.runs : [];
  for (const run of runs) {
    if (
      typeof run === 'object' &&
      run !== null &&
      'run_handle' in run &&
      run.run_handle === handle &&
      'state' in run &&
      typeof run.state === 'string'
    ) {
      return run.state;
    }
  }
  return undefined;
}

describe('HandlerSystem is a long tool', () => {
  it('is on the approved list, its runs read and discarded by compact’s tools', () => {
    assert.equal(isLongTool(TOOL), true);
    assert.ok(LONG_TOOLS.includes(TOOL));
    assert.deepStrictEqual(runToolsOf(TOOL), {
      get: 'HandlerBackgroundRunGet',
      discard: 'HandlerBackgroundRunDiscard',
    });
  });

  for (const action of SYSTEM_ACTIONS) {
    it(format('no HandlerSystem call is a run mode: %s', action), () => {
      assert.equal(isLongRead(TOOL, argsOf(action)), true);
      assert.equal(
        isLongRead(TOOL, { ...argsOf(action), background: true }),
        true,
      );
    });
  }
});

for (const action of SYSTEM_ACTIONS) {
  describe(format('HandlerSystem %s', action), () => {
    const args = argsOf(action);

    it('a call without background answers a run_handle, the read on a session of its own, logged off after; HandlerBackgroundRunGet answers it once', async () => {
      const stand = await longStand(TOOL, {
        backgroundRuns: new InMemoryBackgroundRuns(),
      });
      try {
        const hold = stand.standIn.hold(stand.isToolRequest);
        const started = await stand.call(TOOL, args);
        await hold.arrived;
        assert.ok(!started.isError);
        assertMatchObject(payloadOf(started), {
          state: 'running',
          tool: TOOL,
        });
        const handle = handleOf(started);
        assert.notEqual(handle, '');
        assert.deepStrictEqual(stand.standIn.loggedOff(), []);

        hold.release();
        await until(() => stand.standIn.loggedOff().length === 1);
        const own = stand.standIn.requests.filter(stand.isToolRequest);
        const sessions = [...new Set(own.map((r) => r.session))];
        assert.equal(sessions.length, 1);
        assert.notEqual(sessions[0], stand.instanceSession);
        assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);

        await until(
          async () => (await listedState(stand, handle)) === 'finished',
        );
        const read = await stand.call('HandlerBackgroundRunGet', {
          run_handle: handle,
        });
        assertMatchObject(payloadOf(read), {
          run_handle: handle,
          state: 'finished',
          tool: TOOL,
        });
        const again = await stand.call('HandlerBackgroundRunGet', {
          run_handle: handle,
        });
        assert.equal(again.isError, true);
        assert.equal(payloadOf(again).error, 'background_run_not_available');
      } finally {
        await stand.close();
      }
    });

    it('background: false answers in the call, on a session of its own', async () => {
      const stand = await longStand(TOOL, {
        backgroundRuns: new InMemoryBackgroundRuns(),
      });
      try {
        const answer = await stand.call(TOOL, { ...args, background: false });
        assert.equal(payloadOf(answer).run_handle, undefined);
        const own = stand.standIn.requests.filter(stand.isToolRequest);
        assert.ok(own.length > 0);
        const sessions = [...new Set(own.map((r) => r.session))];
        assert.equal(sessions.length, 1);
        assert.notEqual(sessions[0], stand.instanceSession);
        await until(() => stand.standIn.loggedOff().length === 1);
        assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);
      } finally {
        await stand.close();
      }
    });

    it('HandlerBackgroundRunDiscard cancels a running read: its session logged off, the run cancelled', async () => {
      const stand = await longStand(TOOL, {
        backgroundRuns: new InMemoryBackgroundRuns(),
      });
      try {
        const hold = stand.standIn.hold(stand.isToolRequest);
        const started = await stand.call(TOOL, args);
        await hold.arrived;
        const handle = handleOf(started);
        const session = stand.standIn.requests
          .filter(stand.isToolRequest)
          .at(-1)?.session;
        assert.notEqual(session, undefined);

        const discarded = await stand.call('HandlerBackgroundRunDiscard', {
          run_handle: handle,
        });
        assert.ok(!discarded.isError);
        assert.deepStrictEqual(payloadOf(discarded), {
          run_handle: handle,
          state: 'cancelled',
        });
        await until(() => stand.standIn.loggedOff().includes(session ?? ''));
        assert.equal(await listedState(stand, handle), 'cancelled');
        hold.release();
      } finally {
        await stand.close();
      }
    });

    it('one connection per background run: the call into the full entry opens no second one', async (t) => {
      const fresh = t.mock.method(packageSessions, 'openFreshConnection');
      const inCall = t.mock.method(longCall, 'runLongCall');
      const stand = await longStand(TOOL, {
        backgroundRuns: new InMemoryBackgroundRuns(),
      });
      try {
        const started = await stand.call(TOOL, args);
        const handle = handleOf(started);
        await until(
          async () => (await listedState(stand, handle)) === 'finished',
        );
        assert.equal(fresh.mock.callCount(), 1);
        assert.equal(inCall.mock.callCount(), 0);
        const sessions = new Set(
          stand.standIn.requests
            .filter(stand.isToolRequest)
            .map((r) => r.session),
        );
        assert.equal(sessions.size, 1);
      } finally {
        await stand.close();
      }
    });

    it('without a strategy, HandlerSystem is listed without background and answers in the call', async () => {
      const stand = await longStand(TOOL);
      try {
        assert.ok(!(await stand.inputs(TOOL)).includes('background'));
        const described = await stand.described(TOOL);
        assert.ok(
          described.includes(
            'Runs on an ABAP session of its own and answers its result in the call.',
          ),
        );
        assert.ok(!described.includes('run_handle'));
        const answer = await stand.call(TOOL, args);
        assert.equal(payloadOf(answer).run_handle, undefined);
        assert.ok(
          stand.standIn.requests.filter(stand.isToolRequest).length > 0,
        );
      } finally {
        await stand.close();
      }
    });
  });
}

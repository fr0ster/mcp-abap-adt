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

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { runToolsOf } from '../../../lib/backgroundRuns/tools';
import { SYSTEM_ACTIONS, type SystemAction } from '../../../lib/compact';
import * as longCall from '../../../lib/longCall';
import { isLongRead, isLongTool, LONG_TOOLS } from '../../../lib/longTools';
import * as packageSessions from '../../../lib/packageSessions';
import {
  type CallAnswer,
  type LongStand,
  longStand,
  payloadOf,
  until,
} from '../longTools/harness';

jest.setTimeout(60_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

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
    expect(isLongTool(TOOL)).toBe(true);
    expect(LONG_TOOLS).toContain(TOOL);
    expect(runToolsOf(TOOL)).toEqual({
      get: 'HandlerBackgroundRunGet',
      discard: 'HandlerBackgroundRunDiscard',
    });
  });

  it.each(SYSTEM_ACTIONS)(
    'no HandlerSystem call is a run mode: %s',
    (action) => {
      expect(isLongRead(TOOL, argsOf(action))).toBe(true);
      expect(isLongRead(TOOL, { ...argsOf(action), background: true })).toBe(
        true,
      );
    },
  );
});

describe.each(SYSTEM_ACTIONS)('HandlerSystem %s', (action) => {
  const args = argsOf(action);

  it('a call without background answers a run_handle, the read on a session of its own, logged off after; HandlerBackgroundRunGet answers it once', async () => {
    const stand = await longStand(TOOL, {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const started = await stand.call(TOOL, args);
      await hold.arrived;
      expect(started.isError).toBeFalsy();
      expect(payloadOf(started)).toMatchObject({
        state: 'running',
        tool: TOOL,
      });
      const handle = handleOf(started);
      expect(handle).not.toBe('');
      expect(stand.standIn.loggedOff()).toEqual([]);

      hold.release();
      await until(() => stand.standIn.loggedOff().length === 1);
      const own = stand.standIn.requests.filter(stand.isToolRequest);
      const sessions = [...new Set(own.map((r) => r.session))];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).not.toBe(stand.instanceSession);
      expect(stand.standIn.loggedOff()).toEqual(sessions);

      await until(
        async () => (await listedState(stand, handle)) === 'finished',
      );
      const read = await stand.call('HandlerBackgroundRunGet', {
        run_handle: handle,
      });
      expect(payloadOf(read)).toMatchObject({
        run_handle: handle,
        state: 'finished',
        tool: TOOL,
      });
      const again = await stand.call('HandlerBackgroundRunGet', {
        run_handle: handle,
      });
      expect(again.isError).toBe(true);
      expect(payloadOf(again).error).toBe('background_run_not_available');
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
      expect(payloadOf(answer).run_handle).toBeUndefined();
      const own = stand.standIn.requests.filter(stand.isToolRequest);
      expect(own.length).toBeGreaterThan(0);
      const sessions = [...new Set(own.map((r) => r.session))];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).not.toBe(stand.instanceSession);
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual(sessions);
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
      expect(session).toBeDefined();

      const discarded = await stand.call('HandlerBackgroundRunDiscard', {
        run_handle: handle,
      });
      expect(discarded.isError).toBeFalsy();
      expect(payloadOf(discarded)).toEqual({
        run_handle: handle,
        state: 'cancelled',
      });
      await until(() => stand.standIn.loggedOff().includes(session ?? ''));
      expect(await listedState(stand, handle)).toBe('cancelled');
      hold.release();
    } finally {
      await stand.close();
    }
  });

  it('one connection per background run: the call into the full entry opens no second one', async () => {
    const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
    const inCall = jest.spyOn(longCall, 'runLongCall');
    const stand = await longStand(TOOL, {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      const started = await stand.call(TOOL, args);
      const handle = handleOf(started);
      await until(
        async () => (await listedState(stand, handle)) === 'finished',
      );
      expect(fresh).toHaveBeenCalledTimes(1);
      expect(inCall).not.toHaveBeenCalled();
      const sessions = new Set(
        stand.standIn.requests
          .filter(stand.isToolRequest)
          .map((r) => r.session),
      );
      expect(sessions.size).toBe(1);
    } finally {
      await stand.close();
    }
  });

  it('without a strategy, HandlerSystem is listed without background and answers in the call', async () => {
    const stand = await longStand(TOOL);
    try {
      expect(await stand.inputs(TOOL)).not.toContain('background');
      const described = await stand.described(TOOL);
      expect(described).toContain(
        'Runs on an ABAP session of its own and answers its result in the call.',
      );
      expect(described).not.toContain('run_handle');
      const answer = await stand.call(TOOL, args);
      expect(payloadOf(answer).run_handle).toBeUndefined();
      expect(
        stand.standIn.requests.filter(stand.isToolRequest).length,
      ).toBeGreaterThan(0);
    } finally {
      await stand.close();
    }
  });
});

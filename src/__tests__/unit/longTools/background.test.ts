/**
 * A listed long tool runs in the background by default, one case per tool
 * on the approved list, against the ADT stand-in, on a host that gave a
 * background-run strategy:
 *
 * - called **without** `background`, it answers a `run_handle` at once,
 *   while its first request is still held at the stand-in; the read runs on
 *   an ABAP session of its own, logged off after SAP's answer; the run's
 *   tool (`GetBackgroundRun`, compact's `HandlerBackgroundRunGet`) answers
 *   it `finished` once, and then it is gone;
 * - with `background: false` it answers the result in the call, on a
 *   session of its own, logged off after the answer, and keeps nothing.
 *
 * `HandlerGet`'s run-reading parts (`UNIT_TEST` / `CDS_UNIT_TEST`,
 * `activation_status` / `activation_results`) are read in the call: a
 * `background` there is refused before anything is sent, and without one
 * the call runs on the instance's connection. `SearchSource` is on the list
 * and leaves the instance's main flow free while it reads. No long tool
 * takes `timeout` any more.
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { runToolsOf } from '../../../lib/backgroundRuns/tools';
import {
  BACKGROUND_NOT_FOR_RUN_WORDS,
  LONG_TOOLS,
} from '../../../lib/longTools';
import { isLogoff } from '../../helpers/adtStandIn';
import {
  type CallAnswer,
  LONG_TOOL_ARGS,
  type LongStand,
  longStand,
  payloadOf,
  probeAnswered,
  until,
} from './harness';

jest.setTimeout(60_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

/** The list tool beside a run's get tool. */
const listToolOf = (tool: string): string =>
  runToolsOf(tool).get === 'GetBackgroundRun'
    ? 'ListBackgroundRuns'
    : 'HandlerBackgroundRunList';

/** The run `handle`'s state as listed (a listing reads nothing away). */
async function listedState(
  stand: LongStand,
  tool: string,
  handle: string,
): Promise<string | undefined> {
  const listed = payloadOf(await stand.call(listToolOf(tool), {}));
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

const handleOf = (answer: CallAnswer): string => {
  const handle = payloadOf(answer).run_handle;
  return typeof handle === 'string' ? handle : '';
};

describe.each(LONG_TOOLS)('%s', (tool) => {
  const args = LONG_TOOL_ARGS[tool] ?? {};
  const names = runToolsOf(tool);

  it('a long tool called without background answers a run_handle at once, and the read runs on its own session', async () => {
    const stand = await longStand(tool, {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const started = await stand.call(tool, args);
      await hold.arrived;

      // At once: the read's first request is still held.
      expect(started.isError).toBeFalsy();
      expect(payloadOf(started)).toMatchObject({
        state: 'running',
        tool,
      });
      const handle = handleOf(started);
      expect(handle).not.toBe('');
      expect(String(payloadOf(started).message)).toContain(names.get);
      expect(String(payloadOf(started).message)).toContain(names.discard);
      expect(stand.standIn.loggedOff()).toEqual([]);

      hold.release();
      await until(() => stand.standIn.loggedOff().length === 1);
      const own = stand.standIn.requests.filter(stand.isToolRequest);
      const sessions = [...new Set(own.map((r) => r.session))];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).not.toBe(stand.instanceSession);
      expect(stand.standIn.loggedOff()).toEqual(sessions);
      expect(own.filter((r) => r.sessionType === 'stateful')).toEqual([]);

      await until(
        async () => (await listedState(stand, tool, handle)) === 'finished',
      );
      const read = await stand.call(names.get, { run_handle: handle });
      expect(payloadOf(read)).toMatchObject({
        run_handle: handle,
        state: 'finished',
        tool,
      });
      // Answered once: then gone.
      const again = await stand.call(names.get, { run_handle: handle });
      expect(again.isError).toBe(true);
      expect(payloadOf(again).error).toBe('background_run_not_available');
      expect(await listedState(stand, tool, handle)).toBeUndefined();
    } finally {
      await stand.close();
    }
  });

  it('background: false answers the result in the call, on its own session, and keeps nothing', async () => {
    const stand = await longStand(tool, {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      const answer = await stand.call(tool, { ...args, background: false });
      expect(payloadOf(answer).run_handle).toBeUndefined();
      const own = stand.standIn.requests.filter(stand.isToolRequest);
      expect(own.length).toBeGreaterThan(0);
      const sessions = [...new Set(own.map((r) => r.session))];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).not.toBe(stand.instanceSession);
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual(sessions);
      expect(payloadOf(await stand.call(listToolOf(tool), {}))).toEqual({
        runs: [],
      });
    } finally {
      await stand.close();
    }
  });

  it('with no strategy, a long tool lists no background and answers its result in the call', async () => {
    const stand = await longStand(tool);
    try {
      expect(await stand.inputs(tool)).not.toContain('background');
      const answer = await stand.call(tool, args);
      expect(payloadOf(answer).run_handle).toBeUndefined();
      expect(
        stand.standIn.requests.filter(stand.isToolRequest).length,
      ).toBeGreaterThan(0);
      await until(() => stand.standIn.loggedOff().length === 1);
    } finally {
      await stand.close();
    }
  });
});

describe('a strategy without the tools that read its runs', () => {
  it.each(['GetSqlQuery', 'HandlerGetData'])(
    '%s lists no background and answers in the call: nothing could read a run_handle',
    async (tool) => {
      const stand = await longStand(tool, {
        backgroundRuns: new InMemoryBackgroundRuns(),
        runTools: false,
      });
      try {
        expect(await stand.inputs(tool)).not.toContain('background');
        const answer = await stand.call(tool, LONG_TOOL_ARGS[tool] ?? {});
        expect(payloadOf(answer).run_handle).toBeUndefined();
        await until(() => stand.standIn.loggedOff().length === 1);
      } finally {
        await stand.close();
      }
    },
  );

  it('with them, the tool lists background', async () => {
    const stand = await longStand('GetSqlQuery', {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      expect(await stand.inputs('GetSqlQuery')).toContain('background');
    } finally {
      await stand.close();
    }
  });
});

describe.each([
  [{ object_type: 'UNIT_TEST', run_id: 'run-placeholder-1' }, '/abapunit/'],
  [{ object_type: 'CDS_UNIT_TEST', run_id: 'run-placeholder-1' }, '/abapunit/'],
  [
    { part: 'activation_status', run_id: 'run-placeholder-1' },
    '/activation/runs/run-placeholder-1',
  ],
  [
    { part: 'activation_results', run_id: 'run-placeholder-1' },
    '/activation/results/run-placeholder-1',
  ],
])("HandlerGet's run part %o", (runArgs, path) => {
  it('background with a run-reading part is refused before anything is sent', async () => {
    const stand = await longStand('HandlerGet', {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      for (const background of [true, false]) {
        const answer = await stand.call('HandlerGet', {
          ...runArgs,
          background,
        });
        expect(answer.isError).toBe(true);
        expect(answer.content?.[0]?.text ?? '').toContain(
          BACKGROUND_NOT_FOR_RUN_WORDS,
        );
      }
      expect(
        stand.standIn.requests.filter((r) => r.url.includes(path)),
      ).toEqual([]);
      expect(stand.standIn.loggedOff()).toEqual([]);
    } finally {
      await stand.close();
    }
  });

  it("a run-reading part answers in the call, on the instance's connection", async () => {
    const stand = await longStand('HandlerGet', {
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    try {
      const answer = await stand.call('HandlerGet', runArgs);
      expect(payloadOf(answer).run_handle).toBeUndefined();
      const reads = stand.standIn.requests.filter((r) => r.url.includes(path));
      expect(reads).toHaveLength(1);
      expect(reads[0]?.session).toBe(stand.instanceSession);
      expect(stand.standIn.loggedOff()).toEqual([]);
    } finally {
      await stand.close();
    }
  });
});

describe('SearchSource', () => {
  it('SearchSource is a long tool and runs on its own connection; the main-call queue is free while it runs', async () => {
    expect(LONG_TOOLS).toContain('SearchSource');
    const stand = await longStand('SearchSource');
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      let settled = false;
      const call = stand
        .call('SearchSource', LONG_TOOL_ARGS.SearchSource ?? {})
        .finally(() => {
          settled = true;
        });
      await hold.arrived;
      // The instance's main flow is free: a probe answers while the scan waits.
      const probe = await stand.call('ProbeAdt', { id: 'during-scan' });
      expect(probe.isError).toBeFalsy();
      expect(probeAnswered(stand, 'during-scan')).toBe(true);
      expect(settled).toBe(false);

      hold.release();
      await call;
      const own = stand.standIn.requests.filter(stand.isToolRequest);
      const sessions = [...new Set(own.map((r) => r.session))];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).not.toBe(stand.instanceSession);
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual(sessions);
      const requests = stand.standIn.requests;
      const logoff = requests.findIndex((r) => isLogoff(r.url));
      expect(
        requests.slice(logoff + 1).filter((r) => r.session === sessions[0]),
      ).toEqual([]);
    } finally {
      await stand.close();
    }
  });
});

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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { runToolsOf } from '../../../lib/backgroundRuns/tools';
import {
  BACKGROUND_NOT_FOR_RUN_WORDS,
  LONG_TOOLS,
} from '../../../lib/longTools';
import { isLogoff } from '../../helpers/adtStandIn';
import { assertMatchObject } from '../../helpers/assertions';
import {
  type CallAnswer,
  LONG_TOOL_ARGS,
  type LongStand,
  longStand,
  payloadOf,
  probeAnswered,
  until,
} from './harness';

beforeEach(() => {
  mock.method(console, 'error', () => {});
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

/** What a long tool listed without `background` says of its answer. */
const IN_CALL_WORDS =
  'Runs on an ABAP session of its own and answers its result in the call.';

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

for (const tool of LONG_TOOLS) {
  describe(format('%s', tool), () => {
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
        assert.ok(!started.isError);
        assertMatchObject(payloadOf(started), {
          state: 'running',
          tool,
        });
        const handle = handleOf(started);
        assert.notEqual(handle, '');
        assert.ok(String(payloadOf(started).message).includes(names.get));
        assert.ok(String(payloadOf(started).message).includes(names.discard));
        assert.deepStrictEqual(stand.standIn.loggedOff(), []);

        hold.release();
        await until(() => stand.standIn.loggedOff().length === 1);
        const own = stand.standIn.requests.filter(stand.isToolRequest);
        const sessions = [...new Set(own.map((r) => r.session))];
        assert.equal(sessions.length, 1);
        assert.notEqual(sessions[0], stand.instanceSession);
        assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);
        assert.deepStrictEqual(
          own.filter((r) => r.sessionType === 'stateful'),
          [],
        );

        await until(
          async () => (await listedState(stand, tool, handle)) === 'finished',
        );
        const read = await stand.call(names.get, { run_handle: handle });
        assertMatchObject(payloadOf(read), {
          run_handle: handle,
          state: 'finished',
          tool,
        });
        // Answered once: then gone.
        const again = await stand.call(names.get, { run_handle: handle });
        assert.equal(again.isError, true);
        assert.equal(payloadOf(again).error, 'background_run_not_available');
        assert.equal(await listedState(stand, tool, handle), undefined);
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
        assert.equal(payloadOf(answer).run_handle, undefined);
        const own = stand.standIn.requests.filter(stand.isToolRequest);
        assert.ok(own.length > 0);
        const sessions = [...new Set(own.map((r) => r.session))];
        assert.equal(sessions.length, 1);
        assert.notEqual(sessions[0], stand.instanceSession);
        await until(() => stand.standIn.loggedOff().length === 1);
        assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);
        assert.deepStrictEqual(
          payloadOf(await stand.call(listToolOf(tool), {})),
          {
            runs: [],
          },
        );
      } finally {
        await stand.close();
      }
    });

    it('with no strategy, a long tool lists no background and answers its result in the call', async () => {
      const stand = await longStand(tool);
      try {
        assert.ok(!(await stand.inputs(tool)).includes('background'));
        const described = await stand.described(tool);
        assert.ok(described.includes(IN_CALL_WORDS));
        assert.ok(!described.includes('run_handle'));
        const answer = await stand.call(tool, args);
        assert.equal(payloadOf(answer).run_handle, undefined);
        assert.ok(
          stand.standIn.requests.filter(stand.isToolRequest).length > 0,
        );
        await until(() => stand.standIn.loggedOff().length === 1);
      } finally {
        await stand.close();
      }
    });
  });
}

describe('a strategy and a registry that carries no tool reading the runs', () => {
  for (const tool of ['GetSqlQuery', 'HandlerGetData']) {
    it(
      format(
        '%s: the server adds the tools that read its runs, and it lists background',
        tool,
      ),
      async () => {
        const stand = await longStand(tool, {
          backgroundRuns: new InMemoryBackgroundRuns(),
          runTools: false,
        });
        try {
          assert.ok((await stand.inputs(tool)).includes('background'));
          assert.ok((await stand.described(tool)).includes('run_handle'));
          const names = runToolsOf(tool);
          assert.ok((await stand.inputs(names.get)).includes('run_handle'));
          const started = await stand.call(tool, LONG_TOOL_ARGS[tool] ?? {});
          const handle = handleOf(started);
          assert.notEqual(handle, '');
          await until(
            async () => (await listedState(stand, tool, handle)) === 'finished',
          );
        } finally {
          await stand.close();
        }
      },
    );
  }
});

for (const [runArgs, path] of [
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
] satisfies [Record<string, string>, string][]) {
  describe(format("HandlerGet's run part %o", runArgs), () => {
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
          assert.equal(answer.isError, true);
          assert.ok(
            (answer.content?.[0]?.text ?? '').includes(
              BACKGROUND_NOT_FOR_RUN_WORDS,
            ),
          );
        }
        assert.deepStrictEqual(
          stand.standIn.requests.filter((r) => r.url.includes(path)),
          [],
        );
        assert.deepStrictEqual(stand.standIn.loggedOff(), []);
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
        assert.equal(payloadOf(answer).run_handle, undefined);
        const reads = stand.standIn.requests.filter((r) =>
          r.url.includes(path),
        );
        assert.equal(reads.length, 1);
        assert.equal(reads[0]?.session, stand.instanceSession);
        assert.deepStrictEqual(stand.standIn.loggedOff(), []);
      } finally {
        await stand.close();
      }
    });
  });
}

describe('SearchSource', () => {
  it('SearchSource is a long tool and runs on its own connection; the main-call queue is free while it runs', async () => {
    assert.ok(LONG_TOOLS.includes('SearchSource'));
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
      assert.ok(!probe.isError);
      assert.equal(probeAnswered(stand, 'during-scan'), true);
      assert.equal(settled, false);

      hold.release();
      await call;
      const own = stand.standIn.requests.filter(stand.isToolRequest);
      const sessions = [...new Set(own.map((r) => r.session))];
      assert.equal(sessions.length, 1);
      assert.notEqual(sessions[0], stand.instanceSession);
      await until(() => stand.standIn.loggedOff().length === 1);
      assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);
      const requests = stand.standIn.requests;
      const logoff = requests.findIndex((r) => isLogoff(r.url));
      assert.deepStrictEqual(
        requests.slice(logoff + 1).filter((r) => r.session === sessions[0]),
        [],
      );
    } finally {
      await stand.close();
    }
  });
});

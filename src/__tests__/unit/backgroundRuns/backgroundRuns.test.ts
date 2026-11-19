/**
 * Background runs of the code-running tools: a run tool
 * called with `background: true` answers at once with a handle; the run goes
 * on to SAP's answer on a connection of its own, which is logged off only
 * after that answer; the answer is read, listed and discarded by its caller
 * alone.
 *
 * Everything runs against the ADT stand-in, which holds a run's request
 * until the case lets it go — the "long run".
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BACKGROUND_RUNS_PER_CALLER } from '@mcp-abap-adt/background-runs-memory';
import {
  activeTools,
  pending,
  resetProcessLatchForTests,
} from '../../../lib/activeTools';
import {
  BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
  BACKGROUND_RUN_RUNNING_WORDS,
  BACKGROUND_RUNS_UNAVAILABLE_WORDS,
  backgroundRunLimitWords,
} from '../../../lib/auth/serverRefusal';
import { closeInstance } from '../../../lib/instanceClose';
import { forceClose } from '../../../lib/ownedConnections';
import { logOffAtOnce } from '../../../lib/shutdownSequence';
import { isLogoff } from '../../helpers/adtStandIn';
import { assertMatchObject, assertNoProperty } from '../../helpers/assertions';
import {
  type BackgroundStand,
  backgroundStand,
  callerOn,
  isClassRun,
  isProgramRun,
  logoffIndex,
  until,
} from './harness';

const RUN = { class_name: 'PLACEHOLDER_CLASS' };

let stand: BackgroundStand;

beforeEach(async () => {
  stand = await backgroundStand();
});

afterEach(async () => {
  await stand.close();
  resetProcessLatchForTests();
});

/** The session the class run ran in. */
const runSession = () => stand.standIn.requests.find(isClassRun)?.session ?? '';

/** Waits until the run `handle` reads finished, and answers that read. */
async function finished(handle: string) {
  let read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
  await until(async () => {
    read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    return read.payload.state === 'finished';
  });
  return read;
}

describe('a background run', () => {
  it('answers at once with a handle while SAP still holds the run, and logs its own session off only after the answer', async () => {
    const held = stand.standIn.hold(isClassRun);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    await held.arrived;

    assert.equal(started.isError, false);
    assertMatchObject(started.payload, {
      state: 'running',
      tool: 'RuntimeRunClass',
      object: 'PLACEHOLDER_CLASS',
    });
    const handle = started.payload.run_handle as string;
    assert.match(handle, /^[0-9a-f]{32}$/);
    assert.ok(
      typeof started.payload.message === 'string' &&
        started.payload.message.includes('GetBackgroundRun'),
    );
    assert.ok(
      typeof started.payload.message === 'string' &&
        started.payload.message.includes('DiscardBackgroundRun'),
    );

    // The run is on a session of its own, still open, and reads running.
    const session = runSession();
    const instanceSession = stand.standIn.requests[0]?.session;
    assert.notEqual(session, instanceSession);
    assert.equal(logoffIndex(stand.standIn, session), -1);
    const running = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    assertMatchObject(running.payload, {
      run_handle: handle,
      state: 'running',
    });
    assert.equal(running.content.length, 1);

    held.release();
    const read = await finished(handle);
    // Logged off after the run's answer, never before.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    const runAt = stand.standIn.requests.findIndex(isClassRun);
    const logoffAt = logoffIndex(stand.standIn, session);
    assert.ok(logoffAt > runAt);
    assertMatchObject(read.payload, {
      run_handle: handle,
      state: 'finished',
      tool: 'RuntimeRunClass',
    });
    assert.equal(typeof read.payload.finished_at, 'string');
  });

  it('finished, answers what the run tool answers in the foreground', async () => {
    const foreground = await stand.a.call('RuntimeRunClass', RUN);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const read = await finished(started.payload.run_handle as string);
    assert.equal(read.isError, foreground.isError);
    assert.deepStrictEqual(read.content.slice(1), foreground.content);
  });

  it("finished with SAP's error, answers it as the run tool does, isError included", async () => {
    stand.standIn.answer(isClassRun, 500);
    const foreground = await stand.a.call('RuntimeRunClass', RUN);
    assert.equal(foreground.isError, true);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const read = await finished(started.payload.run_handle as string);
    assert.equal(read.isError, true);
    assert.deepStrictEqual(read.content.slice(1), foreground.content);
  });

  it('is not cut by the instance that started it ending (its terminal close)', async () => {
    const held = stand.standIn.hold(isClassRun);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    await held.arrived;
    const session = runSession();
    // An HTTP request's instance ends with its request: its connections are
    // logged off. The run's own is not one of them.
    const instanceSession = stand.standIn.requests[0]?.session ?? '';
    await stand.a.server.terminalClose();
    // The instance's own logoff reached the system; the run's did not come.
    await until(() => logoffIndex(stand.standIn, instanceSession) > -1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(logoffIndex(stand.standIn, session), -1);
    const released = stand.standIn.requests.length;
    held.release();
    await finished(started.payload.run_handle as string);
    // Its logoff was written after SAP's answer, before the answer was kept.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    assert.ok(logoffIndex(stand.standIn, session) >= released);
  });

  it('runs a program too, and compact runs plain and under a profiler id, naming its own tools', async () => {
    const program = await stand.a.call('RuntimeRunProgram', {
      program_name: 'PLACEHOLDER_PROGRAM',
      background: true,
    });
    assertMatchObject(program.payload, {
      tool: 'RuntimeRunProgram',
      object: 'PLACEHOLDER_PROGRAM',
    });
    await finished(program.payload.run_handle as string);
    assert.equal(stand.standIn.requests.some(isProgramRun), true);

    for (const profiler of [{}, { profiler_id: 'PLACEHOLDER_PROFILER' }]) {
      const compact = await stand.a.call('HandlerProfileRun', {
        target_type: 'CLASS',
        class_name: 'PLACEHOLDER_CLASS',
        ...profiler,
        background: true,
      });
      assert.equal(compact.isError, false);
      assert.ok(
        typeof compact.payload.message === 'string' &&
          compact.payload.message.includes('HandlerBackgroundRunGet'),
      );
      assert.ok(
        typeof compact.payload.message === 'string' &&
          compact.payload.message.includes('HandlerBackgroundRunDiscard'),
      );
      const handle = compact.payload.run_handle as string;
      let read = await stand.a.call('HandlerBackgroundRunGet', {
        run_handle: handle,
      });
      await until(async () => {
        read = await stand.a.call('HandlerBackgroundRunGet', {
          run_handle: handle,
        });
        return read.payload.state === 'finished';
      });
      assertMatchObject(read.payload, {
        tool: 'HandlerProfileRun',
        object: 'PLACEHOLDER_CLASS',
      });
    }
  });

  it('without background, or with false, waits as before and keeps nothing', async () => {
    const plain = await stand.a.call('RuntimeRunClass', RUN);
    const off = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: false,
    });
    assert.deepStrictEqual(off, plain);
    const listed = await stand.a.call('ListBackgroundRuns');
    assert.deepStrictEqual(listed.payload, { runs: [] });
    // Every class run ran on the instance's own session.
    const sessions = new Set(
      stand.standIn.requests.filter(isClassRun).map((r) => r.session),
    );
    assert.equal(sessions.size, 1);
  });
});

describe('whose run', () => {
  it('lists only the caller’s; another caller’s handle and an unknown one get the same answer', async () => {
    const b = await callerOn(stand.standIn, stand.strategy, {
      user: 'OTHER_USER',
    });
    try {
      const started = await stand.a.call('RuntimeRunClass', {
        ...RUN,
        background: true,
      });
      const handle = started.payload.run_handle as string;
      await finished(handle);

      const mine = await stand.a.call('ListBackgroundRuns');
      const runs = mine.payload.runs as Array<Record<string, unknown>>;
      assert.equal(runs.length, 1);
      assertMatchObject(runs[0], {
        run_handle: handle,
        tool: 'RuntimeRunClass',
        object: 'PLACEHOLDER_CLASS',
        state: 'finished',
      });
      assertNoProperty(runs[0], 'answer');
      assert.equal(mine.content.length, 1);

      assert.deepStrictEqual((await b.call('ListBackgroundRuns')).payload, {
        runs: [],
      });
      const foreign = await b.call('GetBackgroundRun', { run_handle: handle });
      const unknown = await b.call('GetBackgroundRun', {
        run_handle: 'f'.repeat(32),
      });
      const notString = await b.call('DiscardBackgroundRun', {
        run_handle: '',
      });
      const foreignDiscard = await b.call('DiscardBackgroundRun', {
        run_handle: handle,
      });
      for (const answer of [foreign, unknown, notString, foreignDiscard]) {
        assert.equal(answer.isError, true);
        assertMatchObject(answer.payload, {
          error: 'background_run_not_available',
          message: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
        });
      }
      assert.deepStrictEqual(foreign.content, unknown.content);
      assert.deepStrictEqual(foreignDiscard.content, unknown.content);
      // The discard of someone else's run removed nothing.
      assert.equal(
        (await stand.a.call('GetBackgroundRun', { run_handle: handle })).payload
          .state,
        'finished',
      );
    } finally {
      await b.close();
    }
  });

  it('a token credential’s caller is the user SAP answers for the session', async () => {
    stand.standIn.body(
      (r) => r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
      JSON.stringify({ systemID: 'SID', userName: 'token_user' }),
    );
    const token = await callerOn(stand.standIn, stand.strategy, {
      tokenUser: 'TOKEN_USER',
    });
    const basic = await callerOn(stand.standIn, stand.strategy, {
      user: 'TOKEN_USER',
    });
    try {
      const started = await token.call('RuntimeRunClass', {
        ...RUN,
        background: true,
      });
      assert.equal(started.isError, false);
      const handle = started.payload.run_handle as string;
      // The same destination and backend user: the same caller.
      const listed = await basic.call('ListBackgroundRuns');
      assert.deepStrictEqual(
        (listed.payload.runs as Array<{ run_handle: string }>).map(
          (r) => r.run_handle,
        ),
        [handle],
      );
      // Another user on the same destination is someone else.
      assert.deepStrictEqual(
        (await stand.a.call('ListBackgroundRuns')).payload.runs,
        [],
      );
    } finally {
      await token.close();
      await basic.close();
    }
  });
});

describe('discarding', () => {
  it('refuses a running run and removes a finished one’s answer', async () => {
    const held = stand.standIn.hold(isClassRun);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const handle = started.payload.run_handle as string;
    await held.arrived;
    const refused = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.equal(refused.isError, true);
    assertMatchObject(refused.payload, {
      error: 'background_run_running',
      message: BACKGROUND_RUN_RUNNING_WORDS,
    });
    // Still there, still running: the refusal stopped nothing.
    assert.equal(
      (await stand.a.call('GetBackgroundRun', { run_handle: handle })).payload
        .state,
      'running',
    );

    held.release();
    await finished(handle);
    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.equal(discarded.isError, false);
    assert.deepStrictEqual(discarded.payload, {
      run_handle: handle,
      state: 'discarded',
    });
    const gone = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    assertMatchObject(gone.payload, {
      error: 'background_run_not_available',
    });
    assert.deepStrictEqual((await stand.a.call('ListBackgroundRuns')).payload, {
      runs: [],
    });
  });

  it('reading does not remove a finished run', async () => {
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const handle = started.payload.run_handle as string;
    const first = await finished(handle);
    const second = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    assert.deepStrictEqual(second, first);
  });
});

describe('the limit per caller', () => {
  it(`refuses the run beyond ${BACKGROUND_RUNS_PER_CALLER}, naming the limit and the discard, before anything is sent; a discard makes room`, async () => {
    const handles: string[] = [];
    for (let i = 0; i < BACKGROUND_RUNS_PER_CALLER; i += 1) {
      const started = await stand.a.call('RuntimeRunClass', {
        ...RUN,
        background: true,
      });
      assert.equal(started.isError, false);
      handles.push(started.payload.run_handle as string);
    }
    for (const handle of handles) await finished(handle);
    const runsBefore = stand.standIn.requests.filter(isClassRun).length;

    const refused = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    assert.equal(refused.isError, true);
    assertMatchObject(refused.payload, {
      error: 'background_run_limit',
      message: backgroundRunLimitWords(
        BACKGROUND_RUNS_PER_CALLER,
        'DiscardBackgroundRun',
      ),
    });
    assert.ok(
      typeof refused.payload.message === 'string' &&
        refused.payload.message.includes('16'),
    );
    assert.equal(stand.standIn.requests.filter(isClassRun).length, runsBefore);
    // The connection opened for it was logged off: none is left open.
    await until(() => activeTools().length === 0);

    // Another caller is not limited by this one's runs.
    const b = await callerOn(stand.standIn, stand.strategy, {
      user: 'OTHER_USER',
    });
    try {
      assert.equal(
        (await b.call('RuntimeRunClass', { ...RUN, background: true })).isError,
        false,
      );
    } finally {
      await b.close();
    }

    await stand.a.call('DiscardBackgroundRun', { run_handle: handles[0] });
    const again = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    assert.equal(again.isError, false);
  });
});

describe('without a strategy', () => {
  it('refuses background: true in fixed words, before any connection, and lists no background-run tool', async () => {
    const bare = await callerOn(stand.standIn, undefined, {
      user: 'RUN_USER',
    });
    try {
      const before = stand.standIn.requests.length;
      const refused = await bare.call('RuntimeRunClass', {
        ...RUN,
        background: true,
      });
      assert.equal(refused.isError, true);
      assertMatchObject(refused.payload, {
        error: 'background_runs_unavailable',
        message: BACKGROUND_RUNS_UNAVAILABLE_WORDS,
      });
      assert.equal(stand.standIn.requests.length, before);
      // Without a strategy no background-run tool is listed.
      for (const tool of [
        'ListBackgroundRuns',
        'GetBackgroundRun',
        'DiscardBackgroundRun',
      ]) {
        const answer = await bare.call(tool, { run_handle: 'x' });
        assert.equal(answer.isError, true);
        assert.ok(
          typeof answer.payload.text === 'string' &&
            answer.payload.text.includes(`Tool ${tool} not found`),
        );
      }
      // Without `background` the tool runs as ever.
      assert.equal((await bare.call('RuntimeRunClass', RUN)).isError, false);
    } finally {
      await bare.close();
    }
  });
});

describe('the ends', () => {
  it('the instance close cuts the runs it started at once, without waiting for them; another instance’s run goes on until the process’s logoffs', async () => {
    const heldA = stand.standIn.hold(
      (r) => isClassRun(r) && r.url.toUpperCase().includes('ZCL_RUN_A'),
    );
    const heldB = stand.standIn.hold(
      (r) => isClassRun(r) && r.url.toUpperCase().includes('ZCL_RUN_B'),
    );
    const b = await callerOn(stand.standIn, stand.strategy, {
      user: 'RUN_USER',
    });
    try {
      await stand.a.call('RuntimeRunClass', {
        class_name: 'ZCL_RUN_A',
        background: true,
      });
      await b.call('RuntimeRunClass', {
        class_name: 'ZCL_RUN_B',
        background: true,
      });
      await Promise.all([heldA.arrived, heldB.arrived]);
      const of = (name: string) =>
        stand.standIn.requests.find(
          (r) => isClassRun(r) && r.url.toUpperCase().includes(name),
        )?.session ?? '';
      const sessionA = of('ZCL_RUN_A');
      const sessionB = of('ZCL_RUN_B');

      // The client closed: the instance close logs its run off at once,
      // under the run's request still held, and waits for no run.
      await closeInstance(stand.a.server);
      await until(() => logoffIndex(stand.standIn, sessionA) > -1);
      // Both runs still wait for SAP: the close awaited neither.
      assert.deepStrictEqual(pending(), [
        'RuntimeRunClass (background) (2 calls)',
      ]);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(logoffIndex(stand.standIn, sessionB), -1);

      // The process ends: its logoffs reach the other instance's run.
      await logOffAtOnce();
      await until(() => logoffIndex(stand.standIn, sessionB) > -1);
    } finally {
      heldA.release();
      heldB.release();
      await b.close();
    }
  });

  it('the forced close logs it off at once, cutting it, and names it', async () => {
    const held = stand.standIn.hold(isClassRun);
    await stand.a.call('RuntimeRunClass', { ...RUN, background: true });
    await held.arrived;
    const session = runSession();
    assert.ok(pending().includes('RuntimeRunClass (background)'));

    await forceClose();
    // The logoff is written while the run's request is still held: it
    // reaches the system without SAP having answered the run.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    assert.equal(
      stand.standIn.requests.filter(
        (r) => isLogoff(r.url) && r.session === session,
      ).length,
      1,
    );
    held.release();
  });
});

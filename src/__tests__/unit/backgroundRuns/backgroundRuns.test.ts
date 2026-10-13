/**
 * Background runs of the code-running tools (spec 2026-10-13): a run tool
 * called with `background: true` answers at once with a handle; the run goes
 * on to SAP's answer on a connection of its own, which is logged off only
 * after that answer; the answer is read, listed and discarded by its caller
 * alone.
 *
 * Everything runs against the ADT stand-in, which holds a run's request
 * until the case lets it go — the "long run".
 */

import { BACKGROUND_RUNS_PER_CALLER } from '@mcp-abap-adt/background-runs-memory';
import {
  activeTools,
  pending,
  resetProcessLatchForTests,
  settled,
} from '../../../lib/activeTools';
import {
  BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
  BACKGROUND_RUN_RUNNING_WORDS,
  BACKGROUND_RUNS_UNAVAILABLE_WORDS,
  backgroundRunLimitWords,
} from '../../../lib/auth/serverRefusal';
import { closeInstance } from '../../../lib/instanceClose';
import { forceClose } from '../../../lib/ownedConnections';
import { isLogoff } from '../../helpers/adtStandIn';
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

    expect(started.isError).toBe(false);
    expect(started.payload).toMatchObject({
      state: 'running',
      tool: 'RuntimeRunClass',
      object: 'PLACEHOLDER_CLASS',
    });
    const handle = started.payload.run_handle as string;
    expect(handle).toMatch(/^[0-9a-f]{32}$/);
    expect(started.payload.message).toContain('GetBackgroundRun');
    expect(started.payload.message).toContain('DiscardBackgroundRun');

    // The run is on a session of its own, still open, and reads running.
    const session = runSession();
    const instanceSession = stand.standIn.requests[0]?.session;
    expect(session).not.toBe(instanceSession);
    expect(logoffIndex(stand.standIn, session)).toBe(-1);
    const running = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    expect(running.payload).toMatchObject({
      run_handle: handle,
      state: 'running',
    });
    expect(running.content).toHaveLength(1);

    held.release();
    const read = await finished(handle);
    // Logged off after the run's answer, never before.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    const runAt = stand.standIn.requests.findIndex(isClassRun);
    const logoffAt = logoffIndex(stand.standIn, session);
    expect(logoffAt).toBeGreaterThan(runAt);
    expect(read.payload).toMatchObject({
      run_handle: handle,
      state: 'finished',
      tool: 'RuntimeRunClass',
    });
    expect(typeof read.payload.finished_at).toBe('string');
  });

  it('finished, answers what the run tool answers in the foreground', async () => {
    const foreground = await stand.a.call('RuntimeRunClass', RUN);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const read = await finished(started.payload.run_handle as string);
    expect(read.isError).toBe(foreground.isError);
    expect(read.content.slice(1)).toEqual(foreground.content);
  });

  it("finished with SAP's error, answers it as the run tool does, isError included", async () => {
    stand.standIn.answer(isClassRun, 500);
    const foreground = await stand.a.call('RuntimeRunClass', RUN);
    expect(foreground.isError).toBe(true);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const read = await finished(started.payload.run_handle as string);
    expect(read.isError).toBe(true);
    expect(read.content.slice(1)).toEqual(foreground.content);
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
    expect(logoffIndex(stand.standIn, session)).toBe(-1);
    const released = stand.standIn.requests.length;
    held.release();
    await finished(started.payload.run_handle as string);
    // Its logoff was written after SAP's answer, before the answer was kept.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    expect(logoffIndex(stand.standIn, session)).toBeGreaterThanOrEqual(
      released,
    );
  });

  it('runs a program too, and compact runs both modes, naming its own tools', async () => {
    const program = await stand.a.call('RuntimeRunProgram', {
      program_name: 'PLACEHOLDER_PROGRAM',
      background: true,
    });
    expect(program.payload).toMatchObject({
      tool: 'RuntimeRunProgram',
      object: 'PLACEHOLDER_PROGRAM',
    });
    await finished(program.payload.run_handle as string);
    expect(stand.standIn.requests.some(isProgramRun)).toBe(true);

    for (const profiling of [false, true]) {
      const compact = await stand.a.call('HandlerProfileRun', {
        target_type: 'CLASS',
        class_name: 'PLACEHOLDER_CLASS',
        profiling,
        background: true,
      });
      expect(compact.isError).toBe(false);
      expect(compact.payload.message).toContain('HandlerBackgroundRunGet');
      expect(compact.payload.message).toContain('HandlerBackgroundRunDiscard');
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
      expect(read.payload).toMatchObject({
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
    expect(off).toEqual(plain);
    const listed = await stand.a.call('ListBackgroundRuns');
    expect(listed.payload).toEqual({ runs: [] });
    // Every class run ran on the instance's own session.
    const sessions = new Set(
      stand.standIn.requests.filter(isClassRun).map((r) => r.session),
    );
    expect(sessions.size).toBe(1);
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
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        run_handle: handle,
        tool: 'RuntimeRunClass',
        object: 'PLACEHOLDER_CLASS',
        state: 'finished',
      });
      expect(runs[0]).not.toHaveProperty('answer');
      expect(mine.content).toHaveLength(1);

      expect((await b.call('ListBackgroundRuns')).payload).toEqual({
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
        expect(answer.isError).toBe(true);
        expect(answer.payload).toMatchObject({
          error: 'background_run_not_available',
          message: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
        });
      }
      expect(foreign.content).toEqual(unknown.content);
      expect(foreignDiscard.content).toEqual(unknown.content);
      // The discard of someone else's run removed nothing.
      expect(
        (await stand.a.call('GetBackgroundRun', { run_handle: handle })).payload
          .state,
      ).toBe('finished');
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
      expect(started.isError).toBe(false);
      const handle = started.payload.run_handle as string;
      // The same destination and backend user: the same caller.
      const listed = await basic.call('ListBackgroundRuns');
      expect(
        (listed.payload.runs as Array<{ run_handle: string }>).map(
          (r) => r.run_handle,
        ),
      ).toEqual([handle]);
      // Another user on the same destination is someone else.
      expect((await stand.a.call('ListBackgroundRuns')).payload.runs).toEqual(
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
    expect(refused.isError).toBe(true);
    expect(refused.payload).toMatchObject({
      error: 'background_run_running',
      message: BACKGROUND_RUN_RUNNING_WORDS,
    });
    // Still there, still running: the refusal stopped nothing.
    expect(
      (await stand.a.call('GetBackgroundRun', { run_handle: handle })).payload
        .state,
    ).toBe('running');

    held.release();
    await finished(handle);
    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    expect(discarded.isError).toBe(false);
    expect(discarded.payload).toEqual({
      run_handle: handle,
      state: 'discarded',
    });
    const gone = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    expect(gone.payload).toMatchObject({
      error: 'background_run_not_available',
    });
    expect((await stand.a.call('ListBackgroundRuns')).payload).toEqual({
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
    expect(second).toEqual(first);
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
      expect(started.isError).toBe(false);
      handles.push(started.payload.run_handle as string);
    }
    for (const handle of handles) await finished(handle);
    const runsBefore = stand.standIn.requests.filter(isClassRun).length;

    const refused = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    expect(refused.isError).toBe(true);
    expect(refused.payload).toMatchObject({
      error: 'background_run_limit',
      message: backgroundRunLimitWords(
        BACKGROUND_RUNS_PER_CALLER,
        'DiscardBackgroundRun',
      ),
    });
    expect(refused.payload.message).toContain('16');
    expect(stand.standIn.requests.filter(isClassRun)).toHaveLength(runsBefore);
    // The connection opened for it was logged off: none is left open.
    await until(() => activeTools().length === 0);

    // Another caller is not limited by this one's runs.
    const b = await callerOn(stand.standIn, stand.strategy, {
      user: 'OTHER_USER',
    });
    try {
      expect(
        (await b.call('RuntimeRunClass', { ...RUN, background: true })).isError,
      ).toBe(false);
    } finally {
      await b.close();
    }

    await stand.a.call('DiscardBackgroundRun', { run_handle: handles[0] });
    const again = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    expect(again.isError).toBe(false);
  });
});

describe('without a strategy', () => {
  it('refuses background: true in fixed words, before any connection, and the tools too', async () => {
    const bare = await callerOn(stand.standIn, undefined, {
      user: 'RUN_USER',
    });
    try {
      const before = stand.standIn.requests.length;
      const refused = await bare.call('RuntimeRunClass', {
        ...RUN,
        background: true,
      });
      expect(refused.isError).toBe(true);
      expect(refused.payload).toMatchObject({
        error: 'background_runs_unavailable',
        message: BACKGROUND_RUNS_UNAVAILABLE_WORDS,
      });
      expect(stand.standIn.requests).toHaveLength(before);
      for (const tool of [
        'ListBackgroundRuns',
        'GetBackgroundRun',
        'DiscardBackgroundRun',
      ]) {
        const answer = await bare.call(tool, { run_handle: 'x' });
        expect(answer.payload).toMatchObject({
          error: 'background_runs_unavailable',
        });
      }
      // Without `background` the tool runs as ever.
      expect((await bare.call('RuntimeRunClass', RUN)).isError).toBe(false);
    } finally {
      await bare.close();
    }
  });
});

describe('the ends', () => {
  it('the orderly shutdown and the instance close wait for a running background request, then it is logged off after its answer', async () => {
    const held = stand.standIn.hold(isClassRun);
    await stand.a.call('RuntimeRunClass', { ...RUN, background: true });
    await held.arrived;
    const session = runSession();

    let processSettled = false;
    let instanceClosed = false;
    void settled().then(() => {
      processSettled = true;
    });
    const closing = closeInstance(stand.a.server).then(() => {
      instanceClosed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(processSettled).toBe(false);
    expect(instanceClosed).toBe(false);
    expect(logoffIndex(stand.standIn, session)).toBe(-1);
    expect(pending()).toContain('RuntimeRunClass (background)');

    held.release();
    await closing;
    expect(processSettled).toBe(true);
    // Its own logoff was written after SAP's answer, before the close
    // completed; it reaches the system.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    const runAt = stand.standIn.requests.findIndex(isClassRun);
    expect(logoffIndex(stand.standIn, session)).toBeGreaterThan(runAt);
  });

  it('the forced close logs it off at once, cutting it, and names it', async () => {
    const held = stand.standIn.hold(isClassRun);
    await stand.a.call('RuntimeRunClass', { ...RUN, background: true });
    await held.arrived;
    const session = runSession();
    expect(pending()).toContain('RuntimeRunClass (background)');

    await forceClose();
    // The logoff is written while the run's request is still held: it
    // reaches the system without SAP having answered the run.
    await until(() => logoffIndex(stand.standIn, session) > -1);
    expect(
      stand.standIn.requests.filter(
        (r) => isLogoff(r.url) && r.session === session,
      ),
    ).toHaveLength(1);
    held.release();
  });
});

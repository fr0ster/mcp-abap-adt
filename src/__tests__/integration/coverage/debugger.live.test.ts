/**
 * The ABAP debugger at a stop, live, on both systems: the tools that work on
 * a stopped debuggee and its breakpoints and watchpoints, and the memory
 * snapshot reads.
 *
 * The test creates its probe — a class run as a console application — in
 * the package the coverage suites create in (`ownPackage`), its name read
 * free first and recorded for cleanup before its create; it is deleted
 * after and read absent. A listener with two line breakpoints starts the
 * probe's run (`DebugStartListener`), and the case waits until it stops at
 * the first one (`DebugWait`, SAP's long poll: each wait goes on the answer
 * of the one before it, no count, no timer). At the stop:
 *
 * - `DebugListBreakpoints` lists both, `DebugDeleteBreakpoint` deletes the
 *   second, and the list holds the first alone;
 * - `DebugSetStackPosition` selects the frame below the stop and then the
 *   stop's own frame again;
 * - `DebugSetVariable` sets the counter, and `DebugGetVariables` reads the
 *   value set;
 * - `DebugCreateWatchpoint` watches the counter, `DebugListWatchpoints`
 *   lists it, `DebugDeleteWatchpoint` deletes it, and the list is empty;
 * - the debugger batch, in the full set and in the compact one, each at the
 *   stop: `DebugBatchBegin` (`HandlerDebugBatch` `begin`); a step over, the
 *   stack and the counter recorded — each answers nothing; one
 *   `DebugBatchEnd` (`end`) sends them, summarised `recorded`, `sent`,
 *   `received` three each; `DebugBatchAnswers` (`answers`) reads them by
 *   `number` and by `numbers`: the step answered, the stack on the next
 *   line, the counter as that line left it;
 * - `DebugTerminate` ends the run where it stands.
 *
 * **The memory snapshots.** At the stop the case takes two memory snapshots
 * of its own (`DebugCreateMemorySnapshot`); each answer names the snapshot's
 * file. After the run ends, `MemorySnapshotGet` reads the first and
 * `MemorySnapshotDelta` compares the two — exactly those, found in
 * `MemorySnapshotList` (detail `full`). Nothing deletes them: no tool can,
 * and SAP removes snapshots over time.
 *
 * **Which rows are the case's own.** A file name is not unique in the list:
 * SAP names a snapshot `abDbgMemory_<work process>_<count>`, the count
 * starting again in each debug session, so an earlier run's snapshot of the
 * same user can carry the same name (measured on the cloud: two rows of
 * `abDbgMemory_032_0001`, four days apart), and a delta against it is SAP's
 * "different roll areas" 400. So the probe takes SAP's own UTC time
 * (`GET TIME STAMP`) before it stops, the case reads it at the stop
 * (`DebugGetVariables`, `LV_STARTED`) before it takes the snapshots, and a
 * row is the case's only when its file name ends in the file the create
 * answered and its `timestamp` is not before that time — both times SAP's,
 * compared as UTC digits. More than one such row for a file fails the case,
 * naming the count; it never picks one.
 *
 * **Why the case waits.** SAP lists a new snapshot only later (measured on
 * premise: the list was unchanged within a run, after the stop and the
 * terminate as well, and two longer by the next run; adt-clients documents
 * seconds on premise and minutes on the cloud). The create answers the
 * snapshot's file, not its id, and only the list gives the id. So the case
 * reads `MemorySnapshotList` every `LIST_PAUSE_MS` until both of its own
 * file names are listed, and fails, naming them and the time waited, once
 * `LIST_LIMIT_MS` has passed.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
  type ToolArgs,
} from '../helpers/live';
import {
  member,
  onRequest,
  ownPackage,
  payloadOf,
  succeeded,
} from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const PROBE = `ZCL_MCP_DBG_${SUFFIX}`;

/** The probe; `"BP:<name>` names a line the case stops at. */
function probeSource(name: string): string {
  const n = name.toLowerCase();
  return [
    `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    '    INTERFACES if_oo_adt_classrun.',
    'ENDCLASS.',
    '',
    `CLASS ${n} IMPLEMENTATION.`,
    '  METHOD if_oo_adt_classrun~main.',
    '    DATA lv_counter TYPE i.',
    '    DATA lv_started TYPE p LENGTH 8.',
    '    GET TIME STAMP FIELD lv_started.',
    '    lv_counter = 1. "BP:mark',
    '    lv_counter = lv_counter + 1.',
    '    lv_counter = lv_counter + 1. "BP:second',
    '    out->write( |counter { lv_counter }| ).',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
}

/** The line each `"BP:<name>` marker is on, from 1. */
const LINE: Record<string, number> = Object.fromEntries(
  probeSource(PROBE)
    .split('\n')
    .flatMap((text, at) => {
      const marker = text.indexOf('"BP:');
      return marker < 0 ? [] : [[text.slice(marker + 4), at + 1]];
    }),
);

/** A line breakpoint at the marker `name`. */
const line = (name: string) => ({
  object_type: 'CLAS',
  object_name: PROBE,
  line: LINE[name],
});

/** The pause between two reads of the snapshot list. */
const LIST_PAUSE_MS = 10_000;

/** How long the case waits for its snapshots to be listed before it fails. */
const LIST_LIMIT_MS = 15 * 60_000;

/** The files of the snapshots the case took, in order. */
const snapshotFiles: string[] = [];

/**
 * The run's start as SAP's clock gave it, UTC, `YYYYMMDDhhmmss`: the
 * probe's `lv_started` read at the stop, before the snapshots were taken.
 */
const snapshotsNotBefore: { at?: string } = {};

/** A UTC time's digits, `YYYYMMDDhhmmss`: `2026-11-17T07:11:09Z` and `20261117071109` alike. */
function utcDigits(text: string): string {
  return [...text].filter((c) => c >= '0' && c <= '9').join('');
}

/** The listener's state handle once it started; whether a debugger batch is open. */
const session: { handle?: string; batchOpen?: boolean } = {};

function handle(): string {
  if (session.handle === undefined) throw new Error('no listener started');
  return session.handle;
}

/** DebugWait until the state is one of `states`, an error, or a state answered at once. */
async function waitFor(states: readonly string[]): Promise<unknown> {
  for (;;) {
    const answer = succeeded(
      'DebugWait',
      await livePrepare('DebugWait', {
        state_handle: handle(),
        hold_seconds: 30,
      }),
    );
    const payload = payloadOf(answer);
    const state = member(payload, 'state');
    if (typeof state === 'string' && states.includes(state)) return payload;
    if (state === 'stopped' || state === 'idle' || state === 'ended') {
      throw new Error(`the debugger is ${state}: ${answer.text}`);
    }
  }
}

/** The breakpoints a list answered: each id, and the line its uri names (`#start=<line>`). */
function breakpointsOf(answer: LiveAnswer): { id: string; line: number }[] {
  const rows = payloadOf(answer);
  if (!Array.isArray(rows)) throw new Error(`no breakpoints: ${answer.text}`);
  return rows.map((row) => {
    const uri = String(member(row, 'uri'));
    const at = uri.indexOf('#start=');
    return {
      id: String(member(row, 'id')),
      line: at < 0 ? Number.NaN : Number(uri.slice(at + '#start='.length)),
    };
  });
}

/** The full stack: each frame's position, and the index of the frame selected. */
async function stackNow(): Promise<{ positions: number[]; cursor: unknown }> {
  const stack = succeeded(
    'DebugGetStack',
    await livePrepare('DebugGetStack', {
      state_handle: handle(),
      detail: 'full',
    }),
  );
  const read = member(payloadOf(stack), 'stack');
  const frames = member(read, 'frames');
  if (!Array.isArray(frames)) throw new Error(`no stack: ${stack.text}`);
  return {
    positions: frames.map((frame) => Number(member(frame, 'position'))),
    cursor: member(read, 'cursor'),
  };
}

/** One answer a debugger batch kept: its number, and the tool's answer. */
interface BatchEntry {
  readonly number: unknown;
  readonly isError: boolean;
  readonly text: string;
  readonly payload: unknown;
}

/** The entries `DebugBatchAnswers` / `HandlerDebugBatch` `answers` answered. */
function entriesOf(answer: LiveAnswer): BatchEntry[] {
  const rows = payloadOf(answer);
  if (!Array.isArray(rows)) throw new Error(`no batch answers: ${answer.text}`);
  return rows.map((row) => {
    const content = member(row, 'content');
    const first: unknown = Array.isArray(content) ? content[0] : undefined;
    const text = String(member(first, 'text') ?? '');
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    return {
      number: member(row, 'number'),
      isError: member(row, 'isError') === true,
      text,
      payload,
    };
  });
}

/** A call recorded into the open debugger batch: it answers nothing. */
async function recorded(tool: string, args: ToolArgs): Promise<void> {
  const answer = await livePrepare(tool, args);
  if (answer.isError || answer.content.length > 0) {
    throw new Error(`${tool} was not recorded: ${answer.text}`);
  }
}

/** The step's, the stack's and the counter's answers a batch kept, checked. */
function checkBatchAnswers(
  entries: readonly BatchEntry[],
  stepFrom: number,
  counter: string,
): void {
  const failed = entries.filter((entry) => entry.isError);
  if (failed.length > 0) {
    throw new Error(
      failed.map((entry) => `#${entry.number}: ${entry.text}`).join('\n'),
    );
  }
  assert.deepEqual(
    entries.map((entry) => entry.number),
    [1, 2, 3],
  );
  const [step, stack, variables] = entries;
  // 1: the step answered, the run not ended by it.
  assert.notEqual(member(step?.payload, 'state'), 'ended');
  // 2: the stack read after the step: the next line.
  assert.equal(
    member(member(member(stack?.payload, 'at'), 'address'), 'line'),
    stepFrom + 1,
  );
  // 3: the counter as the line stepped over left it: the full set answers
  // the variables, the compact set its `value` beside the identity in force.
  const read = variables?.payload;
  const rows = Array.isArray(read) ? read : member(read, 'value');
  if (!Array.isArray(rows)) {
    throw new Error(`no variables: ${variables?.text}`);
  }
  const found = rows.find(
    (row) => String(member(row, 'name')).toUpperCase() === 'LV_COUNTER',
  );
  assert.equal(String(member(found, 'value')).trim(), counter);
}

/** The debugger batch's end summary for three recorded calls. */
const THREE = { recorded: 3, sent: 3, received: 3 };

liveSuite(['onprem', 'cloud'], 'The ABAP debugger at a stop', () => {
  after(async () => {
    if (session.batchOpen === true) {
      await livePrepare('DebugBatchEnd', {});
      session.batchOpen = false;
    }
    if (session.handle !== undefined) {
      await livePrepare('DebugStop', { state_handle: session.handle });
    }
    await deleteRecorded();
    await expectAbsent({ tool: 'GetClass', args: { class_name: PROBE } });
  });

  it('the probe runs under a listener and stops at its first breakpoint', async () => {
    await expectNameFree({ tool: 'GetClass', args: { class_name: PROBE } });
    recordCreated('DeleteClass', { class_name: PROBE, ...onRequest() });
    succeeded(
      'CreateClass',
      await livePrepare('CreateClass', {
        class_name: PROBE,
        package_name: ownPackage(),
        description: 'MCP debugger live case',
        ...onRequest(),
      }),
    );
    succeeded(
      'UpdateClass',
      await livePrepare('UpdateClass', {
        class_name: PROBE,
        source_code: probeSource(PROBE),
        activate: true,
        ...onRequest(),
      }),
    );
    const started = succeeded(
      'DebugStartListener',
      await livePrepare('DebugStartListener', {
        breakpoints: [line('mark'), line('second')],
        run: { kind: 'class', name: PROBE },
      }),
    );
    const stated = member(payloadOf(started), 'state_handle');
    if (typeof stated !== 'string' || stated === '') {
      throw new Error('the listener answered no state handle');
    }
    session.handle = stated;
    const stop = await waitFor(['stopped']);
    assert.equal(
      member(member(member(stop, 'at'), 'address'), 'line'),
      LINE.mark,
    );
  });

  it('DebugListBreakpoints lists both, DebugDeleteBreakpoint deletes the second', async () => {
    const listed = await liveCall('DebugListBreakpoints', {
      state_handle: handle(),
    });
    succeeded('DebugListBreakpoints', listed);
    const both = breakpointsOf(listed);
    assert.equal(both.length, 2);
    const second = both.find((each) => each.line === LINE.second);
    if (second === undefined) {
      throw new Error(`no breakpoint at the second line: ${listed.text}`);
    }
    const deleted = await liveCall('DebugDeleteBreakpoint', {
      state_handle: handle(),
      breakpoint_id: second.id,
    });
    succeeded('DebugDeleteBreakpoint', deleted);
    const left = breakpointsOf(
      succeeded(
        'DebugListBreakpoints after the delete',
        await livePrepare('DebugListBreakpoints', { state_handle: handle() }),
      ),
    );
    assert.deepEqual(
      left.map((each) => each.line),
      [LINE.mark],
    );
  });

  it('DebugSetStackPosition selects the frame below the stop, then the stop again', async () => {
    const before = await stackNow();
    const top = Math.max(...before.positions);
    const lower = before.positions.filter((each) => each < top);
    if (lower.length === 0) throw new Error('no frame below the stop');
    const below = Math.max(...lower);
    assert.equal(before.cursor, before.positions.indexOf(top));

    const moved = await liveCall('DebugSetStackPosition', {
      state_handle: handle(),
      position: below,
    });
    succeeded('DebugSetStackPosition', moved);
    assert.equal((await stackNow()).cursor, before.positions.indexOf(below));

    const back = await liveCall('DebugSetStackPosition', {
      state_handle: handle(),
      position: top,
    });
    succeeded('DebugSetStackPosition back', back);
    assert.equal(
      member(member(member(payloadOf(back), 'at'), 'address'), 'line'),
      LINE.mark,
    );
    assert.equal((await stackNow()).cursor, before.positions.indexOf(top));
  });

  it('DebugSetVariable sets the counter, and it reads the value set', async () => {
    const set = await liveCall('DebugSetVariable', {
      state_handle: handle(),
      name: 'LV_COUNTER',
      value: '41',
    });
    succeeded('DebugSetVariable', set);
    const read = succeeded(
      'DebugGetVariables',
      await livePrepare('DebugGetVariables', {
        state_handle: handle(),
        names: ['LV_COUNTER'],
      }),
    );
    const variables = payloadOf(read);
    const rows = Array.isArray(variables)
      ? variables
      : member(variables, 'variables');
    assert.ok(Array.isArray(rows));
    const counter = rows.find(
      (row) => String(member(row, 'name')).toUpperCase() === 'LV_COUNTER',
    );
    assert.equal(String(member(counter, 'value')).trim(), '41');
  });

  it('DebugCreateWatchpoint watches the counter, listed, then deleted', async () => {
    const created = await liveCall('DebugCreateWatchpoint', {
      state_handle: handle(),
      name: 'LV_COUNTER',
    });
    succeeded('DebugCreateWatchpoint', created);
    const listed = await liveCall('DebugListWatchpoints', {
      state_handle: handle(),
    });
    succeeded('DebugListWatchpoints', listed);
    assert.ok(listed.text.toUpperCase().includes('LV_COUNTER'));
    const id = member(
      member(member(payloadOf(created), 'watchpoints'), 'watchpoint'),
      'id',
    );
    if (typeof id !== 'string') {
      throw new Error(`the watchpoint has no id: ${created.text}`);
    }
    const deleted = await liveCall('DebugDeleteWatchpoint', {
      state_handle: handle(),
      watchpoint_id: id,
    });
    succeeded('DebugDeleteWatchpoint', deleted);
    const left = succeeded(
      'DebugListWatchpoints after the delete',
      await livePrepare('DebugListWatchpoints', { state_handle: handle() }),
    );
    assert.equal(left.text.toUpperCase().includes('LV_COUNTER'), false);
  });

  it('DebugCreateMemorySnapshot takes two snapshots at the stop', async () => {
    // SAP's own time before the snapshots: the probe took it before the stop.
    const read = succeeded(
      'DebugGetVariables LV_STARTED',
      await livePrepare('DebugGetVariables', {
        state_handle: handle(),
        names: ['LV_STARTED'],
      }),
    );
    const variables = payloadOf(read);
    const rows = Array.isArray(variables)
      ? variables
      : member(variables, 'variables');
    const started = Array.isArray(rows)
      ? rows.find(
          (row) => String(member(row, 'name')).toUpperCase() === 'LV_STARTED',
        )
      : undefined;
    const startedAt = utcDigits(String(member(started, 'value')));
    if (startedAt.length !== 14) {
      throw new Error(`the probe's start time is unreadable: ${read.text}`);
    }
    snapshotsNotBefore.at = startedAt;
    for (const at of [1, 2]) {
      const made = succeeded(
        `DebugCreateMemorySnapshot ${at}`,
        await livePrepare('DebugCreateMemorySnapshot', {
          state_handle: handle(),
        }),
      );
      // `<instance>,<file>`: the file the snapshot is kept in.
      const data = String(member(member(payloadOf(made), 'action'), 'data'));
      const file = data.slice(data.indexOf(',') + 1);
      if (file === '' || data.indexOf(',') < 0) {
        throw new Error(`the snapshot names no file: ${made.text}`);
      }
      snapshotFiles.push(file);
    }
  });

  it('DebugBatchBegin, a step, the stack and the counter recorded, DebugBatchEnd, DebugBatchAnswers by number and by numbers', async () => {
    const begun = await liveCall('DebugBatchBegin', {});
    succeeded('DebugBatchBegin', begun);
    session.batchOpen = true;
    assert.equal(member(payloadOf(begun), 'debug_batch'), 'on');
    await recorded('DebugStep', { state_handle: handle(), action: 'over' });
    await recorded('DebugGetStack', { state_handle: handle() });
    await recorded('DebugGetVariables', {
      state_handle: handle(),
      names: ['LV_COUNTER'],
    });
    const ended = await liveCall('DebugBatchEnd', {});
    session.batchOpen = false;
    succeeded('DebugBatchEnd', ended);
    assert.deepEqual(payloadOf(ended), THREE);

    const one = await liveCall('DebugBatchAnswers', { number: 2 });
    succeeded('DebugBatchAnswers number', one);
    const [stack] = entriesOf(one);
    assert.equal(stack?.number, 2);
    assert.equal(
      member(member(member(stack?.payload, 'at'), 'address'), 'line'),
      LINE.mark + 1,
    );
    const all = await liveCall('DebugBatchAnswers', { numbers: [1, 2, 3] });
    succeeded('DebugBatchAnswers numbers', all);
    // The stop was at the first marker, the counter set to 41 there: the
    // step ran its line, `lv_counter = 1`.
    checkBatchAnswers(entriesOf(all), LINE.mark, '1');
  });

  it('HandlerDebugBatch begin, a step, the stack and the counter recorded, end, answers by number and by numbers', async () => {
    const begun = await liveCall('HandlerDebugBatch', { action: 'begin' });
    succeeded('HandlerDebugBatch begin', begun);
    session.batchOpen = true;
    assert.equal(member(payloadOf(begun), 'debug_batch'), 'on');
    await recorded('HandlerDebugStep', {
      state_handle: handle(),
      kind: 'abap',
      operation: 'stepOver',
    });
    await recorded('HandlerDebugMaintain', {
      state_handle: handle(),
      kind: 'abap',
      operation: 'getStack',
    });
    await recorded('HandlerDebugMaintain', {
      state_handle: handle(),
      kind: 'abap',
      operation: 'getVariables',
      names: ['LV_COUNTER'],
    });
    const ended = await liveCall('HandlerDebugBatch', { action: 'end' });
    session.batchOpen = false;
    succeeded('HandlerDebugBatch end', ended);
    assert.deepEqual(payloadOf(ended), THREE);

    const one = await liveCall('HandlerDebugBatch', {
      action: 'answers',
      number: 3,
    });
    succeeded('HandlerDebugBatch answers number', one);
    const [variables] = entriesOf(one);
    assert.equal(variables?.number, 3);
    const all = await liveCall('HandlerDebugBatch', {
      action: 'answers',
      numbers: [1, 2, 3],
    });
    succeeded('HandlerDebugBatch answers numbers', all);
    // The full set's batch left the run on the line after the first marker:
    // the step ran `lv_counter = lv_counter + 1`.
    checkBatchAnswers(entriesOf(all), LINE.mark + 1, '2');
  });

  it('DebugTerminate ends the run where it stands', async () => {
    const ended = await liveCall('DebugTerminate', { state_handle: handle() });
    succeeded('DebugTerminate', ended);
    assert.equal(member(payloadOf(ended), 'state'), 'ended');
    assert.equal(member(payloadOf(ended), 'reason'), 'terminated');
  });

  it('MemorySnapshotGet reads a snapshot it took, MemorySnapshotDelta compares the two', async () => {
    const [first, second] = snapshotFiles;
    const notBefore = snapshotsNotBefore.at;
    if (
      first === undefined ||
      second === undefined ||
      notBefore === undefined
    ) {
      throw new Error('the case took no two snapshots');
    }
    // Until both files are listed (the header: why the case waits), each by
    // exactly one row of this run: its file, taken at or after the run's start.
    const idOf = new Map<string, string>();
    const started = Date.now();
    for (;;) {
      const list = succeeded(
        'MemorySnapshotList',
        await livePrepare('MemorySnapshotList', { detail: 'full' }),
      );
      const rows = payloadOf(list);
      const ours = (Array.isArray(rows) ? rows : []).filter(
        (row) => utcDigits(String(member(row, 'timestamp'))) >= notBefore,
      );
      for (const file of [first, second]) {
        const matching = ours.filter((row) =>
          String(member(row, 'fileName')).endsWith(`/${file}`),
        );
        if (matching.length > 1) {
          throw new Error(
            `${matching.length} snapshots of ${file} are listed taken at or after ${notBefore}: the case cannot tell its own`,
          );
        }
        const [row] = matching;
        if (row !== undefined) idOf.set(file, String(member(row, 'id')));
      }
      if (idOf.size === 2) break;
      const waited = Date.now() - started;
      if (waited >= LIST_LIMIT_MS) {
        throw new Error(
          `the snapshots ${first} and ${second} were not listed after ${Math.round(waited / 1000)} s`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LIST_PAUSE_MS));
    }
    const from = idOf.get(first);
    const to = idOf.get(second);
    if (from === undefined || to === undefined) throw new Error('unreachable');

    const read = await liveCall('MemorySnapshotGet', {
      snapshot_id: from,
      max_objects: 50,
    });
    succeeded('MemorySnapshotGet', read);
    assert.equal(typeof member(payloadOf(read), 'overview'), 'object');
    const delta = await liveCall('MemorySnapshotDelta', {
      from_id: from,
      to_id: to,
      max_objects: 50,
    });
    succeeded('MemorySnapshotDelta', delta);
    assert.equal(typeof member(payloadOf(delta), 'overview'), 'object');
  });
});

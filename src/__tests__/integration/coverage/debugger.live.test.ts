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
 * - `DebugTerminate` ends the run where it stands.
 *
 * **The memory snapshots.** At the stop the case takes two memory snapshots
 * of its own (`DebugCreateMemorySnapshot`); each answer names the snapshot's
 * file. After the run ends, `MemorySnapshotGet` reads the first and
 * `MemorySnapshotDelta` compares the two — exactly those, found in
 * `MemorySnapshotList` (detail `full`) by their file names. Nothing deletes
 * them: no tool can, and SAP removes snapshots over time.
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

/** The listener's state handle once it started. */
const session: { handle?: string } = {};

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

liveSuite(['onprem', 'cloud'], 'The ABAP debugger at a stop', () => {
  after(async () => {
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

  it('DebugTerminate ends the run where it stands', async () => {
    const ended = await liveCall('DebugTerminate', { state_handle: handle() });
    succeeded('DebugTerminate', ended);
    assert.equal(member(payloadOf(ended), 'state'), 'ended');
    assert.equal(member(payloadOf(ended), 'reason'), 'terminated');
  });

  it('MemorySnapshotGet reads a snapshot it took, MemorySnapshotDelta compares the two', async () => {
    const [first, second] = snapshotFiles;
    if (first === undefined || second === undefined) {
      throw new Error('the case took no two snapshots');
    }
    // Until both files are listed (the header: why the case waits).
    const idOf = new Map<string, string>();
    const started = Date.now();
    for (;;) {
      const list = succeeded(
        'MemorySnapshotList',
        await livePrepare('MemorySnapshotList', { detail: 'full' }),
      );
      const rows = payloadOf(list);
      for (const row of Array.isArray(rows) ? rows : []) {
        const fileName = String(member(row, 'fileName'));
        for (const file of [first, second]) {
          if (fileName.endsWith(`/${file}`)) {
            idOf.set(file, String(member(row, 'id')));
          }
        }
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

    const read = await liveCall('MemorySnapshotGet', { snapshot_id: from });
    succeeded('MemorySnapshotGet', read);
    assert.equal(typeof member(payloadOf(read), 'overview'), 'object');
    const delta = await liveCall('MemorySnapshotDelta', {
      from_id: from,
      to_id: to,
    });
    succeeded('MemorySnapshotDelta', delta);
    assert.equal(typeof member(payloadOf(delta), 'overview'), 'object');
  });
});

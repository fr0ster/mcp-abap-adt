/**
 * The compact dump and profiler tools, live, on both systems, on the shared
 * classes the test config names (`runtime_readonly_handlers`): nothing is
 * created or deleted. Running a class changes no object (the owner's rule
 * for shared objects in read-only tests); what a run leaves — a short dump,
 * a profiler trace — no tool deletes: SAP ages both out on its own.
 *
 * - **Dumps.** The shared dump class (`dump_class_name`) divides by zero; it
 *   runs on a connection of its own, dropped after, so the dump's lost
 *   context is not the suite's. Its dump is the one the feed did not list
 *   before the run and whose default view names the class.
 *   `HandlerDumpList` lists it with its `dump_id`; `HandlerDumpView` reads it
 *   in each of its views.
 * - **Profiles.** `HandlerProfileSchedule` schedules a trace and answers its
 *   profiler id; `HandlerProfileRun` runs the shared profiled class
 *   (`profiled_class_name`) under it. SAP writes the trace after the run: it
 *   is the one the trace list did not hold before and that names the class,
 *   readable once its state is `R` (Finished). `HandlerProfileList` lists
 *   it; `HandlerProfileView` reads its hit list raw and analysed.
 *
 * **The waits.** SAP lists a dump and finishes a trace only after the run
 * that made it, so the cases read the feed and the trace list at a fixed
 * pause until it is there, failing at a limit of their own (tests may bound
 * their waits: the owner, 2026-11-16; `noLiveBounds.test.ts` names the
 * sites).
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { getTestDestination } from '../helpers/authHelpers';
import {
  configuredSystemKind,
  getTestCase,
  sharedDependencyKind,
} from '../helpers/configHelpers';
import {
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
} from '../helpers/live';
import { endTestConnection, trackConnection } from '../helpers/openConnections';
import { guardedTestConnection } from '../helpers/refusalGuard';
import { member, payloadOf, succeeded } from './ownObjects';

/** The pause between two reads of the feed or the trace list. */
const POLL_MS = 3_000;
/** How long a dump may take to be listed (the full-tier suite's 8 × 1.5 s, with room). */
const DUMP_LIMIT_MS = 120_000;
/** How long a trace may take to be listed and finished. */
const TRACE_LIMIT_MS = 180_000;
/** How many dumps a read of the feed asks for. */
const FEED_TOP = 50;

/** A shared class the runtime case names in the test config. */
function sharedClass(field: 'dump_class_name' | 'profiled_class_name'): string {
  const params = getTestCase(
    'runtime_readonly_handlers',
    'test_runtime_readonly',
  )?.params;
  const named = member(params, field);
  if (typeof named !== 'string' || named === '') {
    throw new Error(`the test config names no ${field}`);
  }
  if (sharedDependencyKind(named) !== 'classes') {
    throw new Error(
      `${field} is not a shared class (shared_dependencies.classes): nothing runs`,
    );
  }
  return named.toUpperCase();
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

/** The entries of a list answer (`entries`), each a JSON object. */
function entriesOf(step: string, answer: LiveAnswer): unknown[] {
  const entries = member(payloadOf(succeeded(step, answer)), 'entries');
  if (!Array.isArray(entries)) throw new Error(`${step} answered no entries`);
  return entries;
}

/** The dump ids the feed lists now. */
async function listedDumps(): Promise<string[]> {
  const listed = await livePrepare('HandlerDumpList', {
    top: FEED_TOP,
    detail: 'medium',
  });
  return entriesOf('HandlerDumpList', listed)
    .map((entry) => member(entry, 'dump_id'))
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

/** Runs the shared dump class on a connection of its own, which is dropped after. */
async function runDumpClass(className: string): Promise<void> {
  const kind = configuredSystemKind();
  const destination = await getTestDestination();
  if (destination === null || (kind !== 'onprem' && kind !== 'cloud')) {
    throw new Error('the test config names no destination');
  }
  const trigger = trackConnection(
    guardedTestConnection(destination.settings, destination.credential, {
      kind,
    }),
  );
  try {
    await trigger.connect();
    const ran = await new AdtExecutor(trigger)
      .getClassExecutor()
      .run({ className }, { analyse: analyseException });
    // The run dumps: SAP answers it as a failure, which is the point.
    assert.equal(ran.ok, false, `${className} ran without a dump`);
  } finally {
    await endTestConnection(trigger);
  }
}

/** The dump the run made: new against `seen`, its default view naming `className`. */
async function untilDumpListed(
  seen: ReadonlySet<string>,
  className: string,
): Promise<string> {
  const started = Date.now();
  const opened = new Set<string>();
  for (;;) {
    for (const id of await listedDumps()) {
      if (seen.has(id) || opened.has(id)) continue;
      opened.add(id);
      const read = await livePrepare('HandlerDumpView', { dump_id: id });
      if (!read.isError && read.text.toUpperCase().includes(className)) {
        return id;
      }
    }
    if (Date.now() - started >= DUMP_LIMIT_MS) {
      throw new Error(
        `no new dump of ${className} is listed after ${Math.round((Date.now() - started) / 1000)} s`,
      );
    }
    await pause();
  }
}

/** One trace of the list: its id, the program it names and its state. */
interface ListedTrace {
  readonly id: string;
  readonly objectName: string;
  readonly state: string;
}

async function listedTraces(): Promise<ListedTrace[]> {
  const listed = await livePrepare('HandlerProfileList', { detail: 'medium' });
  return entriesOf('HandlerProfileList', listed).flatMap((entry) => {
    const id = member(entry, 'id');
    const objectName = member(entry, 'objectName');
    const state = member(member(entry, 'state'), 'value');
    return typeof id === 'string'
      ? [
          {
            id,
            objectName: typeof objectName === 'string' ? objectName : '',
            state: typeof state === 'string' ? state : '',
          },
        ]
      : [];
  });
}

/** The trace the run wrote: new against `seen`, naming `className`, finished (`R`). */
async function untilTraceFinished(
  seen: ReadonlySet<string>,
  className: string,
): Promise<string> {
  const started = Date.now();
  for (;;) {
    const written = (await listedTraces()).filter(
      (trace) =>
        !seen.has(trace.id) &&
        trace.objectName.toUpperCase().startsWith(className),
    );
    const finished = written.find((trace) => trace.state === 'R');
    if (finished !== undefined) return finished.id;
    if (Date.now() - started >= TRACE_LIMIT_MS) {
      throw new Error(
        `no finished trace of ${className} after ${Math.round((Date.now() - started) / 1000)} s (${written.length} new, unfinished)`,
      );
    }
    await pause();
  }
}

liveSuite(['onprem', 'cloud'], 'Compact dumps and profiles', () => {
  const found: { dump?: string; dumpClass?: string; trace?: string } = {};

  it('HandlerDumpList lists the dump the shared dump class made', async () => {
    const className = sharedClass('dump_class_name');
    const seen = new Set(await listedDumps());
    await runDumpClass(className);
    const dump = await untilDumpListed(seen, className);
    found.dump = dump;
    found.dumpClass = className;
    const listed = await liveCall('HandlerDumpList', {
      top: FEED_TOP,
      detail: 'medium',
    });
    const payload = payloadOf(succeeded('HandlerDumpList', listed));
    assert.equal(member(payload, 'feed_type'), 'dumps');
    const entries = entriesOf('HandlerDumpList', listed);
    assert.equal(member(payload, 'count'), entries.length);
    assert.ok(
      entries.some((entry) => member(entry, 'dump_id') === dump),
      `the dump ${dump} is not listed`,
    );
  });

  it('HandlerDumpView reads that dump in its default, summary and formatted views', async () => {
    const { dump, dumpClass } = found;
    if (dump === undefined || dumpClass === undefined) {
      throw new Error('no dump was found');
    }
    const wholeAnswer = await liveCall('HandlerDumpView', { dump_id: dump });
    const whole = payloadOf(succeeded('HandlerDumpView', wholeAnswer));
    assert.equal(member(whole, 'dump_id'), dump);
    assert.equal(member(whole, 'view'), 'default');
    assert.notEqual(member(whole, 'summary'), undefined);
    assert.ok(
      JSON.stringify(member(whole, 'payload'))
        .toUpperCase()
        .includes(dumpClass),
      'the default view does not name the class',
    );

    const summaryAnswer = await liveCall('HandlerDumpView', {
      dump_id: dump,
      view: 'summary',
    });
    const summary = payloadOf(succeeded('HandlerDumpView', summaryAnswer));
    assert.equal(member(summary, 'dump_id'), dump);
    assert.notEqual(member(summary, 'summary'), undefined);
    assert.equal(member(summary, 'payload'), undefined);

    const formattedAnswer = await liveCall('HandlerDumpView', {
      dump_id: dump,
      view: 'formatted',
    });
    const formatted = payloadOf(succeeded('HandlerDumpView', formattedAnswer));
    assert.equal(member(formatted, 'view'), 'formatted');
    assert.ok(
      JSON.stringify(member(formatted, 'payload'))
        .toUpperCase()
        .includes(dumpClass),
      'the formatted view does not name the class',
    );
  });

  it('HandlerProfileSchedule schedules a trace, HandlerProfileRun runs the shared profiled class under it, HandlerProfileList lists the trace', async () => {
    const className = sharedClass('profiled_class_name');
    const seen = new Set((await listedTraces()).map((trace) => trace.id));
    const scheduledAnswer = await liveCall('HandlerProfileSchedule', {
      description: 'MCP coverage compact profile',
    });
    const scheduled = payloadOf(
      succeeded('HandlerProfileSchedule', scheduledAnswer),
    );
    assert.equal(member(scheduled, 'success'), true);
    const profilerId = member(scheduled, 'profiler_id');
    assert.equal(typeof profilerId, 'string');
    assert.notEqual(profilerId, '');

    const ranAnswer = await liveCall('HandlerProfileRun', {
      target_type: 'CLASS',
      class_name: className,
      profiler_id: String(profilerId),
    });
    const ran = payloadOf(succeeded('HandlerProfileRun', ranAnswer));
    assert.equal(member(ran, 'success'), true);
    assert.equal(member(ran, 'class_name'), className);
    assert.equal(member(member(ran, 'profile'), 'profiler_id'), profilerId);

    const trace = await untilTraceFinished(seen, className);
    found.trace = trace;
    const listed = await liveCall('HandlerProfileList', { detail: 'medium' });
    const entries = entriesOf('HandlerProfileList', listed);
    assert.equal(member(payloadOf(listed), 'count'), entries.length);
    assert.ok(
      entries.some((entry) => member(entry, 'id') === trace),
      `the trace ${trace} is not listed`,
    );
  });

  it('HandlerProfileView reads the trace hit list, raw and analysed', async () => {
    const { trace } = found;
    if (trace === undefined) throw new Error('no trace was found');
    const rawAnswer = await liveCall('HandlerProfileView', {
      trace_id_or_uri: trace,
      view: 'hitlist',
    });
    const raw = payloadOf(succeeded('HandlerProfileView', rawAnswer));
    assert.equal(member(raw, 'success'), true);
    const analysedAnswer = await liveCall('HandlerProfileView', {
      trace_id_or_uri: trace,
      view: 'hitlist',
      mode: 'analyze',
      top: 5,
    });
    const analysed = payloadOf(succeeded('HandlerProfileView', analysedAnswer));
    assert.equal(member(analysed, 'success'), true);
    assert.notEqual(member(analysed, 'summary'), undefined);
  });
});

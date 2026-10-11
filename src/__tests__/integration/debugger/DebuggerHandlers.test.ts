/**
 * Integration tests for the debugger handlers against a live system.
 *
 * The test creates its probes — an ABAP class run as a console application,
 * and for AMDP a class with a SQLScript procedure plus a table function — in
 * the package the test case names, with no transport, and deletes them after
 * the run. Every case builds its own instance state with a debugger attached,
 * the way a server instance does, and disposes it afterwards.
 *
 * Besides the checks, the cases MEASURE what SAP does where the design leans
 * on it: the listener conflict in both modes, the reconciliation of stated
 * ids, whether a line breakpoint catches a second time, and whether stopping
 * an AMDP session ends its open event read. Each measurement is one line
 * `MEASURE <case> | <asked> | <answered>`, and each timed call one line
 * `TIMING <step> <ms>`, on stderr. Times are measured, never asserted.
 *
 * Hard mode (`integration_hard_mode.enabled: true`, exposition including
 * `debug`) runs the ABAP chain through the MCP server — stdio, or Streamable
 * HTTP where every call is its own request carrying `state_handle`. The cases
 * that drive SAP or the instance directly skip there.
 *
 * Nothing else may debug for the same SAP user while this runs.
 */

import {
  AbapDebugger,
  AdtExecutor,
  type IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../handlers/class/high/handleDeleteClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleCreateDdl } from '../../../handlers/ddl/high/handleCreateDdl';
import { handleDeleteDdl } from '../../../handlers/ddl/high/handleDeleteDdl';
import { handleUpdateDdl } from '../../../handlers/ddl/high/handleUpdateDdl';
import { handleAmdpDebugGetTable } from '../../../handlers/debugger/debug/handleAmdpDebugGetTable';
import { handleAmdpDebugStart } from '../../../handlers/debugger/debug/handleAmdpDebugStart';
import { handleAmdpDebugStep } from '../../../handlers/debugger/debug/handleAmdpDebugStep';
import { handleAmdpDebugStop } from '../../../handlers/debugger/debug/handleAmdpDebugStop';
import { handleAmdpDebugWait } from '../../../handlers/debugger/debug/handleAmdpDebugWait';
import { handleDebugCreateMemorySnapshot } from '../../../handlers/debugger/debug/handleDebugCreateMemorySnapshot';
import { handleDebugGetMemorySizes } from '../../../handlers/debugger/debug/handleDebugGetMemorySizes';
import { handleDebugGetStack } from '../../../handlers/debugger/debug/handleDebugGetStack';
import { handleDebugGetVariables } from '../../../handlers/debugger/debug/handleDebugGetVariables';
import { handleDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStep } from '../../../handlers/debugger/debug/handleDebugStep';
import { handleDebugStepToLine } from '../../../handlers/debugger/debug/handleDebugStepToLine';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import { handleDebugTakeOverListener } from '../../../handlers/debugger/debug/handleDebugTakeOverListener';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
import { handleMemorySnapshotList } from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  createDebuggerInstance,
  type DebuggerInstance,
} from '../../../lib/debugger/DebuggerInstance';
import type { Debugger } from '../../../lib/debugger/DebugSession';
import { newDebuggerId } from '../../../lib/debugger/ids';
import { requestUserOf } from '../../../lib/debugger/ports';
import { openFreshConnection } from '../../../lib/packageSessions';
import {
  InstanceState,
  stderrStateLogger,
} from '../../../lib/state/InstanceState';
import { ourClassExecutor } from '../../../lib/strategies/resultSets';
import { getTimeout } from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { LambdaTester } from '../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../helpers/testers/types';
import { createHandlerContext } from '../helpers/testHelpers';

// --- the probes -------------------------------------------------------------------

const markersOf = (source: string, marker: RegExp): Record<string, number> => {
  const lines: Record<string, number> = {};
  source.split('\n').forEach((text, index) => {
    const m = marker.exec(text);
    if (m) lines[m[1]] = index + 1;
  });
  return lines;
};

/** `"BP:<name>` names a line the cases stop at, step to or run to. */
function abapProbeSource(name: string): string {
  const n = name.toLowerCase();
  return `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    METHODS add IMPORTING iv TYPE i RETURNING VALUE(rv) TYPE i.
ENDCLASS.

CLASS ${n} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA lv_counter TYPE i.
    lv_counter = 1. "BP:mark
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1. "BP:runto
    lv_counter = add( lv_counter ). "BP:calls
    lv_counter = add( lv_counter ).
    lv_counter = add( lv_counter ).
    lv_counter = add( lv_counter ).
    lv_counter = lv_counter + 1.
    lv_counter = lv_counter + 1. "BP:second
    lv_counter = lv_counter + 1.
    out->write( |counter { lv_counter }| ).
  ENDMETHOD.

  METHOD add.
    rv = iv + 1.
  ENDMETHOD.
ENDCLASS.
`;
}
const ABAP_OUTPUT = 'counter 15';

function amdpDdlSource(ddl: string, cls: string): string {
  return `@EndUserText.label: 'AMDP debugger probe table function'
@ClientHandling.type: #CLIENT_INDEPENDENT
@AccessControl.authorizationCheck: #NOT_REQUIRED
define table function ${ddl}
  with parameters
    p_limit : abap.int4
  returns {
    n      : abap.int4;
    square : abap.int4;
  }
  implemented by method ${cls.toLowerCase()}=>tf;
`;
}

/** `-- BP:<name>` names a SQLScript line the AMDP cases stop at. */
function amdpClassSource(cls: string, ddl: string): string {
  const n = cls.toLowerCase();
  return `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.
    INTERFACES if_oo_adt_classrun.
    METHODS sum_to AMDP OPTIONS READ-ONLY CLIENT INDEPENDENT
      IMPORTING VALUE(iv_limit) TYPE i
      EXPORTING VALUE(ev_total) TYPE i
                VALUE(ev_steps) TYPE i.
    CLASS-METHODS tf FOR TABLE FUNCTION ${ddl.toLowerCase()}.
ENDCLASS.

CLASS ${n} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    sum_to( EXPORTING iv_limit = 3
            IMPORTING ev_total = DATA(lv_total)
                      ev_steps = DATA(lv_steps) ).
    SELECT * FROM ${ddl.toLowerCase()}( p_limit = 3 ) INTO TABLE @DATA(lt_rows).
    out->write( |total { lv_total } steps { lv_steps } rows { lines( lt_rows ) }| ).
  ENDMETHOD.

  METHOD sum_to BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT
    OPTIONS READ-ONLY.
    DECLARE lv_i INTEGER;
    ev_total = 0;
    ev_steps = 0;
    FOR lv_i IN 1..:iv_limit DO
      ev_total = :ev_total + :lv_i; -- BP:loop
      ev_steps = :ev_steps + 1;
    END FOR;
  ENDMETHOD.

  METHOD tf BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT
    OPTIONS READ-ONLY.
    DECLARE lt_rows TABLE ( n INTEGER, square INTEGER );
    DECLARE lv_i INTEGER;
    FOR lv_i IN 1..:p_limit DO
      :lt_rows.INSERT( ( :lv_i, :lv_i * :lv_i ) ); -- BP:tf
    END FOR;
    RETURN SELECT n, square FROM :lt_rows;
  ENDMETHOD.
ENDCLASS.
`;
}
const AMDP_OUTPUT = 'total 6 steps 3 rows 3';

// --- the record ---------------------------------------------------------------------

const say = (line: string) => process.stderr.write(`${line}\n`);
/** A state handle is a bearer secret: it never reaches a log, a test's included. */
const withoutHandles = (text: string) =>
  text.replace(/("state_handle"\s*:\s*")[^"]*"/g, '$1<handle>"');
const measure = (kase: string, asked: string, answered: unknown) =>
  say(
    `MEASURE ${kase} | ${asked} | ${withoutHandles(
      typeof answered === 'string' ? answered : JSON.stringify(answered),
    )}`,
  );
const timing = (step: string, ms: number) =>
  say(`TIMING ${step} ${Math.round(ms)}`);
const now = () => performance.now();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Answer {
  isError: boolean;
  text: string;
  json: any;
  ms: number;
}

const HANDLERS: Record<string, (ctx: HandlerContext, args: any) => any> = {
  DebugStartListener: handleDebugStartListener,
  DebugTakeOverListener: handleDebugTakeOverListener,
  DebugWait: handleDebugWait,
  DebugGetStack: handleDebugGetStack,
  DebugGetVariables: handleDebugGetVariables,
  DebugStep: handleDebugStep,
  DebugStepToLine: handleDebugStepToLine,
  DebugSetBreakpoints: handleDebugSetBreakpoints,
  DebugStop: handleDebugStop,
  DebugGetMemorySizes: handleDebugGetMemorySizes,
  DebugCreateMemorySnapshot: handleDebugCreateMemorySnapshot,
  MemorySnapshotList: handleMemorySnapshotList,
  AmdpDebugStart: handleAmdpDebugStart,
  AmdpDebugWait: handleAmdpDebugWait,
  AmdpDebugStep: handleAmdpDebugStep,
  AmdpDebugGetTable: handleAmdpDebugGetTable,
  AmdpDebugStop: handleAmdpDebugStop,
  CreateClass: handleCreateClass,
  UpdateClass: handleUpdateClass,
  DeleteClass: handleDeleteClass,
  CreateDdl: handleCreateDdl,
  UpdateDdl: handleUpdateDdl,
  DeleteDdl: handleDeleteDdl,
  ActivateObjects: handleActivateObjects,
};

/** One server instance's worth: its state, its debugger, a context bound to them. */
interface Instance {
  state?: InstanceState;
  ctx: HandlerContext;
  debugger(): DebuggerInstance | undefined;
}

describe('Debugger handlers (integration)', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('debugger');
  const instances: InstanceState[] = [];
  let probe = '';
  let amdpClass = '';
  let amdpDdl = '';
  let pkg = '';
  let transport: string | undefined;
  let repeats = 5;
  let LINE: Record<string, number> = {};
  let AMDP_LINE: Record<string, number> = {};
  let abapReady = false;
  let amdpReady: string | undefined;
  let connection: IAbapConnection;

  const call = async (
    inst: Instance,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<Answer> => {
    const t0 = now();
    const r: any = await tester.invokeToolOrHandler(tool, args, async () =>
      HANDLERS[tool](inst.ctx, args),
    );
    const ms = now() - t0;
    const blocks: string[] = (r?.content ?? []).map((c: any) =>
      String(c?.text ?? ''),
    );
    let json: any;
    try {
      json = JSON.parse(blocks[0] ?? '');
    } catch {
      json = undefined;
    }
    return { isError: r?.isError === true, text: blocks.join('\n'), json, ms };
  };

  const newInstance = (ids?: {
    terminalId: string;
    ideId: string;
    stated: boolean;
  }): Instance => {
    if (tester.isHardMode()) {
      return { ctx: {} as HandlerContext, debugger: () => undefined };
    }
    const state = new InstanceState({ logger: stderrStateLogger });
    instances.push(state);
    let dbg: DebuggerInstance | undefined;
    const ctx: HandlerContext = {
      ...createHandlerContext({ connection, logger }),
      state,
      debugger: () => {
        if (!dbg) {
          dbg = createDebuggerInstance(
            ids ?? {
              terminalId: newDebuggerId(),
              ideId: newDebuggerId(),
              stated: false,
            },
          );
          state.attach(dbg);
        }
        return dbg;
      },
    };
    return { state, ctx, debugger: () => dbg };
  };

  /** A plain context for the object tools. */
  const plain = (): Instance => ({
    ctx: tester.isHardMode()
      ? ({} as HandlerContext)
      : createHandlerContext({ connection, logger }),
    debugger: () => undefined,
  });

  const softOnly = (what: string) => {
    if (tester.isHardMode()) throw new Error(`SKIP: soft mode only — ${what}`);
  };

  const line = (name: string, extra: Record<string, unknown> = {}) => ({
    object_type: 'CLAS',
    object_name: probe,
    line: LINE[name],
    ...extra,
  });

  /** DebugWait until the state matches; every answer on the way is returned. */
  const waitFor = async (
    inst: Instance,
    handle: string,
    states: string[],
    rounds = 4,
  ): Promise<{ last: Answer; ms: number; seen: Answer[] }> => {
    const t0 = now();
    const seen: Answer[] = [];
    for (let i = 0; i < rounds; i++) {
      const a = await call(inst, 'DebugWait', {
        state_handle: handle,
        hold_seconds: 30,
      });
      seen.push(a);
      if (a.isError || states.includes(a.json?.state))
        return { last: a, ms: now() - t0, seen };
    }
    return { last: seen[seen.length - 1], ms: now() - t0, seen };
  };

  /** Runs the probe on a connection of its own, with no debugger of ours. */
  const runProbe = async (
    name: string,
  ): Promise<{ ok: boolean; output: string; ms: number }> => {
    const conn = await openFreshConnection(connection, undefined as never);
    const t0 = now();
    try {
      const answer = await new AdtExecutor(conn)
        .getClassExecutor(ourClassExecutor)
        .run({ className: name }, { analyse: analyseException });
      return answer.ok
        ? {
            ok: true,
            output: String(answer.getResult().value ?? ''),
            ms: now() - t0,
          }
        : { ok: false, output: answer.getError().message, ms: now() - t0 };
    } finally {
      await (conn as { disconnect?: () => Promise<void> }).disconnect?.();
    }
  };

  /** A listener of the test's own, outside any instance: one poll, never re-polled. */
  const rawListener = async (ids: {
    terminalId: string;
    ideId: string;
  }): Promise<{
    poll: Promise<{ status: string; body: string; at: number }>;
    started: number;
    close: () => Promise<void>;
  }> => {
    const conn = await openFreshConnection(connection, undefined as never);
    (
      conn as { setSessionType?: (t: 'stateful' | 'stateless') => void }
    ).setSessionType?.('stateful');
    const dbg = new AbapDebugger(conn, undefined, undefined, {
      onConflict: 'refuse' as IDebuggerListenerConflict,
    }) as unknown as Debugger;
    const requestUser = await requestUserOf(connection);
    const started = now();
    const poll = dbg
      .listen({ requestUser, ...ids }, { holdSeconds: 60 })
      .then((a) => ({
        status: a.ok ? 'ok' : `error: ${a.getError().message}`,
        body: a.ok ? String(a.getResult().value ?? '') : '',
        at: now(),
      }))
      .catch((e: unknown) => ({
        status: `threw: ${e instanceof Error ? e.message : String(e)}`,
        body: '',
        at: now(),
      }));
    return {
      poll,
      started,
      close: async () => {
        await (conn as { disconnect?: () => Promise<void> }).disconnect?.();
      },
    };
  };

  // --- lifecycle -----------------------------------------------------------------

  beforeAll(async () => {
    tester = new LambdaTester(
      'debugger_handlers',
      'debugger_chain',
      'debugger',
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        if (!context.hasConfig) return;
        connection = context.connection as unknown as IAbapConnection;
        const p = context.params ?? {};
        probe = String(p.probe_class ?? '').toUpperCase();
        amdpClass = String(p.amdp_probe_class ?? '').toUpperCase();
        amdpDdl = String(p.amdp_probe_ddl ?? '').toUpperCase();
        pkg = String(p.package ?? '');
        transport = p.transport ? String(p.transport) : undefined;
        repeats = Number(p.timing_repeats) > 0 ? Number(p.timing_repeats) : 5;
        if (!probe || !pkg)
          throw new Error('probe_class and package are required');
        const abapSource = abapProbeSource(probe);
        LINE = markersOf(abapSource, /"BP:(\w+)/);
        const tr = transport ? { transport_request: transport } : {};
        const obj = plain();

        // The ABAP probe: a shell, its source, activated.
        const created = await call(obj, 'CreateClass', {
          class_name: probe,
          package_name: pkg,
          description: 'Debugger probe',
          ...tr,
        });
        if (created.isError)
          measure('setup', `create ${probe}`, created.text.slice(0, 300));
        const updated = await call(obj, 'UpdateClass', {
          class_name: probe,
          source_code: abapSource,
          activate: true,
          ...tr,
        });
        if (updated.isError)
          throw new Error(`the probe was not written: ${updated.text}`);
        abapReady = true;

        if (tester.isHardMode() || !amdpClass || !amdpDdl) return;
        // The AMDP probe: the two name each other — shells, bodies, one group activation.
        const classSource = amdpClassSource(amdpClass, amdpDdl);
        AMDP_LINE = markersOf(classSource, /-- BP:(\w+)/);
        const ddlShell = await call(obj, 'CreateDdl', {
          ddl_name: amdpDdl,
          package_name: pkg,
          description: 'AMDP debugger probe',
          ...tr,
        });
        if (ddlShell.isError)
          measure('setup', `create ${amdpDdl}`, ddlShell.text.slice(0, 300));
        const classShell = await call(obj, 'CreateClass', {
          class_name: amdpClass,
          package_name: pkg,
          description: 'AMDP debugger probe',
          ...tr,
        });
        if (classShell.isError)
          measure(
            'setup',
            `create ${amdpClass}`,
            classShell.text.slice(0, 300),
          );
        const ddlBody = await call(obj, 'UpdateDdl', {
          ddl_name: amdpDdl,
          ddl_source: amdpDdlSource(amdpDdl, amdpClass),
          ...tr,
        });
        const classBody = await call(obj, 'UpdateClass', {
          class_name: amdpClass,
          source_code: classSource,
          ...tr,
        });
        const activated = await call(obj, 'ActivateObjects', {
          objects: [
            { name: amdpDdl, type: 'DDLS' },
            { name: amdpClass, type: 'CLAS' },
          ],
        });
        if (
          ddlBody.isError ||
          classBody.isError ||
          activated.isError ||
          activated.json?.activated !== true
        ) {
          amdpReady = `the AMDP probe is not active: ${[
            ddlBody,
            classBody,
            activated,
          ]
            .map((a) => a.text.slice(0, 400))
            .join(' / ')}`;
          measure('setup', 'activate the AMDP probe', amdpReady);
        }
      },
      async () => {},
    );
  }, getTimeout('long'));

  afterEach(async () => {
    // Every instance a case made is let go the way a host lets one go.
    const states = instances.splice(0);
    for (const state of states) {
      const left = await Promise.race([
        state.shutdown(),
        pause(300_000).then(() => ['still settling after 300 s']),
      ]);
      if (left.length) measure('cleanup', 'instance shutdown', left);
    }
    // A pause between cases: what one case left at the system settles before the next starts.
    await pause(5000);
  }, getTimeout('long'));

  afterAll(async () => {
    try {
      if (!tester?.isHardMode?.() && !connection) return;
      const keep = tester
        ? (tester as any).context?.params?.keep_probe === true
        : true;
      if (keep || !probe) return;
      const tr = transport ? { transport_request: transport } : {};
      const obj = plain();
      const deletions = [
        await call(obj, 'DeleteClass', { class_name: probe, ...tr }),
      ];
      if (!tester.isHardMode() && amdpClass && amdpDdl) {
        deletions.push(
          await call(obj, 'DeleteClass', { class_name: amdpClass, ...tr }),
          await call(obj, 'DeleteDdl', { ddl_name: amdpDdl, ...tr }),
        );
      }
      for (const d of deletions)
        if (d.isError)
          measure('cleanup', 'delete a probe', d.text.slice(0, 300));
    } finally {
      await tester?.afterAll(async () => {});
    }
  }, getTimeout('long'));

  // --- 1. the ABAP chain, with its timings -------------------------------------------

  it(
    'ABAP chain: listen, stop at the marked line, read, step, run to a line, continue, end',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        const mode = tester.isHardMode() ? 'hard' : 'soft';
        const inst = newInstance();
        const started = await call(inst, 'DebugStartListener', {
          breakpoints: [line('mark'), line('second')],
          run: { kind: 'class', name: probe },
        });
        timing(`${mode} abap.start(arm+listen+run)`, started.ms);
        expect(started.isError).toBe(false);
        const handle = String(started.json?.state_handle ?? '');
        expect(handle).toMatch(/^[0-9A-F]{32}$/);
        measure('1', 'start answer', {
          state: started.json?.state,
          breakpoints: started.json?.breakpoints?.placed?.length,
          refused: started.json?.breakpoints?.refused,
        });

        const stopped = await waitFor(inst, handle, ['stopped', 'ended']);
        timing(`${mode} abap.wait-until-stopped(run→catch)`, stopped.ms);
        expect(stopped.last.isError).toBe(false);
        expect(stopped.last.json?.state).toBe('stopped');
        const at = stopped.last.json?.at;
        measure('1', 'the terse stop: address and technical place', at);
        expect(at?.address?.line).toBe(LINE.mark);
        expect(at?.address?.object_name).toBe(probe);
        expect(at?.program).toBeTruthy();
        expect(at?.include).toBeTruthy();
        expect(at?.include_line).toBeGreaterThan(0);

        for (let i = 0; i < 3; i++) {
          const stack = await call(inst, 'DebugGetStack', {
            state_handle: handle,
          });
          timing(`${mode} abap.get-stack`, stack.ms);
          expect(stack.isError).toBe(false);
        }
        const full = await call(inst, 'DebugGetStack', {
          state_handle: handle,
          detail: 'full',
        });
        const frames: any[] = full.json?.stack?.frames ?? [];
        measure(
          '1',
          'stack positions (first, last, count; frames[0] is what terse calls `at`)',
          {
            first: frames[0] && {
              position: frames[0].position,
              event: frames[0].event,
              line: frames[0].line,
            },
            last: frames[frames.length - 1] && {
              position: frames[frames.length - 1].position,
              event: frames[frames.length - 1].event,
            },
            count: frames.length,
            cursor: full.json?.stack?.cursor,
          },
        );

        for (let i = 0; i < 3; i++) {
          const vars = await call(inst, 'DebugGetVariables', {
            state_handle: handle,
            names: ['LV_COUNTER'],
          });
          timing(`${mode} abap.get-variables`, vars.ms);
          expect(vars.isError).toBe(false);
          if (i === 0) measure('1', 'LV_COUNTER at the mark', vars.json);
        }

        const overs: number[] = [];
        for (let i = 0; i < repeats; i++) {
          const step = await call(inst, 'DebugStep', {
            state_handle: handle,
            action: 'over',
          });
          timing(`${mode} abap.step-over`, step.ms);
          expect(step.isError).toBe(false);
          expect(step.json?.state).toBe('stopped');
          overs.push(step.json?.at?.address?.line);
        }
        measure('1', 'lines after each step over', overs);
        expect(overs[0]).toBe(LINE.mark + 1);

        const ran = await call(inst, 'DebugStepToLine', {
          state_handle: handle,
          mode: 'run',
          ...line('runto'),
        });
        timing(`${mode} abap.run-to-line`, ran.ms);
        expect(ran.isError).toBe(false);
        expect(ran.json?.at?.address?.line).toBe(LINE.runto);

        const intos: unknown[] = [];
        for (let i = 0; i < repeats; i++) {
          const step = await call(inst, 'DebugStep', {
            state_handle: handle,
            action: 'into',
          });
          timing(`${mode} abap.step-into`, step.ms);
          expect(step.isError).toBe(false);
          intos.push(
            step.json?.state === 'stopped'
              ? `${step.json?.at?.unit}:${step.json?.at?.address?.line}`
              : step.json?.state,
          );
        }
        measure('1', 'unit:line after each step into', intos);

        const toSecond = await call(inst, 'DebugStep', {
          state_handle: handle,
          action: 'continue',
        });
        timing(`${mode} abap.continue(breakpoint→breakpoint)`, toSecond.ms);
        expect(toSecond.isError).toBe(false);
        expect(toSecond.json?.state).toBe('stopped');
        expect(toSecond.json?.at?.address?.line).toBe(LINE.second);

        const toEnd = await call(inst, 'DebugStep', {
          state_handle: handle,
          action: 'continue',
        });
        timing(`${mode} abap.continue(to the end)`, toEnd.ms);
        expect(toEnd.isError).toBe(false);
        expect(toEnd.json?.state).toBe('ended');

        const finished = await waitFor(inst, handle, ['ended']);
        timing(`${mode} abap.wait(run_finished)`, finished.ms);
        measure('1', 'the run as reported', finished.last.json);
        expect(finished.last.json?.reason).toBe('run_finished');
        expect(finished.last.json?.run?.ok).toBe(true);
        expect(String(finished.last.json?.run?.output)).toContain(ABAP_OUTPUT);

        const stop = await call(inst, 'DebugStop', { state_handle: handle });
        timing(`${mode} abap.stop`, stop.ms);
        expect(stop.isError).toBe(false);
        // The handle is invalid for good after a complete stop.
        const after = await call(inst, 'DebugWait', {
          state_handle: handle,
          hold_seconds: 0,
        });
        expect(after.isError).toBe(true);
        expect(after.text).toContain('state is not available');
      });
    },
    getTimeout('long'),
  );

  // --- 1b. the pool's trigger: a stop, then at once a start in a new instance -----------

  it(
    'stop then start at once in a new instance (as a pool does): the start is clean',
    async () => {
      await tester.run(async () => {
        const mode = tester.isHardMode() ? 'hard' : 'soft';
        const rounds: unknown[] = [];
        for (let i = 0; i < 3; i++) {
          const a = newInstance();
          const first = await call(a, 'DebugStartListener', {});
          expect(first.isError).toBe(false);
          // Past the short first poll: the long poll is open when the stop comes.
          await pause(4000);
          const stop = await call(a, 'DebugStop', {
            state_handle: first.json.state_handle,
          });
          timing(`${mode} pool.stop(listening)`, stop.ms);
          expect(stop.isError).toBe(false);
          const b = newInstance();
          const next = await call(b, 'DebugStartListener', {});
          timing(`${mode} pool.start-after-stop`, next.ms);
          rounds.push({
            stop_ms: Math.round(stop.ms),
            next: next.isError ? next.text.slice(0, 400) : next.json?.state,
          });
          expect(next.isError).toBe(false);
          const stopB = await call(b, 'DebugStop', {
            state_handle: next.json.state_handle,
          });
          expect(stopB.isError).toBe(false);
        }
        measure(
          'pool',
          `${mode}: stop, then a new instance starts at once`,
          rounds,
        );
      });
    },
    getTimeout('long'),
  );

  // --- timing baselines ----------------------------------------------------------------

  it(
    'timing baselines: the probe run with no debugger, and caught then released at once',
    async () => {
      await tester.run(async () => {
        softOnly('the baseline runs the probe itself');
        if (!abapReady) throw new Error('the probe is not ready');
        for (let i = 0; i < repeats; i++) {
          const r = await runProbe(probe);
          timing('baseline.run-without-debugger', r.ms);
          expect(r.ok).toBe(true);
          expect(r.output).toContain(ABAP_OUTPUT);
        }
        for (let i = 0; i < repeats; i++) {
          const inst = newInstance();
          const t0 = now();
          const started = await call(inst, 'DebugStartListener', {
            breakpoints: [line('mark')],
            run: { kind: 'class', name: probe },
          });
          expect(started.isError).toBe(false);
          const handle = started.json.state_handle;
          const stopped = await waitFor(inst, handle, ['stopped', 'ended']);
          expect(stopped.last.json?.state).toBe('stopped');
          const caughtAt = now();
          const released = await call(inst, 'DebugStep', {
            state_handle: handle,
            action: 'continue',
          });
          expect(released.json?.state).toBe('ended');
          const finished = await waitFor(inst, handle, ['ended']);
          expect(finished.last.json?.reason).toBe('run_finished');
          timing('baseline.caught-released(start→run_finished)', now() - t0);
          timing(
            'baseline.caught-released(catch→run_finished)',
            now() - caughtAt,
          );
          await call(inst, 'DebugStop', { state_handle: handle });
        }
      });
    },
    getTimeout('long'),
  );

  // --- 2. the listener conflict ----------------------------------------------------------

  it(
    'conflict, refuse: a second instance is refused with the system message; nothing of it stays',
    async () => {
      await tester.run(async () => {
        softOnly('the conflict needs two instances');
        const a = newInstance();
        const b = newInstance();
        const first = await call(a, 'DebugStartListener', {});
        expect(first.isError).toBe(false);
        const handleA = first.json.state_handle;
        const second = await call(b, 'DebugStartListener', {
          breakpoints: [line('mark')],
        });
        measure('2-refuse', 'second instance, other ids, refuse', {
          isError: second.isError,
          text: second.text.slice(0, 600),
          ms: Math.round(second.ms),
        });
        expect(second.isError).toBe(true);
        expect(second.text).toContain('conflictDetected');
        expect(b.state?.holdsState()).toBe(false);
        const stillA = await call(a, 'DebugWait', {
          state_handle: handleA,
          hold_seconds: 3,
        });
        measure(
          '2-refuse',
          'the first instance afterwards',
          stillA.json ?? stillA.text,
        );
        expect(stillA.json?.state).toBe('listening');
        expect(
          (await call(a, 'DebugStop', { state_handle: handleA })).isError,
        ).toBe(false);
      });
    },
    getTimeout('long'),
  );

  it(
    'conflict, take-over: the newcomer listens and the first session reports the displacement',
    async () => {
      await tester.run(async () => {
        softOnly('the conflict needs two instances');
        const a = newInstance();
        const b = newInstance();
        const first = await call(a, 'DebugStartListener', {});
        expect(first.isError).toBe(false);
        const handleA = first.json.state_handle;
        // Past the first instance's short first poll: its long poll is open.
        await pause(5000);
        const t0 = now();
        const taken = await call(b, 'DebugTakeOverListener', {});
        measure('2-takeover', 'second instance, other ids, take-over', {
          isError: taken.isError,
          answer: taken.json ?? taken.text.slice(0, 600),
        });
        expect(taken.isError).toBe(false);
        const displaced = await waitFor(a, handleA, ['idle', 'ended'], 3);
        measure('2-takeover', 'the first instance after the take-over', {
          isError: displaced.last.isError,
          text: displaced.last.text.slice(0, 600),
          ms_since_takeover: Math.round(now() - t0),
        });
        expect(displaced.last.isError).toBe(true);
        expect(displaced.last.text).toContain('conflictNotification');
        const stopB = await call(b, 'DebugStop', {
          state_handle: taken.json.state_handle,
        });
        expect(stopB.isError).toBe(false);
      });
    },
    getTimeout('long'),
  );

  // --- 3. stated ids, reconciliation -------------------------------------------------------

  it(
    'stated ids: a successor with the same ids starts without a conflict and stops what was left',
    async () => {
      await tester.run(async () => {
        softOnly('the predecessor is the test’s own listener');
        const ids = {
          terminalId: newDebuggerId(),
          ideId: newDebuggerId(),
          stated: true,
        };
        // What a killed predecessor leaves: one open poll under these ids that
        // nobody re-polls (a live instance would re-poll after being stopped,
        // and two pollers under one pair of ids leave an older poll that no
        // stop reaches — measured on the first run of this suite).
        const left = await rawListener(ids);
        try {
          await pause(5000);
          const b = newInstance(ids);
          const startedAt = now();
          const second = await call(b, 'DebugStartListener', {});
          measure('3', 'successor under the same stated ids', {
            isError: second.isError,
            answer: second.json ?? second.text.slice(0, 600),
          });
          expect(second.isError).toBe(false);
          const ended = await Promise.race([
            left.poll,
            pause(70_000).then(() => undefined),
          ]);
          measure('3', 'the predecessor’s poll', {
            ended: ended !== undefined,
            status: ended?.status,
            body: ended?.body.slice(0, 400),
            ms_after_successor_start: ended
              ? Math.round(ended.at - startedAt)
              : undefined,
          });
          expect(ended?.status).toBe('ok');
          expect(Math.round((ended?.at ?? Infinity) - startedAt)).toBeLessThan(
            30_000,
          );
          const stopB = await call(b, 'DebugStop', {
            state_handle: second.json.state_handle,
          });
          expect(stopB.isError).toBe(false);
        } finally {
          await left.close();
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'stated ids, measured: an IDE-like listener under the same ideId — does its poll end when an instance starts?',
    async () => {
      await tester.run(async () => {
        softOnly('the IDE-like listener is the test’s own');
        const ideId = newDebuggerId();
        const raw = await rawListener({ terminalId: newDebuggerId(), ideId });
        try {
          await pause(5000);
          const inst = newInstance({
            terminalId: newDebuggerId(),
            ideId,
            stated: true,
          });
          const startedAt = now();
          const started = await call(inst, 'DebugStartListener', {});
          measure('3-ide', 'instance under the IDE-like listener’s ideId', {
            isError: started.isError,
            answer: started.json ?? started.text.slice(0, 600),
          });
          expect(started.isError).toBe(false);
          const ended = await Promise.race([
            raw.poll,
            pause(70_000).then(() => undefined),
          ]);
          measure('3-ide', 'the IDE-like poll', {
            ended: ended !== undefined,
            status: ended?.status,
            body: ended?.body.slice(0, 400),
            ms_after_instance_start: ended
              ? Math.round(ended.at - startedAt)
              : undefined,
            ms_after_its_own_start: ended
              ? Math.round(ended.at - raw.started)
              : undefined,
          });
          await call(inst, 'DebugStop', {
            state_handle: started.json.state_handle,
          });
        } finally {
          await raw.close();
        }
      });
    },
    getTimeout('long'),
  );

  // --- 4. breakpoint semantics: does a line breakpoint catch a second time? --------------

  it(
    'breakpoint semantics, measured: a second run of the probe — caught again, and after a re-arm',
    async () => {
      await tester.run(async () => {
        softOnly('the second run is the test’s own');
        const inst = newInstance();
        const started = await call(inst, 'DebugStartListener', {
          breakpoints: [line('mark')],
          run: { kind: 'class', name: probe },
        });
        expect(started.isError).toBe(false);
        const handle = started.json.state_handle;
        const first = await waitFor(inst, handle, ['stopped', 'ended']);
        expect(first.last.json?.state).toBe('stopped');
        const released = await call(inst, 'DebugStep', {
          state_handle: handle,
          action: 'continue',
        });
        expect(released.json?.state).toBe('ended');
        const finished = await waitFor(inst, handle, ['ended']);
        expect(finished.last.json?.reason).toBe('run_finished');

        const runAgain = async (label: string) => {
          let settled = false;
          const run = runProbe(probe).finally(() => {
            settled = true;
          });
          let caught = false;
          let lastWait: Answer | undefined;
          // Short waits, so the run's own end is seen as soon as it comes.
          for (let i = 0; i < 12 && !settled && !caught; i++) {
            lastWait = await call(inst, 'DebugWait', {
              state_handle: handle,
              hold_seconds: 5,
            });
            caught = lastWait.json?.state === 'stopped';
            if (lastWait.isError) break;
          }
          if (caught)
            await call(inst, 'DebugStep', {
              state_handle: handle,
              action: 'continue',
            });
          const r = await run;
          const after = await call(inst, 'DebugWait', {
            state_handle: handle,
            hold_seconds: 1,
          });
          measure('4', label, {
            caught,
            last_wait:
              lastWait?.json ?? lastWait?.text ?? 'none: the run ended first',
            run: { ok: r.ok, ms: Math.round(r.ms) },
            session_after: after.json ?? after.text.slice(0, 300),
          });
          return caught;
        };

        const second = await runAgain(
          'second run, same breakpoint, listener polling',
        );
        if (!second) {
          const rearmed = await call(inst, 'DebugSetBreakpoints', {
            state_handle: handle,
            breakpoints: [line('mark')],
          });
          measure(
            '4',
            're-arm the same line',
            rearmed.json ?? rearmed.text.slice(0, 400),
          );
          await runAgain('third run, after the re-arm');
        }
        const listed = await call(inst, 'DebugStop', { state_handle: handle });
        expect(listed.isError).toBe(false);
      });
    },
    getTimeout('long'),
  );

  // --- 5. memory --------------------------------------------------------------------------

  it(
    'memory: sizes and a snapshot at a stop, then the snapshot list',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        softOnly('covered by the soft run');
        const inst = newInstance();
        const started = await call(inst, 'DebugStartListener', {
          breakpoints: [line('mark')],
          run: { kind: 'class', name: probe },
        });
        expect(started.isError).toBe(false);
        const handle = started.json.state_handle;
        const stopped = await waitFor(inst, handle, ['stopped', 'ended']);
        expect(stopped.last.json?.state).toBe('stopped');
        const sizes = await call(inst, 'DebugGetMemorySizes', {
          state_handle: handle,
        });
        timing('soft memory.sizes', sizes.ms);
        measure('5', 'memory sizes', sizes.isError ? sizes.text : sizes.json);
        expect(sizes.isError).toBe(false);
        const snap = await call(inst, 'DebugCreateMemorySnapshot', {
          state_handle: handle,
        });
        timing('soft memory.create-snapshot', snap.ms);
        measure('5', 'create a snapshot', snap.isError ? snap.text : snap.json);
        expect(snap.isError).toBe(false);
        const list = await call(inst, 'MemorySnapshotList', {});
        timing('soft memory.list', list.ms);
        measure('5', 'snapshot list', list.isError ? list.text : list.json);
        expect(list.isError).toBe(false);
        const stop = await call(inst, 'DebugStop', { state_handle: handle });
        expect(stop.isError).toBe(false);
      });
    },
    getTimeout('long'),
  );

  // --- 7 and 6. the AMDP chain, and whether a stop ends the open event read --------------

  it(
    'AMDP chain: start, break, steps, table, continue to the end; then a stop ends the event read',
    async () => {
      await tester.run(async () => {
        softOnly('the AMDP probe is created in the soft run');
        if (amdpReady) throw new Error(`SKIP: ${amdpReady}`);
        const inst = newInstance();
        const events: any[] = [];
        const until = async (handle: string, kinds: string[], rounds = 8) => {
          const t0 = now();
          for (let i = 0; i < rounds; i++) {
            const a = await call(inst, 'AmdpDebugWait', {
              state_handle: handle,
              hold_seconds: 30,
            });
            if (a.isError) return { error: a.text, ms: now() - t0 };
            if (a.json?.state === 'ended')
              return { ended: a.json, ms: now() - t0 };
            const batch: any[] = a.json?.events ?? [];
            events.push(...batch);
            const hit = batch.find((e) => kinds.includes(e.kind));
            if (hit) return { hit, ms: now() - t0 };
          }
          return { ms: now() - t0 };
        };

        const started = await call(inst, 'AmdpDebugStart', {
          stop_existing: true,
          breakpoints: [
            { class_name: amdpClass, line: AMDP_LINE.loop },
            { class_name: amdpClass, line: AMDP_LINE.tf },
          ],
          run: { kind: 'class', name: amdpClass },
        });
        timing('soft amdp.start(sync+run)', started.ms);
        measure(
          '7',
          'AMDP start (states after SYNC_BREAKPOINTS)',
          started.json ?? started.text.slice(0, 600),
        );
        expect(started.isError).toBe(false);
        const handle = started.json.state_handle;

        const first = await until(handle, ['ON_BREAK']);
        timing('soft amdp.wait-until-break(run→break)', first.ms);
        measure('7', 'first break', first.hit ?? first);
        expect(first.hit?.line).toBe(AMDP_LINE.loop);

        const overs: unknown[] = [];
        for (let i = 0; i < repeats; i++) {
          const step = await call(inst, 'AmdpDebugStep', {
            state_handle: handle,
            action: 'over',
          });
          timing('soft amdp.step-over(call)', step.ms);
          expect(step.isError).toBe(false);
          const next = await until(handle, ['ON_BREAK', 'ON_EXECUTION_END']);
          timing('soft amdp.step-over(call→next break)', step.ms + next.ms);
          overs.push(
            next.hit ? `${next.hit.kind}:${next.hit.line ?? ''}` : next,
          );
          if (next.hit?.kind !== 'ON_BREAK') break;
        }
        measure('7', 'after each step over', overs);

        // Continue from break to break. An ON_EXECUTION_END ends one debuggee; the table
        // function is a debuggee of its own, so after an end the next break is waited for,
        // not continued from. At the table function's second break its table holds a row.
        let table: Answer | undefined;
        let tfHits = 0;
        let finished: any;
        let executionEnds = 0;
        let atBreak = true; // the step-overs left the procedure at a break
        for (let i = 0; i < 24 && !finished; i++) {
          let goMs = 0;
          if (atBreak) {
            const go = await call(inst, 'AmdpDebugStep', {
              state_handle: handle,
              action: 'continue',
            });
            if (go.isError) {
              measure('7', 'continue refused', go.text.slice(0, 300));
              break;
            }
            goMs = go.ms;
            atBreak = false;
          }
          const t0 = now();
          const a = await call(inst, 'AmdpDebugWait', {
            state_handle: handle,
            hold_seconds: 30,
          });
          if (a.isError) {
            measure('7', 'wait failed', a.text.slice(0, 300));
            break;
          }
          if (a.json?.state === 'ended') {
            finished = a.json;
            timing('soft amdp.wait(run_finished)', goMs + now() - t0);
            break;
          }
          const batch: any[] = a.json?.events ?? [];
          events.push(...batch);
          for (const e of batch) {
            if (e.kind === 'ON_EXECUTION_END') {
              executionEnds++;
              timing('soft amdp.continue→ON_EXECUTION_END', goMs + now() - t0);
              measure('7', `ON_EXECUTION_END #${executionEnds}`, e);
            }
            if (e.kind === 'ON_BREAK') {
              atBreak = true;
              timing('soft amdp.continue→ON_BREAK', goMs + now() - t0);
              if (e.line === AMDP_LINE.tf) {
                tfHits++;
                if (tfHits === 1)
                  measure('7', 'first break in the table function', e);
              }
            }
          }
          if (atBreak && tfHits === 2 && !table) {
            table = await call(inst, 'AmdpDebugGetTable', {
              state_handle: handle,
              variable: 'LT_ROWS',
            });
            timing('soft amdp.get-table', table.ms);
          }
        }
        measure(
          '7',
          'table variable at the table function',
          table ? (table.json ?? table.text.slice(0, 600)) : 'not reached',
        );
        expect(table?.isError).toBe(false);
        measure('7', 'the run as reported', finished);
        expect(finished?.reason).toBe('run_finished');
        expect(String(finished?.run?.output)).toContain(AMDP_OUTPUT);
        measure(
          '7',
          'event kinds seen',
          events.map((e) => e.kind),
        );

        // 6: does SAP end the open event read when the session is stopped?
        const dbg = inst.debugger();
        if (!dbg) throw new Error('the AMDP session has no debugger');
        const amdp = dbg.amdp;
        expect(amdp.holdsState()).toBe(true);
        const stopAt = now();
        const stop = await call(inst, 'AmdpDebugStop', {
          state_handle: handle,
        });
        timing('soft amdp.stop', stop.ms);
        expect(stop.isError).toBe(false);
        const bound = getTimeout('long') - 60_000;
        while (amdp.holdsState() && now() - stopAt < bound) await pause(250);
        measure('6', 'the event read after AmdpDebugStop', {
          ended: !amdp.holdsState(),
          ms_after_stop: Math.round(now() - stopAt),
          failures: amdp.failures(),
        });
        expect(amdp.holdsState()).toBe(false);
      });
    },
    getTimeout('long'),
  );
});

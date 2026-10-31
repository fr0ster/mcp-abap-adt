/**
 * Integration tests for the debugger handlers against a live system.
 *
 * The test creates its ABAP probe — a class run as a console application —
 * in the package the test case names, with no transport, and deletes it
 * after the run. The AMDP cases only read and run the shared AMDP pair
 * (`shared_dependencies`: the class `ZMCP_SHR_DBG_AMDP` with a SQLScript
 * table function, its DDL source `ZMCP_SHR_DBG_TF`; created once by
 * `npm run shared:setup`, never deleted); the AMDP chain skips only where
 * SAP's system information names a database system other than HANA. Every case builds its own instance state with a debugger attached,
 * the way a server instance does, and disposes it afterwards.
 *
 * Besides the checks, the cases MEASURE what SAP does where the design leans
 * on it: the listener conflict in both modes, the reconciliation of stated
 * ids, whether a line breakpoint catches a second time, and whether stopping
 * an AMDP session ends its open event read. Each measurement is one line
 * `MEASURE <case> | <asked> | <answered>`, and each timed call one line
 * `TIMING <step> <ms>`, on stderr. Times are measured, never asserted.
 *
 * Hard mode (`integration_hard_mode.enabled: true`; core serves `debug`
 * always) runs the ABAP chain through the MCP server — stdio, or Streamable
 * HTTP where every call is its own request carrying `state_handle`. The cases
 * that drive SAP or the instance directly skip there.
 *
 * Nothing else may debug for the same SAP user while this runs.
 */

import * as fs from 'node:fs';
import {
  AbapDebugger,
  AdtExecutor,
  type IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import * as dotenv from 'dotenv';
import { resolveEnvFilePath } from '../../../../server-runtime/src/stdio/config/envResolver';
import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../handlers/class/high/handleDeleteClass';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
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
import { handleDebugSetSettings } from '../../../handlers/debugger/debug/handleDebugSetSettings';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStep } from '../../../handlers/debugger/debug/handleDebugStep';
import { handleDebugStepToLine } from '../../../handlers/debugger/debug/handleDebugStepToLine';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import { handleDebugTakeOverListener } from '../../../handlers/debugger/debug/handleDebugTakeOverListener';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
import { handleMemorySnapshotList } from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import {
  createDebuggerInstance,
  DebuggerInstance,
} from '../../../lib/debugger/DebuggerInstance';
import {
  DEBUGGEE_KEPT_WORDS,
  type Debugger,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import {
  newDebuggerId,
  resolveBreakpointConflict,
} from '../../../lib/debugger/ids';
import { liveAmdpPorts, liveDebugPorts } from '../../../lib/debugger/ports';
import { openFreshConnection } from '../../../lib/packageSessions';
import { readSystemInformation } from '../../../lib/systemInformation';

/** The SAP user a connection's session belongs to, as the system names it. */
async function requestUserOf(connection: IAbapConnection): Promise<string> {
  const { user } = await readSystemInformation(connection);
  if (user === undefined) throw new Error('the system named no user');
  return user.trim().toUpperCase();
}

import {
  InstanceState,
  stderrStateLogger,
} from '../../../lib/state/InstanceState';
import { ourClassExecutor } from '../../../lib/strategies/resultSets';
import { amdpGateVerdict, type FixtureRead } from '../helpers/amdpFixture';
import {
  getSharedDependenciesConfig,
  getSystemType,
  getTimeout,
  isTestAvailableForSystem,
  loadTestConfig,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { logOffLeft, ownedNow } from '../helpers/debuggerCleanup';
import { createTestLogger } from '../helpers/loggerHelpers';
import { endTestConnection } from '../helpers/openConnections';
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
    DATA lv_pass TYPE i.
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
    DO 2 TIMES.
      lv_pass = lv_pass + 1. "BP:loop
    ENDDO.
  ENDMETHOD.

  METHOD add.
    rv = iv + 1.
  ENDMETHOD.
ENDCLASS.
`;
}
const ABAP_OUTPUT = 'counter 15';

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
  DebugSetSettings: handleDebugSetSettings,
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
  GetClass: handleGetClass,
  GetDdl: handleGetDdl,
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
  let abapReady = false;
  let connection: IAbapConnection;
  let secondUserEnv = '';

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

  /**
   * An instance whose debugger clients carry a test-only fault seam: while
   * armed, the next `stopListener` and the next `deleteBreakpoint` each fail
   * once, synthesized here — nothing is sent, so the system's state is the
   * one the session left. `stepContinue` sent while recording is counted:
   * a release the stop must not send. Soft mode only: the seam is in process.
   */
  const faultedInstance = (): Instance & {
    fault: {
      stopListener: number;
      deleteBreakpoint: number;
      continues: number;
      recording: boolean;
    };
  } => {
    const state = new InstanceState({ logger: stderrStateLogger });
    instances.push(state);
    const fault = {
      stopListener: 0,
      deleteBreakpoint: 0,
      continues: 0,
      recording: false,
    };
    const refused = (what: string) =>
      new Error(`test seam: ${what} refused locally, nothing sent`);
    const live = liveDebugPorts();
    const ports: typeof live = {
      ...live,
      abapDebugger(connection, onConflict) {
        const dbg = live.abapDebugger(connection, onConflict);
        const stopListener = dbg.stopListener.bind(dbg);
        const deleteBreakpoint = dbg.deleteBreakpoint.bind(dbg);
        const step = dbg.step.bind(dbg);
        dbg.stopListener = ((...args: Parameters<typeof stopListener>) => {
          if (fault.stopListener > 0) {
            fault.stopListener--;
            return Promise.reject(refused('stopListener'));
          }
          return stopListener(...args);
        }) as typeof dbg.stopListener;
        dbg.deleteBreakpoint = ((
          ...args: Parameters<typeof deleteBreakpoint>
        ) => {
          if (fault.deleteBreakpoint > 0) {
            fault.deleteBreakpoint--;
            return Promise.reject(refused('deleteBreakpoint'));
          }
          return deleteBreakpoint(...args);
        }) as typeof dbg.deleteBreakpoint;
        dbg.step = ((...args: Parameters<typeof step>) => {
          if (fault.recording && args[0] === 'stepContinue') fault.continues++;
          return step(...args);
        }) as typeof dbg.step;
        return dbg;
      },
    };
    let dbg: DebuggerInstance | undefined;
    const ctx: HandlerContext = {
      ...createHandlerContext({ connection, logger }),
      state,
      debugger: () => {
        if (!dbg) {
          dbg = new DebuggerInstance({
            abap: new DebugSession(
              ports,
              {
                terminalId: newDebuggerId(),
                ideId: newDebuggerId(),
                stated: false,
              },
              { breakpointConflict: resolveBreakpointConflict() },
            ),
            amdp: new AmdpSession(liveAmdpPorts()),
          });
          state.attach(dbg);
        }
        return dbg;
      },
    };
    return { state, ctx, debugger: () => dbg, fault };
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
      await endTestConnection(conn);
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
    const dbg = AbapDebugger.create(conn, {
      onConflict: 'refuse' as IDebuggerListenerConflict,
    }) as unknown as Debugger;
    const requestUser = await requestUserOf(connection);
    const started = now();
    const poll = dbg
      .listen(
        { debuggingMode: 'user', requestUser, ...ids },
        { holdSeconds: 60 },
      )
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
        await endTestConnection(conn);
      },
    };
  };

  /** DebugWait until the background run reports its end; an error answer is no end. */
  const untilRunFinished = async (inst: Instance, handle: string) => {
    const seen: unknown[] = [];
    for (let i = 0; i < 8; i++) {
      const a = await call(inst, 'DebugWait', {
        state_handle: handle,
        hold_seconds: 30,
      });
      if (a.isError)
        throw new Error(
          `DebugWait failed before the run's end: ${withoutHandles(a.text.slice(0, 600))}`,
        );
      seen.push(a.json);
      if (a.json?.reason === 'run_finished') return a;
    }
    throw new Error(
      `the run did not report its end: ${withoutHandles(JSON.stringify(seen))}`,
    );
  };

  /** A connection as the user a session .env names (basic authentication). */
  const connectionAs = async (envName: string) => {
    const file = resolveEnvFilePath({
      envDestination: envName,
      authBrokerPath: testAuthBrokerPath(loadTestConfig()),
    });
    if (!file || !fs.existsSync(file))
      throw new Error(`second_user_env: no session .env named ${envName}`);
    const env = dotenv.parse(fs.readFileSync(file, 'utf8'));
    // Names only: the values never reach a message or a log.
    const missing = ['SAP_URL', 'SAP_USERNAME', 'SAP_PASSWORD'].filter(
      (key) => !env[key]?.trim(),
    );
    if (missing.length)
      throw new Error(
        `second_user_env: ${envName} lacks ${missing.join(', ')} (basic authentication is required)`,
      );
    const settings: SapConfig = {
      url: String(env.SAP_URL).replace(/\/$/, ''),
      authType: 'basic',
      username: env.SAP_USERNAME,
      password: env.SAP_PASSWORD,
      ...(env.SAP_CLIENT ? { client: env.SAP_CLIENT.trim() } : {}),
    };
    const conn = createAbapConnection(
      settings,
      credentialFromSapConfig(settings),
      null,
    ) as IAbapConnection & { connect?: () => Promise<void> };
    if (typeof conn.connect === 'function') await conn.connect();
    return {
      connection: conn as IAbapConnection,
      close: async () => {
        await endTestConnection(conn);
      },
    };
  };

  /** Runs the probe on the connection given (another user's), with no debugger of ours. */
  const runOn = async (conn: IAbapConnection, name: string) => {
    const answer = await new AdtExecutor(conn)
      .getClassExecutor(ourClassExecutor)
      .run({ className: name }, { analyse: analyseException });
    return answer.ok
      ? { ok: true, output: String(answer.getResult().value ?? '') }
      : { ok: false, output: answer.getError().message };
  };

  /**
   * The session a case started, stopped whatever happens: the case's own stop
   * clears it, and `cleanup` (in the case's finally) stops what is still held,
   * so a failed case leaves no listener or breakpoints at the system, in hard
   * mode too. The cleanup never throws: the case's own failure stays the one reported.
   */
  const caseSession = (inst: Instance) => {
    let handle: string | undefined;
    return {
      hold(answer: Answer) {
        // A failed start that still holds state answers its handle in a later block.
        const h =
          answer.json?.state_handle ??
          /"state_handle"\s*:\s*"([^"]+)"/.exec(answer.text)?.[1];
        if (typeof h === 'string' && h) handle = h;
        return { state_handle: String(h ?? '') };
      },
      async stop(): Promise<Answer> {
        const a = await call(inst, 'DebugStop', { state_handle: handle });
        if (!a.isError) handle = undefined;
        return a;
      },
      async cleanup(): Promise<void> {
        if (!handle) return;
        const h = handle;
        handle = undefined;
        try {
          const a = await call(inst, 'DebugStop', { state_handle: h });
          if (a.isError)
            measure(
              'cleanup',
              'DebugStop after a failed case',
              a.text.slice(0, 300),
            );
        } catch (e) {
          measure('cleanup', 'DebugStop after a failed case threw', String(e));
        }
      },
    };
  };

  /** A run in flight whose rejection is always handled; `settled` waits for it without throwing. */
  const inFlight = <T>(run: Promise<T>) => {
    run.catch(() => undefined);
    return { run, settled: () => Promise.allSettled([run]) };
  };

  type RunInFlight = ReturnType<
    typeof inFlight<{ ok: boolean; output: string }>
  >;

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
        // The case's systems decide before anything is created: each test
        // skips on a system its available_in leaves out, so the probe would
        // be written for nothing (and on a system that cannot take it, fail).
        if (!isTestAvailableForSystem(context.testCase?.available_in)) return;
        connection = context.connection as unknown as IAbapConnection;
        const p = context.params ?? {};
        probe = String(p.probe_class ?? '').toUpperCase();
        amdpClass = String(p.amdp_class ?? 'ZMCP_SHR_DBG_AMDP').toUpperCase();
        amdpDdl = String(p.amdp_ddl ?? 'ZMCP_SHR_DBG_TF').toUpperCase();
        // The probe's package: the case's own, else the shared package
        // (shared_dependencies.package), which the shared-objects setup
        // creates on every system and which, as the template configures it,
        // records no changes, so the probe needs no transport. $TMP is
        // refused on ABAP Cloud (403 ExceptionResourceNoAccess, measured).
        pkg = String(p.package ?? getSharedDependenciesConfig()?.package ?? '');
        transport = p.transport ? String(p.transport) : undefined;
        repeats = Number(p.timing_repeats) > 0 ? Number(p.timing_repeats) : 5;
        secondUserEnv = String(p.second_user_env ?? '');
        if (!probe || !pkg)
          throw new Error(
            'probe_class and package (or shared_dependencies.package) are required',
          );
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
          const first = await call(a, 'DebugStartListener', {
            breakpoints: [line('mark')],
          });
          expect(first.isError).toBe(false);
          // Past the short first poll: the long poll is open when the stop comes.
          await pause(4000);
          const stop = await call(a, 'DebugStop', {
            state_handle: first.json.state_handle,
          });
          timing(`${mode} pool.stop(listening)`, stop.ms);
          expect(stop.isError).toBe(false);
          const b = newInstance();
          const next = await call(b, 'DebugStartListener', {
            breakpoints: [line('mark')],
          });
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
    'conflict, refuse: a second instance is refused before any change, named as another debugger; nothing of it stays',
    async () => {
      await tester.run(async () => {
        softOnly('the conflict needs two instances');
        const a = newInstance();
        const b = newInstance();
        const first = await call(a, 'DebugStartListener', {
          breakpoints: [line('mark')],
        });
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
        // The refusal comes from the listener check before any change. The
        // answer is the method's error as it came — SAP's conflict, whose
        // document names the other debugger — plus the step where it arose.
        const refused = JSON.parse(second.text);
        expect(refused.step).toBe('check listener');
        expect(refused.status).toBe(409);
        expect(String(refused.raw_body)).toContain('conflictText');
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
        const first = await call(a, 'DebugStartListener', {
          breakpoints: [line('mark')],
        });
        expect(first.isError).toBe(false);
        const handleA = first.json.state_handle;
        // Past the first instance's short first poll: its long poll is open.
        await pause(5000);
        const t0 = now();
        const taken = await call(b, 'DebugTakeOverListener', {
          breakpoints: [line('mark')],
        });
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
          const second = await call(b, 'DebugStartListener', {
            breakpoints: [line('mark')],
          });
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
          const started = await call(inst, 'DebugStartListener', {
            breakpoints: [line('mark')],
          });
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

  // --- 5b. the breakpoint set across changes, another user, leaving a debuggee running,
  // the settings, terminal mode -------------------------------------------------------------

  it(
    'the breakpoint set: two DebugSetBreakpoints in a row, and the run stops at both; every answer row pairs by its clientId',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        softOnly('the run is the test’s own');
        const inst = newInstance();
        const session = caseSession(inst);
        let ran: RunInFlight | undefined;
        try {
          const start = await call(inst, 'DebugStartListener', {
            breakpoints: [line('mark')],
          });
          const h = session.hold(start);
          expect(start.isError).toBe(false);
          /** What the session paired: placed lines, refused lines with reasons, lost, unexpected. */
          const paired = (a: { json: any }) => ({
            placed: a.json.placed.map((r: any) => String(r.uri).split('#')[1]),
            refused: a.json.refused.map(
              (r: any) =>
                `${String(r.requested.uri).split('#')[1]}: ${r.error ?? ''}`,
            ),
            lost: a.json.lost.length,
            unexpected: a.json.unexpected,
          });
          const second = await call(inst, 'DebugSetBreakpoints', {
            ...h,
            breakpoints: [line('second')],
          });
          expect(second.isError).toBe(false);
          measure(
            'breakpoint answer',
            'held: mark; sent: second (both placeable)',
            paired(second),
          );
          expect(second.json.placed).toHaveLength(2);
          expect(second.json.refused).toEqual([]);
          expect(second.json.lost).toEqual([]);
          expect(second.json.unexpected).toEqual([]);
          // A refusal among the rows: a class's first line takes no breakpoint. The system
          // answers it first (measured on premise (2026-10-11), BASIS 816); the tag pairs it.
          const withRefusal = await call(inst, 'DebugSetBreakpoints', {
            ...h,
            breakpoints: [{ object_type: 'CLAS', object_name: probe, line: 1 }],
          });
          expect(withRefusal.isError).toBe(false);
          measure(
            'breakpoint answer',
            'held: mark, second; sent: line 1',
            paired(withRefusal),
          );
          expect(withRefusal.json.placed).toHaveLength(2);
          expect(withRefusal.json.refused).toHaveLength(1);
          expect(withRefusal.json.refused[0].requested.uri).toMatch(
            /#start=1$/,
          );
          expect(withRefusal.json.lost).toEqual([]);
          expect(withRefusal.json.unexpected).toEqual([]);
          ran = inFlight(runProbe(probe));
          const atMark = await waitFor(inst, h.state_handle, ['stopped']);
          expect(atMark.last.json?.state).toBe('stopped');
          expect(atMark.last.json.at.address.line).toBe(LINE.mark);
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
              .isError,
          ).toBe(false);
          const atSecond = await waitFor(inst, h.state_handle, ['stopped']);
          measure(
            'breakpoint set',
            'the second stop',
            atSecond.last.json?.at?.address,
          );
          expect(atSecond.last.json?.state).toBe('stopped');
          expect(atSecond.last.json.at.address.line).toBe(LINE.second);
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
              .isError,
          ).toBe(false);
          expect(await ran.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
          expect((await session.stop()).isError).toBe(false);
        } finally {
          await session.cleanup();
          await ran?.settled();
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'another user: a listener for a second configured user catches that user’s run; stepped and continued',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        if (!secondUserEnv)
          throw new Error('SKIP: no second user configured (second_user_env)');
        const other = await connectionAs(secondUserEnv);
        const inst = newInstance();
        const session = caseSession(inst);
        let ran: RunInFlight | undefined;
        try {
          const otherUser = (
            await requestUserOf(other.connection)
          ).toUpperCase();
          const start = await call(inst, 'DebugStartListener', {
            request_user: otherUser,
            breakpoints: [line('mark')],
          });
          const h = session.hold(start);
          measure(
            'another user',
            'start',
            start.isError ? start.text.slice(0, 400) : start.json?.state,
          );
          expect(start.isError).toBe(false);
          expect(start.json.request_user).toBe(otherUser);
          ran = inFlight(runOn(other.connection, probe));
          const caught = await waitFor(inst, h.state_handle, ['stopped']);
          expect(caught.last.json?.state).toBe('stopped');
          expect(caught.last.json.at.address.line).toBe(LINE.mark);
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'over' })).isError,
          ).toBe(false);
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
              .isError,
          ).toBe(false);
          expect(await ran.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
          expect((await session.stop()).isError).toBe(false);
        } finally {
          // The stop releases a held run first; the run settles before its connection closes.
          await session.cleanup();
          await ran?.settled();
          await other.close();
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'detach: the run goes on to its end, the listener and the breakpoints stay and catch the next run',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        const inst = newInstance();
        const session = caseSession(inst);
        let next: RunInFlight | undefined;
        try {
          const start = await call(inst, 'DebugStartListener', {
            breakpoints: [line('loop')],
            run: { kind: 'class', name: probe },
          });
          const h = session.hold(start);
          expect(start.isError).toBe(false);
          const pass1 =
            start.json.state === 'stopped'
              ? start
              : (await waitFor(inst, h.state_handle, ['stopped'])).last;
          expect(pass1.json.at.address.line).toBe(LINE.loop);
          const detached = await call(inst, 'DebugStep', {
            ...h,
            action: 'detach',
          });
          measure(
            'detach',
            'answer',
            detached.isError ? detached.text.slice(0, 400) : detached.json,
          );
          expect(detached.isError).toBe(false);
          // Measured on premise (2026-10-12): the same run is not caught again at the
          // loop's next pass — the system answers the detach as the run ends, so the
          // answer is listening, or the run's end when it was reported first.
          const finished =
            detached.json.reason === 'run_finished'
              ? detached
              : (expect(detached.json.state).toBe('listening'),
                await untilRunFinished(inst, h.state_handle));
          measure('detach', 'the run after the detach', finished.json?.run);
          expect(finished.json?.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
          // The listener and the breakpoints stay: the next run is caught (soft only:
          // a hard run has no connection of its own to start it).
          if (!tester.isHardMode()) {
            next = inFlight(runProbe(probe));
            const caught = await waitFor(inst, h.state_handle, ['stopped']);
            expect(caught.last.json?.state).toBe('stopped');
            expect(caught.last.json.at.address.line).toBe(LINE.loop);
            // Detached again, the loop's second pass is not caught either.
            expect(
              (await call(inst, 'DebugStep', { ...h, action: 'detach' }))
                .isError,
            ).toBe(false);
            expect((await next.run).ok).toBe(true);
          }
          expect((await session.stop()).isError).toBe(false);
        } finally {
          await session.cleanup();
          await next?.settled();
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'release_debugger: the run finishes, the answer is no failure, and the listener catches the next run',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        const inst = newInstance();
        const session = caseSession(inst);
        let next: RunInFlight | undefined;
        try {
          const start = await call(inst, 'DebugStartListener', {
            breakpoints: [line('mark')],
            run: { kind: 'class', name: probe },
          });
          const h = session.hold(start);
          expect(start.isError).toBe(false);
          if (start.json.state !== 'stopped')
            expect(
              (await waitFor(inst, h.state_handle, ['stopped'])).last.json
                ?.state,
            ).toBe('stopped');
          const released = await call(inst, 'DebugStep', {
            ...h,
            action: 'release_debugger',
          });
          measure(
            'release_debugger',
            'answer',
            released.isError ? released.text.slice(0, 400) : released.json,
          );
          expect(released.isError).toBe(false);
          // Listening, or the run's end when the program finished before the answer
          // (measured on premise, 2026-10-12).
          const finished =
            released.json.reason === 'run_finished'
              ? released
              : (expect(released.json.state).toBe('listening'),
                await untilRunFinished(inst, h.state_handle));
          expect(finished.json?.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
          // The next run is the test's own: a hard run has no connection of its own to start it.
          if (!tester.isHardMode()) {
            next = inFlight(runProbe(probe));
            const caught = await waitFor(inst, h.state_handle, ['stopped']);
            expect(caught.last.json?.state).toBe('stopped');
            expect(
              (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
                .isError,
            ).toBe(false);
            expect((await next.run).ok).toBe(true);
          }
          expect((await session.stop()).isError).toBe(false);
        } finally {
          await session.cleanup();
          await next?.settled();
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'settings: at the start and through DebugSetSettings, the settings in force recorded after each',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        const inst = newInstance();
        const session = caseSession(inst);
        try {
          const start = await call(inst, 'DebugStartListener', {
            breakpoints: [line('mark')],
            settings: { system_debugging: true, create_exception_object: true },
            run: { kind: 'class', name: probe },
          });
          const h = session.hold(start);
          expect(start.isError).toBe(false);
          const stopped =
            start.json.state === 'stopped'
              ? start
              : (await waitFor(inst, h.state_handle, ['stopped'])).last;
          measure(
            'settings',
            'after the attach: system_debugging, create_exception_object',
            stopped.json?.settings ?? stopped.json?.settings_error,
          );
          // ABAP Cloud does not apply create_exception_object: asked for `true`,
          // its answer — the settings in force — says `false`, at the start and
          // through DebugSetSettings alike (measured on the trial, 2026-10-12).
          // On premise it is applied.
          const exceptionObject = getSystemType() !== 'cloud';
          expect(stopped.json.settings).toMatchObject({
            system_debugging: true,
            create_exception_object: exceptionObject,
          });
          const off = await call(inst, 'DebugSetSettings', {
            ...h,
            system_debugging: false,
          });
          measure(
            'settings',
            'DebugSetSettings system_debugging false',
            off.isError ? off.text.slice(0, 300) : off.json,
          );
          expect(off.isError).toBe(false);
          expect(off.json).toMatchObject({
            system_debugging: false,
            create_exception_object: exceptionObject,
          });
          const update = await call(inst, 'DebugSetSettings', {
            ...h,
            update_debugging: true,
          });
          measure(
            'settings',
            'DebugSetSettings update_debugging true',
            update.isError ? update.text.slice(0, 300) : update.json,
          );
          expect(update.isError).toBe(false);
          expect(update.json).toMatchObject({
            update_debugging: true,
            system_debugging: false,
          });
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
              .isError,
          ).toBe(false);
          const finished = await untilRunFinished(inst, h.state_handle);
          expect(finished.json?.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
          expect((await session.stop()).isError).toBe(false);
        } finally {
          await session.cleanup();
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'terminal mode: our own run carries the session’s ids and is caught',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        // Random ids, none configured: the run carries them in its SAP-PASSPORT.
        const inst = newInstance();
        const session = caseSession(inst);
        try {
          const start = await call(inst, 'DebugStartListener', {
            debugging_mode: 'terminal',
            breakpoints: [line('mark')],
            run: { kind: 'class', name: probe },
          });
          const h = session.hold(start);
          measure(
            'terminal',
            'start',
            start.isError ? start.text.slice(0, 400) : start.json?.state,
          );
          expect(start.isError).toBe(false);
          expect(start.json.debugging_mode).toBe('terminal');
          const caught =
            start.json.state === 'stopped'
              ? start
              : (await waitFor(inst, h.state_handle, ['stopped', 'ended']))
                  .last;
          measure(
            'terminal',
            'the catch',
            caught.json?.at?.address ??
              caught.json ??
              caught.text.slice(0, 400),
          );
          expect(caught.json?.state).toBe('stopped');
          expect(caught.json.at.address.line).toBe(LINE.mark);
          expect(caught.json.at.address.object_name).toBe(probe);
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'over' })).isError,
          ).toBe(false);
          expect(
            (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
              .isError,
          ).toBe(false);
          const finished = await untilRunFinished(inst, h.state_handle);
          expect(finished.json?.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
          const stop = await session.stop();
          measure(
            'terminal',
            'stop',
            stop.isError ? stop.text.slice(0, 400) : 'stopped',
          );
          expect(stop.isError).toBe(false);
        } finally {
          await session.cleanup();
        }
      });
    },
    getTimeout('long'),
  );

  // --- 5c. a stop whose listener stop failed: the held debuggee stays for the next stop -----

  it(
    'a failed listener stop and a failed delete: DebugStop answers the failure and keeps the debuggee held; the next stop releases it',
    async () => {
      await tester.run(async () => {
        if (!abapReady) throw new Error('the probe is not ready');
        softOnly('the fault seam is in process');

        // 1. The sweep: whatever an earlier killed run left for this user — a
        // listener (taken over), the user's breakpoints (deleted by the
        // listener's stop) — is cleared by a take-over and its stop.
        const sweeper = newInstance();
        const sweep = caseSession(sweeper);
        try {
          const taken = await call(sweeper, 'DebugTakeOverListener', {
            breakpoints: [line('mark')],
          });
          sweep.hold(taken);
          measure(
            'kept debuggee',
            'the sweep: take-over',
            taken.isError ? taken.text.slice(0, 400) : taken.json?.state,
          );
          expect(taken.isError).toBe(false);
          const swept = await sweep.stop();
          measure(
            'kept debuggee',
            'the sweep: stop',
            swept.isError ? swept.text.slice(0, 400) : 'stopped',
          );
          expect(swept.isError).toBe(false);
        } finally {
          await sweep.cleanup();
        }

        const inst = faultedInstance();
        const session = caseSession(inst);
        let ran: RunInFlight | undefined;
        try {
          const start = await call(inst, 'DebugStartListener', {
            breakpoints: [line('loop')],
          });
          const h = session.hold(start);
          expect(start.isError).toBe(false);
          let settled = false;
          ran = inFlight(
            runProbe(probe).finally(() => {
              settled = true;
            }),
          );
          const caught = await waitFor(inst, h.state_handle, ['stopped']);
          expect(caught.last.json?.state).toBe('stopped');
          expect(caught.last.json.at.address.line).toBe(LINE.loop);

          // 2. The listener's stop and the breakpoint's delete by id are refused
          // (through the seam): the stop answers the failure and sends no release.
          inst.fault.stopListener = 1;
          inst.fault.deleteBreakpoint = 1;
          inst.fault.recording = true;
          const faulted = await session.stop();
          inst.fault.recording = false;
          const abap = inst.debugger()?.abap;
          if (!abap) throw new Error('the instance has no debugger');
          const failures = abap.failures();
          measure('kept debuggee', 'the faulted stop', {
            isError: faulted.isError,
            failures,
            run_settled: settled,
          });
          expect(inst.fault.stopListener).toBe(0);
          expect(inst.fault.deleteBreakpoint).toBe(0);
          expect(faulted.isError).toBe(true);
          expect(faulted.text).toContain(DEBUGGEE_KEPT_WORDS);
          expect(failures.map((f) => f.step)).toEqual([
            'stop listener',
            expect.stringMatching(/^delete breakpoint /),
            'release the debuggee',
          ]);
          expect(failures[2]?.message).toBe(DEBUGGEE_KEPT_WORDS);
          expect(inst.fault.continues).toBe(0);
          expect(abap.holdsState()).toBe(true);
          expect(abap.listBreakpoints()).toHaveLength(1);
          // Still held: the run has not returned.
          await pause(3000);
          expect(settled).toBe(false);

          // 3. A clean stop: the listener's stop deletes the breakpoints, then
          // the debuggee is released and the run goes to its end.
          const clean = await session.stop();
          measure(
            'kept debuggee',
            'the clean stop',
            clean.isError ? clean.text.slice(0, 600) : 'stopped',
          );
          expect(clean.isError).toBe(false);
          expect(abap.failures()).toEqual([]);
          expect(abap.listBreakpoints()).toEqual([]);
          expect(abap.holdsState()).toBe(false);
          expect(await ran.run).toMatchObject({
            ok: true,
            output: expect.stringContaining(ABAP_OUTPUT),
          });
        } finally {
          // A fault not consumed must not refuse the cleanup's stop.
          inst.fault.stopListener = 0;
          inst.fault.deleteBreakpoint = 0;
          inst.fault.recording = false;
          await session.cleanup();
          // The run's own connection is logged off (endTestConnection) as it settles.
          await ran?.settled();
        }
      });
    },
    getTimeout('long'),
  );

  // --- 7 and 6. the AMDP chain, and whether a stop ends the open event read --------------

  /** SAP's system information: where the database system is named. */
  const systemInformationRead = async (): Promise<FixtureRead> => {
    try {
      const answered = (await connection.makeAdtRequest({
        url: '/sap/bc/adt/system/information',
        method: 'GET',
        timeout: 0,
        headers: { Accept: 'application/atom+xml;type=feed' },
      } as never)) as { status?: number; data?: unknown };
      return {
        status: answered?.status,
        text: typeof answered?.data === 'string' ? answered.data : '',
      };
    } catch (error) {
      const status = (error as { response?: { status?: unknown } })?.response
        ?.status;
      return {
        status: typeof status === 'number' ? status : undefined,
        text: error instanceof Error ? error.message : String(error),
      };
    }
  };

  /** A read of a shared object's active source, as a status and its text. */
  const sourceRead = (read: Answer): FixtureRead =>
    read.isError
      ? { status: 0, text: read.text }
      : { status: 200, text: String(read.json?.source ?? '') };

  it(
    'AMDP chain: start, break, table, steps, continue to the end; then a stop ends the event read',
    async () => {
      await tester.run(async () => {
        softOnly('the AMDP chain drives the instance in process');
        // The shared pair, read, never written: the case skips only where
        // SAP's system information names a database system other than HANA.
        const obj = plain();
        const verdict = amdpGateVerdict({
          systemInformation: await systemInformationRead(),
          className: amdpClass,
          classRead: sourceRead(
            await call(obj, 'GetClass', { class_name: amdpClass }),
          ),
          ddlName: amdpDdl,
          ddlRead: sourceRead(await call(obj, 'GetDdl', { ddl_name: amdpDdl })),
        });
        if ('skip' in verdict) throw new Error(`SKIP: ${verdict.skip}`);
        if ('fail' in verdict) throw new Error(verdict.fail);
        const tfLine = verdict.breakpointLine;

        const before = ownedNow();
        const inst = newInstance();
        const events: any[] = [];
        let handle: string | undefined;
        let failure: unknown;
        const problems: string[] = [];
        const until = async (kinds: string[], rounds = 8) => {
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

        try {
          const started = await call(inst, 'AmdpDebugStart', {
            stop_existing: false,
            breakpoints: [{ class_name: amdpClass, line: tfLine }],
            run: { kind: 'class', name: amdpClass },
          });
          timing('soft amdp.start(sync+run)', started.ms);
          measure(
            '7',
            'AMDP start (states after SYNC_BREAKPOINTS)',
            started.json ?? started.text.slice(0, 600),
          );
          if (typeof started.json?.state_handle === 'string')
            handle = started.json.state_handle;
          expect(started.isError).toBe(false);

          const first = await until(['ON_BREAK']);
          timing('soft amdp.wait-until-break(run→break)', first.ms);
          measure('7', 'first break', first.hit ?? first);
          expect(first.hit?.line).toBe(tfLine);

          // The table variable at the table function's break.
          const table = await call(inst, 'AmdpDebugGetTable', {
            state_handle: handle,
            variable: 'LT_ROWS',
          });
          timing('soft amdp.get-table', table.ms);
          measure(
            '7',
            'table variable at the table function',
            table.json ?? table.text.slice(0, 600),
          );
          expect(table.isError).toBe(false);

          const overs: unknown[] = [];
          let atBreak = true;
          for (let i = 0; i < repeats; i++) {
            const step = await call(inst, 'AmdpDebugStep', {
              state_handle: handle,
              action: 'over',
            });
            timing('soft amdp.step-over(call)', step.ms);
            expect(step.isError).toBe(false);
            const next = await until(['ON_BREAK', 'ON_EXECUTION_END']);
            timing('soft amdp.step-over(call→next break)', step.ms + next.ms);
            overs.push(
              next.hit ? `${next.hit.kind}:${next.hit.line ?? ''}` : next,
            );
            if (next.hit?.kind !== 'ON_BREAK') {
              atBreak = false;
              break;
            }
          }
          measure('7', 'after each step over', overs);

          // Continue from break to break until the run reports its end.
          let finished: any;
          let executionEnds = 0;
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
                timing(
                  'soft amdp.continue→ON_EXECUTION_END',
                  goMs + now() - t0,
                );
                measure('7', `ON_EXECUTION_END #${executionEnds}`, e);
              }
              if (e.kind === 'ON_BREAK') {
                atBreak = true;
                timing('soft amdp.continue→ON_BREAK', goMs + now() - t0);
              }
            }
          }
          measure('7', 'the run as reported', finished);
          expect(finished?.reason).toBe('run_finished');
          expect(String(finished?.run?.output)).toContain('rows 3');
          measure(
            '7',
            'event kinds seen',
            events.map((e) => e.kind),
          );

          // 6: does SAP end the open event read when the session is stopped?
          const amdp = inst.debugger()?.amdp;
          if (!amdp) throw new Error('the AMDP session has no debugger');
          expect(amdp.holdsState()).toBe(true);
          const stopAt = now();
          const stop = await call(inst, 'AmdpDebugStop', {
            state_handle: handle,
          });
          handle = undefined; // stopped: the cleanup's stop is not owed
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
        } catch (error) {
          failure = error;
        } finally {
          // Each step whatever the one before it did: the stop, the
          // instance's shutdown, the logoff of what the server opened.
          try {
            if (handle !== undefined) {
              const stopped = await call(inst, 'AmdpDebugStop', {
                state_handle: handle,
              });
              if (stopped.isError)
                problems.push(`AmdpDebugStop: ${stopped.text.slice(0, 600)}`);
            }
          } catch (error) {
            problems.push(`AmdpDebugStop threw: ${String(error)}`);
          } finally {
            try {
              const left = inst.state ? await inst.state.shutdown() : [];
              if (left.length)
                problems.push(`instance shutdown left: ${left.join('; ')}`);
            } catch (error) {
              problems.push(`instance shutdown threw: ${String(error)}`);
            } finally {
              problems.push(...(await logOffLeft(before, 'the AMDP chain')));
            }
          }
        }
        if (failure !== undefined) {
          if (problems.length)
            measure('cleanup', 'the AMDP chain', problems.join('\n'));
          throw failure;
        }
        if (problems.length) throw new Error(problems.join('\n'));
      });
    },
    getTimeout('long'),
  );
});

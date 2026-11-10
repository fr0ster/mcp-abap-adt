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
 *
 * No case pauses and no wait is bounded (D27): each step goes on the answer
 * of the one before it — a listener's long poll is awaited as the `listen`
 * it sends, a raw poll as SAP's answer to it (held 60 s at most), an
 * instance's shutdown as its end. A wait that does not end is ended by the
 * person running the suite, with the runner's interrupt
 * (`src/__tests__/integration/README.md`, "Interrupting a run").
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, afterEach, before, describe, it } from 'node:test';
import {
  AbapDebugger,
  AdtExecutor,
  type IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type {
  IAdtAnalyseOptions,
  IAdtError,
  IDebuggerIdentity,
} from '@mcp-abap-adt/interfaces-adt';
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
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
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
import {
  assertEquals,
  assertMatches,
  isUpperHex,
  memberText,
} from '../helpers/liveAssert';

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
import {
  amdpGateVerdict,
  databaseSource,
  type FixtureRead,
} from '../helpers/amdpFixture';
import {
  getSharedDependenciesConfig,
  getStatedDatabaseSystem,
  getSystemType,
  isTestAvailableForSystem,
  loadTestConfig,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { logOffLeft, ownedNow } from '../helpers/debuggerCleanup';
import { createTestLogger } from '../helpers/loggerHelpers';
import { endTestConnection } from '../helpers/openConnections';
import { guardedTestConnection } from '../helpers/refusalGuard';
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
  /**
   * Resolves once the instance's listener has sent its long poll — the
   * second `listen`, after the short first one (`FIRST_POLL_HOLD_SECONDS`).
   * Soft mode only: in hard mode the listener is in the server's process.
   */
  longPollSent?(): Promise<void>;
  /** How many AMDP event reads (`getEvents`) are in flight now. Soft mode only. */
  eventReadsOpen?(): number;
  /** Resolves once every AMDP event read in flight now has been answered. Soft mode only. */
  eventReadsEnded?(): Promise<void>;
}

/** The `listen` calls a listener has sent, and a wait for the n-th one. */
function listenCounter(): {
  sent(): void;
  until(count: number): Promise<void>;
} {
  let sent = 0;
  let waiting: Array<{ count: number; resolve: () => void }> = [];
  return {
    sent() {
      sent += 1;
      const due = waiting.filter((w) => sent >= w.count);
      waiting = waiting.filter((w) => sent < w.count);
      for (const w of due) w.resolve();
    },
    until(count: number) {
      if (sent >= count) return Promise.resolve();
      return new Promise((resolve) => {
        waiting.push({ count, resolve });
      });
    },
  };
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
    // The live ports, with every `listen` the listener sends counted: what
    // createDebuggerInstance builds, observed.
    const listens = listenCounter();
    const live = liveDebugPorts();
    const ports: typeof live = {
      ...live,
      abapDebugger(c, onConflict) {
        const dbg = live.abapDebugger(c, onConflict);
        const listen = dbg.listen.bind(dbg);
        dbg.listen = <E extends IAdtError = IAdtError>(
          identity: IDebuggerIdentity,
          options?: { holdSeconds?: number } & IAdtAnalyseOptions<E>,
        ) => {
          listens.sent();
          return listen<E>(identity, options);
        };
        return dbg;
      },
    };
    // The live AMDP ports, with every event read the session sends kept
    // while it is in flight.
    const reads = new Set<Promise<void>>();
    const liveAmdp = liveAmdpPorts();
    const amdpPorts: typeof liveAmdp = {
      ...liveAmdp,
      amdpDebugger(c) {
        const amdp = liveAmdp.amdpDebugger(c);
        const getEvents = amdp.getEvents.bind(amdp);
        amdp.getEvents = <E extends IAdtError = IAdtError>(
          mainId: string,
          options?: IAdtAnalyseOptions<E>,
        ) => {
          const read = getEvents<E>(mainId, options);
          const answered = read.then(
            () => undefined,
            () => undefined,
          );
          reads.add(answered);
          void answered.then(() => reads.delete(answered));
          return read;
        };
        return amdp;
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
              ids ?? {
                terminalId: newDebuggerId(),
                ideId: newDebuggerId(),
                stated: false,
              },
              { breakpointConflict: resolveBreakpointConflict() },
            ),
            amdp: new AmdpSession(amdpPorts),
          });
          state.attach(dbg);
        }
        return dbg;
      },
    };
    return {
      state,
      ctx,
      debugger: () => dbg,
      longPollSent: () => listens.until(2),
      eventReadsOpen: () => reads.size,
      eventReadsEnded: async () => {
        await Promise.all([...reads]);
      },
    };
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
    // Guarded: a refusal of the second user's credential stops the run too.
    const conn = guardedTestConnection(
      settings,
      credentialFromSapConfig(settings),
      { logger: null },
    );
    await conn.connect();
    return {
      connection: conn,
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

  before(async () => {
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
  });

  afterEach(async () => {
    // Every instance a case made is let go the way a host lets one go.
    const states = instances.splice(0);
    for (const state of states) {
      const left = await state.shutdown();
      if (left.length) measure('cleanup', 'instance shutdown', left);
    }
  });

  after(async () => {
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
  });

  // --- 1. the ABAP chain, with its timings -------------------------------------------

  it('ABAP chain: listen, stop at the marked line, read, step, run to a line, continue, end', async () => {
    await tester.run(async () => {
      if (!abapReady) throw new Error('the probe is not ready');
      const mode = tester.isHardMode() ? 'hard' : 'soft';
      const inst = newInstance();
      const started = await call(inst, 'DebugStartListener', {
        breakpoints: [line('mark'), line('second')],
        run: { kind: 'class', name: probe },
      });
      timing(`${mode} abap.start(arm+listen+run)`, started.ms);
      assert.equal(started.isError, false);
      const handle = String(started.json?.state_handle ?? '');
      assert.ok(isUpperHex(handle, 32));
      measure('1', 'start answer', {
        state: started.json?.state,
        breakpoints: started.json?.breakpoints?.placed?.length,
        refused: started.json?.breakpoints?.refused,
      });

      const stopped = await waitFor(inst, handle, ['stopped', 'ended']);
      timing(`${mode} abap.wait-until-stopped(run→catch)`, stopped.ms);
      assert.equal(stopped.last.isError, false);
      assert.equal(stopped.last.json?.state, 'stopped');
      const at = stopped.last.json?.at;
      measure('1', 'the terse stop: address and technical place', at);
      assert.equal(at?.address?.line, LINE.mark);
      assert.equal(at?.address?.object_name, probe);
      assert.ok(at?.program);
      assert.ok(at?.include);
      assert.ok(at?.include_line > 0);

      for (let i = 0; i < 3; i++) {
        const stack = await call(inst, 'DebugGetStack', {
          state_handle: handle,
        });
        timing(`${mode} abap.get-stack`, stack.ms);
        assert.equal(stack.isError, false);
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
        assert.equal(vars.isError, false);
        if (i === 0) measure('1', 'LV_COUNTER at the mark', vars.json);
      }

      const overs: number[] = [];
      for (let i = 0; i < repeats; i++) {
        const step = await call(inst, 'DebugStep', {
          state_handle: handle,
          action: 'over',
        });
        timing(`${mode} abap.step-over`, step.ms);
        assert.equal(step.isError, false);
        assert.equal(step.json?.state, 'stopped');
        overs.push(step.json?.at?.address?.line);
      }
      measure('1', 'lines after each step over', overs);
      assert.equal(overs[0], LINE.mark + 1);

      const ran = await call(inst, 'DebugStepToLine', {
        state_handle: handle,
        mode: 'run',
        ...line('runto'),
      });
      timing(`${mode} abap.run-to-line`, ran.ms);
      assert.equal(ran.isError, false);
      assert.equal(ran.json?.at?.address?.line, LINE.runto);

      const intos: unknown[] = [];
      for (let i = 0; i < repeats; i++) {
        const step = await call(inst, 'DebugStep', {
          state_handle: handle,
          action: 'into',
        });
        timing(`${mode} abap.step-into`, step.ms);
        assert.equal(step.isError, false);
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
      assert.equal(toSecond.isError, false);
      assert.equal(toSecond.json?.state, 'stopped');
      assert.equal(toSecond.json?.at?.address?.line, LINE.second);

      const toEnd = await call(inst, 'DebugStep', {
        state_handle: handle,
        action: 'continue',
      });
      timing(`${mode} abap.continue(to the end)`, toEnd.ms);
      assert.equal(toEnd.isError, false);
      assert.equal(toEnd.json?.state, 'ended');

      const finished = await waitFor(inst, handle, ['ended']);
      timing(`${mode} abap.wait(run_finished)`, finished.ms);
      measure('1', 'the run as reported', finished.last.json);
      assert.equal(finished.last.json?.reason, 'run_finished');
      assert.equal(finished.last.json?.run?.ok, true);
      assert.ok(String(finished.last.json?.run?.output).includes(ABAP_OUTPUT));

      const stop = await call(inst, 'DebugStop', { state_handle: handle });
      timing(`${mode} abap.stop`, stop.ms);
      assert.equal(stop.isError, false);
      // The handle is invalid for good after a complete stop.
      const after = await call(inst, 'DebugWait', {
        state_handle: handle,
        hold_seconds: 0,
      });
      assert.equal(after.isError, true);
      assert.ok(after.text.includes('state is not available'));
    });
  });

  // --- 1b. the pool's trigger: a stop, then at once a start in a new instance -----------

  it('stop, then a start at once in a new instance (as a pool does): the stop answers stopped, and the new instance starts and stops', async () => {
    await tester.run(async () => {
      const mode = tester.isHardMode() ? 'hard' : 'soft';
      const rounds: unknown[] = [];
      for (let i = 0; i < 3; i++) {
        const a = newInstance();
        const first = await call(a, 'DebugStartListener', {
          breakpoints: [line('mark')],
        });
        assert.equal(first.isError, false);
        // Past the short first poll: the long poll is sent when the stop
        // comes (soft mode; hard mode cannot see the server's listener).
        await a.longPollSent?.();
        const stop = await call(a, 'DebugStop', {
          state_handle: first.json.state_handle,
        });
        timing(`${mode} pool.stop(listening)`, stop.ms);
        assert.equal(stop.isError, false);
        assert.equal(stop.json?.state, 'stopped');
        const b = newInstance();
        const next = await call(b, 'DebugStartListener', {
          breakpoints: [line('mark')],
        });
        timing(`${mode} pool.start-after-stop`, next.ms);
        rounds.push({
          stop_ms: Math.round(stop.ms),
          next: next.isError ? next.text.slice(0, 400) : next.json?.state,
        });
        assert.equal(next.isError, false);
        assert.equal(typeof next.json?.state_handle, 'string');
        const stopB = await call(b, 'DebugStop', {
          state_handle: next.json.state_handle,
        });
        assert.equal(stopB.isError, false);
        assert.equal(stopB.json?.state, 'stopped');
      }
      measure(
        'pool',
        `${mode}: stop, then a new instance starts at once`,
        rounds,
      );
    });
  });

  // --- timing baselines ----------------------------------------------------------------

  it('timing baselines: the probe run with no debugger, and caught then released at once', async () => {
    await tester.run(async () => {
      softOnly('the baseline runs the probe itself');
      if (!abapReady) throw new Error('the probe is not ready');
      for (let i = 0; i < repeats; i++) {
        const r = await runProbe(probe);
        timing('baseline.run-without-debugger', r.ms);
        assert.equal(r.ok, true);
        assert.ok(r.output.includes(ABAP_OUTPUT));
      }
      for (let i = 0; i < repeats; i++) {
        const inst = newInstance();
        const t0 = now();
        const started = await call(inst, 'DebugStartListener', {
          breakpoints: [line('mark')],
          run: { kind: 'class', name: probe },
        });
        assert.equal(started.isError, false);
        const handle = started.json.state_handle;
        const stopped = await waitFor(inst, handle, ['stopped', 'ended']);
        assert.equal(stopped.last.json?.state, 'stopped');
        const caughtAt = now();
        const released = await call(inst, 'DebugStep', {
          state_handle: handle,
          action: 'continue',
        });
        assert.equal(released.json?.state, 'ended');
        const finished = await waitFor(inst, handle, ['ended']);
        assert.equal(finished.last.json?.reason, 'run_finished');
        timing('baseline.caught-released(start→run_finished)', now() - t0);
        timing(
          'baseline.caught-released(catch→run_finished)',
          now() - caughtAt,
        );
        await call(inst, 'DebugStop', { state_handle: handle });
      }
    });
  });

  // --- 2. the listener conflict ----------------------------------------------------------

  it('conflict, refuse: a second instance is refused before any change, named as another debugger; nothing of it stays', async () => {
    await tester.run(async () => {
      softOnly('the conflict needs two instances');
      const a = newInstance();
      const b = newInstance();
      const first = await call(a, 'DebugStartListener', {
        breakpoints: [line('mark')],
      });
      assert.equal(first.isError, false);
      const handleA = first.json.state_handle;
      const second = await call(b, 'DebugStartListener', {
        breakpoints: [line('mark')],
      });
      measure('2-refuse', 'second instance, other ids, refuse', {
        isError: second.isError,
        text: second.text.slice(0, 600),
        ms: Math.round(second.ms),
      });
      assert.equal(second.isError, true);
      // The refusal comes from the listener check before any change. The
      // answer is the method's error as it came — SAP's conflict, whose
      // document names the other debugger — plus the step where it arose.
      const refused = JSON.parse(second.text);
      assert.equal(refused.step, 'check listener');
      assert.equal(refused.status, 409);
      assert.ok(String(refused.raw_body).includes('conflictText'));
      assert.equal(b.state?.holdsState(), false);
      const stillA = await call(a, 'DebugWait', {
        state_handle: handleA,
        hold_seconds: 3,
      });
      measure(
        '2-refuse',
        'the first instance afterwards',
        stillA.json ?? stillA.text,
      );
      assert.equal(stillA.json?.state, 'listening');
      assert.equal(
        (await call(a, 'DebugStop', { state_handle: handleA })).isError,
        false,
      );
    });
  });

  it('conflict, take-over: the newcomer listens and the first session reports the displacement', async () => {
    await tester.run(async () => {
      softOnly('the conflict needs two instances');
      const a = newInstance();
      const b = newInstance();
      const first = await call(a, 'DebugStartListener', {
        breakpoints: [line('mark')],
      });
      assert.equal(first.isError, false);
      const handleA = first.json.state_handle;
      // Past the first instance's short first poll: its long poll is sent.
      await a.longPollSent?.();
      const t0 = now();
      const taken = await call(b, 'DebugTakeOverListener', {
        breakpoints: [line('mark')],
      });
      measure('2-takeover', 'second instance, other ids, take-over', {
        isError: taken.isError,
        answer: taken.json ?? taken.text.slice(0, 600),
      });
      assert.equal(taken.isError, false);
      const displaced = await waitFor(a, handleA, ['idle', 'ended'], 3);
      measure('2-takeover', 'the first instance after the take-over', {
        isError: displaced.last.isError,
        text: displaced.last.text.slice(0, 600),
        ms_since_takeover: Math.round(now() - t0),
      });
      assert.equal(displaced.last.isError, true);
      assert.ok(displaced.last.text.includes('conflictNotification'));
      const stopB = await call(b, 'DebugStop', {
        state_handle: taken.json.state_handle,
      });
      assert.equal(stopB.isError, false);
    });
  });

  // --- 3. stated ids, reconciliation -------------------------------------------------------

  it('stated ids: a successor with the same ids as a left listener starts without a conflict and stops; the left poll is answered', async () => {
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
        const b = newInstance(ids);
        const startedAt = now();
        const second = await call(b, 'DebugStartListener', {
          breakpoints: [line('mark')],
        });
        measure('3', 'successor under the same stated ids', {
          isError: second.isError,
          answer: second.json ?? second.text.slice(0, 600),
        });
        assert.equal(second.isError, false);
        // SAP holds the poll 60 s at most (holdSeconds), so it ends.
        const ended = await left.poll;
        measure('3', 'the predecessor’s poll', {
          status: ended.status,
          body: ended.body.slice(0, 400),
          ms_after_successor_start: Math.round(ended.at - startedAt),
        });
        assert.equal(ended.status, 'ok');
        const stopB = await call(b, 'DebugStop', {
          state_handle: second.json.state_handle,
        });
        assert.equal(stopB.isError, false);
        assert.equal(stopB.json?.state, 'stopped');
      } finally {
        await left.close();
      }
    });
  });

  it('stated ids, measured: an instance under an IDE-like listener’s ideId starts without a conflict and stops; the IDE-like poll’s answer is recorded', async () => {
    await tester.run(async () => {
      softOnly('the IDE-like listener is the test’s own');
      const ideId = newDebuggerId();
      const raw = await rawListener({ terminalId: newDebuggerId(), ideId });
      try {
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
        assert.equal(started.isError, false);
        // SAP holds the poll 60 s at most (holdSeconds), so it ends.
        const ended = await raw.poll;
        measure('3-ide', 'the IDE-like poll', {
          status: ended.status,
          body: ended.body.slice(0, 400),
          ms_after_instance_start: Math.round(ended.at - startedAt),
          ms_after_its_own_start: Math.round(ended.at - raw.started),
        });
        const stopped = await call(inst, 'DebugStop', {
          state_handle: started.json.state_handle,
        });
        assert.equal(stopped.isError, false);
        assert.equal(stopped.json?.state, 'stopped');
      } finally {
        await raw.close();
      }
    });
  });

  // --- 4. breakpoint semantics: does a line breakpoint catch a second time? --------------

  it('breakpoint semantics, measured: a second run of the probe — caught again, and after a re-arm', async () => {
    await tester.run(async () => {
      softOnly('the second run is the test’s own');
      const inst = newInstance();
      const started = await call(inst, 'DebugStartListener', {
        breakpoints: [line('mark')],
        run: { kind: 'class', name: probe },
      });
      assert.equal(started.isError, false);
      const handle = started.json.state_handle;
      const first = await waitFor(inst, handle, ['stopped', 'ended']);
      assert.equal(first.last.json?.state, 'stopped');
      const released = await call(inst, 'DebugStep', {
        state_handle: handle,
        action: 'continue',
      });
      assert.equal(released.json?.state, 'ended');
      const finished = await waitFor(inst, handle, ['ended']);
      assert.equal(finished.last.json?.reason, 'run_finished');

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
      assert.equal(listed.isError, false);
    });
  });

  // --- 5. memory --------------------------------------------------------------------------

  it('memory: sizes and a snapshot at a stop, then the snapshot list', async () => {
    await tester.run(async () => {
      if (!abapReady) throw new Error('the probe is not ready');
      softOnly('covered by the soft run');
      const inst = newInstance();
      const started = await call(inst, 'DebugStartListener', {
        breakpoints: [line('mark')],
        run: { kind: 'class', name: probe },
      });
      assert.equal(started.isError, false);
      const handle = started.json.state_handle;
      const stopped = await waitFor(inst, handle, ['stopped', 'ended']);
      assert.equal(stopped.last.json?.state, 'stopped');
      const sizes = await call(inst, 'DebugGetMemorySizes', {
        state_handle: handle,
      });
      timing('soft memory.sizes', sizes.ms);
      measure('5', 'memory sizes', sizes.isError ? sizes.text : sizes.json);
      assert.equal(sizes.isError, false);
      const snap = await call(inst, 'DebugCreateMemorySnapshot', {
        state_handle: handle,
      });
      timing('soft memory.create-snapshot', snap.ms);
      measure('5', 'create a snapshot', snap.isError ? snap.text : snap.json);
      assert.equal(snap.isError, false);
      const list = await call(inst, 'MemorySnapshotList', {});
      timing('soft memory.list', list.ms);
      measure('5', 'snapshot list', list.isError ? list.text : list.json);
      assert.equal(list.isError, false);
      const stop = await call(inst, 'DebugStop', { state_handle: handle });
      assert.equal(stop.isError, false);
    });
  });

  // --- 5b. the breakpoint set across changes, another user, leaving a debuggee running,
  // the settings, terminal mode -------------------------------------------------------------

  it('the breakpoint set: two DebugSetBreakpoints in a row, and the run stops at both; every answer row pairs by its clientId', async () => {
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
        assert.equal(start.isError, false);
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
        assert.equal(second.isError, false);
        measure(
          'breakpoint answer',
          'held: mark; sent: second (both placeable)',
          paired(second),
        );
        assert.equal(second.json.placed.length, 2);
        assertEquals(second.json.refused, []);
        assertEquals(second.json.lost, []);
        assertEquals(second.json.unexpected, []);
        // A refusal among the rows: a class's first line takes no breakpoint. The system
        // answers it first (measured on premise (2026-10-11), BASIS 816); the tag pairs it.
        const withRefusal = await call(inst, 'DebugSetBreakpoints', {
          ...h,
          breakpoints: [{ object_type: 'CLAS', object_name: probe, line: 1 }],
        });
        assert.equal(withRefusal.isError, false);
        measure(
          'breakpoint answer',
          'held: mark, second; sent: line 1',
          paired(withRefusal),
        );
        assert.equal(withRefusal.json.placed.length, 2);
        assert.equal(withRefusal.json.refused.length, 1);
        assert.ok(
          withRefusal.json.refused[0].requested.uri.endsWith('#start=1'),
        );
        assertEquals(withRefusal.json.lost, []);
        assertEquals(withRefusal.json.unexpected, []);
        ran = inFlight(runProbe(probe));
        const atMark = await waitFor(inst, h.state_handle, ['stopped']);
        assert.equal(atMark.last.json?.state, 'stopped');
        assert.equal(atMark.last.json.at.address.line, LINE.mark);
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError,
          false,
        );
        const atSecond = await waitFor(inst, h.state_handle, ['stopped']);
        measure(
          'breakpoint set',
          'the second stop',
          atSecond.last.json?.at?.address,
        );
        assert.equal(atSecond.last.json?.state, 'stopped');
        assert.equal(atSecond.last.json.at.address.line, LINE.second);
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError,
          false,
        );
        assertMatches(await ran.run, { ok: true });
        assert.ok(memberText(await ran.run, 'output')?.includes(ABAP_OUTPUT));
        assert.equal((await session.stop()).isError, false);
      } finally {
        await session.cleanup();
        await ran?.settled();
      }
    });
  });

  it('another user: a listener for a second configured user catches that user’s run; stepped and continued', async () => {
    await tester.run(async () => {
      if (!abapReady) throw new Error('the probe is not ready');
      if (!secondUserEnv)
        throw new Error('SKIP: no second user configured (second_user_env)');
      const other = await connectionAs(secondUserEnv);
      const inst = newInstance();
      const session = caseSession(inst);
      let ran: RunInFlight | undefined;
      try {
        const otherUser = (await requestUserOf(other.connection)).toUpperCase();
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
        assert.equal(start.isError, false);
        assert.equal(start.json.request_user, otherUser);
        ran = inFlight(runOn(other.connection, probe));
        const caught = await waitFor(inst, h.state_handle, ['stopped']);
        assert.equal(caught.last.json?.state, 'stopped');
        assert.equal(caught.last.json.at.address.line, LINE.mark);
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'over' })).isError,
          false,
        );
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError,
          false,
        );
        assertMatches(await ran.run, { ok: true });
        assert.ok(memberText(await ran.run, 'output')?.includes(ABAP_OUTPUT));
        assert.equal((await session.stop()).isError, false);
      } finally {
        // The stop releases a held run first; the run settles before its connection closes.
        await session.cleanup();
        await ran?.settled();
        await other.close();
      }
    });
  });

  it('detach: the run goes on to its end, the listener and the breakpoints stay and catch the next run', async () => {
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
        assert.equal(start.isError, false);
        const pass1 =
          start.json.state === 'stopped'
            ? start
            : (await waitFor(inst, h.state_handle, ['stopped'])).last;
        assert.equal(pass1.json.at.address.line, LINE.loop);
        const detached = await call(inst, 'DebugStep', {
          ...h,
          action: 'detach',
        });
        measure(
          'detach',
          'answer',
          detached.isError ? detached.text.slice(0, 400) : detached.json,
        );
        assert.equal(detached.isError, false);
        // Measured on premise (2026-10-12): the same run is not caught again at the
        // loop's next pass — the system answers the detach as the run ends, so the
        // answer is listening, or the run's end when it was reported first.
        const finished =
          detached.json.reason === 'run_finished'
            ? detached
            : (assert.equal(detached.json.state, 'listening'),
              await untilRunFinished(inst, h.state_handle));
        measure('detach', 'the run after the detach', finished.json?.run);
        assertMatches(finished.json?.run, { ok: true });
        assert.ok(
          memberText(finished.json?.run, 'output')?.includes(ABAP_OUTPUT),
        );
        // The listener and the breakpoints stay: the next run is caught (soft only:
        // a hard run has no connection of its own to start it).
        if (!tester.isHardMode()) {
          next = inFlight(runProbe(probe));
          const caught = await waitFor(inst, h.state_handle, ['stopped']);
          assert.equal(caught.last.json?.state, 'stopped');
          assert.equal(caught.last.json.at.address.line, LINE.loop);
          // Detached again, the loop's second pass is not caught either.
          assert.equal(
            (await call(inst, 'DebugStep', { ...h, action: 'detach' })).isError,
            false,
          );
          assert.equal((await next.run).ok, true);
        }
        assert.equal((await session.stop()).isError, false);
      } finally {
        await session.cleanup();
        await next?.settled();
      }
    });
  });

  it('release_debugger: the run finishes, the answer is no failure, and the listener catches the next run', async () => {
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
        assert.equal(start.isError, false);
        if (start.json.state !== 'stopped')
          assert.equal(
            (await waitFor(inst, h.state_handle, ['stopped'])).last.json?.state,
            'stopped',
          );
        const released = await call(inst, 'DebugStep', {
          ...h,
          action: 'release_debugger',
        });
        measure(
          'release_debugger',
          'answer',
          released.isError ? released.text.slice(0, 400) : released.json,
        );
        assert.equal(released.isError, false);
        // Listening, or the run's end when the program finished before the answer
        // (measured on premise, 2026-10-12).
        const finished =
          released.json.reason === 'run_finished'
            ? released
            : (assert.equal(released.json.state, 'listening'),
              await untilRunFinished(inst, h.state_handle));
        assertMatches(finished.json?.run, { ok: true });
        assert.ok(
          memberText(finished.json?.run, 'output')?.includes(ABAP_OUTPUT),
        );
        // The next run is the test's own: a hard run has no connection of its own to start it.
        if (!tester.isHardMode()) {
          next = inFlight(runProbe(probe));
          const caught = await waitFor(inst, h.state_handle, ['stopped']);
          assert.equal(caught.last.json?.state, 'stopped');
          assert.equal(
            (await call(inst, 'DebugStep', { ...h, action: 'continue' }))
              .isError,
            false,
          );
          assert.equal((await next.run).ok, true);
        }
        assert.equal((await session.stop()).isError, false);
      } finally {
        await session.cleanup();
        await next?.settled();
      }
    });
  });

  it('settings: at the start and through DebugSetSettings, the settings in force recorded after each', async () => {
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
        assert.equal(start.isError, false);
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
        assertMatches(stopped.json.settings, {
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
        assert.equal(off.isError, false);
        assertMatches(off.json, {
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
        assert.equal(update.isError, false);
        assertMatches(update.json, {
          update_debugging: true,
          system_debugging: false,
        });
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError,
          false,
        );
        const finished = await untilRunFinished(inst, h.state_handle);
        assertMatches(finished.json?.run, { ok: true });
        assert.ok(
          memberText(finished.json?.run, 'output')?.includes(ABAP_OUTPUT),
        );
        assert.equal((await session.stop()).isError, false);
      } finally {
        await session.cleanup();
      }
    });
  });

  it('terminal mode: our own run carries the session’s ids and is caught', async () => {
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
        assert.equal(start.isError, false);
        assert.equal(start.json.debugging_mode, 'terminal');
        const caught =
          start.json.state === 'stopped'
            ? start
            : (await waitFor(inst, h.state_handle, ['stopped', 'ended'])).last;
        measure(
          'terminal',
          'the catch',
          caught.json?.at?.address ?? caught.json ?? caught.text.slice(0, 400),
        );
        assert.equal(caught.json?.state, 'stopped');
        assert.equal(caught.json.at.address.line, LINE.mark);
        assert.equal(caught.json.at.address.object_name, probe);
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'over' })).isError,
          false,
        );
        assert.equal(
          (await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError,
          false,
        );
        const finished = await untilRunFinished(inst, h.state_handle);
        assertMatches(finished.json?.run, { ok: true });
        assert.ok(
          memberText(finished.json?.run, 'output')?.includes(ABAP_OUTPUT),
        );
        const stop = await session.stop();
        measure(
          'terminal',
          'stop',
          stop.isError ? stop.text.slice(0, 400) : 'stopped',
        );
        assert.equal(stop.isError, false);
      } finally {
        await session.cleanup();
      }
    });
  });

  // --- 5c. a stop whose listener stop failed: the held debuggee stays for the next stop -----

  it('a failed listener stop and a failed delete: DebugStop answers the failure and keeps the debuggee held; the next stop releases it', async () => {
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
        assert.equal(taken.isError, false);
        const swept = await sweep.stop();
        measure(
          'kept debuggee',
          'the sweep: stop',
          swept.isError ? swept.text.slice(0, 400) : 'stopped',
        );
        assert.equal(swept.isError, false);
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
        assert.equal(start.isError, false);
        let settled = false;
        ran = inFlight(
          runProbe(probe).finally(() => {
            settled = true;
          }),
        );
        const caught = await waitFor(inst, h.state_handle, ['stopped']);
        assert.equal(caught.last.json?.state, 'stopped');
        assert.equal(caught.last.json.at.address.line, LINE.loop);

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
        assert.equal(inst.fault.stopListener, 0);
        assert.equal(inst.fault.deleteBreakpoint, 0);
        assert.equal(faulted.isError, true);
        assert.ok(faulted.text.includes(DEBUGGEE_KEPT_WORDS));
        const steps = failures.map((f) => String(f.step));
        assert.equal(steps.length, 3);
        assert.equal(steps[0], 'stop listener');
        assert.ok(steps[1]?.startsWith('delete breakpoint '), steps[1]);
        assert.equal(steps[2], 'release the debuggee');
        assert.equal(failures[2]?.message, DEBUGGEE_KEPT_WORDS);
        assert.equal(inst.fault.continues, 0);
        assert.equal(abap.holdsState(), true);
        assert.equal(abap.listBreakpoints().length, 1);

        // 3. A clean stop: the listener's stop deletes the breakpoints, then
        // the debuggee is released and the run goes to its end.
        const clean = await session.stop();
        measure(
          'kept debuggee',
          'the clean stop',
          clean.isError ? clean.text.slice(0, 600) : 'stopped',
        );
        assert.equal(clean.isError, false);
        assertEquals(abap.failures(), []);
        assertEquals(abap.listBreakpoints(), []);
        assert.equal(abap.holdsState(), false);
        assertMatches(await ran.run, { ok: true });
        assert.ok(memberText(await ran.run, 'output')?.includes(ABAP_OUTPUT));
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
  });

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

  it('AMDP chain: start, break, table, steps, continue to the end; then a stop, and the event read open at it ends (waited for)', async () => {
    await tester.run(async () => {
      softOnly('the AMDP chain drives the instance in process');
      // The shared pair, read, never written: the case skips only where
      // the database system (stated by the test config, else named by
      // SAP's system information) is not HANA.
      const obj = plain();
      const verdict = amdpGateVerdict({
        database: await databaseSource(
          getStatedDatabaseSystem(),
          systemInformationRead,
        ),
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
        assert.equal(started.isError, false);

        const first = await until(['ON_BREAK']);
        timing('soft amdp.wait-until-break(run→break)', first.ms);
        measure('7', 'first break', first.hit ?? first);
        assert.equal(first.hit?.line, tfLine);

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
        assert.equal(table.isError, false);

        const overs: unknown[] = [];
        let atBreak = true;
        for (let i = 0; i < repeats; i++) {
          const step = await call(inst, 'AmdpDebugStep', {
            state_handle: handle,
            action: 'over',
          });
          timing('soft amdp.step-over(call)', step.ms);
          assert.equal(step.isError, false);
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
              timing('soft amdp.continue→ON_EXECUTION_END', goMs + now() - t0);
              measure('7', `ON_EXECUTION_END #${executionEnds}`, e);
            }
            if (e.kind === 'ON_BREAK') {
              atBreak = true;
              timing('soft amdp.continue→ON_BREAK', goMs + now() - t0);
            }
          }
        }
        measure('7', 'the run as reported', finished);
        assert.equal(finished?.reason, 'run_finished');
        assert.ok(String(finished?.run?.output).includes('rows 3'));
        measure(
          '7',
          'event kinds seen',
          events.map((e) => e.kind),
        );

        // 6: SAP ends the event read open when the session is stopped: the
        // case waits for that read's answer, with no bound (the suite's
        // header: a wait that does not end is ended with the interrupt).
        const amdp = inst.debugger()?.amdp;
        if (!amdp) throw new Error('the AMDP session has no debugger');
        if (!inst.eventReadsOpen || !inst.eventReadsEnded) {
          throw new Error('the instance does not observe its event reads');
        }
        assert.equal(amdp.holdsState(), true);
        const openAtStop = inst.eventReadsOpen();
        assert.ok(openAtStop > 0, 'an event read is open at the stop');
        const readsEnded = inst.eventReadsEnded();
        const stopAt = now();
        const stop = await call(inst, 'AmdpDebugStop', {
          state_handle: handle,
        });
        handle = undefined; // stopped: the cleanup's stop is not owed
        timing('soft amdp.stop', stop.ms);
        assert.equal(stop.isError, false);
        await readsEnded;
        measure('6', 'the event read open at AmdpDebugStop', {
          open_at_stop: openAtStop,
          ms_after_stop: Math.round(now() - stopAt),
          holds_state: amdp.holdsState(),
          failures: amdp.failures(),
        });
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
  });
});

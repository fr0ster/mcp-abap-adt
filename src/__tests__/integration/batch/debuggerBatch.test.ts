/**
 * The debugger batch at a live stop (spec §7, §9.3, plan Task 29), on the
 * configured system, and the AMDP gate.
 *
 * Where it runs: the system the config names, when the case
 * `batch.test_cases.debugger` is enabled. Nothing else may debug for the
 * same SAP user while it runs (an IDE with a breakpoint set holds the user's
 * debugging).
 *
 * 1. **The debugger batch** — one case per kind of destination: on premise
 *    over HTTP, on premise over RFC (a config with `connection_type: rfc`,
 *    e.g. through `MCP_TEST_CONFIG`) and ABAP Cloud. The case of the
 *    configured kind runs; the other two skip, saying why. Hard mode: the
 *    test starts the full server over stdio — the full command's `main`
 *    (`server/src/launcher.ts`) with `fullToolSet`, run from source through
 *    tsx with `tsconfig.test.json`'s package paths — and calls its tools by
 *    name through an MCP client, as a model does. The debug target is the
 *    shared class `ZMCP_SHR_PROF_CLS` (`shared_dependencies`; running it
 *    changes nothing): `DebugStartListener` with a line breakpoint in its
 *    loop and a run of the class; `DebugWait` until it is stopped there;
 *    `DebugBatchBegin`; `DebugStep` over, `DebugGetStack`,
 *    `DebugGetVariables` — each answers nothing; one `DebugBatchEnd`; then
 *    `BatchAnswers` 1–3, each checked on its own: the step answered, the
 *    stack on the next line, the variable as the loop's first pass left it.
 * 2. **The AMDP gate** — on premise only, over either transport, on a
 *    system that runs AMDP debugging (HANA). ABAP Cloud skips. The server
 *    refuses `DebugBatchBegin` at an AMDP debug session
 *    (`debug_batch_amdp_unmeasured`) until a test against a system confirms
 *    that the AMDP debugger's requests go through a debugger batch
 *    envelope; this case is that test. It drives SAP directly, in process:
 *    an AMDP probe (a class with a SQLScript table function, and its DDL
 *    source) is created in `amdp_package` with no transport — there is no
 *    shared AMDP target — and activated; a probe that does not activate
 *    (a system not on HANA) skips the case with SAP's words. Then an AMDP
 *    debug session (`AmdpDebugStart` with a breakpoint in the table
 *    function and a run of the class), `AmdpDebugWait` until `ON_BREAK`,
 *    and the AMDP data preview of the table variable and a step over
 *    recorded in one debugger batch envelope on the session's command
 *    connection. It passes when the envelope and both parts answer ok and
 *    the debuggee moves on to its next event (the step took effect).
 *
 * Cleanup, in `finally`, whatever happened: debugger state only —
 * `DebugStop` / `AmdpDebugStop` (the debuggee released, the breakpoints
 * removed, the listener stopped), each answer checked; the AMDP probe
 * deleted and each of its reads answering `404`. Every session is logged
 * off: the served server's by its own shutdown (stdin ended, exit `0`
 * asserted), the in-process instance's by its shutdown, the test's own
 * connection by the setup file's close of tracked connections.
 *
 * Each measured answer is one `debugger-batch-live` line on stderr; a state
 * handle never reaches it.
 *
 * Run (HTTP): npm test -- src/__tests__/integration/batch/debuggerBatch.test.ts --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
 * Run (RFC):  MCP_TEST_CONFIG=tests/test-config.rfc.yaml with the same command,
 *             the RFC SDK's libraries on LD_LIBRARY_PATH and SAPNWRFC_HOME set.
 */

import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AdtBatchConnection, AmdpDebugger } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../handlers/class/high/handleDeleteClass';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleCreateDdl } from '../../../handlers/ddl/high/handleCreateDdl';
import { handleDeleteDdl } from '../../../handlers/ddl/high/handleDeleteDdl';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
import { handleUpdateDdl } from '../../../handlers/ddl/high/handleUpdateDdl';
import { handleAmdpDebugStart } from '../../../handlers/debugger/debug/handleAmdpDebugStart';
import { handleAmdpDebugStop } from '../../../handlers/debugger/debug/handleAmdpDebugStop';
import { handleAmdpDebugWait } from '../../../handlers/debugger/debug/handleAmdpDebugWait';
import type { HandlerContext } from '../../../handlers/interfaces';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import {
  createDebuggerInstance,
  type DebuggerInstance,
} from '../../../lib/debugger/DebuggerInstance';
import { newDebuggerId } from '../../../lib/debugger/ids';
import {
  InstanceState,
  stderrStateLogger,
} from '../../../lib/state/InstanceState';
import {
  getEnabledTestCase,
  getTimeout,
  loadTestConfig,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../helpers/sessionHelpers';
import { createHandlerContext } from '../helpers/testHelpers';

const testLogger = createTestLogger('debugger-batch');

const REPO = path.resolve(__dirname, '../../../..');

type Content = Array<{ type: string; text?: string }>;
type Answer = { content?: Content; isError?: boolean };
type Entry = { number: number; content?: Content; isError?: boolean };

type Kind = 'onprem-http' | 'onprem-rfc' | 'cloud';

const KIND_WORDS: Record<Kind, string> = {
  'onprem-http': 'on premise over HTTP',
  'onprem-rfc': 'on premise over RFC',
  cloud: 'ABAP Cloud',
};

/** The kind of destination the config names, or why there is none. */
function configuredKind(): Kind | { reason: string } {
  let cfg: any;
  try {
    cfg = loadTestConfig();
  } catch (error) {
    return { reason: `the test config cannot be read (${String(error)})` };
  }
  const env = cfg?.environment ?? {};
  if (!env.env) {
    return {
      reason: 'the test config names no session file (environment.env)',
    };
  }
  const system = String(env.system_type ?? '').trim();
  const transport = String(env.connection_type ?? 'http')
    .trim()
    .toLowerCase();
  if (system === 'cloud') {
    return transport === 'rfc'
      ? { reason: 'the config names ABAP Cloud over RFC, which does not exist' }
      : 'cloud';
  }
  if (system === 'onprem' || system === 'legacy') {
    return transport === 'rfc' ? 'onprem-rfc' : 'onprem-http';
  }
  return { reason: 'the test config names no system_type' };
}

/** The text of an answer's first content, parsed; `undefined` when it is not JSON. */
function payloadOf(answer: { content?: Content } | undefined): any {
  const text = answer?.content?.[0]?.text;
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const textOf = (answer: { content?: Content } | undefined): string =>
  (answer?.content ?? []).map((c) => c.text ?? '').join('\n');

/** The first value of `key` anywhere in a parsed answer that `accept` takes. */
function fieldIn(
  value: unknown,
  key: string,
  accept: (found: unknown) => boolean,
  depth = 0,
): unknown {
  if (depth > 6 || value === null || typeof value !== 'object')
    return undefined;
  const own = (value as Record<string, unknown>)[key];
  if (accept(own)) return own;
  for (const inner of Object.values(value as Record<string, unknown>)) {
    const found = fieldIn(inner, key, accept, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The first integer `status` anywhere in a parsed answer. */
const statusIn = (value: unknown): number | undefined =>
  fieldIn(
    value,
    'status',
    (found) => typeof found === 'number' && Number.isInteger(found),
  ) as number | undefined;

/** A state handle is a bearer secret: it never reaches a log line. */
const withoutHandles = (text: string): string =>
  text.replace(/("state_handle"\s*:\s*")[^"]*"/g, '$1<handle>"');

const say = (kind: Kind, what: string, answered: unknown): void => {
  const text =
    typeof answered === 'string' ? answered : JSON.stringify(answered);
  process.stderr.write(
    `debugger-batch-live\t${kind}\t${what}\t${withoutHandles(String(text)).slice(0, 2000)}\n`,
  );
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- 1. the debugger batch through the served full server ---------------------------

/** The served full server over stdio, and the client calling it. */
type Served = {
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  /** Ends stdin and waits for the server's own exit; its code. */
  stop(): Promise<number | null>;
  stderrTail(): string;
};

async function serve(kind: Kind): Promise<Served> {
  const cfg = loadTestConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debugger-batch-'));
  const entry = path.join(dir, 'full-stdio.ts');
  fs.writeFileSync(
    entry,
    [
      `import { main, launcherFailedLine } from ${JSON.stringify(path.join(REPO, 'server/src/launcher'))};`,
      `import { CORE_VERSION } from ${JSON.stringify(path.join(REPO, 'server/src/coreVersion'))};`,
      `import { fullToolSet } from ${JSON.stringify(path.join(REPO, 'src/lib/toolSet'))};`,
      "void main({ toolSet: fullToolSet, program: 'mcp-abap-adt', version: CORE_VERSION }).catch((err) => {",
      '  console.error(launcherFailedLine(err));',
      '  process.exit(1);',
      '});',
      '',
    ].join('\n'),
  );

  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    cfg?.auth_broker?.unsafe === true ||
    cfg?.auth_broker?.unsafe_session_store === true;
  const envName = String(cfg.environment.env);
  const args = [
    path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
    '--tsconfig',
    path.join(REPO, 'tsconfig.test.json'),
    entry,
    ...(useUnsafe ? ['--unsafe'] : []),
  ];
  const brokerPath = testAuthBrokerPath(cfg);
  if (brokerPath) args.push(`--auth-broker-path=${brokerPath}`);
  args.push(
    /[\\/]/.test(envName) || envName.startsWith('.') || envName.startsWith('~')
      ? `--env-path=${path.resolve(envName)}`
      : `--env=${envName}`,
    `--connection-type=${kind === 'onprem-rfc' ? 'rfc' : 'http'}`,
  );

  const env: Record<string, string> = getDefaultEnvironment();
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      name === 'NODE_PATH' ||
      name.startsWith('DEBUG_') ||
      name.startsWith('SAP_DEBUG_') ||
      // RFC: the SDK and the libraries the addon loads.
      name === 'SAPNWRFC_HOME' ||
      name === 'LD_LIBRARY_PATH'
    ) {
      env[name] = value;
    }
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: REPO,
    env,
    stderr: 'pipe',
  });
  const tail: string[] = [];
  transport.stderr?.on('data', (chunk: Buffer) => {
    tail.push(...chunk.toString('utf8').split('\n'));
    if (tail.length > 200) tail.splice(0, tail.length - 200);
  });
  const client = new Client({ name: 'debugger-batch', version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `the server did not start (${String(error)}):\n${tail.join('\n')}`,
    );
  }
  const child = (transport as unknown as { _process?: ChildProcess })._process;
  if (child === undefined) throw new Error('the server process did not start');
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });

  return {
    call: async (name, callArgs = {}) =>
      (await client.callTool({ name, arguments: callArgs })) as Answer,
    stop: async () => {
      // stdin's end is the shutdown's trigger: every session logged off, then exit.
      child.stdin?.end();
      const code = await exited;
      await client.close().catch(() => undefined);
      fs.rmSync(dir, { recursive: true, force: true });
      return code;
    },
    stderrTail: () => tail.join('\n'),
  };
}

/** The line the debugger batch stops at in the shared class: inside its loop. */
const STOP_TEXT = 'lv_x = sy-index mod 100.';

async function debuggerBatchOn(kind: Kind, testCase: any): Promise<void> {
  const params = testCase.params ?? {};
  const className = String(
    params.class_name ?? 'ZMCP_SHR_PROF_CLS',
  ).toUpperCase();

  const served = await serve(kind);
  let handle: string | undefined;
  let batchOpen = false;
  let failure: unknown;
  try {
    // The target's line, read from the system: the shared class as it is there.
    const read = await served.call('GetClass', { class_name: className });
    if (read.isError === true) {
      throw new Error(
        `the shared class ${className} does not read (${textOf(read).slice(0, 300)}); create it with npm run shared:setup`,
      );
    }
    const source = String(payloadOf(read)?.source ?? textOf(read));
    const lines = source.split('\n');
    const index = lines.findIndex(
      (text) => text.trim().toLowerCase() === STOP_TEXT,
    );
    if (index < 0) {
      throw new Error(
        `the shared class ${className} has no line "${STOP_TEXT}"`,
      );
    }
    const stopLine = index + 1;

    const started = await served.call('DebugStartListener', {
      breakpoints: [
        { object_type: 'CLAS', object_name: className, line: stopLine },
      ],
      run: { kind: 'class', name: className },
    });
    const start = payloadOf(started);
    if (typeof start?.state_handle === 'string') handle = start.state_handle;
    say(kind, 'start', {
      isError: started.isError === true,
      request_user: start?.request_user,
      debugging_mode: start?.debugging_mode,
      placed: start?.breakpoints?.placed?.length,
      refused: start?.breakpoints?.refused,
    });
    expect(started.isError).not.toBe(true);
    expect(handle).toMatch(/^[0-9A-F]{32}$/);

    let stopped: any;
    for (let round = 0; round < 4 && stopped === undefined; round++) {
      const waited = await served.call('DebugWait', {
        state_handle: handle,
        hold_seconds: 30,
      });
      const state = payloadOf(waited);
      if (waited.isError === true || state?.state === 'ended') {
        throw new Error(
          `the debuggee was not stopped: ${withoutHandles(textOf(waited)).slice(0, 600)}`,
        );
      }
      if (state?.state === 'stopped') stopped = state;
    }
    say(kind, 'stopped at', stopped?.at);
    expect(stopped?.at?.address?.line).toBe(stopLine);
    expect(stopped?.at?.address?.object_name).toBe(className);

    const begun = await served.call('DebugBatchBegin', {});
    say(kind, 'begin', textOf(begun));
    expect(begun.isError).not.toBe(true);
    expect(payloadOf(begun)?.debug_batch).toBe('on');
    batchOpen = true;

    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [
      { tool: 'DebugStep', args: { state_handle: handle, action: 'over' } },
      { tool: 'DebugGetStack', args: { state_handle: handle } },
      {
        tool: 'DebugGetVariables',
        args: { state_handle: handle, names: ['LV_X'] },
      },
    ];
    const recordedAt = process.hrtime.bigint();
    for (const { tool, args } of calls) {
      const recorded = await served.call(tool, args);
      if (recorded.isError === true || (recorded.content ?? []).length > 0) {
        throw new Error(
          `${tool} was not recorded: ${withoutHandles(textOf(recorded)).slice(0, 600)}`,
        );
      }
    }
    const endAt = process.hrtime.bigint();
    const ended = await served.call('DebugBatchEnd', {});
    const endedAt = process.hrtime.bigint();
    batchOpen = false;
    const summary = payloadOf(ended) ?? {};
    say(kind, 'end', {
      summary,
      record_ms: Math.round(Number(endAt - recordedAt) / 1e6),
      end_ms: Math.round(Number(endedAt - endAt) / 1e6),
    });
    expect(ended.isError).not.toBe(true);
    expect(summary.recorded).toBe(calls.length);
    expect(summary.came).toBeUndefined();

    const entries = (payloadOf(
      await served.call('BatchAnswers', { numbers: [1, 2, 3] }),
    ) ?? []) as Entry[];
    for (const entry of entries) {
      say(kind, `answer #${entry.number}`, {
        isError: entry.isError === true,
        answer: payloadOf(entry) ?? textOf(entry),
      });
    }
    expect(entries.map((entry) => entry.number)).toEqual([1, 2, 3]);
    const failed = entries.filter((entry) => entry.isError === true);
    if (failed.length > 0) {
      throw new Error(
        failed
          .map(
            (entry) =>
              `#${entry.number} ${calls[entry.number - 1]?.tool}: ${withoutHandles(textOf(entry)).slice(0, 600)}`,
          )
          .join('\n'),
      );
    }
    expect(summary.failed).toEqual([]);

    // 1: the step answered, the program not ended by it.
    expect(payloadOf(entries[0])?.state).not.toBe('ended');
    // 2: the stack read after the step: the next line.
    expect(payloadOf(entries[1])?.at?.address?.line).toBe(stopLine + 1);
    // 3: the variable as the loop's first pass left it.
    const variables = payloadOf(entries[2]);
    expect(Array.isArray(variables)).toBe(true);
    const lvX = (variables as any[]).find(
      (v) => String(v?.name).toUpperCase() === 'LV_X',
    );
    expect(String(lvX?.value).trim()).toBe('1');
  } catch (error) {
    failure = error;
  } finally {
    const problems: string[] = [];
    try {
      if (batchOpen) {
        const ended = await served.call('DebugBatchEnd', {});
        if (ended.isError === true) {
          problems.push(
            `DebugBatchEnd in cleanup: ${withoutHandles(textOf(ended)).slice(0, 600)}`,
          );
        }
      }
      if (handle !== undefined) {
        const stopped = await served.call('DebugStop', {
          state_handle: handle,
        });
        say(kind, 'DebugStop', textOf(stopped));
        if (stopped.isError === true) {
          problems.push(
            `DebugStop: ${withoutHandles(textOf(stopped)).slice(0, 600)}`,
          );
        } else if (payloadOf(stopped)?.notes !== undefined) {
          problems.push(
            `DebugStop left notes: ${JSON.stringify(payloadOf(stopped)?.notes).slice(0, 600)}`,
          );
        }
      }
    } catch (error) {
      problems.push(`cleanup: ${String(error)}`);
    }
    const code = await served.stop();
    say(kind, 'server exit', String(code));
    if (code !== 0) {
      problems.push(
        `the server exited ${code}, not 0: not every session was logged off cleanly.\n${served.stderrTail()}`,
      );
    }
    if (failure !== undefined) {
      if (problems.length > 0) {
        process.stderr.write(
          `debugger batch cleanup:\n${problems.join('\n')}\n`,
        );
      }
      throw failure;
    }
    if (problems.length > 0) throw new Error(problems.join('\n'));
  }
}

// --- 2. the AMDP gate, in process ------------------------------------------------------

function amdpDdlSource(ddl: string, cls: string): string {
  return `@EndUserText.label: 'AMDP debugger batch probe table function'
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

/** `-- BP:tf` names the SQLScript line the AMDP case stops at. */
function amdpClassSource(cls: string, ddl: string): string {
  const n = cls.toLowerCase();
  return `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.
    INTERFACES if_oo_adt_classrun.
    CLASS-METHODS tf FOR TABLE FUNCTION ${ddl.toLowerCase()}.
ENDCLASS.

CLASS ${n} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    SELECT * FROM ${ddl.toLowerCase()}( p_limit = 3 ) INTO TABLE @DATA(lt_rows).
    out->write( |rows { lines( lt_rows ) }| ).
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

type Local = { isError: boolean; text: string; json: any };

/** A part's answer as the record shows it: a document, or a wire answer's status and Location. */
function shownValue(value: unknown): unknown {
  if (typeof value === 'string') return value;
  const wire = value as { status?: unknown; headers?: Record<string, unknown> };
  return { status: wire?.status, location: wire?.headers?.location };
}

async function local(
  handler: (ctx: HandlerContext, args: any) => any,
  ctx: HandlerContext,
  args: Record<string, unknown>,
): Promise<Local> {
  const r: any = await handler(ctx, args);
  const text = (r?.content ?? [])
    .map((c: any) => String(c?.text ?? ''))
    .join('\n');
  let json: any;
  try {
    json = JSON.parse(String(r?.content?.[0]?.text ?? ''));
  } catch {
    json = undefined;
  }
  return { isError: r?.isError === true, text, json };
}

/** Thrown when the AMDP case cannot run on this system: its message says why. */
class Skip extends Error {}

async function amdpGateOn(kind: Kind, testCase: any): Promise<void> {
  const params = testCase.params ?? {};
  const cls = String(params.amdp_class ?? 'ZMCP_DBB_AMDP').toUpperCase();
  const ddl = String(params.amdp_ddl ?? 'ZMCP_DBB_AMDP_TF').toUpperCase();
  const pkg = String(params.amdp_package ?? '$TMP');
  const logger = createTestLogger('debugger-batch-amdp');

  const { connection } = await createTestConnectionAndSession();
  const plain = createHandlerContext({ connection, logger });
  let created = false;
  let state: InstanceState | undefined;
  let dbg: DebuggerInstance | undefined;
  let handle: string | undefined;
  let failure: unknown;
  try {
    // The names are free: nothing is created over an object that exists.
    for (const [what, read] of [
      [`CLASS ${cls}`, await local(handleGetClass, plain, { class_name: cls })],
      [`DDLS ${ddl}`, await local(handleGetDdl, plain, { ddl_name: ddl })],
    ] as Array<[string, Local]>) {
      if (!read.isError || statusIn(read.json) !== 404) {
        throw new Error(
          `${what} is not free (its read answered: ${read.text.slice(0, 300)}); nothing is created`,
        );
      }
    }

    // The probe: the two name each other — shells, bodies, one group activation.
    const source = amdpClassSource(cls, ddl);
    const tfLine =
      source.split('\n').findIndex((text) => text.includes('-- BP:tf')) + 1;
    created = true;
    const shells = [
      await local(handleCreateDdl, plain, {
        ddl_name: ddl,
        package_name: pkg,
        description: 'AMDP debugger batch probe',
      }),
      await local(handleCreateClass, plain, {
        class_name: cls,
        package_name: pkg,
        description: 'AMDP debugger batch probe',
      }),
    ];
    const bodies = [
      await local(handleUpdateDdl, plain, {
        ddl_name: ddl,
        ddl_source: amdpDdlSource(ddl, cls),
      }),
      await local(handleUpdateClass, plain, {
        class_name: cls,
        source_code: source,
      }),
    ];
    const activated = await local(handleActivateObjects, plain, {
      objects: [
        { name: ddl, type: 'DDLS' },
        { name: cls, type: 'CLAS' },
      ],
    });
    const setup = [...shells, ...bodies, activated];
    if (setup.some((a) => a.isError) || activated.json?.activated !== true) {
      throw new Skip(
        `the AMDP probe does not activate here (an AMDP needs a system on HANA): ${setup
          .map((a) => a.text.slice(0, 300))
          .join(' / ')}`,
      );
    }

    // The AMDP debug session, stopped in the table function.
    state = new InstanceState({ logger: stderrStateLogger });
    const ctx: HandlerContext = {
      ...plain,
      state,
      debugger: () => {
        if (!dbg) {
          dbg = createDebuggerInstance({
            terminalId: newDebuggerId(),
            ideId: newDebuggerId(),
            stated: false,
          });
          (state as InstanceState).attach(dbg);
        }
        return dbg;
      },
    };
    const started = await local(handleAmdpDebugStart, ctx, {
      breakpoints: [{ class_name: cls, line: tfLine }],
      run: { kind: 'class', name: cls },
    });
    if (typeof started.json?.state_handle === 'string')
      handle = started.json.state_handle;
    say(kind, 'amdp start', {
      isError: started.isError,
      answer: started.isError ? started.text.slice(0, 600) : undefined,
    });
    expect(started.isError).toBe(false);

    let onBreak: any;
    for (let round = 0; round < 8 && onBreak === undefined; round++) {
      const waited = await local(handleAmdpDebugWait, ctx, {
        state_handle: handle,
        hold_seconds: 30,
      });
      if (waited.isError || waited.json?.state === 'ended') {
        throw new Error(
          `no AMDP break: ${withoutHandles(waited.text).slice(0, 600)}`,
        );
      }
      onBreak = (waited.json?.events ?? []).find(
        (e: any) => e?.kind === 'ON_BREAK',
      );
    }
    say(kind, 'amdp break', { line: onBreak?.line });
    expect(onBreak?.line).toBe(tfLine);

    // The session's own ids and its command connection: what an AMDP
    // debugger batch would record on.
    const amdp = (dbg as DebuggerInstance).amdp as unknown as {
      open?: {
        commands: IAbapConnection;
        mainId: string;
        hanaSession: string;
      };
      debuggeeId?: string;
    };
    const open = amdp.open;
    const debuggeeId = amdp.debuggeeId;
    if (open === undefined || debuggeeId === undefined) {
      throw new Error('the AMDP session holds no break to record at');
    }
    const batch = new AdtBatchConnection(open.commands, {
      endpoint: 'debugger',
    });
    const recording = new AmdpDebugger(batch);
    const preview = recording.getDataPreview({
      sessionId: open.hanaSession,
      debuggerId: open.mainId,
      debuggeeId,
      variableName: 'LT_ROWS',
      rowNumber: 100,
      headers: DEFAULT_ADT_HEADERS['amdpDebugger.getDataPreview'],
    });
    const step = recording.step(open.mainId, debuggeeId, 'over');
    // Both parts are recorded before the envelope goes.
    await new Promise((r) => setImmediate(r));
    const parts = Promise.allSettled([preview, step]);
    let envelope: { status?: number } | undefined;
    let envelopeThrew: string | undefined;
    try {
      envelope = (await batch.execute()) as { status?: number };
    } catch (error) {
      envelopeThrew = error instanceof Error ? error.message : String(error);
    }
    // A part's promise settles only with the envelope's answer: after a
    // throw of the envelope it may never settle, so it is not awaited then.
    const settledParts = envelopeThrew
      ? undefined
      : await Promise.race([parts, pause(120_000).then(() => undefined)]);
    if (settledParts === undefined) {
      say(kind, 'amdp envelope', {
        threw: envelopeThrew,
        parts: 'not settled',
      });
      throw new Error(
        `the AMDP debugger batch envelope: ${envelopeThrew ?? 'its parts did not settle'}`,
      );
    }
    const [previewed, stepped] = settledParts as [
      PromiseSettledResult<any>,
      PromiseSettledResult<any>,
    ];
    const partOf = (settled: PromiseSettledResult<any>) =>
      settled.status === 'rejected'
        ? { threw: String(settled.reason?.message ?? settled.reason) }
        : settled.value.ok
          ? { ok: true, value: shownValue(settled.value.getResult().value) }
          : {
              ok: false,
              status: settled.value.getError().status,
              error: settled.value.getError().message,
            };
    const previewPart = partOf(previewed);
    const stepPart = partOf(stepped);
    say(kind, 'amdp envelope', {
      status: envelope?.status,
      threw: envelopeThrew,
    });
    say(kind, 'amdp part 1 (data preview)', previewPart);
    say(kind, 'amdp part 2 (step over)', stepPart);
    expect(envelopeThrew).toBeUndefined();
    expect(previewPart.ok).toBe(true);
    expect(stepPart.ok).toBe(true);

    // The step took effect: the debuggee moved on to its next event.
    let next: any;
    for (let round = 0; round < 4 && next === undefined; round++) {
      const waited = await local(handleAmdpDebugWait, ctx, {
        state_handle: handle,
        hold_seconds: 30,
      });
      if (waited.isError) {
        throw new Error(
          `the wait after the envelope: ${withoutHandles(waited.text).slice(0, 600)}`,
        );
      }
      next = (waited.json?.events ?? []).find(
        (e: any) => e?.kind === 'ON_BREAK' || e?.kind === 'ON_EXECUTION_END',
      );
    }
    say(kind, 'amdp after the envelope', {
      kind: next?.kind,
      line: next?.line,
    });
    expect(['ON_BREAK', 'ON_EXECUTION_END']).toContain(next?.kind);
  } catch (error) {
    failure = error;
  } finally {
    const problems: string[] = [];
    try {
      if (state !== undefined && handle !== undefined) {
        const ctx: HandlerContext = {
          ...plain,
          state,
          debugger: () => dbg as DebuggerInstance,
        };
        const stopped = await local(handleAmdpDebugStop, ctx, {
          state_handle: handle,
        });
        say(kind, 'AmdpDebugStop', withoutHandles(stopped.text));
        if (stopped.isError) {
          problems.push(
            `AmdpDebugStop: ${withoutHandles(stopped.text).slice(0, 600)}`,
          );
        }
        const amdpSession = (dbg as DebuggerInstance).amdp;
        for (let i = 0; i < 240 && amdpSession.holdsState(); i++)
          await pause(250);
        if (amdpSession.holdsState())
          problems.push('the AMDP session still holds state after its stop');
      }
      if (state !== undefined) {
        const left = await state.shutdown();
        if (left.length > 0)
          problems.push(`instance shutdown left: ${left.join('; ')}`);
      }
      if (created) {
        for (const [what, deleted] of [
          [
            `CLASS ${cls}`,
            await local(handleDeleteClass, plain, { class_name: cls }),
          ],
          [
            `DDLS ${ddl}`,
            await local(handleDeleteDdl, plain, { ddl_name: ddl }),
          ],
        ] as Array<[string, Local]>) {
          if (deleted.isError && statusIn(deleted.json) !== 404)
            problems.push(`delete ${what}: ${deleted.text.slice(0, 300)}`);
        }
        for (const [what, read] of [
          [
            `CLASS ${cls}`,
            await local(handleGetClass, plain, { class_name: cls }),
          ],
          [`DDLS ${ddl}`, await local(handleGetDdl, plain, { ddl_name: ddl })],
        ] as Array<[string, Local]>) {
          const status = read.isError ? statusIn(read.json) : 200;
          say(kind, `after delete ${what}`, String(status));
          if (status !== 404)
            problems.push(`${what} still reads (${status}): not deleted`);
        }
      }
    } catch (error) {
      problems.push(`cleanup: ${String(error)}`);
    }
    // The test's own connection is tracked (`createTestConnectionAndSession`):
    // the setup file logs it off when the file ends.
    if (failure instanceof Skip && problems.length === 0) {
      testLogger?.info(`⏭️  Skipping the AMDP gate: ${failure.message}`);
      say(kind, 'amdp skipped', failure.message);
      return;
    }
    if (failure !== undefined) {
      if (problems.length > 0) {
        process.stderr.write(`AMDP gate cleanup:\n${problems.join('\n')}\n`);
      }
      throw failure;
    }
    if (problems.length > 0) throw new Error(problems.join('\n'));
  }
}

// --- the cases ---------------------------------------------------------------------------

/** The case's test config entry, or why the case skips. */
function whereItRuns(
  kind: Kind,
  what: string,
): { testCase: any } | { reason: string } {
  const configured = configuredKind();
  if (typeof configured !== 'string') return { reason: configured.reason };
  if (configured !== kind) {
    return {
      reason: `the test config names ${KIND_WORDS[configured]}; ${what} runs only there`,
    };
  }
  const testCase = getEnabledTestCase('batch', 'debugger');
  if (!testCase) {
    return {
      reason: 'batch.test_cases.debugger is not enabled in the test config',
    };
  }
  return { testCase };
}

describe('the debugger batch at a live stop, on the system the test config names', () => {
  const kinds: Kind[] = ['onprem-http', 'onprem-rfc', 'cloud'];
  for (const kind of kinds) {
    it(
      `${KIND_WORDS[kind]}: step, stack and variables in one DebugBatchEnd; answers per number; debugger state removed`,
      async () => {
        const where = whereItRuns(kind, 'this case');
        if ('reason' in where) {
          testLogger?.info(`⏭️  Skipping ${KIND_WORDS[kind]}: ${where.reason}`);
          return;
        }
        await debuggerBatchOn(kind, where.testCase);
      },
      getTimeout('long'),
    );
  }

  for (const kind of kinds) {
    it(
      `${KIND_WORDS[kind]}: the AMDP gate — AMDP data preview and step in one debugger batch envelope at an AMDP break (on premise on HANA)`,
      async () => {
        if (kind === 'cloud') {
          testLogger?.info(
            '⏭️  Skipping the AMDP gate on ABAP Cloud: it is measured on premise on HANA',
          );
          return;
        }
        const where = whereItRuns(kind, 'the AMDP gate');
        if ('reason' in where) {
          testLogger?.info(
            `⏭️  Skipping the AMDP gate ${KIND_WORDS[kind]}: ${where.reason}`,
          );
          return;
        }
        await amdpGateOn(kind, where.testCase);
      },
      getTimeout('long'),
    );
  }
});

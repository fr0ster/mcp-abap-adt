/**
 * The debugger batch at a live stop (spec §7, §9.3, plan Tasks 29 and 29a),
 * on the configured system: at an ABAP stop and at an AMDP break.
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
 * 2. **The AMDP debugger batch** — on premise only, over either transport,
 *    on a system that runs AMDP debugging (HANA). ABAP Cloud skips. Hard
 *    mode, as case 1: the served full server over stdio, at the shared AMDP
 *    pair (`shared_dependencies`: the class `ZMCP_SHR_DBG_AMDP` with a
 *    SQLScript table function, and its DDL source `ZMCP_SHR_DBG_TF`; created
 *    once by `npm run shared:setup`, never deleted). The case only reads and
 *    runs them. It skips only where SAP's system information (read on the
 *    test's own connection) names a database system other than HANA
 *    (`DBSystem` not `HDB`), naming it; a pair that has no active version,
 *    or a class without its breakpoint marker, fails it. Then
 *    `AmdpDebugStart` with a breakpoint in the table function and a run of
 *    the class (`stop_existing` false), `AmdpDebugWait` until `ON_BREAK`,
 *    `DebugBatchBegin` at the AMDP break, `AmdpDebugGetTable` of the table
 *    variable and `AmdpDebugStep` over — each answers nothing; one
 *    `DebugBatchEnd`; then `BatchAnswers` 1–2: the rows, the step. It passes
 *    when both answers are ok and the debuggee moves on to its next event
 *    (`AmdpDebugWait`: the step took effect).
 *
 * Cleanup, in `finally`, whatever happened, each step in its own `finally`:
 * an open debugger batch ended, then `DebugStop` / `AmdpDebugStop` (the
 * debuggee released, the breakpoints removed, the listener or the AMDP
 * session stopped), each answer checked; then the served server's
 * shutdown, which logs off every session it opened (stdin ended, exit `0`
 * asserted). The shared objects are left as they are. The test's own
 * connection is logged off by the setup file's close of tracked
 * connections.
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
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
import type { HandlerContext } from '../../../handlers/interfaces';
import { amdpGateVerdict, type FixtureRead } from '../helpers/amdpFixture';
import {
  getEnabledTestCase,
  getTimeout,
  loadTestConfig,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../helpers/sessionHelpers';
import {
  readSessionTrace,
  SESSION_TRACE_PREAMBLE,
} from '../helpers/sessionTrace';
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

// --- 1. the debugger batch through the served full server ---------------------------

/** The served full server over stdio, and the client calling it. */
type Served = {
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  /** Ends stdin and waits for the server's own exit; its code. */
  stop(): Promise<number | null>;
  stderrTail(): string;
  /** The session trace's lines (`DEBUGGER_BATCH_SESSION_TRACE=1`), in order. */
  sessionTrace(): string[];
};

/**
 * Whether the served server traces its ABAP sessions: an owner's run sets
 * `DEBUGGER_BATCH_SESSION_TRACE=1`. Off, nothing is traced or checked.
 */
const TRACE_SESSIONS = process.env.DEBUGGER_BATCH_SESSION_TRACE === '1';

async function serve(kind: Kind): Promise<Served> {
  const cfg = loadTestConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debugger-batch-'));
  const entry = path.join(dir, 'full-stdio.ts');
  fs.writeFileSync(
    entry,
    [
      ...(TRACE_SESSIONS ? SESSION_TRACE_PREAMBLE : []),
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
  const traced: string[] = [];
  let pending = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    const text = pending + chunk.toString('utf8');
    const lines = text.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines)
      if (line.startsWith('session-trace\t')) traced.push(line);
      else tail.push(line);
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
    sessionTrace: () => [...traced],
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

    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [
      { tool: 'DebugStep', args: { state_handle: handle, action: 'over' } },
      { tool: 'DebugGetStack', args: { state_handle: handle } },
      {
        tool: 'DebugGetVariables',
        args: { state_handle: handle, names: ['LV_X'] },
      },
    ];
    const begun = await served.call('DebugBatchBegin', {});
    say(kind, 'begin', textOf(begun));
    expect(begun.isError).not.toBe(true);
    expect(payloadOf(begun)?.debug_batch).toBe('on');
    batchOpen = true;
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
    expect(summary.failed).toEqual([]);
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
    if (TRACE_SESSIONS) {
      const trace = readSessionTrace(served.sessionTrace());
      process.stderr.write(
        `debugger-batch-live\t${kind}\tsession trace\t${JSON.stringify(trace)}\n`,
      );
      problems.push(...trace.problems);
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

/** SAP's system information: where the database system is named. */
async function readSystemInformation(
  connection: IAbapConnection,
): Promise<FixtureRead> {
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
}

type Local = { isError: boolean; text: string; json: any };

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

/** A read of a shared object's active source, as a status and its text. */
function fixtureRead(read: Local): FixtureRead {
  if (read.isError) {
    return { status: statusIn(read.json) ?? 0, text: read.text };
  }
  return { status: 200, text: String(read.json?.source ?? '') };
}

async function amdpBatchOn(kind: Kind, testCase: any): Promise<void> {
  const params = testCase.params ?? {};
  const cls = String(params.amdp_class ?? 'ZMCP_SHR_DBG_AMDP').toUpperCase();
  const ddl = String(params.amdp_ddl ?? 'ZMCP_SHR_DBG_TF').toUpperCase();
  const logger = createTestLogger('debugger-batch-amdp');

  // The test's own connection is tracked (`createTestConnectionAndSession`):
  // the setup file logs it off when the file ends, whatever happens here.
  const { connection } = await createTestConnectionAndSession();
  const plain = createHandlerContext({ connection, logger });

  // The shared pair (`shared_dependencies`): read, never written. The case
  // skips only where SAP's own system information names a database system
  // other than HANA; any other reason it cannot run fails it.
  const verdict = amdpGateVerdict({
    systemInformation: await readSystemInformation(connection),
    className: cls,
    classRead: fixtureRead(
      await local(handleGetClass, plain, { class_name: cls }),
    ),
    ddlName: ddl,
    ddlRead: fixtureRead(await local(handleGetDdl, plain, { ddl_name: ddl })),
  });
  if ('skip' in verdict) {
    testLogger?.info(`⏭️  Skipping the AMDP debugger batch: ${verdict.skip}`);
    say(kind, 'amdp skipped', verdict.skip);
    return;
  }
  if ('fail' in verdict) throw new Error(verdict.fail);
  const tfLine = verdict.breakpointLine;

  const served = await serve(kind);
  let handle: string | undefined;
  let batchOpen = false;
  let failure: unknown;
  /** AmdpDebugWait until an event of `kinds`; the event, or why there is none. */
  const eventOf = async (kinds: string[], rounds: number): Promise<any> => {
    for (let round = 0; round < rounds; round++) {
      const waited = await served.call('AmdpDebugWait', {
        state_handle: handle,
        hold_seconds: 30,
      });
      const state = payloadOf(waited);
      if (waited.isError === true || state?.state === 'ended') {
        throw new Error(
          `no AMDP event of ${kinds.join(', ')}: ${withoutHandles(textOf(waited)).slice(0, 600)}`,
        );
      }
      const hit = (state?.events ?? []).find((e: any) =>
        kinds.includes(e?.kind),
      );
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  try {
    const started = await served.call('AmdpDebugStart', {
      stop_existing: false,
      breakpoints: [{ class_name: cls, line: tfLine }],
      run: { kind: 'class', name: cls },
    });
    const start = payloadOf(started);
    if (typeof start?.state_handle === 'string') handle = start.state_handle;
    say(kind, 'amdp start', {
      isError: started.isError === true,
      answer:
        started.isError === true
          ? withoutHandles(textOf(started)).slice(0, 600)
          : undefined,
    });
    expect(started.isError).not.toBe(true);
    expect(handle).toMatch(/^[0-9A-F]{32}$/);

    const onBreak = await eventOf(['ON_BREAK'], 8);
    say(kind, 'amdp break', { line: onBreak?.line });
    expect(onBreak?.line).toBe(tfLine);

    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [
      {
        tool: 'AmdpDebugGetTable',
        args: { state_handle: handle, variable: 'LT_ROWS' },
      },
      { tool: 'AmdpDebugStep', args: { state_handle: handle, action: 'over' } },
    ];
    const begun = await served.call('DebugBatchBegin', {});
    say(kind, 'amdp begin', textOf(begun));
    expect(begun.isError).not.toBe(true);
    expect(payloadOf(begun)?.debug_batch).toBe('on');
    batchOpen = true;
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
    say(kind, 'amdp end', {
      summary,
      end_ms: Math.round(Number(endedAt - endAt) / 1e6),
    });
    expect(ended.isError).not.toBe(true);
    expect(summary.recorded).toBe(calls.length);
    expect(summary.came).toBeUndefined();
    expect(summary.failed).toEqual([]);
    const entries = (payloadOf(
      await served.call('BatchAnswers', { numbers: [1, 2] }),
    ) ?? []) as Entry[];
    for (const entry of entries) {
      say(kind, `amdp answer #${entry.number}`, {
        isError: entry.isError === true,
        answer: payloadOf(entry) ?? textOf(entry),
      });
    }
    expect(entries.map((entry) => entry.number)).toEqual([1, 2]);
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
    // 1: the rows of the table variable.
    expect(Array.isArray(payloadOf(entries[0]))).toBe(true);
    // 2: the step answered.
    expect(payloadOf(entries[1])?.state).toBe('moving');

    // The step took effect: the debuggee moved on to its next event.
    const next = await eventOf(['ON_BREAK', 'ON_EXECUTION_END'], 4);
    say(kind, 'amdp after the envelope', {
      kind: next?.kind,
      line: next?.line,
    });
    expect(['ON_BREAK', 'ON_EXECUTION_END']).toContain(next?.kind);
  } catch (error) {
    failure = error;
  } finally {
    // Each step whatever the one before it did: the batch ended, the AMDP
    // session stopped, the served server shut down — its shutdown logs off
    // every session it opened. The shared pair is never deleted.
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
    } catch (error) {
      problems.push(`DebugBatchEnd threw: ${withoutHandles(String(error))}`);
    } finally {
      try {
        if (handle !== undefined) {
          const stopped = await served.call('AmdpDebugStop', {
            state_handle: handle,
          });
          say(kind, 'AmdpDebugStop', withoutHandles(textOf(stopped)));
          if (stopped.isError === true) {
            problems.push(
              `AmdpDebugStop: ${withoutHandles(textOf(stopped)).slice(0, 600)}`,
            );
          }
        }
      } catch (error) {
        problems.push(`AmdpDebugStop threw: ${withoutHandles(String(error))}`);
      } finally {
        const code = await served.stop();
        say(kind, 'server exit', String(code));
        if (code !== 0) {
          problems.push(
            `the server exited ${code}, not 0: not every session was logged off cleanly.\n${served.stderrTail()}`,
          );
        }
        if (TRACE_SESSIONS) {
          const trace = readSessionTrace(served.sessionTrace());
          process.stderr.write(
            `debugger-batch-live\t${kind}\tamdp session trace\t${JSON.stringify(trace)}\n`,
          );
          problems.push(...trace.problems);
        }
      }
    }
    if (failure !== undefined) {
      if (problems.length > 0) {
        process.stderr.write(
          `AMDP debugger batch cleanup:\n${problems.join('\n')}\n`,
        );
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
      `${KIND_WORDS[kind]}: the AMDP debugger batch — DebugBatchBegin at an AMDP break, the data preview and a step recorded, one DebugBatchEnd, answers per number (on premise on HANA)`,
      async () => {
        if (kind === 'cloud') {
          testLogger?.info(
            '⏭️  Skipping the AMDP debugger batch on ABAP Cloud: it runs on premise on HANA',
          );
          return;
        }
        const where = whereItRuns(kind, 'the AMDP debugger batch');
        if ('reason' in where) {
          testLogger?.info(
            `⏭️  Skipping the AMDP debugger batch ${KIND_WORDS[kind]}: ${where.reason}`,
          );
          return;
        }
        await amdpBatchOn(kind, where.testCase);
      },
      getTimeout('long'),
    );
  }
});

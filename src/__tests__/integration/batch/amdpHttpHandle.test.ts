/**
 * The AMDP debugger batch over Streamable HTTP, behind one state handle
 * (spec §2, §7): the server as a user runs it — the HTTP launcher from
 * source (tsx with `tsconfig.test.json`'s package paths), every request
 * carrying its credentials in `x-sap-*` headers — and a plain MCP client.
 *
 * Where it runs: on premise over HTTP, on a system that runs AMDP (HANA),
 * when the case `batch.test_cases.amdp_http_handle` is enabled; a session
 * whose authentication is not a user and a password (the headers this test
 * sends) skips, saying why. It reads and runs the shared AMDP pair
 * (`shared_dependencies`: `ZMCP_SHR_DBG_AMDP`, `ZMCP_SHR_DBG_TF`; created
 * once by `npm run shared:setup`), and skips only where SAP's system
 * information names a database system other than HANA. Nothing else may
 * debug for the same SAP user while it runs.
 *
 * The run: `AmdpDebugStart` (stop_existing false) answers the state handle;
 * every later call sends it in `x-mcp-state-handle`: `AmdpDebugWait` until
 * `ON_BREAK`, `DebugBatchBegin` (the handle it answers is the same),
 * `AmdpDebugGetTable` and `AmdpDebugStep` over — each answers nothing —,
 * `DebugBatchEnd`, `BatchAnswers` 1–2, the debuggee's next event,
 * `AmdpDebugStop`. Then the state has ended, the debugger batch's kept
 * answers with it: a call over the handle answers `state is not available`,
 * as for an unknown handle. Then `SIGTERM` to the server's process (a graceful
 * shutdown), exit `0`.
 *
 * The session trace is on: after the exit every security session the
 * server opened must hold at most one ABAP context, a stateless one none,
 * and each must have been logged off, its logoff answered 200 before the
 * exit (`readSessionTrace`).
 *
 * Cleanup, each step in its own `finally`, whatever happened: an open batch
 * ended, `AmdpDebugStop`, the server's shutdown. The test's own in-process
 * connection (the HANA check, the shared reads) is logged off by the setup
 * file's close of tracked connections, its logoff let finish.
 *
 * Run: npm test -- src/__tests__/integration/batch/amdpHttpHandle.test.ts --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as dotenv from 'dotenv';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
import type { HandlerContext } from '../../../handlers/interfaces';
import { repositoryRoot } from '../../helpers/repoRoot';
import {
  amdpGateVerdict,
  databaseSource,
  type FixtureRead,
} from '../helpers/amdpFixture';
import {
  getEnabledTestCase,
  getStatedDatabaseSystem,
  loadTestConfig,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { stderrTail } from '../helpers/failureText';
import { assertEquals, isUpperHex } from '../helpers/liveAssert';
import { createTestLogger } from '../helpers/loggerHelpers';
import { skipRunningTest } from '../helpers/runningTest';
import { createTestConnectionAndSession } from '../helpers/sessionHelpers';
import {
  readSessionTrace,
  SESSION_TRACE_PREAMBLE,
} from '../helpers/sessionTrace';
import {
  type HardModeClient,
  launchHttpScript,
  testConnectionLogOn,
} from '../helpers/testers/hardMode';
import { createHandlerContext } from '../helpers/testHelpers';

const REPO = repositoryRoot(__dirname);
const testLogger = createTestLogger('amdp-http-handle');

type Content = Array<{ type: string; text?: string }>;
type Answer = { content?: Content; isError?: boolean };
type Entry = { number: number; content?: Content; isError?: boolean };

const textOf = (answer: { content?: Content } | undefined): string =>
  (answer?.content ?? []).map((c) => c.text ?? '').join('\n');
function payloadOf(answer: { content?: Content } | undefined): any {
  try {
    return JSON.parse(answer?.content?.[0]?.text ?? '');
  } catch {
    return undefined;
  }
}
/** A state handle is a bearer secret: it never reaches a log line. */
const withoutHandles = (text: string): string =>
  text.replace(/("state_handle"\s*:\s*")[^"]*"/g, '$1<handle>"');
const say = (what: string, answered: unknown): void => {
  const text =
    typeof answered === 'string' ? answered : JSON.stringify(answered);
  process.stderr.write(
    `amdp-http-handle\t${new Date().toISOString()}\t${what}\t${withoutHandles(String(text))}\n`,
  );
};

/** Where the case runs, or why it skips. */
function whereItRuns():
  | { testCase: any; headers: Record<string, string>; systemType: string }
  | { reason: string } {
  let cfg: any;
  try {
    cfg = loadTestConfig();
  } catch (error) {
    return { reason: `the test config cannot be read (${String(error)})` };
  }
  const env = cfg?.environment ?? {};
  const system = String(env.system_type ?? '').trim();
  const transport = String(env.connection_type ?? 'http').toLowerCase();
  if (system !== 'onprem' && system !== 'legacy')
    return { reason: 'the test config names no on-premise system' };
  if (transport !== 'http')
    return { reason: 'the test config names RFC; this case runs over HTTP' };
  const testCase = getEnabledTestCase('batch', 'amdp_http_handle');
  if (!testCase)
    return {
      reason:
        'batch.test_cases.amdp_http_handle is not enabled in the test config',
    };
  const envName = String(env.env ?? '');
  if (!envName)
    return {
      reason: 'the test config names no session file (environment.env)',
    };
  const file =
    /[\\/]/.test(envName) || envName.startsWith('.') || envName.startsWith('~')
      ? path.resolve(envName.replace(/^~/, os.homedir()))
      : path.join(
          testAuthBrokerPath(cfg) ??
            path.join(os.homedir(), '.config/mcp-abap-adt'),
          'sessions',
          envName,
        );
  if (!fs.existsSync(file))
    return { reason: 'the session file the test config names does not exist' };
  const session = dotenv.parse(fs.readFileSync(file));
  if (
    String(session.SAP_AUTH_TYPE ?? '').toLowerCase() !== 'basic' ||
    !session.SAP_USERNAME ||
    !session.SAP_PASSWORD ||
    !session.SAP_URL
  )
    return {
      reason:
        'the session is not a user and a password: this case sends x-sap-login and x-sap-password',
    };
  return {
    testCase,
    systemType: system,
    headers: {
      'x-sap-url': session.SAP_URL,
      ...(session.SAP_CLIENT ? { 'x-sap-client': session.SAP_CLIENT } : {}),
      'x-sap-login': session.SAP_USERNAME,
      'x-sap-password': session.SAP_PASSWORD,
    },
  };
}

/** The HTTP server from source, with the session trace; its trace lines kept apart. */
async function serveHttp(systemType: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amdp-http-handle-'));
  const entry = path.join(dir, 'full-http.ts');
  fs.writeFileSync(
    entry,
    [
      ...SESSION_TRACE_PREAMBLE,
      `import { main } from ${JSON.stringify(path.join(REPO, 'server-runtime/src/http/launcher'))};`,
      `import { HTTP_VERSION } from ${JSON.stringify(path.join(REPO, 'http/src/httpVersion'))};`,
      `import { fullToolSet } from ${JSON.stringify(path.join(REPO, 'src/lib/toolSet'))};`,
      "void main({ toolSet: fullToolSet, program: 'mcp-abap-adt-http', version: HTTP_VERSION }).catch(() => {",
      "  console.error('[MCP] launcher failed');",
      '  process.exit(1);',
      '});',
      '',
    ].join('\n'),
  );
  // Guarded: the parent logs on first, the child is ready at its listening
  // line, and every session's answers are read for a credential refusal
  // (launchHttpScript); no SDK client, no timer, no polling.
  const server = await launchHttpScript({
    argv: [
      path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      path.join(REPO, 'tsconfig.test.json'),
      entry,
      // Port 0: the server announces the port the system chose.
      '--port=0',
      '--host=127.0.0.1',
      `--system-type=${systemType}`,
    ],
    env: environment(),
    path: '/mcp/stream/http',
    logOn: testConnectionLogOn,
  });
  // Its stderr for a failure, the configuration banner left out.
  const kept = stderrTail(server.child);
  return {
    session: (headers: Record<string, string>) => server.session(headers),
    trace: () => kept.trace(),
    tail: () => kept.text(),
    /** SIGTERM (tsx forwards it to the server): the graceful shutdown; the exit code. */
    stop: async (): Promise<number | null> => {
      const code = await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
      return code;
    },
  };
}

/** The environment the server runs with: this process's own, as strings. */
function environment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  return env;
}

async function readSystemInformation(connection: any): Promise<FixtureRead> {
  try {
    const answered = await connection.makeAdtRequest({
      url: '/sap/bc/adt/system/information',
      method: 'GET',
      timeout: 0,
      headers: { Accept: 'application/atom+xml;type=feed' },
    });
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

async function sourceRead(
  handler: (ctx: HandlerContext, args: any) => any,
  ctx: HandlerContext,
  args: Record<string, unknown>,
): Promise<FixtureRead> {
  const r: any = await handler(ctx, args);
  if (r?.isError === true) return { status: 0, text: textOf(r) };
  return { status: 200, text: String(payloadOf(r)?.source ?? '') };
}

describe('the AMDP debugger batch over Streamable HTTP, behind one state handle', () => {
  it('AmdpDebugStart, the break, DebugBatchBegin, the recorded AMDP calls, DebugBatchEnd and BatchAnswers over one x-mcp-state-handle; AmdpDebugStop, the state ended, a graceful shutdown; every session logged off', async () => {
    const where = whereItRuns();
    if ('reason' in where) {
      skipRunningTest(`${where.reason}`);
      return;
    }
    const params = where.testCase.params ?? {};
    const cls = String(params.amdp_class ?? 'ZMCP_SHR_DBG_AMDP').toUpperCase();
    const ddl = String(params.amdp_ddl ?? 'ZMCP_SHR_DBG_TF').toUpperCase();

    // The shared pair, read in process; the check skips only off HANA.
    const { connection } = await createTestConnectionAndSession();
    const plainCtx = createHandlerContext({ connection, logger: testLogger });
    const verdict = amdpGateVerdict({
      database: await databaseSource(getStatedDatabaseSystem(), () =>
        readSystemInformation(connection),
      ),
      className: cls,
      classRead: await sourceRead(handleGetClass, plainCtx, {
        class_name: cls,
      }),
      ddlName: ddl,
      ddlRead: await sourceRead(handleGetDdl, plainCtx, { ddl_name: ddl }),
    });
    if ('skip' in verdict) {
      skipRunningTest(`${verdict.skip}`);
      return;
    }
    if ('fail' in verdict) throw new Error(verdict.fail);

    const served = await serveHttp(where.systemType);
    const clients: HardModeClient[] = [];
    const clientWith = async (extra: Record<string, string> = {}) => {
      const client = await served.session({ ...where.headers, ...extra });
      clients.push(client);
      return client;
    };
    const call = async (
      client: HardModeClient,
      name: string,
      args: Record<string, unknown> = {},
    ) => {
      const answer: Answer = await client.call(name, args);
      say(name, {
        isError: answer.isError === true,
        answer: withoutHandles(textOf(answer)).slice(0, 400),
      });
      return answer;
    };
    let handle: string | undefined;
    let held: HardModeClient | undefined;
    let batchOpen = false;
    let failure: unknown;
    try {
      const plain = await clientWith();
      const started = await call(plain, 'AmdpDebugStart', {
        stop_existing: false,
        breakpoints: [{ class_name: cls, line: verdict.breakpointLine }],
        run: { kind: 'class', name: cls },
      });
      assert.notEqual(started.isError, true);
      handle = payloadOf(started)?.state_handle;
      assert.ok(isUpperHex(handle, 32));
      held = await clientWith({ 'x-mcp-state-handle': handle as string });
      // AmdpDebugWait until an event of `kinds`, with no count; an error,
      // the end or `idle` (answered at once each time) means none comes.
      const eventOf = async (kinds: string[]) => {
        for (;;) {
          const answer = await call(held as HardModeClient, 'AmdpDebugWait', {
            state_handle: handle,
            hold_seconds: 30,
          });
          const waited = payloadOf(answer);
          if (
            answer.isError === true ||
            waited?.state === 'ended' ||
            waited?.state === 'idle'
          ) {
            return undefined;
          }
          const hit = (waited?.events ?? []).find((e: any) =>
            kinds.includes(e?.kind),
          );
          if (hit) return hit;
        }
      };
      const onBreak = await eventOf(['ON_BREAK']);
      assert.equal(onBreak?.line, verdict.breakpointLine);

      const begun = await call(held, 'DebugBatchBegin', {});
      assert.notEqual(begun.isError, true);
      assert.equal(payloadOf(begun)?.debug_batch, 'on');
      assert.equal(payloadOf(begun)?.state_handle, handle);
      batchOpen = true;
      for (const [name, args] of [
        ['AmdpDebugGetTable', { state_handle: handle, variable: 'LT_ROWS' }],
        ['AmdpDebugStep', { state_handle: handle, action: 'over' }],
      ] as const) {
        const recorded = await call(held, name, args);
        assert.notEqual(recorded.isError, true);
        assertEquals(recorded.content ?? [], []);
      }
      const ended = await call(held, 'DebugBatchEnd', {});
      batchOpen = false;
      assert.notEqual(ended.isError, true);
      assertEquals(payloadOf(ended), {
        recorded: 2,
        sent: 2,
        received: 2,
      });
      const entries = (payloadOf(
        await call(held, 'BatchAnswers', { numbers: [1, 2] }),
      ) ?? []) as Entry[];
      assertEquals(
        entries.map((e) => e.number),
        [1, 2],
      );
      assert.equal(
        entries.every((e) => e.isError !== true),
        true,
      );
      assert.equal(Array.isArray(payloadOf(entries[0])), true);
      assert.equal(payloadOf(entries[1])?.state, 'moving');
      const next = await eventOf(['ON_BREAK', 'ON_EXECUTION_END']);
      assert.ok(['ON_BREAK', 'ON_EXECUTION_END'].includes(next?.kind));

      const stopped = await call(held, 'AmdpDebugStop', {
        state_handle: handle,
      });
      assert.notEqual(stopped.isError, true);
      const stoppedHandle = handle;
      handle = undefined;
      // The debug state has ended with the complete stop, the debugger
      // batch's kept answers with it: the handle answers as an unknown one.
      const after = await call(held, 'AmdpDebugWait', {
        state_handle: stoppedHandle,
        hold_seconds: 1,
      });
      assert.equal(after.isError, true);
      assert.ok(textOf(after).includes('state is not available'));
    } catch (error) {
      failure = error;
    } finally {
      const problems: string[] = [];
      try {
        if (batchOpen && held) {
          const ended = await call(held, 'DebugBatchEnd', {});
          if (ended.isError) problems.push('DebugBatchEnd in cleanup');
        }
      } catch (error) {
        problems.push(`DebugBatchEnd threw: ${withoutHandles(String(error))}`);
      } finally {
        try {
          if (handle !== undefined && held) {
            const stopped = await call(held, 'AmdpDebugStop', {
              state_handle: handle,
            });
            if (stopped.isError) problems.push('AmdpDebugStop in cleanup');
          }
        } catch (error) {
          problems.push(
            `AmdpDebugStop threw: ${withoutHandles(String(error))}`,
          );
        } finally {
          for (const client of clients)
            await client.close().catch(() => undefined);
          const code = await served.stop();
          say('server exit', String(code));
          if (code !== 0)
            problems.push(`the server exited ${code}, not 0\n${served.tail()}`);
          const trace = readSessionTrace(served.trace());
          say('session trace', trace);
          problems.push(...trace.problems);
        }
      }
      if (failure !== undefined) {
        if (problems.length)
          process.stderr.write(
            `amdp-http-handle cleanup:\n${problems.join('\n')}\n`,
          );
        throw failure;
      }
      if (problems.length) throw new Error(problems.join('\n'));
    }
  });
});

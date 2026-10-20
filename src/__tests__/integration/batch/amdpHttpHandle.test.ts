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

import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as dotenv from 'dotenv';
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

const REPO = path.resolve(__dirname, '../../../..');
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

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

/** The HTTP server from source, with the session trace; its trace lines kept apart. */
async function serveHttp(systemType: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amdp-http-handle-'));
  const entry = path.join(dir, 'full-http.ts');
  fs.writeFileSync(
    entry,
    [
      ...SESSION_TRACE_PREAMBLE,
      `import { main } from ${JSON.stringify(path.join(REPO, 'http/src/launcher'))};`,
      `import { HTTP_VERSION } from ${JSON.stringify(path.join(REPO, 'http/src/httpVersion'))};`,
      `import { fullToolSet } from ${JSON.stringify(path.join(REPO, 'src/lib/toolSet'))};`,
      "void main({ toolSet: fullToolSet, program: 'mcp-abap-adt-http', version: HTTP_VERSION }).catch(() => {",
      "  console.error('[MCP] launcher failed');",
      '  process.exit(1);',
      '});',
      '',
    ].join('\n'),
  );
  const port = await freePort();
  const child: ChildProcess = spawn(
    process.execPath,
    [
      path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      path.join(REPO, 'tsconfig.test.json'),
      entry,
      `--port=${port}`,
      '--host=127.0.0.1',
      `--system-type=${systemType}`,
    ],
    { cwd: REPO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const traced: string[] = [];
  const tail: string[] = [];
  let pending = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    const lines = (pending + chunk.toString('utf8')).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines)
      if (line.startsWith('session-trace\t')) traced.push(line);
      else tail.push(line);
    if (tail.length > 200) tail.splice(0, tail.length - 200);
  });
  child.stdout?.resume();
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', (code) => resolve(code)),
  );
  for (let i = 0; i < 240; i++) {
    const listening = await new Promise<boolean>((resolve) => {
      const s = net.connect(port, '127.0.0.1', () => {
        s.end();
        resolve(true);
      });
      s.on('error', () => resolve(false));
    });
    if (listening) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url: new URL(`http://127.0.0.1:${port}/mcp/stream/http`),
    trace: () => [...traced],
    tail: () => tail.join('\n'),
    /** SIGTERM (tsx forwards it to the server): the graceful shutdown; the exit code. */
    stop: async (): Promise<number | null> => {
      child.kill('SIGTERM');
      const code = await exited;
      fs.rmSync(dir, { recursive: true, force: true });
      return code;
    },
  };
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
  it(
    'AmdpDebugStart, the break, DebugBatchBegin, the recorded AMDP calls, DebugBatchEnd and BatchAnswers over one x-mcp-state-handle; AmdpDebugStop, the state ended, a graceful shutdown; every session logged off',
    async () => {
      const where = whereItRuns();
      if ('reason' in where) {
        testLogger?.info(`⏭️  Skipping: ${where.reason}`);
        return;
      }
      const params = where.testCase.params ?? {};
      const cls = String(
        params.amdp_class ?? 'ZMCP_SHR_DBG_AMDP',
      ).toUpperCase();
      const ddl = String(params.amdp_ddl ?? 'ZMCP_SHR_DBG_TF').toUpperCase();

      // The shared pair, read in process; the check skips only off HANA.
      const { connection } = await createTestConnectionAndSession();
      const plainCtx = createHandlerContext({ connection, logger: testLogger });
      const verdict = amdpGateVerdict({
        systemInformation: await readSystemInformation(connection),
        className: cls,
        classRead: await sourceRead(handleGetClass, plainCtx, {
          class_name: cls,
        }),
        ddlName: ddl,
        ddlRead: await sourceRead(handleGetDdl, plainCtx, { ddl_name: ddl }),
      });
      if ('skip' in verdict) {
        testLogger?.info(`⏭️  Skipping: ${verdict.skip}`);
        return;
      }
      if ('fail' in verdict) throw new Error(verdict.fail);

      const served = await serveHttp(where.systemType);
      const clients: Client[] = [];
      const clientWith = async (extra: Record<string, string> = {}) => {
        const client = new Client({
          name: 'amdp-http-handle',
          version: '1.0.0',
        });
        await client.connect(
          new StreamableHTTPClientTransport(served.url, {
            requestInit: { headers: { ...where.headers, ...extra } },
          }),
        );
        clients.push(client);
        return client;
      };
      const call = async (client: Client, name: string, args = {}) => {
        const answer = (await client.callTool({
          name,
          arguments: args,
        })) as Answer;
        say(name, {
          isError: answer.isError === true,
          answer: withoutHandles(textOf(answer)).slice(0, 400),
        });
        return answer;
      };
      let handle: string | undefined;
      let held: Client | undefined;
      let batchOpen = false;
      let failure: unknown;
      try {
        const plain = await clientWith();
        const started = await call(plain, 'AmdpDebugStart', {
          stop_existing: false,
          breakpoints: [{ class_name: cls, line: verdict.breakpointLine }],
          run: { kind: 'class', name: cls },
        });
        expect(started.isError).not.toBe(true);
        handle = payloadOf(started)?.state_handle;
        expect(handle).toMatch(/^[0-9A-F]{32}$/);
        held = await clientWith({ 'x-mcp-state-handle': handle as string });
        const eventOf = async (kinds: string[], rounds: number) => {
          for (let i = 0; i < rounds; i++) {
            const waited = payloadOf(
              await call(held as Client, 'AmdpDebugWait', {
                state_handle: handle,
                hold_seconds: 30,
              }),
            );
            const hit = (waited?.events ?? []).find((e: any) =>
              kinds.includes(e?.kind),
            );
            if (hit) return hit;
          }
          return undefined;
        };
        const onBreak = await eventOf(['ON_BREAK'], 8);
        expect(onBreak?.line).toBe(verdict.breakpointLine);

        const begun = await call(held, 'DebugBatchBegin', {});
        expect(begun.isError).not.toBe(true);
        expect(payloadOf(begun)?.debug_batch).toBe('on');
        expect(payloadOf(begun)?.state_handle).toBe(handle);
        batchOpen = true;
        for (const [name, args] of [
          ['AmdpDebugGetTable', { state_handle: handle, variable: 'LT_ROWS' }],
          ['AmdpDebugStep', { state_handle: handle, action: 'over' }],
        ] as const) {
          const recorded = await call(held, name, args);
          expect(recorded.isError).not.toBe(true);
          expect(recorded.content ?? []).toEqual([]);
        }
        const ended = await call(held, 'DebugBatchEnd', {});
        batchOpen = false;
        expect(ended.isError).not.toBe(true);
        expect(payloadOf(ended)).toEqual({
          recorded: 2,
          sent: 2,
          received: 2,
        });
        const entries = (payloadOf(
          await call(held, 'BatchAnswers', { numbers: [1, 2] }),
        ) ?? []) as Entry[];
        expect(entries.map((e) => e.number)).toEqual([1, 2]);
        expect(entries.every((e) => e.isError !== true)).toBe(true);
        expect(Array.isArray(payloadOf(entries[0]))).toBe(true);
        expect(payloadOf(entries[1])?.state).toBe('moving');
        const next = await eventOf(['ON_BREAK', 'ON_EXECUTION_END'], 4);
        expect(['ON_BREAK', 'ON_EXECUTION_END']).toContain(next?.kind);

        const stopped = await call(held, 'AmdpDebugStop', {
          state_handle: handle,
        });
        expect(stopped.isError).not.toBe(true);
        const stoppedHandle = handle;
        handle = undefined;
        // The debug state has ended with the complete stop, the debugger
        // batch's kept answers with it: the handle answers as an unknown one.
        const after = await call(held, 'AmdpDebugWait', {
          state_handle: stoppedHandle,
          hold_seconds: 1,
        });
        expect(after.isError).toBe(true);
        expect(textOf(after)).toContain('state is not available');
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
          problems.push(
            `DebugBatchEnd threw: ${withoutHandles(String(error))}`,
          );
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
              problems.push(
                `the server exited ${code}, not 0\n${served.tail()}`,
              );
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
    },
    getTimeout('long'),
  );
});

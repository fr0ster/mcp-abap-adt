/**
 * The installed server connects to a live system over stdio, answers a tool,
 * and shuts down clean.
 *
 * **Where it runs.** Only under its live script,
 * `npm run test:live-connection` (in band; a run directory and the refusal
 * marker; never in `npm test`, whose default ignore covers
 * `src/__tests__/integration/`), and only where `MCP_LIVE_ENV_PATHS` names one or more `.env`
 * files (separated by the platform's path delimiter: `:` on Linux and macOS,
 * `;` on Windows). Each file is one destination; the server is started once per
 * file (a path containing the delimiter is not supported). `MCP_LIVE_ARGS`
 * adds launcher arguments to every start, split on whitespace with no quoting
 * (e.g. `--connection-type=rfc`). Without `MCP_LIVE_ENV_PATHS` the
 * suite skips and its test name says why — the default `npm test` and CI never
 * reach a system.
 *
 * **The realm check first.** Before the parent's logon, an unauthenticated
 * discovery `GET` must answer `401`: on premise with the realm
 * `MCP_LIVE_EXPECTED_REALMS` states for that destination (separated by the
 * same delimiter, one per `.env`, in order; empty refuses), on the cloud with
 * the session's JWT not expired.
 *
 * **How the server is started.** The way a user's tree runs it: the library and
 * the core package are packed and installed together into a temporary directory
 * (the mechanism `binSmoke.test.ts` uses), and the installed bin's JS file runs
 * under this `node` — never a `.cmd` shim, so the same spawn works on Windows.
 * A checkout's `server/bin` cannot stand in for it: nothing links
 * `@mcp-abap-adt/lib` beside it. Build first; packing reads `dist/`.
 *
 * **What it asserts.** `tools/list` offers `GetAdtTypes`; calling it answers
 * `isError: false` with content; the shutdown trigger (`SIGTERM`, or the end of
 * stdin on Windows, where signals are not delivered to a child the same way)
 * ends the process with exit code 0; and every byte the server wrote to stdout
 * is a JSON-RPC frame — a stray line there corrupts the protocol. It reports
 * only those facts: no path, no `.env` value, no answer text, no stderr.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import * as dotenv from 'dotenv';
import { AuthBrokerFactory } from '../../../../server-runtime/src/stdio/auth/brokerFactory';
import { statedSystemKind } from '../../../lib/systemKind';
import {
  installedFile,
  installPackedRelease,
} from '../../helpers/installedRelease';
import { endTestConnection } from '../helpers/openConnections';
import { realmCheck } from '../helpers/realmCheck';
import { guardedSend, guardedTestConnection } from '../helpers/refusalGuard';
import { launchStdioScript } from '../helpers/testers/hardMode';

const ENV_PATHS = (process.env.MCP_LIVE_ENV_PATHS ?? '')
  .split(delimiter)
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '');
const EXPECTED_REALMS = (process.env.MCP_LIVE_EXPECTED_REALMS ?? '')
  .split(delimiter)
  .map((entry) => entry.trim());
const EXTRA_ARGS = (process.env.MCP_LIVE_ARGS ?? '')
  .split(/\s+/)
  .filter((arg) => arg !== '');

/**
 * Runs one protocol step and, if it throws, fails with a fixed text: a JSON-RPC
 * error carries the server's message, which may quote what the .env holds.
 */
async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new Error(`${label} failed (the error's message is not reported)`);
  }
}

/** What a launcher argument states, `--name=value`; undefined when none does. */
const statedArg = (name: string): string | undefined =>
  EXTRA_ARGS.find((arg) => arg.startsWith(`--${name}=`))?.slice(
    name.length + 3,
  );

/** Nothing opens a browser here: a destination that needs a login fails its logon. */
const noBrowser = (): IAuthorizationStrategy<string> => ({
  authorize: async () => {
    throw new Error('the live connection test opens no browser login');
  },
  dispose: async () => {},
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/**
 * The parent's own logon with the destination of `envPath`, as the server
 * reads it (`--env-path`), on a guarded connection logged off again: a
 * refusal latches the run's marker and nothing is launched.
 */
function envFileLogOn(
  envPath: string,
  expectedRealm: string,
): () => Promise<void> {
  return async () => {
    const stated = dotenv.parse(readFileSync(envPath, 'utf8'));
    const kind = statedSystemKind(
      statedArg('system-type') ?? stated.SAP_SYSTEM_TYPE,
    );
    const connectionType =
      statedArg('connection-type') ?? stated.SAP_CONNECTION_TYPE;
    if (kind === undefined) {
      throw new Error(
        'the destination states no system kind (--system-type in MCP_LIVE_ARGS, or SAP_SYSTEM_TYPE)',
      );
    }
    if (connectionType !== 'http' && connectionType !== 'rfc') {
      throw new Error(
        'the destination states no connection type (--connection-type in MCP_LIVE_ARGS, or SAP_CONNECTION_TYPE)',
      );
    }
    // The realm check before anything logs on.
    const url = stated.SAP_URL;
    if (url === undefined || url === '') {
      throw new Error('the destination names no SAP_URL');
    }
    await realmCheck(kind, url, expectedRealm, {
      jwt: stated.SAP_JWT_TOKEN,
    });
    const factory = new AuthBrokerFactory({
      envFile: { path: envPath, source: '--env-path' },
      unsafe: false,
      connectionType,
      browserStrategy: noBrowser,
      promptLogger: silent,
    });
    const settings = await factory.settingsFor('default');
    const credential = await guardedSend("the destination's credential", () =>
      factory.getProvider('default'),
    );
    const own = guardedTestConnection(settings, credential, { kind });
    await own.connect();
    await endTestConnection(own);
  };
}

/** This process's environment, as strings. */
function plainEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/** Every non-empty stdout line must be a JSON-RPC 2.0 frame. */
const strayLines = (stdout: string): number =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => {
      try {
        return JSON.parse(line)?.jsonrpc !== '2.0';
      } catch {
        return true;
      }
    }).length;

if (ENV_PATHS.length === 0) {
  const reason = `MCP_LIVE_ENV_PATHS is not set: it takes one or more .env paths, separated by "${delimiter}"`;
  describe('live connection', () => {
    // Printed in every run, so a skip never reads as a pass.
    console.log(`[live-connection] skipped: ${reason}`);
    it.skip(reason, () => {});
  });
} else {
  describe('live connection: the installed server over stdio', () => {
    // Packing and installing, then one logon per destination.
    jest.setTimeout(10 * 60 * 1000);

    let workdir: string;
    let bin: string;

    beforeAll(() => {
      workdir = mkdtempSync(join(tmpdir(), 'mcp-live-'));
      installPackedRelease(workdir, [
        '.',
        'background-runs-memory',
        'responsible-rules',
        'server-runtime',
        'http',
        'sse',
        'server',
      ]);
      bin = installedFile(workdir, 'core', 'bin', 'mcp-abap-adt.js');
    });

    afterAll(() => {
      if (workdir !== undefined)
        // Retried: on Windows a just-exited child can hold a file for a moment.
        rmSync(workdir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 500,
        });
    });

    ENV_PATHS.forEach((envPath, index) => {
      it(`destination #${index + 1}: lists and calls GetAdtTypes, then exits 0`, async () => {
        expect(existsSync(bin)).toBe(true);
        // Report the fact, never the path: a file name may name a system.
        expect({
          destination: index + 1,
          envFileExists: existsSync(envPath),
        }).toEqual({ destination: index + 1, envFileExists: true });

        // Guarded: the parent logs on with the same destination first, and
        // every answer is read for a credential refusal; no SDK client, no
        // timer — Jest's test timeout is the only deadline.
        const server = await step('initialize', () =>
          launchStdioScript({
            argv: [bin, `--env-path=${envPath}`, ...EXTRA_ARGS],
            env: plainEnvironment(),
            cwd: workdir,
            logOn: envFileLogOn(envPath, EXPECTED_REALMS[index] ?? ''),
          }),
        );
        const child = server.child;
        if (child === undefined) throw new Error('the server did not start');
        let code: number | null;
        try {
          const listed = await step('tools/list', () => server.listTools());
          const tools = listed.map((t) => t.name);
          expect(tools).toContain('GetAdtTypes');

          const result = await step('tools/call GetAdtTypes', () =>
            server.call('GetAdtTypes', {}),
          );
          expect({
            tool: 'GetAdtTypes',
            isError: result.isError,
            answered: result.content.length > 0,
          }).toEqual({ tool: 'GetAdtTypes', isError: false, answered: true });
        } finally {
          // The shutdown a client would trigger: SIGTERM where signals reach a
          // child; on Windows the end of stdin, which the server also obeys.
          code =
            process.platform === 'win32'
              ? await child.end()
              : await child.stop();
          await server.close();
        }

        expect({ exitCode: code }).toEqual({ exitCode: 0 });
        expect({
          strayStdoutLines: strayLines(child.stdout()),
        }).toEqual({
          strayStdoutLines: 0,
        });
      });
    });
  });
}

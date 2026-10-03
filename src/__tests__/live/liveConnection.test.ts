/**
 * The installed server connects to a live system over stdio, answers a tool,
 * and shuts down clean.
 *
 * **Where it runs.** Only where `MCP_LIVE_ENV_PATHS` names one or more `.env`
 * files (separated by the platform's path delimiter: `:` on Linux and macOS,
 * `;` on Windows). Each file is one destination; the server is started once per
 * file (a path containing the delimiter is not supported). `MCP_LIVE_ARGS`
 * adds launcher arguments to every start, split on whitespace with no quoting
 * (e.g. `--connection-type=rfc`). Without `MCP_LIVE_ENV_PATHS` the
 * suite skips and its test name says why — the default `npm test` and CI never
 * reach a system.
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
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ReadBuffer,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  installedFile,
  installPackedRelease,
} from '../helpers/installedRelease';

const ENV_PATHS = (process.env.MCP_LIVE_ENV_PATHS ?? '')
  .split(delimiter)
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '');
const EXTRA_ARGS = (process.env.MCP_LIVE_ARGS ?? '')
  .split(/\s+/)
  .filter((arg) => arg !== '');

/**
 * A client transport over a child this test spawned itself, so the test owns
 * the shutdown (the SDK's stdio transport sends its own signals on close) and
 * sees every stdout byte, frame or not.
 */
class ChildStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private readonly buffer = new ReadBuffer();

  constructor(private readonly child: ChildProcess) {}

  async start(): Promise<void> {
    // A broken pipe would otherwise be an unhandled 'error' event; its message
    // is the system's, so only a fixed text goes on.
    this.child.stdin?.on('error', () =>
      this.onerror?.(new Error('writing to the server stdin failed')),
    );
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer.append(chunk);
      for (;;) {
        let message: JSONRPCMessage | null;
        try {
          message = this.buffer.readMessage();
        } catch (error) {
          this.onerror?.(error as Error);
          continue;
        }
        if (message === null) break;
        this.onmessage?.(message);
      }
    });
    this.child.on('exit', () => this.onclose?.());
  }

  send(message: JSONRPCMessage): Promise<void> {
    const failed = () => new Error('writing to the server stdin failed');
    const stdin = this.child.stdin;
    if (!stdin?.writable) return Promise.reject(failed());
    return new Promise((resolve, reject) => {
      stdin.write(serializeMessage(message), (error) =>
        error ? reject(failed()) : resolve(),
      );
    });
  }

  async close(): Promise<void> {
    // The test triggers the shutdown itself and asserts on it.
  }
}

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

/** Startup may log on, so every request gets the same generous bound. */
const REQUEST = { timeout: 180_000 };

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
      installPackedRelease(workdir, ['.', 'server']);
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

        const child = spawn(
          process.execPath,
          [bin, `--env-path=${envPath}`, ...EXTRA_ARGS],
          { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        const stdout: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
        // Drained, never printed: it may carry what the .env holds.
        child.stderr.resume();
        // 'close', not 'exit': it fires once stdout has drained too, so the
        // stray-line count below sees every byte the server wrote.
        const closed = new Promise<number | null>((resolve) =>
          child.on('close', (code) => resolve(code)),
        );

        const client = new Client({
          name: 'live-connection-test',
          version: '1',
        });
        try {
          await step('initialize', () =>
            client.connect(new ChildStdioTransport(child), REQUEST),
          );

          const listed = await step('tools/list', () =>
            client.listTools(undefined, REQUEST),
          );
          const tools = listed.tools.map((t) => t.name);
          expect(tools).toContain('GetAdtTypes');

          const result = await step('tools/call GetAdtTypes', () =>
            client.callTool(
              { name: 'GetAdtTypes', arguments: {} },
              undefined,
              REQUEST,
            ),
          );
          const content = Array.isArray(result.content) ? result.content : [];
          expect({
            tool: 'GetAdtTypes',
            isError: result.isError === true,
            answered: content.length > 0,
          }).toEqual({ tool: 'GetAdtTypes', isError: false, answered: true });
        } finally {
          // The shutdown a client would trigger: SIGTERM where signals reach a
          // child; on Windows the end of stdin, which the server also obeys.
          if (process.platform === 'win32') child.stdin.end();
          else child.kill('SIGTERM');
        }

        const code = await Promise.race([
          closed,
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('no exit within 60 s'), 60_000).unref(),
          ),
        ]);
        if (code === 'no exit within 60 s') child.kill('SIGKILL');
        expect({ exitCode: code }).toEqual({ exitCode: 0 });
        expect({
          strayStdoutLines: strayLines(Buffer.concat(stdout).toString('utf8')),
        }).toEqual({
          strayStdoutLines: 0,
        });
      });
    });
  });
}

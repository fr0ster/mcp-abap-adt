/**
 * No launcher writes `process.env` (D26 B4): `mcp-abap-adt-http` and
 * `mcp-abap-adt-sse` pass the system type they resolved to the server they
 * start, and the process environment is the same after the start as
 * before it — with `SAP_SYSTEM_TYPE` absent from it. (stdio: the env-file
 * cases of `stdio/__tests__/launcherDestination.test.ts`.)
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, it } from 'node:test';
import { format } from 'node:util';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as httpMain } from '../http/launcher';
import { main as sseMain } from '../sse/launcher';

const savedEnv = process.env;
const running: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  process.env = savedEnv;
  for (const server of running.splice(0)) {
    await server.stop().catch(() => undefined);
  }
});

const edges = (argv: string[], lines: string[]) => ({
  argv,
  stdout: () => {},
  stderr: (line: string) => lines.push(line),
  exit: (code: number) => lines.push(`exit ${code}`),
  processLike: Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  }),
});

for (const [program, main, port] of [
  ['mcp-abap-adt-http', httpMain, '--port=0'],
  ['mcp-abap-adt-sse', sseMain, '--sse-port=0'],
] as const) {
  it(
    format(
      '%s: the system type reaches the server, and process.env is unchanged',
      program,
    ),
    async () => {
      const clean: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(savedEnv)) {
        if (!key.startsWith('SAP_') && !key.startsWith('MCP_')) {
          clean[key] = value;
        }
      }
      process.env = clean;
      const before = { ...process.env };
      const lines: string[] = [];
      const server = await main(
        {
          toolSet: fullToolSet,
          program,
          version: '0.0.0',
          packageName: '@mcp-abap-adt/test',
        },
        edges(
          ['--system-type=cloud', '--host=127.0.0.1', port].map((a) =>
            program === 'mcp-abap-adt-sse' && a === '--host=127.0.0.1'
              ? '--sse-host=127.0.0.1'
              : a,
          ),
          lines,
        ),
      );
      // Registered for afterEach before any assertion: a failing one must
      // not leave the listener open, or the file never ends (node:test does
      // not end a process its test left a socket in).
      if (server !== undefined) running.push(server);
      assert.deepStrictEqual(
        lines.filter((line) => line.startsWith('exit')),
        [],
      );
      assert.notEqual(server, undefined);
      assert.deepStrictEqual(process.env, before);
      assert.equal(process.env.SAP_SYSTEM_TYPE, undefined);
      const stated: unknown = server;
      assert.equal((stated as { systemType?: string }).systemType, 'cloud');
    },
  );
}

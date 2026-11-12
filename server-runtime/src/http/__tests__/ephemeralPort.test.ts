/**
 * Port 0 on the Streamable HTTP server: the system chooses a free port, and
 * the server announces the port it is bound to — on its listening line and
 * through `listeningPort()` — so a caller (a test above all) binds no port it
 * chose before the server did. `--port=0` is accepted.
 */
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { describe, it, mock } from 'node:test';
import { fullToolSet, registryOf } from '../../../../src/lib/toolSet';
import { readHttpConfig } from '../config/httpParameters';
import { StreamableHttpServer } from '../StreamableHttpServer';

/** Whether something accepts a connection on 127.0.0.1:`port`. */
function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** The port the line `prefix` announced, read from the console's error lines. */
function announced(lines: readonly string[], prefix: string): number {
  const line = lines.find((each) => each.startsWith(prefix));
  assert.ok(line !== undefined, lines.join('\n'));
  return Number(line.slice(line.lastIndexOf(':') + 1));
}

/** The console's error lines while `run` runs. */
async function errorLines(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const spied = mock.method(console, 'error', (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    await run();
  } finally {
    spied.mock.restore();
  }
  return lines;
}

describe('Streamable HTTP on port 0: the system chooses, the server announces it', () => {
  it('--port=0 is read as 0', () => {
    assert.equal(
      readHttpConfig(['--system-type=onprem', '--port=0'], {}, null).port,
      0,
    );
  });

  it('listens on a port of its own and announces it', async () => {
    const server = new StreamableHttpServer(
      registryOf(fullToolSet, 'http', { dataTools: true }),
      { host: '127.0.0.1', port: 0 },
    );
    const lines = await errorLines(() => server.start());
    try {
      const port = server.listeningPort();
      assert.ok(port !== undefined && port > 0, String(port));
      assert.equal(
        announced(lines, '[StreamableHttpServer] Server started on '),
        port,
      );
      assert.equal(await accepts(port), true);
    } finally {
      await server.stop();
    }
    assert.equal(server.listeningPort(), undefined);
  });
});

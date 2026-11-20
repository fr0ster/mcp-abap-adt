/**
 * The lines SSE writes about a failed `POST` and a failed connect
 * hold fixed words and what the failure reader makes of the error — never
 * the error's `message`, which may quote a secret. Every line the process
 * writes (`console.error`, the server's logger) is scanned for the marker.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { basicHeaders, sseStand, until } from '../shutdown/harness';

const MARKER = 'secret-marker-7f3a91c4';

let lines: string[];
let logged: string[];

const written = (args: unknown[]) =>
  args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');

beforeEach(() => {
  lines = [];
  logged = [];
  mock.method(console, 'error', (...args: unknown[]) => {
    lines.push(written(args));
  });
});

afterEach(() => {
  mock.restoreAll();
});

const logger = () => ({
  debug: (...a: unknown[]) => void logged.push(written(a)),
  info: (...a: unknown[]) => void logged.push(written(a)),
  warn: (...a: unknown[]) => void logged.push(written(a)),
  error: (...a: unknown[]) => void logged.push(written(a)),
});

it('a failed POST: fixed words and the reader, no message of the error', async (t) => {
  const s = await sseStand({ server: { logger: logger() as never } });
  try {
    const connection = await s.open();
    const said = new Error(`token endpoint said ${MARKER}`);
    t.mock.method(
      SSEServerTransport.prototype,
      'handlePostMessage',
      async () => {
        throw said;
      },
    );
    await connection.call('LockedUpdate', { id: 'X' }, 1);
    await until(() => lines.some((l) => l.includes('[SSE POST] FAILED')));
    const failed = lines.find((l) => l.includes('[SSE POST] FAILED')) ?? '';
    assert.ok(failed.includes(`for session ${connection.sessionId}: `));
    assert.ok(failed.includes('Error'));
    assert.ok(![...lines, ...logged].join('\n').includes(MARKER));
  } finally {
    await s.close();
  }
});

it('a failed connect: fixed words and the reader, no message of the error', async (t) => {
  const s = await sseStand({ server: { logger: logger() as never } });
  try {
    const said = new Error(`token endpoint said ${MARKER}`);
    t.mock.method(SSEServerTransport.prototype, 'start', async () => {
      throw said;
    });
    const response = await fetch(`http://127.0.0.1:${s.port}/sse`, {
      headers: basicHeaders(s.standIn.url),
    });
    await response.text();
    assert.equal(response.status, 500);
    await until(() => logged.some((l) => l.includes('failed to connect')));
    const failed = logged.find((l) => l.includes('failed to connect')) ?? '';
    assert.ok(failed.includes('Error'));
    assert.ok(![...lines, ...logged].join('\n').includes(MARKER));
  } finally {
    await s.close();
  }
});

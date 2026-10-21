/**
 * The lines SSE writes about a failed `POST` and a failed connect
 * hold fixed words and what the failure reader makes of the error — never
 * the error's `message`, which may quote a secret. Every line the process
 * writes (`console.error`, the server's logger) is scanned for the marker.
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { basicHeaders, sseStand, until } from '../shutdown/harness';

jest.setTimeout(30_000);

const MARKER = 'secret-marker-7f3a91c4';

let lines: string[];
let logged: string[];

const written = (args: unknown[]) =>
  args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');

beforeEach(() => {
  lines = [];
  logged = [];
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(written(args));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const logger = () => ({
  debug: (...a: unknown[]) => void logged.push(written(a)),
  info: (...a: unknown[]) => void logged.push(written(a)),
  warn: (...a: unknown[]) => void logged.push(written(a)),
  error: (...a: unknown[]) => void logged.push(written(a)),
});

it('a failed POST: fixed words and the reader, no message of the error', async () => {
  const s = await sseStand({ server: { logger: logger() as never } });
  try {
    const connection = await s.open();
    jest
      .spyOn(SSEServerTransport.prototype, 'handlePostMessage')
      .mockRejectedValue(new Error(`token endpoint said ${MARKER}`));
    await connection.call('LockedUpdate', { id: 'X' }, 1);
    await until(() => lines.some((l) => l.includes('[SSE POST] FAILED')));
    const failed = lines.find((l) => l.includes('[SSE POST] FAILED')) ?? '';
    expect(failed).toContain(`for session ${connection.sessionId}: `);
    expect(failed).toContain('Error');
    expect([...lines, ...logged].join('\n')).not.toContain(MARKER);
  } finally {
    await s.close();
  }
});

it('a failed connect: fixed words and the reader, no message of the error', async () => {
  const s = await sseStand({ server: { logger: logger() as never } });
  try {
    jest
      .spyOn(SSEServerTransport.prototype, 'start')
      .mockRejectedValue(new Error(`token endpoint said ${MARKER}`));
    const response = await fetch(`http://127.0.0.1:${s.port}/sse`, {
      headers: basicHeaders(s.standIn.url),
    });
    await response.text();
    expect(response.status).toBe(500);
    await until(() => logged.some((l) => l.includes('failed to connect')));
    const failed = logged.find((l) => l.includes('failed to connect')) ?? '';
    expect(failed).toContain('Error');
    expect([...lines, ...logged].join('\n')).not.toContain(MARKER);
  } finally {
    await s.close();
  }
});

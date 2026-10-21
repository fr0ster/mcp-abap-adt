/**
 * A cancel before the tool, SSE: a client's MCP cancel aborts nothing. Two
 * `POST`s on one SSE connection — R1 and R2 — wait in the connection's one
 * connect, in its credential: in `rejected()` (the system refused the logon
 * with `401`, the renewal is held) and, separately, in `authorize()` (the
 * credential for the logon is held). R1 is sent `notifications/cancelled`
 * while both wait: once the credential answers, R1's tool runs once — after
 * the renewal — and R2 is answered.
 *
 * The credential is the connection's own provider (from its `GET`'s
 * headers), wrapped: its `rejected()` / `authorize()` held at a gate this
 * suite opens.
 */

import type { AuthOutcome, IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { PROBE_PATH } from '../../../../../src/__tests__/helpers/adtStandIn';
import { activeTools } from '../../../../../src/lib/activeTools';
import {
  type SseConnection,
  type SseStand,
  sseStand,
  turns,
  until,
} from '../shutdown/harness';

/** Where the connection's credential waits; this suite opens it. */
const mockGate = {
  /** `authorize()` waits too while set; `rejected()` always waits. */
  authorize: false,
  /** Calls waiting at the gate so far. */
  waiting: 0,
  open: () => {},
  opened: Promise.resolve(),
};

function mockReset(): void {
  mockGate.authorize = false;
  mockGate.waiting = 0;
  mockGate.opened = new Promise<void>((resolve) => {
    mockGate.open = resolve;
  });
}

jest.mock('../../../../../src/lib/credentialSources', () => {
  const actual = jest.requireActual('../../../../../src/lib/credentialSources');
  /** The headers' provider, its renewal and (when set) its authorize held at the gate. */
  const gated = (basic: IAuthProvider): IAuthProvider => ({
    kind: basic.kind,
    prepare: () => basic.prepare(),
    establish: (logon) => basic.establish(logon),
    authorize: async (request) => {
      if (mockGate.authorize) {
        mockGate.waiting += 1;
        await mockGate.opened;
      }
      return basic.authorize(request);
    },
    // A renewal that took its time, then changed what the credential presents.
    rejected: async (): Promise<AuthOutcome> => {
      mockGate.waiting += 1;
      await mockGate.opened;
      return { ok: true };
    },
  });
  return {
    ...actual,
    credentialFromHeaders: (headers: Record<string, string>) => {
      const built = actual.credentialFromHeaders(headers);
      return { ...built, credential: gated(built.credential) };
    },
  };
});

jest.setTimeout(30_000);

let s: SseStand;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await sseStand();
});

afterEach(async () => {
  mockGate.open();
  await s.close();
  errorSpy.mockRestore();
});

const pause = () => new Promise((r) => setTimeout(r, 150));

const isDiscovery = (r: { url: string }) => r.url.includes('discovery');
const probes = (id: string) =>
  s.standIn.requests.filter((r) => r.url === `${PROBE_PATH}${id}`).length;

/** The client's MCP cancel of request `id`, posted on the connection. */
async function cancel(port: number, c: SseConnection, id: number) {
  const posted = await fetch(`http://127.0.0.1:${port}${c.postPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: id, reason: 'the user cancelled' },
    }),
  });
  await posted.text();
  return posted.status;
}

/** R1 cancelled, R2 kept, both waiting in the one connect; then the gate opens. */
async function cancelledWhileWaiting() {
  const c = await s.open();
  expect(await c.call('ProbeAdt', { id: 'r1' }, 1)).toBe(202);
  expect(await c.call('ProbeAdt', { id: 'r2' }, 2)).toBe(202);
  // One connection, one connect: its credential is asked once.
  await until(() => mockGate.waiting === 1);
  await until(() => activeTools().length === 2);
  await turns();
  expect(probes('r1') + probes('r2')).toBe(0);

  expect(await cancel(s.port, c, 1)).toBe(202);
  await pause();
  // R1 is still a live call, its signal not aborted.
  expect(activeTools()).toHaveLength(2);
  expect(activeTools().every((t) => !t.signal.aborted)).toBe(true);

  const renewedFrom = s.standIn.requests.length;
  mockGate.open();
  expect(await c.answer(2)).toEqual({ text: 'r2', isError: false });
  await until(() => probes('r1') === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  // R1's tool ran once, after its credential answered.
  expect(probes('r1')).toBe(1);
  expect(
    s.standIn.requests.findIndex((r) => r.url === `${PROBE_PATH}r1`),
  ).toBeGreaterThanOrEqual(renewedFrom);
  c.close();
}

it('R1 cancelled while both wait in rejected(): its tool runs once after the renewal; R2 is answered', async () => {
  // The connection's logon is refused once: its credential is asked to renew.
  s.standIn.answerOnce(isDiscovery, 401);
  await cancelledWhileWaiting();
  // The connection logged on again after its renewal.
  expect(s.connects()).toBe(2);
});

it('R1 cancelled while both wait in authorize(): its tool runs once after the credential answered; R2 is answered', async () => {
  mockGate.authorize = true;
  await cancelledWhileWaiting();
});

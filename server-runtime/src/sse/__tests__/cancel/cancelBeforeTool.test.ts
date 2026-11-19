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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import type { AuthOutcome, IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { PROBE_PATH } from '../../../../../src/__tests__/helpers/adtStandIn';
import { activeTools } from '../../../../../src/lib/activeTools';
import * as credentialSources from '../../../../../src/lib/credentialSources';
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

// credentialFromHeaders replaced on the module that defines it (its
// callers read it at call time), as the Jest factory did: the real one's
// answer, its credential held at the gate. Every other name stays real.
const realCredentialFromHeaders = credentialSources.credentialFromHeaders;
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
mock.method(
  credentialSources,
  'credentialFromHeaders',
  (headers: Record<string, string>) => {
    const built = realCredentialFromHeaders(headers);
    return { ...built, credential: gated(built.credential) };
  },
);

let s: SseStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  mockReset();
  errorSpy = mock.method(console, 'error', () => {});
  s = await sseStand();
});

afterEach(async () => {
  mockGate.open();
  await s.close();
  errorSpy.mock.restore();
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
  assert.equal(await c.call('ProbeAdt', { id: 'r1' }, 1), 202);
  assert.equal(await c.call('ProbeAdt', { id: 'r2' }, 2), 202);
  // One connection, one connect: its credential is asked once.
  await until(() => mockGate.waiting === 1);
  await until(() => activeTools().length === 2);
  await turns();
  assert.equal(probes('r1') + probes('r2'), 0);

  assert.equal(await cancel(s.port, c, 1), 202);
  await pause();
  // R1 is still a live call, its signal not aborted.
  assert.equal(activeTools().length, 2);
  assert.equal(
    activeTools().every((t) => !t.signal.aborted),
    true,
  );

  const renewedFrom = s.standIn.requests.length;
  mockGate.open();
  assert.deepStrictEqual(await c.answer(2), { text: 'r2', isError: false });
  await until(() => probes('r1') === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  // R1's tool ran once, after its credential answered.
  assert.equal(probes('r1'), 1);
  assert.ok(
    s.standIn.requests.findIndex((r) => r.url === `${PROBE_PATH}r1`) >=
      renewedFrom,
  );
  c.close();
}

it('R1 cancelled while both wait in rejected(): its tool runs once after the renewal; R2 is answered', async () => {
  // The connection's logon is refused once: its credential is asked to renew.
  s.standIn.answerOnce(isDiscovery, 401);
  await cancelledWhileWaiting();
  // The connection logged on again after its renewal.
  assert.equal(s.connects(), 2);
});

it('R1 cancelled while both wait in authorize(): its tool runs once after the credential answered; R2 is answered', async () => {
  mockGate.authorize = true;
  await cancelledWhileWaiting();
});

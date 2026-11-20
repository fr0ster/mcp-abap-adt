/**
 * A cancel before the tool, http: a client's dropped request ends no admitted
 * call, wherever it waits — here in its connection's credential, before its
 * tool started. R1 and R2 are two requests, each building its connection from
 * its own headers; each connect waits in the credential: in
 * `rejected()` (the system refused the logon with `401`, the renewal is held)
 * and, separately, in `authorize()` (the credential for the logon is held).
 * R1 is dropped while both wait: once the credential answers, R1's tool runs
 * once — after the renewal — and R2 is answered `200`.
 *
 * The credential is the request's own provider, wrapped: the headers'
 * provider, its `rejected()` / `authorize()` held at a gate this suite opens.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import type { AuthOutcome, IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { PROBE_PATH } from '../../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import { activeTools } from '../../../../../src/lib/activeTools';
import * as credentialSources from '../../../../../src/lib/credentialSources';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
  until,
} from '../shutdown/harness';

/** Where the requests' credentials wait; this suite opens it. */
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
// callers read it at call time): the real one's
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

let s: HttpStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  mockReset();
  errorSpy = mock.method(console, 'error', () => {});
  s = await httpStand();
});

afterEach(async () => {
  mockGate.open();
  await s.close();
  errorSpy.mock.restore();
});

/** A `ProbeAdt { id }` call the client drops with `drop()`. */
function droppable(id: string) {
  const controller = new AbortController();
  const sent = fetch(s.url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...basicHeaders(s.standIn.url),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: { name: 'ProbeAdt', arguments: { id } },
    }),
  }).catch(() => 'dropped');
  return { drop: () => controller.abort(), sent };
}

const pause = () => new Promise((r) => setTimeout(r, 150));

const isDiscovery = (r: { url: string }) => r.url.includes('discovery');
const probes = (id: string) =>
  s.standIn.requests.filter((r) => r.url === `${PROBE_PATH}${id}`).length;

/** R1 dropped, R2 kept, both waiting at the gate; then the gate opens. */
async function droppedWhileWaiting() {
  const r1 = droppable('r1');
  const r2 = s.call('ProbeAdt', { id: 'r2' });
  await until(() => mockGate.waiting === 2);
  await turns();
  // Both admitted, neither tool started.
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['ProbeAdt', 'ProbeAdt'],
  );
  assert.equal(probes('r1') + probes('r2'), 0);

  r1.drop();
  assert.equal(await r1.sent, 'dropped');
  await pause();
  // R1 is still a live call, its signal not aborted.
  assert.equal(activeTools().length, 2);
  assert.equal(
    activeTools().every((t) => !t.signal.aborted),
    true,
  );

  const renewedFrom = s.standIn.requests.length;
  mockGate.open();
  assertMatchObject(await r2, { status: 200, text: 'r2', isError: false });
  await until(() => probes('r1') === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  // R1's tool ran once, after its credential answered.
  assert.equal(probes('r1'), 1);
  assert.ok(
    s.standIn.requests.findIndex((r) => r.url === `${PROBE_PATH}r1`) >=
      renewedFrom,
  );
}

it('R1 dropped while both wait in rejected(): its tool runs once after the renewal; R2 is answered 200', async () => {
  // Each request's logon is refused once: its credential is asked to renew.
  s.standIn.answerOnce(isDiscovery, 401);
  s.standIn.answerOnce(isDiscovery, 401);
  await droppedWhileWaiting();
  // Each connection logged on again after its renewal.
  assert.ok(s.standIn.requests.filter(isDiscovery).length >= 4);
});

it('R1 dropped while both wait in authorize(): its tool runs once after the credential answered; R2 is answered 200', async () => {
  mockGate.authorize = true;
  await droppedWhileWaiting();
});

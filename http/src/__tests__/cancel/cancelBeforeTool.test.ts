/**
 * A cancel before the tool, http: a client's dropped request ends no admitted
 * call, wherever it waits — here in its connection's credential, before its
 * tool started. R1 and R2 are two requests, each building its connection from
 * its own headers (D39); each connect waits in the credential: in
 * `rejected()` (the system refused the logon with `401`, the renewal is held)
 * and, separately, in `authorize()` (the credential for the logon is held).
 * R1 is dropped while both wait: once the credential answers, R1's tool runs
 * once — after the renewal — and R2 is answered `200`.
 *
 * The credential is the request's own provider, wrapped: the headers'
 * provider, its `rejected()` / `authorize()` held at a gate this suite opens.
 */

import type { AuthOutcome, IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { PROBE_PATH } from '../../../../src/__tests__/helpers/adtStandIn';
import { activeTools } from '../../../../src/lib/activeTools';
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

jest.mock('../../../../src/lib/credentialSources', () => {
  const actual = jest.requireActual('../../../../src/lib/credentialSources');
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

let s: HttpStand;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand();
});

afterEach(async () => {
  mockGate.open();
  await s.close();
  errorSpy.mockRestore();
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
  expect(activeTools().map((t) => t.name)).toEqual(['ProbeAdt', 'ProbeAdt']);
  expect(probes('r1') + probes('r2')).toBe(0);

  r1.drop();
  expect(await r1.sent).toBe('dropped');
  await pause();
  // R1 is still a live call, its signal not aborted.
  expect(activeTools()).toHaveLength(2);
  expect(activeTools().every((t) => !t.signal.aborted)).toBe(true);

  const renewedFrom = s.standIn.requests.length;
  mockGate.open();
  expect(await r2).toMatchObject({ status: 200, text: 'r2', isError: false });
  await until(() => probes('r1') === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  // R1's tool ran once, after its credential answered.
  expect(probes('r1')).toBe(1);
  expect(
    s.standIn.requests.findIndex((r) => r.url === `${PROBE_PATH}r1`),
  ).toBeGreaterThanOrEqual(renewedFrom);
}

it('R1 dropped while both wait in rejected(): its tool runs once after the renewal; R2 is answered 200', async () => {
  // Each request's logon is refused once: its credential is asked to renew.
  s.standIn.answerOnce(isDiscovery, 401);
  s.standIn.answerOnce(isDiscovery, 401);
  await droppedWhileWaiting();
  // Each connection logged on again after its renewal.
  expect(s.standIn.requests.filter(isDiscovery).length).toBeGreaterThanOrEqual(
    4,
  );
});

it('R1 dropped while both wait in authorize(): its tool runs once after the credential answered; R2 is answered 200', async () => {
  mockGate.authorize = true;
  await droppedWhileWaiting();
});

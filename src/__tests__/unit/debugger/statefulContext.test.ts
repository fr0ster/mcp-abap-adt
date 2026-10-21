/**
 * One debugger connection, one ABAP session: every request on a stateful
 * connection the debugger's live ports open goes back with the same
 * `SAP_SESSIONID` and the same `sap-contextid` the system handed out, and
 * asks for the stateful session; its logoff carries that `SAP_SESSIONID` —
 * the security session, and with it every context of it, ends. As the
 * connection library sends it (measured on premise 2026-10-13, its
 * `logoffCookies`), the logoff carries no `sap-contextid`: a stale one makes
 * SAP answer `400` and close nothing. A run's connection asks for no
 * stateful session and carries no context.
 *
 * A fake ICF on 127.0.0.1: a request without a security session cookie gets
 * a new one; the first stateful request of a security session gets a
 * context cookie. Nothing reaches a system.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { liveAmdpPorts, liveDebugPorts } from '../../../lib/debugger/ports';

const SECURITY = 'SAP_SESSIONID_X01_100';
const CONTEXT = 'sap-contextid';

interface Seen {
  url: string;
  security?: string;
  context?: string;
  stateful: boolean;
}

function cookieOf(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const pair of (header ?? '').split(';')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    if (pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}

async function fakeIcf() {
  const seen: Seen[] = [];
  let securities = 0;
  let contexts = 0;
  const contextOf = new Map<string, string>();
  const server = http.createServer((req, res) => {
    const cookie = req.headers.cookie;
    const stateful =
      String(req.headers['x-sap-adt-sessiontype'] ?? '').toLowerCase() ===
      'stateful';
    const security = cookieOf(cookie, SECURITY);
    const context = cookieOf(cookie, CONTEXT);
    seen.push({ url: req.url ?? '', security, context, stateful });
    const set: string[] = [];
    const sec = security ?? `sec-${++securities}`;
    if (security === undefined) set.push(`${SECURITY}=${sec}; path=/`);
    if (stateful && context === undefined && !contextOf.has(sec)) {
      const ctx = `ctx-${++contexts}`;
      contextOf.set(sec, ctx);
      set.push(`${CONTEXT}=${ctx}; path=/`);
    }
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'text/plain',
        'x-csrf-token': 'csrf-placeholder',
        ...(set.length ? { 'set-cookie': set } : {}),
      });
      res.end('');
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    contextOf,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const isLogoff = (s: Seen) => s.url.includes('/sap/public/bc/icf/logoff');

/**
 * The logoff's `disconnect()` resolves once its bytes are written, not
 * answered: its arrival at the fake is awaited.
 */
async function arrived(seen: Seen[], count: number): Promise<Seen[]> {
  for (let i = 0; i < 200; i++) {
    const logoffs = seen.filter(isLogoff);
    if (logoffs.length >= count) return logoffs;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return seen.filter(isLogoff);
}

describe('a stateful debugger connection stays in one ABAP session', () => {
  let icf: Awaited<ReturnType<typeof fakeIcf>>;
  let context: HandlerContext;
  beforeEach(async () => {
    icf = await fakeIcf();
    const parent = createAbapConnection(
      { url: icf.url, client: '100', authType: 'basic', username: 'U' },
      new BasicAuthProvider('U', 'password'),
      undefined,
      undefined,
      undefined,
      'onprem',
    );
    context = { connection: parent } as unknown as HandlerContext;
  });
  afterEach(async () => {
    await icf.close();
  });

  const send = (c: IAbapConnection, url: string) =>
    c.makeAdtRequest({ url, method: 'GET', timeout: 0 } as never);

  it.each([
    ['the AMDP ports', () => liveAmdpPorts()],
    ['the ABAP ports', () => liveDebugPorts()],
  ])(
    '%s: every request in the same session and context, the logoff ending that session',
    async (_name, portsOf) => {
      const ports = portsOf();
      const connection = await ports.openConnection(context);
      for (let i = 0; i < 3; i++)
        await send(connection, `/sap/bc/adt/amdp/debugger/main/M${i}`);
      await ports.closeConnection(connection);

      const requests = icf.seen.filter((s) => s.url.includes('/debugger/'));
      expect(requests).toHaveLength(3);
      const security = requests[0]?.security;
      expect(security).toBeDefined();
      const ctx = icf.contextOf.get(security as string);
      expect(ctx).toBeDefined();
      // The first stateful request opened the context; every one after carries it.
      expect(requests.map((r) => r.stateful)).toEqual([true, true, true]);
      expect(requests.map((r) => r.security)).toEqual([
        security,
        security,
        security,
      ]);
      expect(requests.slice(1).map((r) => r.context)).toEqual([ctx, ctx]);
      // Nothing of this connection opened a second security session or context.
      expect(icf.contextOf.size).toBe(1);

      const logoffs = await arrived(icf.seen, 1);
      expect(logoffs).toHaveLength(1);
      expect(logoffs[0]?.security).toBe(security);
      expect(logoffs[0]?.context).toBeUndefined();
    },
  );

  it("a run's connection: no stateful session, no context; its logoff ends its security session", async () => {
    const ports = liveAmdpPorts();
    const connection = await ports.openConnection(context, 'stateless');
    await send(connection, '/sap/bc/adt/oo/classrun/ZCL_A');
    await send(connection, '/sap/bc/adt/oo/classrun/ZCL_A');
    await ports.closeConnection(connection);
    const runs = icf.seen.filter((s) => s.url.includes('/classrun/'));
    expect(runs.map((r) => r.stateful)).toEqual([false, false]);
    expect(runs.map((r) => r.context)).toEqual([undefined, undefined]);
    expect(icf.contextOf.size).toBe(0);
    const logoffs = await arrived(icf.seen, 1);
    expect(logoffs).toHaveLength(1);
    expect(logoffs[0]?.security).toBe(runs[0]?.security);
  });
});

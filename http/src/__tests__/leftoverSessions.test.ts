/**
 * Leftover sessions over Streamable HTTP (session-resume spec): the host's
 * owner reaches every per-request instance. A request's connection keeps its
 * runtime file while it holds the session and deletes it once its logoff is
 * written, when the instance leaves after the request; the leftover-session
 * tools answer for the request's headers (`x-sap-url`, `x-sap-client`,
 * `x-sap-login`).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LeftoverSessions } from '@mcp-abap-adt/lib/embeddable';
import { isLogoff, PROBE_PATH } from '../../../src/__tests__/helpers/adtStandIn';
import {
  fakeProbe,
  killedProcessSession,
  runtimeFiles,
} from '../../../src/__tests__/helpers/leftoverSession';
import { type HttpStand, httpStand, until } from './shutdown/harness';

jest.setTimeout(30_000);

let root: string;
let dir: string;
let stand: HttpStand;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-http-'));
  dir = path.join(root, 'runtime');
  stand = await httpStand({
    leftoverSessions: new LeftoverSessions({
      directory: dir,
      probe: fakeProbe(222),
      report: () => {},
    }),
  });
});

afterEach(async () => {
  await stand.close();
  fs.rmSync(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

it("a request's connection: its file while it holds the session, deleted after its logoff", async () => {
  const held = stand.standIn.hold((r) => r.url === `${PROBE_PATH}held`);
  const call = stand.call('ProbeAdt', { id: 'held' });
  await held.arrived;
  const [handle] = runtimeFiles(dir);
  expect(handle).toBeDefined();
  expect(
    JSON.parse(fs.readFileSync(path.join(dir, handle ?? ''), 'utf8')),
  ).toMatchObject({ role: 'built', user: 'SHUTDOWN_USER', pid: 222 });
  held.release();
  expect((await call).isError).toBe(false);
  await until(() => stand.standIn.logoffs() === 1);
  await until(() => runtimeFiles(dir).length === 0);
});

it("lists the headers' user's leftover session and logs it off without a credential", async () => {
  const handle = await killedProcessSession(stand.standIn.url, dir, {
    user: 'SHUTDOWN_USER',
  });
  await killedProcessSession(stand.standIn.url, dir, { user: 'OTHER_USER' });
  const listed = await stand.call('ListLeftoverSessions', {});
  expect(listed.isError).toBe(false);
  expect(
    (JSON.parse(listed.text).sessions as Array<{ handle: string }>).map(
      (s) => s.handle,
    ),
  ).toEqual([handle]);
  const from = stand.standIn.requests.length;
  const off = await stand.call('LogoffLeftoverSession', { handle });
  expect(JSON.parse(off.text)).toEqual({ handle, state: 'logged_off' });
  await until(() => stand.standIn.logoffs() >= 1);
  const sent = stand.standIn.requests.slice(from);
  expect(sent.some((r) => isLogoff(r.url))).toBe(true);
  for (const r of sent) expect(r.authorization).toBeUndefined();
  expect(runtimeFiles(dir)).toHaveLength(1);
});

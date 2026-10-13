/**
 * Leftover sessions over SSE (session-resume spec): the host's owner reaches
 * every SSE session's instance. Its connection keeps a runtime file while it
 * holds the session, deleted once its logoff is written at the SSE close;
 * the leftover-session tools answer for the connection's headers.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LeftoverSessions } from '@mcp-abap-adt/lib/embeddable';
import {
  fakeProbe,
  killedProcessSession,
  runtimeFiles,
} from '../../../src/__tests__/helpers/leftoverSession';
import { type SseStand, sseStand, until } from './shutdown/harness';

jest.setTimeout(30_000);

let root: string;
let dir: string;
let stand: SseStand;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-sse-'));
  dir = path.join(root, 'runtime');
  stand = await sseStand({
    server: {
      leftoverSessions: new LeftoverSessions({
        directory: dir,
        probe: fakeProbe(222),
        report: () => {},
      }),
    },
  });
});

afterEach(async () => {
  await stand.close();
  fs.rmSync(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

it("the session's connection: its file while open, deleted after its logoff at the SSE close", async () => {
  const connection = await stand.open();
  await connection.call('ProbeAdt', { id: 'one' }, 1);
  expect((await connection.answer(1)).isError).toBe(false);
  expect(runtimeFiles(dir)).toHaveLength(1);
  connection.close();
  await until(() => stand.standIn.logoffs() === 1);
  await until(() => runtimeFiles(dir).length === 0);
});

it("lists the headers' user's leftover session, and resumes it as the instance's connection", async () => {
  const handle = await killedProcessSession(stand.standIn.url, dir, {
    user: 'SHUTDOWN_USER',
  });
  const connection = await stand.open();
  await connection.call('ListLeftoverSessions', {}, 1);
  const listed = await connection.answer(1);
  expect(
    (JSON.parse(listed.text).sessions as Array<{ handle: string }>).map(
      (s) => s.handle,
    ),
  ).toEqual([handle]);
  await connection.call('ResumeLeftoverSession', { handle }, 2);
  expect(JSON.parse((await connection.answer(2)).text)).toEqual({
    handle,
    state: 'resumed',
  });
  // The resumed session is the instance's: its logoff at the SSE close
  // deletes the file.
  connection.close();
  await until(() => stand.standIn.logoffs() === 1);
  await until(() => runtimeFiles(dir).length === 0);
});

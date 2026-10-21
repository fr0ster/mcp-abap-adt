/**
 * An SSE stream is networked stdio: when it closes, the background runs it
 * started are cut as stdio's are at its client's close — each run's own
 * connection gets its logoff at once, in the same tick as the instance's
 * other logoffs, under the run's request SAP still holds. The run then ends
 * in the store by its own end, as a run the process's end cut does: once its
 * request settled, `finish` with the run tool's answer. A run another stream
 * started is untouched: its session is not logged off, it is still running,
 * and it ends with SAP's answer as ever.
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import {
  isLogoff,
  type StandInRequest,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { BackgroundRunHandlersGroup } from '../../../../src/lib/handlers/groups/BackgroundRunHandlersGroup';
import { SystemHandlersGroup } from '../../../../src/lib/handlers/groups/SystemHandlersGroup';
import type { HandlerContext } from '../../../../src/lib/handlers/interfaces';
import { type SseStand, sseStand, until } from './shutdown/harness';

jest.setTimeout(30_000);

const placeholder = {
  connection: undefined as never,
  logger: undefined,
} as HandlerContext;

const runOf =
  (name: string) =>
  (r: StandInRequest): boolean =>
    r.method === 'POST' &&
    r.url.includes('/oo/classrun/') &&
    r.url.toUpperCase().includes(name);

let s: SseStand;
let strategy: InMemoryBackgroundRuns;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  strategy = new InMemoryBackgroundRuns();
  s = await sseStand({
    server: { backgroundRuns: strategy },
    groups: [
      new SystemHandlersGroup(placeholder),
      new BackgroundRunHandlersGroup(placeholder),
    ],
  });
});

afterEach(async () => {
  await s.close();
  jest.restoreAllMocks();
});

const sessionOf = (match: (r: StandInRequest) => boolean) =>
  s.standIn.requests.find(match)?.session ?? '';
/** Waits until the store holds run `handle` as finished. */
async function finished(
  handle: string,
  caller: { url: string; client: string; user: string },
): Promise<void> {
  const end = Date.now() + 10_000;
  while ((await strategy.get(handle, caller))?.state !== 'finished') {
    if (Date.now() > end) throw new Error('the run never finished');
    await new Promise((r) => setTimeout(r, 2));
  }
}

const loggedOff = (session: string) =>
  s.standIn.requests.some((r) => isLogoff(r.url) && r.session === session);

it('the stream closes: the run it started is logged off at once and ends in the store; another stream’s run keeps running', async () => {
  // The runs' caller is the user the system names.
  s.standIn.systemInformation('SHUTDOWN_USER');
  const closing = await s.open();
  const other = await s.open();
  const holdA = s.standIn.hold(runOf('ZCL_RUN_A'));
  const holdB = s.standIn.hold(runOf('ZCL_RUN_B'));
  await closing.call(
    'RuntimeRunClass',
    { class_name: 'ZCL_RUN_A', background: true },
    1,
  );
  await other.call(
    'RuntimeRunClass',
    { class_name: 'ZCL_RUN_B', background: true },
    1,
  );
  const handleA = JSON.parse((await closing.answer(1)).text).run_handle;
  const handleB = JSON.parse((await other.answer(1)).text).run_handle;
  await Promise.all([holdA.arrived, holdB.arrived]);
  const runA = sessionOf(runOf('ZCL_RUN_A'));
  const runB = sessionOf(runOf('ZCL_RUN_B'));
  const caller = {
    url: s.standIn.url,
    client: '100',
    user: 'SHUTDOWN_USER',
  };

  closing.close();
  // Logged off at once, under the run's request SAP still holds.
  await until(() => loggedOff(runA));
  expect(loggedOff(runB)).toBe(false);
  expect((await strategy.get(handleB, caller))?.state).toBe('running');

  // The cut run ends in the store by its own end, once its request settled.
  holdA.release();
  await finished(handleA, caller);

  // The other stream's run: still running, its session not logged off.
  expect(loggedOff(runB)).toBe(false);
  expect((await strategy.get(handleB, caller))?.state).toBe('running');
  holdB.release();
  await finished(handleB, caller);
});

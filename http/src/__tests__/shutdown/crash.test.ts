/**
 * A crash outside a tool, http (spec §6.4): `uncaughtException` and
 * `unhandledRejection` run the forced close — the stand-in receives the
 * logoff of the held instance's connections, one fixed-words line, exit `1`;
 * during a running shutdown the crash forces it, and a second crash starts no
 * other. The events arrive on the launcher's process edge.
 */

import { isUnlockOf } from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type HttpStand, httpStand, turns, until } from './harness';

jest.setTimeout(30_000);

let s: HttpStand;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
});

const connects = () =>
  s.standIn.requests.filter((r) => r.url.includes('discovery')).length;
const failedLine = (lines: string[]) =>
  lines.filter((l) => l.startsWith('[MCP] The process failed (TypeError)'));

it.each([
  ['uncaughtException', [new TypeError('a secret-looking detail')]],
  [
    'unhandledRejection',
    [new TypeError('a secret-looking detail'), Promise.resolve()],
  ],
])(
  '%s outside a tool: every owned connection logged off, one line, exit 1',
  async (event, args) => {
    // A pooled instance keeps its connections past its request.
    expect((await s.call('HoldState', { id: 'P' })).isError).toBe(false);
    setTimeout(() => s.processLike.emit(event, ...args), 0);
    expect(await s.exited).toBe(1);
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === connects());
    expect(s.standIn.logoffs()).toBeGreaterThanOrEqual(2);
    expect(failedLine(s.stderr)).toHaveLength(1);
    expect(s.stderr.join('\n')).not.toContain('secret-looking');
  },
);

it('a crash during a running shutdown forces it; a second crash starts no other; logoff once', async () => {
  const hold = s.standIn.hold((r) => isUnlockOf('A')(r.url));
  void s.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;
  s.processLike.emit('SIGTERM');
  await turns(20);
  expect(s.exits).toEqual([]);
  s.processLike.emit('uncaughtException', new TypeError('first'));
  s.processLike.emit(
    'unhandledRejection',
    new TypeError('second'),
    Promise.resolve(),
  );
  expect(await s.exited).toBe(1);
  await until(() => s.standIn.logoffs() === 1);
  await turns(20);
  expect(s.exits).toEqual([1]);
  expect(s.standIn.logoffs()).toBe(1);
  expect(failedLine(s.stderr)).toHaveLength(1);
  hold.release();
});

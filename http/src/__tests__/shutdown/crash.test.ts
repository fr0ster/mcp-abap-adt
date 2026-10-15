/**
 * A crash outside a tool, http: `uncaughtException` and
 * `unhandledRejection` run the forced close — the stand-in receives the
 * logoff of the held instance's connections, one fixed-words line, exit `1`.
 * (A crash during a running shutdown: core's suite and lib's sequence — the
 * http shutdown runs no step a crash could meet.) The events arrive on the
 * launcher's process edge.
 */

import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type HttpStand, httpStand, until } from './harness';

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

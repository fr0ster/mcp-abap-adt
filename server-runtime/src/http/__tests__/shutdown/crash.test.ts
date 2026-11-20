/**
 * A crash outside a tool, http: `uncaughtException` and
 * `unhandledRejection` run the orderly shutdown — the stand-in receives the
 * logoff of the held instance's connections, one fixed-words line, exit `1`.
 * (A crash during a running shutdown: core's suite and lib's sequence — the
 * http shutdown runs no step a crash could meet.) The events arrive on the
 * launcher's process edge.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import { format } from 'node:util';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import { type HttpStand, httpStand, until } from './harness';

let s: HttpStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
  s = await httpStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

const connects = () =>
  s.standIn.requests.filter((r) => r.url.includes('discovery')).length;
const failedLine = (lines: string[]) =>
  lines.filter((l) => l.startsWith('[MCP] The process failed (TypeError)'));

for (const [event, args] of [
  ['uncaughtException', [new TypeError('a secret-looking detail')]],
  [
    'unhandledRejection',
    [new TypeError('a secret-looking detail'), Promise.resolve()],
  ],
] satisfies [string, unknown[]][]) {
  it(
    format(
      '%s outside a tool: every owned connection logged off, one line, exit 1',
      event,
    ),
    async () => {
      // A pooled instance keeps its connections past its request.
      assert.equal((await s.call('HoldState', { id: 'P' })).isError, false);
      setTimeout(() => s.processLike.emit(event, ...args), 0);
      assert.equal(await s.exited, 1);
      assert.deepStrictEqual(ownedConnections(), []);
      await until(() => s.standIn.logoffs() === connects());
      assert.ok(s.standIn.logoffs() >= 2);
      assert.equal(failedLine(s.stderr).length, 1);
      assert.ok(!s.stderr.join('\n').includes('secret-looking'));
    },
  );
}

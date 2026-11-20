/**
 * A listed long tool runs on a connection of its own, one case per tool on the approved list, against the ADT stand-in:
 * every request the tool sends runs in an ABAP session that is not the
 * instance's, stateless; when the call ends normally that session is logged
 * off once, after its last request, and the instance's session is not. On a
 * connection the host injected without a `freshConnection` the tool is
 * refused with its fixed words, and nothing is sent.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { FRESH_CONNECTION_UNAVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import { LONG_TOOLS } from '../../../lib/longTools';
import { isLogoff } from '../../helpers/adtStandIn';
import {
  LONG_TOOL_ARGS,
  longStand,
  payloadOf,
  probeAnswered,
  until,
} from './harness';

beforeEach(() => {
  mock.method(console, 'error', () => {});
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

for (const tool of LONG_TOOLS) {
  describe(format('%s', tool), () => {
    const args = LONG_TOOL_ARGS[tool] ?? {};

    it('runs on its own stateless session, logged off after its last request; the instance’s is untouched', async () => {
      const stand = await longStand(tool);
      try {
        const answer = await stand.call(tool, args);
        assert.equal(payloadOf(answer).timed_out, undefined);

        const own = stand.standIn.requests.filter(stand.isToolRequest);
        assert.ok(own.length > 0);
        const sessions = [...new Set(own.map((r) => r.session))];
        assert.equal(sessions.length, 1);
        assert.notEqual(sessions[0], stand.instanceSession);
        assert.deepStrictEqual(
          own.filter((r) => r.sessionType === 'stateful'),
          [],
        );

        await until(() => stand.standIn.loggedOff().length === 1);
        assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);
        const requests = stand.standIn.requests;
        const logoff = requests.findIndex((r) => isLogoff(r.url));
        assert.deepStrictEqual(
          requests.slice(logoff + 1).filter((r) => r.session === sessions[0]),
          [],
        );

        // The instance's session goes on working, never logged off.
        await stand.call('ProbeAdt', { id: `then-${tool}` });
        assert.equal(probeAnswered(stand, `then-${tool}`), true);
        assert.deepStrictEqual(stand.standIn.loggedOff(), sessions);
      } finally {
        await stand.close();
      }
    });

    it('on an injected connection without freshConnection, is refused with its fixed words and sends nothing', async () => {
      const stand = await longStand(tool, { injected: 'bare' });
      try {
        const answer = await stand.call(tool, args);
        assert.equal(answer.isError, true);
        assert.ok(
          (answer.content?.[0]?.text ?? '').includes(
            FRESH_CONNECTION_UNAVAILABLE_WORDS,
          ),
        );
        assert.deepStrictEqual(
          stand.standIn.requests.filter(stand.isToolRequest),
          [],
        );
        assert.deepStrictEqual(stand.standIn.loggedOff(), []);
      } finally {
        await stand.close();
      }
    });
  });
}

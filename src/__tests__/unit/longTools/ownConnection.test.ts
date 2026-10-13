/**
 * RF10 — a listed long tool runs on a connection of its own (spec §5.8,
 * §14.9), one case per tool on the approved list, against the ADT stand-in:
 * every request the tool sends runs in an ABAP session that is not the
 * instance's, stateless; when the call ends normally that session is logged
 * off once, after its last request, and the instance's session is not. On a
 * connection the host injected without a `freshConnection` the tool is
 * refused with D20's words, and nothing is sent.
 *
 * And the connection is owned (§6.4): the terminal close waits for a
 * sync-write request still running after its `timeout` before the logoff
 * (the other modes' connections were logged off when the timeout fired); the
 * forced close logs it off at once.
 */

import { FRESH_CONNECTION_UNAVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import { LONG_TOOLS } from '../../../lib/longTools';
import { forceClose } from '../../../lib/ownedConnections';
import { isLogoff } from '../../helpers/adtStandIn';
import {
  LONG_TOOL_ARGS,
  longStand,
  payloadOf,
  probeAnswered,
  until,
} from './harness';

jest.setTimeout(60_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

describe.each(LONG_TOOLS)('%s', (tool) => {
  const args = LONG_TOOL_ARGS[tool] ?? {};

  it('runs on its own stateless session, logged off after its last request; the instance’s is untouched', async () => {
    const stand = await longStand(tool);
    try {
      const answer = await stand.call(tool, args);
      expect(payloadOf(answer).timed_out).toBeUndefined();

      const own = stand.standIn.requests.filter(stand.isToolRequest);
      expect(own.length).toBeGreaterThan(0);
      const sessions = [...new Set(own.map((r) => r.session))];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).not.toBe(stand.instanceSession);
      expect(own.filter((r) => r.sessionType === 'stateful')).toEqual([]);

      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual(sessions);
      const requests = stand.standIn.requests;
      const logoff = requests.findIndex((r) => isLogoff(r.url));
      expect(
        requests.slice(logoff + 1).filter((r) => r.session === sessions[0]),
      ).toEqual([]);

      // The instance's session goes on working, never logged off.
      await stand.call('ProbeAdt', { id: `then-${tool}` });
      expect(probeAnswered(stand, `then-${tool}`)).toBe(true);
      expect(stand.standIn.loggedOff()).toEqual(sessions);
    } finally {
      await stand.close();
    }
  });

  it('on an injected connection without freshConnection, is refused with D20’s words and sends nothing', async () => {
    const stand = await longStand(tool, { injected: 'bare' });
    try {
      const answer = await stand.call(tool, args);
      expect(answer.isError).toBe(true);
      expect(answer.content?.[0]?.text ?? '').toContain(
        FRESH_CONNECTION_UNAVAILABLE_WORDS,
      );
      expect(stand.standIn.requests.filter(stand.isToolRequest)).toEqual([]);
      expect(stand.standIn.loggedOff()).toEqual([]);
    } finally {
      await stand.close();
    }
  });
});

describe('the long call’s own connection is owned (§6.4)', () => {
  it('the terminal close waits for a sync-write request still running after the timeout, then logs it off', async () => {
    const stand = await longStand('RuntimeRunClass');
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const call = stand.call('RuntimeRunClass', {
        ...LONG_TOOL_ARGS.RuntimeRunClass,
        timeout: 1,
      });
      await hold.arrived;
      expect(payloadOf(await call).timed_out).toBe(true);

      let closed = false;
      const closing = stand.server.terminalClose().then(() => {
        closed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(closed).toBe(false);
      expect(stand.standIn.loggedOff()).toEqual([]);

      hold.release();
      await closing;
      const held = stand.standIn.requests.find(stand.isToolRequest);
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual([held?.session]);
    } finally {
      await stand.close();
    }
  });

  it('the forced close logs a sync-write request’s session off at once, the request still running', async () => {
    const stand = await longStand('RuntimeRunClass');
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const call = stand.call('RuntimeRunClass', {
        ...LONG_TOOL_ARGS.RuntimeRunClass,
        timeout: 1,
      });
      await hold.arrived;
      expect(payloadOf(await call).timed_out).toBe(true);
      const held = stand.standIn.requests.find(stand.isToolRequest);

      await forceClose();
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual([held?.session]);
      hold.release();
    } finally {
      await stand.close();
    }
  });
});

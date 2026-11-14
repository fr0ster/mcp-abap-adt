/**
 * The deferred-logon take-up flow (#353), with stand-ins: a first process
 * locks the class and is killed; a second, with `--restore-session`, takes
 * up its session at its first call; a separate session of the same user is
 * refused the class while the second holds it, and locks and unlocks it
 * once the second has logged off. Every path that did not prove the class
 * free ends by logging off the destination's leftover sessions; a lock the
 * separate session took is released before the flow ends. No lock handle
 * reaches a failure. No process starts and no system is reached.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type SeparateLock,
  type SeparateSession,
  type TakeUpLaunches,
  type TakeUpServer,
  takeUpCase,
} from '../../integration/helpers/takeUpCase';

type Answer = { isError: boolean; content: { type: 'text'; text: string }[] };

const text = (value: unknown, isError = false): Answer => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

const HELD = 'Object ZCL_X is locked by user TESTER (EU/510)';

/** A stand-in server: answers by tool, records every call and its end. */
function standIn(
  name: string,
  log: string[],
  answers: Readonly<Record<string, Answer>>,
): TakeUpServer {
  return {
    call: async (tool, args) => {
      log.push(
        `${name}.${tool}${'handle' in args ? `(${String(args.handle)})` : ''}`,
      );
      return answers[tool] ?? text({}, true);
    },
    close: async () => {
      log.push(`${name}.close`);
    },
    kill: () => {
      log.push(`${name}.kill`);
    },
    stop: async () => {
      log.push(`${name}.stop`);
      return 0;
    },
  };
}

/** A separate session whose lock answers come from `locks` in turn. */
function separateSession(
  log: string[],
  locks: SeparateLock[],
  unlock: { ok: true } | { refused: string } = { ok: true },
): SeparateSession {
  return {
    lock: async () => {
      log.push('separate.lock');
      return locks.shift() ?? { refused: 'no answer left' };
    },
    unlock: async () => {
      log.push('separate.unlock');
      return unlock;
    },
    close: async () => {
      log.push('separate.close');
    },
  };
}

function launches(
  log: string[],
  options: {
    lock: Answer;
    takeUp?: Answer;
    secondFails?: boolean;
    separate?: SeparateSession;
  },
): TakeUpLaunches {
  return {
    first: async () => standIn('first', log, { HandlerLock: options.lock }),
    second: async () => {
      log.push('second.launch');
      if (options.secondFails === true) throw new Error('the launch failed');
      return standIn('second', log, {
        HandlerGet: options.takeUp ?? text({ source: '...' }),
      });
    },
    separate: async () => {
      log.push('separate.open');
      return (
        options.separate ??
        separateSession(log, [{ refused: HELD }, { handle: 'H2' }])
      );
    },
    cleaner: async () => {
      log.push('cleaner.launch');
      return standIn('cleaner', log, {
        ListLeftoverSessions: text({ sessions: [{ handle: 'h1' }] }),
        LogoffLeftoverSession: text({ logged_off: true }),
      });
    },
  };
}

const CLEANUP = [
  'cleaner.launch',
  'cleaner.ListLeftoverSessions',
  'cleaner.LogoffLeftoverSession(h1)',
  'cleaner.stop',
  'cleaner.close',
];

const LOCKED_AND_KILLED = ['first.HandlerLock', 'first.kill', 'first.close'];

describe('the take-up flow', () => {
  it('held while taken up, free after its logoff: the separate session locks and unlocks, nothing left to clean', async () => {
    const log: string[] = [];
    const result = await takeUpCase(
      launches(log, { lock: text({ lock_handle: 'L1' }) }),
      'ZCL_X',
    );
    assert.deepEqual(result, {
      heldWhileTakenUp: HELD,
      freedAfterLogoff: true,
      cleaned: false,
      secondExit: 0,
    });
    assert.deepEqual(log, [
      ...LOCKED_AND_KILLED,
      'second.launch',
      'second.HandlerGet',
      'separate.open',
      'separate.lock',
      'second.stop',
      'second.close',
      'separate.lock',
      'separate.unlock',
      'separate.close',
    ]);
  });

  it('the lock answers no handle: the failure carries the answer, and the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, { lock: text({ error: 'refused (EU/510)' }, true) }),
        'ZCL_X',
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('no lock handle'), error.message);
        assert.ok(error.message.includes('(EU/510)'), error.message);
        return true;
      },
    );
    assert.deepEqual(log, [...LOCKED_AND_KILLED, ...CLEANUP]);
  });

  it('the second launch fails: the flow fails, and the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, { lock: text({ lock_handle: 'L1' }), secondFails: true }),
        'ZCL_X',
      ),
      /the launch failed/,
    );
    assert.deepEqual(log, [...LOCKED_AND_KILLED, 'second.launch', ...CLEANUP]);
  });

  it('the take-up call fails: the failure carries its answer; the second stops, the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, {
          lock: text({ lock_handle: 'L1' }),
          takeUp: text({ error: 'no_connection' }, true),
        }),
        'ZCL_X',
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('no_connection'), error.message);
        return true;
      },
    );
    assert.deepEqual(log, [
      ...LOCKED_AND_KILLED,
      'second.launch',
      'second.HandlerGet',
      'second.stop',
      'second.close',
      ...CLEANUP,
    ]);
  });

  it('not held while taken up: the separate lock is released, the flow fails, the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, {
          lock: text({ lock_handle: 'L1' }),
          separate: separateSession(log, [{ handle: 'H2' }]),
        }),
        'ZCL_X',
      ),
      /was not held/,
    );
    assert.deepEqual(log, [
      ...LOCKED_AND_KILLED,
      'second.launch',
      'second.HandlerGet',
      'separate.open',
      'separate.lock',
      'separate.unlock',
      'second.stop',
      'second.close',
      'separate.close',
      ...CLEANUP,
    ]);
  });

  it('still held after the logoff: the failure carries the answer, the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, {
          lock: text({ lock_handle: 'L1' }),
          separate: separateSession(log, [
            { refused: HELD },
            { refused: 'still locked (EU/510)' },
          ]),
        }),
        'ZCL_X',
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('still locked (EU/510)'));
        return true;
      },
    );
    assert.deepEqual(log, [
      ...LOCKED_AND_KILLED,
      'second.launch',
      'second.HandlerGet',
      'separate.open',
      'separate.lock',
      'second.stop',
      'second.close',
      'separate.lock',
      'separate.close',
      ...CLEANUP,
    ]);
  });

  it('the separate unlock is refused: the failure carries the answer, never a lock handle', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, {
          lock: text({ lock_handle: 'L1' }),
          separate: separateSession(
            log,
            [{ refused: HELD }, { handle: 'SECRET-HANDLE' }],
            { refused: 'Handle SECRET-HANDLE is not valid (EU/522)' },
          ),
        }),
        'ZCL_X',
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('(EU/522)'), error.message);
        assert.equal(error.message.includes('SECRET-HANDLE'), false);
        return true;
      },
    );
  });
});

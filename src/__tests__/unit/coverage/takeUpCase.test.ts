/**
 * The deferred-logon take-up flow's cleanup (#353), with stand-in servers:
 * once the first process may have written its session, every path that
 * did not unlock ends by logging off the destination's leftover sessions —
 * the lock answering no handle, the second launch failing, the unlock
 * refused. No process starts and no system is reached.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type TakeUpLaunches,
  type TakeUpServer,
  takeUpCase,
} from '../../integration/helpers/takeUpCase';

type Answer = { isError: boolean; content: { type: 'text'; text: string }[] };

const text = (value: unknown, isError = false): Answer => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

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

/** The launches, with the answers each stand-in gives and a failing second launch when asked. */
function launches(
  log: string[],
  options: {
    lock: Answer;
    unlock?: Answer;
    secondFails?: boolean;
  },
): TakeUpLaunches {
  return {
    first: async () => standIn('first', log, { LockObjectLow: options.lock }),
    second: async () => {
      log.push('second.launch');
      if (options.secondFails === true) throw new Error('the launch failed');
      return standIn('second', log, {
        UnlockObjectLow: options.unlock ?? text({}),
      });
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

describe('the take-up flow: the cleanup after the first process wrote its session', () => {
  it('the lock answers no handle: the flow fails, and the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(launches(log, { lock: text({}) }), 'ZCL_X'),
      /no lock handle/,
    );
    assert.deepEqual(log, [
      'first.LockObjectLow',
      'first.kill',
      'first.close',
      ...CLEANUP,
    ]);
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
    assert.deepEqual(log, [
      'first.LockObjectLow',
      'first.kill',
      'first.close',
      'second.launch',
      ...CLEANUP,
    ]);
  });

  it('the unlock is refused: the second process stops first, then the leftover is logged off', async () => {
    const log: string[] = [];
    await assert.rejects(
      takeUpCase(
        launches(log, {
          lock: text({ lock_handle: 'L1' }),
          unlock: text({ error: 'refused' }, true),
        }),
        'ZCL_X',
      ),
      /refused/,
    );
    assert.deepEqual(log, [
      'first.LockObjectLow',
      'first.kill',
      'first.close',
      'second.launch',
      'second.UnlockObjectLow',
      'second.stop',
      'second.close',
      ...CLEANUP,
    ]);
  });

  it('the unlock succeeds: nothing is left to clean', async () => {
    const log: string[] = [];
    const result = await takeUpCase(
      launches(log, { lock: text({ lock_handle: 'L1' }) }),
      'ZCL_X',
    );
    assert.deepEqual(result, { unlocked: true, cleaned: false, secondExit: 0 });
    assert.equal(log.includes('cleaner.launch'), false);
  });
});

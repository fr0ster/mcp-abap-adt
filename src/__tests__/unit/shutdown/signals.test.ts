/**
 * Every catchable end runs the one orderly shutdown, once, and it lets every
 * logoff finish (each answered, or its transport failed) before the exit:
 * `SIGTERM`, `SIGINT`, `SIGHUP`, `SIGQUIT`, `SIGBREAK`, the end of stdin, a
 * broken pipe (`EPIPE`) on stdin or stdout (the client gone: an end of
 * input, exit 0), a crash outside a tool (one line, exit 1), an emptied event
 * loop (`beforeExit`). A second signal forces, as before.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { own } from '../../../lib/ownedConnections';
import {
  installShutdownSequence,
  logOffAtOnce,
  SHUTDOWN_SIGNALS,
} from '../../../lib/shutdownSequence';

const turns = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

function setup() {
  resetProcessLatchForTests();
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
    stdout: new EventEmitter(),
  });
  const exits: number[] = [];
  const stderr: string[] = [];
  let runs = 0;
  installShutdownSequence({
    run: async (step) => {
      runs += 1;
      step('the logoffs');
      await logOffAtOnce();
      return { lines: [] };
    },
    exit: (code) => exits.push(code),
    stderr: (line) => stderr.push(line),
    processLike,
    onStdinEnd: true,
  });
  // One owned connection whose logoff is written at once and answered when told.
  let answer!: () => void;
  const answered = new Promise<void>((r) => {
    answer = r;
  });
  const disconnect = mock.fn(async () => undefined);
  own(
    { disconnect, flushGoodbye: () => answered },
    { owner: {}, role: 'built' },
  );
  return {
    processLike,
    exits,
    stderr,
    runs: () => runs,
    answer,
    disconnect,
  };
}

const pipeError = () =>
  Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

const triggers: Array<
  [string, (p: ReturnType<typeof setup>['processLike']) => void, number]
> = [
  ...SHUTDOWN_SIGNALS.map(
    (name) =>
      [
        name,
        (p: ReturnType<typeof setup>['processLike']) => p.emit(name),
        0,
      ] as [
        string,
        (p: ReturnType<typeof setup>['processLike']) => void,
        number,
      ],
  ),
  ['stdin end', (p) => p.stdin.emit('end'), 0],
  ['EPIPE on stdout', (p) => p.stdout.emit('error', pipeError()), 0],
  ['EPIPE on stdin', (p) => p.stdin.emit('error', pipeError()), 0],
  ['beforeExit', (p) => p.emit('beforeExit', 0), 0],
  [
    'uncaughtException',
    (p) => p.emit('uncaughtException', new TypeError('x')),
    1,
  ],
  [
    'unhandledRejection',
    (p) => p.emit('unhandledRejection', new TypeError('x'), Promise.resolve()),
    1,
  ],
  [
    'another error on stdout',
    (p) =>
      p.stdout.emit(
        'error',
        Object.assign(new Error('boom'), { code: 'EBADF' }),
      ),
    1,
  ],
];

describe('every catchable end runs the orderly shutdown once', () => {
  for (const [_name, trigger, code] of triggers) {
    it(
      format('%s: one run, the logoff answered before the exit', _name),
      async () => {
        const s = setup();
        trigger(s.processLike);
        await turns();
        assert.equal(s.runs(), 1);
        assert.equal(s.disconnect.mock.callCount(), 1);
        assert.deepStrictEqual(s.exits, []); // the logoff not yet answered
        s.answer();
        await turns();
        assert.deepStrictEqual(s.exits, [code]);
        // A later trigger of any kind starts no second run.
        s.processLike.emit('beforeExit', 0);
        s.processLike.stdin.emit('end');
        await turns();
        assert.equal(s.runs(), 1);
      },
    );
  }

  it('a crash names its class on stderr, once', async () => {
    const s = setup();
    s.processLike.emit('uncaughtException', new TypeError('secret detail'));
    s.processLike.emit('uncaughtException', new TypeError('again'));
    s.answer();
    await turns();
    assert.equal(s.stderr.filter((l) => l.includes('(TypeError)')).length, 1);
    assert.ok(!s.stderr.join('\n').includes('secret detail'));
    assert.deepStrictEqual(s.exits, [1]);
  });

  for (const name of ['SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    it(
      format(
        'a second signal (%s) forces the end while a logoff is still unanswered: exit 1',
        name,
      ),
      async () => {
        const s = setup();
        s.processLike.emit('SIGINT');
        await turns();
        assert.deepStrictEqual(s.exits, []);
        s.processLike.emit(name);
        await turns();
        assert.deepStrictEqual(s.exits, [1]);
        assert.equal(s.runs(), 1);
        s.answer();
      },
    );
  }
});

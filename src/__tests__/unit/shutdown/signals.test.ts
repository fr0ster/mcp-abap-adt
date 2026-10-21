/**
 * Every catchable end runs the one orderly shutdown, once, and it lets every
 * logoff finish (each answered, or its transport failed) before the exit:
 * `SIGTERM`, `SIGINT`, `SIGHUP`, `SIGQUIT`, `SIGBREAK`, the end of stdin, a
 * broken pipe (`EPIPE`) on stdin or stdout (the client gone: an end of
 * input, exit 0), a crash outside a tool (one line, exit 1), an emptied event
 * loop (`beforeExit`). A second signal forces, as before.
 */
import { EventEmitter } from 'node:events';
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
  const disconnect = jest.fn(async () => undefined);
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
  it.each(triggers)(
    '%s: one run, the logoff answered before the exit',
    async (_name, trigger, code) => {
      const s = setup();
      trigger(s.processLike);
      await turns();
      expect(s.runs()).toBe(1);
      expect(s.disconnect).toHaveBeenCalledTimes(1);
      expect(s.exits).toEqual([]); // the logoff not yet answered
      s.answer();
      await turns();
      expect(s.exits).toEqual([code]);
      // A later trigger of any kind starts no second run.
      s.processLike.emit('beforeExit', 0);
      s.processLike.stdin.emit('end');
      await turns();
      expect(s.runs()).toBe(1);
    },
  );

  it('a crash names its class on stderr, once', async () => {
    const s = setup();
    s.processLike.emit('uncaughtException', new TypeError('secret detail'));
    s.processLike.emit('uncaughtException', new TypeError('again'));
    s.answer();
    await turns();
    expect(s.stderr.filter((l) => l.includes('(TypeError)'))).toHaveLength(1);
    expect(s.stderr.join('\n')).not.toContain('secret detail');
    expect(s.exits).toEqual([1]);
  });

  it.each(['SIGTERM', 'SIGHUP', 'SIGBREAK'])(
    'a second signal (%s) forces the end while a logoff is still unanswered: exit 1',
    async (name) => {
      const s = setup();
      s.processLike.emit('SIGINT');
      await turns();
      expect(s.exits).toEqual([]);
      s.processLike.emit(name);
      await turns();
      expect(s.exits).toEqual([1]);
      expect(s.runs()).toBe(1);
      s.answer();
    },
  );
});

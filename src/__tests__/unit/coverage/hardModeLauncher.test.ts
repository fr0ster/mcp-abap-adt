/**
 * The hard-mode launcher without built-in limits (plan C2 Step 4b), on fake
 * children: small Node scripts this test writes and starts with
 * `process.execPath`. Readiness is the child's own answer — the
 * `initialize` answer over stdio, the listening line over Streamable HTTP —
 * raced against its exit; stopping is `SIGTERM` and its exit event. A fake
 * is told to go on by a line on its stdin (`{"go":true}`), which every OS
 * carries — no POSIX-only signal. Jest's
 * fake timers count the timers left pending: a poll or a deadline of the
 * launcher's would leave one.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type Child,
  httpReady,
  LISTENING_LINE,
  startChild,
  stdioReady,
} from '../../integration/helpers/testers/hardMode';

jest.setTimeout(60_000);

let dir: string;
const children: Child[] = [];

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-mode-fakes-'));
  // Answers `initialize` once told to (a `go` line on stdin), after saying it
  // has read it.
  fs.writeFileSync(
    path.join(dir, 'stdio-answers.js'),
    `
let pending;
let buffer = '';
const answer = () => {
  if (!pending) return;
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: pending.id, result: {
    protocolVersion: pending.params.protocolVersion,
    capabilities: {}, serverInfo: { name: 'fake', version: '0' } } }) + '\\n');
};
let told = false;
process.on('SIGTERM', () => process.exit(0));
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (let end = buffer.indexOf('\\n'); end >= 0; end = buffer.indexOf('\\n')) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.go === true) {
      told = true;
      answer();
    } else if (message.method === 'initialize') {
      pending = message;
      process.stderr.write('read initialize\\n');
      if (told) answer();
    }
  }
});
`,
  );
  // Reads `initialize` and exits without an answer.
  fs.writeFileSync(
    path.join(dir, 'stdio-exits.js'),
    `
process.stdin.once('data', () => {
  process.stderr.write('no answer from this fake\\n');
  process.exit(4);
});
`,
  );
  // Writes the listening line once told to (a `go` line on stdin).
  fs.writeFileSync(
    path.join(dir, 'http-listens.js'),
    `
process.stderr.write('starting\\n');
process.on('SIGTERM', () => process.exit(0));
process.stdin.on('data', (chunk) => {
  if (String(chunk).includes('"go":true')) {
    process.stderr.write(${JSON.stringify(LISTENING_LINE)} + '127.0.0.1:4711\\n');
  }
});
`,
  );
  // Exits before any listening line.
  fs.writeFileSync(
    path.join(dir, 'http-exits.js'),
    `
process.stderr.write('could not listen\\n');
process.exit(3);
`,
  );
});

afterEach(async () => {
  jest.useRealTimers();
  for (const child of children.splice(0)) await child.stop();
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const start = (script: string): Child => {
  const child = startChild(path.join(dir, script), [], {
    PATH: process.env.PATH ?? '',
  });
  children.push(child);
  return child;
};

/** Resolves when the child has written `text` on stderr. */
const said = (child: Child, text: string): Promise<void> =>
  new Promise((resolve) => {
    const check = (): void => {
      if (child.stderr().includes(text)) {
        child.process.stderr?.off('data', check);
        resolve();
      }
    };
    child.process.stderr?.on('data', check);
    check();
  });

/** Tells a fake to go on: a line on its stdin. */
const go = (child: Child): void => {
  child.process.stdin?.write('{"go":true}\n');
};

/** Lets the event loop run once, so a settled promise has run its reactions. */
const turn = (): Promise<void> => new Promise((r) => setImmediate(r));

const fakeTimers = (): void => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
};

describe('stdio readiness', () => {
  it('ready when the initialize answer arrives, without a timer', async () => {
    fakeTimers();
    const child = start('stdio-answers.js');
    let ready = false;
    const readiness = stdioReady(child).then((session) => {
      ready = true;
      return session;
    });
    await said(child, 'read initialize');
    await turn();
    expect(ready).toBe(false);
    // The initialize is out and unanswered: no timer is armed for it.
    expect(jest.getTimerCount()).toBe(0);
    go(child);
    const session = await readiness;
    expect(ready).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    await session.close();
  });

  it('an exit before the initialize answer rejects at once', async () => {
    const child = start('stdio-exits.js');
    await expect(stdioReady(child)).rejects.toThrow(
      'the child exited (4) before it was stopped:\nno answer from this fake',
    );
  });
});

describe('HTTP readiness', () => {
  it('ready when the listening line arrives, without a timer', async () => {
    fakeTimers();
    const child = start('http-listens.js');
    let ready: string | undefined;
    const readiness = httpReady(child).then((address) => {
      ready = address;
    });
    await said(child, 'starting');
    await turn();
    expect(ready).toBeUndefined();
    go(child);
    await readiness;
    expect(ready).toBe('127.0.0.1:4711');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('an exit before the listening line rejects at once', async () => {
    const child = start('http-exits.js');
    await expect(httpReady(child)).rejects.toThrow(
      'the child exited (3) before it was stopped:\ncould not listen',
    );
  });
});

describe('stop', () => {
  it('stop waits for the exit event and sets no timer', async () => {
    const child = start('http-listens.js');
    await said(child, 'starting');
    fakeTimers();
    await child.stop();
    expect(child.process.exitCode ?? child.process.signalCode).not.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});

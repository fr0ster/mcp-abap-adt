/**
 * stdio has no idle bound (20.1.1): the stdio server's life and its state are
 * governed by the client that started it. Held state ends by an explicit
 * tool, the client closing stdin, the backend's answer or the process's
 * shutdown — never on the server's clock. So a stdio instance that holds
 * state and gets no call arms no timer, however long it waits, and the end
 * of stdin ends the process.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { browserCallbackStrategy } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { NO_IDLE_BOUND, type StatePart } from '@mcp-abap-adt/lib/state';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  getTimerCount,
  reset,
  useFakeTimers,
  useRealTimers,
} from '../../../../src/__tests__/helpers/fakeTime';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

const MINUTE = 60_000;

/** A part the test drives: it holds once told to, and counts its disposals. */
const heldPart = () => {
  let held = false;
  let tell: () => void = () => {};
  const dispose = mock.fn(async () => {
    held = false;
    tell();
  });
  const part: StatePart = {
    holdsState: () => held,
    pending: () => false,
    failures: () => [],
    dispose,
    observe: (f) => {
      tell = f;
    },
  };
  return {
    part,
    dispose,
    hold: () => {
      held = true;
      tell();
    },
  };
};

describe('stdio: no idle bound on held state', () => {
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => {
    // clearAllTimers() -> reset(), then enabled again with the same options
    // (spec §3.7); the useRealTimers after it, as before.
    reset();
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    });
    useRealTimers();
  });

  it('the stdio server states no bound', () => {
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
    );
    assert.equal(server.state.idleMinutes, NO_IDLE_BOUND);
  });

  it('held state and no call: no timer is armed, and a day later the state is still held, nothing disposed, nothing said', async () => {
    const lines: string[] = [];
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
      {
        stateLogger: {
          info: (m) => lines.push(m),
          error: (m) => lines.push(m),
        },
      },
    );
    const { part, dispose, hold } = heldPart();
    server.state.attach(part);
    // A tool call takes up state and ends: where a bound would be armed.
    server.state.callStarted();
    hold();
    server.state.callEnded();
    const handle = server.state.handle;

    assert.equal(getTimerCount(), 0);
    mock.timers.tick(24 * 60 * MINUTE);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    assert.equal(getTimerCount(), 0);
    assert.equal(dispose.mock.callCount(), 0);
    assert.equal(server.state.holdsState(), true);
    assert.equal(server.state.handle, handle);
    server.state.check(handle);
    assert.deepStrictEqual(lines, []);
  });
});

describe('stdio: the end of stdin ends the process', () => {
  beforeEach(() => resetProcessLatchForTests());
  afterEach(() => {
    mock.restoreAll();
    resetProcessLatchForTests();
  });

  for (const event of ['end', 'close']) {
    it(
      format(
        "the launcher's server exits 0 when the client closes stdin (%s)",
        event,
      ),
      async (t) => {
        t.mock.method(process.stderr, 'write', () => true);
        const stderr: string[] = [];
        const exits: number[] = [];
        const processLike = Object.assign(new EventEmitter(), {
          stdin: new EventEmitter(),
        });
        const [, serverSide] = InMemoryTransport.createLinkedPair();
        // No destination: inspection-only mode, nothing reaches a system; it
        // lists the tools of the stated system type's table.
        const config = readCoreConfig(['--system-type=onprem'], {}, null);
        await launch(
          config,
          {
            toolSet: fullToolSet,
            program: 'mcp-abap-adt',
            version: '0.0.0-test',
            packageName: '@mcp-abap-adt/core',
          },
          {
            // Inspection-only mode starts no login: the program's strategy, unused.
            browserStrategy: browserCallbackStrategy,
            stderr: (line) => stderr.push(line),
            exit: (code) => {
              exits.push(code);
            },
            processLike,
            platform: 'linux',
            transport: serverSide,
          },
        );
        assert.deepStrictEqual(exits, []);

        processLike.stdin.emit(event);
        for (let i = 0; i < 200 && exits.length === 0; i++) {
          await new Promise((r) => setImmediate(r));
        }
        assert.deepStrictEqual(exits, [0]);
      },
    );
  }
});

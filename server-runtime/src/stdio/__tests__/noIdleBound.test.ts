/**
 * stdio has no idle bound (20.1.1): the stdio server's life and its state are
 * governed by the client that started it. Held state ends by an explicit
 * tool, the client closing stdin, the backend's answer or the process's
 * shutdown — never on the server's clock. So a stdio instance that holds
 * state and gets no call arms no timer, however long it waits, and the end
 * of stdin ends the process.
 */

import { EventEmitter } from 'node:events';
import { browserCallbackStrategy } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { NO_IDLE_BOUND, type StatePart } from '@mcp-abap-adt/lib/state';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

const MINUTE = 60_000;

/** A part the test drives: it holds once told to, and counts its disposals. */
const heldPart = () => {
  let held = false;
  let tell: () => void = () => {};
  const dispose = jest.fn(async () => {
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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('the stdio server states no bound', () => {
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
    );
    expect(server.state.idleMinutes).toBe(NO_IDLE_BOUND);
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

    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(24 * 60 * MINUTE);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(jest.getTimerCount()).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
    expect(server.state.holdsState()).toBe(true);
    expect(server.state.handle).toBe(handle);
    expect(() => server.state.check(handle)).not.toThrow();
    expect(lines).toEqual([]);
  });
});

describe('stdio: the end of stdin ends the process', () => {
  beforeEach(() => resetProcessLatchForTests());
  afterEach(() => {
    jest.restoreAllMocks();
    resetProcessLatchForTests();
  });

  it.each(['end', 'close'])(
    "the launcher's server exits 0 when the client closes stdin (%s)",
    async (event) => {
      jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
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
      expect(exits).toEqual([]);

      processLike.stdin.emit(event);
      for (let i = 0; i < 200 && exits.length === 0; i++) {
        await new Promise((r) => setImmediate(r));
      }
      expect(exits).toEqual([0]);
    },
  );
});

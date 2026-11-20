/**
 * The state's lifecycle lines (the idle bound's end of a state, a failed
 * cleanup, a failing observer) are always on and go to stderr — never to the
 * transport logger, which the launcher silences unless DEBUG_AUTH_LOG.
 */

import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { stateLoggerForTransport } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

const destinations = {} as IDestinations;
const registry = () => new CompositeHandlersRegistry([]);

/** Makes the state report: an observer that throws on the next change. */
const provokeObserverFailure = (state: {
  onChange(l: () => void): () => void;
  attach(p: unknown): void;
}) => {
  state.onChange(() => {
    throw new Error('observer broke');
  });
  state.attach({
    holdsState: () => false,
    pending: () => false,
    failures: () => [],
    dispose: async () => {},
    observe: () => {},
  });
};

describe('the state logger', () => {
  const saved = process.env.DEBUG_AUTH_LOG;
  let written: string[];
  let spy: Mock<typeof process.stderr.write>;
  beforeEach(() => {
    delete process.env.DEBUG_AUTH_LOG;
    written = [];
    spy = mock.method(process.stderr, 'write', (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    spy.mock.restore();
    if (saved === undefined) delete process.env.DEBUG_AUTH_LOG;
    else process.env.DEBUG_AUTH_LOG = saved;
  });

  it("the launcher's state logger is not silent: info and error reach stderr, never stdout", (t) => {
    const out = t.mock.method(process.stdout, 'write');
    try {
      stateLoggerForTransport.info?.('held state ended');
      stateLoggerForTransport.error('cleanup failed');
      assert.ok(written.join('').includes('held state ended'));
      assert.ok(written.join('').includes('cleanup failed'));
      assert.equal(out.mock.callCount(), 0);
    } finally {
      out.mock.restore();
    }
  });

  it('a stdio server with a silent transport logger still reports its state on stderr', () => {
    const server = new StdioServer(registry(), destinations);
    provokeObserverFailure(server.state as never);
    assert.ok(written.join('').includes('observer broke'));
  });

  it('a stdio server reports its state to the state logger it is given', () => {
    const lines: string[] = [];
    const server = new StdioServer(registry(), destinations, {
      stateLogger: { info: () => {}, error: (m) => lines.push(m) },
    });
    provokeObserverFailure(server.state as never);
    assert.ok(lines.join('').includes('observer broke'));
  });

  it('a stdio server given only a logger reports its state to that logger, not to a defaulted silent one', () => {
    const lines: string[] = [];
    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: (m: string) => lines.push(m),
    };
    const server = new StdioServer(registry(), destinations, { logger });
    provokeObserverFailure(server.state as never);
    assert.ok(lines.join('').includes('observer broke'));
  });
});

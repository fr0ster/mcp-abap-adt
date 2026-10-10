/**
 * The state's lifecycle lines (the idle bound's end of a state, a failed
 * cleanup, a failing observer) are always on and go to stderr — never to the
 * transport logger, which the launcher silences unless DEBUG_AUTH_LOG.
 */
import type { IDestinations } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { stateLoggerForTransport } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

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
  let spy: jest.SpyInstance;
  beforeEach(() => {
    delete process.env.DEBUG_AUTH_LOG;
    written = [];
    spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
  });
  afterEach(() => {
    spy.mockRestore();
    if (saved === undefined) delete process.env.DEBUG_AUTH_LOG;
    else process.env.DEBUG_AUTH_LOG = saved;
  });

  it("the launcher's state logger is not silent: info and error reach stderr, never stdout", () => {
    const out = jest.spyOn(process.stdout, 'write');
    try {
      stateLoggerForTransport.info?.('held state ended');
      stateLoggerForTransport.error('cleanup failed');
      expect(written.join('')).toContain('held state ended');
      expect(written.join('')).toContain('cleanup failed');
      expect(out).not.toHaveBeenCalled();
    } finally {
      out.mockRestore();
    }
  });

  it('a stdio server with a silent transport logger still reports its state on stderr', () => {
    const server = new StdioServer(registry(), destinations);
    provokeObserverFailure(server.state as never);
    expect(written.join('')).toContain('observer broke');
  });

  it('a stdio server reports its state to the state logger it is given', () => {
    const lines: string[] = [];
    const server = new StdioServer(registry(), destinations, {
      stateLogger: { info: () => {}, error: (m) => lines.push(m) },
    });
    provokeObserverFailure(server.state as never);
    expect(lines.join('')).toContain('observer broke');
  });

  it("the HTTP pool's instances report to the server's state logger", () => {
    const lines: string[] = [];
    const server = new StreamableHttpServer(registry(), destinations, {
      stateLogger: { info: () => {}, error: (m) => lines.push(m) },
    });
    const instance = (
      server as unknown as {
        createPerRequestServer(): { state: unknown };
      }
    ).createPerRequestServer();
    provokeObserverFailure(instance.state as never);
    expect(lines.join('')).toContain('observer broke');
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
    expect(lines.join('')).toContain('observer broke');
  });

  it('an HTTP server without any logger: its pool instances report on stderr', () => {
    const server = new StreamableHttpServer(registry(), destinations, {});
    const instance = (
      server as unknown as {
        createPerRequestServer(): { state: unknown };
      }
    ).createPerRequestServer();
    provokeObserverFailure(instance.state as never);
    expect(written.join('')).toContain('observer broke');
  });
});

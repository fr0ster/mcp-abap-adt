/**
 * The pool's instances report the state's lifecycle lines (a failed cleanup,
 * a failing observer) to the server's state logger — stderr when none is
 * given, never a silent transport logger.
 */
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

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

describe('the state logger of the pool', () => {
  let written: string[];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    written = [];
    spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
  });
  afterEach(() => spy.mockRestore());

  it("the HTTP pool's instances report to the server's state logger", () => {
    const lines: string[] = [];
    const server = new StreamableHttpServer(registry(), {
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

  it('an HTTP server without any logger: its pool instances report on stderr', () => {
    const server = new StreamableHttpServer(registry(), {});
    const instance = (
      server as unknown as {
        createPerRequestServer(): { state: unknown };
      }
    ).createPerRequestServer();
    provokeObserverFailure(instance.state as never);
    expect(written.join('')).toContain('observer broke');
  });
});

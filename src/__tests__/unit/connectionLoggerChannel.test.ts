import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LogLevel } from '@mcp-abap-adt/interfaces-utils';
import { DefaultLogger } from '@mcp-abap-adt/logger';

/**
 * The shape a logger must still have after a channel is added to it.
 *
 * `sessionHelpers` built the connection's logger by spreading the one
 * `createConnectionLogger()` answers and adding a `csrfToken` channel. That
 * logger is a class instance: a spread copies its own enumerable fields —
 * `logLevel` — and leaves `debug`, `info`, `warn` and `error` on the
 * prototype. The result looked like a logger, had no methods, and killed the
 * connection with `this.logger?.debug is not a function` the moment
 * `DEBUG_CONNECTION` was set. Reported in #222, found while testing #220
 * on-premise; the one switch meant for diagnosing a connection could not be
 * turned on.
 *
 * This pins the property rather than the call site: whatever a helper does to
 * a logger, what comes back has to still be one.
 */
describe('adding a channel to a logger keeps the logger', () => {
  const channels = ['debug', 'info', 'warn', 'error'] as const;

  it('loses every method when spread — which is what went wrong', () => {
    const logger = new DefaultLogger(LogLevel.DEBUG) as unknown as Record<
      string,
      unknown
    >;
    const spread: Record<string, unknown> = {
      ...logger,
      csrfToken: logger.debug,
    };

    assert.deepStrictEqual(
      channels.filter((name) => typeof spread[name] === 'function'),
      [],
    );
  });

  it('keeps every method when the channel is assigned to it', () => {
    const logger = new DefaultLogger(LogLevel.DEBUG) as unknown as Record<
      string,
      unknown
    > & { debug: (message: string) => void };
    const assigned = Object.assign(logger, {
      csrfToken: logger.debug.bind(logger),
    }) as unknown as Record<string, unknown>;

    assert.deepStrictEqual(
      channels.filter((name) => typeof assigned[name] === 'function'),
      [...channels],
    );
    assert.equal(typeof assigned.csrfToken, 'function');
  });

  it('gives the channel a receiver, so a bare reference still works', () => {
    const said: string[] = [];
    class Spy extends DefaultLogger {
      override debug(message: string): void {
        said.push(message);
      }
    }
    const logger = new Spy(LogLevel.DEBUG);
    const withChannel = Object.assign(logger, {
      csrfToken: logger.debug.bind(logger),
    });

    // Handed on as a bare function, the way a connection holds it.
    const channel = withChannel.csrfToken;
    channel('token refreshed');

    assert.deepStrictEqual(said, ['token refreshed']);
  });
});

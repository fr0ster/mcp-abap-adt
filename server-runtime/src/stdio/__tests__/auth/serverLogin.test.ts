/**
 * `serverLogin`: the request goes on with its signal and the
 * prompt logger, `dispose()` is forwarded, the wrapper is recorded for the
 * factory's disposal at shutdown — and, on a real loopback strategy, the
 * login settles only after its listener is closed, so the callback port is
 * free the moment a login ends.
 */

import assert from 'node:assert/strict';
import * as net from 'node:net';
import { describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { readFailure } from '@mcp-abap-adt/auth-errors';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  assertMatchObject,
  rejectionOf,
} from '../../../../../src/__tests__/helpers/assertions';
import { promptLogger, serverLogin } from '../../auth/serverLogin';

const silent: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function recordingInner() {
  const requests: AuthorizationRequest[] = [];
  const dispose = mock.fn(async () => {});
  const inner: IAuthorizationStrategy<string> = {
    authorize: async (request) => {
      requests.push(request);
      await request.buildAuthorizationUrl('http://localhost:1/callback');
      return { payload: 'code-1', redirectUri: 'http://localhost:1/callback' };
    },
    dispose,
  };
  return { inner, requests, dispose };
}

describe('serverLogin', () => {
  it('passes the request on with its signal and the prompt logger in place of its own', async () => {
    const { inner, requests } = recordingInner();
    const prompts = { ...silent };
    const login = serverLogin(inner, { logger: prompts, record: () => {} });
    const controller = new AbortController();
    const built: string[] = [];
    const outcome = await login.authorize({
      buildAuthorizationUrl: async (uri) => {
        built.push(uri);
        return 'https://idp.example.test/authorize';
      },
      signal: controller.signal,
      logger: silent,
    });
    assert.deepStrictEqual(outcome, {
      payload: 'code-1',
      redirectUri: 'http://localhost:1/callback',
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].signal, controller.signal);
    assert.equal(requests[0].logger, prompts);
    assert.deepStrictEqual(built, ['http://localhost:1/callback']);
  });

  it('forwards dispose()', async () => {
    const { inner, dispose } = recordingInner();
    const login = serverLogin(inner, { logger: silent, record: () => {} });
    await login.dispose?.();
    assert.equal(dispose.mock.callCount(), 1);
  });

  it('is recorded for disposal, once, as the wrapper', () => {
    const { inner } = recordingInner();
    const record = mock.fn();
    const login = serverLogin(inner, { logger: silent, record });
    assert.equal(record.mock.callCount(), 1);
    assert.ok(
      record.mock.calls.some((c) => isDeepStrictEqual(c.arguments, [login])),
    );
  });

  it('the prompt logger writes info to stderr and leaves the rest to the diagnostics', () => {
    const lines: string[] = [];
    const diagnostics = {
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
      debug: mock.fn(),
    };
    const logger = promptLogger((line) => lines.push(line), diagnostics);
    logger.info('open the URL');
    logger.warn('w');
    logger.error('e');
    logger.debug('d');
    assert.deepStrictEqual(lines, ['open the URL']);
    assert.equal(diagnostics.info.mock.callCount(), 0);
    assert.ok(
      diagnostics.warn.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['w', undefined]),
      ),
    );
    assert.ok(
      diagnostics.error.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['e', undefined]),
      ),
    );
    assert.ok(
      diagnostics.debug.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['d', undefined]),
      ),
    );
  });
});

/** Binds `port` on 127.0.0.1 and closes it: resolves only when the port is free. */
function bindsFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
  });
}

describe('serverLogin over a real loopback strategy on port 0', () => {
  const STATE = 'state-of-this-attempt';

  /**
   * The composed strategy, with its settlement recorded: auth-providers'
   * composition settles only once its listener's sockets are closed, so
   * "settled after the inner" is "settled after the listener closed".
   */
  function probed(strategy: IAuthorizationStrategy<string>, order: string[]) {
    const probe: IAuthorizationStrategy<string> = {
      authorize: (request) =>
        strategy
          .authorize(request)
          .finally(() => order.push('listener closed')),
      dispose: () => strategy.dispose?.() ?? Promise.resolve(),
    };
    return probe;
  }

  /** The URL the provider would build, and the port the listener bound. */
  function request(signal: AbortSignal) {
    const seen: { port?: number; redirect?: string } = {};
    const req: AuthorizationRequest = {
      buildAuthorizationUrl: async (redirectUri) => {
        seen.redirect = redirectUri;
        seen.port = Number(new URL(redirectUri).port);
        return `https://idp.example.test/authorize?state=${STATE}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      },
      signal,
    };
    return { req, seen };
  }

  it('a login answered by the browser settles with the port already free', async () => {
    const browser: IBrowser = {
      open: async (url) => {
        const redirect = new URL(url).searchParams.get('redirect_uri') ?? '';
        void fetch(`${redirect}?code=the-code&state=${STATE}`).catch(
          () => undefined,
        );
      },
    };
    const order: string[] = [];
    const login = serverLogin(
      probed(browserCallbackStrategy({ browser, port: 0 }), order),
      { logger: silent, record: () => {} },
    );
    const { req, seen } = request(new AbortController().signal);
    const outcome = await login.authorize(req);
    order.push('login settled');
    assert.equal(outcome.payload, 'the-code');
    assert.deepStrictEqual(order, ['listener closed', 'login settled']);
    assert.ok(seen.port !== undefined && seen.port > 0);
    await bindsFree(seen.port as number);
  });

  it('a login cancelled through its signal settles only after the listener closed', async () => {
    const controller = new AbortController();
    let opened!: () => void;
    const open = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const browser: IBrowser = {
      open: async () => {
        opened();
      },
    };
    const order: string[] = [];
    const login = serverLogin(
      probed(browserCallbackStrategy({ browser, port: 0 }), order),
      { logger: silent, record: () => {} },
    );
    const { req, seen } = request(controller.signal);
    const ended = login.authorize(req);
    const rejected = rejectionOf(
      ended.finally(() => order.push('login settled')),
    ).then((reason) => assert.notEqual(reason, undefined));
    // How it ended, read as auth-errors reads a thrown value: the composed
    // strategy's own abort — the signal reached it through the wrapper.
    const failure = ended.then(
      () => undefined,
      (error: unknown) => readFailure(error, 'token-request'),
    );
    await open;
    controller.abort();
    await rejected;
    assert.deepStrictEqual(order, ['listener closed', 'login settled']);
    const read = await failure;
    assert.equal(read?.kind, 'interactive-login');
    assertMatchObject(read?.facts, { outcome: 'aborted' });
    await bindsFree(seen.port as number);
  });
});

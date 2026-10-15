/**
 * `serverLogin`: the request goes on with its signal and the
 * prompt logger, `dispose()` is forwarded, the wrapper is recorded for the
 * factory's disposal at shutdown — and, on a real loopback strategy, the
 * login settles only after its listener is closed, so the callback port is
 * free the moment a login ends.
 */

import * as net from 'node:net';
import { readFailure } from '@mcp-abap-adt/auth-errors';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { promptLogger, serverLogin } from '../../auth/serverLogin';

const silent: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function recordingInner() {
  const requests: AuthorizationRequest[] = [];
  const dispose = jest.fn(async () => {});
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
    expect(outcome).toEqual({
      payload: 'code-1',
      redirectUri: 'http://localhost:1/callback',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].signal).toBe(controller.signal);
    expect(requests[0].logger).toBe(prompts);
    expect(built).toEqual(['http://localhost:1/callback']);
  });

  it('forwards dispose()', async () => {
    const { inner, dispose } = recordingInner();
    const login = serverLogin(inner, { logger: silent, record: () => {} });
    await login.dispose?.();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('is recorded for disposal, once, as the wrapper', () => {
    const { inner } = recordingInner();
    const record = jest.fn();
    const login = serverLogin(inner, { logger: silent, record });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(login);
  });

  it('the prompt logger writes info to stderr and leaves the rest to the diagnostics', () => {
    const lines: string[] = [];
    const diagnostics = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const logger = promptLogger((line) => lines.push(line), diagnostics);
    logger.info('open the URL');
    logger.warn('w');
    logger.error('e');
    logger.debug('d');
    expect(lines).toEqual(['open the URL']);
    expect(diagnostics.info).not.toHaveBeenCalled();
    expect(diagnostics.warn).toHaveBeenCalledWith('w', undefined);
    expect(diagnostics.error).toHaveBeenCalledWith('e', undefined);
    expect(diagnostics.debug).toHaveBeenCalledWith('d', undefined);
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
    expect(outcome.payload).toBe('the-code');
    expect(order).toEqual(['listener closed', 'login settled']);
    expect(seen.port).toBeGreaterThan(0);
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
    const rejected = expect(
      ended.finally(() => order.push('login settled')),
    ).rejects.toBeDefined();
    // How it ended, read as auth-errors reads a thrown value: the composed
    // strategy's own abort — the signal reached it through the wrapper.
    const failure = ended.then(
      () => undefined,
      (error: unknown) => readFailure(error, 'token-request'),
    );
    await open;
    controller.abort();
    await rejected;
    expect(order).toEqual(['listener closed', 'login settled']);
    const read = await failure;
    expect(read?.kind).toBe('interactive-login');
    expect(read?.facts).toMatchObject({ outcome: 'aborted' });
    await bindsFree(seen.port as number);
  });
});

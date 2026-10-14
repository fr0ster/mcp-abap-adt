/**
 * The login bound (D10, spec §5.6, §14.4.10): `--login-timeout=1` ends a
 * login with the chain's words and the server's sentence, and is not
 * retried; without it the login waits until the session ends it (a tool
 * call cannot be cancelled). A bounded login that completes leaves no timer
 * pending, and a later login is unaffected by an earlier bound.
 */

import {
  AuthProviderFailure,
  authError,
  readFailure,
} from '@mcp-abap-adt/auth-errors';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import {
  loginBound,
  type ServerLoginContext,
  serverLogin,
} from '../../auth/serverLogin';
import {
  loginTimeoutSentence,
  serverEndedLogin,
  serverSentence,
} from '../../auth/serverSentences';
import { statedLoginTimeout } from '../../config/coreParameters';
import { silentLogger } from '../helpers/factoryFixture';
import {
  bindsFree,
  deferred,
  type Stand,
  stand,
  until,
} from '../helpers/loginStand';

jest.setTimeout(30_000);

describe('through the server', () => {
  let s: Stand | undefined;

  afterEach(async () => {
    await s?.close();
    s = undefined;
  });

  it('--login-timeout=1 ends the login with the chain words and the server sentence', async () => {
    s = await stand({
      auth: 'jwt',
      loginTimeoutMs: 1_000,
      loginTimeoutStated: statedLoginTimeout(1, '--login-timeout'),
    });
    s.browser.answering(false);
    const started = Date.now();
    const answer = await s.call('r1').done;
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(answer).not.toBe('cancelled');
    const { text, isError } = answer as { text: string; isError: boolean };
    expect(isError).toBe(true);
    const payload = JSON.parse(text) as Record<string, string>;
    expect(payload).toMatchObject({
      error: 'authentication_failed',
      kind: 'interactive-login',
      server:
        "The login was ended by the server's login timeout (`--login-timeout=1`).",
    });
    expect(payload.message).toEqual(expect.any(String));
    expect(payload.message).not.toContain('login-timeout');
    // One login, ended by the bound — not retried as another caller's abort.
    expect(s.logins).toEqual(['aborted']);
    expect(s.browser.ports).toHaveLength(1);
    await bindsFree(s.browser.ports[0]);
    expect(s.reached('r1')).toBe(false);
  });

  it('a login started between the bound firing and the answer neither drops the sentence nor allows a retry', async () => {
    const refused = deferred();
    const answer = deferred();
    s = await stand({
      auth: 'jwt',
      loginTimeoutMs: 500,
      loginTimeoutStated: statedLoginTimeout(1, '--login-timeout'),
      holdRefusedPrepare: async () => {
        refused.resolve();
        await answer.promise;
      },
    });
    s.browser.answering(false);
    const r1 = s.call('r1');
    // The bound ended R1's login; its connect has not failed yet.
    await refused.promise;
    expect(s.logins).toEqual(['aborted']);

    // Another login starts — and completes — before R1's answer is read.
    s.browser.answering(true);
    const party = new AbortController();
    try {
      const provider = await s.factory.getProvider('default', {
        signal: party.signal,
      });
      await expect(provider.prepare()).resolves.toEqual({ ok: true });
      expect(s.logins).toEqual(['aborted', 'ok']);

      answer.resolve();
      const outcome = await r1.done;
      expect(outcome).not.toBe('cancelled');
      const { text, isError } = outcome as { text: string; isError: boolean };
      // R1 is answered the bound's failure, with its sentence — not retried
      // into the other login's token.
      expect(isError).toBe(true);
      expect(JSON.parse(text)).toMatchObject({
        error: 'authentication_failed',
        kind: 'interactive-login',
        server:
          "The login was ended by the server's login timeout (`--login-timeout=1`).",
      });
      expect(s.reached('r1')).toBe(false);
      expect(s.logins).toEqual(['aborted', 'ok']);
    } finally {
      party.abort();
    }
  });

  it('without --login-timeout the login waits — a cancel aborts nothing — until the session ends it', async () => {
    s = await stand({ auth: 'jwt' });
    s.browser.answering(false);
    const r1 = s.call('r1');
    await s.browser.opened(1);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(s.logins).toEqual([]);
    expect(s.active()).toBe(1);
    r1.cancel();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(s.logins).toEqual([]);
    expect(s.active()).toBe(1);
    // The session's end: the client's transport closes.
    await s.client.close();
    await until(() => s?.logins.length === 1);
    expect(s.logins).toEqual(['aborted']);
    expect(await r1.done).toBe('cancelled');
  });
});

describe('serverLogin with a bound', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function context(ms: number): ServerLoginContext {
    return { logger: silentLogger, record: () => {}, bound: loginBound(ms) };
  }

  /** A strategy that answers after `delayMs`, or fails `aborted` when its signal aborts. */
  function answersAfter(delayMs: number): IAuthorizationStrategy<string> {
    return {
      authorize: (request: AuthorizationRequest) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve({ payload: 'code', redirectUri: 'http://x/cb' }),
            delayMs,
          );
          request.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(
              new AuthProviderFailure(
                authError['interactive-login']({ outcome: 'aborted' }),
              ),
            );
          });
        }),
    };
  }

  const request = (): AuthorizationRequest => ({
    buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
    signal: new AbortController().signal,
  });

  /** The timers armed with `ms`, the bound's own, from the spy. */
  const armedWith = (spy: jest.SpyInstance, ms: number) =>
    spy.mock.calls
      .map((call, index) => ({ call, handle: spy.mock.results[index]?.value }))
      .filter(({ call }) => call[1] === ms)
      .map(({ handle }) => handle as unknown);

  /** The failure a login rejected with, as the server reads it. */
  async function failureOf(login: Promise<unknown>) {
    try {
      await login;
    } catch (thrown) {
      return readFailure(thrown, 'token-request');
    }
    throw new Error('the login did not fail');
  }

  it('a login that completes clears its bound; a later login is unaffected', async () => {
    const armed = jest.spyOn(globalThis, 'setTimeout');
    const cleared = jest.spyOn(globalThis, 'clearTimeout');
    const ctx = context(1_000);
    const login = serverLogin(answersAfter(0), ctx);
    await expect(login.authorize(request())).resolves.toMatchObject({
      payload: 'code',
    });
    // The bound's own timer: armed once, cleared when the login settled.
    const first = armedWith(armed, 1_000);
    expect(first).toHaveLength(1);
    expect(cleared).toHaveBeenCalledWith(first[0]);

    // Past the first login's bound: nothing of it ends a later login.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const later = serverLogin(answersAfter(300), ctx);
    await expect(later.authorize(request())).resolves.toMatchObject({
      payload: 'code',
    });
    const both = armedWith(armed, 1_000);
    expect(both).toHaveLength(2);
    expect(cleared).toHaveBeenCalledWith(both[1]);
  });

  it('the bound marks the failure of the login it ended — a later login takes nothing away', async () => {
    const ctx = context(100);
    const bound = ctx.bound as NonNullable<ServerLoginContext['bound']>;
    const ended = await failureOf(
      serverLogin(answersAfter(10_000), ctx).authorize(request()),
    );
    expect(bound.ended(ended)).toBe(true);
    const state = {
      renewal: 'refresh-then-login' as const,
      shuttingDown: false,
      loginBound: bound,
    };
    // Another login starts (and completes) before the failure is read.
    await serverLogin(answersAfter(0), ctx).authorize(request());
    expect(serverSentence(ended, state)).toBe(
      loginTimeoutSentence('`loginTimeoutMs: 100`'),
    );
    expect(serverEndedLogin(ended, state)).toBe(true);
    // Another aborted login, not the bound's, is not marked.
    const other = authError['interactive-login']({ outcome: 'aborted' });
    expect(bound.ended(other)).toBe(false);
    expect(serverSentence(other, state)).toBeUndefined();
    expect(serverEndedLogin(other, state)).toBe(false);
  });

  it("the request's own signal still ends a bounded login, and the bound marks nothing", async () => {
    const ctx = context(10_000);
    const bound = ctx.bound as NonNullable<ServerLoginContext['bound']>;
    const controller = new AbortController();
    const ended = serverLogin(answersAfter(10_000), ctx).authorize({
      buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
      signal: controller.signal,
    });
    controller.abort();
    expect(bound.ended(await failureOf(ended))).toBe(false);
  });
});

describe('the sentence names the bound as it was set (D10)', () => {
  it.each([
    [
      '--login-timeout',
      "The login was ended by the server's login timeout (`--login-timeout=300`).",
    ],
    [
      'MCP_LOGIN_TIMEOUT',
      "The login was ended by the server's login timeout (`MCP_LOGIN_TIMEOUT=300`).",
    ],
    [
      'login-timeout (config file)',
      "The login was ended by the server's login timeout (`login-timeout: 300` in the configuration file).",
    ],
  ])('from %s', (source, words) => {
    expect(loginTimeoutSentence(statedLoginTimeout(300, source))).toBe(words);
  });

  it("an embedder's bound is named as its option, never as a CLI value the CLI refuses", () => {
    const sentence = loginTimeoutSentence(loginBound(1_500).stated);
    expect(sentence).toBe(
      "The login was ended by the server's login timeout (`loginTimeoutMs: 1500`).",
    );
    expect(sentence).not.toContain('--login-timeout');
  });
});

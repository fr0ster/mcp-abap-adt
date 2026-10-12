/**
 * The login bound (D10, spec §5.6, §14.4.10): `--login-timeout=1` ends a
 * login with the chain's words and the server's sentence, and is not retried
 * as another caller's abort would be (D7); without it the login waits until
 * the request ends it. A bounded login that completes leaves no timer
 * pending, and a later login is unaffected by an earlier bound.
 */

import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import {
  loginBound,
  type ServerLoginContext,
  serverLogin,
} from '../../auth/serverLogin';
import { loginTimeoutSentence } from '../../auth/serverSentences';
import { silentLogger } from '../helpers/factoryFixture';
import { bindsFree, type Stand, stand, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

describe('through the server', () => {
  let s: Stand | undefined;

  afterEach(async () => {
    await s?.close();
    s = undefined;
  });

  it('--login-timeout=1 ends the login with the chain words and the server sentence', async () => {
    s = await stand({ auth: 'jwt', loginTimeoutMs: 1_000 });
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
      server: loginTimeoutSentence(1),
    });
    expect(payload.message).toEqual(expect.any(String));
    expect(payload.message).not.toContain('login-timeout');
    expect(loginTimeoutSentence(1)).toBe(
      "The login was ended by the server's login timeout (`--login-timeout=1`)",
    );
    // One login, ended by the bound — not retried as another caller's abort.
    expect(s.logins).toEqual(['aborted']);
    expect(s.browser.ports).toHaveLength(1);
    await bindsFree(s.browser.ports[0]);
    expect(s.reached('r1')).toBe(false);
  });

  it('without --login-timeout the login waits until the request ends it', async () => {
    s = await stand({ auth: 'jwt' });
    s.browser.answering(false);
    const r1 = s.call('r1');
    await s.browser.opened(1);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(s.logins).toEqual([]);
    expect(s.active()).toBe(1);
    r1.cancel();
    await until(() => s?.logins.length === 1);
    expect(s.logins).toEqual(['aborted']);
  });
});

describe('serverLogin with a bound', () => {
  const pendingTimers = () =>
    process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

  function context(ms: number): ServerLoginContext {
    return { logger: silentLogger, record: () => {}, bound: loginBound(ms) };
  }

  /** A strategy that answers after `delayMs`, or when its signal aborts. */
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
            reject(new Error('aborted'));
          });
        }),
    };
  }

  const request = (): AuthorizationRequest => ({
    buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
    signal: new AbortController().signal,
  });

  it('a login that completes leaves no timer pending; a later login is unaffected', async () => {
    const ctx = context(1_000);
    const before = pendingTimers();
    const login = serverLogin(answersAfter(0), ctx);
    const first = login.authorize(request());
    // The bound runs while the login does.
    expect(pendingTimers()).toBeGreaterThan(before);
    await expect(first).resolves.toMatchObject({ payload: 'code' });
    expect(pendingTimers()).toBe(before);
    expect(ctx.bound?.fired).toBe(false);

    // Past the first login's bound: nothing of it ends a later login.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const later = serverLogin(answersAfter(300), ctx);
    await expect(later.authorize(request())).resolves.toMatchObject({
      payload: 'code',
    });
    expect(ctx.bound?.fired).toBe(false);
    expect(pendingTimers()).toBe(before);
  });

  it('a login the bound ends is marked fired; the next login starts unmarked', async () => {
    const ctx = context(100);
    const login = serverLogin(answersAfter(10_000), ctx);
    await expect(login.authorize(request())).rejects.toBeDefined();
    expect(ctx.bound?.fired).toBe(true);
    const next = serverLogin(answersAfter(0), ctx);
    await next.authorize(request());
    expect(ctx.bound?.fired).toBe(false);
  });

  it("the request's own signal still ends a bounded login, and the bound is not marked", async () => {
    const ctx = context(10_000);
    const controller = new AbortController();
    const login = serverLogin(answersAfter(10_000), ctx);
    const ended = login.authorize({
      buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
      signal: controller.signal,
    });
    controller.abort();
    await expect(ended).rejects.toBeDefined();
    expect(ctx.bound?.fired).toBe(false);
  });
});

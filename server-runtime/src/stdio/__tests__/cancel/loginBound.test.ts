/**
 * The login bound: `--login-timeout=1` ends a
 * login with the chain's words and the server's sentence, and is not
 * retried; without it the login waits until the session ends it (a tool
 * call cannot be cancelled). A bounded login that completes leaves no timer
 * pending, and a later login is unaffected by an earlier bound.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
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
  assertEquals,
  assertMatches,
} from '../../../../../src/__tests__/integration/helpers/liveAssert';
import {
  loginBound,
  type ServerLoginContext,
  serverLogin,
} from '../../auth/serverLogin';
import {
  loginTimeoutSentence,
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

describe('through the server', () => {
  let s: Stand | undefined;

  afterEach(async () => {
    await s?.close();
    s = undefined;
  });

  it('--login-timeout=1 ends the login with the chain words and the server sentence', async () => {
    s = await stand({
      kind: 'cloud',
      auth: 'jwt',
      loginTimeoutMs: 1_000,
      loginTimeoutStated: statedLoginTimeout(1, '--login-timeout'),
    });
    s.browser.answering(false);
    const started = Date.now();
    const answer = await s.call('r1').done;
    assert.ok(Date.now() - started >= 900);
    assert.notEqual(answer, 'cancelled');
    const { text, isError } = answer as { text: string; isError: boolean };
    assert.equal(isError, true);
    const payload = JSON.parse(text) as Record<string, string>;
    assertMatches(payload, {
      error: 'authentication_failed',
      kind: 'interactive-login',
      server:
        "The login was ended by the server's login timeout (`--login-timeout=1`).",
    });
    assert.equal(typeof payload.message, 'string');
    assert.equal(payload.message?.includes('login-timeout'), false);
    // One login, ended by the bound — not retried as another caller's abort.
    assertEquals(s.logins, ['aborted']);
    assert.equal(s.browser.ports.length, 1);
    await bindsFree(s.browser.ports[0]);
    assert.equal(s.reached('r1'), false);
  });

  it('a login started between the bound firing and the answer neither drops the sentence nor allows a retry', async () => {
    const refused = deferred();
    const answer = deferred();
    s = await stand({
      kind: 'cloud',
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
    assertEquals(s.logins, ['aborted']);

    // Another login starts — and completes — before R1's answer is read.
    s.browser.answering(true);
    const party = new AbortController();
    try {
      const provider = await s.factory.getProvider('default', {
        signal: party.signal,
      });
      assertEquals(await provider.prepare(), { ok: true });
      assertEquals(s.logins, ['aborted', 'ok']);

      answer.resolve();
      const outcome = await r1.done;
      assert.notEqual(outcome, 'cancelled');
      const { text, isError } = outcome as { text: string; isError: boolean };
      // R1 is answered the bound's failure, with its sentence — not retried
      // into the other login's token.
      assert.equal(isError, true);
      assertMatches(JSON.parse(text), {
        error: 'authentication_failed',
        kind: 'interactive-login',
        server:
          "The login was ended by the server's login timeout (`--login-timeout=1`).",
      });
      assert.equal(s.reached('r1'), false);
      assertEquals(s.logins, ['aborted', 'ok']);
    } finally {
      party.abort();
    }
  });

  it('without --login-timeout the login waits — a cancel aborts nothing — until the session ends it', async () => {
    s = await stand({ kind: 'cloud', auth: 'jwt' });
    s.browser.answering(false);
    const r1 = s.call('r1');
    await s.browser.opened(1);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    assertEquals(s.logins, []);
    assert.equal(s.active(), 1);
    r1.cancel();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assertEquals(s.logins, []);
    assert.equal(s.active(), 1);
    // The session's end: the client's transport closes.
    await s.client.close();
    await until(() => s?.logins.length === 1);
    assertEquals(s.logins, ['aborted']);
    assert.equal(await r1.done, 'cancelled');
  });
});

describe('serverLogin with a bound', () => {
  afterEach(() => {
    mock.restoreAll();
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

  /** The timers armed with `ms`, the bound's own: what each such call answered. */
  const armedWith = (
    calls: ReadonlyArray<{ arguments: readonly unknown[]; result?: unknown }>,
    ms: number,
  ): unknown[] =>
    calls.filter((call) => call.arguments[1] === ms).map((call) => call.result);
  /** Whether `clearTimeout` was called with `handle`. */
  const clearedWith = (
    calls: ReadonlyArray<{ arguments: readonly unknown[] }>,
    handle: unknown,
  ): boolean => calls.some((call) => call.arguments[0] === handle);

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
    const armed = mock.method(globalThis, 'setTimeout');
    const cleared = mock.method(globalThis, 'clearTimeout');
    const ctx = context(1_000);
    const login = serverLogin(answersAfter(0), ctx);
    assertMatches(await login.authorize(request()), { payload: 'code' });
    // The bound's own timer: armed once, cleared when the login settled.
    const first = armedWith(armed.mock.calls, 1_000);
    assert.equal(first.length, 1);
    assert.ok(clearedWith(cleared.mock.calls, first[0]));

    // Past the first login's bound: nothing of it ends a later login.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const later = serverLogin(answersAfter(300), ctx);
    assertMatches(await later.authorize(request()), { payload: 'code' });
    const both = armedWith(armed.mock.calls, 1_000);
    assert.equal(both.length, 2);
    assert.ok(clearedWith(cleared.mock.calls, both[1]));
  });

  it('the bound marks the failure of the login it ended — a later login takes nothing away', async () => {
    const ctx = context(100);
    const bound = ctx.bound as NonNullable<ServerLoginContext['bound']>;
    const ended = await failureOf(
      serverLogin(answersAfter(10_000), ctx).authorize(request()),
    );
    assert.equal(bound.ended(ended), true);
    const state = {
      renewal: 'refresh-then-login' as const,
      shuttingDown: false,
      loginBound: bound,
    };
    // Another login starts (and completes) before the failure is read.
    await serverLogin(answersAfter(0), ctx).authorize(request());
    assert.equal(
      serverSentence(ended, state),
      loginTimeoutSentence('`loginTimeoutMs: 100`'),
    );
    // Another aborted login, not the bound's, is not marked.
    const other = authError['interactive-login']({ outcome: 'aborted' });
    assert.equal(bound.ended(other), false);
    assert.equal(serverSentence(other, state), undefined);
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
    assert.equal(bound.ended(await failureOf(ended)), false);
  });
});

describe('the sentence names the bound as it was set', () => {
  for (const [source, words] of [
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
  ] as const) {
    it(`from ${source}`, () => {
      assert.equal(
        loginTimeoutSentence(statedLoginTimeout(300, source)),
        words,
      );
    });
  }

  it("an embedder's bound is named as its option, never as a CLI value the CLI refuses", () => {
    const sentence = loginTimeoutSentence(loginBound(1_500).stated);
    assert.equal(
      sentence,
      "The login was ended by the server's login timeout (`loginTimeoutMs: 1500`).",
    );
    assert.equal(sentence.includes('--login-timeout'), false);
  });
});

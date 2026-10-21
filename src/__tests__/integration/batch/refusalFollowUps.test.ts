/**
 * Two checks after a credential refusal (plan Task 32), on the configured
 * system. DEBUGGER.md left both unmeasured: the logoff after a credential
 * refusal asks nothing of the credential provider, and the debugger stop's
 * second `stopListener` after a refusal.
 *
 * Where it runs: the system the config names, when the case
 * `batch.test_cases.refusal_follow_ups` is enabled, with a user and a
 * password (`basic`). One case per kind of destination: on premise over
 * HTTP, on premise over RFC (a config with `connection_type: rfc`, e.g.
 * through `MCP_TEST_CONFIG`) and ABAP Cloud. The case of the configured kind
 * runs; the others skip, saying why. ABAP Cloud always skips: it logs on with
 * a token, not a password. Nothing else may debug for the same SAP user while
 * it runs.
 *
 * In process, not through the served tools: both checks need seams the
 * served server has none of — a credential that counts the provider's
 * moments, and a connection whose answers the test may hold.
 *
 * **The refusal.** The connections are built with a credential that wraps
 * two providers: the configured user and password, and the same user with a
 * wrong password made up for the run, held only in memory — never written
 * to a file, never logged. The test switches to the wrong one where the
 * refusal is to come. A wrong password counts toward the user's failed
 * logons, so a run produces at most one refused logon per check (the first
 * check's; the second meets none, below), and each check ends with a logon
 * under the configured password, which resets the count.
 *
 * 1. **The logoff after a credential refusal asks no provider.** A
 *    connection logs on and reads (its session lives); the password is
 *    switched to the wrong one; a second connection on the same credential —
 *    as a debug session's own connections are built — logs on and is
 *    refused (`credential-refused`). Then both are closed the way the server
 *    closes an owned connection (`endConnection`): no moment of the
 *    credential is asked during the closes. Over HTTP the first
 *    connection's logoff is proved to have landed: a connection built on its
 *    session's cookies (`connect()` asks SAP without the credential whether
 *    the session lives) is refused. Over RFC the close ends the conversation;
 *    there is no session to take over.
 * 2. **The debugger stop's second `stopListener` after a refusal.** A debug
 *    session (`DebugStartListener`, a line breakpoint in the shared class
 *    `ZMCP_SHR_PROF_CLS`, nothing run) is stopped (`DebugStop`) while its
 *    listener's open poll is held by the test: the stop sends `stopListener`,
 *    and, the poll not having settled, a second one. Between the two the
 *    password is switched to the wrong one, and over HTTP the session of the
 *    connection they go on is logged off from outside (a connection built on
 *    its cookies). A wrong password does not bring a credential refusal to
 *    the second one on either transport (measured 2026-10-19): over HTTP a
 *    live session's cookie authenticates it, and a session that ended is
 *    answered `400` by the ICM (`ICMENOSESSION`) for the stateful request
 *    before any logon; over RFC a conversation logs on once and asks no
 *    password again. So the case measures the second `stopListener` failing
 *    for the ended session (HTTP) or answered with the password wrong (RFC),
 *    and that the stop then answers, sends nothing more, asks nothing of the
 *    credential and holds nothing. Then the held poll is released.
 *
 * Cleanup, in `finally`, whatever happened: the configured password back;
 * `DebugStop` again while the session holds anything; the instance's
 * shutdown; each connection the test built closed; a logon under the
 * configured password.
 *
 * Each measured answer is one `refusal-follow-ups-live` line on stderr; no
 * cookie, password or state handle reaches it.
 *
 * Run (HTTP): npm test -- src/__tests__/integration/batch/refusalFollowUps.test.ts --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
 * Run (RFC):  MCP_TEST_CONFIG=tests/test-config.rfc.yaml with the same command,
 *             the RFC SDK's libraries on LD_LIBRARY_PATH and SAPNWRFC_HOME set.
 */

import { randomBytes } from 'node:crypto';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import {
  newDebuggerId,
  resolveBreakpointConflict,
} from '../../../lib/debugger/ids';
import { liveAmdpPorts, liveDebugPorts } from '../../../lib/debugger/ports';
import { endConnection, isEnded } from '../../../lib/ownedConnections';
import {
  InstanceState,
  stderrStateLogger,
} from '../../../lib/state/InstanceState';
import { readSystemInformation } from '../../../lib/systemInformation';
import {
  getEnabledTestCase,
  getSapConfigFromEnv,
  getTimeout,
  loadTestConfig,
  loadTestEnv,
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { primeSystemContext } from '../helpers/primeSystemContext';
import { createHandlerContext } from '../helpers/testHelpers';

const testLogger = createTestLogger('refusal-follow-ups');

type Kind = 'onprem-http' | 'onprem-rfc' | 'cloud';

const KIND_WORDS: Record<Kind, string> = {
  'onprem-http': 'on premise over HTTP',
  'onprem-rfc': 'on premise over RFC',
  cloud: 'ABAP Cloud',
};

/** The kind of destination the config names, or why there is none. */
function configuredKind(): Kind | { reason: string } {
  let cfg: any;
  try {
    cfg = loadTestConfig();
  } catch (error) {
    return { reason: `the test config cannot be read (${String(error)})` };
  }
  const env = cfg?.environment ?? {};
  if (!env.env) {
    return {
      reason: 'the test config names no session file (environment.env)',
    };
  }
  const system = String(env.system_type ?? '').trim();
  const transport = String(env.connection_type ?? 'http')
    .trim()
    .toLowerCase();
  if (system === 'cloud') {
    return transport === 'rfc'
      ? { reason: 'the config names ABAP Cloud over RFC, which does not exist' }
      : 'cloud';
  }
  if (system === 'onprem' || system === 'legacy') {
    return transport === 'rfc' ? 'onprem-rfc' : 'onprem-http';
  }
  return { reason: 'the test config names no system_type' };
}

/** A state handle is a bearer secret: it never reaches a log line. */
const withoutHandles = (text: string): string =>
  text.replace(/("state_handle"\s*:\s*")[^"]*"/g, '$1<handle>"');

const say = (kind: Kind, what: string, answered: unknown): void => {
  const text =
    typeof answered === 'string' ? answered : JSON.stringify(answered);
  process.stderr.write(
    `refusal-follow-ups-live\t${kind}\t${what}\t${withoutHandles(String(text)).slice(0, 2000)}\n`,
  );
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Content = Array<{ type: string; text?: string }>;

/** A handler's answer: whether it is an error, its text, its JSON. */
async function local(
  handler: (ctx: HandlerContext, args: any) => any,
  ctx: HandlerContext,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string; json: any }> {
  const r: { content?: Content; isError?: boolean } = await handler(ctx, args);
  const text = (r?.content ?? []).map((c) => String(c?.text ?? '')).join('\n');
  let json: any;
  try {
    json = JSON.parse(String(r?.content?.[0]?.text ?? ''));
  } catch {
    json = undefined;
  }
  return { isError: r?.isError === true, text, json };
}

/** What a thrown value says, without anything of a request: kind, moment, words. */
function described(error: unknown): Record<string, unknown> {
  const e = error as {
    name?: unknown;
    at?: unknown;
    code?: unknown;
    message?: unknown;
    refusal?: { kind?: unknown; reason?: unknown };
    response?: { status?: unknown; data?: unknown };
    status?: unknown;
  };
  return {
    name: e?.name,
    ...(e?.refusal
      ? { kind: e.refusal.kind, at: e.at, reason: e.refusal.reason }
      : {}),
    ...(e?.code !== undefined ? { code: e.code } : {}),
    status: e?.response?.status ?? e?.status,
    // SAP's own words, the start of its body: no request of ours is in it.
    ...(e?.response?.data !== undefined
      ? { body: String(e.response.data).slice(0, 200) }
      : {}),
    ...(e?.refusal ? {} : { message: String(e?.message ?? e).slice(0, 300) }),
  };
}

const isCredentialRefusal = (error: unknown): boolean =>
  (error as { refusal?: { kind?: unknown } })?.refusal?.kind ===
  'credential-refused';

// --- the credential ---------------------------------------------------------------------

type Moment = 'prepare' | 'establish' | 'authorize' | 'rejected';

/**
 * The configured user and password, or the same user with a wrong password
 * made up for the run; every moment asked is counted. The wrong password
 * lives only in this object.
 */
class SwitchableCredential implements IAuthProvider {
  readonly kind = 'basic';
  readonly moments: Moment[] = [];
  private current: IAuthProvider;
  private readonly wrong: IAuthProvider;

  constructor(
    private readonly real: IAuthProvider,
    username: string,
  ) {
    this.current = real;
    this.wrong = new BasicAuthProvider(
      username,
      `wrong-${randomBytes(12).toString('hex')}`,
    );
  }

  useWrongPassword(): void {
    this.current = this.wrong;
  }
  useConfiguredPassword(): void {
    this.current = this.real;
  }
  /** The moments asked since `mark`. */
  since(mark: number): Moment[] {
    return this.moments.slice(mark);
  }

  prepare(): Promise<AuthOutcome> {
    this.moments.push('prepare');
    return this.current.prepare();
  }
  establish(logon: ILogonTarget): Promise<AuthOutcome> {
    this.moments.push('establish');
    return this.current.establish(logon);
  }
  authorize(request: IRequestTarget): Promise<AuthOutcome> {
    this.moments.push('authorize');
    return this.current.authorize(request);
  }
  rejected(rejection: IAuthRejection): Promise<AuthOutcome> {
    this.moments.push('rejected');
    return this.current.rejected(rejection);
  }
}

/** The configured destination's settings and credential, with a user and a password. */
async function basicTarget(
  kind: Kind,
): Promise<{ settings: SapConfig; real: IAuthProvider; username: string }> {
  await loadTestEnv();
  const settings = getSapConfigFromEnv();
  if (settings.authType !== 'basic' || !settings.username) {
    throw new Error(
      'the configured destination has no user and password (authType basic): the refusal is made with a wrong password',
    );
  }
  const rfc = settings.connectionType === 'rfc';
  if (rfc !== (kind === 'onprem-rfc')) {
    throw new Error(
      `the settings name ${rfc ? 'RFC' : 'HTTP'}, the case ${KIND_WORDS[kind]}`,
    );
  }
  return {
    settings,
    real: credentialFromSapConfig(settings),
    username: settings.username,
  };
}

type Session = { sessionCookies?: () => string | null };
type Goodbye = { flushGoodbye?: (timeoutMs?: number) => Promise<void> };

/** Closes a connection the way the server closes an owned one, and waits for its logoff. */
async function closed(connection: IAbapConnection): Promise<void> {
  await endConnection(connection, () => undefined);
  await (connection as unknown as Goodbye).flushGoodbye?.(10_000);
}

/**
 * Logs off, from outside, the HTTP session `cookies` name: a connection built
 * on them (`connect()` asks SAP, without the credential, whether it lives),
 * then its logoff. Answers how the takeover went.
 */
async function logOffFromOutside(
  settings: SapConfig,
  real: IAuthProvider,
  cookies: string,
): Promise<string> {
  const outside = createAbapConnection(
    settings,
    real,
    null,
    undefined,
    cookies,
  );
  try {
    await outside.connect();
  } catch (error) {
    return `not taken over: ${JSON.stringify(described(error))}`;
  }
  await closed(outside);
  return 'taken over and logged off';
}

/** A logon and a read under the configured password: it resets the failed-logon count. */
async function logOnOnce(
  settings: SapConfig,
  real: IAuthProvider,
): Promise<string> {
  const connection = createAbapConnection(settings, real, null);
  try {
    await connection.connect();
    await readSystemInformation(connection);
    return 'ok';
  } catch (error) {
    return JSON.stringify(described(error));
  } finally {
    await closed(connection);
  }
}

// --- 1. the logoff after a credential refusal ------------------------------------------

async function logoffAfterRefusalOn(kind: Kind): Promise<void> {
  const { settings, real, username } = await basicTarget(kind);
  const credential = new SwitchableCredential(real, username);
  const live = createAbapConnection(settings, credential, null);
  const refused = createAbapConnection(settings, credential, null);
  let failure: unknown;
  try {
    await live.connect();
    await readSystemInformation(live);
    const cookies =
      kind === 'onprem-http'
        ? ((live as unknown as Session).sessionCookies?.() ?? null)
        : null;
    say(kind, 'live session', {
      moments: credential.moments.length,
      cookies: cookies ? 'held' : 'none',
    });
    if (kind === 'onprem-http') expect(cookies).toBeTruthy();

    credential.useWrongPassword();
    const before = credential.moments.length;
    const refusal = await refused.connect().then(
      () => undefined,
      (error: unknown) => error,
    );
    say(kind, 'logon with the wrong password', {
      refusal: refusal === undefined ? 'none' : described(refusal),
      moments: credential.since(before),
    });
    expect(refusal).toBeDefined();
    expect(isCredentialRefusal(refusal)).toBe(true);

    const mark = credential.moments.length;
    await closed(live);
    await closed(refused);
    const asked = credential.since(mark);
    say(kind, 'closes after the refusal', {
      moments: asked,
      live_ended: isEnded(live),
      refused_ended: isEnded(refused),
      refused_cookies:
        kind === 'onprem-http'
          ? (refused as unknown as Session).sessionCookies?.()
            ? 'held'
            : 'none'
          : 'n/a',
    });
    expect(asked).toEqual([]);

    if (kind === 'onprem-http' && cookies) {
      const after = await logOffFromOutside(settings, real, cookies);
      say(kind, 'the live session after its logoff', after);
      expect(after).toMatch(/^not taken over/);
    } else {
      say(
        kind,
        'the live session after its logoff',
        'over RFC the close ends the conversation; no session to take over',
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    credential.useConfiguredPassword();
    await closed(live).catch(() => undefined);
    await closed(refused).catch(() => undefined);
    say(
      kind,
      'logon with the configured password',
      await logOnOnce(settings, real),
    );
  }
  if (failure !== undefined) throw failure;
}

// --- 2. the debugger stop's second stopListener after a refusal ------------------------

/** The line the case breaks at in the shared class: inside its loop. */
const STOP_TEXT = 'lv_x = sy-index mod 100.';

type Request = { label: string; method: string; path: string };

/**
 * Every request of the debug session's own connections, and the hold on its
 * listener's polls: while `holding`, the answer of a poll (`POST …/listeners`)
 * is kept from the session until `release()`. `onStop` runs on each
 * `stopListener` (`DELETE …/listeners`), around it.
 */
class Observer {
  readonly requests: Request[] = [];
  holding = false;
  private readonly held: Array<() => void> = [];
  openPolls = 0;
  private opened = 0;
  onStop?: (
    connection: IAbapConnection,
    send: () => Promise<unknown>,
  ) => Promise<unknown>;

  instrument(connection: IAbapConnection): IAbapConnection {
    const label = `c${++this.opened}`;
    const original = connection.makeAdtRequest.bind(connection);
    (connection as { makeAdtRequest: unknown }).makeAdtRequest =
      async (options: { url: string; method?: string }) => {
        const method = String(options.method ?? 'GET').toUpperCase();
        const path = String(options.url).split('?')[0];
        this.requests.push({ label, method, path });
        const listeners = path.endsWith('/debugger/listeners');
        if (listeners && method === 'DELETE' && this.onStop) {
          return this.onStop(connection, () => original(options as any));
        }
        if (listeners && method === 'POST') {
          this.openPolls++;
          try {
            return await original(options as any);
          } finally {
            if (this.holding)
              await new Promise<void>((resolve) => this.held.push(resolve));
            this.openPolls--;
          }
        }
        return original(options as any);
      };
    return connection;
  }

  release(): void {
    this.holding = false;
    for (const resolve of this.held.splice(0)) resolve();
  }
}

async function secondStopListenerOn(kind: Kind, testCase: any): Promise<void> {
  const params = testCase.params ?? {};
  const className = String(
    params.class_name ?? 'ZMCP_SHR_PROF_CLS',
  ).toUpperCase();
  const { settings, real, username } = await basicTarget(kind);
  const credential = new SwitchableCredential(real, username);
  const logger = createTestLogger('refusal-follow-ups-debugger');

  const base = createAbapConnection(settings, credential, null);
  const observer = new Observer();
  const live = liveDebugPorts();
  const state = new InstanceState({ logger: stderrStateLogger });
  const dbg = new DebuggerInstance({
    abap: new DebugSession(
      {
        ...live,
        openConnection: async (origin) =>
          observer.instrument(await live.openConnection(origin)),
      },
      { terminalId: newDebuggerId(), ideId: newDebuggerId(), stated: false },
      { breakpointConflict: resolveBreakpointConflict() },
    ),
    amdp: new AmdpSession(liveAmdpPorts()),
  });
  let attached = false;
  let handle: string | undefined;
  let failure: unknown;
  let ctx: HandlerContext | undefined;
  try {
    await base.connect();
    await primeSystemContext(base);
    const plain = createHandlerContext({ connection: base, logger });
    ctx = {
      ...plain,
      state,
      debugger: () => {
        if (!attached) {
          attached = true;
          state.attach(dbg);
        }
        return dbg;
      },
    };

    // The target's line, read from the system: the shared class as it is there.
    const read = await local(handleGetClass, plain, { class_name: className });
    if (read.isError) {
      throw new Error(
        `the shared class ${className} does not read (${read.text.slice(0, 300)}); create it with npm run shared:setup`,
      );
    }
    const source = String(read.json?.source ?? read.text);
    const index = source
      .split('\n')
      .findIndex((text) => text.trim().toLowerCase() === STOP_TEXT);
    if (index < 0) {
      throw new Error(
        `the shared class ${className} has no line "${STOP_TEXT}"`,
      );
    }

    const started = await local(handleDebugStartListener, ctx, {
      breakpoints: [
        { object_type: 'CLAS', object_name: className, line: index + 1 },
      ],
    });
    if (typeof started.json?.state_handle === 'string')
      handle = started.json.state_handle;
    say(kind, 'start', {
      isError: started.isError,
      placed: started.json?.breakpoints?.placed?.length,
      answer: started.isError ? started.text.slice(0, 600) : undefined,
    });
    expect(started.isError).toBe(false);
    expect(handle).toMatch(/^[0-9A-F]{32}$/);

    // The listener's poll is open on the system.
    for (let i = 0; i < 100 && observer.openPolls === 0; i++) await pause(100);
    expect(observer.openPolls).toBeGreaterThan(0);

    // The stop: the first stopListener answers, then the password is wrong
    // (and over HTTP that connection's session ended from outside); the
    // second meets it; then the held poll goes back to the session.
    let stops = 0;
    let second:
      | { outcome: Record<string, unknown>; refused: boolean }
      | undefined;
    let killed = 'not attempted';
    let refusedAt = -1;
    let momentsAtRefusal = -1;
    let secondMoments: Moment[] = [];
    observer.holding = true;
    observer.onStop = async (connection, send) => {
      stops++;
      if (stops === 1) {
        const answer = await send();
        credential.useWrongPassword();
        if (kind === 'onprem-http') {
          const cookies =
            (connection as unknown as Session).sessionCookies?.() ?? null;
          killed = cookies
            ? await logOffFromOutside(settings, real, cookies)
            : 'no session cookies to take over';
        } else {
          killed =
            'over RFC: the conversation cannot be taken over; only the password is wrong';
        }
        return answer;
      }
      const mark = credential.moments.length;
      try {
        const answer = (await send()) as { status?: unknown };
        second = {
          outcome: { answered: true, status: answer?.status },
          refused: false,
        };
        return answer;
      } catch (error) {
        second = {
          outcome: described(error),
          refused: isCredentialRefusal(error),
        };
        throw error;
      } finally {
        secondMoments = credential.since(mark);
        refusedAt = observer.requests.length;
        momentsAtRefusal = credential.moments.length;
        setImmediate(() => observer.release());
      }
    };

    const stopped = await local(handleDebugStop, ctx, {
      state_handle: handle,
    });
    observer.onStop = undefined;
    observer.release();
    const after = refusedAt < 0 ? [] : observer.requests.slice(refusedAt);
    const askedAfter =
      momentsAtRefusal < 0 ? [] : credential.since(momentsAtRefusal);
    say(kind, 'between the two stopListeners', killed);
    say(kind, 'stopListener sent', String(stops));
    say(kind, 'the second stopListener', {
      ...(second?.outcome ?? { sent: false }),
      moments: secondMoments,
    });
    say(kind, 'DebugStop', {
      isError: stopped.isError,
      answer: stopped.text.slice(0, 800),
    });
    say(kind, 'requests after the second stopListener', after);
    say(kind, 'moments after the second stopListener', askedAfter);
    say(kind, 'the session afterwards', {
      holds_state: dbg.holdsState(),
      failures: dbg.failures(),
    });

    expect(stops).toBe(2);
    expect(second).toBeDefined();
    if (kind === 'onprem-http') {
      // The ended session's answer, not the credential's: see the header.
      // Measured: the ICM answers `400` `ICMENOSESSION`; any other failure
      // (a credential refusal above all) is not what this case measures.
      expect(second?.outcome.answered).toBeUndefined();
      expect(second?.refused).toBe(false);
      expect(second?.outcome.status).toBe(400);
      expect(JSON.stringify(second?.outcome)).toContain('ICMENOSESSION');
    } else {
      expect(second?.outcome.answered).toBe(true);
    }
    // While the second stopListener went, the credential was asked only to
    // authorize its one attempt (measured 2026-10-19, HTTP and RFC alike: no
    // logon, no rejection); nothing was sent after it.
    expect(secondMoments).toEqual(['authorize']);
    expect(after).toEqual([]);
    expect(stopped.isError).toBe(false);
    expect(askedAfter).toEqual([]);
    expect(dbg.holdsState()).toBe(false);
  } catch (error) {
    failure = error;
  } finally {
    const problems: string[] = [];
    observer.onStop = undefined;
    observer.release();
    credential.useConfiguredPassword();
    try {
      if (ctx !== undefined && handle !== undefined && dbg.holdsState()) {
        const again = await local(handleDebugStop, ctx, {
          state_handle: handle,
        });
        say(kind, 'DebugStop in cleanup', again.text.slice(0, 800));
        if (again.isError)
          problems.push(`DebugStop in cleanup: ${again.text.slice(0, 600)}`);
      }
      const left = await state.shutdown();
      if (left.length > 0)
        problems.push(`instance shutdown left: ${left.join('; ')}`);
    } catch (error) {
      problems.push(`cleanup: ${String(error)}`);
    }
    await closed(base).catch(() => undefined);
    say(
      kind,
      'logon with the configured password',
      await logOnOnce(settings, real),
    );
    if (failure !== undefined) {
      if (problems.length > 0) {
        process.stderr.write(
          `refusal follow-ups cleanup:\n${problems.join('\n')}\n`,
        );
      }
      throw failure;
    }
    if (problems.length > 0) throw new Error(problems.join('\n'));
  }
}

// --- the cases ---------------------------------------------------------------------------

/** The case's test config entry, or why the case skips. */
function whereItRuns(kind: Kind): { testCase: any } | { reason: string } {
  if (kind === 'cloud') {
    return {
      reason:
        'ABAP Cloud logs on with a token, not a password: the refusal here is made with a wrong password',
    };
  }
  const configured = configuredKind();
  if (typeof configured !== 'string') return { reason: configured.reason };
  if (configured !== kind) {
    return {
      reason: `the test config names ${KIND_WORDS[configured]}; this case runs only there`,
    };
  }
  const testCase = getEnabledTestCase('batch', 'refusal_follow_ups');
  if (!testCase) {
    return {
      reason:
        'batch.test_cases.refusal_follow_ups is not enabled in the test config',
    };
  }
  return { testCase };
}

describe('after a credential refusal, on the system the test config names', () => {
  const kinds: Kind[] = ['onprem-http', 'onprem-rfc', 'cloud'];
  for (const kind of kinds) {
    it(
      `${KIND_WORDS[kind]}: the logoff after a credential refusal asks nothing of the provider`,
      async () => {
        const where = whereItRuns(kind);
        if ('reason' in where) {
          testLogger?.info(`⏭️  Skipping ${KIND_WORDS[kind]}: ${where.reason}`);
          return;
        }
        await logoffAfterRefusalOn(kind);
      },
      getTimeout('long'),
    );
  }
  for (const kind of kinds) {
    it(
      `${KIND_WORDS[kind]}: the debugger stop's second stopListener after a refusal`,
      async () => {
        const where = whereItRuns(kind);
        if ('reason' in where) {
          testLogger?.info(`⏭️  Skipping ${KIND_WORDS[kind]}: ${where.reason}`);
          return;
        }
        await secondStopListenerOn(kind, where.testCase);
      },
      getTimeout('long'),
    );
  }
});

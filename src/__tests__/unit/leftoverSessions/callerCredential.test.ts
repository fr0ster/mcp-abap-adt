/**
 * The leftover-session tools answer for the caller's own credential
 * (C15 round 9, I-R5a, m-R5b, m-R5c).
 *
 * - An instance whose connection was built for credential A, reached with
 *   credential B (an HTTP pooled instance taking another request's
 *   headers), never answers B as A: B does not see, resume or log off A's
 *   leftover session.
 * - A user SAP already named for this credential is answered without
 *   entering the main flow, also when the instance's connection is spent.
 * - When the connection is replaced, the user SAP named for its credential
 *   is asked again: a renewable credential may log on as another user.
 *
 * Against the stand-in, whose `systeminformation` answers the token's SAP
 * user and can switch to another (`standIn.systemInformation`).
 */

import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  adtStandIn,
  PROBE_PATH,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { callerOn } from '../backgroundRuns/harness';
import { json, type LeftoverStand, leftoverStand } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const LOSE_PATH = '/sap/bc/adt/probe-lose/';

/** The gate a `LoseAndHold` call waits on, holding the flow. */
let openGate: () => void = () => {};
let gate: Promise<void> = Promise.resolve();

/**
 * `LoseAndHold { id }`: sends one request, finds its session lost (as SAP's
 * answer would mark it), then holds the main flow until the gate opens.
 */
const loseAndHold: HandlerEntry = {
  toolDefinition: {
    name: 'LoseAndHold',
    description: 'LoseAndHold',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  handler: (async (
    context: {
      connection: {
        makeAdtRequest(o: object): Promise<unknown>;
        isConnected?: () => boolean;
      };
    },
    args: { id: string },
  ) => {
    await context.connection.makeAdtRequest({
      url: `${LOSE_PATH}${args.id}`,
      method: 'GET',
      timeout: 10_000,
    });
    context.connection.isConnected = () => false;
    await gate;
    return { content: [{ type: 'text', text: 'lost' }] };
  }) as never,
} as unknown as HandlerEntry;

/** `work` settled within `ms`, or not. */
async function settlesWithin<T>(
  work: Promise<T>,
  ms: number,
): Promise<'settled' | 'blocked'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const blocked = new Promise<'blocked'>((resolve) => {
    timer = setTimeout(() => resolve('blocked'), ms);
  });
  const outcome = await Promise.race([
    work.then(() => 'settled' as const),
    blocked,
  ]);
  clearTimeout(timer);
  return outcome;
}

let stand: LeftoverStand | undefined;
let previousType: string | undefined;

beforeEach(() => {
  gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  openGate();
  await stand?.close();
  stand = undefined;
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  jest.restoreAllMocks();
});

it("another credential on an instance built for USER_A neither sees nor touches A's leftover session", async () => {
  stand = await leftoverStand({ token: { tokenUser: 'USER_A' } });
  await stand.call('ProbeAdt', { id: 'warm' });
  const mine = await stand.leftover({ user: 'USER_A' });
  // Listed for A itself.
  const forA = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(forA.map((s) => s.handle)).toContain(mine.handle);

  // The instance now takes another request's credential: USER_B's token.
  stand.standIn.systemInformation('USER_B');
  stand.server.use({
    settings: { url: stand.standIn.url, client: '100', authType: 'jwt' },
    credential: TokenAuthProvider.fixed('placeholder.other-token.sig'),
  });

  const forB = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(forB.map((s) => s.handle)).not.toContain(mine.handle);

  const resumed = await stand.call('ResumeLeftoverSession', {
    handle: mine.handle,
  });
  expect(json(resumed.text).error).toBe('leftover_session_not_available');

  const loggedOff = await stand.call('LogoffLeftoverSession', {
    handle: mine.handle,
  });
  expect(json(loggedOff.text).error).toBe('leftover_session_not_available');
  expect(stand.standIn.loggedOff()).not.toContain(mine.session);
  expect(stand.files()).toContain(mine.handle);
});

it('a user SAP named for this credential is answered without the flow, also when the connection is spent', async () => {
  stand = await leftoverStand({
    token: { tokenUser: 'USER_A' },
    extra: [loseAndHold],
  });
  // The first leftover call asks SAP, through the flow, and keeps the user
  // for this credential.
  await stand.call('ListLeftoverSessions');
  const lookups = stand.standIn.requests.filter(isLookup).length;
  expect(lookups).toBeGreaterThan(0);

  // A call finds the session lost and holds the flow.
  const held = stand.call('LoseAndHold', { id: 'a' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(stand.standIn.requests.some((r) => r.url === `${LOSE_PATH}a`)).toBe(
    true,
  );

  // The spent connection's identity is not read; the credential's user is.
  const listed = stand.call('ListLeftoverSessions');
  const outcome = await settlesWithin(listed, 2_000);
  openGate();
  await held;
  expect(outcome).toBe('settled');
  expect((await listed).isError).toBe(false);
  expect(stand.standIn.requests.filter(isLookup).length).toBe(lookups);
});

it("a replaced connection asks its credential's user again: the background caller follows a re-logon as another user", async () => {
  const standIn = await adtStandIn();
  standIn.systemInformation('USER_A');
  const caller = await callerOn(standIn, new InMemoryBackgroundRuns(), {
    tokenUser: 'USER_A',
  });
  (
    caller.server as unknown as {
      register(registry: CompositeHandlersRegistry): void;
    }
  ).register(new CompositeHandlersRegistry([probeGroup([loseAndHold])]));
  try {
    expect(
      (
        await caller.call('RuntimeRunClass', {
          class_name: 'ZCL_FIRST',
          background: true,
        })
      ).isError,
    ).toBe(false);

    // The same credential logs on again as another SAP user: the session is
    // lost, and the next call replaces the connection.
    standIn.systemInformation('USER_B');
    openGate();
    await caller.call('LoseAndHold', { id: 'b' });
    await caller.call('ProbeAdt', { id: 'replaced' });
    // Counted after the replacement's connect (on ABAP Cloud it asks the
    // system context there).
    const before = standIn.requests.filter(isLookup).length;

    expect(
      (
        await caller.call('RuntimeRunClass', {
          class_name: 'ZCL_SECOND',
          background: true,
        })
      ).isError,
    ).toBe(false);
    // Asked again, on the replacement — not answered from before.
    const after = standIn.requests.filter(isLookup);
    expect(after.length).toBe(before + 1);
    const replaced = standIn.requests.find(
      (r) => r.url === `${PROBE_PATH}replaced`,
    )?.session;
    expect(after.at(-1)?.session).toBe(replaced);
  } finally {
    await caller.close();
    await standIn.close();
  }
});

/**
 * stdio's shape: a source that keeps its connection while the provider it
 * answers changes (`keepsConnection`), its credential switchable.
 */
function keepingSource(
  server: object,
  url: string,
  first: TokenAuthProvider,
): { switchTo(next: TokenAuthProvider): void } {
  let current = first;
  (
    server as {
      setConnectionContext(context: unknown): void;
    }
  ).setConnectionContext({
    kind: 'built',
    source: {
      resolve: async () => ({
        settings: { url, client: '100', authType: 'jwt' },
        credential: current,
      }),
    },
    keepsConnection: true,
    sessionId: 'keeping',
  });
  return {
    switchTo: (next) => {
      current = next;
    },
  };
}

it('I-R6a, background: a new provider on the kept session, the session replaced as another user — the next start asks again', async () => {
  const standIn = await adtStandIn();
  standIn.systemInformation('USER_A');
  const caller = await callerOn(standIn, new InMemoryBackgroundRuns(), {
    tokenUser: 'USER_A',
  });
  (
    caller.server as unknown as {
      register(registry: CompositeHandlersRegistry): void;
    }
  ).register(new CompositeHandlersRegistry([probeGroup([loseAndHold])]));
  const source = keepingSource(
    caller.server,
    standIn.url,
    TokenAuthProvider.fixed('placeholder.p1.sig'),
  );
  try {
    const start = (name: string) =>
      caller.call('RuntimeRunClass', { class_name: name, background: true });
    // P1 asks USER_A on the kept session.
    expect((await start('ZCL_P1')).isError).toBe(false);
    // P2 on the same kept session: asked there, USER_A.
    source.switchTo(TokenAuthProvider.fixed('placeholder.p2.sig'));
    expect((await start('ZCL_P2')).isError).toBe(false);

    // The session is lost; the replacement logs on as USER_B.
    standIn.systemInformation('USER_B');
    openGate();
    await caller.call('LoseAndHold', { id: 'kept' });
    await caller.call('ProbeAdt', { id: 'replaced' });
    const before = standIn.requests.filter(isLookup).length;

    expect((await start('ZCL_AFTER')).isError).toBe(false);
    const after = standIn.requests.filter(isLookup);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)?.session).toBe(
      standIn.requests.find((r) => r.url === `${PROBE_PATH}replaced`)?.session,
    );
  } finally {
    await caller.close();
    await standIn.close();
  }
});

it('I-R6a, leftover: a new provider on the kept session, the session replaced as another user — the caller is B, never A', async () => {
  stand = await leftoverStand({
    token: { tokenUser: 'USER_A' },
    extra: [loseAndHold],
  });
  const source = keepingSource(
    stand.server,
    stand.standIn.url,
    TokenAuthProvider.fixed('placeholder.p1.sig'),
  );
  const ofA = await stand.leftover({ user: 'USER_A' });
  const ofB = await stand.leftover({ user: 'USER_B' });
  // P1, then P2, on the kept session: both asked as USER_A.
  await stand.call('ListLeftoverSessions');
  source.switchTo(TokenAuthProvider.fixed('placeholder.p2.sig'));
  await stand.call('ListLeftoverSessions');

  // The session is lost and replaced as USER_B; that one is lost too while
  // a call holds the flow, so the kept identity is not read.
  stand.standIn.systemInformation('USER_B');
  openGate();
  await stand.call('LoseAndHold', { id: 'kept' });
  await stand.call('ProbeAdt', { id: 'replaced' });
  gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const holding = stand.call('LoseAndHold', { id: 'replacement' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const listing = stand.call('ListLeftoverSessions');
  await new Promise((resolve) => setTimeout(resolve, 100));
  openGate();
  await holding;
  const listed = json((await listing).text).sessions as Array<{
    handle: string;
  }>;
  const handles = listed.map((s) => s.handle);
  expect(handles).toContain(ofB.handle);
  expect(handles).not.toContain(ofA.handle);
});

it('m-R6b: a resume forgets the cached caller users', async () => {
  stand = await leftoverStand({
    token: { tokenUser: 'USER_A' },
    extra: [loseAndHold],
  });
  // The caller's user cached, asked on the instance's first connection.
  await stand.call('ListLeftoverSessions');
  const mine = await stand.leftover({ user: 'USER_A' });
  expect(
    json(
      (await stand.call('ResumeLeftoverSession', { handle: mine.handle })).text,
    ),
  ).toMatchObject({ state: 'resumed' });

  // The resumed connection is lost while a call holds the flow: the kept
  // identity is not read, and a cache from before the resume is not either.
  const lookups = stand.standIn.requests.filter(isLookup).length;
  const holding = stand.call('LoseAndHold', { id: 'resumed' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const listing = stand.call('ListLeftoverSessions');
  expect(await settlesWithin(listing, 500)).toBe('blocked');
  openGate();
  await holding;
  expect((await listing).isError).toBe(false);
  expect(stand.standIn.requests.filter(isLookup).length).toBeGreaterThan(
    lookups,
  );
});

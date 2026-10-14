/**
 * A background run's caller is the user the system names in
 * `systeminformation`, on every kind of system, over any configured login.
 * An answer that names no user is the same `system_without_user` the
 * per-call lookup answers — one rule, one code. Nothing is kept: once the
 * system names its user, the next call asks again and goes on. The
 * configured login stands in only on an on-premise `404`; on ABAP Cloud a
 * `404` is `cloud_without_systeminformation`.
 */

import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { adtStandIn, type StandInRequest } from '../../helpers/adtStandIn';
import { clientOf, StandServer, shippedGroups, silent } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

/** `systeminformation` answers that name no user. */
const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: ' ', systemID: 'CLD' })],
  ['a body that is no JSON', 'not json'],
  ['a JSON array', JSON.stringify([{ userName: 'ARRAY_USER' }])],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

it.each(WITHOUT_USER)(
  'a caller lookup answered with %s is system_without_user, and is not kept',
  async (_what, body) => {
    const standIn = await adtStandIn();
    let fixed = false;
    standIn.body((r) => isLookup(r) && !fixed, body);
    standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    const server = new StandServer({
      name: 'caller-without-user',
      logger: silent,
      systemType: 'cloud',
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    server.use({
      settings: { url: standIn.url, client: '100', authType: 'jwt' },
      credential: TokenAuthProvider.fixed('placeholder.token.sig'),
    });
    server.register(shippedGroups());
    const client = await clientOf(server);
    try {
      // A management tool: its caller is looked up with no per-call lookup.
      const first = await client.call('GetBackgroundRun', {
        run_handle: 'unknown-handle',
      });
      expect(first.isError).toBe(true);
      expect(first.payload).toMatchObject({ error: 'system_without_user' });

      fixed = true;
      const second = await client.call('GetBackgroundRun', {
        run_handle: 'unknown-handle',
      });
      expect(second.payload).not.toMatchObject({
        error: 'system_without_user',
      });
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  },
);

/** A server on the stand, its connection built from `settings`. */
async function standServerOn(
  standIn: { url: string },
  settings: Record<string, string>,
) {
  const backgroundRuns = new InMemoryBackgroundRuns();
  const listed = jest.spyOn(backgroundRuns, 'list');
  const server = new StandServer({
    name: 'caller-by-kind',
    logger: silent,
    backgroundRuns,
  });
  server.use({
    settings: { url: standIn.url, client: '100', authType: 'jwt', ...settings },
    credential: TokenAuthProvider.fixed('placeholder.token.sig'),
  });
  server.register(shippedGroups());
  /** The caller user the last listing ran for. */
  const caller = () => listed.mock.calls.at(-1)?.[0].user;
  return { server, client: await clientOf(server), caller };
}

it('on ABAP Cloud the user the system names wins over a configured login', async () => {
  const standIn = await adtStandIn();
  standIn.body(isLookup, JSON.stringify({ userName: 'system_user' }));
  const { server, client, caller } = await standServerOn(standIn, {
    username: 'LOGIN_USER',
  });
  try {
    const answer = await client.call('ListBackgroundRuns');
    expect(answer.isError).toBeFalsy();
    expect(caller()).toBe('SYSTEM_USER');
  } finally {
    await client.close();
    await server.terminalClose();
    await standIn.close();
  }
});

it('on ABAP Cloud a caller lookup answered 404: cloud_without_systeminformation, never the login', async () => {
  const standIn = await adtStandIn();
  standIn.answer(isLookup, 404);
  const saved = process.env.SAP_USERNAME;
  process.env.SAP_USERNAME = 'PROCESS_LOGIN';
  const { server, client } = await standServerOn(standIn, {});
  try {
    const answer = await client.call('GetBackgroundRun', {
      run_handle: 'unknown-handle',
    });
    expect(answer.isError).toBe(true);
    expect(answer.payload).toEqual({
      error: 'cloud_without_systeminformation',
      message:
        'the ABAP Cloud system answered without systeminformation, which every ABAP Cloud system has: the destination is not a valid ABAP Cloud system; the tool did not run',
    });
    expect(standIn.requests.filter(isLookup)).toHaveLength(1);
  } finally {
    if (saved === undefined) delete process.env.SAP_USERNAME;
    else process.env.SAP_USERNAME = saved;
    await client.close();
    await server.terminalClose();
    await standIn.close();
  }
});

it.each([405, 501, 500])(
  'on ABAP Cloud a caller lookup answered %i is the call error, never the login',
  async (status) => {
    const standIn = await adtStandIn();
    standIn.answer(isLookup, status);
    const saved = process.env.SAP_USERNAME;
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    const { server, client } = await standServerOn(standIn, {});
    try {
      const answer = await client.call('GetBackgroundRun', {
        run_handle: 'unknown-handle',
      });
      expect(answer.isError).toBe(true);
      expect(answer.payload).not.toMatchObject({
        error: 'background_run_caller_unknown',
      });
      expect(answer.payload).not.toMatchObject({
        error: 'system_without_user',
      });
      expect(JSON.stringify(answer.payload)).not.toContain('PROCESS_LOGIN');
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      if (saved === undefined) delete process.env.SAP_USERNAME;
      else process.env.SAP_USERNAME = saved;
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  },
);

describe('on-premise', () => {
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });

  it('the user the system names wins over a configured login', async () => {
    const standIn = await adtStandIn();
    standIn.body(isLookup, JSON.stringify({ userName: 'system_user' }));
    const { server, client, caller } = await standServerOn(standIn, {
      username: 'LOGIN_USER',
    });
    try {
      const answer = await client.call('ListBackgroundRuns');
      expect(answer.isError).toBeFalsy();
      expect(caller()).toBe('SYSTEM_USER');
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  });

  it('without the function (404): the configured login, and the 404 kept', async () => {
    const standIn = await adtStandIn();
    standIn.answer(isLookup, 404);
    const { server, client, caller } = await standServerOn(standIn, {
      username: 'login_user',
    });
    try {
      expect((await client.call('ListBackgroundRuns')).isError).toBeFalsy();
      expect(caller()).toBe('LOGIN_USER');
      expect((await client.call('ListBackgroundRuns')).isError).toBeFalsy();
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  });

  it('without the function (404) and no login: unknown', async () => {
    const standIn = await adtStandIn();
    standIn.answer(isLookup, 404);
    const { server, client } = await standServerOn(standIn, {});
    try {
      const answer = await client.call('ListBackgroundRuns');
      expect(answer.isError).toBe(true);
      expect(answer.payload).toMatchObject({
        error: 'background_run_caller_unknown',
      });
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  });

  it('an answer without a user: system_without_user, the login not used', async () => {
    const standIn = await adtStandIn();
    standIn.body(isLookup, JSON.stringify({ systemID: 'SID' }));
    const { server, client } = await standServerOn(standIn, {
      username: 'LOGIN_USER',
    });
    try {
      const answer = await client.call('ListBackgroundRuns');
      expect(answer.isError).toBe(true);
      expect(answer.payload).toMatchObject({ error: 'system_without_user' });
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  });

  it.each([405, 500])(
    'a lookup answered %i: the call error, the login not used',
    async (status) => {
      const standIn = await adtStandIn();
      standIn.answer(isLookup, status);
      const { server, client } = await standServerOn(standIn, {
        username: 'LOGIN_USER',
      });
      try {
        const answer = await client.call('ListBackgroundRuns');
        expect(answer.isError).toBe(true);
        expect(answer.payload).not.toMatchObject({
          error: 'background_run_caller_unknown',
        });
        expect(JSON.stringify(answer.payload)).not.toContain('LOGIN_USER');
      } finally {
        await client.close();
        await server.terminalClose();
        await standIn.close();
      }
    },
  );
});

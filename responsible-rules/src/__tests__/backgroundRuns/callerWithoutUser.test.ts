/**
 * A background run's caller is the user the system names in
 * `systeminformation`, on every kind of system, over any configured login.
 * Anything else is no information, never kept. On ABAP Cloud one step to the
 * call's error: a `404` `cloud_without_systeminformation` (the configuration
 * is inconsistent), an answer without a user or another status
 * `system_lookup_failed` — the per-call lookup's codes. On-premise the
 * configured login stands in; none → `system_user_unknown`, the tool
 * path's code and words. On-premise a `404` is kept: asked once. A `401` is
 * the credential failure as it came, on both kinds.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
import {
  clientOf,
  shippedGroups,
  silent,
} from '../../../../src/__tests__/unit/backgroundRuns/harness';
import type { DestinationSystemContext } from '../../../../src/lib/auth/destinationSystemContext';
import { SYSTEM_USER_UNKNOWN_WORDS } from '../../../../src/lib/auth/serverRefusal';
import { StandServer } from '../helpers/withRules';

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

for (const [_what, body] of WITHOUT_USER) {
  it(
    format(
      'on ABAP Cloud a caller lookup answered with %s is system_lookup_failed, and is not kept',
      _what,
    ),
    async () => {
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
        assert.equal(first.isError, true);
        assertMatchObject(first.payload, { error: 'system_lookup_failed' });

        fixed = true;
        const second = await client.call('GetBackgroundRun', {
          run_handle: 'unknown-handle',
        });
        assert.throws(
          () =>
            assertMatchObject(second.payload, {
              error: 'system_lookup_failed',
            }),
          assert.AssertionError,
        );
      } finally {
        await client.close();
        await server.terminalClose();
        await standIn.close();
      }
    },
  );
}

/** A server on the stand, its connection built from `settings`. */
async function standServerOn(
  standIn: { url: string },
  settings: Record<string, string>,
  systemContext?: DestinationSystemContext,
) {
  const backgroundRuns = new InMemoryBackgroundRuns();
  const listed = mock.method(backgroundRuns, 'list');
  const server = new StandServer({
    name: 'caller-by-kind',
    logger: silent,
    backgroundRuns,
  });
  server.use({
    settings: { url: standIn.url, client: '100', authType: 'jwt', ...settings },
    credential: TokenAuthProvider.fixed('placeholder.token.sig'),
    ...(systemContext !== undefined && { systemContext }),
  });
  server.register(shippedGroups());
  /** The caller user the last listing ran for. */
  const caller = () => listed.mock.calls.at(-1)?.arguments[0].user;
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
    assert.ok(!answer.isError);
    assert.equal(caller(), 'SYSTEM_USER');
  } finally {
    await client.close();
    await server.terminalClose();
    await standIn.close();
  }
});

it('on ABAP Cloud a caller lookup answered 404: cloud_without_systeminformation (the configuration is inconsistent), never the login', async () => {
  const standIn = await adtStandIn();
  standIn.answer(isLookup, 404);
  const saved = process.env.SAP_USERNAME;
  process.env.SAP_USERNAME = 'PROCESS_LOGIN';
  const { server, client } = await standServerOn(standIn, {});
  try {
    const answer = await client.call('GetBackgroundRun', {
      run_handle: 'unknown-handle',
    });
    assert.equal(answer.isError, true);
    assert.deepStrictEqual(answer.payload, {
      error: 'cloud_without_systeminformation',
      message:
        'the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run',
    });
    assert.equal(standIn.requests.filter(isLookup).length, 1);
  } finally {
    if (saved === undefined) delete process.env.SAP_USERNAME;
    else process.env.SAP_USERNAME = saved;
    await client.close();
    await server.terminalClose();
    await standIn.close();
  }
});

for (const status of [405, 501, 500]) {
  it(
    format(
      'on ABAP Cloud a caller lookup answered %i is system_lookup_failed, never the login',
      status,
    ),
    async () => {
      const standIn = await adtStandIn();
      standIn.answer(isLookup, status);
      const saved = process.env.SAP_USERNAME;
      process.env.SAP_USERNAME = 'PROCESS_LOGIN';
      const { server, client } = await standServerOn(standIn, {});
      try {
        const answer = await client.call('GetBackgroundRun', {
          run_handle: 'unknown-handle',
        });
        assert.equal(answer.isError, true);
        assertMatchObject(answer.payload, { error: 'system_lookup_failed' });
        assert.ok(!JSON.stringify(answer.payload).includes('PROCESS_LOGIN'));
        assert.equal(standIn.requests.filter(isLookup).length, 1);
      } finally {
        if (saved === undefined) delete process.env.SAP_USERNAME;
        else process.env.SAP_USERNAME = saved;
        await client.close();
        await server.terminalClose();
        await standIn.close();
      }
    },
  );
}

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
      assert.ok(!answer.isError);
      assert.equal(caller(), 'SYSTEM_USER');
      assert.equal(standIn.requests.filter(isLookup).length, 1);
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  });

  const NO_INFORMATION: Array<[string, (standIn: AdtStandIn) => void, number]> =
    [
      [
        'no systeminformation (404)',
        (standIn) => standIn.answer(isLookup, 404),
        1,
      ],
      [
        'an answer without a user',
        (standIn) =>
          standIn.body(isLookup, JSON.stringify({ systemID: 'SID' })),
        1,
      ],
      ['an error (405)', (standIn) => standIn.answer(isLookup, 405), 1],
      ['an error (500)', (standIn) => standIn.answer(isLookup, 500), 1],
    ];

  for (const [_case, answer, lookups] of NO_INFORMATION) {
    it(
      format(
        '%s: the configured login; the parameters made with the connection are kept, asked once',
        _case,
      ),
      async () => {
        const standIn = await adtStandIn();
        answer(standIn);
        const { server, client, caller } = await standServerOn(standIn, {
          username: 'login_user',
        });
        try {
          assert.ok(!(await client.call('ListBackgroundRuns')).isError);
          assert.equal(caller(), 'LOGIN_USER');
          assert.ok(!(await client.call('ListBackgroundRuns')).isError);
          assert.equal(standIn.requests.filter(isLookup).length, lookups);
        } finally {
          await client.close();
          await server.terminalClose();
          await standIn.close();
        }
      },
    );
  }

  for (const [_case, answer] of NO_INFORMATION) {
    it(
      format('%s: the responsible if stated, else the login', _case),
      async () => {
        const standIn = await adtStandIn();
        answer(standIn);
        const onlyResponsible = await standServerOn(
          standIn,
          {},
          {
            responsible: 'resp_user',
          },
        );
        try {
          assert.ok(
            !(await onlyResponsible.client.call('ListBackgroundRuns')).isError,
          );
          assert.equal(onlyResponsible.caller(), 'RESP_USER');
        } finally {
          await onlyResponsible.client.close();
          await onlyResponsible.server.terminalClose();
        }
        const both = await standServerOn(
          standIn,
          { username: 'login_user' },
          {
            responsible: 'resp_user',
          },
        );
        try {
          assert.ok(!(await both.client.call('ListBackgroundRuns')).isError);
          assert.equal(both.caller(), 'RESP_USER');
        } finally {
          await both.client.close();
          await both.server.terminalClose();
          await standIn.close();
        }
      },
    );
  }

  for (const [_case, answer] of NO_INFORMATION) {
    it(format('%s and no login: system_user_unknown', _case), async () => {
      const standIn = await adtStandIn();
      answer(standIn);
      const { server, client } = await standServerOn(standIn, {});
      try {
        const result = await client.call('ListBackgroundRuns');
        assert.equal(result.isError, true);
        assert.deepStrictEqual(result.payload, {
          error: 'system_user_unknown',
          message: SYSTEM_USER_UNKNOWN_WORDS,
        });
      } finally {
        await client.close();
        await server.terminalClose();
        await standIn.close();
      }
    });
  }
});

for (const [_kind, kind] of [
  ['on-premise', 'onprem'],
  ['ABAP Cloud', 'cloud'],
]) {
  describe(format('%s: a 401 on the caller lookup', _kind), () => {
    it('is the credential failure as it came — no login stands in', async () => {
      process.env.SAP_SYSTEM_TYPE = kind;
      const standIn = await adtStandIn();
      standIn.answer(isLookup, 401);
      const { server, client } = await standServerOn(standIn, {
        username: 'LOGIN_USER',
      });
      try {
        const result = await client.call('ListBackgroundRuns');
        assert.equal(result.isError, true);
        assertMatchObject(result.payload, { error: 'authentication_failed' });
      } finally {
        await client.close();
        await server.terminalClose();
        await standIn.close();
      }
    });
  });
}

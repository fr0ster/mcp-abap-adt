/**
 * A host that serves several SAP users from one process passes the responsible
 * person and master system per request (#202). For an ABAP Cloud connection a
 * request that does not carry them must still get them — from the system the
 * connection points at, resolved inside the library, per request, keyed by the
 * connection so nothing leaks between users.
 */
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtClient: jest.fn(),
  AdtClientLegacy: jest.fn(),
}));
jest.mock('../../lib/systemInformation', () => ({
  ...jest.requireActual('../../lib/systemInformation'),
  readSystemInformation: jest.fn(),
}));

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../handlers/interfaces';
import { createAdtClient } from '../../lib/clients';
import { createAbapConnection } from '../../lib/connectionFactory';
import { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { logger } from '../../lib/logger';
import {
  defaultSystemContextResolver,
  runWithRequestContext,
  type SystemContextResolver,
  withResolvedSystemContext,
} from '../../lib/requestContext';
import {
  getEffectiveSystemContext,
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { readSystemInformation } from '../../lib/systemInformation';

const lookup = readSystemInformation as jest.Mock;

const credential: IAuthProvider = {
  kind: 'test',
  prepare: async () => ({ ok: true as const }),
  establish: async () => ({ ok: true as const }),
  authorize: async () => ({ ok: true as const }),
  rejected: async () => ({ ok: true as const }),
};

/**
 * Connections built by the factory, so the system kind is the one they were
 * built for: what SAP_SYSTEM_TYPE stated then (required). Neither the
 * credential nor the URL decides anything.
 */
function built(
  settings: Partial<SapConfig>,
  kind: 'cloud' | 'onprem',
): IAbapConnection {
  const stated = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = kind;
  try {
    return createAbapConnection(settings as SapConfig, credential);
  } finally {
    if (stated === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = stated;
  }
}

/** A basic credential: the credential does not make it on-premise. */
function cloudConn(): IAbapConnection {
  return built(
    { url: 'https://system.example.invalid', authType: 'basic' },
    'cloud',
  );
}

/** A jwt, and an https URL without a port: neither makes it cloud. */
function onPremConn(): IAbapConnection {
  return built(
    { url: 'https://system.example.invalid', authType: 'jwt' },
    'onprem',
  );
}

/** On-premise, its parameters stating the user (`SAP_USERNAME`). */
function onPremUserConn(): IAbapConnection {
  return built(
    {
      url: 'https://system.example.invalid',
      authType: 'basic',
      username: 'STATED',
    },
    'onprem',
  );
}

/** A connection the factory did not build (an embedder's own). */
function foreignConn(url: string): IAbapConnection {
  return { getBaseUrl: async () => url } as unknown as IAbapConnection;
}

type Options =
  | { responsible?: string; masterSystem?: string; masterLanguage?: string }
  | undefined;

function lastOptions(): Options {
  return (AdtClient as jest.Mock).mock.calls.at(-1)?.[2];
}

function seen() {
  const ctx = getEffectiveSystemContext();
  return {
    responsible: ctx.responsible,
    masterSystem: ctx.masterSystem,
    masterLanguage: ctx.masterLanguage,
  };
}

const savedSystemType = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (savedSystemType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = savedSystemType;
});

beforeEach(() => {
  delete process.env.SAP_SYSTEM_TYPE;
  resetSystemContextCache();
  setSystemContext({});
  (AdtClient as jest.Mock).mockClear();
  lookup.mockReset();
  lookup.mockResolvedValue({
    user: 'CB_USER',
    systemId: 'CLD',
  });
});

const status = (code: number) =>
  Object.assign(new Error('placeholder'), { response: { status: code } });

describe('defaultSystemContextResolver: only what the system said, on every kind', () => {
  it('maps a cloud system to responsible and master system', async () => {
    await expect(defaultSystemContextResolver(cloudConn())).resolves.toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('asks an on-premise system too, and maps its answer', async () => {
    await expect(defaultSystemContextResolver(onPremConn())).resolves.toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['cloud', cloudConn],
    ['on-premise', onPremConn],
  ])('%s, an answer without a user: null', async (_kind, conn) => {
    lookup.mockResolvedValue({ user: undefined, systemId: 'SID' });
    await expect(defaultSystemContextResolver(conn())).resolves.toBe(null);
  });

  it.each([
    ['cloud', cloudConn, 404],
    ['cloud', cloudConn, 500],
    ['on-premise', onPremConn, 404],
    ['on-premise', onPremConn, 500],
  ] as const)(
    '%s, a failed request (%i): thrown as it came — the kind is not its to read',
    async (_kind, conn, code) => {
      const failed = status(code);
      lookup.mockRejectedValue(failed);
      await expect(defaultSystemContextResolver(conn())).rejects.toBe(failed);
    },
  );
});

describe('the recipe around the resolver, by the kind', () => {
  it('the kind recorded at build wins over a later SAP_SYSTEM_TYPE', async () => {
    const connection = onPremUserConn();
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    lookup.mockRejectedValue(status(404));
    await expect(
      withResolvedSystemContext(connection, () => 'ran'),
    ).resolves.toBe('ran');
  });

  it('a connection the factory did not build, no kind stated anywhere: its 404 is system_type_required', async () => {
    lookup.mockRejectedValue(status(404));
    await expect(
      withResolvedSystemContext(
        foreignConn('https://system.example.invalid'),
        () => 'ran',
      ),
    ).rejects.toMatchObject({ serverRefusal: 'system_type_required' });
  });

  it.each([
    ['https://system.abap.example.hana.ondemand.com'],
    ['https://system.example.invalid'],
  ])(
    'a connection the factory did not build: its 404 read by the stated kind alone, never the URL (%s)',
    async (url) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      lookup.mockRejectedValue(status(404));
      await expect(
        runWithRequestContext({ login: 'BOB' }, () =>
          withResolvedSystemContext(
            foreignConn(url),
            () => 'ran',
            undefined,
            'onprem',
          ),
        ),
      ).resolves.toBe('ran');
      await expect(
        runWithRequestContext({ login: 'BOB' }, () =>
          withResolvedSystemContext(
            foreignConn(url),
            () => 'ran',
            undefined,
            'cloud',
          ),
        ),
      ).rejects.toMatchObject({
        serverRefusal: 'cloud_without_systeminformation',
      });
      warn.mockRestore();
    },
  );

  it.each([
    ['cloud', cloudConn],
    ['on-premise', onPremUserConn],
  ])(
    '%s, a 401 on the lookup: the credential failure as it came — no fallback, never another error',
    async (_kind, conn) => {
      const refused = status(401);
      lookup.mockRejectedValue(refused);
      const fn = jest.fn();
      await expect(
        runWithRequestContext({ login: 'BOB' }, () =>
          withResolvedSystemContext(conn(), fn),
        ),
      ).rejects.toBe(refused);
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it('on-premise, a 404: asked once per connection — later calls send no systeminformation', async () => {
    lookup.mockRejectedValue(status(404));
    const connection = onPremUserConn();
    for (let i = 0; i < 3; i += 1) {
      await expect(
        withResolvedSystemContext(connection, () => 'ran'),
      ).resolves.toBe('ran');
    }
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('on-premise, a kept 404 with no user stated: system_user_unknown each call, still asked once', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(status(404));
    const connection = onPremConn();
    for (let i = 0; i < 2; i += 1) {
      await expect(
        withResolvedSystemContext(connection, () => 'ran'),
      ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
    }
    await expect(
      runWithRequestContext({ login: 'BOB' }, () =>
        withResolvedSystemContext(connection, () => 'ran'),
      ),
    ).resolves.toBe('ran');
    expect(lookup).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it.each([['cloud', cloudConn, 'cloud_without_systeminformation']] as const)(
    '%s, a 404 is not kept: the next call asks again (%s)',
    async (_kind, conn, code) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      lookup.mockRejectedValue(status(404));
      const connection = conn();
      for (let i = 0; i < 2; i += 1) {
        await expect(
          withResolvedSystemContext(connection, () => 'ran'),
        ).rejects.toMatchObject({ serverRefusal: code });
      }
      expect(lookup).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    },
  );

  describe('a custom resolver answering nothing', () => {
    const nothing: Array<[string, () => SystemContextResolver]> = [
      ['null', () => async () => null],
      [
        'a throw',
        () => async () => {
          throw new Error('custom lookup failed');
        },
      ],
    ];

    it.each(nothing)(
      'on ABAP Cloud (%s): the cloud error, the stated user not used',
      async (_what, make) => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const fn = jest.fn();
        await expect(
          runWithRequestContext({ login: 'BOB' }, () =>
            withResolvedSystemContext(cloudConn(), fn, make()),
          ),
        ).rejects.toMatchObject({ serverRefusal: 'system_lookup_failed' });
        expect(fn).not.toHaveBeenCalled();
        warn.mockRestore();
      },
    );

    it.each(nothing)(
      'on-premise (%s): the headers / parameters — the stated values, else system_user_unknown',
      async (_what, make) => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        await expect(
          runWithRequestContext(
            { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
            () => withResolvedSystemContext(onPremConn(), seen, make()),
          ),
        ).resolves.toMatchObject({ responsible: 'ALICE', masterSystem: 'SID' });
        await expect(
          withResolvedSystemContext(onPremConn(), seen, make()),
        ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
        warn.mockRestore();
      },
    );

    it('a custom resolver throwing a 404: the cloud error for a missing endpoint on ABAP Cloud', async () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const resolver: SystemContextResolver = async () => {
        throw status(404);
      };
      await expect(
        withResolvedSystemContext(cloudConn(), () => 'ran', resolver),
      ).rejects.toMatchObject({
        serverRefusal: 'cloud_without_systeminformation',
      });
      warn.mockRestore();
    });
  });
});

describe('memoisation per connection', () => {
  it('two concurrent calls on one connection make one lookup', async () => {
    const conn = cloudConn();
    await Promise.all([
      withResolvedSystemContext(conn, seen),
      withResolvedSystemContext(conn, seen),
    ]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('two different connections make two lookups', async () => {
    await withResolvedSystemContext(cloudConn(), seen);
    await withResolvedSystemContext(cloudConn(), seen);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('a rejected lookup is not cached', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const conn = cloudConn();
    lookup.mockRejectedValueOnce(new Error('ICM down'));
    await expect(withResolvedSystemContext(conn, seen)).rejects.toMatchObject({
      serverRefusal: 'system_lookup_failed',
    });
    const second = await withResolvedSystemContext(conn, seen);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ responsible: 'CB_USER' });
    warn.mockRestore();
  });

  it('an injected resolver is not served from the default cache', async () => {
    const conn = cloudConn();
    await withResolvedSystemContext(conn, seen);
    const injected: SystemContextResolver = jest.fn(async () => ({
      responsible: 'INJ',
      masterSystem: 'INJ_SYS',
    }));
    const result = await withResolvedSystemContext(conn, seen, injected);
    expect(injected).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      responsible: 'INJ',
      masterSystem: 'INJ_SYS',
    });
  });
});

describe('withResolvedSystemContext', () => {
  it.each([
    ['cloud', cloudConn],
    ['on-premise', onPremConn],
  ])(
    '%s: the system answer wins over a scope carrying both',
    async (_kind, conn) => {
      const connection = conn();
      await runWithRequestContext(
        { responsible: 'ALICE', masterSystem: 'SID' },
        () =>
          withResolvedSystemContext(connection, () => {
            createAdtClient(connection);
          }),
      );
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(lastOptions()).toMatchObject({
        responsible: 'CB_USER',
        masterSystem: 'CLD',
      });
    },
  );

  it('on-premise without the function (404): the scope as stated, the system not in it', async () => {
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const conn = onPremUserConn();
    await runWithRequestContext(
      { responsible: 'ALICE', masterSystem: 'SID' },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    expect(lastOptions()).toMatchObject({
      responsible: 'ALICE',
      masterSystem: 'SID',
    });
  });

  it('on-premise without the function (404), no user stated: system_user_unknown, fn never runs; the 404 is kept, so the next call sends no lookup', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const conn = onPremConn();
    const fn = jest.fn();
    for (let i = 0; i < 2; i += 1) {
      await expect(
        runWithRequestContext({ masterSystem: 'SID' }, () =>
          withResolvedSystemContext(conn, fn),
        ),
      ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
    }
    expect(fn).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it.each([
    ['(a) responsible only', { responsible: 'ALICE' }],
    ['(b) login only', { login: 'BOB' }],
    ['(c) both', { responsible: 'ALICE', login: 'BOB' }],
  ])(
    'on-premise without the function (404), %s: fn runs, taking the responsible if stated, else the login',
    async (_case, scope) => {
      lookup.mockRejectedValue(
        Object.assign(new Error('placeholder'), { response: { status: 404 } }),
      );
      const seen: Array<string | undefined> = [];
      await expect(
        runWithRequestContext(scope, () =>
          withResolvedSystemContext(onPremConn(), () => {
            seen.push(getEffectiveSystemContext().responsible);
            return 'ran';
          }),
        ),
      ).resolves.toBe('ran');
      expect(seen).toEqual([scope.responsible ?? scope.login]);
    },
  );

  it('on-premise without the function (404), neither a responsible nor a login: system_user_unknown', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const fn = jest.fn();
    await expect(
      runWithRequestContext({ masterSystem: 'SID' }, () =>
        withResolvedSystemContext(onPremConn(), fn),
      ),
    ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
    expect(fn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([
    ['blank', '   '],
    ['empty', ''],
  ])(
    'on-premise without the function (404), a %s login: system_user_unknown',
    async (_case, login) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      lookup.mockRejectedValue(
        Object.assign(new Error('placeholder'), { response: { status: 404 } }),
      );
      const fn = jest.fn();
      await expect(
        runWithRequestContext({ login }, () =>
          withResolvedSystemContext(onPremConn(), fn),
        ),
      ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
      expect(fn).not.toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it("on-premise without the function (404), the request's login states the user: fn runs", async () => {
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const fn = jest.fn(async () => 'ran');
    await expect(
      runWithRequestContext({ login: 'HEADER_USER' }, () =>
        withResolvedSystemContext(onPremConn(), fn),
      ),
    ).resolves.toBe('ran');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['cloud', cloudConn, 404, 'cloud_without_systeminformation'],
    ['cloud', cloudConn, 500, 'system_lookup_failed'],
  ] as const)(
    '%s, a lookup answered %d: the call fails as %s, fn never runs, and the next call asks again',
    async (_kind, conn, status, code) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      lookup.mockRejectedValue(
        Object.assign(new Error('placeholder'), { response: { status } }),
      );
      const connection = conn();
      const fn = jest.fn(seen);
      for (let i = 0; i < 2; i++) {
        await expect(
          runWithRequestContext(
            { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
            () => withResolvedSystemContext(connection, fn),
          ),
        ).rejects.toMatchObject({ serverRefusal: code });
      }
      expect(fn).not.toHaveBeenCalled();
      expect(lookup).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    },
  );

  it('cloud, a 2xx that names no user: the call fails as system_lookup_failed, fn never runs, and the next call asks again', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockResolvedValue({ user: undefined, systemId: 'CLD' });
    const connection = cloudConn();
    const fn = jest.fn(seen);
    for (let i = 0; i < 2; i++) {
      await expect(
        runWithRequestContext({ login: 'BOB' }, () =>
          withResolvedSystemContext(connection, fn),
        ),
      ).rejects.toMatchObject({ serverRefusal: 'system_lookup_failed' });
    }
    expect(fn).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledTimes(2);
    lookup.mockResolvedValue({ user: 'CB_USER', systemId: 'CLD' });
    await expect(
      withResolvedSystemContext(connection, fn),
    ).resolves.toMatchObject({ responsible: 'CB_USER' });
    warn.mockRestore();
  });

  const onPremNoInformation = [
    [
      'no systeminformation (404)',
      () =>
        lookup.mockRejectedValue(
          Object.assign(new Error('placeholder'), {
            response: { status: 404 },
          }),
        ),
      1,
    ],
    [
      'an answer without a user',
      () => lookup.mockResolvedValue({ user: undefined, systemId: 'OPS' }),
      2,
    ],
    [
      'an error (500)',
      () =>
        lookup.mockRejectedValue(
          Object.assign(new Error('placeholder'), {
            response: { status: 500 },
          }),
        ),
      2,
    ],
  ] as const;

  it.each(onPremNoInformation)(
    'on-premise, %s: the stated values are taken, fn runs; asked again only when not a 404',
    async (_case, answer, lookups) => {
      answer();
      const connection = onPremConn();
      for (let i = 0; i < 2; i++) {
        await expect(
          runWithRequestContext(
            { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
            () => withResolvedSystemContext(connection, seen),
          ),
        ).resolves.toMatchObject({ responsible: 'ALICE', masterSystem: 'SID' });
      }
      expect(lookup).toHaveBeenCalledTimes(lookups);
    },
  );

  it.each(onPremNoInformation)(
    'on-premise, %s, no user stated: system_user_unknown, fn never runs',
    async (_case, answer) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      answer();
      const fn = jest.fn(seen);
      await expect(
        runWithRequestContext({ masterSystem: 'SID' }, () =>
          withResolvedSystemContext(onPremConn(), fn),
        ),
      ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
      expect(fn).not.toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it('an injected resolver answering without a user: no information — the stated values with a stated user, else system_user_unknown', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const injected: SystemContextResolver = jest.fn(async () => ({
      masterSystem: 'INJ_SYS',
    }));
    await expect(
      runWithRequestContext(
        { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
        () => withResolvedSystemContext(onPremConn(), seen, injected),
      ),
    ).resolves.toMatchObject({ responsible: 'ALICE', masterSystem: 'SID' });
    const fn = jest.fn(seen);
    await expect(
      withResolvedSystemContext(onPremConn(), fn, injected),
    ).rejects.toMatchObject({ serverRefusal: 'system_user_unknown' });
    expect(fn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('on-premise, the information present: it wins over the stated values', async () => {
    const result = await runWithRequestContext(
      { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
      () => withResolvedSystemContext(onPremUserConn(), seen),
    );
    expect(result).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying responsible only: the system answer wins for both', async () => {
    const conn = cloudConn();
    await runWithRequestContext({ responsible: 'ALICE' }, () =>
      withResolvedSystemContext(conn, () => {
        createAdtClient(conn);
      }),
    );
    expect(lastOptions()).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying responsible as undefined is filled from the system, like an absent one', async () => {
    // Ruling 17: a host that always enters a scope with both keys — values
    // possibly undefined (cloud-llm-hub) — must still get the cloud values.
    // An empty value is missing, whether its key is present or not.
    const conn = cloudConn();
    await runWithRequestContext({ responsible: undefined }, () =>
      withResolvedSystemContext(conn, () => {
        createAdtClient(conn);
      }),
    );
    expect(lastOptions()).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying both keys as undefined asks the system and fills both', async () => {
    const conn = cloudConn();
    await runWithRequestContext(
      { responsible: undefined, masterSystem: undefined },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lastOptions()).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying both keys as undefined does not inherit the process values', async () => {
    // Key presence still decides against the process cache: what stops one
    // user's process-wide value reaching another user's scope.
    setSystemContext({ responsible: 'PROC_USER', masterSystem: 'PROC_SYS' });
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const result = await runWithRequestContext(
      { responsible: undefined, masterSystem: undefined },
      () => withResolvedSystemContext(onPremUserConn(), seen),
    );
    expect(result.responsible).toBeUndefined();
    expect(result.masterSystem).toBeUndefined();
  });

  it('with no scope and an empty process context, fills and keeps the process language', async () => {
    setSystemContext({ masterLanguage: 'EN' });
    const conn = cloudConn();
    await withResolvedSystemContext(conn, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()).toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      masterLanguage: 'EN',
    });
  });

  it("keeps an outer scope's masterLanguage", async () => {
    const result = await runWithRequestContext({ masterLanguage: 'DE' }, () =>
      withResolvedSystemContext(cloudConn(), seen),
    );
    expect(result).toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      masterLanguage: 'DE',
    });
  });

  it('a null resolver makes no lookup', async () => {
    const result = await withResolvedSystemContext(cloudConn(), seen, null);
    expect(lookup).not.toHaveBeenCalled();
    expect(result.responsible).toBeUndefined();
  });

  it('a throwing lookup logs a warning with its class only, and fn does not run', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(new Error('ICM down'));
    const fn = jest.fn(seen);
    const refused = await withResolvedSystemContext(cloudConn(), fn).catch(
      (error: unknown) => error,
    );
    expect(refused).toMatchObject({ serverRefusal: 'system_lookup_failed' });
    expect(String((refused as Error).message)).not.toContain('ICM down');
    expect(fn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    // The class only: a lookup's message may quote what the system answered (H4).
    expect(String(warn.mock.calls[0][0])).toContain('Error');
    expect(String(warn.mock.calls[0][0])).not.toContain('ICM down');
    warn.mockRestore();
  });
});

/** A group whose handlers report the context they ran under. */
function fakeGroup(connection: IAbapConnection | null): IHandlerGroup & {
  context: HandlerContext;
} {
  const group = {
    context: { connection } as HandlerContext,
    getName: () => 'fake',
    registerHandlers: () => {},
    getHandlers(): HandlerEntry[] {
      return [
        {
          toolDefinition: { name: 'WithContext', description: 'd' } as never,
          handler: async (_context: HandlerContext, _args: unknown) => seen(),
        },
        {
          toolDefinition: { name: 'Closure', description: 'd' } as never,
          handler: (async (_args: unknown) => ({
            ...seen(),
            connection: group.context.connection,
          })) as never,
        },
      ];
    },
  };
  return group;
}

function exporterWith(
  groups: IHandlerGroup[],
  options?: ConstructorParameters<typeof HandlerExporter>[0],
): HandlerExporter {
  // The kind is required at construction; the connections here record their own.
  const exporter = new HandlerExporter({ systemType: 'onprem', ...options });
  (exporter as unknown as { handlerGroups: IHandlerGroup[] }).handlerGroups =
    groups;
  return exporter;
}

describe('HandlerExporter.getHandlerEntries', () => {
  it('keeps every handler arity the embedders branch on', () => {
    const exporter = new HandlerExporter({ systemType: 'onprem' });
    const raw = (
      exporter as unknown as { handlerGroups: IHandlerGroup[] }
    ).handlerGroups.flatMap((g) => g.getHandlers());
    const wrapped = exporter.getHandlerEntries();
    expect(wrapped.map((e) => e.handler.length)).toEqual(
      raw.map((e) => e.handler.length),
    );
    expect(wrapped.map((e) => e.toolDefinition)).toEqual(
      raw.map((e) => e.toolDefinition),
    );
    const arities = new Set(raw.map((e) => e.handler.length));
    expect(arities.has(1)).toBe(true);
  });

  it('a context+args handler runs with values filled from its connection', async () => {
    const exporter = exporterWith([fakeGroup(null)]);
    const entry = exporter.getHandlerEntries()[0];
    expect(entry.handler.length).toBe(2);
    await expect(
      entry.handler({ connection: cloudConn() }, {}),
    ).resolves.toMatchObject({ responsible: 'CB_USER', masterSystem: 'CLD' });
  });

  it("an args-only handler resolves the group's swapped connection", async () => {
    const group = fakeGroup(null);
    const entry = exporterWith([group]).getHandlerEntries()[1];
    expect(entry.handler.length).toBe(1);
    const conn = cloudConn();
    group.context = { connection: conn };
    const result = await (entry.handler as unknown as (a: unknown) => unknown)(
      {},
    );
    expect(result).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      connection: conn,
    });
  });

  describe.each([
    ['context+args', 0],
    ['args-only', 1],
  ])('a %s handler', (_arity, index) => {
    /** Calls the entry on `connection` as an embedder does, recording whether it ran. */
    function callOn(connection: IAbapConnection) {
      const group = fakeGroup(connection);
      const ran = jest.fn();
      const original = group.getHandlers;
      group.getHandlers = () =>
        original().map((e) => {
          const handler = e.handler as (...a: unknown[]) => Promise<unknown>;
          const counted =
            handler.length >= 2
              ? async (c: unknown, a: unknown) => {
                  ran();
                  return handler(c, a);
                }
              : async (a: unknown) => {
                  ran();
                  return handler(a);
                };
          return { ...e, handler: counted as never };
        });
      const entry = exporterWith([group]).getHandlerEntries()[index];
      const call = () =>
        index === 0
          ? entry.handler({ connection }, {})
          : (entry.handler as unknown as (a: unknown) => Promise<unknown>)({});
      return { call, ran };
    }

    it.each([
      [
        'a cloud 2xx that names no user',
        cloudConn,
        () => lookup.mockResolvedValue({ user: '', systemId: 'CLD' }),
        'system_lookup_failed',
      ],
      [
        'a cloud 500',
        cloudConn,
        () =>
          lookup.mockRejectedValue(
            Object.assign(new Error('placeholder'), {
              response: { status: 500 },
            }),
          ),
        'system_lookup_failed',
      ],
      [
        'an on-premise 500 with no user stated',
        onPremConn,
        () =>
          lookup.mockRejectedValue(
            Object.assign(new Error('placeholder'), {
              response: { status: 500 },
            }),
          ),
        'system_user_unknown',
      ],
      [
        'an on-premise 2xx without a user, no user stated',
        onPremConn,
        () => lookup.mockResolvedValue({ user: '', systemId: 'OPS' }),
        'system_user_unknown',
      ],
      [
        'an on-premise 404 with no user stated',
        onPremConn,
        () =>
          lookup.mockRejectedValue(
            Object.assign(new Error('placeholder'), {
              response: { status: 404 },
            }),
          ),
        'system_user_unknown',
      ],
      [
        'a cloud 404',
        cloudConn,
        () =>
          lookup.mockRejectedValue(
            Object.assign(new Error('placeholder'), {
              response: { status: 404 },
            }),
          ),
        'cloud_without_systeminformation',
      ],
    ])(
      '%s: the call fails with the server refusal, no handler runs; the next call asks again, but for an on-premise 404',
      async (_case, conn, answer, code) => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        answer();
        const { call, ran } = callOn(conn());
        await expect(call()).rejects.toMatchObject({ serverRefusal: code });
        await expect(call()).rejects.toMatchObject({ serverRefusal: code });
        expect(ran).not.toHaveBeenCalled();
        expect(lookup).toHaveBeenCalledTimes(
          _case === 'an on-premise 404 with no user stated' ? 1 : 2,
        );
        warn.mockRestore();
      },
    );

    it.each([404, 500])(
      'an on-premise %i: the handler runs with the configured settings',
      async (status) => {
        lookup.mockRejectedValue(
          Object.assign(new Error('placeholder'), { response: { status } }),
        );
        const { call, ran } = callOn(onPremUserConn());
        const result = await runWithRequestContext(
          { responsible: 'ALICE', masterSystem: 'SID' },
          call,
        );
        expect(ran).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
          responsible: 'ALICE',
          masterSystem: 'SID',
        });
      },
    );
  });

  it('systemContextResolver: null disables resolution', async () => {
    const exporter = exporterWith([fakeGroup(null)], {
      systemContextResolver: null,
    });
    const result = await exporter
      .getHandlerEntries()[0]
      .handler({ connection: cloudConn() }, {});
    expect(lookup).not.toHaveBeenCalled();
    expect(result.responsible).toBeUndefined();
  });
});

class ReportingGroup extends BaseHandlerGroup {
  protected groupName = 'reporting';
  observed: ReturnType<typeof seen> | undefined;
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: { name: 'Report', description: 'd' } as never,
        handler: async () => {
          this.observed = seen();
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
    ];
  }
}

describe('BaseHandlerGroup.registerToolOnServer', () => {
  it('fills values from the group context connection', async () => {
    const group = new ReportingGroup({ connection: cloudConn() });
    let callback: ((args: unknown) => Promise<unknown>) | undefined;
    const server = {
      registerTool: (_n: string, _c: unknown, cb: typeof callback) => {
        callback = cb;
      },
    } as unknown as McpServer;
    group.registerHandlers(server);
    await callback?.({});
    expect(group.observed).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });
});

describe('BaseMcpServer.registerHandlers', () => {
  type Registered = Record<
    string,
    { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }
  >;

  function callTool(server: EmbeddableMcpServer, name: string) {
    const tools = (server as unknown as { _registeredTools: Registered })
      ._registeredTools;
    return tools[name].handler({});
  }

  function textOf(result: { content: { text: string }[] }) {
    return JSON.parse(result.content[0].text);
  }

  function jsonGroup(): IHandlerGroup {
    const inner = fakeGroup(null);
    return {
      ...inner,
      getHandlers: () =>
        inner.getHandlers().map((e) => ({
          ...e,
          handler: (e.handler.length >= 2
            ? async (c: HandlerContext, a: unknown) => ({
                content: [
                  { type: 'text', text: JSON.stringify(await e.handler(c, a)) },
                ],
              })
            : async (_a: unknown) => ({
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      await (e.handler as unknown as (a: unknown) => unknown)(
                        _a,
                      ),
                    ),
                  },
                ],
              })) as never,
        })),
    };
  }

  it('fills values for both handler arities', async () => {
    const server = new EmbeddableMcpServer({
      connection: cloudConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
    });
    expect(textOf(await callTool(server, 'WithContext'))).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    expect(textOf(await callTool(server, 'Closure'))).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['cloud', { responsible: 'CB_USER', masterSystem: 'CLD' }],
    ['onprem', { responsible: 'CB_USER', masterSystem: 'CLD' }],
  ] as const)(
    "an injected connection, the server's systemType %s: the system's answer",
    async (systemType, expected) => {
      const server = new EmbeddableMcpServer({
        connection: foreignConn(
          'https://system.abap.example.hana.ondemand.com',
        ) as never,
        handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
        systemType,
      });
      const result = textOf(await callTool(server, 'WithContext'));
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject(expected);
    },
  );

  it("an injected connection answered 404: the server's systemType states the kind, SAP_SYSTEM_TYPE unset", async () => {
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const onprem = new EmbeddableMcpServer({
      connection: foreignConn(
        'https://system.abap.example.hana.ondemand.com',
      ) as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'onprem',
    });
    const answered = textOf(await callTool(onprem, 'WithContext'));
    expect(answered.responsible).toBeUndefined();
    expect(answered.masterSystem).toBeUndefined();
    const cloud = new EmbeddableMcpServer({
      connection: foreignConn(
        'https://system.abap.example.hana.ondemand.com',
      ) as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
    });
    const refused = (await callTool(cloud, 'WithContext')) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain('systeminformation');
    warn.mockRestore();
  });

  it("two servers stating systemType 'cloud' over one connection make one lookup", async () => {
    // A host builds a server per request: the memo must span server instances.
    const connection = foreignConn(
      'https://system.abap.example.hana.ondemand.com',
    );
    for (let i = 0; i < 2; i++) {
      const server = new EmbeddableMcpServer({
        connection: connection as never,
        handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
        systemType: 'cloud',
      });
      expect(textOf(await callTool(server, 'WithContext'))).toMatchObject({
        responsible: 'CB_USER',
        masterSystem: 'CLD',
      });
    }
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a factory-built connection follows its recorded settings, not the server's systemType", async () => {
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const server = new EmbeddableMcpServer({
      connection: onPremUserConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
    });
    // On-premise by its settings: the 404 is the function unavailable, and
    // the tool runs with the configuration.
    const result = (await callTool(server, 'WithContext')) as {
      isError?: boolean;
    };
    expect(result.isError).toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('an injected on-premise connection, a 404, no user stated: system_user_unknown, the tool does not run; the 404 is kept, the next call sends no lookup', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const group = new ReportingGroup({ connection: {} as never });
    const server = new EmbeddableMcpServer({
      connection: onPremConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([group]),
      systemType: 'onprem',
    });
    for (let i = 0; i < 2; i += 1) {
      const result = (await callTool(server, 'Report')) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('system_user_unknown');
    }
    expect(group.observed).toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it.each([
    ['null', async () => null],
    [
      'a throw',
      async () => {
        throw new Error('custom lookup failed');
      },
    ],
  ] as Array<[string, SystemContextResolver]>)(
    "a custom resolver answering nothing (%s): on ABAP Cloud the cloud error, on-premise the stated values — the server's recipe, by the kind",
    async (_what, resolver) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const cloudGroup = new ReportingGroup({ connection: {} as never });
      const cloud = new EmbeddableMcpServer({
        connection: cloudConn() as never,
        handlersRegistry: new CompositeHandlersRegistry([cloudGroup]),
        systemType: 'cloud',
        systemContextResolver: resolver,
      });
      const refused = (await runWithRequestContext(
        { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
        () => callTool(cloud, 'Report'),
      )) as { isError?: boolean; content: Array<{ text: string }> };
      expect(refused.isError).toBe(true);
      expect(refused.content[0]?.text).toContain('system_lookup_failed');
      expect(cloudGroup.observed).toBeUndefined();

      const onPremGroup = new ReportingGroup({ connection: {} as never });
      const onPrem = new EmbeddableMcpServer({
        connection: onPremConn() as never,
        handlersRegistry: new CompositeHandlersRegistry([onPremGroup]),
        systemType: 'onprem',
        systemContextResolver: resolver,
      });
      await runWithRequestContext(
        { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
        () => callTool(onPrem, 'Report'),
      );
      expect(onPremGroup.observed).toMatchObject({
        responsible: 'ALICE',
        masterSystem: 'SID',
      });
      warn.mockRestore();
    },
  );

  it('systemContextResolver: null disables resolution', async () => {
    const server = new EmbeddableMcpServer({
      connection: cloudConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
      systemContextResolver: null,
    });
    const result = textOf(await callTool(server, 'WithContext'));
    expect(lookup).not.toHaveBeenCalled();
    expect(result.responsible).toBeUndefined();
  });
});

/**
 * A host that serves several SAP users from one process passes the responsible
 * person and master system per request (#202). For an ABAP Cloud connection a
 * request that does not carry them must still get them — from the system the
 * connection points at, resolved inside the library, per request, keyed by the
 * connection so nothing leaks between users.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type {
  AdtClientCloud,
  AdtClientOnPrem,
} from '@mcp-abap-adt/adt-clients';

type Options = ConstructorParameters<typeof AdtClientOnPrem>[2];

/** The options of every client built, of either variant, in the order built. */
const clientsBuilt: Options[] = [];

/**
 * adt-clients' module that defines the two variants. Its package index
 * re-exports them by getter, and its `exports` map closes the file, so it is
 * reached by its path next to the index.
 */
const variants: {
  AdtClientOnPrem: typeof AdtClientOnPrem;
  AdtClientCloud: typeof AdtClientCloud;
} = require(
  path.join(
    path.dirname(require.resolve('@mcp-abap-adt/adt-clients')),
    'clients',
    'AdtClientVariants.js',
  ),
);

// The variants replaced on that module before any module under test loads:
// src/lib/clients binds them when it loads (`class … extends
// AdtClientOnPrem`, read through the index's getter then). Each records its
// options, as the Jest factory's jest.fn() did, in one list across both,
// which is the order Jest's invocationCallOrder gave. (mock.module is not
// used here: a module mocked by it leaves the resolve hook unreached for the
// workspace packages this file loads after it, measured on Node 26.) The
// factory's AdtClientLegacy named nothing adt-clients exports; it is gone.
mock.method(
  variants,
  'AdtClientOnPrem',
  function AdtClientOnPrem(
    _connection: unknown,
    _logger: unknown,
    options: Options,
  ) {
    clientsBuilt.push(options);
  },
);
mock.method(
  variants,
  'AdtClientCloud',
  function AdtClientCloud(
    _connection: unknown,
    _logger: unknown,
    options: Options,
  ) {
    clientsBuilt.push(options);
  },
);

import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import {
  assertMatchObject,
  rejectionOf,
} from '../../../src/__tests__/helpers/assertions';
import { setSystemContext } from '../../../src/__tests__/helpers/processSystemContext';
import type { HandlerContext } from '../../../src/handlers/interfaces';
import { longToolInTheCall } from '../../../src/lib/backgroundRuns/tools';
import { createAdtClient } from '../../../src/lib/clients';
import { createAbapConnection } from '../../../src/lib/connectionFactory';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../../src/lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../src/lib/handlers/registry/CompositeHandlersRegistry';
import { logger } from '../../../src/lib/logger';
import { isLongTool } from '../../../src/lib/longTools';
import {
  defaultSystemContextResolver,
  runWithRequestContext,
  type SystemContextResolver,
} from '../../../src/lib/requestContext';
import {
  getStatedSystemContext,
  resetSystemContextCache,
} from '../../../src/lib/systemContext';
import * as systemInformation from '../../../src/lib/systemInformation';
import type { ToolResultLike } from '../../../src/lib/toolResult';

import {
  BaseHandlerGroup,
  EmbeddableMcpServer,
  HandlerExporter,
  withResolvedSystemContext,
  withRules,
} from './helpers/withRules';

/**
 * readSystemInformation replaced on the module that defines it (its callers
 * read it at call time), a fresh mock before each case and restored after
 * it (Jest's mockReset: nothing left over from an earlier case), answering
 * a cloud system's user unless a case says otherwise.
 */
function stubLookup() {
  return mock.method(
    systemInformation,
    'readSystemInformation',
    async (): Promise<{ user: string | undefined; systemId: string }> => ({
      user: 'CB_USER',
      systemId: 'CLD',
    }),
  );
}
let lookup: ReturnType<typeof stubLookup>;

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

/** The options of the last client built, of either variant. */
function lastOptions(): Options {
  return clientsBuilt.at(-1);
}

function seen() {
  const ctx = getStatedSystemContext();
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
  clientsBuilt.length = 0;
  lookup = stubLookup();
});
afterEach(() => {
  lookup.mock.restore();
});

const status = (code: number) =>
  Object.assign(new Error('placeholder'), { response: { status: code } });

describe('defaultSystemContextResolver: only what the system said, on every kind', () => {
  it('maps a cloud system to responsible and master system', async () => {
    assert.deepStrictEqual(await defaultSystemContextResolver(cloudConn()), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('asks an on-premise system too, and maps its answer', async () => {
    assert.deepStrictEqual(await defaultSystemContextResolver(onPremConn()), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    assert.equal(lookup.mock.callCount(), 1);
  });

  for (const [_kind, conn] of [
    ['cloud', cloudConn],
    ['on-premise', onPremConn],
  ] satisfies [string, () => IAbapConnection][]) {
    it(format('%s, an answer without a user: null', _kind), async () => {
      lookup.mock.mockImplementation(async () => ({
        user: undefined,
        systemId: 'SID',
      }));
      assert.equal(await defaultSystemContextResolver(conn()), null);
    });
  }

  for (const [_kind, conn, code] of [
    ['cloud', cloudConn, 404],
    ['cloud', cloudConn, 500],
    ['on-premise', onPremConn, 404],
    ['on-premise', onPremConn, 500],
  ] as const) {
    it(
      format(
        '%s, a failed request (%i): thrown as it came — the kind is not its to read',
        _kind,
        conn,
      ),
      async () => {
        const failed = status(code);
        lookup.mock.mockImplementation(async () => {
          throw failed;
        });
        assert.equal(
          await rejectionOf(defaultSystemContextResolver(conn())),
          failed,
        );
      },
    );
  }
});

describe('the recipe around the resolver, by the kind', () => {
  it('the kind recorded at build wins over a later SAP_SYSTEM_TYPE', async () => {
    const connection = onPremUserConn();
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    assert.equal(
      await withResolvedSystemContext(connection, () => 'ran'),
      'ran',
    );
  });

  it('a connection the factory did not build, no kind stated anywhere: its 404 is system_type_required', async () => {
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    assertMatchObject(
      await rejectionOf(
        withResolvedSystemContext(
          foreignConn('https://system.example.invalid'),
          () => 'ran',
        ),
      ),
      { serverRefusal: 'system_type_required' },
    );
  });

  for (const [url] of [
    ['https://system.abap.example.hana.ondemand.com'],
    ['https://system.example.invalid'],
  ]) {
    it(
      format(
        'a connection the factory did not build: its 404 read by the stated kind alone, never the URL (%s)',
        url,
      ),
      async (t) => {
        const warn = t.mock.method(logger, 'warn', () => {});
        lookup.mock.mockImplementation(async () => {
          throw status(404);
        });
        assert.equal(
          await runWithRequestContext({ login: 'BOB' }, () =>
            withResolvedSystemContext(
              foreignConn(url),
              () => 'ran',
              undefined,
              'onprem',
            ),
          ),
          'ran',
        );
        assertMatchObject(
          await rejectionOf(
            runWithRequestContext({ login: 'BOB' }, () =>
              withResolvedSystemContext(
                foreignConn(url),
                () => 'ran',
                undefined,
                'cloud',
              ),
            ),
          ),
          {
            serverRefusal: 'cloud_without_systeminformation',
          },
        );
        warn.mock.restore();
      },
    );
  }

  for (const [_kind, conn] of [
    ['cloud', cloudConn],
    ['on-premise', onPremUserConn],
  ] satisfies [string, () => IAbapConnection][]) {
    it(
      format(
        '%s, a 401 on the lookup: the credential failure as it came — no fallback, never another error',
        _kind,
      ),
      async () => {
        const refused = status(401);
        lookup.mock.mockImplementation(async () => {
          throw refused;
        });
        const fn = mock.fn();
        assert.equal(
          await rejectionOf(
            runWithRequestContext({ login: 'BOB' }, () =>
              withResolvedSystemContext(conn(), fn),
            ),
          ),
          refused,
        );
        assert.equal(fn.mock.callCount(), 0);
      },
    );
  }

  it('on-premise, a 404: asked once per connection — later calls send no systeminformation', async () => {
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    const connection = onPremUserConn();
    for (let i = 0; i < 3; i += 1) {
      assert.equal(
        await withResolvedSystemContext(connection, () => 'ran'),
        'ran',
      );
    }
    assert.equal(lookup.mock.callCount(), 1);
  });

  it('on-premise, a 404 with no user stated: system_user_unknown each call, nothing kept — asked again until the parameters are made', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    const connection = onPremConn();
    for (let i = 0; i < 2; i += 1) {
      assertMatchObject(
        await rejectionOf(withResolvedSystemContext(connection, () => 'ran')),
        { serverRefusal: 'system_user_unknown' },
      );
    }
    assert.equal(
      await runWithRequestContext({ login: 'BOB' }, () =>
        withResolvedSystemContext(connection, () => 'ran'),
      ),
      'ran',
    );
    // Made then, and kept: no further lookup.
    assert.equal(
      await withResolvedSystemContext(connection, () => 'ran'),
      'ran',
    );
    assert.equal(lookup.mock.callCount(), 3);
    warn.mock.restore();
  });

  for (const [_kind, conn, code] of [
    ['cloud', cloudConn, 'cloud_without_systeminformation'],
  ] as const) {
    it(
      format(
        '%s, a 404 is not kept: the next call asks again (%s)',
        _kind,
        conn,
      ),
      async (t) => {
        const warn = t.mock.method(logger, 'warn', () => {});
        lookup.mock.mockImplementation(async () => {
          throw status(404);
        });
        const connection = conn();
        for (let i = 0; i < 2; i += 1) {
          assertMatchObject(
            await rejectionOf(
              withResolvedSystemContext(connection, () => 'ran'),
            ),
            { serverRefusal: code },
          );
        }
        assert.equal(lookup.mock.callCount(), 2);
        warn.mock.restore();
      },
    );
  }

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

    for (const [_what, make] of nothing) {
      it(
        format(
          'on ABAP Cloud (%s): the cloud error, the stated user not used',
          _what,
        ),
        async (t) => {
          const warn = t.mock.method(logger, 'warn', () => {});
          const fn = mock.fn();
          assertMatchObject(
            await rejectionOf(
              runWithRequestContext({ login: 'BOB' }, () =>
                withResolvedSystemContext(cloudConn(), fn, make()),
              ),
            ),
            { serverRefusal: 'system_lookup_failed' },
          );
          assert.equal(fn.mock.callCount(), 0);
          warn.mock.restore();
        },
      );
    }

    for (const [_what, make] of nothing) {
      it(
        format(
          'on-premise (%s): the headers / parameters — the stated values, else system_user_unknown',
          _what,
        ),
        async (t) => {
          const warn = t.mock.method(logger, 'warn', () => {});
          assertMatchObject(
            await runWithRequestContext(
              { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
              () => withResolvedSystemContext(onPremConn(), seen, make()),
            ),
            { responsible: 'ALICE', masterSystem: 'SID' },
          );
          assertMatchObject(
            await rejectionOf(
              withResolvedSystemContext(onPremConn(), seen, make()),
            ),
            { serverRefusal: 'system_user_unknown' },
          );
          warn.mock.restore();
        },
      );
    }

    it('a custom resolver throwing a 404: the cloud error for a missing endpoint on ABAP Cloud', async (t) => {
      const warn = t.mock.method(logger, 'warn', () => {});
      const resolver: SystemContextResolver = async () => {
        throw status(404);
      };
      assertMatchObject(
        await rejectionOf(
          withResolvedSystemContext(cloudConn(), () => 'ran', resolver),
        ),
        {
          serverRefusal: 'cloud_without_systeminformation',
        },
      );
      warn.mock.restore();
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
    assert.equal(lookup.mock.callCount(), 1);
  });

  it('two different connections make two lookups', async () => {
    await withResolvedSystemContext(cloudConn(), seen);
    await withResolvedSystemContext(cloudConn(), seen);
    assert.equal(lookup.mock.callCount(), 2);
  });

  it('a rejected lookup is not cached', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    const conn = cloudConn();
    lookup.mock.mockImplementationOnce(async () => {
      throw new Error('ICM down');
    });
    assertMatchObject(
      await rejectionOf(withResolvedSystemContext(conn, seen)),
      {
        serverRefusal: 'system_lookup_failed',
      },
    );
    const second = await withResolvedSystemContext(conn, seen);
    assert.equal(lookup.mock.callCount(), 2);
    assertMatchObject(second, { responsible: 'CB_USER' });
    warn.mock.restore();
  });

  it('an injected resolver is not served from the default cache', async () => {
    const conn = cloudConn();
    await withResolvedSystemContext(conn, seen);
    const injected = mock.fn<SystemContextResolver>(async () => ({
      responsible: 'INJ',
      masterSystem: 'INJ_SYS',
    }));
    const result = await withResolvedSystemContext(conn, seen, injected);
    assert.equal(injected.mock.callCount(), 1);
    assertMatchObject(result, {
      responsible: 'INJ',
      masterSystem: 'INJ_SYS',
    });
  });
});

describe('withResolvedSystemContext', () => {
  for (const [_kind, conn] of [
    ['cloud', cloudConn],
    ['on-premise', onPremConn],
  ] satisfies [string, () => IAbapConnection][]) {
    it(
      format('%s: the system answer wins over a scope carrying both', _kind),
      async () => {
        const connection = conn();
        await runWithRequestContext(
          { responsible: 'ALICE', masterSystem: 'SID' },
          () =>
            withResolvedSystemContext(connection, () => {
              createAdtClient(connection);
            }),
        );
        assert.equal(lookup.mock.callCount(), 1);
        assertMatchObject(lastOptions(), {
          responsible: 'CB_USER',
          masterSystem: 'CLD',
        });
      },
    );
  }

  it('on-premise without the function (404): the scope as stated, the system not in it', async () => {
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const conn = onPremUserConn();
    await runWithRequestContext(
      { responsible: 'ALICE', masterSystem: 'SID' },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    assertMatchObject(lastOptions(), {
      responsible: 'ALICE',
      masterSystem: 'SID',
    });
  });

  it('on-premise without the function (404), no user stated: system_user_unknown, fn never runs; nothing is kept, so the next call asks again', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const conn = onPremConn();
    const fn = mock.fn();
    for (let i = 0; i < 2; i += 1) {
      assertMatchObject(
        await rejectionOf(
          runWithRequestContext({ masterSystem: 'SID' }, () =>
            withResolvedSystemContext(conn, fn),
          ),
        ),
        { serverRefusal: 'system_user_unknown' },
      );
    }
    assert.equal(fn.mock.callCount(), 0);
    assert.equal(lookup.mock.callCount(), 2);
    warn.mock.restore();
  });

  for (const [_case, scope] of [
    ['(a) responsible only', { responsible: 'ALICE' }],
    ['(b) login only', { login: 'BOB' }],
    ['(c) both', { responsible: 'ALICE', login: 'BOB' }],
  ] satisfies ReadonlyArray<
    [string, { responsible?: string; login?: string }]
  >) {
    it(
      format(
        'on-premise without the function (404), %s: fn runs, taking the responsible if stated, else the login',
        _case,
      ),
      async () => {
        lookup.mock.mockImplementation(async () => {
          throw Object.assign(new Error('placeholder'), {
            response: { status: 404 },
          });
        });
        const seen: Array<string | undefined> = [];
        assert.equal(
          await runWithRequestContext(scope, () =>
            withResolvedSystemContext(onPremConn(), () => {
              seen.push(getStatedSystemContext().responsible);
              return 'ran';
            }),
          ),
          'ran',
        );
        assert.deepStrictEqual(seen, [scope.responsible ?? scope.login]);
      },
    );
  }

  it('on-premise without the function (404), neither a responsible nor a login: system_user_unknown', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const fn = mock.fn();
    assertMatchObject(
      await rejectionOf(
        runWithRequestContext({ masterSystem: 'SID' }, () =>
          withResolvedSystemContext(onPremConn(), fn),
        ),
      ),
      { serverRefusal: 'system_user_unknown' },
    );
    assert.equal(fn.mock.callCount(), 0);
    warn.mock.restore();
  });

  for (const [_case, login] of [
    ['blank', '   '],
    ['empty', ''],
  ]) {
    it(
      format(
        'on-premise without the function (404), a %s login: system_user_unknown',
        _case,
      ),
      async (t) => {
        const warn = t.mock.method(logger, 'warn', () => {});
        lookup.mock.mockImplementation(async () => {
          throw Object.assign(new Error('placeholder'), {
            response: { status: 404 },
          });
        });
        const fn = mock.fn();
        assertMatchObject(
          await rejectionOf(
            runWithRequestContext({ login }, () =>
              withResolvedSystemContext(onPremConn(), fn),
            ),
          ),
          { serverRefusal: 'system_user_unknown' },
        );
        assert.equal(fn.mock.callCount(), 0);
        warn.mock.restore();
      },
    );
  }

  it("on-premise without the function (404), the request's login states the user: fn runs", async () => {
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const fn = mock.fn(async () => 'ran');
    assert.equal(
      await runWithRequestContext({ login: 'HEADER_USER' }, () =>
        withResolvedSystemContext(onPremConn(), fn),
      ),
      'ran',
    );
    assert.equal(fn.mock.callCount(), 1);
  });

  for (const [_kind, conn, status, code] of [
    ['cloud', cloudConn, 404, 'cloud_without_systeminformation'],
    ['cloud', cloudConn, 500, 'system_lookup_failed'],
  ] as const) {
    it(
      format(
        '%s, a lookup answered %d: the call fails as %s, fn never runs, and the next call asks again',
        _kind,
        conn,
        status,
      ),
      async (t) => {
        const warn = t.mock.method(logger, 'warn', () => {});
        lookup.mock.mockImplementation(async () => {
          throw Object.assign(new Error('placeholder'), {
            response: { status },
          });
        });
        const connection = conn();
        const fn = mock.fn(seen);
        for (let i = 0; i < 2; i++) {
          assertMatchObject(
            await rejectionOf(
              runWithRequestContext(
                { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
                () => withResolvedSystemContext(connection, fn),
              ),
            ),
            { serverRefusal: code },
          );
        }
        assert.equal(fn.mock.callCount(), 0);
        assert.equal(lookup.mock.callCount(), 2);
        warn.mock.restore();
      },
    );
  }

  it('cloud, a 2xx that names no user: the call fails as system_lookup_failed, fn never runs, and the next call asks again', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    lookup.mock.mockImplementation(async () => ({
      user: undefined,
      systemId: 'CLD',
    }));
    const connection = cloudConn();
    const fn = mock.fn(seen);
    for (let i = 0; i < 2; i++) {
      assertMatchObject(
        await rejectionOf(
          runWithRequestContext({ login: 'BOB' }, () =>
            withResolvedSystemContext(connection, fn),
          ),
        ),
        { serverRefusal: 'system_lookup_failed' },
      );
    }
    assert.equal(fn.mock.callCount(), 0);
    assert.equal(lookup.mock.callCount(), 2);
    lookup.mock.mockImplementation(async () => ({
      user: 'CB_USER',
      systemId: 'CLD',
    }));
    assertMatchObject(await withResolvedSystemContext(connection, fn), {
      responsible: 'CB_USER',
    });
    warn.mock.restore();
  });

  const onPremNoInformation = [
    [
      'no systeminformation (404)',
      () =>
        lookup.mock.mockImplementation(async () => {
          throw Object.assign(new Error('placeholder'), {
            response: { status: 404 },
          });
        }),
      1,
    ],
    [
      'an answer without a user',
      () =>
        lookup.mock.mockImplementation(async () => ({
          user: undefined,
          systemId: 'OPS',
        })),
      1,
    ],
    [
      'an error (500)',
      () =>
        lookup.mock.mockImplementation(async () => {
          throw Object.assign(new Error('placeholder'), {
            response: { status: 500 },
          });
        }),
      1,
    ],
  ] as const;

  for (const [_case, answer, lookups] of onPremNoInformation) {
    it(
      format(
        'on-premise, %s: the stated values are taken, fn runs; the parameters made are kept, asked once',
        _case,
      ),
      async () => {
        answer();
        const connection = onPremConn();
        for (let i = 0; i < 2; i++) {
          assertMatchObject(
            await runWithRequestContext(
              { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
              () => withResolvedSystemContext(connection, seen),
            ),
            { responsible: 'ALICE', masterSystem: 'SID' },
          );
        }
        assert.equal(lookup.mock.callCount(), lookups);
      },
    );
  }

  for (const [_case, answer] of onPremNoInformation) {
    it(
      format(
        'on-premise, %s, no user stated: system_user_unknown, fn never runs',
        _case,
      ),
      async (t) => {
        const warn = t.mock.method(logger, 'warn', () => {});
        answer();
        const fn = mock.fn(seen);
        assertMatchObject(
          await rejectionOf(
            runWithRequestContext({ masterSystem: 'SID' }, () =>
              withResolvedSystemContext(onPremConn(), fn),
            ),
          ),
          { serverRefusal: 'system_user_unknown' },
        );
        assert.equal(fn.mock.callCount(), 0);
        warn.mock.restore();
      },
    );
  }

  it('an injected resolver answering without a user: no information — the stated values with a stated user, else system_user_unknown', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    const injected: SystemContextResolver = mock.fn(async () => ({
      masterSystem: 'INJ_SYS',
    }));
    assertMatchObject(
      await runWithRequestContext(
        { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
        () => withResolvedSystemContext(onPremConn(), seen, injected),
      ),
      { responsible: 'ALICE', masterSystem: 'SID' },
    );
    const fn = mock.fn(seen);
    assertMatchObject(
      await rejectionOf(withResolvedSystemContext(onPremConn(), fn, injected)),
      { serverRefusal: 'system_user_unknown' },
    );
    assert.equal(fn.mock.callCount(), 0);
    warn.mock.restore();
  });

  it('on-premise, the information present: it wins over the stated values', async () => {
    const result = await runWithRequestContext(
      { responsible: 'ALICE', masterSystem: 'SID', login: 'BOB' },
      () => withResolvedSystemContext(onPremUserConn(), seen),
    );
    assertMatchObject(result, {
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
    assertMatchObject(lastOptions(), {
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
    assertMatchObject(lastOptions(), {
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
    assert.equal(lookup.mock.callCount(), 1);
    assertMatchObject(lastOptions(), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying both keys as undefined does not inherit the process values', async () => {
    // Key presence still decides against the process cache: what stops one
    // user's process-wide value reaching another user's scope.
    setSystemContext({ responsible: 'PROC_USER', masterSystem: 'PROC_SYS' });
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const result = await runWithRequestContext(
      { responsible: undefined, masterSystem: undefined },
      () => withResolvedSystemContext(onPremUserConn(), seen),
    );
    // The connection's login (the rules' second step), never PROC_USER.
    assert.equal(result.responsible, 'STATED');
    assert.equal(result.masterSystem, undefined);
  });

  it('with no scope and an empty process context, fills and keeps the process language', async () => {
    setSystemContext({ masterLanguage: 'EN' });
    const conn = cloudConn();
    await withResolvedSystemContext(conn, () => {
      createAdtClient(conn);
    });
    assert.deepStrictEqual(lastOptions(), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      masterLanguage: 'EN',
    });
  });

  it("keeps an outer scope's masterLanguage", async () => {
    const result = await runWithRequestContext({ masterLanguage: 'DE' }, () =>
      withResolvedSystemContext(cloudConn(), seen),
    );
    assert.deepStrictEqual(result, {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      masterLanguage: 'DE',
    });
  });

  it('a null resolver makes no lookup', async () => {
    const result = await withResolvedSystemContext(cloudConn(), seen, null);
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(result.responsible, undefined);
  });

  it('a throwing lookup logs a warning in fixed words, and fn does not run', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    lookup.mock.mockImplementation(async () => {
      throw new Error('ICM down');
    });
    const fn = mock.fn(seen);
    const refused = await withResolvedSystemContext(cloudConn(), fn).catch(
      (error: unknown) => error,
    );
    assertMatchObject(refused, { serverRefusal: 'system_lookup_failed' });
    assert.ok(!String((refused as Error).message).includes('ICM down'));
    assert.equal(fn.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 1);
    // Fixed words: a lookup's message may quote what the system answered.
    assert.ok(!String(warn.mock.calls[0]?.arguments[0]).includes('ICM down'));
    warn.mock.restore();
  });
});

/** A handler's answer that reports what it saw beside its (empty) content. */
function reported<F extends object>(facts: F): ToolResultLike & F {
  return { content: [], ...facts };
}

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
          toolDefinition: {
            name: 'WithContext',
            description: 'd',
            inputSchema: z.object({}),
          },
          call: async (_context: HandlerContext, _args: unknown) =>
            reported(seen()),
        },
        {
          toolDefinition: {
            name: 'Closure',
            description: 'd',
            inputSchema: z.object({}),
          },
          call: async (context: HandlerContext, _args: unknown) =>
            reported({ ...seen(), connection: context.connection }),
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
  // States no kind: the connections here record their own, and a stated
  // kind contradicting one is refused (D26 E11).
  const exporter = new HandlerExporter({ ...options });
  (exporter as unknown as { handlerGroups: IHandlerGroup[] }).handlerGroups =
    groups;
  return exporter;
}

describe('HandlerExporter.getHandlerEntries', () => {
  it("hands out every entry with its group's definition, a listed long tool's without background", () => {
    const exporter = new HandlerExporter({ systemType: 'onprem' });
    const raw = (
      exporter as unknown as { handlerGroups: IHandlerGroup[] }
    ).handlerGroups.flatMap((g) => g.getHandlers());
    const wrapped = exporter.getHandlerEntries();
    assert.deepStrictEqual(
      wrapped.map((e) => e.toolDefinition),
      raw.map((e) =>
        isLongTool(e.toolDefinition.name)
          ? longToolInTheCall(e.toolDefinition)
          : e.toolDefinition,
      ),
    );
  });

  it('a handler runs with values filled from its connection', async () => {
    const exporter = exporterWith([fakeGroup(null)]);
    const entry = exporter.getHandlerEntries()[0];
    assertMatchObject(await entry.call({ connection: cloudConn() }, {}), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it("a handler reading its context's connection gets the call's", async () => {
    const group = fakeGroup(null);
    const entry = exporterWith([group]).getHandlerEntries()[1];
    const conn = cloudConn();
    const result = await entry.call({ connection: conn }, {});
    assertMatchObject(result, {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      connection: conn,
    });
  });

  for (const [_name, index] of [
    ['WithContext', 0],
    ['Closure', 1],
  ] satisfies [string, number][]) {
    describe(format('the %s handler', _name), () => {
      /** Calls the entry on `connection` as an embedder does, recording whether it ran. */
      function callOn(connection: IAbapConnection) {
        const group = fakeGroup(connection);
        const ran = mock.fn();
        const original = group.getHandlers;
        group.getHandlers = () =>
          original().map(
            (e): HandlerEntry => ({
              ...e,
              call: async (c, a) => {
                ran();
                return e.call(c, a);
              },
            }),
          );
        const entry = exporterWith([group]).getHandlerEntries()[index];
        const call = () => entry.call({ connection }, {});
        return { call, ran };
      }

      for (const [_case, conn, answer, code] of [
        [
          'a cloud 2xx that names no user',
          cloudConn,
          () =>
            lookup.mock.mockImplementation(async () => ({
              user: '',
              systemId: 'CLD',
            })),
          'system_lookup_failed',
        ],
        [
          'a cloud 500',
          cloudConn,
          () =>
            lookup.mock.mockImplementation(async () => {
              throw Object.assign(new Error('placeholder'), {
                response: { status: 500 },
              });
            }),
          'system_lookup_failed',
        ],
        [
          'an on-premise 500 with no user stated',
          onPremConn,
          () =>
            lookup.mock.mockImplementation(async () => {
              throw Object.assign(new Error('placeholder'), {
                response: { status: 500 },
              });
            }),
          'system_user_unknown',
        ],
        [
          'an on-premise 2xx without a user, no user stated',
          onPremConn,
          () =>
            lookup.mock.mockImplementation(async () => ({
              user: '',
              systemId: 'OPS',
            })),
          'system_user_unknown',
        ],
        [
          'an on-premise 404 with no user stated',
          onPremConn,
          () =>
            lookup.mock.mockImplementation(async () => {
              throw Object.assign(new Error('placeholder'), {
                response: { status: 404 },
              });
            }),
          'system_user_unknown',
        ],
        [
          'a cloud 404',
          cloudConn,
          () =>
            lookup.mock.mockImplementation(async () => {
              throw Object.assign(new Error('placeholder'), {
                response: { status: 404 },
              });
            }),
          'cloud_without_systeminformation',
        ],
      ] satisfies [string, () => IAbapConnection, () => void, string][]) {
        it(
          format(
            '%s: the call fails with the server refusal, no handler runs; nothing is kept, the next call asks again',
            _case,
          ),
          async (t) => {
            const warn = t.mock.method(logger, 'warn', () => {});
            answer();
            const { call, ran } = callOn(conn());
            assertMatchObject(await rejectionOf(call()), {
              serverRefusal: code,
            });
            assertMatchObject(await rejectionOf(call()), {
              serverRefusal: code,
            });
            assert.equal(ran.mock.callCount(), 0);
            assert.equal(lookup.mock.callCount(), 2);
            warn.mock.restore();
          },
        );
      }

      for (const status of [404, 500]) {
        it(
          format(
            'an on-premise %i: the handler runs with the configured settings',
            status,
          ),
          async () => {
            lookup.mock.mockImplementation(async () => {
              throw Object.assign(new Error('placeholder'), {
                response: { status },
              });
            });
            const { call, ran } = callOn(onPremUserConn());
            const result = await runWithRequestContext(
              { responsible: 'ALICE', masterSystem: 'SID' },
              call,
            );
            assert.equal(ran.mock.callCount(), 1);
            assertMatchObject(result, {
              responsible: 'ALICE',
              masterSystem: 'SID',
            });
          },
        );
      }
    });
  }

  it('systemContextResolver: null disables resolution', async () => {
    const exporter = exporterWith([fakeGroup(null)], {
      systemContextResolver: null,
    });
    const result = await exporter
      .getHandlerEntries()[0]
      .call({ connection: cloudConn() }, {});
    assert.equal(lookup.mock.callCount(), 0);
    assertMatchObject(result, { responsible: undefined });
  });
});

class ReportingGroup extends BaseHandlerGroup {
  protected groupName = 'reporting';
  observed: ReturnType<typeof seen> | undefined;
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: { name: 'Report', description: 'd' } as never,
        call: async () => {
          this.observed = seen();
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
    ];
  }
}

describe('BaseHandlerGroup.registerToolOnServer', () => {
  it('fills values from the group context connection', async () => {
    const group = new ReportingGroup(withRules({ connection: cloudConn() }));
    let callback: ((args: unknown) => Promise<unknown>) | undefined;
    const server = {
      registerTool: (_n: string, _c: unknown, cb: typeof callback) => {
        callback = cb;
      },
    } as unknown as McpServer;
    group.registerHandlers(server);
    await callback?.({});
    assertMatchObject(group.observed, {
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
        inner.getHandlers().map(
          (e): HandlerEntry => ({
            ...e,
            call: async (c, a) => ({
              content: [
                { type: 'text', text: JSON.stringify(await e.call(c, a)) },
              ],
            }),
          }),
        ),
    };
  }

  it('fills values for both handlers', async () => {
    const server = new EmbeddableMcpServer({
      connection: cloudConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
    });
    assertMatchObject(textOf(await callTool(server, 'WithContext')), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    assertMatchObject(textOf(await callTool(server, 'Closure')), {
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    assert.equal(lookup.mock.callCount(), 1);
  });

  for (const [systemType, expected] of [
    ['cloud', { responsible: 'CB_USER', masterSystem: 'CLD' }],
    ['onprem', { responsible: 'CB_USER', masterSystem: 'CLD' }],
  ] as const) {
    it(
      format(
        "an injected connection, the server's systemType %s: the system's answer",
        systemType,
      ),
      async () => {
        const server = new EmbeddableMcpServer({
          connection: foreignConn(
            'https://system.abap.example.hana.ondemand.com',
          ) as never,
          handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
          systemType,
        });
        const result = textOf(await callTool(server, 'WithContext'));
        assert.equal(lookup.mock.callCount(), 1);
        assertMatchObject(result, expected);
      },
    );
  }

  it("an injected connection answered 404: the server's systemType states the kind, SAP_SYSTEM_TYPE unset", async (t) => {
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const warn = t.mock.method(logger, 'warn', () => {});
    const onprem = new EmbeddableMcpServer({
      connection: foreignConn(
        'https://system.abap.example.hana.ondemand.com',
      ) as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'onprem',
    });
    const answered = textOf(await callTool(onprem, 'WithContext'));
    assert.equal(answered.responsible, undefined);
    assert.equal(answered.masterSystem, undefined);
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
    assert.equal(refused.isError, true);
    assert.ok(refused.content[0].text.includes('systeminformation'));
    warn.mock.restore();
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
      assertMatchObject(textOf(await callTool(server, 'WithContext')), {
        responsible: 'CB_USER',
        masterSystem: 'CLD',
      });
    }
    assert.equal(lookup.mock.callCount(), 1);
  });

  it("a factory-built connection of another kind than the server's: system_type_conflict, nothing looked up, the tool not run", async () => {
    const server = new EmbeddableMcpServer({
      connection: onPremUserConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
    });
    // One kind per server (the owner, 2026-11-17): the connection was built
    // for on-premise, the server states cloud.
    const result = (await callTool(server, 'WithContext')) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    assert.equal(result.isError, true);
    assert.ok(result.content[0]?.text.includes('system_type_conflict'));
    assert.equal(lookup.mock.callCount(), 0);
  });

  it('an injected on-premise connection, a 404, no user stated: system_user_unknown, the tool does not run; nothing is kept, the next call asks again', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
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
      assert.equal(result.isError, true);
      assert.ok(result.content[0]?.text.includes('system_user_unknown'));
    }
    assert.equal(group.observed, undefined);
    assert.equal(lookup.mock.callCount(), 2);
    warn.mock.restore();
  });

  for (const [_what, resolver] of [
    ['null', async () => null],
    [
      'a throw',
      async () => {
        throw new Error('custom lookup failed');
      },
    ],
  ] as Array<[string, SystemContextResolver]>) {
    it(
      format(
        "a custom resolver answering nothing (%s): on ABAP Cloud the cloud error, on-premise the stated values — the server's recipe, by the kind",
        _what,
      ),
      async (t) => {
        const warn = t.mock.method(logger, 'warn', () => {});
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
        assert.equal(refused.isError, true);
        assert.ok(refused.content[0]?.text.includes('system_lookup_failed'));
        assert.equal(cloudGroup.observed, undefined);

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
        assertMatchObject(onPremGroup.observed, {
          responsible: 'ALICE',
          masterSystem: 'SID',
        });
        warn.mock.restore();
      },
    );
  }

  it('systemContextResolver: null disables resolution', async () => {
    const server = new EmbeddableMcpServer({
      connection: cloudConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
      systemContextResolver: null,
    });
    const result = textOf(await callTool(server, 'WithContext'));
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(result.responsible, undefined);
  });
});

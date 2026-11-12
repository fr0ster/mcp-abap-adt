/**
 * A background run's caller is `{ system, client, user }` (24.0.0). An
 * injected connection that answers a URL is the system `["http", <URL>, ""]`;
 * one that answers none (RFC) is the `system` its embedder states
 * (`EmbeddableMcpServerOptions.system`), and with neither background runs are
 * refused in fixed words naming `system`. A run on a fresh connection keeps
 * the identity computed from the injected one, and two systems with the same
 * client and user never share a run in one store.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { adtSystemKey } from '../../../lib/adtHeaders/systemKey';
import { BACKGROUND_RUNS_NO_SYSTEM_WORDS } from '../../../lib/auth/serverRefusal';
import type { IBackgroundRuns } from '../../../lib/backgroundRuns/contract';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import {
  callerOn,
  clientOf,
  isClassRun,
  shippedGroups,
  silent,
  until,
} from './harness';

beforeEach(() => {
  stateSystemKind();
});

afterEach(() => {
  resetProcessLatchForTests();
});

const RUN = { class_name: 'PLACEHOLDER_CLASS', background: true };
const USER = 'EMBEDDED_USER';

/** A connection to the stand-in whose `getBaseUrl()` answers `baseUrl`. */
async function connectionAnswering(
  standIn: AdtStandIn,
  baseUrl: string | undefined,
): Promise<{ connection: IAbapConnection; end: () => Promise<void> }> {
  const built = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    new BasicAuthProvider(USER, 'embedded-password'),
  );
  await built.connect();
  const connection = new Proxy(built, {
    get: (target, property) => {
      if (property === 'getBaseUrl') return async () => baseUrl;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    connection,
    end: async () => {
      await built.disconnect().catch(() => undefined);
    },
  };
}

interface Stand {
  call: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ isError: boolean; payload: Record<string, unknown> }>;
  close: () => Promise<void>;
}

async function embedder(
  standIn: AdtStandIn,
  strategy: IBackgroundRuns,
  injectedUrl: string | undefined,
  options: { system?: string; freshUrl?: string | undefined } = {},
): Promise<Stand> {
  const injected = await connectionAnswering(standIn, injectedUrl);
  const ends: Array<() => Promise<void>> = [injected.end];
  const server = new EmbeddableMcpServer({
    connection: injected.connection,
    freshConnection: async () => {
      const fresh = await connectionAnswering(
        standIn,
        'freshUrl' in options ? options.freshUrl : injectedUrl,
      );
      ends.push(fresh.end);
      return fresh.connection;
    },
    ...(options.system !== undefined && { system: options.system }),
    handlersRegistry: shippedGroups(),
    systemType: 'cloud',
    logger: silent,
    backgroundRuns: strategy,
    systemContextResolver: defaultSystemContextResolver,
  });
  const client = await clientOf(server);
  return {
    call: client.call,
    close: async () => {
      await client.close();
      for (const end of ends) await end();
    },
  };
}

async function standIn(): Promise<AdtStandIn> {
  const stand = await adtStandIn();
  stand.body(
    (r) => r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
    JSON.stringify({ systemID: 'SID', userName: 'embedded_user' }),
  );
  stand.body(isClassRun, 'run output');
  return stand;
}

const callerOf = (system: string) => ({ system, client: '', user: USER });

describe('the background-run caller is { system, client, user }', () => {
  it('an injected connection answering a URL: the system is ["http", <URL>, ""]', async () => {
    const stand = await standIn();
    const strategy = new InMemoryBackgroundRuns();
    const server = await embedder(stand, strategy, stand.url);
    try {
      const started = await server.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      expect(
        strategy.list(callerOf(JSON.stringify(['http', stand.url, '']))),
      ).toHaveLength(1);
    } finally {
      await server.close();
      await stand.close();
    }
  });

  it('an injected connection answering no URL takes the system its embedder states', async () => {
    const stand = await standIn();
    const strategy = new InMemoryBackgroundRuns();
    const server = await embedder(stand, strategy, undefined, {
      system: 'SYSTEM_A',
    });
    try {
      const started = await server.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      expect(strategy.list(callerOf('SYSTEM_A'))).toHaveLength(1);
    } finally {
      await server.close();
      await stand.close();
    }
  });

  it('no URL and no stated system: background runs are refused, naming system', async () => {
    const stand = await standIn();
    const strategy = new InMemoryBackgroundRuns();
    const server = await embedder(stand, strategy, undefined);
    try {
      const started = await server.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(true);
      expect(started.payload.error).toBe('background_runs_unavailable');
      expect(JSON.stringify(started.payload)).toContain(
        BACKGROUND_RUNS_NO_SYSTEM_WORDS,
      );
      expect(BACKGROUND_RUNS_NO_SYSTEM_WORDS).toContain('`system`');
      expect(strategy.list(callerOf(''))).toEqual([]);
    } finally {
      await server.close();
      await stand.close();
    }
  });

  it("a run on a fresh connection keeps the injected connection's identity", async () => {
    const stand = await standIn();
    const strategy = new InMemoryBackgroundRuns();
    const server = await embedder(stand, strategy, undefined, {
      system: 'SYSTEM_A',
      freshUrl: 'https://fresh.example.test',
    });
    try {
      const started = await server.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      const handle = started.payload.run_handle;
      await until(
        () => strategy.list(callerOf('SYSTEM_A'))[0]?.state === 'finished',
      );
      expect(strategy.list(callerOf('SYSTEM_A'))).toHaveLength(1);
      expect(
        strategy.list(
          callerOf(JSON.stringify(['http', 'https://fresh.example.test', ''])),
        ),
      ).toEqual([]);
      const read = await server.call('GetBackgroundRun', {
        run_handle: handle,
      });
      expect(read.isError).toBe(false);
    } finally {
      await server.close();
      await stand.close();
    }
  });

  it('two systems with the same client and user never share a run in one store', async () => {
    const stand = await standIn();
    const strategy = new InMemoryBackgroundRuns();
    const a = await embedder(stand, strategy, undefined, {
      system: 'SYSTEM_A',
    });
    const b = await embedder(stand, strategy, undefined, {
      system: 'SYSTEM_B',
    });
    try {
      const started = await a.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      expect(strategy.list(callerOf('SYSTEM_A'))).toHaveLength(1);
      expect(strategy.list(callerOf('SYSTEM_B'))).toEqual([]);
      const read = await b.call('GetBackgroundRun', {
        run_handle: started.payload.run_handle,
      });
      expect(read.isError).toBe(true);
      expect(read.payload.error).toBe('background_run_not_available');
    } finally {
      await a.close();
      await b.close();
      await stand.close();
    }
  });

  it("a destination's system is its system key", async () => {
    // The system names the session's user itself (callerOn's answer).
    const stand = await adtStandIn();
    stand.body(isClassRun, 'run output');
    const strategy = new InMemoryBackgroundRuns();
    const caller = await callerOn(stand, strategy, { user: 'RUN_USER' });
    try {
      const started = await caller.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      const system = adtSystemKey({
        url: stand.url,
        client: '100',
        authType: 'basic',
      });
      expect(
        strategy.list({ system, client: '100', user: 'RUN_USER' }),
      ).toHaveLength(1);
    } finally {
      await caller.close();
      await stand.close();
    }
  });

  it('system information goes over a connection that answers no URL', async () => {
    const stand = await standIn();
    const strategy = new InMemoryBackgroundRuns();
    const server = await embedder(stand, strategy, undefined, {
      system: 'SYSTEM_A',
    });
    try {
      const started = await server.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      // The caller's user came from the system's own answer (ABAP Cloud).
      expect(
        stand.requests.some((r) =>
          r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
        ),
      ).toBe(true);
      expect(strategy.list(callerOf('SYSTEM_A'))).toHaveLength(1);
    } finally {
      await server.close();
      await stand.close();
    }
  });
});

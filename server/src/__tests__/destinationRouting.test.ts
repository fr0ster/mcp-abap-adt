/**
 * How the HTTP and SSE transports reach a destination: through
 * `IDestinations` alone (`settingsFor`, the counted `getProvider`), with a
 * failure answered in the error's own words, and `x-mcp-destination`
 * honoured only when allowed and only when it is a name, not a path.
 */

import type { Server } from 'node:http';
import { inspect } from 'node:util';

// The connector, without a wire: connect() presents the credential it was
// built with, which is what a first login is.
jest.mock('../../../src/lib/connectionFactory', () => ({
  createAbapConnection: (_settings: unknown, credential: any) => ({
    connect: async () => {
      const prepared = await credential.prepare();
      if (!prepared.ok) throw new Error('refused');
      await credential.establish({});
    },
  }),
}));

import type { AddressInfo } from 'node:net';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import {
  DestinationConfigError,
  type IDestinations,
  UnsupportedAuthenticationError,
} from '@mcp-abap-adt/lib/auth';
import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import express from 'express';
import { SseServer } from '../SseServer.js';
import { inspectionOnlyDestinations } from '../StdioServer.js';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

const emptyRegistry = new CompositeHandlersRegistry([]);

/** A value read from a file: it must reach neither an answer nor a log line (H4). */
const LEAKED = 'PLACEHOLDERSECRET';

/** Everything the transports wrote to console.error, objects inspected whole. */
const logged = (spy: jest.SpyInstance) =>
  spy.mock.calls
    .map((args: unknown[]) =>
      args.map((a) => (typeof a === 'string' ? a : inspect(a))).join(' '),
    )
    .join('\n');

const PATH_LIKE = ['../../etc/x', 'a/b', '.hidden', ''];

function fakeProvider(): IAuthProvider {
  return {
    kind: 'test',
    prepare: async () => ({ ok: true }),
    establish: async () => ({ ok: true }),
    authorize: async () => ({ ok: true }),
    rejected: async () => ({ ok: true }),
  };
}

/**
 * `good` and `other` are served; `unsupported` is a well-formed
 * authentication no handler serves; `misconfigured` lacks a field.
 * Nothing but the two methods of IDestinations.
 */
function stubDestinations() {
  const provider = fakeProvider();
  return {
    provider,
    settingsFor: jest.fn(async (destination: string) => {
      if (destination === 'unsupported') {
        throw new UnsupportedAuthenticationError(
          'unsupported',
          'saml',
          'saml2_bearer',
        );
      }
      if (destination === 'leaky') {
        // A store's parse error: V8 quotes the source text it choked on.
        throw new SyntaxError(
          `Invalid JSON in file "leaky.json": Unexpected token 'P', ..."ntsecret":${LEAKED}"... is not valid JSON`,
        );
      }
      if (destination === 'misconfigured') {
        throw new DestinationConfigError(
          'misconfigured',
          ['grantType'],
          'the destination states no grant',
        );
      }
      return {
        url: 'https://system.example.invalid',
        authType: 'jwt' as const,
      };
    }),
    getProvider: jest.fn(async (_destination: string) => provider),
  } satisfies IDestinations & { provider: IAuthProvider };
}

async function listen(
  register: (app: IHttpApplication) => void,
): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  register(app as unknown as IHttpApplication);
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      resolve({ server: srv, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'routing-test', version: '1.0.0' },
  },
};

let savedMaster: string | undefined;
let errorSpy: jest.SpyInstance;

beforeAll(() => {
  // The master-system lookup reads it instead of asking the system.
  savedMaster = process.env.SAP_MASTER_SYSTEM;
  process.env.SAP_MASTER_SYSTEM = 'master-placeholder';
});
afterAll(() => {
  if (savedMaster === undefined) delete process.env.SAP_MASTER_SYSTEM;
  else process.env.SAP_MASTER_SYSTEM = savedMaster;
});
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  // An SSE session logs its close after the socket goes; let it.
  await new Promise((resolve) => setTimeout(resolve, 20));
  errorSpy.mockRestore();
});

describe('StreamableHttpServer: destinations', () => {
  let server: Server;
  let baseUrl: string;
  let destinations: ReturnType<typeof stubDestinations>;

  async function start(opts: {
    allowDestinationHeader?: boolean;
    defaultDestination?: string;
  }) {
    destinations = stubDestinations();
    const mcp = new StreamableHttpServer(emptyRegistry, destinations, opts);
    ({ server, baseUrl } = await listen((app) => mcp.registerRoutes(app)));
  }

  afterEach(() => close(server));

  function post(headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(INITIALIZE),
    });
  }

  it('an unsupported destination fails in its words; the next, supported, succeeds', async () => {
    await start({ allowDestinationHeader: true });

    const refused = await post({ 'x-mcp-destination': 'unsupported' });
    const text = await refused.text();
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(text).toContain('unsupported');
    expect(text).toContain('saml / saml2_bearer');
    expect(text).not.toContain('Internal Server Error');

    const served = await post({ 'x-mcp-destination': 'good' });
    expect(served.status).toBe(200);
    expect(destinations.getProvider).toHaveBeenCalledWith('good');
  });

  it('a DestinationConfigError is answered with its fields', async () => {
    await start({ defaultDestination: 'misconfigured' });

    const refused = await post();
    const text = await refused.text();
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(text).toContain('misconfigured');
    expect(text).toContain('grantType');
    expect(text).not.toContain('Auth broker not initialized');
    expect(text).not.toContain('Internal Server Error');
  });

  it('an error the server has no words for: answered generically, logged by class only', async () => {
    await start({ defaultDestination: 'leaky' });
    const refused = await post();
    const text = await refused.text();
    expect(refused.status).toBe(500);
    expect(text).toBe('Internal Server Error');
    expect(logged(errorSpy)).toContain('SyntaxError');
    expect(logged(errorSpy)).not.toContain(LEAKED);
    expect(logged(errorSpy)).not.toContain('ntsecret');
  });

  it('the default destination is served through settingsFor and getProvider', async () => {
    await start({ defaultDestination: 'good' });
    const served = await post();
    expect(served.status).toBe(200);
    expect(destinations.settingsFor).toHaveBeenCalledWith('good');
    expect(destinations.getProvider).toHaveBeenCalledWith('good');
  });

  it('x-mcp-destination is ignored without allowDestinationHeader', async () => {
    await start({ defaultDestination: 'good' });
    const served = await post({ 'x-mcp-destination': 'other' });
    expect(served.status).toBe(200);
    expect(destinations.settingsFor).not.toHaveBeenCalledWith('other');
    expect(destinations.getProvider).not.toHaveBeenCalledWith('other');
    expect(destinations.getProvider).toHaveBeenCalledWith('good');
  });

  it.each(PATH_LIKE)(
    'a path-like x-mcp-destination %p is refused naming the header, before any lookup',
    async (value) => {
      await start({ allowDestinationHeader: true, defaultDestination: 'good' });
      const refused = await post({ 'x-mcp-destination': value });
      const text = await refused.text();
      expect(refused.status).toBe(400);
      expect(text).toContain('x-mcp-destination');
      if (value) expect(text).not.toContain(value);
      expect(destinations.settingsFor).not.toHaveBeenCalled();
      expect(destinations.getProvider).not.toHaveBeenCalled();
    },
  );
});

describe('SseServer: destinations, per session', () => {
  let server: Server;
  let baseUrl: string;
  let destinations: ReturnType<typeof stubDestinations>;
  const open: AbortController[] = [];

  async function start(opts: {
    allowDestinationHeader?: boolean;
    defaultDestination?: string;
  }) {
    destinations = stubDestinations();
    const sse = new SseServer(emptyRegistry, destinations, opts);
    ({ server, baseUrl } = await listen((app) => sse.registerRoutes(app)));
  }

  afterEach(async () => {
    for (const controller of open.splice(0)) controller.abort();
    await close(server);
  });

  function get(headers: Record<string, string> = {}) {
    const controller = new AbortController();
    open.push(controller);
    return fetch(`${baseUrl}/sse`, { headers, signal: controller.signal });
  }

  it('an unsupported destination fails in its words; the next session, supported, opens', async () => {
    await start({ allowDestinationHeader: true });

    const refused = await get({ 'x-mcp-destination': 'unsupported' });
    const text = await refused.text();
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(text).toContain('unsupported');
    expect(text).toContain('saml / saml2_bearer');

    const served = await get({ 'x-mcp-destination': 'good' });
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('text/event-stream');
    expect(destinations.getProvider).toHaveBeenCalledWith('good');
  });

  it('an error the server has no words for: answered generically, logged by class only', async () => {
    await start({ defaultDestination: 'leaky' });
    const refused = await get();
    const text = await refused.text();
    expect(refused.status).toBe(500);
    expect(text).toBe('Internal Server Error');
    expect(logged(errorSpy)).toContain('SyntaxError');
    expect(logged(errorSpy)).not.toContain(LEAKED);
    expect(logged(errorSpy)).not.toContain('ntsecret');
  });

  it('a DestinationConfigError is answered with its fields', async () => {
    await start({ defaultDestination: 'misconfigured' });
    const refused = await get();
    const text = await refused.text();
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(text).toContain('misconfigured');
    expect(text).toContain('grantType');
    expect(text).not.toContain('Auth broker not initialized');
  });

  it('x-mcp-destination is ignored without allowDestinationHeader', async () => {
    await start({ defaultDestination: 'good' });
    const served = await get({ 'x-mcp-destination': 'other' });
    expect(served.status).toBe(200);
    expect(destinations.getProvider).not.toHaveBeenCalledWith('other');
    expect(destinations.getProvider).toHaveBeenCalledWith('good');
  });

  it.each(PATH_LIKE)(
    'a path-like x-mcp-destination %p is refused naming the header, before any lookup',
    async (value) => {
      await start({ allowDestinationHeader: true, defaultDestination: 'good' });
      const refused = await get({ 'x-mcp-destination': value });
      const text = await refused.text();
      expect(refused.status).toBe(400);
      expect(text).toContain('x-mcp-destination');
      if (value) expect(text).not.toContain(value);
      expect(destinations.settingsFor).not.toHaveBeenCalled();
      expect(destinations.getProvider).not.toHaveBeenCalled();
    },
  );
});

describe('stdio inspection-only mode: the stand-in destinations', () => {
  it('has only the two methods of IDestinations, and no getToken', async () => {
    const destinations = inspectionOnlyDestinations();
    expect(Object.keys(destinations).sort()).toEqual([
      'getProvider',
      'settingsFor',
    ]);
    expect(destinations).not.toHaveProperty('getToken');
    const settings = await destinations.settingsFor('mock');
    expect(settings.url).toBe('http://mock');
    expect(settings).not.toHaveProperty('password');
  });

  it('its provider refuses every moment, naming how to connect', async () => {
    const provider = await inspectionOnlyDestinations().getProvider('mock');
    const outcomes = [
      await provider.prepare(),
      await provider.establish({} as any),
      await provider.authorize({} as any),
      await provider.rejected({} as any),
    ];
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.refusal.reason).toContain('--mcp');
        expect(outcome.refusal.reason).toContain('--env-path');
      }
    }
  });
});

/**
 * Two first requests to one destination at once: the first login is the
 * first connect, and the second request starts only after it settles.
 */
function heldDestinations() {
  const events: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let prepares = 0;
  const provider: IAuthProvider = {
    kind: 'test',
    prepare: async () => {
      prepares += 1;
      events.push(`prepare ${prepares} start`);
      if (prepares === 1) await held;
      events.push(`prepare ${prepares} end`);
      return { ok: true };
    },
    establish: async () => ({ ok: true }),
    authorize: async () => ({ ok: true }),
    rejected: async () => ({ ok: true }),
  };
  let settings = 0;
  const destinations: IDestinations = {
    settingsFor: async () => {
      settings += 1;
      events.push(`settingsFor ${settings}`);
      return { url: 'https://system.example.invalid', authType: 'jwt' };
    },
    getProvider: async () => provider,
  };
  return { destinations, events, release, prepared: () => prepares };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('the first login to a destination is serialised', () => {
  let server: Server;
  const open: AbortController[] = [];

  afterEach(async () => {
    for (const controller of open.splice(0)) controller.abort();
    await close(server);
  });

  it('HTTP: the second first request starts only after the first connect settles', async () => {
    const { destinations, events, release, prepared } = heldDestinations();
    const mcp = new StreamableHttpServer(emptyRegistry, destinations, {
      defaultDestination: 'good',
    });
    let baseUrl: string;
    ({ server, baseUrl } = await listen((app) => mcp.registerRoutes(app)));
    const post = () =>
      fetch(`${baseUrl}/mcp/stream/http`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(INITIALIZE),
      });

    const first = post();
    await until(() => prepared() === 1);
    const second = post();
    // The first login is held open: the second has not started.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual(['settingsFor 1', 'prepare 1 start']);

    release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(events.slice(0, 3)).toEqual([
      'settingsFor 1',
      'prepare 1 start',
      'prepare 1 end',
    ]);
    expect(events).toContain('settingsFor 2');
  });

  it('SSE: the second first session starts only after the first connect settles', async () => {
    const { destinations, events, release, prepared } = heldDestinations();
    const sse = new SseServer(emptyRegistry, destinations, {
      defaultDestination: 'good',
    });
    let baseUrl: string;
    ({ server, baseUrl } = await listen((app) => sse.registerRoutes(app)));
    const get = () => {
      const controller = new AbortController();
      open.push(controller);
      return fetch(`${baseUrl}/sse`, { signal: controller.signal });
    };

    const first = get();
    await until(() => prepared() === 1);
    const second = get();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual(['settingsFor 1', 'prepare 1 start']);

    release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(events.slice(0, 3)).toEqual([
      'settingsFor 1',
      'prepare 1 start',
      'prepare 1 end',
    ]);
    expect(events).toContain('settingsFor 2');
  });
});

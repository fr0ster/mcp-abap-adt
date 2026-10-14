/**
 * Failures outside a handler (spec §14.2, the connect phase), each through a
 * real request: a provider's failure from a token endpoint stand-in, and
 * connection's `AuthRefusedError` from an ADT stand-in answering `401` twice.
 * The tool wrapper reads each first and answers the §7.3 JSON: `error`,
 * `kind`, `message` and `hint` as auth-errors' `render` gives them, no
 * diagnostics; the stderr line is `logFields`.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { render } from '@mcp-abap-adt/auth-errors';
import {
  ClientCredentialsProvider,
  refreshThenLogin,
} from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';

/** What the source answers: the settings and the provider, as a destination's. */
interface IDestinations {
  settingsFor(): Promise<SapConfig>;
  getProvider(): Promise<IAuthProvider>;
}

import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { resetSystemContextCache } from '../../../lib/systemContext';

const silent = { info() {}, debug() {}, warn() {}, error() {} };
const TOOL = 'StubTool';
const SECRET = 'client-secret-PLACEHOLDER';

class StubGroup {
  readonly reached = jest.fn();
  getName() {
    return 'stub';
  }
  getHandlers() {
    return [
      {
        toolDefinition: {
          name: TOOL,
          description: 'a tool that would read the system',
          inputSchema: { type: 'object', properties: {} },
        },
        handler: async () => {
          this.reached();
          return { content: [{ type: 'text', text: 'read' }] };
        },
      },
    ];
  }
  registerHandlers() {}
}

class TestServer extends BaseMcpServer {
  constructor(private readonly beforeConnect?: () => Promise<void>) {
    super({ name: 'test-server', version: '1.0.0', logger: silent });
  }
  protected override async getConnection(signal: AbortSignal) {
    await this.beforeConnect?.();
    return super.getConnection(signal);
  }
  async serve(destinations: IDestinations, group: StubGroup): Promise<Client> {
    this.setConnectionContext({
      kind: 'built',
      source: {
        resolve: async () => ({
          settings: await destinations.settingsFor(),
          credential: await destinations.getProvider(),
        }),
      },
      sessionId: 'dest',
    });
    this.registerHandlers(new CompositeHandlersRegistry([group as never]));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([this.connect(serverSide), client.connect(clientSide)]);
    return client;
  }
}

interface StandIn {
  url: string;
  requests: string[];
  close(): Promise<void>;
}

/** A server on 127.0.0.1 answering every request with `status` and `body`. */
async function standIn(status: number, body: string): Promise<StandIn> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    req.resume();
    req.on('end', () => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body);
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function callTool(
  destinations: IDestinations,
  beforeConnect?: () => Promise<void>,
): Promise<{ payload: Record<string, unknown>; group: StubGroup }> {
  const group = new StubGroup();
  const server = new TestServer(beforeConnect);
  const client = await server.serve(destinations, group);
  try {
    const result = (await client.callTool({ name: TOOL, arguments: {} })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    return { payload: JSON.parse(result.content[0].text), group };
  } finally {
    await client.close();
  }
}

/** The words auth-errors renders for the kind and facts the answer was read from. */
function expectRendered(
  payload: Record<string, unknown>,
  kind: string,
  facts: object,
): void {
  const words = render(kind as never, facts as never);
  expect(payload).toEqual({
    error: 'authentication_failed',
    kind,
    message: words.reason,
    ...(words.hint !== undefined ? { hint: words.hint } : {}),
  });
}

let stderrLines: string[];
let stderrSpy: jest.SpyInstance;
const savedEnv = process.env;

beforeEach(() => {
  // The system kind is required: stated for every case.
  process.env = {
    ...savedEnv,
    SAP_MASTER_SYSTEM: 'master-placeholder',
    SAP_SYSTEM_TYPE: 'onprem',
  };
  resetSystemContextCache();
  stderrLines = [];
  stderrSpy = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });
});

afterEach(() => {
  stderrSpy.mockRestore();
  process.env = savedEnv;
  resetSystemContextCache();
});

function clientCredentials(uaaUrl: string): ClientCredentialsProvider {
  return new ClientCredentialsProvider({
    uaaUrl,
    clientId: 'client-id',
    clientSecret: SECRET,
    renewal: refreshThenLogin(),
  });
}

describe("a provider's failure from a token endpoint stand-in", () => {
  let tokenEndpoint: StandIn;
  beforeEach(async () => {
    tokenEndpoint = await standIn(
      401,
      JSON.stringify({ error: 'invalid_client' }),
    );
  });
  afterEach(() => tokenEndpoint.close());

  it("an AuthProviderFailure thrown at connect: the provider's own failure, as the chain made it", async () => {
    const provider = clientCredentials(tokenEndpoint.url);
    const adt = await standIn(200, '');
    try {
      const destinations: IDestinations = {
        settingsFor: async () => ({ url: adt.url, authType: 'jwt' }),
        getProvider: async () => provider,
      };
      let thrown: unknown;
      const { payload, group } = await callTool(destinations, async () => {
        // A host whose connection setup obtains the token itself:
        // getTokens() rejects with the provider's AuthProviderFailure.
        try {
          await provider.getTokens();
        } catch (e) {
          thrown = e;
          throw e;
        }
      });
      const error = (thrown as { error: { kind: string; facts: object } })
        .error;
      expect((thrown as { name?: unknown }).name).toBe('AuthProviderFailure');
      expect(error.kind).toBe('request-failed');
      expectRendered(payload, error.kind, error.facts);
      expect(group.reached).not.toHaveBeenCalled();
      expect(tokenEndpoint.requests.length).toBeGreaterThan(0);
      expect(adt.requests).toEqual([]);
      const text = JSON.stringify(payload);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(tokenEndpoint.url);
      expect(stderrLines.join('')).toContain('"kind":"request-failed"');
    } finally {
      await adt.close();
    }
  });

  it("the provider's refusal at connect: AuthRefusedError holding the provider's error", async () => {
    const provider = clientCredentials(tokenEndpoint.url);
    const adt = await standIn(200, '');
    try {
      const destinations: IDestinations = {
        settingsFor: async () => ({ url: adt.url, authType: 'jwt' }),
        getProvider: async () => provider,
      };
      const { payload, group } = await callTool(destinations);
      // The provider's own error against the same stand-in: the words the
      // answer must carry are auth-errors' render of its kind and facts.
      const own = await clientCredentials(tokenEndpoint.url)
        .getTokens()
        .then(
          () => undefined,
          (e: { error: { kind: string; facts: object } }) => e.error,
        );
      expect(own?.kind).toBe('request-failed');
      expectRendered(payload, 'request-failed', own?.facts ?? {});
      expect(group.reached).not.toHaveBeenCalled();
      expect(tokenEndpoint.requests.length).toBeGreaterThan(0);
      expect(adt.requests).toEqual([]);
      const text = JSON.stringify(payload);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('diagnostics');
      expect(text).not.toContain(tokenEndpoint.url);
      const line = stderrLines.join('');
      expect(line).toContain('[MCP] authentication_failed: ');
      expect(line).toContain('"kind":"request-failed"');
    } finally {
      await adt.close();
    }
  });
});

describe("connection's AuthRefusedError from an ADT stand-in answering 401 twice", () => {
  it('refused-after-renewal: answered in its rendered words, no handler reached', async () => {
    const adt = await standIn(401, '');
    try {
      // A provider that answers Ok to the rejection — it says it renewed —
      // so the connection retries once and, refused again, words it itself.
      const rejected = jest.fn(async () => ({ ok: true as const }));
      const ok = async () => ({ ok: true as const });
      const provider: IAuthProvider = {
        kind: 'renewing',
        prepare: ok,
        establish: ok,
        authorize: ok,
        rejected,
      };
      const destinations: IDestinations = {
        settingsFor: async () => ({ url: adt.url, authType: 'jwt' }),
        getProvider: async () => provider,
      };
      const { payload, group } = await callTool(destinations);
      expectRendered(payload, 'connection', {
        problem: 'refused-after-renewal',
        at: 'logon',
      });
      expect(group.reached).not.toHaveBeenCalled();
      // Each logon attempt asks for a CSRF token (sessions, then discovery):
      // refused, renewed once, refused again.
      expect(adt.requests.length).toBeGreaterThanOrEqual(2);
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(stderrLines.join('')).toContain('"kind":"connection"');
    } finally {
      await adt.close();
    }
  });
});

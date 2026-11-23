/**
 * The admission's raw steps run on the `tools/call` request as it came, at
 * the server's seam before the SDK validates the arguments (spec §4.4): the
 * SDK strips an undeclared `background` and refuses a denied compact enum
 * value before any callback of ours, so those refusals must come first.
 * Through real MCP servers, not the function:
 *
 * - a denied compact action is refused, nothing run;
 * - cloud `PullAbapGitRepo` with `background: true` is refused, nothing sent;
 * - with no `IAccessChecks` configured, the import refusal still runs;
 * - an SSE and a Streamable HTTP instance under a request-only signal refuse
 *   link;
 * - an admitted call with an argument of the wrong type still gets the
 *   SDK's own validation error (the delegation is intact).
 *
 * The abapGit tools are stand-ins with the names and the argument shapes of
 * spec §4.1/§4.2, each answering `ran` and sending nothing of its own.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { StreamableHttpServer } from '../../../../server-runtime/src/http/StreamableHttpServer';
import { SseServer } from '../../../../server-runtime/src/sse/SseServer';
import type { IDestinations } from '../../../../server-runtime/src/stdio/auth/IAuthBrokerFactory';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import type { AbapGitRestrictionSignal } from '../../../lib/abapGit/admission';
import { notifyConnectionResetListeners } from '../../../lib/connectionEvents';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { clientTransport } from '../../helpers/clientTransport';

const SERVED_DISCOVERY =
  '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>' +
  '<app:collection href="/sap/bc/adt/abapgit/repos"/>' +
  '</app:workspace></app:service>';

const isDiscovery = (request: StandInRequest): boolean =>
  request.url.split('?')[0] === '/sap/bc/adt/discovery';

const isAbapGit = (request: StandInRequest): boolean =>
  request.url.startsWith('/sap/bc/adt/abapgit');

/** A stand-in tool with `name` and `schema`, counting its runs. */
function standIn(
  name: string,
  schema: z.ZodObject,
  runs: string[],
): HandlerEntry {
  return {
    toolDefinition: { name, description: 'a stand-in', inputSchema: schema },
    call: async (context) => {
      runs.push(name);
      const key = context.abapGitAdmission?.repo?.key;
      return {
        content: [
          { type: 'text', text: key === undefined ? 'ran' : `ran ${key}` },
        ],
      };
    },
  };
}

/** The stand-in abapGit tools, the compact one narrowed to `unlink` (as a deny of its other actions leaves it). */
function abapGitGroup(runs: string[]): IHandlerGroup {
  const entries = [
    standIn(
      'PullAbapGitRepo',
      z.object({
        repository_key: z.string(),
        transport_request: z.string().optional(),
      }),
      runs,
    ),
    standIn(
      'LinkAbapGitRepo',
      z.object({
        package_name: z.string(),
        url: z.string(),
        branch: z.string(),
      }),
      runs,
    ),
    standIn(
      'HandlerAbapGit',
      z.object({
        action: z.enum(['unlink', 'pull']),
        repository_key: z.string().optional(),
      }),
      runs,
    ),
  ];
  return {
    getName: () => 'abapgit-stand-in',
    registerHandlers: () => {},
    getHandlers: () => entries,
  };
}

const PROVIDER = new BasicAuthProvider('GIT_USER', 'git-password');

function destinationsOf(sap: AdtStandIn): IDestinations {
  return {
    settingsFor: async () => ({
      url: sap.url,
      client: '100',
      authType: 'basic',
      username: 'GIT_USER',
    }),
    getProvider: async () => PROVIDER,
  };
}

async function stdio(
  sap: AdtStandIn,
  runs: string[],
  options: {
    systemType: 'onprem' | 'cloud';
    abapGitRestrictions?: AbapGitRestrictionSignal;
  },
) {
  const server = new StdioServer(
    new CompositeHandlersRegistry([abapGitGroup(runs)]),
    destinationsOf(sap),
    {
      systemType: options.systemType,
      ...(options.abapGitRestrictions !== undefined
        ? { abapGitRestrictions: options.abapGitRestrictions }
        : {}),
    },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'abapgit-seam', version: '1' });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  return {
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close().catch(() => undefined);
      await server.terminalClose().catch(() => undefined);
    },
  };
}

/** The first text of an answer. */
function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  const first: unknown = content[0];
  return typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
    ? first.text
    : '';
}

let sap: AdtStandIn;
beforeEach(async () => {
  notifyConnectionResetListeners();
  sap = await adtStandIn();
  sap.body(isDiscovery, SERVED_DISCOVERY);
});
afterEach(async () => {
  await sap.close();
  notifyConnectionResetListeners();
});

describe('the seam: the raw steps before the SDK validates', () => {
  it('a denied compact action is refused in the narrowed words, nothing run', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, { systemType: 'onprem' });
    try {
      const answer = await s.call('HandlerAbapGit', {
        action: 'push',
        repository_key: '000001',
      });
      assert.equal(answer.isError, true);
      assert.match(textOf(answer), /Invalid arguments for tool HandlerAbapGit/);
      assert.deepEqual(runs, []);
      assert.equal(sap.requests.length, 0);
    } finally {
      await s.close();
    }
  });

  it('cloud PullAbapGitRepo with background: true is refused, nothing sent', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, { systemType: 'cloud' });
    try {
      const answer = await s.call('PullAbapGitRepo', {
        repository_key: '000001',
        background: true,
      });
      assert.equal(answer.isError, true);
      assert.match(textOf(answer), /abapgit_background_not_declared/);
      assert.deepEqual(runs, []);
      assert.equal(sap.requests.length, 0);
    } finally {
      await s.close();
    }
  });

  it('on premise an overwrite is refused before the SDK strips it, full and compact pull alike, nothing sent', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, { systemType: 'onprem' });
    try {
      const overwrite = [{ type: 'INTF', name: 'ZIF_A' }];
      const full = await s.call('PullAbapGitRepo', {
        repository_key: '000001',
        overwrite,
      });
      const compact = await s.call('HandlerAbapGit', {
        action: 'pull',
        repository_key: '000001',
        overwrite,
      });
      for (const answer of [full, compact]) {
        assert.equal(answer.isError, true);
        assert.match(textOf(answer), /abapgit_overwrite_not_declared/);
      }
      assert.deepEqual(runs, []);
      assert.equal(sap.requests.length, 0);
    } finally {
      await s.close();
    }
  });

  it('on the cloud an overwrite naming one object twice is refused before any connection, nothing sent', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, { systemType: 'cloud' });
    try {
      const answer = await s.call('PullAbapGitRepo', {
        repository_key: '000001',
        overwrite: [
          { type: 'INTF', name: 'ZIF_A' },
          { type: 'INTF', name: 'ZIF_A' },
        ],
      });
      assert.equal(answer.isError, true);
      assert.match(textOf(answer), /abapgit_overwrite_duplicate/);
      assert.deepEqual(runs, []);
      assert.equal(sap.requests.length, 0);
    } finally {
      await s.close();
    }
  });

  it('the import refusal comes before the duplicate refusal', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, {
      systemType: 'cloud',
      abapGitRestrictions: { packages: true, requests: false },
    });
    try {
      const answer = await s.call('PullAbapGitRepo', {
        repository_key: '000001',
        overwrite: [
          { type: 'INTF', name: 'ZIF_A' },
          { type: 'INTF', name: 'ZIF_A' },
        ],
      });
      assert.match(textOf(answer), /abapgit_import_not_allowed/);
      assert.equal(sap.requests.length, 0);
    } finally {
      await s.close();
    }
  });

  it('with no IAccessChecks configured, link under a request-only signal is still refused', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, {
      systemType: 'onprem',
      abapGitRestrictions: { packages: false, requests: true },
    });
    try {
      const answer = await s.call('LinkAbapGitRepo', {
        package_name: 'ZPKG',
        url: 'https://git.example.invalid/x',
        branch: 'main',
      });
      assert.equal(answer.isError, true);
      assert.match(textOf(answer), /abapgit_import_not_allowed/);
      assert.deepEqual(runs, []);
      assert.equal(sap.requests.filter(isAbapGit).length, 0);
    } finally {
      await s.close();
    }
  });

  it('an admitted call with an argument of the wrong type gets the SDK’s own validation error', async () => {
    const runs: string[] = [];
    const s = await stdio(sap, runs, { systemType: 'onprem' });
    try {
      const answer = await s.call('LinkAbapGitRepo', {
        package_name: 'ZPKG',
        url: 42,
        branch: 'main',
      });
      assert.equal(answer.isError, true);
      assert.match(textOf(answer), /Input validation error/);
      assert.deepEqual(runs, []);
    } finally {
      await s.close();
    }
  });
});

const sapHeaders = (url: string): Record<string, string> => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'GIT_USER',
  'x-sap-password': 'git-password',
});

const REQUEST_ONLY: AbapGitRestrictionSignal = {
  packages: false,
  requests: true,
};

function boundPort(server: { listeningPort(): number | undefined }): number {
  const port = server.listeningPort();
  if (port === undefined) throw new Error('the server listens on no port');
  return port;
}

const LINK = {
  name: 'LinkAbapGitRepo',
  arguments: {
    package_name: 'ZPKG',
    url: 'https://git.example.invalid/x',
    branch: 'main',
  },
};

const R1 =
  '<?xml version="1.0" encoding="utf-8"?><abapgitrepo:repositories xmlns:abapgitrepo="http://www.sap.com/adt/abapgit/repositories">' +
  '<abapgitrepo:repository><abapgitrepo:key>000001</abapgitrepo:key>' +
  '<abapgitrepo:package>ZPKG</abapgitrepo:package>' +
  '<abapgitrepo:url>https://git.example.invalid/x</abapgitrepo:url>' +
  '<abapgitrepo:branchName>refs/heads/main</abapgitrepo:branchName>' +
  '</abapgitrepo:repository></abapgitrepo:repositories>';

describe('a real dispatch of an admitted keyed call', () => {
  it('reads R1 exactly once, credential-free, and hands the entry to the handler', async () => {
    const runs: string[] = [];
    sap.body((r) => r.url.split('?')[0] === '/sap/bc/adt/abapgit/repos', R1);
    const s = await stdio(sap, runs, { systemType: 'onprem' });
    try {
      const answer = await s.call('PullAbapGitRepo', {
        repository_key: '000001',
      });
      assert.equal(textOf(answer), 'ran 000001');
      const reads = sap.requests.filter(
        (r) =>
          r.method === 'GET' &&
          r.url.split('?')[0] === '/sap/bc/adt/abapgit/repos',
      );
      assert.equal(reads.length, 1);
      assert.equal(reads[0]?.headers.username, undefined);
      assert.equal(reads[0]?.headers.password, undefined);
    } finally {
      await s.close();
    }
  });
});

describe('every instance factory carries the restriction signal', () => {
  let previousType: string | undefined;
  beforeEach(() => {
    previousType = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });
  afterEach(() => {
    if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previousType;
  });

  it('SSE: link refused under a request-only signal', async () => {
    const runs: string[] = [];
    const sse = new SseServer(
      new CompositeHandlersRegistry([abapGitGroup(runs)]),
      { host: '127.0.0.1', port: 0, abapGitRestrictions: REQUEST_ONLY },
    );
    await sse.start();
    const headers = sapHeaders(sap.url);
    const client = new Client({ name: 'abapgit-seam', version: '1' });
    try {
      await client.connect(
        new SSEClientTransport(
          new URL(`http://127.0.0.1:${boundPort(sse)}/sse`),
          {
            requestInit: { headers },
            eventSourceInit: {
              fetch: (url, init) =>
                fetch(url, {
                  ...init,
                  headers: { ...(init?.headers ?? {}), ...headers },
                }),
            },
          },
        ),
      );
      const answer = await client.callTool(LINK);
      assert.match(textOf(answer), /abapgit_import_not_allowed/);
      assert.deepEqual(runs, []);
    } finally {
      await client.close();
      await sse.stop();
    }
  });

  it('Streamable HTTP: link refused under a request-only signal', async () => {
    const runs: string[] = [];
    const mcp = new StreamableHttpServer(
      new CompositeHandlersRegistry([abapGitGroup(runs)]),
      { host: '127.0.0.1', port: 0, abapGitRestrictions: REQUEST_ONLY },
    );
    await mcp.start();
    const client = new Client({ name: 'abapgit-seam', version: '1' });
    try {
      await client.connect(
        clientTransport(
          new StreamableHTTPClientTransport(
            new URL(`http://127.0.0.1:${boundPort(mcp)}/mcp/stream/http`),
            { requestInit: { headers: sapHeaders(sap.url) } },
          ),
        ),
      );
      const answer = await client.callTool(LINK);
      assert.match(textOf(answer), /abapgit_import_not_allowed/);
      assert.deepEqual(runs, []);
    } finally {
      await client.close();
      await mcp.stop();
    }
  });
});

/**
 * Git credentials are bound to approved endpoints (spec §5.1, §5.2): a
 * credential is attached only when the remote URL is an approved one or one
 * of its trusted aliases, exactly — the host's letter case aside; an alias
 * that matches sends the configured URL; no match goes without a credential
 * (§9.3 a). Userinfo, a query or a fragment is a start error in a
 * configured URL and a refusal in an argument. Any host and port.
 *
 * The sources: stdio's endpoints file beside the destination's `.env`;
 * Streamable HTTP's `x-abapgit-*` headers per call; SSE's on the opening
 * GET, held by that stream's instance — through real dispatch over the ADT
 * stand-in, a stand-in abapGit tool answering the user it was bound to.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as z from 'zod';
import { StreamableHttpServer } from '../../../../server-runtime/src/http/StreamableHttpServer';
import { SseServer } from '../../../../server-runtime/src/sse/SseServer';
import {
  type ApprovedEndpoint,
  type ApprovedEndpointConfig,
  ApprovedEndpointError,
  argumentUrlFault,
  matchEndpoint,
  parseApprovedEndpoints,
} from '../../../lib/abapGit/approvedEndpoints';
import {
  abapGitEndpointsFileOf,
  endpointsOfCall,
  readApprovedEndpointsFile,
} from '../../../lib/abapGit/endpointSources';
import { notifyConnectionResetListeners } from '../../../lib/connectionEvents';
import { LongSessionHandlersGroup } from '../../../lib/handlers/groups/LongSessionHandlersGroup';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  requestContextFromHeaders,
  runWithRequestContext,
} from '../../../lib/requestContext';
import {
  type AdtStandIn,
  adtStandIn,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';

const endpoints = (
  ...config: ApprovedEndpointConfig[]
): readonly ApprovedEndpoint[] => parseApprovedEndpoints(config, 'test');

const REPO = 'https://git.example/org/repo';

describe('matchEndpoint: an exact remote URL, or a trusted alias', () => {
  const configured = endpoints({
    url: REPO,
    user: 'git-user',
    token: 'git-token',
    aliases: ['https://git.example/org/repo-alias'],
  });

  it('binds the exact URL to its credential and sends it', () => {
    assert.deepEqual(matchEndpoint(REPO, configured), {
      sendUrl: REPO,
      credentials: { user: 'git-user', password: 'git-token' },
    });
  });

  it('an alias on a URL route sends the configured URL', () => {
    assert.deepEqual(
      matchEndpoint('https://git.example/org/repo-alias', configured),
      {
        sendUrl: REPO,
        credentials: { user: 'git-user', password: 'git-token' },
      },
    );
  });

  it('an alias alone on a key route (R1’s URL is the alias) attaches the credential', () => {
    const r1Url = 'https://git.example/org/repo-alias';
    assert.deepEqual(matchEndpoint(r1Url, configured)?.credentials, {
      user: 'git-user',
      password: 'git-token',
    });
  });

  it('the host’s letter case does not count; .git, a trailing /, a port and the path’s case do', () => {
    assert.notEqual(
      matchEndpoint('https://GIT.Example/org/repo', configured),
      undefined,
    );
    for (const nearMiss of [
      `${REPO}.git`,
      `${REPO}/`,
      'https://git.example:8443/org/repo',
      'https://git.example/Org/Repo',
      'http://git.example/org/repo',
    ]) {
      assert.equal(matchEndpoint(nearMiss, configured), undefined, nearMiss);
    }
  });

  it('a default port written out is a spelling the parser changes: no match', () => {
    assert.equal(
      matchEndpoint('https://git.example:443/org/repo', configured),
      undefined,
    );
  });

  it('no match: no credential (sent anonymously)', () => {
    assert.equal(
      matchEndpoint('https://other.example/org/repo', configured),
      undefined,
    );
  });

  it('several hosts each bind their own credential', () => {
    const many = endpoints(
      { url: 'https://github.com/org/one.git', user: 'gh', token: 't1' },
      { url: 'https://gitlab.com/group/two', user: 'gl', token: 't2' },
      {
        url: 'https://dev.azure.com/org/project/_git/three',
        user: 'az',
        token: 't3',
      },
      {
        url: 'https://git.internal.example:8443/four',
        user: 'own',
        token: 't4',
      },
    );
    assert.equal(
      matchEndpoint('https://github.com/org/one.git', many)?.credentials.user,
      'gh',
    );
    assert.equal(
      matchEndpoint('https://gitlab.com/group/two', many)?.credentials.user,
      'gl',
    );
    assert.equal(
      matchEndpoint('https://dev.azure.com/org/project/_git/three', many)
        ?.credentials.user,
      'az',
    );
    assert.equal(
      matchEndpoint('https://git.internal.example:8443/four', many)?.credentials
        .user,
      'own',
    );
    assert.equal(
      matchEndpoint('https://git.internal.example/four', many),
      undefined,
    );
  });
});

describe('configured endpoints: a start error, naming the place, never the value', () => {
  for (const [fault, url] of [
    ['userinfo', 'https://someone:secret-word@git.example/org/repo'],
    ['query', 'https://git.example/org/repo?x=1'],
    ['fragment', 'https://git.example/org/repo#main'],
    ['non-https', 'http://git.example/org/repo'],
  ] as const) {
    it(`refuses a URL with ${fault}`, () => {
      assert.throws(
        () => endpoints({ url, user: 'u', token: 't' }),
        (error) =>
          error instanceof ApprovedEndpointError &&
          error.words.startsWith('test: endpoint 1 url') &&
          !error.words.includes('secret-word') &&
          !error.words.includes('git.example'),
      );
    });
    it(`refuses an alias with ${fault}`, () => {
      assert.throws(
        () => endpoints({ url: REPO, user: 'u', token: 't', aliases: [url] }),
        (error) =>
          error instanceof ApprovedEndpointError &&
          error.words.startsWith('test: endpoint 1 alias 1'),
      );
    });
  }

  it('refuses an entry without a user or a token', () => {
    assert.throws(() => endpoints({ url: REPO, user: '', token: 't' }));
    assert.throws(() => endpoints({ url: REPO, user: 'u', token: '' }));
  });
});

describe('a url argument: userinfo, a query or a fragment refused before sending', () => {
  it('refuses each', () => {
    assert.equal(
      argumentUrlFault('https://someone:pw@git.example/org/repo'),
      'userinfo',
    );
    assert.equal(argumentUrlFault('https://git.example/org/repo?'), 'query');
    assert.equal(argumentUrlFault('https://git.example/org/repo#'), 'fragment');
  });

  it('refuses an empty userinfo', () => {
    assert.equal(argumentUrlFault('https://@git.example/org/repo'), 'userinfo');
    assert.equal(
      argumentUrlFault('https://:@git.example/org/repo'),
      'userinfo',
    );
  });

  it('finds a query or a fragment in the raw text, whatever the parser makes of it', () => {
    assert.equal(argumentUrlFault('https://git.example/org/repo?x'), 'query');
    assert.equal(argumentUrlFault('https://git.example?/org'), 'query');
    assert.equal(argumentUrlFault('https://git.example#/org'), 'fragment');
  });

  it('refuses a URL the parser rejects: it is never forwarded', () => {
    assert.equal(argumentUrlFault('not a url'), 'not-a-url');
    assert.equal(argumentUrlFault('https://'), 'not-a-url');
  });

  it('refuses every scheme but https and http before anything is sent', () => {
    for (const url of [
      'file:///team/repo',
      'ftp://git.example/team/repo',
      'ssh://git.example/team/repo',
      'git://git.example/team/repo',
    ]) {
      assert.equal(argumentUrlFault(url), 'not-git-scheme', url);
    }
    assert.equal(argumentUrlFault('http://git.example/team/repo'), undefined);
  });

  it('refuses every spelling the parser would change', () => {
    for (const url of [
      'https:///@git.example/org/repo',
      'https://git.example/org/.\t./repo',
      'HTTPS://git.example/org/repo',
      'https://git.example:443/org/repo',
      'https://git.example/a b',
      'https://git.example\\org/repo',
      ' https://git.example/org/repo',
    ]) {
      assert.notEqual(argumentUrlFault(url), undefined, JSON.stringify(url));
    }
    assert.equal(argumentUrlFault('https://git.example'), undefined);
    assert.equal(argumentUrlFault('https://GIT.example/org/repo'), undefined);
  });

  it('refuses a dot segment in the path, literal or encoded', () => {
    for (const url of [
      'https://git.example/org/../repo',
      'https://git.example/org/%2e%2e/repo',
      'https://git.example/org/%2E%2E/repo',
      'https://git.example/org/.%2e/repo',
      'https://git.example/org/./repo',
      'https://git.example/org/%2e/repo',
      'https://git.example/org/repo/..',
    ]) {
      assert.equal(argumentUrlFault(url), 'dot-segment', url);
    }
  });

  it('leaves an https or http URL without those to SAP', () => {
    assert.equal(argumentUrlFault(REPO), undefined);
    assert.equal(argumentUrlFault('http://git.example/org/repo'), undefined);
    assert.equal(argumentUrlFault('https://git.example/org/.repo'), undefined);
  });
});

describe('the path is compared as written', () => {
  const approved = endpoints({
    url: 'https://git.example/b',
    user: 'git-user',
    token: 'git-token',
  });

  it('a path that normalises to an approved one never binds', () => {
    for (const url of [
      'https://git.example/a/../b',
      'https://git.example/a/%2e%2e/b',
      'https://git.example/./b',
      'https://git.example/%62',
    ]) {
      assert.equal(matchEndpoint(url, approved), undefined, url);
    }
  });

  it('a path the parser would encode is not the encoded one', () => {
    const encoded = endpoints({
      url: 'https://git.example/a%20b',
      user: 'git-user',
      token: 'git-token',
    });
    assert.equal(matchEndpoint('https://git.example/a b', encoded), undefined);
    assert.notEqual(
      matchEndpoint('https://git.example/a%20b', encoded),
      undefined,
    );
  });

  it('a configured URL with a dot segment is a start error', () => {
    assert.throws(
      () =>
        endpoints({ url: 'https://git.example/a/../b', user: 'u', token: 't' }),
      (error) =>
        error instanceof ApprovedEndpointError &&
        error.words ===
          'test: endpoint 1 url carries a dot segment in its path',
    );
  });
});

describe('stdio: the endpoints file beside the destination’s .env', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abapgit-endpoints-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('is <name>.abapgit.yaml for <name>.env', () => {
    assert.equal(
      abapGitEndpointsFileOf(path.join(dir, 'onprem.env')),
      path.join(dir, 'onprem.abapgit.yaml'),
    );
  });

  it('reads the endpoints with their aliases', () => {
    const file = path.join(dir, 'onprem.abapgit.yaml');
    fs.writeFileSync(
      file,
      [
        'endpoints:',
        `  - url: ${REPO}`,
        '    user: git-user',
        '    token: git-token',
        '    aliases:',
        `      - ${REPO}.git`,
      ].join('\n'),
    );
    const read = readApprovedEndpointsFile(file);
    assert.equal(matchEndpoint(`${REPO}.git`, read)?.sendUrl, REPO);
  });

  it('no file: no endpoints', () => {
    assert.deepEqual(
      readApprovedEndpointsFile(path.join(dir, 'none.abapgit.yaml')),
      [],
    );
  });

  it('an entry that is not one is a start error naming its place', () => {
    const file = path.join(dir, 'bad.abapgit.yaml');
    fs.writeFileSync(file, 'endpoints:\n  - url: 42\n');
    assert.throws(
      () => readApprovedEndpointsFile(file),
      (error) =>
        error instanceof ApprovedEndpointError &&
        error.words === `${file}: endpoint 1 url is not a string`,
    );
  });
});

describe('the call’s endpoints: the request’s headers, else the configured ones', () => {
  const configured = endpoints({ url: REPO, user: 'file-user', token: 't' });

  it('without headers: the configured ones', () => {
    assert.deepEqual(endpointsOfCall(configured), { endpoints: configured });
    assert.deepEqual(
      runWithRequestContext(requestContextFromHeaders({}), () =>
        endpointsOfCall(configured),
      ),
      { endpoints: configured },
    );
  });

  it('with headers: that one endpoint alone', () => {
    const read = runWithRequestContext(
      requestContextFromHeaders({
        'x-abapgit-remote': 'https://other.example/x',
        'x-abapgit-user': 'header-user',
        'x-abapgit-token': 'header-token',
      }),
      () => endpointsOfCall(configured),
    );
    assert.ok('endpoints' in read);
    assert.equal(matchEndpoint(REPO, read.endpoints), undefined);
    assert.equal(
      matchEndpoint('https://other.example/x', read.endpoints)?.credentials
        .user,
      'header-user',
    );
  });

  it('a header endpoint that cannot be one is refused, naming the headers, never a value', () => {
    const read = runWithRequestContext(
      requestContextFromHeaders({
        'x-abapgit-remote': 'https://u:secret-word@other.example/x',
        'x-abapgit-user': 'header-user',
        'x-abapgit-token': 'header-token',
      }),
      () => endpointsOfCall(configured),
    );
    assert.ok('refused' in read);
    assert.match(read.refused, /x-abapgit-\* headers/);
    assert.ok(!read.refused.includes('secret-word'));
    assert.ok(!read.refused.includes('header-token'));
  });
});

/* -------------------------------------------------------------------------- */
/* Real dispatch                                                              */
/* -------------------------------------------------------------------------- */

const SERVED_DISCOVERY =
  '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>' +
  '<app:collection href="/sap/bc/adt/abapgit/repos"/>' +
  '</app:workspace></app:service>';

const isDiscovery = (request: StandInRequest): boolean =>
  request.url.split('?')[0] === '/sap/bc/adt/discovery';

/** A stand-in abapGit tool: answers the user its call’s endpoints bind `REPO` to, else `none`. */
const boundUser: HandlerEntry = {
  toolDefinition: {
    name: 'ListAbapGitRepos',
    description: 'answers the bound user',
    inputSchema: z.object({ state_handle: z.string().optional() }),
  },
  call: async () => {
    const read = endpointsOfCall([]);
    const user =
      'endpoints' in read
        ? (matchEndpoint(REPO, read.endpoints)?.credentials.user ?? 'none')
        : 'refused';
    return { content: [{ type: 'text', text: user }] };
  },
};

const registry = () =>
  new CompositeHandlersRegistry([
    probeGroup([boundUser]),
    new LongSessionHandlersGroup(noConnectionContext()),
  ]);

const sapHeaders = (url: string): Record<string, string> => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'GIT_USER',
  'x-sap-password': 'git-password',
});

const gitHeaders: Record<string, string> = {
  'x-abapgit-remote': REPO,
  'x-abapgit-user': 'header-user',
  'x-abapgit-token': 'header-token',
};

function boundPort(server: { listeningPort(): number | undefined }): number {
  const port = server.listeningPort();
  if (port === undefined) throw new Error('the server listens on no port');
  return port;
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string => {
  const content = Array.isArray(result.content) ? result.content : [];
  const first: unknown = content[0];
  return typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
    ? first.text
    : '';
};

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  notifyConnectionResetListeners();
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  notifyConnectionResetListeners();
});

/**
 * An SSE client: `opening` on the stream's opening GET only, `posts` on
 * every POST of a message (each with the SAP headers).
 */
async function sseClient(
  port: number,
  sap: Record<string, string>,
  opening: Record<string, string> = {},
  posts: Record<string, string> = {},
): Promise<Client> {
  const client = new Client({ name: 'abapgit-binding', version: '1' });
  await client.connect(
    new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`), {
      requestInit: { headers: { ...sap, ...posts } },
      eventSourceInit: {
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            headers: { ...(init?.headers ?? {}), ...sap, ...opening },
          }),
      },
    }),
  );
  return client;
}

/** Other git headers, as a POST might carry them. */
const otherGitHeaders: Record<string, string> = {
  'x-abapgit-remote': REPO,
  'x-abapgit-user': 'post-user',
  'x-abapgit-token': 'post-token',
};

describe('real dispatch: where a call’s endpoint comes from', () => {
  let standIn: AdtStandIn;
  beforeEach(async () => {
    standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
  });
  afterEach(async () => {
    await standIn.close();
  });

  it('SSE: the opening GET’s headers are held by that stream’s instance, for every call, and by no other stream; a POST’s headers change nothing', async () => {
    const sse = new SseServer(registry(), { host: '127.0.0.1', port: 0 });
    await sse.start();
    const port = boundPort(sse);
    try {
      const stated = await sseClient(
        port,
        sapHeaders(standIn.url),
        gitHeaders,
        otherGitHeaders,
      );
      const postOnly = await sseClient(
        port,
        sapHeaders(standIn.url),
        {},
        otherGitHeaders,
      );
      const plain = await sseClient(port, sapHeaders(standIn.url));
      try {
        const call = (client: Client) =>
          client.callTool({ name: 'ListAbapGitRepos', arguments: {} });
        assert.equal(textOf(await call(stated)), 'header-user');
        assert.equal(textOf(await call(stated)), 'header-user');
        assert.equal(textOf(await call(plain)), 'none');
        // A POST's own git headers change nothing: the stream's are the
        // opening GET's, and a stream that stated none has none.
        assert.equal(textOf(await call(postOnly)), 'none');
      } finally {
        await stated.close();
        await plain.close();
        await postOnly.close();
      }
      // A stream opened after the first closed starts with none.
      const after = await sseClient(port, sapHeaders(standIn.url));
      try {
        assert.equal(
          textOf(
            await after.callTool({ name: 'ListAbapGitRepos', arguments: {} }),
          ),
          'none',
        );
      } finally {
        await after.close();
      }
    } finally {
      await sse.stop();
    }
  });

  it('Streamable HTTP: a second call on the same handle without the headers binds nothing', async () => {
    const mcp = new StreamableHttpServer(registry(), {
      host: '127.0.0.1',
      port: 0,
    });
    await mcp.start();
    const url = `http://127.0.0.1:${boundPort(mcp)}/mcp/stream/http`;
    let rpc = 1;
    const post = async (
      tool: string,
      headers: Record<string, string>,
    ): Promise<string> => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...sapHeaders(standIn.url),
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpc++,
          method: 'tools/call',
          params: { name: tool, arguments: {} },
        }),
      });
      const body: unknown = await response.json();
      const text =
        typeof body === 'object' &&
        body !== null &&
        'result' in body &&
        typeof body.result === 'object' &&
        body.result !== null &&
        'content' in body.result &&
        Array.isArray(body.result.content)
          ? body.result.content[0]?.text
          : undefined;
      return typeof text === 'string' ? text : '';
    };
    try {
      const opened: unknown = JSON.parse(await post('SessionOpen', {}));
      const handle =
        typeof opened === 'object' &&
        opened !== null &&
        'state_handle' in opened &&
        typeof opened.state_handle === 'string'
          ? opened.state_handle
          : '';
      assert.notEqual(handle, '');
      const onHandle = { 'x-mcp-state-handle': handle };
      assert.equal(
        await post('ListAbapGitRepos', { ...onHandle, ...gitHeaders }),
        'header-user',
      );
      assert.equal(await post('ListAbapGitRepos', onHandle), 'none');
      await post('SessionClose', onHandle);
    } finally {
      await mcp.stop();
    }
  });
});

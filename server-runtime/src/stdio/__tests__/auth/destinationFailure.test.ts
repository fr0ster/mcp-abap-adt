/**
 * core's failure reader: a `DestinationConfigError` is read
 * first — `destination_refused`, `Destination "<name>" cannot be used:
 * <fields>`, the carried error's hint then one fixed hint per known field,
 * `cause_kind` — then lib's `failureOf`. Through a real `--env` file too.
 */

import { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import { answerFailure } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { stateSystemKind } from '../../../../../src/__tests__/helpers/systemKind';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  DestinationRefusal,
  destinationFailureOf,
  destinationFailureWords,
  HINTS,
  JWT_NONE_HINT,
  UnsupportedAuthenticationError,
} from '../../auth/destinationFailure';
import { REFRESH_ONLY_SENTENCE } from '../../auth/serverSentences';
import { vetMeans } from '../../auth/vocabulary';
import { StdioServer } from '../../StdioServer';
import {
  authorizationCodeLines,
  type BrokerBase,
  brokerBase,
  factoryConfig,
  recordingLogins,
  SYSTEM_URL,
} from '../helpers/factoryFixture';

const KNOWN = {
  grantType:
    'Write the destination again with `mcp-auth --destination <name> --type abap|xsuaa` or `mcp-auth --service-key <file> --output <file> --type abap|xsuaa` (from @mcp-abap-adt/auth-broker-cli), or add SAP_GRANT_TYPE to its .env.',
  SAP_URL: "Set SAP_URL to the system's URL.",
  XSUAA_MCP_URL:
    "Set XSUAA_MCP_URL in the destination's sessions/<destination>.env to the system's URL.",
  'connection-type': 'SNC logs on over RFC: set --connection-type=rfc.',
  browser:
    'Start with --browser=none and open the URL the login prints on stderr, or give --browser-program=<program>.',
} as const;

function payload(thrown: unknown): Record<string, unknown> {
  const read = destinationFailureOf(thrown, { platform: 'linux' });
  if (read === undefined) throw new Error('expected a read failure');
  return JSON.parse(answerFailure(read).content[0].text);
}

describe('a DestinationConfigError', () => {
  // `browser` has a headline of its own (below).
  it.each(
    (Object.keys(KNOWN) as Array<keyof typeof KNOWN>).filter(
      (field) => field !== 'browser',
    ),
  )('names %s with its own hint and no other', (field) => {
    const answer = payload(
      new DestinationConfigError('dest', [field], 'fixed reason'),
    );
    expect(answer).toEqual({
      error: 'destination_refused',
      message: `Destination "dest" cannot be used: ${field}`,
      hint: KNOWN[field],
    });
  });

  it('the hints are the ones the server holds, and no other', () => {
    expect(HINTS).toEqual(KNOWN);
  });

  it('a field without a known remedy: the headline alone', () => {
    expect(
      payload(new DestinationConfigError('dest', ['uaaClientId'], 'r')),
    ).toEqual({
      error: 'destination_refused',
      message: 'Destination "dest" cannot be used: uaaClientId',
    });
  });

  it('several fields: one headline naming them, one hint per known field, each once', () => {
    const answer = payload(
      new DestinationConfigError(
        'dest',
        ['uaaUrl', 'SAP_URL', 'grantType', 'SAP_URL'],
        'r',
      ),
    );
    expect(answer.message).toBe(
      'Destination "dest" cannot be used: uaaUrl, SAP_URL, grantType, SAP_URL',
    );
    expect(answer.hint).toBe(`${KNOWN.SAP_URL}\n${KNOWN.grantType}`);
  });

  it('a carried error: its hint first, then the fields’ hints; cause_kind its kind', () => {
    const carried = authError['credential-refused']({ credential: 'token' });
    const error = new DestinationConfigError(
      'dest',
      ['grantType'],
      'r',
      carried,
    );
    const answer = payload(error);
    expect(answer.cause_kind).toBe('credential-refused');
    expect(answer.hint).toBe(
      [carried.hint, KNOWN.grantType].filter(Boolean).join('\n'),
    );
    expect(answer).not.toHaveProperty('kind');
  });

  it('carries no value read from a store', () => {
    let err: unknown;
    try {
      vetMeans('dest', {
        authType: 'jwt',
        grantType: 'made-up-grant-z9' as never,
      });
    } catch (e) {
      err = e;
    }
    const text = JSON.stringify(payload(err));
    expect(text).toContain('Destination \\"dest\\" cannot be used: grantType');
    expect(text).not.toContain('made-up-grant-z9');
  });

  it('browser alone: the browser headline naming the platform, and its hint', () => {
    const read = destinationFailureOf(
      new DestinationConfigError('default', ['browser'], 'r'),
      { platform: 'freebsd' },
    );
    expect(read).toEqual({
      error: 'destination_refused',
      message:
        'Destination "default" logs in through a browser, and none is known on this platform (freebsd)',
      hint: 'Start with --browser=none and open the URL the login prints on stderr, or give --browser-program=<program>.',
    });
  });
});

describe('core’s own refusals and the rest', () => {
  it('an unsupported authentication: destination_refused in its words', () => {
    expect(
      payload(
        new UnsupportedAuthenticationError('dest', 'jwt', 'client_credentials'),
      ),
    ).toEqual({
      error: 'destination_refused',
      message:
        'Destination "dest" uses jwt / client_credentials, which this server does not support',
    });
  });

  it('a DestinationRefusal: destination_refused in its vetted words', () => {
    expect(
      payload(new DestinationRefusal('--env-path: no such file.')),
    ).toEqual({
      error: 'destination_refused',
      message: '--env-path: no such file.',
    });
  });

  it("a chain failure: lib's reading, with the server's sentence when it has one", () => {
    const error = authError['renewal-declined']({ trigger: 'expired' });
    const read = destinationFailureOf(new AuthProviderFailure(error), {
      sentenceFor: (e) => (e.kind === 'renewal-declined' ? 'S.' : undefined),
    });
    expect(read?.error).toBe('authentication_failed');
    expect(read?.server).toBe('S.');
  });

  it('anything else: undefined; its words are the class only', () => {
    const thrown = new SyntaxError('Unexpected token in "PLACEHOLDERSECRET"');
    expect(destinationFailureOf(thrown)).toBeUndefined();
    expect(destinationFailureWords(thrown, 'dest')).toBe(
      'Destination "dest" cannot be read: SyntaxError',
    );
  });
});

describe('through a real --env file (broker 5.0.1)', () => {
  let base: BrokerBase;
  beforeEach(() => {
    base = brokerBase('destination-failure');
  });
  afterEach(() => base.remove());

  it('jwt / none: refused as unsupported, with the hint where a token you hold goes', async () => {
    const file = base.writeFile('conn.env', [
      `SAP_URL=${SYSTEM_URL}`,
      'SAP_AUTH_TYPE=jwt',
      'SAP_GRANT_TYPE=none',
      'SAP_JWT_TOKEN=placeholder-token-value',
    ]);
    const factory = new AuthBrokerFactory(
      factoryConfig(base, recordingLogins(), {
        envFile: { path: file, source: '--env' },
      }),
    );
    let thrown: unknown;
    try {
      await factory.getProvider('default');
    } catch (e) {
      thrown = e;
    }
    expect(payload(thrown)).toEqual({
      error: 'destination_refused',
      message:
        'Destination "default" uses jwt / none, which this server does not support',
      hint: JWT_NONE_HINT,
    });
    expect(JSON.stringify(payload(thrown))).not.toContain(
      'placeholder-token-value',
    );
  });

  it("jwt / authorization_code whose SAP_ISSUED_* name another destination's means: not refused — the broker does not use the stored session (measured)", async () => {
    // Broker 5.0.1 refuses naming issuedFor / issuedBy only for a
    // handed-over credential, which no handler of stdio serves any more, so
    // the server holds no hint for them. For a grant the provider obtains,
    // broker 5.0.1 discards a session bound elsewhere and the provider obtains a new one.
    const warnings: string[] = [];
    const file = base.writeFile('conn.env', [
      ...authorizationCodeLines(),
      'SAP_JWT_TOKEN=placeholder-token-value',
      'SAP_REFRESH_TOKEN=placeholder-refresh-value',
      'SAP_ISSUED_FOR=https://other-system.example.test',
      'SAP_ISSUED_BY=placeholder-record-of-other-means',
    ]);
    const factory = new AuthBrokerFactory(
      factoryConfig(base, recordingLogins(), {
        envFile: { path: file, source: '--env' },
        logger: {
          info: () => {},
          debug: () => {},
          error: () => {},
          warn: (line: string) => warnings.push(line),
        },
      }),
    );
    await expect(factory.getProvider('default')).resolves.toBeDefined();
    expect(warnings).toEqual([
      "[AuthBroker] default: the stored session secret is not recorded as issued under the destination's current means; not used, the provider obtains a new one",
    ]);
  });
});

describe('a tool call on core (StdioServer): the server sentence beside the chain failure', () => {
  let base: BrokerBase;
  beforeEach(() => {
    base = brokerBase('destination-failure-tool');
    // The system kind is required: an authorization-code stand-in on cloud.
    stateSystemKind('cloud');
  });
  afterEach(() => base.remove());

  it('--renewal=refresh-only with no session: authentication_failed, renewal-declined, server: the refresh-only sentence', async () => {
    const file = base.writeFile('conn.env', authorizationCodeLines());
    const factory = new AuthBrokerFactory(
      factoryConfig(base, recordingLogins(), {
        envFile: { path: file, source: '--env' },
        renewal: 'refresh-only',
      }),
    );
    const reached = jest.fn();
    const group = {
      getName: () => 'stub',
      getHandlers: () => [
        {
          toolDefinition: {
            name: 'StubTool',
            description: 'a tool that would read the system',
            inputSchema: { type: 'object', properties: {} },
          },
          handler: async () => {
            reached();
            return { content: [{ type: 'text', text: 'read' }] };
          },
        },
      ],
      registerHandlers: () => {},
    };
    const server = new StdioServer(
      new CompositeHandlersRegistry([group as never]),
      factory,
      { sentenceFor: (error) => factory.sentenceFor(error) },
    );
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    try {
      await Promise.all([
        server.start('default', serverSide),
        client.connect(clientSide),
      ]);
      const result = (await client.callTool({
        name: 'StubTool',
        arguments: {},
      })) as { isError?: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      const answer = JSON.parse(result.content[0].text);
      expect(answer.error).toBe('authentication_failed');
      expect(answer.kind).toBe('renewal-declined');
      expect(answer.server).toBe(REFRESH_ONLY_SENTENCE);
      expect(reached).not.toHaveBeenCalled();
    } finally {
      await client.close();
      stderr.mockRestore();
    }
  });
});

/**
 * What the MCP client sees of a failure (spec §7.3): the JSON answer, row by
 * row, and what never reaches it. The stderr line is `logFields`.
 */

import {
  AuthProviderFailure,
  authError,
  logFields,
  renderDiagnostics,
} from '@mcp-abap-adt/auth-errors';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { answer, return_answer } from '../../../lib/answer';
import {
  answerFailure,
  failureLogFields,
  failureLogLine,
} from '../../../lib/auth/answerFailure';
import { failureOf, type ReadFailure } from '../../../lib/auth/failures';
import {
  CREDENTIALS_REQUIRED_WORDS,
  FRESH_CONNECTION_UNAVAILABLE_WORDS,
  INSPECTION_ONLY_WORDS,
  ServerRefusal,
} from '../../../lib/auth/serverRefusal';
import { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { return_error } from '../../../lib/utils';
import { withoutSystemInformation } from '../../helpers/noSystemInformation';
import { stateSystemKind } from '../../helpers/systemKind';

const ALLOWED_KEYS = [
  'error',
  'kind',
  'message',
  'hint',
  'cause_kind',
  'server',
] as const;

function payloadOf(read: ReadFailure): Record<string, unknown> {
  const answer = answerFailure(read);
  expect(answer.isError).toBe(true);
  expect(answer.content).toHaveLength(1);
  expect(answer.content[0].type).toBe('text');
  return JSON.parse(answer.content[0].text);
}

function read(thrown: unknown): ReadFailure {
  const failure = failureOf(thrown);
  if (failure === undefined) throw new Error('expected a read failure');
  return failure;
}

/** A query-bearing URI carrying a `state`: diagnostics only, never the answer. */
const URI_WITH_STATE =
  'https://idp.example.test/callback?state=STATE-SECRET-1&code=CODE-SECRET-2';
const URI_PLAIN = 'https://idp.example.test/other-callback';

describe('the §7.3 answer, row by row', () => {
  it('a chain failure: authentication_failed, its kind, reason and hint', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const payload = payloadOf(read(new AuthProviderFailure(error)));
    expect(payload).toEqual({
      error: 'authentication_failed',
      kind: 'credential-refused',
      message: error.reason,
      ...(error.hint !== undefined ? { hint: error.hint } : {}),
    });
  });

  it("a chain failure with the server's sentence: server beside it", () => {
    const error = authError['renewal-declined']({ trigger: 'expired' });
    const payload = payloadOf({
      ...read(new AuthProviderFailure(error)),
      server: 'Logins are off.',
    });
    expect(payload.server).toBe('Logins are off.');
    expect(payload.kind).toBe('renewal-declined');
  });

  it('a destination refusal: destination_refused, cause_kind, no kind', () => {
    const payload = payloadOf({
      error: 'destination_refused',
      message: 'Destination "d" cannot be used: issuedBy',
      hint: 'a hint',
      causeKind: 'configuration',
    });
    expect(payload).toEqual({
      error: 'destination_refused',
      message: 'Destination "d" cannot be used: issuedBy',
      hint: 'a hint',
      cause_kind: 'configuration',
    });
  });

  it.each([
    [
      'inspection_only',
      new ServerRefusal('inspection_only'),
      INSPECTION_ONLY_WORDS,
    ],
    [
      'fresh_connection_unavailable',
      new ServerRefusal('fresh_connection_unavailable'),
      FRESH_CONNECTION_UNAVAILABLE_WORDS,
    ],
    [
      'credentials_required',
      new ServerRefusal('credentials_required'),
      CREDENTIALS_REQUIRED_WORDS,
    ],
    [
      'destination_refused',
      new ServerRefusal('destination_refused', '--mcp: refused.'),
      '--mcp: refused.',
    ],
  ])(
    "the server's own refusal %s: its code and fixed words",
    (code, thrown, words) => {
      expect(payloadOf(read(thrown))).toEqual({ error: code, message: words });
    },
  );
});

describe('never in the answer', () => {
  const error = authError.configuration(
    { case: 'redirect-mismatch', fields: ['authorizationUrl'] },
    { configuredUri: URI_PLAIN, strategyUri: URI_WITH_STATE },
  );

  it('the fixture carries diagnostics (else the test proves nothing)', () => {
    expect(renderDiagnostics(error)).toBeDefined();
  });

  it('diagnostics, facts beyond kind, a thrown message, a URL with a query, state', () => {
    const thrown = {
      refusal: error,
      message: `refused at ${URI_WITH_STATE}`,
    };
    const answer = answerFailure(read(thrown));
    const text = answer.content[0].text;
    const payload = JSON.parse(text);
    for (const key of Object.keys(payload)) {
      expect(ALLOWED_KEYS).toContain(key);
    }
    expect(text).not.toContain('diagnostics');
    expect(text).not.toContain('facts');
    expect(text).not.toContain('redirect-mismatch');
    expect(text).not.toContain(URI_PLAIN);
    expect(text).not.toContain('?state=');
    expect(text).not.toContain('STATE-SECRET-1');
    expect(text).not.toContain('CODE-SECRET-2');
    expect(text).not.toContain('refused at');
  });
});

describe('the stderr line', () => {
  it('is logFields of the chain error — its diagnostics go there', () => {
    const error = authError.configuration(
      { case: 'redirect-mismatch', fields: ['authorizationUrl'] },
      { configuredUri: URI_PLAIN, strategyUri: URI_PLAIN },
    );
    const failure = read(new AuthProviderFailure(error));
    expect(failureLogFields(failure)).toEqual(logFields(error));
    const line = failureLogLine('MCP', failure);
    expect(line).toBe(
      `[MCP] authentication_failed: ${JSON.stringify(logFields(error))}`,
    );
    expect(line).toContain('diagnostics');
  });

  it('a failure with no chain error: fixed words and its code only', () => {
    const failure = read(new ServerRefusal('inspection_only'));
    expect(failureLogFields(failure)).toBeUndefined();
    expect(failureLogLine('MCP', failure)).toBe('[MCP] inspection_only');
  });
});

describe('the answer sites read the failure first (§7.2)', () => {
  const error = authError['credential-refused']({ credential: 'token' });
  const expected = {
    error: 'authentication_failed',
    kind: 'credential-refused',
    message: error.reason,
    ...(error.hint !== undefined ? { hint: error.hint } : {}),
  };
  const ctx = { tool: 'GetThing', detail: 'terse' as const };
  /** The one stderr line every site writes: fixed words + logFields. */
  const LINE = `[MCP] authentication_failed: ${JSON.stringify(logFields(error))}\n`;
  let written: string[];
  let stderr: jest.SpyInstance;
  beforeEach(() => {
    stateSystemKind();
    written = [];
    stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
  });
  afterEach(() => stderr.mockRestore());

  it('return_error: a thrown chain failure, not its message', () => {
    const thrown = { refusal: error, message: 'server text SECRET-3' };
    const result = return_error(thrown);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual(expected);
    expect(written).toEqual([LINE]);
  });

  it("return_answer: an IAdtError carrying a refusal (P6), not failurePayload's message", () => {
    const failed = {
      ok: false,
      getResult: () => {
        throw new Error('not a success');
      },
      getError: () => ({
        origin: 'connection',
        message: 'server text SECRET-4',
        refusal: error,
      }),
    } as unknown as IAdtResponse<never, IAdtError>;
    const result = return_answer(failed, (v) => v, ctx);
    expect(JSON.parse(result.content[0].text)).toEqual(expected);
    expect(written).toEqual([LINE]);
  });

  it('answer(): a thrown refusal, not client_threw with its message', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw { refusal: error, message: 'server text SECRET-5' };
      },
      (v) => v,
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual(expected);
    expect(written).toEqual([LINE]);
  });

  it("BaseHandlerGroup's registration path: the same answer and the same line", async () => {
    class Group extends BaseHandlerGroup {
      protected groupName = 'stub-group';
      getHandlers() {
        return [
          {
            toolDefinition: {
              name: 'StubThrowsRefusal',
              description: 'a tool whose call is refused',
              inputSchema: { type: 'object', properties: {} },
            },
            handler: async () => {
              throw new AuthProviderFailure(error);
            },
          },
        ] as never;
      }
    }
    const server = new McpServer({ name: 'group-test', version: '1.0.0' });
    new CompositeHandlersRegistry([
      new Group({
        connection: withoutSystemInformation() as never,
        logger: undefined as never,
      }),
    ]).registerAllTools(server);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const result = (await client.callTool({
        name: 'StubThrowsRefusal',
        arguments: {},
      })) as { isError?: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text)).toEqual(expected);
      expect(written).toEqual([LINE]);
    } finally {
      await client.close();
    }
  });
});

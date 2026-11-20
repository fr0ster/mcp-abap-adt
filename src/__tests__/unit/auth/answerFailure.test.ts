import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { format } from 'node:util';
import * as z from 'zod';
/**
 * What the MCP client sees of a failure: the JSON answer, row by
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
import { withSystemInformation } from '../../helpers/systemInformationStandIn';
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
  assert.equal(answer.isError, true);
  assert.equal(answer.content.length, 1);
  assert.equal(answer.content[0].type, 'text');
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

describe('the failure answer, row by row', () => {
  it('a chain failure: authentication_failed, its kind, reason and hint', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const payload = payloadOf(read(new AuthProviderFailure(error)));
    assert.deepStrictEqual(payload, {
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
    assert.equal(payload.server, 'Logins are off.');
    assert.equal(payload.kind, 'renewal-declined');
  });

  it('a destination refusal: destination_refused, cause_kind, no kind', () => {
    const payload = payloadOf({
      error: 'destination_refused',
      message: 'Destination "d" cannot be used: issuedBy',
      hint: 'a hint',
      causeKind: 'configuration',
    });
    assert.deepStrictEqual(payload, {
      error: 'destination_refused',
      message: 'Destination "d" cannot be used: issuedBy',
      hint: 'a hint',
      cause_kind: 'configuration',
    });
  });

  for (const [code, thrown, words] of [
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
  ]) {
    it(
      format("the server's own refusal %s: its code and fixed words", code),
      () => {
        assert.deepStrictEqual(payloadOf(read(thrown)), {
          error: code,
          message: words,
        });
      },
    );
  }
});

describe('never in the answer', () => {
  const error = authError.configuration(
    { case: 'redirect-mismatch', fields: ['authorizationUrl'] },
    { configuredUri: URI_PLAIN, strategyUri: URI_WITH_STATE },
  );

  it('the fixture carries diagnostics (else the test proves nothing)', () => {
    assert.notEqual(renderDiagnostics(error), undefined);
  });

  it('diagnostics, facts beyond kind, a thrown message, a URL with a query, state', () => {
    const thrown = {
      refusal: error,
      message: `refused at ${URI_WITH_STATE}`,
    };
    const answer = answerFailure(read(thrown));
    const text = answer.content[0].text;
    const payload = JSON.parse(text);
    const allowed: readonly string[] = ALLOWED_KEYS;
    for (const key of Object.keys(payload)) {
      assert.ok(allowed.includes(key));
    }
    assert.ok(!text.includes('diagnostics'));
    assert.ok(!text.includes('facts'));
    assert.ok(!text.includes('redirect-mismatch'));
    assert.ok(!text.includes(URI_PLAIN));
    assert.ok(!text.includes('?state='));
    assert.ok(!text.includes('STATE-SECRET-1'));
    assert.ok(!text.includes('CODE-SECRET-2'));
    assert.ok(!text.includes('refused at'));
  });
});

describe('the stderr line', () => {
  it('is logFields of the chain error — its diagnostics go there', () => {
    const error = authError.configuration(
      { case: 'redirect-mismatch', fields: ['authorizationUrl'] },
      { configuredUri: URI_PLAIN, strategyUri: URI_PLAIN },
    );
    const failure = read(new AuthProviderFailure(error));
    assert.deepStrictEqual(failureLogFields(failure), logFields(error));
    const line = failureLogLine('MCP', failure);
    assert.equal(
      line,
      `[MCP] authentication_failed: ${JSON.stringify(logFields(error))}`,
    );
    assert.ok(line.includes('diagnostics'));
  });

  it('a failure with no chain error: fixed words and its code only', () => {
    const failure = read(new ServerRefusal('inspection_only'));
    assert.equal(failureLogFields(failure), undefined);
    assert.equal(failureLogLine('MCP', failure), '[MCP] inspection_only');
  });
});

describe('the answer sites read the failure first', () => {
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
  let stderr: Mock<typeof process.stderr.write>;
  beforeEach(() => {
    stateSystemKind();
    written = [];
    stderr = mock.method(process.stderr, 'write', (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
  });
  afterEach(() => stderr.mock.restore());

  it('return_error: a thrown chain failure, not its message', () => {
    const thrown = { refusal: error, message: 'server text SECRET-3' };
    const result = return_error(thrown);
    assert.equal(result.isError, true);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), expected);
    assert.deepStrictEqual(written, [LINE]);
  });

  it("return_answer: an IAdtError carrying a refusal, not failurePayload's message", () => {
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
    assert.deepStrictEqual(JSON.parse(result.content[0].text), expected);
    assert.deepStrictEqual(written, [LINE]);
  });

  it('answer(): a thrown refusal, not client_threw with its message', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw { refusal: error, message: 'server text SECRET-5' };
      },
      (v) => v,
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), expected);
    assert.deepStrictEqual(written, [LINE]);
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
              inputSchema: z.object({}),
            },
            call: async () => {
              throw new AuthProviderFailure(error);
            },
          },
        ] as never;
      }
    }
    const server = new McpServer({ name: 'group-test', version: '1.0.0' });
    new CompositeHandlersRegistry([
      new Group({
        connection: withSystemInformation() as never,
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
      assert.equal(result.isError, true);
      assert.deepStrictEqual(JSON.parse(result.content[0].text), expected);
      assert.deepStrictEqual(written, [LINE]);
    } finally {
      await client.close();
    }
  });
});

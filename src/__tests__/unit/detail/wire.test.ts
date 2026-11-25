/**
 * `raw` is what ADT sent (`src/lib/detail/wire.ts`): the bodies a call's
 * connection answered, in order — one document as it came, or the array of
 * them — and a failure answered as it is.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  notOneDocumentWords,
  partStatuses,
  recordedBody,
  recordedWire,
  wireAnswer,
  wireText,
} from '../../../lib/detail';
import { recordingConnection } from '../../helpers/recordingConnection';

const get = (url: string) => ({ method: 'GET', url, timeout: 0 });

describe('raw is what ADT sent', () => {
  it('records every body the connection answered during the call, in order', async () => {
    const connection = recordingConnection([
      { data: '<a/>' },
      { data: '<b/>' },
    ]);
    const own = connection.makeAdtRequest;
    const { result, documents } = await recordedWire(connection, async () => {
      await connection.makeAdtRequest(get('/one'));
      await connection.makeAdtRequest(get('/two'));
      return 'done';
    });
    assert.equal(result, 'done');
    assert.deepStrictEqual(documents, [
      { status: 200, body: '<a/>' },
      { status: 200, body: '<b/>' },
    ]);
    // The connection is its own again: nothing recorded after the call.
    assert.equal(connection.makeAdtRequest, own);
  });

  it('gives the connection back when the call throws', async () => {
    const connection = recordingConnection();
    const own = connection.makeAdtRequest;
    await assert.rejects(
      recordedWire(connection, async () => {
        throw new Error('the call failed');
      }),
    );
    assert.equal(connection.makeAdtRequest, own);
  });

  it('one read answers its body; an assembling tool, the array of the responses', () => {
    const a = { status: 200, body: '<a/>' };
    const b = { status: 404, body: '<b "x"/>' };
    assert.equal(wireText([a], 'one'), '<a/>');
    assert.equal(wireText([a, b], 'assembled'), JSON.stringify([a, b]));
    assert.equal(wireText([a], 'assembled'), JSON.stringify([a]));
  });

  // Codex round 6, P1-2: raw is every response, failures too — a failed
  // read is the failed response, never a gap.
  it('records a refused response, answered or thrown, as it came, and rethrows', async () => {
    const connection = recordingConnection([
      { data: '<a/>' },
      { data: 'refused', status: 500 },
    ]);
    const answering = connection.makeAdtRequest.bind(connection);
    let sent = 0;
    connection.makeAdtRequest = async (request: never) => {
      sent += 1;
      if (sent < 3) return answering(request);
      throw Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401, headers: {}, data: { message: 'no' } },
      });
    };
    const thrown = new Error('kept');
    const { documents } = await recordedWire(connection, async () => {
      await connection.makeAdtRequest(get('/one'));
      await connection.makeAdtRequest(get('/two'));
      await assert.rejects(connection.makeAdtRequest(get('/three')), /401/);
      return thrown;
    });
    assert.deepStrictEqual(documents, [
      { status: 200, body: '<a/>' },
      { status: 500, body: 'refused' },
      { status: 401, body: '{"message":"no"}' },
    ]);
  });

  it("a success's text is the wire; a failure is answered as it is", async () => {
    const connection = recordingConnection([
      { data: '<a/>' },
      { data: '<b/>' },
    ]);
    const of = { connection, tool: 'Tool', shape: 'assembled' } as const;
    const answered = await wireAnswer(of, async () => {
      await connection.makeAdtRequest(get('/one'));
      await connection.makeAdtRequest(get('/two'));
      return {
        isError: false,
        content: [{ type: 'text', text: '{"parsed":true}' }],
      };
    });
    assert.deepStrictEqual(answered.content, [
      {
        type: 'text',
        text: JSON.stringify([
          { status: 200, body: '<a/>' },
          { status: 200, body: '<b/>' },
        ]),
      },
    ]);
    const failure = {
      isError: true,
      content: [{ type: 'text' as const, text: '{"error":"refused"}' }],
    };
    assert.deepStrictEqual(await wireAnswer(of, async () => failure), failure);
  });

  // Raw never hides an error (Codex round 5, P1-4): an answer that explains
  // an error inside it is answered as `full` answers it.
  for (const [label, text] of [
    [
      'an entry with its error',
      '[{"feed_type":"dumps","error":{"message":"x"}}]',
    ],
    [
      'a non-empty failures list',
      '{"objects":[],"failures":[{"step":"read"}]}',
    ],
    // Codex round 9: what full reports unreadable is a failed read too.
    [
      'an include that could not be read',
      '{"tree":{},"unreadable":[{"name":"ZI"}]}',
    ],
    [
      'an append candidate that could not be read',
      '{"tree":{},"append_candidates_unread":[{"candidate":"ZA"}]}',
    ],
    [
      'an include walk not read',
      '{"objects":[],"includes_unread":[{"name":"ZI"}]}',
    ],
    [
      'appends that could not be determined',
      '{"tree":{},"appends_unavailable":true}',
    ],
  ] as const) {
    it(`${label}: answered as full answers it, not as the documents`, async () => {
      const connection = recordingConnection([{ data: '<a/>' }]);
      const explained = {
        isError: false,
        content: [{ type: 'text' as const, text }],
      };
      const answered = await wireAnswer(
        { connection, tool: 'Tool', shape: 'assembled' },
        async () => {
          await connection.makeAdtRequest(get('/one'));
          return explained;
        },
      );
      assert.deepStrictEqual(answered, { ...explained, isError: true });
    });
  }

  // The owner's ruling (Codex round 7): raw and full give the same error
  // when the exchange itself failed; on a parse failure — every exchange
  // answered — raw still gives the documents.
  it('a parse failure after answered exchanges: raw gives the documents', async () => {
    const connection = recordingConnection([{ data: '<html/>' }]);
    const answered = await wireAnswer(
      { connection, tool: 'Tool', shape: 'one' },
      async () => {
        await connection.makeAdtRequest(get('/one'));
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: '{"error":"not an outline"}' },
          ],
        };
      },
    );
    assert.equal(answered.isError, false);
    assert.equal(answered.content[0]?.text, '<html/>');
  });

  it('a refused exchange: raw gives the same error as full', async () => {
    const connection = recordingConnection([{ status: 500, data: 'refused' }]);
    const failure = {
      isError: true,
      content: [{ type: 'text' as const, text: '{"error":"refused"}' }],
    };
    const answered = await wireAnswer(
      { connection, tool: 'Tool', shape: 'assembled' },
      async () => {
        await connection.makeAdtRequest(get('/one'));
        return failure;
      },
    );
    assert.deepStrictEqual(answered, failure);
  });

  it('a one-read tool whose call read two documents: an error, not the first', async () => {
    const connection = recordingConnection([
      { data: '<a/>' },
      { data: '<b/>' },
    ]);
    const answered = await wireAnswer(
      { connection, tool: 'Tool', shape: 'one' },
      async () => {
        await connection.makeAdtRequest(get('/one'));
        await connection.makeAdtRequest(get('/two'));
        return { isError: false, content: [{ type: 'text', text: '{}' }] };
      },
    );
    assert.equal(answered.isError, true);
    assert.deepStrictEqual(JSON.parse(answered.content[0]?.text ?? ''), {
      error: 'raw_shape',
      tool: 'Tool',
      message: notOneDocumentWords('Tool', 2),
    });
  });

  // The body as the connection gives it (Codex round 5): an object as its
  // JSON text, never `[object Object]`; bytes as UTF-8.
  // Codex round 9: a part's status line read as the batch client reads it.
  it('reads every part status, whatever whitespace stands before the code', () => {
    const body = [
      '--b',
      'HTTP/1.1 200 OK',
      '--b',
      'HTTP/1.1\t\t500 Internal',
      '--b',
      'HTTP/1.0   404\r',
      '--b',
      'HTTP/1.1 2000 no',
      'http/1.1 403',
    ].join('\n');
    assert.deepStrictEqual(partStatuses(body), [200, 500, 404, 403]);
  });

  it('a thrown envelope: its parts answered outside 2xx are failed reads', async () => {
    const connection = recordingConnection([]);
    connection.makeAdtRequest = async () => {
      throw Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          headers: {},
          data: '--b\nHTTP/1.1  500 Internal\n--b--',
        },
      });
    };
    const { failedParts } = await recordedWire(connection, async () => {
      await assert.rejects(
        connection.makeAdtRequest(get('/sap/bc/adt/communication/batch')),
      );
    });
    assert.equal(failedParts, 1);
  });

  it('records an object body as its JSON text, bytes as UTF-8', () => {
    assert.equal(
      recordedBody({ userName: 'U', n: 1 }),
      '{"userName":"U","n":1}',
    );
    assert.equal(recordedBody([1, 'a']), '[1,"a"]');
    assert.equal(recordedBody(new TextEncoder().encode('<ä/>')), '<ä/>');
    assert.equal(recordedBody(undefined), '');
    assert.equal(recordedBody('<a/>'), '<a/>');
  });
});

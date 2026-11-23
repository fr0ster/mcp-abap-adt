/**
 * `raw` is what ADT sent (`src/lib/detail/wire.ts`): the bodies a call's
 * connection answered, in order — one document as it came, or the array of
 * them — and a failure answered as it is.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  notOneDocumentWords,
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
    assert.deepStrictEqual(documents, ['<a/>', '<b/>']);
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

  it('one read answers its document; several, the array of them', () => {
    assert.equal(wireText(['<a/>'], 'one'), '<a/>');
    assert.equal(
      wireText(['<a/>', '<b "x"/>'], 'assembled'),
      JSON.stringify(['<a/>', '<b "x"/>']),
    );
    assert.equal(wireText(['<a/>'], 'assembled'), '["<a/>"]');
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
      { type: 'text', text: '["<a/>","<b/>"]' },
    ]);
    const failure = {
      isError: true,
      content: [{ type: 'text' as const, text: '{"error":"refused"}' }],
    };
    assert.equal(await wireAnswer(of, async () => failure), failure);
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
      assert.equal(answered, explained);
    });
  }

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

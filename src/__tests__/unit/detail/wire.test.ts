/**
 * `raw` is what ADT sent (`src/lib/detail/wire.ts`): the bodies a call's
 * connection answered, in order — one document as it came, or the array of
 * them — and a failure answered as it is.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recordedWire, wireAnswer, wireText } from '../../../lib/detail';
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
    const answered = await wireAnswer(connection, 'assembled', async () => {
      await connection.makeAdtRequest(get('/one'));
      await connection.makeAdtRequest(get('/two'));
      return { content: [{ type: 'text', text: '{"parsed":true}' }] };
    });
    assert.deepStrictEqual(answered.content, [
      { type: 'text', text: '["<a/>","<b/>"]' },
    ]);
    const failure = {
      isError: true,
      content: [{ type: 'text', text: '{"error":"refused"}' }],
    };
    assert.equal(
      await wireAnswer(connection, 'one', async () => failure),
      failure,
    );
  });
});

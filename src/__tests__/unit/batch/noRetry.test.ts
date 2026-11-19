/**
 * No retries in batch mode (spec §4.7): a part answered `406` or `415` is that
 * call's answer, nothing recorded is corrected or sent again — neither a part
 * (a recorded call runs as one, `asRecordedCall`: its header-taking calls are
 * made once) nor an envelope. Outside a batch, the server's format correction
 * (`withAdtHeaders`) corrects a header-taking call once.
 *
 * Real adt-clients code throughout (`AdtBatchConnection`, `AdtClient`); only
 * the connections are fakes.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import * as connectionFactory from '../../../lib/connectionFactory';
import { assertMatchObject } from '../../helpers/assertions';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import {
  envelopeConnection,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';
import { holding } from '../../helpers/heldLocks';
import {
  SAP_EXCEPTION_HEADERS,
  unsupportedMediaTypeBody,
} from '../../helpers/sapRefusals';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
mock.method(connectionFactory, 'createAbapConnection', () => undefined);

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** The one media type SAP takes here — not the one adt-clients sends. */
const SUPPORTED = 'application/vnd.placeholder.source+text';

/**
 * SAP accepts only `Accept: SUPPORTED` for a source read (406 naming it
 * otherwise) and only `Content-Type: SUPPORTED` for a source write (415
 * naming it otherwise).
 */
function picky(inner: InnerRequest): PartAnswer {
  if (inner.method === 'GET') {
    return inner.headers.accept === SUPPORTED
      ? { status: 200, statusText: 'OK', body: 'source text' }
      : {
          status: 406,
          statusText: 'Not Acceptable',
          body: `<exc:exception><message>The message content is not acceptable. Accepted content types: ${SUPPORTED}</message></exc:exception>`,
        };
  }
  if (inner.method === 'PUT') {
    return inner.headers['content-type'] === SUPPORTED
      ? { status: 200, statusText: 'OK' }
      : {
          status: 415,
          statusText: 'Unsupported Media Type',
          headers: SAP_EXCEPTION_HEADERS,
          body: unsupportedMediaTypeBody(SUPPORTED),
        };
  }
  return { status: 200, statusText: 'OK' };
}

const WRITE = {
  object_type: 'PROGRAM',
  program_name: 'PROG_A',
  source_code: 'source text',
  lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
  transport_request: 'XXXK900001',
};

describe('no retry in batch mode', () => {
  it("406 (supported Accept named) and 415 parts are the calls' answers; each request sent once; no follow-up envelope", async () => {
    const s = await batchStand({
      heldLocks: holding('LOCK_HANDLE_PLACEHOLDER'),
      tools: ['HandlerGet', 'HandlerUpdate'],
      part: picky,
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.call('HandlerUpdate', WRITE);
    const { summary } = await s.end();
    assert.deepStrictEqual(summary, { recorded: 2, sent: 2, received: 2 });
    const envelopes = s.built.flatMap((b) => b.envelopes);
    assert.equal(envelopes.length, 1);
    assert.deepStrictEqual(
      envelopes[0]?.parts.map((p) => p.method),
      ['GET', 'PUT'],
    );
    const [read, write] = await s.answers([1, 2]);
    assertMatchObject(payloadOf(read as never), { status: 406 });
    assertMatchObject(payloadOf(write as never), { status: 415 });
    // Nothing else reached the connection.
    assert.deepStrictEqual(
      s.built.flatMap((b) => b.directs),
      [],
    );
    await s.close();
  });

  it('an envelope answered 406 is not sent again', async () => {
    const s = await batchStand({
      heldLocks: holding('LOCK_HANDLE_PLACEHOLDER'),
      tools: ['HandlerGet'],
      part: picky,
      // SAP refuses the envelope itself 406, naming another Accept.
      envelope: async () => {
        throw statusError(406, 'Not Acceptable', '', {
          accept: 'application/vnd.sap.adt.batch+mixed',
        });
      },
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    const { answer, summary } = await s.end();
    // the batch end's error, as it came; its one number answers the same.
    assert.equal(answer.isError, true);
    assertMatchObject(summary, { status: 406, step: 'execute' });
    const [entry] = await s.answers([1]);
    assert.deepStrictEqual(entry, { number: 1, ...answer });
    const envelopes = s.built.flatMap((b) => b.envelopes);
    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0]?.accept, 'multipart/mixed');
    await s.close();
  });

  it('outside a batch a header-taking call answered 415 is sent once more with the named Content-Type', async () => {
    const s = await batchStand({
      heldLocks: holding('LOCK_HANDLE_PLACEHOLDER'),
      tools: ['HandlerUpdate'],
      part: picky,
    });
    const answer = await s.call('HandlerUpdate', WRITE);
    assert.ok(!answer.isError);
    const puts = s.built
      .flatMap((b) => b.directs)
      .filter((d) => d.method === 'PUT');
    assert.equal(puts.length, 2);
    const contentType = (i: number) =>
      Object.entries(puts[i]?.headers ?? {}).find(
        ([k]) => k.toLowerCase() === 'content-type',
      )?.[1];
    assert.notEqual(contentType(0), SUPPORTED);
    assert.equal(contentType(1), SUPPORTED);
    await s.close();
  });
});

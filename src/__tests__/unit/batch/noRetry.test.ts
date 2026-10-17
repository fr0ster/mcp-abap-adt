/**
 * No retries in batch mode (spec §4.7): a part answered `406` or `415` is that
 * call's answer, nothing recorded is corrected or sent again — neither a part
 * (the recorder is marked `exemptFromAcceptNegotiation`) nor an envelope (the
 * late-bound target sends it through the pointed connection's base request,
 * past the accept negotiation an `AdtClient` installed on the instance's
 * connection outside a batch). Outside a batch, negotiation works as before.
 *
 * Real adt-clients code throughout (`AdtBatchConnection`, `AdtClient`, accept
 * negotiation); only the connections are fakes.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import {
  envelopeConnection,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';

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
          headers: { accept: SUPPORTED },
        };
  }
  if (inner.method === 'PUT') {
    return inner.headers['content-type'] === SUPPORTED
      ? { status: 200, statusText: 'OK' }
      : {
          status: 415,
          statusText: 'Unsupported Media Type',
          headers: { 'content-type': SUPPORTED },
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
      tools: ['GetProgram', 'HandlerUpdate'],
      part: picky,
    });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.call('HandlerUpdate', WRITE);
    const { summary } = await s.end();
    expect(summary).toEqual({ recorded: 2, failed: [1, 2] });
    const envelopes = s.built.flatMap((b) => b.envelopes);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.parts.map((p) => p.method)).toEqual(['GET', 'PUT']);
    const [read, write] = await s.answers([1, 2]);
    expect(payloadOf(read as never)).toMatchObject({ status: 406 });
    expect(payloadOf(write as never)).toMatchObject({ status: 415 });
    // Nothing else reached the connection.
    expect(s.built.flatMap((b) => b.directs)).toEqual([]);
    await s.close();
  });

  it('an envelope answered 406 is not sent again', async () => {
    const s = await batchStand({
      tools: ['GetProgram'],
      part: picky,
      // SAP refuses the envelope itself 406, naming another Accept.
      envelope: async () => {
        throw statusError(406, 'Not Acceptable', '', {
          accept: 'application/vnd.sap.adt.batch+mixed',
        });
      },
    });
    // Outside a batch first: the AdtClient built over the instance's
    // connection installs accept negotiation on it.
    expect(
      (await s.call('GetProgram', { program_name: 'PROG_A' })).isError,
    ).toBeFalsy();
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    const { summary } = await s.end();
    expect(summary).toMatchObject({
      recorded: 1,
      failed: [1],
      came: { status: 406, step: 'execute' },
    });
    const envelopes = s.built.flatMap((b) => b.envelopes);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.accept).toBe('multipart/mixed');
    await s.close();
  });

  it("the instance's plain connection still corrects outside the batch", async () => {
    const s = await batchStand({ tools: ['GetProgram'], part: picky });
    const answer = await s.call('GetProgram', { program_name: 'PROG_A' });
    expect(answer.isError).toBeFalsy();
    expect(payloadOf(answer).source).toBe('source text');
    const directs = s.built.flatMap((b) => b.directs);
    expect(directs).toHaveLength(2);
    const accept = (i: number) =>
      Object.entries(directs[i]?.headers ?? {}).find(
        ([k]) => k.toLowerCase() === 'accept',
      )?.[1];
    expect(accept(0)).not.toBe(SUPPORTED);
    expect(accept(1)).toBe(SUPPORTED);
    await s.close();
  });

  it('a recorder created without exemptFromAcceptNegotiation is negotiated: its 406 part is corrected and a follow-up envelope sent', async () => {
    // The same recorder module, its adt-clients' mark replaced by nothing.
    let modules!: {
      adt: typeof import('@mcp-abap-adt/adt-clients');
      recorder: typeof import('../../../lib/batch/recorder');
      owner: typeof import('../../../lib/batch/InstanceBatch');
      lateBound: typeof import('../../../lib/batch/lateBound');
    };
    jest.isolateModules(() => {
      jest.doMock('@mcp-abap-adt/adt-clients', () => ({
        ...jest.requireActual('@mcp-abap-adt/adt-clients'),
        exemptFromAcceptNegotiation: () => undefined,
      }));
      modules = {
        adt: require('@mcp-abap-adt/adt-clients'),
        recorder: require('../../../lib/batch/recorder'),
        owner: require('../../../lib/batch/InstanceBatch'),
        lateBound: require('../../../lib/batch/lateBound'),
      };
    });
    const instance = envelopeConnection(partByPart(picky));
    const owner = new modules.owner.InstanceBatch({ keepRawParts: false });
    const target = new modules.lateBound.LateBoundConnection();
    const batch = new modules.adt.AdtBatchConnection(target, {
      endpoint: 'communication',
    });
    owner.begin('communication', { connection: batch, target, recorded: [] });
    const recorder = modules.recorder.createRecorder(
      batch,
      owner,
      () => {},
      'GetProgram',
    );
    const read = new modules.adt.AdtClient(recorder as never)
      .getProgram()
      .read({ programName: 'PROG_A' });
    read.catch(() => undefined);
    await new Promise((r) => setImmediate(r));
    target.point(instance.connection as never);
    await batch.execute();
    await read;
    // Corrected and recorded again: a follow-up envelope with the named Accept.
    expect(instance.envelopes).toHaveLength(2);
    expect(instance.envelopes[1]?.parts[0]?.headers.accept).toBe(SUPPORTED);
  });
});

/**
 * A body the connection hands over as bytes is decoded before any analyser
 * reads it (Codex round 8, `withDecodedBodies`): an `exc:exception` on a
 * `200` is refused whether it arrives as a Buffer or as a string.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetATCFindings } from '../../handlers/atc/high/handleGetATCFindings';
import { withDecodedBodies } from '../../lib/connectionFactory';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const EXCEPTION =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNotFound"/><message lang="EN">Worklist not found</message></exc:exception>';

async function findingsOf(data: string | Uint8Array) {
  const connection = withDecodedBodies(recordingConnection([{ data }]));
  declareSystemKind(connection, 'onprem');
  return handleGetATCFindings(
    { connection, logger: undefined } as never,
    {
      worklist_id: 'WL1',
    } as never,
  );
}

describe('an exception on a 200, as bytes or as text', () => {
  it('as a string: refused', async () => {
    assert.equal((await findingsOf(EXCEPTION)).isError, true);
  });

  it('as a Buffer: refused the same way', async () => {
    const asText = await findingsOf(EXCEPTION);
    const asBytes = await findingsOf(Buffer.from(EXCEPTION));
    assert.equal(asBytes.isError, true, asBytes.content[0]?.text);
    assert.deepStrictEqual(asBytes, asText);
  });

  it('a thrown refusal carries its body decoded too', async () => {
    const base = recordingConnection([]);
    const failure = {
      response: { status: 404, headers: {}, data: Buffer.from(EXCEPTION) },
    };
    base.makeAdtRequest = async () => {
      throw failure;
    };
    const connection = withDecodedBodies(base);
    await assert.rejects(
      connection.makeAdtRequest({ url: '/x', method: 'GET', timeout: 0 }),
    );
    assert.equal(failure.response.data as unknown, EXCEPTION);
  });
});

/**
 * DescribeByList at each `detail` (terse answers, step 3): terse one TSV —
 * one header, each object's rows, `NAME\t-` for an object no search found;
 * full the answer before `detail`, one content entry per object found.
 *
 * Replayed over a recording connection with no communication batch: real
 * adt-clients code, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleDescribeByList } from '../../handlers/system/readonly/handleDescribeByList';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../lib/batch/availability';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

const HIT =
  '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_a" adtcore:type="CLAS/OC" adtcore:name="ZCL_A" adtcore:packageName="ZPKG" adtcore:description="A class"/></adtcore:objectReferences>';
const NONE =
  '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>';

async function describe_(detail?: 'terse' | 'medium' | 'full') {
  const connection = recordingConnection([{ data: HIT }, { data: NONE }]);
  declareSystemKind(connection, 'onprem');
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  const result = await handleDescribeByList(
    { connection, logger: undefined, batchAvailability },
    {
      objects: [{ name: 'ZCL_A' }, { name: 'ZNONE' }],
      ...(detail === undefined ? {} : { detail }),
    },
  );
  assert.equal(result.isError, false, result.content[0]?.text);
  return result;
}

describe('DescribeByList detail', () => {
  // Terse lists what SAP returned (the owner's rule): no row only to say a
  // name asked for was not described — medium and full say it.
  it('terse, by default: one header, the rows SAP described, none for a name it did not', async () => {
    const result = await describe_();
    assert.equal(result.content.length, 1);
    assert.equal(
      result.content[0]?.text,
      [
        'name\ttype\tdescription\tpackage',
        'ZCL_A\tCLAS/OC\tA class\tZPKG',
      ].join('\n'),
    );
  });

  // Every object asked, at every level (the owner's rule: complete or an
  // error): one no search found is answered as not found, never left out.
  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: one content entry per object asked, the one not found as such`, async () => {
      const result = await describe_(detail);
      assert.equal(result.content.length, 2);
      assert.equal(JSON.parse(result.content[0]?.text ?? '').name, 'ZCL_A');
      assert.deepStrictEqual(JSON.parse(result.content[1]?.text ?? ''), {
        name: 'ZNONE',
        found: false,
      });
    });
  }

  // Codex round 6, P1-5: the child searches read at the level — full the
  // whole parse, the hit's URI kept, no TSV wrapped.
  it('full: the hit as its parse, its URI kept, no TSV', async () => {
    const result = await describe_('full');
    const text = result.content[0]?.text ?? '';
    assert.ok(text.includes('/sap/bc/adt/oo/classes/zcl_a'), text);
    assert.ok(!text.includes('name\\ttype'), text);
  });

  // The sequential path never skips an object in silence: a second search
  // that fails is that object's error, there in the answer.
  it('a second search that fails: the object answers its error, never skipped', async () => {
    const connection = recordingConnection([{ status: 500, data: 'refused' }]);
    declareSystemKind(connection, 'onprem');
    const answering = connection.makeAdtRequest.bind(connection);
    let sent = 0;
    connection.makeAdtRequest = async (request: never) => {
      sent += 1;
      if (sent === 1) return answering(request);
      throw new Error('the second search failed');
    };
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleDescribeByList(
      { connection, logger: undefined, batchAvailability },
      { objects: [{ name: 'ZCL_A', type: 'CLAS' }] },
    );
    const text = result.content[0]?.text ?? '';
    assert.ok(text.includes('# error\tZCL_A'), text);
    assert.ok(text.includes('the second search failed'), text);
  });
});

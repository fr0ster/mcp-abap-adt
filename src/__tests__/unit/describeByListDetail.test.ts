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

async function describe_(detail?: 'terse' | 'full') {
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
  assert.equal(result.isError, false);
  return result;
}

describe('DescribeByList detail', () => {
  it('terse, by default: one header, a row per object, - for none found', async () => {
    const result = await describe_();
    assert.equal(result.content.length, 1);
    assert.equal(
      result.content[0]?.text,
      [
        'name\ttype\tdescription\tpackage',
        'ZCL_A\tCLAS/OC\tA class\tZPKG',
        'ZNONE\t-\t\t',
      ].join('\n'),
    );
  });

  it('full: one content entry per object found, as before detail', async () => {
    const result = await describe_('full');
    assert.equal(result.content.length, 2);
    assert.equal(JSON.parse(result.content[0]?.text ?? '').name, 'ZCL_A');
  });
});

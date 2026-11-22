/**
 * GetObjectsList at each `detail` (terse answers, step 3): terse the
 * parent's objects as TSV — type, name, and the technical name only where it
 * differs; medium every field read but the uri; full the answer before
 * `detail`.
 *
 * Replayed over a recording connection with no communication batch: real
 * adt-clients code, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetObjectsList } from '../../handlers/search/readonly/handleGetObjectsList';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../lib/batch/availability';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

const LEVEL =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT>' +
  '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/FF</OBJECT_TYPE><OBJECT_NAME>Z_FM</OBJECT_NAME><TECH_NAME>Z_FM</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/z_fm</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
  '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/I</OBJECT_TYPE><OBJECT_NAME>ZFG_TOP</OBJECT_NAME><TECH_NAME>LZFGTOP</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/lzfgtop</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
  '</TREE_CONTENT><OBJECT_TYPES/></DATA></asx:values></asx:abap>';

async function objectsList(detail?: 'terse' | 'medium' | 'full') {
  const connection = recordingConnection([{ data: LEVEL }]);
  declareSystemKind(connection, 'onprem');
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  const result = await handleGetObjectsList(
    { connection, logger: undefined, batchAvailability },
    {
      parent_name: 'ZFG',
      parent_tech_name: 'ZFG',
      parent_type: 'FUGR/F',
      ...(detail === undefined ? {} : { detail }),
    },
  );
  assert.equal(result.isError, false, result.content[0]?.text);
  return result.content[0]?.text ?? '';
}

describe('GetObjectsList detail', () => {
  it('terse, by default: type and name, the technical name where it differs', async () => {
    const expected = [
      '# parent FUGR/F ZFG',
      '# total 2',
      'type\tname\ttech_name',
      'FUGR/FF\tZ_FM\t',
      'FUGR/I\tZFG_TOP\tLZFGTOP',
    ].join('\n');
    assert.equal(await objectsList(), expected);
    assert.equal(await objectsList('terse'), expected);
  });

  it('medium: every field but the uri', async () => {
    const medium = JSON.parse(await objectsList('medium'));
    assert.deepStrictEqual(medium.objects[1], {
      type: 'FUGR/I',
      name: 'ZFG_TOP',
      tech_name: 'LZFGTOP',
    });
  });

  it('full: the answer before detail, the uri included', async () => {
    const full = JSON.parse(await objectsList('full'));
    assert.equal(full.total_objects, 2);
    assert.equal(full.objects[0].OBJECT_URI, '/sap/bc/adt/x/z_fm');
  });
});

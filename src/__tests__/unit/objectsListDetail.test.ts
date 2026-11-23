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
  '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/FF</OBJECT_TYPE><OBJECT_NAME>Z_FM</OBJECT_NAME><TECH_NAME>Z_FM</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/z_fm</OBJECT_URI><DESCRIPTION>A module</DESCRIPTION></SEU_ADT_REPOSITORY_OBJ_NODE>' +
  '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/I</OBJECT_TYPE><OBJECT_NAME>ZFG_TOP</OBJECT_NAME><TECH_NAME>LZFGTOP</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/lzfgtop</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
  '</TREE_CONTENT><OBJECT_TYPES/></DATA></asx:values></asx:abap>';

async function objectsList(
  detail?: 'terse' | 'medium' | 'full',
  level: string = LEVEL,
) {
  const connection = recordingConnection([{ data: level }]);
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
  it("terse, by default: type and name, the technical name where it differs, a nameless one's uri, the description asked for by default", async () => {
    const expected = [
      '# parent FUGR/F ZFG',
      '# total 2',
      'type\tname\ttech_name\turi\tdescription',
      'FUGR/FF\tZ_FM\t\t\tA module',
      'FUGR/I\tZFG_TOP\tLZFGTOP\t\t',
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

  // Codex round 5, P1-2: two objects SAP listed without a name, apart only
  // by their URI, stay apart at terse; a node SAP could not load is its
  // row at every level, never an empty success.
  const NAMELESS =
    '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/I</OBJECT_TYPE><OBJECT_NAME></OBJECT_NAME><TECH_NAME>LZFGX</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/one</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/I</OBJECT_TYPE><OBJECT_NAME></OBJECT_NAME><TECH_NAME>LZFGX</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/two</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT><OBJECT_TYPES/></DATA></asx:values></asx:abap>';

  it('two nameless objects apart only by uri: two terse rows, each with its uri', async () => {
    const lines = (await objectsList('terse', NAMELESS)).split('\n');
    assert.ok(
      lines.includes('FUGR/I\t\tLZFGX\t/sap/bc/adt/x/one\t'),
      lines.join('\n'),
    );
    assert.ok(
      lines.includes('FUGR/I\t\tLZFGX\t/sap/bc/adt/x/two\t'),
      lines.join('\n'),
    );
  });

  const NOT_LOADED =
    '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_NAME>the node could not be loaded</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT><OBJECT_TYPES/></DATA></asx:values></asx:abap>';

  for (const detail of ['terse', 'medium', 'full'] as const) {
    it(`a node SAP could not load: its row at ${detail}`, async () => {
      const text = await objectsList(detail, NOT_LOADED);
      assert.ok(text.includes('not loaded by SAP'), text);
    });
  }
});

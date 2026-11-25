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
import {
  handleGetObjectsList,
  OBJECTS_LIST_LISTS,
} from '../../handlers/search/readonly/handleGetObjectsList';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../lib/batch/availability';
import { writeListing } from '../../lib/detail';
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
  // The owner's decision: terse is identifier rows, no description — the
  // node structure's descriptions are never taken (in a batch they belong
  // to other parts), and terse reads no second pass for them.
  it("terse, by default: identifier rows — type, name, the technical name where it differs, a nameless one's uri — no description", async () => {
    const expected = [
      '# parent FUGR/F ZFG',
      '# total 2',
      'type\tname\ttech_name\turi',
      'FUGR/FF\tZ_FM\t\t',
      'FUGR/I\tZFG_TOP\tLZFGTOP\t',
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
      lines.includes('FUGR/I\t\tLZFGX\t/sap/bc/adt/x/one'),
      lines.join('\n'),
    );
    assert.ok(
      lines.includes('FUGR/I\t\tLZFGX\t/sap/bc/adt/x/two'),
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

  // The owner's decision (SAP's `CL_SEU_ADT_RES_REPO_STRUCTURE` keeps a
  // static text table every batch part grows and reads by row index): the
  // node structure's descriptions are never used. Here they are wrong on
  // purpose; medium takes each object's from its own metadata, and an
  // object whose metadata carries none has none.
  it("medium: descriptions from each object's metadata, never the node structure's", async () => {
    const WRONG = LEVEL.replaceAll(
      '</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>',
      '</OBJECT_URI><DESCRIPTION>WRONG</DESCRIPTION></SEU_ADT_REPOSITORY_OBJ_NODE>',
    ).replace('<DESCRIPTION>A module</DESCRIPTION>', '');
    const connection = recordingConnection([
      { data: WRONG },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><fmodule:abapFunctionModule xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="Z_FM" adtcore:description="Right"/>',
      },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><finclude:abapFunctionGroupInclude xmlns:finclude="http://www.sap.com/adt/functions/fincludes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZFG_TOP"/>',
      },
    ]);
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleGetObjectsList(
      { connection, logger: undefined, batchAvailability },
      {
        parent_name: 'ZFG',
        parent_tech_name: 'ZFG',
        parent_type: 'FUGR/F',
        detail: 'medium',
      },
    );
    const text = result.content[0]?.text ?? '';
    assert.equal(result.isError, false, text);
    assert.ok(!text.includes('WRONG'), text);
    const answer = JSON.parse(text);
    assert.equal(answer.objects[0].description, 'Right');
    assert.equal(answer.objects[1].description, undefined);
  });

  it('terse: one pass, no metadata read', async () => {
    const connection = recordingConnection([{ data: LEVEL }]);
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    await handleGetObjectsList(
      { connection, logger: undefined, batchAvailability },
      { parent_name: 'ZFG', parent_tech_name: 'ZFG', parent_type: 'FUGR/F' },
    );
    assert.equal(connection.requests.length, 1);
  });

  // A failed pass-2 read is the call's error, never an object answered
  // without its description as if complete.
  it('medium: a metadata read SAP refuses makes the call its error', async () => {
    const connection = recordingConnection([
      { data: LEVEL },
      { status: 500, data: 'refused' },
      { data: '<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core"/>' },
    ]);
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleGetObjectsList(
      { connection, logger: undefined, batchAvailability },
      {
        parent_name: 'ZFG',
        parent_tech_name: 'ZFG',
        parent_type: 'FUGR/F',
        detail: 'medium',
      },
    );
    assert.equal(result.isError, true, result.content[0]?.text);
  });

  // Onprem live run: SAP lists an object (a message class left without its
  // T100A row) whose metadata it answers 404, "does not exist". The object
  // is answered as SAP answered it — listed, with that error — and the call
  // goes on; any other refused read stays the call's error (above).
  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: an object whose metadata SAP answers 404 is listed with that error, the call answered`, async () => {
      const connection = recordingConnection([
        { data: LEVEL },
        {
          status: 404,
          data: '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Resource FUGR Z_FM does not exist.</message></exc:exception>',
        },
        {
          data: '<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Top"/>',
        },
      ]);
      declareSystemKind(connection, 'onprem');
      const batchAvailability = createBatchAvailability();
      batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
      const result = await handleGetObjectsList(
        { connection, logger: undefined, batchAvailability },
        {
          parent_name: 'ZFG',
          parent_tech_name: 'ZFG',
          parent_type: 'FUGR/F',
          detail,
        },
      );
      const text = result.content[0]?.text ?? '';
      assert.equal(result.isError, false, text);
      const answer = JSON.parse(text);
      const [missing, top] = answer.objects;
      const error =
        detail === 'medium' ? missing.metadata_error : missing.METADATA_ERROR;
      assert.equal(error?.status, 404, text);
      assert.equal(error?.step, 'read object metadata', text);
      // SAP's message as it came, nothing of the path that carried it.
      assert.equal(error?.message, 'Resource FUGR Z_FM does not exist.', text);
      assert.equal(
        detail === 'medium' ? top.description : top.DESCRIPTION,
        'Top',
        text,
      );
    });
  }

  // Onprem live rerun: a live connection throws on a 404 (the request's
  // failure, SAP's status on its response), where the recording connection
  // answers one. Thrown, it is the same answer: the object listed with it.
  it("medium: a metadata read that throws SAP's 404 lists the object with it", async () => {
    const recorded = recordingConnection([
      { data: LEVEL },
      { data: '' },
      {
        data: '<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Top"/>',
      },
    ]);
    let call = 0;
    const connection = {
      ...recorded,
      makeAdtRequest: async (
        options: Parameters<typeof recorded.makeAdtRequest>[0],
      ) => {
        const answered = await recorded.makeAdtRequest(options);
        call += 1;
        if (call === 2) {
          throw Object.assign(
            new Error('Request failed with status code 404'),
            {
              response: {
                status: 404,
                statusText: 'Not Found',
                headers: {},
                data: '',
              },
            },
          );
        }
        return answered;
      },
    } as typeof recorded;
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleGetObjectsList(
      { connection, logger: undefined, batchAvailability },
      {
        parent_name: 'ZFG',
        parent_tech_name: 'ZFG',
        parent_type: 'FUGR/F',
        detail: 'medium',
      },
    );
    const text = result.content[0]?.text ?? '';
    assert.equal(result.isError, false, text);
    const answer = JSON.parse(text);
    assert.equal(answer.objects[0].metadata_error?.status, 404, text);
    assert.equal(
      answer.objects[0].metadata_error?.step,
      'read object metadata',
      text,
    );
    assert.equal(answer.objects[1].description, 'Top', text);
  });

  // Codex re-review: an object kept with its 404 (METADATA_ERROR) is shown at
  // terse too — SAP's error on a line of its own after the rows, never a
  // row as if nothing failed. The terse pass reads metadata only for an
  // object SAP listed without a type, which the node-structure reading no
  // longer yields (an empty OBJECT_TYPE is a node SAP could not load), so
  // the terse writer is held to such a list directly.
  it('terse: an object SAP answered 404 for is written with its error', () => {
    const error = {
      error: 'client_threw',
      status: 404,
      message: 'Request failed with status code 404',
      step: 'read object metadata',
    };
    const gone = {
      OBJECT_TYPE: '',
      OBJECT_NAME: 'ZGONE',
      OBJECT_URI: '/sap/bc/adt/x/zgone',
      METADATA_ERROR: error,
    };
    const text = writeListing({
      heads: [],
      reading: {
        parent_name: 'ZFG',
        parent_type: 'FUGR/F',
        objects: [{ OBJECT_TYPE: 'FUGR/FF', OBJECT_NAME: 'Z_FM' }, gone],
        refused: [gone],
      },
      lists: OBJECTS_LIST_LISTS,
    }).answer;
    const marked = text
      .split('\n')
      .filter((line) => line.startsWith('# metadata_error\t'));
    assert.equal(marked.length, 1, text);
    const [, type, name, uri, written] = (marked[0] ?? '').split('\t');
    assert.deepStrictEqual(
      [type, name, uri],
      ['', 'ZGONE', '/sap/bc/adt/x/zgone'],
      text,
    );
    assert.deepStrictEqual(JSON.parse(String(written)), error, text);
    // The failed object stays among the rows, and its line follows them.
    const lines = text.split('\n');
    const row = lines.indexOf('\tZGONE\t\t');
    assert.ok(row >= 0, text);
    const lastRow = Math.max(row, lines.indexOf('FUGR/FF\tZ_FM\t\t'));
    assert.ok(lines.indexOf(marked[0] ?? '') > lastRow, text);
  });

  it('medium: the objects SAP answered 404 for are named apart, none no member', async () => {
    const connection = recordingConnection([
      { data: LEVEL },
      {
        status: 404,
        data: '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Resource FUGR Z_FM does not exist.</message></exc:exception>',
      },
      {
        data: '<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Top"/>',
      },
    ]);
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleGetObjectsList(
      { connection, logger: undefined, batchAvailability },
      {
        parent_name: 'ZFG',
        parent_tech_name: 'ZFG',
        parent_type: 'FUGR/F',
        detail: 'medium',
      },
    );
    const answer = JSON.parse(result.content[0]?.text ?? '');
    assert.deepStrictEqual(
      answer.refused.map((o: { name: string }) => o.name),
      ['Z_FM'],
    );
    assert.equal('refused' in JSON.parse(await objectsList('medium')), false);
  });

  // Codex round 8: a nameless row is addressed by its URI, never by an
  // address built from an empty name.
  it('medium: a typed nameless include is read by its URI', async () => {
    const connection = recordingConnection([
      { data: NAMELESS },
      {
        data: '<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="One"/>',
      },
      {
        data: '<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Two"/>',
      },
    ]);
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleGetObjectsList(
      { connection, logger: undefined, batchAvailability },
      {
        parent_name: 'ZFG',
        parent_tech_name: 'ZFG',
        parent_type: 'FUGR/F',
        detail: 'medium',
      },
    );
    assert.equal(result.isError, false, result.content[0]?.text);
    const urls = connection.requests.slice(1).map((r) => r.url);
    assert.deepStrictEqual(urls, ['/sap/bc/adt/x/one', '/sap/bc/adt/x/two']);
  });

  it('two nodes SAP could not load in one response stay two rows', async () => {
    const TWO = NOT_LOADED.replace(
      '</TREE_CONTENT>',
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_NAME>the second could not be loaded</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT>',
    );
    const lines = (await objectsList('terse', TWO)).split('\n');
    assert.equal(
      lines.filter((line) => line.includes('not loaded by SAP')).length,
      2,
      lines.join('\n'),
    );
  });
});

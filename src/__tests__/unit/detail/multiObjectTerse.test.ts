/**
 * A list call's terse text is written entirely through `Written` (Codex
 * round 8, `listedText`): a name asked holding a line break or a tab adds
 * no row and forges no `#` line, and each `# error` line is one escaped
 * cell — read back as a cell, its value is the failure's JSON as written.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetEnhancements } from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import { handleGetObjectsByType } from '../../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../../handlers/search/readonly/handleGetObjectsList';
import { handleGetStructuresList } from '../../../handlers/structure/readonly/handleGetStructuresList';
import { handleGetPackageTree } from '../../../handlers/system/high/handleGetPackageTree';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import { handleRuntimeListFeeds } from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import { cellsOf } from '../../../lib/detail/tsvCells';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

/** A name that, glued into the text, would add a `#` line and a row. */
const FORGED = 'ZA\n# forged\tZFORGED\nCLAS/OC\tZFORGED';

/** SAP's refusal, its message holding a backslash the cell must escape. */
const REFUSAL = {
  status: 404,
  statusText: 'Not Found',
  headers: {},
  data: '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNotFound"/><message lang="EN">not found at C:\\path</message></exc:exception>',
};

function context() {
  const connection = recordingConnection(
    Array.from({ length: 60 }, () => REFUSAL),
  );
  declareSystemKind(connection, 'onprem');
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return { connection, logger: undefined, batchAvailability };
}

/** The text holds no forged line, and every `# error` line reads back as JSON. */
function assertWritten(result: {
  isError?: boolean | undefined;
  content: Array<{ text?: string }>;
}) {
  const text = result.content[0]?.text ?? '';
  const lines = text.split('\n');
  for (const line of lines) {
    assert.ok(!line.startsWith('# forged'), text);
    assert.ok(!line.startsWith('CLAS/OC\tZFORGED'), text);
  }
  const errors = lines.filter((line) => line.startsWith('# error '));
  for (const line of errors) {
    const [value = ''] = cellsOf(line.slice('# error '.length));
    assert.doesNotThrow(() => JSON.parse(value), line);
  }
  return { text, errors };
}

describe('a list call at terse: every line through Written', () => {
  it('GetPackageTree', async () => {
    const { errors } = assertWritten(
      await handleGetPackageTree(context(), {
        package_names: ['ZA', FORGED],
        background: false,
      } as never),
    );
    assert.ok(errors.length > 0);
  });

  it('GetStructuresList', async () => {
    const { errors } = assertWritten(
      await handleGetStructuresList(context(), {
        structure_names: ['ZA', FORGED],
      } as never),
    );
    assert.ok(errors.length > 0);
  });

  it('GetIncludesList', async () => {
    const { errors, text } = assertWritten(
      await handleGetIncludesList(context(), {
        objects: [
          { object_name: 'ZA', object_type: 'PROG/P' },
          { object_name: FORGED, object_type: 'TABL/DT' },
        ],
      } as never),
    );
    assert.ok(errors.length > 0, text);
  });

  // Codex round 9: a name starting with `#` at the tree's root reads as a
  // row, never as a `#` line.
  it('GetIncludesList: an object named # forged', async () => {
    const result = await handleGetIncludesList(context(), {
      object_name: '# forged',
      object_type: 'PROG/P',
    } as never);
    const text = result.content[0]?.text ?? '';
    for (const line of text.split('\n')) {
      assert.ok(!line.trimStart().toLowerCase().startsWith('# forged'), text);
    }
    assert.ok(text.split('\n').includes('\\# FORGED'), text);
  });

  it('GetEnhancements', async () => {
    const { errors } = assertWritten(
      await handleGetEnhancements(context(), {
        objects: [
          { object_name: 'ZA', object_type: 'PROG/P' },
          { object_name: FORGED, object_type: 'PROG/P' },
        ],
      } as never),
    );
    assert.ok(errors.length > 0);
  });

  it('GetObjectsList', async () => {
    const { errors } = assertWritten(
      await handleGetObjectsList(context(), {
        objects: [
          { parent_name: 'ZA', parent_type: 'PROG/P' },
          { parent_name: FORGED, parent_type: 'PROG/P' },
        ],
      } as never),
    );
    assert.ok(errors.length > 0);
  });

  it('RuntimeListFeeds: each failure one escaped cell', async () => {
    const { errors } = assertWritten(
      await handleRuntimeListFeeds(context(), {
        feed_types: ['descriptors', 'variants'],
      } as never),
    );
    assert.ok(errors.length > 0);
  });

  // Codex round 9: a name holding U+2028 or U+2029 adds no line for a
  // reader that splits on every line terminator.
  it('GetWhereUsed: a name holding U+2028 and U+2029', async () => {
    const result = await handleGetWhereUsed(context(), {
      objects: [
        { object_name: 'ZA', object_type: 'CLAS/OC' },
        {
          object_name: 'ZB\u2028CLAS/OC\tZFORGED\u2029# forged',
          object_type: 'CLAS/OC',
        },
      ],
    } as never);
    const text = result.content[0]?.text ?? '';
    for (const terminator of ['\u2028', '\u2029', '\u0085']) {
      assert.ok(!text.includes(terminator), JSON.stringify(text));
    }
    assertWritten(result);
  });

  it('GetObjectsByType: SAP names and the asked parent escaped', async () => {
    const NODE = `<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME>ZB&#10;CLAS/OC&#9;ZFORGED</OBJECT_NAME><TECH_NAME>ZB</TECH_NAME><OBJECT_URI>/sap/bc/adt/oo/classes/zb</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT></DATA></asx:values></asx:abap>`;
    const connection = recordingConnection([{ data: NODE }]);
    declareSystemKind(connection, 'onprem');
    const result = await handleGetObjectsByType(
      { connection, logger: undefined } as never,
      {
        parent_name: FORGED,
        parent_tech_name: 'ZA',
        parent_type: 'DEVC/K',
        node_id: '000000',
      } as never,
    );
    assert.equal(result.isError, false, result.content[0]?.text);
    assertWritten(result);
  });

  // Codex round 9: every entry SAP's level holds is a row or a line —
  // incomplete objects and nodes not loaded included — with its
  // description where asked; the text is pinned whole.
  it('GetObjectsByType: every entry of the level, descriptions included', async () => {
    const node = (inner: string) =>
      `<SEU_ADT_REPOSITORY_OBJ_NODE>${inner}</SEU_ADT_REPOSITORY_OBJ_NODE>`;
    const LEVEL = `<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT>${[
      node(
        '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME>ZCL_A</OBJECT_NAME><TECH_NAME>ZCL_A</TECH_NAME><OBJECT_URI>/sap/bc/adt/oo/classes/zcl_a</OBJECT_URI><DESCRIPTION>First</DESCRIPTION>',
      ),
      node(
        '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME/><OBJECT_URI>/sap/bc/adt/oo/classes/nameless</OBJECT_URI>',
      ),
      node('<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>'),
      node('<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>'),
    ].join('')}</TREE_CONTENT></DATA></asx:values></asx:abap>`;
    const connection = recordingConnection([{ data: LEVEL }]);
    declareSystemKind(connection, 'onprem');
    const result = await handleGetObjectsByType(
      { connection, logger: undefined } as never,
      {
        parent_name: 'ZPKG',
        parent_tech_name: 'ZPKG',
        parent_type: 'DEVC/K',
        node_id: '000029',
        with_short_descriptions: true,
      } as never,
    );
    assert.equal(result.isError, false, result.content[0]?.text);
    assert.equal(
      result.content[0]?.text,
      [
        '# parent DEVC/K ZPKG',
        '# node_id 000029',
        '# count 4',
        'type\tname\ttech_name\turi\tdescription',
        'CLAS/OC\tZCL_A\t\t\tFirst',
        'CLAS/OC\t\t\t/sap/bc/adt/oo/classes/nameless\t',
        '# not loaded by SAP',
        '# not loaded by SAP',
      ].join('\n'),
    );
  });

  // Plan 9.3: every list of the level is written — a child node SAP lists
  // under the folder too, where it was dropped.
  it('GetObjectsByType: a child node of the folder is its line', async () => {
    const LEVEL = `<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT/><OBJECT_TYPES><SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>PROG/I</OBJECT_TYPE><NODE_ID>000007</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO></OBJECT_TYPES></DATA></asx:values></asx:abap>`;
    const connection = recordingConnection([{ data: LEVEL }]);
    declareSystemKind(connection, 'onprem');
    const result = await handleGetObjectsByType(
      { connection, logger: undefined } as never,
      {
        parent_name: 'ZPKG',
        parent_tech_name: 'ZPKG',
        parent_type: 'DEVC/K',
        node_id: '000029',
        with_short_descriptions: false,
      } as never,
    );
    assert.ok(
      (result.content[0]?.text ?? '')
        .split('\n')
        .includes('# child_node\tPROG/I\t000007'),
      result.content[0]?.text,
    );
  });
});

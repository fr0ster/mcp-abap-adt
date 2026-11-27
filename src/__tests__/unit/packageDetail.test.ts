/**
 * GetPackageContents and GetPackageTree at each `detail` (terse answers,
 * step 3), over one walk: a package whose Views node SAP could not load and
 * whose tables node lists one table.
 *
 * - GetPackageContents terse: `# package P`, then `type\tname` rows
 *   (`\tdescription` with `include_descriptions`); medium: every field the
 *   walk read, no uri; full: the list before `detail`.
 * - GetPackageTree terse: the tree as indented `type\tname` lines; medium:
 *   the tree with every field the walk read, no derived or backup field;
 *   full: the tree before `detail`.
 * - A node SAP could not load is one row at every level: its type, and the
 *   fixed words `not loaded by SAP`.
 *
 * Replayed over a recording connection with no communication batch: real
 * adt-clients code, the walk package by package, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents';
import {
  TOOL_DEFINITION as GetPackageTree,
  handleGetPackageTree,
} from '../../handlers/system/high/handleGetPackageTree';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../lib/batch/availability';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

const level = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>${inner}</DATA></asx:values></asx:abap>`;

const ROOT = level(
  '<TREE_CONTENT/><OBJECT_TYPES>' +
    '<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>VIEW/DV</OBJECT_TYPE><NODE_ID>000001</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>' +
    '<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><NODE_ID>000002</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>' +
    '</OBJECT_TYPES>',
);
const VIEWS = level(
  '<TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME><TECH_NAME>SAP_TEXT_NEVER_IN_AN_ANSWER</TECH_NAME></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT>',
);
const TABLES = level(
  '<TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_NAME>ZT_ONE</OBJECT_NAME><TECH_NAME>ZT_ONE</TECH_NAME><OBJECT_URI>/sap/bc/adt/ddic/tables/zt_one</OBJECT_URI><DESCRIPTION>A table</DESCRIPTION></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT>',
);

/** The package's metadata, read before a tree's walk. */
const METADATA =
  '<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPKG" adtcore:type="DEVC/K" adtcore:description="A package"/>';

function context(first: string[] = []) {
  const connection = recordingConnection(
    [...first, ROOT, VIEWS, TABLES].map((data) => ({ data })),
  );
  declareSystemKind(connection, 'onprem');
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return { connection, logger: undefined, batchAvailability };
}

type Level = 'terse' | 'medium' | 'full' | 'raw';

async function contents(detail?: Level, descriptions?: boolean) {
  const result = await handleGetPackageContents(context(), {
    package_name: 'ZPKG',
    ...(descriptions ? { include_descriptions: true } : {}),
    ...(detail === undefined ? {} : { detail }),
  });
  assert.equal(result.isError, false, result.content[0]?.text);
  const text = result.content[0]?.text ?? '';
  assert.equal(text.includes('SAP_TEXT_NEVER_IN_AN_ANSWER'), false);
  return text;
}

async function tree(detail?: Level) {
  const result = await handleGetPackageTree(context([METADATA]), {
    package_name: 'ZPKG',
    ...(detail === undefined ? {} : { detail }),
  });
  assert.equal(result.isError, false, result.content[0]?.text);
  const text = result.content[0]?.text ?? '';
  assert.equal(text.includes('SAP_TEXT_NEVER_IN_AN_ANSWER'), false);
  return text;
}

describe('GetPackageContents detail', () => {
  it('terse, by default: the rows under their package, the unloaded node one of them', async () => {
    const expected = [
      'type\tname\ttech_name\turi',
      '# package ZPKG',
      'VIEW/DV\tnot loaded by SAP\t\t',
      'TABL/DT\tZT_ONE\t\t',
    ].join('\n');
    assert.equal(await contents(), expected);
    assert.equal(await contents('terse'), expected);
  });

  it('terse with include_descriptions: a description column', async () => {
    assert.equal(
      await contents('terse', true),
      [
        'type\tname\ttech_name\turi\tdescription',
        '# package ZPKG',
        'VIEW/DV\tnot loaded by SAP\t\t\t',
        'TABL/DT\tZT_ONE\t\t\tA table',
      ].join('\n'),
    );
  });

  it('medium: every field the walk read, no uri', async () => {
    assert.deepStrictEqual(JSON.parse(await contents('medium', true)), [
      {
        name: 'not loaded by SAP',
        type: 'VIEW/DV',
        package_name: 'ZPKG',
        not_loaded: true,
      },
      {
        name: 'ZT_ONE',
        type: 'TABL/DT',
        package_name: 'ZPKG',
        description: 'A table',
        tech_name: 'ZT_ONE',
      },
    ]);
  });

  it('full: the list before detail, the unloaded node a row of it', async () => {
    const full = JSON.parse(await contents('full'));
    assert.deepStrictEqual(
      full.map((item: { type: string; name: string }) => [
        item.type,
        item.name,
      ]),
      [
        ['VIEW/DV', 'not loaded by SAP'],
        ['TABL/DT', 'ZT_ONE'],
      ],
    );
    assert.equal(full[1].isPackage, false);
  });
});

describe('GetPackageTree detail', () => {
  it('terse, by default: indented type and name lines', async () => {
    const expected = [
      'DEVC/K\tZPKG',
      '  VIEW/DV\tnot loaded by SAP',
      '  TABL/DT\tZT_ONE',
    ].join('\n');
    assert.equal(await tree(), expected);
    assert.equal(await tree('terse'), expected);
  });

  it('terse with include_descriptions: each row with its description', async () => {
    const result = await handleGetPackageTree(context([METADATA]), {
      package_name: 'ZPKG',
      include_descriptions: true,
    });
    const rows = (result.content[0]?.text ?? '').split('\n');
    assert.equal(rows.at(-1), '  TABL/DT\tZT_ONE\tA table');
  });

  it('full: the tree before detail', async () => {
    const full = JSON.parse(await tree('full'));
    assert.equal(full.package_name, 'ZPKG');
    assert.equal(full.tree.name, 'ZPKG');
    assert.deepStrictEqual(
      full.tree.children.map((child: { name: string }) => child.name),
      ['not loaded by SAP', 'ZT_ONE'],
    );
    assert.equal(full.tree.children[1].restoreStatus, 'ok');
  });

  // No depth of the server's (#391): without max_depth the walk has no
  // bound, and full says none was given.
  it('full: no max_depth when none is given, the one given when given', async () => {
    const full = JSON.parse(await tree('full'));
    assert.equal('max_depth' in full.metadata, false, JSON.stringify(full));
    const bounded = await handleGetPackageTree(context([METADATA]), {
      package_name: 'ZPKG',
      max_depth: 3,
      detail: 'full',
    });
    assert.equal(
      JSON.parse(bounded.content[0]?.text ?? '{}').metadata.max_depth,
      3,
    );
  });

  it('the schema gives no max_depth of its own', () => {
    const parsed = GetPackageTree.inputSchema.parse({ package_name: 'ZPKG' });
    assert.equal('max_depth' in parsed, false, JSON.stringify(parsed));
  });

  it('medium: the tree without derived or backup fields', async () => {
    const medium = JSON.parse(await tree('medium'));
    assert.deepStrictEqual(medium, {
      name: 'ZPKG',
      type: 'DEVC/K',
      children: [
        { name: 'not loaded by SAP', type: 'VIEW/DV', not_loaded: true },
        { name: 'ZT_ONE', type: 'TABL/DT' },
      ],
    });
  });
});

describe('GetPackageContents terse keeps a technical name that is not the name', () => {
  it("a function group's main program beside its name", async () => {
    const root = level(
      '<TREE_CONTENT/><OBJECT_TYPES><SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>FUGR/F</OBJECT_TYPE><NODE_ID>000003</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO></OBJECT_TYPES>',
    );
    const groups = level(
      '<TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>FUGR/F</OBJECT_TYPE><OBJECT_NAME>ZFG</OBJECT_NAME><TECH_NAME>SAPLZFG</TECH_NAME><OBJECT_URI>/sap/bc/adt/functions/groups/zfg</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT>',
    );
    const connection = recordingConnection(
      [root, groups].map((data) => ({ data })),
    );
    declareSystemKind(connection, 'onprem');
    const batchAvailability = createBatchAvailability();
    batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
    const result = await handleGetPackageContents(
      { connection, logger: undefined, batchAvailability },
      { package_name: 'ZPKG' },
    );
    assert.equal(
      result.content[0]?.text,
      [
        'type\tname\ttech_name\turi',
        '# package ZPKG',
        'FUGR/F\tZFG\tSAPLZFG\t',
      ].join('\n'),
    );
  });
});

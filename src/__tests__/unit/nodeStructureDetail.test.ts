/**
 * GetNodeStructureLow at each `detail`, over node-structure documents and a
 * real adt-clients run on a recording connection: terse the level written
 * by the listing writer (a row per object, a `# child_node` line per child
 * node, a `# not loaded by SAP` line per node SAP could not load, `# blank`
 * for a package's blank body read once); medium and full the level as
 * JSON; raw the documents the call read.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLANK_PACKAGE_LISTING,
  handleGetNodeStructure,
  handleGetNodeStructureOnce,
} from '../../handlers/system/low/handleGetNodeStructure';
import type { DetailLevel } from '../../lib/detail';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { recordingConnection } from '../helpers/recordingConnection';

const xmlHead = '<?xml version="1.0" encoding="utf-8"?>';

/** A node-structure level of the given object entries and type folders. */
const level = (entries: readonly string[], folders: readonly string[] = []) =>
  `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT>${entries
    .map(
      (inner) =>
        `<SEU_ADT_REPOSITORY_OBJ_NODE>${inner}</SEU_ADT_REPOSITORY_OBJ_NODE>`,
    )
    .join('')}</TREE_CONTENT><OBJECT_TYPES>${folders
    .map(
      (inner) =>
        `<SEU_ADT_OBJECT_TYPE_INFO>${inner}</SEU_ADT_OBJECT_TYPE_INFO>`,
    )
    .join('')}</OBJECT_TYPES></DATA></asx:values></asx:abap>`;

/** A class, a method with a technical name of its own, a nameless object, a node not loaded, two folders. */
const LEVEL = level(
  [
    '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME>ZCL_A</OBJECT_NAME><TECH_NAME>ZCL_A</TECH_NAME><OBJECT_URI>/sap/bc/adt/oo/classes/zcl_a</OBJECT_URI><DESCRIPTION>Class A</DESCRIPTION>',
    '<OBJECT_TYPE>PROG/P</OBJECT_TYPE><OBJECT_NAME>ZPROG</OBJECT_NAME><TECH_NAME>SAPLZPROG</TECH_NAME><DESCRIPTION>Program</DESCRIPTION>',
    '<OBJECT_TYPE>PROG/I</OBJECT_TYPE><OBJECT_NAME/><OBJECT_URI>/sap/bc/adt/programs/includes/nameless</OBJECT_URI>',
    '<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>',
  ],
  [
    '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_TYPE_LABEL>Classes</OBJECT_TYPE_LABEL><NODE_ID>000025</NODE_ID>',
    '<OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_TYPE_LABEL>Tables</OBJECT_TYPE_LABEL><NODE_ID>000003</NODE_ID>',
  ],
);

const PACKAGE_METADATA = corpusBody(
  'read-metadata-package--01-packages-zmcpshrpkg',
);

/** An answer's text and error flag. */
interface Answered {
  readonly isError: boolean;
  readonly text: string;
}

/** A context whose connection answers `documents` in order, on premise. */
function contextOn(documents: readonly string[]) {
  const connection = recordingConnection(documents.map((data) => ({ data })));
  declareSystemKind(connection, 'onprem');
  return { connection, logger: undefined };
}

/** The tool over `documents`, at `detail`. */
async function read(
  documents: readonly string[],
  options: {
    readonly parentType?: string;
    readonly detail?: DetailLevel;
    readonly descriptions?: boolean;
    readonly once?: boolean;
  } = {},
): Promise<Answered> {
  const handler =
    options.once === true ? handleGetNodeStructureOnce : handleGetNodeStructure;
  const result = await handler(contextOn(documents), {
    parent_type: options.parentType ?? 'PROG/P',
    parent_name: 'ZPARENT',
    ...(options.descriptions === undefined
      ? {}
      : { with_short_descriptions: options.descriptions }),
    ...(options.detail === undefined ? {} : { detail: options.detail }),
  });
  return {
    isError: result.isError === true,
    text: result.content.map((part) => part.text ?? '').join(''),
  };
}

describe('GetNodeStructureLow answers terse by default', () => {
  it('the count, a row per object, a line per node not loaded and per child node', async () => {
    const terse = await read([LEVEL]);
    assert.equal(terse.isError, false, terse.text);
    assert.equal(
      terse.text,
      [
        '# count 4',
        'type\tname\ttech_name\turi\tdescription',
        'CLAS/OC\tZCL_A\t\t\tClass A',
        'PROG/P\tZPROG\tSAPLZPROG\t\tProgram',
        'PROG/I\t\t\t/sap/bc/adt/programs/includes/nameless\t',
        '# not loaded by SAP',
        '# child_node\tCLAS/OC\t000025',
        '# child_node\tTABL/DT\t000003',
      ].join('\n'),
    );
  });

  it('no description column without short descriptions', async () => {
    const terse = await read([LEVEL], { descriptions: false });
    const lines = terse.text.split('\n');
    assert.equal(lines[1], 'type\tname\ttech_name\turi');
    assert.equal(lines[2], 'CLAS/OC\tZCL_A\t\t');
  });

  it('a blank body for a class: an empty level', async () => {
    const terse = await read([''], { parentType: 'CLAS/OC' });
    assert.equal(
      terse.text,
      '# count 0\ntype\tname\ttech_name\turi\tdescription',
    );
  });

  it("a package's blank body read once: both readings stated, nothing else asked", async () => {
    const terse = await read([''], { parentType: 'DEVC/K', once: true });
    assert.equal(
      terse.text,
      `# count 0\n# blank ${BLANK_PACKAGE_LISTING}\ntype\tname\ttech_name\turi\tdescription`,
    );
  });

  it("a package's blank body checked against its metadata: an empty level", async () => {
    const terse = await read(['', PACKAGE_METADATA], { parentType: 'DEVC/K' });
    assert.equal(terse.isError, false, terse.text);
    assert.equal(
      terse.text,
      '# count 0\ntype\tname\ttech_name\turi\tdescription',
    );
  });

  it('carries no JSON member of the fuller answer', async () => {
    const terse = await read([LEVEL]);
    for (const member of ['objects', 'childNodes', 'notLoaded', 'nodeId']) {
      assert.ok(!terse.text.includes(member), `${member} in ${terse.text}`);
    }
  });
});

describe('GetNodeStructureLow at medium, full and raw', () => {
  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: the level as JSON, as before`, async () => {
      const json = JSON.parse((await read([LEVEL], { detail })).text);
      assert.equal(json.notLoaded, true);
      assert.deepStrictEqual(json.objects[0], {
        name: 'ZCL_A',
        type: 'CLAS/OC',
        description: 'Class A',
        techName: 'ZCL_A',
        uri: '/sap/bc/adt/oo/classes/zcl_a',
      });
      assert.equal(json.objects.length, 3);
      assert.deepStrictEqual(json.childNodes, [
        { type: 'CLAS/OC', nodeId: '25' },
        { type: 'TABL/DT', nodeId: '3' },
      ]);
    });

    it(`${detail}: a package's blank body read once, both readings stated`, async () => {
      const json = JSON.parse(
        (await read([''], { parentType: 'DEVC/K', once: true, detail })).text,
      );
      assert.deepStrictEqual(json, {
        objects: [],
        childNodes: [],
        blank: BLANK_PACKAGE_LISTING,
      });
    });
  }

  it('raw: the document read, as SAP sent it', async () => {
    const raw = JSON.parse((await read([LEVEL], { detail: 'raw' })).text);
    assert.deepStrictEqual(raw, [{ status: 200, body: LEVEL }]);
  });

  it("raw: a package's blank body and its metadata, both documents", async () => {
    const raw = JSON.parse(
      (
        await read(['', PACKAGE_METADATA], {
          parentType: 'DEVC/K',
          detail: 'raw',
        })
      ).text,
    );
    assert.deepStrictEqual(
      raw.map((document: { body: string }) => document.body),
      ['', PACKAGE_METADATA],
    );
  });
});

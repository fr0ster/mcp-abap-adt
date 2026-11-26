/**
 * GetObjectInfo at each `detail`, on a destination with no communication
 * batch (reads one by one, in order) and a real adt-clients run on a
 * recording connection: terse the tree written by the listing writer — the
 * object's own row, then every node at its depth (type, name, description,
 * package); a list call each object under its `# asked` line, a failed one
 * with its `# error`. Medium and full the tree as JSON, as before; raw the
 * documents read.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetObjectInfo } from '../../handlers/system/readonly/handleGetObjectInfo';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../lib/batch/availability';
import { cellsOf, type DetailLevel } from '../../lib/detail';
import { declareSystemKind } from '../../lib/systemKind';
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

const node = (type: string, name: string) =>
  `<OBJECT_TYPE>${type}</OBJECT_TYPE><OBJECT_NAME>${name}</OBJECT_NAME><TECH_NAME>${name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${name.toLowerCase()}</OBJECT_URI>`;

const folder = (type: string, id: string) =>
  `<OBJECT_TYPE>${type}</OBJECT_TYPE><OBJECT_TYPE_LABEL>${type}</OBJECT_TYPE_LABEL><NODE_ID>${id}</NODE_ID>`;

/** What a quick search of `name` answers: the object with its package and description. */
const found = (name: string, type: string) =>
  `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/x/${name.toLowerCase()}" adtcore:type="${type}" adtcore:name="${name}" adtcore:packageName="ZPARENT" adtcore:description="Found ${name}"/></adtcore:objectReferences>`;

const REFUSED = {
  status: 403,
  data: `${xmlHead}<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionNotAuthorized"/><message lang="EN">no authorization</message></exc:exception>`,
};

/** A class: its root level lists one folder; the folder two methods. */
const CLASS_ANSWERS = [
  { data: level([], [folder('CLAS/OM', '000004')]) },
  { data: level([node('CLAS/OM', 'RUN'), node('CLAS/OM', 'STOP')]) },
];

/** A package two tiers deep, enriched: the search, its levels, the subpackage's search and levels. */
const PACKAGE_ANSWERS = [
  { data: found('ZROOT', 'DEVC/K') },
  { data: level([], [folder('DEVC/K', '000002'), folder('PROG/P', '000003')]) },
  { data: level([node('DEVC/K', 'ZSUB')]) },
  { data: found('ZSUB', 'DEVC/K') },
  { data: level([], [folder('PROG/P', '000003')]) },
  { data: level([node('PROG/P', 'ZPROG_SUB')]) },
  { data: level([node('PROG/P', 'ZPROG')]) },
];

/** A context reading `answers` one by one, on premise, with no communication batch. */
function contextOn(answers: ReadonlyArray<{ data: string; status?: number }>) {
  const connection = recordingConnection([...answers]);
  declareSystemKind(connection, 'onprem');
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return { connection, logger: undefined, batchAvailability };
}

/** An answer's text and error flag. */
interface Answered {
  readonly isError: boolean;
  readonly text: string;
}

async function info(
  answers: ReadonlyArray<{ data: string; status?: number }>,
  args: Parameters<typeof handleGetObjectInfo>[1],
  detail?: DetailLevel,
): Promise<Answered> {
  const result = await handleGetObjectInfo(contextOn(answers), {
    ...args,
    ...(detail === undefined ? {} : { detail }),
  });
  return {
    isError: result.isError === true,
    text: result.content.map((part) => part.text ?? '').join(''),
  };
}

const CLASS = {
  parent_type: 'CLAS/OC',
  parent_name: 'ZCL_X',
  enrich: false,
  maxDepth: 1,
};
const PACKAGE = { parent_type: 'DEVC/K', parent_name: 'ZROOT', maxDepth: 2 };

describe('GetObjectInfo answers terse by default: the tree as indented rows', () => {
  it('a class: its own row, each object below it one level deeper', async () => {
    const terse = await info(CLASS_ANSWERS, CLASS);
    assert.equal(terse.isError, false, terse.text);
    assert.equal(
      terse.text,
      ['CLAS/OC\tZCL_X\t\t', '  CLAS/OM\tRUN\t\t', '  CLAS/OM\tSTOP\t\t'].join(
        '\n',
      ),
    );
  });

  it('a package enriched: each node with its description and package, at its depth', async () => {
    const terse = await info(PACKAGE_ANSWERS, PACKAGE);
    assert.equal(terse.isError, false, terse.text);
    assert.equal(
      terse.text,
      [
        'DEVC/K\tZROOT\tFound ZROOT\tZPARENT',
        '  DEVC/K\tZSUB\tFound ZSUB\tZPARENT',
        '    PROG/P\tZPROG_SUB\t\t',
        '  PROG/P\tZPROG\t\t',
      ].join('\n'),
    );
  });

  it('carries no member name of the fuller answer', async () => {
    const terse = await info(PACKAGE_ANSWERS, PACKAGE);
    for (const member of ['OBJECT_', 'CHILDREN', '{']) {
      assert.ok(!terse.text.includes(member), `${member} in ${terse.text}`);
    }
  });

  it('several objects: each under its # asked line, a failed one with its # error', async () => {
    const terse = await info([...CLASS_ANSWERS, REFUSED], {
      objects: [
        { object_type: 'CLAS/OC', object_name: 'ZCL_X' },
        { object_type: 'CLAS/OC', object_name: 'ZCL_GONE' },
      ],
      enrich: false,
      maxDepth: 1,
    });
    assert.equal(terse.isError, false, terse.text);
    const lines = terse.text.split('\n');
    assert.deepStrictEqual(lines.slice(0, 5), [
      '# asked CLAS/OC ZCL_X',
      'CLAS/OC\tZCL_X\t\t',
      '  CLAS/OM\tRUN\t\t',
      '  CLAS/OM\tSTOP\t\t',
      '# asked CLAS/OC ZCL_GONE',
    ]);
    assert.equal(lines.length, 6, terse.text);
    const error = lines[5] ?? '';
    assert.ok(error.startsWith('# error {'), terse.text);
    assert.equal(
      // The value is one escaped cell: read back, it is the entry's JSON.
      JSON.parse(cellsOf(error.slice('# error '.length)).join('\t')).step,
      'read node structure',
    );
  });
});

describe('GetObjectInfo at medium, full and raw', () => {
  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: the tree as JSON, as before`, async () => {
      const json = JSON.parse(
        (await info(PACKAGE_ANSWERS, PACKAGE, detail)).text,
      );
      assert.deepStrictEqual(json, {
        OBJECT_TYPE: 'DEVC/K',
        OBJECT_NAME: 'ZROOT',
        OBJECT_DESCRIPTION: 'Found ZROOT',
        OBJECT_PACKAGE: 'ZPARENT',
        CHILDREN: [
          {
            OBJECT_TYPE: 'DEVC/K',
            OBJECT_NAME: 'ZSUB',
            OBJECT_DESCRIPTION: 'Found ZSUB',
            OBJECT_PACKAGE: 'ZPARENT',
            CHILDREN: [{ OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'ZPROG_SUB' }],
          },
          { OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'ZPROG' },
        ],
      });
    });

    it(`${detail}: several objects, an array of entries`, async () => {
      const json = JSON.parse(
        (
          await info(
            [...CLASS_ANSWERS, REFUSED],
            {
              objects: [
                { object_type: 'CLAS/OC', object_name: 'ZCL_X' },
                { object_type: 'CLAS/OC', object_name: 'ZCL_GONE' },
              ],
              enrich: false,
              maxDepth: 1,
            },
            detail,
          )
        ).text,
      );
      assert.equal(json.length, 2);
      assert.equal(json[0].CHILDREN.length, 2);
      assert.equal(json[1].OBJECT_NAME, 'ZCL_GONE');
      assert.equal(json[1].error.step, 'read node structure');
    });
  }

  it('raw: every document read, in read order', async () => {
    const raw = JSON.parse((await info(CLASS_ANSWERS, CLASS, 'raw')).text);
    assert.deepStrictEqual(
      raw,
      CLASS_ANSWERS.map(({ data }) => ({ status: 200, body: data })),
    );
  });
});

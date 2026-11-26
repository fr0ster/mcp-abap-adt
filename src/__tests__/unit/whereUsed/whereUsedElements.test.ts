/**
 * GetWhereUsed: a usage inside an element of another object (a method, a
 * section of a class).
 *
 * SAP lists such a usage as a `referencedObject` with no `adtcore:type`:
 * its `adtcore:name` is the element (`IF_OO_ADT_CLASSRUN~MAIN`), the
 * element's type is only in the URI fragment, and the object it belongs to
 * is only in `parentUri` — the list's own node at that URI (measured on the
 * cloud, ZMCP_SHR_DUMP_CLS, and on premise, /AIF/CL_APPL_ENGINE_LFA):
 *
 * ```
 * <referencedObject uri="…/oo/classes/zmcp_shr_dump_cls/source/main#type=CLAS%2FOM;name=IF_OO_ADT_CLASSRUN%7eMAIN"
 *   parentUri="/sap/bc/adt/oo/classes/zmcp_shr_dump_cls"
 *   usageInformation="gradeElement,includeProductive">
 *   <adtObject adtcore:name="IF_OO_ADT_CLASSRUN~MAIN">
 * ```
 *
 * terse and medium name the object it belongs to — the type and name of the
 * node at `parentUri` — and the element in its own column, one row per
 * element; full keeps SAP's fields and carries the object and the element
 * beside them. A row with no type and no node at its `parentUri` is
 * answered as SAP gave it, its URI what tells where it is.
 *
 * Replayed over a recording connection: real adt-clients code, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';
import { terseOf, whereUsedRows } from '../../integration/helpers/terseAnswer';

const CLASS_URI = '/sap/bc/adt/oo/classes/zmcp_shr_dump_cls';
const MAIN_URI = `${CLASS_URI}/source/main#type=CLAS%2FOM;name=IF_OO_ADT_CLASSRUN%7eMAIN`;
const CONSTRUCTOR_URI = `${CLASS_URI}/source/main#type=CLAS%2FOM;name=CONSTRUCTOR`;
const INTERFACE_URI = '/sap/bc/adt/oo/interfaces/zif_shr_owner';
const ORPHAN_URI =
  '/sap/bc/adt/oo/classes/zcl_absent/source/main#type=CLAS%2FOM;name=RUN';

interface Row {
  uri: string;
  parentUri?: string;
  usage?: string;
  name: string;
  type?: string;
  pkg?: string;
}

/** One `referencedObject`, attributes only where the row has them. */
function referenced(row: Row): string {
  const attributes = [
    `uri="${row.uri}"`,
    ...(row.parentUri === undefined ? [] : [`parentUri="${row.parentUri}"`]),
    'isResult="false"',
    ...(row.usage === undefined ? [] : [`usageInformation="${row.usage}"`]),
  ].join(' ');
  const type = row.type === undefined ? '' : ` adtcore:type="${row.type}"`;
  const pkg =
    row.pkg === undefined
      ? ''
      : `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${row.pkg.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${row.pkg}"/>`;
  return `<usagereferences:referencedObject ${attributes}><usagereferences:adtObject adtcore:name="${row.name}"${type} xmlns:adtcore="http://www.sap.com/adt/core">${pkg}</usagereferences:adtObject></usagereferences:referencedObject>`;
}

function documentOf(rows: Row[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult numberOfResults="${rows.length}" resultDescription="Where-Used List: IF_OO_ADT_CLASSRUN (Interface)" xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:referencedObjects>${rows.map(referenced).join('')}</usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;
}

/** The package node, the class node, two element usages, a typed usage. */
const ROWS: Row[] = [
  {
    uri: '/sap/bc/adt/packages/zmcp_shr_pkg',
    name: 'ZMCP_SHR_PKG',
    type: 'DEVC/K',
    pkg: 'ZMCP_SHR_PKG',
  },
  {
    uri: CLASS_URI,
    parentUri: '/sap/bc/adt/packages/zmcp_shr_pkg',
    name: 'ZMCP_SHR_DUMP_CLS',
    type: 'CLAS/OC',
    pkg: 'ZMCP_SHR_PKG',
  },
  {
    uri: MAIN_URI,
    parentUri: CLASS_URI,
    usage: 'gradeElement,includeProductive',
    name: 'IF_OO_ADT_CLASSRUN~MAIN',
  },
  {
    uri: CONSTRUCTOR_URI,
    parentUri: CLASS_URI,
    usage: 'gradeElement,includeProductive',
    name: 'CONSTRUCTOR',
  },
  {
    uri: '/sap/bc/adt/programs/programs/zmcp_shr_prog',
    parentUri: '/sap/bc/adt/packages/zmcp_shr_pkg',
    usage: 'gradeDirect,includeTest',
    name: 'ZMCP_SHR_PROG',
    type: 'PROG/P',
    pkg: 'ZMCP_SHR_PKG',
  },
];

const DOCUMENT = documentOf(ROWS);

/** A destination whose communication batch answered it is not served. */
function noBatch() {
  const availability = createBatchAvailability();
  availability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return availability;
}

async function whereUsed(
  detail: 'terse' | 'medium' | 'full',
  document: string = DOCUMENT,
): Promise<string> {
  const connection = recordingConnection([{ data: document }]);
  declareSystemKind(connection, 'cloud');
  const result = await handleGetWhereUsed(
    { connection, logger: undefined, batchAvailability: noBatch() },
    { object_name: 'IF_OO_ADT_CLASSRUN', object_type: 'INTF/OI', detail },
  );
  assert.equal(result.isError, false, result.content[0]?.text);
  return result.content[0]?.text ?? '';
}

/**
 * The terse rows, each by the header's column names, a row under an
 * `# in TYPE NAME` line read with that type and name (`whereUsedRows`).
 */
function terseRows(text: string): Array<Readonly<Record<string, string>>> {
  return [...whereUsedRows(terseOf(text))];
}

interface MediumReference {
  type: string;
  name: string;
  element?: string;
  uri?: string;
  package_name?: string;
}

async function mediumReferences(
  document: string = DOCUMENT,
): Promise<MediumReference[]> {
  const answer: { references: MediumReference[] } = JSON.parse(
    await whereUsed('medium', document),
  );
  return answer.references;
}

describe('GetWhereUsed: a usage inside an element of another object', () => {
  it('terse: one row per element, each the class by its type and name, the element in its column', async () => {
    const text = await whereUsed('terse');
    assert.deepStrictEqual(
      terseRows(text).map(({ type, name, element }) => ({
        type,
        name,
        element,
      })),
      [
        { type: 'PROG/P', name: 'ZMCP_SHR_PROG', element: '' },
        {
          type: 'CLAS/OC',
          name: 'ZMCP_SHR_DUMP_CLS',
          element: 'IF_OO_ADT_CLASSRUN~MAIN',
        },
        { type: 'CLAS/OC', name: 'ZMCP_SHR_DUMP_CLS', element: 'CONSTRUCTOR' },
      ],
      text,
    );
  });

  it('terse: an element usage is grouped under its class package', async () => {
    const text = await whereUsed('terse');
    const lines = text.split('\n');
    assert.deepStrictEqual(
      lines.filter((line) => line.startsWith('# package')),
      ['# package ZMCP_SHR_PKG'],
      text,
    );
  });

  // The class written once, its elements under it: the answer of 107k
  // usages stays one stdio message (largeListing.test.ts).
  it('terse: the plain usages first, then the class once on its # in line, each element under it', async () => {
    assert.equal(
      await whereUsed('terse'),
      [
        '# total 5',
        'type\tname\telement\turi\tusage',
        '# package ZMCP_SHR_PKG',
        'PROG/P\tZMCP_SHR_PROG\t\t\tgradeDirect,includeTest',
        '# in CLAS/OC ZMCP_SHR_DUMP_CLS',
        '\t\tIF_OO_ADT_CLASSRUN~MAIN\t\tgradeElement,includeProductive',
        '\t\tCONSTRUCTOR\t\tgradeElement,includeProductive',
      ].join('\n'),
    );
  });

  it('terse: every row names its object, on the row or on its # in line', async () => {
    const text = await whereUsed('terse');
    for (const row of terseRows(text)) {
      assert.notEqual(row.type, '', text);
      assert.notEqual(row.name, '', text);
    }
  });

  it('medium: the element usages name the class, the element beside it', async () => {
    const references = await mediumReferences();
    const usages = references.filter(
      (reference) => reference.element !== undefined,
    );
    assert.deepStrictEqual(
      usages.map(({ type, name, element }) => ({ type, name, element })),
      [
        {
          type: 'CLAS/OC',
          name: 'ZMCP_SHR_DUMP_CLS',
          element: 'IF_OO_ADT_CLASSRUN~MAIN',
        },
        { type: 'CLAS/OC', name: 'ZMCP_SHR_DUMP_CLS', element: 'CONSTRUCTOR' },
      ],
    );
    for (const reference of references) {
      assert.notEqual(reference.type, '', JSON.stringify(reference));
      assert.notEqual(reference.name, '', JSON.stringify(reference));
      assert.equal(reference.uri, undefined, JSON.stringify(reference));
    }
    const program = references.find(
      (reference) => reference.name === 'ZMCP_SHR_PROG',
    );
    assert.deepStrictEqual(
      { type: program?.type, element: program?.element },
      { type: 'PROG/P', element: undefined },
    );
  });

  it("full: SAP's fields as they came, the class and the element beside them", async () => {
    const answer: { references: Array<Record<string, string>> } = JSON.parse(
      await whereUsed('full'),
    );
    const main = answer.references.find(
      (reference) => reference.uri === MAIN_URI,
    );
    assert.deepStrictEqual(main, {
      name: 'IF_OO_ADT_CLASSRUN~MAIN',
      type: '',
      uri: MAIN_URI,
      parent_uri: CLASS_URI,
      usage_information: 'gradeElement,includeProductive',
      parent_type: 'CLAS/OC',
      parent_name: 'ZMCP_SHR_DUMP_CLS',
      parent_package: 'ZMCP_SHR_PKG',
      element: 'IF_OO_ADT_CLASSRUN~MAIN',
    });
  });

  // A consumer's check: full held the using objects, terse lost them.
  // Every using object full shows — a usage's own type and name, or the
  // object an element usage is in — is a terse row with that type and name.
  it('every using object visible at full is a terse row with its type and name', async () => {
    const full: { references: Array<Record<string, string | undefined>> } =
      JSON.parse(await whereUsed('full'));
    const atFull = full.references
      .filter((reference) => reference.usage_information !== undefined)
      .map((reference) => ({
        type: reference.parent_type ?? reference.type,
        name: reference.parent_name ?? reference.name,
        element: reference.element ?? '',
      }));
    assert.equal(atFull.length, 3);
    const atTerse = terseRows(await whereUsed('terse')).map(
      ({ type, name, element }) => ({ type, name, element }),
    );
    const key = (row: {
      type?: string | undefined;
      name?: string | undefined;
      element?: string | undefined;
    }) => `${row.type ?? ''}\t${row.name ?? ''}\t${row.element ?? ''}`;
    assert.deepStrictEqual(
      atTerse.map(key).sort(),
      atFull.map((row) => key(row)).sort(),
    );
    for (const row of atTerse) {
      assert.ok(row.type !== '' && row.name !== '', JSON.stringify(row));
    }
  });

  // The node's own type, never a guessed CLAS/OC.
  it('the object is the node at parentUri, by its own type', async () => {
    const document = documentOf([
      {
        uri: INTERFACE_URI,
        name: 'ZIF_SHR_OWNER',
        type: 'INTF/OI',
        pkg: 'ZMCP_SHR_PKG',
      },
      {
        uri: `${INTERFACE_URI}/source/main#type=INTF%2FIO;name=RUN`,
        parentUri: INTERFACE_URI,
        usage: 'gradeElement,includeProductive',
        name: 'RUN',
      },
    ]);
    assert.deepStrictEqual(
      terseRows(await whereUsed('terse', document)).map(
        ({ type, name, element }) => ({ type, name, element }),
      ),
      [{ type: 'INTF/OI', name: 'ZIF_SHR_OWNER', element: 'RUN' }],
    );
    assert.deepStrictEqual(
      (await mediumReferences(document))
        .filter((reference) => reference.element !== undefined)
        .map(({ type, name }) => ({ type, name })),
      [{ type: 'INTF/OI', name: 'ZIF_SHR_OWNER' }],
    );
  });

  // No type and no node at parentUri: as SAP gave it, no placeholder —
  // its URI what tells where it is.
  it('a row with no type and no node at its parentUri is answered as SAP gave it', async () => {
    const document = documentOf([
      ...ROWS,
      {
        uri: ORPHAN_URI,
        parentUri: '/sap/bc/adt/oo/classes/zcl_absent',
        usage: 'gradeElement,includeProductive',
        name: 'RUN',
      },
    ]);
    const orphan = terseRows(await whereUsed('terse', document)).find(
      (row) => row.uri === ORPHAN_URI,
    );
    assert.deepStrictEqual(
      orphan && {
        type: orphan.type,
        name: orphan.name,
        element: orphan.element,
      },
      { type: '', name: 'RUN', element: '' },
    );
    const medium = (await mediumReferences(document)).find(
      (reference) => reference.uri === ORPHAN_URI,
    );
    assert.deepStrictEqual(
      medium && {
        type: medium.type,
        name: medium.name,
        element: medium.element,
      },
      { type: '', name: 'RUN', element: undefined },
    );
  });

  // Two candidate owners: ZCL_SHR (whose URI is a prefix of the element's)
  // listed first, the real owner ZCL_SHR_OWNER after its element — only
  // parentUri picks it.
  it('the owner is the node at parentUri, not one whose URI is a prefix, wherever it is listed', async () => {
    const decoy = '/sap/bc/adt/oo/classes/zcl_shr';
    const owner = '/sap/bc/adt/oo/classes/zcl_shr_owner';
    const document = documentOf([
      { uri: decoy, name: 'ZCL_SHR', type: 'CLAS/OC', pkg: 'ZMCP_SHR_PKG' },
      {
        uri: `${owner}/source/main#type=CLAS%2FOM;name=RUN`,
        parentUri: owner,
        usage: 'gradeElement,includeProductive',
        name: 'RUN',
      },
      {
        uri: owner,
        name: 'ZCL_SHR_OWNER',
        type: 'CLAS/OC',
        pkg: 'ZMCP_SHR_PKG',
      },
    ]);
    assert.deepStrictEqual(
      terseRows(await whereUsed('terse', document)).map(
        ({ type, name, element }) => ({ type, name, element }),
      ),
      [{ type: 'CLAS/OC', name: 'ZCL_SHR_OWNER', element: 'RUN' }],
    );
  });

  // Several objects: each answer is resolved against its own list. The
  // second answer names the class at parentUri but does not list it.
  it('several objects: an element is resolved against its own answer, not another', async () => {
    const second = documentOf([
      {
        uri: MAIN_URI,
        parentUri: CLASS_URI,
        usage: 'gradeElement,includeProductive',
        name: 'IF_OO_ADT_CLASSRUN~MAIN',
      },
    ]);
    const connection = recordingConnection([
      { data: DOCUMENT },
      { data: second },
    ]);
    declareSystemKind(connection, 'cloud');
    const result = await handleGetWhereUsed(
      { connection, logger: undefined, batchAvailability: noBatch() },
      {
        objects: [
          { object_name: 'IF_OO_ADT_CLASSRUN', object_type: 'INTF/OI' },
          { object_name: 'IF_OO_ADT_CLASSRUN', object_type: 'INTF/OI' },
        ],
        detail: 'terse',
      },
    );
    assert.equal(result.isError, false, result.content[0]?.text);
    const text = result.content[0]?.text ?? '';
    // Each object's answer under its `# object` line, that line left out.
    const sections = text
      .split('# object ')
      .slice(1)
      .map((section) => section.slice(section.indexOf('\n') + 1));
    assert.equal(sections.length, 2, text);
    assert.deepStrictEqual(
      terseRows(sections[0] ?? '').map(({ type, name, element }) => ({
        type,
        name,
        element,
      })),
      [
        { type: 'PROG/P', name: 'ZMCP_SHR_PROG', element: '' },
        {
          type: 'CLAS/OC',
          name: 'ZMCP_SHR_DUMP_CLS',
          element: 'IF_OO_ADT_CLASSRUN~MAIN',
        },
        { type: 'CLAS/OC', name: 'ZMCP_SHR_DUMP_CLS', element: 'CONSTRUCTOR' },
      ],
      text,
    );
    assert.deepStrictEqual(
      terseRows(sections[1] ?? '').map(({ type, name, element, uri }) => ({
        type,
        name,
        element,
        uri,
      })),
      [
        {
          type: '',
          name: 'IF_OO_ADT_CLASSRUN~MAIN',
          element: '',
          uri: MAIN_URI,
        },
      ],
      text,
    );
  });
});

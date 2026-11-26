/**
 * GetWhereUsed at each `detail` (terse answers, step 3).
 *
 * - **terse** (default): the usages as TSV, grouped by package — `# total N`,
 *   the header `type\tname\telement\turi\tusage`, a `# package P` group line, one row per
 *   usage. A row is a usage when SAP gave it `usageInformation`; the package
 *   and container nodes of SAP's tree carry none and leave. The usage cell is
 *   empty for the common `gradeDirect,includeProductive`. No uri.
 * - **medium**: every reference with every field the reading has, no uri.
 * - **full**: the answer as it was before `detail`.
 * - **raw**: SAP's document.
 *
 * Several objects at terse are one text, each object's answer under its
 * `# object TYPE NAME` line.
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

const ref = (
  uri: string,
  type: string,
  name: string,
  pkg: string,
  usage?: string,
) =>
  `<usagereferences:referencedObject uri="${uri}" isResult="false" canHaveChildren="true"${usage === undefined ? '' : ` usageInformation="${usage}"`}><usagereferences:adtObject adtcore:responsible="SAPUSER01" adtcore:name="${name}" adtcore:type="${type}" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${pkg.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${pkg}"/></usagereferences:adtObject></usagereferences:referencedObject>`;

/** SAP's tree: two package nodes, a container, three usages in two packages. */
const DOCUMENT = `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult numberOfResults="3" resultDescription="Where-Used List: ZCL_X (Class)" xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:referencedObjects>${[
  ref('/sap/bc/adt/packages/ztop', 'DEVC/K', 'ZTOP', 'ZTOP'),
  ref('/sap/bc/adt/packages/zpkg', 'DEVC/K', 'ZPKG', 'ZPKG'),
  ref('/sap/bc/adt/oo/classes/zcl_box', 'CLAS/OC', 'ZCL_BOX', 'ZPKG'),
  ref(
    '/sap/bc/adt/oo/classes/zcl_user',
    'CLAS/OC',
    'ZCL_USER',
    'ZPKG',
    'gradeDirect,includeProductive',
  ),
  ref(
    '/sap/bc/adt/programs/programs/zprog',
    'PROG/P',
    'ZPROG',
    'ZPKG',
    'gradeDirect,includeTest',
  ),
  ref(
    '/sap/bc/adt/oo/interfaces/zif_x',
    'INTF/OI',
    'ZIF_X',
    'ZOTHER',
    'gradeDirect,includeProductive',
  ),
].join(
  '',
)}</usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;

/** A destination whose communication batch answered it is not served. */
function noBatch() {
  const availability = createBatchAvailability();
  availability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return availability;
}

async function whereUsed(
  detail: 'terse' | 'medium' | 'full' | 'raw' | undefined,
  documents: string[] = [DOCUMENT],
  objects?: Array<{ object_name: string; object_type: string }>,
) {
  const connection = recordingConnection(documents.map((data) => ({ data })));
  declareSystemKind(connection, 'onprem');
  // No communication batch: several objects are read one after another.
  const result = await handleGetWhereUsed(
    {
      connection,
      logger: undefined,
      batchAvailability: noBatch(),
    },
    {
      ...(objects === undefined
        ? { object_name: 'ZCL_X', object_type: 'CLAS/OC' }
        : { objects }),
      ...(detail === undefined ? {} : { detail }),
    },
  );
  assert.equal(result.isError, false, result.content[0]?.text);
  return result.content[0]?.text ?? '';
}

describe('GetWhereUsed detail', () => {
  it('terse, by default: the usages grouped by package, no node, the uri only for a nameless one', async () => {
    const expected = [
      '# total 3',
      'type\tname\telement\turi\tusage',
      '# package ZPKG',
      'CLAS/OC\tZCL_USER\t\t\t',
      'PROG/P\tZPROG\t\t\tgradeDirect,includeTest',
      '# package ZOTHER',
      'INTF/OI\tZIF_X\t\t\t',
    ].join('\n');
    assert.equal(await whereUsed(undefined), expected);
    assert.equal(await whereUsed('terse'), expected);
  });

  // Codex round 7: a reference SAP lists without a name but with an
  // address and a usage is an object that uses the one asked — it reaches
  // every level, counted, its URI what tells it apart.
  const NAMELESS = DOCUMENT.replace(
    '</usagereferences:referencedObjects>',
    `${ref('/sap/bc/adt/oo/classes/nameless', 'CLAS/OC', '', 'ZPKG', 'gradeDirect,includeTest')}</usagereferences:referencedObjects>`,
  );
  for (const detail of ['terse', 'medium', 'full'] as const) {
    it(`a nameless usage with its uri reaches ${detail}`, async () => {
      const text = await whereUsed(detail, [NAMELESS]);
      assert.ok(text.includes('/sap/bc/adt/oo/classes/nameless'), text);
    });
  }

  it('medium: every reference with every field, no uri', async () => {
    const answer = JSON.parse(await whereUsed('medium'));
    assert.equal(answer.total_references, 3);
    assert.equal(answer.result_description, 'Where-Used List: ZCL_X (Class)');
    assert.equal(answer.references.length, 6);
    assert.deepStrictEqual(answer.references[3], {
      name: 'ZCL_USER',
      type: 'CLAS/OC',
      package_name: 'ZPKG',
      responsible: 'SAPUSER01',
      usage_information: 'gradeDirect,includeProductive',
    });
    assert.equal(
      answer.references.some((r: object) => 'uri' in r),
      false,
    );
  });

  it('full: the answer as it was before detail, uri included', async () => {
    const answer = JSON.parse(await whereUsed('full'));
    assert.deepStrictEqual(Object.keys(answer), [
      'object_name',
      'object_type',
      'enable_all_types',
      'total_references',
      'result_description',
      'references',
    ]);
    assert.equal(answer.references.length, 6);
    assert.equal(answer.references[3].uri, '/sap/bc/adt/oo/classes/zcl_user');
  });

  // GetWhereUsed assembles reads (the scope beside the usages, several
  // objects), so its raw is the array of the documents, whatever the call
  // (Codex round 5, P1-3): one object's call too.
  it('raw: the array of the documents as SAP sent them, one object too', async () => {
    assert.equal(
      await whereUsed('raw'),
      JSON.stringify([{ status: 200, body: DOCUMENT }]),
    );
  });

  it('several objects at terse: one text, each under its object line', async () => {
    const text = await whereUsed(
      'terse',
      [DOCUMENT, DOCUMENT],
      [
        { object_name: 'ZCL_X', object_type: 'CLAS/OC' },
        { object_name: 'ZCL_Y', object_type: 'CLAS/OC' },
      ],
    );
    const lines = text.split('\n');
    assert.equal(lines[0], '# object CLAS/OC ZCL_X');
    assert.equal(lines[1], '# total 3');
    assert.equal(lines.filter((line) => line.startsWith('# object')).length, 2);
    assert.ok(lines.includes('# object CLAS/OC ZCL_Y'));
  });

  // Codex round 8: an empty usageInformation is still a usage — the
  // attribute's presence decides, never its value.
  it('a nameless usage with usageInformation="" reaches terse by its uri', async () => {
    const EMPTY = DOCUMENT.replace(
      '</usagereferences:referencedObjects>',
      `${ref('/sap/bc/adt/oo/classes/empty', 'CLAS/OC', '', 'ZPKG', '')}</usagereferences:referencedObjects>`,
    );
    for (const detail of ['terse', 'medium', 'full'] as const) {
      const text = await whereUsed(detail, [EMPTY]);
      assert.ok(text.includes('/sap/bc/adt/oo/classes/empty'), text);
    }
  });

  // Codex round 8: several objects' text is written through `Written` —
  // a name holding a line break adds no row.
  it('several objects: a name with a line break adds no row', async () => {
    const forged = 'ZCL_Y\nCLAS/OC\tZFORGED\t\t';
    const text = await whereUsed(
      'terse',
      [DOCUMENT, DOCUMENT],
      [
        { object_name: 'ZCL_X', object_type: 'CLAS/OC' },
        { object_name: forged, object_type: 'CLAS/OC' },
      ],
    );
    const lines = text.split('\n');
    assert.equal(
      lines.filter((line) => line.startsWith('CLAS/OC\tZFORGED')).length,
      0,
      text,
    );
    assert.equal(lines.filter((line) => line.startsWith('# object')).length, 2);
  });

  // Step 9: the nodes of SAP's tree are the one kind terse leaves out
  // (`omit`); a reference SAP gave usageInformation — empty too — is a
  // usage, never in the omitted kind.
  it('terse: every reference with usageInformation is a row, only the nodes leave', async () => {
    const WITH_EMPTY = DOCUMENT.replace(
      '</usagereferences:referencedObjects>',
      `${ref('/sap/bc/adt/oo/classes/zcl_empty', 'CLAS/OC', 'ZCL_EMPTY', 'ZPKG', '')}</usagereferences:referencedObjects>`,
    );
    const lines = (await whereUsed('terse', [WITH_EMPTY])).split('\n');
    const rows = lines.filter((line) => !line.startsWith('#')).slice(1);
    assert.deepStrictEqual(
      rows.map((row) => row.split('\t')[1]),
      ['ZCL_USER', 'ZPROG', 'ZCL_EMPTY', 'ZIF_X'],
      lines.join('\n'),
    );
  });
});

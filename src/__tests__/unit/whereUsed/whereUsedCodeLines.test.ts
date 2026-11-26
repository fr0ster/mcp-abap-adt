/**
 * GetWhereUsed: each usage with the source line it is on.
 *
 * After `usageReferences`, ONE `usageSnippets` POST asks for the code lines
 * of every usage by its `objectIdentifier`; each `codeSnippetObject` is
 * joined back to its reference by that identifier (measured on premise and
 * on the cloud, 2026-11-26). The answer the owner measured, for a data
 * element used in a method:
 *
 * ```
 * <usageReferences:codeSnippetObject>
 *   <objectIdentifier>ABAPFullName;ZCL_OK_TEST===================CP;ZCL_OK_TEST===================CM001;\TY:ZMCP_SHR_DTEL</objectIdentifier>
 *   <usageReferences:codeSnippets>
 *     <usageReferences:codeSnippet uri="/sap/bc/adt/oo/classes/zcl_ok_test/source/main#type=CLAS%2FOM;name=TESTER;start=2,10;end=2,17" matches="10-17,accessUnknown,gradeComponent, indirect;23-36,accessUnknown,gradeDirect">
 *       <content>    DATA: lv_test TYPE ZMCP_SHR_DTEL.</content>
 * ```
 *
 * terse: the place and the line (`code`, trimmed), one row per line, the
 * class on its `# in` line; a usage SAP gave no line (not in code) has
 * none. medium the same rows; full SAP's snippets, positions included. A
 * refused snippet read is the call's failure, never the list without its
 * lines.
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
import { USAGE_SNIPPETS_URL } from '../../../lib/strategies/usageSnippets';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

const CLASS_URI = '/sap/bc/adt/oo/classes/zcl_ok_test';
const OTHER_URI = '/sap/bc/adt/oo/classes/zcl_ok_other';
const PROGRAM_URI = '/sap/bc/adt/programs/programs/zmcp_shr_prog';
const TABLE_URI = '/sap/bc/adt/ddic/tables/zmcp_shr_tabl';

const TESTER_ID =
  'ABAPFullName;ZCL_OK_TEST===================CP;ZCL_OK_TEST===================CM001;\\TY:ZMCP_SHR_DTEL';
const OTHER_ID =
  'ABAPFullName;ZCL_OK_OTHER==================CP;ZCL_OK_OTHER==================CU;\\TY:ZMCP_SHR_DTEL';
const PROGRAM_ID =
  'ABAPFullName;ZMCP_SHR_PROG;ZMCP_SHR_PROG;\\TY:ZMCP_SHR_DTEL';
const TABLE_ID = 'DDLFullName;ZMCP_SHR_TABL;\\TY:ZMCP_SHR_DTEL';

interface Row {
  uri: string;
  parentUri?: string;
  usage?: string;
  name: string;
  type?: string;
  identifier?: string;
}

function referenced(row: Row): string {
  const attributes = [
    `uri="${row.uri}"`,
    ...(row.parentUri === undefined ? [] : [`parentUri="${row.parentUri}"`]),
    'isResult="false"',
    ...(row.usage === undefined ? [] : [`usageInformation="${row.usage}"`]),
  ].join(' ');
  const type = row.type === undefined ? '' : ` adtcore:type="${row.type}"`;
  const identifier =
    row.identifier === undefined
      ? ''
      : `<usagereferences:objectIdentifier>${row.identifier}</usagereferences:objectIdentifier>`;
  return `<usagereferences:referencedObject ${attributes}><usagereferences:adtObject adtcore:name="${row.name}"${type} xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/zmcp_shr_pkg" adtcore:type="DEVC/K" adtcore:name="ZMCP_SHR_PKG"/></usagereferences:adtObject>${identifier}</usagereferences:referencedObject>`;
}

/** The class node, its method TESTER, another class, a program, a table. */
const REFERENCES = `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult numberOfResults="5" resultDescription="Where-Used List: ZMCP_SHR_DTEL (Data Element)" xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:referencedObjects>${[
  { uri: CLASS_URI, name: 'ZCL_OK_TEST', type: 'CLAS/OC' },
  {
    uri: `${CLASS_URI}/source/main#type=CLAS%2FOM;name=TESTER`,
    parentUri: CLASS_URI,
    usage: 'gradeElement,includeProductive',
    name: 'TESTER',
    identifier: TESTER_ID,
  },
  {
    uri: OTHER_URI,
    usage: 'gradeDirect,includeTest',
    name: 'ZCL_OK_OTHER',
    type: 'CLAS/OC',
    identifier: OTHER_ID,
  },
  {
    uri: PROGRAM_URI,
    usage: 'gradeDirect,includeTest',
    name: 'ZMCP_SHR_PROG',
    type: 'PROG/P',
    identifier: PROGRAM_ID,
  },
  {
    uri: TABLE_URI,
    usage: 'gradeDirect,includeTest',
    name: 'ZMCP_SHR_TABL',
    type: 'TABL/DT',
    identifier: TABLE_ID,
  },
]
  .map(referenced)
  .join(
    '',
  )}</usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;

function snippet(uri: string, content: string): string {
  return `<usageReferences:codeSnippet uri="${uri}" matches="10-17,accessUnknown,gradeDirect"><content>${content}</content><description>Usage Kind: direct usage</description></usageReferences:codeSnippet>`;
}

function snippetObject(identifier: string, snippets: string[]): string {
  return `<usageReferences:codeSnippetObject><objectIdentifier>${identifier}</objectIdentifier><usageReferences:codeSnippets>${snippets.join('')}</usageReferences:codeSnippets></usageReferences:codeSnippetObject>`;
}

/**
 * SAP's answer, its objects in another order than asked: the program's
 * line (no `name=`: SAP names no FORM), the other class's line inside RUN
 * (`name=` the element), TESTER's two lines. The table, not in code, has
 * none.
 */
const SNIPPETS = `<?xml version="1.0" encoding="utf-8"?><usageReferences:usageSnippetResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences"><usageReferences:codeSnippetObjects>${[
  snippetObject(PROGRAM_ID, [
    snippet(
      `${PROGRAM_URI}/source/main#start=12,3;end=12,16`,
      '  DATA lv_prog TYPE zmcp_shr_dtel.',
    ),
  ]),
  snippetObject(OTHER_ID, [
    snippet(
      `${OTHER_URI}/source/main#type=CLAS%2FOM;name=RUN;start=4,10;end=4,17`,
      '      DATA lv_run TYPE zmcp_shr_dtel.',
    ),
  ]),
  snippetObject(TESTER_ID, [
    snippet(
      `${CLASS_URI}/source/main#type=CLAS%2FOM;name=TESTER;start=2,10;end=2,17`,
      '    DATA: lv_test TYPE ZMCP_SHR_DTEL.',
    ),
    snippet(
      `${CLASS_URI}/source/main#type=CLAS%2FOM;name=TESTER;start=3,10;end=3,17`,
      '    DATA: lv_more TYPE ZMCP_SHR_DTEL.',
    ),
  ]),
].join(
  '',
)}</usageReferences:codeSnippetObjects></usageReferences:usageSnippetResult>`;

function noBatch() {
  const availability = createBatchAvailability();
  availability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return availability;
}

async function whereUsed(
  detail: 'terse' | 'medium' | 'full',
  snippets: { data: string; status?: number } = { data: SNIPPETS },
) {
  const connection = recordingConnection([{ data: REFERENCES }, snippets]);
  declareSystemKind(connection, 'onprem');
  const result = await handleGetWhereUsed(
    { connection, logger: undefined, batchAvailability: noBatch() },
    { object_name: 'ZMCP_SHR_DTEL', object_type: 'DTEL/DE', detail },
  );
  return { result, connection, text: result.content[0]?.text ?? '' };
}

describe('GetWhereUsed: each usage with its code line', () => {
  it('terse: the place and the trimmed line, one row per line, the class on its # in line; no line for a usage not in code', async () => {
    const { result, text } = await whereUsed('terse');
    assert.equal(result.isError, false, text);
    assert.equal(
      text,
      [
        '# total 5',
        'type\tname\telement\turi\tusage\tcode',
        '# package ZMCP_SHR_PKG',
        'PROG/P\tZMCP_SHR_PROG\t\t\tgradeDirect,includeTest\tDATA lv_prog TYPE zmcp_shr_dtel.',
        'TABL/DT\tZMCP_SHR_TABL\t\t\tgradeDirect,includeTest\t',
        '# in CLAS/OC ZCL_OK_TEST',
        '\t\tTESTER\t\tgradeElement,includeProductive\tDATA: lv_test TYPE ZMCP_SHR_DTEL.',
        '\t\tTESTER\t\tgradeElement,includeProductive\tDATA: lv_more TYPE ZMCP_SHR_DTEL.',
        '# in CLAS/OC ZCL_OK_OTHER',
        '\t\tRUN\t\tgradeDirect,includeTest\tDATA lv_run TYPE zmcp_shr_dtel.',
      ].join('\n'),
    );
  });

  it('one usageSnippets request, after the references, naming every usage by its identifier', async () => {
    const { connection } = await whereUsed('terse');
    const snippetRequests = connection.requests.filter(
      (request) => request.url === USAGE_SNIPPETS_URL,
    );
    assert.equal(snippetRequests.length, 1);
    const [request] = snippetRequests;
    assert.equal(request?.method, 'POST');
    assert.equal(
      request?.headers?.Accept,
      'application/vnd.sap.adt.repository.usagesnippets.result.v1+xml',
    );
    assert.equal(
      request?.headers?.['Content-Type'],
      'application/vnd.sap.adt.repository.usagesnippets.request.v1+xml',
    );
    const body = String(request?.data);
    for (const identifier of [TESTER_ID, OTHER_ID, PROGRAM_ID, TABLE_ID]) {
      assert.ok(
        body.includes(
          `<usagereferences:objectIdentifier optional="false">${identifier}</usagereferences:objectIdentifier>`,
        ),
        body,
      );
    }
    assert.equal(body.includes('maximumNumberOfResults'), false, body);
  });

  it('medium: the same rows, each with its code line', async () => {
    const { text } = await whereUsed('medium');
    const answer: {
      references: Array<{
        type: string;
        name: string;
        element?: string;
        code?: string;
      }>;
    } = JSON.parse(text);
    assert.deepStrictEqual(
      answer.references
        .filter((reference) => reference.code !== undefined)
        .map(({ type, name, element, code }) => ({
          type,
          name,
          element,
          code,
        })),
      [
        {
          type: 'CLAS/OC',
          name: 'ZCL_OK_TEST',
          element: 'TESTER',
          code: 'DATA: lv_test TYPE ZMCP_SHR_DTEL.',
        },
        {
          type: 'CLAS/OC',
          name: 'ZCL_OK_TEST',
          element: 'TESTER',
          code: 'DATA: lv_more TYPE ZMCP_SHR_DTEL.',
        },
        {
          type: 'CLAS/OC',
          name: 'ZCL_OK_OTHER',
          element: 'RUN',
          code: 'DATA lv_run TYPE zmcp_shr_dtel.',
        },
        {
          type: 'PROG/P',
          name: 'ZMCP_SHR_PROG',
          element: undefined,
          code: 'DATA lv_prog TYPE zmcp_shr_dtel.',
        },
      ],
    );
  });

  it("full: SAP's snippets as they came, the position included", async () => {
    const { text } = await whereUsed('full');
    const answer: {
      references: Array<{
        object_identifier?: string;
        snippets?: Array<{ uri: string; content: string; matches?: string }>;
      }>;
    } = JSON.parse(text);
    const tester = answer.references.find(
      (reference) => reference.object_identifier === TESTER_ID,
    );
    assert.deepStrictEqual(tester?.snippets?.[0], {
      uri: `${CLASS_URI}/source/main#type=CLAS%2FOM;name=TESTER;start=2,10;end=2,17`,
      content: '    DATA: lv_test TYPE ZMCP_SHR_DTEL.',
      matches: '10-17,accessUnknown,gradeDirect',
    });
    const table = answer.references.find(
      (reference) => reference.object_identifier === TABLE_ID,
    );
    assert.equal(table?.snippets, undefined);
  });

  it('a refused snippet read is the call’s failure, with its step', async () => {
    const { result, text } = await whereUsed('terse', {
      data: '<?xml version="1.0"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">boom</message></exc:exception>',
      status: 500,
    });
    assert.equal(result.isError, true, text);
    assert.ok(text.includes('read where-used code lines'), text);
  });
});

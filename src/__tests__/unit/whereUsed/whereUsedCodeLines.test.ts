/**
 * GetWhereUsed with `in_object`: the usages inside one using object, each
 * with the source line it is on.
 *
 * Without `in_object` GetWhereUsed reads `usageReferences` alone: where each
 * usage is, no code line. With it, as Eclipse does for the node opened, the
 * list is kept to that object's usages and ONE `usageSnippets` POST asks
 * for exactly their `objectIdentifier`s (Eclipse's body: `optional="false"`,
 * `affectedObjects`, the grade all true); each `codeSnippetObject` is joined
 * back to its usage by that identifier. The answer the owner measured, for
 * a data element used in a method:
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
 * none; an object with no usage answers `0 usage(s)`, no error. medium the
 * same rows; full SAP's snippets, positions included. A refused or
 * unreadable snippet read is the call's failure, never the usages without
 * their lines.
 *
 * Replayed over a recording connection: real adt-clients code, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handleGetWhereUsed,
  WHERE_USED_LISTS,
} from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import { writeListing } from '../../../lib/detail';
import { USAGE_SNIPPETS_URL } from '../../../lib/strategies/usageSnippets';
import { declareSystemKind } from '../../../lib/systemKind';
import { envelopeConnection, partByPart } from '../../helpers/batchEnvelope';
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

type InObject = { object_type: string; object_name: string };

const TESTER_CLASS: InObject = {
  object_type: 'CLAS/OC',
  object_name: 'ZCL_OK_TEST',
};

async function whereUsed(
  detail: 'terse' | 'medium' | 'full',
  inObject: InObject | undefined,
  snippets: { data: unknown; status?: number } = { data: SNIPPETS },
  references: string = REFERENCES,
) {
  const connection = recordingConnection([{ data: references }, snippets]);
  declareSystemKind(connection, 'onprem');
  const result = await handleGetWhereUsed(
    { connection, logger: undefined, batchAvailability: noBatch() },
    {
      object_name: 'ZMCP_SHR_DTEL',
      object_type: 'DTEL/DE',
      detail,
      ...(inObject === undefined ? {} : { in_object: inObject }),
    },
  );
  return { result, connection, text: result.content[0]?.text ?? '' };
}

/** The snippet requests a connection received. */
function snippetRequests(connection: {
  requests: ReadonlyArray<{ url: string; data?: unknown }>;
}) {
  return connection.requests.filter(
    (request) => request.url === USAGE_SNIPPETS_URL,
  );
}

/** Eclipse's body for `identifiers`: the grade all true. */
function eclipseBody(identifiers: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageSnippetRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectIdentifiers>${identifiers
    .map(
      (identifier) =>
        `<usagereferences:objectIdentifier optional="false">${identifier}</usagereferences:objectIdentifier>`,
    )
    .join(
      '',
    )}</usagereferences:objectIdentifiers><usagereferences:affectedObjects/><usagereferences:grade definitions="true" elements="true" indirectReferences="true"/></usagereferences:usageSnippetRequest>`;
}

describe('GetWhereUsed without in_object: the place of each usage', () => {
  it('sends no usageSnippets request and answers no code column', async () => {
    const { result, connection, text } = await whereUsed('terse', undefined);
    assert.equal(result.isError, false, text);
    assert.equal(snippetRequests(connection).length, 0);
    assert.equal(
      text,
      [
        '# total 5',
        'type\tname\telement\turi\tusage',
        '# package ZMCP_SHR_PKG',
        'CLAS/OC\tZCL_OK_OTHER\t\t\tgradeDirect,includeTest',
        'PROG/P\tZMCP_SHR_PROG\t\t\tgradeDirect,includeTest',
        'TABL/DT\tZMCP_SHR_TABL\t\t\tgradeDirect,includeTest',
        '# in CLAS/OC ZCL_OK_TEST',
        '\t\tTESTER\t\tgradeElement,includeProductive',
      ].join('\n'),
    );
  });
});

describe('GetWhereUsed with in_object: that object’s usages with their code lines', () => {
  it("sends ONE usageSnippets request, Eclipse's body, for that object's identifiers only", async () => {
    const { connection } = await whereUsed('terse', TESTER_CLASS);
    const sent = snippetRequests(connection);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.data, eclipseBody([TESTER_ID]));
  });

  it('terse: the class on its # in line, each line of its usages trimmed, one row per line', async () => {
    const { result, text } = await whereUsed('terse', TESTER_CLASS);
    assert.equal(result.isError, false, text);
    assert.equal(
      text,
      [
        '# total 5',
        '# in_object CLAS/OC ZCL_OK_TEST: 1 usage(s)',
        'type\tname\telement\turi\tusage\tcode',
        '# package ZMCP_SHR_PKG',
        '# in CLAS/OC ZCL_OK_TEST',
        '\t\tTESTER\t\tgradeElement,includeProductive\tDATA: lv_test TYPE ZMCP_SHR_DTEL.',
        '\t\tTESTER\t\tgradeElement,includeProductive\tDATA: lv_more TYPE ZMCP_SHR_DTEL.',
      ].join('\n'),
    );
  });

  it('the element of a line is its position’s name= where the usage names none', async () => {
    const { text } = await whereUsed('terse', {
      object_type: 'clas/oc',
      object_name: 'zcl_ok_other',
    });
    assert.ok(
      text.endsWith(
        '# in CLAS/OC ZCL_OK_OTHER\n\t\tRUN\t\tgradeDirect,includeTest\tDATA lv_run TYPE zmcp_shr_dtel.',
      ),
      text,
    );
  });

  it('a program: its line, no element (SAP names no FORM)', async () => {
    const { connection, text } = await whereUsed('terse', {
      object_type: 'PROG/P',
      object_name: 'ZMCP_SHR_PROG',
    });
    assert.equal(
      snippetRequests(connection)[0]?.data,
      eclipseBody([PROGRAM_ID]),
    );
    assert.ok(
      text.endsWith(
        'PROG/P\tZMCP_SHR_PROG\t\t\tgradeDirect,includeTest\tDATA lv_prog TYPE zmcp_shr_dtel.',
      ),
      text,
    );
  });

  it('a usage not in code: its row, no line', async () => {
    const { text } = await whereUsed('terse', {
      object_type: 'TABL/DT',
      object_name: 'ZMCP_SHR_TABL',
    });
    assert.ok(
      text.endsWith('TABL/DT\tZMCP_SHR_TABL\t\t\tgradeDirect,includeTest\t'),
      text,
    );
  });

  it('an object with no usage: said plainly, no request, no error', async () => {
    const { result, connection, text } = await whereUsed('terse', {
      object_type: 'CLAS/OC',
      object_name: 'ZCL_NONE',
    });
    assert.equal(result.isError, false, text);
    assert.equal(snippetRequests(connection).length, 0);
    assert.ok(text.includes('# in_object CLAS/OC ZCL_NONE: 0 usage(s)'), text);
  });

  it('medium: the same rows, each with its code line', async () => {
    const { text } = await whereUsed('medium', TESTER_CLASS);
    const answer: {
      references: Array<{
        type: string;
        name: string;
        element?: string;
        code?: string;
      }>;
    } = JSON.parse(text);
    assert.deepStrictEqual(
      answer.references.map(({ type, name, element, code }) => ({
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
      ],
    );
  });

  it("full: SAP's snippets as they came, the position included", async () => {
    const { text } = await whereUsed('full', TESTER_CLASS);
    const answer: {
      in_object?: InObject;
      references: Array<{
        object_identifier?: string;
        snippets?: Array<{ uri: string; content: string; matches?: string }>;
      }>;
    } = JSON.parse(text);
    assert.deepStrictEqual(answer.in_object, TESTER_CLASS);
    assert.equal(answer.references.length, 1);
    assert.deepStrictEqual(answer.references[0]?.snippets?.[0], {
      uri: `${CLASS_URI}/source/main#type=CLAS%2FOM;name=TESTER;start=2,10;end=2,17`,
      content: '    DATA: lv_test TYPE ZMCP_SHR_DTEL.',
      matches: '10-17,accessUnknown,gradeDirect',
    });
  });

  it('a refused snippet read is the call’s failure, with its step', async () => {
    const { result, text } = await whereUsed('terse', TESTER_CLASS, {
      data: '<?xml version="1.0"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">boom</message></exc:exception>',
      status: 500,
    });
    assert.equal(result.isError, true, text);
    assert.ok(text.includes('read where-used code lines'), text);
  });

  // adt-strategies decodes every reference of the where-used answer, the
  // numeric ones included: the snippets are read the same, so `X&amp;Y`
  // there and `X&#38;Y` here are one identifier, and the line and its
  // position read as SAP meant them.
  it('numeric character references decode in the identifier, the line and the position', async () => {
    const references = REFERENCES.replace(
      `<usagereferences:objectIdentifier>${PROGRAM_ID}</usagereferences:objectIdentifier>`,
      '<usagereferences:objectIdentifier>ABAPFullName;Z&amp;PROG;Z&amp;PROG;\\TY:ZMCP_SHR_DTEL</usagereferences:objectIdentifier>',
    );
    const snippets = SNIPPETS.replace(
      `<objectIdentifier>${PROGRAM_ID}</objectIdentifier>`,
      '<objectIdentifier>ABAPFullName;Z&#38;PROG;Z&#x26;PROG;\\TY:ZMCP_SHR_DTEL</objectIdentifier>',
    )
      .replace(
        '  DATA lv_prog TYPE zmcp_shr_dtel.',
        '  DATA lv_prog TYPE zmcp_shr_dtel. &#34;&#x3C;a&#62; &amp;lt;',
      )
      .replace(
        `${PROGRAM_URI}/source/main#start=12,3;end=12,16`,
        `${PROGRAM_URI}/source/main#start=12,3;end=12,16&#38;x`,
      );
    const program = { object_type: 'PROG/P', object_name: 'ZMCP_SHR_PROG' };
    const { result, text } = await whereUsed(
      'terse',
      program,
      { data: snippets },
      references,
    );
    assert.equal(result.isError, false, text);
    assert.ok(
      text.endsWith(
        'PROG/P\tZMCP_SHR_PROG\t\t\tgradeDirect,includeTest\tDATA lv_prog TYPE zmcp_shr_dtel. "<a> &lt;',
      ),
      text,
    );
    const full: {
      references: Array<{ snippets?: Array<{ uri: string }> }>;
    } = JSON.parse(
      (await whereUsed('full', program, { data: snippets }, references)).text,
    );
    assert.equal(
      full.references[0]?.snippets?.[0]?.uri,
      `${PROGRAM_URI}/source/main#start=12,3;end=12,16&x`,
    );
  });

  // A 200 that is no usage snippet result is a failed reading, told apart
  // from SAP giving no code lines: the call fails at the step.
  for (const [name, data] of [
    ['a logon page', '<html><body>Logon</body></html>'],
    [
      'malformed XML',
      '<usageReferences:usageSnippetResult><codeSnippetObject>',
    ],
    ['an empty body', ''],
    ['a body that is no text', { not: 'text' }],
  ] as const) {
    it(`an unreadable answer (${name}) fails the call at its step`, async () => {
      const { result, text } = await whereUsed('terse', TESTER_CLASS, {
        data,
      });
      assert.equal(result.isError, true, text);
      assert.ok(text.includes('read where-used code lines'), text);
    });
  }

  it('in_object is taken with one object only, not with objects', async () => {
    const connection = recordingConnection([]);
    declareSystemKind(connection, 'onprem');
    const result = await handleGetWhereUsed(
      { connection, logger: undefined, batchAvailability: noBatch() },
      {
        objects: [{ object_name: 'ZMCP_SHR_DTEL', object_type: 'DTEL/DE' }],
        in_object: TESTER_CLASS,
      },
    );
    assert.equal(result.isError, true);
    assert.equal(connection.requests.length, 0);
  });
});

describe('GetWhereUsed: the code lines are never read in envelopes', () => {
  it('several objects: the usages read together, no usageSnippets request', async () => {
    const fake = envelopeConnection(
      partByPart(() => ({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/xml' },
        body: REFERENCES,
      })),
    );
    declareSystemKind(fake.connection, 'onprem');
    const result = await handleGetWhereUsed(
      {
        connection: fake.connection,
        logger: undefined,
        batchAvailability: createBatchAvailability(),
      },
      {
        objects: [
          { object_name: 'ZMCP_SHR_DTEL', object_type: 'DTEL/DE' },
          { object_name: 'ZMCP_SHR_DTEL2', object_type: 'DTEL/DE' },
        ],
        detail: 'terse',
      },
    );
    assert.equal(result.isError, false, result.content[0]?.text);
    assert.equal(
      fake.directs.filter((request) => request.url === USAGE_SNIPPETS_URL)
        .length,
      0,
    );
  });
});

// Only an object of a known type and name has an `# in` line: a row SAP
// left unresolved keeps its plain row and its URI, whatever element it
// names.
describe('the # in line names only a resolved object', () => {
  it('a row with an element but no type is a plain row with its URI', () => {
    const text = writeListing({
      heads: [],
      reading: {
        totalReferences: 1,
        references: [
          {
            name: 'RUN',
            type: '',
            uri: '/sap/bc/adt/oo/classes/zcl_absent/source/main#name=RUN',
            usage_information: 'gradeElement',
            element: 'RUN',
          },
        ],
      },
      lists: WHERE_USED_LISTS,
    }).answer;
    assert.equal(
      text,
      'type\tname\telement\turi\tusage\n# package \n\tRUN\tRUN\t/sap/bc/adt/oo/classes/zcl_absent/source/main#name=RUN\tgradeElement',
    );
  });
});

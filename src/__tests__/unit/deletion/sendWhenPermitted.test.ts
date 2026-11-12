/**
 * A permitted deletion is sent, whatever the check's messages say (#1, #11).
 *
 * Measured on premise (2026-11-04): the deletion check answered
 * `del:isDeletable="true"` with `adtcore:packageName` and a W "<name> does not
 * exist" for an existing function module, function include, inactive service
 * definition and inactive service binding; each was still there (GET 200),
 * and the deletion request sent after the check deleted it
 * (`del:isDeleted="true"`, GET 404 after). The server used to read the
 * words "does not exist" as absence and send nothing, answering success.
 *
 * The check documents below carry the measured shape (the elements and
 * attributes the readings look at); the deletion request is pinned by
 * literal, and the delete's own answer is what the tool answers.
 *
 * Run through `runPinCase` inside its own `it`: these keys have no ledger
 * row yet — their family tasks add the row with its live case.
 */

import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleDeleteFunctionInclude } from '../../../handlers/function_include/high/handleDeleteFunctionInclude';
import { handleDeleteFunctionModule } from '../../../handlers/function_module/high/handleDeleteFunctionModule';
import { handleDeleteServiceBinding } from '../../../handlers/service_binding/high/handleDeleteServiceBinding';
import { handleDeleteServiceDefinition } from '../../../handlers/service_definition/high/handleDeleteServiceDefinition';
import type { McpResult } from '../../../lib/answer';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { type PinnedRequest, runPinCase } from '../../helpers/pinCases';
import { recordingConnection } from '../../helpers/recordingConnection';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const NS =
  'xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core"';

/** The check's answer for an object that is there: permitted, W "does not exist". */
function permittedSaysAbsent(name: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><del:checkResponse ${NS}>` +
    `<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="true" adtcore:name="${name}" adtcore:packageName="$TMP">` +
    '<del:lockingTransport><del:recording>false</del:recording></del:lockingTransport>' +
    `<del:message del:priority="0" del:type="W"><del:text>${name} does not exist</del:text></del:message>` +
    '</del:object></del:checkResponse>'
  );
}

/** The delete's answer for an object it deleted. */
function deleted(name: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><del:deletionResult ${NS}>` +
    `<del:object del:isDeleted="true" adtcore:name="${name}">` +
    '<del:message del:priority="0" del:type="S"><del:text/></del:message>' +
    '</del:object></del:deletionResult>'
  );
}

/** A check that refuses: two messages, each with its T100 key in the long-text link. */
function refusedWithKeys(name: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><del:checkResponse ${NS}>` +
    `<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="false" adtcore:name="${name}">` +
    `<del:message del:priority="0" del:type="W"><del:text>${name} does not exist</del:text></del:message>` +
    '<del:message del:priority="0" del:type="E"><del:text>Error while converting object references</del:text>' +
    '<atom:link href="/sap/bc/adt/messageclass/RIS_MESSAGES/messages/014/longtext?language=E" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
    '</del:message></del:object></del:checkResponse>'
  );
}

/**
 * The check of a missing function module, as measured (on premise,
 * 2026-11-04): `isDeletable="true"`, a W "does not exist" and a typed E
 * keyed `RIS_MESSAGES 014`. The E's type is what refuses it.
 */
const MISSING_E_TYPE = 'E';
function permittedWithError(name: string, eType = MISSING_E_TYPE): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><del:checkResponse ${NS}>` +
    `<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="true" adtcore:name="${name}">` +
    '<del:lockingTransport><del:recording>false</del:recording></del:lockingTransport>' +
    `<del:message del:priority="0" del:type="W"><del:text>${name} does not exist</del:text></del:message>` +
    `<del:message del:priority="0" del:type="${eType}"><del:text>Error while converting object references</del:text>` +
    '<atom:link href="/sap/bc/adt/messageclass/RIS_MESSAGES/messages/014/longtext?language=E" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
    '</del:message></del:object></del:checkResponse>'
  );
}

/** A delete SAP refuses, keyed SWB_TOOL 029 (on premise, 2026-09-26). */
function deleteRefused(name: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><del:deletionResult ${NS}>` +
    `<del:object del:isDeleted="false" adtcore:name="${name}">` +
    `<del:message del:priority="0" del:type="E"><del:text>Error while deleting object ${name} from the database</del:text>` +
    `<atom:link href="/sap/bc/adt/messageclass/SWB_TOOL/messages/029/longtext?language=E&amp;msgv1=${name}" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/>` +
    '</del:message></del:object></del:deletionResult>'
  );
}

interface DeleteCase {
  tool: string;
  name: string;
  /**
   * What the tool reads before the check, and its answer: a function
   * module's metadata, its group checked against the group given (#2).
   */
  first: {
    answers: ReadonlyArray<Partial<IAdtWireResponse>>;
    requests: readonly PinnedRequest[];
  };
  args: ToolArgs;
  run: (connection: IAbapConnection) => Promise<McpResult>;
  check: PinnedRequest;
  delete: PinnedRequest;
}

/** Nothing read before the check. */
const NOTHING_FIRST = { answers: [], requests: [] };

/** ZPIN_FM's metadata, read through ZPIN_FG, naming ZPIN_FG. */
const MODULE_IN_GROUP = {
  answers: [
    {
      data:
        '<?xml version="1.0" encoding="utf-8"?><fmodule:abapFunctionModule adtcore:name="ZPIN_FM" adtcore:type="FUGR/FF" ' +
        'xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core">' +
        '<adtcore:containerRef adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg" adtcore:type="FUGR/F" adtcore:name="ZPIN_FG" adtcore:packageName="$TMP"/>' +
        '</fmodule:abapFunctionModule>',
    },
  ],
  requests: [
    {
      method: 'GET',
      url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm?version=workingArea',
      headers: {
        Accept:
          'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
      },
      body: undefined,
    },
  ],
};

const ctx = (connection: IAbapConnection) => ({
  connection,
  logger: undefined,
});

const CASES: readonly DeleteCase[] = [
  {
    tool: 'DeleteFunctionModule',
    name: 'ZPIN_FM',
    first: MODULE_IN_GROUP,
    args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
    run: (c) =>
      handleDeleteFunctionModule(ctx(c), {
        function_group_name: 'ZPIN_FG',
        function_module_name: 'ZPIN_FM',
      }),
    check: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/check',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm"/>\n' +
        '</del:checkRequest>',
    },
    delete: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/delete',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm">\n' +
        '    <del:transportNumber/>\n' +
        '  </del:object>\n' +
        '</del:deletionRequest>',
    },
  },
  {
    tool: 'DeleteFunctionInclude',
    name: 'LZPIN_FGF01',
    first: NOTHING_FIRST,
    args: { function_group_name: 'ZPIN_FG', include_name: 'LZPIN_FGF01' },
    run: (c) =>
      handleDeleteFunctionInclude(ctx(c), {
        function_group_name: 'ZPIN_FG',
        include_name: 'LZPIN_FGF01',
      }),
    check: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/check',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/includes/lzpin_fgf01"/>\n' +
        '</del:checkRequest>',
    },
    delete: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/delete',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/includes/lzpin_fgf01">\n' +
        '    <del:transportNumber/>\n' +
        '  </del:object>\n' +
        '</del:deletionRequest>',
    },
  },
  {
    tool: 'DeleteServiceDefinition',
    name: 'ZPIN_SD',
    first: NOTHING_FIRST,
    args: { service_definition_name: 'ZPIN_SD' },
    run: (c) =>
      handleDeleteServiceDefinition(ctx(c), {
        service_definition_name: 'ZPIN_SD',
      }),
    check: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/check',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zpin_sd"/>\n' +
        '</del:checkRequest>',
    },
    delete: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/delete',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zpin_sd">\n' +
        '    <del:transportNumber/>\n' +
        '  </del:object>\n' +
        '</del:deletionRequest>',
    },
  },
  {
    tool: 'DeleteServiceBinding',
    name: 'ZPIN_SB',
    first: NOTHING_FIRST,
    args: { service_binding_name: 'ZPIN_SB' },
    run: (c) =>
      handleDeleteServiceBinding(ctx(c), { service_binding_name: 'ZPIN_SB' }),
    check: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/check',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
      body:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        '  <del:object adtcore:uri="/sap/bc/adt/businessservices/bindings/zpin_sb"/>\n' +
        '</del:checkRequest>',
    },
    delete: {
      method: 'POST',
      url: '/sap/bc/adt/deletion/delete',
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
      },
      body: '<?xml version="1.0" encoding="UTF-8"?><del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core"><del:object adtcore:uri="/sap/bc/adt/businessservices/bindings/zpin_sb"><del:transportNumber></del:transportNumber></del:object></del:deletionRequest>',
    },
  },
];

/** The answer's one text part, parsed. */
function payloadOf(result: McpResult): unknown {
  const part = result.content[0];
  if (part === undefined || part.type !== 'text') {
    throw new Error('the answer carries no text part');
  }
  return JSON.parse(part.text);
}

describe.each(CASES)('$tool', (c) => {
  it(`an existing object whose check says "does not exist" (W) with isDeletable=true is deleted`, async () => {
    await runPinCase({
      tool: c.tool,
      variant: 'onprem',
      stand: 'recording',
      args: c.args,
      answers: [
        ...c.first.answers,
        { data: permittedSaysAbsent(c.name) },
        { data: deleted(c.name) },
      ],
      expected: [...c.first.requests, c.check, c.delete],
    });
    const connection = recordingConnection([
      ...c.first.answers,
      { data: permittedSaysAbsent(c.name) },
      { data: deleted(c.name) },
    ]);
    const result = await c.run(connection);
    expect(result.isError).toBe(false);
    expect(payloadOf(result)).toMatchObject({ deleted: true, object: c.name });
  });

  it('a check with isDeletable=false is refused with its messages and T100 keys, nothing sent', async () => {
    await runPinCase({
      tool: c.tool,
      variant: 'onprem',
      stand: 'recording',
      args: c.args,
      answers: [...c.first.answers, { data: refusedWithKeys(c.name) }],
      refusal: 'answer',
      expected: [...c.first.requests, c.check],
    });
    const connection = recordingConnection([
      ...c.first.answers,
      { data: refusedWithKeys(c.name) },
    ]);
    const result = await c.run(connection);
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      origin: 'refusal',
      messages: [
        { type: 'W', text: `${c.name}: ${c.name} does not exist` },
        {
          type: 'E',
          text: `${c.name}: Error while converting object references`,
          t100: { id: 'RIS_MESSAGES', no: '014' },
        },
      ],
    });
  });

  it('a permitted check with a typed E (the measured missing function module) is refused, only the check sent', async () => {
    await runPinCase({
      tool: c.tool,
      variant: 'onprem',
      stand: 'recording',
      args: c.args,
      answers: [...c.first.answers, { data: permittedWithError(c.name) }],
      refusal: 'answer',
      expected: [...c.first.requests, c.check],
    });
    const connection = recordingConnection([
      ...c.first.answers,
      { data: permittedWithError(c.name) },
    ]);
    const result = await c.run(connection);
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      origin: 'refusal',
      messages: [
        { type: 'W', text: `${c.name}: ${c.name} does not exist` },
        {
          type: 'E',
          text: `${c.name}: Error while converting object references`,
          t100: { id: 'RIS_MESSAGES', no: '014' },
        },
      ],
    });
  });

  it("a delete refused by SAP is named by its T100 key through the delete's analyse strategy", async () => {
    const connection = recordingConnection([
      ...c.first.answers,
      { data: permittedSaysAbsent(c.name) },
      { data: deleteRefused(c.name) },
    ]);
    const result = await c.run(connection);
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      origin: 'refusal',
      messages: [
        {
          type: 'E',
          t100: { id: 'SWB_TOOL', no: '029', values: [c.name] },
        },
      ],
    });
  });
});

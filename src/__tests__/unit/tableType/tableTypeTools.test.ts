/**
 * The table-type tools, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { readTableType } from '../../../../compact-readonly-entries/src/handlers/compactReadRoutes';
import { buildObjectVersionTools } from '../../../handlers/common/high/objectVersionTools';
import { TOOL_DEFINITION as GET_OBJECT_VERSION_DIFF } from '../../../handlers/common/readonly/handleGetObjectVersionDiff';
import {
  TOOL_DEFINITION as GET_OBJECT_VERSION_SOURCE,
  handleGetObjectVersionSource,
} from '../../../handlers/common/readonly/handleGetObjectVersionSource';
import {
  TOOL_DEFINITION as GET_OBJECT_VERSIONS,
  handleGetObjectVersions,
} from '../../../handlers/common/readonly/handleGetObjectVersions';
import {
  TOOL_DEFINITION as CheckTableType_Tool,
  handleCheckTableType,
} from '../../../handlers/table_type/high/handleCheckTableType';
import {
  TOOL_DEFINITION as CreateTableType_Tool,
  handleCreateTableType,
} from '../../../handlers/table_type/high/handleCreateTableType';
import {
  TOOL_DEFINITION as DeleteTableType_Tool,
  handleDeleteTableType,
} from '../../../handlers/table_type/high/handleDeleteTableType';
import {
  TOOL_DEFINITION as GET_TABLE_TYPE,
  handleGetTableType,
} from '../../../handlers/table_type/high/handleGetTableType';
import {
  handleUpdateTableType,
  TOOL_DEFINITION as UpdateTableType_Tool,
} from '../../../handlers/table_type/high/handleUpdateTableType';
import {
  TOOL_DEFINITION as ActivateTableType_Tool,
  handleActivateTableType,
} from '../../../handlers/table_type/low/handleActivateTableType';
import {
  VERSION_SOURCE_KINDS,
  VERSIONED_KINDS,
} from '../../../lib/adtProjections';
import { COMPACT_READ_TAKES } from '../../../lib/compact/compactSchemas';
import { defineTool } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  READ_VERSIONS,
} from '../../../lib/handlers/readVersion';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { corpusBody } from '../../helpers/adtCorpus';
import {
  assertMatchObject,
  assertNoProperty,
  assertRejects,
} from '../../helpers/assertions';
import { jsonAt, listedJson } from '../../helpers/listedJson';
import { setSystemContext } from '../../helpers/processSystemContext';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

const previous = process.env.SAP_SYSTEM_TYPE;

beforeEach(() => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  setSystemContext({
    masterSystem: 'SYSTEM_PLACEHOLDER',
    responsible: 'USER_PLACEHOLDER',
  });
});

afterEach(() => {
  resetSystemContextCache();
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

const TABLE_TYPE_XML = corpusBody(
  'read-metadata-table-type--01-tabletypes-string_table',
);

describe('GetTableType', () => {
  it('sends one GET to the table type, and answers the document under metadata', async () => {
    const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
    const result = await handleGetTableType(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 1);
    const [sent] = connection.requests;
    assert.equal(sent?.method, 'GET');
    assert.equal(sent?.url, '/sap/bc/adt/ddic/tabletypes/ztt_x?version=active');
    const first = result.content[0];
    const answered = JSON.parse(first && 'text' in first ? first.text : '{}');
    assert.deepStrictEqual(answered, {
      success: true,
      table_type_name: 'ZTT_X',
      version: 'active',
      part: 'metadata',
      metadata: TABLE_TYPE_XML,
    });
  });

  it('declares the shared read version, active by default', () => {
    assert.equal(GET_TABLE_TYPE.inputSchema.shape.version, READ_VERSION_FIELD);
  });

  for (const version of READ_VERSIONS) {
    it(
      format('reads the version given (%s), and answers it', version),
      async () => {
        const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
        const result = await handleGetTableType(
          { connection, logger: undefined },
          { table_type_name: 'ztt_x', version },
        );
        assert.deepStrictEqual(
          connection.requests.map((r) => r.url),
          [`/sap/bc/adt/ddic/tabletypes/ztt_x?version=${version}`],
        );
        const first = result.content[0];
        const answered = JSON.parse(
          first && 'text' in first ? first.text : '{}',
        );
        assert.equal(answered.version, version);
      },
    );
  }

  for (const version of READ_VERSIONS) {
    it(
      format(
        'compact HandlerGet TABLE_TYPE passes its version (%s) to the read',
        version,
      ),
      async () => {
        const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
        await readTableType(
          { connection, logger: undefined },
          { table_type_name: 'ztt_x', version },
        );
        assert.deepStrictEqual(
          connection.requests.map((r) => r.url),
          [`/sap/bc/adt/ddic/tabletypes/ztt_x?version=${version}`],
        );
      },
    );
  }

  it('compact HandlerGet TABLE_TYPE takes version', () => {
    assert.ok(COMPACT_READ_TAKES.members.TABLE_TYPE.includes('version'));
  });

  it('refuses an empty table_type_name at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(GET_TABLE_TYPE, handleGetTableType).call(
        { connection, logger: undefined },
        { table_type_name: '' },
      ),
      'table_type_name is required at table_type_name',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('refuses an absent table_type_name at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(GET_TABLE_TYPE, handleGetTableType).call(
        { connection, logger: undefined },
        {},
      ),
      'at table_type_name',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('is served on a connection declared cloud', async () => {
    const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleGetTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 1);
  });
});

/**
 * A recording connection that also notes the session type each request went
 * out under, so that "LOCK and UNLOCK stateful, everything else stateless" is
 * read off the wire order.
 */
function sessionRecording(
  answers: Parameters<typeof recordingConnection>[0] = [],
): RecordingConnection & { readonly sessions: string[] } {
  const inner = recordingConnection(answers);
  const sessions: string[] = [];
  let current = 'stateless';
  return {
    ...inner,
    sessions,
    setSessionType(type) {
      current = type;
    },
    async makeAdtRequest(options) {
      sessions.push(current);
      return inner.makeAdtRequest(options);
    },
  };
}

/** The text of a tool's first content item. */
const textOf = (result: {
  content: ReadonlyArray<{ type: string; text?: string }>;
}): string => {
  const first = result.content[0];
  return first?.text ?? '';
};

/**
 * What the server answers a read of an existing table type with: SAP's whole
 * document for STRING_TABLE (the corpus fixture). The handlers address the
 * object by the URL, so the document's own name is not the one asked for:
 * the fixture stays byte for byte SAP's, so the requests name ZTT_X while the
 * document says STRING_TABLE.
 */
const STRING_TABLE = corpusBody(
  'read-metadata-table-type--01-tabletypes-string_table',
);

const TTYP = '/sap/bc/adt/ddic/tabletypes';
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const LOCK_URL = `${TTYP}/ztt_x?_action=LOCK&accessMode=MODIFY`;
const UNLOCK_URL = `${TTYP}/ztt_x?_action=UNLOCK&lockHandle=${HANDLE}`;
const CHECK_URL = '/sap/bc/adt/checkruns?reporters=abapCheckRun';
const PAIR = 'application/vnd.sap.adt.tabletype.v1+xml';
const REFUSED = {
  status: 403,
  statusText: 'Forbidden',
  data: '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNoAccess"/><message>refused</message></exc:exception>',
};

const wire = (connection: RecordingConnection): string[] =>
  connection.requests.map((r) => `${r.method} ${r.url}`);

describe('CreateTableType', () => {
  /** validate, create, LOCK, read: the read is the fourth request. */
  const created = (more: Parameters<typeof recordingConnection>[0] = []) =>
    sessionRecording([
      undefined,
      undefined,
      undefined,
      { data: STRING_TABLE },
      ...more,
    ]);

  it('validates, creates, locks, reads, writes the patch under the handle, unlocks, waits, checks, activates', async () => {
    const connection = created();
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      {
        table_type_name: 'ztt_x',
        package_name: 'ZP',
        description: 'A table type',
        transport_request: 'K1',
        row_type_kind: 'dictionaryType',
        row_type_name: 'MARA',
      },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(wire(connection), [
      `POST ${TTYP}/validation?objtype=ttypda&objname=ZTT_X&description=A+table+type`,
      `POST ${TTYP}?corrNr=K1`,
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}&corrNr=K1`,
      `POST ${UNLOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=inactive&withLongPolling=true`,
      `POST ${CHECK_URL}`,
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
      `GET ${TTYP}/ztt_x?version=active`,
    ]);
    assert.deepStrictEqual(connection.sessions, [
      'stateless',
      'stateless',
      'stateful',
      'stateless',
      'stateless',
      'stateful',
      'stateless',
      'stateless',
      'stateless',
      'stateless',
    ]);
    const create = connection.requests[1];
    assert.ok(
      String(create?.data).includes('adtcore:description="A table type"'),
    );
    assert.ok(
      String(create?.data).includes('<adtcore:packageRef adtcore:name="ZP"/>'),
    );
    assert.equal(create?.headers?.['Content-Type'], PAIR);
    const put = connection.requests[4];
    assert.equal(put?.headers?.['Content-Type'], PAIR);
    assert.equal(
      put?.data,
      STRING_TABLE.replace(
        '<ttyp:typeKind>predefinedAbapType</ttyp:typeKind>',
        '<ttyp:typeKind>dictionaryType</ttyp:typeKind>',
      )
        .replace('<ttyp:typeName/>', '<ttyp:typeName>MARA</ttyp:typeName>')
        .replace(
          'adtcore:description="Tabelle von Strings"',
          'adtcore:description="A table type"',
        ),
    );
  });

  // Codex round 7: raw is every response the call got — the metadata read
  // back after the write and after the activation too.
  it('raw: every response, the metadata read-backs included', async () => {
    const connection = recordingConnection([
      undefined,
      undefined,
      undefined,
      { data: STRING_TABLE },
    ]);
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      {
        table_type_name: 'ztt_x',
        package_name: 'ZP',
        description: 'A table type',
        transport_request: 'K1',
        row_type_kind: 'dictionaryType',
        row_type_name: 'MARA',
        detail: 'raw',
      },
    );
    assert.equal(result.isError, false, textOf(result));
    const responses: Array<{ status: number; body: string }> = JSON.parse(
      textOf(result),
    );
    assert.equal(responses.length, connection.requests.length);
    assert.equal(responses[3]?.body, STRING_TABLE);
  });

  it('writes every definition property given into the document SAP created', async () => {
    const connection = created();
    await handleCreateTableType(
      { connection, logger: undefined },
      {
        table_type_name: 'ZTT_X',
        package_name: 'ZP',
        data_type: 'CHAR',
        length: 10,
        decimals: 2,
        access_type: 'sorted',
        key_definition: 'rowType',
        key_kind: 'unique',
      },
    );
    const body = String(connection.requests[4]?.data);
    assert.ok(body.includes('<ttyp:dataType>CHAR</ttyp:dataType>'));
    assert.ok(body.includes('<ttyp:length>000010</ttyp:length>'));
    assert.ok(body.includes('<ttyp:decimals>000002</ttyp:decimals>'));
    assert.ok(body.includes('<ttyp:accessType>sorted</ttyp:accessType>'));
    assert.ok(body.includes('<ttyp:definition>rowType</ttyp:definition>'));
    assert.ok(body.includes('<ttyp:kind>unique</ttyp:kind>'));
  });

  it("leaves SAP's value for every definition property not given; the description is the name, as the create sent it", async () => {
    const connection = created();
    await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    assert.equal(connection.requests[4]?.method, 'PUT');
    assert.equal(
      connection.requests[4]?.data,
      STRING_TABLE.replace(
        'adtcore:description="Tabelle von Strings"',
        'adtcore:description="ZTT_X"',
      ),
    );
  });

  it('writes the name as the description when the description given is empty, as validate and create send it', async () => {
    const connection = created();
    await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', description: '' },
    );
    assert.ok(
      String(connection.requests[1]?.data).includes(
        'adtcore:description="ZTT_X"',
      ),
    );
    const put = String(connection.requests[4]?.data);
    assert.ok(put.includes('adtcore:description="ZTT_X"'));
    assert.equal(put.includes('adtcore:description=""'), false);
  });

  it('declares a schema default on activate and the shared detail alone', () => {
    const properties =
      listedJson(CreateTableType_Tool.inputSchema).properties ?? {};
    const defaulted = Object.entries(properties)
      .filter(([, schema]) => typeof schema === 'object' && 'default' in schema)
      .map(([name]) => name);
    assert.deepStrictEqual(defaulted, ['activate', 'detail']);
  });

  it('sends no activation with activate false', async () => {
    const connection = created();
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', activate: false },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 8);
    assert.equal(connection.requests[7]?.url, CHECK_URL);
  });

  it('still unlocks when the write is refused, and answers the refusal', async () => {
    const connection = created([REFUSED]);
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(wire(connection).slice(4), [
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}`,
      `POST ${UNLOCK_URL}`,
    ]);
    assert.equal(connection.sessions[5], 'stateful');
  });

  for (const [name, args] of [
    ['table_type_name', { table_type_name: '', package_name: 'ZP' }],
    ['package_name', { table_type_name: 'ZTT_X', package_name: '' }],
  ] as const) {
    it(format('refuses an empty %s, sending nothing', name), async () => {
      const connection = recordingConnection();
      const result = await handleCreateTableType(
        { connection, logger: undefined },
        args,
      );
      assert.equal(result.isError, true);
      assert.equal(textOf(result), `${name} is required`);
      assert.equal(connection.requests.length, 0);
    });
  }

  for (const [name, args] of [
    ['table_type_name', { package_name: 'ZP' }],
    ['package_name', { table_type_name: 'ZTT_X' }],
  ] satisfies [string, Record<string, unknown>][]) {
    it(
      format('refuses an absent %s at the schema, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const refused = assertRejects(
          defineTool(CreateTableType_Tool, handleCreateTableType).call(
            { connection, logger: undefined },
            args,
          ),
          `at ${name}`,
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('is served on a connection declared cloud', async () => {
    const connection = created();
    declareSystemKind(connection, 'cloud');
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 10);
  });
});

describe('UpdateTableType', () => {
  /** LOCK, read: the read is the second request. */
  const existing = (more: Parameters<typeof recordingConnection>[0] = []) =>
    sessionRecording([undefined, { data: STRING_TABLE }, ...more]);

  it('locks, reads, writes the patch under the handle, checks, unlocks, waits, activates', async () => {
    const connection = existing();
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      {
        table_type_name: 'ztt_x',
        access_type: 'hashed',
        transport_request: 'K1',
      },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(wire(connection), [
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}&corrNr=K1`,
      `POST ${CHECK_URL}`,
      `POST ${UNLOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=inactive&withLongPolling=true`,
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
      `GET ${TTYP}/ztt_x?version=active`,
    ]);
    assert.deepStrictEqual(connection.sessions, [
      'stateful',
      'stateless',
      'stateless',
      'stateless',
      'stateful',
      'stateless',
      'stateless',
      'stateless',
    ]);
    const put = connection.requests[2];
    assert.equal(put?.headers?.['Content-Type'], PAIR);
    assert.equal(
      put?.data,
      STRING_TABLE.replace(
        '<ttyp:accessType>standard</ttyp:accessType>',
        '<ttyp:accessType>hashed</ttyp:accessType>',
      ),
    );
  });

  it("leaves SAP's value for every property not given: the PUT body is the read document", async () => {
    const connection = existing();
    await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(connection.requests[2]?.method, 'PUT');
    assert.equal(connection.requests[2]?.data, STRING_TABLE);
  });

  it('declares a schema default on activate and the shared detail alone, and takes no package', () => {
    const properties =
      listedJson(UpdateTableType_Tool.inputSchema).properties ?? {};
    const defaulted = Object.entries(properties)
      .filter(([, schema]) => typeof schema === 'object' && 'default' in schema)
      .map(([name]) => name);
    assert.deepStrictEqual(defaulted, ['activate', 'detail']);
    assert.ok(!Object.keys(properties).includes('package_name'));
  });

  it('sends no activation with activate false', async () => {
    const connection = existing();
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', activate: false },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 6);
    assert.equal(
      connection.requests[5]?.url,
      `${TTYP}/ztt_x?version=inactive&withLongPolling=true`,
    );
  });

  it('still unlocks when the write is refused, and sends nothing after the unlock', async () => {
    const connection = existing([REFUSED]);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(wire(connection), [
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}`,
      `POST ${UNLOCK_URL}`,
    ]);
    assert.equal(connection.sessions[3], 'stateful');
  });

  it('still unlocks when the check is refused, and sends nothing after the unlock', async () => {
    const connection = existing([undefined, REFUSED]);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(wire(connection), [
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}`,
      `POST ${CHECK_URL}`,
      `POST ${UNLOCK_URL}`,
    ]);
    assert.equal(connection.sessions[4], 'stateful');
  });

  it('refuses an empty table_type_name, sending nothing', async () => {
    const connection = recordingConnection();
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: '' },
    );
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'table_type_name is required');
    assert.equal(connection.requests.length, 0);
  });

  it('refuses an absent table_type_name at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(UpdateTableType_Tool, handleUpdateTableType).call(
        { connection, logger: undefined },
        {},
      ),
      'at table_type_name',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('is served on a connection declared cloud', async () => {
    const connection = existing();
    declareSystemKind(connection, 'cloud');
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 8);
  });
});

/**
 * What SAP stores when it takes other values than those sent (measured on
 * on premise, 2026-11-01: `hashed` forces a unique key): STRING_TABLE with a hashed
 * access and a unique key, answered by the wait's read after the unlock.
 */
const STORED_HASHED = STRING_TABLE.replace(
  '<ttyp:accessType>standard</ttyp:accessType>',
  '<ttyp:accessType>hashed</ttyp:accessType>',
).replace('<ttyp:kind>nonUnique</ttyp:kind>', '<ttyp:kind>unique</ttyp:kind>');

/** STORED_HASHED's definition, as SAP wrote each element. */
const STORED_HASHED_DEFINITION = {
  row_type_kind: 'predefinedAbapType',
  row_type_name: '',
  data_type: 'STRING',
  length: '000000',
  decimals: '000000',
  access_type: 'hashed',
  key_definition: 'standard',
  key_kind: 'unique',
};

/** What the activation is sent to. */
const ACTIVATE_URL =
  '/sap/bc/adt/activation?method=activate&preauditRequested=true';

/** `inner`, with the request to `url` thrown as the real transports throw a 403. */
function throwingAt(
  inner: RecordingConnection,
  url: string,
): RecordingConnection {
  return {
    ...inner,
    async makeAdtRequest(
      options: Parameters<RecordingConnection['makeAdtRequest']>[0],
    ) {
      if (options.url === url) {
        inner.requests.push({ method: options.method, url: options.url });
        throw Object.assign(new Error('Request failed with status code 403'), {
          response: { ...REFUSED, headers: {} },
        });
      }
      return inner.makeAdtRequest(options);
    },
  };
}

/** The two details that parse SAP's answer. */
const DETAILS: ReadonlyArray<'terse' | 'full'> = ['terse', 'full'];

/** The JSON a tool answered. */
const answerOf = (result: {
  content: ReadonlyArray<{ type: string; text?: string }>;
}): Record<string, unknown> => JSON.parse(textOf(result));

describe('the definition SAP stored, read at a stated version', () => {
  const WAIT_URL = `${TTYP}/ztt_x?version=inactive&withLongPolling=true`;
  /** The read after the activation: the active version, one GET. */
  const ACTIVE_URL = `${TTYP}/ztt_x?version=active`;
  type Answer = NonNullable<Parameters<typeof recordingConnection>[0]>[number];
  /**
   * Create: the wait is the seventh request, the check the eighth, the
   * activation the ninth, the read after it the tenth.
   */
  const created = (wait: Answer, afterActivation?: Answer) =>
    sessionRecording([
      undefined,
      undefined,
      undefined,
      { data: STRING_TABLE },
      undefined,
      undefined,
      wait,
      undefined,
      undefined,
      afterActivation,
    ]);
  /**
   * Update: the wait is the sixth request, the activation the seventh, the
   * read after it the eighth.
   */
  const existing = (wait: Answer, afterActivation?: Answer) =>
    sessionRecording([
      undefined,
      { data: STRING_TABLE },
      undefined,
      undefined,
      undefined,
      wait,
      undefined,
      afterActivation,
    ]);

  for (const detail of DETAILS) {
    it(
      format(
        'CreateTableType, activated: reads the active version after the activation and answers it (detail %s)',
        detail,
      ),
      async () => {
        const connection = created(undefined, { data: STORED_HASHED });
        const result = await handleCreateTableType(
          { connection, logger: undefined },
          {
            table_type_name: 'ZTT_X',
            package_name: 'ZP',
            access_type: 'hashed',
            key_kind: 'nonUnique',
            detail,
          },
        );
        assert.equal(result.isError, false);
        assert.deepStrictEqual(wire(connection).slice(6), [
          `GET ${WAIT_URL}`,
          `POST ${CHECK_URL}`,
          `POST ${ACTIVATE_URL}`,
          `GET ${ACTIVE_URL}`,
        ]);
        // The definition SAP stored at full; at the other levels the
        // version it was read at alone (terse answers, step 5).
        if (detail === 'full') {
          assertMatchObject(answerOf(result), {
            stored_definition: STORED_HASHED_DEFINITION,
            stored_version: 'active',
          });
        } else {
          assertMatchObject(answerOf(result), { stored_version: 'active' });
          assert.equal('stored_definition' in Object(answerOf(result)), false);
        }
      },
    );
  }

  it('CreateTableType, activate false: the wait reads the inactive version, and the answer names it', async () => {
    const connection = created({ data: STORED_HASHED });
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      {
        table_type_name: 'ZTT_X',
        package_name: 'ZP',
        activate: false,
      },
    );
    assert.equal(connection.requests.length, 8);
    assert.equal(connection.requests[6]?.url, WAIT_URL);
    assert.deepStrictEqual(answerOf(result), {
      result: 'SUCCESS',
      stored_version: 'inactive',
    });
  });

  for (const detail of DETAILS) {
    it(
      format(
        'UpdateTableType, activated: reads the active version after the activation and answers it (detail %s)',
        detail,
      ),
      async () => {
        const connection = existing(undefined, { data: STORED_HASHED });
        const result = await handleUpdateTableType(
          { connection, logger: undefined },
          {
            table_type_name: 'ZTT_X',
            access_type: 'hashed',
            key_kind: 'nonUnique',
            detail,
          },
        );
        assert.equal(result.isError, false);
        assert.deepStrictEqual(wire(connection).slice(5), [
          `GET ${WAIT_URL}`,
          `POST ${ACTIVATE_URL}`,
          `GET ${ACTIVE_URL}`,
        ]);
        // The definition SAP stored at full; at the other levels the
        // version it was read at alone (terse answers, step 5).
        if (detail === 'full') {
          assertMatchObject(answerOf(result), {
            stored_definition: STORED_HASHED_DEFINITION,
            stored_version: 'active',
          });
        } else {
          assertMatchObject(answerOf(result), { stored_version: 'active' });
          assert.equal('stored_definition' in Object(answerOf(result)), false);
        }
      },
    );
  }

  it('UpdateTableType, activate false: the wait reads the inactive version, and the answer names it', async () => {
    const connection = existing({ data: STORED_HASHED });
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', activate: false },
    );
    assert.equal(connection.requests.length, 6);
    assert.equal(connection.requests[5]?.url, WAIT_URL);
    assert.deepStrictEqual(answerOf(result), {
      result: 'SUCCESS',
      stored_version: 'inactive',
    });
  });

  it("CreateTableType answers a refused activation with SAP's refusal and the inactive definition the wait read", async () => {
    const connection = created({ data: STORED_HASHED });
    const result = await handleCreateTableType(
      { connection: throwingAt(connection, ACTIVATE_URL), logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', access_type: 'hashed' },
    );
    assert.equal(result.isError, true);
    assert.equal(connection.requests.length, 9);
    assertMatchObject(answerOf(result), {
      status: 403,
      raw_body: REFUSED.data,
      step: 'activate',
      stored_version: 'inactive',
    });
  });

  it("CreateTableType answers a refused check with SAP's refusal and the inactive definition the wait read", async () => {
    const connection = sessionRecording([
      undefined,
      undefined,
      undefined,
      { data: STRING_TABLE },
      undefined,
      undefined,
      { data: STORED_HASHED },
    ]);
    // SAP's refusal rejects, as the shipped connection rejects a non-2xx answer.
    const result = await handleCreateTableType(
      { connection: throwingAt(connection, CHECK_URL), logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', access_type: 'hashed' },
    );
    assert.equal(result.isError, true);
    assert.equal(connection.requests.length, 8);
    assertMatchObject(answerOf(result), {
      status: 403,
      raw_body: REFUSED.data,
      step: 'check',
      stored_version: 'inactive',
    });
  });

  it("UpdateTableType answers a refused activation with SAP's refusal and the inactive definition the wait read", async () => {
    const connection = existing({ data: STORED_HASHED });
    const result = await handleUpdateTableType(
      { connection: throwingAt(connection, ACTIVATE_URL), logger: undefined },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    assert.equal(result.isError, true);
    assert.equal(connection.requests.length, 7);
    assertMatchObject(answerOf(result), {
      status: 403,
      raw_body: REFUSED.data,
      step: 'activate',
      stored_version: 'inactive',
    });
  });

  it('UpdateTableType: a check refused under the lock, before the wait, answers no stored definition', async () => {
    const connection = sessionRecording([
      undefined,
      { data: STRING_TABLE },
      undefined,
      REFUSED,
    ]);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(wire(connection).slice(3), [
      `POST ${CHECK_URL}`,
      `POST ${UNLOCK_URL}`,
    ]);
    const answered = answerOf(result);
    assertNoProperty(answered, 'stored_definition');
    assertNoProperty(answered, 'stored_version');
  });

  it('a write refused before the wait answers no stored definition', async () => {
    const connection = sessionRecording([undefined, { data: STRING_TABLE }]);
    // SAP's refusal rejects, as the shipped connection rejects a non-2xx answer.
    const result = await handleUpdateTableType(
      {
        connection: throwingAt(
          connection,
          `${TTYP}/ztt_x?lockHandle=${HANDLE}`,
        ),
        logger: undefined,
      },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    assert.equal(result.isError, true);
    assert.equal(connection.requests.length, 4);
    const answered = answerOf(result);
    assertMatchObject(answered, { status: 403, raw_body: REFUSED.data });
    assertNoProperty(answered, 'stored_definition');
    assertNoProperty(answered, 'stored_definition_not_read');
    assertNoProperty(answered, 'stored_version');
  });

  it("says the stored definition was not read when the read after the activation is refused, with SAP's answer", async () => {
    const connection = existing({ data: STORED_HASHED }, REFUSED);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 8);
    const answered = answerOf(result);
    assert.equal(answered.stored_definition, undefined);
    assert.equal(answered.stored_version, 'active');
    assertMatchObject(answered.stored_definition_not_read, {
      status: 403,
      raw_body: REFUSED.data,
    });
  });

  it("says the stored definition was not read when the wait's read is refused with activate false", async () => {
    const connection = existing(REFUSED);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', activate: false },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 6);
    const answered = answerOf(result);
    assert.equal(answered.stored_definition, undefined);
    assert.equal(answered.stored_version, 'inactive');
    assertMatchObject(answered.stored_definition_not_read, {
      status: 403,
      raw_body: REFUSED.data,
    });
  });

  it("says the stored definition was not read when the read after the activation throws, with SAP's answer", async () => {
    const inner = created(undefined);
    const connection: typeof inner = {
      ...inner,
      async makeAdtRequest(options) {
        if (options.url === ACTIVE_URL) {
          inner.requests.push({ method: options.method, url: options.url });
          throw Object.assign(
            new Error('Request failed with status code 403'),
            { response: { ...REFUSED, headers: {} } },
          );
        }
        return inner.makeAdtRequest(options);
      },
    };
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    assert.equal(result.isError, false);
    const answered = answerOf(result);
    assert.equal(answered.stored_definition, undefined);
    assertMatchObject(answered.stored_definition_not_read, {
      step: 'read stored definition',
      status: 403,
      raw_body: REFUSED.data,
    });
  });

  it('says the stored definition was not read when the read after the activation answers no table type document', async () => {
    const connection = created(undefined, { data: '' });
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    assert.equal(result.isError, false);
    const answered = answerOf(result);
    assert.equal(answered.stored_definition, undefined);
    assertMatchObject(answered.stored_definition_not_read, {
      status: 200,
      raw_body: '',
    });
  });
});

const DELETION_CHECK_URL = '/sap/bc/adt/deletion/check';
const DELETION_URL = '/sap/bc/adt/deletion/delete';

function deletionCheckXml(refusal?: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><del:checkResponse xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="${refusal ? 'false' : 'true'}" adtcore:name="ZTT_X" xmlns:adtcore="http://www.sap.com/adt/core">` +
    (refusal
      ? `<del:message del:priority="0" del:type="E"><del:text>${refusal}</del:text></del:message>`
      : '') +
    '</del:object></del:checkResponse>'
  );
}

const DELETED_XML =
  '<?xml version="1.0" encoding="utf-8"?><del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
  '<del:object del:isDeleted="true" adtcore:name="ZTT_X" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<del:message del:priority="0" del:type="S"><del:text/></del:message></del:object></del:deletionResult>';

describe('DeleteTableType', () => {
  it('sends the check POST, then the delete POST, stateless and without a lock', async () => {
    const connection = sessionRecording([
      { data: deletionCheckXml() },
      { data: DELETED_XML },
    ]);
    const result = await handleDeleteTableType(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x', transport_request: 'K1' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(wire(connection), [
      `POST ${DELETION_CHECK_URL}`,
      `POST ${DELETION_URL}`,
    ]);
    assert.deepStrictEqual(connection.sessions, ['stateless', 'stateless']);
    const [check, del] = connection.requests;
    assert.equal(
      check?.headers?.Accept,
      'application/vnd.sap.adt.deletion.check.response.v1+xml',
    );
    assert.equal(
      check?.headers?.['Content-Type'],
      'application/vnd.sap.adt.deletion.check.request.v1+xml',
    );
    assert.equal(
      del?.headers?.Accept,
      'application/vnd.sap.adt.deletion.response.v1+xml',
    );
    assert.equal(
      del?.headers?.['Content-Type'],
      'application/vnd.sap.adt.deletion.request.v1+xml',
    );
    assert.ok(String(check?.data).includes(`adtcore:uri="${TTYP}/ztt_x"`));
    assert.ok(String(del?.data).includes(`adtcore:uri="${TTYP}/ztt_x"`));
    assert.ok(String(del?.data).includes('K1'));
    assertMatchObject(JSON.parse(textOf(result)), {
      deleted: true,
      object: 'ZTT_X',
    });
  });

  it("answers a refused check with SAP's text and sends no delete", async () => {
    const connection = sessionRecording([
      { data: deletionCheckXml('Table type is still used') },
    ]);
    const result = await handleDeleteTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, true);
    assert.ok(textOf(result).includes('Table type is still used'));
    assert.deepStrictEqual(wire(connection), [`POST ${DELETION_CHECK_URL}`]);
  });

  it('refuses an empty table_type_name, sending nothing', async () => {
    const connection = recordingConnection();
    const result = await handleDeleteTableType(
      { connection, logger: undefined },
      { table_type_name: '' },
    );
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'table_type_name is required');
    assert.equal(connection.requests.length, 0);
  });

  it('refuses an absent table_type_name at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(DeleteTableType_Tool, handleDeleteTableType).call(
        { connection, logger: undefined },
        {},
      ),
      'at table_type_name',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('is served on a connection declared cloud', async () => {
    const connection = sessionRecording([
      { data: deletionCheckXml() },
      { data: DELETED_XML },
    ]);
    declareSystemKind(connection, 'cloud');
    const result = await handleDeleteTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 2);
  });
});

describe('ActivateTableType', () => {
  it('sends one stateless activation POST naming the table type', async () => {
    const connection = sessionRecording([
      { data: corpusBody('activation-success-verdict--01-activation') },
    ]);
    const result = await handleActivateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    assert.equal(result.isError, false);
    assertMatchObject(JSON.parse(textOf(result)), { activated: true });
    assert.deepStrictEqual(wire(connection), [
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
    const [sent] = connection.requests;
    assert.ok(String(sent?.data).includes(`${TTYP}/ztt_x`));
    assert.ok(String(sent?.data).includes('adtcore:name="ZTT_X"'));
    assert.equal(sent?.headers?.Accept, 'application/xml');
    assert.equal(
      sent?.headers?.['Content-Type'],
      'application/vnd.sap.adt.activation+xml',
    );
    assert.deepStrictEqual(connection.sessions, ['stateless']);
  });

  it('refuses an empty table_type_name, sending nothing', async () => {
    const connection = recordingConnection();
    const result = await handleActivateTableType(
      { connection, logger: undefined },
      { table_type_name: '' },
    );
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'table_type_name is required');
    assert.equal(connection.requests.length, 0);
  });

  it('refuses an absent table_type_name at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(ActivateTableType_Tool, handleActivateTableType).call(
        { connection, logger: undefined },
        {},
      ),
      'at table_type_name',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('is served on a connection declared cloud', async () => {
    const connection = sessionRecording([
      { data: corpusBody('activation-success-verdict--01-activation') },
    ]);
    declareSystemKind(connection, 'cloud');
    const result = await handleActivateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 1);
  });
});

describe('CheckTableType', () => {
  const CHECK_OK =
    '<?xml version="1.0" encoding="UTF-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:triggeringUri="adt://X/sap/bc/adt/ddic/tabletypes/ztt_x" chkrun:status="processed" chkrun:statusText="Object ZTT_X has been checked"/></chkrun:checkRunReports>';

  it('sends one check POST, active by default, stateless', async () => {
    const connection = sessionRecording([{ data: CHECK_OK }]);
    const result = await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(wire(connection), [`POST ${CHECK_URL}`]);
    assert.deepStrictEqual(connection.sessions, ['stateless']);
    const [sent] = connection.requests;
    assert.ok(String(sent?.data).includes(`${TTYP}/ztt_x`));
    assert.ok(String(sent?.data).includes('chkrun:version="active"'));
    assert.equal(JSON.parse(textOf(result)).object_name, 'ZTT_X');
  });

  it('checks the inactive version when asked', async () => {
    const connection = sessionRecording([{ data: CHECK_OK }]);
    await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', version: 'inactive' },
    );
    assert.ok(
      String(connection.requests[0]?.data).includes(
        'chkrun:version="inactive"',
      ),
    );
  });

  it("answers SAP's refusal text", async () => {
    const connection = sessionRecording([
      {
        ...REFUSED,
        data: REFUSED.data.replace('refused', 'no authority for CHECKTT'),
      },
    ]);
    const result = await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, true);
    assert.ok(textOf(result).includes('no authority for CHECKTT'));
  });

  it('refuses an empty table_type_name, sending nothing', async () => {
    const connection = recordingConnection();
    const result = await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: '' },
    );
    assert.equal(result.isError, true);
    assert.ok(textOf(result).includes('table_type_name is required'));
    assert.equal(connection.requests.length, 0);
  });

  it('refuses an absent table_type_name at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(CheckTableType_Tool, handleCheckTableType).call(
        { connection, logger: undefined },
        {},
      ),
      'at table_type_name',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('is served on a connection declared cloud', async () => {
    const connection = sessionRecording([{ data: CHECK_OK }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 1);
  });
});

describe('the table-type version tools', () => {
  const FEED =
    '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom">' +
    '<atom:entry><atom:author><atom:name>DEV</atom:name></atom:author>' +
    '<atom:content src="/sap/bc/adt/ddic/tabletypes/ztt_x/versions/0001"/>' +
    '<atom:id>0001</atom:id><atom:title>Version 1</atom:title>' +
    '<atom:updated>2026-01-01T00:00:00Z</atom:updated></atom:entry></atom:feed>';

  const versionTool = (name: string) => {
    const entry = buildObjectVersionTools().find(
      (e) => e.toolDefinition.name === name,
    );
    if (!entry) throw new Error(`tool ${name} not found`);
    return entry;
  };

  it('is the version list alone, [read-only], on both variants', () => {
    const { toolDefinition } = versionTool('GetTableTypeVersions');
    assert.equal(toolDefinition.description.startsWith('[read-only]'), true);
    assert.deepStrictEqual(toolDefinition.available_in, ['onprem', 'cloud']);
    // SAP refuses a table type's version source: 403 "Request version for
    // TTYP is not supported" (measured on premise 2026-11-01, on ABAP cloud
    // 2026-11-02), so no source or diff tool is offered for it.
    const names = buildObjectVersionTools().map((e) => e.toolDefinition.name);
    assert.ok(!names.includes('GetTableTypeVersionSource'));
    assert.ok(!names.includes('GetTableTypeVersionDiff'));
  });

  for (const variant of ['onprem', 'cloud'] as const) {
    it(
      format(
        'GetObjectVersions takes table_type on %s; GetObjectVersionSource and GetObjectVersionDiff do not',
        variant,
      ),
      () => {
        // Widened to strings, so includes() takes any value.
        const versioned: readonly string[] = VERSIONED_KINDS[variant];
        const sourced: readonly string[] = VERSION_SOURCE_KINDS[variant];
        assert.ok(versioned.includes('table_type'));
        assert.ok(!sourced.includes('table_type'));
        const sourceTypes = jsonAt(
          listedJson(GET_OBJECT_VERSION_SOURCE.variants[variant].inputSchema),
          'object_type',
        ).enum;
        assert.ok(Array.isArray(sourceTypes));
        assert.ok(!sourceTypes.includes('table_type'));
        const diffTypes = jsonAt(
          listedJson(GET_OBJECT_VERSION_DIFF.variants[variant].inputSchema),
          'object_type',
        ).enum;
        assert.ok(Array.isArray(diffTypes));
        assert.ok(!diffTypes.includes('table_type'));
        const versionsTypes = jsonAt(
          listedJson(GET_OBJECT_VERSIONS.variants[variant].inputSchema),
          'object_type',
        ).enum;
        assert.ok(Array.isArray(versionsTypes));
        assert.ok(versionsTypes.includes('table_type'));
      },
    );
  }

  it('GetObjectVersionSource refuses table_type at the schema, sending nothing', async () => {
    const connection = recordingConnection();
    const refused = assertRejects(
      defineTool(GET_OBJECT_VERSION_SOURCE, handleGetObjectVersionSource).call(
        { connection, logger: undefined },
        {
          object_type: 'table_type',
          content_uri: `${TTYP}/ztt_x/versions/0001`,
        },
      ),
      'Invalid arguments for tool GetObjectVersionSource: ',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });

  it('GetTableTypeVersions sends one GET to the versions feed of the table type', async () => {
    const connection = sessionRecording([{ data: FEED }]);
    const result = await versionTool('GetTableTypeVersions').handler(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(wire(connection), [`GET ${TTYP}/ztt_x/versions`]);
    const answered = JSON.parse(textOf(result));
    assert.equal(answered.object_type, 'table_type');
    assert.equal(answered.object_name, 'ZTT_X');
    assert.deepStrictEqual(connection.sessions, ['stateless']);
  });

  it('GetObjectVersions takes the kind table_type, on a connection declared cloud too', async () => {
    const connection = sessionRecording([{ data: FEED }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleGetObjectVersions(
      { connection, logger: undefined },
      { object_type: 'table_type', object_name: 'ZTT_X' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(wire(connection), [`GET ${TTYP}/ztt_x/versions`]);
  });

  for (const [name, args, text] of [
    ['GetTableTypeVersions', {}, 'table_type_name is required'],
  ] satisfies [string, Record<string, unknown>, string][]) {
    it(
      format('%s refuses missing arguments, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const result = await versionTool(name).handler(
          { connection, logger: undefined },
          args,
        );
        assert.equal(result.isError, true);
        assert.equal(textOf(result), text);
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it("answers SAP's body when the connection throws on a 403, as the real transports do", async () => {
    const connection = recordingConnection();
    const refusing: typeof connection = {
      ...connection,
      async makeAdtRequest() {
        throw Object.assign(new Error('Request failed with status code 403'), {
          response: {
            status: 403,
            statusText: 'Forbidden',
            headers: {},
            data: '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNoAccess"/><message>no authority for VERSIONTT</message></exc:exception>',
          },
        });
      },
    };
    const result = await versionTool('GetTableTypeVersions').handler(
      { connection: refusing, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    assert.equal(result.isError, true);
    assert.ok(textOf(result).includes('no authority for VERSIONTT'));
  });
});

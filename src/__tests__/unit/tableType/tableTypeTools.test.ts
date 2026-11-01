/**
 * The table-type tools, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import {
  TOOL_DEFINITION as CreateTableType_Tool,
  handleCreateTableType,
} from '../../../handlers/table_type/high/handleCreateTableType';
import { handleGetTableType } from '../../../handlers/table_type/high/handleGetTableType';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
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

const TABLE_TYPE_XML =
  '<?xml version="1.0" encoding="utf-8"?><ttyp:tableType adtcore:name="ZTT_X" xmlns:ttyp="http://www.sap.com/dictionary/tabletype"/>';

describe('GetTableType', () => {
  it('sends one GET to the table type, and answers the document under metadata', async () => {
    const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
    const result = await handleGetTableType(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
    const [sent] = connection.requests;
    expect(sent?.method).toBe('GET');
    expect(sent?.url).toBe('/sap/bc/adt/ddic/tabletypes/ztt_x');
    const first = result.content[0];
    const answered = JSON.parse(first && 'text' in first ? first.text : '{}');
    expect(answered).toEqual({
      success: true,
      table_type_name: 'ZTT_X',
      part: 'metadata',
      metadata: TABLE_TYPE_XML,
    });
  });

  it.each([[{}], [{ table_type_name: '' }]])(
    'refuses a missing table_type_name, sending nothing',
    async (args) => {
      const connection = recordingConnection();
      const result = await handleGetTableType(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      const first = result.content[0];
      expect(first && 'text' in first ? first.text : '').toBe(
        'table_type_name is required',
      );
      expect(connection.requests).toHaveLength(0);
    },
  );

  it('is served on a connection declared cloud', async () => {
    const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleGetTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
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

/** What the server answers a read of an existing table type with. */
const STRING_TABLE = `<?xml version="1.0" encoding="utf-8"?>
<ttyp:tableType adtcore:name="ZTT_X" adtcore:type="TTYP/DA" adtcore:description="before" xmlns:ttyp="http://www.sap.com/dictionary/tabletype" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/zp" adtcore:type="DEVC/K" adtcore:name="ZP"/>
  <ttyp:rowType>
    <ttyp:typeKind>predefinedAbapType</ttyp:typeKind>
    <ttyp:typeName/>
    <ttyp:builtInType>
      <ttyp:dataType>STRING</ttyp:dataType>
      <ttyp:length>000000</ttyp:length>
      <ttyp:decimals>000000</ttyp:decimals>
    </ttyp:builtInType>
  </ttyp:rowType>
  <ttyp:accessType>standard</ttyp:accessType>
  <ttyp:primaryKey ttyp:isVisible="true">
    <ttyp:definition>standard</ttyp:definition>
    <ttyp:kind>nonUnique</ttyp:kind>
  </ttyp:primaryKey>
</ttyp:tableType>`;

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
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([
      `POST ${TTYP}/validation?objtype=ttypda&objname=ZTT_X&description=A+table+type`,
      `POST ${TTYP}?corrNr=K1`,
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}&corrNr=K1`,
      `POST ${UNLOCK_URL}`,
      `GET ${TTYP}/ztt_x?withLongPolling=true`,
      `POST ${CHECK_URL}`,
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
    expect(connection.sessions).toEqual([
      'stateless',
      'stateless',
      'stateful',
      'stateless',
      'stateless',
      'stateful',
      'stateless',
      'stateless',
      'stateless',
    ]);
    const create = connection.requests[1];
    expect(String(create?.data)).toContain(
      'adtcore:description="A table type"',
    );
    expect(String(create?.data)).toContain(
      '<adtcore:packageRef adtcore:name="ZP"/>',
    );
    expect(create?.headers?.['Content-Type']).toBe(PAIR);
    const put = connection.requests[4];
    expect(put?.headers?.['Content-Type']).toBe(PAIR);
    expect(put?.data).toBe(
      STRING_TABLE.replace(
        '<ttyp:typeKind>predefinedAbapType</ttyp:typeKind>',
        '<ttyp:typeKind>dictionaryType</ttyp:typeKind>',
      )
        .replace('<ttyp:typeName/>', '<ttyp:typeName>MARA</ttyp:typeName>')
        .replace(
          'adtcore:description="before"',
          'adtcore:description="A table type"',
        ),
    );
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
    expect(body).toContain('<ttyp:dataType>CHAR</ttyp:dataType>');
    expect(body).toContain('<ttyp:length>10</ttyp:length>');
    expect(body).toContain('<ttyp:decimals>2</ttyp:decimals>');
    expect(body).toContain('<ttyp:accessType>sorted</ttyp:accessType>');
    expect(body).toContain('<ttyp:definition>rowType</ttyp:definition>');
    expect(body).toContain('<ttyp:kind>unique</ttyp:kind>');
  });

  it("leaves SAP's value for every property not given: the PUT body is the read document", async () => {
    const connection = created();
    await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    expect(connection.requests[4]?.method).toBe('PUT');
    expect(connection.requests[4]?.data).toBe(STRING_TABLE);
  });

  it('declares a schema default on activate and the shared detail alone', () => {
    const { properties } = CreateTableType_Tool.inputSchema;
    const defaulted = Object.entries(properties)
      .filter(([, schema]) => 'default' in schema)
      .map(([name]) => name);
    expect(defaulted).toEqual(['activate', 'detail']);
  });

  it('sends no activation with activate false', async () => {
    const connection = created();
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', activate: false },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(8);
    expect(connection.requests[7]?.url).toBe(CHECK_URL);
  });

  it('still unlocks when the write is refused, and answers the refusal', async () => {
    const connection = created([REFUSED]);
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    expect(result.isError).toBe(true);
    expect(wire(connection).slice(4)).toEqual([
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}`,
      `POST ${UNLOCK_URL}`,
    ]);
    expect(connection.sessions[5]).toBe('stateful');
  });

  it.each([
    ['table_type_name', { package_name: 'ZP' }],
    ['table_type_name', { table_type_name: '', package_name: 'ZP' }],
    ['package_name', { table_type_name: 'ZTT_X' }],
    ['package_name', { table_type_name: 'ZTT_X', package_name: '' }],
  ])('refuses a missing %s, sending nothing', async (name, args) => {
    const connection = recordingConnection();
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      args,
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`${name} is required`);
    expect(connection.requests).toHaveLength(0);
  });

  it('is served on a connection declared cloud', async () => {
    const connection = created();
    declareSystemKind(connection, 'cloud');
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(9);
  });
});

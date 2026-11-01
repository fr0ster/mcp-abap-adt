/**
 * The table-type tools, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

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
import { handleCheckTableType } from '../../../handlers/table_type/high/handleCheckTableType';
import {
  TOOL_DEFINITION as CreateTableType_Tool,
  handleCreateTableType,
} from '../../../handlers/table_type/high/handleCreateTableType';
import { handleDeleteTableType } from '../../../handlers/table_type/high/handleDeleteTableType';
import {
  TOOL_DEFINITION as GET_TABLE_TYPE,
  handleGetTableType,
} from '../../../handlers/table_type/high/handleGetTableType';
import {
  handleUpdateTableType,
  TOOL_DEFINITION as UpdateTableType_Tool,
} from '../../../handlers/table_type/high/handleUpdateTableType';
import { handleActivateTableType } from '../../../handlers/table_type/low/handleActivateTableType';
import { corpusBody } from '../../../lib/adtCorpus';
import {
  VERSION_SOURCE_KINDS,
  VERSIONED_KINDS,
} from '../../../lib/adtProjections';
import { COMPACT_READ_TAKES } from '../../../lib/compact/compactSchemas';
import { READ_VERSION_PROPERTY } from '../../../lib/handlers/readVersion';
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
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
    const [sent] = connection.requests;
    expect(sent?.method).toBe('GET');
    expect(sent?.url).toBe('/sap/bc/adt/ddic/tabletypes/ztt_x?version=active');
    const first = result.content[0];
    const answered = JSON.parse(first && 'text' in first ? first.text : '{}');
    expect(answered).toEqual({
      success: true,
      table_type_name: 'ZTT_X',
      version: 'active',
      part: 'metadata',
      metadata: TABLE_TYPE_XML,
    });
  });

  it('declares the shared read version, active by default', () => {
    expect(GET_TABLE_TYPE.inputSchema.properties.version).toBe(
      READ_VERSION_PROPERTY,
    );
  });

  it.each(READ_VERSION_PROPERTY.enum)(
    'reads the version given (%s), and answers it',
    async (version) => {
      const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
      const result = await handleGetTableType(
        { connection, logger: undefined },
        { table_type_name: 'ztt_x', version },
      );
      expect(connection.requests.map((r) => r.url)).toEqual([
        `/sap/bc/adt/ddic/tabletypes/ztt_x?version=${version}`,
      ]);
      const first = result.content[0];
      const answered = JSON.parse(first && 'text' in first ? first.text : '{}');
      expect(answered.version).toBe(version);
    },
  );

  it.each(READ_VERSION_PROPERTY.enum)(
    'compact HandlerGet TABLE_TYPE passes its version (%s) to the read',
    async (version) => {
      const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
      await readTableType(
        { connection, logger: undefined },
        { table_type_name: 'ztt_x', version },
      );
      expect(connection.requests.map((r) => r.url)).toEqual([
        `/sap/bc/adt/ddic/tabletypes/ztt_x?version=${version}`,
      ]);
    },
  );

  it('compact HandlerGet TABLE_TYPE takes version', () => {
    expect(COMPACT_READ_TAKES.members.TABLE_TYPE).toContain('version');
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
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([
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
          'adtcore:description="Tabelle von Strings"',
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
    expect(connection.requests).toHaveLength(10);
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
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}&corrNr=K1`,
      `POST ${CHECK_URL}`,
      `POST ${UNLOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=inactive&withLongPolling=true`,
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
      `GET ${TTYP}/ztt_x?version=active`,
    ]);
    expect(connection.sessions).toEqual([
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
    expect(put?.headers?.['Content-Type']).toBe(PAIR);
    expect(put?.data).toBe(
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
    expect(connection.requests[2]?.method).toBe('PUT');
    expect(connection.requests[2]?.data).toBe(STRING_TABLE);
  });

  it('declares a schema default on activate and the shared detail alone, and takes no package', () => {
    const { properties } = UpdateTableType_Tool.inputSchema;
    const defaulted = Object.entries(properties)
      .filter(([, schema]) => 'default' in schema)
      .map(([name]) => name);
    expect(defaulted).toEqual(['activate', 'detail']);
    expect(Object.keys(properties)).not.toContain('package_name');
  });

  it('sends no activation with activate false', async () => {
    const connection = existing();
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', activate: false },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(6);
    expect(connection.requests[5]?.url).toBe(
      `${TTYP}/ztt_x?version=inactive&withLongPolling=true`,
    );
  });

  it('still unlocks when the write is refused, and sends nothing after the unlock', async () => {
    const connection = existing([REFUSED]);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(true);
    expect(wire(connection)).toEqual([
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}`,
      `POST ${UNLOCK_URL}`,
    ]);
    expect(connection.sessions[3]).toBe('stateful');
  });

  it('still unlocks when the check is refused, and sends nothing after the unlock', async () => {
    const connection = existing([undefined, REFUSED]);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(true);
    expect(wire(connection)).toEqual([
      `POST ${LOCK_URL}`,
      `GET ${TTYP}/ztt_x?version=workingArea`,
      `PUT ${TTYP}/ztt_x?lockHandle=${HANDLE}`,
      `POST ${CHECK_URL}`,
      `POST ${UNLOCK_URL}`,
    ]);
    expect(connection.sessions[4]).toBe('stateful');
  });

  it.each([[{}], [{ table_type_name: '' }]])(
    'refuses a missing table_type_name, sending nothing',
    async (args) => {
      const connection = recordingConnection();
      const result = await handleUpdateTableType(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('table_type_name is required');
      expect(connection.requests).toHaveLength(0);
    },
  );

  it('is served on a connection declared cloud', async () => {
    const connection = existing();
    declareSystemKind(connection, 'cloud');
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(8);
  });
});

/**
 * What SAP stores when it takes other values than those sent (measured on
 * E19, 2026-11-01: `hashed` forces a unique key): STRING_TABLE with a hashed
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
    async makeAdtRequest<T = unknown, D = unknown>(
      options: Parameters<RecordingConnection['makeAdtRequest']>[0],
    ) {
      if (options.url === url) {
        inner.requests.push({ method: options.method, url: options.url });
        throw Object.assign(new Error('Request failed with status code 403'), {
          response: { ...REFUSED, headers: {} },
        });
      }
      return inner.makeAdtRequest<T, D>(options);
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

  it.each(DETAILS)(
    'CreateTableType, activated: reads the active version after the activation and answers it (detail %s)',
    async (detail) => {
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
      expect(result.isError).toBe(false);
      expect(wire(connection).slice(6)).toEqual([
        `GET ${WAIT_URL}`,
        `POST ${CHECK_URL}`,
        `POST ${ACTIVATE_URL}`,
        `GET ${ACTIVE_URL}`,
      ]);
      expect(answerOf(result)).toMatchObject({
        stored_definition: STORED_HASHED_DEFINITION,
        stored_version: 'active',
      });
    },
  );

  it('CreateTableType, activate false: the wait reads the inactive version, and the answer names it', async () => {
    const connection = created({ data: STORED_HASHED });
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', activate: false },
    );
    expect(connection.requests).toHaveLength(8);
    expect(connection.requests[6]?.url).toBe(WAIT_URL);
    expect(answerOf(result)).toEqual({
      result: 'SUCCESS',
      stored_definition: STORED_HASHED_DEFINITION,
      stored_version: 'inactive',
    });
  });

  it.each(DETAILS)(
    'UpdateTableType, activated: reads the active version after the activation and answers it (detail %s)',
    async (detail) => {
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
      expect(result.isError).toBe(false);
      expect(wire(connection).slice(5)).toEqual([
        `GET ${WAIT_URL}`,
        `POST ${ACTIVATE_URL}`,
        `GET ${ACTIVE_URL}`,
      ]);
      expect(answerOf(result)).toMatchObject({
        stored_definition: STORED_HASHED_DEFINITION,
        stored_version: 'active',
      });
    },
  );

  it('UpdateTableType, activate false: the wait reads the inactive version, and the answer names it', async () => {
    const connection = existing({ data: STORED_HASHED });
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', activate: false },
    );
    expect(connection.requests).toHaveLength(6);
    expect(connection.requests[5]?.url).toBe(WAIT_URL);
    expect(answerOf(result)).toEqual({
      result: 'SUCCESS',
      stored_definition: STORED_HASHED_DEFINITION,
      stored_version: 'inactive',
    });
  });

  it("CreateTableType answers a refused activation with SAP's refusal and the inactive definition the wait read", async () => {
    const connection = created({ data: STORED_HASHED });
    const result = await handleCreateTableType(
      { connection: throwingAt(connection, ACTIVATE_URL), logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', access_type: 'hashed' },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests).toHaveLength(9);
    expect(answerOf(result)).toMatchObject({
      status: 403,
      raw_body: REFUSED.data,
      step: 'activate',
      stored_definition: STORED_HASHED_DEFINITION,
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
      REFUSED,
    ]);
    const result = await handleCreateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', package_name: 'ZP', access_type: 'hashed' },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests).toHaveLength(8);
    expect(answerOf(result)).toMatchObject({
      message: 'refused',
      status: 403,
      step: 'check',
      stored_definition: STORED_HASHED_DEFINITION,
      stored_version: 'inactive',
    });
  });

  it("UpdateTableType answers a refused activation with SAP's refusal and the inactive definition the wait read", async () => {
    const connection = existing({ data: STORED_HASHED });
    const result = await handleUpdateTableType(
      { connection: throwingAt(connection, ACTIVATE_URL), logger: undefined },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests).toHaveLength(7);
    expect(answerOf(result)).toMatchObject({
      status: 403,
      raw_body: REFUSED.data,
      step: 'activate',
      stored_definition: STORED_HASHED_DEFINITION,
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
    expect(result.isError).toBe(true);
    expect(wire(connection).slice(3)).toEqual([
      `POST ${CHECK_URL}`,
      `POST ${UNLOCK_URL}`,
    ]);
    const answered = answerOf(result);
    expect(answered).not.toHaveProperty('stored_definition');
    expect(answered).not.toHaveProperty('stored_version');
  });

  it('the descriptions say which version each answers, per tool', () => {
    const create = CreateTableType_Tool.description;
    const update = UpdateTableType_Tool.description;
    // Create checks after the wait: a refused check carries the inactive
    // definition. Update checks under the lock, before the read.
    expect(create.includes('a refused check or a refused activation')).toBe(
      true,
    );
    expect(update.includes('activate false or a refused activation')).toBe(
      true,
    );
    expect(update.includes('a refused check is answered alone')).toBe(true);
  });

  it('a write refused before the wait answers no stored definition', async () => {
    const connection = sessionRecording([
      undefined,
      { data: STRING_TABLE },
      REFUSED,
    ]);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests).toHaveLength(4);
    const answered = answerOf(result);
    expect(answered.message).toBe('refused');
    expect(answered).not.toHaveProperty('stored_definition');
    expect(answered).not.toHaveProperty('stored_definition_not_read');
    expect(answered).not.toHaveProperty('stored_version');
  });

  it("says the stored definition was not read when the read after the activation is refused, with SAP's answer", async () => {
    const connection = existing({ data: STORED_HASHED }, REFUSED);
    const result = await handleUpdateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', access_type: 'hashed' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(8);
    const answered = answerOf(result);
    expect(answered.stored_definition).toBeUndefined();
    expect(answered.stored_version).toBe('active');
    expect(answered.stored_definition_not_read).toMatchObject({
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
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(6);
    const answered = answerOf(result);
    expect(answered.stored_definition).toBeUndefined();
    expect(answered.stored_version).toBe('inactive');
    expect(answered.stored_definition_not_read).toMatchObject({
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
    expect(result.isError).toBe(false);
    const answered = answerOf(result);
    expect(answered.stored_definition).toBeUndefined();
    expect(answered.stored_definition_not_read).toMatchObject({
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
    expect(result.isError).toBe(false);
    const answered = answerOf(result);
    expect(answered.stored_definition).toBeUndefined();
    expect(answered.stored_definition_not_read).toMatchObject({
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
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([
      `POST ${DELETION_CHECK_URL}`,
      `POST ${DELETION_URL}`,
    ]);
    expect(connection.sessions).toEqual(['stateless', 'stateless']);
    const [check, del] = connection.requests;
    expect(check?.headers?.Accept).toBe(
      'application/vnd.sap.adt.deletion.check.response.v1+xml',
    );
    expect(check?.headers?.['Content-Type']).toBe(
      'application/vnd.sap.adt.deletion.check.request.v1+xml',
    );
    expect(del?.headers?.Accept).toBe(
      'application/vnd.sap.adt.deletion.response.v1+xml',
    );
    expect(del?.headers?.['Content-Type']).toBe(
      'application/vnd.sap.adt.deletion.request.v1+xml',
    );
    expect(String(check?.data)).toContain(`adtcore:uri="${TTYP}/ztt_x"`);
    expect(String(del?.data)).toContain(`adtcore:uri="${TTYP}/ztt_x"`);
    expect(String(del?.data)).toContain('K1');
    expect(JSON.parse(textOf(result))).toMatchObject({
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
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Table type is still used');
    expect(wire(connection)).toEqual([`POST ${DELETION_CHECK_URL}`]);
  });

  it.each([[{}], [{ table_type_name: '' }]])(
    'refuses a missing table_type_name, sending nothing',
    async (args) => {
      const connection = recordingConnection();
      const result = await handleDeleteTableType(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('table_type_name is required');
      expect(connection.requests).toHaveLength(0);
    },
  );

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
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(2);
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
    expect(result.isError).toBe(false);
    expect(JSON.parse(textOf(result))).toMatchObject({ activated: true });
    expect(wire(connection)).toEqual([
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
    const [sent] = connection.requests;
    expect(String(sent?.data)).toContain(`${TTYP}/ztt_x`);
    expect(String(sent?.data)).toContain('adtcore:name="ZTT_X"');
    expect(sent?.headers?.Accept).toBe('application/xml');
    expect(sent?.headers?.['Content-Type']).toBe(
      'application/vnd.sap.adt.activation+xml',
    );
    expect(connection.sessions).toEqual(['stateless']);
  });

  it.each([[{}], [{ table_type_name: '' }]])(
    'refuses a missing table_type_name, sending nothing',
    async (args) => {
      const connection = recordingConnection();
      const result = await handleActivateTableType(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('table_type_name is required');
      expect(connection.requests).toHaveLength(0);
    },
  );

  it('is served on a connection declared cloud', async () => {
    const connection = sessionRecording([
      { data: corpusBody('activation-success-verdict--01-activation') },
    ]);
    declareSystemKind(connection, 'cloud');
    const result = await handleActivateTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
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
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([`POST ${CHECK_URL}`]);
    expect(connection.sessions).toEqual(['stateless']);
    const [sent] = connection.requests;
    expect(String(sent?.data)).toContain(`${TTYP}/ztt_x`);
    expect(String(sent?.data)).toContain('chkrun:version="active"');
    expect(JSON.parse(textOf(result)).object_name).toBe('ZTT_X');
  });

  it('checks the inactive version when asked', async () => {
    const connection = sessionRecording([{ data: CHECK_OK }]);
    await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X', version: 'inactive' },
    );
    expect(String(connection.requests[0]?.data)).toContain(
      'chkrun:version="inactive"',
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
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('no authority for CHECKTT');
  });

  it.each([[{}], [{ table_type_name: '' }]])(
    'refuses a missing table_type_name, sending nothing',
    async (args) => {
      const connection = recordingConnection();
      const result = await handleCheckTableType(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('table_type_name is required');
      expect(connection.requests).toHaveLength(0);
    },
  );

  it('is served on a connection declared cloud', async () => {
    const connection = sessionRecording([{ data: CHECK_OK }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleCheckTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
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
    expect(toolDefinition.description.startsWith('[read-only]')).toBe(true);
    expect(toolDefinition.available_in).toEqual(['onprem', 'cloud']);
    // SAP refuses a table type's version source: 403 "Request version for
    // TTYP is not supported" (measured on premise 2026-11-01, on ABAP cloud
    // 2026-11-02), so no source or diff tool is offered for it.
    const names = buildObjectVersionTools().map((e) => e.toolDefinition.name);
    expect(names).not.toContain('GetTableTypeVersionSource');
    expect(names).not.toContain('GetTableTypeVersionDiff');
  });

  it.each(['onprem', 'cloud'] as const)(
    'GetObjectVersions takes table_type on %s; GetObjectVersionSource and GetObjectVersionDiff do not',
    (variant) => {
      expect(VERSIONED_KINDS[variant]).toContain('table_type');
      expect(VERSION_SOURCE_KINDS[variant]).not.toContain('table_type');
      expect(
        GET_OBJECT_VERSION_SOURCE.variants[variant].inputSchema.properties
          .object_type.enum,
      ).not.toContain('table_type');
      expect(
        GET_OBJECT_VERSION_DIFF.variants[variant].inputSchema.properties
          .object_type.enum,
      ).not.toContain('table_type');
      expect(
        GET_OBJECT_VERSIONS.variants[variant].inputSchema.properties.object_type
          .enum,
      ).toContain('table_type');
    },
  );

  it('GetObjectVersionSource refuses table_type, sending nothing', async () => {
    const connection = recordingConnection();
    const result = await handleGetObjectVersionSource(
      { connection, logger: undefined },
      { object_type: 'table_type', content_uri: `${TTYP}/ztt_x/versions/0001` },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests).toHaveLength(0);
  });

  it('GetTableTypeVersions sends one GET to the versions feed of the table type', async () => {
    const connection = sessionRecording([{ data: FEED }]);
    const result = await versionTool('GetTableTypeVersions').handler(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([`GET ${TTYP}/ztt_x/versions`]);
    const answered = JSON.parse(textOf(result));
    expect(answered.object_type).toBe('table_type');
    expect(answered.object_name).toBe('ZTT_X');
    expect(connection.sessions).toEqual(['stateless']);
  });

  it('GetObjectVersions takes the kind table_type, on a connection declared cloud too', async () => {
    const connection = sessionRecording([{ data: FEED }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleGetObjectVersions(
      { connection, logger: undefined },
      { object_type: 'table_type', object_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(false);
    expect(wire(connection)).toEqual([`GET ${TTYP}/ztt_x/versions`]);
  });

  it.each([['GetTableTypeVersions', {}, 'table_type_name is required']])(
    '%s refuses missing arguments, sending nothing',
    async (name, args, text) => {
      const connection = recordingConnection();
      const result = await versionTool(name).handler(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(text);
      expect(connection.requests).toHaveLength(0);
    },
  );

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
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('no authority for VERSIONTT');
  });
});

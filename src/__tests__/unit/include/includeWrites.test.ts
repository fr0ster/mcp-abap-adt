/**
 * The include writes, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import {
  TOOL_DEFINITION as CREATE_INCLUDE,
  handleCreateInclude,
} from '../../../handlers/include/high/handleCreateInclude';
import { handleDeleteInclude } from '../../../handlers/include/high/handleDeleteInclude';
import { handleUpdateInclude } from '../../../handlers/include/high/handleUpdateInclude';
import { handleUpdateIncludeMetadata } from '../../../handlers/include/high/handleUpdateIncludeMetadata';
import { handleActivateInclude } from '../../../handlers/include/low/handleActivateInclude';
import { corpusBody } from '../../../lib/adtCorpus';
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

const INCLUDES = '/sap/bc/adt/programs/includes';
const PAIR = 'application/vnd.sap.adt.programs.includes.v2+xml';

describe('CreateInclude', () => {
  it('says SAP writes its comment header into the new include (measured)', () => {
    const { description } = CREATE_INCLUDE;
    expect(description.includes('comment header')).toBe(true);
    expect(description.toLowerCase().includes('empty')).toBe(false);
  });

  it('sends one POST to the includes collection, stateless, with the include document', async () => {
    const connection = recordingConnection();
    const result = await handleCreateInclude(
      { connection, logger: undefined },
      {
        include_name: 'ZI_X',
        package_name: 'ZP',
        description: 'An include',
      },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
    const [sent] = connection.requests;
    expect(sent?.method).toBe('POST');
    expect(sent?.url).toBe(INCLUDES);
    const body = String(sent?.data);
    expect(body).toContain('<include:abapInclude');
    expect(body).toContain('adtcore:name="ZI_X"');
    expect(body).toContain('adtcore:description="An include"');
    expect(body).toContain('<adtcore:packageRef adtcore:name="ZP"/>');
    expect(sent?.headers?.Accept).toBe(PAIR);
    expect(sent?.headers?.['Content-Type']).toBe(PAIR);
    expect(
      Object.keys(sent?.headers ?? {})
        .join(' ')
        .toLowerCase()
        .includes('sessiontype'),
    ).toBe(false);
  });

  it('puts the transport on corrNr, and only with one', async () => {
    const withTransport = recordingConnection();
    await handleCreateInclude(
      { connection: withTransport, logger: undefined },
      { include_name: 'ZI_X', package_name: 'ZP', transport_request: 'K1' },
    );
    expect(withTransport.requests[0]?.url).toBe(`${INCLUDES}?corrNr=K1`);

    const without = recordingConnection();
    await handleCreateInclude(
      { connection: without, logger: undefined },
      { include_name: 'ZI_X', package_name: 'ZP' },
    );
    expect(without.requests[0]?.url).toBe(INCLUDES);
  });

  it('uses the name as the description when none is given, and sends the master language', async () => {
    const connection = recordingConnection();
    await handleCreateInclude(
      { connection, logger: undefined },
      { include_name: 'zi_x', package_name: 'ZP', master_language: 'DE' },
    );
    const body = String(connection.requests[0]?.data);
    expect(body).toContain('adtcore:description="ZI_X"');
    expect(body).toContain('adtcore:masterLanguage="DE"');
  });

  it.each([
    ['include_name', { package_name: 'ZP' }],
    ['include_name', { include_name: '', package_name: 'ZP' }],
    ['package_name', { include_name: 'ZI_X' }],
    ['package_name', { include_name: 'ZI_X', package_name: '' }],
  ])('refuses a missing %s, sending nothing', async (name, args) => {
    const connection = recordingConnection();
    const result = await handleCreateInclude(
      { connection, logger: undefined },
      args,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`${name} is required`);
    expect(connection.requests).toHaveLength(0);
  });

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleCreateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', package_name: 'ZP' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('variant_not_served');
    expect(connection.requests).toHaveLength(0);
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

const LOCK_URL = `${INCLUDES}/zi_x?_action=LOCK&accessMode=MODIFY`;
const UNLOCK_URL = `${INCLUDES}/zi_x?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D`;
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const REFUSED = {
  status: 403,
  statusText: 'Forbidden',
  data: '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNoAccess"/><message>refused</message></exc:exception>',
};

describe('UpdateInclude', () => {
  it('locks stateful, writes the source stateless under the handle, unlocks stateful', async () => {
    const connection = sessionRecording();
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      {
        include_name: 'ZI_X',
        source_code: 'WRITE 1.',
        transport_request: 'K1',
      },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${LOCK_URL}`,
      `PUT ${INCLUDES}/zi_x/source/main?lockHandle=${HANDLE}&corrNr=K1`,
      `POST ${UNLOCK_URL}`,
    ]);
    expect(connection.sessions).toEqual(['stateful', 'stateless', 'stateful']);
    const put = connection.requests[1];
    expect(put?.data).toBe('WRITE 1.');
    expect(put?.headers?.Accept).toBe('text/plain');
    expect(put?.headers?.['Content-Type']).toBe('text/plain; charset=utf-8');
  });

  it('sends no corrNr without a transport, and no activation without activate', async () => {
    const connection = sessionRecording();
    await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: false },
    );
    expect(connection.requests[1]?.url).toBe(
      `${INCLUDES}/zi_x/source/main?lockHandle=${HANDLE}`,
    );
    expect(connection.requests).toHaveLength(3);
  });

  it('adds one activation POST after the unlock when activate is true', async () => {
    const connection = sessionRecording();
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: true },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(4);
    const activation = connection.requests[3];
    expect(activation?.method).toBe('POST');
    expect(activation?.url).toContain('/sap/bc/adt/activation');
    expect(String(activation?.data)).toContain('/programs/includes/zi_x');
    expect(connection.sessions[3]).toBe('stateless');
  });

  it("unlocks before the activation, and answers a refused activation as an error with SAP's text", async () => {
    // SAP's refusal of an activation: 200, activationExecuted="false" and an
    // error message (the corpus case refusal-activation-fails).
    const connection = sessionRecording([
      undefined,
      undefined,
      undefined,
      { data: corpusBody('refusal-activation-fails--01-activation') },
    ]);
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: true },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${LOCK_URL}`,
      `PUT ${INCLUDES}/zi_x/source/main?lockHandle=${HANDLE}`,
      `POST ${UNLOCK_URL}`,
      'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
    ]);
    expect(connection.sessions).toEqual([
      'stateful',
      'stateless',
      'stateful',
      'stateless',
    ]);
    const text = result.content.map((item) => item.text ?? '').join('\n');
    expect(text).toContain('STRONG_BUT_NOT_A_REAL_TYPE');
    expect(text).toContain('is unknown.');
  });

  it('still unlocks when the write is refused, and answers the refusal', async () => {
    const connection = sessionRecording([undefined, REFUSED]);
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: true },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests.map((r) => r.method)).toEqual([
      'POST',
      'PUT',
      'POST',
    ]);
    expect(connection.requests[2]?.url).toBe(UNLOCK_URL);
    expect(connection.sessions[2]).toBe('stateful');
  });

  it.each([
    ['include_name', { source_code: 'x' }],
    ['include_name', { include_name: '', source_code: 'x' }],
    ['source_code', { include_name: 'ZI_X' }],
    ['source_code', { include_name: 'ZI_X', source_code: '' }],
  ])('refuses a missing %s, sending nothing', async (name, args) => {
    const connection = recordingConnection();
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      args,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`${name} is required`);
    expect(connection.requests).toHaveLength(0);
  });

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('variant_not_served');
    expect(connection.requests).toHaveLength(0);
  });
});

const DOCUMENT =
  '<?xml version="1.0" encoding="UTF-8"?>\n<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" adtcore:name="ZI_X"  >\n  <x/>\n</include:abapInclude>';

describe('UpdateIncludeMetadata', () => {
  it('locks stateful, puts the document byte for byte stateless, unlocks stateful', async () => {
    const connection = sessionRecording();
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT, transport_request: 'K1' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${LOCK_URL}`,
      `PUT ${INCLUDES}/zi_x?lockHandle=${HANDLE}&corrNr=K1`,
      `POST ${UNLOCK_URL}`,
    ]);
    expect(connection.sessions).toEqual(['stateful', 'stateless', 'stateful']);
    const put = connection.requests[1];
    expect(put?.data).toBe(DOCUMENT);
    expect(put?.headers?.Accept).toBe(PAIR);
    expect(put?.headers?.['Content-Type']).toBe(PAIR);
  });

  it('sends no corrNr without a transport and no activation', async () => {
    const connection = sessionRecording();
    await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    expect(connection.requests[1]?.url).toBe(
      `${INCLUDES}/zi_x?lockHandle=${HANDLE}`,
    );
    expect(connection.requests).toHaveLength(3);
  });

  it('still unlocks when the write is refused', async () => {
    const connection = sessionRecording([undefined, REFUSED]);
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    expect(result.isError).toBe(true);
    expect(connection.requests.map((r) => r.method)).toEqual([
      'POST',
      'PUT',
      'POST',
    ]);
    expect(connection.requests[2]?.url).toBe(UNLOCK_URL);
  });

  it.each([
    ['include_name', { metadata: DOCUMENT }],
    ['include_name', { include_name: '', metadata: DOCUMENT }],
    ['metadata', { include_name: 'ZI_X' }],
    ['metadata', { include_name: 'ZI_X', metadata: '' }],
  ])('refuses a missing %s, sending nothing', async (name, args) => {
    const connection = recordingConnection();
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      args,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`${name} is required`);
    expect(connection.requests).toHaveLength(0);
  });

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('variant_not_served');
    expect(connection.requests).toHaveLength(0);
  });
});

const CHECK_URL = '/sap/bc/adt/deletion/check';
const DELETE_URL = '/sap/bc/adt/deletion/delete';
const DELETION_PAIR = {
  check: {
    Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
  },
  delete: {
    Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
    'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
  },
};

function checkXml(refusal?: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><del:checkResponse xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="${refusal ? 'false' : 'true'}" adtcore:name="ZI_X" xmlns:adtcore="http://www.sap.com/adt/core">` +
    (refusal
      ? `<del:message del:priority="0" del:type="E"><del:text>${refusal}</del:text></del:message>`
      : '') +
    '</del:object></del:checkResponse>'
  );
}

const DELETED_XML =
  '<?xml version="1.0" encoding="utf-8"?><del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
  '<del:object del:isDeleted="true" adtcore:name="ZI_X" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<del:message del:priority="0" del:type="S"><del:text/></del:message></del:object></del:deletionResult>';

describe('DeleteInclude', () => {
  it('sends the check POST, then the delete POST, stateless and without a lock', async () => {
    const connection = sessionRecording([
      { data: checkXml() },
      { data: DELETED_XML },
    ]);
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      { include_name: 'zi_x', transport_request: 'K1' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${CHECK_URL}`,
      `POST ${DELETE_URL}`,
    ]);
    expect(connection.sessions).toEqual(['stateless', 'stateless']);
    const [check, del] = connection.requests;
    expect(check?.headers?.Accept).toBe(DELETION_PAIR.check.Accept);
    expect(check?.headers?.['Content-Type']).toBe(
      DELETION_PAIR.check['Content-Type'],
    );
    expect(del?.headers?.Accept).toBe(DELETION_PAIR.delete.Accept);
    expect(del?.headers?.['Content-Type']).toBe(
      DELETION_PAIR.delete['Content-Type'],
    );
    expect(String(check?.data)).toContain(
      'adtcore:uri="/sap/bc/adt/programs/includes/zi_x"',
    );
    expect(String(del?.data)).toContain(
      'adtcore:uri="/sap/bc/adt/programs/includes/zi_x"',
    );
    expect(String(del?.data)).toContain('K1');
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      deleted: true,
      object: 'ZI_X',
    });
  });

  it('answers a refused check as it came and sends no delete', async () => {
    const connection = sessionRecording([
      { data: checkXml('Include is still used') },
    ]);
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Include is still used');
    expect(connection.requests.map((r) => r.url)).toEqual([CHECK_URL]);
  });

  it.each([
    ['include_name', {}],
    ['include_name', { include_name: '' }],
  ])('refuses a missing %s, sending nothing', async (name, args) => {
    const connection = recordingConnection();
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      args,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`${name} is required`);
    expect(connection.requests).toHaveLength(0);
  });

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('variant_not_served');
    expect(connection.requests).toHaveLength(0);
  });
});

describe('ActivateInclude', () => {
  it('sends one stateless activation POST naming the include', async () => {
    const connection = sessionRecording([
      { data: corpusBody('activation-success-verdict--01-activation') },
    ]);
    const result = await handleActivateInclude(
      { connection, logger: undefined },
      { include_name: 'zi_x' },
    );
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      activated: true,
    });
    expect(connection.requests).toHaveLength(1);
    const [sent] = connection.requests;
    expect(sent?.method).toBe('POST');
    expect(sent?.url).toContain(
      '/sap/bc/adt/activation?method=activate&preauditRequested=true',
    );
    expect(String(sent?.data)).toContain('/programs/includes/zi_x');
    expect(String(sent?.data)).toContain('adtcore:name="ZI_X"');
    expect(sent?.headers?.Accept).toBe('application/xml');
    expect(sent?.headers?.['Content-Type']).toBe(
      'application/vnd.sap.adt.activation+xml',
    );
    expect(connection.sessions).toEqual(['stateless']);
  });

  it.each([
    ['include_name', {}],
    ['include_name', { include_name: '' }],
  ])('refuses a missing %s, sending nothing', async (name, args) => {
    const connection = recordingConnection();
    const result = await handleActivateInclude(
      { connection, logger: undefined },
      args,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`${name} is required`);
    expect(connection.requests).toHaveLength(0);
  });

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleActivateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('variant_not_served');
    expect(connection.requests).toHaveLength(0);
  });
});

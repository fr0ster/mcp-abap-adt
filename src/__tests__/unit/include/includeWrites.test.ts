/**
 * The include writes, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import { handleCreateInclude } from '../../../handlers/include/high/handleCreateInclude';
import { handleUpdateInclude } from '../../../handlers/include/high/handleUpdateInclude';
import { handleUpdateIncludeMetadata } from '../../../handlers/include/high/handleUpdateIncludeMetadata';
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
  it('sends one POST to the includes collection, stateless, with the include document', async () => {
    const connection = recordingConnection();
    const result: any = await handleCreateInclude(
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
    expect(Object.keys(sent?.headers ?? {}).join(' ')).not.toMatch(
      /sessiontype/i,
    );
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
    const result: any = await handleCreateInclude(
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
    const result: any = await handleCreateInclude(
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
    const result: any = await handleUpdateInclude(
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
    const result: any = await handleUpdateInclude(
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

  it('still unlocks when the write is refused, and answers the refusal', async () => {
    const connection = sessionRecording([undefined, REFUSED]);
    const result: any = await handleUpdateInclude(
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
    const result: any = await handleUpdateInclude(
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
    const result: any = await handleUpdateInclude(
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
    const result: any = await handleUpdateIncludeMetadata(
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
    const result: any = await handleUpdateIncludeMetadata(
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
    const result: any = await handleUpdateIncludeMetadata(
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
    const result: any = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('variant_not_served');
    expect(connection.requests).toHaveLength(0);
  });
});

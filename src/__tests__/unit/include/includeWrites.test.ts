/**
 * The include writes, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import { handleCreateInclude } from '../../../handlers/include/high/handleCreateInclude';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

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

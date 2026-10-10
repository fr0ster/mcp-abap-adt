/**
 * The SAP user a request's own credentials log on as is what SAP answers on
 * a connection built from those credentials — never a claim read from them.
 */
const connect = jest.fn(async () => {});
const built: Array<{ settings: unknown }> = [];
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: (settings: unknown) => {
    built.push({ settings });
    return { connect };
  },
}));
const getSystemInformation = jest.fn();
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  getSystemInformation: (...a: unknown[]) => getSystemInformation(...a),
}));

import { connectedUserOf } from '../../../lib/auth/connectedUser';

const headers = {
  'x-sap-url': 'https://sap.invalid',
  'x-sap-client': '100',
  'x-sap-jwt-token': 'header.payload.signature',
};

describe('connectedUserOf', () => {
  beforeEach(() => {
    connect.mockClear();
    getSystemInformation.mockReset();
    built.length = 0;
  });

  it('connects with the headers and answers the user SAP names', async () => {
    getSystemInformation.mockResolvedValue({ userName: 'SAPUSER01' });
    expect(await connectedUserOf(headers)).toBe('SAPUSER01');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(built[0].settings).toMatchObject({
      url: 'https://sap.invalid',
      client: '100',
      authType: 'jwt',
    });
  });

  it('a system that names no user answers undefined', async () => {
    getSystemInformation.mockResolvedValue(null);
    expect(await connectedUserOf(headers)).toBeUndefined();
    getSystemInformation.mockResolvedValue({ userName: '' });
    expect(await connectedUserOf(headers)).toBeUndefined();
  });

  it('a credential SAP refuses rejects', async () => {
    connect.mockRejectedValueOnce(new Error('401'));
    await expect(connectedUserOf(headers)).rejects.toThrow('401');
    expect(getSystemInformation).not.toHaveBeenCalled();
  });
});

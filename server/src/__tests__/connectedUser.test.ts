/**
 * The SAP user a request's own credentials log on as is what SAP answers on
 * a connection built from those credentials — never a claim read from them.
 */
const connect = jest.fn(async () => {});
const disconnect = jest.fn(async () => {});
const built: Array<{ settings: unknown }> = [];
jest.mock('@mcp-abap-adt/lib/utils', () => ({
  ...jest.requireActual('@mcp-abap-adt/lib/utils'),
  createAbapConnection: (settings: unknown) => {
    built.push({ settings });
    return { connect, disconnect };
  },
}));
const getSystemInformation = jest.fn();
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  getSystemInformation: (...a: unknown[]) => getSystemInformation(...a),
}));

import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { logger } from '@mcp-abap-adt/lib/utils';
import { connectedUserOf } from '../connectedUser';
import { StreamableHttpServer } from '../StreamableHttpServer';

const headers = {
  'x-sap-url': 'https://sap.invalid',
  'x-sap-client': '100',
  'x-sap-jwt-token': 'header.payload.signature',
};

describe('connectedUserOf', () => {
  beforeEach(() => {
    connect.mockClear();
    disconnect.mockReset();
    disconnect.mockResolvedValue(undefined);
    getSystemInformation.mockReset();
    built.length = 0;
  });

  it('connects with the headers and answers the user SAP names', async () => {
    getSystemInformation.mockResolvedValue({ userName: 'SAPUSER01' });
    expect(await connectedUserOf(headers)).toBe('SAPUSER01');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
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
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('a credential SAP refuses rejects', async () => {
    connect.mockRejectedValueOnce(new Error('401'));
    await expect(connectedUserOf(headers)).rejects.toThrow('401');
    expect(getSystemInformation).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('a lookup that throws still closes its session, and the caller gets the lookup failure', async () => {
    getSystemInformation.mockRejectedValue(new Error('500'));
    await expect(connectedUserOf(headers)).rejects.toThrow('500');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('a close that fails is logged by its class, never thrown over the answer', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    disconnect.mockRejectedValue(new TypeError('SAPUSER01 secret'));
    getSystemInformation.mockResolvedValue({ userName: 'SAPUSER01' });
    expect(await connectedUserOf(headers)).toBe('SAPUSER01');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('TypeError');
    expect(String(warn.mock.calls[0][0])).not.toContain('secret');
    warn.mockRestore();
  });

  it("the server's owner lookups leave no connection open — answered, refused or failed", async () => {
    const server = new StreamableHttpServer(
      new CompositeHandlersRegistry([]),
      { settingsFor: jest.fn(), getProvider: jest.fn() },
      { host: '127.0.0.1', port: 0 },
    );
    const ownerOf = (routesToState: boolean) =>
      (
        server as unknown as {
          ownerOf: (h: unknown, d: undefined, r: boolean) => Promise<unknown>;
        }
      ).ownerOf(headers, undefined, routesToState);
    getSystemInformation.mockResolvedValue({ userName: 'SAPUSER01' });
    await ownerOf(false);
    await ownerOf(true);
    await ownerOf(true);
    connect.mockRejectedValueOnce(new Error('401'));
    expect(await ownerOf(true)).toBeNull();
    getSystemInformation.mockRejectedValueOnce(new Error('500'));
    expect(await ownerOf(true)).toBeNull();
    expect(built.length).toBe(5);
    expect(disconnect).toHaveBeenCalledTimes(built.length);
  });
});

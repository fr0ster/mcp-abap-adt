/**
 * DeletePackage takes no connection of its own from the caller: a fresh session
 * is opened from the connection that is there.
 */
const openFreshConnection = jest.fn();
const closeQuietly = jest.fn(async () => {});
jest.mock('../../lib/packageSessions', () => ({
  openFreshConnection: (...args: unknown[]) => openFreshConnection(...args),
  closeQuietly: (...args: unknown[]) => closeQuietly(...(args as [])),
}));
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getPackage: () => ({ delete: async () => ({}) }),
  }),
}));
jest.mock('../../lib/answer', () => ({
  answer: async (_o: unknown, run: () => Promise<unknown>) => run(),
}));

import {
  handleDeletePackage,
  TOOL_DEFINITION,
} from '../../handlers/package/low/handleDeletePackage';

describe('DeletePackageLow input', () => {
  it('has no connection_config, and still has force_new_connection', () => {
    const properties = TOOL_DEFINITION.inputSchema.properties as Record<
      string,
      unknown
    >;
    expect(properties).not.toHaveProperty('connection_config');
    expect(properties).toHaveProperty('force_new_connection');
  });

  it('opens the fresh connection through openFreshConnection(connection, logger)', async () => {
    const fresh = { id: 'fresh' };
    openFreshConnection.mockResolvedValue(fresh);
    const connection = { id: 'caller' } as any;
    const logger = { info: jest.fn(), warn: jest.fn() } as any;

    await handleDeletePackage({ connection, logger } as any, {
      package_name: 'p',
      force_new_connection: true,
    });

    expect(openFreshConnection).toHaveBeenCalledTimes(1);
    expect(openFreshConnection.mock.calls[0]).toEqual([connection, logger]);
    expect(closeQuietly).toHaveBeenCalled();
  });
});

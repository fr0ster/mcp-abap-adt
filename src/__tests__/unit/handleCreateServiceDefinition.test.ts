/**
 * Unit test: CreateServiceDefinition writes the source body.
 * Regression guard — the create() POST only registers the shell (metadata),
 * so the handler must lock, write, and unlock to persist the
 * `define service … { … }` source; otherwise the object is created (and, by
 * default, activated) empty. Fix round 2 restores this guard: fix round 1
 * had inverted it into a test asserting the write never happens, which is
 * never an available move — the guard is either right or ruled obsolete,
 * not flipped.
 * SAP-free via a mocked AdtClient.
 */

import { okResponse, reading, refusedResponse } from '../helpers/fakeClient';

const mockCreate = jest.fn();
const mockLock = jest.fn();
const mockUpdate = jest.fn();
const mockUnlock = jest.fn();
const mockActivate = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getServiceDefinition: () => ({
      create: mockCreate,
      lock: mockLock,
      update: mockUpdate,
      unlock: mockUnlock,
      activate: mockActivate,
    }),
  }),
}));

import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';

const ctx = { connection: {}, logger: undefined } as any;

describe('CreateServiceDefinition — the body is written under a lock, before activation', () => {
  beforeEach(() => {
    for (const m of [
      mockCreate,
      mockLock,
      mockUpdate,
      mockUnlock,
      mockActivate,
    ]) {
      m.mockReset();
    }
    mockCreate.mockResolvedValue(okResponse(reading(undefined, '', 201)));
    mockLock.mockResolvedValue(okResponse('LOCK1'));
    mockUpdate.mockResolvedValue(okResponse(reading(undefined, '', 200)));
    mockUnlock.mockResolvedValue(okResponse(undefined));
    mockActivate.mockResolvedValue(okResponse(reading({})));
  });

  it('locks, calls update() with the source_code in options, and unlocks, before create() before activation', async () => {
    const src = 'define service ZSD provider contracts { expose zi_x; }';
    const order: string[] = [];
    mockCreate.mockImplementation(async () => {
      order.push('create');
      return okResponse(reading(undefined, '', 201));
    });
    mockLock.mockImplementation(async () => {
      order.push('lock');
      return okResponse('LOCK1');
    });
    mockUpdate.mockImplementation(async () => {
      order.push('update');
      return okResponse(reading(undefined, '', 200));
    });
    mockUnlock.mockImplementation(async () => {
      order.push('unlock');
      return okResponse(undefined);
    });
    mockActivate.mockImplementation(async () => {
      order.push('activate');
      return okResponse(reading({}));
    });

    const result = await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      source_code: src,
    } as any);

    expect((result as any).isError).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockLock).toHaveBeenCalledWith({ serviceDefinitionName: 'ZSD' });
    expect(mockUpdate).toHaveBeenCalledWith(
      { serviceDefinitionName: 'ZSD', transportRequest: undefined },
      expect.objectContaining({
        sourceCode: src,
        lockHandle: 'LOCK1',
        analyse: expect.any(Function),
      }),
    );
    expect(mockUnlock).toHaveBeenCalledWith(
      { serviceDefinitionName: 'ZSD' },
      'LOCK1',
    );
    expect(order).toEqual(['create', 'lock', 'update', 'unlock', 'activate']);
  });

  it('does not lock or call update() when no source_code is given', async () => {
    await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      activate: false,
    } as any);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockLock).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUnlock).not.toHaveBeenCalled();
  });

  it('releases the lock and reports the failure when the body write is refused', async () => {
    mockUpdate.mockResolvedValue(
      refusedResponse('Object is locked by another user'),
    );

    const result: any = await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      source_code: 'define service ZSD { expose zi_x; }',
    } as any);

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Object is locked by another user',
    );
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    expect(mockActivate).not.toHaveBeenCalled();
  });
});

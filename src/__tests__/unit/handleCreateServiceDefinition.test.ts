/**
 * Unit test: CreateServiceDefinition is a bare create — no source, no lock.
 *
 * Task 20 superseded the old regression guard here. The pre-migration
 * handler ran a *second*, separate `update()` call after `create()` to
 * persist the `define service … { … }` source — a lock+write+unlock chain
 * adt-clients 18's fat `update()` did internally. adt-clients 19's `update()`
 * needs a caller-supplied lock handle (see `UpdateServiceDefinition`,
 * already migrated with `withLock` in a prior task), and this task's own
 * creates hold no lock — so `source_code` no longer reaches the wire from
 * this handler at all. This test now guards the opposite direction: passing
 * `source_code` must not make this handler call `update()`.
 * SAP-free via a mocked AdtClient.
 */

import { okResponse, reading } from '../helpers/fakeClient';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockActivate = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getServiceDefinition: () => ({
      create: mockCreate,
      update: mockUpdate,
      activate: mockActivate,
    }),
  }),
}));

import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';

const ctx = { connection: {}, logger: undefined } as any;

describe('CreateServiceDefinition — a bare create, source_code not forwarded', () => {
  beforeEach(() => {
    for (const m of [mockCreate, mockUpdate, mockActivate]) {
      m.mockReset();
    }
    mockCreate.mockResolvedValue(okResponse(reading(undefined, '', 201)));
    mockActivate.mockResolvedValue(okResponse(reading({})));
  });

  it('does not call update(), even when source_code is given', async () => {
    const src = 'define service ZSD provider contracts { expose zi_x; }';
    const result = await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      source_code: src,
      activate: false,
    } as any);

    expect((result as any).isError).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({ sourceCode: expect.anything() }),
      expect.anything(),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not call update() when no source_code is given', async () => {
    await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      activate: false,
    } as any);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('never acquires a lock (no lock/unlock member is even referenced)', async () => {
    await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      activate: false,
    } as any);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

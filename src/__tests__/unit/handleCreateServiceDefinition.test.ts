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

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import * as clients from '../../lib/clients';
import { okResponse, reading, refusedResponse } from '../helpers/fakeClient';

const mockCreate = mock.fn<(...args: any[]) => any>();
const mockLock = mock.fn<(...args: any[]) => any>();
const mockUpdate = mock.fn<(...args: any[]) => any>();
const mockUnlock = mock.fn<(...args: any[]) => any>();
const mockActivate = mock.fn<(...args: any[]) => any>();

mock.method(clients, 'createAdtClient', () => ({
  getServiceDefinition: () => ({
    create: mockCreate,
    lock: mockLock,
    update: mockUpdate,
    unlock: mockUnlock,
    activate: mockActivate,
  }),
}));

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
      m.mock.resetCalls();
      m.mock.mockImplementation(() => undefined);
    }
    mockCreate.mock.mockImplementation(async () =>
      okResponse(reading(undefined, '', 201)),
    );
    mockLock.mock.mockImplementation(async () => okResponse('LOCK1'));
    mockUpdate.mock.mockImplementation(async () =>
      okResponse(reading(undefined, '', 200)),
    );
    mockUnlock.mock.mockImplementation(async () => okResponse(undefined));
    mockActivate.mock.mockImplementation(async () => okResponse(reading({})));
  });

  it('locks, calls update() with the source_code in options, and unlocks, before create() before activation', async () => {
    const src = 'define service ZSD provider contracts { expose zi_x; }';
    const order: string[] = [];
    mockCreate.mock.mockImplementation(async () => {
      order.push('create');
      return okResponse(reading(undefined, '', 201));
    });
    mockLock.mock.mockImplementation(async () => {
      order.push('lock');
      return okResponse('LOCK1');
    });
    mockUpdate.mock.mockImplementation(async () => {
      order.push('update');
      return okResponse(reading(undefined, '', 200));
    });
    mockUnlock.mock.mockImplementation(async () => {
      order.push('unlock');
      return okResponse(undefined);
    });
    mockActivate.mock.mockImplementation(async () => {
      order.push('activate');
      return okResponse(reading({}));
    });

    const result = await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      source_code: src,
    } as any);

    assert.equal((result as any).isError, false);
    assert.equal(mockCreate.mock.callCount(), 1);
    assert.ok(
      mockLock.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], { serviceDefinitionName: 'ZSD' }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    assert.ok(
      mockUpdate.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            serviceDefinitionName: 'ZSD',
            transportRequest: undefined,
          }) &&
          isDeepStrictEqual(a[1]?.source, src) &&
          isDeepStrictEqual(a[1]?.lockHandle, 'LOCK1') &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    assert.ok(
      mockUnlock.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 3 &&
          isDeepStrictEqual(a[0], { serviceDefinitionName: 'ZSD' }) &&
          isDeepStrictEqual(a[1], 'LOCK1') &&
          typeof a[2]?.analyse === 'function',
      ),
    );
    assert.deepStrictEqual(order, [
      'create',
      'lock',
      'update',
      'unlock',
      'activate',
    ]);
  });

  it('does not lock or call update() when no source_code is given', async () => {
    await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      activate: false,
    } as any);

    assert.equal(mockCreate.mock.callCount(), 1);
    assert.equal(mockLock.mock.callCount(), 0);
    assert.equal(mockUpdate.mock.callCount(), 0);
    assert.equal(mockUnlock.mock.callCount(), 0);
  });

  it('releases the lock and reports the failure when the body write is refused', async () => {
    mockUpdate.mock.mockImplementation(async () =>
      refusedResponse('Object is locked by another user'),
    );

    const result: any = await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      source_code: 'define service ZSD { expose zi_x; }',
    } as any);

    assert.equal(result.isError, true);
    assert.equal(
      JSON.parse(result.content[0].text).message,
      'Object is locked by another user',
    );
    assert.equal(mockUnlock.mock.callCount(), 1);
    assert.equal(mockActivate.mock.callCount(), 0);
  });
});

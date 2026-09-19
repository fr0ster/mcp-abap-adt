/**
 * Pins the restored long-polling wait's position for the nine handlers
 * whose call order was not otherwise asserted (a tenth, `CreateDomain`, is
 * already pinned by `highTierLocking.test.ts`'s lifecycle-order test).
 *
 * Deleting the wait from any handler below turns its test red: each
 * asserts the full call order, including that the wait sits immediately
 * before the call it protects — `check` for the two lifecycle creates
 * (`check` is the first call after the write that reads it back), or
 * `activate` for every plain update (there is no separate check call for
 * the wait to precede).
 */
import { handleCreateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleCreateDataElement } from '../../handlers/data_element/high/handleCreateDataElement';
import { handleUpdateDataElement } from '../../handlers/data_element/high/handleUpdateDataElement';
import { handleCreateMetadataExtension } from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import { handleUpdateFunctionModule } from '../../handlers/function/high/handleUpdateFunctionModule';
import { handleUpdateServiceDefinition } from '../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

/** No optional field is given in any test below, so no patcher needs a real
 * document to patch — this satisfies `extractXmlString` and nothing more. */
const MINIMAL_XML = '<x adtcore:description="d"></x>';

/** `CreateDataElement` forces `type_kind`/`data_type`/`length`/`decimals`
 * defaults even when the caller gives none, so its patch always touches
 * these elements — unlike `UpdateDataElement`, which only patches what the
 * caller named. */
const DATAELEMENT_CREATE_XML =
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZDT_X" ' +
  'adtcore:description="before">' +
  '<dtel:typeKind>domain</dtel:typeKind>' +
  '<dtel:typeName></dtel:typeName>' +
  '<dtel:dataType>CHAR</dtel:dataType>' +
  '<dtel:dataTypeLength>000010</dtel:dataTypeLength>' +
  '<dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>' +
  '</blue:wbobj>';

describe('the restored long-polling wait: call order, per handler', () => {
  it('BehaviorDefinition create: create, lock, check, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      create: async () => {
        order.push('create');
        return okResponse(reading(undefined, '', 200));
      },
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      read: async () => {
        order.push('wait');
        return okResponse(reading(undefined));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleCreateBehaviorDefinition(context as any, {
      name: 'ZI_X',
      package_name: 'ZP',
      root_entity: 'ZI_ROOT',
      implementation_type: 'Managed',
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual([
      'create',
      'lock',
      'check',
      'unlock',
      'wait',
      'activate',
    ]);
  });

  it('BehaviorDefinition update: lock, update, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      update: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      read: async () => {
        order.push('wait');
        return okResponse(reading(undefined));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleUpdateBehaviorDefinition(context as any, {
      name: 'ZI_X',
      source_code: 'x',
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual(['lock', 'update', 'unlock', 'wait', 'activate']);
  });

  it('MetadataExtension create: create, lock, check, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      create: async () => {
        order.push('create');
        return okResponse(reading(undefined, '', 200));
      },
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      read: async () => {
        order.push('wait');
        return okResponse(reading(undefined));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleCreateMetadataExtension(context as any, {
      name: 'ZI_X',
      package_name: 'ZP',
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual([
      'create',
      'lock',
      'check',
      'unlock',
      'wait',
      'activate',
    ]);
  });

  it('MetadataExtension update: lock, update, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      update: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      read: async () => {
        order.push('wait');
        return okResponse(reading(undefined));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleUpdateMetadataExtension(context as any, {
      name: 'ZI_X',
      source_code: 'x',
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual(['lock', 'update', 'unlock', 'wait', 'activate']);
  });

  it('DataElement create: validate, create, lock, read, update, unlock, wait, check, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      validate: async () => {
        order.push('validate');
        return okResponse(reading({}));
      },
      create: async () => {
        order.push('create');
        return okResponse(reading(undefined, '', 200));
      },
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      readMetadata: async () => {
        order.push('read');
        return okResponse(reading(DATAELEMENT_CREATE_XML));
      },
      updateMetadata: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleCreateDataElement(context as any, {
      data_element_name: 'ZDT_X',
      package_name: 'ZP',
    });
    expect(result.isError).toBe(false);
    // The second 'read' is the wait — it sits right before 'check', the
    // first call after the write that reads it back, not after 'check'.
    expect(order).toEqual([
      'validate',
      'create',
      'lock',
      'read',
      'update',
      'unlock',
      'read',
      'check',
      'activate',
    ]);
  });

  it('DataElement update: lock, read, update, check, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      readMetadata: async () => {
        order.push('read');
        return okResponse(reading(MINIMAL_XML));
      },
      updateMetadata: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleUpdateDataElement(context as any, {
      data_element_name: 'ZDT_X',
      package_name: 'ZP',
    });
    expect(result.isError).toBe(false);
    // The second 'read' is the wait, between 'unlock' and 'activate' — check
    // already ran earlier, still under the lock.
    expect(order).toEqual([
      'lock',
      'read',
      'update',
      'check',
      'unlock',
      'read',
      'activate',
    ]);
  });

  it('Domain update: lock, read, update, check, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      readMetadata: async () => {
        order.push('read');
        return okResponse(reading(MINIMAL_XML));
      },
      updateMetadata: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'ZD',
      package_name: 'ZP',
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual([
      'lock',
      'read',
      'update',
      'check',
      'unlock',
      'read',
      'activate',
    ]);
  });

  it('FunctionModule update: lock, update, check, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      update: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      read: async () => {
        order.push('wait');
        return okResponse(reading(undefined));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleUpdateFunctionModule(context as any, {
      function_group_name: 'ZFG_X',
      function_module_name: 'Z_FM_X',
      source_code: 'x',
      activate: true,
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual([
      'lock',
      'update',
      'check',
      'unlock',
      'wait',
      'activate',
    ]);
  });

  it('ServiceDefinition update: lock, update, check, unlock, wait, activate', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('L1');
      },
      update: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      read: async () => {
        order.push('wait');
        return okResponse(reading(undefined));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
    });
    const result: any = await handleUpdateServiceDefinition(context as any, {
      service_definition_name: 'ZSD_X',
      source_code: 'x',
    });
    expect(result.isError).toBe(false);
    expect(order).toEqual([
      'lock',
      'update',
      'check',
      'unlock',
      'wait',
      'activate',
    ]);
  });
});

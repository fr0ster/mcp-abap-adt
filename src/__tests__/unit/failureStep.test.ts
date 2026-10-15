/**
 * A handler never rewrites the method's error; it adds the step where the
 * error arose. SAP's refusal reaches the consumer as the strategy made it —
 * message, origin, status, `adt_type`, raw body — with `step` beside it, and
 * is never turned into an empty result, a `null`, a warning or "not found".
 * A source or level that is not there (`404`) stays what it was.
 */

import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents';
import { handleDescribeByList } from '../../handlers/system/readonly/handleDescribeByList';
import { handleGetAbapSystemSymbols } from '../../handlers/system/readonly/handleGetAbapSystemSymbols';
import {
  createSourceReaderDeps,
  readSourceUnits,
} from '../../lib/search-source/sourceReader';
import { methodFailureOf } from '../../lib/strategies/step';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

const DOCUMENT =
  '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message>No authorization</message></exc:exception>';

/** A refusal SAP answered: a status and its document. */
const forbidden = (message = 'No authorization') =>
  refusedResponse(message, {
    adtType: 'ExceptionResourceNoAuthorization',
    response: { status: 403, data: DOCUMENT },
  } as Partial<IAdtError>);

const notThere = () =>
  refusedResponse('Resource does not exist', {
    adtType: 'ExceptionResourceNotFound',
    response: { status: 404, data: '' },
  } as Partial<IAdtError>);

/** The method's error as `answer()` renders it, with the step. */
const expectedPayload = (step: string, message = 'No authorization') => ({
  message,
  origin: 'refusal',
  step,
  status: 403,
  adt_type: 'ExceptionResourceNoAuthorization',
  raw_body: DOCUMENT,
});

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

describe('a multi-step handler adds the step that failed', () => {
  it('UpdateClass refused at the lock answers the lock error with step lock, and nothing is written', async () => {
    const update = jest.fn(async () => okResponse(reading('')));
    fakeClient = fakeClientOf({ lock: async () => forbidden(), update });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(expectedPayload('lock'));
    expect(update).not.toHaveBeenCalled();
  });

  it('UpdateClass refused at the update answers the update error with step update, and unlocks', async () => {
    const unlock = jest.fn(async () => okResponse(reading('')));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('HANDLE'),
      update: async () => forbidden('Object is locked by another user'),
      unlock,
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(
      expectedPayload('update', 'Object is locked by another user'),
    );
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('a throw inside a step is the method failure with the step, not a SAP answer', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('HANDLE'),
      update: async () => {
        throw new Error('could not parse the answer');
      },
      unlock: async () => okResponse(reading('')),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    const payload = payloadOf(result);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toBe('could not parse the answer');
    expect(payload.step).toBe('update');
    expect(payload.origin).toBeUndefined();
    expect(payload.status).toBeUndefined();
  });
});

describe('a refusal is not swallowed', () => {
  it('GetPackageContents: a refused level is the method error with its step, not an empty list', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => forbidden() });
    const result: any = await handleGetPackageContents(context as any, {
      package_name: 'ZPKG',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(
      expectedPayload('read package node structure'),
    );
  });

  it('GetPackageContents: a level that is not there stays empty', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => notThere() });
    const result: any = await handleGetPackageContents(context as any, {
      package_name: 'ZPKG',
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it('GetEnhancements: a refused includes walk is the method error with its step, not an empty list', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => forbidden() });
    const connection = {
      async makeAdtRequest() {
        return {
          status: 200,
          data: '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>',
        };
      },
    };
    const result: any = await handleGetEnhancements(
      { connection, logger: undefined } as any,
      { object_name: 'ZPROG', object_type: 'program', include_nested: true },
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.partial_result).toBe(true);
    expect(body.error).toEqual(expectedPayload('read node structure'));
  });

  it('SearchSource: a refused source read is the method error with its step, not a skipped source', async () => {
    fakeClient = fakeClientOf({ read: async () => forbidden() });
    const deps = createSourceReaderDeps(context as any);
    const units = readSourceUnits(deps, {
      devclass: 'ZPKG',
      object_type: 'PROG',
      object_name: 'ZPROG',
    } as any);
    const thrown = await units.next().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(methodFailureOf(thrown)).toEqual({
      message: 'No authorization',
      origin: 'refusal',
      adtType: 'ExceptionResourceNoAuthorization',
      response: { status: 403, data: DOCUMENT },
      step: 'read program',
    });
  });

  it('SearchSource: a source that is not there is skipped as before', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const deps = createSourceReaderDeps(context as any);
    const units = readSourceUnits(deps, {
      devclass: 'ZPKG',
      object_type: 'PROG',
      object_name: 'ZPROG',
    } as any);
    expect((await units.next()).done).toBe(true);
  });

  it('DescribeByList: a refused search is its error with the step, not an object skipped', async () => {
    fakeClient = fakeClientOf({ search: async () => forbidden() });
    const result: any = await handleDescribeByList(context as any, {
      objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }],
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(expectedPayload('search ZCL_X'));
  });

  it('GetAbapSystemSymbols: a refused class read is its error with the step, not "not found"', async () => {
    fakeClient = fakeClientOf({ read: async () => forbidden() });
    const result: any = await handleGetAbapSystemSymbols(context as any, {
      code: 'CLASS zcl_x DEFINITION.\nENDCLASS.',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(expectedPayload('read class ZCL_X'));
  });

  it('GetAbapSystemSymbols: a class that is not there stays "not found"', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const result: any = await handleGetAbapSystemSymbols(context as any, {
      code: 'CLASS zcl_x DEFINITION.\nENDCLASS.',
    });
    expect(result.isError).toBe(false);
    const symbols = result.content[0].json.symbols;
    const zcl = symbols.find((s: any) => s.name.toUpperCase() === 'ZCL_X');
    expect(zcl.systemInfo).toEqual({
      exists: false,
      error: 'Class not found in SAP system',
    });
  });
});

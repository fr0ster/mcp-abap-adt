/**
 * fr0ster/mcp-abap-adt#314, the server's half.
 *
 * A cleanup UNLOCK that fails — SAP refused it, or the client threw
 * (`socket hang up`) — says plainly that the object may be left locked: the
 * handle, the object and fixed words, beside the fields the carrier already
 * had. And a save SAP refused with `CTS_WBO_API` 019 ("already locked in
 * request …") names that request as a hint; nothing is resent.
 */
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleUpdateLocalTestClass } from '../../handlers/class/high/handleUpdateLocalTestClass';
import { handleUpdateUnderLock } from '../../handlers/common/low/handleUpdateUnderLock';
import { TRANSPORT_HINT_WORDS, transportHint } from '../../lib/answer';
import { safeCleanup } from '../../lib/strategies/safeFields';
import { leftLockedWarning } from '../../lib/strategies/withLock';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

const ARGS = { class_name: 'zcl_obj', test_class_code: 'x' };

const WARNING_HANG_UP =
  'the object may be left locked: the unlock failed (socket hang up); it is released when the SAP session ends (logoff) or by its owner';

const ALREADY_LOCKED = {
  type: 'E',
  text: 'Object LIMU CINC OBJ is already locked in request SIDK900001 of user SAPUSER01',
  t100: {
    id: 'CTS_WBO_API',
    no: '019',
    values: ['LIMU CINC OBJ', 'SIDK900001', 'SAPUSER01'],
  },
};

const saveRefused = (messages: unknown[]) =>
  refusedResponse('Save failed', {
    adtType: 'ExceptionResourceSaveFailure',
    response: { status: 500, data: '<exc/>' },
    messages,
  } as unknown as Partial<IAdtError>);

describe('a cleanup unlock that fails says the object may be left locked', () => {
  it('a THROWN unlock after a refused save: leftLocked, handle, object, the fixed words, beside the old fields', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => saveRefused([]),
      unlock: async () => {
        throw new Error('socket hang up');
      },
    });
    const result: any = await handleUpdateLocalTestClass(context as any, ARGS);
    expect(result.isError).toBe(true);
    const { cleanup } = payloadOf(result);
    expect(cleanup).toEqual({
      error: 'client_threw',
      message: 'socket hang up',
      failures: [
        { error: 'client_threw', message: 'socket hang up', step: 'unlock' },
      ],
      leftLocked: true,
      lockHandle: 'handle-1',
      object: { type: 'CLASS', name: 'ZCL_OBJ' },
      warning: WARNING_HANG_UP,
    });
  });

  it('a REFUSED unlock after a refused save: the same four, its own reason in the words', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => saveRefused([]),
      unlock: async () => refusedResponse('Unlock refused'),
    });
    const result: any = await handleUpdateLocalTestClass(context as any, ARGS);
    const { cleanup } = payloadOf(result);
    expect(cleanup).toMatchObject({
      message: 'Unlock refused',
      origin: 'refusal',
      leftLocked: true,
      lockHandle: 'handle-1',
      object: { type: 'CLASS', name: 'ZCL_OBJ' },
      warning: leftLockedWarning('Unlock refused'),
    });
    expect(cleanup.failures).toHaveLength(1);
  });

  it('a REFUSED unlock after a landed save: the success stands, and says the object may be left locked', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedResponse('Unlock refused'),
    });
    const result: any = await handleUpdateLocalTestClass(context as any, ARGS);
    expect(result.isError).toBe(false);
    expect(payloadOf(result).cleanup).toMatchObject({
      leftLocked: true,
      lockHandle: 'handle-1',
      object: { type: 'CLASS', name: 'ZCL_OBJ' },
    });
  });

  it('an unlock that answers: no cleanup at all', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => saveRefused([]),
      unlock: async () => okResponse(undefined),
    });
    const result: any = await handleUpdateLocalTestClass(context as any, ARGS);
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload.cleanup).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('leftLocked');
  });
});

describe('safeCleanup passes the left-locked fields by their own types only', () => {
  const base = { message: 'socket hang up', error: 'client_threw' };

  it('copies each well-typed field', () => {
    expect(
      safeCleanup({
        ...base,
        leftLocked: true,
        lockHandle: 'handle-1',
        object: { type: 'CLASS', name: 'OBJ' },
        warning: WARNING_HANG_UP,
      }),
    ).toEqual({
      ...base,
      leftLocked: true,
      lockHandle: 'handle-1',
      object: { type: 'CLASS', name: 'OBJ' },
      warning: WARNING_HANG_UP,
    });
  });

  it('drops each field of the wrong type, and everything the object carries beyond its two strings', () => {
    expect(
      safeCleanup({
        ...base,
        leftLocked: 'true',
        lockHandle: 42,
        object: { type: 'CLASS', name: 'OBJ', headers: { authorization: 'x' } },
        warning: { text: 'x' },
        cookies: 'sap-contextid=secret',
      }),
    ).toEqual({ ...base, object: { type: 'CLASS', name: 'OBJ' } });
  });

  it.each([
    ['a missing name', { type: 'CLASS' }],
    ['an empty type', { type: '', name: 'OBJ' }],
    ['a numeric name', { type: 'CLASS', name: 7 }],
    ['a string', 'CLASS OBJ'],
    ['null', null],
  ])('drops an object with %s', (_label, object) => {
    expect(safeCleanup({ ...base, object })).toEqual(base);
  });

  it('drops leftLocked false and an empty handle', () => {
    expect(safeCleanup({ ...base, leftLocked: false, lockHandle: '' })).toEqual(
      base,
    );
  });
});

describe('a save refused with CTS_WBO_API 019 names the request to pass', () => {
  it('UpdateLocalTestClass: hint { transport_request, text } beside the messages, nothing resent', async () => {
    const update = jest.fn(async () => saveRefused([ALREADY_LOCKED]));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update,
      unlock: async () => okResponse(undefined),
    });
    const result: any = await handleUpdateLocalTestClass(context as any, ARGS);
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload.hint).toEqual({
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
    expect(payload.messages).toHaveLength(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('the compact update under a held lock answers the same hint', async () => {
    fakeClient = fakeClientOf({
      update: async () => saveRefused([ALREADY_LOCKED]),
    });
    const result: any = await handleUpdateUnderLock(
      // No held-lock port: the handle is taken as held here.
      context as any,
      {
        object_type: 'LOCAL_TEST_CLASS',
        lock_handle: 'handle-1',
        class_name: 'zcl_obj',
        test_class_code: 'x',
      },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result).hint).toEqual({
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });

  it('no hint for another error', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () =>
        saveRefused([
          {
            type: 'E',
            text: 'Object is already locked in request SIDK900001',
            t100: { id: 'CTS_WBO_API', no: '020', values: ['SIDK900001'] },
          },
        ]),
      unlock: async () => okResponse(undefined),
    });
    const result: any = await handleUpdateLocalTestClass(context as any, ARGS);
    expect(result.isError).toBe(true);
    expect(payloadOf(result).hint).toBeUndefined();
  });

  it.each([
    ['another message class', { id: 'SADT_RESOURCE', no: '019' }],
    ['another number', { id: 'CTS_WBO_API', no: '018' }],
  ])('transportHint: none for %s', (_label, key) => {
    expect(
      transportHint([
        {
          type: 'E',
          text: 'x',
          t100: { ...key, values: ['SIDK900001'] },
        },
      ]),
    ).toBeUndefined();
  });

  it.each([
    ['no values', undefined],
    ['no value shaped as a request', ['LIMU CINC OBJ', 'SAPUSER01']],
    ['a task-length value', ['SIDK90000']],
    ['a lower-case value', ['sidk900001']],
    ['a lower-case system id', ['sidK900001']],
    ['no K after the system id', ['SIDX900001']],
    ['a letter among the digits', ['SIDK90000A']],
  ])('transportHint: none with %s', (_label, values) => {
    expect(
      transportHint([
        {
          type: 'E',
          text: 'x',
          t100: {
            id: 'CTS_WBO_API',
            no: '019',
            ...(values ? { values } : {}),
          },
        },
      ]),
    ).toBeUndefined();
  });

  it('transportHint: the request wherever it stands among the values', () => {
    expect(
      transportHint([
        {
          type: 'E',
          text: 'x',
          t100: {
            id: 'CTS_WBO_API',
            no: '019',
            values: ['SAPUSER01', 'R3TR PROG OBJ', 'SIDK900002'],
          },
        },
      ])?.transport_request,
    ).toBe('SIDK900002');
  });
});

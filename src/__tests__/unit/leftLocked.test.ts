/**
 * fr0ster/mcp-abap-adt#314, the server's half.
 *
 * A cleanup UNLOCK that fails — SAP refused it, or the client threw
 * (`socket hang up`) — says plainly that the object may be left locked: the
 * handle, the object and fixed words, beside the fields the carrier already
 * had. And a save SAP refused with `CTS_WBO_API` 019 or 020 ("already locked in
 * request …") names that request as a hint; nothing is resent.
 */
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleUpdateLocalTestClass } from '../../handlers/class/high/handleUpdateLocalTestClass';
import { handleUpdateUnderLock } from '../../handlers/common/low/handleUpdateUnderLock';
import {
  attemptedRequest,
  TRANSPORT_ENTRY_HELD_WORDS,
  TRANSPORT_HINT_WORDS,
  TRANSPORT_HINT_WORDS_020,
  transportHint,
} from '../../lib/answer';
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

const saveRefused = (messages: unknown[], url?: string) =>
  refusedResponse('Save failed', {
    adtType: 'ExceptionResourceSaveFailure',
    response: { status: 500, data: '<exc/>' },
    messages,
    ...(url !== undefined ? { request: { method: 'PUT', url } } : {}),
  } as unknown as Partial<IAdtError>);

/**
 * The include's PUT as the client writes its URL (`writeQuery`): the lock
 * handle, then `corrNr` when the call was given a request.
 */
const includeUrl = (config: unknown) => {
  const sent = (config as { transportRequest?: string }).transportRequest;
  return `/sap/bc/adt/oo/classes/zcl_obj/includes/testclasses?lockHandle=handle-1${sent ? `&corrNr=${encodeURIComponent(sent)}` : ''}`;
};

/** A save refused with these messages, its request built from the call's config. */
const saveRefusedAsSent =
  (messages: unknown[]) =>
  async (...args: unknown[]) =>
    saveRefused(messages, includeUrl(args[0]));

describe('a cleanup unlock that fails says the object may be left locked', () => {
  it('a THROWN unlock after a refused save: left_locked, handle, object, the fixed words, beside the old fields', async () => {
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
      left_locked: true,
      lock_handle: 'handle-1',
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
      left_locked: true,
      lock_handle: 'handle-1',
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
      left_locked: true,
      lock_handle: 'handle-1',
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
    expect(JSON.stringify(payload)).not.toContain('left_locked');
  });
});

describe('safeCleanup passes the left-locked fields by their own types only', () => {
  const base = { message: 'socket hang up', error: 'client_threw' };

  it('copies each well-typed field', () => {
    expect(
      safeCleanup({
        ...base,
        left_locked: true,
        lock_handle: 'handle-1',
        object: { type: 'CLASS', name: 'OBJ' },
        warning: WARNING_HANG_UP,
      }),
    ).toEqual({
      ...base,
      left_locked: true,
      lock_handle: 'handle-1',
      object: { type: 'CLASS', name: 'OBJ' },
      warning: WARNING_HANG_UP,
    });
  });

  it('drops each field of the wrong type, and everything the object carries beyond its two strings', () => {
    expect(
      safeCleanup({
        ...base,
        left_locked: 'true',
        lock_handle: 42,
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

  it('drops left_locked false and an empty handle', () => {
    expect(
      safeCleanup({ ...base, left_locked: false, lock_handle: '' }),
    ).toEqual(base);
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
            t100: { id: 'CTS_WBO_API', no: '021', values: ['SIDK900001'] },
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
    ['the number after 020', { id: 'CTS_WBO_API', no: '021' }],
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

describe('a save refused with CTS_WBO_API 020 (a task passed) names the request that holds the object', () => {
  const HELD_BY_REQUEST = {
    type: 'E',
    text: 'Object R3TR PROG OBJ is already locked in request SIDK900003',
    t100: {
      id: 'CTS_WBO_API',
      no: '020',
      values: ['R3TR PROG OBJ', 'SIDK900003'],
    },
  };

  it('UpdateLocalTestClass: hint with the request and the 020 words', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: saveRefusedAsSent([HELD_BY_REQUEST]),
      unlock: async () => okResponse(undefined),
    });
    const result: any = await handleUpdateLocalTestClass(context as any, {
      ...ARGS,
      transport_request: 'SIDK900004',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result).hint).toEqual({
      transport_request: 'SIDK900003',
      text: TRANSPORT_HINT_WORDS_020,
    });
  });

  it('transportHint: the request wherever it stands, with the 020 words, not the 019 ones', () => {
    const hint = transportHint([
      {
        type: 'E',
        text: 'x',
        t100: {
          id: 'CTS_WBO_API',
          no: '020',
          values: ['SIDK90000', 'SIDK900005', 'R3TR PROG OBJ'],
        },
      },
    ]);
    expect(hint).toEqual({
      transport_request: 'SIDK900005',
      text: TRANSPORT_HINT_WORDS_020,
    });
    expect(TRANSPORT_HINT_WORDS_020).not.toBe(TRANSPORT_HINT_WORDS);
  });

  it.each([
    ['no values', undefined],
    ['no value shaped as a request', ['R3TR PROG OBJ', 'SAPUSER01']],
    ['a task-length value', ['SIDK90000']],
  ])('transportHint: none with %s', (_label, values) => {
    expect(
      transportHint([
        {
          type: 'E',
          text: 'x',
          t100: {
            id: 'CTS_WBO_API',
            no: '020',
            ...(values ? { values } : {}),
          },
        },
      ]),
    ).toBeUndefined();
  });
});

describe('the hint offers only a request the call did not send', () => {
  const lockedIn = (no: string, request: string) => ({
    type: 'E',
    text: `Object LIMU CINC OBJ is already locked in request ${request}`,
    t100: { id: 'CTS_WBO_API', no, values: ['LIMU CINC OBJ', request] },
  });

  const update = (messages: unknown[], transport_request?: string) => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: saveRefusedAsSent(messages),
      unlock: async () => okResponse(undefined),
    });
    return handleUpdateLocalTestClass(context as any, {
      ...ARGS,
      ...(transport_request !== undefined ? { transport_request } : {}),
    });
  };

  it('none sent: the request SAP names, to pass', async () => {
    const result: any = await update([lockedIn('019', 'SIDK900001')]);
    expect(payloadOf(result).hint).toEqual({
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });

  it('another request sent: the request SAP names, to pass', async () => {
    const result: any = await update(
      [lockedIn('019', 'SIDK900001')],
      'SIDK900009',
    );
    expect(payloadOf(result).hint).toEqual({
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });

  it.each(['019', '020'])(
    '%s naming the request sent: the entry-held words, no transport_request',
    async (no) => {
      const result: any = await update(
        [lockedIn(no, 'SIDK900001')],
        'SIDK900001',
      );
      const { hint } = payloadOf(result);
      expect(hint).toEqual({ text: TRANSPORT_ENTRY_HELD_WORDS });
      expect(hint).not.toHaveProperty('transport_request');
    },
  );

  it('the request sent in lower case is the same request', async () => {
    const result: any = await update(
      [lockedIn('019', 'SIDK900001')],
      'sidk900001',
    );
    expect(payloadOf(result).hint).toEqual({
      text: TRANSPORT_ENTRY_HELD_WORDS,
    });
  });

  /**
   * The case `handleRemoveTransportObject` documents: a deleted object's CTS
   * entry stays on its request, and creating the name again is refused with
   * `CTS_WBO_API` 019 even when that same request is passed.
   */
  it('re-creating a deleted object with the request that still holds its entry: no retry offered', async () => {
    const create = jest.fn(async (config: unknown) =>
      refusedResponse('Create failed', {
        response: { status: 400, data: '<exc/>' },
        request: {
          method: 'POST',
          url: `/sap/bc/adt/oo/classes?corrNr=${(config as { transportRequest: string }).transportRequest}`,
        },
        messages: [
          {
            type: 'E',
            text: 'Object R3TR CLAS OBJ is already locked in request SIDK900001',
            t100: {
              id: 'CTS_WBO_API',
              no: '019',
              values: ['R3TR CLAS OBJ', 'SIDK900001', 'SAPUSER01'],
            },
          },
        ],
      } as unknown as Partial<IAdtError>),
    );
    fakeClient = fakeClientOf({ create });
    const result: any = await handleCreateClass(context as any, {
      class_name: 'zcl_obj',
      package_name: 'PKG',
      transport_request: 'SIDK900001',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result).hint).toEqual({
      text: TRANSPORT_ENTRY_HELD_WORDS,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no request', undefined, undefined],
    ['a URL with no query', { url: '/sap/bc/adt/oo/classes' }, undefined],
    ['a URL with no corrNr', { url: '/x?lockHandle=h' }, undefined],
    ['corrNr outside a query', { url: '/x&corrNr=SIDK900001' }, undefined],
    ['one corrNr', { url: '/x?lockHandle=h&corrNr=SIDK900001' }, 'SIDK900001'],
    ['an encoded corrNr', { url: '/x?corrNr=SID%4B900001' }, 'SIDK900001'],
    [
      'two corrNr',
      { url: '/x?corrNr=SIDK900001&corrNr=SIDK900002' },
      undefined,
    ],
    ['an empty corrNr', { url: '/x?corrNr=' }, undefined],
  ])('attemptedRequest: %s', (_label, request, expected) => {
    expect(attemptedRequest(request)).toBe(expected);
  });
});

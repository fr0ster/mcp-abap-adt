/**
 * An atomic write whose unlock is refused: the lock is still held, and the
 * consumer gets the unlock's error as the method returned it — status, code,
 * `adt_type`, T100 messages, raw body — with the step `unlock`, in `cleanup`.
 * A credential failure on the unlock ends the call: it is the answer, as it
 * came (adt-clients 33 rejects with it; nothing after it is sent).
 */
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAuthorization"/>' +
  '<message lang="EN">no authorization to unlock</message></exc:exception>';

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

const UNLOCK_ENTRY = {
  step: 'unlock',
  origin: 'refusal',
  status: 403,
  code: 'S/123',
  adt_type: 'ExceptionResourceNoAuthorization',
  raw_body: DOCUMENT,
  messages: [
    {
      type: 'E',
      text: 'no authorization to unlock',
      t100: { id: 'S1', no: '012', values: ['ZPKG'] },
    },
  ],
};

describe('an atomic write whose unlock is refused (a client double)', () => {
  const context = {
    connection: { getSessionId: () => null } as any,
    logger: undefined,
  };
  const refusedUnlock = () =>
    refusedResponse('Unlock refused', {
      code: 'S/123',
      adtType: 'ExceptionResourceNoAuthorization',
      response: { status: 403, data: DOCUMENT },
      messages: UNLOCK_ENTRY.messages,
    } as unknown as Partial<IAdtError>);

  it('after a successful write: the success stands, cleanup carries the whole unlock error with step unlock', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedUnlock(),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    expect(result.isError).toBe(false);
    const payload = payloadOf(result);
    expect(payload.cleanup.message).toBe('Unlock refused');
    expect(payload.cleanup.failures).toEqual([
      { message: 'Unlock refused', ...UNLOCK_ENTRY },
    ]);
  });

  it('after a failed write: the write error as it is, cleanup carries the whole unlock error with step unlock', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => refusedResponse('Update refused'),
      unlock: async () => refusedUnlock(),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload.message).toBe('Update refused');
    expect(payload.cleanup.failures).toEqual([
      { message: 'Unlock refused', ...UNLOCK_ENTRY },
    ]);
  });

  it('a credential failure on the unlock reaches the consumer as it came', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => {
        throw new AuthProviderFailure(
          authError['credential-refused']({ credential: 'token' }),
        );
      },
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload.error).toBe('authentication_failed');
    expect(payload.cleanup).toBeUndefined();
  });
});

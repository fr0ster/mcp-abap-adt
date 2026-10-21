/**
 * GetAbapSystemSymbols resolves each symbol through a delegated read. A throw
 * while resolving one is that symbol's failure in the shape of every other
 * (`client_threw` with the step, or the carried error as it is) — never its
 * message as `systemInfo.error` text; a thrown credential failure is every
 * symbol's, so the call ends with it and no further symbol is read; a throw
 * outside the walk is the method's own failure, not bare text.
 */

import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import { handleGetAbapSystemSymbols } from '../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { createBatchAvailability } from '../../lib/batch/availability';
import { okResponse, reading } from '../helpers/fakeClient';

/** What `createAdtClient` does for the delegated reads: throw, or answer. */
let clientOf: () => unknown;
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => clientOf(),
}));

const payloadOf = (result: any) => JSON.parse(result.content[0].text);
const CODE =
  'CLASS zcl_x DEFINITION.\nENDCLASS.\nCLASS zcl_y DEFINITION.\nENDCLASS.';
const symbolNamed = (result: any, name: string) =>
  result.content[0].json.symbols.find(
    (s: any) => s.name.toUpperCase() === name,
  );

describe('GetAbapSystemSymbols: a delegated read that threw', () => {
  it("a throw of our own is that symbol's client_threw with its step; the others are resolved", async () => {
    let calls = 0;
    clientOf = () => {
      calls++;
      if (calls === 1) throw new TypeError('boom');
      return new Proxy(
        {},
        {
          get: () => () => ({
            read: async () => okResponse(reading('CLASS zcl_y.')),
          }),
        },
      );
    };
    const result: any = await handleGetAbapSystemSymbols(
      { connection: {} as any, logger: undefined } as any,
      { code: CODE },
    );
    expect(result.isError).toBe(false);
    const x = symbolNamed(result, 'ZCL_X');
    expect(x.error).toEqual({
      error: 'client_threw',
      message: 'boom',
      step: 'read class',
    });
    expect(x.systemInfo).toBeUndefined();
    expect(symbolNamed(result, 'ZCL_Y').systemInfo.exists).toBe(true);
  });

  it('a thrown credential failure ends the call as it came; no further symbol is read', async () => {
    let calls = 0;
    clientOf = () => {
      calls++;
      throw new AuthProviderFailure(
        authError['credential-refused']({ credential: 'token' }),
      );
    };
    // The sequential version, one symbol after another: a destination known
    // to have no communication batch. (The batched version records every
    // symbol's read in one envelope: `unit/batch/objectLists.test.ts`.)
    const notServed = createBatchAvailability();
    notServed.noteOuterStatus(404);
    const result: any = await handleGetAbapSystemSymbols(
      {
        connection: {} as any,
        logger: undefined,
        batchAvailability: notServed,
      } as any,
      { code: CODE },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(calls).toBe(1);
  });
});

describe('GetAbapSystemSymbols: a throw outside the walk', () => {
  it("is the method's own failure, client_threw, not bare text", async () => {
    const logger = {
      debug: () => {
        throw new Error('logger down');
      },
      error: () => undefined,
    };
    const result: any = await handleGetAbapSystemSymbols(
      { connection: {} as any, logger } as any,
      { code: CODE },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      error: 'client_threw',
      tool: 'GetAbapSystemSymbols',
      message: 'logger down',
    });
  });
});

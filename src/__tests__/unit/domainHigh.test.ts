import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import { fakeClientOf, okResponse } from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

/**
 * Fix round 3, task 14. `handleUpdateDomain.ts` (high) is not this cluster's
 * family, but it carried the exact mirror of the defect this task fixed
 * across class/interface/behavior_definition/behavior_implementation:
 * `AdtDomain.updateMetadata()`'s shipped body reads `config.document` only
 * and never `options.xmlContent` — verified against `AdtDomain.js` and
 * `core/domain/update.js`. This file exists only to pin that one request
 * shape; it does not attempt to cover the rest of this handler's chain
 * (lock, check, long-polling read, activate), per instruction to keep the
 * change to the channel and not restructure the handler.
 */
describe('UpdateDomain (high) — updateMetadata request shape', () => {
  it('passes the patched document via config.document, and no stray xmlContent survives in options', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;

    fakeClient = fakeClientOf({
      lock: async () => okResponse('LOCK123'),
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(undefined);
      },
      check: async () => okResponse(undefined),
      unlock: async () => okResponse(undefined),
    });

    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      package_name: 'ZP',
      description: 'after',
      // Skips the activate() call this handler makes by default, which this
      // test's fake client does not stub — out of scope for what this test
      // asserts.
      activate: false,
    });

    expect(result.isError).toBe(false);

    expect(updateCall?.config).toEqual({
      domainName: 'ZD',
      document: expect.stringContaining('adtcore:description="after"'),
    });
    expect(updateCall?.options).toEqual({
      lockHandle: 'LOCK123',
      analyse: analyseException,
    });
    expect(
      (updateCall?.options as { xmlContent?: unknown })?.xmlContent,
    ).toBeUndefined();
  });
});

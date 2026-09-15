import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

/**
 * Fix round 3, task 14, carried forward by task 19's `withLock` migration.
 * `handleUpdateDomain.ts` (high) carried the exact mirror of the defect
 * task 14 fixed across class/interface/behavior_definition/
 * behavior_implementation: `AdtDomain.updateMetadata()`'s shipped body reads
 * `config.document` only and never `options.xmlContent` — verified against
 * `AdtDomain.js` and `core/domain/update.js`. This file pins that one
 * request shape, now through the `withLock`-held read-modify-write task 19
 * introduced (the pre-write/post-unlock syntax checks and the long-polling
 * read are gone from the handler as of that task).
 */
describe('UpdateDomain (high) — updateMetadata request shape', () => {
  it('passes the patched document via config.document, and no stray xmlContent survives in options', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;

    fakeClient = fakeClientOf({
      lock: async () => okResponse('LOCK123'),
      readMetadata: async () => okResponse(reading(currentXml)),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(reading(undefined, '', 200));
      },
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
      packageName: 'ZP',
      transportRequest: undefined,
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

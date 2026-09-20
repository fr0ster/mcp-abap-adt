import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

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
 * request shape, now through the `withLock`-held read-modify-write-check
 * task 19 introduced.
 *
 * `config.packageName` is deliberately absent from the expectation below:
 * the shipped `updateDomain()` wire function never reads it (see the
 * handler's own doc comment), so it is not sent.
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
      check: async () => okResponse(reading({})),
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

/**
 * The lifecycle create is where the held lock had the furthest to travel, and
 * it did not arrive.
 *
 * `withLock` is one step of the sequence here — validate, create, lock-write-
 * unlock, check — so the check answered in the write's place and took the
 * note with it. `carryCleanup` at the end of the handler then had nothing to
 * move onto the activation. The carrying now happens between the steps, and
 * this is the end-to-end proof of it, on the handler the review named.
 */
describe('CreateDomain (high) — a lock nobody released reaches the caller', () => {
  // The full shape ADT answers, because the handler patches the document it
  // read: a stub without `<doma:datatype>` fails in the patch instead, which
  // is a different path from the one under test.
  const DOMAIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="d" adtcore:version="active" adtcore:masterLanguage="EN">
  <doma:datatype>CHAR</doma:datatype>
  <doma:length>10</doma:length>
  <doma:decimals>0</doma:decimals>
  <doma:conversionExit/>
  <doma:signExists>false</doma:signExists>
  <doma:lowercase>false</doma:lowercase>
  <doma:valueTableRef/>
  <doma:fixValues/>
</doma:domain>`;

  it('names it on the answer, past the check and the activation that follow', async () => {
    fakeClient = fakeClientOf({
      validate: async () => okResponse(reading({ valid: true })),
      create: async () => okResponse(reading(undefined, '', 201)),
      lock: async () => okResponse('handle-1'),
      readMetadata: async () => okResponse(reading(DOMAIN_XML, DOMAIN_XML)),
      updateMetadata: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedResponse('Unlock refused'),
      check: async () => okResponse(reading({ ran: true, messages: [] })),
      activate: async () => okResponse(reading(undefined, '', 200)),
    });

    const result: any = await handleCreateDomain(context as any, {
      domain_name: 'ZD',
      package_name: '$TMP',
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text).cleanup).toMatchObject({
      message: 'Unlock refused',
    });
  });
});

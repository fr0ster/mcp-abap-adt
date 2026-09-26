import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { handleActivateDomain } from '../../handlers/domain/low/handleActivateDomain';
import { handleCheckDomain } from '../../handlers/domain/low/handleCheckDomain';
import { handleCreateDomain } from '../../handlers/domain/low/handleCreateDomain';
import { handleDeleteDomain } from '../../handlers/domain/low/handleDeleteDomain';
import { handleLockDomain } from '../../handlers/domain/low/handleLockDomain';
import { handleUnlockDomain } from '../../handlers/domain/low/handleUnlockDomain';
import { handleUpdateDomain } from '../../handlers/domain/low/handleUpdateDomain';
import { handleValidateDomain } from '../../handlers/domain/low/handleValidateDomain';
import { corpusBody } from '../../lib/adtCorpus';
import { analyseDeletion } from '../../lib/strategies/deletionRefusal';
import { structured, verbatim } from '../../lib/strategies/reading';
import {
  fakeClientOf,
  okResponse,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.last` needs this wiring.
const seen = recordAnalyse();
let fakeClient: unknown = seen.client;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

// Nothing in this file asserts that a handler injects `resultsFor(domainDocuments)`
// into `getDomain(...)` — both `fakeClientOf` and `recordAnalyse` ignore the
// factory argument entirely (`fakeClientOf`'s own doc comment names this), so
// a handler calling `getDomain()` bare would satisfy every test here. That
// injection is guarded by `tsc` instead: `resultsFor`'s mapped return type is
// what makes `getX(resultsFor(xDocuments)).op(...)` answer the reading-shaped
// type a handler's `project(detail, terseX)` actually needs, and dropping the
// call is a type error at the `project` call site, not a runtime failure a
// test here would catch.

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('CreateDomainLow', () => {
  it('answers SUCCESS at terse, on the verbatim reading create-domain--01-ddic-domains proves', async () => {
    // The row this task overrules: `created` is `verbatim`, not `statusOnly` —
    // create-domain answers 1878 bytes of doma:domain, and `resultSets.ts`
    // already maps it that way. `verbatim` still carries `status`, so
    // `terseWrite` reads it the same as it would off `statusOnly`.
    const document = corpusBody('create-domain--01-ddic-domains');
    const reading = verbatim({ data: document, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreateDomain(context as any, {
      domain_name: 'zmcp_bld_crt_dom',
      description: 'x',
      package_name: 'ZADT_BLD_PKG03',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('answers the document itself at detail raw — the DDIC create is not discarded', async () => {
    const document = corpusBody('create-domain--01-ddic-domains');
    const reading = verbatim({ data: document, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreateDomain(context as any, {
      domain_name: 'zmcp_bld_crt_dom',
      description: 'x',
      package_name: 'ZADT_BLD_PKG03',
      detail: 'raw',
    });

    expect(result.content[0].text).toBe(document);
  });

  it('reports a refused create as an error, not as success with a null body', async () => {
    fakeClient = fakeClientOf({
      create: async () =>
        refusedResponse('Domain ZMCP_BLD_CRT_DOM already exists'),
    });

    const result: any = await handleCreateDomain(context as any, {
      domain_name: 'zmcp_bld_crt_dom',
      description: 'x',
      package_name: 'ZADT_BLD_PKG03',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
    expect(result.content[0].text).not.toContain('"success": true');
  });

  it('hands create its own analyseException', async () => {
    fakeClient = seen.client;
    await handleCreateDomain(context as any, {
      domain_name: 'ZD',
      description: 'x',
      package_name: 'ZP',
    });
    const call = seen.calls.filter((c) => c.member === 'create').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });
});

describe('CheckDomainLow', () => {
  it('answers the structured check-success-verdict fixture through terseCheck', async () => {
    const reading = structured({
      data: corpusBody('check-success-verdict--01-checkrun'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ check: async () => okResponse(reading) });

    const result: any = await handleCheckDomain(context as any, {
      domain_name: 'zd',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      ran: true,
      status_text: 'Object ZBP_MCP_SHR_I_ROOT has been checked',
    });
  });

  it('hands check its own analyseException, and status undefined (the inactive default)', async () => {
    fakeClient = seen.client;
    await handleCheckDomain(context as any, { domain_name: 'ZD' });
    const call = seen.calls.filter((c) => c.member === 'check').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBeUndefined();
  });
});

describe('ActivateDomainLow', () => {
  it('answers the structured activation-success-verdict fixture through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateDomain(context as any, {
      domain_name: 'zd',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });

  it('ActivateDomain takes analyseActivation, and DeleteDomain takes analyseDeletion', async () => {
    fakeClient = seen.client;
    await handleActivateDomain(context as any, { domain_name: 'ZD' });
    expect(seen.calls.at(-1)?.carriedAnalyse).toBe(true);
    expect(seen.calls.at(-1)?.analyse).toBe(analyseActivation);

    await handleDeleteDomain(context as any, { domain_name: 'ZD' });
    expect(seen.calls.at(-1)?.carriedAnalyse).toBe(true);
    expect(seen.calls.at(-1)?.analyse).toBe(analyseDeletion);
  });
});

describe('ValidateDomainLow', () => {
  it('reports an inadmissible name as an error, against the real analyseException', async () => {
    // refusal-validation-name-taken-domain--01-domains-validation is a genuine
    // HTTP 400: adt-clients already built its own verdict before consulting
    // `analyse`, and analyseException ENRICHES that verdict from the
    // exc:exception document rather than replacing it (readValidationRefusal,
    // the 200-embedded asx:abap form, does not apply to this fixture — it
    // never reaches it, because the verdict handed in is not
    // ADT_NO_FAILURE). Proven against the corpus, not against documentation.
    const document = corpusBody(
      'refusal-validation-name-taken-domain--01-domains-validation',
    );
    fakeClient = fakeClientOf({
      validate: async (_config: unknown, options: any) => {
        const verdict = options.analyse(
          { origin: 'refusal', message: 'Request failed with status code 400' },
          { data: document, status: 400 },
        );
        return refusedResponse(verdict.message, verdict);
      },
    });

    const result: any = await handleValidateDomain(context as any, {
      domain_name: 'MANDT',
      package_name: 'ZADT_BLD_PKG03',
      description: 'x',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
    expect(payload.adt_type).toBe('InvalidObjName');
    expect(payload.messages[0].text).toBe(
      'Domain with the name MANDT already exists',
    );
    expect(payload.messages[0].t100).toEqual({
      id: 'SWB_TOOL',
      no: '016',
      values: ['Domain', 'MANDT'],
    });
  });

  it('reports an admissible name through terseValidation', async () => {
    // The asx:abap/DATA/CHECK_RESULT shape is shared across every DDIC
    // validation endpoint — no domain-specific "name free" fixture exists in
    // the corpus, and this one (captured for a table) is byte-for-byte the
    // same shape terseValidation reads for a domain.
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateDomain(context as any, {
      domain_name: 'ZD',
      package_name: 'ZP',
      description: 'x',
    });

    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
  });

  it('hands validate its own analyseException', async () => {
    fakeClient = seen.client;
    await handleValidateDomain(context as any, {
      domain_name: 'ZD',
      package_name: 'ZP',
      description: 'x',
    });
    const call = seen.calls.filter((c) => c.member === 'validate').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });
});

describe('DeleteDomainLow', () => {
  it('answers the structured delete-success fixture through terseDeletion', async () => {
    const reading = structured({
      data: corpusBody('delete-success--01-deletion-delete'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ delete: async () => okResponse(reading) });

    const result: any = await handleDeleteDomain(context as any, {
      domain_name: 'zd',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      deleted: true,
      object: 'ZMCP_BLD_ANSCH01',
    });
  });

  it('reports a refused delete as an error, not as success with a null body', async () => {
    fakeClient = fakeClientOf({
      delete: async () => refusedResponse('Domain ZD is still referenced'),
    });

    const result: any = await handleDeleteDomain(context as any, {
      domain_name: 'zd',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('"success": true');
  });
});

describe('LockDomainLow', () => {
  it('answers the lock handle in the envelope the tool already returned', async () => {
    const handle = 'B92E65858E83454C783181344F429D4BFD8E395D';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockDomain(context as any, {
      domain_name: 'zd',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.domain_name).toBe('ZD');
    expect(payload.lock_handle).toBe(handle);
  });

  it('LockDomain passes no analyse, because lock() accepts none', async () => {
    fakeClient = seen.client;
    await handleLockDomain(context as any, { domain_name: 'ZD' });
    const call = seen.calls.filter((c) => c.member === 'lock').at(-1);
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
  });
});

describe('UnlockDomainLow', () => {
  it('answers SUCCESS through terseWrite', async () => {
    fakeClient = fakeClientOf({ unlock: async () => okResponse(undefined) });

    const result: any = await handleUnlockDomain(context as any, {
      domain_name: 'zd',
      lock_handle: 'h',
      session_id: 's',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('UnlockDomain passes no analyse, because unlock() accepts none', async () => {
    fakeClient = seen.client;
    await handleUnlockDomain(context as any, {
      domain_name: 'ZD',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = seen.calls.filter((c) => c.member === 'unlock').at(-1);
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
  });
});

describe('UpdateDomainLow', () => {
  // Fix round 3, task 14 found this as `config.document` vs
  // `options.xmlContent`; `interfaces-adt@9` ended that split. There is one
  // body channel now — `options.source` — and `document` is gone from
  // `IDomainConfig` altogether, so a config that still carried it would not
  // compile. What still needs asserting is the same thing: the patched
  // document reaches the member, and the config carries the object's name
  // and nothing that looks like a body. Verified against
  // `AdtDomain.updateMetadata()`, which reads `options?.source` only.
  it('passes the patched document via options.source, and the config names the object only', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(undefined);
      },
    });

    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after' },
      lock_handle: 'h',
    });

    expect(result.isError).toBe(false);

    // The request the member actually builds from this: options carries the
    // whole patched document beside the lock handle and the strategy; config
    // names the object and nothing else.
    expect(updateCall?.config).toEqual({
      domainName: 'ZD',
    });
    expect(updateCall?.options).toEqual({
      source: expect.stringContaining('adtcore:description="after"'),
      lockHandle: 'h',
      analyse: analyseException,
    });
    expect(
      (updateCall?.config as { document?: unknown })?.document,
    ).toBeUndefined();
  });

  // Task 22, fix round 1: the ledger named this domain gap explicitly —
  // `UpdateDataElementLow`'s sibling reads `transport_request` (and its
  // camelCase alias) out of the same free-form `properties` bag and threads
  // it into `config.transportRequest`; this handler read `properties` for
  // every DDIC field the patch touches but never for the transport, so a
  // transportable domain update went out with no transport at all.
  it('threads transport_request out of the properties bag into config.transportRequest, the way UpdateDataElementLow does', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(undefined);
      },
    });

    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after', transport_request: 'E19K900123' },
      lock_handle: 'h',
    });

    expect(result.isError).toBe(false);
    expect(updateCall?.config?.transportRequest).toBe('E19K900123');
  });

  it('accepts the camelCase alias too, the same fallback UpdateDataElementLow reads', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(undefined);
      },
    });

    await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after', transportRequest: 'E19K900456' },
      lock_handle: 'h',
    });

    expect(updateCall?.config?.transportRequest).toBe('E19K900456');
  });
});

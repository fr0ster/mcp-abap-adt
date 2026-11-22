import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { handleActivateDomain } from '../../handlers/domain/low/handleActivateDomain';
import { handleCheckDomain } from '../../handlers/domain/low/handleCheckDomain';
import { handleUpdateDomain } from '../../handlers/domain/low/handleUpdateDomain';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import * as clients from '../../lib/clients';
import { analyseDeletion } from '../../lib/strategies/deletionRefusal';
import { analyseLock } from '../../lib/strategies/lockAnswer';
import { structured, verbatim } from '../../lib/strategies/reading';
import { corpusBody } from '../helpers/adtCorpus';
import {
  fakeClientOf,
  okResponse,
  reading,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';

mock.method(clients, 'createAdtClient', () => fakeClient);

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.last` needs this wiring.
const seen = recordAnalyse();
let fakeClient: unknown = seen.client;

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

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      ran: true,
      status_text: 'Object ZBP_MCP_SHR_I_ROOT has been checked',
    });
  });

  it('hands check its own analyseException, and status active (the default)', async () => {
    fakeClient = seen.client;
    await handleCheckDomain(context as any, { domain_name: 'ZD' });
    const call = seen.calls.filter((c) => c.member === 'check').at(-1);
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.equal(call?.args[1], 'active');
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

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
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
  // The answer is `terseWrite` over the write's reading (Codex P2): SUCCESS
  // for SAP's 2xx, not a constant.
  it('answers what terseWrite makes of the write, not a fixed SUCCESS', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async () => okResponse(reading(undefined, '', 302)),
    });
    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after' },
      lock_handle: 'h',
    });
    assert.notEqual(result.content[0].text, 'SUCCESS');
  });

  it('passes the patched document via options.source, and the config names the object only', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(reading(undefined, '', 200));
      },
    });

    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after' },
      lock_handle: 'h',
    });

    assert.equal(result.isError, false);
    // A write with nothing to report answers SUCCESS, as every low update.
    assert.equal(result.content[0].text, 'SUCCESS');

    // The request the member actually builds from this: options carries the
    // whole patched document beside the lock handle and the strategy; config
    // names the object and nothing else (its transport key present, unset).
    assert.deepStrictEqual(updateCall?.config, {
      domainName: 'ZD',
      transportRequest: undefined,
    });
    const { source, ...options } = updateCall?.options ?? {};
    assert.ok(source.includes('adtcore:description="after"'));
    assert.deepStrictEqual(options, {
      headers: DEFAULT_ADT_HEADERS['domain.updateMetadata'],
      lockHandle: 'h',
      analyse: analyseException,
    });
    assert.equal(
      (updateCall?.config as { document?: unknown })?.document,
      undefined,
    );
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
        return okResponse(reading(undefined, '', 200));
      },
    });

    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after', transport_request: 'SIDK900123' },
      lock_handle: 'h',
    });

    assert.equal(result.isError, false);
    assert.equal(updateCall?.config?.transportRequest, 'SIDK900123');
  });

  // The bag is the model's own object: a flag given as null is no flag, and
  // was written into the document as the text "null".
  it('leaves out a flag given as null instead of writing "null" into the document', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"><doma:signExists>false</doma:signExists></doma:domain>';
    let source = '';
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (_config: unknown, options: { source: string }) => {
        source = options.source;
        return okResponse(reading(undefined, '', 200));
      },
    });

    const result = await handleUpdateDomain(context, {
      domain_name: 'zd',
      properties: { description: 'after', sign_exists: null },
      lock_handle: 'h',
    });

    assert.equal(result.isError, false);
    assert.ok(source.includes('<doma:signExists>false</doma:signExists>'));
  });

  it('accepts the camelCase alias too, the same fallback UpdateDataElementLow reads', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(reading(undefined, '', 200));
      },
    });

    await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      properties: { description: 'after', transportRequest: 'SIDK900456' },
      lock_handle: 'h',
    });

    assert.equal(updateCall?.config?.transportRequest, 'SIDK900456');
  });
});

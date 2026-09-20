import {
  analyseActivation,
  analyseDeletion,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import { handleCheckObject } from '../../handlers/common/low/handleCheckObject';
import { handleDeleteObject } from '../../handlers/common/low/handleDeleteObject';
import { handleLockObject } from '../../handlers/common/low/handleLockObject';
import { handleUnlockObject } from '../../handlers/common/low/handleUnlockObject';
import { handleValidateObject } from '../../handlers/common/low/handleValidateObject';
import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import { structured } from '../../lib/strategies/reading';
import {
  fakeClientOf,
  okResponse,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.last`/`seen.calls` needs this wiring.
const seen = recordAnalyse();
let fakeClient: unknown = seen.client;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

// As in domainLow.test.ts: nothing here asserts that a handler injects
// `resultsFor(xDocuments)` into `getX(...)` — both test doubles ignore the
// factory argument. That injection is guarded by `tsc` (`resultsFor`'s mapped
// return type), not by a runtime test.

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

beforeEach(() => {
  seen.calls.length = 0;
});

/**
 * The document ADT actually sent, judged by the strategy the handler passes.
 *
 * Two of these three cases answer HTTP 200 with the refusal inside — the
 * masking family this task exists to fix. The third
 * (`refusal-validation-name-taken-class`) is a genuine HTTP 400; the status
 * comes from the fixture's own sidecar rather than a literal here, so this
 * helper drives the real strategy over the real status ADT actually sent,
 * not a status the test invented.
 */
const refusalFrom = (
  member: string,
  caseName: string,
  // `any`, not `unknown`: accepts whichever of the four shipped `analyse*`
  // strategies the caller passes. Their parameter types are each narrower
  // than `unknown`, so a `(v: unknown, a: unknown) => unknown` parameter
  // here would reject every one of them under `strictFunctionTypes`.
  analyse: (v: any, a: any) => unknown,
) =>
  fakeClientOf({
    [member]: async (_config: unknown, options: any) => {
      const status = Number(corpusSidecar(caseName).response.status);
      const wire = { data: corpusBody(caseName), status };
      expect(options.analyse).toBe(analyse);
      const verdict = options.analyse('adt:no-failure', wire);
      // The strategy's own verdict is the error, not a re-wrap of its
      // message — passing only `message` would let this test pass even if
      // the strategy classified the document as something other than a
      // refusal, as long as it happened to produce a truthy `message`.
      return refusedResponse(
        (verdict as { message: string }).message,
        verdict as any,
      );
    },
  });

describe('the three masking cases (Task 13, Step 2)', () => {
  it('reports a refused deletion as an error, though ADT answered 200', async () => {
    fakeClient = refusalFrom(
      'delete',
      'refusal-delete-refused--01-deletion-delete',
      analyseDeletion,
    );
    const result: any = await handleDeleteObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_X',
    });
    expect(result.isError).toBe(true);
    // What failed, not just that something did. A local validation error
    // answers isError too, and would pass the line below unchanged.
    expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
    expect(result.content[0].text).not.toContain('"success": true');
  });

  it('reports an inadmissible name as an error', async () => {
    fakeClient = refusalFrom(
      'validate',
      'refusal-validation-name-taken-class--01-validation-objectname',
      analyseException,
    );
    const result: any = await handleValidateObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_TAKEN',
      package_name: 'ZP',
    });
    expect(result.isError).toBe(true);
    // `origin` proves the failure came from the strategy rather than from the
    // handler's own input validation, which answers isError too.
    expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
  });

  it('reports a refused activation as an error', async () => {
    fakeClient = refusalFrom(
      'activate',
      'refusal-activation-fails--01-activation',
      analyseActivation,
    );
    // `objects`, an array of `{ name, type }` — one object, so the handler
    // reaches the per-object `activate()` (Step 1's decision), not
    // `activateObjectsGroup`. That is what makes this test able to see the
    // refusal at all: `activateObjectsGroup` is a different member name, and
    // the fake client above only refuses `activate`.
    const result: any = await handleActivateObject(context as any, {
      objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
  });
});

describe('ValidateObjectLow', () => {
  it('answers an admissible class name through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-class--01-validation-objectname'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_X',
      package_name: 'ZP',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
  });

  it('hands validate its own analyseException, with the class field names validate() declares', async () => {
    fakeClient = seen.client;
    await handleValidateObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
      package_name: 'zp',
      description: 'x',
    });
    const call = seen.calls.filter((c) => c.member === 'validate').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({
      className: 'ZCL_X',
      packageName: 'zp',
      description: 'x',
    });
  });

  it('dispatches domain validation with domainName, not className', async () => {
    fakeClient = seen.client;
    await handleValidateObject(context as any, {
      object_type: 'domain',
      object_name: 'zd',
      package_name: 'zp',
      description: 'x',
    });
    const call = seen.calls.filter((c) => c.member === 'validate').at(-1);
    expect(call?.args[0]).toEqual({
      domainName: 'ZD',
      packageName: 'zp',
      description: 'x',
    });
  });

  it('rejects an unsupported object_type before ever reaching the client', async () => {
    fakeClient = seen.client;
    const result: any = await handleValidateObject(context as any, {
      object_type: 'not_a_type',
      object_name: 'ZX',
    });
    expect(result.isError).toBe(true);
    expect(seen.calls.length).toBe(0);
  });

  it('an empty package_name or description collapses to absent, not to an empty string on the wire', async () => {
    fakeClient = seen.client;
    await handleValidateObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
      package_name: '',
      description: '',
    });
    const call = seen.calls.filter((c) => c.member === 'validate').at(-1);
    expect(call?.args[0]).toEqual({
      className: 'ZCL_X',
      packageName: undefined,
      description: undefined,
    });
  });

  // behavior_definition and metadata_extension address the object with the
  // same config key (`name`) and, after `resultsFor`, read through
  // structurally identical readings — no reading and no projection can tell
  // the two apart, so only the factory name proves which one ran.
  it("behavior_definition and metadata_extension reach their own factory, not each other's", async () => {
    fakeClient = seen.client;
    await handleValidateObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
      package_name: 'zp',
      description: 'x',
      root_entity: 'e',
      implementation_type: 'Managed',
    });
    expect(
      seen.calls.filter((c) => c.member === 'validate').at(-1)?.factory,
    ).toBe('getBehaviorDefinition');

    await handleValidateObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
      package_name: 'zp',
      description: 'x',
    });
    expect(
      seen.calls.filter((c) => c.member === 'validate').at(-1)?.factory,
    ).toBe('getMetadataExtension');
  });
});

describe('DeleteObjectLow', () => {
  it('answers the structured delete-success fixture through terseDeletion', async () => {
    const reading = structured({
      data: corpusBody('delete-success--01-deletion-delete'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ delete: async () => okResponse(reading) });

    const result: any = await handleDeleteObject(context as any, {
      object_type: 'domain',
      object_name: 'zd',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      deleted: true,
      object: 'ZMCP_BLD_ANSCH01',
    });
  });

  it('hands delete its own analyseDeletion, with the transport request forwarded', async () => {
    fakeClient = seen.client;
    await handleDeleteObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
      transport_request: 'E19K900001',
    });
    const call = seen.calls.filter((c) => c.member === 'delete').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
    expect(call?.args[0]).toEqual({
      className: 'ZCL_X',
      transportRequest: 'E19K900001',
    });
  });

  it('requires function_group_name for function_module deletion, and forwards both names', async () => {
    fakeClient = seen.client;
    const missing: any = await handleDeleteObject(context as any, {
      object_type: 'function_module',
      object_name: 'ZFM',
    });
    expect(missing.isError).toBe(true);
    expect(seen.calls.length).toBe(0);

    await handleDeleteObject(context as any, {
      object_type: 'function_module',
      object_name: 'zfm',
      function_group_name: 'zfg',
    });
    const call = seen.calls.filter((c) => c.member === 'delete').at(-1);
    expect(call?.args[0]).toEqual({
      functionGroupName: 'ZFG',
      functionModuleName: 'ZFM',
      transportRequest: undefined,
    });
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleDeleteObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
    });
    expect(
      seen.calls.filter((c) => c.member === 'delete').at(-1)?.factory,
    ).toBe('getBehaviorDefinition');

    await handleDeleteObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
    });
    expect(
      seen.calls.filter((c) => c.member === 'delete').at(-1)?.factory,
    ).toBe('getMetadataExtension');
  });
});

describe('CheckObjectLow', () => {
  it('answers the structured check-success-verdict fixture through terseCheck', async () => {
    const reading = structured({
      data: corpusBody('check-success-verdict--01-checkrun'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ check: async () => okResponse(reading) });

    const result: any = await handleCheckObject(context as any, {
      object_type: 'domain',
      object_name: 'zd',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      ran: true,
      status_text: 'Object ZBP_MCP_SHR_I_ROOT has been checked',
    });
  });

  it('hands check its own analyseException, with the requested version as the second argument', async () => {
    fakeClient = seen.client;
    await handleCheckObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
      version: 'inactive',
    });
    const call = seen.calls.filter((c) => c.member === 'check').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({ className: 'ZCL_X' });
    expect(call?.args[1]).toBe('inactive');
  });

  // Pinned, not merely asserted in passing: this is the one place this
  // migration knowingly changed CheckObject's default behaviour rather than
  // preserved it. `checkFunctionGroup`/behavior_definition's `check()` in
  // adt-clients 18 mapped an absent status to `inactive`; this handler never
  // forwarded a version for these two branches at all (0577d89e), so a
  // caller who omitted `version` — the ordinary case, right after editing
  // and saving — was checked against the version they just wrote. This
  // handler's default is `'active'` (the schema's documented default, and
  // what the other nine branches already do), so that same omitted-version
  // call now checks the ACTIVE version, which for a freshly-created,
  // not-yet-activated object may not exist yet. Kept deliberately (see the
  // task report), but it must stay pinned here rather than merely declared.
  it.each([
    'function_group',
    'behavior_definition',
  ] as const)("defaults %s's check to the active version when the caller omits it", async (objectType) => {
    fakeClient = seen.client;
    await handleCheckObject(context as any, {
      object_type: objectType,
      object_name: 'zx',
    });
    const call = seen.calls.filter((c) => c.member === 'check').at(-1);
    expect(call?.args[1]).toBe('active');
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleCheckObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
    });
    expect(seen.calls.filter((c) => c.member === 'check').at(-1)?.factory).toBe(
      'getBehaviorDefinition',
    );

    await handleCheckObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
    });
    expect(seen.calls.filter((c) => c.member === 'check').at(-1)?.factory).toBe(
      'getMetadataExtension',
    );
  });
});

describe('ActivateObjectLow', () => {
  it('answers the structured activation-success-verdict fixture through terseActivation, for one object', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateObject(context as any, {
      objects: [{ name: 'zd', type: 'DOMA/DM' }],
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });

  it('one object reaches the per-object activate(), carrying analyseActivation', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [{ name: 'zcl_x', type: 'CLAS/OC' }],
    });
    expect(seen.calls).toHaveLength(1);
    const call = seen.calls[0];
    expect(call.member).toBe('activate');
    expect(call.carriedAnalyse).toBe(true);
    expect(call.analyse).toBe(analyseActivation);
    expect(call.args[0]).toEqual({ className: 'ZCL_X' });
  });

  it('more than one object falls back to activateObjectsGroup — no analyse to carry, by the library surface, not by choice', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DM' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    expect(seen.calls).toHaveLength(1);
    const call = seen.calls[0];
    expect(call.member).toBe('activateObjectsGroup');
    expect(call.carriedAnalyse).toBe(false);
  });

  it('a single object of an unmapped type also falls back to the group member', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [{ name: 'zsb', type: 'SRVB/SVB' }],
    });
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0].member).toBe('activateObjectsGroup');
  });

  it('the group fallback reads acceptance from the run id, not a hardcoded true', async () => {
    fakeClient = fakeClientOf({
      activateObjectsGroup: async () => okResponse('E19-ACT-RUN-1'),
    });
    const result: any = await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DM' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.accepted).toBe(true);
    expect(payload.run_id).toBe('E19-ACT-RUN-1');
    // No verdict — acceptance is not completion. Explicitly null, not
    // omitted, and not `true`.
    expect(payload.activated).toBeNull();
  });

  it('an empty run id reads as not accepted, not as a silent success', async () => {
    fakeClient = fakeClientOf({
      activateObjectsGroup: async () => okResponse(''),
    });
    const result: any = await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DM' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.accepted).toBe(false);
    expect(payload.run_id).toBeNull();
    expect(payload.activated).toBeNull();
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [{ name: 'zbd', type: 'behavior_definition' }],
    });
    expect(seen.calls.at(-1)?.factory).toBe('getBehaviorDefinition');

    await handleActivateObject(context as any, {
      objects: [{ name: 'zmd', type: 'metadata_extension' }],
    });
    expect(seen.calls.at(-1)?.factory).toBe('getMetadataExtension');
  });
});

describe('LockObjectLow', () => {
  it('answers the lock handle in the envelope the tool already returned', async () => {
    const handle = 'B92E65858E83454C783181344F429D4BFD8E395D';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.object_name).toBe('ZCL_X');
    expect(payload.lock_handle).toBe(handle);
  });

  it('LockObject passes no analyse, because lock() accepts none', async () => {
    fakeClient = seen.client;
    await handleLockObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_X',
    });
    const call = seen.calls.filter((c) => c.member === 'lock').at(-1);
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
  });

  it('requires super_package for package locking, and uppercases it when present', async () => {
    fakeClient = seen.client;
    const missing: any = await handleLockObject(context as any, {
      object_type: 'package',
      object_name: 'ZPKG',
    });
    expect(missing.isError).toBe(true);
    expect(seen.calls.length).toBe(0);

    await handleLockObject(context as any, {
      object_type: 'package',
      object_name: 'zpkg',
      super_package: 'zsuper',
    });
    const call = seen.calls.filter((c) => c.member === 'lock').at(-1);
    expect(call?.args[0]).toEqual({
      packageName: 'ZPKG',
      superPackage: 'ZSUPER',
    });
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleLockObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
    });
    expect(seen.calls.filter((c) => c.member === 'lock').at(-1)?.factory).toBe(
      'getBehaviorDefinition',
    );

    await handleLockObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
    });
    expect(seen.calls.filter((c) => c.member === 'lock').at(-1)?.factory).toBe(
      'getMetadataExtension',
    );
  });
});

describe('UnlockObjectLow', () => {
  it('answers SUCCESS through terseWrite', async () => {
    fakeClient = fakeClientOf({ unlock: async () => okResponse(undefined) });

    const result: any = await handleUnlockObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
      lock_handle: 'h',
      session_id: 's',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('UnlockObject passes no analyse, because unlock() accepts none, and forwards the lock handle', async () => {
    fakeClient = seen.client;
    await handleUnlockObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = seen.calls.filter((c) => c.member === 'unlock').at(-1);
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(call?.args).toEqual([{ className: 'ZCL_X' }, 'h']);
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleUnlockObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
      lock_handle: 'h',
      session_id: 's',
    });
    expect(
      seen.calls.filter((c) => c.member === 'unlock').at(-1)?.factory,
    ).toBe('getBehaviorDefinition');

    await handleUnlockObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
      lock_handle: 'h',
      session_id: 's',
    });
    expect(
      seen.calls.filter((c) => c.member === 'unlock').at(-1)?.factory,
    ).toBe('getMetadataExtension');
  });
});

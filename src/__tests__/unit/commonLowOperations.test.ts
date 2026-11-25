import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { handleActivateObject as handleActivateObjectOf } from '../../handlers/common/low/handleActivateObject';
import { handleCheckObject } from '../../handlers/common/low/handleCheckObject';
import { handleLockObject } from '../../handlers/common/low/handleLockObject';
import { handleUnlockObject } from '../../handlers/common/low/handleUnlockObject';
import {
  handleValidateObject,
  TOOL_DEFINITION as VALIDATE_OBJECT,
} from '../../handlers/common/low/handleValidateObject';
import * as clients from '../../lib/clients';
import { defineTool } from '../../lib/handlers/interfaces';
import { analyseDeletion } from '../../lib/strategies/deletionRefusal';
import { analyseLock } from '../../lib/strategies/lockAnswer';
import { structured } from '../../lib/strategies/reading';
import { corpusBody, corpusSidecar } from '../helpers/adtCorpus';
import { assertRejects } from '../helpers/assertions';
import {
  fakeClientOf,
  okResponse,
  reading,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';
import { stateSystemKind } from '../helpers/systemKind';

/** handleActivateObject at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleActivateObject = (
  context: Parameters<typeof handleActivateObjectOf>[0],
  args: Parameters<typeof handleActivateObjectOf>[1],
) => handleActivateObjectOf(context, { detail: 'full', ...args });

// The declared variant the boundary checks a type argument against.
stateSystemKind('onprem');
mock.method(clients, 'createAdtClient', () => fakeClient);
// An on-premise group activation is the on-premise client's.
mock.method(clients, 'createOnPremAdtClient', () => fakeClient);

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.last`/`seen.calls` needs this wiring. A group activation
// reads its run until SAP states it ended, so the run reads `finished`.
const seen = recordAnalyse({
  getActivationRun: () =>
    reading(
      { 'runs:run': { '@': { 'runs:status': 'finished' } } },
      '<runs:run runs:status="finished"/>',
      200,
    ),
});
let fakeClient: unknown = seen.client;

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
      assert.equal(options.analyse, analyse);
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
    assert.equal(result.isError, true);
    // `origin` proves the failure came from the strategy rather than from the
    // handler's own input validation, which answers isError too.
    assert.equal(JSON.parse(result.content[0].text).origin, 'refusal');
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
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).origin, 'refusal');
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

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      admissible: true,
    });
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
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], {
      className: 'ZCL_X',
      packageName: 'zp',
      description: 'x',
      superclass: undefined,
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
    assert.deepStrictEqual(call?.args[0], {
      domainName: 'ZD',
      packageName: 'zp',
      description: 'x',
    });
  });

  it('rejects an unsupported object_type at the schema, before ever reaching the client', async () => {
    fakeClient = seen.client;
    const refused = assertRejects(
      defineTool(VALIDATE_OBJECT, handleValidateObject).call(context as any, {
        object_type: 'not_a_type',
        object_name: 'ZX',
      }),
      'Invalid arguments for tool ValidateObjectLow: ',
    );
    await refused;
    assert.equal(seen.calls.length, 0);
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
    assert.deepStrictEqual(call?.args[0], {
      className: 'ZCL_X',
      packageName: undefined,
      description: undefined,
      superclass: undefined,
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
    assert.equal(
      seen.calls.filter((c) => c.member === 'validate').at(-1)?.factory,
      'getBehaviorDefinition',
    );

    await handleValidateObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
      package_name: 'zp',
      description: 'x',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'validate').at(-1)?.factory,
      'getMetadataExtension',
    );
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

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
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
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], {
      className: 'ZCL_X',
      source: undefined,
    });
    assert.equal(call?.args[1], 'inactive');
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
  for (const objectType of ['function_group', 'behavior_definition'] as const) {
    it(
      format(
        "defaults %s's check to the active version when the caller omits it",
        objectType,
      ),
      async () => {
        fakeClient = seen.client;
        await handleCheckObject(context as any, {
          object_type: objectType,
          object_name: 'zx',
        });
        const call = seen.calls.filter((c) => c.member === 'check').at(-1);
        assert.equal(call?.args[1], 'active');
      },
    );
  }

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleCheckObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'check').at(-1)?.factory,
      'getBehaviorDefinition',
    );

    await handleCheckObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'check').at(-1)?.factory,
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

    const result: any = await handleActivateObjectOf(context as any, {
      objects: [{ name: 'zd', type: 'DOMA/DD' }],
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });

  it('one object reaches the per-object activate(), carrying analyseActivation', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [{ name: 'zcl_x', type: 'CLAS/OC' }],
    });
    assert.equal(seen.calls.length, 1);
    const call = seen.calls[0];
    assert.equal(call.member, 'activate');
    assert.equal(call.carriedAnalyse, true);
    assert.equal(call.analyse, analyseActivation);
    assert.deepStrictEqual(call.args[0], { className: 'ZCL_X' });
  });

  /**
   * A finished run and the results it produced. `/activation/runs` answers the
   * id only, so a fake that stops there is the defect this sequence fixed.
   */
  const finishedRun = (results: string) =>
    fakeClientOf({
      activateObjectsGroup: async () => okResponse('ACT-RUN-1'),
      getActivationRun: async () =>
        okResponse(
          reading(
            { 'runs:run': { '@': { 'runs:status': 'finished' } } },
            '<runs:run runs:status="finished"/>',
            200,
          ),
        ),
      getActivationResults: async () =>
        okResponse(reading(undefined, results, 200)),
    });

  it('more than one object goes to the group member, and then reads the run and its results', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DD' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    // Three requests, not one: the POST answers `202` with the id in
    // `Location` and an empty body, so the verdict is in the run's results.
    // `getActivationRun` repeats while the run has not ended; the recording
    // double answers it finished — only the sequence is pinned here.
    // The discovery is read first: which endpoint the system offers
    // (fr0ster/mcp-abap-adt#351); the recording double offers the runs.
    const members = seen.calls.map((c) => c.member);
    assert.equal(members[0], 'discovery');
    assert.equal(members[1], 'activateObjectsGroup');
    assert.ok(members.includes('getActivationRun'));
    assert.equal(members.at(-1), 'getActivationResults');
    for (const call of seen.calls) {
      assert.equal(call.factory, 'getUtils');
      assert.equal(call.carriedAnalyse, true);
    }
  });

  it('a single object of an unmapped type also falls back to the group member', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [{ name: 'zsb', type: 'SRVB/SVB' }],
    });
    assert.deepStrictEqual(seen.calls.map((c) => c.member).slice(0, 2), [
      'discovery',
      'activateObjectsGroup',
    ]);
  });

  it('the group path reads acceptance from the run id, not a hardcoded true', async () => {
    fakeClient = finishedRun('<chkl:messages/>');
    const result: any = await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DD' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.accepted, true);
    assert.equal(payload.run_id, 'ACT-RUN-1');
    assert.equal(payload.run_status, 'finished');
  });

  it('a finished run with no error-severity message answers activated: true', async () => {
    fakeClient = finishedRun('<chkl:messages/>');
    const result: any = await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DD' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    const payload = JSON.parse(result.content[0].text);
    // The errata is explicit: only an error-severity message is a failure, and
    // a run with nothing to do says nothing at all.
    assert.equal(payload.activated, true);
    assert.deepStrictEqual(payload.messages, []);
  });

  it('a finished run carrying an error is an error naming the object', async () => {
    fakeClient = finishedRun(
      '<chkl:messages><msg type="E" objName="ZIF_MCP_SHARED">' +
        '<shortText><txt>Interface ZIF_MCP_SHARED is not active</txt></shortText>' +
        '</msg></chkl:messages>',
    );
    const result: any = await handleActivateObject(context as any, {
      objects: [
        { name: 'zif_mcp_shared', type: 'INTF/OI' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.origin, 'refusal');
    assert.deepStrictEqual(payload.messages, [
      {
        type: 'E',
        text: 'Interface ZIF_MCP_SHARED is not active',
        // The message's objName names a sent object: its name and uri.
        objectName: 'ZIF_MCP_SHARED',
        uri: '/sap/bc/adt/oo/interfaces/zif_mcp_shared',
      },
    ]);
    // The message a caller could not see before this sequence existed: the
    // accept response carries none.
    assert.ok(payload.message.includes('ZIF_MCP_SHARED'));
  });

  it('an empty run id reads as not accepted, not as a silent success', async () => {
    fakeClient = fakeClientOf({
      activateObjectsGroup: async () => okResponse(''),
    });
    const result: any = await handleActivateObject(context as any, {
      objects: [
        { name: 'zd', type: 'DOMA/DD' },
        { name: 'zcl_x', type: 'CLAS/OC' },
      ],
    });
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.accepted, false);
    assert.equal(payload.run_id, null);
    assert.equal(payload.activated, null);
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleActivateObject(context as any, {
      objects: [{ name: 'zbd', type: 'behavior_definition' }],
    });
    assert.equal(seen.calls.at(-1)?.factory, 'getBehaviorDefinition');

    await handleActivateObject(context as any, {
      objects: [{ name: 'zmd', type: 'metadata_extension' }],
    });
    assert.equal(seen.calls.at(-1)?.factory, 'getMetadataExtension');
  });
});

describe('LockObjectLow', () => {
  it('answers the lock handle, and nothing the caller sent', async () => {
    const handle = 'B92E65858E83454C783181344F429D4BFD8E395D';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockObject(context as any, {
      object_type: 'class',
      object_name: 'zcl_x',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      lock_handle: handle,
    });
  });

  it('LockObject passes analyseLock', async () => {
    fakeClient = seen.client;
    await handleLockObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_X',
    });
    const call = seen.calls.filter((c) => c.member === 'lock').at(-1);
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseLock);
  });

  it('locks a package by its name alone, upper-cased', async () => {
    fakeClient = seen.client;
    await handleLockObject(context as any, {
      object_type: 'package',
      object_name: 'zpkg',
    });
    const call = seen.calls.filter((c) => c.member === 'lock').at(-1);
    assert.deepStrictEqual(call?.args[0], { packageName: 'ZPKG' });
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleLockObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'lock').at(-1)?.factory,
      'getBehaviorDefinition',
    );

    await handleLockObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'lock').at(-1)?.factory,
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
    });

    assert.equal(result.isError, false);
    assert.equal(result.content[0].text, 'SUCCESS');
  });

  it('UnlockObject passes analyseException, and forwards the lock handle', async () => {
    fakeClient = seen.client;
    await handleUnlockObject(context as any, {
      object_type: 'class',
      object_name: 'ZCL_X',
      lock_handle: 'h',
    });
    const call = seen.calls.filter((c) => c.member === 'unlock').at(-1);
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args, [{ className: 'ZCL_X' }, 'h']);
  });

  it('behavior_definition and metadata_extension reach their own factory', async () => {
    fakeClient = seen.client;
    await handleUnlockObject(context as any, {
      object_type: 'behavior_definition',
      object_name: 'zbd',
      lock_handle: 'h',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'unlock').at(-1)?.factory,
      'getBehaviorDefinition',
    );

    await handleUnlockObject(context as any, {
      object_type: 'metadata_extension',
      object_name: 'zmd',
      lock_handle: 'h',
    });
    assert.equal(
      seen.calls.filter((c) => c.member === 'unlock').at(-1)?.factory,
      'getMetadataExtension',
    );
  });
});

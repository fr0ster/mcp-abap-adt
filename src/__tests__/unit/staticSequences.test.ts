/**
 * Task 23: the ten consumers of members adt-clients 19 removed or renamed
 * with no successor of the same shape (the eleventh, `search/readonly/
 * handleSearchObject.ts`, was already migrated in Task 12 — commit
 * `565a04ce`, verified there against `tsc` that `search` through
 * `getUtils(ourUtils)` refuses a second `{ analyse }` argument with TS2554.
 * That handler and its analyse-identity test already live in
 * `readonlySingleCall.test.ts`; this file does not re-test it).
 *
 * Four shapes:
 *  - SHAPE 1 — a rename, still one call. Includes the two function-group
 *    listings (a two-request *walk*, but the refusal test only needs the
 *    first request to fail). The unit-test tools left this shape in 15.0.0:
 *    they run and wait, or write under a lock, and are tested in
 *    `unitTestTools.test.ts`.
 *  - SHAPE 2 — the two `lib/search-source` files, tested at the module
 *    boundary they actually have (no MCP result).
 *  - SHAPE 3 — the program-profiling handler: the on-premise executor's
 *    `getProgramExecutor()` (`createOnPremExecutor`), not `createAdtClient`,
 *    so it needs that door of `../../lib/clients`.
 *  - SHAPE 4 — `UpdateServiceBinding` and `CreateServiceBinding`, each its
 *    own shape:
 *      - `updateServiceBinding` has **no successor of the same shape**.
 *        `AdtServiceBinding.update()`'s shipped body (`AdtService.js`,
 *        not just its `.d.ts`) is one call — `updateRequest`, the
 *        publish/unpublish job — with its own tailored default `analyse`
 *        (`publicationRefusal`, reading `<SEVERITY>`). `classifyServiceBinding`
 *        is a different endpoint the body never calls; testing it as a
 *        second step would assert a sequence that does not exist.
 *      - `handleCreateServiceBinding.ts` is a genuine sequence:
 *        `create()` is one request (`createRequest`) — this handler
 *        composes `activate()` and `getServiceGroup()` itself, gated on
 *        `activate !== false`.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';

import {
  analyseException,
  analysePublication,
} from '@mcp-abap-adt/adt-strategies';
import { handleListFunctionGroupIncludes } from '../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { handleListFunctionModules } from '../../handlers/function_include/readonly/handleListFunctionModules';
import { handleCreateServiceBinding } from '../../handlers/service_binding/high/handleCreateServiceBinding';
import { handleUpdateServiceBinding } from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import { handleValidateServiceBinding } from '../../handlers/service_binding/high/handleValidateServiceBinding';
import { handleRuntimeRunProgram } from '../../handlers/system/high/handleRuntimeRunProgram';
import { handleGetWhereUsed } from '../../handlers/system/readonly/handleGetWhereUsed';
import * as clients from '../../lib/clients';
import { createPackageContentsFetcher } from '../../lib/search-source/packageEnumerator';
import { createPackagePatternResolver } from '../../lib/search-source/packageResolver';
import { skipSapAnswers } from '../../lib/search-source/readFailure';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';
import { levelOf } from '../helpers/nodeLevels';

// The declared variant the boundary checks a type argument against.
mock.method(clients, 'createAdtClient', () => fakeClient);
// SHAPE 3's door: `handleRuntimeRunProgram.ts` reaches its members through
// the on-premise executor (`createOnPremExecutor`, an `AdtExecutor<'onprem'>`).
mock.method(clients, 'createOnPremExecutor', () => ({
  getProgramExecutor: () => programExecutor,
}));

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

let fakeClient: any;
let programExecutor: Record<string, unknown>;

const context = { connection: {} as any, logger: undefined };

describe('SHAPE 1 — a rename, still one call', () => {
  for (const [_n, handler, args, member, step] of [
    [
      'GetWhereUsed',
      handleGetWhereUsed,
      { object_type: 'class', object_name: 'ZCL_X' },
      'getWhereUsed',
      'read where-used',
    ],
    [
      'ListFunctionModules',
      handleListFunctionModules,
      { function_group_name: 'ZFG' },
      'fetchNodeStructure',
      'read node structure',
    ],
    [
      'ListFunctionGroupIncludes',
      handleListFunctionGroupIncludes,
      { function_group_name: 'ZFG' },
      'fetchNodeStructure',
      'read node structure',
    ],
    [
      'ValidateServiceBinding',
      handleValidateServiceBinding,
      {
        service_binding_name: 'ZSB',
        service_definition_name: 'ZSD',
        package_name: 'ZPKG',
      },
      'validate',
      undefined,
    ],
    [
      'UpdateServiceBinding',
      handleUpdateServiceBinding,
      {
        service_binding_name: 'ZSB',
        desired_publication_state: 'published',
        binding_variant: 'ODATA_V4_UI',
        service_name: 'ZSRV',
      },
      'update',
      'publish',
    ],
  ]) {
    it(
      format(
        '%s calls the member that replaced it and surfaces its refusal',
        _n,
      ),
      async () => {
        fakeClient = fakeClientOf({
          [member as string]: async () => refusedResponse('Refused'),
        });
        const result: any = await (handler as any)(context as any, args);
        assert.equal(result.isError, true);
        assert.equal(JSON.parse(result.content[0].text).message, 'Refused');
        // The refusal as it came; a handler of several steps adds the one it
        // arose at, and a single call adds none.
        assert.equal(JSON.parse(result.content[0].text).step, step);
      },
    );
  }

  it('ValidateServiceBinding passes analyseException, not analyseException', async () => {
    const seen: unknown[] = [];
    fakeClient = fakeClientOf({
      validate: async (_config: unknown, options: any) => {
        seen.push(options?.analyse);
        return okResponse(reading({}, '', 200));
      },
    });
    await handleValidateServiceBinding(context as any, {
      service_binding_name: 'ZSB',
      service_definition_name: 'ZSD',
      package_name: 'ZPKG',
    });
    assert.deepStrictEqual(seen, [analyseException]);
  });

  it('packageResolver searches through the renamed member, with a strategy', async () => {
    const seen: unknown[] = [];
    fakeClient = fakeClientOf({
      search: async (_c: unknown, o: any) => {
        seen.push(o?.analyse);
        return okResponse([]);
      },
    });
    const fn = createPackagePatternResolver(context as any);
    await fn({ query: 'ZMCP*', objectType: 'DEVC', maxResults: 1000 });
    assert.deepStrictEqual(seen, [analyseException]);
  });
});

describe('ListFunctionModules/ListFunctionGroupIncludes ask for the right child type', () => {
  // The shared SHAPE 1 refusal test above proves the first (root)
  // `fetchNodeStructure` call is reached; it never inspects which child
  // type code either handler asks the root's `childNodes` for. Swapping
  // `FUGR/FF` and `FUGR/I` between the two handler files would still pass
  // every test above — this pins the outcome instead: two children on the
  // root, one FUGR/FF, one FUGR/I, each with a distinct object one level
  // down, and each handler must come back with the ONE that belongs to it.
  function fakeFunctionGroupClient() {
    return fakeClientOf({
      fetchNodeStructure: async (
        _parentType: unknown,
        _parentName: unknown,
        options?: any,
      ) => {
        // `fetchNodeStructure` through `ourUtils` (`node: nodeLevel`)
        // answers a plain `NodeLevel` — `{ objects, childNodes }` — not an
        // `AdtReading`-wrapped one; `nodeLevel` is a bare `IResultStrategy`,
        // never passed through `reading.ts`'s `reading()` helper.
        if (!options?.nodeId) {
          return okResponse(
            levelOf(
              [],
              [
                { type: 'FUGR/FF', nodeId: '1' },
                { type: 'FUGR/I', nodeId: '2' },
              ],
            ),
          );
        }
        if (options.nodeId === '1') {
          return okResponse(
            levelOf([{ name: 'Z_FM_ONLY', type: 'FUGR/FF' }], []),
          );
        }
        return okResponse(levelOf([{ name: 'LFGTOP', type: 'FUGR/I' }], []));
      },
    });
  }

  it('ListFunctionModules reads the FUGR/FF child, not FUGR/I', async () => {
    fakeClient = fakeFunctionGroupClient();
    const result: any = await handleListFunctionModules(context as any, {
      function_group_name: 'ZFG',
      detail: 'full',
    });
    assert.deepStrictEqual(
      JSON.parse(result.content[0].text).function_modules,
      ['Z_FM_ONLY'],
    );
  });

  it('ListFunctionModules terse, by default: the group and total, then one name per row', async () => {
    fakeClient = fakeFunctionGroupClient();
    const result: any = await handleListFunctionModules(context as any, {
      function_group_name: 'ZFG',
    });
    assert.equal(
      result.content[0].text,
      '# function_group ZFG\n# total 1\nname\turi\tdescription\nZ_FM_ONLY\t\t',
    );
  });

  // Full carries no less than medium (Codex P2): every field medium answers
  // is in full too.
  it('ListFunctionModules full holds every field medium answers', async () => {
    fakeClient = fakeFunctionGroupClient();
    const medium = JSON.parse(
      (
        (await handleListFunctionModules(context as any, {
          function_group_name: 'ZFG',
          detail: 'medium',
        })) as any
      ).content[0].text,
    );
    fakeClient = fakeFunctionGroupClient();
    const full = JSON.parse(
      (
        (await handleListFunctionModules(context as any, {
          function_group_name: 'ZFG',
          detail: 'full',
        })) as any
      ).content[0].text,
    );
    for (const [i, object] of medium.function_modules.entries()) {
      for (const [key, value] of Object.entries(object)) {
        assert.deepStrictEqual(full.objects[i][key], value, key);
      }
    }
  });

  it('ListFunctionGroupIncludes reads the FUGR/I child, not FUGR/FF', async () => {
    fakeClient = fakeFunctionGroupClient();
    const result: any = await handleListFunctionGroupIncludes(context as any, {
      function_group_name: 'ZFG',
      detail: 'full',
    });
    assert.deepStrictEqual(JSON.parse(result.content[0].text).includes, [
      'LFGTOP',
    ]);
  });

  it('ListFunctionGroupIncludes terse, by default: one name per row', async () => {
    fakeClient = fakeFunctionGroupClient();
    const result: any = await handleListFunctionGroupIncludes(context as any, {
      function_group_name: 'ZFG',
    });
    assert.equal(
      result.content[0].text,
      '# function_group ZFG\n# total 1\nname\turi\tdescription\nLFGTOP\t\t',
    );
  });

  for (const [_n, handler] of [
    ['ListFunctionModules', handleListFunctionModules],
    ['ListFunctionGroupIncludes', handleListFunctionGroupIncludes],
  ]) {
    it(
      format(
        '%s tells a nonexistent function group apart from an empty one — refuses on readMetadata, before the walk',
        _n,
      ),
      async () => {
        const walk = mock.fn();
        fakeClient = fakeClientOf({
          readMetadata: async () =>
            refusedResponse('Function group ZFG not found'),
          fetchNodeStructure: walk,
        });
        const result: any = await (handler as any)(context as any, {
          function_group_name: 'ZFG',
        });
        assert.equal(result.isError, true);
        assert.equal(
          JSON.parse(result.content[0].text).message,
          'Function group ZFG not found',
        );
        assert.equal(walk.mock.callCount(), 0);
      },
    );
  }
});

describe('SHAPE 2 — the lib files: no MCP result, and no removed member', () => {
  it('packageEnumerator walks rather than calling the removed member', async () => {
    const walked: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async (_type: unknown, name: unknown) => {
        walked.push(String(name));
        // Plain `NodeLevel`, not `AdtReading`-wrapped — see the comment in
        // the FUGR/FF-vs-FUGR/I describe block above for why.
        return okResponse(levelOf([], []));
      },
      // If the handler still named `getPackageContentsList` this would be
      // reached instead of the walk above, and the assertion below would
      // fail on an empty `walked` array.
      getPackageContentsList: async () => {
        throw new Error('getPackageContentsList must not be called');
      },
    });
    const fetcher = createPackageContentsFetcher(
      context as any,
      skipSapAnswers,
    );
    const contents = await fetcher('ZMCP_SHR_PKG', {
      includeSubpackages: false,
    });
    assert.ok(walked.includes('ZMCP_SHR_PKG'));
    assert.deepStrictEqual(contents, []);
  });
});

describe('SHAPE 3 — the program-profiling handler: two calls where there was one', () => {
  const PROGRAM_REQUEST = 'profiler-request-1';

  const profiling = [
    [
      'RuntimeRunProgram',
      handleRuntimeRunProgram,
      { program_name: 'ZP', profile: true },
    ],
  ] as const;

  for (const [_n, handler, args] of profiling) {
    it(
      format('%s passes the scheduled id to the profiler run', _n),
      async () => {
        const order: string[] = [];
        let passed: unknown;
        programExecutor = {
          scheduleTrace: async () => {
            order.push('schedule');
            return okResponse(PROGRAM_REQUEST);
          },
          runWithProfiler: async (_target: unknown, options: any) => {
            order.push('run');
            passed = options?.profilerId;
            return okResponse('program output');
          },
        };
        const result: any = await (handler as any)(context as any, args);
        assert.deepStrictEqual(order, ['schedule', 'run']);
        assert.equal(passed, PROGRAM_REQUEST);
        assert.equal(result.isError, false);
      },
    );
  }

  for (const [_n, handler, args] of profiling) {
    it(format('%s stops at the first refused step', _n), async () => {
      const run = mock.fn();
      programExecutor = {
        scheduleTrace: async () => refusedResponse('Trace scheduling refused'),
        runWithProfiler: run,
      };
      const result: any = await (handler as any)(context as any, args);
      assert.equal(result.isError, true);
      assert.equal(
        JSON.parse(result.content[0].text).message,
        'Trace scheduling refused',
      );
      assert.equal(run.mock.callCount(), 0);
    });
  }
});

describe('SHAPE 4a — UpdateServiceBinding: one call, no successor of the composite shape', () => {
  const args = {
    service_binding_name: 'ZSB',
    desired_publication_state: 'published' as const,
    binding_variant: 'ODATA_V4_UI' as const,
    service_name: 'ZSRV',
  };

  it('locks before update and unlocks after with the SAME handle, passing the documented timeout and analysePublication — the publication verdict adt-clients 22 applied on its own', async () => {
    const order: string[] = [];
    const seen: Record<string, unknown> = {};
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('LOCK_HANDLE_1');
      },
      update: async (config: any, options: any) => {
        order.push('update');
        seen.config = config;
        seen.options = options;
        return okResponse(reading(undefined, '', 200));
      },
      unlock: async (_config: unknown, lockHandle: unknown) => {
        order.push('unlock');
        seen.unlockedWith = lockHandle;
        return okResponse(undefined);
      },
    });
    const result: any = await handleUpdateServiceBinding(context as any, args);
    assert.equal(result.isError, false);
    assert.deepStrictEqual(order, ['lock', 'update', 'unlock']);
    assert.deepStrictEqual(seen.config, {
      bindingName: 'ZSB',
      desiredPublicationState: 'published',
      serviceType: 'odatav4',
    });
    // The lock handle, a timeout and `analysePublication` travel through
    // options: adt-clients 23 no longer reads SAP's publication refusal on its
    // own. `classifyServiceBinding` is not called: there was never a second
    // member in the removed composite's replacement to call.
    assert.equal((seen.options as any).lockHandle, 'LOCK_HANDLE_1');
    // No deadline of the server's (19.0.0): `0` — not absent, which would
    // take adt-clients' 120 s default into a job measured to run longer.
    assert.equal((seen.options as any).timeout, 0);
    assert.equal((seen.options as any).analyse, analysePublication);
    // The handle `unlock` releases is the one `lock` answered — a wrong or
    // constant handle would still pass every assertion above.
    assert.equal(seen.unlockedWith, 'LOCK_HANDLE_1');
  });

  it("refuses 'unchanged' before building any client", async () => {
    fakeClient = fakeClientOf({
      update: () => {
        throw new Error('update must not be called for unchanged');
      },
    });
    const result: any = await handleUpdateServiceBinding(context as any, {
      ...args,
      desired_publication_state: 'unchanged',
    });
    assert.equal(result.isError, true);
    // `return_error` (not `answer()`'s failure path — this check runs
    // before any client is built) answers plain text, not a JSON envelope.
    assert.ok(result.content[0].text.includes("Cannot update to 'unchanged'"));
  });
});

describe('SHAPE 4b — CreateServiceBinding: create, then activate and read the service group', () => {
  const args = {
    service_binding_name: 'ZSB',
    service_definition_name: 'ZSD',
    package_name: 'ZPKG',
  };

  it('calls create, activate and getServiceGroup in order when activate is not disabled', async () => {
    const order: string[] = [];
    fakeClient = fakeClientOf({
      create: async () => {
        order.push('create');
        return okResponse(reading(undefined, '', 200));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading(undefined, '', 200));
      },
      getServiceGroup: async () => {
        order.push('serviceGroup');
        return okResponse(reading(undefined, '', 200));
      },
    });
    const result: any = await handleCreateServiceBinding(context as any, args);
    assert.deepStrictEqual(order, ['create', 'activate', 'serviceGroup']);
    assert.equal(result.isError, false);
  });

  // The "answer is the create's own" fix bites only past `terse`: both a
  // correct handler and one that (wrongly) answered the service group's response
  // say the same word, `'SUCCESS'`, at the default detail — `terseWrite`
  // only reads the HTTP status, not which step it came from. `detail: 'full'`
  // is what actually shows which document travelled back to the caller.
  it("answers create's own document at detail:'full', not the service group's", async () => {
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading('<CREATED_DOCUMENT/>')),
      activate: async () => okResponse(reading(undefined, '', 200)),
      getServiceGroup: async () =>
        okResponse(reading({ marker: 'GROUP_DOCUMENT' })),
    });
    const result: any = await handleCreateServiceBinding(context as any, {
      ...args,
      detail: 'full',
    });
    assert.equal(result.isError, false);
    const text = result.content[0].text;
    assert.ok(text.includes('CREATED_DOCUMENT'));
    assert.ok(!text.includes('GROUP_DOCUMENT'));
  });

  it('stops at the first refused step and never reaches activate or the read', async () => {
    const activate = mock.fn();
    const readGroup = mock.fn();
    fakeClient = fakeClientOf({
      create: async () => refusedResponse('Name already exists'),
      activate,
      getServiceGroup: readGroup,
    });
    const result: any = await handleCreateServiceBinding(context as any, args);
    assert.equal(result.isError, true);
    assert.equal(
      JSON.parse(result.content[0].text).message,
      'Name already exists',
    );
    assert.equal(activate.mock.callCount(), 0);
    assert.equal(readGroup.mock.callCount(), 0);
  });

  it('skips activate and the read when activate: false', async () => {
    const activate = mock.fn();
    const readGroup = mock.fn();
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading(undefined, '', 200)),
      activate,
      getServiceGroup: readGroup,
    });
    const result: any = await handleCreateServiceBinding(context as any, {
      ...args,
      activate: false,
    });
    assert.equal(result.isError, false);
    assert.equal(activate.mock.callCount(), 0);
    assert.equal(readGroup.mock.callCount(), 0);
  });
});

// `GetStructuresList` (`getWhereUsedList`'s other consumer) is deliberately
// NOT in the shared SHAPE 1 `it.each` above: its real, pre-existing contract
// (issue #128) is to DEGRADE on a where-used failure — `appends_unavailable:
// true` under `isError: false` — not to surface a top-level `isError: true`.
// `handleGetStructuresListAppends.test.ts`, updated alongside this migration
// to mock the new `getWhereUsedScope`/`modifyWhereUsedScope`/`getWhereUsed`
// sequence in place of the removed `getWhereUsedList`, is where that
// contract (TABL/DS scoping, structure-then-table fallback, the flag itself)
// is proven; asserting it again here under the wrong shape would fail for
// the right reason but the wrong assertion.

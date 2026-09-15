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
 *    first request to fail) and the two unit-test run tools, which were
 *    never migrated to `create()`: `AdtUnitTest.run(tests, options)` is
 *    what "start a run, answer its id" always meant, confirmed against
 *    `AdtUnitTest.d.ts`'s own doc comment ("`create` meant 'start a run'"
 *    only until 12.0.0) and its argument shapes
 *    (`IClassUnitTestDefinition[]`/`IClassUnitTestRunOptions`), which are
 *    exactly what these two handlers already built.
 *  - SHAPE 2 — the two `lib/search-source` files, tested at the module
 *    boundary they actually have (no MCP result).
 *  - SHAPE 3 — the two program-profiling handlers: `new AdtExecutor(...)
 *    .getProgramExecutor()`, not `createAdtClient`, so they need the
 *    `AdtExecutor` mock door instead of `../../lib/clients`.
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
 *        `create()`'s own `.d.ts` comment claims it "activates and
 *        generates" but its shipped body is one request only
 *        (`createRequest`) — this handler composes `activate()` and
 *        `generateServiceBinding()` itself, gated on `activate !== false`.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  analyseValidation,
} from '@mcp-abap-adt/adt-strategies';
import { handleListFunctionGroupIncludes } from '../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { handleListFunctionModules } from '../../handlers/function_include/readonly/handleListFunctionModules';
import { handleCreateServiceBinding } from '../../handlers/service_binding/high/handleCreateServiceBinding';
import {
  handleUpdateServiceBinding,
  PUBLISH_TIMEOUT_MS,
} from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import { handleValidateServiceBinding } from '../../handlers/service_binding/high/handleValidateServiceBinding';
import { handleGetWhereUsed } from '../../handlers/system/readonly/handleGetWhereUsed';
import { handleRuntimeRunProgram } from '../../handlers/system/readonly/handleRuntimeRunProgram';
import { handleRuntimeRunProgramWithProfiling } from '../../handlers/system/readonly/handleRuntimeRunProgramWithProfiling';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';
import { createPackageContentsFetcher } from '../../lib/search-source/packageEnumerator';
import { createPackagePatternResolver } from '../../lib/search-source/packageResolver';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

// SHAPE 3's door: `handleRuntimeRunProgram.ts`/`handleRuntimeRunProgramWithProfiling.ts`
// do not go through `createAdtClient` — each writes `new AdtExecutor(connection,
// logger)` directly and reaches its members through `executor.getProgramExecutor()`,
// so the `../../lib/clients` mock above does nothing for them. `jest.mock` must sit
// at module top level (not nested in a `describe`) for babel-plugin-jest-hoist to
// hoist it above the handlers' own `import { AdtExecutor } from
// '@mcp-abap-adt/adt-clients'` — nested inside a `describe` callback it runs too
// late, after those imports already bound the real class.
let programExecutor: Record<string, unknown>;
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtExecutor: jest.fn(() => ({ getProgramExecutor: () => programExecutor })),
}));

const context = { connection: {} as any, logger: undefined };

describe('SHAPE 1 — a rename, still one call', () => {
  it.each([
    [
      'GetWhereUsed',
      handleGetWhereUsed,
      { object_type: 'class', object_name: 'ZCL_X' },
      'getWhereUsed',
    ],
    [
      'ListFunctionModules',
      handleListFunctionModules,
      { function_group_name: 'ZFG' },
      'fetchNodeStructure',
    ],
    [
      'ListFunctionGroupIncludes',
      handleListFunctionGroupIncludes,
      { function_group_name: 'ZFG' },
      'fetchNodeStructure',
    ],
    [
      'ValidateServiceBinding',
      handleValidateServiceBinding,
      { service_binding_name: 'ZSB', service_definition_name: 'ZSD' },
      'validate',
    ],
    [
      'CreateUnitTest',
      handleCreateUnitTest,
      { tests: [{ container_class: 'ZCL_X', test_class: 'LTCL_X' }] },
      'run',
    ],
    [
      'RunUnitTest',
      handleRunUnitTest,
      { tests: [{ container_class: 'ZCL_X', test_class: 'LTCL_X' }] },
      'run',
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
    ],
  ])('%s calls the member that replaced it and surfaces its refusal', async (_n, handler, args, member) => {
    fakeClient = fakeClientOf({
      [member as string]: async () => refusedResponse('Refused'),
    });
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe('Refused');
    expect(result.content[0].text).not.toContain('step');
  });

  it('ValidateServiceBinding passes analyseValidation, not analyseException', async () => {
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
    });
    expect(seen).toEqual([analyseValidation]);
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
    expect(seen).toEqual([analyseException]);
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
          return okResponse({
            objects: [],
            childNodes: [
              { type: 'FUGR/FF', nodeId: '1' },
              { type: 'FUGR/I', nodeId: '2' },
            ],
          });
        }
        if (options.nodeId === '1') {
          return okResponse({
            objects: [{ name: 'Z_FM_ONLY', type: 'FUGR/FF' }],
            childNodes: [],
          });
        }
        return okResponse({
          objects: [{ name: 'LFGTOP', type: 'FUGR/I' }],
          childNodes: [],
        });
      },
    });
  }

  it('ListFunctionModules reads the FUGR/FF child, not FUGR/I', async () => {
    fakeClient = fakeFunctionGroupClient();
    const result: any = await handleListFunctionModules(context as any, {
      function_group_name: 'ZFG',
    });
    expect(JSON.parse(result.content[0].text).function_modules).toEqual([
      'Z_FM_ONLY',
    ]);
  });

  it('ListFunctionGroupIncludes reads the FUGR/I child, not FUGR/FF', async () => {
    fakeClient = fakeFunctionGroupClient();
    const result: any = await handleListFunctionGroupIncludes(context as any, {
      function_group_name: 'ZFG',
    });
    expect(JSON.parse(result.content[0].text).includes).toEqual(['LFGTOP']);
  });

  it.each([
    ['ListFunctionModules', handleListFunctionModules],
    ['ListFunctionGroupIncludes', handleListFunctionGroupIncludes],
  ])('%s tells a nonexistent function group apart from an empty one — refuses on readMetadata, before the walk', async (_n, handler) => {
    const walk = jest.fn();
    fakeClient = fakeClientOf({
      readMetadata: async () => refusedResponse('Function group ZFG not found'),
      fetchNodeStructure: walk,
    });
    const result: any = await (handler as any)(context as any, {
      function_group_name: 'ZFG',
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Function group ZFG not found',
    );
    expect(walk).not.toHaveBeenCalled();
  });
});

describe('SHAPE 2 — the lib files: no MCP result, and no removed member', () => {
  it('packageEnumerator walks rather than calling the removed member', async () => {
    const walked: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async (_type: unknown, name: unknown) => {
        walked.push(String(name));
        // Plain `NodeLevel`, not `AdtReading`-wrapped — see the comment in
        // the FUGR/FF-vs-FUGR/I describe block above for why.
        return okResponse({ objects: [], childNodes: [] });
      },
      // If the handler still named `getPackageContentsList` this would be
      // reached instead of the walk above, and the assertion below would
      // fail on an empty `walked` array.
      getPackageContentsList: async () => {
        throw new Error('getPackageContentsList must not be called');
      },
    });
    const fetcher = createPackageContentsFetcher(context as any);
    const items = await fetcher('ZMCP_SHR_PKG', { includeSubpackages: false });
    expect(walked).toContain('ZMCP_SHR_PKG');
    expect(items).toEqual([]);
  });
});

describe('SHAPE 3 — the two program-profiling handlers: two calls where there was one', () => {
  const PROGRAM_REQUEST = 'profiler-request-1';

  const profiling = [
    [
      'RuntimeRunProgram',
      handleRuntimeRunProgram,
      { program_name: 'ZP', profile: true },
    ],
    [
      'RuntimeRunProgramWithProfiling',
      handleRuntimeRunProgramWithProfiling,
      { program_name: 'ZP' },
    ],
  ] as const;

  it.each(
    profiling,
  )('%s passes the scheduled id to the profiler run', async (_n, handler, args) => {
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
    expect(order).toEqual(['schedule', 'run']);
    expect(passed).toBe(PROGRAM_REQUEST);
    expect(result.isError).toBe(false);
  });

  it.each(
    profiling,
  )('%s stops at the first refused step', async (_n, handler, args) => {
    const run = jest.fn();
    programExecutor = {
      scheduleTrace: async () => refusedResponse('Trace scheduling refused'),
      runWithProfiler: run,
    };
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Trace scheduling refused',
    );
    expect(run).not.toHaveBeenCalled();
  });
});

describe('SHAPE 4a — UpdateServiceBinding: one call, no successor of the composite shape', () => {
  const args = {
    service_binding_name: 'ZSB',
    desired_publication_state: 'published' as const,
    binding_variant: 'ODATA_V4_UI' as const,
    service_name: 'ZSRV',
  };

  it('locks before update and unlocks after with the SAME handle, passing the documented timeout but no analyse — the library default (publicationRefusal) is the tailored verdict', async () => {
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
    expect(result.isError).toBe(false);
    expect(order).toEqual(['lock', 'update', 'unlock']);
    expect(seen.config).toEqual({
      bindingName: 'ZSB',
      desiredPublicationState: 'published',
      serviceType: 'odatav4',
    });
    // The lock handle and a timeout travel through options — but never a
    // strategy. `classifyServiceBinding` is not called either: there was
    // never a second member in the removed composite's replacement to call.
    expect((seen.options as any).lockHandle).toBe('LOCK_HANDLE_1');
    // Against the documented worst case itself, not "anything past the
    // 120s default" — a value one second past the default would satisfy a
    // loose bound and still fall short of what the job is measured to take.
    expect((seen.options as any).timeout).toBe(PUBLISH_TIMEOUT_MS);
    expect('analyse' in (seen.options as any)).toBe(false);
    // The handle `unlock` releases is the one `lock` answered — a wrong or
    // constant handle would still pass every assertion above.
    expect(seen.unlockedWith).toBe('LOCK_HANDLE_1');
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
    expect(result.isError).toBe(true);
    // `return_error` (not `answer()`'s failure path — this check runs
    // before any client is built) answers plain text, not a JSON envelope.
    expect(result.content[0].text).toContain("Cannot update to 'unchanged'");
  });
});

describe('SHAPE 4b — CreateServiceBinding: create, then activate and generate', () => {
  const args = {
    service_binding_name: 'ZSB',
    service_definition_name: 'ZSD',
    package_name: 'ZPKG',
  };

  it('calls create, activate and generateServiceBinding in order when activate is not disabled', async () => {
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
      generateServiceBinding: async () => {
        order.push('generate');
        return okResponse(reading(undefined, '', 200));
      },
    });
    const result: any = await handleCreateServiceBinding(context as any, args);
    expect(order).toEqual(['create', 'activate', 'generate']);
    expect(result.isError).toBe(false);
  });

  // The "answer is the create's own" fix bites only past `terse`: both a
  // correct handler and one that (wrongly) answered `generated`'s response
  // say the same word, `'SUCCESS'`, at the default detail — `terseWrite`
  // only reads the HTTP status, not which step it came from. `detail: 'full'`
  // is what actually shows which document travelled back to the caller.
  it("answers create's own document at detail:'full', not generate's", async () => {
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading('<CREATED_DOCUMENT/>')),
      activate: async () => okResponse(reading(undefined, '', 200)),
      generateServiceBinding: async () =>
        okResponse(reading({ marker: 'GENERATED_DOCUMENT' })),
    });
    const result: any = await handleCreateServiceBinding(context as any, {
      ...args,
      detail: 'full',
    });
    expect(result.isError).toBe(false);
    const text = result.content[0].text;
    expect(text).toContain('CREATED_DOCUMENT');
    expect(text).not.toContain('GENERATED_DOCUMENT');
  });

  it('stops at the first refused step and never reaches activate/generate', async () => {
    const activate = jest.fn();
    const generate = jest.fn();
    fakeClient = fakeClientOf({
      create: async () => refusedResponse('Name already exists'),
      activate,
      generateServiceBinding: generate,
    });
    const result: any = await handleCreateServiceBinding(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Name already exists',
    );
    expect(activate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('skips activate/generate when activate: false', async () => {
    const activate = jest.fn();
    const generate = jest.fn();
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading(undefined, '', 200)),
      activate,
      generateServiceBinding: generate,
    });
    const result: any = await handleCreateServiceBinding(context as any, {
      ...args,
      activate: false,
    });
    expect(result.isError).toBe(false);
    expect(activate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
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

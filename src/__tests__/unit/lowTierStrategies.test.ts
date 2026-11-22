/**
 * Cluster 14: `class`, `interface`, `behavior_definition`, `behavior_implementation`.
 * Cluster 15: `ddl`, `ddlx` (metadataExtension), `structure`, `table`.
 * Cluster 16: `program`, `function` (function group and function module — the
 * families named `function_group` and `function_include` in the brief have
 * no `low/` directory of their own; every function-group low-tier operation
 * lives in `src/handlers/function/low/*FunctionGroup*`, and function includes
 * have no low tier at all).
 *
 * Task 10's per-operation table (Create/Update -> analyseException, statusOnly,
 * terseWrite; Check -> analyseException, structured, terseCheck; Activate ->
 * analyseActivation; Validate -> analyseException; Delete -> analyseDeletion;
 * Lock/Unlock -> no strategy at all) applies unchanged across every family in
 * this cluster. What differs per family is the factory, the shipped result
 * set and the config key — this file pins the pairing per family rather than
 * trusting the prose, because what goes wrong at this scale is a handler
 * taking the wrong `analyse`, or worse, the right `analyse` on the wrong
 * member or the wrong factory.
 *
 * **Filtering by member, not `.at(-1)`.** A call recorded under the wrong
 * member (e.g. `validate` when `activate` was expected) would still satisfy
 * `seen.calls.at(-1)` — it is, after all, the last call. Only filtering by
 * the member name the operation should have used, and failing on `undefined`
 * when it did not, catches a handler that reached the wrong endpoint while
 * still passing a real strategy function.
 *
 * **Filtering by factory too.** `class` and `behavior_implementation` share
 * `classDocuments`' exact shape and the same config key (`className`), so a
 * swap between `getClass` and `getBehaviorImplementation` is invisible to
 * every reading and every projection — only the factory name proves which
 * one ran. Every row below carries its expected factory as its own column,
 * asserted the same way on every family, not only the one pair that happens
 * to share a shape.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import { handleActivateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import { handleCheckBehaviorDefinition } from '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleActivateClass } from '../../handlers/class/low/handleActivateClass';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { handleUpdateClass } from '../../handlers/class/low/handleUpdateClass';
import { handleActivateDataElement } from '../../handlers/data_element/low/handleActivateDataElement';
import { handleCheckDataElement } from '../../handlers/data_element/low/handleCheckDataElement';
import { handleUpdateDataElement } from '../../handlers/data_element/low/handleUpdateDataElement';
import { handleActivateDdl } from '../../handlers/ddl/low/handleActivateDdl';
import { handleCheckDdl } from '../../handlers/ddl/low/handleCheckDdl';
import { handleUpdateDdl } from '../../handlers/ddl/low/handleUpdateDdl';
import { handleActivateMetadataExtension } from '../../handlers/ddlx/low/handleActivateMetadataExtension';
import { handleCheckMetadataExtension } from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import { handleUpdateMetadataExtension } from '../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleCheckDomain as handleCheckDomainLowForVersion } from '../../handlers/domain/low/handleCheckDomain';
import { handleActivateFunctionGroup } from '../../handlers/function/low/handleActivateFunctionGroup';
import { handleActivateFunctionModule } from '../../handlers/function/low/handleActivateFunctionModule';
import { handleCheckFunctionGroup } from '../../handlers/function/low/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../handlers/function/low/handleCheckFunctionModule';
import { handleUpdateFunctionModule } from '../../handlers/function/low/handleUpdateFunctionModule';
import { handleActivateInterface } from '../../handlers/interface/low/handleActivateInterface';
import { handleCheckInterface } from '../../handlers/interface/low/handleCheckInterface';
import { handleUpdateInterface } from '../../handlers/interface/low/handleUpdateInterface';
import type { HandlerContext } from '../../handlers/interfaces';
import { handleDeletePackage } from '../../handlers/package/high/handleDeletePackage';
import { handleCheckPackage } from '../../handlers/package/low/handleCheckPackage';
import { handleUpdatePackage } from '../../handlers/package/low/handleUpdatePackage';
import {
  TOOL_DEFINITION as ActivateProgramLowTool,
  handleActivateProgram,
} from '../../handlers/program/low/handleActivateProgram';
import { handleCheckProgram } from '../../handlers/program/low/handleCheckProgram';
import {
  handleUpdateProgram,
  TOOL_DEFINITION as UpdateProgramLowTool,
} from '../../handlers/program/low/handleUpdateProgram';
import { handleActivateServiceBinding } from '../../handlers/service_binding/low/handleActivateServiceBinding';
import { handleActivateServiceDefinition } from '../../handlers/service_definition/low/handleActivateServiceDefinition';
import { handleActivateStructure } from '../../handlers/structure/low/handleActivateStructure';
import { handleCheckStructure } from '../../handlers/structure/low/handleCheckStructure';
import { handleUpdateStructure } from '../../handlers/structure/low/handleUpdateStructure';
import { handleGetNodeStructure } from '../../handlers/system/low/handleGetNodeStructure';
import { handleGetVirtualFolders } from '../../handlers/system/low/handleGetVirtualFolders';
import { handleActivateTable } from '../../handlers/table/low/handleActivateTable';
import { handleCheckTable } from '../../handlers/table/low/handleCheckTable';
import { handleUpdateTable } from '../../handlers/table/low/handleUpdateTable';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import * as clients from '../../lib/clients';
import { listedTool } from '../../lib/listedTool';
import { analyseDeletion } from '../../lib/strategies/deletionRefusal';
import { analyseLock } from '../../lib/strategies/lockAnswer';
import { structured, verbatim } from '../../lib/strategies/reading';
import { resetSystemContextCache } from '../../lib/systemContext';
import { sessionContext } from '../../lib/utils';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import {
  answerThrough,
  fakeClientOf,
  fakeClientOfWithFactory,
  fakeClientThroughSet,
  okResponse,
  reading as readingOf,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';
import {
  moduleMetadataDocument,
  readsModuleIn,
} from '../helpers/functionModuleMetadata';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';
import { stateSystemKind } from '../helpers/systemKind';

// The declared variant the boundary checks a type argument against.
// The declared variant: the kind stated, read by the real variantOf.
stateSystemKind('onprem');
mock.method(clients, 'createAdtClient', () => fakeClient);
mock.method(clients, 'createOnPremAdtClient', () => fakeClient);

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.calls` needs this wiring; tests that need a real document
// swap `fakeClient` to `fakeClientOf(...)` for their own call and restore it.
const seen = recordAnalyse({
  // A function module's metadata names the group the calls give (#2).
  'getFunctionModule.readMetadata': () => {
    const document = moduleMetadataDocument('ZFM_X', 'ZFG_X');
    return readingOf(document, document);
  },
});
let fakeClient: unknown = seen.client;

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

/** A connection that names a session id of its own. */
const connectionSessionContext = {
  connection: { getSessionId: () => 'CONN_SESSION' } as any,
  logger: undefined,
};

beforeEach(() => {
  seen.calls.length = 0;
  fakeClient = seen.client;
});

/** The last call recorded against a given member — never "the last call of any kind". */
const callTo = (member: string) =>
  seen.calls.filter((c) => c.member === member).at(-1);

/**
 * The activation strategy, family by family (restored in 19.0.0 from the
 * table the low set's suite carried, its delete and validate columns left
 * with their handlers): each Activate handler that backs a high Activate
 * tool reaches its own factory's `activate` with `analyseActivation`.
 */
for (const [_family, activate, factory, args] of [
  [
    'class',
    handleActivateClass,
    'getClass',
    {
      class_name: 'ZCL_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'interface',
    handleActivateInterface,
    'getInterface',
    {
      interface_name: 'ZIF_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'behavior_definition',
    handleActivateBehaviorDefinition,
    'getBehaviorDefinition',
    {
      name: 'ZBDEF_X',
      package_name: 'ZP',
      description: 'x',
      root_entity: 'ZI_X',
      implementation_type: 'Managed',
      lock_handle: 'h',
    },
  ],
  [
    'ddl',
    handleActivateDdl,
    'getDdl',
    {
      ddl_name: 'ZVW_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'ddlx (metadataExtension)',
    handleActivateMetadataExtension,
    'getMetadataExtension',
    {
      name: 'ZI_X_DDLX',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'structure',
    handleActivateStructure,
    'getStructure',
    {
      structure_name: 'ZST_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'table',
    handleActivateTable,
    'getTable',
    {
      table_name: 'ZT_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'program',
    handleActivateProgram,
    'getProgram',
    {
      program_name: 'Z_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'function (function group)',
    handleActivateFunctionGroup,
    'getFunctionGroup',
    {
      function_group_name: 'ZFG_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'function (function module)',
    handleActivateFunctionModule,
    'getFunctionModule',
    {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'data_element',
    handleActivateDataElement,
    'getDataElement',
    {
      data_element_name: 'ZDT_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
] as const) {
  it(
    format('%s activates on its own factory with analyseActivation', _family),
    async () => {
      await (activate as any)(context as any, args);
      const activateCall = callTo('activate');
      assert.equal(activateCall?.factory, factory);
      assert.equal(activateCall?.carriedAnalyse, true);
      assert.equal(activateCall?.analyse, analyseActivation);
    },
  );
}

describe('class', () => {
  it('CheckClassLow defaults the check member\'s status to "active" when version is omitted', async () => {
    await handleCheckClass(context as any, { class_name: 'ZCL_X' });
    const call = callTo('check');
    assert.equal(call?.factory, 'getClass');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateClassLow passes source via options, not config — the shipped AdtClass.update() only reads it there', async () => {
    await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x IMPLEMENTATION.\nENDCLASS.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getClass');
    assert.deepStrictEqual(call?.args[0], { className: 'ZCL_X' });
    assertMatchObject(call?.args[1], {
      source: 'CLASS zcl_x IMPLEMENTATION.\nENDCLASS.',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });
});

describe('interface', () => {
  it("CheckInterfaceLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckInterface(context as any, { interface_name: 'ZIF_X' });
    const call = callTo('check');
    assert.equal(call?.factory, 'getInterface');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateInterfaceLow passes source via options, not config — the shipped AdtInterface.update() only reads it there', async () => {
    await handleUpdateInterface(context as any, {
      interface_name: 'ZIF_X',
      source_code: 'INTERFACE zif_x.\nENDINTERFACE.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getInterface');
    assert.deepStrictEqual(call?.args[0], { interfaceName: 'ZIF_X' });
    assertMatchObject(call?.args[1], {
      source: 'INTERFACE zif_x.\nENDINTERFACE.',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateInterfaceLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    // No interface-specific activation fixture exists in the corpus; this
    // shape (`chkl:messages`/`chkl:properties`) is not interface-specific —
    // ActivateDomainLow's own test proves the same document against the same
    // projection.
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateInterface(context as any, {
      interface_name: 'ZIF_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('behavior_definition', () => {
  it("CheckBdefLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckBehaviorDefinition(context as any, { name: 'ZBDEF_X' });
    const call = callTo('check');
    assert.equal(call?.factory, 'getBehaviorDefinition');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateBehaviorDefinitionLow passes source via options and transportRequest via config — the shipped AdtBehaviorDefinition.update() only reads source there', async () => {
    await handleUpdateBehaviorDefinition(context as any, {
      name: 'ZBDEF_X',
      source_code: 'behavior definitions',
      lock_handle: 'h',
      transport_request: 'SIDK900001',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getBehaviorDefinition');
    assert.deepStrictEqual(call?.args[0], {
      name: 'ZBDEF_X',
      transportRequest: 'SIDK900001',
    });
    assertMatchObject(call?.args[1], {
      source: 'behavior definitions',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('CheckBdefLow reads a real corpus document (generic check-verdict fixture) through terseCheck', async () => {
    // No behavior-definition-specific check fixture exists in the corpus;
    // `chkrun:checkRunReports` is not object-type-specific — CheckDomainLow's
    // own test proves the same document against the same projection.
    const reading = structured({
      data: corpusBody('check-success-verdict--01-checkrun'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ check: async () => okResponse(reading) });

    const result: any = await handleCheckBehaviorDefinition(context as any, {
      name: 'ZBDEF_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      ran: true,
      status_text: 'Object ZBP_MCP_SHR_I_ROOT has been checked',
    });
  });
});

describe('ddl', () => {
  it("CheckDdlLow defaults the check member's status to 'active' when version is omitted, and forwards ddl_source via config.source — checkDdl reads it, unlike most sibling families in this cluster", async () => {
    await handleCheckDdl(context as any, {
      ddl_name: 'ZVW_X',
      ddl_source: 'define view ZVW_X as select from t000 {client};',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getDdl');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], {
      ddlName: 'ZVW_X',
      source: 'define view ZVW_X as select from t000 {client};',
    });
    assert.equal(call?.args[1], 'active');
  });

  it('CheckDdlLow passes "active" through to the check member\'s second parameter when asked', async () => {
    await handleCheckDdl(context as any, {
      ddl_name: 'ZVW_X',
      version: 'active',
    });
    const call = callTo('check');
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateDdlLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares', async () => {
    await handleUpdateDdl(context as any, {
      ddl_name: 'ZVW_X',
      ddl_source: 'define view ZVW_X as select from t000 {client};',
      lock_handle: 'h',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getDdl');
    assert.deepStrictEqual(call?.args[0], { ddlName: 'ZVW_X' });
    assertMatchObject(call?.args[1], {
      source: 'define view ZVW_X as select from t000 {client};',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateDdlLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateDdl(context as any, {
      ddl_name: 'ZVW_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('ddlx (metadataExtension)', () => {
  /**
   * This asserted `undefined` — the shipped default, which is the INACTIVE
   * version — until the DDLX checkruns endpoint was measured: it does not
   * fall back to the version that exists, so an activated extension answered
   * `notProcessed` and the tool could not check it at all (#178). The version
   * is named now, and defaults to `active`; `ddlxCheckVersion.test.ts` covers
   * the behaviour against both captured documents, and this keeps pinning
   * what this file is for — the factory, the arguments and the injected
   * reading.
   */
  it('CheckMetadataExtensionLow asks for the active version and carries our analyse — checkMetadataExtension takes no source parameter at all', async () => {
    await handleCheckMetadataExtension(context as any, { name: 'ZI_X_DDLX' });
    const call = callTo('check');
    assert.equal(call?.factory, 'getMetadataExtension');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], { name: 'ZI_X_DDLX' });
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateMetadataExtensionLow passes source via options, not config — the shipped AdtMetadataExtension.update() reads options.source only, with no config fallback (the exact empty-write shape found four times in cluster 14)', async () => {
    await handleUpdateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      source_code: '@Metadata.layer: #CORE\nannotate view ZI_X_DDLX with {}',
      lock_handle: 'h',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getMetadataExtension');
    assert.deepStrictEqual(call?.args[0], { name: 'ZI_X_DDLX' });
    assertMatchObject(call?.args[1], {
      source: '@Metadata.layer: #CORE\nannotate view ZI_X_DDLX with {}',
      lockHandle: 'h',
    });
    // The negative half of the assertion: config carries no source at
    // all, so a regression that moves it back cannot pass silently.
    assert.equal((call?.args[0] as any)?.source, undefined);
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateMetadataExtensionLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('structure', () => {
  it("CheckStructureLow defaults the check member's status to 'active' when version is omitted, and forwards ddl_code via config.source — checkStructure reads it", async () => {
    await handleCheckStructure(context as any, {
      structure_name: 'ZST_X',
      ddl_code: 'define structure zst_x { client : abap.clnt; }',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getStructure');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], {
      structureName: 'ZST_X',
      source: 'define structure zst_x { client : abap.clnt; }',
    });
    assert.equal(call?.args[1], 'active');
  });

  it('CheckStructureLow passes "active" through to the check member\'s second parameter when asked', async () => {
    await handleCheckStructure(context as any, {
      structure_name: 'ZST_X',
      version: 'active',
    });
    const call = callTo('check');
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateStructureLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares', async () => {
    await handleUpdateStructure(context as any, {
      structure_name: 'ZST_X',
      ddl_code: 'define structure zst_x { client : abap.clnt; }',
      lock_handle: 'h',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getStructure');
    assert.deepStrictEqual(call?.args[0], { structureName: 'ZST_X' });
    assertMatchObject(call?.args[1], {
      source: 'define structure zst_x { client : abap.clnt; }',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateStructureLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateStructure(context as any, {
      structure_name: 'ZST_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('table', () => {
  it("CheckTableLow defaults the check member's status to 'active' when version is omitted, and forwards ddl_code as the source checked", async () => {
    await handleCheckTable(context as any, {
      table_name: 'ZT_X',
      ddl_code: 'define table zt_x { client : abap.clnt; }',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getTable');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    // adt-clients 43 sends `config.source` with the check run (#9), as the
    // structure check does: ddl_code reaches it.
    assert.deepStrictEqual(call?.args[0], {
      tableName: 'ZT_X',
      source: 'define table zt_x { client : abap.clnt; }',
    });
    assert.equal(call?.args[1], 'active');
  });

  it('CheckTableLow passes "active" through to the check member\'s second parameter when asked', async () => {
    await handleCheckTable(context as any, {
      table_name: 'ZT_X',
      version: 'active',
    });
    const call = callTo('check');
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateTableLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares; transportRequest belongs in config, which the shipped member reads directly', async () => {
    await handleUpdateTable(context as any, {
      table_name: 'ZT_X',
      ddl_code: 'define table zt_x { client : abap.clnt; }',
      lock_handle: 'h',
      transport_request: 'SIDK900001',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getTable');
    assert.deepStrictEqual(call?.args[0], {
      tableName: 'ZT_X',
      transportRequest: 'SIDK900001',
    });
    assertMatchObject(call?.args[1], {
      source: 'define table zt_x { client : abap.clnt; }',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateTableLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateTable(context as any, {
      table_name: 'ZT_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('program', () => {
  it("CheckProgramLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckProgram(context as any, { program_name: 'Z_X' });
    const call = callTo('check');
    assert.equal(call?.factory, 'getProgram');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], { programName: 'Z_X' });
    assert.equal(call?.args[1], 'active');
  });

  it('UpdateProgramLow passes source via options, not config — the shipped AdtProgram.update() only reads it there', async () => {
    await handleUpdateProgram(context as any, {
      program_name: 'Z_X',
      source_code: 'REPORT z_x.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getProgram');
    assert.deepStrictEqual(call?.args[0], { programName: 'Z_X' });
    assertMatchObject(call?.args[1], {
      source: 'REPORT z_x.',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateProgramLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateProgram(context as any, {
      program_name: 'Z_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });

  // The credential is not the system kind (the owner's rule): what a
  // variant offers is decided where it is listed — `listedTool`, which both
  // registration paths apply (`BaseHandlerGroup.registerOneTool`,
  // `CompositeHandlersRegistry`) — on the declared kind: the variant's ADT
  // type table and the tool's `available_in`. Nothing in a handler reads the
  // credential to refuse. Driven with a JWT credential in `sessionContext`
  // (the store the removed `isCloudConnection()` read first).
  describe('the declared kind, not the credential, decides what is offered', () => {
    const jwtStore: { sapConfig: SapConfig } = {
      sapConfig: {
        url: 'https://example.com',
        authType: 'jwt',
        jwtToken: 'pin-token',
      },
    };

    const rows: Array<
      [string, (...args: any[]) => unknown, string, Record<string, unknown>]
    > = [
      [
        'ActivateProgramLow',
        handleActivateProgram,
        'activate',
        { program_name: 'Z_X' },
      ],
      [
        'UpdateProgramLow',
        handleUpdateProgram,
        'update',
        { program_name: 'Z_X', source_code: 'REPORT z_x.', lock_handle: 'h' },
      ],
    ];

    for (const [_name, handler, member, args] of rows) {
      it(
        format('%s with a JWT credential reaches its member', _name),
        async () => {
          await sessionContext.run(jwtStore, () => handler(context, args));
          assert.notEqual(callTo(member), undefined);
        },
      );
    }

    it('the program writes are listed where onprem is declared, not where cloud is', () => {
      for (const definition of [ActivateProgramLowTool, UpdateProgramLowTool]) {
        assert.deepStrictEqual(
          {
            tool: definition.name,
            onprem: listedTool(definition, 'onprem').listed,
            cloud: listedTool(definition, 'cloud').listed,
          },
          { tool: definition.name, onprem: true, cloud: false },
        );
      }
    });

    // A program's check is served on cloud (`ADT_TYPES_CLOUD` lists it), and
    // `CheckProgram` delegates here.
    it('CheckProgramLow reaches its member with a JWT credential', async () => {
      const typedContext: HandlerContext = {
        connection: recordingConnection(),
        logger: undefined,
      };
      await sessionContext.run(jwtStore, () =>
        handleCheckProgram(typedContext, { program_name: 'Z_X' }),
      );
      assert.notEqual(callTo('check'), undefined);
    });
  });
});

describe('function (function group)', () => {
  it("CheckFunctionGroupLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getFunctionGroup');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], { functionGroupName: 'ZFG_X' });
    assert.equal(call?.args[1], 'active');
  });

  it('ActivateFunctionGroupLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('function (function module)', () => {
  it("CheckFunctionModuleLow defaults the check member's status to 'active' when version is omitted — the pre-migration default, kept", async () => {
    await handleCheckFunctionModule(context as any, {
      function_group_name: 'ZFG_X',
      function_module_name: 'ZFM_X',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getFunctionModule');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.deepStrictEqual(call?.args[0], {
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
    });
    assert.equal(call?.args[1], 'active');
  });

  it('CheckFunctionModuleLow passes "inactive" through to the check member\'s second parameter when asked', async () => {
    await handleCheckFunctionModule(context as any, {
      function_group_name: 'ZFG_X',
      function_module_name: 'ZFM_X',
      version: 'inactive',
    });
    const call = callTo('check');
    assert.equal(call?.args[1], 'inactive');
  });

  it('UpdateFunctionModuleLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares; transportRequest belongs in config, which the shipped member reads directly', async () => {
    await handleUpdateFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
      source_code: 'FUNCTION zfm_x.\nENDFUNCTION.',
      lock_handle: 'h',
      transport_request: 'SIDK900001',
    });
    const call = callTo('update');
    assert.equal(call?.factory, 'getFunctionModule');
    assert.deepStrictEqual(call?.args[0], {
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
      transportRequest: 'SIDK900001',
    });
    assertMatchObject(call?.args[1], {
      source: 'FUNCTION zfm_x.\nENDFUNCTION.',
      lockHandle: 'h',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('ActivateFunctionModuleLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({
      readMetadata: readsModuleIn('ZFG_X', 'ZFM_X'),
      activate: async () => okResponse(reading),
    });

    const result: any = await handleActivateFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Task 17: data_element, package, service_binding, service_definition,
// system, transport.
// ---------------------------------------------------------------------------

describe('data_element', () => {
  it("CheckDataElementLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckDataElement(context as any, {
      data_element_name: 'ZDT_X',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getDataElement');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
    assert.equal(call?.args[1], 'active');
  });

  /**
   * An object that is only active has no inactive version, and a check of
   * the inactive one is answered "Error while importing object … from the
   * database" (on premise, ZMCP_SHR_DOMAIN / ZMCP_SHR_DTEL, 2026-09-25). `version`
   * is how a caller asks about the active one.
   */
  it('CheckDataElementLow passes version through to the check member', async () => {
    await handleCheckDataElement(
      context as any,
      {
        data_element_name: 'ZDT_X',
        version: 'active',
      } as any,
    );
    assert.equal(callTo('check')?.args[1], 'active');
  });

  it('CheckDomainLow passes version through to the check member, and sends active when not given', async () => {
    await handleCheckDomainLowForVersion(
      context as any,
      {
        domain_name: 'ZDM_X',
        version: 'active',
      } as any,
    );
    assert.equal(callTo('check')?.args[1], 'active');
    await handleCheckDomainLowForVersion(
      context as any,
      {
        domain_name: 'ZDM_X',
      } as any,
    );
    assert.equal(callTo('check')?.args[1], 'active');
  });

  it('CheckDataElementLow reads the real check-success-verdict fixture through terseCheck — pinning the projection, not only the analyse', async () => {
    const reading = structured({
      data: corpusBody('check-success-verdict--01-checkrun'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ check: async () => okResponse(reading) });

    const result: any = await handleCheckDataElement(context as any, {
      data_element_name: 'zd',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      ran: true,
      status_text: 'Object ZBP_MCP_SHR_I_ROOT has been checked',
    });
  });

  it('ActivateDataElementLow reads the real activation-success-verdict fixture through terseActivation — pinning the projection, not only the analyse', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateDataElement(context as any, {
      data_element_name: 'zd',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });

  // No corpus fixture exists for GET /sap/bc/adt/ddic/dataelements/{name} —
  // only a create response was captured. The two `currentXml` documents
  // below are hand-built with the data element's root, the same disclosure the transport
  // block below makes for its own missing fixture.
  it('UpdateDataElementLow passes the patched document via options.source, reaches getDataElement (not an unrelated family sharing the same {readMetadata, updateMetadata} shape), and leaves no body in the config', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZDT_X" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    const double = fakeClientOfWithFactory({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(readingOf(''));
      },
    });
    fakeClient = double.client;

    const result: any = await handleUpdateDataElement(context as any, {
      data_element_name: 'zdt_x',
      properties: { description: 'after', transport_request: 'SIDK900001' },
      lock_handle: 'h',
    });

    assert.equal(result.isError, false);
    assert.equal(double.factory, 'getDataElement');
    assert.deepStrictEqual(updateCall?.config, {
      dataElementName: 'ZDT_X',
      transportRequest: 'SIDK900001',
    });
    {
      const { source, ...options } = updateCall?.options ?? {};
      assert.ok(source.includes('adtcore:description="after"'));
      assert.deepStrictEqual(options, {
        headers: DEFAULT_ADT_HEADERS['dataElement.updateMetadata'],
        lockHandle: 'h',
        analyse: analyseException,
      });
    }
    assert.equal(
      (updateCall?.config as { document?: unknown })?.document,
      undefined,
    );
  });

  it('UpdateDataElementLow patches typeKind/typeName/dataType into the document read from readMetadata', async () => {
    const currentXml = corpusBody(
      'read-metadata-data-element--01-ddic-dataelements',
    );
    let patched = '';
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (_config: any, options: any) => {
        patched = options.source;
        return okResponse(readingOf(''));
      },
    });

    await handleUpdateDataElement(context as any, {
      data_element_name: 'zdt_x',
      properties: { type_kind: 'domain', type_name: 'zd_domain' },
      lock_handle: 'h',
    });

    assert.ok(patched.includes('<dtel:typeKind>domain</dtel:typeKind>'));
    assert.ok(patched.includes('<dtel:typeName>ZD_DOMAIN</dtel:typeName>'));
  });

  // The bag is the model's own object: a type name given as a number failed
  // the call (`toUpperCase` of a number); it is written out as text.
  it('UpdateDataElementLow writes a type name given as a number', async () => {
    const currentXml = corpusBody(
      'read-metadata-data-element--01-ddic-dataelements',
    );
    let patched = '';
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (_config: unknown, options: { source: string }) => {
        patched = options.source;
        return okResponse(readingOf(''));
      },
    });

    const result = await handleUpdateDataElement(context, {
      data_element_name: 'zdt_x',
      properties: { type_name: 5 },
      lock_handle: 'h',
    });

    assert.equal(result.isError, false);
    assert.ok(patched.includes('<dtel:typeName>5</dtel:typeName>'));
  });
});

describe('service_binding — Activate only, over AdtServiceBinding', () => {
  it('ActivateServiceBindingLow reaches getServiceBinding with analyseActivation', async () => {
    await handleActivateServiceBinding(context as any, { name: 'ZSB_X' });
    const call = callTo('activate');
    assert.equal(call?.factory, 'getServiceBinding');
    assert.deepStrictEqual(call?.args[0], { bindingName: 'ZSB_X' });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseActivation);
  });

  it('ActivateServiceBindingLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateServiceBinding(context as any, {
      name: 'ZSB_X',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });

  it('ActivateServiceBindingLow reports a refused activation as an error, on the real refusal-activation-fails fixture (200 with activationExecuted="false")', async () => {
    // The library's own verdict for a 200 is ADT_NO_FAILURE — this is the
    // HTTP-200-with-a-refusal-inside case the injection exists for, so
    // `analyseActivation` has to read the document itself to find it.
    const document = corpusBody('refusal-activation-fails--01-activation');
    fakeClient = fakeClientOf({
      activate: async (_config: unknown, options: any) => {
        const verdict = options.analyse(ADT_NO_FAILURE, {
          data: document,
          status: 200,
        });
        if (verdict === ADT_NO_FAILURE) {
          throw new Error('test fixture expected a refusal, got none');
        }
        return {
          ok: false,
          getError: () => verdict,
          getResult: () => {
            throw new Error('asked for the result of a failure');
          },
        };
      },
    });

    const result: any = await handleActivateServiceBinding(context as any, {
      name: 'ZSB_X',
    });

    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.origin, 'refusal');
  });
});

describe('service_definition — Activate only', () => {
  it('ActivateServiceDefinitionLow reaches getServiceDefinition with analyseActivation', async () => {
    await handleActivateServiceDefinition(context as any, {
      name: 'ZI_X_SRVD',
    });
    const call = callTo('activate');
    assert.equal(call?.factory, 'getServiceDefinition');
    assert.deepStrictEqual(call?.args[0], {
      serviceDefinitionName: 'ZI_X_SRVD',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseActivation);
  });

  it('ActivateServiceDefinitionLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateServiceDefinition(context as any, {
      name: 'ZI_X_SRVD',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      activated: true,
      generated: true,
    });
  });
});

describe('system — three getUtils() reads, each given analyseException (interfaces-adt 11 gave every util member one)', () => {
  // None of fetchNodeStructure/getObjectStructure/getVirtualFoldersContents
  // takes an `options` parameter at all in the shipped AdtUtils — verified
  // against the compiled AdtUtils.js, not the declaration file. This is why
  // `npx tsx scripts/check-analyse.ts 'src/handlers/system/low/**'` reports
  // 0 inspected calls and exits non-zero for this family alone: the script's
  // own "check one signature by hand before believing this" is what these
  // three tests are.
  it('GetNodeStructureLow reaches getUtils, carrying analyseException', async () => {
    await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZP_X',
    });
    const call = callTo('fetchNodeStructure');
    assert.equal(call?.factory, 'getUtils');
    assert.equal(call?.carriedAnalyse, true);
    assert.deepStrictEqual(call?.args, [
      'DEVC/K',
      'ZP_X',
      // The root is `000000`: `0000` answers 200 with an empty body on premise
      // (2026-09-25), which read as an empty package.
      {
        headers: DEFAULT_ADT_HEADERS['utils.fetchNodeStructure'],
        nodeId: '000000',
        withShortDescriptions: true,
      },
    ]);
  });

  it('GetNodeStructureLow reads the real read-object-tree-structure fixture (fixture 05, the one with descriptions) through the node reading', async () => {
    const document = corpusBody('read-object-tree-structure--05-nodestructure');
    const calls: string[] = [];
    fakeClient = fakeClientThroughSet((set) => ({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        // Read by the handler's own node reading.
        return answerThrough(set, 'node', document);
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        return okResponse('<pak:package/>');
      },
    }));

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_SHR_PKG',
      node_id: '28',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      objects: [
        {
          name: 'ZMCP_BLD_SHR_FGR',
          type: 'FUGR/F',
          description: 'Shared function group for read tests',
          techName: 'SAPLZMCP_BLD_SHR_FGR',
          uri: '/sap/bc/adt/functions/groups/zmcp_bld_shr_fgr',
        },
        {
          name: 'ZMCP_SHR_FGRP',
          type: 'FUGR/F',
          description: 'Shared FUGR for include/FM tests',
          techName: 'SAPLZMCP_SHR_FGRP',
          uri: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp',
        },
      ],
      childNodes: [{ type: 'FUGR/F', nodeId: '29' }],
    });
    // A non-blank body never triggers the disambiguating read — one request,
    // not two.
    assert.deepStrictEqual(calls, ['fetchNodeStructure']);
  });

  // Fix round 2: a blank body from /repository/nodestructure is genuinely
  // ambiguous — refusal-package-not-found-objectslist-empty (package does
  // not exist) and read-empty-package-contents (package exists, holds
  // nothing) are byte-for-byte identical, zero bytes, HTTP 200. Round 1's
  // guard treated every blank body as a refusal, which answered the second
  // fixture wrong. The fix disambiguates the one type it has an existence
  // check for (DEVC/K, via getPackage().readMetadata() — the same call
  // GetPackageTree already makes) and pins BOTH outcomes here, driven from
  // both real fixtures. Each assertion on `calls` fails if the follow-up
  // read is removed: without it, `readMetadata` is never reached at all.
  it('GetNodeStructureLow answers an empty listing, not an error, for the real read-empty-package-contents fixture — the follow-up read finds the package', async () => {
    const document = corpusBody(
      'read-empty-package-contents--01-nodestructure',
    );
    assert.equal(document, '');
    const calls: string[] = [];
    fakeClient = fakeClientThroughSet((set) => ({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        // Read by the handler's own node reading.
        return answerThrough(set, 'node', document);
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        // A real package document proves existence; borrowed from a
        // different package (no read-metadata fixture exists for
        // ZMCP_BLD_PKG01 itself) the same way sibling families already
        // reuse a generic fixture across a mismatched name.
        return okResponse(
          corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
        );
      },
    }));

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_BLD_PKG01',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      objects: [],
      childNodes: [],
    });
    assert.deepStrictEqual(calls, ['fetchNodeStructure', 'readMetadata']);
  });

  it('GetNodeStructureLow answers an error naming the missing package for the real refusal-package-not-found-objectslist-empty fixture — the follow-up read refuses', async () => {
    const document = corpusBody(
      'refusal-package-not-found-objectslist-empty--01-nodestructure',
    );
    assert.equal(document, '');
    const calls: string[] = [];
    fakeClient = fakeClientThroughSet((set) => ({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        // Read by the handler's own node reading.
        return answerThrough(set, 'node', document);
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        return refusedResponse('Package ZMCP_BLD_NOPKG9X does not exist', {
          origin: 'refusal',
        });
      },
    }));

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_BLD_NOPKG9X',
    });

    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    // The package's own refusal, forwarded — not a sentence this handler
    // composed about a call it never made. `origin: 'refusal'` (only set by
    // `failurePayload`, never by a plain thrown Error) is what proves this
    // came from the follow-up read and not from round 1's generic throw.
    assert.equal(payload.origin, 'refusal');
    assert.equal(payload.message, 'Package ZMCP_BLD_NOPKG9X does not exist');
    assert.deepStrictEqual(calls, ['fetchNodeStructure', 'readMetadata']);
  });

  // Measured, where the earlier draft of this test reasoned from the absence
  // of a fixture. `CL_ABAP_CHAR_UTILITIES` is a standard SAP class — it
  // exists on every system — and `CLAS/OC` node `0000` answers HTTP 200 with
  // zero bytes for it on the trial system (probed 2026-09-16 by a one-off script,
  // `scripts/probe-migration-failures.ts`, since removed in #234). So a blank body outside the
  // package case is an empty node, and the previous `client_threw` answered
  // an ordinary correct request with a defect report.
  it('GetNodeStructureLow answers an empty listing on a blank body for a non-package parent type, and pays no existence check for one', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientThroughSet((set) => ({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        // Read by the handler's own node reading.
        return answerThrough(set, 'node', '');
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        return okResponse('<pak:package/>');
      },
    }));

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'CLAS/OC',
      parent_name: 'CL_ABAP_CHAR_UTILITIES',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      objects: [],
      childNodes: [],
    });
    // No existence check exists for a class, so none is attempted.
    assert.deepStrictEqual(calls, ['fetchNodeStructure']);
  });

  it("GetVirtualFoldersLow reaches getUtils, carrying analyseException, forwarding the caller's facets and defaulting the rest", async () => {
    await handleGetVirtualFolders(context as any, {
      object_search_pattern: 'Z*',
      preselection: [{ facet: 'package', values: ['ZP_X'] }],
    });
    const call = callTo('getVirtualFoldersContents');
    assert.equal(call?.factory, 'getUtils');
    assert.equal(call?.carriedAnalyse, true);
    assert.deepStrictEqual(call?.args[0], {
      objectSearchPattern: 'Z*',
      preselection: [{ facet: 'package', values: ['ZP_X'] }],
      facetOrder: ['package', 'group', 'type'],
      withVersions: undefined,
      ignoreShortDescriptions: undefined,
    });
  });

  /**
   * The shape an on-premise system answers for a class (CLAS/OC CL_ABAP_CHAR_UTILITIES,
   * 2026-09-25), cut down: folders carry `isfolder="true"`, a `description`
   * and no `objectname`; components carry their own name in `description`
   * while `objectname` names the OWNER — the class for an attribute, the
   * method include for a method. And the folders' parent, `000001`, is never
   * sent. Labelling by `objectname` printed every node as the class and every
   * folder as `undefined`, each folder a root of its own.
   */
});

describe('package — no Activate tool (a package is a container, no activation)', () => {
  it("CheckPackageLow forwards no superPackage — checkPackage takes only the package name — and passes status 'active' to the check member", async () => {
    await handleCheckPackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
    });
    const call = callTo('check');
    assert.equal(call?.factory, 'getPackage');
    assert.deepStrictEqual(call?.args[0], { packageName: 'ZP_X' });
    assert.equal(call?.args[1], 'active');
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseException);
  });

  it('CheckPackageLow reads the real check-success-verdict fixture through terseCheck — pinning the projection, not only the analyse', async () => {
    const reading = structured({
      data: corpusBody('check-success-verdict--01-checkrun'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ check: async () => okResponse(reading) });

    const result: any = await handleCheckPackage(context as any, {
      package_name: 'zp_x',
      super_package: 'zp',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      ran: true,
      status_text: 'Object ZBP_MCP_SHR_I_ROOT has been checked',
    });
  });

  it('DeletePackage passes transportRequest through to the delete member, taking analyseDeletion explicitly over the shipped packageDeletionRefusal default', async () => {
    await handleDeletePackage(context as any, {
      package_name: 'ZP_X',
      transport_request: 'SIDK900001',
    });
    const call = callTo('delete');
    assert.equal(call?.factory, 'getPackage');
    assert.deepStrictEqual(call?.args[0], {
      packageName: 'ZP_X',
      transportRequest: 'SIDK900001',
    });
    assert.equal(call?.carriedAnalyse, true);
    assert.equal(call?.analyse, analyseDeletion);
  });

  it('DeletePackage answers the structured delete-success fixture through terseDeletion', async () => {
    const reading = structured({
      data: corpusBody('delete-success--01-deletion-delete'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ delete: async () => okResponse(reading) });

    const result: any = await handleDeletePackage(context as any, {
      package_name: 'zp_x',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      deleted: true,
      object: 'ZMCP_BLD_ANSCH01',
    });
  });

  it('UpdatePackageLow reads the real read-metadata-package fixture, patches only adtcore:description, reaches getPackage (not an unrelated family sharing the same {readMetadata, updateMetadata} shape), and passes it via options.source — no body in the config', async () => {
    const currentXml = corpusBody(
      'read-metadata-package--01-packages-zmcpshrpkg',
    );
    let updateCall: { config: any; options: any } | undefined;
    const double = fakeClientOfWithFactory({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(readingOf(''));
      },
    });
    fakeClient = double.client;

    const result: any = await handleUpdatePackage(context as any, {
      package_name: 'zmcp_shr_pkg',
      super_package: 'zadt_bld_pkg03',
      updated_description: 'after',
      lock_handle: 'h',
    });

    assert.equal(result.isError, false);
    assert.equal(double.factory, 'getPackage');
    assert.deepStrictEqual(updateCall?.config, {
      packageName: 'ZMCP_SHR_PKG',
    });
    assert.ok(
      updateCall?.options.source.includes('adtcore:description="after"'),
    );
    // The real document's own super package (`ZADT_BLD_PKG03`) survives
    // unpatched — only the field the caller named changed.
    assert.ok(
      updateCall?.options.source.includes('adtcore:name="ZADT_BLD_PKG03"'),
    );
    {
      const { source, ...options } = updateCall?.options ?? {};
      assert.ok(source.includes('adtcore:description="after"'));
      assert.deepStrictEqual(options, {
        headers: DEFAULT_ADT_HEADERS['package.updateMetadata'],
        lockHandle: 'h',
        analyse: analyseException,
      });
    }
    assert.equal(
      (updateCall?.config as { document?: unknown })?.document,
      undefined,
    );
  });
});

// transport/low has exactly one file: CreateTransportLow. No lock, unlock,
// check, update, delete or validate tool exists at this tier for transport
// requests. No corpus fixture for the create response exists either (the
// README's coverage table lists only the GET, an empty list, for
// ListTransports) — the document below is hand-built from the shipped
// parseCreatedTransport/create.js field names, not a captured one.

/**
 * The seven low-tier writes that had no `transport_request` at all. A caller
 * passing one had it dropped on the floor, the write went out without
 * `corrNr`, and an on-premise system refused it — measured on premise,
 * 2026-09-25, for a view in a transportable package: `400
 * ExceptionParameterNotFound`, "Parameter corrNr could not be found."
 * (SADT_RESOURCE 017). Every one of these members reads
 * `config.transportRequest` and puts it on the URL; the handler only has to
 * hand it over.
 */
describe('low-tier writes carry transport_request to config.transportRequest', () => {
  const cases: [
    string,
    string,
    () => Promise<unknown>,
    Record<string, unknown>,
  ][] = [
    [
      'UpdateClassLow',
      'getClass',
      () =>
        handleUpdateClass(
          context as any,
          {
            class_name: 'ZCL_X',
            source_code: 'x',
            lock_handle: 'h',
            transport_request: 'SIDK900001',
          } as any,
        ),
      { className: 'ZCL_X' },
    ],
    [
      'UpdateDdlLow',
      'getDdl',
      () =>
        handleUpdateDdl(
          context as any,
          {
            ddl_name: 'ZVW_X',
            ddl_source: 'x',
            lock_handle: 'h',
            transport_request: 'SIDK900001',
          } as any,
        ),
      { ddlName: 'ZVW_X' },
    ],
    [
      'UpdateMetadataExtensionLow',
      'getMetadataExtension',
      () =>
        handleUpdateMetadataExtension(
          context as any,
          {
            name: 'ZDDLX_X',
            source_code: 'x',
            lock_handle: 'h',
            transport_request: 'SIDK900001',
          } as any,
        ),
      { name: 'ZDDLX_X' },
    ],
    [
      'UpdateInterfaceLow',
      'getInterface',
      () =>
        handleUpdateInterface(
          context as any,
          {
            interface_name: 'ZIF_X',
            source_code: 'x',
            lock_handle: 'h',
            transport_request: 'SIDK900001',
          } as any,
        ),
      { interfaceName: 'ZIF_X' },
    ],
    [
      'UpdateStructureLow',
      'getStructure',
      () =>
        handleUpdateStructure(
          context as any,
          {
            structure_name: 'ZST_X',
            ddl_code: 'x',
            lock_handle: 'h',
            transport_request: 'SIDK900001',
          } as any,
        ),
      { structureName: 'ZST_X' },
    ],
    [
      'UpdateProgramLow',
      'getProgram',
      () =>
        handleUpdateProgram(
          context as any,
          {
            program_name: 'ZPROG_X',
            source_code: 'x',
            lock_handle: 'h',
            transport_request: 'SIDK900001',
          } as any,
        ),
      { programName: 'ZPROG_X' },
    ],
  ];

  for (const [_tool, factory, run, key] of cases) {
    it(
      format('%s puts transport_request on config as transportRequest', _tool),
      async () => {
        await run();
        const call = callTo('update');
        assert.equal(call?.factory, factory);
        assertMatchObject(call?.args[0], {
          ...key,
          transportRequest: 'SIDK900001',
        });
      },
    );
  }
});

/**
 * The checkrun body carries the version (`chkrun:version`), exactly as ADT
 * sends it; these tools could only ever ask about the inactive one, and an
 * active-only object has none — on premise, 2026-09-25: G46 "REPORT/PROGRAM
 * statement is missing" for an active program, "Inactive version … does not
 * exist" for an active BDEF. `version` reaches the check member now.
 */
describe('check tools pass version through to the check member', () => {
  const cases: [string, string, string, Record<string, unknown>][] = [
    [
      'CheckBdefLow',
      '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition',
      'handleCheckBehaviorDefinition',
      { name: 'ZBDEF_X' },
    ],
    [
      'CheckProgramLow',
      '../../handlers/program/low/handleCheckProgram',
      'handleCheckProgram',
      { program_name: 'ZPROG_X' },
    ],
    [
      'CheckFunctionGroupLow',
      '../../handlers/function/low/handleCheckFunctionGroup',
      'handleCheckFunctionGroup',
      { function_group_name: 'ZFG_X' },
    ],
    [
      'CheckInterfaceLow',
      '../../handlers/interface/low/handleCheckInterface',
      'handleCheckInterface',
      { interface_name: 'ZIF_X' },
    ],
  ];
  for (const [_tool, path, fn, args] of cases) {
    it(format('%s', _tool), async () => {
      const handler = require(path)[fn];
      await handler(context as any, { ...args, version: 'active' });
      assert.equal(callTo('check')?.args[1], 'active');
      await handler(context as any, args);
      assert.equal(callTo('check')?.args[1], 'active');
    });
  }
});

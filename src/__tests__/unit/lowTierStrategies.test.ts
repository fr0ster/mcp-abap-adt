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
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
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
import { handleDeletePackage } from '../../handlers/package/high/handleDeletePackage';
import { handleCheckPackage } from '../../handlers/package/low/handleCheckPackage';
import { handleUpdatePackage } from '../../handlers/package/low/handleUpdatePackage';
import { handleActivateProgram } from '../../handlers/program/low/handleActivateProgram';
import { handleCheckProgram } from '../../handlers/program/low/handleCheckProgram';
import { handleUpdateProgram } from '../../handlers/program/low/handleUpdateProgram';
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
import { corpusBody } from '../../lib/adtCorpus';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import { analyseDeletion } from '../../lib/strategies/deletionRefusal';
import { analyseLock } from '../../lib/strategies/lockAnswer';
import { structured, verbatim } from '../../lib/strategies/reading';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { sessionContext } from '../../lib/utils';
import {
  fakeClientOf,
  fakeClientOfWithFactory,
  okResponse,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.calls` needs this wiring; tests that need a real document
// swap `fakeClient` to `fakeClientOf(...)` for their own call and restore it.
const seen = recordAnalyse();
let fakeClient: unknown = seen.client;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

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
it.each([
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
] as const)(
  '%s activates on its own factory with analyseActivation',
  async (_family, activate, factory, args) => {
    await (activate as any)(context as any, args);
    const activateCall = callTo('activate');
    expect(activateCall?.factory).toBe(factory);
    expect(activateCall?.carriedAnalyse).toBe(true);
    expect(activateCall?.analyse).toBe(analyseActivation);
  },
);

describe('class', () => {
  it('CheckClassLow defaults the check member\'s status to "active" when version is omitted', async () => {
    await handleCheckClass(context as any, { class_name: 'ZCL_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getClass');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateClassLow passes source via options, not config — the shipped AdtClass.update() only reads it there', async () => {
    await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x IMPLEMENTATION.\nENDCLASS.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getClass');
    expect(call?.args[0]).toEqual({ className: 'ZCL_X' });
    expect(call?.args[1]).toMatchObject({
      source: 'CLASS zcl_x IMPLEMENTATION.\nENDCLASS.',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });
});

describe('interface', () => {
  it("CheckInterfaceLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckInterface(context as any, { interface_name: 'ZIF_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getInterface');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateInterfaceLow passes source via options, not config — the shipped AdtInterface.update() only reads it there', async () => {
    await handleUpdateInterface(context as any, {
      interface_name: 'ZIF_X',
      source_code: 'INTERFACE zif_x.\nENDINTERFACE.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getInterface');
    expect(call?.args[0]).toEqual({ interfaceName: 'ZIF_X' });
    expect(call?.args[1]).toMatchObject({
      source: 'INTERFACE zif_x.\nENDINTERFACE.',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });
});

describe('behavior_definition', () => {
  it("CheckBdefLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckBehaviorDefinition(context as any, { name: 'ZBDEF_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getBehaviorDefinition');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateBehaviorDefinitionLow passes source via options and transportRequest via config — the shipped AdtBehaviorDefinition.update() only reads source there', async () => {
    await handleUpdateBehaviorDefinition(context as any, {
      name: 'ZBDEF_X',
      source_code: 'behavior definitions',
      lock_handle: 'h',
      transport_request: 'SIDK900001',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getBehaviorDefinition');
    expect(call?.args[0]).toEqual({
      name: 'ZBDEF_X',
      transportRequest: 'SIDK900001',
    });
    expect(call?.args[1]).toMatchObject({
      source: 'behavior definitions',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getDdl');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({
      ddlName: 'ZVW_X',
      source: 'define view ZVW_X as select from t000 {client};',
    });
    expect(call?.args[1]).toBe('active');
  });

  it('CheckDdlLow passes "active" through to the check member\'s second parameter when asked', async () => {
    await handleCheckDdl(context as any, {
      ddl_name: 'ZVW_X',
      version: 'active',
    });
    const call = callTo('check');
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateDdlLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares', async () => {
    await handleUpdateDdl(context as any, {
      ddl_name: 'ZVW_X',
      ddl_source: 'define view ZVW_X as select from t000 {client};',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getDdl');
    expect(call?.args[0]).toEqual({ ddlName: 'ZVW_X' });
    expect(call?.args[1]).toMatchObject({
      source: 'define view ZVW_X as select from t000 {client};',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({ name: 'ZI_X_DDLX' });
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateMetadataExtensionLow passes source via options, not config — the shipped AdtMetadataExtension.update() reads options.source only, with no config fallback (the exact empty-write shape found four times in cluster 14)', async () => {
    await handleUpdateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      source_code: '@Metadata.layer: #CORE\nannotate view ZI_X_DDLX with {}',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.args[0]).toEqual({ name: 'ZI_X_DDLX' });
    expect(call?.args[1]).toMatchObject({
      source: '@Metadata.layer: #CORE\nannotate view ZI_X_DDLX with {}',
      lockHandle: 'h',
    });
    // The negative half of the assertion: config carries no source at
    // all, so a regression that moves it back cannot pass silently.
    expect((call?.args[0] as any)?.source).toBeUndefined();
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getStructure');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({
      structureName: 'ZST_X',
      source: 'define structure zst_x { client : abap.clnt; }',
    });
    expect(call?.args[1]).toBe('active');
  });

  it('CheckStructureLow passes "active" through to the check member\'s second parameter when asked', async () => {
    await handleCheckStructure(context as any, {
      structure_name: 'ZST_X',
      version: 'active',
    });
    const call = callTo('check');
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateStructureLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares', async () => {
    await handleUpdateStructure(context as any, {
      structure_name: 'ZST_X',
      ddl_code: 'define structure zst_x { client : abap.clnt; }',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getStructure');
    expect(call?.args[0]).toEqual({ structureName: 'ZST_X' });
    expect(call?.args[1]).toMatchObject({
      source: 'define structure zst_x { client : abap.clnt; }',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });
});

describe('table', () => {
  it("CheckTableLow defaults the check member's status to 'active' when version is omitted, and forwards no source — runTableCheckRun's source argument is hardcoded undefined", async () => {
    await handleCheckTable(context as any, {
      table_name: 'ZT_X',
      ddl_code: 'define table zt_x { client : abap.clnt; }',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getTable');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    // ddl_code is accepted by the tool but never reaches config — unlike
    // structure's sibling handler, table's check has nothing to forward it to.
    expect(call?.args[0]).toEqual({ tableName: 'ZT_X' });
    expect(call?.args[1]).toBe('active');
  });

  it('CheckTableLow passes "active" through to the check member\'s second parameter when asked', async () => {
    await handleCheckTable(context as any, {
      table_name: 'ZT_X',
      version: 'active',
    });
    const call = callTo('check');
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateTableLow passes source via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares; transportRequest belongs in config, which the shipped member reads directly', async () => {
    await handleUpdateTable(context as any, {
      table_name: 'ZT_X',
      ddl_code: 'define table zt_x { client : abap.clnt; }',
      lock_handle: 'h',
      transport_request: 'SIDK900001',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getTable');
    expect(call?.args[0]).toEqual({
      tableName: 'ZT_X',
      transportRequest: 'SIDK900001',
    });
    expect(call?.args[1]).toMatchObject({
      source: 'define table zt_x { client : abap.clnt; }',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });
});

describe('program', () => {
  it("CheckProgramLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckProgram(context as any, { program_name: 'Z_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getProgram');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({ programName: 'Z_X' });
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateProgramLow passes source via options, not config — the shipped AdtProgram.update() only reads it there', async () => {
    await handleUpdateProgram(context as any, {
      program_name: 'Z_X',
      source_code: 'REPORT z_x.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getProgram');
    expect(call?.args[0]).toEqual({ programName: 'Z_X' });
    expect(call?.args[1]).toMatchObject({
      source: 'REPORT z_x.',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });

  // `ProgramLow` tools declare `available_in: ['onprem', 'legacy']` —
  // cloud excluded. That field is a registration-time hint only:
  // `BaseHandlerGroup.registerHandlers` (the path `LowLevelHandlersGroup`
  // uses) forwards just the name, description and schema to
  // `server.registerTool`, never `available_in` — so on that path every
  // one of these tools stays registered and callable on a cloud system
  // regardless of what it declares. The runtime refusal below is the only
  // thing standing between a cloud caller and a real ADT request; drop it
  // and nothing in the tool surface itself notices. Driven through
  // `sessionContext` — the same store `isCloudConnection()` reads first —
  // rather than stubbing the handler's own guard call, so that removing
  // the guard makes the cloud row fail for the right reason.
  describe('the cloud guard — declared in available_in, enforced here', () => {
    const cloudStore = { sapConfig: { authType: 'jwt' } } as any;

    const rows: Array<
      [string, (...args: any[]) => unknown, string, Record<string, unknown>]
    > = [
      [
        'ActivateProgramLow',
        handleActivateProgram,
        'activate',
        { program_name: 'Z_X' },
      ],
      ['CheckProgramLow', handleCheckProgram, 'check', { program_name: 'Z_X' }],
      [
        'UpdateProgramLow',
        handleUpdateProgram,
        'update',
        { program_name: 'Z_X', source_code: 'REPORT z_x.', lock_handle: 'h' },
      ],
    ];

    it.each(rows)(
      '%s refuses on a cloud connection and never reaches the client',
      async (_name, handler, member, args) => {
        const result: any = await sessionContext.run(cloudStore, () =>
          handler(context as any, args),
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'Programs are not available on cloud systems',
        );
        // The half that matters: a handler that explains and calls anyway
        // is the same bug wearing a message.
        expect(callTo(member)).toBeUndefined();
      },
    );

    it.each(rows)(
      '%s proceeds on a non-cloud connection and reaches its member',
      async (_name, handler, member, args) => {
        await handler(context as any, args);
        expect(callTo(member)).toBeDefined();
      },
    );
  });
});

describe('function (function group)', () => {
  it("CheckFunctionGroupLow passes status 'active' to the check member when version is omitted", async () => {
    await handleCheckFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({ functionGroupName: 'ZFG_X' });
    expect(call?.args[1]).toBe('active');
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
    });
    expect(call?.args[1]).toBe('active');
  });

  it('CheckFunctionModuleLow passes "inactive" through to the check member\'s second parameter when asked', async () => {
    await handleCheckFunctionModule(context as any, {
      function_group_name: 'ZFG_X',
      function_module_name: 'ZFM_X',
      version: 'inactive',
    });
    const call = callTo('check');
    expect(call?.args[1]).toBe('inactive');
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
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.args[0]).toEqual({
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
      transportRequest: 'SIDK900001',
    });
    expect(call?.args[1]).toMatchObject({
      source: 'FUNCTION zfm_x.\nENDFUNCTION.',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('ActivateFunctionModuleLow reads a real corpus document (generic activation-verdict fixture) through terseActivation', async () => {
    const reading = structured({
      data: corpusBody('activation-success-verdict--01-activation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ activate: async () => okResponse(reading) });

    const result: any = await handleActivateFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getDataElement');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBe('active');
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
    expect(callTo('check')?.args[1]).toBe('active');
  });

  it('CheckDomainLow passes version through to the check member, and sends active when not given', async () => {
    await handleCheckDomainLowForVersion(
      context as any,
      {
        domain_name: 'ZDM_X',
        version: 'active',
      } as any,
    );
    expect(callTo('check')?.args[1]).toBe('active');
    await handleCheckDomainLowForVersion(
      context as any,
      {
        domain_name: 'ZDM_X',
      } as any,
    );
    expect(callTo('check')?.args[1]).toBe('active');
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      activated: true,
      generated: true,
    });
  });

  // No corpus fixture exists for GET /sap/bc/adt/ddic/dataelements/{name} —
  // only a create response was captured. The two `currentXml` documents
  // below are hand-built from patchDataElementXml's own dtel: tag names
  // (ported from adt-clients v18.0.2), the same disclosure the transport
  // block below makes for its own missing fixture.
  it('UpdateDataElementLow passes the patched document via options.source, reaches getDataElement (not an unrelated family sharing the same {readMetadata, updateMetadata} shape), and leaves no body in the config', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZDT_X" adtcore:description="before"/>';
    let updateCall: { config: any; options: any } | undefined;
    const double = fakeClientOfWithFactory({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(undefined);
      },
    });
    fakeClient = double.client;

    const result: any = await handleUpdateDataElement(context as any, {
      data_element_name: 'zdt_x',
      properties: { description: 'after', transport_request: 'SIDK900001' },
      lock_handle: 'h',
    });

    expect(result.isError).toBe(false);
    expect(double.factory).toBe('getDataElement');
    expect(updateCall?.config).toEqual({
      dataElementName: 'ZDT_X',
      transportRequest: 'SIDK900001',
    });
    expect(updateCall?.options).toEqual({
      headers: DEFAULT_ADT_HEADERS['dataElement.updateMetadata'],
      source: expect.stringContaining('adtcore:description="after"'),
      lockHandle: 'h',
      analyse: analyseException,
    });
    expect(
      (updateCall?.config as { document?: unknown })?.document,
    ).toBeUndefined();
  });

  it('UpdateDataElementLow patches typeKind/typeName/dataType into the document read from readMetadata', async () => {
    const currentXml =
      '<?xml version="1.0" encoding="UTF-8"?><blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZDT_X" adtcore:description="x"><dtel:typeKind>predefinedAbapType</dtel:typeKind><dtel:typeName></dtel:typeName><dtel:dataType>CHAR</dtel:dataType></blue:wbobj>';
    let patched = '';
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(currentXml),
      updateMetadata: async (_config: any, options: any) => {
        patched = options.source;
        return okResponse(undefined);
      },
    });

    await handleUpdateDataElement(context as any, {
      data_element_name: 'zdt_x',
      properties: { type_kind: 'domain', type_name: 'zd_domain' },
      lock_handle: 'h',
    });

    expect(patched).toContain('<dtel:typeKind>domain</dtel:typeKind>');
    expect(patched).toContain('<dtel:typeName>ZD_DOMAIN</dtel:typeName>');
  });
});

describe('service_binding — Activate only, over AdtServiceBinding', () => {
  it('ActivateServiceBindingLow reaches getServiceBinding with analyseActivation', async () => {
    await handleActivateServiceBinding(context as any, { name: 'ZSB_X' });
    const call = callTo('activate');
    expect(call?.factory).toBe('getServiceBinding');
    expect(call?.args[0]).toEqual({ bindingName: 'ZSB_X' });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseActivation);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
  });
});

describe('service_definition — Activate only', () => {
  it('ActivateServiceDefinitionLow reaches getServiceDefinition with analyseActivation', async () => {
    await handleActivateServiceDefinition(context as any, {
      name: 'ZI_X_SRVD',
    });
    const call = callTo('activate');
    expect(call?.factory).toBe('getServiceDefinition');
    expect(call?.args[0]).toEqual({ serviceDefinitionName: 'ZI_X_SRVD' });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseActivation);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getUtils');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.args).toEqual([
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

  it('GetNodeStructureLow reads the real read-object-tree-structure fixture (fixture 05, the one with descriptions) through the nodeLevel reading', async () => {
    const document = corpusBody('read-object-tree-structure--05-nodestructure');
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        return okResponse(document);
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        return okResponse('<pak:package/>');
      },
    });

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_SHR_PKG',
      node_id: '28',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(calls).toEqual(['fetchNodeStructure']);
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
    expect(document).toBe('');
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        return okResponse(document);
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
    });

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_BLD_PKG01',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      objects: [],
      childNodes: [],
    });
    expect(calls).toEqual(['fetchNodeStructure', 'readMetadata']);
  });

  it('GetNodeStructureLow answers an error naming the missing package for the real refusal-package-not-found-objectslist-empty fixture — the follow-up read refuses', async () => {
    const document = corpusBody(
      'refusal-package-not-found-objectslist-empty--01-nodestructure',
    );
    expect(document).toBe('');
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        return okResponse(document);
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        return refusedResponse('Package ZMCP_BLD_NOPKG9X does not exist', {
          origin: 'refusal',
        });
      },
    });

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_BLD_NOPKG9X',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    // The package's own refusal, forwarded — not a sentence this handler
    // composed about a call it never made. `origin: 'refusal'` (only set by
    // `failurePayload`, never by a plain thrown Error) is what proves this
    // came from the follow-up read and not from round 1's generic throw.
    expect(payload.origin).toBe('refusal');
    expect(payload.message).toBe('Package ZMCP_BLD_NOPKG9X does not exist');
    expect(calls).toEqual(['fetchNodeStructure', 'readMetadata']);
  });

  // Measured, where the earlier draft of this test reasoned from the absence
  // of a fixture. `CL_ABAP_CHAR_UTILITIES` is a standard SAP class — it
  // exists on every system — and `CLAS/OC` node `0000` answers HTTP 200 with
  // zero bytes for it on the trial system (probed 2026-09-16,
  // `scripts/probe-migration-failures.ts`). So a blank body outside the
  // package case is an empty node, and the previous `client_threw` answered
  // an ordinary correct request with a defect report.
  it('GetNodeStructureLow answers an empty listing on a blank body for a non-package parent type, and pays no existence check for one', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        calls.push('fetchNodeStructure');
        return okResponse('');
      },
      readMetadata: async () => {
        calls.push('readMetadata');
        return okResponse('<pak:package/>');
      },
    });

    const result: any = await handleGetNodeStructure(context as any, {
      parent_type: 'CLAS/OC',
      parent_name: 'CL_ABAP_CHAR_UTILITIES',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      objects: [],
      childNodes: [],
    });
    // No existence check exists for a class, so none is attempted.
    expect(calls).toEqual(['fetchNodeStructure']);
  });

  it("GetVirtualFoldersLow reaches getUtils, carrying analyseException, forwarding the caller's facets and defaulting the rest", async () => {
    await handleGetVirtualFolders(context as any, {
      object_search_pattern: 'Z*',
      preselection: [{ facet: 'package', values: ['ZP_X'] }],
    });
    const call = callTo('getVirtualFoldersContents');
    expect(call?.factory).toBe('getUtils');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.args[0]).toEqual({
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
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({ packageName: 'ZP_X' });
    expect(call?.args[1]).toBe('active');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({
      packageName: 'ZP_X',
      transportRequest: 'SIDK900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
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

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
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
        return okResponse(undefined);
      },
    });
    fakeClient = double.client;

    const result: any = await handleUpdatePackage(context as any, {
      package_name: 'zmcp_shr_pkg',
      super_package: 'zadt_bld_pkg03',
      updated_description: 'after',
      lock_handle: 'h',
    });

    expect(result.isError).toBe(false);
    expect(double.factory).toBe('getPackage');
    expect(updateCall?.config).toEqual({
      packageName: 'ZMCP_SHR_PKG',
    });
    expect(updateCall?.options.source).toEqual(
      expect.stringContaining('adtcore:description="after"'),
    );
    // The real document's own super package (`ZADT_BLD_PKG03`) survives
    // unpatched — only the field the caller named changed.
    expect(updateCall?.options.source).toContain(
      'adtcore:name="ZADT_BLD_PKG03"',
    );
    expect(updateCall?.options).toEqual({
      headers: DEFAULT_ADT_HEADERS['package.updateMetadata'],
      source: expect.stringContaining('adtcore:description="after"'),
      lockHandle: 'h',
      analyse: analyseException,
    });
    expect(
      (updateCall?.config as { document?: unknown })?.document,
    ).toBeUndefined();
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

  it.each(cases)(
    '%s puts transport_request on config as transportRequest',
    async (_tool, factory, run, key) => {
      await run();
      const call = callTo('update');
      expect(call?.factory).toBe(factory);
      expect(call?.args[0]).toMatchObject({
        ...key,
        transportRequest: 'SIDK900001',
      });
    },
  );
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
  it.each(cases)('%s', async (_tool, path, fn, args) => {
    const handler = require(path)[fn];
    await handler(context as any, { ...args, version: 'active' });
    expect(callTo('check')?.args[1]).toBe('active');
    await handler(context as any, args);
    expect(callTo('check')?.args[1]).toBe('active');
  });
});

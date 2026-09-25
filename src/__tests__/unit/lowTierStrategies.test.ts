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
  analyseDeletion,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import { handleActivateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import { handleCheckBehaviorDefinition } from '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import {
  handleLockBehaviorDefinition,
  TOOL_DEFINITION as LockBehaviorDefinitionToolDefinition,
} from '../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import {
  handleUnlockBehaviorDefinition,
  TOOL_DEFINITION as UnlockBehaviorDefinitionToolDefinition,
} from '../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleValidateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { handleCreateBehaviorImplementation } from '../../handlers/behavior_implementation/low/handleCreateBehaviorImplementation';
import {
  handleLockBehaviorImplementation,
  TOOL_DEFINITION as LockBehaviorImplementationToolDefinition,
} from '../../handlers/behavior_implementation/low/handleLockBehaviorImplementation';
import { handleValidateBehaviorImplementation } from '../../handlers/behavior_implementation/low/handleValidateBehaviorImplementation';
import { handleActivateClass } from '../../handlers/class/low/handleActivateClass';
import { handleActivateClassTestClasses } from '../../handlers/class/low/handleActivateClassTestClasses';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { handleDeleteClass } from '../../handlers/class/low/handleDeleteClass';
import {
  handleLockClass,
  TOOL_DEFINITION as LockClassToolDefinition,
} from '../../handlers/class/low/handleLockClass';
import { handleLockClassTestClasses } from '../../handlers/class/low/handleLockClassTestClasses';
import {
  handleUnlockClass,
  TOOL_DEFINITION as UnlockClassToolDefinition,
} from '../../handlers/class/low/handleUnlockClass';
import { handleUnlockClassTestClasses } from '../../handlers/class/low/handleUnlockClassTestClasses';
import { handleUpdateClass } from '../../handlers/class/low/handleUpdateClass';
import { handleUpdateClassTestClasses } from '../../handlers/class/low/handleUpdateClassTestClasses';
import { handleValidateClass } from '../../handlers/class/low/handleValidateClass';
import { handleActivateDataElement } from '../../handlers/data_element/low/handleActivateDataElement';
import { handleCheckDataElement } from '../../handlers/data_element/low/handleCheckDataElement';
import { handleCreateDataElement } from '../../handlers/data_element/low/handleCreateDataElement';
import { handleDeleteDataElement } from '../../handlers/data_element/low/handleDeleteDataElement';
import {
  handleLockDataElement,
  TOOL_DEFINITION as LockDataElementToolDefinition,
} from '../../handlers/data_element/low/handleLockDataElement';
import {
  handleUnlockDataElement,
  TOOL_DEFINITION as UnlockDataElementToolDefinition,
} from '../../handlers/data_element/low/handleUnlockDataElement';
import { handleUpdateDataElement } from '../../handlers/data_element/low/handleUpdateDataElement';
import { handleValidateDataElement } from '../../handlers/data_element/low/handleValidateDataElement';
import { handleActivateDdl } from '../../handlers/ddl/low/handleActivateDdl';
import { handleCheckDdl } from '../../handlers/ddl/low/handleCheckDdl';
import { handleCreateDdl } from '../../handlers/ddl/low/handleCreateDdl';
import { handleDeleteDdl } from '../../handlers/ddl/low/handleDeleteDdl';
import {
  handleLockDdl,
  TOOL_DEFINITION as LockDdlToolDefinition,
} from '../../handlers/ddl/low/handleLockDdl';
import {
  handleUnlockDdl,
  TOOL_DEFINITION as UnlockDdlToolDefinition,
} from '../../handlers/ddl/low/handleUnlockDdl';
import { handleUpdateDdl } from '../../handlers/ddl/low/handleUpdateDdl';
import { handleValidateDdl } from '../../handlers/ddl/low/handleValidateDdl';
import { handleActivateMetadataExtension } from '../../handlers/ddlx/low/handleActivateMetadataExtension';
import { handleCheckMetadataExtension } from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import { handleCreateMetadataExtension } from '../../handlers/ddlx/low/handleCreateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../handlers/ddlx/low/handleDeleteMetadataExtension';
import {
  handleLockMetadataExtension,
  TOOL_DEFINITION as LockMetadataExtensionToolDefinition,
} from '../../handlers/ddlx/low/handleLockMetadataExtension';
import {
  handleUnlockMetadataExtension,
  TOOL_DEFINITION as UnlockMetadataExtensionToolDefinition,
} from '../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { handleUpdateMetadataExtension } from '../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleValidateMetadataExtension } from '../../handlers/ddlx/low/handleValidateMetadataExtension';
import { handleActivateFunctionGroup } from '../../handlers/function/low/handleActivateFunctionGroup';
import { handleActivateFunctionModule } from '../../handlers/function/low/handleActivateFunctionModule';
import { handleCheckFunctionGroup } from '../../handlers/function/low/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../handlers/function/low/handleCheckFunctionModule';
import { handleCreateFunctionGroup } from '../../handlers/function/low/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../handlers/function/low/handleCreateFunctionModule';
import { handleDeleteFunctionGroup } from '../../handlers/function/low/handleDeleteFunctionGroup';
import { handleDeleteFunctionModule } from '../../handlers/function/low/handleDeleteFunctionModule';
import {
  handleLockFunctionGroup,
  TOOL_DEFINITION as LockFunctionGroupToolDefinition,
} from '../../handlers/function/low/handleLockFunctionGroup';
import {
  handleLockFunctionModule,
  TOOL_DEFINITION as LockFunctionModuleToolDefinition,
} from '../../handlers/function/low/handleLockFunctionModule';
import {
  handleUnlockFunctionGroup,
  TOOL_DEFINITION as UnlockFunctionGroupToolDefinition,
} from '../../handlers/function/low/handleUnlockFunctionGroup';
import {
  handleUnlockFunctionModule,
  TOOL_DEFINITION as UnlockFunctionModuleToolDefinition,
} from '../../handlers/function/low/handleUnlockFunctionModule';
import { handleUpdateFunctionModule } from '../../handlers/function/low/handleUpdateFunctionModule';
import { handleValidateFunctionGroup } from '../../handlers/function/low/handleValidateFunctionGroup';
import { handleValidateFunctionModule } from '../../handlers/function/low/handleValidateFunctionModule';
import { handleActivateInterface } from '../../handlers/interface/low/handleActivateInterface';
import { handleCheckInterface } from '../../handlers/interface/low/handleCheckInterface';
import { handleDeleteInterface } from '../../handlers/interface/low/handleDeleteInterface';
import {
  handleLockInterface,
  TOOL_DEFINITION as LockInterfaceToolDefinition,
} from '../../handlers/interface/low/handleLockInterface';
import {
  handleUnlockInterface,
  TOOL_DEFINITION as UnlockInterfaceToolDefinition,
} from '../../handlers/interface/low/handleUnlockInterface';
import { handleUpdateInterface } from '../../handlers/interface/low/handleUpdateInterface';
import { handleValidateInterface } from '../../handlers/interface/low/handleValidateInterface';
import { handleCheckPackage } from '../../handlers/package/low/handleCheckPackage';
import { handleCreatePackage } from '../../handlers/package/low/handleCreatePackage';
import { handleDeletePackage } from '../../handlers/package/low/handleDeletePackage';
import {
  handleLockPackage,
  TOOL_DEFINITION as LockPackageToolDefinition,
} from '../../handlers/package/low/handleLockPackage';
import {
  handleUnlockPackage,
  TOOL_DEFINITION as UnlockPackageToolDefinition,
} from '../../handlers/package/low/handleUnlockPackage';
import { handleUpdatePackage } from '../../handlers/package/low/handleUpdatePackage';
import { handleValidatePackage } from '../../handlers/package/low/handleValidatePackage';
import { handleActivateProgram } from '../../handlers/program/low/handleActivateProgram';
import { handleCheckProgram } from '../../handlers/program/low/handleCheckProgram';
import { handleCreateProgram } from '../../handlers/program/low/handleCreateProgram';
import { handleDeleteProgram } from '../../handlers/program/low/handleDeleteProgram';
import {
  handleLockProgram,
  TOOL_DEFINITION as LockProgramToolDefinition,
} from '../../handlers/program/low/handleLockProgram';
import {
  handleUnlockProgram,
  TOOL_DEFINITION as UnlockProgramToolDefinition,
} from '../../handlers/program/low/handleUnlockProgram';
import { handleUpdateProgram } from '../../handlers/program/low/handleUpdateProgram';
import { handleValidateProgram } from '../../handlers/program/low/handleValidateProgram';
import { handleActivateServiceBinding } from '../../handlers/service_binding/low/handleActivateServiceBinding';
import { handleActivateServiceDefinition } from '../../handlers/service_definition/low/handleActivateServiceDefinition';
import { handleActivateStructure } from '../../handlers/structure/low/handleActivateStructure';
import { handleCheckStructure } from '../../handlers/structure/low/handleCheckStructure';
import { handleCreateStructure } from '../../handlers/structure/low/handleCreateStructure';
import { handleDeleteStructure } from '../../handlers/structure/low/handleDeleteStructure';
import {
  handleLockStructure,
  TOOL_DEFINITION as LockStructureToolDefinition,
} from '../../handlers/structure/low/handleLockStructure';
import {
  handleUnlockStructure,
  TOOL_DEFINITION as UnlockStructureToolDefinition,
} from '../../handlers/structure/low/handleUnlockStructure';
import { handleUpdateStructure } from '../../handlers/structure/low/handleUpdateStructure';
import { handleValidateStructure } from '../../handlers/structure/low/handleValidateStructure';
import { handleGetNodeStructure } from '../../handlers/system/low/handleGetNodeStructure';
import { handleGetObjectStructure as handleGetObjectStructureLow } from '../../handlers/system/low/handleGetObjectStructure';
import { handleGetVirtualFolders } from '../../handlers/system/low/handleGetVirtualFolders';
import { handleActivateTable } from '../../handlers/table/low/handleActivateTable';
import { handleCheckTable } from '../../handlers/table/low/handleCheckTable';
import { handleCreateTable } from '../../handlers/table/low/handleCreateTable';
import { handleDeleteTable } from '../../handlers/table/low/handleDeleteTable';
import {
  handleLockTable,
  TOOL_DEFINITION as LockTableToolDefinition,
} from '../../handlers/table/low/handleLockTable';
import {
  handleUnlockTable,
  TOOL_DEFINITION as UnlockTableToolDefinition,
} from '../../handlers/table/low/handleUnlockTable';
import { handleUpdateTable } from '../../handlers/table/low/handleUpdateTable';
import { handleValidateTable } from '../../handlers/table/low/handleValidateTable';
import { handleCreateTransport } from '../../handlers/transport/low/handleCreateTransport';
import { corpusBody } from '../../lib/adtCorpus';
import { structured, verbatim } from '../../lib/strategies/reading';
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

/** For the branch of `connection.getSessionId() || session_id || null` that the caller's session_id never reaches. */
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

it.each([
  [
    'class',
    handleActivateClass,
    handleDeleteClass,
    handleValidateClass,
    'getClass',
    analyseDeletion,
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
    handleDeleteInterface,
    handleValidateInterface,
    'getInterface',
    analyseDeletion,
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
    handleDeleteBehaviorDefinition,
    handleValidateBehaviorDefinition,
    'getBehaviorDefinition',
    analyseDeletion,
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
    handleDeleteDdl,
    handleValidateDdl,
    'getDdl',
    analyseDeletion,
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
    handleDeleteMetadataExtension,
    handleValidateMetadataExtension,
    'getMetadataExtension',
    analyseException,
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
    handleDeleteStructure,
    handleValidateStructure,
    'getStructure',
    analyseDeletion,
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
    handleDeleteTable,
    handleValidateTable,
    'getTable',
    analyseDeletion,
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
    handleDeleteProgram,
    handleValidateProgram,
    'getProgram',
    analyseDeletion,
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
    handleDeleteFunctionGroup,
    handleValidateFunctionGroup,
    'getFunctionGroup',
    analyseDeletion,
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
    handleDeleteFunctionModule,
    handleValidateFunctionModule,
    'getFunctionModule',
    analyseDeletion,
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
    handleDeleteDataElement,
    handleValidateDataElement,
    'getDataElement',
    analyseDeletion,
    {
      data_element_name: 'ZDT_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  // behavior_implementation has no Activate/Delete tool — it cannot join
  // this row; see its own describe block below.
])(
  '%s pairs each operation with its own strategy, on its own factory',
  async (_family, activate, remove, validate, factory, expectedDeleteAnalyse, args) => {
    await (activate as any)(context as any, args);
    const activateCall = callTo('activate');
    expect(activateCall?.factory).toBe(factory);
    expect(activateCall?.carriedAnalyse).toBe(true);
    expect(activateCall?.analyse).toBe(analyseActivation);

    // Delete -> analyseDeletion, except `ddlx (metadataExtension)`: its
    // `delete()` is a plain DELETE on the object's own URL, never a POST to
    // the deletion service, so it never answers a `del:deletionResult`
    // document and takes `analyseException` instead — see
    // `ddlx/low/handleDeleteMetadataExtension.ts`'s own doc comment.
    await (remove as any)(context as any, args);
    const deleteCall = callTo('delete');
    expect(deleteCall?.factory).toBe(factory);
    expect(deleteCall?.carriedAnalyse).toBe(true);
    expect(deleteCall?.analyse).toBe(expectedDeleteAnalyse);

    await (validate as any)(context as any, args);
    const validateCall = callTo('validate');
    expect(validateCall?.factory).toBe(factory);
    expect(validateCall?.carriedAnalyse).toBe(true);
    expect(validateCall?.analyse).toBe(analyseException);
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

  it('LockClassLow passes no analyse and carries no detail parameter', async () => {
    await handleLockClass(context as any, { class_name: 'ZCL_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getClass');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockClassToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it('LockClassLow answers its own envelope — the lock handle, the class name and the message, not merely a truthy result', async () => {
    const handle = 'CLASS_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockClass(context as any, {
      class_name: 'zcl_x',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual({
      success: true,
      class_name: 'ZCL_X',
      lock_handle: handle,
      message:
        'Class ZCL_X locked successfully. Use this lock_handle for subsequent update/unlock operations.',
    });
  });

  it('UnlockClassLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockClass(context as any, {
      class_name: 'ZCL_X',
      lock_handle: 'h',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getClass');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in UnlockClassToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it('ValidateClassLow reads a real corpus document (class-specific fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-class--01-validation-objectname'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateClass(context as any, {
      class_name: 'ZMCP_BLD_FREE_X1',
      package_name: 'ZADT_BLD_PKG03',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
  });

  describe('the test-classes trio shares getClass(), not a family of its own', () => {
    it('ActivateClassTestClasses activates the parent class, taking analyseActivation like ActivateClass', async () => {
      await handleActivateClassTestClasses(context as any, {
        class_name: 'ZCL_X',
      });
      const call = callTo('activate');
      expect(call?.carriedAnalyse).toBe(true);
      expect(call?.analyse).toBe(analyseActivation);
      expect(call?.factory).toBe('getClass');
    });

    it('LockClassTestClasses and UnlockClassTestClasses pass no analyse — lockTestClasses/unlockTestClasses accept none', async () => {
      await handleLockClassTestClasses(context as any, { class_name: 'ZCL_X' });
      const lockCall = callTo('lockTestClasses');
      expect(lockCall?.carriedAnalyse).toBe(false);
      expect(lockCall?.analyse).toBeUndefined();
      expect(lockCall?.factory).toBe('getClass');

      await handleUnlockClassTestClasses(context as any, {
        class_name: 'ZCL_X',
        lock_handle: 'h',
      });
      const unlockCall = callTo('unlockTestClasses');
      expect(unlockCall?.carriedAnalyse).toBe(false);
      expect(unlockCall?.analyse).toBeUndefined();
      expect(unlockCall?.factory).toBe('getClass');
    });
  });
});

describe('interface', () => {
  it("CheckInterfaceLow leaves the check member's status undefined (the shipped inactive default)", async () => {
    await handleCheckInterface(context as any, { interface_name: 'ZIF_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getInterface');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBeUndefined();
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

  it('LockInterfaceLow passes no analyse and carries no detail parameter', async () => {
    await handleLockInterface(context as any, { interface_name: 'ZIF_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getInterface');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockInterfaceToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it("LockInterfaceLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'IF_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockInterface(context as any, {
      interface_name: 'ZIF_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.interface_name).toBe('ZIF_X');
    expect(payload.lock_handle).toBe(handle);
    // context.connection.getSessionId() answers null here, so the caller's
    // own session_id is what should surface.
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockInterfaceLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'IF_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockInterface(
      connectionSessionContext as any,
      {
        interface_name: 'ZIF_X',
        session_id: 'caller-session',
      },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockInterfaceLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockInterface(context as any, {
      interface_name: 'ZIF_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getInterface');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockInterfaceToolDefinition.inputSchema.properties,
    ).toBe(false);
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
  it("CheckBdefLow leaves the check member's status undefined (the shipped inactive default)", async () => {
    await handleCheckBehaviorDefinition(context as any, { name: 'ZBDEF_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getBehaviorDefinition');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBeUndefined();
  });

  it('UpdateBehaviorDefinitionLow passes source via options and transportRequest via config — the shipped AdtBehaviorDefinition.update() only reads source there', async () => {
    await handleUpdateBehaviorDefinition(context as any, {
      name: 'ZBDEF_X',
      source_code: 'behavior definitions',
      lock_handle: 'h',
      transport_request: 'E19K900001',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getBehaviorDefinition');
    expect(call?.args[0]).toEqual({
      name: 'ZBDEF_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.args[1]).toMatchObject({
      source: 'behavior definitions',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('LockBehaviorDefinitionLow passes no analyse and carries no detail parameter', async () => {
    await handleLockBehaviorDefinition(context as any, { name: 'ZBDEF_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getBehaviorDefinition');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in LockBehaviorDefinitionToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it("LockBehaviorDefinitionLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'BDEF_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockBehaviorDefinition(context as any, {
      name: 'ZBDEF_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.name).toBe('ZBDEF_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockBehaviorDefinitionLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'BDEF_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockBehaviorDefinition(
      connectionSessionContext as any,
      { name: 'ZBDEF_X', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockBehaviorDefinitionLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockBehaviorDefinition(context as any, {
      name: 'ZBDEF_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getBehaviorDefinition');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockBehaviorDefinitionToolDefinition.inputSchema.properties,
    ).toBe(false);
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

describe('behavior_implementation — declared over the class document set', () => {
  // No Activate, Delete, Unlock or Check tool exists for this family (only
  // Create, Lock and Validate do) — the it.each table above and the
  // lock/unlock/check-param prescription below apply only where a tool
  // exists to test.
  //
  // The ruling this task carries forward: behavior_implementation and class
  // share an identical result-set shape (both `resultsFor(classDocuments)`)
  // and the same config key (`className`), so a handler that reached
  // `getClass` instead of `getBehaviorImplementation` would be invisible to
  // every reading and every projection — only the factory name proves which
  // one ran.
  it('Create, Lock and Validate all reach getBehaviorImplementation, never getClass', async () => {
    await handleCreateBehaviorImplementation(context as any, {
      class_name: 'ZBP_X',
      behavior_definition: 'ZI_X',
      description: 'x',
      package_name: 'ZP',
    });
    const createCall = callTo('create');
    expect(createCall?.factory).toBe('getBehaviorImplementation');
    expect(createCall?.carriedAnalyse).toBe(true);
    expect(createCall?.analyse).toBe(analyseException);

    await handleLockBehaviorImplementation(context as any, {
      class_name: 'ZBP_X',
    });
    const lockCall = callTo('lock');
    expect(lockCall?.factory).toBe('getBehaviorImplementation');
    expect(lockCall?.carriedAnalyse).toBe(false);
    expect(lockCall?.analyse).toBeUndefined();
    expect(
      'detail' in
        LockBehaviorImplementationToolDefinition.inputSchema.properties,
    ).toBe(false);

    await handleValidateBehaviorImplementation(context as any, {
      class_name: 'ZBP_X',
      behavior_definition: 'ZI_X',
      package_name: 'ZP',
      description: 'x',
    });
    const validateCall = callTo('validate');
    expect(validateCall?.factory).toBe('getBehaviorImplementation');
    expect(validateCall?.carriedAnalyse).toBe(true);
    expect(validateCall?.analyse).toBe(analyseException);
  });

  it('CreateBehaviorImplementationLow, with implementation_code, sequences create then a locked update — field by field', async () => {
    await handleCreateBehaviorImplementation(context as any, {
      class_name: 'ZBP_X',
      behavior_definition: 'ZI_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
      implementation_code: 'CLASS lhc_x DEFINITION.\nENDCLASS.',
    });

    const createCall = callTo('create');
    expect(createCall?.factory).toBe('getBehaviorImplementation');
    expect(createCall?.args[0]).toEqual({
      className: 'ZBP_X',
      behaviorDefinition: 'ZI_X',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
    });
    expect(createCall?.args[1]).toMatchObject({ analyse: analyseException });

    const lockCall = callTo('lock');
    expect(lockCall?.factory).toBe('getBehaviorImplementation');
    expect(lockCall?.args[0]).toEqual({ className: 'ZBP_X' });

    // The one field this round exists for: source belongs in options
    // (AdtBehaviorImplementation.update() reads `options?.source` only —
    // with it in config the request carries no body at all), and
    // transportRequest belongs in config (the member reads
    // `config.transportRequest` directly).
    const updateCall = callTo('update');
    expect(updateCall?.factory).toBe('getBehaviorImplementation');
    expect(updateCall?.args[0]).toEqual({
      className: 'ZBP_X',
      behaviorDefinition: 'ZI_X',
      transportRequest: 'E19K900001',
    });
    expect(updateCall?.args[1]).toMatchObject({
      source: 'CLASS lhc_x DEFINITION.\nENDCLASS.',
      analyse: analyseException,
    });
    expect((updateCall?.args[1] as any)?.lockHandle).toBeDefined();

    const unlockCall = callTo('unlock');
    expect(unlockCall?.factory).toBe('getBehaviorImplementation');
    expect(unlockCall?.args[0]).toEqual({ className: 'ZBP_X' });
  });

  it("LockBehaviorImplementationLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'BIMPL_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockBehaviorImplementation(context as any, {
      class_name: 'ZBP_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.class_name).toBe('ZBP_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockBehaviorImplementationLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'BIMPL_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockBehaviorImplementation(
      connectionSessionContext as any,
      { class_name: 'ZBP_X', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('ValidateBehaviorImplementationLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    // No behavior-implementation-specific validation fixture exists in the
    // corpus; the `asx:abap`/`DATA`/`CHECK_RESULT` shape is shared across
    // every DDIC/OO validation endpoint — ValidateDomainLow's own test
    // proves the same document (captured for a table) against the same
    // projection.
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateBehaviorImplementation(
      context as any,
      {
        class_name: 'ZBP_X',
        behavior_definition: 'ZI_X',
        package_name: 'ZP',
        description: 'x',
      },
    );

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
  });
});

describe('ddl', () => {
  it("CheckDdlLow defaults the check member's status to 'inactive' when version is omitted, and forwards ddl_source via config.source — checkDdl reads it, unlike most sibling families in this cluster", async () => {
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
    expect(call?.args[1]).toBe('inactive');
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

  it('CreateDdlLow reaches getDdl with analyseException, forwarding no source (createDdl never reads one)', async () => {
    await handleCreateDdl(context as any, {
      ddl_name: 'ZVW_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getDdl');
    expect(call?.args[0]).toEqual({
      ddlName: 'ZVW_X',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('LockDdlLow passes no analyse and carries no detail parameter', async () => {
    await handleLockDdl(context as any, { ddl_name: 'ZVW_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getDdl');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockDdlToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it("LockDdlLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'DDL_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockDdl(context as any, {
      ddl_name: 'ZVW_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.ddl_name).toBe('ZVW_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockDdlLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'DDL_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockDdl(connectionSessionContext as any, {
      ddl_name: 'ZVW_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockDdlLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockDdl(context as any, {
      ddl_name: 'ZVW_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getDdl');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in UnlockDdlToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it('ValidateDdlLow passes packageName through to the validate member — validateDdlName reads it, so dropping it here would be a live regression', async () => {
    await handleValidateDdl(context as any, {
      ddl_name: 'ZVW_X',
      package_name: 'zp',
      description: 'x',
    });
    const call = callTo('validate');
    expect(call?.factory).toBe('getDdl');
    expect(call?.args[0]).toEqual({
      ddlName: 'ZVW_X',
      description: 'x',
      packageName: 'ZP',
    });
  });

  it('ValidateDdlLow reads a real corpus document (ddl-specific fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-ddl--01-ddl-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateDdl(context as any, {
      ddl_name: 'ZMCP_BLD_FREE_V1',
      package_name: 'ZADT_BLD_PKG03',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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

  it('CreateMetadataExtensionLow reaches getMetadataExtension with analyseException, forwarding master_language to config.masterLanguage — the shipped create reads it, unlike ddl_source/ddlCode on its sibling families', async () => {
    await handleCreateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
      master_language: 'EN',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.args[0]).toEqual({
      name: 'ZI_X_DDLX',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
      masterLanguage: 'EN',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('LockMetadataExtensionLow passes no analyse and carries no detail parameter', async () => {
    await handleLockMetadataExtension(context as any, { name: 'ZI_X_DDLX' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in LockMetadataExtensionToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it("LockMetadataExtensionLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'DDLX_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.name).toBe('ZI_X_DDLX');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockMetadataExtensionLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'DDLX_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockMetadataExtension(
      connectionSessionContext as any,
      { name: 'ZI_X_DDLX', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockMetadataExtensionLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockMetadataExtensionToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it('ValidateMetadataExtensionLow passes packageName through to the validate member — validateMetadataExtension reads it, so dropping it here would be a live regression', async () => {
    await handleValidateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      package_name: 'zp',
      description: 'x',
    });
    const call = callTo('validate');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.args[0]).toEqual({
      name: 'ZI_X_DDLX',
      description: 'x',
      packageName: 'ZP',
    });
  });

  it('ValidateMetadataExtensionLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    // No ddlx-specific validation fixture exists in the corpus; the
    // `asx:abap`/`DATA`/`SEVERITY` shape is shared across every DDIC/OO
    // validation endpoint — ValidateDdlLow's own test proves the same shape
    // against the same projection, captured here for a table instead.
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      package_name: 'ZP',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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
  it("CheckStructureLow defaults the check member's status to 'inactive' when version is omitted, and forwards ddl_code via config.source — checkStructure reads it", async () => {
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
    expect(call?.args[1]).toBe('inactive');
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

  it('CreateStructureLow reaches getStructure with analyseException, forwarding no source (createStructure never reads one)', async () => {
    await handleCreateStructure(context as any, {
      structure_name: 'ZST_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getStructure');
    expect(call?.args[0]).toEqual({
      structureName: 'ZST_X',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('LockStructureLow passes no analyse and carries no detail parameter', async () => {
    await handleLockStructure(context as any, { structure_name: 'ZST_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getStructure');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockStructureToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it("LockStructureLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'STRUCTURE_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockStructure(context as any, {
      structure_name: 'ZST_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.structure_name).toBe('ZST_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockStructureLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'STRUCTURE_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockStructure(
      connectionSessionContext as any,
      { structure_name: 'ZST_X', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockStructureLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockStructure(context as any, {
      structure_name: 'ZST_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getStructure');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockStructureToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it('ValidateStructureLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    // No structure-specific validation fixture exists in the corpus; the
    // `asx:abap`/`DATA`/`SEVERITY` shape is shared across every DDIC/OO
    // validation endpoint — ValidateDdlLow's own test proves the same shape
    // against the same projection, captured here for a table instead.
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateStructure(context as any, {
      structure_name: 'ZST_X',
      package_name: 'ZP',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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
  it("CheckTableLow defaults the check member's status to 'new' when version is omitted, and forwards no source — runTableCheckRun's source argument is hardcoded undefined", async () => {
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
    expect(call?.args[1]).toBe('new');
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
      transport_request: 'E19K900001',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getTable');
    expect(call?.args[0]).toEqual({
      tableName: 'ZT_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.args[1]).toMatchObject({
      source: 'define table zt_x { client : abap.clnt; }',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('CreateTableLow reaches getTable with analyseException, forwarding no description or source (createTable reads neither)', async () => {
    await handleCreateTable(context as any, {
      table_name: 'ZT_X',
      package_name: 'ZP',
      transport_request: 'E19K900001',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getTable');
    expect(call?.args[0]).toEqual({
      tableName: 'ZT_X',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('LockTableLow passes no analyse and carries no detail parameter', async () => {
    await handleLockTable(context as any, { table_name: 'ZT_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getTable');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockTableToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it("LockTableLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'TABLE_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockTable(context as any, {
      table_name: 'ZT_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.table_name).toBe('ZT_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockTableLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'TABLE_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockTable(connectionSessionContext as any, {
      table_name: 'ZT_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockTableLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockTable(context as any, {
      table_name: 'ZT_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getTable');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in UnlockTableToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it('ValidateTableLow reads a real corpus document (table-specific fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateTable(context as any, {
      table_name: 'ZMCP_BLD_FREE_T1',
      package_name: 'ZADT_BLD_PKG03',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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
  it("CheckProgramLow leaves the check member's status undefined — no version parameter exists on this tool", async () => {
    await handleCheckProgram(context as any, { program_name: 'Z_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getProgram');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({ programName: 'Z_X' });
    expect(call?.args[1]).toBeUndefined();
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

  it('CreateProgramLow reaches getProgram with analyseException, forwarding description, programType and application — all three reach the shipped create', async () => {
    await handleCreateProgram(context as any, {
      program_name: 'Z_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
      program_type: 'executable',
      application: '*',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getProgram');
    expect(call?.args[0]).toEqual({
      programName: 'Z_X',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
      programType: 'executable',
      application: '*',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('DeleteProgramLow passes transportRequest through to the delete member — a delete losing it is a different request against a transportable object', async () => {
    await handleDeleteProgram(context as any, {
      program_name: 'Z_X',
      transport_request: 'E19K900001',
    });
    const call = callTo('delete');
    expect(call?.factory).toBe('getProgram');
    expect(call?.args[0]).toEqual({
      programName: 'Z_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
  });

  it('ValidateProgramLow passes the full first argument — packageName and description both reach validateProgramName', async () => {
    await handleValidateProgram(context as any, {
      program_name: 'Z_X',
      package_name: 'zp',
      description: 'x',
    });
    const call = callTo('validate');
    expect(call?.factory).toBe('getProgram');
    expect(call?.args[0]).toEqual({
      programName: 'Z_X',
      description: 'x',
      packageName: 'ZP',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('LockProgramLow passes no analyse and carries no detail parameter', async () => {
    await handleLockProgram(context as any, { program_name: 'Z_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getProgram');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockProgramToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it("LockProgramLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'PROGRAM_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockProgram(context as any, {
      program_name: 'Z_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.program_name).toBe('Z_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockProgramLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'PROGRAM_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockProgram(
      connectionSessionContext as any,
      { program_name: 'Z_X', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockProgramLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockProgram(context as any, {
      program_name: 'Z_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getProgram');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in UnlockProgramToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it('ValidateProgramLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateProgram(context as any, {
      program_name: 'Z_X',
      package_name: 'ZP',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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
        'CreateProgramLow',
        handleCreateProgram,
        'create',
        { program_name: 'Z_X', description: 'x', package_name: 'ZP' },
      ],
      [
        'DeleteProgramLow',
        handleDeleteProgram,
        'delete',
        { program_name: 'Z_X' },
      ],
      ['LockProgramLow', handleLockProgram, 'lock', { program_name: 'Z_X' }],
      [
        'UnlockProgramLow',
        handleUnlockProgram,
        'unlock',
        { program_name: 'Z_X', lock_handle: 'h', session_id: 's' },
      ],
      [
        'UpdateProgramLow',
        handleUpdateProgram,
        'update',
        { program_name: 'Z_X', source_code: 'REPORT z_x.', lock_handle: 'h' },
      ],
      [
        'ValidateProgramLow',
        handleValidateProgram,
        'validate',
        { program_name: 'Z_X', package_name: 'ZP', description: 'x' },
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
  it("CheckFunctionGroupLow leaves the check member's status undefined — no version parameter exists on this tool", async () => {
    await handleCheckFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[0]).toEqual({ functionGroupName: 'ZFG_X' });
    expect(call?.args[1]).toBeUndefined();
  });

  it('CreateFunctionGroupLow reaches getFunctionGroup with analyseException, forwarding description — the shipped create reads it', async () => {
    await handleCreateFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.args[0]).toEqual({
      functionGroupName: 'ZFG_X',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('CreateFunctionGroupLow reports a refused create as an error — the dropped compensation used to turn a 400 into a masked success', async () => {
    // A real captured `exc:exception` document (analyseException's own
    // shape), not a fabricated one — refusal-object-not-found is the
    // corpus's own instance of the generic exception form every create
    // refusal arrives in, whatever the concrete SAP message says.
    const document = corpusBody('refusal-object-not-found--01-read-source');
    fakeClient = fakeClientOf({
      create: async (_config: unknown, options: any) => {
        const verdict = options.analyse(
          { origin: 'refusal', message: 'Request failed with status code 400' },
          { data: document, status: 400 },
        );
        return refusedResponse(verdict.message, verdict);
      },
    });

    const result: any = await handleCreateFunctionGroup(context as any, {
      function_group_name: 'ZMCP_SHR_FGRP',
      description: 'x',
      package_name: 'ZP',
    });

    // The behaviour the pre-migration handler masked: a 400 answers as an
    // error, never as `{success: true}` recovered by a best-effort re-read.
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
    expect(result.content[0].text).not.toContain('"success": true');
  });

  it('DeleteFunctionGroupLow passes transportRequest through to the delete member — a delete losing it is a different request against a transportable object', async () => {
    await handleDeleteFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
      transport_request: 'E19K900001',
    });
    const call = callTo('delete');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.args[0]).toEqual({
      functionGroupName: 'ZFG_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
  });

  it('LockFunctionGroupLow passes no analyse and carries no detail parameter', async () => {
    await handleLockFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
    });
    const call = callTo('lock');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in LockFunctionGroupToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it("LockFunctionGroupLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'FGRP_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.function_group_name).toBe('ZFG_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockFunctionGroupLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'FGRP_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockFunctionGroup(
      connectionSessionContext as any,
      { function_group_name: 'ZFG_X', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockFunctionGroupLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockFunctionGroupToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it('ValidateFunctionGroupLow defaults description to the function group name when omitted, and forwards packageName', async () => {
    await handleValidateFunctionGroup(context as any, {
      function_group_name: 'ZFG_X',
      package_name: 'zp',
    });
    const call = callTo('validate');
    expect(call?.factory).toBe('getFunctionGroup');
    expect(call?.args[0]).toEqual({
      functionGroupName: 'ZFG_X',
      packageName: 'ZP',
      description: 'ZFG_X',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('ValidateFunctionGroupLow reads a real corpus document (function-group-specific refusal fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody(
        'refusal-validation-name-taken-functiongroup--01-functions-validation',
      ),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateFunctionGroup(context as any, {
      function_group_name: 'ZMCP_SHR_FGRP',
      package_name: 'ZMCP_SHR_PKG',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      admissible: false,
      message: {
        type: 'ERROR',
        text: 'Function group ZMCP_SHR_FGRP already exists',
      },
    });
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
      transport_request: 'E19K900001',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.args[0]).toEqual({
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.args[1]).toMatchObject({
      source: 'FUNCTION zfm_x.\nENDFUNCTION.',
      lockHandle: 'h',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('CreateFunctionModuleLow reaches getFunctionModule with analyseException, forwarding no packageName — the shipped create reads no package of its own', async () => {
    await handleCreateFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.args[0]).toEqual({
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
      description: 'x',
      transportRequest: 'E19K900001',
    });
    // The negative half: packageName never lands in config at all, so a
    // regression that starts forwarding it (a field the member never reads)
    // cannot pass silently either.
    expect((call?.args[0] as any)?.packageName).toBeUndefined();
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('DeleteFunctionModuleLow passes transportRequest through to the delete member — a delete losing it is a different request against a transportable object', async () => {
    await handleDeleteFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
      transport_request: 'E19K900001',
    });
    const call = callTo('delete');
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.args[0]).toEqual({
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
  });

  it('LockFunctionModuleLow passes no analyse and carries no detail parameter', async () => {
    await handleLockFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
    });
    const call = callTo('lock');
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in LockFunctionModuleToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it("LockFunctionModuleLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'FM_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.function_module_name).toBe('ZFM_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockFunctionModuleLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'FM_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockFunctionModule(
      connectionSessionContext as any,
      {
        function_module_name: 'ZFM_X',
        function_group_name: 'ZFG_X',
        session_id: 'caller-session',
      },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockFunctionModuleLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockFunctionModule(context as any, {
      function_module_name: 'ZFM_X',
      function_group_name: 'ZFG_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockFunctionModuleToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it('ValidateFunctionModuleLow forwards no packageName — validateFunctionModuleName takes none', async () => {
    await handleValidateFunctionModule(context as any, {
      function_group_name: 'ZFG_X',
      function_module_name: 'ZFM_X',
      description: 'x',
    });
    const call = callTo('validate');
    expect(call?.factory).toBe('getFunctionModule');
    expect(call?.args[0]).toEqual({
      functionModuleName: 'ZFM_X',
      functionGroupName: 'ZFG_X',
      description: 'x',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('ValidateFunctionModuleLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateFunctionModule(context as any, {
      function_group_name: 'ZFG_X',
      function_module_name: 'ZFM_X',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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
  it("CheckDataElementLow leaves the check member's status undefined (the shipped inactive default)", async () => {
    await handleCheckDataElement(context as any, {
      data_element_name: 'ZDT_X',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getDataElement');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
    expect(call?.args[1]).toBeUndefined();
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

  it('CreateDataElementLow reaches getDataElement with analyseException, forwarding no type/length/decimals — the shipped create endpoint never reads them', async () => {
    await handleCreateDataElement(context as any, {
      data_element_name: 'ZDT_X',
      description: 'x',
      package_name: 'ZP',
      transport_request: 'E19K900001',
      type_kind: 'domain',
      data_type: 'ZD',
      type_name: 'ZD',
      length: 10,
      decimals: 2,
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getDataElement');
    // The whole first argument, not a subset: a regression that starts
    // forwarding typeKind/dataType/length/decimals again would pass a
    // `toMatchObject` check silently.
    expect(call?.args[0]).toEqual({
      dataElementName: 'ZDT_X',
      description: 'x',
      packageName: 'ZP',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('CreateDataElementLow answers SUCCESS at terse, on the verbatim reading create-dataelement--01-ddic-dataelements proves', async () => {
    // `created` is `verbatim`, not `statusOnly` (see `resultSets.ts`):
    // create-dataelement answers 1345 bytes of blue:wbobj, and this is the
    // second of the two named exceptions to the slot-name premise.
    const document = corpusBody('create-dataelement--01-ddic-dataelements');
    const reading = verbatim({ data: document, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreateDataElement(context as any, {
      data_element_name: 'zmcp_bld_crt_dtel',
      description: 'x',
      package_name: 'ZADT_BLD_PKG03',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('CreateDataElementLow answers the document itself at detail raw — the DDIC create is not discarded', async () => {
    const document = corpusBody('create-dataelement--01-ddic-dataelements');
    const reading = verbatim({ data: document, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreateDataElement(context as any, {
      data_element_name: 'zmcp_bld_crt_dtel',
      description: 'x',
      package_name: 'ZADT_BLD_PKG03',
      detail: 'raw',
    });

    expect(result.content[0].text).toBe(document);
  });

  it('reports a refused create as an error, not as success with a null body', async () => {
    fakeClient = fakeClientOf({
      create: async () =>
        refusedResponse('DataElement ZMCP_BLD_CRT_DTEL already exists'),
    });

    const result: any = await handleCreateDataElement(context as any, {
      data_element_name: 'zmcp_bld_crt_dtel',
      description: 'x',
      package_name: 'ZADT_BLD_PKG03',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('"success": true');
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
      properties: { description: 'after', transport_request: 'E19K900001' },
      lock_handle: 'h',
    });

    expect(result.isError).toBe(false);
    expect(double.factory).toBe('getDataElement');
    expect(updateCall?.config).toEqual({
      dataElementName: 'ZDT_X',
      transportRequest: 'E19K900001',
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

  it('LockDataElementLow passes no analyse and carries no detail parameter', async () => {
    await handleLockDataElement(context as any, { data_element_name: 'ZDT_X' });
    const call = callTo('lock');
    expect(call?.factory).toBe('getDataElement');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in LockDataElementToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it("LockDataElementLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'DTEL_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockDataElement(context as any, {
      data_element_name: 'ZDT_X',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data_element_name).toBe('ZDT_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockDataElementLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'DTEL_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockDataElement(
      connectionSessionContext as any,
      { data_element_name: 'ZDT_X', session_id: 'caller-session' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockDataElementLow passes no analyse and carries no detail parameter', async () => {
    await handleUnlockDataElement(context as any, {
      data_element_name: 'ZDT_X',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getDataElement');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect(
      'detail' in UnlockDataElementToolDefinition.inputSchema.properties,
    ).toBe(false);
  });

  it('UnlockDataElementLow answers SUCCESS through terseWrite — pinning the projection, not only the absence of analyse', async () => {
    fakeClient = fakeClientOf({ unlock: async () => okResponse(undefined) });

    const result: any = await handleUnlockDataElement(context as any, {
      data_element_name: 'zd',
      lock_handle: 'h',
      session_id: 's',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('DeleteDataElementLow passes transportRequest through to the delete member — a delete losing it is a different request against a transportable object', async () => {
    await handleDeleteDataElement(context as any, {
      data_element_name: 'ZDT_X',
      transport_request: 'E19K900001',
    });
    const call = callTo('delete');
    expect(call?.factory).toBe('getDataElement');
    expect(call?.args[0]).toEqual({
      dataElementName: 'ZDT_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
  });

  it('DeleteDataElementLow reads the real delete-success fixture through terseDeletion — pinning the projection, not only the analyse', async () => {
    const reading = structured({
      data: corpusBody('delete-success--01-deletion-delete'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ delete: async () => okResponse(reading) });

    const result: any = await handleDeleteDataElement(context as any, {
      data_element_name: 'zd',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({
      deleted: true,
      object: 'ZMCP_BLD_ANSCH01',
    });
  });

  it('ValidateDataElementLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidateDataElement(context as any, {
      data_element_name: 'ZDT_X',
      package_name: 'ZP',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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

describe('system — three getUtils() reads, none of which accept an analyse', () => {
  // None of fetchNodeStructure/getObjectStructure/getVirtualFoldersContents
  // takes an `options` parameter at all in the shipped AdtUtils — verified
  // against the compiled AdtUtils.js, not the declaration file. This is why
  // `npx tsx scripts/check-analyse.ts 'src/handlers/system/low/**'` reports
  // 0 inspected calls and exits non-zero for this family alone: the script's
  // own "check one signature by hand before believing this" is what these
  // three tests are.
  it('GetNodeStructureLow reaches getUtils, carrying no analyse', async () => {
    await handleGetNodeStructure(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZP_X',
    });
    const call = callTo('fetchNodeStructure');
    expect(call?.factory).toBe('getUtils');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.args).toEqual([
      'DEVC/K',
      'ZP_X',
      // The root is `000000`: `0000` answers 200 with an empty body on E19
      // (2026-09-25), which read as an empty package.
      { nodeId: '000000', withShortDescriptions: true },
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

  it("GetVirtualFoldersLow reaches getUtils, carrying no analyse, forwarding the caller's facets and defaulting the rest", async () => {
    await handleGetVirtualFolders(context as any, {
      object_search_pattern: 'Z*',
      preselection: [{ facet: 'package', values: ['ZP_X'] }],
    });
    const call = callTo('getVirtualFoldersContents');
    expect(call?.factory).toBe('getUtils');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.args[0]).toEqual({
      objectSearchPattern: 'Z*',
      preselection: [{ facet: 'package', values: ['ZP_X'] }],
      facetOrder: ['package', 'group', 'type'],
      withVersions: undefined,
      ignoreShortDescriptions: undefined,
    });
  });

  it('GetObjectStructureLow reaches getUtils, carrying no analyse', async () => {
    await handleGetObjectStructureLow(context as any, {
      object_type: 'DEVC/K',
      object_name: 'ZP_X',
    });
    const call = callTo('getObjectStructure');
    expect(call?.factory).toBe('getUtils');
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.args).toEqual(['DEVC/K', 'ZP_X']);
  });

  it('GetObjectStructureLow reads the same tree-text projection GetObjectStructure (read-only) uses', async () => {
    const reading = structured({
      data: '<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/ris/projectExplorer"><projectexplorer:node nodeid="1" objecttype="DEVC/K" objectname="ZP_X"/><projectexplorer:node nodeid="2" parentid="1" objecttype="CLAS/OC" objectname="ZCL_X"/></projectexplorer:objectstructure>',
      status: 200,
    } as any);
    fakeClient = fakeClientOf({
      getObjectStructure: async () => okResponse(reading),
    });

    const result: any = await handleGetObjectStructureLow(context as any, {
      object_type: 'DEVC/K',
      object_name: 'ZP_X',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(
      'tree:\n- DEVC/K: ZP_X\n  - CLAS/OC: ZCL_X\n',
    );
  });

  /**
   * The shape E19 answers for a class (CLAS/OC CL_ABAP_CHAR_UTILITIES,
   * 2026-09-25), cut down: folders carry `isfolder="true"`, a `description`
   * and no `objectname`; components carry their own name in `description`
   * while `objectname` names the OWNER — the class for an attribute, the
   * method include for a method. And the folders' parent, `000001`, is never
   * sent. Labelling by `objectname` printed every node as the class and every
   * folder as `undefined`, each folder a root of its own.
   */
  it('GetObjectStructure labels a node by its description, marks folders, and hangs orphans under the object asked for', async () => {
    const reading = structured({
      data:
        '<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">' +
        '<projectexplorer:node nodeid="000002" parentid="000001" isfolder="true" description="Attributes" objecttype="CLAS/OA"/>' +
        '<projectexplorer:node nodeid="000003" parentid="000002" isfolder="false" description="CR_LF" objecttype="CLAS/OA" objectname="CL_X"/>' +
        '<projectexplorer:node nodeid="000021" parentid="000001" isfolder="true" description="Methods" objecttype="CLAS/OM"/>' +
        '<projectexplorer:node nodeid="000022" parentid="000021" isfolder="false" description="M1" objecttype="CLAS/OM" objectname="CL_X========CM001"/>' +
        '</projectexplorer:objectstructure>',
      status: 200,
    } as any);
    fakeClient = fakeClientOf({
      getObjectStructure: async () => okResponse(reading),
    });

    const result: any = await handleGetObjectStructureLow(context as any, {
      object_type: 'CLAS/OC',
      object_name: 'CL_X',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(
      'tree:\n' +
        '- CLAS/OC: CL_X\n' +
        '  - CLAS/OA [Attributes]\n' +
        '    - CLAS/OA: CR_LF\n' +
        '  - CLAS/OM [Methods]\n' +
        '    - CLAS/OM: M1 (CL_X========CM001)\n',
    );
  });

  it("GetObjectStructureLow surfaces an absent projectexplorer:objectstructure root as an error, not as 'No nodes found' — the same class of masking GetNodeStructureLow's guard fixes, and for the same reason: getObjectStructure carries no analyse either", async () => {
    // An empty body (or any document without the expected root) parses to
    // `{}` here — indistinguishable from "this object has no substructure"
    // unless the root itself is checked for.
    const reading = structured({ data: '', status: 200 } as any);
    fakeClient = fakeClientOf({
      getObjectStructure: async () => okResponse(reading),
    });

    const result: any = await handleGetObjectStructureLow(context as any, {
      object_type: 'DEVC/K',
      object_name: 'ZMCP_BLD_NOPKG9X',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    // `client_threw`, not `adapter_threw`: the check now runs inside the
    // call, the same place GetNodeStructureLow's guard runs, so a caller
    // branching on `error` sees one kind for this class of defect, not two.
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toMatch(/no object structure document/i);
  });

  it("GetObjectStructureLow still answers 'No nodes found' for a document that is genuinely present and empty — the root exists, it just has no children", async () => {
    const reading = structured({
      data: '<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/ris/projectExplorer"/>',
      status: 200,
    } as any);
    fakeClient = fakeClientOf({
      getObjectStructure: async () => okResponse(reading),
    });

    const result: any = await handleGetObjectStructureLow(context as any, {
      object_type: 'CLAS/OC',
      object_name: 'ZCL_LEAF',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(
      'No nodes found in object structure response.',
    );
  });
});

describe('package — no Activate tool (a package is a container, no activation)', () => {
  it("CheckPackageLow forwards no superPackage — checkPackage takes only the package name — and leaves the check member's status undefined", async () => {
    await handleCheckPackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({ packageName: 'ZP_X' });
    expect(call?.args[1]).toBeUndefined();
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

  it('CreatePackageLow reaches getPackage with analyseException, forwarding superPackage — createPackage reads it, unlike check/lock/unlock', async () => {
    await handleCreatePackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
      description: 'x',
      software_component: 'ZLOCAL',
      transport_request: 'E19K900001',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({
      packageName: 'ZP_X',
      superPackage: 'ZP',
      description: 'x',
      packageType: undefined,
      softwareComponent: 'ZLOCAL',
      transportLayer: undefined,
      transportRequest: 'E19K900001',
      recordChanges: undefined,
      applicationComponent: undefined,
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('CreatePackageLow answers SUCCESS at terse, on a real DDIC create document (create-dataelement — no create-package fixture exists in the corpus, and created is verbatim for every DDIC create in this cluster the same way)', async () => {
    const document = corpusBody('create-dataelement--01-ddic-dataelements');
    const reading = verbatim({ data: document, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreatePackage(context as any, {
      package_name: 'zp_x',
      super_package: 'zp',
      description: 'x',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('LockPackageLow passes no analyse, forwards no superPackage to the lock member, and carries no detail parameter', async () => {
    await handleLockPackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
    });
    const call = callTo('lock');
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({ packageName: 'ZP_X' });
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in LockPackageToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it("LockPackageLow answers the session id in its own envelope (connection.getSessionId() || the caller's session_id || null)", async () => {
    const handle = 'PKG_LOCK_HANDLE';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockPackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
      session_id: 'caller-session',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.package_name).toBe('ZP_X');
    expect(payload.lock_handle).toBe(handle);
    expect(payload.session_id).toBe('caller-session');
  });

  it("LockPackageLow prefers the connection's own session id over the caller's, when the connection has one", async () => {
    const handle = 'PKG_LOCK_HANDLE_2';
    fakeClient = fakeClientOf({ lock: async () => okResponse(handle) });

    const result: any = await handleLockPackage(
      connectionSessionContext as any,
      {
        package_name: 'ZP_X',
        super_package: 'ZP',
        session_id: 'caller-session',
      },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.session_id).toBe('CONN_SESSION');
  });

  it('UnlockPackageLow passes no analyse, forwards no superPackage to the unlock member, and carries no detail parameter', async () => {
    await handleUnlockPackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
      lock_handle: 'h',
      session_id: 's',
    });
    const call = callTo('unlock');
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({ packageName: 'ZP_X' });
    expect(call?.carriedAnalyse).toBe(false);
    expect(call?.analyse).toBeUndefined();
    expect('detail' in UnlockPackageToolDefinition.inputSchema.properties).toBe(
      false,
    );
  });

  it('UnlockPackageLow answers SUCCESS through terseWrite — pinning the projection, not only the absence of analyse', async () => {
    fakeClient = fakeClientOf({ unlock: async () => okResponse(undefined) });

    const result: any = await handleUnlockPackage(context as any, {
      package_name: 'zp_x',
      super_package: 'zp',
      lock_handle: 'h',
      session_id: 's',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('DeletePackageLow passes transportRequest through to the delete member, taking analyseDeletion explicitly over the shipped packageDeletionRefusal default', async () => {
    await handleDeletePackage(context as any, {
      package_name: 'ZP_X',
      transport_request: 'E19K900001',
    });
    const call = callTo('delete');
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({
      packageName: 'ZP_X',
      transportRequest: 'E19K900001',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseDeletion);
  });

  it('DeletePackageLow answers the structured delete-success fixture through terseDeletion', async () => {
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

  it('ValidatePackageLow reaches getPackage with analyseException, forwarding superPackage — validatePackageBasic reads it as the parent package', async () => {
    await handleValidatePackage(context as any, {
      package_name: 'zp_x',
      super_package: 'zp',
    });
    const call = callTo('validate');
    expect(call?.factory).toBe('getPackage');
    expect(call?.args[0]).toEqual({ packageName: 'ZP_X', superPackage: 'ZP' });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('ValidatePackageLow reads a real corpus document (generic admissible-name fixture) through terseValidation', async () => {
    const reading = structured({
      data: corpusBody('validation-name-free-table--01-tables-validation'),
      status: 200,
    } as any);
    fakeClient = fakeClientOf({ validate: async () => okResponse(reading) });

    const result: any = await handleValidatePackage(context as any, {
      package_name: 'ZP_X',
      super_package: 'ZP',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ admissible: true });
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
describe('transport — Create only, no lock/unlock/check/update/delete/validate tool exists at this tier', () => {
  const createdTransportXml =
    '<?xml version="1.0" encoding="ASCII"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:request tm:number="E19K900042" tm:desc="x" tm:type="K" tm:target="LOCAL" tm:cts_project=""><tm:task tm:owner="SAPUSER01"/></tm:request></tm:root>';

  it('CreateTransportLow reaches getRequest with analyseException, forwarding description and transportType', async () => {
    await handleCreateTransport(context as any, {
      description: 'x',
      transport_type: 'customizing',
    });
    const call = callTo('create');
    expect(call?.factory).toBe('getRequest');
    expect(call?.args[0]).toEqual({
      description: 'x',
      transportType: 'customizing',
    });
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('CreateTransportLow defaults transportType to workbench when not given', async () => {
    await handleCreateTransport(context as any, { description: 'x' });
    const call = callTo('create');
    expect(call?.args[0]).toEqual({
      description: 'x',
      transportType: 'workbench',
    });
  });

  it('CreateTransportLow parses the transport number out of the real verbatim document in its own projection — resultsFor(transportDocuments) plain, no keep-list; the number comes from parsing AdtReading.value, not from a kept shipped reading', async () => {
    // `created` maps to `verbatim` here (the table's default), so the fake
    // hands back the same shape the real `verbatim` reading would: the raw
    // XML string as `value`, alongside `raw` and `status`. If a future
    // change reverted to keeping `transportDocuments.created` as shipped,
    // `value` would already be a `parseCreatedTransport`-shaped object with
    // no `raw`/`status` beside it, and the `detail: 'raw'` test below would
    // have nothing to answer — this is the pairing that tells the two
    // designs apart.
    const reading = verbatim({ data: createdTransportXml, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreateTransport(context as any, {
      description: 'x',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual({
      success: true,
      transport_number: 'E19K900042',
      description: 'x',
      transport_type: 'workbench',
      target_system: 'LOCAL',
      owner: 'SAPUSER01',
      message: 'Transport request E19K900042 created successfully.',
    });
  });

  it('CreateTransportLow answers the raw document at detail: raw — only possible because created is verbatim, not a kept reading with no raw to give', async () => {
    const reading = verbatim({ data: createdTransportXml, status: 201 } as any);
    fakeClient = fakeClientOf({ create: async () => okResponse(reading) });

    const result: any = await handleCreateTransport(context as any, {
      description: 'x',
      detail: 'raw',
    });

    expect(result.content[0].text).toBe(createdTransportXml);
  });

  it('reports a refused create as an error, not as success with a null body', async () => {
    fakeClient = fakeClientOf({
      create: async () => refusedResponse('No transport layer assigned'),
    });

    const result: any = await handleCreateTransport(context as any, {
      description: 'x',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('"success": true');
  });
});

/**
 * The seven low-tier writes that had no `transport_request` at all. A caller
 * passing one had it dropped on the floor, the write went out without
 * `corrNr`, and an on-premise system refused it — measured on E19,
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
            transport_request: 'E19K900001',
          } as any,
        ),
      { className: 'ZCL_X' },
    ],
    [
      'UpdateClassTestClassesLow',
      'getLocalTestClass',
      () =>
        handleUpdateClassTestClasses(
          context as any,
          {
            class_name: 'ZCL_X',
            test_class_source: 'x',
            lock_handle: 'h',
            transport_request: 'E19K900001',
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
            transport_request: 'E19K900001',
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
            transport_request: 'E19K900001',
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
            transport_request: 'E19K900001',
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
            transport_request: 'E19K900001',
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
            transport_request: 'E19K900001',
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
        transportRequest: 'E19K900001',
      });
    },
  );
});

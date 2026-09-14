/**
 * Cluster 14: `class`, `interface`, `behavior_definition`, `behavior_implementation`.
 * Cluster 15: `ddl`, `ddlx` (metadataExtension), `structure`, `table`.
 *
 * Task 10's per-operation table (Create/Update -> analyseException, statusOnly,
 * terseWrite; Check -> analyseCheck, structured, terseCheck; Activate ->
 * analyseActivation; Validate -> analyseValidation; Delete -> analyseDeletion;
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
  analyseCheck,
  analyseDeletion,
  analyseException,
  analyseValidation,
} from '@mcp-abap-adt/adt-strategies';
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
import { handleValidateClass } from '../../handlers/class/low/handleValidateClass';
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
import { handleActivateTable } from '../../handlers/table/low/handleActivateTable';
import { handleCheckTable } from '../../handlers/table/low/handleCheckTable';
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
import { corpusBody } from '../../lib/adtCorpus';
import { structured } from '../../lib/strategies/reading';
import { fakeClientOf, okResponse, recordAnalyse } from '../helpers/fakeClient';

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
    {
      table_name: 'ZT_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  // behavior_implementation has no Activate/Delete tool — it cannot join
  // this row; see its own describe block below.
])('%s pairs each operation with its own strategy, on its own factory', async (_family, activate, remove, validate, factory, args) => {
  await (activate as any)(context as any, args);
  const activateCall = callTo('activate');
  expect(activateCall?.factory).toBe(factory);
  expect(activateCall?.carriedAnalyse).toBe(true);
  expect(activateCall?.analyse).toBe(analyseActivation);

  await (remove as any)(context as any, args);
  const deleteCall = callTo('delete');
  expect(deleteCall?.factory).toBe(factory);
  expect(deleteCall?.carriedAnalyse).toBe(true);
  expect(deleteCall?.analyse).toBe(analyseDeletion);

  await (validate as any)(context as any, args);
  const validateCall = callTo('validate');
  expect(validateCall?.factory).toBe(factory);
  expect(validateCall?.carriedAnalyse).toBe(true);
  expect(validateCall?.analyse).toBe(analyseValidation);
});

describe('class', () => {
  it('CheckClassLow defaults the check member\'s status to "active" when version is omitted', async () => {
    await handleCheckClass(context as any, { class_name: 'ZCL_X' });
    const call = callTo('check');
    expect(call?.factory).toBe('getClass');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseCheck);
    expect(call?.args[1]).toBe('active');
  });

  it('UpdateClassLow passes sourceCode via options, not config — the shipped AdtClass.update() only reads it there', async () => {
    await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x IMPLEMENTATION.\nENDCLASS.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getClass');
    expect(call?.args[0]).toEqual({ className: 'ZCL_X' });
    expect(call?.args[1]).toMatchObject({
      sourceCode: 'CLASS zcl_x IMPLEMENTATION.\nENDCLASS.',
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
    expect(call?.analyse).toBe(analyseCheck);
    expect(call?.args[1]).toBeUndefined();
  });

  it('UpdateInterfaceLow passes sourceCode via options, not config — the shipped AdtInterface.update() only reads it there', async () => {
    await handleUpdateInterface(context as any, {
      interface_name: 'ZIF_X',
      source_code: 'INTERFACE zif_x.\nENDINTERFACE.',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getInterface');
    expect(call?.args[0]).toEqual({ interfaceName: 'ZIF_X' });
    expect(call?.args[1]).toMatchObject({
      sourceCode: 'INTERFACE zif_x.\nENDINTERFACE.',
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
    expect(call?.analyse).toBe(analyseCheck);
    expect(call?.args[1]).toBeUndefined();
  });

  it('UpdateBehaviorDefinitionLow passes sourceCode via options and transportRequest via config — the shipped AdtBehaviorDefinition.update() only reads sourceCode there', async () => {
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
      sourceCode: 'behavior definitions',
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
    expect(validateCall?.analyse).toBe(analyseValidation);
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

    // The one field this round exists for: sourceCode belongs in options
    // (AdtBehaviorImplementation.update() reads `options?.sourceCode` only —
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
      sourceCode: 'CLASS lhc_x DEFINITION.\nENDCLASS.',
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
  it("CheckDdlLow defaults the check member's status to 'inactive' when version is omitted, and forwards ddl_source via config.ddlSource — checkDdl reads it, unlike most sibling families in this cluster", async () => {
    await handleCheckDdl(context as any, {
      ddl_name: 'ZVW_X',
      ddl_source: 'define view ZVW_X as select from t000 {client};',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getDdl');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseCheck);
    expect(call?.args[0]).toEqual({
      ddlName: 'ZVW_X',
      ddlSource: 'define view ZVW_X as select from t000 {client};',
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

  it('UpdateDdlLow passes sourceCode via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares', async () => {
    await handleUpdateDdl(context as any, {
      ddl_name: 'ZVW_X',
      ddl_source: 'define view ZVW_X as select from t000 {client};',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getDdl');
    expect(call?.args[0]).toEqual({ ddlName: 'ZVW_X' });
    expect(call?.args[1]).toMatchObject({
      sourceCode: 'define view ZVW_X as select from t000 {client};',
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
  it("CheckMetadataExtensionLow leaves the check member's status undefined (the shipped inactive default) — checkMetadataExtension takes no source parameter at all", async () => {
    await handleCheckMetadataExtension(context as any, { name: 'ZI_X_DDLX' });
    const call = callTo('check');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseCheck);
    expect(call?.args[0]).toEqual({ name: 'ZI_X_DDLX' });
    expect(call?.args[1]).toBeUndefined();
  });

  it('UpdateMetadataExtensionLow passes sourceCode via options, not config — the shipped AdtMetadataExtension.update() reads options.sourceCode only, with no config fallback (the exact empty-write shape found four times in cluster 14)', async () => {
    await handleUpdateMetadataExtension(context as any, {
      name: 'ZI_X_DDLX',
      source_code: '@Metadata.layer: #CORE\nannotate view ZI_X_DDLX with {}',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getMetadataExtension');
    expect(call?.args[0]).toEqual({ name: 'ZI_X_DDLX' });
    expect(call?.args[1]).toMatchObject({
      sourceCode: '@Metadata.layer: #CORE\nannotate view ZI_X_DDLX with {}',
      lockHandle: 'h',
    });
    // The negative half of the assertion: config carries no sourceCode at
    // all, so a regression that moves it back cannot pass silently.
    expect((call?.args[0] as any)?.sourceCode).toBeUndefined();
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
  it("CheckStructureLow defaults the check member's status to 'inactive' when version is omitted, and forwards ddl_code via config.ddlCode — checkStructure reads it", async () => {
    await handleCheckStructure(context as any, {
      structure_name: 'ZST_X',
      ddl_code: 'define structure zst_x { client : abap.clnt; }',
    });
    const call = callTo('check');
    expect(call?.factory).toBe('getStructure');
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseCheck);
    expect(call?.args[0]).toEqual({
      structureName: 'ZST_X',
      ddlCode: 'define structure zst_x { client : abap.clnt; }',
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

  it('UpdateStructureLow passes sourceCode via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares', async () => {
    await handleUpdateStructure(context as any, {
      structure_name: 'ZST_X',
      ddl_code: 'define structure zst_x { client : abap.clnt; }',
      lock_handle: 'h',
    });
    const call = callTo('update');
    expect(call?.factory).toBe('getStructure');
    expect(call?.args[0]).toEqual({ structureName: 'ZST_X' });
    expect(call?.args[1]).toMatchObject({
      sourceCode: 'define structure zst_x { client : abap.clnt; }',
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
    expect(call?.analyse).toBe(analyseCheck);
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

  it('UpdateTableLow passes sourceCode via options, not config — this handler writes through options only, the channel every sibling family in this cluster shares; transportRequest belongs in config, which the shipped member reads directly', async () => {
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
      sourceCode: 'define table zt_x { client : abap.clnt; }',
      lockHandle: 'h',
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

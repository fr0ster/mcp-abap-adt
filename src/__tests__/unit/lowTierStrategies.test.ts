/**
 * Cluster 14: `class`, `interface`, `behavior_definition`, `behavior_implementation`.
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
import { handleValidateClass } from '../../handlers/class/low/handleValidateClass';
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
import { handleValidateInterface } from '../../handlers/interface/low/handleValidateInterface';
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

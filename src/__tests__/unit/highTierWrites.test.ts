/**
 * The seventeen high-tier creates and ten high-tier updates that hold no
 * lock — task 20 of the consumer-side migration.
 *
 * A create is a bare POST (`create-class--01-oo-classes`,
 * `create-domain--01-ddic-domains` in the corpus, one exchange each), and the
 * ten updates take the caller's lock handle as an argument rather than
 * acquiring one — `AdtLocalTestClass.update()`'s own doc comment: "This
 * never takes a lock and never releases one... The lock is the *class's*,
 * not the include's."
 *
 * **A refused create is unrecorded in the corpus for every family** — the
 * spec says so. These tests therefore assert the handler's behaviour given a
 * refusal, not the shape of the document ADT sends.
 *
 * **Two members answer a refused write differently from the other nine.**
 * `UpdateMessageClass` calls `getMessageClass().updateMetadata`, not
 * `.update` — `IMessageClassContract` declares `IAdtMetadataUpdatable`, whose
 * method is `updateMetadata`, and there is no plain `update` on that factory
 * (verified against `AdtMessageClass.js`). `UpdateMessageClassMessage` calls
 * `.update`, but `AdtMessageClassMessage` is not `IAdtLockable` at all: its
 * write locks and unlocks itself internally through direct module calls, so
 * `lock_handle` reaches it but is never read. Both are mocked under both key
 * names (`update` and `updateMetadata`, pointed at the same spy) in the
 * shared blocks below so one table covers all ten without special-casing the
 * assertions.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleCreateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleUpdateLocalDefinitions } from '../../handlers/class/high/handleUpdateLocalDefinitions';
import { handleUpdateLocalMacros } from '../../handlers/class/high/handleUpdateLocalMacros';
import { handleUpdateLocalTestClass } from '../../handlers/class/high/handleUpdateLocalTestClass';
import { handleUpdateLocalTypes } from '../../handlers/class/high/handleUpdateLocalTypes';
import { handleCreateDdl } from '../../handlers/ddl/high/handleCreateDdl';
import { handleCreateFunctionGroup } from '../../handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../handlers/function/high/handleCreateFunctionModule';
import { handleCreateFunctionInclude } from '../../handlers/function_include/high/handleCreateFunctionInclude';
import { handleUpdateFunctionInclude } from '../../handlers/function_include/high/handleUpdateFunctionInclude';
import { handleCreateInterface } from '../../handlers/interface/high/handleCreateInterface';
import { handleCreateMessageClass } from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateMessageClassMessage } from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import { handleUpdateMessageClass } from '../../handlers/message_class/high/handleUpdateMessageClass';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import { handleCreatePackage } from '../../handlers/package/high/handleCreatePackage';
import { handleCreateProgram } from '../../handlers/program/high/handleCreateProgram';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure';
import { handleCreateTable } from '../../handlers/table/high/handleCreateTable';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { handleCreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { handleUpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { handleUpdateUnitTest } from '../../handlers/unit_test/high/handleUpdateUnitTest';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('high-tier creates: no lock, single POST', () => {
  it.each([
    [
      'CreateBehaviorImplementation',
      handleCreateBehaviorImplementation,
      {
        class_name: 'ZBP_X',
        behavior_definition: 'ZI_X',
        package_name: 'ZP',
      },
    ],
    [
      'CreateClass',
      handleCreateClass,
      { class_name: 'ZCL_X', package_name: 'ZP' },
    ],
    ['CreateDdl', handleCreateDdl, { ddl_name: 'ZR_X', package_name: 'ZP' }],
    [
      'CreateFunctionGroup',
      handleCreateFunctionGroup,
      { function_group_name: 'ZFG_X', package_name: 'ZP' },
    ],
    [
      'CreateFunctionModule',
      handleCreateFunctionModule,
      { function_group_name: 'ZFG_X', function_module_name: 'Z_FM_X' },
    ],
    [
      'CreateFunctionInclude',
      handleCreateFunctionInclude,
      { function_group_name: 'ZFG_X', include_name: 'LZFG_XF01' },
    ],
    [
      'CreateInterface',
      handleCreateInterface,
      { interface_name: 'ZIF_X', package_name: 'ZP' },
    ],
    [
      'CreateMessageClass',
      handleCreateMessageClass,
      { message_class_name: 'ZMC', package_name: 'ZP' },
    ],
    [
      'CreateMessageClassMessage',
      handleCreateMessageClassMessage,
      { message_class_name: 'ZMC', msgno: '001', msgtext: 'x' },
    ],
    [
      'CreatePackage',
      handleCreatePackage,
      { package_name: 'ZP_X', super_package: 'ZP' },
    ],
    [
      'CreateProgram',
      handleCreateProgram,
      { program_name: 'Z_PROG_X', package_name: 'ZP' },
    ],
    [
      'CreateServiceDefinition',
      handleCreateServiceDefinition,
      { service_definition_name: 'ZSD_X', package_name: 'ZP' },
    ],
    [
      'CreateStructure',
      handleCreateStructure,
      {
        structure_name: 'ZS_X',
        package_name: 'ZP',
        fields: [{ name: 'CLIENT' }],
      },
    ],
    [
      'CreateTable',
      handleCreateTable,
      { table_name: 'ZT_X', package_name: 'ZP' },
    ],
    ['CreateTransport', handleCreateTransport, { description: 'x' }],
    [
      'CreateCdsUnitTest',
      handleCreateCdsUnitTest,
      { class_name: 'ZCL_X', package_name: 'ZP', cds_view_name: 'ZI_VIEW' },
    ],
    [
      'CreateUnitTest',
      handleCreateUnitTest,
      { class_name: 'ZCL_X', package_name: 'ZP' },
    ],
  ])('%s reports a refused create as an error', async (_n, handler, args) => {
    fakeClient = fakeClientOf({
      create: async () => refusedResponse('Name already taken'),
    });
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Name already taken',
    );
  });

  it('answers SUCCESS and nothing else when a create works', async () => {
    // A class create answers 200 with zero bytes; the status is the whole verdict.
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading(undefined, '', 200)),
    });
    const result: any = await handleCreateClass(context as any, {
      class_name: 'ZCL_X',
      package_name: 'ZP',
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('SUCCESS');
  });

  it('never acquires a lock', async () => {
    const lock = jest.fn();
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading(undefined, '', 200)),
      lock,
    });
    await handleCreateClass(context as any, {
      class_name: 'ZCL_X',
      package_name: 'ZP',
    });
    expect(lock).not.toHaveBeenCalled();
  });
});

describe("high-tier updates: no lock, the caller's handle as an argument", () => {
  const updateCases: Array<[string, any, Record<string, unknown>]> = [
    [
      'UpdateLocalTestClass',
      handleUpdateLocalTestClass,
      { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' },
    ],
    [
      'UpdateLocalTypes',
      handleUpdateLocalTypes,
      { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' },
    ],
    [
      'UpdateLocalDefinitions',
      handleUpdateLocalDefinitions,
      { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' },
    ],
    [
      'UpdateLocalMacros',
      handleUpdateLocalMacros,
      { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' },
    ],
    [
      'UpdateBehaviorImplementation',
      handleUpdateBehaviorImplementation,
      {
        behavior_implementation_name: 'ZBI',
        source_code: 'x',
        lock_handle: 'h',
      },
    ],
    [
      'UpdateFunctionInclude',
      handleUpdateFunctionInclude,
      {
        include_name: 'ZINC',
        function_group_name: 'ZFG',
        source_code: 'x',
        lock_handle: 'h',
      },
    ],
    [
      'UpdateMessageClass',
      handleUpdateMessageClass,
      { message_class_name: 'ZMC', lock_handle: 'h' },
    ],
    [
      'UpdateMessageClassMessage',
      handleUpdateMessageClassMessage,
      {
        message_class_name: 'ZMC',
        msgno: '001',
        msgtext: 'x',
        lock_handle: 'h',
      },
    ],
    [
      'UpdateUnitTest',
      handleUpdateUnitTest,
      { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' },
    ],
    [
      'UpdateCdsUnitTest',
      handleUpdateCdsUnitTest,
      { class_name: 'ZDDL', test_class_source: 'x', lock_handle: 'h' },
    ],
  ];

  it.each(
    updateCases,
  )('%s reports a refused update as an error', async (_n, handler, args) => {
    const update = async () =>
      refusedResponse('Object is locked by another user');
    fakeClient = fakeClientOf({ update, updateMetadata: update });
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Object is locked by another user',
    );
  });

  // All ten in this task, not a sample. Two rows would leave eight handlers
  // free to acquire a lock nobody asked them for, and this is the assertion
  // that stops that.
  it.each(
    updateCases,
  )('%s takes the lock handle as an argument and acquires none', async (_n, handler, args) => {
    // These ten are `high`-tier by name and `low`-tier by shape: the caller
    // already holds the lock. Acquiring one here would take a second lock
    // on an object the caller has open, and releasing it would drop theirs.
    const lock = jest.fn();
    const unlock = jest.fn();
    const update = jest.fn(async () => okResponse(reading(undefined, '', 200)));
    fakeClient = fakeClientOf({
      update,
      updateMetadata: update,
      lock,
      unlock,
    });
    await (handler as any)(context as any, args);
    expect(lock).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lockHandle: 'h',
        analyse: analyseException,
      }),
    );
  });
});

/**
 * The seventeen high-tier creates and (most of) the ten high-tier updates
 * task 20 of the consumer-side migration was given — task 20 fix round 1
 * corrects a wrong first cut. `CreateUnitTest` and `UpdateUnitTest` are
 * excluded here: adt-clients 19's `create()`/`update()` on `AdtUnitTest`
 * answer a structurally different capability than the v18 members these two
 * tools were built for (v18's `create()` meant "start a run"; v18 had no
 * `update()` at all), and repurposing a tool's required parameters to make
 * the compiler quiet is not this task's call to make — both handlers are
 * reverted to their pre-migration content and left failing to compile,
 * for whichever task addresses adt-clients 19's removed/renamed members.
 *
 * A create is a bare POST (`create-class--01-oo-classes`,
 * `create-domain--01-ddic-domains` in the corpus, one exchange each) and
 * never acquires a lock.
 *
 * **Every update that still has a lock to take, takes it and releases it —
 * it does not ask the caller for one.** Fix round 1: the first cut added a
 * `lock_handle` parameter to nine tools whose *write* member no longer locks
 * (`AdtLocalTestClass.update()` and its siblings never take a lock and never
 * release one, by their own doc comments), reasoning the caller must
 * already hold one. Wrong: the very same accessor (`getLocalTestClass()`,
 * `getBehaviorImplementation()`, `getFunctionInclude()`, `getMessageClass()`,
 * `getCdsUnitTest()`) also composes `IAdtLockable`, delegating to the
 * object's own lock — so this handler acquires it, exactly as every
 * already-migrated high-tier locked write in this repository does, through
 * `withLock`. `UpdateMessageClassMessage` is the one genuine exception:
 * `AdtMessageClassMessage` is not `IAdtLockable` at all — its write locks
 * and unlocks itself internally, through direct module calls never exposed
 * on this accessor — so there is truly no lock for this handler to take,
 * and it calls `update()` directly.
 *
 * **A refused create is unrecorded in the corpus for every family** — the
 * spec says so. These tests therefore assert the handler's behaviour given
 * a refusal, not the shape of the document ADT sends.
 *
 * **`UpdateMessageClass` calls `updateMetadata`, not `update`.**
 * `IMessageClassContract` declares `IAdtMetadataUpdatable`, whose method is
 * `updateMetadata` — there is no plain `update` on that factory. Mocked
 * under both key names (pointed at the same spy) in the shared blocks below
 * so one table covers every lock-holding update without special-casing the
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
import { handleUpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { analyseLock } from '../../lib/strategies/lockAnswer';
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

describe('high-tier updates that still have a lock to take: they take it themselves', () => {
  // Every row here maps to a handler whose write member does not lock, but
  // whose accessor also exposes lock()/unlock() delegating to the real lock
  // (the class's, the include's, the message class's, or the container
  // class's). `config` is what `lock`/`unlock` are called with.
  const lockingCases: Array<
    [string, any, Record<string, unknown>, Record<string, unknown>]
  > = [
    [
      'UpdateLocalTestClass',
      handleUpdateLocalTestClass,
      { class_name: 'ZCL_X', test_class_code: 'x' },
      { className: 'ZCL_X' },
    ],
    [
      'UpdateLocalTypes',
      handleUpdateLocalTypes,
      { class_name: 'ZCL_X', local_types_code: 'x' },
      { className: 'ZCL_X' },
    ],
    [
      'UpdateLocalDefinitions',
      handleUpdateLocalDefinitions,
      { class_name: 'ZCL_X', definitions_code: 'x' },
      { className: 'ZCL_X' },
    ],
    [
      'UpdateLocalMacros',
      handleUpdateLocalMacros,
      { class_name: 'ZCL_X', macros_code: 'x' },
      { className: 'ZCL_X' },
    ],
    [
      'UpdateBehaviorImplementation',
      handleUpdateBehaviorImplementation,
      {
        class_name: 'ZBP_X',
        behavior_definition: 'ZI_X',
        implementation_code: 'x',
        activate: false,
      },
      { className: 'ZBP_X' },
    ],
    [
      'UpdateFunctionInclude',
      handleUpdateFunctionInclude,
      {
        function_group_name: 'ZFG',
        include_name: 'ZINC',
        source_code: 'x',
      },
      { functionGroupName: 'ZFG', includeName: 'ZINC' },
    ],
    [
      'UpdateMessageClass',
      handleUpdateMessageClass,
      { message_class_name: 'ZMC', description: 'new desc' },
      { name: 'ZMC' },
    ],
    [
      'UpdateCdsUnitTest',
      handleUpdateCdsUnitTest,
      { class_name: 'ZDDL', test_class_source: 'x' },
      { className: 'ZDDL' },
    ],
  ];

  // UpdateMessageClass reads the class first (read, edit, write — MIGRATION-23
  // §7); every other case never calls it.
  const classDocument =
    '<mc:messageClass xmlns:mc="http://www.sap.com/adt/MessageClass" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZMC" adtcore:description="old desc"/>';
  const readMetadata = async () =>
    okResponse(reading(classDocument, classDocument, 200));

  it.each(lockingCases)(
    '%s reports a refused write as an error, and releases the lock it took',
    async (_n, handler, args) => {
      const unlock = jest.fn(async () => okResponse(undefined));
      const update = async () =>
        refusedResponse('Object is locked by another user');
      fakeClient = fakeClientOf({
        readMetadata,
        lock: async () => okResponse('handle-1'),
        update,
        updateMetadata: update,
        unlock,
      });
      const result: any = await (handler as any)(context as any, args);
      expect(unlock).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).message).toBe(
        'Object is locked by another user',
      );
    },
  );

  it.each(lockingCases)(
    '%s locks, writes under that handle, and unlocks — the caller supplies none of it',
    async (_n, handler, args, lockConfig) => {
      const lock = jest.fn(async () => okResponse('handle-1'));
      const unlock = jest.fn(async () => okResponse(undefined));
      const update = jest.fn(async () =>
        okResponse(reading(undefined, '', 200)),
      );
      fakeClient = fakeClientOf({
        readMetadata,
        lock,
        update,
        updateMetadata: update,
        unlock,
      });

      const result: any = await (handler as any)(context as any, args);

      expect(result.isError).toBe(false);
      expect(lock).toHaveBeenCalledWith(
        lockConfig,
        expect.objectContaining({ analyse: analyseLock }),
      );
      const withAnalyse = expect.objectContaining({
        analyse: analyseException,
      });
      expect(update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lockHandle: 'handle-1',
          analyse: analyseException,
        }),
      );
      expect(unlock).toHaveBeenCalledWith(lockConfig, 'handle-1', withAnalyse);
    },
  );
});

describe('UpdateMessageClassMessage: no lock to take, and none is asked for', () => {
  it('reports a refused update as an error', async () => {
    fakeClient = fakeClientOf({
      update: async () => refusedResponse('Object is locked by another user'),
    });
    const result: any = await handleUpdateMessageClassMessage(context as any, {
      message_class_name: 'ZMC',
      msgno: '001',
      msgtext: 'x',
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Object is locked by another user',
    );
  });

  it('never calls lock or unlock — AdtMessageClassMessage is not IAdtLockable', async () => {
    const lock = jest.fn();
    const unlock = jest.fn();
    fakeClient = fakeClientOf({
      update: async () => okResponse(reading(undefined, '', 200)),
      lock,
      unlock,
    });
    const result: any = await handleUpdateMessageClassMessage(context as any, {
      message_class_name: 'ZMC',
      msgno: '001',
      msgtext: 'x',
    });
    expect(result.isError).toBe(false);
    expect(lock).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
  });
});

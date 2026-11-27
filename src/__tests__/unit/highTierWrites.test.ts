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
 * `withLock`. The message tools are the exception: adt-clients 48 gives a
 * message its own one-request lock members (`lockMessage`,
 * `lockClassForMessage`, `unlockMessages`), and the window around the PUT
 * is composed in `lib/messageClassMessageWrite.ts`.
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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
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
import * as clients from '../../lib/clients';
import { analyseLock } from '../../lib/strategies/lockAnswer';
import { resetSystemContextCache } from '../../lib/systemContext';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';
import { setSystemContext } from '../helpers/processSystemContext';

mock.method(clients, 'createAdtClient', () => fakeClient);
mock.method(clients, 'createOnPremAdtClient', () => fakeClient);

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

let fakeClient: unknown;

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('high-tier creates: no lock, single POST', () => {
  // CreateBehaviorImplementation passes the responsible itself and is refused
  // without one (systemContextRequired.test.ts); state one for the fakes.
  beforeEach(() => setSystemContext({ responsible: 'USER_PLACEHOLDER' }));
  afterEach(() => resetSystemContextCache());

  for (const [_n, handler, args] of [
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
      {
        class_name: 'ZCL_X',
        package_name: 'ZP',
        cds_view_name: 'ZI_VIEW',
        test_class_source: 'x',
      },
    ],
  ]) {
    it(format('%s reports a refused create as an error', _n), async () => {
      fakeClient = fakeClientOf({
        // CreateCdsUnitTest asks the view first; the create under test follows.
        checkCdsTestDoubles: async () => okResponse(reading('OK', 'OK', 200)),
        create: async () => refusedResponse('Name already taken'),
      });
      const result: any = await (handler as any)(context as any, args);
      assert.equal(result.isError, true);
      assert.equal(
        JSON.parse(result.content[0].text).message,
        'Name already taken',
      );
    });
  }

  it('answers SUCCESS and nothing else when a create works', async () => {
    // A class create answers 200 with zero bytes; the status is the whole verdict.
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading(undefined, '', 200)),
    });
    const result: any = await handleCreateClass(context as any, {
      class_name: 'ZCL_X',
      package_name: 'ZP',
    });
    assert.equal(result.isError, false);
    assert.ok(result.content[0].text.includes('SUCCESS'));
  });

  it('never acquires a lock', async () => {
    const lock = mock.fn<(...args: any[]) => any>();
    fakeClient = fakeClientOf({
      create: async () => okResponse(reading(undefined, '', 200)),
      lock,
    });
    await handleCreateClass(context as any, {
      class_name: 'ZCL_X',
      package_name: 'ZP',
    });
    assert.equal(lock.mock.callCount(), 0);
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

  for (const [_n, handler, args] of lockingCases) {
    it(
      format(
        '%s reports a refused write as an error, and releases the lock it took',
        _n,
      ),
      async () => {
        const unlock = mock.fn(async () => okResponse(undefined));
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
        assert.equal(unlock.mock.callCount(), 1);
        assert.equal(result.isError, true);
        assert.equal(
          JSON.parse(result.content[0].text).message,
          'Object is locked by another user',
        );
      },
    );
  }

  for (const [_n, handler, args, lockConfig] of lockingCases) {
    it(
      format(
        '%s locks, writes under that handle, and unlocks — the caller supplies none of it',
        _n,
      ),
      async () => {
        const lock = mock.fn(async () => okResponse('handle-1'));
        const unlock = mock.fn(async () => okResponse(undefined));
        const update = mock.fn(async () =>
          okResponse(reading(undefined, '', 200)),
        );
        fakeClient = fakeClientOf({
          readMetadata,
          lock,
          update,
          updateMetadata: update,
          unlock,
          // UpdateCdsUnitTest activates the test class after the write.
          activate: async () => okResponse(reading(undefined, '', 200)),
        });

        const result: any = await (handler as any)(context as any, args);

        assert.equal(result.isError, false);
        assert.ok(
          lock.mock.calls.some(
            ({ arguments: a }: { arguments: any[] }) =>
              a.length === 2 &&
              isDeepStrictEqual(a[0], lockConfig) &&
              isDeepStrictEqual(a[1]?.analyse, analyseLock),
          ),
        );
        assert.ok(
          update.mock.calls.some(
            ({ arguments: a }: { arguments: any[] }) =>
              a.length === 2 &&
              a[0] !== undefined &&
              a[0] !== null &&
              isDeepStrictEqual(a[1]?.lockHandle, 'handle-1') &&
              isDeepStrictEqual(a[1]?.analyse, analyseException),
          ),
        );
        assert.ok(
          unlock.mock.calls.some(
            ({ arguments: a }: { arguments: any[] }) =>
              a.length === 3 &&
              isDeepStrictEqual(a[0], lockConfig) &&
              a[1] === 'handle-1' &&
              isDeepStrictEqual(a[2]?.analyse, analyseException),
          ),
        );
      },
    );
  }
});

describe("the message tools: the lock window is the server's (adt-clients 48)", () => {
  for (const [name, handler] of [
    ['CreateMessageClassMessage', handleCreateMessageClassMessage],
    ['UpdateMessageClassMessage', handleUpdateMessageClassMessage],
  ] as const) {
    it(
      format(
        '%s reports a refused PUT as an error, and gives both locks up',
        name,
      ),
      async () => {
        const unlock = mock.fn(async () => okResponse(undefined));
        const unlockMessages = mock.fn(async () => okResponse(undefined));
        fakeClient = fakeClientOf({
          update: async () =>
            refusedResponse('Object is locked by another user'),
          unlock,
          unlockMessages,
        });
        const result: any = await handler(context as any, {
          message_class_name: 'ZMC',
          msgno: '001',
          msgtext: 'x',
        });
        assert.equal(result.isError, true);
        assert.equal(
          JSON.parse(result.content[0].text).message,
          'Object is locked by another user',
        );
        assert.equal(unlock.mock.callCount(), 1);
        assert.equal(unlockMessages.mock.callCount(), 1);
      },
    );
  }

  it('takes the class lock for the message, not the plain class lock, when it is granted', async () => {
    const lock = mock.fn<(...args: any[]) => any>();
    const lockMessage = mock.fn(async () => okResponse('MESSAGEHANDLE'));
    const lockClassForMessage = mock.fn(async () => okResponse('CLASSHANDLE'));
    let seen: any;
    fakeClient = fakeClientOf({
      lockMessage,
      lockClassForMessage,
      update: async (_c: unknown, o: any) => {
        seen = o;
        return okResponse(reading(undefined, '', 200));
      },
      lock,
    });
    const result: any = await handleUpdateMessageClassMessage(context as any, {
      message_class_name: 'ZMC',
      msgno: '001',
      msgtext: 'x',
    });
    assert.equal(result.isError, false);
    assert.equal(lock.mock.callCount(), 0);
    assert.equal(lockMessage.mock.callCount(), 1);
    assert.equal(lockClassForMessage.mock.callCount(), 1);
    assert.equal(seen.classLockHandle, 'CLASSHANDLE');
    assert.equal(seen.messageLockHandle, 'MESSAGEHANDLE');
    assert.equal(seen.analyse, analyseException);
  });
});

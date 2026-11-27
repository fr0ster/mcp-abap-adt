/**
 * The high-tier deletes' and checks' strategies, proven against a mocked
 * member.
 *
 * **A deletion answers a refusal inside a 200** — `del:isDeleted="false"`
 * plus a `del:message`, exactly the masking family this repository has
 * already fixed twice (issue #154 and its read-path sibling). The handler
 * must not read `response.status`; `analyseDeletion` reads the document.
 * Proven here against a mocked member, not a real channel: the assertion is
 * about the strategy object's own identity (`o.analyse === analyseDeletion`),
 * which only a mock that hands the call's own arguments back can make —
 * a channel test can show the same *result* but not which strategy produced
 * it, and a channel test cannot fail differently for `analyseDeletion` vs.
 * `analyseException` on a document it controls either way.
 *
 * **This file's deletion-service table and its lock-never test were cut
 * once, when `highTierDeleteChannelReal.test.ts` was written, on the
 * reasoning that a channel test proves more.** It proves different things,
 * not more: the reviewer restored this file as a probe and found four
 * mutations the channel table lets straight through — most importantly,
 * swapping `analyseDeletion` for `analyseException` on any of the
 * seventeen deletion-service deletes, which re-opens the exact
 * HTTP-200-with-the-refusal-inside masking this task exists to close,
 * because the channel table's own seeded response never carries a refusal
 * to catch. Restored, and kept for good this time: this file proves which
 * strategy and which projection a handler chose; the channel file proves
 * what reaches the wire. Neither is a substitute for the other.
 *
 * The thirteen checks (`analyseException`/`terseCheck`) and the six
 * not-deletion-service exceptions (`analyseException`, not
 * `analyseDeletion`) are proven the same way, for the same reason.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleCheckBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCheckBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import { handleDeleteBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation';
import { handleCheckClass } from '../../handlers/class/high/handleCheckClass';
import { handleDeleteClass } from '../../handlers/class/high/handleDeleteClass';
import { handleDeleteLocalDefinitions } from '../../handlers/class/high/handleDeleteLocalDefinitions';
import { handleDeleteLocalMacros } from '../../handlers/class/high/handleDeleteLocalMacros';
import { handleDeleteLocalTestClass } from '../../handlers/class/high/handleDeleteLocalTestClass';
import { handleDeleteLocalTypes } from '../../handlers/class/high/handleDeleteLocalTypes';
import { handleCheckDataElement } from '../../handlers/data_element/high/handleCheckDataElement';
import { handleDeleteDataElement } from '../../handlers/data_element/high/handleDeleteDataElement';
import { handleCheckDdl } from '../../handlers/ddl/high/handleCheckDdl';
import { handleDeleteDdl } from '../../handlers/ddl/high/handleDeleteDdl';
import { handleCheckMetadataExtension } from '../../handlers/ddlx/high/handleCheckMetadataExtension';
import { handleCheckDomain } from '../../handlers/domain/high/handleCheckDomain';
import { handleDeleteDomain } from '../../handlers/domain/high/handleDeleteDomain';
import { handleCheckFunctionGroup } from '../../handlers/function/high/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../handlers/function/high/handleCheckFunctionModule';
import { handleDeleteFunctionGroup } from '../../handlers/function_group/high/handleDeleteFunctionGroup';
import { handleDeleteFunctionInclude } from '../../handlers/function_include/high/handleDeleteFunctionInclude';
import { handleDeleteFunctionModule } from '../../handlers/function_module/high/handleDeleteFunctionModule';
import { handleDeleteInclude } from '../../handlers/include/high/handleDeleteInclude';
import { handleCheckInterface } from '../../handlers/interface/high/handleCheckInterface';
import { handleDeleteInterface } from '../../handlers/interface/high/handleDeleteInterface';
import { handleDeleteMessageClass } from '../../handlers/message_class/high/handleDeleteMessageClass';
import { handleDeleteMessageClassMessage } from '../../handlers/message_class/high/handleDeleteMessageClassMessage';
import { handleDeleteMetadataExtension } from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
import { handleCheckPackage } from '../../handlers/package/high/handleCheckPackage';
import { handleCheckProgram } from '../../handlers/program/high/handleCheckProgram';
import { handleDeleteProgram } from '../../handlers/program/high/handleDeleteProgram';
import { handleDeleteServiceBinding } from '../../handlers/service_binding/high/handleDeleteServiceBinding';
import { handleDeleteServiceDefinition } from '../../handlers/service_definition/high/handleDeleteServiceDefinition';
import { handleCheckStructure } from '../../handlers/structure/high/handleCheckStructure';
import { handleDeleteStructure } from '../../handlers/structure/high/handleDeleteStructure';
import { handleCheckTable } from '../../handlers/table/high/handleCheckTable';
import { handleDeleteTable } from '../../handlers/table/high/handleDeleteTable';
import { handleCheckTableType } from '../../handlers/table_type/high/handleCheckTableType';
import { handleDeleteTableType } from '../../handlers/table_type/high/handleDeleteTableType';
import { handleDeleteCdsUnitTest } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import * as clients from '../../lib/clients';
import { analyseDeletion } from '../../lib/strategies/deletionRefusal';
import { parseStructure } from '../../lib/strategies/reading';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';
import { readsModuleIn } from '../helpers/functionModuleMetadata';

mock.method(clients, 'createAdtClient', () => fakeClient);
mock.method(clients, 'createOnPremAdtClient', () => fakeClient);

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

let fakeClient: unknown;

/**
 * A function module's metadata read, naming the group the call gives (#2):
 * for the arguments of a function module only.
 */
function moduleGroupRead(
  args: Record<string, unknown>,
): Record<string, ReturnType<typeof readsModuleIn>> {
  const group = args.function_group_name;
  return typeof group === 'string' && 'function_module_name' in args
    ? { readMetadata: readsModuleIn(group) }
    : {};
}

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('a refused deletion, masked as a 200 by ADT itself', () => {
  it('reports a refused deletion as an error, though ADT answered 200', async () => {
    const document = corpusBody('refusal-delete-refused--01-deletion-delete');
    fakeClient = fakeClientOf({
      delete: async (_c: unknown, o: any) => {
        assert.equal(o.analyse, analyseDeletion);
        return refusedResponse(
          (o.analyse('adt:no-failure', { data: document, status: 200 }) as any)
            .message,
        );
      },
    });
    const result: any = await handleDeleteClass(context as any, {
      class_name: 'ZCL_X',
    });
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).origin, 'refusal');
    assert.ok(!result.content[0].text.includes('"success": true'));
  });

  it('never acquires a lock, because a held lock is what makes a deletion refuse', async () => {
    const lock = mock.fn<(...args: any[]) => any>();
    fakeClient = fakeClientOf({
      delete: async () => okResponse(reading({})),
      lock,
    });
    await handleDeleteClass(context as any, { class_name: 'ZCL_X' });
    assert.equal(lock.mock.callCount(), 0);
  });
});

describe('the nineteen deletion-service deletes: analyseDeletion, and terseDeletion fields', () => {
  for (const [_n, handler, args] of [
    [
      'DeleteBehaviorDefinition',
      handleDeleteBehaviorDefinition,
      { behavior_definition_name: 'Z_BDEF' },
    ],
    [
      'DeleteBehaviorImplementation',
      handleDeleteBehaviorImplementation,
      { behavior_implementation_name: 'Z_BIMPL' },
    ],
    ['DeleteClass', handleDeleteClass, { class_name: 'ZCL_X' }],
    [
      'DeleteDataElement',
      handleDeleteDataElement,
      { data_element_name: 'Z_DE' },
    ],
    ['DeleteDdl', handleDeleteDdl, { ddl_name: 'ZDDL' }],
    ['DeleteDomain', handleDeleteDomain, { domain_name: 'ZD' }],
    [
      'DeleteFunctionGroup',
      handleDeleteFunctionGroup,
      { function_group_name: 'ZFG' },
    ],
    [
      'DeleteFunctionInclude',
      handleDeleteFunctionInclude,
      { function_group_name: 'ZFG', include_name: 'LZFGF01' },
    ],
    [
      'DeleteFunctionModule',
      handleDeleteFunctionModule,
      { function_module_name: 'Z_FM', function_group_name: 'ZFG' },
    ],
    ['DeleteInclude', handleDeleteInclude, { include_name: 'ZI_X' }],
    ['DeleteTableType', handleDeleteTableType, { table_type_name: 'ZTT_X' }],
    ['DeleteInterface', handleDeleteInterface, { interface_name: 'ZIF_X' }],
    [
      'DeleteMessageClass',
      handleDeleteMessageClass,
      { message_class_name: 'ZMSG' },
    ],
    ['DeleteProgram', handleDeleteProgram, { program_name: 'ZPROG' }],
    [
      'DeleteServiceBinding',
      handleDeleteServiceBinding,
      { service_binding_name: 'Z_SB' },
    ],
    [
      'DeleteServiceDefinition',
      handleDeleteServiceDefinition,
      { service_definition_name: 'Z_SRV' },
    ],
    ['DeleteStructure', handleDeleteStructure, { structure_name: 'ZST' }],
    ['DeleteTable', handleDeleteTable, { table_name: 'ZTAB' }],
    [
      'DeleteCdsUnitTest',
      handleDeleteCdsUnitTest,
      { class_name: 'ZCL_CDS_TEST' },
    ],
  ] as [string, any, Record<string, unknown>][]) {
    it(
      format('%s takes analyseDeletion and projects the deletion result', _n),
      async () => {
        const document = corpusBody('delete-success--01-deletion-delete');
        const seen: unknown[] = [];
        const lock = mock.fn<(...args: any[]) => any>();
        fakeClient = fakeClientOf({
          ...moduleGroupRead(args),
          delete: async (_c: unknown, o: any) => {
            seen.push(o.analyse);
            return okResponse(reading(parseStructure(document), document, 200));
          },
          lock,
        });
        const result: any = await (handler as any)(context as any, args);
        assert.deepStrictEqual(seen, [analyseDeletion]);
        assert.equal(lock.mock.callCount(), 0);
        // terseDeletion's own fields (`deleted`, `object`), so a projection
        // swapped for terseCheck/terseWrite fails here.
        assertMatchObject(JSON.parse(result.content[0].text), {
          deleted: true,
          object: 'ZMCP_BLD_ANSCH01',
        });
      },
    );
  }
});

describe('the six not-deletion-service exceptions: analyseException, never analyseDeletion', () => {
  for (const [_n, handler] of [
    ['DeleteLocalDefinitions', handleDeleteLocalDefinitions],
    ['DeleteLocalMacros', handleDeleteLocalMacros],
    ['DeleteLocalTypes', handleDeleteLocalTypes],
    ['DeleteLocalTestClass', handleDeleteLocalTestClass],
  ]) {
    it(
      format(
        '%s empties the include under the class lock, with analyseException — not analyseDeletion',
        _n,
      ),
      async () => {
        const order: string[] = [];
        const seenSourceCode: unknown[] = [];
        const seenAnalyse: unknown[] = [];
        fakeClient = fakeClientOf({
          lock: async () => {
            order.push('lock');
            return okResponse('handle-1');
          },
          update: async (_c: unknown, o: any) => {
            order.push('update');
            seenSourceCode.push(o.source);
            seenAnalyse.push(o.analyse);
            return okResponse(reading(undefined, '', 200));
          },
          unlock: async () => {
            order.push('unlock');
            return okResponse(undefined);
          },
        });
        const result: any = await (handler as any)(context as any, {
          class_name: 'ZCL_X',
        });
        assert.equal(result.isError, false);
        assert.deepStrictEqual(order, ['lock', 'update', 'unlock']);
        assert.deepStrictEqual(seenSourceCode, ['']);
        assert.deepStrictEqual(seenAnalyse, [analyseException]);
      },
    );
  }

  it('DeleteMessageClassMessage removes the message through update (removeMessage: true) with analyseException, inside the lock window', async () => {
    const lock = mock.fn<(...args: any[]) => any>();
    const unlock = mock.fn(async () => okResponse(undefined));
    const unlockMessages = mock.fn(async () => okResponse(undefined));
    let seenConfig: any;
    let seenAnalyse: unknown;
    fakeClient = fakeClientOf({
      lockMessage: async () => okResponse('MESSAGEHANDLE'),
      lockClassForMessage: async () => okResponse('CLASSHANDLE'),
      update: async (c: unknown, o: any) => {
        seenConfig = c;
        seenAnalyse = o.analyse;
        return okResponse(reading(undefined, '', 200));
      },
      lock,
      unlock,
      unlockMessages,
    });
    const result: any = await handleDeleteMessageClassMessage(context as any, {
      message_class_name: 'ZMSG',
      msgno: '001',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(seenConfig, {
      className: 'ZMSG',
      msgno: '001',
      transportRequest: undefined,
      removeMessage: true,
    });
    assert.equal(seenAnalyse, analyseException);
    assert.equal(lock.mock.callCount(), 0);
    assert.equal(unlock.mock.callCount(), 1);
    assert.equal(unlockMessages.mock.callCount(), 1);
  });

  it('DeleteMetadataExtension calls delete with analyseException and projects terseWrite (status-derived)', async () => {
    let seenAnalyse: unknown;
    fakeClient = fakeClientOf({
      delete: async (_c: unknown, o: any) => {
        seenAnalyse = o.analyse;
        return okResponse(reading(undefined, '', 200));
      },
    });
    const result: any = await handleDeleteMetadataExtension(context as any, {
      metadata_extension_name: 'Z_DDLX',
    });
    assert.equal(result.isError, false);
    assert.equal(seenAnalyse, analyseException);
    // terseWrite's own shape: a bare string, not a `deleted`/`object` JSON
    // object — a projection swapped back to terseDeletion fails here.
    assert.equal(result.content[0].text, 'SUCCESS');
  });
});

describe('the thirteen checks: analyseException, and terseCheck fields', () => {
  for (const [_n, handler, args] of [
    [
      'CheckBehaviorDefinition',
      handleCheckBehaviorDefinition,
      { name: 'Z_BDEF' },
    ],
    ['CheckClass', handleCheckClass, { class_name: 'ZCL_X' }],
    ['CheckDataElement', handleCheckDataElement, { data_element_name: 'Z_DE' }],
    ['CheckDdl', handleCheckDdl, { ddl_name: 'ZDDL' }],
    [
      'CheckMetadataExtension',
      handleCheckMetadataExtension,
      { name: 'Z_DDLX' },
    ],
    ['CheckDomain', handleCheckDomain, { domain_name: 'ZD' }],
    [
      'CheckFunctionGroup',
      handleCheckFunctionGroup,
      { function_group_name: 'ZFG' },
    ],
    [
      'CheckFunctionModule',
      handleCheckFunctionModule,
      { function_group_name: 'ZFG', function_module_name: 'Z_FM' },
    ],
    ['CheckInterface', handleCheckInterface, { interface_name: 'ZIF_X' }],
    [
      'CheckPackage',
      handleCheckPackage,
      { package_name: 'ZPKG', super_package: 'ZSUPER' },
    ],
    ['CheckProgram', handleCheckProgram, { program_name: 'ZPROG' }],
    ['CheckStructure', handleCheckStructure, { structure_name: 'ZST' }],
    ['CheckTable', handleCheckTable, { table_name: 'ZTAB' }],
    ['CheckTableType', handleCheckTableType, { table_type_name: 'ZTT_X' }],
  ] as [string, any, Record<string, unknown>][]) {
    it(
      format('%s takes analyseException and projects the check report', _n),
      async () => {
        const document = corpusBody('check-success-verdict--01-checkrun');
        const seen: unknown[] = [];
        fakeClient = fakeClientOf({
          ...moduleGroupRead(args),
          check: async (_c: unknown, _status: unknown, o: any) => {
            seen.push(o.analyse);
            return okResponse(reading(parseStructure(document), document, 200));
          },
        });
        const result: any = await (handler as any)(context as any, args);
        assert.deepStrictEqual(seen, [analyseException]);
        // terseCheck's own fields, so a projection swapped for terseDeletion fails
        // here rather than passing as "some JSON came back".
        assertMatchObject(JSON.parse(result.content[0].text), { ran: true });
      },
    );
  }
});

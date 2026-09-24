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

import {
  analyseDeletion,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
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
import { handleDeleteCdsUnitTest } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { corpusBody } from '../../lib/adtCorpus';
import { parseStructure } from '../../lib/strategies/reading';
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

describe('a refused deletion, masked as a 200 by ADT itself', () => {
  it('reports a refused deletion as an error, though ADT answered 200', async () => {
    const document = corpusBody('refusal-delete-refused--01-deletion-delete');
    fakeClient = fakeClientOf({
      delete: async (_c: unknown, o: any) => {
        expect(o.analyse).toBe(analyseDeletion);
        return refusedResponse(
          (o.analyse('adt:no-failure', { data: document, status: 200 }) as any)
            .message,
        );
      },
    });
    const result: any = await handleDeleteClass(context as any, {
      class_name: 'ZCL_X',
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
    expect(result.content[0].text).not.toContain('"success": true');
  });

  it('never acquires a lock, because a held lock is what makes a deletion refuse', async () => {
    const lock = jest.fn();
    fakeClient = fakeClientOf({
      delete: async () => okResponse(reading({})),
      lock,
    });
    await handleDeleteClass(context as any, { class_name: 'ZCL_X' });
    expect(lock).not.toHaveBeenCalled();
  });
});

describe('the seventeen deletion-service deletes: analyseDeletion, and terseDeletion fields', () => {
  it.each([
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
  ])(
    '%s takes analyseDeletion and projects the deletion result',
    async (_n, handler, args) => {
      const document = corpusBody('delete-success--01-deletion-delete');
      const seen: unknown[] = [];
      const lock = jest.fn();
      fakeClient = fakeClientOf({
        delete: async (_c: unknown, o: any) => {
          seen.push(o.analyse);
          return okResponse(reading(parseStructure(document), document, 200));
        },
        lock,
      });
      const result: any = await (handler as any)(context as any, args);
      expect(seen).toEqual([analyseDeletion]);
      expect(lock).not.toHaveBeenCalled();
      // terseDeletion's own fields (`deleted`, `object`), so a projection
      // swapped for terseCheck/terseWrite fails here.
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        deleted: true,
        object: 'ZMCP_BLD_ANSCH01',
      });
    },
  );
});

describe('the six not-deletion-service exceptions: analyseException, never analyseDeletion', () => {
  it.each([
    ['DeleteLocalDefinitions', handleDeleteLocalDefinitions],
    ['DeleteLocalMacros', handleDeleteLocalMacros],
    ['DeleteLocalTypes', handleDeleteLocalTypes],
    ['DeleteLocalTestClass', handleDeleteLocalTestClass],
  ])(
    '%s empties the include under the class lock, with analyseException — not analyseDeletion',
    async (_n, handler) => {
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
          seenSourceCode.push(o.sourceCode);
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
      expect(result.isError).toBe(false);
      expect(order).toEqual(['lock', 'update', 'unlock']);
      expect(seenSourceCode).toEqual(['']);
      expect(seenAnalyse).toEqual([analyseException]);
    },
  );

  it('DeleteMessageClassMessage calls delete with analyseException, no lock available to take', async () => {
    const lock = jest.fn();
    let seenAnalyse: unknown;
    fakeClient = fakeClientOf({
      delete: async (_c: unknown, o: any) => {
        seenAnalyse = o.analyse;
        return okResponse(reading(undefined, '', 200));
      },
      lock,
    });
    const result: any = await handleDeleteMessageClassMessage(context as any, {
      message_class_name: 'ZMSG',
      msgno: '001',
    });
    expect(result.isError).toBe(false);
    expect(seenAnalyse).toBe(analyseException);
    expect(lock).not.toHaveBeenCalled();
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
    expect(result.isError).toBe(false);
    expect(seenAnalyse).toBe(analyseException);
    // terseWrite's own shape: a bare string, not a `deleted`/`object` JSON
    // object — a projection swapped back to terseDeletion fails here.
    expect(result.content[0].text).toBe('SUCCESS');
  });
});

describe('the thirteen checks: analyseException, and terseCheck fields', () => {
  it.each([
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
  ])(
    '%s takes analyseException and projects the check report',
    async (_n, handler, args) => {
      const document = corpusBody('check-success-verdict--01-checkrun');
      const seen: unknown[] = [];
      fakeClient = fakeClientOf({
        check: async (_c: unknown, _status: unknown, o: any) => {
          seen.push(o.analyse);
          return okResponse(reading(parseStructure(document), document, 200));
        },
      });
      const result: any = await (handler as any)(context as any, args);
      expect(seen).toEqual([analyseException]);
      // terseCheck's own fields, so a projection swapped for terseDeletion fails
      // here rather than passing as "some JSON came back".
      expect(JSON.parse(result.content[0].text)).toMatchObject({ ran: true });
    },
  );
});

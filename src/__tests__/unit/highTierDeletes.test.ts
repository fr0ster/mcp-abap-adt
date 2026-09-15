/**
 * The twenty-four high-tier deletes and thirteen high-tier checks task 21 of
 * the consumer-side migration was given.
 *
 * **A deletion answers a refusal inside a 200** — `del:isDeleted="false"`
 * plus a `del:message`, exactly the masking family this repository has
 * already fixed twice (issue #154 and its read-path sibling). The handler
 * must not read `response.status`; `analyseDeletion` reads the document.
 *
 * **Seventeen deletes plus `DeleteCdsUnitTest` hit the deletion service
 * directly** (`analyseDeletion`/`structured`/`terseDeletion`, none of which
 * locks — a held lock is what makes ADT refuse a deletion). **Four
 * (`DeleteLocalDefinitions/Macros/TestClass/Types`) and
 * `DeleteMessageClassMessage` are not deletion-service calls at all** — see
 * each handler's own doc comment for why (an include has no DELETE, a
 * message is removed by PUTting its class). `DeleteUnitTest` never reaches
 * the client (ADT exposes no resource for it) and is not covered here — see
 * its own doc comment.
 */

import { analyseCheck, analyseDeletion } from '@mcp-abap-adt/adt-strategies';
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
import { handleDeleteUnitTest } from '../../handlers/unit_test/high/handleDeleteUnitTest';
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

describe('the thirteen checks: analyseCheck, and terseCheck fields', () => {
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
  ])('%s takes analyseCheck and projects the check report', async (_n, handler, args) => {
    const document = corpusBody('check-success-verdict--01-checkrun');
    const seen: unknown[] = [];
    fakeClient = fakeClientOf({
      check: async (_c: unknown, _status: unknown, o: any) => {
        seen.push(o.analyse);
        return okResponse(reading(parseStructure(document), document, 200));
      },
    });
    const result: any = await (handler as any)(context as any, args);
    expect(seen).toEqual([analyseCheck]);
    // terseCheck's own fields, so a projection swapped for terseDeletion fails
    // here rather than passing as "some JSON came back".
    expect(JSON.parse(result.content[0].text)).toMatchObject({ ran: true });
  });
});

describe('the deletion-service deletes: analyseDeletion, and terseDeletion fields', () => {
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
    [
      'DeleteMetadataExtension',
      handleDeleteMetadataExtension,
      { metadata_extension_name: 'Z_DDLX' },
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
  ])('%s takes analyseDeletion and projects the deletion result', async (_n, handler, args) => {
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
  });
});

describe('the write-shaped exceptions: not deletion-service calls', () => {
  it.each([
    ['DeleteLocalDefinitions', handleDeleteLocalDefinitions],
    ['DeleteLocalMacros', handleDeleteLocalMacros],
    ['DeleteLocalTypes', handleDeleteLocalTypes],
    ['DeleteLocalTestClass', handleDeleteLocalTestClass],
  ])('%s empties the include under the class lock, with analyseException — not analyseDeletion', async (_n, handler) => {
    const order: string[] = [];
    const seenSourceCode: unknown[] = [];
    fakeClient = fakeClientOf({
      lock: async () => {
        order.push('lock');
        return okResponse('handle-1');
      },
      update: async (_c: unknown, o: any) => {
        order.push('update');
        seenSourceCode.push(o.sourceCode);
        expect(o.analyse).not.toBe(analyseDeletion);
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
  });

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
    expect(seenAnalyse).not.toBe(analyseDeletion);
    expect(lock).not.toHaveBeenCalled();
  });

  it('DeleteUnitTest never reaches the client: ADT exposes no resource for a test run', async () => {
    fakeClient = new Proxy(
      {},
      {
        get() {
          throw new Error('DeleteUnitTest must not touch the client');
        },
      },
    );
    const result: any = await handleDeleteUnitTest(context as any, {
      run_id: 'RUN1',
    });
    expect(result.isError).toBe(true);
  });
});

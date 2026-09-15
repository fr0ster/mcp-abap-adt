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
 * it.
 *
 * The thirteen checks (`analyseCheck`/`terseCheck`) are proven the same way,
 * for the same reason.
 *
 * **What this file does NOT prove — see `highTierDeleteChannelReal.test.ts`
 * for the rest.** A mocked member answers whatever the test told it to,
 * regardless of what the handler actually passed as the object's name, which
 * factory it reached, or whether a lock handle a `withLock` chain took
 * actually made it onto the write. Those are real-channel questions, run
 * through a real `AdtClient` against `recordingConnection`, in the sibling
 * file — this one and that one cannot share a test file, because this one's
 * `jest.mock('../../lib/clients', …)` would swallow the real client the
 * channel table depends on.
 */

import { analyseCheck, analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { handleCheckBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCheckBehaviorDefinition';
import { handleCheckClass } from '../../handlers/class/high/handleCheckClass';
import { handleDeleteClass } from '../../handlers/class/high/handleDeleteClass';
import { handleCheckDataElement } from '../../handlers/data_element/high/handleCheckDataElement';
import { handleCheckDdl } from '../../handlers/ddl/high/handleCheckDdl';
import { handleCheckMetadataExtension } from '../../handlers/ddlx/high/handleCheckMetadataExtension';
import { handleCheckDomain } from '../../handlers/domain/high/handleCheckDomain';
import { handleCheckFunctionGroup } from '../../handlers/function/high/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../handlers/function/high/handleCheckFunctionModule';
import { handleCheckInterface } from '../../handlers/interface/high/handleCheckInterface';
import { handleCheckPackage } from '../../handlers/package/high/handleCheckPackage';
import { handleCheckProgram } from '../../handlers/program/high/handleCheckProgram';
import { handleCheckStructure } from '../../handlers/structure/high/handleCheckStructure';
import { handleCheckTable } from '../../handlers/table/high/handleCheckTable';
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

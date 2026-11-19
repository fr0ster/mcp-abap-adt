/**
 * The read operations compact gained for issue #259: data and a package's
 * contents (search and where-used are `HandlerSystem`'s actions, pinned in
 * `handlerSystem.test.ts`). Each is a routing onto a core reader; these pin
 * which reader and with which arguments, and what the facade adds of its own.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import * as packageContents from '../../../src/handlers/package/readonly/handleGetPackageContents';
import * as sqlQuery from '../../../src/handlers/system/readonly/handleGetSqlQuery';
import * as tableContents from '../../../src/handlers/table/readonly/handleGetTableContents';

const calls: Array<{ tool: string; args: any }> = [];
let contentsAnswer: unknown;

// The three readers replaced on the modules that define them, before the
// facades load: HandlerGetData and the compact part routes bind them when
// they load (`defineTool(…)` at module level), through lib's read barrel,
// whose getters read these modules. As the Jest factory on the barrel did;
// every other name stays real.
const record =
  (tool: string, answer?: () => unknown) =>
  async (_context: unknown, args: unknown) => {
    calls.push({ tool, args });
    return answer
      ? answer()
      : { isError: false, content: [{ type: 'text', text: '{}' }] };
  };
mock.method(
  tableContents,
  'handleGetTableContents',
  record('GetTableContents'),
);
mock.method(sqlQuery, 'handleGetSqlQuery', record('GetSqlQuery'));
mock.method(
  packageContents,
  'handleGetPackageContents',
  record('GetPackageContents', () => contentsAnswer),
);

import { defineTool } from '@mcp-abap-adt/lib/handlers';
import { assertRejects } from '../../../src/__tests__/helpers/assertions';
import { handleHandlerGet } from '../handlers/handleHandlerGet';
import {
  TOOL_DEFINITION as GetData_Tool,
  handleHandlerGetData,
} from '../handlers/handleHandlerGetData';

// The process declares its system type, as every launcher requires: the
// type argument is checked against the declared variant's projection.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const context = {
  connection: { getSessionId: () => null },
  logger: undefined,
} as never;

beforeEach(() => {
  calls.length = 0;
  contentsAnswer = { isError: false, content: [{ type: 'text', text: '[]' }] };
});

describe('HandlerGetData', () => {
  it('runs the SELECT when one is given', async () => {
    await handleHandlerGetData(context, {
      sql_query: 'SELECT * FROM ZT WHERE A = 1',
      max_rows: 5,
    });
    assert.deepStrictEqual(calls, [
      {
        tool: 'GetSqlQuery',
        args: {
          sql_query: 'SELECT * FROM ZT WHERE A = 1',
          row_number: 5,
          detail: 'terse',
        },
      },
    ]);
  });

  it('reads every column of the object otherwise', async () => {
    await handleHandlerGetData(context, { object_name: 'ZT' });
    assert.deepStrictEqual(calls, [
      {
        tool: 'GetTableContents',
        args: { table_name: 'ZT', max_rows: 100, detail: 'terse' },
      },
    ]);
  });

  it('refuses with neither, asking nothing: its schema holds the rule', async () => {
    await assertRejects(
      defineTool(GetData_Tool, handleHandlerGetData).call(context, {}),
      'object_name or sql_query is required',
    );
    assert.equal(calls.length, 0);
  });
});

describe('HandlerGet PACKAGE part contents', () => {
  it('lists the objects the package contains', async () => {
    await handleHandlerGet(context, {
      object_type: 'PACKAGE',
      part: 'contents',
      package_name: 'ZPKG',
    } as never);
    assert.equal(calls[0].tool, 'GetPackageContents');
    assert.equal(calls[0].args.package_name, 'ZPKG');
  });

  it('answers one line per member: name, type, description', async () => {
    contentsAnswer = {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              name: 'ZCL_A',
              type: 'CLAS/OC',
              description: 'A',
              packageName: 'ZPKG',
              kind: 'class',
              isPackage: false,
            },
            {
              name: 'ZSUB',
              type: 'DEVC/K',
              description: 'Sub',
              packageName: 'ZPKG',
              kind: 'package',
              isPackage: true,
            },
          ]),
        },
      ],
    };
    const answered: any = await handleHandlerGet(context, {
      object_type: 'PACKAGE',
      part: 'contents',
      package_name: 'ZPKG',
    } as never);
    assert.equal(
      answered.content[0].text,
      'name\ttype\tdescription\nZCL_A\tCLAS/OC\tA\nZSUB\tDEVC/K\tSub',
    );
  });

  it('caps the list and says how many there are', async () => {
    contentsAnswer = {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            Array.from({ length: 7 }, (_, i) => ({
              name: `Z${i}`,
              type: 'DEVC/K',
              description: '',
            })),
          ),
        },
      ],
    };
    const answered: any = await handleHandlerGet(context, {
      object_type: 'PACKAGE',
      part: 'contents',
      package_name: 'ZPKG',
      max_results: 3,
    } as never);
    const lines = answered.content[0].text.split('\n');
    assert.equal(lines.length, 5);
    assert.equal(lines.at(-1), '(3 of 7 shown; raise max_results for more)');
  });

  it('is refused for a type that has no contents, naming what it offers', async () => {
    const answered: any = await handleHandlerGet(context, {
      object_type: 'CLASS',
      part: 'contents',
      class_name: 'ZCL_X',
    } as never);
    assert.equal(answered.isError, true);
    assert.ok(
      answered.content[0].text.includes('part=contents is not available'),
    );
    assert.equal(calls.length, 0);
  });
});

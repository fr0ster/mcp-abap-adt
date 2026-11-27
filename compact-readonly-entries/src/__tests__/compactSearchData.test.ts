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
// whose getters read these modules. Every other name stays real.
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
import {
  TOOL_DEFINITION as CompactGet,
  handleHandlerGet,
} from '../handlers/handleHandlerGet';
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
        args: { table_name: 'ZT', detail: 'terse' },
      },
    ]);
  });

  // No bound of the server's (#391): one given goes on as given, 0 included.
  it('forwards no row bound when none is given, and a given one as given', async () => {
    await handleHandlerGetData(context, { sql_query: 'SELECT * FROM ZT' });
    await handleHandlerGetData(context, { object_name: 'ZT', max_rows: 0 });
    assert.deepStrictEqual(calls, [
      {
        tool: 'GetSqlQuery',
        args: { sql_query: 'SELECT * FROM ZT', detail: 'terse' },
      },
      {
        tool: 'GetTableContents',
        args: { table_name: 'ZT', max_rows: 0, detail: 'terse' },
      },
    ]);
  });

  // The level asked reaches the read it routes to, as that tool takes it.
  for (const detail of ['medium', 'full', 'raw'] as const) {
    it(`forwards detail ${detail} to the read it routes to`, async () => {
      await defineTool(GetData_Tool, handleHandlerGetData).call(context, {
        object_name: 'ZT',
        detail,
      });
      await defineTool(GetData_Tool, handleHandlerGetData).call(context, {
        sql_query: 'SELECT * FROM ZT',
        detail,
      });
      assert.deepStrictEqual(
        calls.map((call) => [call.tool, call.args.detail]),
        [
          ['GetTableContents', detail],
          ['GetSqlQuery', detail],
        ],
      );
    });
  }

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

  // Compact parity: the contents part is GetPackageContents' answer as it
  // came, at the level asked; nothing is reshaped or cut.
  for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
    it(`answers what GetPackageContents answers at detail ${detail}, every member`, async () => {
      const read = {
        isError: false,
        content: [
          {
            type: 'text',
            text: `# package ZPKG ${detail}\n${Array.from(
              { length: 150 },
              (_, i) => `DEVC/K\tZ${i}`,
            ).join('\n')}`,
          },
        ],
      };
      contentsAnswer = read;
      const answered: any = await defineTool(CompactGet, handleHandlerGet).call(
        context,
        {
          object_type: 'PACKAGE',
          part: 'contents',
          package_name: 'ZPKG',
          max_results: 3,
          detail,
        },
      );
      assert.deepStrictEqual(answered, read);
      assert.equal(calls[0]?.args.detail, detail);
    });
  }

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

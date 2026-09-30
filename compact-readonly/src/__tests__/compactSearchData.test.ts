/**
 * The read operations compact gained for issue #259: search, where-used, data
 * and a package's contents. Each is a routing onto a core reader; these pin
 * which reader and with which arguments, and what the facade adds of its own —
 * the where-used cap and the function module's group.
 */

const calls: Array<{ tool: string; args: any }> = [];
let whereUsedAnswer: unknown;
let contentsAnswer: unknown;

jest.mock('@mcp-abap-adt/lib/handlers/read', () => {
  const record = (tool: string, answer?: () => unknown) =>
    jest.fn(async (_context: unknown, args: unknown) => {
      calls.push({ tool, args });
      return answer
        ? answer()
        : { isError: false, content: [{ type: 'text', text: '{}' }] };
    });
  return {
    ...jest.requireActual('@mcp-abap-adt/lib/handlers/read'),
    handleSearchObject: record('SearchObject'),
    handleGetWhereUsed: record('GetWhereUsed', () => whereUsedAnswer),
    handleGetTableContents: record('GetTableContents'),
    handleGetSqlQuery: record('GetSqlQuery'),
    handleGetPackageContents: record(
      'GetPackageContents',
      () => contentsAnswer,
    ),
  };
});

import { handleHandlerGet } from '../handlers/handleHandlerGet';
import { handleHandlerGetData } from '../handlers/handleHandlerGetData';
import { handleHandlerSearch } from '../handlers/handleHandlerSearch';
import { handleHandlerWhereUsed } from '../handlers/handleHandlerWhereUsed';

const context = {
  connection: { getSessionId: () => null },
  logger: undefined,
} as never;

beforeEach(() => {
  calls.length = 0;
  whereUsedAnswer = { isError: false, content: [{ type: 'text', text: '{}' }] };
  contentsAnswer = { isError: false, content: [{ type: 'text', text: '[]' }] };
});

describe('HandlerSearch', () => {
  it('searches by the mask, with the type and the cap', async () => {
    await handleHandlerSearch(context, {
      query: 'Z*',
      object_type: 'CLAS/OC',
      max_results: 20,
    });
    expect(calls).toEqual([
      {
        tool: 'SearchObject',
        args: { object_name: 'Z*', object_type: 'CLAS/OC', maxResults: 20 },
      },
    ]);
  });

  it('refuses without a query, asking nothing', async () => {
    const answered: any = await handleHandlerSearch(context, {} as never);
    expect(answered.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('HandlerWhereUsed', () => {
  it('names the type the where-used reader knows', async () => {
    await handleHandlerWhereUsed(context, {
      object_type: 'DDL',
      object_name: 'ZI_VIEW',
    });
    expect(calls[0]).toEqual({
      tool: 'GetWhereUsed',
      args: { object_name: 'ZI_VIEW', object_type: 'view' },
    });
  });

  it('addresses a function module under its group', async () => {
    await handleHandlerWhereUsed(context, {
      object_type: 'FUNCTION_MODULE',
      object_name: 'Z_FM',
      function_group_name: 'ZFG',
    });
    expect(calls[0].args).toEqual({
      object_name: 'ZFG|Z_FM',
      object_type: 'functionmodule',
    });
  });

  it('refuses a function module without its group', async () => {
    const answered: any = await handleHandlerWhereUsed(context, {
      object_type: 'FUNCTION_MODULE',
      object_name: 'Z_FM',
    });
    expect(answered.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('caps the references and keeps the total', async () => {
    const references = Array.from({ length: 250 }, (_, i) => ({
      name: `R${i}`,
    }));
    whereUsedAnswer = {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ total_references: 250, references }),
        },
      ],
    };
    const answered: any = await handleHandlerWhereUsed(context, {
      object_type: 'CLASS',
      object_name: 'ZCL_X',
      max_results: 10,
    });
    const value = JSON.parse(answered.content[0].text);
    expect(value.references).toHaveLength(10);
    expect(value.total_references).toBe(250);
    expect(value.returned_references).toBe(10);
  });
});

describe('HandlerGetData', () => {
  it('runs the SELECT when one is given', async () => {
    await handleHandlerGetData(context, {
      sql_query: 'SELECT * FROM ZT WHERE A = 1',
      max_rows: 5,
    });
    expect(calls).toEqual([
      {
        tool: 'GetSqlQuery',
        args: { sql_query: 'SELECT * FROM ZT WHERE A = 1', row_number: 5 },
      },
    ]);
  });

  it('reads every column of the object otherwise', async () => {
    await handleHandlerGetData(context, { object_name: 'ZT' });
    expect(calls).toEqual([
      { tool: 'GetTableContents', args: { table_name: 'ZT', max_rows: 100 } },
    ]);
  });

  it('refuses with neither, asking nothing', async () => {
    const answered: any = await handleHandlerGetData(context, {});
    expect(answered.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('HandlerGet PACKAGE part contents', () => {
  it('lists the objects the package contains', async () => {
    await handleHandlerGet(context, {
      object_type: 'PACKAGE',
      part: 'contents',
      package_name: 'ZPKG',
    } as never);
    expect(calls[0].tool).toBe('GetPackageContents');
    expect(calls[0].args.package_name).toBe('ZPKG');
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
    expect(answered.content[0].text).toBe(
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
    expect(lines).toHaveLength(5);
    expect(lines.at(-1)).toBe('(3 of 7 shown; raise max_results for more)');
  });

  it('is refused for a type that has no contents, naming what it offers', async () => {
    const answered: any = await handleHandlerGet(context, {
      object_type: 'CLASS',
      part: 'contents',
      class_name: 'ZCL_X',
    } as never);
    expect(answered.isError).toBe(true);
    expect(answered.content[0].text).toContain(
      'part=contents is not available',
    );
    expect(calls).toHaveLength(0);
  });
});

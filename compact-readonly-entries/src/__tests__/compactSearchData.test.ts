/**
 * The read operations compact gained for issue #259: data and a package's
 * contents (search and where-used are `HandlerSystem`'s actions, pinned in
 * `handlerSystem.test.ts`). Each is a routing onto a core reader; these pin
 * which reader and with which arguments, and what the facade adds of its own.
 */

const calls: Array<{ tool: string; args: any }> = [];
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
    expect(calls).toEqual([
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
    expect(calls).toEqual([
      {
        tool: 'GetTableContents',
        args: { table_name: 'ZT', max_rows: 100, detail: 'terse' },
      },
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

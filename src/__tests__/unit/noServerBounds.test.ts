/**
 * The server picks no bound of its own (fr0ster/mcp-abap-adt#391): a bound
 * applies only when the consumer gives it, as given; otherwise the bound is
 * SAP's, or there is none. One section per site of the issue's list (the
 * data tools, items 1–3, are `dataRowBound.test.ts`).
 *
 * What is asserted is what the handler hands the client — the seam where a
 * number of the server's would enter.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import {
  TOOL_DEFINITION as AmdpDebugGetTable,
  handleAmdpDebugGetTable,
} from '../../handlers/debugger/debug/handleAmdpDebugGetTable';
import { includesWithin } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import {
  handleSearchObject,
  TOOL_DEFINITION as SearchObject,
} from '../../handlers/search/readonly/handleSearchObject';
import * as clients from '../../lib/clients';
import * as debuggerAccess from '../../lib/debugger/access';
import { substringLineMatch } from '../../lib/search-source/lineScanner';
import { runSearchSource } from '../../lib/search-source/orchestrator';
import { skipSapAnswers } from '../../lib/search-source/readFailure';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';
import { exactPackages, listing } from '../helpers/sourceReaderFake';

const asked: Array<{ member: string; args: unknown[] }> = [];

const recorded =
  (member: string, value: unknown = '') =>
  async (...args: never[]) => {
    asked.push({ member, args });
    return okResponse(reading(value, String(value)));
  };

mock.method(clients, 'adtClientOf', () => ({
  variant: 'onprem',
  client: fakeClientOf({
    search: recorded(
      'search',
      '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>',
    ),
  }),
}));

const context = {
  connection: { getSessionId: () => null },
  logger: undefined,
} as never;

beforeEach(() => {
  asked.length = 0;
});

const criteriaOf = (member: string) =>
  asked.filter((call) => call.member === member).map((call) => call.args[0]);

describe('SearchObject (#391, item 4): maxResults is the consumer’s or SAP’s', () => {
  it('the schema gives no maxResults of its own', () => {
    const parsed = SearchObject.inputSchema.parse({ object_name: 'Z*' });
    assert.equal('maxResults' in parsed, false, JSON.stringify(parsed));
  });

  it('without maxResults the search is handed none', async () => {
    await handleSearchObject(context, { object_name: 'Z*' });
    assert.deepStrictEqual(criteriaOf('search'), [{ query: 'Z*' }]);
  });

  for (const given of [0, 7]) {
    it(`maxResults ${given} is handed on as given`, async () => {
      await handleSearchObject(context, {
        object_name: 'Z*',
        maxResults: given,
      });
      assert.deepStrictEqual(criteriaOf('search'), [
        { query: 'Z*', maxResults: given },
      ]);
    });
  }
});

describe('GetEnhancements (#391, item 10): max_includes is the consumer’s', () => {
  const names = Array.from({ length: 60 }, (_, n) => `ZINC_${n}`);

  it('without max_includes every include found is read', () => {
    assert.deepStrictEqual(includesWithin(names, undefined), names);
  });

  for (const given of [3, 0]) {
    it(`max_includes ${given} reads that many`, () => {
      assert.deepStrictEqual(
        includesWithin(names, given),
        names.slice(0, given),
      );
    });
  }
});

describe('AmdpDebugGetTable (#391, item 14): row_number is the consumer’s or SAP’s', () => {
  const tables: unknown[][] = [];
  mock.method(debuggerAccess, 'debugBatchRecorder', () => undefined);
  mock.method(debuggerAccess, 'requireDebugger', () => ({
    amdp: {
      getTable: async (...args: unknown[]) => {
        tables.push(args);
        return { value: { rows: [], columns: [] }, raw: '' };
      },
    },
  }));

  beforeEach(() => {
    tables.length = 0;
  });

  it('the schema takes row_number, with no default of its own', () => {
    const parsed = AmdpDebugGetTable.inputSchema.parse({
      variable: 'LT',
      state_handle: 'H',
    });
    assert.equal('row_number' in parsed, false, JSON.stringify(parsed));
  });

  it('without row_number the read is handed no bound', async () => {
    await handleAmdpDebugGetTable(context, {
      variable: 'LT',
      state_handle: 'H',
    });
    assert.deepStrictEqual(tables, [['LT', undefined, undefined]]);
  });

  it('row_number is handed on as given', async () => {
    await handleAmdpDebugGetTable(context, {
      variable: 'LT',
      state_handle: 'H',
      row_number: 7,
    });
    assert.deepStrictEqual(tables, [['LT', undefined, 7]]);
  });
});

describe('SearchSource (#391): the reads in flight are the consumer’s', () => {
  const target = (name: string) => ({
    name,
    type: 'PROG/P',
    packageName: 'ZPKG',
    isPackage: false,
  });
  const names = Array.from({ length: 30 }, (_, n) => `ZP${n}`);
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  /** The most source reads open at once, with `concurrency` as given or none. */
  async function mostOpen(concurrency?: number): Promise<number> {
    let open = 0;
    let most = 0;
    await runSearchSource(
      {
        fetchPackageContents: async (name) => listing(name, names.map(target)),
        sourceReader: {
          async readSource() {
            open += 1;
            most = Math.max(most, open);
            for (let i = 0; i < 5; i++) await tick();
            open -= 1;
            return { ok: true, value: 'nothing here' };
          },
          readStructure: async () => ({ ok: true, value: [] }),
        },
        lineMatch: substringLineMatch,
        sapAnswers: skipSapAnswers,
        resolvePackages: exactPackages,
      },
      {
        query: 'marker',
        packages: ['ZPKG'],
        object_types: ['PROG'],
        ...(concurrency === undefined ? {} : { concurrency }),
      },
    );
    return most;
  }

  it('one read at a time when none is given', async () => {
    assert.equal(await mostOpen(), 1);
  });

  it('as many as given, with no cap of the server’s', async () => {
    assert.equal(await mostOpen(20), 20);
  });
});

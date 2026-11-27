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
  handleSearchObject,
  TOOL_DEFINITION as SearchObject,
} from '../../handlers/search/readonly/handleSearchObject';
import * as clients from '../../lib/clients';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

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

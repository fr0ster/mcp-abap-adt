/**
 * Unit test (#128): GetStructuresList append (where-used) handling.
 *  - scopes the search to append structures only (enableOnlyTypes: ['TABL/DS']),
 *    so a heavily-used base does not lose its appends to the where-used record cap;
 *  - resolves the base object_type itself (try 'structure', fall back to 'table'),
 *    since adt-clients does not auto-fallback;
 *  - does NOT swallow a where-used failure — it flags `appends_unavailable`.
 * SAP-free via a mocked AdtClient.
 *
 * Migrated for adt-clients 19: `getWhereUsedList` (one call, plain object
 * answer) no longer exists. The handler now composes it via
 * `fetchWhereUsedReferences` (`src/lib/strategies/whereUsedList.ts`) over
 * `getWhereUsedScope` → `modifyWhereUsedScope` (sync, no request) →
 * `getWhereUsed`, each answering the `IAdtResponse` shape (`ok`/
 * `getResult()`/`getError()`) every v19 member uses — so the mock below
 * models those three members instead of the one removed composite. The
 * *contract* under test — TABL/DS scoping, structure-then-table fallback,
 * `appends_unavailable` on exhaustion — is unchanged; only the wire shape
 * being mocked is.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { handleGetStructuresList as handleGetStructuresListOf } from '../../handlers/structure/readonly/handleGetStructuresList';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import { createBatchAvailability } from '../../lib/batch/availability';
import * as clients from '../../lib/clients';
import { assertMatchObject } from '../helpers/assertions';
import {
  okResponse,
  reading,
  refusedResponse,
  whereUsedAnswer,
} from '../helpers/fakeClient';

/** handleGetStructuresList at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleGetStructuresList = (
  context: Parameters<typeof handleGetStructuresListOf>[0],
  args: Parameters<typeof handleGetStructuresListOf>[1],
) => handleGetStructuresListOf(context, { detail: 'full', ...args });

const mockStructRead = mock.fn<(...args: any[]) => any>();
const mockTableRead = mock.fn<(...args: any[]) => any>();
const mockGetWhereUsedScope = mock.fn<(...args: any[]) => any>();
const mockModifyWhereUsedScope = mock.fn<(...args: any[]) => any>();
const mockGetWhereUsed = mock.fn<(...args: any[]) => any>();

mock.method(clients, 'createAdtClient', () => ({
  getStructure: () => ({ read: mockStructRead }),
  getTable: () => ({ read: mockTableRead }),
  getUtils: () => ({
    getWhereUsedScope: mockGetWhereUsedScope,
    modifyWhereUsedScope: mockModifyWhereUsedScope,
    getWhereUsed: mockGetWhereUsed,
  }),
}));

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

/** An empty, successfully-parsed where-used result: no references. */
const emptyWhereUsed = () => whereUsedAnswer();

describe('GetStructuresList append handling (#128)', () => {
  beforeEach(() => {
    mockStructRead.mock.resetCalls();
    mockStructRead.mock.mockImplementation(() => undefined);
    mockTableRead.mock.resetCalls();
    mockTableRead.mock.mockImplementation(() => undefined);
    mockGetWhereUsedScope.mock.resetCalls();
    mockGetWhereUsedScope.mock.mockImplementation(() => undefined);
    mockModifyWhereUsedScope.mock.resetCalls();
    mockModifyWhereUsedScope.mock.mockImplementation(() => undefined);
    mockGetWhereUsed.mock.resetCalls();
    mockGetWhereUsed.mock.mockImplementation(() => undefined);
    // Root reads as a structure with no embedded includes. `getStructure()`
    // is called bare (no `resultsFor`), so its default `source` reading is a
    // plain string — the real `IAdtResponse<string>` shape, not the pre-19
    // `{ data }` envelope this mock used to answer with, which only ever
    // worked because `extractSource` had the matching pre-19 bug.
    mockStructRead.mock.mockImplementation(async () =>
      okResponse('define structure zs { }'),
    );
    mockTableRead.mock.mockImplementation(async () =>
      refusedResponse('not a table'),
    );
    mockModifyWhereUsedScope.mock.mockImplementation(() => '<scope-modified/>');
  });

  it('scopes the append search to TABL/DS and tries object_type "structure" first', async () => {
    mockGetWhereUsedScope.mock.mockImplementation(async () =>
      okResponse(reading('<scope/>')),
    );
    mockGetWhereUsed.mock.mockImplementation(async () => emptyWhereUsed());

    const result = await handleGetStructuresList(ctx, { structure_name: 'ZS' });

    assert.equal(result.isError, false);
    assert.ok(
      mockGetWhereUsedScope.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0]?.object_name, 'ZS') &&
          isDeepStrictEqual(a[0]?.object_type, 'TABL/DS') &&
          isDeepStrictEqual(a[1], {
            headers: DEFAULT_ADT_HEADERS['utils.getWhereUsedScope'],
          }),
      ),
    );
    assert.ok(
      mockModifyWhereUsedScope.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], '<scope/>') &&
          isDeepStrictEqual(a[1]?.enableOnly, ['TABL/DS']),
      ),
    );
    assert.ok(
      mockGetWhereUsed.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0]?.object_name, 'ZS') &&
          isDeepStrictEqual(a[0]?.object_type, 'TABL/DS') &&
          isDeepStrictEqual(a[0]?.scopeXml, '<scope-modified/>') &&
          isDeepStrictEqual(a[1], {
            headers: DEFAULT_ADT_HEADERS['utils.getWhereUsed'],
          }),
      ),
    );
    assert.equal(payload(result).appends_unavailable, undefined);
  });

  it('falls back to object_type "table" when the structure URI 404s', async () => {
    mockGetWhereUsedScope.mock.mockImplementation((p: any) => {
      if (p.object_type === 'TABL/DS') {
        return Promise.resolve(
          refusedResponse('Request failed with status code 404'),
        );
      }
      return Promise.resolve(okResponse(reading('<scope/>')));
    });
    mockGetWhereUsed.mock.mockImplementation(async () => emptyWhereUsed());

    const result = await handleGetStructuresList(ctx, {
      structure_name: 'VBAK',
    });

    assert.equal(result.isError, false);
    const types = mockGetWhereUsedScope.mock.calls.map(
      (c) => c.arguments[0].object_type,
    );
    assert.deepStrictEqual(types, ['TABL/DS', 'TABL/DT']);
    assert.equal(payload(result).appends_unavailable, undefined);
  });

  it('flags appends_unavailable when where-used fails for every object_type', async () => {
    mockGetWhereUsedScope.mock.mockImplementation(async () =>
      refusedResponse('Request failed with status code 404'),
    );

    const result = await handleGetStructuresList(ctx, { structure_name: 'ZS' });

    assert.equal(result.isError, false);
    const data = payload(result);
    assert.equal(data.success, true);
    assert.equal(data.appends_unavailable, true);
  });

  it('a 401 in the where-used lookup ends the call as it came, no second object_type', async () => {
    mockGetWhereUsedScope.mock.mockImplementation(async () =>
      refusedResponse('Unauthorized', {
        response: { status: 401, data: '' },
      } as any),
    );

    // The sequential version: a destination known to have no communication
    // batch. (The batched version reads both scopes in one envelope:
    // `unit/batch/includeTrees.test.ts`.)
    const notServed = createBatchAvailability();
    notServed.noteOuterStatus(404);
    const result = await handleGetStructuresList(
      { ...ctx, batchAvailability: notServed },
      { structure_name: 'ZS' },
    );

    assert.equal(result.isError, true);
    assertMatchObject(payload(result), {
      status: 401,
      message: 'Unauthorized',
    });
    assert.equal(mockGetWhereUsedScope.mock.callCount(), 1);
  });

  it('a 403 in the where-used lookup stays appends_unavailable', async () => {
    mockGetWhereUsedScope.mock.mockImplementation(async () =>
      refusedResponse('No authorization', {
        response: { status: 403, data: '' },
      } as any),
    );

    const result = await handleGetStructuresList(ctx, { structure_name: 'ZS' });

    assert.equal(result.isError, false);
    assert.equal(payload(result).appends_unavailable, true);
    assert.equal(mockGetWhereUsedScope.mock.callCount(), 2);
  });

  it('does not run where-used (or flag) when include_extensions is false', async () => {
    const result = await handleGetStructuresList(ctx, {
      structure_name: 'ZS',
      include_extensions: false,
    });

    assert.equal(result.isError, false);
    assert.equal(mockGetWhereUsedScope.mock.callCount(), 0);
    assert.equal(mockGetWhereUsed.mock.callCount(), 0);
    assert.equal(payload(result).appends_unavailable, undefined);
  });

  it('terse, by default: the tree as indented structure and kind rows', async () => {
    const result = await handleGetStructuresListOf(ctx, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    assert.equal(result.isError, false);
    const text = (result.content[0] as { text: string }).text;
    const lines = text.split('\n');
    assert.equal(lines[0], '# structure ZS');
    assert.equal(lines[1], 'ZS\troot\t');
  });
});

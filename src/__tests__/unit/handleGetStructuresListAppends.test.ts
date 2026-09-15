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

import { okResponse, reading, refusedResponse } from '../helpers/fakeClient';

const mockStructRead = jest.fn();
const mockTableRead = jest.fn();
const mockGetWhereUsedScope = jest.fn();
const mockModifyWhereUsedScope = jest.fn();
const mockGetWhereUsed = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getStructure: () => ({ read: mockStructRead }),
    getTable: () => ({ read: mockTableRead }),
    getUtils: () => ({
      getWhereUsedScope: mockGetWhereUsedScope,
      modifyWhereUsedScope: mockModifyWhereUsedScope,
      getWhereUsed: mockGetWhereUsed,
    }),
  }),
}));

import { handleGetStructuresList } from '../../handlers/structure/readonly/handleGetStructuresList';

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

/** An empty, successfully-parsed where-used result: no references. */
const emptyWhereUsed = () => okResponse(reading({}));

describe('GetStructuresList append handling (#128)', () => {
  beforeEach(() => {
    mockStructRead.mockReset();
    mockTableRead.mockReset();
    mockGetWhereUsedScope.mockReset();
    mockModifyWhereUsedScope.mockReset();
    mockGetWhereUsed.mockReset();
    // Root reads as a structure with no embedded includes.
    mockStructRead.mockResolvedValue({ data: 'define structure zs { }' });
    mockTableRead.mockResolvedValue(null);
    mockModifyWhereUsedScope.mockReturnValue('<scope-modified/>');
  });

  it('scopes the append search to TABL/DS and tries object_type "structure" first', async () => {
    mockGetWhereUsedScope.mockResolvedValue(okResponse(reading('<scope/>')));
    mockGetWhereUsed.mockResolvedValue(emptyWhereUsed());

    const result = await handleGetStructuresList(ctx, { structure_name: 'ZS' });

    expect(result.isError).toBe(false);
    expect(mockGetWhereUsedScope).toHaveBeenCalledWith(
      expect.objectContaining({ object_name: 'ZS', object_type: 'structure' }),
    );
    expect(mockModifyWhereUsedScope).toHaveBeenCalledWith(
      '<scope/>',
      expect.objectContaining({ enableOnly: ['TABL/DS'] }),
    );
    expect(mockGetWhereUsed).toHaveBeenCalledWith(
      expect.objectContaining({
        object_name: 'ZS',
        object_type: 'structure',
        scopeXml: '<scope-modified/>',
      }),
    );
    expect(payload(result).appends_unavailable).toBeUndefined();
  });

  it('falls back to object_type "table" when the structure URI 404s', async () => {
    mockGetWhereUsedScope.mockImplementation((p: any) => {
      if (p.object_type === 'structure') {
        return Promise.resolve(
          refusedResponse('Request failed with status code 404'),
        );
      }
      return Promise.resolve(okResponse(reading('<scope/>')));
    });
    mockGetWhereUsed.mockResolvedValue(emptyWhereUsed());

    const result = await handleGetStructuresList(ctx, {
      structure_name: 'VBAK',
    });

    expect(result.isError).toBe(false);
    const types = mockGetWhereUsedScope.mock.calls.map((c) => c[0].object_type);
    expect(types).toEqual(['structure', 'table']);
    expect(payload(result).appends_unavailable).toBeUndefined();
  });

  it('flags appends_unavailable when where-used fails for every object_type', async () => {
    mockGetWhereUsedScope.mockResolvedValue(
      refusedResponse('Request failed with status code 404'),
    );

    const result = await handleGetStructuresList(ctx, { structure_name: 'ZS' });

    expect(result.isError).toBe(false);
    const data = payload(result);
    expect(data.success).toBe(true);
    expect(data.appends_unavailable).toBe(true);
  });

  it('does not run where-used (or flag) when include_extensions is false', async () => {
    const result = await handleGetStructuresList(ctx, {
      structure_name: 'ZS',
      include_extensions: false,
    });

    expect(result.isError).toBe(false);
    expect(mockGetWhereUsedScope).not.toHaveBeenCalled();
    expect(mockGetWhereUsed).not.toHaveBeenCalled();
    expect(payload(result).appends_unavailable).toBeUndefined();
  });
});

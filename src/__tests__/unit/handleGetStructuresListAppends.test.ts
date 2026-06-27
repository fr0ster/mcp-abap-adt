/**
 * Unit test (#128): GetStructuresList append (where-used) handling.
 *  - scopes the search to append structures only (enableOnlyTypes: ['TABL/DS']),
 *    so a heavily-used base does not lose its appends to the where-used record cap;
 *  - resolves the base object_type itself (try 'structure', fall back to 'table'),
 *    since adt-clients does not auto-fallback;
 *  - does NOT swallow a where-used failure — it flags `appends_unavailable`.
 * SAP-free via a mocked AdtClient.
 */

const mockStructRead = jest.fn();
const mockTableRead = jest.fn();
const mockWhereUsed = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getStructure: () => ({ read: mockStructRead }),
    getTable: () => ({ read: mockTableRead }),
    getUtils: () => ({ getWhereUsedList: mockWhereUsed }),
  }),
}));

import { handleGetStructuresList } from '../../handlers/structure/readonly/handleGetStructuresList';

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

describe('GetStructuresList append handling (#128)', () => {
  beforeEach(() => {
    mockStructRead.mockReset();
    mockTableRead.mockReset();
    mockWhereUsed.mockReset();
    // Root reads as a structure with no embedded includes.
    mockStructRead.mockResolvedValue({ data: 'define structure zs { }' });
    mockTableRead.mockResolvedValue(null);
  });

  it('scopes the append search to TABL/DS and tries object_type "structure" first', async () => {
    mockWhereUsed.mockResolvedValue({ references: [] });

    const result = await handleGetStructuresList(ctx, { structure_name: 'ZS' });

    expect(result.isError).toBe(false);
    expect(mockWhereUsed).toHaveBeenCalledWith(
      expect.objectContaining({
        object_name: 'ZS',
        object_type: 'structure',
        enableOnlyTypes: ['TABL/DS'],
      }),
    );
    expect(payload(result).appends_unavailable).toBeUndefined();
  });

  it('falls back to object_type "table" when the structure URI 404s', async () => {
    mockWhereUsed.mockImplementation((p: any) => {
      if (p.object_type === 'structure') {
        return Promise.reject(new Error('Request failed with status code 404'));
      }
      return Promise.resolve({ references: [] });
    });

    const result = await handleGetStructuresList(ctx, {
      structure_name: 'VBAK',
    });

    expect(result.isError).toBe(false);
    const types = mockWhereUsed.mock.calls.map((c) => c[0].object_type);
    expect(types).toEqual(['structure', 'table']);
    expect(payload(result).appends_unavailable).toBeUndefined();
  });

  it('flags appends_unavailable when where-used fails for every object_type', async () => {
    mockWhereUsed.mockRejectedValue(
      new Error('Request failed with status code 404'),
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
    expect(mockWhereUsed).not.toHaveBeenCalled();
    expect(payload(result).appends_unavailable).toBeUndefined();
  });
});

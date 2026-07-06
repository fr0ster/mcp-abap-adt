/**
 * Unit test for GetWhereUsed type-filtering params (adt-clients 6.1.0).
 *
 * Verifies the tool exposes enable_only_types / disable_types, validates them
 * against the object's where-used scope, and forwards valid ones to
 * getWhereUsedList — SAP-free via a mocked AdtClient.
 */

const mockGetWhereUsedList = jest.fn().mockResolvedValue({
  objectName: 'ZT',
  objectType: 'table',
  totalReferences: 0,
  resultDescription: '',
  references: [],
});

// Scope offers these searchable types (real attr order: isDefault isSelected name).
const SCOPE_XML = `<?xml version="1.0"?><usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectTypes><usagereferences:type isDefault="true" isSelected="true" name="CLAS/OC"/><usagereferences:type isDefault="true" isSelected="true" name="INTF/OI"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DS"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DT"/></usagereferences:objectTypes></usagereferences:usageScopeResult>`;

const mockGetWhereUsedScope = jest
  .fn()
  .mockResolvedValue({ data: SCOPE_XML, status: 200 });

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getUtils: () => ({
      getWhereUsedList: mockGetWhereUsedList,
      getWhereUsedScope: mockGetWhereUsedScope,
    }),
  }),
}));

import {
  handleGetWhereUsed,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleGetWhereUsed';

const ctx = { connection: {}, logger: undefined } as any;

describe('GetWhereUsed type-filter params', () => {
  beforeEach(() => {
    mockGetWhereUsedList.mockClear();
    mockGetWhereUsedScope.mockClear();
  });

  it('exposes enable_only_types and disable_types as string arrays in the input schema', () => {
    const props = TOOL_DEFINITION.inputSchema.properties as Record<string, any>;
    expect(props.enable_only_types?.type).toBe('array');
    expect(props.enable_only_types?.items?.type).toBe('string');
    expect(props.disable_types?.type).toBe('array');
    expect(props.disable_types?.items?.type).toBe('string');
  });

  it('forwards in-scope enable_only_types/disable_types to getWhereUsedList', async () => {
    const result = await handleGetWhereUsed(ctx, {
      object_name: 'ZT',
      object_type: 'table',
      enable_only_types: ['TABL/DS', 'TABL/DT'],
      disable_types: ['CLAS/OC'],
    } as any);

    expect(result.isError).toBe(false);
    expect(mockGetWhereUsedList).toHaveBeenCalledWith(
      expect.objectContaining({
        object_name: 'ZT',
        object_type: 'table',
        enableOnlyTypes: ['TABL/DS', 'TABL/DT'],
        disableTypes: ['CLAS/OC'],
      }),
    );
  });

  it('returns an error and does NOT search when a type is not in the scope', async () => {
    const result = await handleGetWhereUsed(ctx, {
      object_name: 'ZT',
      object_type: 'table',
      enable_only_types: ['TABL/DS', 'BOGUS/XX'],
    } as any);

    expect(result.isError).toBe(true);
    const text =
      (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
    expect(text).toContain('BOGUS/XX');
    // Crucially: never fall through to a default-scope search.
    expect(mockGetWhereUsedList).not.toHaveBeenCalled();
  });

  it('skips scope validation and filter keys when no enable_only_types given', async () => {
    await handleGetWhereUsed(ctx, {
      object_name: 'ZT',
      object_type: 'table',
    } as any);

    expect(mockGetWhereUsedScope).not.toHaveBeenCalled();
    const arg = mockGetWhereUsedList.mock.calls[0][0];
    expect(arg.enableOnlyTypes).toBeUndefined();
    expect(arg.disableTypes).toBeUndefined();
  });
});

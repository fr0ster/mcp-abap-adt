/**
 * Unit test for GetWhereUsed type-filtering params (adt-clients 6.1.0).
 *
 * Verifies the tool exposes enable_only_types / disable_types and forwards them
 * to getWhereUsedList as enableOnlyTypes / disableTypes — SAP-free via a mocked
 * AdtClient.
 */

const mockGetWhereUsedList = jest.fn().mockResolvedValue({
  objectName: 'ZT',
  objectType: 'table',
  totalReferences: 0,
  resultDescription: '',
  references: [],
});

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getUtils: () => ({ getWhereUsedList: mockGetWhereUsedList }),
  }),
}));

import {
  handleGetWhereUsed,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleGetWhereUsed';

describe('GetWhereUsed type-filter params', () => {
  beforeEach(() => mockGetWhereUsedList.mockClear());

  it('exposes enable_only_types and disable_types as string arrays in the input schema', () => {
    const props = TOOL_DEFINITION.inputSchema.properties as Record<string, any>;
    expect(props.enable_only_types?.type).toBe('array');
    expect(props.enable_only_types?.items?.type).toBe('string');
    expect(props.disable_types?.type).toBe('array');
    expect(props.disable_types?.items?.type).toBe('string');
  });

  it('forwards enable_only_types/disable_types to getWhereUsedList', async () => {
    await handleGetWhereUsed(
      { connection: {}, logger: undefined } as any,
      {
        object_name: 'ZT',
        object_type: 'table',
        enable_only_types: ['TABL/DS', 'TABL/DT'],
        disable_types: ['CLAS/OC'],
      } as any,
    );

    expect(mockGetWhereUsedList).toHaveBeenCalledWith(
      expect.objectContaining({
        object_name: 'ZT',
        object_type: 'table',
        enableOnlyTypes: ['TABL/DS', 'TABL/DT'],
        disableTypes: ['CLAS/OC'],
      }),
    );
  });

  it('omits the filter keys when not provided (no accidental empty arrays)', async () => {
    await handleGetWhereUsed(
      { connection: {}, logger: undefined } as any,
      {
        object_name: 'ZT',
        object_type: 'table',
      } as any,
    );

    const arg = mockGetWhereUsedList.mock.calls[0][0];
    expect(arg.enableOnlyTypes).toBeUndefined();
    expect(arg.disableTypes).toBeUndefined();
  });
});

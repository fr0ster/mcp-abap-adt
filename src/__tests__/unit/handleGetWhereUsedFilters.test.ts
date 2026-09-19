/**
 * Unit test for GetWhereUsed type-filtering params (adt-clients 6.1.0).
 *
 * Verifies the tool exposes enable_only_types / disable_types, validates them
 * against the object's where-used scope, and forwards valid ones to the
 * where-used search — SAP-free via a mocked AdtClient.
 *
 * Migrated for adt-clients 19: `getWhereUsedList` (one call) no longer
 * exists. The handler now composes it via `fetchWhereUsedReferences`
 * (`src/lib/strategies/whereUsedList.ts`) over `getWhereUsedScope` →
 * `modifyWhereUsedScope` (sync, no request) → `getWhereUsed`, each
 * answering the `IAdtResponse` shape (`ok`/`getResult()`/`getError()`)
 * every v19 member uses — so the mock below models those three members
 * instead of the one removed composite. The *contract* under test — scope
 * validation of `enable_only_types`, `disable_types` forwarded, the scope
 * round trip skipped when no filter is given — is unchanged; only the wire
 * shape being mocked is.
 */

import { okResponse, reading } from '../helpers/fakeClient';

// Scope offers these searchable types (real attr order: isDefault isSelected name).
const SCOPE_XML = `<?xml version="1.0"?><usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectTypes><usagereferences:type isDefault="true" isSelected="true" name="CLAS/OC"/><usagereferences:type isDefault="true" isSelected="true" name="INTF/OI"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DS"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DT"/></usagereferences:objectTypes></usagereferences:usageScopeResult>`;

const mockGetWhereUsedScope = jest
  .fn()
  .mockResolvedValue(okResponse(reading(SCOPE_XML)));
const mockModifyWhereUsedScope = jest.fn().mockReturnValue('<scope-modified/>');
const mockGetWhereUsed = jest.fn().mockResolvedValue(okResponse(reading({})));

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getUtils: () => ({
      getWhereUsedScope: mockGetWhereUsedScope,
      modifyWhereUsedScope: mockModifyWhereUsedScope,
      getWhereUsed: mockGetWhereUsed,
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
    mockGetWhereUsedScope.mockClear();
    mockModifyWhereUsedScope.mockClear();
    mockGetWhereUsed.mockClear();
  });

  it('exposes enable_only_types and disable_types as string arrays in the input schema', () => {
    const props = TOOL_DEFINITION.inputSchema.properties as Record<string, any>;
    expect(props.enable_only_types?.type).toBe('array');
    expect(props.enable_only_types?.items?.type).toBe('string');
    expect(props.disable_types?.type).toBe('array');
    expect(props.disable_types?.items?.type).toBe('string');
  });

  it('forwards in-scope enable_only_types/disable_types to getWhereUsed, scoped', async () => {
    const result = await handleGetWhereUsed(ctx, {
      object_name: 'ZT',
      object_type: 'table',
      enable_only_types: ['TABL/DS', 'TABL/DT'],
      disable_types: ['CLAS/OC'],
    } as any);

    expect(result.isError).toBe(false);
    expect(mockModifyWhereUsedScope).toHaveBeenCalledWith(
      SCOPE_XML,
      expect.objectContaining({
        enableOnly: ['TABL/DS', 'TABL/DT'],
        disable: ['CLAS/OC'],
      }),
    );
    expect(mockGetWhereUsed).toHaveBeenCalledWith(
      expect.objectContaining({
        object_name: 'ZT',
        object_type: 'table',
        scopeXml: '<scope-modified/>',
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
    expect(mockGetWhereUsed).not.toHaveBeenCalled();
  });

  it('skips scope validation and the scope round trip when no enable_only_types given', async () => {
    await handleGetWhereUsed(ctx, {
      object_name: 'ZT',
      object_type: 'table',
    } as any);

    expect(mockGetWhereUsedScope).not.toHaveBeenCalled();
    const arg = mockGetWhereUsed.mock.calls[0][0];
    expect(arg.scopeXml).toBeUndefined();
  });
});

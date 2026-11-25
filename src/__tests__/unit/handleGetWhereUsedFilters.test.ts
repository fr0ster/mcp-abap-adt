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

// Scope offers these searchable types (real attr order: isDefault isSelected name).
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import {
  handleGetWhereUsed,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleGetWhereUsed';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import * as clients from '../../lib/clients';
import { okResponse, reading, whereUsedAnswer } from '../helpers/fakeClient';
import { jsonAt, listedJson } from '../helpers/listedJson';
import { stateSystemKind } from '../helpers/systemKind';

/**
 * The where-used answer these cases assert is the one before `detail`:
 * `detail: 'full'` (terse answers, step 3), unless a case states its own.
 */
const whereUsedFull = (
  context: Parameters<typeof handleGetWhereUsed>[0],
  args: Parameters<typeof handleGetWhereUsed>[1],
) => handleGetWhereUsed(context, { detail: 'full', ...args });

const SCOPE_XML = `<?xml version="1.0"?><usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectTypes><usagereferences:type isDefault="true" isSelected="true" name="CLAS/OC"/><usagereferences:type isDefault="true" isSelected="true" name="INTF/OI"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DS"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DT"/></usagereferences:objectTypes></usagereferences:usageScopeResult>`;

const mockGetWhereUsedScope = mock.fn<(...args: any[]) => any>(async () =>
  okResponse(reading(SCOPE_XML)),
);
const mockModifyWhereUsedScope = mock.fn<(...args: any[]) => any>(
  () => '<scope-modified/>',
);
const mockGetWhereUsed = mock.fn<(...args: any[]) => any>(async () =>
  whereUsedAnswer(),
);

// The declared variant the boundary checks a type argument against.
// The declared variant: the kind stated, read by the real variantOf.
stateSystemKind('onprem');
mock.method(clients, 'createAdtClient', () => ({
  getUtils: () => ({
    getWhereUsedScope: mockGetWhereUsedScope,
    modifyWhereUsedScope: mockModifyWhereUsedScope,
    getWhereUsed: mockGetWhereUsed,
  }),
}));

const ctx = { connection: {}, logger: undefined } as any;

describe('GetWhereUsed type-filter params', () => {
  beforeEach(() => {
    mockGetWhereUsedScope.mock.resetCalls();
    mockModifyWhereUsedScope.mock.resetCalls();
    mockGetWhereUsed.mock.resetCalls();
  });

  it('exposes enable_only_types and disable_types as string arrays in the input schema', () => {
    const schema = listedJson(TOOL_DEFINITION.inputSchema);
    assert.equal(jsonAt(schema, 'enable_only_types').type, 'array');
    assert.equal(jsonAt(schema, 'enable_only_types', '[]').type, 'string');
    assert.equal(jsonAt(schema, 'disable_types').type, 'array');
    assert.equal(jsonAt(schema, 'disable_types', '[]').type, 'string');
  });

  it('forwards in-scope enable_only_types/disable_types to getWhereUsed, scoped', async () => {
    const result = await whereUsedFull(ctx, {
      object_name: 'ZT',
      object_type: 'table',
      enable_only_types: ['TABL/DS', 'TABL/DT'],
      disable_types: ['CLAS/OC'],
    } as any);

    assert.equal(result.isError, false);
    assert.ok(
      mockModifyWhereUsedScope.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], SCOPE_XML) &&
          isDeepStrictEqual(a[1]?.enableOnly, ['TABL/DS', 'TABL/DT']) &&
          isDeepStrictEqual(a[1]?.disable, ['CLAS/OC']),
      ),
    );
    assert.ok(
      mockGetWhereUsed.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0]?.object_name, 'ZT') &&
          isDeepStrictEqual(a[0]?.object_type, 'TABL/DT') &&
          isDeepStrictEqual(a[0]?.scopeXml, '<scope-modified/>') &&
          isDeepStrictEqual(a[1], {
            headers: DEFAULT_ADT_HEADERS['utils.getWhereUsed'],
          }),
      ),
    );
  });

  it('returns an error and does NOT search when a type is not in the scope', async () => {
    const result = await whereUsedFull(ctx, {
      object_name: 'ZT',
      object_type: 'table',
      enable_only_types: ['TABL/DS', 'BOGUS/XX'],
    } as any);

    assert.equal(result.isError, true);
    const text =
      (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
    assert.ok(text.includes('BOGUS/XX'));
    // Crucially: never fall through to a default-scope search.
    assert.equal(mockGetWhereUsed.mock.callCount(), 0);
  });

  it('skips scope validation and the scope round trip when no enable_only_types given', async () => {
    await whereUsedFull(ctx, {
      object_name: 'ZT',
      object_type: 'table',
    } as any);

    assert.equal(mockGetWhereUsedScope.mock.callCount(), 0);
    const arg = mockGetWhereUsed.mock.calls[0]?.arguments[0];
    assert.equal(arg.scopeXml, undefined);
  });
});

import { COMPACT_CRUD_MATRIX } from '../handlers/compact/high/compactMatrix';
import { COMPACT_OBJECT_TYPES } from '../handlers/compact/high/compactObjectTypes';
import { compactRouterMap } from '../handlers/compact/high/compactRouter';

describe('Compact Router Coverage', () => {
  test.each(
    COMPACT_OBJECT_TYPES,
  )('should define CRUD router maps for %s', (objectType) => {
    expect(compactRouterMap[objectType]).toBeDefined();
  });

  test.each(
    Object.entries(COMPACT_CRUD_MATRIX),
  )('should expose expected CRUD routes for %s', (objectType, expectedOps) => {
    const operations = Object.keys(compactRouterMap[objectType] || {}).sort();
    expect(operations).toEqual([...expectedOps].sort());
  });
});

import {
  COMPACT_ACTION_MATRIX,
  COMPACT_CRUD_MATRIX,
} from '../handlers/compact/high/compactMatrix';
import { COMPACT_OBJECT_TYPES } from '../handlers/compact/high/compactObjectTypes';
import {
  compactActionRouterMap,
  compactRouterMap,
} from '../handlers/compact/high/compactRouter';

describe('Compact Router Coverage', () => {
  test.each(
    COMPACT_OBJECT_TYPES,
  )('should define CRUD and action router maps for %s', (objectType) => {
    expect(compactRouterMap[objectType]).toBeDefined();
    expect(compactActionRouterMap[objectType]).toBeDefined();
  });

  test.each(
    Object.entries(COMPACT_CRUD_MATRIX),
  )('should expose expected CRUD routes for %s', (objectType, expectedOps) => {
    const operations = Object.keys(compactRouterMap[objectType] || {}).sort();
    expect(operations).toEqual([...expectedOps].sort());
  });

  test.each(
    Object.entries(COMPACT_ACTION_MATRIX),
  )('should expose expected action routes for %s', (objectType, expectedActions) => {
    const actions = Object.keys(
      compactActionRouterMap[objectType] || {},
    ).sort();
    expect(actions).toEqual([...expectedActions].sort());
  });
});

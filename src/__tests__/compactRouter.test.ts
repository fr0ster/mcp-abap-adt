/**
 * The two halves of the compact router, together, are exactly the CRUD matrix.
 *
 * The routes used to live in one map, and this test read that map. They are two
 * modules now — `compactReadRoutes` and `compactWriteRoutes` — so that a read-only
 * tool list can be assembled without a write route in its module graph
 * (`compactCapabilitySplit.test.ts` asserts that). Splitting a map creates one new
 * way to be wrong: a route that lands in NEITHER file. So the union is what is
 * checked here, and each half is checked for carrying only its own operations.
 */
import { COMPACT_CRUD_MATRIX } from '../handlers/compact/high/compactMatrix';
import { COMPACT_OBJECT_TYPES } from '../handlers/compact/high/compactObjectTypes';
import { compactReadRouterMap } from '../handlers/compact/high/compactReadRoutes';
import { compactWriteRouterMap } from '../handlers/compact/high/compactWriteRoutes';

const routesFor = (objectType: (typeof COMPACT_OBJECT_TYPES)[number]) => ({
  ...compactWriteRouterMap[objectType],
  ...compactReadRouterMap[objectType],
});

describe('Compact Router Coverage', () => {
  test.each(COMPACT_OBJECT_TYPES)(
    'should define CRUD router maps for %s',
    (objectType) => {
      expect(compactReadRouterMap[objectType]).toBeDefined();
      expect(compactWriteRouterMap[objectType]).toBeDefined();
    },
  );

  test.each(Object.entries(COMPACT_CRUD_MATRIX))(
    'should expose expected CRUD routes for %s',
    (objectType, expectedOps) => {
      const operations = Object.keys(
        routesFor(objectType as (typeof COMPACT_OBJECT_TYPES)[number]),
      ).sort();
      expect(operations).toEqual([...expectedOps].sort());
    },
  );

  it('keeps each half to its own operations', () => {
    const read = new Set(
      Object.values(compactReadRouterMap).flatMap((routes) =>
        Object.keys(routes),
      ),
    );
    const write = new Set(
      Object.values(compactWriteRouterMap).flatMap((routes) =>
        Object.keys(routes),
      ),
    );
    expect([...read].sort()).toEqual(['get']);
    expect([...write].sort()).toEqual(['create', 'delete', 'update']);
  });
});

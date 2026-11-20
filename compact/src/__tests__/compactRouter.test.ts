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

import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import { format } from 'node:util';
import { compactWriteRouterMap } from '@mcp-abap-adt/compact-modify/routes';
import { compactReadRouterMap } from '@mcp-abap-adt/compact-readonly-entries/routes';
import {
  COMPACT_CRUD_MATRIX,
  COMPACT_OBJECT_TYPES,
} from '@mcp-abap-adt/lib/compact-shared';

const routesFor = (objectType: (typeof COMPACT_OBJECT_TYPES)[number]) => ({
  ...compactWriteRouterMap[objectType],
  ...compactReadRouterMap[objectType],
});

describe('Compact Router Coverage', () => {
  for (const objectType of COMPACT_OBJECT_TYPES) {
    test(format('should define CRUD router maps for %s', objectType), () => {
      assert.notEqual(compactReadRouterMap[objectType], undefined);
      assert.notEqual(compactWriteRouterMap[objectType], undefined);
    });
  }

  for (const [objectType, expectedOps] of Object.entries(COMPACT_CRUD_MATRIX)) {
    test(
      format('should expose expected CRUD routes for %s', objectType),
      () => {
        const operations = Object.keys(
          routesFor(objectType as (typeof COMPACT_OBJECT_TYPES)[number]),
        ).sort();
        assert.deepStrictEqual(operations, [...expectedOps].sort());
      },
    );
  }

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
    assert.deepStrictEqual([...read].sort(), ['get']);
    assert.deepStrictEqual([...write].sort(), ['create', 'delete', 'update']);
  });
});

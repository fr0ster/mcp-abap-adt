/**
 * A handler reads only what its schema declares (plan Appendix B): an
 * argument a handler reads and its schema left out was dropped by the
 * schema's parse, so the handler never saw it. Each is declared now, and
 * reaches the handler.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { TOOL_DEFINITION as GetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { TOOL_DEFINITION as GetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult';
import {
  compactCdsUnitTestResultSchema,
  compactCreateSchema,
  compactUnitTestResultSchema,
} from '../../lib/compact/compactSchemas';
import { assertMatchObject } from '../helpers/assertions';

describe('the arguments a handler reads are declared by its schema', () => {
  it('GetUnitTestResult takes with_navigation_uris and format', () => {
    assertMatchObject(
      GetUnitTestResult.inputSchema.parse({
        run_id: 'R1',
        with_navigation_uris: true,
        format: 'junit',
      }),
      {
        run_id: 'R1',
        with_navigation_uris: true,
        format: 'junit',
      },
    );
  });

  it('GetEnhancements takes program, include_nested, detailed and max_includes', () => {
    assertMatchObject(
      GetEnhancements.inputSchema.parse({
        object_name: 'ZINC',
        object_type: 'include',
        program: 'ZPROG',
        include_nested: true,
        detailed: true,
        max_includes: 3,
      }),
      {
        program: 'ZPROG',
        include_nested: true,
        detailed: true,
        max_includes: 3,
      },
    );
  });

  for (const [_tool, schema] of [
    ['HandlerUnitTestResult', compactUnitTestResultSchema],
    ['HandlerCdsUnitTestResult', compactCdsUnitTestResultSchema],
  ] as const) {
    it(format('%s takes detail', _tool), () => {
      assertMatchObject(schema.parse({ run_id: 'R1', detail: 'full' }), {
        detail: 'full',
      });
    });
  }

  it('HandlerCreate takes detail', () => {
    assertMatchObject(
      compactCreateSchema.parse({ object_type: 'PACKAGE', detail: 'raw' }),
      { detail: 'raw' },
    );
  });
});

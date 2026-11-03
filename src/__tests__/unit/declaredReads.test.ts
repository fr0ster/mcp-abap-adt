/**
 * A handler reads only what its schema declares (plan Appendix B): an
 * argument a handler reads and its schema left out was dropped by the
 * schema's parse, so the handler never saw it. Each is declared now, and
 * reaches the handler.
 */
import { TOOL_DEFINITION as GetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult';
import {
  compactCdsUnitTestResultSchema,
  compactCreateSchema,
  compactUnitTestResultSchema,
} from '../../lib/compact/compactSchemas';

describe('the arguments a handler reads are declared by its schema', () => {
  it('GetUnitTestResult takes with_navigation_uris and format', () => {
    expect(
      GetUnitTestResult.inputSchema.parse({
        run_id: 'R1',
        with_navigation_uris: true,
        format: 'junit',
      }),
    ).toMatchObject({
      run_id: 'R1',
      with_navigation_uris: true,
      format: 'junit',
    });
  });

  it.each([
    ['HandlerUnitTestResult', compactUnitTestResultSchema],
    ['HandlerCdsUnitTestResult', compactCdsUnitTestResultSchema],
  ])('%s takes detail', (_tool, schema) => {
    expect(schema.parse({ run_id: 'R1', detail: 'full' })).toMatchObject({
      detail: 'full',
    });
  });

  it('HandlerCreate takes detail', () => {
    expect(
      compactCreateSchema.parse({ object_type: 'PACKAGE', detail: 'raw' }),
    ).toMatchObject({ detail: 'raw' });
  });
});

/**
 * Integration tests for Table High-Level Handlers
 *
 * Tests all high-level handlers for Table module:
 * - CreateTable (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateTable (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/table
 */

import { handleCreateTable } from '../../../../handlers/table/high/handleCreateTable';
import { handleUpdateTable } from '../../../../handlers/table/high/handleUpdateTable';
import { handleDeleteTable } from '../../../../handlers/table/low/handleDeleteTable';

import { HighTester } from '../../helpers/testers/HighTester';
import { getTimeout } from '../../helpers/configHelpers';

describe('Table High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_table',
      'builder_table',
      'table-high',
      {
        create: handleCreateTable,
        update: handleUpdateTable,
        delete: handleDeleteTable
      }
    );
    await tester.beforeAll();
  });

  afterAll(async () => {
    await tester.afterAll();
  });

  beforeEach(async () => {
    await tester.beforeEach();
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it('should test all Table high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});

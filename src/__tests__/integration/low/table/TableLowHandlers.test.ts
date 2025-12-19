/**
 * Integration tests for Table Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/table
 */

import { handleValidateTable } from '../../../../handlers/table/low/handleValidateTable';
import { handleCreateTable } from '../../../../handlers/table/low/handleCreateTable';
import { handleLockTable } from '../../../../handlers/table/low/handleLockTable';
import { handleUpdateTable } from '../../../../handlers/table/low/handleUpdateTable';
import { handleUnlockTable } from '../../../../handlers/table/low/handleUnlockTable';
import { handleActivateTable } from '../../../../handlers/table/low/handleActivateTable';
import { handleDeleteTable } from '../../../../handlers/table/low/handleDeleteTable';

import { LowTester } from '../../helpers/testers/LowTester';
import { getTimeout } from '../../helpers/configHelpers';

describe('Table Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_table_low',
      'full_workflow',
      'table-low',
      {
        validate: handleValidateTable,
        create: handleCreateTable,
        lock: handleLockTable,
        update: handleUpdateTable,
        unlock: handleUnlockTable,
        activate: handleActivateTable,
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

  it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
    await tester.run();
  }, getTimeout('long'));
});

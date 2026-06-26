/**
 * Integration tests for Ddl Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/ddl
 */

import { handleActivateDdl } from '../../../../handlers/ddl/low/handleActivateDdl';
import { handleCreateDdl } from '../../../../handlers/ddl/low/handleCreateDdl';
import { handleDeleteDdl } from '../../../../handlers/ddl/low/handleDeleteDdl';
import { handleLockDdl } from '../../../../handlers/ddl/low/handleLockDdl';
import { handleUnlockDdl } from '../../../../handlers/ddl/low/handleUnlockDdl';
import { handleUpdateDdl } from '../../../../handlers/ddl/low/handleUpdateDdl';
import { handleValidateDdl } from '../../../../handlers/ddl/low/handleValidateDdl';
import { getTimeout } from '../../helpers/configHelpers';
import { LowTester } from '../../helpers/testers/LowTester';

describe('Ddl Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester('create_ddl_low', 'full_workflow', 'ddl-low', {
      validate: handleValidateDdl,
      create: handleCreateDdl,
      lock: handleLockDdl,
      update: handleUpdateDdl,
      unlock: handleUnlockDdl,
      activate: handleActivateDdl,
      delete: handleDeleteDdl,
    });
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

  it(
    'should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate',
    async () => {
      await tester.run();
    },
    getTimeout('long'),
  );
});

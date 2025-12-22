/**
 * Integration tests for Domain Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/domain
 */

import { handleActivateDomain } from '../../../../handlers/domain/low/handleActivateDomain';
import { handleCreateDomain } from '../../../../handlers/domain/low/handleCreateDomain';
import { handleDeleteDomain } from '../../../../handlers/domain/low/handleDeleteDomain';
import { handleLockDomain } from '../../../../handlers/domain/low/handleLockDomain';
import { handleUnlockDomain } from '../../../../handlers/domain/low/handleUnlockDomain';
import { handleUpdateDomain } from '../../../../handlers/domain/low/handleUpdateDomain';
import { handleValidateDomain } from '../../../../handlers/domain/low/handleValidateDomain';
import { getTimeout } from '../../helpers/configHelpers';
import { LowTester } from '../../helpers/testers/LowTester';

describe('Domain Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester('create_domain_low', 'full_workflow', 'domain-low', {
      validate: handleValidateDomain,
      create: handleCreateDomain,
      lock: handleLockDomain,
      update: handleUpdateDomain,
      unlock: handleUnlockDomain,
      activate: handleActivateDomain,
      delete: handleDeleteDomain,
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

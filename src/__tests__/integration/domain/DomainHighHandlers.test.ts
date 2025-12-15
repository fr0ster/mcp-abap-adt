/**
 * Integration tests for Domain High-Level Handlers
 *
 * Tests high-level handlers that manage the complete workflow internally:
 * CreateDomain (high-level) - handles lock, create, check, unlock, activate
 * UpdateDomain (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/domain
 */

import { handleCreateDomain } from '../../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../../handlers/domain/high/handleUpdateDomain';
import { handleDeleteDomain } from '../../../handlers/domain/low/handleDeleteDomain';

import { HighTester } from '../helpers/testers/HighTester';
import { getTimeout } from '../helpers/configHelpers';

describe('Domain High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_domain',
      'builder_domain',
      'domain-high',
      {
        create: handleCreateDomain,
        update: handleUpdateDomain,
        delete: handleDeleteDomain
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

  it('should test all Domain high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});

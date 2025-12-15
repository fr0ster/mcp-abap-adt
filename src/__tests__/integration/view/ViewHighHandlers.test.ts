/**
 * Integration tests for View High-Level Handlers
 *
 * Tests all high-level handlers for View module:
 * - CreateView (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateView (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/view
 */

import { handleCreateView } from '../../../handlers/view/high/handleCreateView';
import { handleUpdateView } from '../../../handlers/view/high/handleUpdateView';
import { handleDeleteView } from '../../../handlers/view/low/handleDeleteView';

import { HighTester } from '../helpers/testers/HighTester';
import { getTimeout } from '../helpers/configHelpers';

describe('View High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_view',
      'builder_view',
      'view-high',
      {
        create: handleCreateView,
        update: handleUpdateView,
        delete: handleDeleteView
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

  it('should test all View high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});

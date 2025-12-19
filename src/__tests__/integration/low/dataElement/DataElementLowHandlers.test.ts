/**
 * Integration tests for DataElement Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/dataElement
 */

import { handleValidateDataElement } from '../../../../handlers/data_element/low/handleValidateDataElement';
import { handleCreateDataElement } from '../../../../handlers/data_element/low/handleCreateDataElement';
import { handleLockDataElement } from '../../../../handlers/data_element/low/handleLockDataElement';
import { handleUpdateDataElement } from '../../../../handlers/data_element/low/handleUpdateDataElement';
import { handleUnlockDataElement } from '../../../../handlers/data_element/low/handleUnlockDataElement';
import { handleActivateDataElement } from '../../../../handlers/data_element/low/handleActivateDataElement';
import { handleDeleteDataElement } from '../../../../handlers/data_element/low/handleDeleteDataElement';

import { LowTester } from '../../helpers/testers/LowTester';
import { getTimeout } from '../../helpers/configHelpers';

describe('DataElement Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_data_element_low',
      'full_workflow',
      'dataelement-low',
      {
        validate: handleValidateDataElement,
        create: handleCreateDataElement,
        lock: handleLockDataElement,
        update: handleUpdateDataElement,
        unlock: handleUnlockDataElement,
        activate: handleActivateDataElement,
        delete: handleDeleteDataElement
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

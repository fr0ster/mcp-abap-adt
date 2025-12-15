/**
 * Integration tests for DataElement High-Level Handlers
 *
 * Tests all high-level handlers for DataElement module:
 * - CreateDataElement (high-level) - handles create, activate, verify
 * - UpdateDataElement (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/dataElement
 */

import { handleCreateDataElement } from '../../../handlers/data_element/high/handleCreateDataElement';
import { handleUpdateDataElement } from '../../../handlers/data_element/high/handleUpdateDataElement';
import { handleDeleteDataElement } from '../../../handlers/data_element/low/handleDeleteDataElement';

import { HighTester } from '../helpers/testers/HighTester';
import { getTimeout } from '../helpers/configHelpers';

describe('DataElement High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_data_element',
      'builder_data_element',
      'dataelement-high',
      {
        create: handleCreateDataElement,
        update: handleUpdateDataElement,
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

  it('should test all DataElement high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});

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

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import {
  TOOL_DEFINITION as CreateDataElementTool,
  handleCreateDataElement,
} from '../../../../handlers/data_element/high/handleCreateDataElement';
import {
  TOOL_DEFINITION as DeleteDataElementTool,
  handleDeleteDataElement,
} from '../../../../handlers/data_element/high/handleDeleteDataElement';
import {
  handleUpdateDataElement,
  TOOL_DEFINITION as UpdateDataElementTool,
} from '../../../../handlers/data_element/high/handleUpdateDataElement';

import { defineTool } from '../../../../lib/handlers/interfaces';
import { HighTester } from '../../helpers/testers/HighTester';

describe('DataElement High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester(
      'create_data_element',
      'builder_data_element',
      'dataelement-high',
      {
        create: defineTool(CreateDataElementTool, handleCreateDataElement),
        update: defineTool(UpdateDataElementTool, handleUpdateDataElement),
        delete: defineTool(DeleteDataElementTool, handleDeleteDataElement),
      },
    );
    await tester.beforeAll();
  });

  after(async () => {
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
  });
});

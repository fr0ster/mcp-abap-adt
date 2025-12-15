/**
 * Integration tests for MetadataExtension Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/metadataExtension
 */

import { handleValidateMetadataExtension } from '../../../handlers/ddlx/low/handleValidateMetadataExtension';
import { handleCreateMetadataExtension } from '../../../handlers/ddlx/low/handleCreateMetadataExtension';
import { handleLockMetadataExtension } from '../../../handlers/ddlx/low/handleLockMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleUnlockMetadataExtension } from '../../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { handleActivateMetadataExtension } from '../../../handlers/ddlx/low/handleActivateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../handlers/ddlx/low/handleDeleteMetadataExtension';

import { LowTester } from '../helpers/testers/LowTester';
import { getTimeout } from '../helpers/configHelpers';

describe('MetadataExtension Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_metadata_extension_low',
      'full_workflow',
      'ddlx-low',
      {
        validate: handleValidateMetadataExtension,
        create: handleCreateMetadataExtension,
        lock: handleLockMetadataExtension,
        update: handleUpdateMetadataExtension,
        unlock: handleUnlockMetadataExtension,
        activate: handleActivateMetadataExtension,
        delete: handleDeleteMetadataExtension
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

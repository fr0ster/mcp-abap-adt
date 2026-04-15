/**
 * Admin script: Teardown ALL shared dependencies from a SAP system.
 *
 * Deletes every object listed in shared_dependencies (test-config.yaml)
 * in reverse dependency order. Idempotent — ignores 404 (already gone).
 *
 * Run:  npm run shared:teardown
 */

import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { createAdtClient } from '../../../lib/clients';
import {
  getSystemContext,
  resolveSystemContext,
} from '../../../lib/systemContext';
import {
  getSharedDependenciesConfig,
  getTimeout,
  loadTestConfig,
} from '../../integration/helpers/configHelpers';
import { createTestLogger } from '../../integration/helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../integration/helpers/sessionHelpers';
import {
  resetSharedDependencyCache,
  safeDelete,
} from '../../integration/helpers/sharedObjects';

const testsLogger = createTestLogger('shared-teardown');

describe('Admin: Teardown shared dependencies', () => {
  let connection: IAbapConnection;
  let client: AdtClient;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      const result = await createTestConnectionAndSession();
      connection = result.connection;
      await resolveSystemContext(connection);
      const systemCtx = getSystemContext();
      client = createAdtClient(connection);
      hasConfig = true;
    } catch (error: any) {
      testsLogger?.warn?.(
        `Skipping: No SAP configuration found: ${error.message}`,
      );
      hasConfig = false;
    }
  });

  it(
    'should delete all shared dependencies in reverse order',
    async () => {
      if (!hasConfig) {
        testsLogger?.warn?.('Skipping: SAP not configured');
        return;
      }

      const sharedConfig = getSharedDependenciesConfig();
      if (!sharedConfig) {
        testsLogger?.warn?.('Skipping: No shared_dependencies in config');
        return;
      }

      const config = loadTestConfig();
      const transportRequest =
        sharedConfig.transport_request ||
        config?.environment?.default_transport ||
        undefined;

      const results: Array<{
        type: string;
        name: string;
        status: string;
      }> = [];

      // Reverse dependency order: FM → FG → classes → bdefs → views → tables → package

      // 0a. Function Modules (delete before Function Groups)
      const functionModules = sharedConfig.function_modules || [];
      for (const item of functionModules) {
        const status = await safeDelete(
          `function_module ${item.name}`,
          async () => {
            await client.getFunctionModule().delete({
              functionModuleName: item.name,
              functionGroupName: item.group,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({
          type: 'function_modules',
          name: item.name,
          status,
        });
      }

      // 0b. Function Groups (delete after Function Modules)
      const functionGroups = sharedConfig.function_groups || [];
      for (const item of functionGroups) {
        const status = await safeDelete(
          `function_group ${item.name}`,
          async () => {
            await client.getFunctionGroup().delete({
              functionGroupName: item.name,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({
          type: 'function_groups',
          name: item.name,
          status,
        });
      }

      // 1. Classes (implementation classes for BDEFs — delete before BDEFs)
      const classes = sharedConfig.classes || [];
      for (const item of classes) {
        const status = await safeDelete(
          `class ${item.name}`,
          async () => {
            await client.getClass().delete({
              className: item.name,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({ type: 'classes', name: item.name, status });
      }

      // 1b. Service definitions (delete before views they depend on)
      const serviceDefinitions = sharedConfig.service_definitions || [];
      for (const item of serviceDefinitions) {
        const status = await safeDelete(
          `service_definition ${item.name}`,
          async () => {
            await client.getServiceDefinition().delete({
              serviceDefinitionName: item.name,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({
          type: 'service_definitions',
          name: item.name,
          status,
        });
      }

      // 2. Behavior definitions
      const bdefs = sharedConfig.behavior_definitions || [];
      for (const item of bdefs) {
        const status = await safeDelete(
          `behavior_definition ${item.name}`,
          async () => {
            await client.getBehaviorDefinition().delete({
              name: item.name,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({
          type: 'behavior_definitions',
          name: item.name,
          status,
        });
      }

      // 3. Views
      const views = sharedConfig.views || [];
      for (const item of views) {
        const status = await safeDelete(
          `view ${item.name}`,
          async () => {
            await client.getView().delete({
              viewName: item.name,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({ type: 'views', name: item.name, status });
      }

      // 4. Tables
      const tables = sharedConfig.tables || [];
      for (const item of tables) {
        const status = await safeDelete(
          `table ${item.name}`,
          async () => {
            await client.getTable().delete({
              tableName: item.name,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({ type: 'tables', name: item.name, status });
      }

      // 5. Package (last — after all contents removed)
      if (sharedConfig.package) {
        const status = await safeDelete(
          `package ${sharedConfig.package}`,
          async () => {
            await client.getPackage().delete({
              packageName: sharedConfig.package,
              transportRequest,
            });
          },
          testsLogger,
        );
        results.push({
          type: 'package',
          name: sharedConfig.package,
          status,
        });
      }

      // Clear in-memory caches
      resetSharedDependencyCache();

      // Summary
      const deleted = results.filter((r) => r.status === 'deleted');
      const notFound = results.filter((r) => r.status === 'not_found');
      const failed = results.filter((r) => r.status === 'failed');

      testsLogger?.info?.(
        `Teardown complete: ${deleted.length} deleted, ${notFound.length} already gone, ${failed.length} failed`,
      );

      if (failed.length > 0) {
        for (const f of failed) {
          testsLogger?.error?.(`  ${f.type}:${f.name} — ${f.status}`);
        }
      }

      expect(failed.length).toBe(0);
    },
    getTimeout('long'),
  );
});

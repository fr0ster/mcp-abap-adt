/**
 * Admin script: Setup ALL shared dependencies on a SAP system.
 *
 * Creates every object listed in shared_dependencies (test-config.yaml)
 * in dependency order. Idempotent — skips objects that already exist.
 *
 * Run:  npm run shared:setup
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { resolveSystemContext } from '../../../lib/systemContext';
import {
  getSharedDependenciesConfig,
  getTimeout,
} from '../../integration/helpers/configHelpers';
import { createTestLogger } from '../../integration/helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../integration/helpers/sessionHelpers';
import {
  ensureSharedDependency,
  ensureSharedPackage,
} from '../../integration/helpers/sharedObjects';

const testsLogger = createTestLogger('shared-setup');

describe('Admin: Setup shared dependencies', () => {
  let connection: IAbapConnection;
  let client: AdtClient;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      const result = await createTestConnectionAndSession();
      connection = result.connection;
      await resolveSystemContext(connection);
      client = new AdtClient(connection);
      hasConfig = true;
    } catch (error: any) {
      testsLogger?.warn?.(
        `Skipping: No SAP configuration found: ${error.message}`,
      );
      hasConfig = false;
    }
  });

  it(
    'should create all shared dependencies in order',
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

      // 1. Package
      testsLogger?.info?.('Setting up shared package...');
      await ensureSharedPackage(client, testsLogger);

      // Dependency order: tables → views → behavior_definitions
      const typeOrder: Array<{ type: string; label: string }> = [
        { type: 'tables', label: 'Tables' },
        { type: 'views', label: 'Views' },
        { type: 'behavior_definitions', label: 'Behavior definitions' },
      ];

      const results: Array<{
        type: string;
        name: string;
        status: string;
      }> = [];

      for (const { type, label } of typeOrder) {
        const items = sharedConfig[type];
        if (!Array.isArray(items) || items.length === 0) {
          testsLogger?.info?.(`No ${label} defined — skipping`);
          continue;
        }

        testsLogger?.info?.(`Setting up ${label} (${items.length})...`);

        for (const item of items) {
          try {
            const result = await ensureSharedDependency(
              client,
              type,
              item.name,
              testsLogger,
            );
            results.push({
              type,
              name: item.name,
              status: result.created ? 'created' : 'existed',
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            testsLogger?.error?.(
              `Failed to ensure ${type} ${item.name}: ${msg}`,
            );
            results.push({ type, name: item.name, status: `FAILED: ${msg}` });
          }
        }
      }

      // Summary
      const created = results.filter((r) => r.status === 'created');
      const existed = results.filter((r) => r.status === 'existed');
      const failed = results.filter((r) => r.status.startsWith('FAILED'));

      testsLogger?.info?.(
        `Setup complete: ${created.length} created, ${existed.length} already existed, ${failed.length} failed`,
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

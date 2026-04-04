/**
 * Admin script: Setup ALL shared dependencies on a SAP system.
 *
 * Creates every object listed in shared_dependencies (test-config.yaml)
 * in dependency order using direct ADT client calls.
 * Idempotent — skips objects that already exist.
 *
 * Strategy:
 *   1. Create all objects WITHOUT activation (direct client calls)
 *   2. Group-activate all objects at once via activateObjectsGroup
 *
 * This avoids activation errors when objects depend on each other
 * (e.g., BDEF references an implementation class that doesn't exist yet).
 *
 * Run:  npm run shared:setup
 */

import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { createAdtClient } from '../../../lib/clients';
import {
  getSystemContext,
  resolveSystemContext,
} from '../../../lib/systemContext';
import { parseActivationResponse } from '../../../lib/utils';
import {
  getSharedDependenciesConfig,
  getTimeout,
  isTestAvailableForSystem,
  loadTestConfig,
} from '../../integration/helpers/configHelpers';
import { createTestLogger } from '../../integration/helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../integration/helpers/sessionHelpers';
import { ensureSharedPackage } from '../../integration/helpers/sharedObjects';

const testsLogger = createTestLogger('shared-setup');

/**
 * Force-save DDL source for a CDS view by bypassing syntax check.
 * Uses AdtClient.getView().lock() / update(lockHandle) / unlock() — public IAdtObject API.
 * Needed for views with circular dependencies (RAP root/child composition)
 * that cannot pass checkView before the counterpart view is active.
 * Group activation handles the mutual refs once both have stored source.
 */
async function forceSaveViewSource(
  client: AdtClient,
  viewName: string,
  ddlSource: string,
  transportRequest?: string,
): Promise<void> {
  const lockHandle = await client.getView().lock({ viewName });
  try {
    await client
      .getView()
      .update({ viewName, ddlSource, transportRequest }, { lockHandle });
  } finally {
    try {
      await client.getView().unlock({ viewName }, lockHandle);
    } catch {
      // ignore unlock errors
    }
  }
}

/** Map shared_dependencies section name to ADT object type code */
const TYPE_CODES: Record<string, string> = {
  tables: 'TABL/DT',
  views: 'DDLS/DF',
  behavior_definitions: 'BDEF/BDO',
  classes: 'CLAS/OC',
  function_groups: 'FUGR/F',
  function_modules: 'FUGR/FF',
};

function resolveTransportRequest(sharedConfig: any): string | undefined {
  if (sharedConfig?.transport_request) return sharedConfig.transport_request;
  const config = loadTestConfig();
  return config?.environment?.default_transport || undefined;
}

function resolvePackageName(sharedConfig: any): string {
  if (sharedConfig?.package) return sharedConfig.package;
  const config = loadTestConfig();
  return config?.environment?.default_package || 'ZLOCAL';
}

describe('Admin: Setup shared dependencies', () => {
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
    'should create all shared dependencies and group-activate',
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

      const packageName = resolvePackageName(sharedConfig);
      const transportRequest = resolveTransportRequest(sharedConfig);

      // 1. Package
      testsLogger?.info?.('Setting up shared package...');
      await ensureSharedPackage(client, testsLogger);

      // 2. Create all objects WITHOUT activation (direct ADT client calls)
      const results: Array<{
        type: string;
        name: string;
        status: string;
      }> = [];

      // Collect names for group activation
      const toActivate: Array<{ name: string; type: string }> = [];

      // --- Tables ---
      const tables = sharedConfig.tables || [];
      if (tables.length > 0) {
        testsLogger?.info?.(
          `Creating Tables (${tables.length}) without activation...`,
        );
        for (const item of tables) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping table ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getTable()
                .read({ tableName: item.name });
              exists = readResult?.readResult !== undefined;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getTable().create({
                tableName: item.name,
                packageName,
                description: item.description || 'Shared test table',
                ddlCode: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created table ${item.name}`);
            }

            // Always update source code to ensure it matches config
            if (item.source) {
              try {
                await client.getTable().update(
                  {
                    tableName: item.name,
                    ddlCode: item.source,
                    transportRequest,
                  },
                  { sourceCode: item.source },
                );
                testsLogger?.info?.(`Updated table ${item.name} source`);
              } catch (updateError: any) {
                testsLogger?.warn?.(
                  `Update table ${item.name} source failed (will still activate): ${updateError.message}`,
                );
              }
            }

            results.push({
              type: 'tables',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.tables,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            // If create fails with auth/conflict but object may exist, still add to activate
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Table ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'tables',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.tables,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup table ${item.name}: ${msg}`,
              );
              results.push({
                type: 'tables',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Views ---
      const views = sharedConfig.views || [];
      if (views.length > 0) {
        testsLogger?.info?.(
          `Creating Views (${views.length}) without activation...`,
        );
        for (const item of views) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping view ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getView()
                .read({ viewName: item.name });
              exists = readResult !== undefined;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getView().create({
                viewName: item.name,
                packageName,
                description: item.description || 'Shared test view',
                ddlSource: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created view ${item.name}`);
            }

            if (item.source) {
              try {
                await client.getView().update(
                  {
                    viewName: item.name,
                    ddlSource: item.source,
                    transportRequest,
                  },
                  { sourceCode: item.source },
                );
                testsLogger?.info?.(`Updated view ${item.name} source`);
              } catch (updateError: any) {
                testsLogger?.warn?.(
                  `Update view ${item.name} source failed (${updateError.message}), trying force-save...`,
                );
                try {
                  await forceSaveViewSource(
                    client,
                    item.name,
                    item.source,
                    transportRequest,
                  );
                  testsLogger?.info?.(
                    `Force-saved source for view ${item.name}`,
                  );
                } catch (forceSaveError: any) {
                  testsLogger?.warn?.(
                    `Force-save view ${item.name} also failed: ${forceSaveError.message}`,
                  );
                }
              }
            }

            results.push({
              type: 'views',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.views,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `View ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'views',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.views,
              });
            } else {
              testsLogger?.error?.(`Failed to setup view ${item.name}: ${msg}`);
              results.push({
                type: 'views',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Behavior definitions ---
      const bdefs = sharedConfig.behavior_definitions || [];
      if (bdefs.length > 0) {
        testsLogger?.info?.(
          `Creating Behavior definitions (${bdefs.length}) without activation...`,
        );
        for (const item of bdefs) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping behavior definition ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getBehaviorDefinition()
                .read({ name: item.name });
              exists = readResult !== undefined;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getBehaviorDefinition().create({
                name: item.name,
                packageName,
                rootEntity: item.root_entity || item.name,
                implementationType: item.implementation_type || 'Managed',
                description: item.description || 'Shared test BDEF',
                sourceCode: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created behavior definition ${item.name}`);
            }

            if (item.source) {
              try {
                await client.getBehaviorDefinition().update(
                  {
                    name: item.name,
                    sourceCode: item.source,
                    transportRequest,
                  },
                  { sourceCode: item.source },
                );
                testsLogger?.info?.(
                  `Updated behavior definition ${item.name} source`,
                );
              } catch (updateError: any) {
                testsLogger?.warn?.(
                  `Update BDEF ${item.name} source failed: ${updateError.message}`,
                );
              }
            }

            results.push({
              type: 'behavior_definitions',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.behavior_definitions,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `BDEF ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'behavior_definitions',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.behavior_definitions,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup behavior definition ${item.name}: ${msg}`,
              );
              results.push({
                type: 'behavior_definitions',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Classes (implementation classes for BDEFs) ---
      const classes = sharedConfig.classes || [];
      if (classes.length > 0) {
        testsLogger?.info?.(
          `Creating Classes (${classes.length}) without activation...`,
        );
        for (const item of classes) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping class ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getClass()
                .read({ className: item.name });
              exists = readResult?.readResult !== undefined;
            } catch {
              exists = false;
            }

            if (exists) {
              testsLogger?.info?.(`Class ${item.name} already exists`);
              results.push({
                type: 'classes',
                name: item.name,
                status: 'existed',
              });
            } else {
              await client.getClass().create({
                className: item.name,
                packageName,
                description: item.description || 'Shared test class',
                transportRequest,
              });
              testsLogger?.info?.(`Created class ${item.name}`);
              results.push({
                type: 'classes',
                name: item.name,
                status: 'created',
              });
            }

            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.classes,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Class ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'classes',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.classes,
              });
            } else {
              testsLogger?.error?.(
                `Failed to create class ${item.name}: ${msg}`,
              );
              results.push({
                type: 'classes',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Function Groups ---
      const functionGroups = sharedConfig.function_groups || [];
      if (functionGroups.length > 0) {
        testsLogger?.info?.(
          `Creating Function Groups (${functionGroups.length}) without activation...`,
        );
        for (const item of functionGroups) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping function group ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getFunctionGroup()
                .read({ functionGroupName: item.name });
              exists = readResult?.readResult !== undefined;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getFunctionGroup().create({
                functionGroupName: item.name,
                description: item.description || 'Shared test function group',
                packageName,
                transportRequest,
              });
              testsLogger?.info?.(`Created function group ${item.name}`);
            }

            results.push({
              type: 'function_groups',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.function_groups,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Function group ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'function_groups',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.function_groups,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup function group ${item.name}: ${msg}`,
              );
              results.push({
                type: 'function_groups',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Function Modules ---
      const functionModules = sharedConfig.function_modules || [];
      if (functionModules.length > 0) {
        testsLogger?.info?.(
          `Creating Function Modules (${functionModules.length}) without activation...`,
        );
        for (const item of functionModules) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping function module ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client.getFunctionModule().read({
                functionModuleName: item.name,
                functionGroupName: item.group,
              });
              exists = readResult?.readResult !== undefined;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getFunctionModule().create({
                functionModuleName: item.name,
                functionGroupName: item.group,
                description: item.description || 'Shared test function module',
                packageName: '',
                sourceCode: '',
                transportRequest,
              });
              testsLogger?.info?.(`Created function module ${item.name}`);
            }

            // Update source code if provided
            if (item.source) {
              try {
                const lockHandle = await client.getFunctionModule().lock({
                  functionModuleName: item.name,
                  functionGroupName: item.group,
                });
                try {
                  await client.getFunctionModule().update(
                    {
                      functionModuleName: item.name,
                      functionGroupName: item.group,
                      sourceCode: item.source,
                      transportRequest,
                    },
                    { lockHandle },
                  );
                  testsLogger?.info?.(
                    `Updated function module ${item.name} source`,
                  );
                } finally {
                  try {
                    await client.getFunctionModule().unlock(
                      {
                        functionModuleName: item.name,
                        functionGroupName: item.group,
                      },
                      lockHandle,
                    );
                  } catch {
                    // ignore unlock errors
                  }
                }
              } catch (updateError: any) {
                testsLogger?.warn?.(
                  `Update function module ${item.name} source failed: ${updateError.message}`,
                );
              }
            }

            results.push({
              type: 'function_modules',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.function_modules,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Function module ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'function_modules',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.function_modules,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup function module ${item.name}: ${msg}`,
              );
              results.push({
                type: 'function_modules',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // 3. Group-activate all objects at once
      if (toActivate.length > 0) {
        testsLogger?.info?.(`Group-activating ${toActivate.length} objects...`);
        try {
          const response = await client
            .getUtils()
            .activateObjectsGroup(toActivate, true);
          const activationResult = parseActivationResponse(response.data);

          const errors = activationResult.messages.filter(
            (m) => m.type === 'error' || m.type === 'E',
          );
          const warnings = activationResult.messages.filter(
            (m) => m.type === 'warning' || m.type === 'W',
          );

          if (errors.length > 0) {
            testsLogger?.error?.(
              `Group activation errors:\n${errors.map((e: any) => `  ${e.shortText || e.text}`).join('\n')}`,
            );
            results.push({
              type: 'activation',
              name: 'GROUP',
              status: `FAILED: ${errors.length} activation error(s)`,
            });
          } else if (activationResult.activated && activationResult.checked) {
            testsLogger?.info?.('Group activation completed successfully');
          }
          if (warnings.length > 0) {
            testsLogger?.warn?.(
              `Group activation warnings:\n${warnings.map((w: any) => `  ${w.shortText || w.text}`).join('\n')}`,
            );
          }
        } catch (error: any) {
          testsLogger?.error?.(`Group activation failed: ${error.message}`);
          results.push({
            type: 'activation',
            name: 'GROUP',
            status: `FAILED: ${error.message}`,
          });
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

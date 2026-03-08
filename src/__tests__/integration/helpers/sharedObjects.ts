/**
 * Shared Objects Management — soft mode (direct adt-clients calls)
 *
 * Ensures shared prerequisite objects exist in SAP and match YAML config.
 * Used by tests that depend on shared objects (e.g., BehaviorImplementation depends on BDEF).
 *
 * Always runs in soft mode — no MCP server process needed.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection, ILogger } from '@mcp-abap-adt/interfaces';
import { getSharedObject, loadTestConfig } from './configHelpers';
import { createTestLogger } from './loggerHelpers';
import { createTestConnectionAndSession } from './sessionHelpers';

const logger = createTestLogger('shared-objects');

interface SharedObjectResult {
  success: boolean;
  name: string;
  action: 'verified' | 'created' | 'updated' | 'skipped';
  reason?: string;
}

/**
 * Normalize source code for comparison: trim lines, collapse whitespace, remove empty lines.
 */
function normalizeSource(source: string): string {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Ensure behavior_definition_prerequisite shared object exists and matches YAML.
 *
 * Steps:
 * 1. Read BDEF from SAP
 * 2. If not found → create it
 * 3. If found → compare source code with YAML; update if different
 */
export async function ensureBdefPrerequisite(
  connection: IAbapConnection,
  adtLogger?: ILogger,
): Promise<SharedObjectResult> {
  const config = getSharedObject('behavior_definition_prerequisite');
  if (!config?.name) {
    return {
      success: true,
      name: '',
      action: 'skipped',
      reason: 'No behavior_definition_prerequisite in shared_objects config',
    };
  }

  const name = String(config.name).toUpperCase();
  const yamlSource: string | undefined = config.source_code;
  const implementationType = config.implementation_type || 'Managed';

  const globalConfig = loadTestConfig();
  const packageName =
    config.package_name ||
    globalConfig?.environment?.default_package ||
    'ZOK_LOCAL';
  const transportRequest =
    config.transport_request ||
    globalConfig?.environment?.default_transport ||
    undefined;

  const client = new AdtClient(connection, adtLogger);

  // Step 1: Try to read
  try {
    const state = await client.getBehaviorDefinition().read({ name }, 'active');

    if (state) {
      logger?.info(`✅ Shared BDEF ${name} exists`);

      // Step 2: Compare source code if YAML has source_code defined
      if (yamlSource) {
        try {
          const readState = await client
            .getBehaviorDefinition()
            .read({ name }, 'active');
          const currentSource =
            typeof readState?.readResult?.data === 'string'
              ? readState.readResult.data
              : '';

          if (normalizeSource(currentSource) !== normalizeSource(yamlSource)) {
            logger?.info(
              `📝 Shared BDEF ${name} source differs from YAML, updating...`,
            );
            // Lock → Update → Unlock → Activate
            try {
              const lockHandle = await client
                .getBehaviorDefinition()
                .lock({ name });
              try {
                await client
                  .getBehaviorDefinition()
                  .update({ name, sourceCode: yamlSource }, { lockHandle });
              } finally {
                await client
                  .getBehaviorDefinition()
                  .unlock({ name }, lockHandle);
              }
              await client.getBehaviorDefinition().activate({ name });
              logger?.info(`✅ Shared BDEF ${name} updated and activated`);
              return { success: true, name, action: 'updated' };
            } catch (updateError: any) {
              logger?.warn?.(
                `⚠️ Failed to update shared BDEF ${name}: ${updateError.message}`,
              );
              // Object exists but couldn't update — still usable
              return { success: true, name, action: 'verified' };
            }
          }
        } catch {
          // Can't read source — object exists, skip comparison
        }
      }

      return { success: true, name, action: 'verified' };
    }
  } catch (readError: any) {
    if (readError.response?.status !== 404) {
      return {
        success: false,
        name,
        action: 'skipped',
        reason: `Cannot read shared BDEF ${name}: ${readError.message}`,
      };
    }
    // 404 — doesn't exist, create it
  }

  // Step 3: Create
  logger?.info(`🔨 Creating shared BDEF ${name}...`);
  try {
    await client.getBehaviorDefinition().create({
      name,
      rootEntity: name,
      packageName,
      implementationType,
      description: `Shared prerequisite BDEF for integration tests`,
      ...(yamlSource && { sourceCode: yamlSource }),
      ...(transportRequest && { transportRequest }),
    });
    // Wait for SAP to fully propagate the activation
    await new Promise((resolve) => setTimeout(resolve, 3000));
    logger?.info(`✅ Shared BDEF ${name} created and activated`);
    return { success: true, name, action: 'created' };
  } catch (createError: any) {
    // "already exists" is OK (race condition or stale cache)
    if (
      createError.message?.includes('already exists') ||
      createError.response?.status === 409
    ) {
      return { success: true, name, action: 'verified' };
    }
    return {
      success: false,
      name,
      action: 'skipped',
      reason: `Failed to create shared BDEF ${name}: ${createError.message}`,
    };
  }
}

/**
 * Verify a CDS view exists in SAP (read-only check, no create).
 * Returns success=true if exists, success=false with reason if not.
 */
export async function verifyCdsViewExists(
  connection: IAbapConnection,
  viewName: string,
  adtLogger?: ILogger,
): Promise<SharedObjectResult> {
  const name = viewName.toUpperCase();
  const client = new AdtClient(connection, adtLogger);
  try {
    await client.getView().read({ viewName: name });
    logger?.info(`✅ CDS view ${name} exists`);
    return { success: true, name, action: 'verified' };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return {
        success: false,
        name,
        action: 'skipped',
        reason: `CDS view ${name} does not exist in SAP. Create it manually.`,
      };
    }
    return {
      success: false,
      name,
      action: 'skipped',
      reason: `Cannot verify CDS view ${name}: ${error.message}`,
    };
  }
}

/**
 * Ensure all shared objects from YAML exist and match.
 * Call this in beforeAll() of tests that depend on shared objects.
 *
 * Always creates its own connection (soft mode) — works regardless of hard/soft mode context.
 * If connection is provided AND has makeAdtRequest, it will be used.
 */
export async function ensureSharedObjects(
  connection?: IAbapConnection | null,
  adtLogger?: ILogger,
): Promise<SharedObjectResult[]> {
  // Ensure we have a real connection (not an empty stub from hard mode)
  let conn = connection;
  if (!conn || typeof (conn as any).makeAdtRequest !== 'function') {
    try {
      const result = await createTestConnectionAndSession();
      conn = result.connection;
    } catch (connError: any) {
      logger?.warn?.(
        `⚠️ Cannot create connection for shared objects: ${connError.message}`,
      );
      return [
        {
          success: false,
          name: '',
          action: 'skipped',
          reason: `Cannot create connection: ${connError.message}`,
        },
      ];
    }
  }

  const results: SharedObjectResult[] = [];

  // Verify CDS view prerequisites (must exist in SAP, not auto-created)
  const sharedConfig = loadTestConfig()?.shared_objects || {};
  const cdsPrerequisites: string[] = sharedConfig.cds_view_prerequisites || [];
  for (const viewName of cdsPrerequisites) {
    const cdsResult = await verifyCdsViewExists(conn!, viewName, adtLogger);
    results.push(cdsResult);
    if (!cdsResult.success) {
      logger?.warn?.(
        `⚠️ CDS view prerequisite ${viewName} missing: ${cdsResult.reason}`,
      );
    }
  }

  // BDEF prerequisite
  const bdefResult = await ensureBdefPrerequisite(conn!, adtLogger);
  results.push(bdefResult);

  // Log summary
  for (const r of results) {
    if (!r.success) {
      logger?.warn?.(`⚠️ Shared object ${r.name}: ${r.reason}`);
    }
  }

  return results;
}

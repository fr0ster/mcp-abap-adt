/**
 * Shared Dependencies Management — soft mode (direct adt-clients calls)
 *
 * Ensures shared prerequisite objects exist in SAP and match YAML config.
 * Used by tests that depend on shared objects (e.g., BehaviorImplementation depends on BDEF).
 *
 * Always runs in soft mode — no MCP server process needed.
 *
 * Commands:
 *   npm run shared:setup    — create all shared dependencies in order
 *   npm run shared:teardown — delete all shared dependencies in reverse order
 *   npm run shared:check    — validate config consistency (offline)
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection, ILogger } from '@mcp-abap-adt/interfaces';
import {
  getSharedDependenciesConfig,
  loadTestConfig,
  resolveSharedDependency,
} from './configHelpers';
import { createTestLogger } from './loggerHelpers';
import { createTestConnectionAndSession } from './sessionHelpers';

const logger = createTestLogger('shared-objects');

export interface SharedObjectResult {
  success: boolean;
  name: string;
  action: 'verified' | 'created' | 'updated' | 'skipped';
  reason?: string;
}

/** In-memory cache to skip re-verification within the same process */
const _verifiedDependencies: Record<string, boolean> = {};
let _sharedPackageReady = false;

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

function resolveTransportRequest(override?: string): string | undefined {
  if (override) return override;
  const config = loadTestConfig();
  return config?.environment?.default_transport || undefined;
}

function resolvePackageName(override?: string): string {
  if (override) return override;
  const sharedConfig = getSharedDependenciesConfig();
  if (sharedConfig?.package) return sharedConfig.package;
  const config = loadTestConfig();
  return config?.environment?.default_package || 'ZLOCAL';
}

/**
 * Ensure the shared sub-package exists (create if missing).
 * Skips after first successful verification (in-memory flag).
 */
export async function ensureSharedPackage(
  client: AdtClient,
  log?: ILogger,
): Promise<void> {
  if (_sharedPackageReady) return;

  const sharedConfig = getSharedDependenciesConfig();
  if (!sharedConfig?.package) return;

  const packageName = sharedConfig.package;

  // Check if package exists
  try {
    const readResult = await client.getPackage().read({ packageName });
    if (readResult?.readResult) {
      log?.info?.(`Shared package ${packageName} already exists`);
      _sharedPackageReady = true;
      return;
    }
  } catch {
    // Package doesn't exist — will create below
  }

  // Create the package
  try {
    const transportRequest = resolveTransportRequest(
      sharedConfig.transport_request,
    );
    await client.getPackage().create({
      packageName,
      description: 'Shared test dependencies package',
      superPackage: sharedConfig.super_package,
      softwareComponent: sharedConfig.software_component,
      transportLayer: sharedConfig.transport_layer,
      packageType: 'development',
      transportRequest,
    });
    log?.info?.(`Created shared package ${packageName}`);
  } catch (error: any) {
    if (
      error.message?.includes('409') ||
      error.message?.includes('already exist')
    ) {
      log?.info?.(`Shared package ${packageName} already exists`);
    } else {
      log?.warn?.(
        `Failed to create shared package ${packageName}: ${error.message}`,
      );
      throw error;
    }
  }

  _sharedPackageReady = true;
}

/**
 * Ensure a shared dependency object exists. Creates it if missing, never deletes.
 * Uses in-memory cache to skip verification after first check.
 *
 * @returns { existed: boolean, created: boolean }
 */
export async function ensureSharedDependency(
  client: AdtClient,
  type: string,
  name: string,
  log?: ILogger,
): Promise<{ existed: boolean; created: boolean }> {
  const cacheKey = `${type}:${name}`;
  if (_verifiedDependencies[cacheKey]) {
    log?.info?.(`Shared ${type} ${name} already verified, skipping`);
    return { existed: true, created: false };
  }

  const depConfig = resolveSharedDependency(type, name);
  if (!depConfig) {
    throw new Error(
      `Shared dependency ${type}:${name} not found in shared_dependencies config`,
    );
  }

  const packageName = resolvePackageName();
  const transportRequest = resolveTransportRequest();

  // Check if the object already exists
  let exists = false;
  try {
    if (type === 'tables') {
      const result = await client.getTable().read({ tableName: name });
      exists = result?.readResult !== undefined;
    } else if (type === 'views') {
      const result = await client.getView().read({ viewName: name });
      exists = result !== undefined;
    } else if (type === 'behavior_definitions') {
      const result = await client.getBehaviorDefinition().read({ name });
      exists = result !== undefined;
    }
  } catch {
    exists = false;
  }

  if (exists) {
    log?.info?.(`Shared ${type} ${name} already exists`);
    _verifiedDependencies[cacheKey] = true;
    return { existed: true, created: false };
  }

  // Create the object
  log?.info?.(`Creating shared ${type} ${name}...`);
  try {
    if (type === 'tables') {
      await client.getTable().create({
        tableName: name,
        packageName,
        description: depConfig.description || 'Shared test table',
        ddlCode: depConfig.source,
        transportRequest,
      });
      if (depConfig.source) {
        log?.info?.(`Activating shared table ${name}...`);
        await client.getTable().update(
          {
            tableName: name,
            ddlCode: depConfig.source,
            transportRequest,
          },
          { activateOnUpdate: true, sourceCode: depConfig.source },
        );
        log?.info?.(`Shared table ${name} activated`);
      }
    } else if (type === 'views') {
      await client.getView().create({
        viewName: name,
        packageName,
        description: depConfig.description || 'Shared test view',
        ddlSource: depConfig.source,
        transportRequest,
      });
      if (depConfig.source) {
        log?.info?.(`Activating shared view ${name}...`);
        await client.getView().update(
          {
            viewName: name,
            ddlSource: depConfig.source,
            transportRequest,
          },
          { activateOnUpdate: true, sourceCode: depConfig.source },
        );
        log?.info?.(`Shared view ${name} activated`);
      }
    } else if (type === 'behavior_definitions') {
      await client.getBehaviorDefinition().create({
        name,
        packageName,
        rootEntity: depConfig.root_entity || name,
        implementationType: depConfig.implementation_type || 'Managed',
        description: depConfig.description || 'Shared test BDEF',
        sourceCode: depConfig.source,
        transportRequest,
      });
      if (depConfig.source) {
        log?.info?.(`Activating shared behavior definition ${name}...`);
        await client.getBehaviorDefinition().update(
          {
            name,
            sourceCode: depConfig.source,
            transportRequest,
          },
          { activateOnUpdate: true, sourceCode: depConfig.source },
        );
        log?.info?.(`Shared behavior definition ${name} activated`);
      }
    }
    log?.info?.(`Created shared ${type} ${name}`);
    _verifiedDependencies[cacheKey] = true;
    return { existed: false, created: true };
  } catch (error: any) {
    if (
      error.message?.includes('409') ||
      error.message?.includes('already exist')
    ) {
      log?.info?.(
        `Shared ${type} ${name} already exists (concurrent creation)`,
      );
      _verifiedDependencies[cacheKey] = true;
      return { existed: true, created: false };
    }
    throw error;
  }
}

/** Try to delete an object; ignore 404 (already gone) */
export async function safeDelete(
  label: string,
  deleteFn: () => Promise<void>,
  log?: ILogger,
): Promise<'deleted' | 'not_found' | 'failed'> {
  try {
    await deleteFn();
    log?.info?.(`Deleted ${label}`);
    return 'deleted';
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('404') ||
      msg.includes('not found') ||
      msg.includes('does not exist')
    ) {
      log?.info?.(`${label} — already gone (404)`);
      return 'not_found';
    }
    log?.error?.(`Failed to delete ${label}: ${msg}`);
    return 'failed';
  }
}

/** Clear in-memory caches for shared dependencies */
export function resetSharedDependencyCache(): void {
  _sharedPackageReady = false;
  for (const key of Object.keys(_verifiedDependencies)) {
    delete _verifiedDependencies[key];
  }
}

/**
 * Verify all shared dependencies from YAML exist in SAP.
 * Call this in beforeAll() of tests that depend on shared objects.
 *
 * Verify-only mode — does NOT auto-create. If a dependency is missing,
 * returns success=false with a message to run `npm run shared:setup`.
 *
 * Always creates its own connection (soft mode) — works regardless of hard/soft mode context.
 */
export async function ensureSharedObjects(
  connection?: IAbapConnection | null,
  adtLogger?: ILogger,
): Promise<SharedObjectResult[]> {
  const sharedConfig = getSharedDependenciesConfig();
  if (!sharedConfig) {
    logger?.info?.('No shared_dependencies in config, skipping');
    return [];
  }

  // Ensure we have a real connection (not an empty stub from hard mode)
  let conn = connection;
  if (!conn || typeof (conn as any).makeAdtRequest !== 'function') {
    try {
      const result = await createTestConnectionAndSession();
      conn = result.connection;
    } catch (connError: any) {
      logger?.warn?.(
        `Cannot create connection for shared objects: ${connError.message}`,
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

  const client = new AdtClient(conn!, adtLogger);
  const results: SharedObjectResult[] = [];

  // Verify all shared deps exist (read-only check)
  const typeOrder: Array<{
    type: string;
    readFn: (name: string) => Promise<any>;
  }> = [
    {
      type: 'tables',
      readFn: (name) => client.getTable().read({ tableName: name }),
    },
    {
      type: 'views',
      readFn: (name) => client.getView().read({ viewName: name }),
    },
    {
      type: 'behavior_definitions',
      readFn: (name) => client.getBehaviorDefinition().read({ name }),
    },
  ];

  for (const { type, readFn } of typeOrder) {
    const items = sharedConfig[type];
    if (!Array.isArray(items) || items.length === 0) continue;

    for (const item of items) {
      try {
        await readFn(item.name);
        results.push({ success: true, name: item.name, action: 'verified' });
      } catch {
        const msg = `Shared ${type} "${item.name}" not found in SAP. Run: npm run shared:setup`;
        logger?.error?.(msg);
        results.push({
          success: false,
          name: item.name,
          action: 'skipped',
          reason: msg,
        });
      }
    }
  }

  const missing = results.filter((r) => !r.success);
  if (missing.length > 0) {
    logger?.error?.(
      `${missing.length} shared dependencies missing. Run: npm run shared:setup`,
    );
  }

  return results;
}

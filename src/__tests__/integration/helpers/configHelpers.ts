/**
 * Configuration helpers for low-level handler integration tests
 * Loads test configuration from test-config.yaml (shared with adt-clients)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';
import { invalidateConnectionCache } from '../../../lib/utils';
import { refreshTokensForTests } from './authHelpers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { createTestLogger } from './loggerHelpers';

const configLogger = createTestLogger('config');

let cachedConfig: any = null;
let envLoaded = false;
let envLoadError: Error | null = null;
let brokerAttempted = false;
let brokerSucceeded = false;

function resolveUseAuthBrokerFlag(): boolean {
  try {
    const cfg = loadTestConfig();
    return (
      process.env.MCP_USE_AUTH_BROKER === 'true' ||
      cfg?.auth_broker?.use_auth_broker === true ||
      cfg?.environment?.use_auth_broker === true ||
      !!cfg?.auth_broker // prefer auth-broker if config section exists
    );
  } catch {
    return process.env.MCP_USE_AUTH_BROKER === 'true';
  }
}

function resolveUnsafeFlag(): boolean {
  try {
    const cfg = loadTestConfig();
    return (
      process.env.MCP_UNSAFE === 'true' ||
      cfg?.auth_broker?.unsafe === true ||
      cfg?.auth_broker?.unsafe_session_store === true
    );
  } catch {
    return process.env.MCP_UNSAFE === 'true';
  }
}

/**
 * Load environment variables from .env file
 * Priority:
 * 1. Check if already loaded (SAP_URL exists)
 * 2. Use MCP_ENV_PATH if set
 * 3. Try current working directory (where test was run from)
 * 4. Fallback to project root (for tests run from project root)
 *
 * Also attempts to refresh tokens using AuthBroker if destination is available
 */
export async function loadTestEnv(): Promise<void> {
  if (envLoaded) {
    return;
  }
  if (envLoadError) {
    throw envLoadError;
  }

  // Prevent index.ts env auto-load / HTTP-mode logs during tests
  process.env.MCP_SKIP_ENV_LOAD = 'true';

  const useAuthBroker = resolveUseAuthBrokerFlag();
  const useUnsafe = resolveUnsafeFlag();

  if (useUnsafe) {
    process.env.MCP_UNSAFE = 'true';
  }

  let brokerOk = brokerSucceeded;

  // If auth-broker is preferred, try it first and skip .env entirely unless explicitly requested
  if (useAuthBroker) {
    try {
      brokerAttempted = true;
      await refreshTokensForTests({ force: true });
      brokerOk = !!process.env.SAP_URL;
      brokerSucceeded = brokerOk;
    } catch (error: any) {
      configLogger?.warn(`[DEBUG] loadTestEnv - Auth-broker refresh failed: ${error?.message || String(error)}`);
    }

    // If broker succeeded, we’re done (no .env fallback when broker is configured)
    if (brokerOk && process.env.SAP_URL) {
      envLoaded = true;
      return;
    }
  }

  // Always try to load .env file when auth-broker is not preferred (or broker failed and no URL available)

  let envPath: string | null = null;

  // Priority 1: Use MCP_ENV_PATH if explicitly set
  if (process.env.MCP_ENV_PATH) {
    const resolvedPath = path.resolve(process.env.MCP_ENV_PATH);
    if (fs.existsSync(resolvedPath)) {
      envPath = resolvedPath;
    }
  }

  // Priority 2: Try current working directory (where test was run from)
  if (!envPath && !useAuthBroker) {
    const cwdEnvPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(cwdEnvPath)) {
      envPath = cwdEnvPath;
    }
  }

  // Priority 3: Fallback to project root (for tests run from project root)
  if (!envPath && !useAuthBroker) {
    const projectRootEnvPath = path.resolve(__dirname, '../../../../.env');
    if (fs.existsSync(projectRootEnvPath)) {
      envPath = projectRootEnvPath;
    }
  }

  // Load .env file if found
  if (envPath) {
    // CRITICAL: Use override: true for tests to ensure .env values always take precedence
    // This is necessary because tests may run in environments where process.env already has
    // empty or stale values that would prevent .env from being loaded with override: false
    const result = dotenv.config({ path: envPath, quiet: true, override: true });
    if (result.error) {
      configLogger?.warn(`⚠️ Failed to load .env file: ${result.error.message}`);
    } else {
      logEnvLoaded(envPath);

      // Apply auth-broker preference from test-config.yaml (if set)
      try {
        const useAuthBroker = resolveUseAuthBrokerFlag();
        if (useAuthBroker) {
          process.env.MCP_USE_AUTH_BROKER = 'true';
          if (useUnsafe) {
            process.env.MCP_UNSAFE = 'true';
          }
          configLogger?.debug('[DEBUG] loadTestEnv - Using auth-broker as primary token source (MCP_USE_AUTH_BROKER=true)');
          if (useUnsafe) {
            configLogger?.debug('[DEBUG] loadTestEnv - Using unsafe session store for auth-broker (MCP_UNSAFE=true)');
          }
        }
      } catch {
        // ignore config load issues here; tests will proceed with existing env
      }
      // CRITICAL: Invalidate connection cache after loading .env
      // This ensures getManagedConnection() will recreate connection with new config
      // (including refresh token that might have been missing before)
      try {
        invalidateConnectionCache();
        configLogger?.debug(`[DEBUG] loadTestEnv - Invalidated connection cache to force recreation with updated .env values`);
      } catch (error: any) {
        // If invalidateConnectionCache fails, log but don't fail
        configLogger?.warn(`[DEBUG] loadTestEnv - Failed to invalidate connection cache: ${error?.message || String(error)}`);
      }

      // If auth-broker is enabled as a fallback, attempt refresh after .env load
      if (useAuthBroker && !brokerAttempted && !process.env.SAP_URL) {
        try {
          brokerAttempted = true;
          await refreshTokensForTests({ force: true });
          brokerOk = !!process.env.SAP_URL;
          brokerSucceeded = brokerOk;
        } catch (error: any) {
          configLogger?.warn(`[DEBUG] loadTestEnv - Failed to refresh tokens via auth-broker: ${error?.message || String(error)}`);
        }
      }
    }
  } else {
    // No .env file found
    if (!useAuthBroker) {
      const cwdEnvPath = path.resolve(process.cwd(), '.env');
      const projectRootEnvPath = path.resolve(__dirname, '../../../../.env');
      configLogger?.warn(
        `⚠️ .env file not found. Tried: ${JSON.stringify({
          MCP_ENV_PATH: process.env.MCP_ENV_PATH || '(not set)',
          cwd: cwdEnvPath,
          projectRoot: projectRootEnvPath
        })}`
      );
    }
  }

  // Final guard: require SAP_URL from either auth-broker or .env
  if (!process.env.SAP_URL) {
    envLoadError = new Error(
      useAuthBroker
        ? 'No SAP credentials available for tests via auth-broker. Ensure service key/session exist for configured destination.'
        : 'No SAP credentials available for tests. Provide a .env file or enable auth-broker.'
    );
    throw envLoadError;
  }

  envLoaded = true;
}

/**
 * Log environment loaded status
 */
function logEnvLoaded(envPath: string): void {
  // Log refresh token availability for debugging
  const hasRefreshToken = !!(process.env.SAP_REFRESH_TOKEN && process.env.SAP_REFRESH_TOKEN.trim());
  const hasUaaUrl = !!process.env.SAP_UAA_URL;
  const hasUaaClientId = !!process.env.SAP_UAA_CLIENT_ID;
  const hasUaaClientSecret = !!process.env.SAP_UAA_CLIENT_SECRET;
  configLogger?.debug(`[DEBUG] loadTestEnv - Loaded .env from: ${envPath}`);
  configLogger?.debug(
    `[DEBUG] loadTestEnv - Refresh token config: ${JSON.stringify({
      hasRefreshToken,
      hasUaaUrl,
      hasUaaClientId,
      hasUaaClientSecret,
      canRefresh: hasRefreshToken && hasUaaUrl && hasUaaClientId && hasUaaClientSecret
    })}`
  );
}

/**
 * Load test configuration from YAML
 * Uses test-config.yaml from mcp-abap-adt/tests
 */
export function loadTestConfig(): any {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load from mcp-abap-adt/tests/test-config.yaml
  const configPath = path.resolve(__dirname, '../../../../tests/test-config.yaml');
  const templatePath = path.resolve(__dirname, '../../../../tests/test-config.yaml.template');

  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    cachedConfig = yaml.parse(configContent) || {};
    return cachedConfig;
  }

  if (fs.existsSync(templatePath)) {
    configLogger?.warn('⚠️ tests/test-config.yaml not found. Using template (all integration tests will be disabled).');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    cachedConfig = yaml.parse(templateContent) || {};
    return cachedConfig;
  }

  configLogger?.error('❌ Test configuration files not found.');
  configLogger?.error('Please create tests/test-config.yaml with test parameters.');
  return {};
}

/**
 * Get session persistence config
 */
export function getSessionConfig(): {
  persist_session?: boolean;
  sessions_dir?: string;
  session_id_format?: string;
  cleanup_session_after_test?: boolean;
} {
  const config = loadTestConfig();
  return config.session_config || {};
}

/**
 * Get lock persistence config
 */
export function getLockConfig(): {
  persist_locks?: boolean;
  locks_dir?: string;
} {
  const config = loadTestConfig();
  return config.lock_config || {};
}

/**
 * Get enabled test case for a handler
 * @param handlerName - Handler name (e.g., 'create_class_low', 'lock_class_low')
 * @param testCaseName - Optional: specific test case name
 */
export function getEnabledTestCase(handlerName: string, testCaseName?: string): any {
  const config = loadTestConfig();
  const handlerTests = config[handlerName]?.test_cases || [];

  if (handlerTests.length === 0) {
    configLogger?.debug(`[DEBUG] No test cases found for handler: ${handlerName}`);
    return null;
  }

  let enabledTest;
  if (testCaseName) {
    const testCase = handlerTests.find((tc: any) => tc.name === testCaseName);
    if (!testCase) {
      configLogger?.debug(`[DEBUG] Test case "${testCaseName}" not found for handler: ${handlerName}`);
      return null;
    }
    if (testCase.enabled !== true) {
      configLogger?.info(`⏭️  Test case "${testCaseName}" for handler "${handlerName}" is disabled (enabled: ${testCase.enabled})`);
      return null;
    }
    enabledTest = testCase;
  } else {
    enabledTest = handlerTests.find((tc: any) => tc.enabled === true);
    if (!enabledTest) {
      const disabledTests = handlerTests.filter((tc: any) => tc.enabled === false);
      if (disabledTests.length > 0) {
        configLogger?.info(`⏭️  All test cases for handler "${handlerName}" are disabled (${disabledTests.length} test case(s) found, all disabled)`);
      } else {
        configLogger?.debug(`[DEBUG] No enabled test cases found for handler: ${handlerName}`);
      }
      return null;
    }
  }

  return enabledTest;
}

/**
 * Get test case definition
 */
export function getTestCaseDefinition(handlerName: string, testCaseName: string): any {
  const config = loadTestConfig();
  const handlerTests = config[handlerName]?.test_cases || [];
  return handlerTests.find((tc: any) => tc.name === testCaseName) || null;
}

/**
 * Get timeout for operation type
 */
export function getTimeout(operationType: string = 'default'): number {
  const config = loadTestConfig();
  const timeouts = config.test_settings?.timeouts || {};
  return timeouts[operationType] || timeouts.default || 60000;
}

/**
 * Build SAP config for tests from environment variables (auth-broker or .env)
 */
export function getSapConfigFromEnv(): SapConfig {
  const urlRaw = process.env.SAP_URL?.trim();
  if (!urlRaw) {
    throw new Error('SAP_URL is not set. Ensure auth-broker or .env provided credentials.');
  }

  let url: string;
  try {
    const normalized = new URL(urlRaw);
    url = normalized.href.replace(/\/$/, '');
  } catch (err) {
    throw new Error(`Invalid SAP_URL: ${urlRaw}`);
  }

  let authType: SapConfig['authType'] = 'basic';
  if (process.env.SAP_JWT_TOKEN) {
    authType = 'jwt';
  } else if (process.env.SAP_AUTH_TYPE) {
    const raw = process.env.SAP_AUTH_TYPE.trim().toLowerCase();
    authType = raw === 'xsuaa' ? 'jwt' : (raw as SapConfig['authType']);
  }

  const config: SapConfig = { url, authType };

  if (authType === 'jwt') {
    config.jwtToken = process.env.SAP_JWT_TOKEN || '';
    if (process.env.SAP_REFRESH_TOKEN) {
      config.refreshToken = process.env.SAP_REFRESH_TOKEN;
    }
    if (process.env.SAP_UAA_URL) {
      config.uaaUrl = process.env.SAP_UAA_URL;
    }
    if (process.env.SAP_UAA_CLIENT_ID) {
      config.uaaClientId = process.env.SAP_UAA_CLIENT_ID;
    }
    if (process.env.SAP_UAA_CLIENT_SECRET) {
      config.uaaClientSecret = process.env.SAP_UAA_CLIENT_SECRET;
    }
  } else {
    config.username = process.env.SAP_USERNAME || '';
    config.password = process.env.SAP_PASSWORD || '';
  }

  if (process.env.SAP_CLIENT) {
    config.client = process.env.SAP_CLIENT.trim();
  }
  if (process.env.SAP_LANGUAGE) {
    (config as any).language = process.env.SAP_LANGUAGE.trim();
  }

  return config;
}

/**
 * Get operation delay
 */
export function getOperationDelay(operation: string, testCase?: any): number {
  // Check test case specific delay first
  if (testCase?.params?.operation_delays?.[operation]) {
    return testCase.params.operation_delays[operation];
  }

  // Check global config
  const config = loadTestConfig();
  const delays = config.test_settings?.operation_delays || {};
  return delays[operation] || delays.default || 3000;
}

/**
 * Resolve package name (from test case or default)
 */
export function resolvePackageName(testCase?: any): string {
  let packageName: string;

  if (testCase?.params?.package_name) {
    packageName = String(testCase.params.package_name).trim();
  } else {
    const config = loadTestConfig();
    packageName = (config.environment?.default_package || 'ZOK_LOCAL').trim();
  }

  // Validate for placeholders
  const placeholderPattern = /<[A-Z_]+>/i;
  if (placeholderPattern.test(packageName)) {
    throw new Error(
      `❌ Package name contains placeholder value: "${packageName}"\n` +
      `Please update tests/test-config.yaml and replace with actual package name.`
    );
  }

  return packageName;
}

/**
 * Resolve transport request (from test case or default)
 */
export function resolveTransportRequest(testCase?: any): string | undefined {
  let transportRequest: string | undefined;

  if (testCase?.params?.transport_request) {
    transportRequest = String(testCase.params.transport_request).trim();
  } else {
    const config = loadTestConfig();
    const defaultTransport = config.environment?.default_transport;
    transportRequest = defaultTransport ? String(defaultTransport).trim() : undefined;
  }

  // Validate for placeholders (only if value is provided)
  if (transportRequest) {
    const placeholderPattern = /<[A-Z_]+>/i;
    if (placeholderPattern.test(transportRequest)) {
      throw new Error(
        `❌ Transport request contains placeholder value: "${transportRequest}"\n` +
        `Please update tests/test-config.yaml and replace with actual transport request or leave empty.`
      );
    }
  }

  return transportRequest || undefined;
}

/**
 * Get cleanup_after setting from configuration
 * Checks test case specific setting first, then falls back to global environment.cleanup_after
 * @param testCase - Optional test case object (may have params.cleanup_after)
 * @returns true if cleanup should be performed, false otherwise
 */
export function getCleanupAfter(testCase?: any): boolean {
  // Explicit skip flag has highest priority
  if (testCase?.params?.skip_cleanup === true) {
    return false;
  }

  // Check test case specific setting first (overrides global)
  if (testCase?.params?.cleanup_after !== undefined) {
    return testCase.params.cleanup_after === true;
  }

  // Fallback to global environment.cleanup_after
  const config = loadTestConfig();
  const globalCleanupAfter = config.environment?.cleanup_after;

  // Default to true if not specified (backward compatibility)
  return globalCleanupAfter !== false;
}

/**
 * Check if current connection is cloud (JWT auth) or on-premise (basic auth)
 * Programs are not available on cloud, so tests should be skipped
 */
export function isCloudConnection(): boolean {
  try {
    const { isCloudConnection } = require('../../../lib/utils');
    return isCloudConnection();
  } catch {
    return false;
  }
}

/**
 * Pre-check test parameters before running test
 * Verifies package existence and logs transport request if specified
 * @param client - CrudClient instance (optional, if not provided, checks are skipped)
 * @param packageName - Package name to verify (optional)
 * @param transportRequest - Transport request (optional, only logged)
 * @param superPackage - Super package (parent package) to verify (optional, for package tests)
 * @param testLabel - Label for test (for error messages)
 * @returns Object with success flag and optional reason for skipping
 */
export async function preCheckTestParameters(
  client: any,
  packageName?: string,
  transportRequest?: string,
  superPackage?: string,
  testLabel: string = 'test'
): Promise<{ success: boolean; reason?: string }> {
  // Pre-check: Verify super package exists (if specified - for package tests)
  if (superPackage && client) {
    try {
      configLogger?.debug(`[PRE_CHECK] Checking super package (parent) existence: ${superPackage}`);
      const superPackageCheck = await client.checkPackage({
        packageName: superPackage,
        superPackage: undefined
      });
      if (superPackageCheck?.status !== 200) {
        const reason = `Super package (parent) ${superPackage} check returned status ${superPackageCheck?.status}. Parent package must exist before creating child package.`;
        configLogger?.error(`❌ ${reason}`);
        return { success: false, reason };
      } else {
        configLogger?.debug(`[PRE_CHECK] ✓ Super package (parent) ${superPackage} exists and is accessible`);
      }
    } catch (superPackageError: any) {
      const status = superPackageError.response?.status;
      if (status === 404) {
        const reason = `Super package (parent) ${superPackage} does not exist! Please create it before running the ${testLabel}.`;
        configLogger?.error(`❌ ${reason}`);
        return { success: false, reason };
      } else {
        const reason = `Cannot verify super package (parent) ${superPackage} (HTTP ${status}): ${superPackageError.message}`;
        configLogger?.warn(`⚠️  ${reason}`);
        configLogger?.warn(`⚠️  Continuing ${testLabel}, but it may fail if parent package is not accessible.`);
        // Don't fail test, just warn
      }
    }
  }

  // Pre-check: Verify package exists (if specified)
  // Note: For package creation tests, if superPackage is provided, we skip checking packageName
  // because it's expected that the package doesn't exist yet (we're creating it)
  if (packageName && client && !superPackage) {
    // Only check package if we're not creating a child package (no superPackage)
    try {
      configLogger?.debug(`[PRE_CHECK] Checking package existence: ${packageName}`);
      const packageCheck = await client.checkPackage({
        packageName,
        superPackage: undefined
      });
      if (packageCheck?.status !== 200) {
        const reason = `Package ${packageName} check returned status ${packageCheck?.status}. Test may fail.`;
        configLogger?.warn(`⚠️  ${reason}`);
        return { success: false, reason };
      } else {
        configLogger?.debug(`[PRE_CHECK] ✓ Package ${packageName} exists and is accessible`);
      }
    } catch (packageError: any) {
      const status = packageError.response?.status;
      if (status === 404) {
        // For package creation tests, 404 is expected (package doesn't exist yet)
        configLogger?.debug(`[PRE_CHECK] ✓ Package ${packageName} does not exist (expected for creation test)`);
      } else {
        const reason = `Cannot verify package ${packageName} (HTTP ${status}): ${packageError.message}`;
        configLogger?.warn(`⚠️  ${reason}`);
        configLogger?.warn(`⚠️  Continuing ${testLabel}, but it may fail if package is not accessible.`);
        // Don't fail test, just warn
      }
    }
  } else if (packageName && superPackage) {
    // For package creation tests with superPackage, we skip checking packageName
    configLogger?.debug(`[PRE_CHECK] Skipping package ${packageName} check (will be created as child of ${superPackage})`);
  }

  // Pre-check: Log transport request if specified
  if (transportRequest && transportRequest.trim()) {
    configLogger?.debug(`[PRE_CHECK] Transport request specified: ${transportRequest}`);
    // Note: Transport request validation would require additional API call
    // For now, we just log that it's specified
    configLogger?.info(`ℹ️  Transport request specified: ${transportRequest} (not validated - ensure it exists)`);
  }

  return { success: true };
}

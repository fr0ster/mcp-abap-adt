/**
 * Configuration helpers for low-level handler integration tests
 * Loads test configuration from test-config.yaml (shared with adt-clients)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';

let cachedConfig: any = null;

/**
 * Load environment variables from .env file
 * Priority:
 * 1. Check if already loaded (SAP_URL exists)
 * 2. Use MCP_ENV_PATH if set
 * 3. Try current working directory (where test was run from)
 * 4. Fallback to project root (for tests run from project root)
 */
export function loadTestEnv(): void {
  // Check if .env is already loaded (e.g., by src/index.ts)
  if (process.env.SAP_URL) {
    if (process.env.DEBUG_TESTS === 'true') {
      console.log(`[DEBUG] loadTestEnv - .env already loaded (SAP_URL exists), skipping`);
    }
    return;
  }

  // Priority 1: Use MCP_ENV_PATH if explicitly set
  if (process.env.MCP_ENV_PATH) {
    const envPath = path.resolve(process.env.MCP_ENV_PATH);
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath, quiet: true });
      if (result.error) {
        console.warn(`⚠️ Failed to load .env file: ${result.error.message}`);
      } else {
        logEnvLoaded(envPath);
      }
      return;
    }
  }

  // Priority 2: Try current working directory (where test was run from)
  const cwdEnvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(cwdEnvPath)) {
    const result = dotenv.config({ path: cwdEnvPath, quiet: true });
    if (result.error) {
      console.warn(`⚠️ Failed to load .env file: ${result.error.message}`);
    } else {
      logEnvLoaded(cwdEnvPath);
      return;
    }
  }

  // Priority 3: Fallback to project root (for tests run from project root)
  const projectRootEnvPath = path.resolve(__dirname, '../../../../.env');
  if (fs.existsSync(projectRootEnvPath)) {
    const result = dotenv.config({ path: projectRootEnvPath, quiet: true });
    if (result.error) {
      console.warn(`⚠️ Failed to load .env file: ${result.error.message}`);
    } else {
      logEnvLoaded(projectRootEnvPath);
      return;
    }
  }

  // No .env file found
  if (process.env.DEBUG_TESTS === 'true') {
    console.warn(`⚠️ .env file not found. Tried:`, {
      MCP_ENV_PATH: process.env.MCP_ENV_PATH || '(not set)',
      cwd: cwdEnvPath,
      projectRoot: projectRootEnvPath
    });
  }
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
  if (process.env.DEBUG_TESTS === 'true') {
    console.log(`[DEBUG] loadTestEnv - Loaded .env from: ${envPath}`);
    console.log(`[DEBUG] loadTestEnv - Refresh token config:`, {
      hasRefreshToken,
      hasUaaUrl,
      hasUaaClientId,
      hasUaaClientSecret,
      canRefresh: hasRefreshToken && hasUaaUrl && hasUaaClientId && hasUaaClientSecret
    });
  }
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
    console.warn('⚠️ tests/test-config.yaml not found. Using template (all integration tests will be disabled).');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    cachedConfig = yaml.parse(templateContent) || {};
    return cachedConfig;
  }

  console.error('❌ Test configuration files not found.');
  console.error('Please create tests/test-config.yaml with test parameters.');
  return {};
}

/**
 * Get enabled test case for a handler
 * @param handlerName - Handler name (e.g., 'create_class_low', 'lock_class_low')
 * @param testCaseName - Optional: specific test case name
 */
export function getEnabledTestCase(handlerName: string, testCaseName?: string): any {
  const config = loadTestConfig();
  const handlerTests = config[handlerName]?.test_cases || [];

  let enabledTest;
  if (testCaseName) {
    enabledTest = handlerTests.find((tc: any) => tc.name === testCaseName && tc.enabled === true);
  } else {
    enabledTest = handlerTests.find((tc: any) => tc.enabled === true);
  }

  return enabledTest || null;
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
  if (testCase?.params?.package_name) {
    return String(testCase.params.package_name).trim();
  }

  const config = loadTestConfig();
  return (config.environment?.default_package || 'ZOK_LOCAL').trim();
}

/**
 * Resolve transport request (from test case or default)
 */
export function resolveTransportRequest(testCase?: any): string | undefined {
  if (testCase?.params?.transport_request) {
    const value = String(testCase.params.transport_request).trim();
    return value || undefined;
  }

  const config = loadTestConfig();
  const defaultTransport = config.environment?.default_transport;
  return defaultTransport ? String(defaultTransport).trim() : undefined;
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
      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[PRE_CHECK] Checking super package (parent) existence: ${superPackage}`);
      }
      const superPackageCheck = await client.checkPackage({
        packageName: superPackage,
        superPackage: undefined
      });
      if (superPackageCheck?.status !== 200) {
        const reason = `Super package (parent) ${superPackage} check returned status ${superPackageCheck?.status}. Parent package must exist before creating child package.`;
        console.error(`❌ ${reason}`);
        return { success: false, reason };
      } else {
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`[PRE_CHECK] ✓ Super package (parent) ${superPackage} exists and is accessible`);
        }
      }
    } catch (superPackageError: any) {
      const status = superPackageError.response?.status;
      if (status === 404) {
        const reason = `Super package (parent) ${superPackage} does not exist! Please create it before running the ${testLabel}.`;
        console.error(`❌ ${reason}`);
        return { success: false, reason };
      } else {
        const reason = `Cannot verify super package (parent) ${superPackage} (HTTP ${status}): ${superPackageError.message}`;
        console.warn(`⚠️  ${reason}`);
        console.warn(`⚠️  Continuing ${testLabel}, but it may fail if parent package is not accessible.`);
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
      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[PRE_CHECK] Checking package existence: ${packageName}`);
      }
      const packageCheck = await client.checkPackage({
        packageName,
        superPackage: undefined
      });
      if (packageCheck?.status !== 200) {
        const reason = `Package ${packageName} check returned status ${packageCheck?.status}. Test may fail.`;
        console.warn(`⚠️  ${reason}`);
        return { success: false, reason };
      } else {
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`[PRE_CHECK] ✓ Package ${packageName} exists and is accessible`);
        }
      }
    } catch (packageError: any) {
      const status = packageError.response?.status;
      if (status === 404) {
        // For package creation tests, 404 is expected (package doesn't exist yet)
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`[PRE_CHECK] ✓ Package ${packageName} does not exist (expected for creation test)`);
        }
      } else {
        const reason = `Cannot verify package ${packageName} (HTTP ${status}): ${packageError.message}`;
        console.warn(`⚠️  ${reason}`);
        console.warn(`⚠️  Continuing ${testLabel}, but it may fail if package is not accessible.`);
        // Don't fail test, just warn
      }
    }
  } else if (packageName && superPackage) {
    // For package creation tests with superPackage, we skip checking packageName
    if (process.env.DEBUG_TESTS === 'true') {
      console.log(`[PRE_CHECK] Skipping package ${packageName} check (will be created as child of ${superPackage})`);
    }
  }

  // Pre-check: Log transport request if specified
  if (transportRequest && transportRequest.trim()) {
    if (process.env.DEBUG_TESTS === 'true') {
      console.log(`[PRE_CHECK] Transport request specified: ${transportRequest}`);
    }
    // Note: Transport request validation would require additional API call
    // For now, we just log that it's specified
    console.log(`ℹ️  Transport request specified: ${transportRequest} (not validated - ensure it exists)`);
  }

  return { success: true };
}


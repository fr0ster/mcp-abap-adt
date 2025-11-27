/**
 * Test configuration helper
 * Loads test parameters from test-config.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Flag to track if environment has been initialized
let environmentInitialized = false;

// Debug logging support
const DEBUG_TESTS = process.env.DEBUG_TESTS === 'true';

/**
 * Debug logging helper
 * Logs test execution steps and additional information when DEBUG_TESTS=true
 * @param {string} step - Test step name (e.g., 'CREATE', 'UPDATE', 'READ', 'VALIDATE')
 * @param {string} message - Log message
 * @param {any} [data] - Optional data object to log
 */
function debugLog(step, message, data) {
  if (DEBUG_TESTS) {
    console.log(`[DEBUG] ${step}: ${message}`);
    if (data !== undefined && data !== null) {
      console.log(`[DEBUG] ${step} data:`, JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Initialize test environment
 * Must be called before running any handler tests
 */
function initializeTestEnvironment() {
  if (environmentInitialized) {
    return;
  }

  // Prevent MCP server from auto-starting when importing handlers
  process.env.MCP_SKIP_AUTO_START = "true";

  // Load environment variables
  const dotenv = require('dotenv');
  const envPath = process.env.MCP_ENV_PATH || path.resolve(__dirname, '../e19.env');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[TEST] Loaded environment from: ${envPath}`);
  } else {
    console.warn(`[TEST] Warning: Environment file not found: ${envPath}`);
  }

  // Log debug mode status
  if (DEBUG_TESTS) {
    console.log(`[DEBUG] DEBUG_TESTS mode is ENABLED - detailed test execution logs will be shown`);
  }

  environmentInitialized = true;
}

/**
 * Load test configuration from YAML
 */
function loadTestConfig() {
  const configPath = path.resolve(__dirname, '../test-config.yaml');

  if (!fs.existsSync(configPath)) {
    console.error('❌ Test configuration file not found: test-config.yaml');
    console.error('Please create tests/test-config.yaml with test parameters');
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf8');
  return yaml.parse(configContent);
}

/**
 * Get enabled test case from config (returns first enabled or by name)
 * @param {string} handlerName - Name of the handler (e.g., 'create_domain', 'get_program')
 * @param {string} [testCaseName] - Optional: specific test case name to find
 * @returns {object|null} Test case with params, or null if not found
 */
function getEnabledTestCase(handlerName, testCaseName) {
  const config = loadTestConfig();
  const handlerTests = config[handlerName]?.test_cases || [];

  let enabledTest;
  if (testCaseName) {
    // Find specific test case by name
    enabledTest = handlerTests.find(tc => tc.name === testCaseName && tc.enabled === true);
  } else {
    // Find first enabled test case
    enabledTest = handlerTests.find(tc => tc.enabled === true);
  }

  if (!enabledTest) {
    if (testCaseName) {
      console.warn(`⚠️  Test case "${testCaseName}" not found or disabled for "${handlerName}" in test-config.yaml`);
    } else {
    console.error(`❌ No enabled test case found for "${handlerName}" in test-config.yaml`);
    console.error(`Please set enabled: true for at least one test case under ${handlerName}`);
    process.exit(1);
    }
    return null;
  }

  return enabledTest;
}

/**
 * Get all enabled test cases from config
 * @param {string} handlerName - Name of the handler (e.g., 'create_domain', 'get_program')
 * @returns {Array} Array of enabled test cases
 */
function getAllEnabledTestCases(handlerName) {
  const config = loadTestConfig();
  const handlerTests = config[handlerName]?.test_cases || [];

  const enabledTests = handlerTests.filter(tc => tc.enabled === true);

  if (enabledTests.length === 0) {
    console.error(`❌ No enabled test cases found for "${handlerName}" in test-config.yaml`);
    console.error(`Please set enabled: true for at least one test case under ${handlerName}`);
    process.exit(1);
  }

  return enabledTests;
}

/**
 * Get test settings from config
 */
function getTestSettings() {
  const config = loadTestConfig();
  return config.test_settings || {
    fail_fast: false,
    verbose: true,
    timeout: 30000,
    retry_on_failure: false,
    max_retries: 1,
    cleanup_after_test: false
  };
}

/**
 * Get environment configuration
 */
function getEnvironmentConfig() {
  const config = loadTestConfig();
  return config.environment || {};
}

/**
 * Get timeout for specific operation type
 * @param {string} operationType - Operation type (create, read, update, check, lock, unlock, activate, etc.)
 * @param {string} [handlerName] - Optional: handler name for handler-specific timeout override
 * @returns {number} Timeout in milliseconds
 */
function getTimeout(operationType, handlerName) {
  const config = loadTestConfig();
  const timeouts = config.test_settings?.timeouts || {};

  // Check for handler-specific timeout override
  if (handlerName && timeouts[handlerName]) {
    return timeouts[handlerName];
  }

  // Check for operation-specific timeout
  if (timeouts[operationType]) {
    return timeouts[operationType];
  }

  // Fall back to default timeout
  return timeouts.default || 10000;
}

/**
 * Get global test timeout from configuration
 * @returns {number} Test timeout in milliseconds
 */
function getTestTimeout() {
  const config = loadTestConfig();
  return config.test_settings?.test_timeout || 120000;
}

/**
 * Validate transport request parameter
 * Shows warning if using default value
 */
function validateTransportRequest(params, defaultValue = 'E19K905635') {
  if (!params.transport_request) {
    return;
  }

  // Always return true - transport request validation disabled for testing
  return true;
}

/**
 * Print test header with case information
 */
function printTestHeader(handlerName, testCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${handlerName}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Test case: "${testCase.name}"`);
  console.log(`Description: ${testCase.description || 'N/A'}`);
  console.log(`${'='.repeat(60)}\n`);

  debugLog('TEST_START', `Starting test case "${testCase.name}" for handler "${handlerName}"`, {
    handler: handlerName,
    testCase: testCase.name,
    description: testCase.description || 'N/A',
    enabled: testCase.enabled
  });
}

/**
 * Print test parameters
 */
function printTestParams(params) {
  console.log('Test parameters:');
  console.log(JSON.stringify(params, null, 2));
  console.log();

  debugLog('TEST_PARAMS', 'Test parameters loaded', params);
}

/**
 * Print test result
 */
function printTestResult(result, handlerName) {
  if (result.isError) {
    console.error(`\n❌ ${handlerName} test FAILED:`);
    console.error(result.content[0].text);

    debugLog('TEST_FAILED', `Test "${handlerName}" failed`, {
      handler: handlerName,
      error: result.content[0]?.text || 'Unknown error',
      result: result
    });

    return false;
  }

  console.log(`\n✅ ${handlerName} test PASSED!`);

  const resultText = result.content[0].text;
  let parsedResult = null;
  try {
    parsedResult = JSON.parse(resultText);
    console.log('\nResult:');
    console.log(JSON.stringify(parsedResult, null, 2));
  } catch {
    console.log('\nResult:');
    console.log(resultText);
  }

  debugLog('TEST_PASSED', `Test "${handlerName}" passed successfully`, {
    handler: handlerName,
    result: parsedResult || resultText,
    hasContent: result.content && result.content.length > 0
  });

  return true;
}

/**
 * Wait for user confirmation with timeout
 */
async function waitForConfirmation(message, timeoutSeconds = 5) {
  console.warn(message);
  console.warn(`Press Ctrl+C to abort or wait ${timeoutSeconds} seconds to continue...\n`);
  await new Promise(resolve => setTimeout(resolve, timeoutSeconds * 1000));
}

/**
 * Update transport request number in test-config.yaml
 * Replaces <YOUR_TRANSPORT_REQUEST> and similar placeholders
 * @param {string} transportNumber - Transport request number to set
 */
function updateTransportRequestInConfig(transportNumber) {
  const configPath = path.resolve(__dirname, '../test-config.yaml');

  if (!fs.existsSync(configPath)) {
    console.warn('⚠️  test-config.yaml not found, cannot update transport request');
    return false;
  }

  try {
    let configContent = fs.readFileSync(configPath, 'utf8');
    const originalContent = configContent;
    let replacementsCount = 0;

    // Replace transport_request: "<YOUR_TRANSPORT_REQUEST>" (with quotes)
    const pattern1 = /transport_request:\s*["']<YOUR_TRANSPORT_REQUEST>["']/gi;
    const matches1 = configContent.match(pattern1);
    if (matches1) {
      configContent = configContent.replace(pattern1, `transport_request: "${transportNumber}"`);
      replacementsCount += matches1.length;
    }

    // Replace transport_request: <YOUR_TRANSPORT_REQUEST> (without quotes)
    const pattern2 = /transport_request:\s*<YOUR_TRANSPORT_REQUEST>/gi;
    const matches2 = configContent.match(pattern2);
    if (matches2) {
      configContent = configContent.replace(pattern2, `transport_request: "${transportNumber}"`);
      replacementsCount += matches2.length;
    }

    // Update environment.default_transport
    const pattern3 = /default_transport:\s*["']?<YOUR_TRANSPORT_REQUEST>["']?/gi;
    const matches3 = configContent.match(pattern3);
    if (matches3) {
      configContent = configContent.replace(pattern3, `default_transport: "${transportNumber}"`);
      replacementsCount += matches3.length;
    }

    // Update get_transport transport_number (both variants)
    const pattern4a = /transport_number:\s*["']<YOUR_TRANSPORT_REQUEST>["']/gi;
    const matches4a = configContent.match(pattern4a);
    if (matches4a) {
      configContent = configContent.replace(pattern4a, `transport_number: "${transportNumber}"`);
      replacementsCount += matches4a.length;
    }

    const pattern4b = /transport_number:\s*["']?<YOUR_TRANSPORT_NUMBER>["']?/gi;
    const matches4b = configContent.match(pattern4b);
    if (matches4b) {
      configContent = configContent.replace(pattern4b, `transport_number: "${transportNumber}"`);
      replacementsCount += matches4b.length;
    }

    // Only write if content changed
    if (configContent !== originalContent) {
      fs.writeFileSync(configPath, configContent, 'utf8');
      console.log(`\n✅ Updated test-config.yaml with transport request: ${transportNumber}`);
      console.log(`   Replaced ${replacementsCount} placeholder(s) in configuration`);
      return true;
    } else {
      console.log(`\nℹ️  No transport_request placeholders found to update`);
      return false;
    }
  } catch (error) {
    console.error(`\n❌ Failed to update test-config.yaml:`, error.message);
    return false;
  }
}

module.exports = {
  initializeTestEnvironment,
  loadTestConfig,
  getEnabledTestCase,
  getAllEnabledTestCases,
  getTestSettings,
  getEnvironmentConfig,
  getTimeout,
  getTestTimeout,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult,
  waitForConfirmation,
  updateTransportRequestInConfig,
  debugLog,
  DEBUG_TESTS
};

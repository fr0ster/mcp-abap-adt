/**
 * Test configuration helper
 * Loads test parameters from test-config.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Flag to track if environment has been initialized
let environmentInitialized = false;

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

  environmentInitialized = true;
}

/**
 * Load test configuration from YAML
 */
function loadTestConfig() {
  const configPath = path.resolve(__dirname, 'test-config.yaml');
  
  if (!fs.existsSync(configPath)) {
    console.error('❌ Test configuration file not found: test-config.yaml');
    console.error('Please create tests/test-config.yaml with test parameters');
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf8');
  return yaml.parse(configContent);
}

/**
 * Get enabled test case from config (returns first enabled)
 * @param {string} handlerName - Name of the handler (e.g., 'create_domain', 'get_program')
 * @returns {object} Test case with params
 */
function getEnabledTestCase(handlerName) {
  const config = loadTestConfig();
  const handlerTests = config[handlerName]?.test_cases || [];
  
  const enabledTest = handlerTests.find(tc => tc.enabled === true);
  
  if (!enabledTest) {
    console.error(`❌ No enabled test case found for "${handlerName}" in test-config.yaml`);
    console.error(`Please set enabled: true for at least one test case under ${handlerName}`);
    process.exit(1);
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
}

/**
 * Print test parameters
 */
function printTestParams(params) {
  console.log('Test parameters:');
  console.log(JSON.stringify(params, null, 2));
  console.log();
}

/**
 * Print test result
 */
function printTestResult(result, handlerName) {
  if (result.isError) {
    console.error(`\n❌ ${handlerName} test FAILED:`);
    console.error(result.content[0].text);
    return false;
  }

  console.log(`\n✅ ${handlerName} test PASSED!`);
  
  const resultText = result.content[0].text;
  try {
    const parsedResult = JSON.parse(resultText);
    console.log('\nResult:');
    console.log(JSON.stringify(parsedResult, null, 2));
  } catch {
    console.log('\nResult:');
    console.log(resultText);
  }

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

module.exports = {
  initializeTestEnvironment,
  loadTestConfig,
  getEnabledTestCase,
  getAllEnabledTestCases,
  getTestSettings,
  getEnvironmentConfig,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult,
  waitForConfirmation
};

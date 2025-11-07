/**
 * Test script for CreateDomain MCP tool
 * Tests the complete flow: lock, create, check, unlock, activate, verify
 * 
 * Configuration is loaded from tests/test-config.yaml
 * Update transport_request in the YAML before running tests!
 */

const {
  initializeTestEnvironment,
  getEnabledTestCase,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult,
  waitForConfirmation
} = require('./test-helper');

// Initialize test environment before importing handlers
initializeTestEnvironment();

const { handleCreateDomain } = require('../dist/handlers/handleCreateDomain');

async function testCreateDomain() {
  // Load test case from YAML
  const testCase = getEnabledTestCase('create_domain');
  
  printTestHeader('CreateDomain', testCase);

  // Test parameters from YAML
  const testArgs = testCase.params;

  // Validate transport request
  if (!validateTransportRequest(testArgs)) {
    await waitForConfirmation(
      '⚠️  Using default transport request! Update test-config.yaml with a valid request.',
      5
    );
  }

  printTestParams(testArgs);
  console.log('--- Starting domain creation flow ---\n');

  try {
    const result = await handleCreateDomain(testArgs);
    
    if (!printTestResult(result, 'CreateDomain')) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Unexpected error during domain creation:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testCreateDomain()
  .then(() => {
    console.log('\n=== Test completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Test failed ===');
    console.error(error);
    process.exit(1);
  });

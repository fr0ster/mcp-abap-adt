/**
 * Test script for CreateDomain MCP tool
 * Tests the complete flow: lock, create, check, unlock, activate, verify
 * 
 * Configuration is loaded from tests/test-config.yaml
 * Update transport_request in the YAML before running tests!
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult,
  waitForConfirmation
} = require('./test-helper');

// Initialize test environment before importing handlers
initializeTestEnvironment();

const { handleCreateDomain } = require('../dist/handlers/domain/high/handleCreateDomain');

async function testCreateDomain() {
  // Load all enabled test cases from YAML
  const testCases = getAllEnabledTestCases('create_domain');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
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
      
      if (printTestResult(result, 'CreateDomain')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during domain creation:');
      console.error(error);
      failedTests++;
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  // Print summary
  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total:  ${testCases.length}`);
  
  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run the test
testCreateDomain()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

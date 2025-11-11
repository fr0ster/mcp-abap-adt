/**
 * Test script for GetDomain MCP tool
 * Tests reading domain information from SAP system
 *
 * Configuration is loaded from tests/test-config.yaml
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  printTestHeader,
  printTestParams,
  printTestResult
} = require('./test-helper');

// Initialize test environment before importing handlers
initializeTestEnvironment();

const { handleGetDomain } = require('../dist/handlers/handleGetDomain');

async function testGetDomain() {
  // Load all enabled test cases from YAML
  const testCases = getAllEnabledTestCases('get_domain');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('GetDomain', testCase);

    // Test parameters from YAML
    const testArgs = testCase.params;

    printTestParams(testArgs);
    console.log('--- Starting domain retrieval ---\n');

    try {
      const result = await handleGetDomain(testArgs);

      if (printTestResult(result, 'GetDomain')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during domain retrieval:');
      console.error(error);
      failedTests++;
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // Print summary
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total:  ${testCases.length}`);

  if (failedTests === 0) {
    console.log('\n=== All tests completed successfully ===\n');
    process.exit(0);
  } else {
    console.log('\n=== Some tests failed ===\n');
    process.exit(1);
  }
}

// Run tests
testGetDomain().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

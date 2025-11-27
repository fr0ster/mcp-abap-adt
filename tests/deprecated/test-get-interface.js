/**
 * Test script for GetInterface MCP tool
 * Tests reading interface information from SAP system
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

const { handleGetInterface } = require('../../dist/handlers/interface/readonly/handleGetInterface');

async function testGetInterface() {
  // Load all enabled test cases from YAML
  const testCases = getAllEnabledTestCases('get_interface');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('GetInterface', testCase);

    printTestParams(testCase.params);

    try {
      console.log('\n--- Retrieving interface ---\n');

      const result = await handleGetInterface(testCase.params);

      if (result.isError) {
        throw new Error(result.content[0]?.text || 'Unknown error');
      }

      printTestResult(result, true);
      passedTests++;
    } catch (error) {
      console.error(`\n❌ GetInterface test FAILED:`);
      console.error(error.message || error);
      failedTests++;
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total:  ${testCases.length}\n`);

  if (failedTests === 0) {
    console.log('=== All tests completed successfully ===\n');
    process.exit(0);
  } else {
    console.log('=== Some tests failed ===\n');
    process.exit(1);
  }
}

testGetInterface().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

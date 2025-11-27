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
  printTestResult,
  debugLog
} = require('./test-helper');

// Initialize test environment before importing handlers
initializeTestEnvironment();

const { handleGetDomain } = require('../../dist/handlers/domain/readonly/handleGetDomain');

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
      debugLog('HANDLER_CALL', `Calling handleGetDomain with params`, testArgs);

      const result = await handleGetDomain(testArgs);

      debugLog('HANDLER_RESULT', `Received result from handleGetDomain`, {
        isError: result.isError,
        hasContent: result.content && result.content.length > 0,
        contentType: result.content?.[0]?.type || 'unknown'
      });

      if (printTestResult(result, 'GetDomain')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during domain retrieval:');
      console.error(error);

      debugLog('HANDLER_ERROR', `Error during handleGetDomain execution`, {
        error: error.message || String(error),
        stack: error.stack
      });

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

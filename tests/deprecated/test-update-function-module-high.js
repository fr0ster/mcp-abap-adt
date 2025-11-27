/**
 * Test script for UpdateFunctionModule (high-level) tool
 * Tests updating source code of existing Function Modules
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  printTestHeader,
  printTestParams,
  printTestResult
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleUpdateFunctionModule } = require('../../dist/handlers/function/high/handleUpdateFunctionModule');

async function testUpdateFunctionModuleHigh() {
  const testCases = getAllEnabledTestCases('update_function_module_high');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('UpdateFunctionModule', testCase);
    const params = testCase.params;

    printTestParams(params);
    console.log('--- Starting function module update workflow ---\n');

    try {
      const result = await handleUpdateFunctionModule(params);

      if (printTestResult(result, 'UpdateFunctionModule')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during function module update:');
      console.error(error);
      failedTests++;
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total:  ${testCases.length}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run the test
testUpdateFunctionModuleHigh()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

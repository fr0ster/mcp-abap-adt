/**
 * Test GetFunction handler
 * Tests retrieving function module source code
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

const { handleGetFunction } = require('../dist/handlers/handleGetFunction');

async function testGetFunction() {
  // Try get_function_test first, fallback to get_function
  let testCases = getAllEnabledTestCases('get_function_test');
  if (testCases.length === 0) {
    testCases = getAllEnabledTestCases('get_function');
  }

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('GetFunction', testCase);
    const params = testCase.params;

    // Map function_module_name to function_name and function_group_name to function_group
    if (params.function_module_name && !params.function_name) {
      params.function_name = params.function_module_name;
    }
    if (params.function_group_name && !params.function_group) {
      params.function_group = params.function_group_name;
    }

    printTestParams(params);
    console.log('--- Retrieving function module ---\n');

    try {
      const result = await handleGetFunction(params);

      if (printTestResult(result, 'GetFunction')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error:');
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
testGetFunction()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

/**
 * Test script for CreateFunctionModule tool
 * Tests creation of Function Modules within Function Groups
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

const { handleCreateFunctionModule } = require('../dist/handlers/function/high/handleCreateFunctionModule');

async function testCreateFunctionModule() {
  const testCases = getAllEnabledTestCases('create_function_module');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('CreateFunctionModule', testCase);
    const params = testCase.params;

    // Map function_name to function_module_name and function_group to function_group_name
    if (params.function_name && !params.function_module_name) {
      params.function_module_name = params.function_name;
    }
    if (params.function_group && !params.function_group_name) {
      params.function_group_name = params.function_group;
    }

    printTestParams(params);
    console.log('--- Starting function module creation flow ---\n');

    try {
      const result = await handleCreateFunctionModule(params);

      if (printTestResult(result, 'CreateFunctionModule')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during function module creation:');
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
testCreateFunctionModule()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

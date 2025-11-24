/**
 * Test CreateFunctionGroup handler
 *
 * Tests function group creation via ADT API.
 * Configuration is loaded from tests/test-config.yaml
 *
 * Prerequisites:
 * - Transport request configured in test-config.yaml
 * - Package must exist (use $TMP for local)
 *
 * Usage:
 * node tests/test-create-function-group.js
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

const { handleCreateFunctionGroup } = require('../dist/handlers/function/high/handleCreateFunctionGroup');

/**
 * Main test runner
 */
async function testCreateFunctionGroup() {
  // Load all enabled test cases from YAML
  const testCases = getAllEnabledTestCases('create_function_group');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('CreateFunctionGroup', testCase);

    const params = testCase.params;

    // Map function_group to function_group_name for handler
    if (params.function_group && !params.function_group_name) {
      params.function_group_name = params.function_group;
    }

    printTestParams(params);
    console.log('--- Starting function group creation flow ---\n');

    try {
      const result = await handleCreateFunctionGroup(params);

      if (printTestResult(result, 'CreateFunctionGroup')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during function group creation:');
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

testCreateFunctionGroup()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

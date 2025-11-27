/**
 * Test GetIncludesList handler
 * Tests retrieving list of includes for an object
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

const { handleGetIncludesList } = require('../../dist/handlers/include/readonly/handleGetIncludesList');

async function testGetIncludesList() {
  const testCases = getAllEnabledTestCases('get_includes_list');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('GetIncludesList', testCase);
    const params = testCase.params;

    printTestParams(params);
    console.log('--- Retrieving includes list ---\n');

    try {
      const result = await handleGetIncludesList(params);

      if (printTestResult(result, 'GetIncludesList')) {
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

// Run tests
testGetIncludesList()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

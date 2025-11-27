/**
 * Test GetProgFullCode handler
 * Tests retrieving full program/function group code with all includes
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

const { handleGetProgFullCode } = require('../../dist/handlers/program/readonly/handleGetProgFullCode');

async function testGetProgFullCode() {
  const testCases = getAllEnabledTestCases('get_prog_full_code');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('GetProgFullCode', testCase);
    const params = testCase.params;

    printTestParams(params);
    console.log('--- Retrieving full code ---\n');

    try {
      const result = await handleGetProgFullCode(params);

      if (printTestResult(result, 'GetProgFullCode')) {
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
testGetProgFullCode()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

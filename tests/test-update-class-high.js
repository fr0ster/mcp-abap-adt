/**
 * Test script for UpdateClass (high-level) tool
 * Tests updating source code of existing ABAP classes
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

const { handleUpdateClass } = require('../dist/handlers/class/high/handleUpdateClass');

async function testUpdateClassHigh() {
  const testCases = getAllEnabledTestCases('update_class_high');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('UpdateClass', testCase);
    const params = testCase.params;

    printTestParams(params);
    console.log('--- Starting class update workflow ---\n');

    try {
      const result = await handleUpdateClass(params);

      if (printTestResult(result, 'UpdateClass')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during class update:');
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
testUpdateClassHigh()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

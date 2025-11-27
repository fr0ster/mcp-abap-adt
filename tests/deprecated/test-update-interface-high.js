/**
 * Test UpdateInterface (high-level) - Update existing ABAP Interface
 *
 * Tests interface update via ADT API with stateful session:
 * 1. Lock interface
 * 2. Upload new source code
 * 3. Unlock interface
 * 4. Activate interface (optional)
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

const { handleUpdateInterface } = require('../../dist/handlers/interface/high/handleUpdateInterface');

async function testUpdateInterfaceHigh() {
  const testCases = getAllEnabledTestCases('update_interface_high');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('UpdateInterface', testCase);
    const params = testCase.params;

    printTestParams(params);
    console.log('--- Starting interface update workflow ---\n');

    try {
      const result = await handleUpdateInterface(params);

      if (printTestResult(result, 'UpdateInterface')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during interface update:');
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

testUpdateInterfaceHigh()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

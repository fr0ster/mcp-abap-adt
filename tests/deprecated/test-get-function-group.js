/**
 * Test GetFunctionGroup handler
 * Tests retrieving function group source code
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

const { handleGetFunctionGroup } = require('../../dist/handlers/function/readonly/handleGetFunctionGroup');

async function testGetFunctionGroup() {
  const testCases = getAllEnabledTestCases('get_function_group');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('GetFunctionGroup', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Retrieving function group ---\n');
    
    try {
      const result = await handleGetFunctionGroup(params);
      
      if (printTestResult(result, 'GetFunctionGroup')) {
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
testGetFunctionGroup()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

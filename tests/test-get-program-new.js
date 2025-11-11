/**
 * Test GetProgram handler
 * Tests retrieving program source code
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

const { handleGetProgram } = require('../dist/handlers/handleGetProgram');

async function testGetProgram() {
  const testCases = getAllEnabledTestCases('get_program');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('GetProgram', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Retrieving program ---\n');
    
    try {
      const result = await handleGetProgram(params);
      
      if (printTestResult(result, 'GetProgram')) {
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
testGetProgram()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

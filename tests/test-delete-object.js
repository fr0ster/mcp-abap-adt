/**
 * Test DeleteObject handler
 * 
 * Tests object deletion via ADT API.
 * Configuration is loaded from tests/test-config.yaml
 * 
 * Prerequisites:
 * - Test objects to delete (will be created in test)
 * - Transport request configured in test-config.yaml
 * 
 * Usage:
 * node tests/test-delete-object.js
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

const { handleDeleteObject } = require('../dist/handlers/handleDeleteObject');



/**
 * Main test runner
 */
async function runTests() {
  const testCases = getAllEnabledTestCases('delete_object');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('DeleteObject', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Starting object deletion flow ---\n');
    
    try {
      const result = await handleDeleteObject(params);
      
      if (printTestResult(result, 'DeleteObject')) {
        passedTests++;
      } else {
        failedTests++;
      }
      
    } catch (error) {
      console.error('❌ Unexpected error during object deletion:');
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
runTests()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

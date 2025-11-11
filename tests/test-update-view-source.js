/**
 * Test script for UpdateViewSource tool
 * Tests updating DDL source code of existing CDS/Classic Views
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

const { handleUpdateViewSource } = require('../dist/handlers/handleUpdateViewSource');

async function testUpdateViewSource() {
  const testCases = getAllEnabledTestCases('update_view_source');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('UpdateViewSource', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Starting view source update flow ---\n');
    
    try {
      const result = await handleUpdateViewSource(params);
      
      if (printTestResult(result, 'UpdateViewSource')) {
        passedTests++;
      } else {
        failedTests++;
      }
      
    } catch (error) {
      console.error('❌ Unexpected error during view source update:');
      console.error(error);
      failedTests++;
    }
    
    console.log('\n' + '='.repeat(60) + '\\n');
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
testUpdateViewSource()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

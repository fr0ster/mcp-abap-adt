/**
 * Test script for UpdateClassSource tool
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

const { handleUpdateClassSource } = require('../dist/handlers/class/high/handleUpdateClassSource');

async function testUpdateClassSource() {
  const testCases = getAllEnabledTestCases('update_class_source');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('UpdateClassSource', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Starting class source update flow ---\n');

    try {
      const result = await handleUpdateClassSource(params);
      
      if (printTestResult(result, 'UpdateClassSource')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during class source update:');
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

testUpdateClassSource()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

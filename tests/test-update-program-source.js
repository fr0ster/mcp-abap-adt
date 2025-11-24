/**
 * Test script for UpdateProgramSource tool
 * Tests updating source code of existing ABAP programs
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

const { handleUpdateProgramSource } = require('../dist/handlers/program/high/handleUpdateProgramSource');

async function testUpdateProgramSource() {
  const testCases = getAllEnabledTestCases('update_program_source');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('UpdateProgramSource', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Starting program source update flow ---\n');

    try {
      const result = await handleUpdateProgramSource(params);
      
      if (printTestResult(result, 'UpdateProgramSource')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during program source update:');
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

testUpdateProgramSource()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

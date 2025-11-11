/**
 * Test script for CreateTable handler
 * Tests database table creation with comprehensive validation
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

const { handleCreateTable } = require('../dist/handlers/handleCreateTable');

async function testCreateTable() {
  const testCases = getAllEnabledTestCases('create_table');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('CreateTable', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Starting table creation flow ---\n');
    
    try {
      const result = await handleCreateTable(params);
      
      if (printTestResult(result, 'CreateTable')) {
        passedTests++;
      } else {
        failedTests++;
      }
      
    } catch (error) {
      console.error('❌ Unexpected error during table creation:');
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
testCreateTable()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });
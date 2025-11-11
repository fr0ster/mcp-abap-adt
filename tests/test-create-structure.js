/**
 * Test CreateStructure functionality
 * 
 * This test demonstrates creating a new ABAP structure with fields and type references
 * using the MCP ABAP ADT server's CreateStructure handler.
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

const { handleCreateStructure } = require('../dist/handlers/handleCreateStructure');

async function testCreateStructure() {
  const testCases = getAllEnabledTestCases('create_structure');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('CreateStructure', testCase);
    const params = testCase.params;
    
    printTestParams(params);
    console.log('--- Starting structure creation flow ---\n');
    
    try {
      const result = await handleCreateStructure(params);
      
      if (printTestResult(result, 'CreateStructure')) {
        passedTests++;
      } else {
        failedTests++;
      }
      
    } catch (error) {
      console.error('❌ Unexpected error during structure creation:');
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
testCreateStructure()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });
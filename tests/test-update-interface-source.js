/**
 * Test UpdateInterfaceSource - Update existing ABAP Interface
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

const { handleUpdateInterfaceSource } = require('../dist/handlers/handleUpdateInterfaceSource');

async function testUpdateInterfaceSource() {
  const testCases = getAllEnabledTestCases('update_interface_source');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('UpdateInterfaceSource', testCase);
    const params = testCase.params;

    printTestParams(params);
    console.log('--- Starting interface source update flow ---\n');

    try {
      const result = await handleUpdateInterfaceSource(params);
      
      if (printTestResult(result, 'UpdateInterfaceSource')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during interface source update:');
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

testUpdateInterfaceSource()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

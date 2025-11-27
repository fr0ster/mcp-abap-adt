/**
 * Test script for CreateClass tool
 * Tests creation of ABAP classes with full OO features
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult,
  waitForConfirmation
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateClass } = require('../../dist/handlers/class/high/handleCreateClass');

async function testCreateClass() {
  // Load all enabled test cases from YAML
  const testCases = getAllEnabledTestCases('create_class');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('CreateClass', testCase);

    // Test parameters from YAML
    const params = testCase.params;

    // Validate transport request
    if (!validateTransportRequest(params)) {
      await waitForConfirmation(
        '⚠️  Using default transport request! Update test-config.yaml with a valid request.',
        5
      );
    }
    
    printTestParams(params);
    console.log('--- Starting class creation flow ---\n');

    try {
      const result = await handleCreateClass(params);
      
      if (printTestResult(result, 'CreateClass')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during class creation:');
      console.error(error);
      failedTests++;
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  // Print summary
  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total:  ${testCases.length}`);
  
  if (failedTests > 0) {
    process.exit(1);
  }
}

testCreateClass()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

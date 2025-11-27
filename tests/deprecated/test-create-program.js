/**
 * Test script for CreateProgram tool
 * Tests creation of ABAP programs (reports, includes, module pools)
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

const { handleCreateProgram } = require('../../dist/handlers/program/high/handleCreateProgram');

async function testCreateProgram() {
  // Load all enabled test cases from YAML
  const testCases = getAllEnabledTestCases('create_program');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('CreateProgram', testCase);

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
    console.log('--- Starting program creation flow ---\n');

    try {
      const result = await handleCreateProgram(params);
      
      if (printTestResult(result, 'CreateProgram')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during program creation:');
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

testCreateProgram()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

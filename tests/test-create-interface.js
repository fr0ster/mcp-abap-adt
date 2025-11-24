/**
 * Test CreateInterface - ABAP Interface Creation
 * 
 * Tests interface creation via ADT API with stateful session:
 * 1. Create interface object with metadata
 * 2. Lock interface
 * 3. Upload interface source code
 * 4. Unlock interface
 * 5. Activate interface (optional)
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

const { handleCreateInterface } = require('../dist/handlers/interface/high/handleCreateInterface');

async function testCreateInterface() {
  const testCases = getAllEnabledTestCases('create_interface');
  
  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    printTestHeader('CreateInterface', testCase);
    const params = testCase.params;

    if (!validateTransportRequest(params)) {
      await waitForConfirmation(
        '⚠️  Using default transport request! Update test-config.yaml with a valid request.',
        5
      );
    }
    
    printTestParams(params);
    console.log('--- Starting interface creation flow ---\n');

    try {
      const result = await handleCreateInterface(params);
      
      if (printTestResult(result, 'CreateInterface')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during interface creation:');
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

testCreateInterface()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

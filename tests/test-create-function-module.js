/**
 * Test: CreateFunctionModule
 * 
 * Tests the creation of ABAP function modules within function groups.
 * Based on Eclipse ADT workflow: LOCK → PUT source → UNLOCK → ACTIVATE
 */

const {
  initializeTestEnvironment,
  loadTestConfig,
  validateTransportRequest,
  printTestHeader
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateFunctionModule } = require('../dist/handlers/handleCreateFunctionModule');

// Load test configuration
const config = loadTestConfig();
const createFmConfig = config.create_function_module || {};

if (!createFmConfig.function_group_name || !createFmConfig.transport || !createFmConfig.test_cases) {
  console.error('❌ Missing create_function_module configuration in test-config.yaml');
  console.log('\n📝 Required structure:');
  console.log(`
create_function_module:
  function_group_name: "ZOK_FG_MCP01"
  transport: "E19K905635"
  test_cases:
    - function_module_name: "Z_TEST_FM_MCP01"
      source_code: |
        FUNCTION Z_TEST_FM_MCP01
          ...
        ENDFUNCTION.
`);
  process.exit(1);
}

// Test parameters from config - NO FALLBACKS, ONLY YAML
const FUNCTION_GROUP = createFmConfig.function_group_name;
const TRANSPORT = createFmConfig.transport;
const TEST_CASES = createFmConfig.test_cases;

if (!TEST_CASES || TEST_CASES.length < 3) {
  console.error('❌ Need at least 3 test cases in create_function_module.test_cases');
  process.exit(1);
}

async function runTests() {
  console.log('🚀 Starting CreateFunctionModule Tests');
  console.log('============================================================\n');
  console.log(`Function Group: ${FUNCTION_GROUP}`);
  console.log(`Transport: ${TRANSPORT}`);
  console.log(`Test Cases: ${TEST_CASES.length}\n`);
  
  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`  ${i + 1}. ${tc.function_module_name}: ${tc.description || tc.name}`);
  }
  console.log('\n');

  let passedTests = 0;
  let totalTests = TEST_CASES.length;

  const { handleCreateFunctionModule } = require('../dist/handlers/handleCreateFunctionModule');

  // Test each case from YAML
  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    const testNum = i + 1;
    
    console.log(`📋 Test ${testNum}: ${testCase.name || `Create ${testCase.function_module_name}`}`);
    console.log('============================================================');
    
    try {
      const result = await handleCreateFunctionModule({
        function_group_name: FUNCTION_GROUP,
        function_module_name: testCase.function_module_name,
        source_code: testCase.source_code,
        description: testCase.description || testCase.function_module_name,
        transport_request: TRANSPORT,
        activate: true
      });

      if (result.isError) {
        console.error(`❌ Test failed: ${result.content[0].text}\n`);
      } else {
        const data = typeof result.content[0].text === 'string' 
          ? JSON.parse(result.content[0].text) 
          : result.content[0].text;
        
        if (data.success) {
          console.log('✅ Function module created successfully');
          console.log(`   Name: ${data.function_module_name}`);
          console.log(`   Activated: ${data.activated}\n`);
          passedTests++;
        } else {
          console.error('❌ Test failed: Invalid response structure\n');
        }
      }
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}\n`);
    }
  }

  // Summary
  console.log('============================================================');
  console.log('📊 Test Summary');
  console.log('============================================================');
  console.log(`Tests passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('✅ All tests passed!');
  } else {
    console.log(`❌ ${totalTests - passedTests} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

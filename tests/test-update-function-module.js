/**
 * Test UpdateFunctionModule (high-level) Handler
 *
 * Prerequisites:
 * 1. Function group ZOK_FG_MCP01 must exist and be active
 * 2. Function modules must exist (created by test-create-function-module.js)
 * 3. Transport E19K905635 must exist
 *
 * Test scenarios:
 * 1. Update simple function module with new logic
 * 2. Update function module with validation logic
 * 3. Update function module - add parameters
 *
 * Each test updates existing function module source code and activates it.
 */

const {
  initializeTestEnvironment,
  loadTestConfig,
  validateTransportRequest,
  printTestHeader
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleUpdateFunctionModule } = require('../dist/handlers/function/high/handleUpdateFunctionModule');

// Load test configuration
const config = loadTestConfig();
const updateFmConfig = config.update_function_module_high || {};

if (!updateFmConfig.function_group_name || !updateFmConfig.transport || !updateFmConfig.test_cases) {
  console.error('❌ Missing update_function_module_high configuration in test-config.yaml');
  process.exit(1);
}

// Test configuration from YAML
const FUNCTION_GROUP = updateFmConfig.function_group_name;
const TRANSPORT = updateFmConfig.transport;
const TEST_CASES = updateFmConfig.test_cases;

// Validate configuration
if (!TEST_CASES || TEST_CASES.length < 3) {
  console.error('❌ Error: test-config.yaml must have at least 3 test cases in update_function_module_high.test_cases');
  process.exit(1);
}

console.log(`🚀 Starting UpdateFunctionModule Tests`);
console.log(`============================================================\n`);
console.log(`Function Group: ${FUNCTION_GROUP}`);
console.log(`Transport: ${TRANSPORT}`);
console.log(`Test Cases: ${TEST_CASES.length}\n`);

// Display all test cases
TEST_CASES.forEach((testCase, index) => {
  console.log(`  ${index + 1}. ${testCase.function_module_name}: ${testCase.description}`);
});
console.log('\n');

async function runTests() {
  let passedTests = 0;
  let failedTests = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];

    console.log(`📋 Test ${i + 1}: ${testCase.name}`);
    console.log(`============================================================`);

    try {
      const result = await handleUpdateFunctionModule({
        function_group_name: FUNCTION_GROUP,
        function_module_name: testCase.function_module_name,
        source_code: testCase.source_code,
        description: testCase.description,
        transport_request: TRANSPORT,
        activate: true
      });

      if (result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          console.log(`✅ Function module updated successfully`);
          console.log(`   Name: ${data.function_module_name}`);
          console.log(`   Activated: ${data.activated}`);
          passedTests++;
        } else {
          console.log(`❌ Unexpected content type: ${content.type}`);
          failedTests++;
        }
      } else {
        console.log(`❌ No content in response`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
      failedTests++;
    }

    console.log('');
  }

  // Summary
  console.log(`============================================================`);
  console.log(`📊 Test Summary`);
  console.log(`============================================================`);
  console.log(`Tests passed: ${passedTests}/${TEST_CASES.length}`);

  if (failedTests === 0) {
    console.log(`✅ All tests passed!`);
  } else {
    console.log(`❌ ${failedTests} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

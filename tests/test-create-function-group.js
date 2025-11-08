/**
 * Test CreateFunctionGroup handler
 * 
 * Tests function group creation via ADT API.
 * Configuration is loaded from tests/test-config.yaml
 * 
 * Prerequisites:
 * - Transport request configured in test-config.yaml
 * - Package must exist (use $TMP for local)
 * 
 * Usage:
 * node tests/test-create-function-group.js
 */

const {
  initializeTestEnvironment,
  getEnabledTestCase,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateFunctionGroup } = require('../dist/handlers/handleCreateFunctionGroup');

/**
 * Load test configuration
 */
function getTestConfig() {
  try {
    const testCase = getEnabledTestCase('create_function_group');
    
    if (!validateTransportRequest(testCase.params)) {
      console.error('❌ Transport request not configured properly');
      console.log('\n📝 Add this to test-config.yaml:');
      console.log(`
create_function_group:
  test_cases:
    - name: "create_test_function_group"
      enabled: true
      description: "Test function group creation"
      params:
        function_group_name: "ZTEST_FG_MCP01"
        description: "Test Function Group for MCP"
        transport_request: "E19K905635"  # ⚠️ UPDATE THIS
        package_name: "$TMP"
`);
      process.exit(1);
    }
    
    return testCase.params;
  } catch (error) {
    console.error('❌ Failed to load test configuration');
    console.error('   Error:', error.message);
    console.log('\n📝 Create tests/test-config.yaml based on test-config.yaml.template');
    process.exit(1);
  }
}

/**
 * Test 1: Create function group with default TOP include
 */
async function testCreateFunctionGroupDefault(config) {
  console.log('\n📋 Test 1: Create function group with default TOP include');
  console.log('=' .repeat(60));
  
  try {
    const result = await handleCreateFunctionGroup({
      function_group_name: config.function_group_name,
      description: config.description,
      package_name: config.package_name,
      transport_request: config.transport_request
      // No top_include_source - will use default
    });
    
    if (result.isError) {
      console.log(`❌ Failed to create function group: ${result.content[0].text}`);
      return false;
    }
    
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    
    console.log(`✅ Function group created successfully`);
    console.log(`   Name: ${parsed.function_group_name}`);
    console.log(`   Package: ${parsed.package_name}`);
    console.log(`   Transport: ${parsed.transport_request}`);
    console.log(`   Activated: ${parsed.activated}`);
    
    return true;
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Create function group with custom TOP include
 */
async function testCreateFunctionGroupCustomTop(config) {
  console.log('\n📋 Test 2: Create function group with custom TOP include');
  console.log('=' .repeat(60));
  
  const customFgName = config.function_group_name.replace('01', '02');
  
  try {
    const customTopInclude = `FUNCTION-POOL ${customFgName}.

*"* Local interface:
*"*  - No local interface defined

* Global Data Definitions
TYPES: BEGIN OF ty_customer,
         id   TYPE i,
         name TYPE string,
       END OF ty_customer.

DATA: gt_customers TYPE TABLE OF ty_customer.`;
    
    const result = await handleCreateFunctionGroup({
      function_group_name: customFgName,
      description: `${config.description} with custom TOP`,
      package_name: config.package_name,
      transport_request: config.transport_request,
      top_include_source: customTopInclude
    });
    
    if (result.isError) {
      // If already exists, that's OK for this test
      if (result.content[0].text.includes('already exists') || 
          result.content[0].text.includes('409')) {
        console.log(`⚠️  Function group already exists (acceptable)`);
        return true;
      }
      console.log(`❌ Failed: ${result.content[0].text}`);
      return false;
    }
    
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    
    console.log(`✅ Function group with custom TOP created`);
    console.log(`   Name: ${parsed.function_group_name}`);
    
    return true;
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Create without activation
 */
async function testCreateWithoutActivation(config) {
  console.log('\n📋 Test 3: Create function group without activation');
  console.log('=' .repeat(60));
  
  const noActivateFgName = config.function_group_name.replace('01', '03');
  
  try {
    const result = await handleCreateFunctionGroup({
      function_group_name: noActivateFgName,
      description: `${config.description} (no activation)`,
      package_name: config.package_name,
      transport_request: config.transport_request,
      activate: false  // Don't activate
    });
    
    if (result.isError) {
      // If already exists, that's OK
      if (result.content[0].text.includes('already exists') || 
          result.content[0].text.includes('409')) {
        console.log(`⚠️  Function group already exists (acceptable)`);
        return true;
      }
      console.log(`❌ Failed: ${result.content[0].text}`);
      return false;
    }
    
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    
    console.log(`✅ Function group created (not activated)`);
    console.log(`   Name: ${parsed.function_group_name}`);
    console.log(`   Activated: ${parsed.activated}`);
    
    if (parsed.activated === true) {
      console.log(`❌ ERROR: Should not be activated!`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Validation - invalid name
 */
async function testInvalidName() {
  console.log('\n📋 Test 4: Validation - invalid function group name');
  console.log('=' .repeat(60));
  
  try {
    // Test with name that doesn't start with Z/Y
    const result = await handleCreateFunctionGroup({
      function_group_name: 'INVALID_NAME',
      description: 'Should fail',
      package_name: '$TMP'
    });
    
    if (result.isError) {
      console.log(`✅ Expected error: ${result.content[0].text}`);
      return true;
    } else {
      console.log(`❌ Should have failed with invalid name`);
      return false;
    }
  } catch (error) {
    console.log(`✅ Expected error: ${error.message}`);
    return true;
  }
}

/**
 * Test 5: Validation - name too long
 */
async function testNameTooLong() {
  console.log('\n📋 Test 5: Validation - function group name too long');
  console.log('=' .repeat(60));
  
  try {
    // Test with name longer than 26 chars
    const result = await handleCreateFunctionGroup({
      function_group_name: 'ZTHIS_IS_A_VERY_LONG_FUNCTION_GROUP_NAME',
      description: 'Should fail',
      package_name: '$TMP'
    });
    
    if (result.isError) {
      console.log(`✅ Expected error: ${result.content[0].text}`);
      return true;
    } else {
      console.log(`❌ Should have failed with name too long`);
      return false;
    }
  } catch (error) {
    console.log(`✅ Expected error: ${error.message}`);
    return true;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting CreateFunctionGroup Tests');
  console.log('=' .repeat(60));
  
  // Load configuration
  const config = getTestConfig();
  
  console.log(`\nFunction Group: ${config.function_group_name}`);
  console.log(`Transport: ${config.transport_request}`);
  console.log(`Package: ${config.package_name}\n`);
  
  // Run tests
  const results = [
    await testCreateFunctionGroupDefault(config),
    await testCreateFunctionGroupCustomTop(config),
    await testCreateWithoutActivation(config),
    await testInvalidName(),
    await testNameTooLong()
  ];
  
  // Print summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Summary');
  console.log('=' .repeat(60));
  const passed = results.filter(r => r).length;
  console.log(`Tests passed: ${passed}/${results.length}`);
  
  if (passed === results.length) {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

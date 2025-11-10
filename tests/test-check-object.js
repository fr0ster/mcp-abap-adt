/**
 * Test CheckObject handler
 * 
 * Tests syntax checking for ABAP objects without activation.
 * Reads configuration from test-config.yaml
 * 
 * Usage:
 * node tests/test-check-object.js
 */

const path = require('path');
const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCheckObject } = require('../dist/handlers/handleCheckObject');

/**
 * Test objects from YAML configuration
 */
async function testCheckObjectsFromConfig() {
  console.log('\n📋 Testing objects from test-config.yaml');
  console.log('=' .repeat(60));
  
  const testConfig = loadTestConfig();
  
  if (!testConfig.check_object || !testConfig.check_object.test_cases) {
    console.error('❌ Missing check_object configuration in test-config.yaml');
    console.log('\n📝 Add this section to your test-config.yaml:');
    console.log(`
check_object:
  test_cases:
    - name: "check_cds_views"
      enabled: true
      params:
        objects:
          - object_name: "ZOK_I_MARKET_0001"
            object_type: "DDLS/DF"
            version: "active"
    `);
    return false;
  }
  
  const enabledCase = testConfig.check_object.test_cases.find(tc => tc.enabled);
  if (!enabledCase) {
    console.error('❌ No enabled test cases found');
    return false;
  }
  
  console.log(`Test case: ${enabledCase.name}`);
  console.log(`Description: ${enabledCase.description || 'N/A'}`);
  console.log(`Objects to check: ${enabledCase.params.objects.length}`);
  
  let allPassed = true;
  
  for (const obj of enabledCase.params.objects) {
    console.log(`\n   Checking: ${obj.object_name} (${obj.object_type})`);
    
    try {
      const result = await handleCheckObject({
        object_name: obj.object_name,
        object_type: obj.object_type,
        version: obj.version || 'active'
      });
    
      if (result.isError) {
        console.log(`   ❌ Check failed: ${result.content[0].text}`);
        allPassed = false;
        continue;
      }
      
      const data = result.content[0].text;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const checkResult = parsed.check_result;
      
      console.log(`   ✅ Status: ${checkResult.status}`);
      console.log(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);
      
      if (checkResult.errors.length > 0) {
        console.log('   Errors:');
        checkResult.errors.forEach((err, i) => {
          console.log(`     ${i + 1}. [Line ${err.line}] ${err.text}`);
        });
        allPassed = false;
      }
      
      if (checkResult.warnings.length > 0) {
        console.log('   Warnings:');
        checkResult.warnings.forEach((warn, i) => {
          console.log(`     ${i + 1}. [Line ${warn.line}] ${warn.text}`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting CheckObject Tests');
  console.log('=' .repeat(60));
  
  try {
    const passed = await testCheckObjectsFromConfig();
    
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Test Summary');
    console.log('=' .repeat(60));
    
    if (passed) {
      console.log('✅ All checks passed!');
      process.exit(0);
    } else {
      console.log('❌ Some checks failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests();

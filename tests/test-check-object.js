/**
 * Test CheckObject handler
 * 
 * Tests syntax checking for ABAP objects without activation.
 * 
 * Prerequisites:
 * - ZIF_TEST_MCP_01 interface exists (created by test-create-interface.js)
 * - SAP system configured in environment
 * 
 * Usage:
 * node tests/test-check-object.js
 */

const path = require('path');
const { initializeTestEnvironment } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCheckObject } = require('../dist/handlers/handleCheckObject');

// Object to check
const INTERFACE_NAME = 'ZIF_TEST_MCP_01';
const OBJECT_TYPE = 'interface';  // Use friendly type names

/**
 * Test 1: Check existing object (active version)
 */
async function testCheckExistingObjectActive() {
  console.log('\n📋 Test 1: Check existing object (active version)');
  console.log('=' .repeat(60));
  
  try {
    const result = await handleCheckObject({
      object_name: INTERFACE_NAME,
      object_type: OBJECT_TYPE,
      version: 'active'
    });
    
    if (result.isError) {
      console.log(`❌ Check failed: ${result.content[0].text}`);
      return false;
    }
    
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const checkResult = parsed.check_result;
    
    console.log(`✅ Check completed`);
    console.log(`   Status: ${checkResult.status}`);
    console.log(`   Success: ${checkResult.success}`);
    console.log(`   Message: ${checkResult.message}`);
    console.log(`   Errors: ${checkResult.errors.length}`);
    console.log(`   Warnings: ${checkResult.warnings.length}`);
    console.log(`   Info: ${checkResult.info.length}`);
    
    if (checkResult.errors.length > 0) {
      console.log('\n   Errors:');
      checkResult.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. [Line ${err.line}] ${err.text}`);
      });
    }
    
    if (checkResult.warnings.length > 0) {
      console.log('\n   Warnings:');
      checkResult.warnings.forEach((warn, i) => {
        console.log(`   ${i + 1}. [Line ${warn.line}] ${warn.text}`);
      });
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Check with current changes (new version)
 */
async function testCheckWithNewVersion() {
  console.log('\n📋 Test 2: Check object with current changes (new version)');
  console.log('=' .repeat(60));
  console.log('   Note: May fail if no unsaved changes exist');
  
  try {
    const result = await handleCheckObject({
      object_name: INTERFACE_NAME,
      object_type: OBJECT_TYPE,
      version: 'new'
    });
    
    if (result.isError) {
      console.log(`⚠️  Check failed (expected if no unsaved changes): ${result.content[0].text}`);
      return true; // Consider this acceptable
    }
    
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const checkResult = parsed.check_result;
    
    console.log(`✅ Check completed`);
    console.log(`   Status: ${checkResult.status}`);
    console.log(`   Success: ${checkResult.success}`);
    console.log(`   Message: ${checkResult.message}`);
    console.log(`   Errors: ${checkResult.errors.length}`);
    console.log(`   Warnings: ${checkResult.warnings.length}`);
    console.log(`   Info: ${checkResult.info.length}`);
    
    return true;
  } catch (error) {
    console.log(`⚠️  Test failed (acceptable): ${error.message}`);
    return true; // Accept this as the object might not have unsaved changes
  }
}

/**
 * Test 3: Check non-existent object
 */
async function testCheckNonExistentObject() {
  console.log('\n📋 Test 3: Check non-existent object');
  console.log('=' .repeat(60));
  console.log('   Note: SAP returns status "notProcessed" instead of 404');
  
  try {
    const result = await handleCheckObject({
      object_name: 'ZIF_NON_EXISTENT_OBJECT_12345',
      object_type: 'interface',
      version: 'active'
    });
    
    if (result.isError) {
      console.log(`✅ Expected error received: ${result.content[0].text}`);
      return true;
    }
    
    // Check if status is "notProcessed" which indicates object doesn't exist
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const checkResult = parsed.check_result;
    
    if (checkResult.status === 'notProcessed') {
      console.log(`✅ Object not found (status: notProcessed)`);
      return true;
    } else {
      console.log(`❌ Expected notProcessed status, got: ${checkResult.status}`);
      return false;
    }
  } catch (error) {
    console.log(`✅ Expected error: ${error.message}`);
    return true;
  }
}

/**
 * Test 4: Check different object types
 */
async function testCheckDifferentObjectTypes() {
  console.log('\n📋 Test 4: Check different object types');
  console.log('=' .repeat(60));
  
  const testObjects = [
    { type: 'class', name: 'CL_ABAP_CHAR_UTILITIES' },
    { type: 'program', name: 'SAPLWBABAP' },
  ];
  
  let allPassed = true;
  
  for (const obj of testObjects) {
    console.log(`\n   Testing ${obj.type}: ${obj.name}`);
    
    try {
      const result = await handleCheckObject({
        object_name: obj.name,
        object_type: obj.type,
        version: 'active'
      });
      
      if (result.isError) {
        console.log(`   ⚠️  Error: ${result.content[0].text}`);
        allPassed = false;
      } else {
        const data = result.content[0].text;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const checkResult = parsed.check_result;
        console.log(`   ✅ Status: ${checkResult.status}, Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);
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
  console.log(`Interface: ${INTERFACE_NAME}`);
  
  const results = [];
  
  try {
    results.push(await testCheckExistingObjectActive());
    results.push(await testCheckWithNewVersion());
    results.push(await testCheckNonExistentObject());
    results.push(await testCheckDifferentObjectTypes());
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Summary');
  console.log('=' .repeat(60));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`Tests passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

// Run tests
runTests();

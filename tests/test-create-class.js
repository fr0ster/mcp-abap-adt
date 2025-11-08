/**
 * Test script for CreateClass tool
 * Tests creation of ABAP classes with full OO features
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateClass } = require('../dist/handlers/handleCreateClass');

async function testCreateClass() {
  console.log('='.repeat(80));
  console.log('CreateClass Handler Test (ABAP Class Creation)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.create_class) {
      console.error('❌ Missing create_class configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
create_class:
  class_name: "ZCL_TEST_MCP_01"
  description: "Test ABAP Class"
  package_name: "ZOK_LAB"
  transport_request: "E19K905635"
  superclass: ""
  final: false
  abstract: false
  create_protected: false
  source_code: |
    METHOD constructor.
      " Initialization logic
    ENDMETHOD.
      `);
      process.exit(1);
    }

    const params = testConfig.create_class;
    
    console.log('📋 Test Parameters:');
    console.log(`   Class Name: ${params.class_name}`);
    console.log(`   Description: ${params.description || params.class_name}`);
    console.log(`   Package: ${params.package_name}`);
    console.log(`   Transport: ${params.transport_request || '(local)'}`);
    console.log(`   Superclass: ${params.superclass || '(none)'}`);
    console.log(`   Final: ${params.final ? 'X' : ''}`);
    console.log(`   Abstract: ${params.abstract ? 'X' : ''}`);
    console.log(`   Create Protected: ${params.create_protected ? 'X' : ''}`);
    if (params.source_code) {
      console.log(`   Source Code: ${params.source_code.split('\n')[0] + '...'}`);
    }

    console.log('\n🚀 Creating ABAP class...');
    
    const result = await handleCreateClass(params);

    if (result.isError) {
      console.error('\n❌ Class creation failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ Class created successfully!');
      console.log(result.content[0].text);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testCreateClass();

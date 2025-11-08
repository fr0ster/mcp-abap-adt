/**
 * Test script for UpdateClassSource tool
 * Tests updating source code of existing ABAP classes
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleUpdateClassSource } = require('../dist/handlers/handleUpdateClassSource');

async function testUpdateClassSource() {
  console.log('='.repeat(80));
  console.log('UpdateClassSource Handler Test (ABAP Class Source Update)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.update_class_source) {
      console.error('❌ Missing update_class_source configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
update_class_source:
  class_name: "ZCL_TEST_MCP_01"
  activate: true
  source_code: |
    CLASS zcl_test_mcp_01 DEFINITION
      PUBLIC
      FINAL
      CREATE PUBLIC.

      PUBLIC SECTION.
        METHODS: get_message RETURNING VALUE(rv_message) TYPE string.
    ENDCLASS.

    CLASS zcl_test_mcp_01 IMPLEMENTATION.
      METHOD get_message.
        rv_message = 'Updated message from MCP test'.
      ENDMETHOD.
    ENDCLASS.
      `);
      process.exit(1);
    }

    const params = testConfig.update_class_source;
    
    console.log('📋 Test Parameters:');
    console.log(`   Class Name: ${params.class_name}`);
    console.log(`   Activate: ${params.activate !== false ? 'X' : ''}`);
    if (params.source_code) {
      console.log(`   Source Code: ${params.source_code.split('\n')[0] + '...'}`);
      console.log(`   Source Size: ${params.source_code.length} bytes`);
    }

    console.log('\n🚀 Updating ABAP class source...');
    
    const result = await handleUpdateClassSource(params);

    if (result.isError) {
      console.error('\n❌ Class source update failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ Class source updated successfully!');
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

// Run test
testUpdateClassSource().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

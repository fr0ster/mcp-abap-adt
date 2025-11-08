/**
 * Test script for UpdateProgramSource tool
 * Tests updating source code of existing ABAP programs
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleUpdateProgramSource } = require('../dist/handlers/handleUpdateProgramSource');

async function testUpdateProgramSource() {
  console.log('='.repeat(80));
  console.log('UpdateProgramSource Handler Test (ABAP Program Source Update)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.update_program_source) {
      console.error('❌ Missing update_program_source configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
update_program_source:
  program_name: "Z_TEST_PROGRAM_01"
  activate: true
  source_code: |
    REPORT z_test_program_01.

    WRITE: / 'Updated program source from MCP test'.
    WRITE: / 'Modification date:', sy-datum.
      `);
      process.exit(1);
    }

    const params = testConfig.update_program_source;
    
    console.log('📋 Test Parameters:');
    console.log(`   Program Name: ${params.program_name}`);
    console.log(`   Activate: ${params.activate !== false ? 'X' : ''}`);
    if (params.source_code) {
      console.log(`   Source Code: ${params.source_code.split('\n')[0] + '...'}`);
      console.log(`   Source Size: ${params.source_code.length} bytes`);
    }

    console.log('\n🚀 Updating ABAP program source...');
    
    const result = await handleUpdateProgramSource(params);

    if (result.isError) {
      console.error('\n❌ Program source update failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ Program source updated successfully!');
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
testUpdateProgramSource().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

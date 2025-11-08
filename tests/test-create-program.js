/**
 * Test script for CreateProgram tool
 * Tests creation of ABAP programs (reports, includes, module pools)
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateProgram } = require('../dist/handlers/handleCreateProgram');

async function testCreateProgram() {
  console.log('='.repeat(80));
  console.log('CreateProgram Handler Test (ABAP Program Creation)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.create_program) {
      console.error('❌ Missing create_program configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
create_program:
  program_name: "Z_TEST_PROGRAM_01"
  description: "Test ABAP Program"
  package_name: "ZOK_LAB"
  transport_request: "E19K905635"
  program_type: "1"
  source_code: |
    REPORT Z_TEST_PROGRAM_01.
    
    START-OF-SELECTION.
      WRITE: / 'Program executed successfully.'.
      `);
      process.exit(1);
    }

    const params = testConfig.create_program;
    
    console.log('📋 Test Parameters:');
    console.log(`   Program Name: ${params.program_name}`);
    console.log(`   Description: ${params.description || params.program_name}`);
    console.log(`   Package: ${params.package_name}`);
    console.log(`   Transport: ${params.transport_request || '(local)'}`);
    console.log(`   Program Type: ${params.program_type || '1 (Executable)'}`);
    if (params.source_code) {
      console.log(`   Source Code: ${params.source_code.split('\n')[0] + '...'}`);
    }

    console.log('\n🚀 Creating ABAP program...');
    
    const result = await handleCreateProgram(params);

    if (result.isError) {
      console.error('\n❌ Program creation failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ Program created successfully!');
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
testCreateProgram();

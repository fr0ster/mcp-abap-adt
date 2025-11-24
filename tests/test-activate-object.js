/**
 * Test script for ActivateObject tool
 * Tests universal activation of ABAP objects
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleActivateObject } = require('../dist/handlers/common/low/handleActivateObject');

async function testActivateObject() {
  console.log('='.repeat(80));
  console.log('ActivateObject Handler Test (Universal Object Activation)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.activate_object) {
      console.error('❌ Missing activate_object configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
activate_object:
  objects:
    - name: "ZCL_TEST_MCP_01"
      uri: "/sap/bc/adt/oo/classes/zcl_test_mcp_01"
      type: "CLAS/OC"
    - name: "Z_TEST_PROGRAM_01"
      uri: "/sap/bc/adt/programs/programs/z_test_program_01"
      type: "PROG/P"
  preaudit: true
      `);
      process.exit(1);
    }

    const params = testConfig.activate_object;
    
    console.log('📋 Test Parameters:');
    console.log(`   Objects Count: ${params.objects.length}`);
    params.objects.forEach((obj, idx) => {
      console.log(`   ${idx + 1}. ${obj.name} (${obj.type || 'auto-detect'})`);
      console.log(`      URI: ${obj.uri || 'auto-generated'}`);
    });
    console.log(`   Pre-audit: ${params.preaudit !== false}`);

    console.log('\n🚀 Activating objects...');
    
    const result = await handleActivateObject(params);

    if (result.isError) {
      console.error('\n❌ Activation failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ Activation completed!');
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
testActivateObject();

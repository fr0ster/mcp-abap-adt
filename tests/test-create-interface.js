/**
 * Test CreateInterface - ABAP Interface Creation
 * 
 * Tests interface creation via ADT API with stateful session:
 * 1. Create interface object with metadata
 * 2. Lock interface
 * 3. Upload interface source code
 * 4. Unlock interface
 * 5. Activate interface (optional)
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateInterface } = require('../dist/handlers/handleCreateInterface');

async function testCreateInterface() {
  console.log('='.repeat(80));
  console.log('CreateInterface Handler Test (ABAP Interface Creation)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.create_interface) {
      console.error('❌ Missing create_interface configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
create_interface:
  interface_name: "ZIF_TEST_MCP_01"
  description: "Test ABAP Interface"
  package_name: "ZOK_LAB"
  transport_request: "E19K905635"
  activate: true
      `);
      process.exit(1);
    }

    const params = testConfig.create_interface;
    
    console.log('📋 Test Parameters:');
    console.log(`   Interface Name: ${params.interface_name}`);
    console.log(`   Description: ${params.description || params.interface_name}`);
    console.log(`   Package: ${params.package_name}`);
    console.log(`   Transport: ${params.transport_request || '(local)'}`);
    console.log(`   Activate: ${params.activate !== false}`);
    console.log('');

    // Prepare source code
    const sourceCode = params.source_code || `INTERFACE ${params.interface_name}
  PUBLIC.

  "! Test interface created by MCP - ${new Date().toISOString()}
  "! @parameter iv_input | Input value
  "! @parameter rv_output | Output value
  METHODS: get_value
    IMPORTING iv_input TYPE string
    RETURNING VALUE(rv_output) TYPE string.

  "! Process data
  "! @parameter it_data | Input data table
  METHODS: process_data
    IMPORTING it_data TYPE string_table.

  "! Event triggered on change
  EVENTS: on_change
    EXPORTING VALUE(ev_timestamp) TYPE timestamp.

  "! Type definition
  TYPES: BEGIN OF ty_interface_data,
           field1 TYPE string,
           field2 TYPE i,
           field3 TYPE timestamp,
         END OF ty_interface_data.

ENDINTERFACE.`;

    console.log('� Creating interface...\n');

    // Call handler
    const result = await handleCreateInterface({
      interface_name: params.interface_name,
      description: params.description,
      package_name: params.package_name,
      transport_request: params.transport_request,
      source_code: sourceCode,
      activate: params.activate !== false
    });

    console.log('\n' + '='.repeat(80));
    console.log('Result:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    if (result.isError) {
      console.error('❌ Test FAILED');
      process.exit(1);
    }

    console.log('✅ Test PASSED');
    console.log(`\n📝 Interface ${params.interface_name} created successfully.`);
    console.log(`   You can view it in SE24 or ABAP Development Tools.\n`);

  } catch (error) {
    console.error('\n❌ Test ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testCreateInterface();

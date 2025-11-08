/**
 * Test UpdateInterfaceSource - Update existing ABAP Interface
 * 
 * Tests interface update via ADT API with stateful session:
 * 1. Lock interface
 * 2. Upload new source code
 * 3. Unlock interface
 * 4. Activate interface (optional)
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleUpdateInterfaceSource } = require('../dist/handlers/handleUpdateInterfaceSource');

async function testUpdateInterfaceSource() {
  console.log('='.repeat(80));
  console.log('UpdateInterfaceSource Handler Test');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.update_interface_source) {
      console.error('❌ Missing update_interface_source configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
update_interface_source:
  interface_name: "ZIF_TEST_MCP_02"
  transport_request: "E19K905635"
  activate: true
      `);
      process.exit(1);
    }

    const params = testConfig.update_interface_source;
    
    // Generate updated source code
    const timestamp = new Date().toISOString();
    const sourceCode = `INTERFACE ${params.interface_name}
  PUBLIC.

  "! Updated interface - ${timestamp}
  "! @parameter iv_value | Input value
  "! @parameter rv_result | Result value
  METHODS: get_updated_value
    IMPORTING iv_value TYPE string
    RETURNING VALUE(rv_result) TYPE string.

  "! New method added in update
  "! @parameter it_items | Items to process
  "! @parameter ev_count | Number of items
  METHODS: process_items
    IMPORTING it_items TYPE string_table
    EXPORTING ev_count TYPE i.

  "! New event
  EVENTS: on_update
    EXPORTING VALUE(ev_timestamp) TYPE timestamp
              VALUE(ev_user) TYPE syuname.

  "! Updated type definition
  TYPES: BEGIN OF ty_updated_data,
           id TYPE string,
           value TYPE string,
           timestamp TYPE timestamp,
           is_active TYPE abap_bool,
         END OF ty_updated_data.

  TYPES: ty_data_table TYPE STANDARD TABLE OF ty_updated_data WITH DEFAULT KEY.

ENDINTERFACE.`;
    
    console.log('📋 Test Parameters:');
    console.log(`   Interface Name: ${params.interface_name}`);
    console.log(`   Transport: ${params.transport_request || '(from lock)'}`);
    console.log(`   Activate: ${params.activate !== false}`);
    console.log(`   Timestamp: ${timestamp}`);
    console.log('');

    console.log('🚀 Updating interface source...\n');

    // Call handler
    const result = await handleUpdateInterfaceSource({
      interface_name: params.interface_name,
      source_code: sourceCode,
      transport_request: params.transport_request,
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
    console.log(`\n📝 Interface ${params.interface_name} updated successfully.`);
    console.log(`   Check the interface in SE24 or ABAP Development Tools to verify changes.\n`);

  } catch (error) {
    console.error('\n❌ Test ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testUpdateInterfaceSource();

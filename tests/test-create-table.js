/**
 * Test script for CreateTable handler
 * Tests database table creation with comprehensive validation
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateTable } = require('../dist/handlers/handleCreateTable');

async function testCreateTable() {
  console.log('='.repeat(80));
  console.log('CreateTable Handler Test');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.create_table) {
      console.error('❌ Missing create_table configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
create_table:
  table_name: "ZTST_DEMO_TABLE"
  description: "Test Demo Table for MCP ABAP ADT"
  package_name: "ZTST"
  transport_request: "E19K900001"  # Optional
  fields:
    - name: "CLIENT"
      data_type: "CLNT"
      length: 3
      is_key: true
      description: "Client"
    - name: "ID" 
      data_type: "CHAR"
      length: 10
      is_key: true
      description: "ID"
    - name: "DESCRIPTION"
      data_type: "CHAR"
      length: 255
      description: "Description"
      `);
      process.exit(1);
    }

    const params = testConfig.create_table;
    
    console.log('📋 Test Parameters:');
    console.log(`   Table Name: ${params.table_name}`);
    console.log(`   Description: ${params.description}`);
    console.log(`   Package: ${params.package_name}`);
    console.log(`   Fields: ${params.fields?.length || 0} defined`);

    console.log('\n🚀 Creating table...');
    
    const result = await handleCreateTable(params);

    if (result.isError) {
      console.error('\n❌ Table creation failed:');
      console.error(result.content[0].text);
    } else {
      console.log('\n✅ Table creation completed!');
      console.log(result.content[0].text);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testCreateTable().then(() => {
  console.log('\n✅ CreateTable test completed!');
}).catch((error) => {
  console.error('\n💥 Test execution failed:', error);
  process.exit(1);
});
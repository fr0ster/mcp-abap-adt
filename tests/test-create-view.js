/**
 * Test script for CreateView tool
 * Tests creation of CDS Views or Classic Views via DDL syntax
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateView } = require('../dist/handlers/handleCreateView');

async function testCreateView() {
  console.log('='.repeat(80));
  console.log('CreateView Handler Test (CDS/Classic View via DDL)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.create_view) {
      console.error('❌ Missing create_view configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
create_view:
  view_name: "ZOK_R_TEST_MCP_01"
  description: "Test CDS View"
  package_name: "ZOK_LAB"
  transport_request: "E19K905635"
  ddl_source: |
    @AbapCatalog.sqlViewName: 'ZOK_V_MCP_01'
    @EndUserText.label: 'Test View'
    define view ZOK_R_TEST_MCP_01 as select from mara
    {
        matnr as MaterialNumber,
        mtart as MaterialType
    }
      `);
      process.exit(1);
    }

    const params = testConfig.create_view;
    
    console.log('📋 Test Parameters:');
    console.log(`   View Name: ${params.view_name}`);
    console.log(`   Description: ${params.description}`);
    console.log(`   Package: ${params.package_name}`);
    console.log(`   Transport: ${params.transport_request || '(local)'}`);
    console.log(`   DDL Source: ${params.ddl_source ? params.ddl_source.split('\n')[0] + '...' : 'none'}`);

    console.log('\n🚀 Creating view via DDL...');
    
    const result = await handleCreateView(params);

    if (result.isError) {
      console.error('\n❌ View creation failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ View created successfully!');
      console.log(result.content[0].text);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testCreateView()
  .then(() => {
    console.log('\n' + '='.repeat(80));
    console.log('✅ CreateView test completed successfully!');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n' + '='.repeat(80));
    console.error('❌ Test failed:', error);
    console.error('='.repeat(80));
    process.exit(1);
  });

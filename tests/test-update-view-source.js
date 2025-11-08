/**
 * Test script for UpdateViewSource tool
 * Tests updating DDL source code of existing CDS/Classic Views
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleUpdateViewSource } = require('../dist/handlers/handleUpdateViewSource');

async function testUpdateViewSource() {
  console.log('='.repeat(80));
  console.log('UpdateViewSource Handler Test (CDS/Classic View DDL Source Update)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.update_view_source) {
      console.error('❌ Missing update_view_source configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
update_view_source:
  view_name: "ZOK_R_TEST_0002"
  activate: true
  ddl_source: |
    @AbapCatalog.sqlViewName: 'ZV_TEST_SQL'
    @AbapCatalog.compiler.compareFilter: true
    @AccessControl.authorizationCheck: #NOT_REQUIRED
    @EndUserText.label: 'Updated Test View'
    define view ZOK_R_TEST_0002
      as select from mara
    {
      key matnr as Material,
          mtart as MaterialType,
          matkl as MaterialGroup,
          meins as BaseUnit
    }
      `);
      process.exit(1);
    }

    const params = testConfig.update_view_source;
    
    console.log('📋 Test Parameters:');
    console.log(`   View Name: ${params.view_name}`);
    console.log(`   Activate: ${params.activate !== false ? 'X' : ''}`);
    if (params.ddl_source) {
      console.log(`   DDL Source: ${params.ddl_source.split('\n')[0] + '...'}`);
      console.log(`   Source Size: ${params.ddl_source.length} bytes`);
    }

    console.log('\n🚀 Updating view DDL source...');
    
    const result = await handleUpdateViewSource(params);

    if (result.isError) {
      console.error('\n❌ View source update failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ View source updated successfully!');
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
testUpdateViewSource().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

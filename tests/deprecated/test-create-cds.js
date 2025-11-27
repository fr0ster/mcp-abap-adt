/**
 * Test script for CreateCDS tool
 * Tests creation of a CDS View (DDLS - DDL Source)
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateCDS } = require('../../dist/handlers/handleCreateCDS');

async function testCreateCDS() {
  console.log('='.repeat(80));
  console.log('CreateCDS Handler Test (CDS View / DDLS)');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    
    if (!testConfig.create_cds) {
      console.error('❌ Missing create_cds configuration in test-config.yaml');
      console.log('\n📝 Add this section to your test-config.yaml:');
      console.log(`
create_cds:
  cds_name: "Z_I_TEST_CDS_001"
  description: "Test CDS View for Materials"
  package_name: "ZOK_LOCAL"
  transport_request: "E19K905635"
  ddl_source: |
    @AbapCatalog.viewEnhancementCategory: [#NONE]
    @AccessControl.authorizationCheck: #NOT_REQUIRED
    @EndUserText.label: 'Test CDS View for Materials'
    @Metadata.ignorePropagatedAnnotations: true
    @ObjectModel.usageType:{
      serviceQuality: #X,
      sizeCategory: #S,
      dataClass: #MIXED
    }
    define view Z_I_TEST_CDS_001
      as select from mara
    {
      key matnr as Material,
          mtart as MaterialType,
          meins as BaseUnitOfMeasure,
          ersda as CreatedOn
    }
      `);
      process.exit(1);
    }

    const params = testConfig.create_cds;
    
    console.log('📋 Test Parameters:');
    console.log(`   CDS Name: ${params.cds_name}`);
    console.log(`   Description: ${params.description || '(from DDL)'}`);
    console.log(`   Package: ${params.package_name}`);
    console.log(`   Transport: ${params.transport_request || '(local)'}`);
    console.log('\n📝 DDL Source:');
    console.log(params.ddl_source);

    console.log('\n🚀 Creating CDS view...');
    
    const result = await handleCreateCDS(params);

    if (result.isError) {
      console.error('\n❌ CDS view creation failed:');
      console.error(result.content[0].text);
      process.exit(1);
    } else {
      console.log('\n✅ CDS view creation completed!');
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
testCreateCDS()
  .then(() => {
    console.log('\n' + '='.repeat(80));
    console.log('✅ CreateCDS test completed successfully!');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n' + '='.repeat(80));
    console.error('❌ Test failed:', error);
    console.error('='.repeat(80));
    process.exit(1);
  });

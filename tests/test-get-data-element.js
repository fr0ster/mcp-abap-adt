/**
 * Test script for GetDataElement handler
 * Tests retrieval and parsing of data element information
 */

const { initializeTestEnvironment } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleGetDataElement } = require('../dist/handlers/handleGetDataElement');

async function testGetDataElement() {
  console.log('='.repeat(80));
  console.log('GetDataElement Handler Test');
  console.log('='.repeat(80));

  try {
    // First, test with custom data element (should be created by test-create-data-element.js)
    const customDataElementName = 'ZZ_E_TEST_MCP_01';
    
    console.log(`\n📝 Step 1: Testing with custom data element: ${customDataElementName}`);
    console.log('(Should be created first by running test-create-data-element.js)');

    // Call GetDataElement handler for custom element
    console.log('\n🚀 Calling GetDataElement handler...');
    
    let startTime = Date.now();
    let result = await handleGetDataElement({
      data_element_name: customDataElementName
    });
    let duration = Date.now() - startTime;

    console.log(`\n✅ Custom data element retrieved successfully in ${duration}ms`);
    console.log('\n📊 Result:');
    
    let parsedResult;
    try {
      // result має MCP формат: { isError, content: [{ type, text }] }
      const responseText = result.content[0].text;
      parsedResult = JSON.parse(responseText);
      const dataElement = parsedResult.data_element;
      console.log(JSON.stringify(dataElement, null, 2));
    } catch (e) {
      console.log(result.data);
      parsedResult = null;
    }

    // Verify result structure
    if (parsedResult && parsedResult.data_element) {
      const dataElement = parsedResult.data_element;
      console.log('\n✅ Verification Results:');
      
      if (dataElement.metadata) {
        console.log(`\n📋 Metadata:`);
        console.log(`   Name: ${dataElement.metadata.name}`);
        console.log(`   Type: ${dataElement.metadata.type}`);
        console.log(`   Description: ${dataElement.metadata.description}`);
        console.log(`   Language: ${dataElement.metadata.language}`);
        console.log(`   Created: ${dataElement.metadata.createdAt} by ${dataElement.metadata.createdBy}`);
        console.log(`   Changed: ${dataElement.metadata.changedAt} by ${dataElement.metadata.changedBy}`);
        console.log(`   Version: ${dataElement.metadata.version}`);
      }

      if (dataElement.package) {
        console.log(`\n📦 Package:`);
        console.log(`   Name: ${dataElement.package.name}`);
        console.log(`   Description: ${dataElement.package.description}`);
      }

      if (dataElement.dataElement) {
        console.log(`\n🔧 Data Element Details:`);
        console.log(`   Type Kind: ${dataElement.dataElement.typeKind}`);
        console.log(`   Type Name: ${dataElement.dataElement.typeName}`);
        console.log(`   Data Type: ${dataElement.dataElement.dataType}`);
        console.log(`   Length: ${dataElement.dataElement.dataTypeLength}`);
        console.log(`   Decimals: ${dataElement.dataElement.dataTypeDecimals}`);
        
        console.log(`\n🏷️  Field Labels:`);
        console.log(`   Short (${dataElement.dataElement.shortFieldMaxLength}): "${dataElement.dataElement.shortFieldLabel}"`);
        console.log(`   Medium (${dataElement.dataElement.mediumFieldMaxLength}): "${dataElement.dataElement.mediumFieldLabel}"`);
        console.log(`   Long (${dataElement.dataElement.longFieldMaxLength}): "${dataElement.dataElement.longFieldLabel}"`);
        console.log(`   Heading (${dataElement.dataElement.headingFieldMaxLength}): "${dataElement.dataElement.headingFieldLabel}"`);
        
        if (dataElement.dataElement.searchHelp) {
          console.log(`\n🔍 Search Help: ${dataElement.dataElement.searchHelp}`);
        }
      }

      // Success checks
      const checks = {
        'Has metadata': dataElement.metadata !== null,
        'Has data element info': dataElement.dataElement !== null,
        'Has type definition': dataElement.dataElement?.typeKind !== undefined,
        'Has field labels': dataElement.dataElement?.shortFieldLabel !== undefined
      };

      console.log('\n🔍 Validation Checks:');
      for (const [check, passed] of Object.entries(checks)) {
        console.log(`   ${passed ? '✅' : '❌'} ${check}`);
      }

      const allPassed = Object.values(checks).every(v => v);
      if (allPassed) {
        console.log('\n🎉 All checks passed! Data element information retrieved successfully.');
      } else {
        console.log('\n⚠️  Some checks failed. Please review the results.');
      }
    }

    // Step 2: Test with standard SAP data element
    console.log('\n' + '='.repeat(80));
    console.log('Step 2: Testing with standard SAP data element');
    console.log('='.repeat(80));
    
    const standardDataElementName = 'MAKTX';
    console.log(`\n📝 Testing with data element: ${standardDataElementName}`);
    
    startTime = Date.now();
    result = await handleGetDataElement({
      data_element_name: standardDataElementName
    });
    duration = Date.now() - startTime;

    console.log(`\n✅ Standard data element retrieved successfully in ${duration}ms`);
    
    const standardResponseText = result.content[0].text;
    const standardParsed = JSON.parse(standardResponseText);
    const standardDE = standardParsed.data_element;
    
    console.log('\n📊 Standard Data Element Info:');
    console.log(`   Name: ${standardDE.metadata?.name}`);
    console.log(`   Description: ${standardDE.metadata?.description}`);
    console.log(`   Type Name (Domain): ${standardDE.dataElement?.typeName}`);
    console.log(`   Data Type: ${standardDE.dataElement?.dataType}`);
    console.log(`   Length: ${standardDE.dataElement?.dataTypeLength}`);
    console.log(`   Package: ${standardDE.package?.name}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run test
testGetDataElement().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

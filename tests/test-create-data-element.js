/**
 * Test script for CreateDataElement MCP tool
 * Tests the simplified workflow: POST with full body → Activate → Verify
 */

const { loadTestConfig, initializeTestEnvironment } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateDataElement } = require('../dist/handlers/handleCreateDataElement');

async function testCreateDataElement() {
  console.log('='.repeat(80));
  console.log('CreateDataElement MCP Tool Test');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const config = loadTestConfig();
    const testCase = config?.create_data_element?.test_cases?.[0];

    if (!testCase || !testCase.enabled) {
      console.log('❌ Test case is disabled or not configured in test-config.yaml');
      console.log('Please enable the test case and provide configuration');
      return;
    }

    console.log(`\n📝 Test Case: ${testCase.name}`);
    console.log(`   Description: ${testCase.description}`);
    console.log(`\n📋 Parameters:`);
    console.log(JSON.stringify(testCase.params, null, 2));

    // Call CreateDataElement tool
    console.log('\n🚀 Calling CreateDataElement MCP tool...');
    console.log(`   Data Element: ${testCase.params.data_element_name}`);
    console.log(`   Domain: ${testCase.params.domain_name}`);
    console.log(`   Package: ${testCase.params.package_name}`);
    console.log(`   Transport: ${testCase.params.transport_request}`);

    const startTime = Date.now();
    const result = await handleCreateDataElement(testCase.params);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Data element created successfully in ${duration}ms`);
    console.log('\n📊 Result:');
    
    let parsedResult;
    try {
      // result має MCP формат: { isError, content: [{ type, text }] }
      const responseText = result.content[0].text;
      parsedResult = JSON.parse(responseText);
      console.log(JSON.stringify(parsedResult, null, 2));
    } catch (e) {
      console.log(result);
      parsedResult = null;
    }

    // Verify result
    if (parsedResult) {
      console.log('\n✅ Verification Results:');
      console.log(`   Data Element: ${parsedResult.data_element_name}`);
      console.log(`   Status: ${parsedResult.status}`);
      console.log(`   Version: ${parsedResult.version}`);
      console.log(`   Domain: ${parsedResult.domain_name}`);
      
      if (parsedResult.data_element_details) {
        console.log(`\n📋 Data Element Details:`);
        console.log(`   Type Kind: ${parsedResult.data_element_details.type_kind}`);
        console.log(`   Type Name (Domain): ${parsedResult.data_element_details.type_name}`);
        console.log(`   Data Type: ${parsedResult.data_element_details.data_type}`);
        console.log(`   Length: ${parsedResult.data_element_details.length}`);
        console.log(`   Decimals: ${parsedResult.data_element_details.decimals}`);
      }

      // Success checks
      const checks = {
        'Data element created': parsedResult.success === true,
        'Status is active': parsedResult.status === 'active',
        'Domain linked': parsedResult.data_element_details?.type_name === testCase.params.domain_name.toUpperCase(),
        'Correct data type': parsedResult.data_element_details?.data_type === testCase.params.data_type,
        'Correct length': parsedResult.data_element_details?.length == testCase.params.length
      };

      console.log('\n🔍 Validation Checks:');
      for (const [check, passed] of Object.entries(checks)) {
        console.log(`   ${passed ? '✅' : '❌'} ${check}`);
      }

      const allPassed = Object.values(checks).every(v => v);
      if (allPassed) {
        console.log('\n🎉 All checks passed! Data element is ready to use.');
      } else {
        console.log('\n⚠️  Some checks failed. Please review the results.');
      }
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

// Run test
testCreateDataElement().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

/**
 * Test script for CreateTransport handler
 * Tests transport request creation
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateTransport } = require('../dist/handlers/handleCreateTransport');

async function testCreateTransport() {
  console.log('='.repeat(80));
  console.log('CreateTransport Handler Test');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    const testCase = testConfig.create_transport?.test_cases?.find(tc => tc.name === 'workbench_transport');
    
    if (!testCase) {
      console.error('❌ Test case "workbench_transport" not found in test-config.yaml');
      return;
    }

    // Use parameters from YAML config
    const transportData = {
      transport_type: testCase.params.transport_type,
      description: testCase.params.description + " - " + new Date().toISOString(),
      target_system: testCase.params.target_system
    };
    
    console.log(`\n📝 Creating transport with parameters:`);
    console.log(JSON.stringify(transportData, null, 2));

    // Call CreateTransport handler
    console.log('\n🚀 Calling CreateTransport handler...');
    
    const startTime = Date.now();
    const result = await handleCreateTransport(transportData);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Transport created successfully in ${duration}ms`);
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
      console.log(`   Transport: ${parsedResult.transport_request}`);
      console.log(`   Description: ${parsedResult.description}`);
      console.log(`   Type: ${parsedResult.type}`);
      console.log(`   Status: ${parsedResult.status}`);
      console.log(`   Owner: ${parsedResult.owner}`);
      console.log(`   Target: ${parsedResult.target_system || 'N/A'}`);
      console.log(`   Created: ${parsedResult.created_at} by ${parsedResult.created_by}`);

      // Success checks
      const checks = {
        'Transport created': parsedResult.success === true,
        'Transport number exists': !!parsedResult.transport_request,
        'Has description': !!parsedResult.description,
        'Has owner': !!parsedResult.owner,
        'Has type': !!parsedResult.type
      };

      console.log('\n🔍 Validation Checks:');
      for (const [check, passed] of Object.entries(checks)) {
        console.log(`   ${passed ? '✅' : '❌'} ${check}`);
      }

      const allPassed = Object.values(checks).every(v => v);
      if (allPassed) {
        console.log('\n🎉 All checks passed! Transport request is ready to use.');
        console.log(`\n💡 Use transport number: ${parsedResult.transport_request} for development objects`);
      } else {
        console.log('\n⚠️  Some checks failed. Please review the results.');
      }

      // Save transport number for future tests
      if (parsedResult.transport_request) {
        console.log(`\n📝 Save this transport number for GetTransport test: ${parsedResult.transport_request}`);
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
testCreateTransport().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
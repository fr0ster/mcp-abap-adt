/**
 * Test script for CreatePackage handler
 * Tests ABAP package creation via ADT API
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreatePackage } = require('../dist/handlers/handleCreatePackage');

async function testCreatePackage() {
  console.log('='.repeat(80));
  console.log('CreatePackage Handler Test');
  console.log('='.repeat(80));

  try {
    // Load test configuration
    const testConfig = loadTestConfig();
    const testCase = testConfig.create_package?.test_cases?.find(tc => tc.name === 'basic_package');
    
    if (!testCase) {
      console.error('❌ Test case "basic_package" not found in test-config.yaml');
      console.log('\n💡 Please add create_package section to your test-config.yaml:');
      console.log(`
create_package:
  test_cases:
    - name: "basic_package"
      enabled: true
      description: "Create a basic development package"
      params:
        package_name: "ZOK_TEST_PKG_01"
        description: "Test package created via MCP"
        super_package: "ZOK_PACKAGE"
        package_type: "development"
        transport_layer: "ZE19"
        transport_request: "<YOUR_TRANSPORT_REQUEST>"
      `);
      return;
    }

    if (!testCase.enabled) {
      console.log('⚠️  Test case is disabled in configuration');
      return;
    }

    // Use parameters from YAML config
    const packageData = {
      package_name: testCase.params.package_name,
      description: testCase.params.description,
      super_package: testCase.params.super_package,
      package_type: testCase.params.package_type || 'development',
      transport_layer: testCase.params.transport_layer,
      transport_request: testCase.params.transport_request,
      software_component: testCase.params.software_component || 'HOME',
      application_component: testCase.params.application_component || ''
    };
    
    console.log(`\n📝 Creating package with parameters:`);
    console.log(JSON.stringify(packageData, null, 2));

    // Validate transport request is provided
    if (!packageData.transport_request || packageData.transport_request.includes('<YOUR_')) {
      console.error('\n❌ Please update transport_request in test-config.yaml with a real transport number');
      console.log('💡 You can create a transport using test-create-transport.js');
      return;
    }

    // Call CreatePackage handler
    console.log('\n🚀 Calling CreatePackage handler...');
    
    const startTime = Date.now();
    const result = await handleCreatePackage(packageData);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Package created successfully in ${duration}ms`);
    console.log('\n📊 Result:');
    
    let parsedResult;
    try {
      // result has MCP format: { isError, content: [{ type, text }] }
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
      console.log(`   Package Name: ${parsedResult.package_name}`);
      console.log(`   Description: ${parsedResult.description}`);
      console.log(`   Super Package: ${parsedResult.super_package}`);
      console.log(`   Package Type: ${parsedResult.package_type}`);
      console.log(`   Software Component: ${parsedResult.software_component}`);
      console.log(`   Transport Layer: ${parsedResult.transport_layer}`);
      console.log(`   Transport Request: ${parsedResult.transport_request}`);
      console.log(`   URI: ${parsedResult.uri}`);

      // Success checks
      const checks = {
        'Package created': parsedResult.success === true,
        'Package name matches': parsedResult.package_name === packageData.package_name,
        'Has description': !!parsedResult.description,
        'Has super package': !!parsedResult.super_package,
        'Has transport request': !!parsedResult.transport_request,
        'Has URI': !!parsedResult.uri
      };

      console.log('\n🔍 Validation Checks:');
      for (const [check, passed] of Object.entries(checks)) {
        console.log(`   ${passed ? '✅' : '❌'} ${check}`);
      }

      const allPassed = Object.values(checks).every(v => v);
      if (allPassed) {
        console.log('\n🎉 All checks passed! Package is ready to use.');
        console.log(`\n💡 You can now create objects in package: ${parsedResult.package_name}`);
        console.log(`   Example: CreateClass with package_name="${parsedResult.package_name}"`);
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
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testCreatePackage().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

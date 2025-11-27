/**
 * Test CreateTransport handler
 * Tests creating transport requests
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  printTestHeader,
  printTestParams,
  printTestResult,
  updateTransportRequestInConfig
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreateTransport } = require('../../dist/handlers/transport/high/handleCreateTransport');

async function testCreateTransport() {
  const testCases = getAllEnabledTestCases('create_transport');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('CreateTransport', testCase);
    const params = testCase.params;

    // Add timestamp to description for uniqueness
    const transportData = {
      ...params,
      description: params.description + " - " + new Date().toISOString()
    };

    printTestParams(transportData);
    console.log('--- Creating transport request ---\n');

    try {
      const result = await handleCreateTransport(transportData);

      if (printTestResult(result, 'CreateTransport')) {
        passedTests++;

        // Extract transport number and update test-config.yaml
        try {
          if (result.content && result.content[0] && result.content[0].text) {
            const parsedResult = JSON.parse(result.content[0].text);
            if (parsedResult.transport_request) {
              const transportNumber = parsedResult.transport_request;
              console.log(`\n💡 Transport number created: ${transportNumber}`);

              // Automatically update test-config.yaml with the transport number
              if (updateTransportRequestInConfig(transportNumber)) {
                console.log(`   ✅ test-config.yaml updated - transport_request values replaced`);
                console.log(`   ✅ You can now run other tests that require transport_request`);
              } else {
                console.log(`   ⚠️  Could not update test-config.yaml automatically`);
                console.log(`   📝 Please manually update transport_request: "${transportNumber}" in test-config.yaml`);
              }
            }
          }
        } catch (e) {
          console.warn(`\n⚠️  Could not extract transport number from result:`, e.message);
        }
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error:');
      console.error(error);
      failedTests++;
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total:  ${testCases.length}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run the test
testCreateTransport()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

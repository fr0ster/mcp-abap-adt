/**
 * Test CreatePackage handler
 * Tests creating ABAP packages
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  validateTransportRequest,
  printTestHeader,
  printTestParams,
  printTestResult,
  waitForConfirmation
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleCreatePackage } = require('../dist/handlers/package/high/handleCreatePackage');

async function testCreatePackage() {
  const testCases = getAllEnabledTestCases('create_package');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('CreatePackage', testCase);
    const params = testCase.params;

    // Validate transport request
    if (!validateTransportRequest(params)) {
      await waitForConfirmation(
        '⚠️  Using default transport request! Update test-config.yaml with a valid request.',
        5
      );
    }

    printTestParams(params);
    console.log('--- Creating package ---\n');

    try {
      const result = await handleCreatePackage(params);

      if (printTestResult(result, 'CreatePackage')) {
        passedTests++;

        // Try to extract package name from result for user reference
        try {
          if (result.content && result.content[0] && result.content[0].text) {
            const parsedResult = JSON.parse(result.content[0].text);
            if (parsedResult.package_name) {
              console.log(`\n💡 Package created: ${parsedResult.package_name}`);
              console.log(`   Use this package in other tests that require package_name`);
            }
          }
        } catch (e) {
          // Ignore parsing errors
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
testCreatePackage()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

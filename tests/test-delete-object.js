/**
 * Test DeleteObject handler
 *
 * Tests object deletion via ADT API.
 * Configuration is loaded from tests/test-config.yaml
 *
 * Prerequisites:
 * - Test objects to delete (will be created in test)
 * - Transport request configured in test-config.yaml
 *
 * Usage:
 * node tests/test-delete-object.js
 */

const {
  initializeTestEnvironment,
  getAllEnabledTestCases,
  printTestHeader,
  printTestParams,
  printTestResult
} = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleDeleteObject } = require('../dist/handlers/common/low/handleDeleteObject');



/**
 * Main test runner
 */
async function runTests() {
  const testCases = getAllEnabledTestCases('delete_object');

  console.log(`\n📋 Found ${testCases.length} enabled test case(s)\n`);

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    printTestHeader('DeleteObject', testCase);
    const params = testCase.params;

    // Map test-specific parameter names to handler parameter names
    const mappedParams = {};

    // Map object name based on test case name
    if (testCase.name.includes('class')) {
      mappedParams.object_name = params.test_class_name;
      mappedParams.object_type = 'CLAS/OC';
    } else if (testCase.name.includes('interface')) {
      mappedParams.object_name = params.test_interface_name;
      mappedParams.object_type = 'INTF/OI';
    } else if (testCase.name.includes('program')) {
      mappedParams.object_name = params.test_program_name;
      mappedParams.object_type = 'PROG/P';
    } else if (testCase.name.includes('data_element')) {
      mappedParams.object_name = params.test_data_element_name;
      mappedParams.object_type = 'DTEL/DE';
    } else if (testCase.name.includes('domain')) {
      mappedParams.object_name = params.test_domain_name;
      mappedParams.object_type = 'DOMA/DM';
    } else if (testCase.name.includes('function_module')) {
      mappedParams.object_name = params.test_function_module_name;
      mappedParams.object_type = 'FUGR/FF';
      mappedParams.function_group_name = params.test_function_group_name;
    } else if (testCase.name.includes('function_group')) {
      mappedParams.object_name = params.test_function_group_name;
      mappedParams.object_type = 'FUGR/F';
    }

    // Copy transport_request and package_name if present
    if (params.transport_request) {
      mappedParams.transport_request = params.transport_request;
    }

    printTestParams(mappedParams);
    console.log('--- Starting object deletion flow ---\n');

    try {
      const result = await handleDeleteObject(mappedParams);

      if (printTestResult(result, 'DeleteObject')) {
        passedTests++;
      } else {
        failedTests++;
      }

    } catch (error) {
      console.error('❌ Unexpected error during object deletion:');
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

// Run tests
runTests()
  .then(() => {
    console.log('\n=== All tests completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Tests failed ===');
    console.error(error);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Universal test runner for MCP ABAP ADT handlers
 * Runs all enabled tests from test-config.yaml
 *
 * Usage:
 *   node tests/run-all-tests.js                    # Run all enabled tests
 *   node tests/run-all-tests.js create_domain      # Run specific handler test
 *   node tests/run-all-tests.js --list             # List all available tests
 */

const {
  initializeTestEnvironment,
  loadTestConfig,
  getTestSettings,
  printTestHeader,
  printTestParams,
  printTestResult,
  validateTransportRequest,
  waitForConfirmation
} = require('./test-helper');

// Initialize test environment before importing handlers
initializeTestEnvironment();

// Map handler names to their handler functions
const HANDLER_MAP = {
  // Transport
  'create_transport': () => require('../dist/handlers/transport/high/handleCreateTransport').handleCreateTransport,
  'get_transport': () => require('../dist/handlers/transport/readonly/handleGetTransport').handleGetTransport,

  // Package
  'create_package': () => require('../dist/handlers/package/high/handleCreatePackage').handleCreatePackage,
  'get_package': () => require('../dist/handlers/package/readonly/handleGetPackage').handleGetPackage,

  // Domain
  'create_domain': () => require('../dist/handlers/domain/high/handleCreateDomain').handleCreateDomain,
  'update_domain': () => require('../dist/handlers/domain/high/handleUpdateDomain').handleUpdateDomain,
  'get_domain': () => require('../dist/handlers/domain/readonly/handleGetDomain').handleGetDomain,

  // Data Element
  'create_data_element': () => require('../dist/handlers/data_element/high/handleCreateDataElement').handleCreateDataElement,
  'update_data_element': () => require('../dist/handlers/data_element/high/handleUpdateDataElement').handleUpdateDataElement,
  'get_data_element': () => require('../dist/handlers/data_element/readonly/handleGetDataElement').handleGetDataElement,

  // Class
  'create_class': () => require('../dist/handlers/class/high/handleCreateClass').handleCreateClass,
  'update_class_high': () => require('../dist/handlers/class/high/handleUpdateClass').handleUpdateClass,
  'get_class': () => require('../dist/handlers/class/readonly/handleGetClass').handleGetClass,

  // Program
  'create_program': () => require('../dist/handlers/program/high/handleCreateProgram').handleCreateProgram,
  'update_program_high': () => require('../dist/handlers/program/high/handleUpdateProgram').handleUpdateProgram,
  'get_program': () => require('../dist/handlers/program/readonly/handleGetProgram').handleGetProgram,

  // Interface
  'create_interface': () => require('../dist/handlers/interface/high/handleCreateInterface').handleCreateInterface,
  'update_interface_high': () => require('../dist/handlers/interface/high/handleUpdateInterface').handleUpdateInterface,
  'get_interface': () => require('../dist/handlers/interface/readonly/handleGetInterface').handleGetInterface,

  // Table
  'create_table': () => require('../dist/handlers/table/high/handleCreateTable').handleCreateTable,
  'get_table': () => require('../dist/handlers/table/readonly/handleGetTable').handleGetTable,
  'get_table_contents': () => require('../dist/handlers/table/readonly/handleGetTableContents').handleGetTableContents,

  // Structure
  'create_structure': () => require('../dist/handlers/structure/high/handleCreateStructure').handleCreateStructure,
  'get_structure': () => require('../dist/handlers/structure/readonly/handleGetStructure').handleGetStructure,

  // View
  'create_view': () => require('../dist/handlers/view/high/handleCreateView').handleCreateView,
  'update_view_high': () => require('../dist/handlers/view/high/handleUpdateView').handleUpdateView,
  'get_view': () => require('../dist/handlers/view/readonly/handleGetView').handleGetView,

  // Function Group
  'create_function_group': () => require('../dist/handlers/function/high/handleCreateFunctionGroup').handleCreateFunctionGroup,
  'get_function_group': () => require('../dist/handlers/function/readonly/handleGetFunctionGroup').handleGetFunctionGroup,

  // Function Module
  'create_function_module': () => require('../dist/handlers/function/high/handleCreateFunctionModule').handleCreateFunctionModule,
  'update_function_module_high': () => require('../dist/handlers/function/high/handleUpdateFunctionModule').handleUpdateFunctionModule,
  'get_function_test': () => require('../dist/handlers/function/readonly/handleGetFunction').handleGetFunction,
  'get_function': () => require('../dist/handlers/function/readonly/handleGetFunction').handleGetFunction,

  // Delete - Individual handlers for each object type
  'delete_domain': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_data_element': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_class': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_program': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_interface': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_function_module': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_function_group': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject,
  'delete_object': () => require('../dist/handlers/common/low/handleDeleteObject').handleDeleteObject, // Legacy support

  // Get operations
  'get_type_info': () => require('../dist/handlers/system/readonly/handleGetTypeInfo').handleGetTypeInfo,
  'get_prog_full_code': () => require('../dist/handlers/program/readonly/handleGetProgFullCode').handleGetProgFullCode,
  'get_includes_list': () => require('../dist/handlers/include/readonly/handleGetIncludesList').handleGetIncludesList,
  'get_objects_list': () => require('../dist/handlers/search/readonly/handleGetObjectsList').handleGetObjectsList,
  'get_object_structure': () => require('../dist/handlers/system/readonly/handleGetObjectStructure').handleGetObjectStructure,
  'get_transaction': () => require('../dist/handlers/system/readonly/handleGetTransaction').handleGetTransaction,
  'get_enhancements': () => require('../dist/handlers/enhancement/readonly/handleGetEnhancements').handleGetEnhancements,
  'get_include': () => require('../dist/handlers/include/readonly/handleGetInclude').handleGetInclude,

  // Search and Query
  'get_sql_query': () => require('../dist/handlers/system/readonly/handleGetSqlQuery').handleGetSqlQuery,
  'search_object': () => require('../dist/handlers/search/readonly/handleSearchObject').handleSearchObject,
  'get_where_used': () => require('../dist/handlers/system/readonly/handleGetWhereUsed').handleGetWhereUsed,
  'get_object_info': () => require('../dist/handlers/system/readonly/handleGetObjectInfo').handleGetObjectInfo,

  // Analysis
  'get_abap_ast': () => require('../dist/handlers/system/readonly/handleGetAbapAST').handleGetAbapAST,
  'get_abap_semantic_analysis': () => require('../dist/handlers/system/readonly/handleGetAbapSemanticAnalysis').handleGetAbapSemanticAnalysis,

  // Activation and Check
  'activate_object': () => require('../dist/handlers/common/low/handleActivateObject').handleActivateObject,
  'check_object': () => require('../dist/handlers/common/low/handleCheckObject').handleCheckObject,
};

/**
 * List all available tests
 */
function listAvailableTests() {
  const config = loadTestConfig();

  console.log('\n=== Available Tests ===\n');

  for (const [handlerName, handlerConfig] of Object.entries(config)) {
    if (handlerName === 'environment' || handlerName === 'test_settings') {
      continue;
    }

    const testCases = handlerConfig.test_cases || [];
    const enabledCount = testCases.filter(tc => tc.enabled).length;

    console.log(`${handlerName}:`);
    console.log(`  Total test cases: ${testCases.length}`);
    console.log(`  Enabled: ${enabledCount}`);

    testCases.forEach((tc, idx) => {
      const status = tc.enabled ? '✅' : '⭕';
      console.log(`    ${status} [${idx + 1}] ${tc.name}: ${tc.description || 'N/A'}`);
    });
    console.log();
  }
}

/**
 * Cleanup object before create (delete if exists, ignore errors)
 */
async function cleanupObject(handlerName, testArgs) {
  // Map create handlers to delete handlers and extract object info
  const cleanupMap = {
    'create_domain': {
      deleteHandler: 'delete_domain',
      getParams: (args) => ({
        object_name: args.domain_name,
        object_type: 'DOMA/DM',
        package_name: args.package_name
      })
    },
    'create_data_element': {
      deleteHandler: 'delete_data_element',
      getParams: (args) => ({
        object_name: args.data_element_name,
        object_type: 'DTEL/DE',
        package_name: args.package_name
      })
    },
    'create_class': {
      deleteHandler: 'delete_class',
      getParams: (args) => ({
        object_name: args.class_name,
        object_type: 'CLAS/OC',
        package_name: args.package_name
      })
    },
    'create_program': {
      deleteHandler: 'delete_program',
      getParams: (args) => ({
        object_name: args.program_name,
        object_type: 'PROG/P',
        package_name: args.package_name
      })
    },
    'create_interface': {
      deleteHandler: 'delete_interface',
      getParams: (args) => ({
        object_name: args.interface_name,
        object_type: 'INTF/OI',
        package_name: args.package_name
      })
    },
    'create_function_module': {
      deleteHandler: 'delete_function_module',
      getParams: (args) => ({
        object_name: args.function_module_name,
        object_type: 'FUGR/FF',
        function_group_name: args.function_group_name,
        package_name: args.package_name
      })
    },
    'create_function_group': {
      deleteHandler: 'delete_function_group',
      getParams: (args) => ({
        object_name: args.function_group_name,
        object_type: 'FUGR/F',
        package_name: args.package_name
      })
    }
  };

  const cleanup = cleanupMap[handlerName];
  if (!cleanup) {
    return; // No cleanup needed for this handler
  }

  const deleteHandlerLoader = HANDLER_MAP[cleanup.deleteHandler];
  if (!deleteHandlerLoader) {
    return; // Delete handler not found
  }

  const deleteHandler = deleteHandlerLoader();
  const deleteParams = cleanup.getParams(testArgs);

  try {
    console.log(`🧹 Cleanup: Attempting to delete ${deleteParams.object_name} (${deleteParams.object_type})...`);
    await deleteHandler(deleteParams);
    console.log(`✅ Cleanup: Object deleted (or didn't exist)\n`);
  } catch (error) {
    // Ignore errors - object might not exist
    console.log(`ℹ️  Cleanup: Object doesn't exist or couldn't be deleted (ignoring)\n`);
  }
}

/**
 * Run a single test case
 */
async function runTestCase(handlerName, testCase) {
  printTestHeader(handlerName, testCase);

  // Get handler function
  const handlerLoader = HANDLER_MAP[handlerName];
  if (!handlerLoader) {
    console.error(`❌ No handler found for: ${handlerName}`);
    return false;
  }

  const handler = handlerLoader();
  const testArgs = testCase.params;

  // Cleanup before create operations
  if (handlerName.startsWith('create_')) {
    await cleanupObject(handlerName, testArgs);
  }

  // Special validation for create_domain
  if (handlerName === 'create_domain') {
    if (!validateTransportRequest(testArgs)) {
      await waitForConfirmation(
        '⚠️  Using default transport request! Update test-config.yaml with a valid request.',
        3
      );
    }
  }

  printTestParams(testArgs);

  console.log(`--- Running ${handlerName} ---\n`);

  try {
    const result = await handler(testArgs);
    return printTestResult(result, handlerName);
  } catch (error) {
    console.error(`❌ ${handlerName} test FAILED with exception:`);
    console.error(error);
    return false;
  }
}

/**
 * Run all enabled tests for a specific handler
 */
async function runHandlerTests(handlerName, settings) {
  const config = loadTestConfig();
  const handlerConfig = config[handlerName];

  if (!handlerConfig || !handlerConfig.test_cases) {
    console.error(`❌ No test configuration found for: ${handlerName}`);
    return { total: 0, passed: 0, failed: 0 };
  }

  const enabledTests = handlerConfig.test_cases.filter(tc => tc.enabled);

  if (enabledTests.length === 0) {
    console.warn(`⚠️  No enabled tests found for: ${handlerName}`);
    return { total: 0, passed: 0, failed: 0 };
  }

  let passed = 0;
  let failed = 0;

  for (const testCase of enabledTests) {
    const success = await runTestCase(handlerName, testCase);

    if (success) {
      passed++;
    } else {
      failed++;
      if (settings.fail_fast) {
        console.error('\n⚠️  Fail-fast enabled, stopping tests');
        break;
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');
  }

  return { total: enabledTests.length, passed, failed };
}

/**
 * Run all enabled tests from config
 */
async function runAllTests() {
  const config = loadTestConfig();
  const settings = getTestSettings();

  console.log('\n' + '='.repeat(60));
  console.log('Running All Enabled Tests');
  console.log('='.repeat(60) + '\n');

  const results = {
    handlers: 0,
    totalTests: 0,
    passed: 0,
    failed: 0
  };

  for (const [handlerName, handlerConfig] of Object.entries(config)) {
    // Skip meta sections
    if (handlerName === 'environment' || handlerName === 'test_settings') {
      continue;
    }

    // Skip if no enabled tests
    const enabledTests = handlerConfig.test_cases?.filter(tc => tc.enabled) || [];
    if (enabledTests.length === 0) {
      continue;
    }

    results.handlers++;

    const handlerResults = await runHandlerTests(handlerName, settings);
    results.totalTests += handlerResults.total;
    results.passed += handlerResults.passed;
    results.failed += handlerResults.failed;

    if (settings.fail_fast && handlerResults.failed > 0) {
      break;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Handlers tested: ${results.handlers}`);
  console.log(`Total tests: ${results.totalTests}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('='.repeat(60) + '\n');

  return results.failed === 0;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Handle --list flag
  if (args.includes('--list')) {
    listAvailableTests();
    process.exit(0);
  }

  // Handle specific handler test
  if (args.length > 0 && !args[0].startsWith('--')) {
    const input = args[0];
    const settings = getTestSettings();

    // Check if format is handler:index
    if (input.includes(':')) {
      const [handlerName, indexStr] = input.split(':');
      const testIndex = parseInt(indexStr, 10);

      if (isNaN(testIndex) || testIndex < 1) {
        console.error(`❌ Invalid test index: ${indexStr}`);
        process.exit(1);
      }

      // Run specific test case by index
      const config = loadTestConfig();
      const handlerConfig = config[handlerName];

      if (!handlerConfig || !handlerConfig.test_cases) {
        console.error(`❌ No test configuration found for: ${handlerName}`);
        process.exit(1);
      }

      const testCase = handlerConfig.test_cases[testIndex - 1];

      if (!testCase) {
        console.error(`❌ Test case #${testIndex} not found for ${handlerName}`);
        console.error(`Available test cases: 1-${handlerConfig.test_cases.length}`);
        process.exit(1);
      }

      const success = await runTestCase(handlerName, testCase);
      console.log(`\n${success ? '✅' : '❌'} Test ${success ? 'PASSED' : 'FAILED'}`);
      process.exit(success ? 0 : 1);
    }

    // Run all tests for the handler
    const handlerName = input;
    const results = await runHandlerTests(handlerName, settings);

    console.log(`\n✅ Passed: ${results.passed}/${results.total}`);
    process.exit(results.failed === 0 ? 0 : 1);
  }

  // Run all tests
  const success = await runAllTests();
  process.exit(success ? 0 : 1);
}

// Run main
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

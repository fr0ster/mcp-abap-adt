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
  'create_domain': () => require('../dist/handlers/handleCreateDomain').handleCreateDomain,
  'get_class': () => require('../dist/handlers/handleGetClass').handleGetClass,
  'get_table': () => require('../dist/handlers/handleGetTable').handleGetTable,
  'get_table_contents': () => require('../dist/handlers/handleGetTableContents').handleGetTableContents,
  'get_package': () => require('../dist/handlers/handleGetPackage').handleGetPackage,
  'search_object': () => require('../dist/handlers/handleSearchObject').handleSearchObject,
  'get_sql_query': () => require('../dist/handlers/handleGetSqlQuery').handleGetSqlQuery,
  'get_where_used': () => require('../dist/handlers/handleGetWhereUsed').handleGetWhereUsed,
  'get_object_info': () => require('../dist/handlers/handleGetObjectInfo').handleGetObjectInfo,
  'get_abap_ast': () => require('../dist/handlers/handleGetAbapAST').handleGetAbapAST,
  'get_abap_semantic_analysis': () => require('../dist/handlers/handleGetAbapSemanticAnalysis').handleGetAbapSemanticAnalysis,
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

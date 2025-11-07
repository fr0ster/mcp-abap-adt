/**
 * Test script for SearchObject handler
 * Configuration loaded from tests/test-config.yaml
 */

const {
  initializeTestEnvironment,
  getEnabledTestCase,
  printTestHeader,
  printTestParams,
  printTestResult
} = require('./test-helper');

// Initialize test environment before importing handlers
initializeTestEnvironment();

const { handleSearchObject } = require('../dist/handlers/handleSearchObject');

async function runTest() {
  try {
    // Load test case from YAML (or use command line arg)
    let testArgs;
    
    if (process.argv[2]) {
      // Command line argument takes precedence
      testArgs = {
        object_name: process.argv[2],
        object_type: process.argv[3] || undefined,
        maxResults: process.argv[4] ? parseInt(process.argv[4], 10) : 10
      };
      console.log('Using command line arguments');
      printTestParams(testArgs);
    } else {
      // Load from YAML config
      const testCase = getEnabledTestCase('search_object');
      printTestHeader('SearchObject', testCase);
      testArgs = testCase.params;
      printTestParams(testArgs);
    }

    const result = await handleSearchObject(testArgs);
    
    if (!printTestResult(result, 'SearchObject')) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ SearchObject ERROR:', err.status, err.body?.error?.message || err.message);
    process.exit(1);
  }
}

runTest();

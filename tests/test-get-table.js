/**
 * Test script for GetTable handler
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

const { handleGetTable } = require('../dist/handlers/handleGetTable');

async function main() {
  try {
    // Load test case from YAML (or use command line arg)
    let testArgs;
    
    if (process.argv[2]) {
      // Command line argument takes precedence
      testArgs = {
        table_name: process.argv[2],
        filePath: process.argv[3] || undefined
      };
      console.log('Using command line arguments');
      printTestParams(testArgs);
    } else {
      // Load from YAML config
      const testCase = getEnabledTestCase('get_table');
      printTestHeader('GetTable', testCase);
      testArgs = testCase.params;
      printTestParams(testArgs);
    }

    const result = await handleGetTable(testArgs);
    
    if (!printTestResult(result, 'GetTable')) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e);
    process.exit(1);
  }
}

main();

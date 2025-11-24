/**
 * Test script for GetSqlQuery handler
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

const { handleGetSqlQuery } = require('../dist/handlers/system/low/handleGetSqlQuery');

async function main() {
  try {
    // Load test case from YAML (or use command line arg)
    let testArgs;
    
    if (process.argv[2]) {
      // Command line argument takes precedence
      testArgs = {
        sql_query: process.argv[2],
        row_number: process.argv[3] ? parseInt(process.argv[3], 10) : 5
      };
      console.log('Using command line arguments');
      printTestParams(testArgs);
    } else {
      // Load from YAML config
      const testCase = getEnabledTestCase('get_sql_query');
      printTestHeader('GetSqlQuery', testCase);
      testArgs = testCase.params;
      printTestParams(testArgs);
    }

    const result = await handleGetSqlQuery(testArgs);
    
    if (!printTestResult(result, 'GetSqlQuery')) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e);
    process.exit(1);
  }
}

main();

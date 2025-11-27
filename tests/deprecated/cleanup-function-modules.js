/**
 * Cleanup test function modules before running tests
 * Configuration is loaded from tests/test-config.yaml
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');
initializeTestEnvironment();

const { handleDeleteObject } = require('../../dist/handlers/common/low/handleDeleteObject');

async function cleanup() {
  try {
    const config = loadTestConfig();
    const createFmConfig = config.create_function_module || {};
    
    if (!createFmConfig.function_group_name) {
      console.error('❌ No function module configuration found in test-config.yaml');
      process.exit(1);
    }
    
    const functionGroup = createFmConfig.function_group_name;
    const transport = createFmConfig.transport;
    const testCases = createFmConfig.test_cases || [];
    
    if (testCases.length === 0) {
      console.log('⚠️  No test cases configured for cleanup');
      return;
    }
    
    const modules = testCases
      .map(tc => tc.function_module_name)
      .filter(Boolean);
    
    if (modules.length === 0) {
      console.log('⚠️  No function modules configured for cleanup');
      return;
    }
    
    console.log(`🧹 Cleaning up ${modules.length} test function module(s) from ${functionGroup}...\n`);
    
    for (const module of modules) {
      try {
        const uri = `/sap/bc/adt/functions/groups/${functionGroup.toLowerCase()}/fmodules/${module.toLowerCase()}`;
        console.log(`Deleting ${module}...`);
        
        await handleDeleteObject({
          object_uri: uri,
          object_name: module,
          object_type: 'FUGR/FF',
          function_group_name: functionGroup,
          transport_request: transport
        });
        
        console.log(`✅ ${module} deleted\n`);
      } catch (error) {
        console.log(`⚠️  ${module}: ${error.message}\n`);
      }
    }
    
    console.log('✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Failed to load configuration:', error.message);
    process.exit(1);
  }
}

cleanup().catch(error => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});

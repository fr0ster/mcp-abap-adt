/**
 * Activate function group before testing function modules
 * Configuration is loaded from tests/test-config.yaml
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');
initializeTestEnvironment();

const { handleActivateObject } = require('../dist/handlers/handleActivateObject');

async function activateFunctionGroup(functionGroupName) {
  console.log(`🚀 Activating function group: ${functionGroupName}`);
  
  try {
    const result = await handleActivateObject({
      objects: [
        {
          uri: `/sap/bc/adt/functions/groups/${functionGroupName.toLowerCase()}`,
          name: functionGroupName,
          type: 'FUGR/F'
        }
      ],
      preaudit: true
    });
    
    if (result.isError) {
      console.error(`❌ Activation failed: ${result.content[0].text}`);
      throw new Error(result.content[0].text);
    }
    
    const data = result.content[0].text;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    
    console.log(`✅ Function group activated successfully!`);
    console.log(`   Status: ${parsed.success ? 'Success' : 'Failed'}`);
    console.log(`   Inactive objects: ${parsed.inactive_count || 0}\n`);
    
    return parsed;
  } catch (error) {
    console.error(`❌ Activation failed: ${error.message}\n`);
    throw error;
  }
}

// Load config and activate
try {
  const config = loadTestConfig();
  const createFgConfig = config.create_function_group || {};
  
  if (!createFgConfig.test_cases || createFgConfig.test_cases.length === 0) {
    console.error('❌ No function group configuration found in test-config.yaml');
    console.log('\n📝 Add this to test-config.yaml:');
    console.log(`
create_function_group:
  test_cases:
    - name: "create_test_function_group"
      enabled: true
      params:
        function_group_name: "ZOK_FG_MCP01"
        description: "Test FUGR for MCP"
        transport_request: "E19K905635"
        package_name: "ZOK_LOCAL"
`);
    process.exit(1);
  }
  
  const testCase = createFgConfig.test_cases[0];
  const functionGroupName = testCase.params?.function_group_name;
  
  if (!functionGroupName) {
    console.error('❌ function_group_name not found in test-config.yaml');
    process.exit(1);
  }
  
  activateFunctionGroup(functionGroupName).catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ Failed to load test configuration');
  console.error('   Error:', error.message);
  console.log('\n📝 Create tests/test-config.yaml based on test-config.yaml.template');
  process.exit(1);
}

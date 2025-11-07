const testHelper = require('./test-helper.js');

async function checkTable() {
  try {
    // Initialize environment first
    testHelper.initializeTestEnvironment();
    
    // Now import utils after environment is initialized
    const { getManagedConnection } = require('../dist/lib/utils.js');
    
    const connection = getManagedConnection();
    const baseUrl = await connection.getBaseUrl();
    const url = `${baseUrl}/sap/bc/adt/ddic/tables/ZTST_MCP_TABLE_001`;
    console.log('Checking if table exists:', url);
    const response = await connection.makeAdtRequest({
      url,
      method: 'GET',
      timeout: 10000
    });
    console.log('Table exists with status:', response.status);
    console.log('Response data:', response.data.substring(0, 200));
  } catch (error) {
    console.log('Table check error:', error.response?.status, error.message);
    if (error.response?.status === 404) {
      console.log('✅ Table does not exist - good to create');
    } else {
      console.log('❌ Unexpected error checking table');
    }
  }
}

checkTable();
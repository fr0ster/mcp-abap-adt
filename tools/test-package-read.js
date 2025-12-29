require('dotenv').config();
const { AdtClient } = require('@mcp-abap-adt/adt-clients');
const { createAbapConnection } = require('@mcp-abap-adt/connection');

async function run() {
  if (!process.env.SAP_URL) {
    console.error('SAP_URL not set in .env');
    return;
  }

  try {
    const config = {
      url: process.env.SAP_URL,
      client: process.env.SAP_CLIENT,
      authType: process.env.SAP_AUTH_TYPE || 'basic',
      username: process.env.SAP_USERNAME,
      password: process.env.SAP_PASSWORD,
      jwtToken: process.env.SAP_JWT_TOKEN,
    };

    const logger = {
      debug: console.log,
      info: console.log,
      warn: console.warn,
      error: console.error,
    };

    const connection = createAbapConnection(config, logger);
    const client = new AdtClient(connection, logger);
    
    // Use a common package, e.g., $TMP or ZLOCAL, or from env
    const packageName = process.env.TEST_PACKAGE || '$TMP';
    console.log(`Reading package: ${packageName}`);

    const result = await client.getPackage().read({ packageName: packageName });
    
    console.log('Result keys:', Object.keys(result));
    if (result.readResult) {
      console.log('Read result data:', result.readResult.data);
    } else {
      console.log('No readResult found');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
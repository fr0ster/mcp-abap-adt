/**
 * Test script for validating handleGetProgFullCode with the standard SAP object SAPMV45A.
 * Uses only standard objects that exist in every system.
 */

const { handleGetProgFullCode } = require('../dist/handlers/handleGetProgFullCode');

async function runTest() {
  const params = {
    name: 'SAPMV45A',
    type: 'PROG/P'
  };
  try {
    const result = await handleGetProgFullCode(params);
    if (result.isError) {
      console.error('ERROR:', result.content && result.content[0] && result.content[0].text);
      process.exit(1);
    }
    console.log('RESULT:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

runTest();

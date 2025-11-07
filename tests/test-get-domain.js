/**
 * Test script to get domain structure via ADT
 */

const { initializeTestEnvironment } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { makeAdtRequestWithTimeout, getBaseUrl, encodeSapObjectName } = require('../dist/lib/utils');
const { XMLParser } = require('fast-xml-parser');

async function getDomain(domainName) {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml'
  };
  
  console.log(`Getting domain: ${domainName}`);
  console.log(`URL: ${url}\n`);
  
  const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);
  
  console.log('=== RAW XML Response ===');
  console.log(response.data);
  console.log('\n=== Parsed Domain ===');
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  
  const result = parser.parse(response.data);
  const domain = result['doma:domain'];
  
  console.log(JSON.stringify(domain, null, 2));
  
  return domain;
}

// Run test
getDomain('ZZ_TEST_MCP_25')
  .then(() => {
    console.log('\n✅ Domain retrieved successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  });

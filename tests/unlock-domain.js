/**
 * Utility to unlock a locked domain
 * Usage: node tests/unlock-domain.js ZZ_TEST_MCP_01
 */

// Set environment variable to skip MCP auto-start
process.env.MCP_SKIP_AUTO_START = 'true';

const { makeAdtRequestWithTimeout, getBaseUrl, encodeSapObjectName } = require('../dist/lib/utils');
const crypto = require('crypto');

// Load environment
require('dotenv').config({ path: 'e19.env' });

async function unlockDomain(domainName, providedLockHandle) {
  try {
    const baseUrl = await getBaseUrl();
    const sessionId = crypto.randomUUID().replace(/-/g, '');
    const requestId = crypto.randomUUID().replace(/-/g, '');
    
    let lockHandle = providedLockHandle;
    
    // If no lock handle provided, try to get it by locking
    if (!lockHandle) {
      // Step 1: Lock the domain to get lock handle
      const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
      const lockUrl = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=LOCK&accessMode=MODIFY`;
      
      console.log(`Locking domain ${domainName} to get lock handle...`);
      
      const headers = {
        'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
        'X-sap-adt-profiling': 'server-time',
        'X-sap-adt-sessiontype': 'stateful',
        'sap-adt-connection-id': sessionId,
        'sap-adt-request-id': requestId
      };
      
      const lockResponse = await makeAdtRequestWithTimeout(lockUrl, 'POST', 'default', null, undefined, headers);
      
      // Parse lock response to get lock handle
      const XMLParser = require('fast-xml-parser').XMLParser;
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
      });
      
      const result = parser.parse(lockResponse.data);
      lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
      
      if (!lockHandle) {
        console.error('Failed to get lock handle from response');
        console.log('Response:', lockResponse.data);
        return;
      }
      
      console.log(`Lock handle: ${lockHandle}`);
    } else {
      console.log(`Using provided lock handle: ${lockHandle}`);
    }
    
    // Step 2: Unlock
    const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
    const unlockUrl = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=UNLOCK&lockHandle=${lockHandle}`;
    
    console.log(`Unlocking domain ${domainName}...`);
    
    const unlockHeaders = {
      'X-sap-adt-profiling': 'server-time',
      'X-sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, '')
    };
    
    await makeAdtRequestWithTimeout(unlockUrl, 'POST', 'default', null, undefined, unlockHeaders);
    
    console.log(`✅ Domain ${domainName} unlocked successfully!`);
    
  } catch (error) {
    console.error('❌ Failed to unlock domain:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

// Get domain name from command line
const domainName = process.argv[2];
const lockHandle = process.argv[3]; // Optional lock handle

if (!domainName) {
  console.error('Usage: node tests/unlock-domain.js <DOMAIN_NAME> [LOCK_HANDLE]');
  console.error('Example: node tests/unlock-domain.js ZZ_TEST_MCP_01');
  console.error('Example with lock handle: node tests/unlock-domain.js ZZ_TEST_MCP_01 38185D812ADA94614D210B068DC52482EE3EBCC3');
  process.exit(1);
}

unlockDomain(domainName, lockHandle);

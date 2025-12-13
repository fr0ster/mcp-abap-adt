#!/usr/bin/env node
/**
 * Utility script to unlock all test objects from .locks/active-locks.json
 *
 * Usage:
 *   node bin/unlock-test-objects.js [options]
 *   adt-unlock-objects [options]
 *
 * Options:
 *   --locks-dir <path>    Lock registry directory (default: .locks)
 *   --env <path>          Path to .env file (default: .env)
 *   -h, --help            Show help message
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🔓 Unlock Test Objects - Utility to unlock all objects from lock registry

Usage:
  node bin/unlock-test-objects.js [options]
  adt-unlock-objects [options]

Options:
  --locks-dir <path>    Lock registry directory (default: .locks)
  --env <path>          Path to .env file (default: .env)
  -h, --help            Show this help message

Description:
  This utility reads all active locks from .locks/active-locks.json and attempts
  to unlock them on the SAP server. After successful unlock, locks are removed
  from the registry.

  The script uses JWT auto-refresh if refresh credentials are available in .env.

Environment Variables (from .env):
  SAP_URL              - SAP system URL
  SAP_CLIENT           - SAP client (optional)
  SAP_AUTH_TYPE        - Authentication type: basic, jwt, xsuaa
  SAP_JWT_TOKEN        - JWT token (for jwt/xsuaa auth)
  SAP_REFRESH_TOKEN     - Refresh token (optional, for auto-refresh)
  SAP_UAA_URL          - UAA URL (optional, for auto-refresh)
  SAP_UAA_CLIENT_ID    - UAA client ID (optional, for auto-refresh)
  SAP_UAA_CLIENT_SECRET - UAA client secret (optional, for auto-refresh)
  SAP_USERNAME         - Username (for basic auth)
  SAP_PASSWORD         - Password (for basic auth)
`);
  process.exit(0);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    locksDir: '.locks',
    envPath: '.env'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--locks-dir' && i + 1 < args.length) {
      options.locksDir = args[++i];
    } else if (arg === '--env' && i + 1 < args.length) {
      options.envPath = args[++i];
    }
  }

  return options;
}

// Load environment
const options = parseArgs();
const envPath = process.env.MCP_ENV_PATH || path.resolve(__dirname, '..', options.envPath);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const { createAbapConnection } = require('@mcp-abap-adt/connection');
const { LockStateManager } = require('../src/utils/lockStateManager');
const { unlockClass } = require('@mcp-abap-adt/adt-clients/core/class/unlock');
const { unlockInterface } = require('@mcp-abap-adt/adt-clients/core/interface/unlock');
const { unlockProgram } = require('@mcp-abap-adt/adt-clients/core/program/unlock');
const { unlockFunctionModule } = require('@mcp-abap-adt/adt-clients/core/functionModule/unlock');
const { unlockDomain } = require('@mcp-abap-adt/adt-clients/core/domain/unlock');
const { unlockDataElement } = require('@mcp-abap-adt/adt-clients/core/dataElement/unlock');
const { unlockDDLS } = require('@mcp-abap-adt/adt-clients/core/view/unlock');
const { unlockStructure } = require('@mcp-abap-adt/adt-clients/core/structure/unlock');
const { unlockTable } = require('@mcp-abap-adt/adt-clients/core/table/unlock');
const { unlockPackage } = require('@mcp-abap-adt/adt-clients/core/package/unlock');

function getConfig() {
  const rawUrl = process.env.SAP_URL;
  const url = rawUrl ? rawUrl.split('#')[0].trim() : rawUrl;
  const rawClient = process.env.SAP_CLIENT;
  const client = rawClient ? rawClient.split('#')[0].trim() : rawClient;
  const rawAuthType = process.env.SAP_AUTH_TYPE || 'basic';
  const authType = rawAuthType.split('#')[0].trim();

  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(`Missing or invalid SAP_URL: ${url}`);
  }

  const config = {
    url,
    authType: authType === 'xsuaa' ? 'jwt' : authType,
  };

  if (client) {
    config.client = client;
  }

  if (authType === 'jwt' || authType === 'xsuaa') {
    const jwtToken = process.env.SAP_JWT_TOKEN;
    if (!jwtToken) {
      throw new Error('Missing SAP_JWT_TOKEN for JWT authentication');
    }
    config.jwtToken = jwtToken;

    // Add refresh credentials if available (for auto-refresh)
    if (process.env.SAP_REFRESH_TOKEN) {
      config.refreshToken = process.env.SAP_REFRESH_TOKEN;
    }
    if (process.env.SAP_UAA_URL) {
      config.uaaUrl = process.env.SAP_UAA_URL;
    }
    if (process.env.SAP_UAA_CLIENT_ID) {
      config.uaaClientId = process.env.SAP_UAA_CLIENT_ID;
    }
    if (process.env.SAP_UAA_CLIENT_SECRET) {
      config.uaaClientSecret = process.env.SAP_UAA_CLIENT_SECRET;
    }
  } else {
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing SAP_USERNAME or SAP_PASSWORD for basic authentication');
    }
    config.username = username;
    config.password = password;
  }

  return config;
}

/**
 * Unlock object based on type
 */
async function unlockObject(connection, lock) {
  const { objectType, objectName, functionGroupName, lockHandle, sessionId } = lock;

  switch (objectType) {
    case 'class':
      return await unlockClass(connection, objectName, lockHandle, sessionId);
    case 'interface':
      return await unlockInterface(connection, objectName, lockHandle, sessionId);
    case 'program':
      return await unlockProgram(connection, objectName, lockHandle, sessionId);
    case 'fm':
      if (!functionGroupName) {
        throw new Error(`Function group name required for FM: ${objectName}`);
      }
      return await unlockFunctionModule(connection, functionGroupName, objectName, lockHandle, sessionId);
    case 'domain':
      return await unlockDomain(connection, objectName, lockHandle, sessionId);
    case 'dataElement':
      return await unlockDataElement(connection, objectName, lockHandle, sessionId);
    case 'view':
      return await unlockDDLS(connection, objectName, lockHandle, sessionId);
    case 'structure':
      return await unlockStructure(connection, objectName, lockHandle, sessionId);
    case 'table':
      return await unlockTable(connection, objectName, lockHandle, sessionId);
    case 'package':
      return await unlockPackage(connection, objectName, lockHandle, sessionId);
    default:
      throw new Error(`Unknown object type: ${objectType}`);
  }
}

function formatLockInfo(lock) {
  const objectId = lock.functionGroupName
    ? `${lock.functionGroupName}/${lock.objectName}`
    : lock.objectName;
  return `${lock.objectType.toUpperCase()}: ${objectId}`;
}

async function unlockTestObjects() {
  try {
    const config = getConfig();
    const connection = createAbapConnection(config, console);

    // Load lock registry
    const lockManager = new LockStateManager(options.locksDir);
    const locks = lockManager.getAllLocks();

    if (locks.length === 0) {
      console.log('✅ No active locks found in registry');
      return;
    }

    console.log(`🔓 Found ${locks.length} lock(s) in registry\n`);

    let successCount = 0;
    let failCount = 0;

    // Connection will auto-connect on first request (with JWT refresh if needed)
    for (const lock of locks) {
      try {
        const lockInfo = formatLockInfo(lock);
        console.log(`Attempting to unlock ${lockInfo}...`);

        await unlockObject(connection, lock);

        // Remove from registry after successful unlock
        lockManager.removeLock(lock.objectType, lock.objectName, lock.functionGroupName);

        console.log(`✅ Unlocked: ${lockInfo}\n`);
        successCount++;
      } catch (error) {
        const lockInfo = formatLockInfo(lock);
        console.log(`❌ Failed to unlock ${lockInfo}: ${error.message}\n`);
        failCount++;

        // Don't remove from registry if unlock failed - might be locked by another session
        // User can manually clean up later
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Successfully unlocked: ${successCount}`);
    console.log(`   ❌ Failed to unlock: ${failCount}`);

    if (failCount > 0) {
      console.log('\n💡 Note: Failed unlocks may be locked by another session or already unlocked.');
      console.log('   You can check with: adt-manage-locks list');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

unlockTestObjects();

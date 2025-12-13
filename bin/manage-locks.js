#!/usr/bin/env node
/**
 * CLI utility to manage persistent locks
 *
 * Usage:
 *   adt-manage-locks [options] <command>
 *
 * Commands:
 *   list              Show all active locks
 *   cleanup           Remove stale locks from registry
 *   unlock <type> <name> [group]  Unlock object on SAP server
 *   clear             Clear all locks from registry
 *   help              Show this help message
 *
 * Options:
 *   --locks-dir <path>    Directory with lock files (default: .locks)
 *   --env <path>          Path to .env file (default: .env)
 *   --help, -h            Show help
 *
 * Examples:
 *   adt-manage-locks list
 *   adt-manage-locks --locks-dir /custom/path list
 *   adt-manage-locks unlock class ZCL_TEST
 *   adt-manage-locks unlock fm ZOK_TEST_FM_01 ZOK_TEST_FG_01
 *
 * Environment variables (from .env):
 *   SAP_URL           SAP system URL
 *   SAP_CLIENT        SAP client number
 *   SAP_USERNAME      Username for basic auth
 *   SAP_PASSWORD      Password for basic auth
 *   SAP_AUTH_TYPE     Auth type: basic or jwt (default: basic)
 *   SAP_JWT_TOKEN     JWT token (for jwt auth)
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    locksDir: '.locks',
    envPath: '.env',
    command: null,
    commandArgs: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--locks-dir' && i + 1 < args.length) {
      options.locksDir = args[++i];
    } else if (arg === '--env' && i + 1 < args.length) {
      options.envPath = args[++i];
    } else if (arg === '--help' || arg === '-h' || arg === 'help') {
      return { ...options, command: 'help' };
    } else if (!options.command) {
      options.command = arg;
    } else {
      options.commandArgs.push(arg);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
adt-manage-locks - Manage persistent lock handles for ABAP objects

USAGE:
  adt-manage-locks [options] <command>

COMMANDS:
  list              Show all active locks with details
  cleanup           Remove stale locks (>30 min or from dead processes)
  unlock <type> <name> [group]
                    Unlock specific object on SAP server
                    Types: class, interface, program, fm, domain, dataElement, view
  clear             Clear all locks from registry (doesn't unlock on SAP!)
  help              Show this help message

OPTIONS:
  --locks-dir <path>    Directory with lock files (default: .locks)
  --env <path>          Path to .env file (default: .env)
  --help, -h            Show this help

EXAMPLES:
  # List all locks
  adt-manage-locks list

  # Use custom locks directory
  adt-manage-locks --locks-dir /custom/.locks list

  # Unlock class
  adt-manage-locks unlock class ZCL_TEST

  # Unlock function module (requires group name)
  adt-manage-locks unlock fm ZOK_TEST_FM_01 ZOK_TEST_FG_01

  # Clean up stale locks
  adt-manage-locks cleanup

  # Use custom .env file
  adt-manage-locks --env /path/to/.env unlock class ZCL_TEST

ENVIRONMENT:
  Requires .env file with SAP connection details:
    SAP_URL           https://your-sap-system.com:443
    SAP_CLIENT        100
    SAP_USERNAME      your-username (for basic auth)
    SAP_PASSWORD      your-password (for basic auth)
    SAP_AUTH_TYPE     basic or jwt (default: basic)
    SAP_JWT_TOKEN     your-token (for jwt auth)

FILES:
  .locks/active-locks.json    Lock registry with handles and session IDs

For more info: https://github.com/fr0ster/mcp-abap-adt-clients
`);
}

const options = parseArgs();

// Show help
if (!options.command || options.command === 'help') {
  showHelp();
  process.exit(0);
}

// Load environment from specified path
const envPath = process.env.MCP_ENV_PATH || path.resolve(process.cwd(), options.envPath);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (options.command === 'unlock') {
  console.warn(`⚠️  Warning: .env file not found at ${envPath}`);
  console.warn('    Unlock command requires SAP credentials from .env file');
}

const { getLockStateManager } = require('../src/utils/lockStateManager');
const { createAbapConnection } = require('@mcp-abap-adt/connection');
const { unlockClass } = require('@mcp-abap-adt/adt-clients/core/class/unlock');
const { unlockInterface } = require('@mcp-abap-adt/adt-clients/core/interface/unlock');
const { unlockProgram } = require('@mcp-abap-adt/adt-clients/core/program/unlock');
const { unlockFunctionModule } = require('@mcp-abap-adt/adt-clients/core/functionModule/unlock');
const { unlockDomain } = require('@mcp-abap-adt/adt-clients/core/domain/unlock');
const { unlockDataElement } = require('@mcp-abap-adt/adt-clients/core/dataElement/unlock');
const { unlockDDLS } = require('@mcp-abap-adt/adt-clients/core/view/unlock');

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
      if (!functionGroupName) throw new Error('Function group name required for FM');
      return await unlockFunctionModule(connection, functionGroupName, objectName, lockHandle, sessionId);
    case 'domain':
      return await unlockDomain(connection, objectName, lockHandle, sessionId);
    case 'dataElement':
      return await unlockDataElement(connection, objectName, lockHandle, sessionId);
    case 'view':
      return await unlockDDLS(connection, objectName, lockHandle, sessionId);
    default:
      throw new Error(`Unknown object type: ${objectType}`);
  }
}

function formatLock(lock, index) {
  const age = Math.floor((Date.now() - lock.timestamp) / 1000 / 60);
  const processStatus = (() => {
    try {
      process.kill(lock.pid, 0);
      return '🟢 Running';
    } catch {
      return '🔴 Dead';
    }
  })();

  const objectId = lock.functionGroupName
    ? `${lock.functionGroupName}/${lock.objectName}`
    : lock.objectName;

  return `
${index + 1}. ${lock.objectType.toUpperCase()}: ${objectId}
   Session: ${lock.sessionId}
   Lock Handle: ${lock.lockHandle}
   Age: ${age} minutes
   Process: ${lock.pid} ${processStatus}
   Test File: ${lock.testFile || 'N/A'}
   Timestamp: ${new Date(lock.timestamp).toISOString()}`;
}

async function main() {
  const lockManager = getLockStateManager(options.locksDir);

  if (options.command === 'list') {
    // List all locks
    const locks = lockManager.getAllLocks();
    if (locks.length === 0) {
      console.log('✅ No active locks found');
      return;
    }

    console.log(`\n📋 Active Locks (${locks.length}):\n`);
    locks.forEach((lock, i) => console.log(formatLock(lock, i)));
    console.log();

    // Show stale locks
    const staleLocks = lockManager.getStaleLocks();
    if (staleLocks.length > 0) {
      console.log(`⚠️  ${staleLocks.length} stale lock(s) (>30 min)`);
    }

    const deadLocks = lockManager.getDeadProcessLocks();
    if (deadLocks.length > 0) {
      console.log(`🔴 ${deadLocks.length} lock(s) from dead processes`);
    }

  } else if (options.command === 'cleanup') {
    // Remove stale locks from registry
    const cleaned = lockManager.cleanupStaleLocks();
    if (cleaned.length === 0) {
      console.log('✅ No stale locks to cleanup');
    } else {
      console.log(`🧹 Cleaned up ${cleaned.length} stale lock(s):`);
      cleaned.forEach((lock, i) => console.log(formatLock(lock, i)));
    }

  } else if (options.command === 'unlock') {
    // Unlock specific object on SAP server
    const objectType = options.commandArgs[0];
    const objectName = options.commandArgs[1];
    const functionGroupName = options.commandArgs[2];

    if (!objectType || !objectName) {
      console.error('❌ Usage: manage-locks unlock <type> <name> [group]');
      console.error('   Examples:');
      console.error('     manage-locks unlock class ZCL_TEST');
      console.error('     manage-locks unlock fm ZOK_TEST_FM_01 ZOK_TEST_FG_01');
      process.exit(1);
    }

    const lock = lockManager.getLock(objectType, objectName, functionGroupName);
    if (!lock) {
      console.error(`❌ No lock found for ${objectType} ${objectName}`);
      process.exit(1);
    }

    console.log(`🔓 Unlocking ${objectType} ${objectName}...`);
    console.log(`   Session: ${lock.sessionId}`);
    console.log(`   Lock Handle: ${lock.lockHandle}`);

    try {
      const config = getConfig();
      const connection = createAbapConnection(config, console);
      await unlockObject(connection, lock);

      lockManager.removeLock(objectType, objectName, functionGroupName);
      console.log(`✅ Successfully unlocked ${objectType} ${objectName}`);
    } catch (error) {
      console.error(`❌ Failed to unlock: ${error.message}`);
      console.error('   Lock may have already expired on SAP server');
      console.error('   Use "cleanup" command to remove from registry');
      process.exit(1);
    }

  } else if (options.command === 'clear') {
    // Clear all locks from registry (doesn't unlock on SAP!)
    const locks = lockManager.getAllLocks();
    lockManager.clearAll();
    console.log(`🧹 Cleared ${locks.length} lock(s) from registry`);
    console.log('⚠️  Note: This does NOT unlock objects on SAP server!');

  } else {
    console.error(`❌ Unknown command: ${options.command}`);
    console.error('Run "adt-manage-locks help" for usage information');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

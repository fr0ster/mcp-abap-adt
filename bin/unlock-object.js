#!/usr/bin/env node
/**
 * Unlock Object CLI - Unlock an SAP object using saved session/lock handle
 *
 * Usage:
 *   adt-unlock-object <type> <name> [options]
 *
 * Examples:
 *   adt-unlock-object class ZCL_MY_CLASS --session-id my_session
 *   adt-unlock-object program Z_MY_PROGRAM --session-id auto_123456
 *   adt-unlock-object fm MY_FUNCTION_MODULE --function-group Z_MY_FUGR --session-id my_session
 */

const path = require('path');
const fs = require('fs');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function showHelp() {
  console.log(`
${colors.bright}Unlock Object CLI${colors.reset} - Unlock an SAP object using saved session/lock handle

${colors.bright}USAGE:${colors.reset}
  adt-unlock-object <type> <name> --session-id <id> [options]

${colors.bright}ARGUMENTS:${colors.reset}
  type          Object type: class, program, interface, fm, domain, dataelement
  name          Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)

${colors.bright}REQUIRED OPTIONS:${colors.reset}
  --session-id <id>          Session ID used when locking

${colors.bright}OPTIONS:${colors.reset}
  --function-group <name>    Function group name (required for fm type)
  --sessions-dir <path>      Sessions directory (default: .sessions)
  --locks-dir <path>         Locks directory (default: .locks)
  --env <path>               Path to .env file (default: .env)
  --help, -h                 Show this help message

${colors.bright}EXAMPLES:${colors.reset}
  # Unlock a class
  adt-unlock-object class ZCL_MY_CLASS --session-id my_session

  # Unlock a program
  adt-unlock-object program Z_MY_PROGRAM --session-id auto_1234567890

  # Unlock a function module
  adt-unlock-object fm MY_FUNCTION_MODULE --function-group Z_MY_FUGR --session-id my_session

  # Unlock with custom directories
  adt-unlock-object class ZCL_TEST --session-id test --sessions-dir /tmp/sessions --locks-dir /tmp/locks

${colors.bright}NOTES:${colors.reset}
  - Restores session from <sessions-dir>/<session-id>.json
  - Retrieves lock handle from <locks-dir>/active-locks.json
  - Removes lock from registry after successful unlock
  - Use same session-id that was used with 'adt-lock-object'
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Show help
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Parse arguments
  const objectType = args[0];
  const objectName = args[1];

  if (!objectType || !objectName) {
    console.error(`${colors.red}Error: Object type and name are required${colors.reset}`);
    console.log(`Run with --help for usage information`);
    process.exit(1);
  }

  // Parse options
  let functionGroup;
  let sessionId;
  let sessionsDir = '.sessions';
  let locksDir = '.locks';
  let envPath = '.env';

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--function-group' && args[i + 1]) {
      functionGroup = args[++i];
    } else if (args[i] === '--session-id' && args[i + 1]) {
      sessionId = args[++i];
    } else if (args[i] === '--sessions-dir' && args[i + 1]) {
      sessionsDir = args[++i];
    } else if (args[i] === '--locks-dir' && args[i + 1]) {
      locksDir = args[++i];
    } else if (args[i] === '--env' && args[i + 1]) {
      envPath = args[++i];
    }
  }

  // Validate required options
  if (!sessionId) {
    console.error(`${colors.red}Error: --session-id is required${colors.reset}`);
    console.log(`Run with --help for usage information`);
    process.exit(1);
  }

  // Validate function group for FM
  if (objectType === 'fm' && !functionGroup) {
    console.error(`${colors.red}Error: --function-group is required for function modules${colors.reset}`);
    process.exit(1);
  }

  // Load environment
  require('dotenv').config({ path: envPath });

  const sapUrl = process.env.SAP_URL;
  const sapUsername = process.env.SAP_USERNAME;
  const sapPassword = process.env.SAP_PASSWORD;
  const sapJwtToken = process.env.SAP_JWT_TOKEN;

  if (!sapUrl) {
    console.error(`${colors.red}Error: SAP_URL must be set in ${envPath}${colors.reset}`);
    process.exit(1);
  }

  // Auto-detect auth type based on what's available
  let sapAuthType;
  if (sapJwtToken) {
    sapAuthType = 'jwt';
  } else if (sapUsername && sapPassword) {
    sapAuthType = 'basic';
  } else {
    console.error(`${colors.red}Error: Either SAP_JWT_TOKEN or (SAP_USERNAME and SAP_PASSWORD) must be set in ${envPath}${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}🔓 Unlocking ${objectType}: ${objectName}${colors.reset}`);
  if (functionGroup) {
    console.log(`${colors.cyan}   Function Group: ${functionGroup}${colors.reset}`);
  }
  console.log(`${colors.cyan}   Session ID: ${sessionId}${colors.reset}`);

  try {
    // Dynamic imports
    const { createAbapConnection } = require('@mcp-abap-adt/connection');
    const { AbapSessionStore } = require('@mcp-abap-adt/auth-stores');
    const { LockStateManager } = require('../src/utils/lockStateManager');

    // Map object type to unlock function
    let unlockFunction;
    let adtObjectType;

    switch (objectType.toLowerCase()) {
      case 'class':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/class/unlock.js').unlockClass;
        adtObjectType = 'class';
        break;
      case 'program':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/program/unlock.js').unlockProgram;
        adtObjectType = 'program';
        break;
      case 'interface':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/interface/unlock.js').unlockInterface;
        adtObjectType = 'interface';
        break;
      case 'fugr':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/functionGroup/lock.js').unlockFunctionGroup;
        adtObjectType = 'fugr';
        break;
      case 'fm':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/functionModule/unlock.js').unlockFunctionModule;
        adtObjectType = 'fm';
        break;
      case 'domain':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/domain/unlock.js').unlockDomain;
        adtObjectType = 'domain';
        break;
      case 'dataelement':
        unlockFunction = require('@mcp-abap-adt/adt-clients/core/dataElement/unlock.js').unlockDataElement;
        adtObjectType = 'dataElement';
        break;
      default:
        console.error(`${colors.red}Error: Unsupported object type: ${objectType}${colors.reset}`);
        console.log('Supported types: class, program, interface, fugr, fm, domain, dataelement');
        process.exit(1);
    }

    // Load session from file
    const sessionStorage = new AbapSessionStore(sessionsDir);

    console.log(`${colors.yellow}📂 Loading session...${colors.reset}`);
    const sessionState = await sessionStorage.load(sessionId);

    if (!sessionState) {
      console.error(`${colors.red}Error: Session not found: ${sessionId}${colors.reset}`);
      console.error(`  Expected file: ${path.join(sessionsDir, sessionId + '.env')}`);
      process.exit(1);
    }

    console.log(`${colors.green}✓ Session loaded${colors.reset}`);

    // Get lock handle from lock manager
    const lockManager = new LockStateManager(locksDir);
    const lockState = lockManager.getLock(adtObjectType, objectName, functionGroup);

    if (!lockState) {
      console.error(`${colors.red}Error: Lock not found for ${objectType} ${objectName}${colors.reset}`);
      console.error(`  Check ${path.join(locksDir, 'active-locks.json')}`);
      process.exit(1);
    }

    if (lockState.sessionId !== sessionId) {
      console.warn(`${colors.yellow}Warning: Lock was created with different session ID${colors.reset}`);
      console.warn(`  Expected: ${sessionId}`);
      console.warn(`  Found: ${lockState.sessionId}`);
    }

    const lockHandle = lockState.lockHandle;
    console.log(`${colors.green}✓ Lock handle retrieved${colors.reset}`);
    console.log(`  Lock Handle: ${colors.bright}${lockHandle}${colors.reset}`);

    // Create connection config based on auth type
    const config = {
      url: sapUrl,
      authType: sapAuthType,
    };

    if (sapAuthType === 'jwt') {
      config.jwtToken = sapJwtToken;
    } else {
      config.username = sapUsername;
      config.password = sapPassword;
    }

    const logger = {
      debug: () => {},
      info: console.log,
      warn: console.warn,
      error: console.error,
      csrfToken: () => {},
    };

    const connection = createAbapConnection(config, logger);

    // Enable stateful session - this will automatically load session state
    await connection.enableStatefulSession(sessionId, sessionStorage);
    console.log(`${colors.green}✓ Session restored to connection${colors.reset}`);

    // Unlock the object
    console.log(`${colors.yellow}🔓 Unlocking object...${colors.reset}`);

    if (objectType.toLowerCase() === 'fm') {
      await unlockFunction(connection, functionGroup, objectName, lockHandle, sessionId);
    } else {
      await unlockFunction(connection, objectName, lockHandle, sessionId);
    }

    console.log(`${colors.green}✓ Object unlocked successfully${colors.reset}`);

    // Remove lock from registry
    lockManager.removeLock(adtObjectType, objectName, functionGroup);
    console.log(`${colors.green}✓ Lock removed from registry${colors.reset}`);

    // Optionally cleanup session
    console.log(`\n${colors.yellow}Session file preserved: ${path.join(sessionsDir, sessionId + '.env')}${colors.reset}`);
    console.log(`To clean up session, run: rm ${path.join(sessionsDir, sessionId + '.env')}`);

    console.log(`\n${colors.bright}${colors.green}SUCCESS!${colors.reset} Object unlocked.`);

  } catch (error) {
    console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
    }
    process.exit(1);
  }
}

main();

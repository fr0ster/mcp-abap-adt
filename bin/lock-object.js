#!/usr/bin/env node
/**
 * Lock Object CLI - Lock an SAP object and save session/lock handle
 *
 * Usage:
 *   adt-lock-object <type> <name> [options]
 *
 * Examples:
 *   adt-lock-object class ZCL_MY_CLASS
 *   adt-lock-object program Z_MY_PROGRAM --session-id my_session
 *   adt-lock-object fm MY_FUNCTION_MODULE --function-group Z_MY_FUGR
 *   adt-lock-object class ZCL_TEST --sessions-dir /custom/path/.sessions
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
${colors.bright}Lock Object CLI${colors.reset} - Lock an SAP object and save session/lock handle

${colors.bright}USAGE:${colors.reset}
  adt-lock-object <type> <name> [options]

${colors.bright}ARGUMENTS:${colors.reset}
  type          Object type: class, program, interface, fm, domain, dataelement
  name          Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)

${colors.bright}OPTIONS:${colors.reset}
  --function-group <name>    Function group name (required for fm type)
  --session-id <id>          Custom session ID (default: auto-generated)
  --sessions-dir <path>      Sessions directory (default: .sessions)
  --locks-dir <path>         Locks directory (default: .locks)
  --env <path>               Path to .env file (default: .env)
  --help, -h                 Show this help message

${colors.bright}EXAMPLES:${colors.reset}
  # Lock a class
  adt-lock-object class ZCL_MY_CLASS

  # Lock a program with custom session ID
  adt-lock-object program Z_MY_PROGRAM --session-id my_work_session

  # Lock a function module
  adt-lock-object fm MY_FUNCTION_MODULE --function-group Z_MY_FUGR

  # Lock with custom directories
  adt-lock-object class ZCL_TEST --sessions-dir /tmp/sessions --locks-dir /tmp/locks

${colors.bright}NOTES:${colors.reset}
  - Session state (cookies, CSRF token) saved to <sessions-dir>/<session-id>.json
  - Lock handle saved to <locks-dir>/active-locks.json
  - Use 'adt-unlock-object' with same session-id to unlock later
  - Requires SAP_URL, SAP_USERNAME, SAP_PASSWORD in .env file
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

  console.log(`${colors.cyan}🔒 Locking ${objectType}: ${objectName}${colors.reset}`);
  if (functionGroup) {
    console.log(`${colors.cyan}   Function Group: ${functionGroup}${colors.reset}`);
  }

  try {
    // Dynamic imports
    const { createAbapConnection, FileSessionStorage } = require('@mcp-abap-adt/connection');
    const { LockStateManager } = require('../src/utils/lockStateManager');

    // Map object type to lock function
    let lockFunction;
    let adtObjectType;

    switch (objectType.toLowerCase()) {
      case 'class':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/class/lock.js').lockClass;
        adtObjectType = 'class';
        break;
      case 'program':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/program/lock.js').lockProgram;
        adtObjectType = 'program';
        break;
      case 'interface':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/interface/lock.js').lockInterface;
        adtObjectType = 'interface';
        break;
      case 'fugr':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/functionGroup/lock.js').lockFunctionGroup;
        adtObjectType = 'fugr';
        break;
      case 'fm':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/functionModule/lock.js').lockFunctionModule;
        adtObjectType = 'fm';
        break;
      case 'domain':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/domain/lock.js').lockDomain;
        adtObjectType = 'domain';
        break;
      case 'dataelement':
        lockFunction = require('@mcp-abap-adt/adt-clients/core/dataElement/lock.js').lockDataElement;
        adtObjectType = 'dataElement';
        break;
      default:
        console.error(`${colors.red}Error: Unsupported object type: ${objectType}${colors.reset}`);
        console.log('Supported types: class, program, interface, fugr, fm, domain, dataelement');
        process.exit(1);
    }

    // Generate session ID if not provided
    if (!sessionId) {
      sessionId = `lock_${objectType}_${objectName}_${Date.now()}`;
    }

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

    // Setup session storage
    const sessionStorage = new FileSessionStorage({
      sessionDir: sessionsDir,
      prettyPrint: true
    });

    // Enable stateful session on connection
    await connection.enableStatefulSession(sessionId, sessionStorage);

    console.log(`${colors.yellow}📡 Connecting to SAP...${colors.reset}`);

    // Lock the object
    let lockHandle;
    let lockResponse;
    if (objectType.toLowerCase() === 'fm') {
      lockHandle = await lockFunction(connection, functionGroup, objectName, sessionId);
    } else if (objectType.toLowerCase() === 'fugr') {
      lockHandle = await lockFunction(connection, objectName, sessionId);
    } else {
      lockHandle = await lockFunction(connection, objectName, sessionId);
    }

    console.log(`${colors.green}✓ Object locked successfully${colors.reset}`);
    console.log(`  Lock Handle: ${colors.bright}${lockHandle}${colors.reset}`);

    // Session state is automatically saved by connection.saveSessionState()
    // after each request in stateful mode
    console.log(`${colors.green}✓ Session saved${colors.reset}`);
    console.log(`  Session ID: ${colors.bright}${sessionId}${colors.reset}`);
    console.log(`  Session File: ${path.join(sessionsDir, sessionId + '.json')}`);

    // Register lock in lock manager
    const lockManager = new LockStateManager(locksDir);
    lockManager.registerLock({
      sessionId,
      lockHandle,
      objectType: adtObjectType,
      objectName,
      functionGroupName: functionGroup,
      testFile: 'CLI',
    });

    console.log(`${colors.green}✓ Lock registered${colors.reset}`);
    console.log(`  Lock File: ${path.join(locksDir, 'active-locks.json')}`);

    console.log(`\n${colors.bright}${colors.green}SUCCESS!${colors.reset} Object locked and session saved.`);
    console.log(`\nTo unlock later, run:`);
    console.log(`  ${colors.cyan}adt-unlock-object ${objectType} ${objectName} --session-id ${sessionId}${functionGroup ? ` --function-group ${functionGroup}` : ''}${colors.reset}`);

  } catch (error) {
    console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
    }
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * CLI utility to manage session state files
 *
 * Usage:
 *   adt-manage-sessions [options] <command>
 *
 * Commands:
 *   list              Show all active sessions
 *   info <sessionId>  Show session details
 *   cleanup           Remove stale sessions
 *   clear             Clear all sessions
 *   help              Show this help message
 *
 * Options:
 *   --sessions-dir <path>  Directory with session files (default: .sessions)
 *   --help, -h             Show help
 *
 * Examples:
 *   adt-manage-sessions list
 *   adt-manage-sessions --sessions-dir /custom/path list
 *   adt-manage-sessions info my-session-id
 *   adt-manage-sessions cleanup
 */

const path = require('path');
const { FileSessionStorage } = require('@mcp-abap-adt/connection');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sessionsDir: '.sessions',
    command: null,
    commandArgs: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--sessions-dir' && i + 1 < args.length) {
      options.sessionsDir = args[++i];
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
adt-manage-sessions - Manage HTTP session state (cookies, CSRF tokens)

USAGE:
  adt-manage-sessions [options] <command>

COMMANDS:
  list              Show all active sessions with metadata
  info <sessionId>  Show detailed session information
  cleanup           Remove stale sessions (>30 min or from dead processes)
  clear             Clear all sessions from storage
  help              Show this help message

OPTIONS:
  --sessions-dir <path>  Directory with session files (default: .sessions)
  --help, -h             Show this help

EXAMPLES:
  # List all sessions
  adt-manage-sessions list

  # Use custom sessions directory
  adt-manage-sessions --sessions-dir /custom/.sessions list

  # Show session details
  adt-manage-sessions info test-session-123

  # Clean up stale sessions
  adt-manage-sessions cleanup

  # Clear all sessions
  adt-manage-sessions clear

FILES:
  .sessions/<sessionId>.json    Session state files (cookies, CSRF tokens)

For more info: https://github.com/fr0ster/mcp-abap-adt-clients
`);
}

const options = parseArgs();

// Show help
if (!options.command || options.command === 'help') {
  showHelp();
  process.exit(0);
}

const sessionStorage = new FileSessionStorage({
  sessionDir: options.sessionsDir,
  prettyPrint: true
});

function formatAge(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatSessionInfo(sessionId, metadata) {
  const processStatus = (() => {
    try {
      process.kill(metadata.pid, 0);
      return '🟢 Running';
    } catch {
      return '🔴 Dead';
    }
  })();

  return `
Session ID: ${sessionId}
  Created: ${new Date(metadata.timestamp).toISOString()}
  Age: ${formatAge(metadata.age)}
  Process: ${metadata.pid} ${processStatus}`;
}

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  if (!command || command === 'list') {
    // List all sessions
    const sessions = await sessionStorage.listSessions();

    if (sessions.length === 0) {
      console.log('✅ No active sessions found');
      return;
    }

    console.log(`\n📋 Active Sessions (${sessions.length}):\n`);

    for (const sessionId of sessions) {
      const metadata = await sessionStorage.getSessionMetadata(sessionId);
      if (metadata) {
        console.log(formatSessionInfo(sessionId, metadata));
      }
    }
    console.log();

  } else if (command === 'info') {
    // Show session details
    if (!arg) {
      console.error('❌ Usage: manage-sessions info <sessionId>');
      process.exit(1);
    }

    const state = await sessionStorage.load(arg);
    const metadata = await sessionStorage.getSessionMetadata(arg);

    if (!state || !metadata) {
      console.error(`❌ Session not found: ${arg}`);
      process.exit(1);
    }

    console.log(formatSessionInfo(arg, metadata));
    console.log('\nSession State:');
    console.log(`  Has Cookies: ${!!state.cookies}`);
    console.log(`  Has CSRF Token: ${!!state.csrfToken}`);
    console.log(`  Cookie Store: ${Object.keys(state.cookieStore).length} entries`);

    if (state.cookies) {
      console.log(`\nCookies:\n  ${state.cookies}`);
    }

    if (state.csrfToken) {
      console.log(`\nCSRF Token:\n  ${state.csrfToken}`);
    }

    if (Object.keys(state.cookieStore).length > 0) {
      console.log('\nCookie Store:');
      for (const [key, value] of Object.entries(state.cookieStore)) {
        console.log(`  ${key}: ${value}`);
      }
    }

  } else if (command === 'cleanup') {
    // Clean up stale sessions
    console.log('🧹 Cleaning up stale sessions...\n');

    const stale = await sessionStorage.cleanupStaleSessions();
    const dead = await sessionStorage.cleanupDeadProcessSessions();

    const allCleaned = [...new Set([...stale, ...dead])];

    if (allCleaned.length === 0) {
      console.log('✅ No stale sessions to cleanup');
    } else {
      console.log(`🧹 Cleaned up ${allCleaned.length} session(s):`);
      allCleaned.forEach(id => console.log(`  - ${id}`));
    }

  } else if (command === 'clear') {
    // Clear all sessions
    const sessions = await sessionStorage.listSessions();
    await sessionStorage.clearAll();
    console.log(`🧹 Cleared ${sessions.length} session(s)`);

  } else {
    console.error(`❌ Unknown command: ${command}`);
    console.error('Usage:');
    console.error('  manage-sessions list              - Show all active sessions');
    console.error('  manage-sessions info <sessionId>  - Show session details');
    console.error('  manage-sessions cleanup           - Remove stale sessions');
    console.error('  manage-sessions clear             - Clear all sessions');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

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
const fs = require('fs');

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
  .sessions/<sessionId>.env    Session state files (cookies, CSRF tokens)

For more info: https://github.com/fr0ster/mcp-abap-adt-clients
`);
}







async function main() {
  const { sessionsDir, command, commandArgs } = parseArgs();
  const sessionDir = path.resolve(sessionsDir);

  if (!fs.existsSync(sessionDir)) {
    console.error(`❌ Session directory not found: ${sessionDir}`);
    process.exit(1);
  }

  const listSessions = () => {
    return fs.readdirSync(sessionDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(sessionDir, file));
  };

  const readSession = (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`❌ Error reading session file ${filePath}: ${e.message}`);
      return null;
    }
  };

  const formatAge = (ms) => {
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

  if (command === 'list') {
    const sessionFiles = listSessions();

    if (sessionFiles.length === 0) {
      console.log('✅ No active sessions found');
      return;
    }

    console.log(`\n📋 Active Sessions (${sessionFiles.length}):\n`);

    for (const file of sessionFiles) {
      const session = readSession(file);
      if (session) {
        const stats = fs.statSync(file);
        const age = Date.now() - stats.mtimeMs;
        const sessionId = path.basename(file, '.json');
        console.log(`
Session ID: ${sessionId}
  Modified: ${stats.mtime.toISOString()}
  Age: ${formatAge(age)}`);
      }
    }
    console.log();

  } else if (command === 'info') {
    const sessionId = commandArgs[0];
    if (!sessionId) {
      console.error('❌ Usage: manage-sessions info <sessionId>');
      process.exit(1);
    }

    const sessionFile = path.join(sessionDir, `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) {
      console.error(`❌ Session not found: ${sessionId}`);
      process.exit(1);
    }

    const session = readSession(sessionFile);
    if (session) {
      const stats = fs.statSync(sessionFile);
      const age = Date.now() - stats.mtimeMs;
      console.log(`
Session ID: ${sessionId}
  Modified: ${stats.mtime.toISOString()}
  Age: ${formatAge(age)}
  Content:`);
      console.log(JSON.stringify(session, null, 2));
    }

  } else if (command === 'cleanup') {
    console.log('🧹 Cleaning up stale sessions...\n');
    const sessionFiles = listSessions();
    let cleanedCount = 0;
    const now = Date.now();
    const staleTime = 30 * 60 * 1000; // 30 minutes

    for (const file of sessionFiles) {
      const stats = fs.statSync(file);
      const age = now - stats.mtimeMs;
      if (age > staleTime) {
        fs.unlinkSync(file);
        console.log(`  - Removed stale session: ${path.basename(file, '.json')}`);
        cleanedCount++;
      }
    }

    if (cleanedCount === 0) {
      console.log('✅ No stale sessions to cleanup');
    } else {
      console.log(`\n🧹 Cleaned up ${cleanedCount} session(s)`);
    }

  } else if (command === 'clear') {
    const sessionFiles = listSessions();
    if (sessionFiles.length === 0) {
        console.log('✅ No active sessions found');
        return;
    }
    console.log(`🧹 Clearing ${sessionFiles.length} session(s)...`);
    for (const file of sessionFiles) {
      fs.unlinkSync(file);
    }
    console.log('✅ All sessions cleared');

  } else {
    showHelp();
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

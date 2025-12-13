# CLI Utilities

This directory contains command-line utilities for managing ADT client sessions and locks.

## Overview of All Scripts

| Command | Purpose | Use Case |
|---------|---------|----------|
| `adt-lock-object` | Lock an object and save session | Start work on object, persist session for later |
| `adt-unlock-object` | Unlock object using saved session | Resume work and unlock after crash/restart |
| `adt-manage-locks` | View/clean lock registry | Debug locks, cleanup stale locks |
| `adt-manage-sessions` | View/clean session files | Debug sessions, cleanup old sessions |
| `adt-unlock-objects` | Unlock predefined test objects | Cleanup after failed integration tests |

### Key Differences

**Lock/Unlock Pair (for production use):**
- `adt-lock-object` + `adt-unlock-object` - Full workflow: lock → save session → restore session → unlock
- Works with ANY object specified via CLI args
- Designed for manual/scripted workflows

**Management Tools (for debugging/maintenance):**
- `adt-manage-locks` - View and manage lock registry only
- `adt-manage-sessions` - View and manage session files only
- Read-only inspection + cleanup operations

**Test Cleanup (for testing):**
- `adt-unlock-objects` - Hardcoded list of test objects from test-config.yaml
- Used specifically for cleanup after integration test failures

## Installation

### Global Installation (Recommended)

Install globally to use CLI commands from anywhere:

```bash
npm install -g @mcp-abap-adt/adt-clients
```

After global installation, all commands are available in your PATH:

```bash
adt-lock-object --help
adt-unlock-object --help
adt-manage-locks --help
adt-manage-sessions --help
```

### Local Installation

Install as a dependency in your project:

```bash
npm install @mcp-abap-adt/adt-clients
```

Run commands using npx:

```bash
npx adt-lock-object class ZCL_MY_CLASS
npx adt-manage-locks list
```

### Development Installation

For local development from repository:

```bash
cd packages/adt-clients
npm install
npm run build
npm link  # Makes commands available globally
```

The following commands will be available:

## Commands

### adt-lock-object

Lock an SAP object and save session state for later recovery.

```bash
# Lock a class
adt-lock-object class ZCL_MY_CLASS

# Lock with custom session ID
adt-lock-object class ZCL_MY_CLASS --session-id my_work

# Lock a function module
adt-lock-object fm MY_FUNCTION --function-group Z_MY_FUGR

# Lock a program
adt-lock-object program Z_MY_PROGRAM
```

**What it does:**
1. Connects to SAP and locks the object
2. Saves session (cookies, CSRF token) to `.sessions/<session-id>.json`
3. Registers lock handle in `.locks/active-locks.json`
4. Prints unlock command for later use

**Supported types:** class, program, interface, fm, domain, dataelement

### adt-unlock-object

Unlock an SAP object using previously saved session state.

```bash
# Unlock using saved session
adt-unlock-object class ZCL_MY_CLASS --session-id my_work

# Unlock function module
adt-unlock-object fm MY_FUNCTION --function-group Z_MY_FUGR --session-id my_work
```

**What it does:**
1. Loads session from `.sessions/<session-id>.json`
2. Restores session state to new connection
3. Retrieves lock handle from `.locks/active-locks.json`
4. Unlocks the object on SAP server
5. Removes lock from registry

**Note:** Requires `--session-id` used with `adt-lock-object`

### adt-manage-locks

Manage persistent lock registry - view, cleanup, and force unlock.

```bash
# List all active locks
adt-manage-locks list

# Clean up stale locks (>30 min or dead processes)
adt-manage-locks cleanup

# Force unlock specific object on SAP server
adt-manage-locks unlock class ZCL_TEST
adt-manage-locks unlock fm MY_FUNCTION Z_MY_FUGR

# Clear all locks from registry
adt-manage-locks clear
```

**What it does:**
- `list` - Shows all locks with session ID, handle, object, timestamp, PID
- `cleanup` - Removes stale locks (>30min old or dead processes)
- `unlock` - Connects to SAP and force unlocks object, removes from registry
- `clear` - Removes ALL locks from registry (doesn't unlock on SAP!)

**Use case:** Debugging lock issues, cleanup after crashes

### adt-manage-sessions

Manage saved session files - view, inspect, and cleanup.

```bash
# List all sessions
adt-manage-sessions list

# View session details
adt-manage-sessions info my_session_id

# Clean up old sessions (>24 hours)
adt-manage-sessions cleanup

# Clear all sessions
adt-manage-sessions clear
```

**What it does:**
- `list` - Shows all session files with ID, timestamp, age, PID
- `info` - Displays session details (cookies, CSRF token, metadata)
- `cleanup` - Removes stale sessions (>24h old or dead processes)
- `clear` - Deletes ALL session files

**Use case:** Debugging session issues, inspect saved state, cleanup old files

### adt-unlock-objects

Unlock predefined test objects from test-config.yaml.

```bash
# Unlock all test objects defined in test-config.yaml
adt-unlock-objects

# Use custom config file
adt-unlock-objects --config custom-test-config.yaml

# Use custom locks directory
adt-unlock-objects --locks-dir /custom/path/.locks
```

**What it does:**
1. Reads test object list from `test-config.yaml`
2. For each object: retrieves lock handle from registry
3. Connects to SAP and unlocks object
4. Removes lock from registry

**Use case:** Cleanup after integration test failures when objects remain locked

**Note:** Hardcoded to work with test objects only, not for general use

## Common Options

Most commands support:

| Option | Description | Default |
|--------|-------------|---------|
| `--locks-dir <path>` | Lock registry directory | `.locks` |
| `--sessions-dir <path>` | Sessions directory | `.sessions` |
| `--env <path>` | Path to .env file | `.env` |
| `--help, -h` | Show help message | - |

## Workflow Examples

### Daily Work on a Class

```bash
# Morning - lock class and start work
adt-lock-object class ZCL_MY_WORK --session-id daily_work
# Session ID: daily_work

# ... work all day, make changes via other tools ...

# Evening - unlock when done
adt-unlock-object class ZCL_MY_WORK --session-id daily_work
```

### Recovery After Crash

```bash
# Process crashed while object was locked
# Check what was locked
adt-manage-locks list

# Resume and unlock using saved session
adt-unlock-object class ZCL_MY_CLASS --session-id <session-from-list>
```

### Integration Test Cleanup

```bash
# Tests failed and left objects locked
# Quick cleanup of all test objects
adt-unlock-objects
```

### Debug Session Issues

```bash
# See what sessions are saved
adt-manage-sessions list

# Inspect specific session
adt-manage-sessions info my_session_id

# Clean up old sessions
adt-manage-sessions cleanup
```

## File Structure

```
.sessions/
  ├── my_work_session.json       # Session state (cookies, CSRF)
  └── lock_class_ZCL_TEST_*.json # Auto-generated session

.locks/
  └── active-locks.json           # Lock registry
```

## Environment Setup

Required in `.env`:

```bash
SAP_URL=https://your-sap-system.com
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
```

## Gitignore

Ensure these directories are in `.gitignore`:

```gitignore
.sessions/
.locks/
```

## See Also

- [Session State Management](../docs/archive/SESSION_STATE_MANAGEMENT.md)
- [Lock State Management](../docs/archive/LOCK_STATE_MANAGEMENT.md)
- [Lock Recovery Test](../src/__tests__/integration/README_LOCK_RECOVERY.md)


# Clear all locks from registry
adt-manage-locks clear
```

### adt-manage-sessions

Manage HTTP session state (cookies, CSRF tokens).

```bash
# List all active sessions
adt-manage-sessions list

# Show session details
adt-manage-sessions info <sessionId>

# Clean up stale sessions (>30 min or dead processes)
adt-manage-sessions cleanup

# Clear all sessions
adt-manage-sessions clear
```

### adt-unlock-objects

Unlock predefined test objects (used after failed tests).

```bash
adt-unlock-objects
```

## With npx

You can also run these commands without installing:

```bash
npx @mcp-abap-adt/adt-clients adt-manage-locks list
npx @mcp-abap-adt/adt-clients adt-manage-sessions list
```

## Configuration

Commands require `.env` file in the project root with SAP connection details:

```env
SAP_URL=https://your-sap-system.com:443
SAP_CLIENT=100
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_AUTH_TYPE=basic
```

For JWT authentication:
```env
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your-jwt-token
```

## Data Storage

- **Locks**: `.locks/active-locks.json`
- **Sessions**: `.sessions/<sessionId>.json`

Both directories are in `.gitignore` and should not be committed.

## Documentation

For detailed information, see:
- [Lock State Management](../docs/archive/LOCK_STATE_MANAGEMENT.md)
- [Session State Management](../docs/archive/SESSION_STATE_MANAGEMENT.md)

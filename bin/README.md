# CLI Utilities

This directory contains command-line utilities for managing ADT client sessions.

## Overview of All Scripts

| Command | Purpose | Use Case |
|---------|---------|----------|
| `adt-lock-object` | Lock an object and save session | Start work on object, persist session for later |

### Key Differences

**Locking (for production use):**
- `adt-lock-object` - Lock object and persist session; designed for manual/scripted workflows

## Installation

### Global Installation (Recommended)

Install globally to use CLI commands from anywhere:

```bash
npm install -g @mcp-abap-adt/adt-clients
```

After global installation, all commands are available in your PATH:

```bash
adt-lock-object --help
```

### Local Installation

Install as a dependency in your project:

```bash
npm install @mcp-abap-adt/adt-clients
```

Run commands using npx:

```bash
npx adt-lock-object class ZCL_MY_CLASS
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
2. Saves session (cookies, CSRF token) to `.sessions/<session-id>.env`
3. Prints the lock handle for later use

**Supported types:** class, program, interface, fm, domain, dataelement

## Common Options

| Option | Description | Default |
|--------|-------------|---------|
| `--sessions-dir <path>` | Sessions directory | `.sessions` |
| `--env <path>` | Path to .env file | `.env` |
| `--help, -h` | Show help message | - |

## File Structure

```
.sessions/
  ├── my_work_session.env       # Session state (cookies, CSRF)
  └── lock_class_ZCL_TEST_*.env # Auto-generated session
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

- [Stateful Session Guide](../docs/architecture/STATEFUL_SESSION_GUIDE.md)
- [Tools Architecture](../docs/architecture/TOOLS_ARCHITECTURE.md)
- [Integration Tests Overview](../src/__tests__/integration/README.md)

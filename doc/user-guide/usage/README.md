# MCP Functions Usage Guide

This directory contains comprehensive documentation for creating and modifying ABAP objects through MCP function calls.

## Overview

This documentation provides practical examples of using MCP (Model Context Protocol) functions to interact with SAP ABAP systems. All examples include complete JSON request/response formats.

## Documentation Structure

### [Simple Objects](./simple-objects/)
CRUD operations for standalone ABAP objects:
- Classes, Interfaces, Programs
- Function Groups, Function Modules
- Tables, Structures, CDS Views
- Domains, Data Elements
- Service Definitions

### [RAP Business Objects](./rap-business-objects/)
Complete workflows for creating RAP (Restful ABAP Programming) Business Objects with all related components:
- Domains → Data Elements → Tables → Draft Tables
- CDS Views with Composite Structures
- Behavior Definitions and Implementations
- Metadata Extensions
- Service Definitions

## Handler Types

### High-Level Handlers
- **Single function call** - Complete workflow in one operation
- **Automatic session management** - No need to manage sessions manually
- **Built-in validation and checking** - Code checking happens automatically
- **Simpler to use** - Best for quick operations

**Example:**
```json
{
  "name": "CreateClass",
  "arguments": {
    "class_name": "ZCL_TEST_001",
    "package_name": "ZOK_LAB",
    "source_code": "CLASS zcl_test_001 DEFINITION...",
    "activate": true
  }
}
```

### Low-Level Handlers
- **Step-by-step control** - Full control over each operation
- **Session management required** - Must use GetSession and maintain session state
- **Manual code checking** - Must check code before update (CRITICAL)
- **More flexible** - Best for complex workflows and batch operations

**Example Workflow:**
1. `GetSession` - Get session ID
2. `ValidateClassLow` - Validate class name
3. `CreateClassLow` - Create class
4. `LockClassLow` - Lock for modification
5. `CheckClassLow` - **Check code BEFORE update** (with source_code and version='inactive')
6. `UpdateClassLow` - Update only if check passed
7. `UnlockClassLow` - Release lock
8. `CheckClassLow` - Check inactive version (after unlock, without source_code)
9. `ActivateClassLow` or `ActivateObjectLow` - Activate

## Critical Best Practices

### 1. Code Checking Before Update (Low-Level Handlers)

**ALWAYS check code before update when using low-level handlers:**

```json
// Step 1: Lock
{
  "name": "LockClassLow",
  "arguments": {
    "class_name": "ZCL_TEST_001",
    "session_id": "...",
    "session_state": {...}
  }
}

// Step 2: Check BEFORE update (CRITICAL)
{
  "name": "CheckClassLow",
  "arguments": {
    "class_name": "ZCL_TEST_001",
    "source_code": "NEW CODE HERE...",
    "version": "inactive",
    "session_id": "...",
    "session_state": {...}
  }
}

// Step 3: Update ONLY if check passed
{
  "name": "UpdateClassLow",
  "arguments": {
    "class_name": "ZCL_TEST_001",
    "source_code": "NEW CODE HERE...",
    "lock_handle": "...",
    "session_id": "...",
    "session_state": {...}
  }
}
```

### 2. Deferred Group Activation

**For related objects, use deferred group activation:**

```json
{
  "name": "ActivateObjectLow",
  "arguments": {
    "objects": [
      { "name": "ZDOMAIN_001", "type": "DOMA/DD" },
      { "name": "ZDTEL_001", "type": "DTEL/DE" },
      { "name": "ZTABL_001", "type": "TABL/DT" }
    ],
    "preaudit": true
  }
}
```

## Quick Navigation

- [Classes](./simple-objects/classes.md) - Creating and updating ABAP classes
- [Tables](./simple-objects/tables.md) - Creating and updating database tables
- [CDS Views](./simple-objects/views.md) - Creating and updating CDS views
- [RAP BO Creation](./rap-business-objects/creating-rap-bo.md) - Complete RAP Business Object workflow
- [Deferred Activation](./rap-business-objects/deferred-activation.md) - Group activation guide

## Related Documentation

- [Available Tools](../AVAILABLE_TOOLS.md) - Complete list of all MCP tools
- [Scenarios](../scenarios/) - Low-level handler usage scenarios
- [Client Configuration](../CLIENT_CONFIGURATION.md) - MCP client setup


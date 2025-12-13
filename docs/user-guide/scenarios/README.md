# Low-Level Handler Usage Scenarios

This directory contains practical examples and scenarios for using low-level MCP handlers to create and modify ABAP objects.

## Overview

Low-level handlers provide fine-grained control over ABAP object operations. They require explicit session management and follow a specific workflow pattern:

1. **GetSession** - Obtain session ID and state
2. **Validate** - Check if object name is valid and available
3. **Create** - Create the object
4. **Lock** - Acquire lock for modification
5. **Update** - Modify the object (source code, metadata, etc.)
6. **Unlock** - Release the lock
7. **Activate** - Activate the object

## Available Scenarios

| Document | Description |
|----------|-------------|
| [Creating Classes](./CREATING_CLASSES.md) | Complete workflow for creating ABAP classes with source code |
| [Creating CDS Views](./CREATING_CDS_VIEWS.md) | Workflow for creating CDS views (DDL source) |
| [Creating Function Groups](./CREATING_FUNCTION_GROUPS.md) | Workflow for creating function groups and function modules |
| [Session Management](./SESSION_MANAGEMENT.md) | Understanding and managing stateful sessions |
| [Common Patterns](./COMMON_PATTERNS.md) | Reusable patterns for different object types |

## When to Use Low-Level vs High-Level Handlers

### Use Low-Level Handlers When:
- You need fine-grained control over each step
- You want to reuse the same session across multiple operations
- You need to handle errors at each step individually
- You're building custom workflows or automation scripts
- You're integrating with external systems that need explicit control

### Use High-Level Handlers When:
- You want a simple, all-in-one operation
- You don't need to customize the workflow
- You're doing quick, one-off operations
- You prefer automatic error handling and session management

## Quick Start

For a quick example, see [Creating Classes](./CREATING_CLASSES.md) which demonstrates the complete workflow.

## Related Documentation

- [Stateful Session Guide](../../architecture/STATEFUL_SESSION_GUIDE.md) - Technical details on session management
- [Available Tools](../AVAILABLE_TOOLS.md) - Complete list of all MCP tools
- [Client Configuration](../CLIENT_CONFIGURATION.md) - How to configure MCP clients


# ABAP Parser and Semantic Analysis Tools

This document describes the new tools for parsing and semantic analysis of ABAP code that were added to the MCP ABAP ADT server.

## Overview

Three new tools were added:

1. **GetAbapAST** – Parses ABAP code and generates an AST (Abstract Syntax Tree)
2. **GetAbapSemanticAnalysis** – Performs semantic analysis with symbol, type, and scope resolution
3. **GetAbapSystemSymbols** – Resolves symbols against the SAP system and enriches them with additional metadata

## Setup

### Makefile

A Makefile automates the workflow with ANTLR4:

```bash
# Download ANTLR4 and generate the parser
make setup generate

# Build the project
make build

# Development loop (generate + build + run)
make dev

# Run tests
make test

# Clean generated files
make clean

# Full cleanup (including the ANTLR JAR)
make clean-all
```

### Automatic parser generation

The parser is generated automatically during the project build:

```bash
npm run build  # Runs make generate first, followed by tsc
```

### Ignoring generated files

Generated assets are already ignored by Git:
- `src/generated/` – Parser output
- `tools/antlr/` – ANTLR4 JAR file

## Tools

### 1. GetAbapAST

Parses ABAP code and returns the AST tree in JSON format.

**Parameters:**
- `code` (required) – ABAP code to parse
- `filePath` (optional) – File path to persist the result

**Example usage:**
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    METHODS: test.\nENDCLASS.",
  "filePath": "output/ast.json"
}
```

**Result:**
```json
{
  "type": "abapSource",
  "sourceLength": 85,
  "lineCount": 4,
  "structures": [
    {
      "type": "class",
      "line": 1,
      "content": "CLASS zcl_test DEFINITION."
    }
  ],
  "classes": [
    {
      "name": "zcl_test",
      "type": "definition",
      "position": 0
    }
  ],
  "methods": [
    {
      "name": "test",
      "position": 50
    }
  ]
}
```

### 2. GetAbapSemanticAnalysis

Performs semantic analysis of ABAP code and returns symbols, types, scopes, and dependencies.

**Parameters:**
- `code` (required) – ABAP code to analyse
- `filePath` (optional) – File path to persist the result

**Example usage:**
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    DATA: lv_text TYPE string.\n    METHODS: process IMPORTING iv_input TYPE string.\nENDCLASS.",
  "filePath": "output/semantic.json"
}
```

**Result:**
```json
{
  "symbols": [
    {
      "name": "ZCL_TEST",
      "type": "class",
      "scope": "global",
      "line": 1,
      "column": 1,
      "visibility": "public"
    },
    {
      "name": "LV_TEXT",
      "type": "variable",
      "scope": "ZCL_TEST",
      "line": 3,
      "column": 1,
      "dataType": "STRING",
      "visibility": "public"
    },
    {
      "name": "PROCESS",
      "type": "method",
      "scope": "ZCL_TEST",
      "line": 4,
      "column": 1,
      "visibility": "public",
      "parameters": [
        {
          "name": "IV_INPUT",
          "type": "importing",
          "dataType": "STRING"
        }
      ]
    }
  ],
  "dependencies": [],
  "errors": [],
  "scopes": [
    {
      "name": "ZCL_TEST",
      "type": "class",
      "startLine": 1,
      "endLine": 5
    }
  ]
}
```

### 3. GetAbapSystemSymbols

Runs semantic analysis and resolves symbols against the SAP system, enriching them with package details, descriptions, and system attributes.

**Parameters:**
- `code` (required) – ABAP code for analysis and resolution
- `filePath` (optional) – File path to persist the result

**Example usage:**
```json
{
  "code": "CLASS cl_salv_table DEFINITION.\n  METHODS: factory.\nENDCLASS.",
  "filePath": "output/system_symbols.json"
}
```

**Result:**
```json
{
  "symbols": [
    {
      "name": "CL_SALV_TABLE",
      "type": "class",
      "scope": "global",
      "line": 1,
      "column": 1,
      "visibility": "public",
      "systemInfo": {
        "exists": true,
        "objectType": "CLAS",
        "description": "ALV Table in Object Oriented Environment",
        "package": "SALV_OM",
        "methods": ["FACTORY", "GET_COLUMNS", "DISPLAY"],
        "interfaces": ["IF_SALV_TABLE"],
        "attributes": ["MR_TABLE"]
      }
    }
  ],
  "dependencies": [],
  "errors": [],
  "scopes": [
    {
      "name": "CL_SALV_TABLE",
      "type": "class",
      "startLine": 1,
      "endLine": 3
    }
  ],
  "systemResolutionStats": {
    "totalSymbols": 1,
    "resolvedSymbols": 1,
    "failedSymbols": 0,
    "resolutionRate": "100.0%"
  }
}
```

## Architecture

### Components

1. **Makefile** – Automates ANTLR4 tasks and builds
2. **Abap.g4** – ABAP grammar for ANTLR4
3. **src/lib/abapParser.ts** – Core classes for parsing and analysis
4. **src/handlers/handleGetAbapAST.ts** – Handler for AST responses
5. **src/handlers/handleGetAbapSemanticAnalysis.ts** – Handler for semantic analysis
6. **src/handlers/handleGetAbapSystemSymbols.ts** – Handler for system resolution

### Workflow

1. **Parsing** – ABAP code is parsed using the simplified parser (until full ANTLR4 adoption)
2. **Semantic analysis** – Symbols, types, scopes, and dependencies are computed
3. **System resolution** – Symbols are resolved through existing SAP ADT handlers

### Future plans

- Fully adopt ANTLR4 for precise parsing
- Extend the grammar to cover more ABAP constructs
- Add contextual analysis and validation
- Integrate with additional SAP system APIs

## Development usage

### Example commands

```bash
# Set up the environment
make setup

# Development cycle with automatic generation
make dev

# Test the new tools
npm test

# Clean and rebuild everything
make clean-all && make all
```

### Integration with existing tools

The new tools integrate seamlessly with the existing infrastructure:
- They reuse the shared tool registry
- They follow the same response format
- They leverage the existing SAP ADT handlers for symbol resolution

### Debugging

Every tool accepts an optional `filePath` parameter to capture results on disk, which simplifies debugging and later analysis.

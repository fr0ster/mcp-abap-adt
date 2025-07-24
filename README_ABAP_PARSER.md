# ABAP Parser Integration

This document describes the ABAP parser integration using ANTLR4 grammar for parsing ABAP code and performing semantic analysis.

## Overview

The ABAP parser provides three main tools:
1. **GetAbapAST** - Generates Abstract Syntax Tree from ABAP code
2. **GetAbapSemanticAnalysis** - Performs semantic analysis with symbols, scopes, and dependencies
3. **GetAbapSystemSymbols** - Resolves symbols with SAP system information

## Setup and Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup ANTLR4

```bash
# Download ANTLR4 JAR and setup tools
make setup

# Or use npm script
npm run setup
```

### 3. Generate Parser

```bash
# Generate parser from grammar (always)
make generate

# Generate only if grammar changed
make generate-if-needed

# Or use npm scripts
npm run generate
npm run generate-if-needed
```

### 4. Build Project

```bash
# Build with parser generation if needed
make build

# Build without parser generation
make build-only

# Full build (always regenerate parser)
make build-full

# Or use npm scripts
npm run build
npm run build-full
```

## File Structure

```
├── Abap.g4                          # ANTLR4 grammar file
├── Makefile                         # Build automation
├── tools/antlr/                     # ANTLR4 JAR files (auto-downloaded)
├── src/
│   ├── generated/                   # Generated ANTLR4 files (git-ignored)
│   ├── lib/
│   │   └── abapParser.ts           # Core parser classes
│   └── handlers/
│       ├── handleGetAbapAST.ts     # AST generation handler
│       ├── handleGetAbapSemanticAnalysis.ts # Semantic analysis handler
│       └── handleGetAbapSystemSymbols.ts    # System symbol resolution handler
```

## Available Make Targets

### Setup & Installation
- `make setup` - Download ANTLR4 JAR
- `make install` - Install npm dependencies
- `make reset` - Clean and reinstall everything

### Parser Generation
- `make generate` - Generate parser from grammar (always)
- `make generate-if-needed` - Generate parser only if grammar changed
- `make validate-grammar` - Check grammar syntax
- `make watch-grammar` - Watch for grammar changes

### Building
- `make build` - Generate parser if needed + build TypeScript
- `make build-full` - Always regenerate parser + build TypeScript
- `make build-only` - Build TypeScript without parser generation

### Development
- `make dev` - Build and run in development mode
- `make test` - Build and run tests

### Cleanup
- `make clean` - Clean generated files (preserve ANTLR JAR)
- `make clean-all` - Clean everything including ANTLR JAR

### Information
- `make parser-stats` - Show parser generation statistics
- `make help` - Show available targets

## Core Classes

### AbapASTGenerator

Generates Abstract Syntax Tree from ABAP code.

```typescript
import { AbapASTGenerator } from './lib/abapParser';

const generator = new AbapASTGenerator();
const ast = generator.parseToAST(abapCode);
```

### AbapSemanticAnalyzer

Performs semantic analysis to extract symbols, scopes, and dependencies.

```typescript
import { AbapSemanticAnalyzer } from './lib/abapParser';

const analyzer = new AbapSemanticAnalyzer();
const analysis = analyzer.analyze(abapCode);
```

### AbapSystemSymbolResolver

Resolves symbols with SAP system information using existing ADT handlers.

```typescript
import { AbapSystemSymbolResolver } from './lib/abapParser';

const resolver = new AbapSystemSymbolResolver();
const resolved = await resolver.resolveSymbols(symbols);
```

## Tool Handlers

### GetAbapAST

**Purpose**: Parse ABAP code and return AST in JSON format.

**Parameters**:
- `code` (required): ABAP source code to parse
- `filePath` (optional): File path to write result to
- `useDetailedAST` (optional): Whether to return detailed AST (default: false)

**Example**:
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    METHODS: test.\nENDCLASS.",
  "useDetailedAST": true
}
```

### GetAbapSemanticAnalysis

**Purpose**: Perform semantic analysis on ABAP code.

**Parameters**:
- `code` (required): ABAP source code to analyze
- `filePath` (optional): File path to write result to
- `includeDetailedScopes` (optional): Include detailed scope information (default: true)
- `analyzeComplexity` (optional): Analyze code complexity metrics (default: false)

**Example**:
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    METHODS: test.\nENDCLASS.",
  "analyzeComplexity": true
}
```

### GetAbapSystemSymbols

**Purpose**: Resolve ABAP symbols with SAP system information.

**Parameters**:
- `code` (required): ABAP source code to analyze
- `filePath` (optional): File path to write result to
- `resolveSystemInfo` (optional): Whether to resolve with SAP system (default: true)
- `includeLocalSymbols` (optional): Include local symbols (default: false)

**Example**:
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    METHODS: test.\nENDCLASS.",
  "resolveSystemInfo": true,
  "includeLocalSymbols": false
}
```

## Output Formats

### AST Output
```json
{
  "type": "abapSource",
  "sourceLength": 1234,
  "lineCount": 45,
  "parseMethod": "simplified",
  "structures": [...],
  "includes": [...],
  "classes": [...],
  "methods": [...],
  "dataDeclarations": [...],
  "forms": [...],
  "metadata": {
    "generatedAt": "2024-01-15T10:30:00.000Z",
    "hasErrors": false,
    "warnings": []
  }
}
```

### Semantic Analysis Output
```json
{
  "symbols": [
    {
      "name": "ZCL_TEST",
      "type": "class",
      "scope": "global",
      "line": 1,
      "column": 1,
      "visibility": "public",
      "description": "Test class"
    }
  ],
  "dependencies": ["INCLUDE1", "INCLUDE2"],
  "errors": [],
  "scopes": [
    {
      "name": "ZCL_TEST",
      "type": "class",
      "startLine": 1,
      "endLine": 10,
      "parent": "global"
    }
  ]
}
```

### System Symbols Output
```json
{
  "symbols": [
    {
      "name": "ZCL_TEST",
      "type": "class",
      "scope": "global",
      "line": 1,
      "column": 1,
      "systemInfo": {
        "exists": true,
        "objectType": "CLAS",
        "description": "Test Class",
        "package": "Z_PACKAGE",
        "methods": ["TEST_METHOD"],
        "interfaces": [],
        "superClass": null
      }
    }
  ],
  "systemResolutionStats": {
    "totalSymbols": 5,
    "resolvedSymbols": 3,
    "failedSymbols": 2,
    "resolutionRate": "60.0%"
  }
}
```

## Development Workflow

### 1. Modify Grammar
Edit `Abap.g4` file to add or modify ABAP language constructs.

### 2. Validate Grammar
```bash
make validate-grammar
```

### 3. Regenerate Parser
```bash
make generate
```

### 4. Update Parser Classes
Modify `src/lib/abapParser.ts` to handle new grammar constructs.

### 5. Test Changes
```bash
make test
```

### 6. Build and Deploy
```bash
make build
```

## Grammar Features

The ABAP grammar (`Abap.g4`) supports:

- **Class definitions and implementations**
- **Method declarations and implementations**
- **Data declarations** (DATA, CONSTANTS, TYPES)
- **Form definitions**
- **Function modules**
- **Include statements**
- **Interface definitions**
- **Report and program structures**
- **Comments and documentation**
- **Basic control structures** (IF, LOOP, TRY)
- **Method calls and function calls**

## Best Practices

### Grammar Development
1. Keep grammar rules simple and focused
2. Use meaningful rule names
3. Handle case-insensitivity properly
4. Include error recovery mechanisms

### Parser Implementation
1. Use fallback implementations for robustness
2. Provide detailed error messages
3. Include source location information
4. Cache parsed results when possible

### Testing
1. Test with real ABAP code samples
2. Include edge cases and error conditions
3. Verify performance with large files
4. Test integration with existing tools

## Troubleshooting

### Common Issues

**Grammar validation fails**:
```bash
make validate-grammar
# Check grammar syntax in Abap.g4
```

**Parser generation fails**:
```bash
# Clean and regenerate
make clean
make generate
```

**TypeScript compilation errors**:
```bash
# Check generated files exist
ls -la src/generated/
# Regenerate if needed
make generate
```

**Missing ANTLR JAR**:
```bash
# Download ANTLR JAR
make setup
```

### Performance Optimization

1. **Use incremental parsing** for large files
2. **Cache AST results** to avoid re-parsing
3. **Optimize grammar rules** to reduce backtracking
4. **Use streaming** for very large files

## Integration with Existing Tools

The ABAP parser integrates with existing MCP ABAP ADT tools:

- Uses `handleGetClass` for class information
- Uses `handleGetFunction` for function details  
- Uses `handleGetInterface` for interface data
- Leverages existing authentication and connection handling

## Future Enhancements

1. **Full ANTLR4 integration** replacing simplified parser
2. **Advanced semantic analysis** with type checking
3. **Code completion support** 
4. **Syntax highlighting** information
5. **Refactoring assistance**
6. **Performance optimization** for large codebases

## Contributing

When contributing to the ABAP parser:

1. Test grammar changes thoroughly
2. Update documentation for new features
3. Follow TypeScript coding standards
4. Include unit tests for new functionality
5. Verify integration with existing tools

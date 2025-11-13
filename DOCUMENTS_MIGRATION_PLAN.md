# Documents Migration Plan

## Overview

When extracting packages to separate repositories (as git submodules), we need to identify which documents should be moved to the package repository and which should remain in the main repository.

## Package: `@mcp-abap-adt/adt-clients`

### Documents to Move to Package Repository

These documents are specific to the ADT clients package and should be moved:

1. **`ADT_CLIENTS_ARCHITECTURE.md`** → `packages/adt-clients/ARCHITECTURE.md`
   - Architecture documentation for the clients package
   - Should be in the package repository

### Documents to Keep in Main Repository

These documents are about the overall project or other packages:

1. **`UTILS_ANALYSIS.md`** - Analysis of utilities (may be relevant for future packages)
2. **`MONOREPO_ANALYSIS.md`** - Overall monorepo analysis
3. **`CONNECTION_LAYER_ROADMAP.md`** - Already moved to `packages/connection/`
4. **`ROADMAP.md`** - Main project roadmap
5. **`CHANGELOG.md`** - Main project changelog
6. **`README.md`** - Main project README
7. **`ASSISTANT_GUIDELINES.md`** - Project guidelines
8. **`TEST_SYSTEM_SETUP.md`** - Test setup for main project
9. **`TESTING_ROADMAP.md`** - Testing roadmap for main project
10. **`CONTRIBUTORS.md`** - Main project contributors
11. **`TOOLS_ARCHITECTURE.md`** - Tools architecture (MCP server specific)
12. **`README_ABAP_PARSER.md`** - ABAP parser documentation
13. **`URI_AUTO_GENERATION.md`** - URI generation (MCP server specific)
14. **`GROUP_ACTIVATION_SUMMARY.md`** - Activation summary (MCP server specific)
15. **`ACTIVATION_ENDPOINT_UPDATE.md`** - Activation endpoint (MCP server specific)
16. **`doc/`** directory - All documentation in `doc/` folder (MCP server specific)

### Documents to Delete After Migration

These documents are temporary analysis/planning documents that should be removed after implementation:

1. **`ADT_CLIENTS_ARCHITECTURE.md`** - After moving to package repository
2. **`UTILS_ANALYSIS.md`** - After utilities are extracted (if applicable)
3. **`MONOREPO_ANALYSIS.md`** - After monorepo split is complete

## Package: `@mcp-abap-adt/connection` (Already Extracted)

### Documents Already Moved

1. **`PUBLICATION_ROADMAP.md`** → `packages/connection/PUBLICATION_ROADMAP.md`
2. **`README.md`** → `packages/connection/README.md`
3. **`LICENSE`** → `packages/connection/LICENSE`

### Documents to Keep in Main Repository

1. **`CONNECTION_LAYER_ROADMAP.md`** - Historical/planning document, can be archived or deleted

## Migration Checklist

### For `@mcp-abap-adt/adt-clients` Package

- [ ] Create package repository `mcp-abap-adt-clients`
- [ ] Move `ADT_CLIENTS_ARCHITECTURE.md` → `packages/adt-clients/ARCHITECTURE.md`
- [ ] Create `packages/adt-clients/README.md` (package-specific)
- [ ] Create `packages/adt-clients/LICENSE` (copy from root)
- [ ] Add package as git submodule
- [ ] Delete `ADT_CLIENTS_ARCHITECTURE.md` from main repository
- [ ] Update main repository documentation to reference package

### Cleanup After All Packages Extracted

- [ ] Review and archive/delete temporary analysis documents:
  - `UTILS_ANALYSIS.md` (if utilities are not extracted)
  - `MONOREPO_ANALYSIS.md` (after monorepo split is complete)
  - `CONNECTION_LAYER_ROADMAP.md` (historical document)

## Document Structure After Migration

### Main Repository (`mcp-abap-adt`)

```
mcp-abap-adt/
├── README.md                    # Main project README
├── CHANGELOG.md                 # Main project changelog
├── ROADMAP.md                   # Main project roadmap
├── CONTRIBUTORS.md              # Contributors
├── ASSISTANT_GUIDELINES.md      # Development guidelines
├── TOOLS_ARCHITECTURE.md        # MCP server tools architecture
├── doc/                         # MCP server documentation
│   ├── INSTALLATION.md
│   ├── AVAILABLE_TOOLS.md
│   └── ...
├── packages/
│   ├── connection/              # Git submodule
│   │   ├── README.md
│   │   ├── PUBLICATION_ROADMAP.md
│   │   └── LICENSE
│   └── adt-clients/             # Git submodule (future)
│       ├── README.md
│       ├── ARCHITECTURE.md
│       └── LICENSE
└── tests/                       # Test documentation
    └── README.md
```

### Package Repository (`mcp-abap-adt-clients`)

```
mcp-abap-adt-clients/
├── README.md                    # Package README with usage examples
├── ARCHITECTURE.md              # Architecture documentation
├── LICENSE                      # MIT License
├── package.json
└── src/
    └── ...
```

## Notes

- Keep architecture/planning documents in package repositories for better discoverability
- Main repository should reference packages but not duplicate their documentation
- Historical documents can be archived in a `docs/archive/` folder if needed
- Each package should have its own README with installation and usage instructions


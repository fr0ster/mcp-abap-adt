# Testing Roadmap

## ✅ COMPLETED

### 1. CREATE/UPDATE/DELETE Tests - YAML Migration
All CREATE/UPDATE/DELETE tests have been migrated to use YAML configuration:
- ✅ test-create-domain.js
- ✅ test-update-domain.js
- ✅ test-create-data-element.js
- ✅ test-update-data-element.js
- ✅ test-create-program.js
- ✅ test-update-program-source.js
- ✅ test-create-class.js
- ✅ test-update-class-source.js
- ✅ test-create-interface.js
- ✅ test-update-interface-source.js
- ✅ test-create-function-group.js
- ✅ test-delete-object.js
- ✅ test-create-table.js
- ✅ test-create-structure.js
- ✅ test-create-view.js
- ✅ test-update-view-source.js
- ✅ test-create-function-module.js
- ✅ test-update-function-module-source.js

### 2. Handler Fixes
- ✅ DeleteObject handler - removed `object_uri` parameter (URI now built automatically)
- ✅ All handlers properly support $TMP package (no transport_request required)

### 3. Documentation Updates
- ✅ INSTALL_WINDOWS.md - corrected installation order (build → configure .env → test)

### 4. YAML Configuration
- ✅ Added test configs for all object types (Domain, DataElement, Program, Class, Interface, FunctionGroup, FunctionModule, View, Table, Structure)
- ✅ Added $TMP test cases for all CREATE handlers
- ✅ Added YAML configs for all GET handlers

### 5. Test Fixes
- ✅ index.test.ts - fixed SearchObject test (parameter `object_name` instead of `query`)

---

## 🔄 IN PROGRESS

### GET Tests - YAML Migration

#### Group 1: Core GET Tests (enabled: true)
- [ ] test-get-program.js - `get_program`
- [ ] test-get-class.js - `get_class`
- [ ] test-get-function-group.js - `get_function_group`
- [ ] test-get-function.js - `get_function`
- [ ] test-get-table.js - `get_table`
- [ ] test-get-table-contents.js - `get_table_contents`
- [ ] test-get-structure.js - `get_structure`

#### Group 2: Additional GET Tests (enabled: false, can be enabled)
- [ ] test-get-package.js - `get_package`
- [ ] test-get-include.js - `get_include`
- [ ] test-get-type-info.js - `get_type_info`
- [ ] test-get-interface.js - `get_interface`
- [ ] test-get-transaction.js - `get_transaction`
- [ ] test-get-enhancements.js - `get_enhancements`
- [ ] test-get-sql-query.js - `get_sql_query`

#### Group 3: Search Test
- [ ] test-search-object.js - `search_object` (create new file)

**Current Status:** 
- YAML configs created for all GET handlers
- Template created for test-get-program.js (test-get-program-new.js)
- Need to apply template to remaining GET tests

---

## 📝 TODO

### Update index.test.ts
After all GET tests are migrated:
- [ ] Remove all hardcoded test implementations
- [ ] Import test functions from individual test files
- [ ] Call them through Jest describe/it blocks
- [ ] index.test.ts becomes Jest orchestrator only

---

## 🎯 FINAL GOAL

**Unified Test Architecture:**
- All tests use YAML configuration from `tests/test-config.yaml`
- Consistent format across all test files using `getAllEnabledTestCases()`
- Tests can be enabled/disabled via `enabled` flag in YAML
- Tests skip automatically if parameters are missing
- Can run individually: `node tests/test-*.js`
- Can run via Jest: `npm test`
- index.test.ts acts as orchestrator, not implementation

**Benefits:**
- Easy test configuration management
- No hardcoded test parameters
- Consistent test output format
- Support for $TMP package testing
- Clear separation between test runner and test logic

---

## 📊 Progress

**Completed:** 18/32 test files (56%)
- CREATE/UPDATE/DELETE: 18/18 ✅
- GET/SEARCH: 0/14 ⏳

**Next Steps:**
1. Apply YAML template to Group 1 GET tests (7 files)
2. Apply YAML template to Group 2 GET tests (7 files)
3. Create test-search-object.js
4. Refactor index.test.ts to use test file imports

---

Last Updated: 2025-11-11

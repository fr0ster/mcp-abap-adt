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
- [x] test-get-program.js - `get_program` ✅
- [x] test-get-class.js - `get_class` ✅
- [x] test-get-function-group.js - `get_function_group` ✅
- [x] test-get-function.js - `get_function` ✅
- [x] test-get-table.js - `get_table` ✅
- [x] test-get-table-contents.js - `get_table_contents` ✅
- [x] test-get-structure.js - `get_structure` ✅

#### Group 2: Additional GET Tests (enabled: false, can be enabled)
- [x] test-get-package.js - `get_package` ✅
- [x] test-get-include.js - `get_include` ✅ (disabled for Cloud, S4HANA only)
- [x] test-get-type-info.js - `get_type_info` ✅
- [x] test-get-interface.js - `get_interface` ✅
- [x] test-get-transaction.js - `get_transaction` ✅
- [x] test-get-enhancements.js - `get_enhancements` ✅
- [x] test-get-sql-query.js - `get_sql_query` ✅
- [x] test-get-prog-full-code.js - `get_prog_full_code` ✅ (Cloud: FUGR, S4HANA: PROG/P)
- [x] test-get-includes-list.js - `get_includes_list` ✅ (Cloud: FUGR, S4HANA: PROG/P)
- [x] test-get-objects-list.js - `get_objects_list` ✅ (Cloud: FUGR, S4HANA: PROG/P)
- [x] test-get-object-structure.js - `get_object_structure` ✅

#### Group 3: Search Test
- [x] test-search-object.js - `search_object` ✅

**Current Status:** 
- ✅ Group 1 (7 tests) - COMPLETED
- ✅ Group 2 (11 tests) - COMPLETED (all migrated to test-helper)
- ✅ Group 3 (1 test) - COMPLETED (test-search-object.js)
- ✅ YAML configs created for all GET handlers
- ✅ Template created and applied to all GET tests
- ✅ Cloud/S4HANA compatibility: Tests support both (Cloud uses FUGR/CLAS, S4HANA uses PROG/P with enabled: false)

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

**Completed:** 37/37 test files (100%) ✅
- CREATE/UPDATE/DELETE: 18/18 ✅
- GET/SEARCH: 19/19 ✅ (Group 1 ✅ + Group 2 ✅ + Group 3 ✅)

**Recent Updates (2025-01-11):**
1. ✅ Added high-priority test configs: `create_table`, `create_structure`, `create_view`, `update_view_source`
2. ✅ Added GET test configs: `get_prog_full_code`, `get_includes_list`, `get_objects_list`, `get_object_structure`
3. ✅ Updated all GET tests to use `test-helper` and `getAllEnabledTestCases()`
4. ✅ Added Cloud/S4HANA compatibility: Cloud tests use FUGR/CLAS, S4HANA tests (PROG/P) have `enabled: false` by default
5. ✅ Test coverage increased from 60% to 74% in test-config.yaml

**Next Steps:**
1. Refactor index.test.ts to use test file imports (optional)
2. Add remaining GET configs for advanced handlers (optional)

---

Last Updated: 2025-01-11

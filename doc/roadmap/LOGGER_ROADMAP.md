# Roadmap: Logger Adoption (@mcp-abap-adt/logger)

## Goals
- Unify handler and integration-test logging via `@mcp-abap-adt/logger` (no ad-hoc `console.*`).
- Support categories/levels (`test`, `connection`, `auth`, `adt`, etc.) controlled via env.
- Allow optional file sink per suite for diagnostics.

## Core Tasks
- [x] Introduce shared test logger (categories: `test`, `connection`, `auth`, `adt`) with level control (`TEST_LOG_LEVEL`, map DEBUG_* → `debug`, `TEST_LOG_SILENT` to disable).
- [x] Replace ad-hoc `console.log/warn/error` with logger pipeline across helpers and suites (Jest setup routes all console calls through logger with `[test]` prefix).
- [x] Add file sink toggle (`TEST_LOG_FILE=/tmp/...`, single file or per-suite prefix).
- [x] Document switches in README/TESTING_AUTH.md (`TEST_LOG_LEVEL`, `DEBUG_TESTS/DEBUG_CONNECTORS/DEBUG_ADT_TESTS`, `TEST_LOG_FILE`, `TEST_LOG_SILENT`).
- [x] (Optional) Add short colored/prefixed category tags for stdout grep-ability (`TEST_LOG_COLOR=true`).

## Handler Migration Checklist (switch to @mcp-abap-adt/logger)
- [x] Behavior Definition handlers (high/low/read-only)
- [x] Behavior Implementation handlers
- [x] Class handlers (high/low/read-only, incl. unit-test helpers)
- [x] Common generic object handlers (activate/check/delete/lock/unlock/validate)
- [x] Data Element handlers (high/low/read-only)
- [x] Domain handlers (high/low/read-only)
- [x] Function Group / Function Module handlers (high/low/read-only)
- [x] Interface handlers (high/low/read-only)
- [x] Metadata Extension (DDLX) handlers (high/low/read-only)
- [x] Package handlers (high/low/read-only)
- [x] Program handlers (high/low/read-only)
- [x] Service Definition handlers (high/read-only)
- [x] Structure handlers (high/low/read-only)
- [x] Table handlers (high/low/read-only)
- [x] View (CDS) handlers (high/low/read-only)
- [x] Utility handlers: Enhancement, Include, Search (read-only)
- [x] System handlers (read-only, incl. `handleGetSqlQuery`, `handleGetObjectInfo`, `handleDescribeByList`, etc.)
- [x] Transport handlers (high/low)

## Test Migration Checklist (replace console with logger)
- [ ] Integration helpers: `sessionHelpers.ts`, `testHelpers.ts`, `authHelpers.ts`, `configHelpers.ts`
- [ ] Behavior Definition integration suites (high/low)
- [ ] Behavior Implementation integration suites (high/low)
- [ ] Class integration suites (high/low + unit-test flows)
- [ ] Data Element integration suites (high/low)
- [ ] Domain integration suites (high/low)
- [ ] Function Group / Function Module integration suites (high/low)
- [ ] Interface integration suites (high/low)
- [ ] Metadata Extension (DDLX) integration suites (high/low)
- [ ] Package integration suites (high/low)
- [ ] Program integration suites (high/low)
- [ ] Service Definition integration suites (high/low)
- [ ] Structure integration suites (high/low)
- [ ] Table integration suites (high/low)
- [ ] View (CDS) integration suites (high/low)
- [ ] Utility/system integration suites (search/object info/describe/etc.)

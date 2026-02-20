# Compact Facade Router Roadmap

## Scope
- Build a compact facade layer over existing high-level handlers.
- Keep existing high-level handlers as execution backend.
- Implement a typed router by `object_type` + `operation`.

## Requirements (Locked)
- [x] All high-level object types are addressable through compact facade.
- [x] Full CRUD parity where CRUD exists in high-level handlers.
- [x] Full non-CRUD parity via action routing (`run`, `status`, `result`, `validate`, `list_types`, `create_transport`, etc.).
- [x] Implemented as router/dispatcher to existing handlers (no business logic duplication).
- [ ] Covered by automated tests (routing + parity smoke coverage).

## Object Type Matrix
- [x] `PACKAGE`: create, get
- [x] `DOMAIN`: create, get, update, delete
- [x] `DATA_ELEMENT`: create, get, update, delete
- [x] `TRANSPORT`: create, create_transport
- [x] `TABLE`: create, get, update, delete
- [x] `STRUCTURE`: create, get, update, delete
- [x] `VIEW`: create, get, update, delete
- [x] `SERVICE_DEFINITION`: create, get, update, delete
- [x] `SERVICE_BINDING`: create, get, update, delete, list_types, validate
- [x] `CLASS`: create, get, update, delete
- [x] `UNIT_TEST`: create, get, update, delete, run, status, result
- [x] `CDS_UNIT_TEST`: create, get, update, delete, status, result
- [x] `LOCAL_TEST_CLASS`: create, get, update, delete
- [x] `LOCAL_TYPES`: create, get, update, delete
- [x] `LOCAL_DEFINITIONS`: create, get, update, delete
- [x] `LOCAL_MACROS`: create, get, update, delete
- [x] `PROGRAM`: create, get, update, delete
- [x] `INTERFACE`: create, get, update, delete
- [x] `FUNCTION_GROUP`: create, get, update, delete
- [x] `FUNCTION_MODULE`: create, get, update, delete
- [x] `BEHAVIOR_DEFINITION`: create, get, update, delete
- [x] `BEHAVIOR_IMPLEMENTATION`: create, get, update, delete
- [x] `METADATA_EXTENSION`: create, get, update, delete

## Implementation Phases

### Phase 1: Router Foundation
- [x] Introduce compact CRUD handlers (`HandlerCreate/Get/Update/Delete`) for initial object set.
- [x] Replace per-file switch statements with centralized router map.
- [x] Add `HandlerAction` handler for non-CRUD operations.

### Phase 2: Full Coverage
- [x] Extend `object_type` enum and argument typing to full matrix.
- [x] Wire all high-level handlers into router map (CRUD + action).
- [x] Ensure unsupported operation errors are explicit and deterministic.

### Phase 3: Tests
- [ ] Router dispatch tests for each matrix entry.
- [ ] Schema validation tests for required fields per route.
- [ ] Parity smoke tests vs legacy high-level tool behavior.

### Phase 4: Rollout
- [ ] Document compact facade in `AVAILABLE_TOOLS_HIGH.md` and `README.md`.
- [ ] Keep legacy high-level tools for compatibility during transition.
- [ ] Optional deprecation plan for direct high-level tools (separate decision).

## Current Status
- Branch: `feature/compact-facade-tools`
- Status: Phase 3 in progress
- Last Updated: 2026-02-20

# Test Locking & Session Persistence Roadmap

## Goal
Persist session/lock diagnostics for integration tests to allow post-failure unlock and session reconstruction. Always capture; optionally clean up sessions when configured.

## Configuration
- `lock_config`: `persist_locks`, `locks_dir`.

## Implementation Steps
Progress is tracked by ticking the checkboxes below in _this_ file.

- [x] **Config access**
- [x] **Persistence helper**
  - New `src/__tests__/integration/helpers/persistenceHelpers.ts`.
  - Functions: `saveSessionSnapshot`, `saveLockSnapshot` (JSON; base64 for heavy fields), `cleanupSessionSnapshot`.
- [x] **Tracker factory**
  - Add `createDiagnosticsTracker(testLabel, testCase, session?, extra?)` wrapper over persistence helpers (persist session immediately; `persistLock`/`cleanup` methods).
- [ ] **Wiring in tests (by groups)**
  - [] Classes:
    - [x] Low: class low + Crud direct wired.
    - [ ] High: class high wired.
  - [ ] Dictionary:
    - [x] Low: view, dataElement, domain, structure, table.
    - [ ] High: view, dataElement, domain, structure, table.
  - [ ] Packages & transport-related:
    - [x] Low: package.
    - [ ] High: package.
  - [ ] Function objects:
    - [x] Low: functionGroup, functionModule.
    - [ ] High: function (group + module high-level flows).
  - [ ] ABAP code artifacts:
    - [x] Low: interface, program.
    - [ ] High: interface, program, serviceDefinition.
  - [ ] RAP-related:
    - [x] Low: behaviorDefinition, behaviorImplementation, metadataExtension.
    - [ ] High: behaviorDefinition, behaviorImplementation, metadataExtension.
  - [ ] Unit test container:
    - [x] Low/high: src/__tests__/integration/low/unitTest/ClassUnitTestHandlers.test.ts.
  - [ ] Pattern: create tracker after session, `persistLock` after lock, `cleanup` in `finally`.
- [ ] **Cleanup behavior**
  - Delete session files on success when `cleanup_session_after_test=true`.
  - Keep lock files unless an explicit policy says otherwise.
- [ ] **Docs/template**
  - Ensure `tests/test-config.yaml.template` documents the settings and file locations/format.
- [ ] **Verification**

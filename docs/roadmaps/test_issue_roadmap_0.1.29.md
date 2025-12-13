# Test Issue Roadmap 0.1.29

Source log: `test-run.log` (DEBUG_TESTS=true, `npm test -- --testPathPattern=integration > test-run.log 2>&1`).

## Observed Issues (initial list)
- [ ] **Connection/CSRF failures**: `getaddrinfo ENOTFOUND 5bff2ab7-3ad1-48e3-8980-53a354a1b276.abap.us10.hana.ondemand.com` during `createTestConnectionAndSession` (affects many suites; tests skipped).
- [ ] **Env missing**: `⚠️ Skipping tests: No .env file or SAP configuration found` — suggests env not loaded/accessible in several suites.
- [ ] **Cloud skip**: Program low tests log “Programs are not available on cloud systems” — expected? confirm config.
- [ ] **Force exit warning**: Jest “Force exiting Jest … consider --detectOpenHandles” — check lingering handles.

## Analysis Checklist (per issue)
- [ ] Connection/CSRF failures
  - [ ] Verify DNS/reachability of SAP_URL in `.env`.
  - [ ] Check `loadTestEnv` resolving `.env` path and `invalidateConnectionCache`.
  - [ ] Confirm token refresh path (AuthBroker) and network availability.
  - [ ] Confirm `sessions_dir`/`locks_dir` not interfering.
- [ ] Env missing
  - [ ] Confirm `tests/test-config.yaml` presence and values (no placeholders).
  - [ ] Ensure `loadTestEnv` finds `.env` (MCP_ENV_PATH?).
  - [ ] Verify CI vs local path differences.
- [ ] Cloud skip (program)
  - [ ] Validate cloud detection (`isCloudConnection`) and intended skip.
  - [ ] Ensure test case naming unique for cloud/on-prem.
- [ ] Force exit warning
  - [ ] Identify open handles (connections, timers); consider `--detectOpenHandles` locally.

## YAML/Test Data Review
- [ ] Ensure each test case uses unique object names to avoid collisions.
- [ ] Ensure dependent objects (e.g., BDEF root entities, function groups for FM) exist prior to test run.
- [ ] Replace placeholders in `tests/test-config.yaml` and `tests/test-config.yaml.template`.

## Next Steps
- [ ] Run connectivity sanity check (DNS/ping) to SAP_URL.
- [ ] Validate `.env` loading path and contents.
- [ ] Audit `tests/test-config.yaml` for unique names and required dependencies.
- [ ] Re-run subset with `DEBUG_TESTS=true` after fixing env/connectivity.

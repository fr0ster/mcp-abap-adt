# Transport CRUD Issue Investigation (GitHub #11)

## Problem

Editing objects assigned to unreleased transport requests fails on legacy SAP systems (740).
Reported by butlersupply: programs in $TMP work, but programs already recorded to a transport give errors.

Version 4.0 worked for reading; v4.1.0 introduced `SAP_SYSTEM_TYPE` defaulting to `cloud`,
which filtered out onprem/legacy-only tools (Programs, etc.) — a regression fixed in v4.1.1.

The deeper issue (transport lock vs edit lock) may still exist.

## Root Cause Analysis

### 1. SAP_SYSTEM_TYPE regression (v4.1.0–v4.1.1)

- `detectLegacy()` in `systemContext.ts` returns `true` only if `SAP_SYSTEM_TYPE === 'legacy'`
- Default changed from auto-detect to `cloud` in v4.1.0
- Legacy users who didn't set `SAP_SYSTEM_TYPE=legacy` lost access to onprem/legacy tools
- **Status**: Fixed in v4.1.1 docs — user must set `SAP_SYSTEM_TYPE=legacy`

### 2. Transport lock vs edit lock (potential deeper issue)

Two different locking mechanisms in ADT:

| Concept | Mechanism | Scope |
|---------|-----------|-------|
| **Edit lock** (lockHandle) | `POST /sap/bc/adt/...?_action=LOCK` | Prevents concurrent editing |
| **Transport lock** | Object recorded to transport request | Controls change recording |

On legacy systems (SAP 740), `x-sap-adt-sessiontype: stateful` on LOCK causes the lock
to be stored in **ABAP session memory** instead of the **global enqueue server**.
Subsequent PUT from a different HTTP request fails with **423 Locked** because the lock
is bound to the original ABAP session.

Eclipse ADT avoids this by using `JCoEnqueueSystemSession` (RFC-based locking) — no
`x-sap-adt-sessiontype` header on the LOCK call.

### 3. SAP_CONNECTION_TYPE=rfc should imply legacy

Currently `SAP_CONNECTION_TYPE=rfc` does not auto-set `SAP_SYSTEM_TYPE=legacy`.
This could be an improvement: if a user connects via RFC, they're almost certainly
on a legacy system.

## Reproduction Plan

### Prerequisites (SAP system)

1. Create package `ZMC_REQUEST_TEST` (transportable, not $TMP)
2. Have unreleased transport request `TRLK900201` (or similar)
3. Package must be recorded to that transport's transport layer

### Test: `TransportedObjectCrud.test.ts`

Integration test that reproduces the full CRUD cycle:

1. **Create** class `ZMCP_BLD_TRCLS` in `ZMC_REQUEST_TEST` with TR `TRLK900201`
2. **Read** via `GetClass` (high-level handler)
3. **Read** via `ReadClass` (source + metadata)
4. **Update** class source code with TR (the critical step — GitHub #11)
5. **Delete** class with TR

Config in `test-config.yaml`:
```yaml
create_transported_object:
  enabled: true
  transport_request: "TRLK900201"
  package_name: "ZMC_REQUEST_TEST"
  class_name: "ZMCP_BLD_TRCLS"
```

Cannot run on trial/cloud systems — requires on-prem or legacy with transports.

## Possible Fixes

1. **Skip `x-sap-adt-sessiontype: stateful`** on LOCK for legacy systems
2. **Use stateless session** for lock/update/unlock cycle on legacy
3. **Bundle lock + update + unlock** in a single stateful session (CSRF token reuse)
4. **Auto-detect legacy** from `SAP_CONNECTION_TYPE=rfc`

## Status

- [x] SAP_SYSTEM_TYPE regression documented and user notified
- [x] Integration test created (`TransportedObjectCrud.test.ts`)
- [x] Config template updated with `create_transported_object` section
- [ ] Create package `ZMC_REQUEST_TEST` on SAP (manual)
- [ ] Run test on legacy system to confirm the 423 error
- [ ] Implement fix based on test results
- [ ] Auto-detect `SAP_SYSTEM_TYPE=legacy` from `SAP_CONNECTION_TYPE=rfc`

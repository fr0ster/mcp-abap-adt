# Object Version History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tools to retrieve object version history and read source code at specific versions, enabling LLM-driven code review of transport request changes.

**Architecture:** New readonly handlers using raw ADT requests to `/sap/bc/adt/vit/` (Version Information Tool) API. Follows the same pattern as `GetTransport` handler — raw HTTP + XML parsing. No changes to `@mcp-abap-adt/adt-clients` package needed initially.

**Tech Stack:** TypeScript, fast-xml-parser, existing ADT connection infrastructure.

**Ref:** GitHub issue #30 — request from external user for code review workflow based on transport changes.

---

## Pre-requisite: Research VIT API

> **BLOCKER** — This task must be completed before any implementation begins.

### Task 0: Discover and document VIT API endpoints on a real SAP system

The ADT Version Information Tool (`/sap/bc/adt/vit/`) API is not yet used in this project. Before implementing handlers, we need to discover the exact endpoints, parameters, headers, and response formats.

**Research steps:**

- [ ] **Step 1: Test VIT discovery endpoint**

  Try the global ADT discovery and VIT-specific endpoints:
  ```
  GET /sap/bc/adt/discovery
  Accept: application/xml
  ```
  Grep the response for "vit" or "version" to find relevant capabilities.

  Then try the VIT-specific discovery:
  ```
  GET /sap/bc/adt/vit/
  Accept: application/xml
  ```
  Document both responses — they should list available operations and schemas.

- [ ] **Step 2: Get version list for a known program**

  Try retrieving version history for a known ABAP object:
  ```
  GET /sap/bc/adt/vit/wb/PROG/S/{program_name}
  Accept: application/xml
  ```
  Variations to try:
  - `/sap/bc/adt/vit/wb/object_type/object_name`
  - Query params: `?dateFrom=...&dateTo=...`
  - Different Accept headers: `application/atom+xml`, `application/vnd.sap.adt.vit.v1+xml`

- [ ] **Step 3: Get source code at a specific version**

  Once version IDs are known from Step 2, check if the VIT response contains URIs/links to version content. Try following those URIs directly.

  If no URIs in response, try speculative endpoints (these are guesses, may not work):
  ```
  GET /sap/bc/adt/programs/programs/{name}/source/main?version={version_id}
  GET /sap/bc/adt/vit/wb/PROG/S/{name}/content?versionId={id}
  ```

- [ ] **Step 4: Test on Cloud system (if available)**

  Repeat Steps 1-3 on BTP ABAP Cloud to check if VIT API is available and what differs.
  If no cloud system is available, default `available_in` to `['onprem']` only — do not ship `'cloud'` without verification.

- [ ] **Step 5: Test for different object types**

  Check VIT availability for: CLAS (class), INTF (interface), FUGR (function group), TABL (table), DDLS (CDS view).
  Document which types support versioning.

- [ ] **Step 6: Document findings**

  Create `docs/development/research/vit-api.md` with:
  - Exact URLs, headers, query params
  - Response XML structure (sample responses)
  - Supported object types
  - Cloud vs On-Prem differences
  - Any limitations found

**Exit criteria:** We have documented, working API calls for at least program version history + version source retrieval on one system.

---

## Task 1: Implement `GetObjectVersions` handler

> **Depends on:** Task 0 completed with successful API discovery.

**Files:**
- Create: `src/handlers/version/readonly/handleGetObjectVersions.ts`
- Modify: `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts` (add registration)

- [ ] **Step 1: Create handler file with TOOL_DEFINITION**

  ```typescript
  export const TOOL_DEFINITION = {
    name: 'GetObjectVersions',
    available_in: ['onprem', 'cloud'] as const,  // adjust based on Task 0 findings
    description: '[read-only] Get version history of an ABAP object. Returns list of versions with date, author, transport request, and version ID.',
    inputSchema: {
      type: 'object',
      properties: {
        object_type: {
          type: 'string',
          description: 'ABAP object type (e.g., PROG, CLAS, INTF, FUGR)',
        },
        object_name: {
          type: 'string',
          description: 'ABAP object name',
        },
      },
      required: ['object_type', 'object_name'],
    },
  } as const;
  ```

  **Note:** Exact URL, headers, and XML parsing logic depend on Task 0 findings. The handler will use `makeAdtRequestWithTimeout()` for raw ADT requests and `fast-xml-parser` for response parsing (same pattern as `handleGetTransport.ts`). Use `return_response()` for responses (not raw `{ isError, content }`).

  **Note:** `object_type` values may need mapping from user-friendly names (PROG, CLAS) to VIT-internal identifiers (e.g., PROG/S, CLAS/I). Add mapping if Task 0 reveals this.

- [ ] **Step 2: Implement XML parsing for VIT response**

  Parse version list from VIT XML response. Expected output per version:
  ```json
  {
    "version_id": "...",
    "date": "2026-04-01T10:30:00Z",
    "author": "DEVELOPER",
    "transport_request": "E19K905941",
    "description": "..."
  }
  ```

- [ ] **Step 3: Implement main handler function**

  Follow `handleGetTransport.ts` pattern — raw request, XML parse, return_response.

- [ ] **Step 4: Register handler in ReadOnlyHandlersGroup**

  Import and add to `getHandlers()` array.

- [ ] **Step 5: Test manually against real system**

- [ ] **Step 6: Commit**

  ```bash
  git add src/handlers/version/readonly/handleGetObjectVersions.ts src/lib/handlers/groups/ReadOnlyHandlersGroup.ts
  git commit -m "feat: add GetObjectVersions tool for object version history"
  ```

---

## Task 2: Implement `ReadObjectVersion` handler

> **Depends on:** Task 0 (to know how to fetch source at version). Independent from Task 1 — can be implemented in parallel.

**Files:**
- Create: `src/handlers/version/readonly/handleReadObjectVersion.ts`
- Modify: `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts` (add registration)

- [ ] **Step 1: Create handler with TOOL_DEFINITION**

  ```typescript
  export const TOOL_DEFINITION = {
    name: 'ReadObjectVersion',
    available_in: ['onprem', 'cloud'] as const,  // adjust based on Task 0
    description: '[read-only] Read source code of an ABAP object at a specific version. Use GetObjectVersions first to get available version IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        object_type: {
          type: 'string',
          description: 'ABAP object type (e.g., PROG, CLAS, INTF)',
        },
        object_name: {
          type: 'string',
          description: 'ABAP object name',
        },
        version_id: {
          type: 'string',
          description: 'Version ID from GetObjectVersions response',
        },
      },
      required: ['object_type', 'object_name', 'version_id'],
    },
  } as const;
  ```

- [ ] **Step 2: Implement handler**

  Fetch source code at specific version via ADT API (exact endpoint from Task 0).

- [ ] **Step 3: Register in ReadOnlyHandlersGroup**

- [ ] **Step 4: Test manually against real system**

- [ ] **Step 5: Commit**

  ```bash
  git add src/handlers/version/readonly/handleReadObjectVersion.ts src/lib/handlers/groups/ReadOnlyHandlersGroup.ts
  git commit -m "feat: add ReadObjectVersion tool for reading source at specific version"
  ```

---

## Task 3: Integration tests

> **Depends on:** Tasks 1 and 2 implemented and manually verified.

**Files:**
- Create: `src/__tests__/integration/readOnly/version/GetObjectVersionsHandlers.test.ts`
- Create: `src/__tests__/integration/readOnly/version/ReadObjectVersionHandlers.test.ts`
- Modify: `tests/test-config.yaml.template` (add version test config section)

- [ ] **Step 1: Add test config section to template**

  Add to `test-config.yaml.template`:
  ```yaml
  version_history:
    # Object with known version history for testing
    test_object_type: "PROG"
    test_object_name: "ZMCP_TEST_PROGRAM"  # ← CHANGE if needed
    available_in: ['onprem']  # adjust based on Task 0 findings
  ```

- [ ] **Step 2: Write GetObjectVersions integration test**

  Test that version list is returned with expected fields (version_id, date, author, transport_request).

- [ ] **Step 3: Write ReadObjectVersion integration test**

  Use first version_id from GetObjectVersions result to read source. Verify source code is returned.

- [ ] **Step 4: Write error handling test**

  Test requesting version history for a non-existent object. Verify proper error response (not crash).

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

  ```bash
  git add src/__tests__/integration/readOnly/version/ tests/test-config.yaml.template
  git commit -m "test: add integration tests for version history tools"
  ```

---

## Task 4 (Optional, future): Diff tool

> **Deferred.** LLM can compare two versions by calling `ReadObjectVersion` twice. A dedicated diff tool may be added later if needed for performance (large objects, token cost).

If implemented, it would either:
- **Server-side diff**: Use ADT compare endpoint (if available, check in Task 0)
- **Client-side diff**: Read two versions, compute unified diff in Node.js

---

## Summary

| Task | Description | Blocker |
|------|-------------|---------|
| **Task 0** | Research VIT API on real system | **BLOCKER — do first** |
| **Task 1** | `GetObjectVersions` handler | Task 0 |
| **Task 2** | `ReadObjectVersion` handler | Task 0 (parallel with Task 1) |
| **Task 3** | Integration tests | Tasks 1, 2 |
| **Task 4** | Diff tool (optional, deferred) | Tasks 1, 2 |

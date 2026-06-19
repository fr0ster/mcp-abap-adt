# Dump Test — Isolate Dump Trigger on a Separate Connection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `RuntimeProfilingAndDumps` dump sub-test reliably create a runtime dump and read it back, by running the dump *trigger* on a throwaway ADT connection while reading/cleaning up on the test's main (clean-context) connection.

**Architecture:** Test-only change. The dumping `classrun` consumes the server-side application context of *its* connection, so any follow-up request on that same connection gets `400 "Session no longer exists"`. We trigger the dump on a dedicated soft-mode connection (`createTestConnectionAndSession()`), then list/read the dump on the unchanged main connection. The dump class is activated (so the forced run actually executes and dumps). In hard mode (stdio caches the connection, single cached client → no isolated trigger connection) the sub-test skips cleanly.

**Tech Stack:** TypeScript, Jest, `@mcp-abap-adt/adt-clients` (`AdtExecutor`, `getClass()`), `@mcp-abap-adt/connection` (`AbapConnection`), the repo's integration test helpers (`createTestConnectionAndSession`, `LambdaTester`).

**Spec:** `docs/superpowers/specs/2026-06-19-dump-test-separate-connection-design.md`

**Branch:** `fix/dump-test-separate-connection` (already checked out; spec already committed).

**Reality of "tests" here:** the artifact under change *is* an integration test that runs against the live trial SAP system in soft mode (`integration_hard_mode.enabled: false`). There is no unit harness for it. The "failing test" is the existing red dump sub-test (`400 session` / silent `SKIP: no runtime dump found`); the implementation turns it green. Verification = `npm run test:check` (type) + a live soft-mode run of the suite.

---

## File Structure

Only one file changes:

- **Modify:** `src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts`
  - `createRunnableClass(...)` — gain an optional `activate` flag (soft-mode path activates on update when set).
  - The dump sub-test (`should create dump by division by zero and read/analyze created dump`) — skip in hard mode; run the class create+activate+forced-run on a separate connection; read + clean up on the main connection.
  - Add one import: `createTestConnectionAndSession` from `../../helpers/sessionHelpers`.

No changes to `@mcp-abap-adt/connection`, `@mcp-abap-adt/adt-clients`, or any handler.

---

## Task 1: Add an `activate` option to `createRunnableClass`

**Files:**
- Modify: `src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts` (function `createRunnableClass`, currently ~lines 144–189)

**Why:** The soft-mode path of `createRunnableClass` does create + update but never activates. The division-by-zero class must be **active** for the forced `classrun` to execute it and dump. The hard-mode branch already passes `activate: true` to `CreateClass`; we add the equivalent for the soft-mode branch behind an opt-in flag so the profiling sub-test (which passes today without activation) is unaffected. Mirrors `createRunnableProgram`, which already activates.

- [ ] **Step 1: Add the `activate` parameter and activate-on-update in the soft-mode branch**

Replace the current signature + soft-mode tail of `createRunnableClass`. Current code:

```ts
async function createRunnableClass(
  context: LambdaTesterContext,
  className: string,
  sourceCode: string,
  invokeTool?: (
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<any>,
  ) => Promise<any>,
): Promise<void> {
  if (invokeTool) {
    const createResponse = await invokeTool(
      'CreateClass',
      {
        class_name: className,
        package_name: context.packageName,
        transport_request: context.transportRequest,
        description: `MCP runtime test ${className}`.slice(0, 60),
        source_code: sourceCode,
        activate: true,
      },
      async () => {
        throw new Error(
          'Direct CreateClass call is not available in hard mode',
        );
      },
    );
    if (createResponse?.isError) {
      throw new Error(extractHandlerErrorText(createResponse));
    }
    return;
  }

  const client = createAdtClient(context.connection, context.logger);
  await client.getClass().create({
    className,
    packageName: context.packageName,
    transportRequest: context.transportRequest,
    description: `MCP runtime test ${className}`.slice(0, 60),
  });
  await client.getClass().update({
    className,
    transportRequest: context.transportRequest,
    sourceCode,
  });
}
```

New code (only the signature line and the final `update(...)` call change; the hard-mode branch is untouched):

```ts
async function createRunnableClass(
  context: LambdaTesterContext,
  className: string,
  sourceCode: string,
  invokeTool?: (
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<any>,
  ) => Promise<any>,
  options?: { activate?: boolean },
): Promise<void> {
  if (invokeTool) {
    const createResponse = await invokeTool(
      'CreateClass',
      {
        class_name: className,
        package_name: context.packageName,
        transport_request: context.transportRequest,
        description: `MCP runtime test ${className}`.slice(0, 60),
        source_code: sourceCode,
        activate: true,
      },
      async () => {
        throw new Error(
          'Direct CreateClass call is not available in hard mode',
        );
      },
    );
    if (createResponse?.isError) {
      throw new Error(extractHandlerErrorText(createResponse));
    }
    return;
  }

  const client = createAdtClient(context.connection, context.logger);
  await client.getClass().create({
    className,
    packageName: context.packageName,
    transportRequest: context.transportRequest,
    description: `MCP runtime test ${className}`.slice(0, 60),
  });
  await client.getClass().update(
    {
      className,
      transportRequest: context.transportRequest,
      sourceCode,
    },
    { activateOnUpdate: options?.activate === true },
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run test:check`
Expected: PASS (no output / exit 0). The new optional parameter is backward-compatible — the existing profiling call `createRunnableClass(context, className, buildRunnableClassSource(className), tester.isHardMode() ? invoke : undefined)` still type-checks (no 5th arg → `options` is `undefined` → `activateOnUpdate: false`).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts
git commit -m "test(runtime): add opt-in activate flag to createRunnableClass"
```

---

## Task 2: Isolate the dump trigger on a separate connection; skip in hard mode

**Files:**
- Modify: `src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts`
  - Add import (top of file, with the other helper imports).
  - The dump sub-test body (`should create dump by division by zero and read/analyze created dump`, currently starting ~line 681).

- [ ] **Step 1: Add the `createTestConnectionAndSession` import**

The file currently imports test helpers but not `createTestConnectionAndSession`. Add it next to the existing helper imports (after the `createHandlerContext`/`LambdaTester` imports near the top). Add this line:

```ts
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
```

(If an import from `'../../helpers/sessionHelpers'` already exists, merge the name into it instead of adding a second import.)

- [ ] **Step 2: Skip the dump sub-test in hard mode, and trigger the dump on a separate soft-mode connection**

In the dump sub-test, the body starts (current code):

```ts
      await tester.run(async (context: LambdaTesterContext) => {
        if (!context.packageName) {
          throw new Error(
            'SKIP: package is not configured (default_package or package_name)',
          );
        }

        const dumpClassName = createName(
          normalizeNamePrefix(context.params?.dump_class_prefix, 'ZADT_RTDMP'),
        );
        const invoke = async (
          toolName: string,
          args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => tester.invokeToolOrHandler(toolName, args, directCall);

        try {
          await createRunnableClass(
            context,
            dumpClassName,
            buildDumpClassSource(dumpClassName),
            tester.isHardMode() ? invoke : undefined,
          );

          if (tester.isHardMode()) {
            const runResult = await invoke(
              'RuntimeRunClassWithProfiling',
              {
                class_name: dumpClassName,
                description: `MCP_RUNTIME_DUMP_${Date.now()}`,
                all_procedural_units: true,
                sql_trace: false,
                max_time_for_tracing: 600,
              },
              async () => {
                throw new Error(
                  'Direct runtime run is not available in hard mode',
                );
              },
            );
            if (runResult.isError) {
              logger?.info(
                `Expected failing run for dump generation: ${extractHandlerErrorText(runResult)}`,
              );
            }
          } else {
            const executor = new AdtExecutor(context.connection, logger);
            try {
              await executor
                .getClassExecutor()
                .run({ className: dumpClassName });
            } catch (runError: any) {
              logger?.info(
                `Expected failing run for dump generation: ${runError?.message || String(runError)}`,
              );
            }
          }
```

Replace everything from the start of the `tester.run` callback up to and including the run block above (i.e. from `if (!context.packageName) {` down to the closing `}` of the `else { ... }` run branch at current line 740) with:

```ts
        if (!context.packageName) {
          throw new Error(
            'SKIP: package is not configured (default_package or package_name)',
          );
        }

        // Hard mode drives everything through one cached MCP client, so there
        // is no second isolated connection for the dump trigger. Under the
        // stdio transport (what test-config.yaml sets) BaseMcpServer caches the
        // ABAP connection, so the dumping run would poison the same context we
        // then read from — exactly the problem this test avoids in soft mode.
        // The isolation is soft-mode only; skip cleanly in hard mode.
        if (tester.isHardMode()) {
          throw new Error(
            'SKIP: dump sub-test runs in soft mode only (hard-mode stdio caches the ABAP connection — no isolated trigger connection)',
          );
        }

        const dumpClassName = createName(
          normalizeNamePrefix(context.params?.dump_class_prefix, 'ZADT_RTDMP'),
        );

        // Trigger the dump on a dedicated throwaway connection so the dump's
        // server-side context loss lands on IT, not on the main connection we
        // read the dump from. The dump is keyed to the user (same trial user),
        // so the main connection's feed read still finds it.
        const { connection: triggerConnection } =
          await createTestConnectionAndSession();
        const triggerContext: LambdaTesterContext = {
          ...context,
          connection: triggerConnection,
        };

        try {
          // create + ACTIVATE the division-by-zero class on the trigger
          // connection (active so the forced run actually executes and dumps).
          await createRunnableClass(
            triggerContext,
            dumpClassName,
            buildDumpClassSource(dumpClassName),
            undefined,
            { activate: true },
          );

          // Forced run on the trigger connection → HTTP 500 → real dump.
          const triggerExecutor = new AdtExecutor(triggerConnection, logger);
          try {
            await triggerExecutor
              .getClassExecutor()
              .run({ className: dumpClassName });
          } catch (runError: any) {
            logger?.info(
              `Expected failing run for dump generation: ${runError?.message || String(runError)}`,
            );
          } finally {
            // Soft-mode HTTP has no network close; drop local session/cookie
            // state best-effort and stop using the connection.
            const resettable = triggerConnection as unknown as {
              reset?: () => void;
            };
            if (typeof resettable.reset === 'function') {
              resettable.reset();
            }
          }
```

Notes for the implementer:
- The `invoke` helper and the `tester.isHardMode()` run branch are removed because the sub-test now skips before reaching them; the read steps below already build their own handler context against `context.connection`, so `invoke` is no longer referenced in this sub-test.
- Everything *after* the run block — the `RuntimeListFeeds` retry loop, `RuntimeGetDumpById`, the summary read — is unchanged and continues to use `context.connection` (the main, clean-context connection) via `createHandlerContext({ connection: context.connection, logger })`.
- The `finally { await deleteClassIfExists(context, dumpClassName, ...) }` at the end is unchanged and already deletes via the main connection (`context`); since `tester.isHardMode()` is false past the skip, change its third arg from `tester.isHardMode() ? invoke : undefined` to just `undefined` (the `invoke` symbol no longer exists in this scope).

- [ ] **Step 3: Fix the cleanup call's now-undefined `invoke` reference**

At the end of the dump sub-test, current cleanup:

```ts
        } finally {
          await deleteClassIfExists(
            context,
            dumpClassName,
            tester.isHardMode() ? invoke : undefined,
          );
        }
```

Replace with (drop the removed `invoke`; cleanup runs on the main connection, soft path):

```ts
        } finally {
          await deleteClassIfExists(context, dumpClassName, undefined);
        }
```

- [ ] **Step 4: Type-check**

Run: `npm run test:check`
Expected: PASS. Confirm there are no remaining references to `invoke` inside the dump sub-test (it was removed). If the type-checker reports `invoke` is unused/undefined, you missed a reference — search the dump sub-test body for `invoke(` and remove/convert it.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts
git commit -m "test(runtime): trigger dump on a separate connection, read on main; skip in hard mode"
```

---

## Task 3: Verify live against trial (soft mode) and finalize

**Files:** none (verification only).

**Precondition:** A valid trial connection. The suite uses the auth-broker destination `trial`; confirm with the user that `trial.env` is fresh / the broker is reachable before running (do not launch browser-OAuth without the user being ready). This is the same precondition used for `shared:setup`.

- [ ] **Step 1: Confirm soft mode**

Run: `grep -n "enabled:" tests/test-config.yaml | head -1`
Expected: `integration_hard_mode.enabled: false`. (If true, the dump sub-test will skip — set it to false to actually exercise the fix.)

- [ ] **Step 2: Run the suite against trial, full log to file**

Run:
```bash
npx jest --testPathPatterns='RuntimeProfilingAndDumps' --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit 2>&1 | tee /tmp/dump-fix-verify.log
```
Expected: `Test Suites: 1 passed`, `Tests: 5 passed`. In the log:
- the dump sub-test no longer logs `SKIP: no runtime dump found after forced division-by-zero run`,
- no `400 Session ... no longer exists` failure on the dumps feed read,
- a line `Expected failing run for dump generation: ... 500` is present (the dump was actually generated),
- the profiling sub-test stays green.

- [ ] **Step 3: If green, push the branch and open the PR**

```bash
git push -u origin fix/dump-test-separate-connection
gh pr create --head fix/dump-test-separate-connection --base main \
  --title "test(runtime): isolate dump trigger on a separate connection (fixes dump sub-test)" \
  --body "Implements docs/superpowers/specs/2026-06-19-dump-test-separate-connection-design.md. Dump trigger runs on a throwaway connection (so the dumping run's context loss lands there); list/read/cleanup run on the main connection. Dump class is activated so the forced run dumps. Hard mode skips cleanly (stdio caches the connection). Verified on trial (soft mode): dump sub-test creates and reads a dump; full RuntimeProfilingAndDumps suite green. Test-only — no published-package change."
```

- [ ] **Step 4: Delete the implemented spec + plan (per repo convention)**

Plans/specs live in-tree only while active. Once implemented, remove them on this branch (history stays in git):

```bash
git rm docs/superpowers/specs/2026-06-19-dump-test-separate-connection-design.md \
       docs/superpowers/plans/2026-06-19-dump-test-separate-connection.md
git commit -m "chore: remove implemented dump-test spec + plan"
git push
```

- [ ] **Step 5: Hand off to the user**

CI is build/unit only (it does not run SAP integration tests), so green CI plus the local trial run above are the gates. Report the result and let the user decide on merge (squash), consistent with #114/#115/#116. No npm release (test-only; excluded from `dist/`).

---

## Self-Review

**1. Spec coverage:**
- Trigger on dedicated soft-mode connection → Task 2 Step 2. ✓
- Activate the dump class → Task 1 + Task 2 Step 2 (`activate: true`). ✓
- Read/cleanup on main connection → Task 2 Steps 2–3 (reads unchanged on `context.connection`; cleanup `deleteClassIfExists(context, …)`). ✓
- Hard mode skips cleanly → Task 2 Step 2 (`SKIP:` throw). ✓
- Soft-mode teardown = drop reference / optional `reset()` → Task 2 Step 2 `finally`. ✓
- No connection/adt-clients/handler change → only the test file is modified. ✓
- Verify soft-mode green on trial → Task 3. ✓
- Remove spec/plan post-implementation → Task 3 Step 4. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**3. Type consistency:** `createRunnableClass` gains `options?: { activate?: boolean }` (Task 1) and is called with `{ activate: true }` (Task 2). `triggerContext` is typed `LambdaTesterContext` via spread of `context` with `connection` overridden by `triggerConnection: AbapConnection` (the type already imported transitively via `LambdaTesterContext`). `AdtExecutor` and `createTestConnectionAndSession` are the existing symbols (AdtExecutor already imported; the import for `createTestConnectionAndSession` is added in Task 2 Step 1). `reset()` is called via a guarded structural cast, so it does not depend on `AbapConnection` exposing it in its public type. ✓

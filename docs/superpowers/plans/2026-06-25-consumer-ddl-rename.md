# mcp-abap-adt → adt-clients 6.0.0 consumer realign (View → Ddl) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `mcp-abap-adt` to `@mcp-abap-adt/adt-clients@^6.0.0`, where the misnamed `getView()` client became the generic DDL-source client `getDdl()`, and rename the MCP-facing `View` tools/handlers/args to `Ddl` to match.

**Architecture:** Two layers. **Layer 1** (compile): swap every `client.getView()` → `client.getDdl()` and the config key `viewName` → `ddlName` so the package builds against 6.0.0 (the 6.0.0 API removed `getView`/`AdtView`/`*ViewParams`/`IViewConfig` entirely — `IDdlConfig.ddlName` is the only accepted key). **Layer 2** (user-facing): rename the `src/handlers/view/` folder, the 14 handler files, their exported symbols, the 15 MCP tool names, the `view_name` tool argument, descriptions, group registrations, integration tests, and `test-config.yaml.template` keys from `View`/`view`/`view_name` to `Ddl`/`ddl`/`ddl_name`. Then bump the major version and document the breaking change.

**Tech Stack:** TypeScript, Node, `@mcp-abap-adt/adt-clients`, Jest (integration), Biome (lint), MCP tool registry (`src/lib/handlers/groups/*HandlersGroup.ts`).

## Global Constraints

- **Target dependency:** `@mcp-abap-adt/adt-clients` `^6.0.0` (published; do NOT use a local `link:`/`file:` path — the lockfile must resolve to the registry tarball).
- **`@mcp-abap-adt/interfaces` stays `^7.2.0`** — mcp-abap-adt imports NO `View*` types from it (verified: `grep "from '@mcp-abap-adt/interfaces'" src | grep -i view` is empty). Do not touch that dependency.
- **6.0.0 API facts (verified against the 6.0.0 tarball):** facade method is `getDdl(): IAdtObject<IDdlConfig, IDdlState>`. `getView`, `AdtView`, `I*ViewParams`, `IViewConfig`, `IViewState` are **gone** (zero hits in `dist/**/*.d.ts`). The high-level `IAdtObject` methods (`read`/`readMetadata`/`create`/`update`/`delete`/`lock`/`unlock`/`validate`/`check`/`activate`) take `Partial<IDdlConfig>` whose name field is **`ddlName`** (not `viewName`). `IDdlConfig` = `{ ddlName, masterLanguage?, packageName?, transportRequest?, description?, ddlSource?, sessionId?, onLock? }`.
- **Do NOT rename `HandlerProfileView` / `HandlerDumpView`** (`src/handlers/compact/high/`) — unrelated profiling/dump tools, not DDL clients.
- **Keep genuine SAP-domain wording.** The `shared_dependencies.views:` section in `test-config.yaml.template` and any "CDS view" prose describe real SAP CDS-view objects — leave those as-is. Only rename the *client/tool/handler/argument* identifiers.
- **Clean breaking rename — NO aliases.** Old `object_type` values (`'view'` in the generic low tools, `'VIEW'` in the compact facade) and the `view_name` argument are **removed**, not kept as aliases. Only `'ddl'`/`'DDL'`/`ddl_name` remain. (Approved: LLM bindings are soft; a clean break is acceptable for a major bump.)
- **Compact facade is a second `View` surface** — `src/handlers/compact/high/` uses uppercase `VIEW` object_type and `view_name` across: `compactObjectTypes.ts` (union member `'VIEW'`), `compactRouter.ts` (imports + `VIEW:` routing block), `compactSchemas.ts` (`view_name` property + `'VIEW'` in the validate enum + descriptions), `compactMatrix.ts` (the `VIEW` row), and the `handleHandler*.ts` facade descriptions (`VIEW(view_name*)`). All must be renamed `VIEW`→`DDL`, `view_name`→`ddl_name`.
- **Do NOT touch the unrelated profiler `view` param.** `compactSchemas.ts` also has a `view:` field that is a "Profiler trace view kind" (≈ lines 361/377/398) — lowercase, unrelated to DDL sources. Leave it. Grep-gates target uppercase `'VIEW'` and `view_name`, never lowercase `view:`.
- **Breaking change → major bump.** Current version `7.2.1` → `8.0.0`.
- **Never commit to `main`/`master` directly** — work happens in a dedicated worktree/branch; the deliverable is a PR the user reviews and merges. The user runs `npm publish`, not the agent.
- **Gate after every task:** `npm run build` (tsc, exit 0) and `npm run test:check` (registry/static checks) must be green. The grep-gates in each task must return empty.

## Rename map (authoritative)

**Folder/files:** `src/handlers/view/` → `src/handlers/ddl/`; every `handle<Op>View.ts` → `handle<Op>Ddl.ts` (e.g. `handleReadView.ts` → `handleReadDdl.ts`).

**Exported handler symbols:** `handleReadView`→`handleReadDdl`, `handleGetView`→`handleGetDdl`, `handleCreateView`→`handleCreateDdl`, `handleUpdateView`→`handleUpdateDdl`, `handleDeleteView`→`handleDeleteDdl`, `handleCheckView`→`handleCheckDdl`, `handleValidateView`→`handleValidateDdl`, `handleLockView`→`handleLockDdl`, `handleUnlockView`→`handleUnlockDdl`, `handleActivateView`→`handleActivateDdl`. (Both `view/high/` and `view/low/` variants.)

**MCP tool `name:` fields (15):** `ReadView`→`ReadDdl`, `GetView`→`GetDdl`, `CreateView`→`CreateDdl`, `UpdateView`→`UpdateDdl`, `DeleteView`→`DeleteDdl`, `CheckView`→`CheckDdl`, `ActivateView`→`ActivateDdl`, `CreateViewLow`→`CreateDdlLow`, `UpdateViewLow`→`UpdateDdlLow`, `DeleteViewLow`→`DeleteDdlLow`, `CheckViewLow`→`CheckDdlLow`, `ValidateViewLow`→`ValidateDdlLow`, `LockViewLow`→`LockDdlLow`, `UnlockViewLow`→`UnlockDdlLow`, `ActivateViewLow`→`ActivateDdlLow` (verify exact Low-variant names per file).

**MCP tool argument:** `view_name` → `ddl_name` (schema `properties` key, `required` entry, destructuring, and JSDoc) — ONLY in the renamed ddl handlers. `cds_view_name` (a different arg used by other tools) is **not** changed.

**adt-clients call sites:** `client.getView()` → `client.getDdl()`; config key `viewName:` → `ddlName:` in objects passed to those methods.

**Generic `object_type` tools** (`handleLockObject`/`handleUnlockObject`/`handleCheckObject`/`handleValidateObject`/`handleDeleteObject` in `src/handlers/common/low/`): the `switch (objectType)` has `case 'view':`. **Replace** it with `case 'ddl':` (no `'view'` alias) and replace `'view'` with `'ddl'` in each `validTypes` array. The case calls `client.getDdl()`. (Keep the existing ADT-code alias `case 'ddls/df':` in `handleDeleteObject`.)

**Compact facade** (`src/handlers/compact/high/`): `compactObjectTypes.ts` union member `'VIEW'` → `'DDL'`; `compactRouter.ts` imports `handle*View`→`handle*Ddl` from the new `ddl/` paths and the `VIEW:` routing-map key → `DDL:`; `compactSchemas.ts` `view_name` property → `ddl_name`, `'VIEW'` enum entry → `'DDL'`, and `VIEW`/`view_name` in description strings → `DDL`/`ddl_name` (leave the lowercase profiler `view:` field untouched); `compactMatrix.ts` `VIEW` row → `DDL`; every `handleHandler*.ts` facade description `VIEW(view_name*)` → `DDL(ddl_name*)`. The compact schema arg is renamed to `ddl_name`, which flows straight into the renamed `handleGetDdl`/`handleCreateDdl`/… (which now expect `ddl_name`) — no normalization shim needed.

**Integration tests:** `src/__tests__/integration/low/view/ViewLowHandlers.test.ts` → `src/__tests__/integration/low/ddl/DdlLowHandlers.test.ts`; update tool-name strings and `view_name` args inside it and inside any other integration test asserting the renamed tools (e.g. `CheckHighHandlers.test.ts`).

**test-config.yaml.template:** `view_name:` test-case keys under the renamed handlers' `test_cases` → `ddl_name:`. Leave `cds_view_name:` and the `views:` shared-object section unchanged.

---

## Task 1: Layer 1 — bump dependency and migrate adt-clients call sites so it compiles against 6.0.0

**Files:**
- Modify: `package.json` (dep `@mcp-abap-adt/adt-clients`)
- Modify (`getView()`→`getDdl()` + `viewName:`→`ddlName:`): the **21 files** that actually call `getView()` — 5 common + 13 view-handlers + 3 test/helper:
  - common (5): `src/handlers/common/low/handleLockObject.ts`, `handleUnlockObject.ts`, `handleCheckObject.ts`, `handleValidateObject.ts`, `handleDeleteObject.ts`
  - view/high (4): `src/handlers/view/high/handleCreateView.ts`, `handleGetView.ts`, `handleUpdateView.ts`, `handleDeleteView.ts`
  - view/low (8): `src/handlers/view/low/handleCreateView.ts`, `handleUpdateView.ts`, `handleDeleteView.ts`, `handleCheckView.ts`, `handleValidateView.ts`, `handleLockView.ts`, `handleUnlockView.ts`, `handleActivateView.ts`
  - view/readonly (1): `src/handlers/view/readonly/handleReadView.ts`
  - test/helper (3): `src/__tests__/admin/shared-deps/setup.test.ts`, `teardown.test.ts`, `src/__tests__/integration/helpers/sharedObjects.ts`
  - NOTE: `src/handlers/view/high/handleCheckView.ts` delegates to the low handler and does NOT call `getView()` — it is renamed in Task 2 only, not touched here.

> NOTE: In this task DO NOT rename files, symbols, tool names, or the `view_name` argument. Only the dependency, the facade call (`getView`→`getDdl`), and the config key (`viewName`→`ddlName`) change. This keeps Task 1 a pure "compile against 6.0.0" step.

- [ ] **Step 1: Bump the dependency**

In `package.json` change the line:
```json
    "@mcp-abap-adt/adt-clients": "^5.8.0",
```
to:
```json
    "@mcp-abap-adt/adt-clients": "^6.0.0",
```

- [ ] **Step 2: Install and sync the lockfile**

Run: `npm install`
Expected: resolves `@mcp-abap-adt/adt-clients@6.0.0` from the registry; `package-lock.json` updated; no `link:`/`file:` entry for it. Verify:
```bash
node -e "console.log(require('@mcp-abap-adt/adt-clients/package.json').version)"
```
Expected output: `6.0.0`

- [ ] **Step 3: Verify the build currently FAILS (proves the breaking change is real)**

Run: `npm run build`
Expected: FAIL — tsc errors like `Property 'getView' does not exist on type 'AdtClient'` and `'viewName' does not exist in type 'Partial<IDdlConfig>'`.

- [ ] **Step 4: Replace the facade calls**

In every file above, replace `client.getView()` → `client.getDdl()` and `crudClient.getView()`/`validationClient.getView()` → the same receiver with `.getDdl()`. Then replace the config key `viewName:` → `ddlName:` ONLY inside the object literals passed to those `.getDdl()...` method calls (e.g. `.lock({ viewName: objectName })` → `.lock({ ddlName: objectName })`, `.read({ viewName: name })` → `.read({ ddlName: name })`, `{ viewName: viewName, ddlSource: ddl_source }` → `{ ddlName: viewName, ddlSource: ddl_source }`). Do NOT rename the local `viewName` variables or the `view_name` MCP args in this task — only the object key.

- [ ] **Step 5: Verify no stray `getView()` or `viewName:` config key remains**

Run:
```bash
grep -rn --include='*.ts' 'getView()' src ; echo "---" ; grep -rnE --include='*.ts' '\.(read|readMetadata|create|update|delete|lock|unlock|validate|check|activate)\(\s*\{[^}]*viewName:' src
```
Expected: both empty.

- [ ] **Step 6: Build green**

Run: `npm run build`
Expected: exit 0, no tsc errors.

- [ ] **Step 7: Static/registry checks green**

Run: `npm run test:check`
Expected: pass (tool registry still valid; tool names unchanged in this task).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src
git commit -m "feat: migrate to adt-clients 6.0.0 (getView->getDdl, viewName->ddlName)"
```

---

## Task 2: Layer 2 — rename View → Ddl across handlers, tool names, argument, and registrations

**Files:**
- Rename dir: `src/handlers/view/` → `src/handlers/ddl/` (and each `handle*View.ts` → `handle*Ddl.ts`)
- Modify: `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts`, `HighLevelHandlersGroup.ts`, `LowLevelHandlersGroup.ts` (import paths, imported symbol names, `withContext(...)`/`handler:` references, and the inline `name: 'ActivateView'` TOOL_DEFINITION + its description at `HighLevelHandlersGroup.ts:554`)
- Modify (compact facade): `src/handlers/compact/high/compactRouter.ts` (imports + `VIEW:` routing key → `DDL:`), `compactObjectTypes.ts` (`'VIEW'`→`'DDL'`), `compactSchemas.ts` (`view_name`→`ddl_name` property, `'VIEW'`→`'DDL'` validate enum, descriptions), `compactMatrix.ts` (`VIEW` row → `DDL`), and the facade descriptions in `handleHandlerGet.ts`, `handleHandlerCreate.ts`, `handleHandlerUpdate.ts`, `handleHandlerDelete.ts`, `handleHandlerLock.ts`, `handleHandlerUnlock.ts`, `handleHandlerValidate.ts` (`VIEW(view_name*)` → `DDL(ddl_name*)`)
- Modify: `src/handlers/common/low/handleLockObject.ts`, `handleUnlockObject.ts`, `handleCheckObject.ts`, `handleValidateObject.ts`, `handleDeleteObject.ts` (replace `case 'view':` with `case 'ddl':`, replace `'view'` with `'ddl'` in `validTypes`; NO alias)
- Rename + modify: `src/__tests__/integration/low/view/ViewLowHandlers.test.ts` → `src/__tests__/integration/low/ddl/DdlLowHandlers.test.ts`
- Modify: `src/__tests__/integration/high/check/CheckHighHandlers.test.ts` and any other integration test referencing renamed tool names / `view_name`
- Modify: `tests/test-config.yaml.template` (`view_name:` → `ddl_name:` under the renamed handlers' test_cases)

**Interfaces:**
- Consumes (from Task 1): the package already compiles against 6.0.0; every `getDdl()` call uses `ddlName`.
- Produces: MCP tools renamed to the `Ddl` names in the rename map; handler exports renamed `handle*Ddl`; argument `ddl_name`.

- [ ] **Step 1: Move the folder and rename files with git**

```bash
git mv src/handlers/view src/handlers/ddl
cd src/handlers/ddl
for f in $(find . -name 'handle*View.ts'); do git mv "$f" "${f/View.ts/Ddl.ts}"; done
cd -
```
Expected: 14 files now `src/handlers/ddl/{high,low,readonly}/handle*Ddl.ts`.

- [ ] **Step 2: Rename in-file symbols, tool names, arg, and descriptions**

In each `src/handlers/ddl/**/*.ts`:
- export symbol `handle<Op>View` → `handle<Op>Ddl`
- `name: '<Op>View...'` → `name: '<Op>Ddl...'` per the rename map
- argument `view_name` → `ddl_name` (schema `properties` key, `required: ['view_name']` → `['ddl_name']`, destructuring `const { view_name, ... }` → `const { ddl_name, ... }`, all subsequent uses, and the local `const viewName = view_name.toUpperCase()` → `const ddlName = ddl_name.toUpperCase()` plus downstream references)
- in description strings, rename tool references (`CreateView`→`CreateDdl`, etc.) but keep genuine "CDS view"/"DDL source" domain wording; prefer wording that reflects the generic DDL-source scope (CDS views + AMDP table functions).

- [ ] **Step 3: Rewire the three handler-group files**

In `ReadOnlyHandlersGroup.ts`, `HighLevelHandlersGroup.ts`, `LowLevelHandlersGroup.ts`: update every `from '../../../handlers/view/...'` → `'.../handlers/ddl/...'` and `handle*View` → `handle*Ddl` (including aliased imports like `handleUpdateView as handleUpdateViewHigh` → `handleUpdateDdl as handleUpdateDdlHigh`, and `TOOL_DEFINITION as CreateViewLow_Tool` → `... as CreateDdlLow_Tool`). Update the inline tool at `HighLevelHandlersGroup.ts` `name: 'ActivateView'` → `'ActivateDdl'` and its description ("Use after CreateView or UpdateView" → "Use after CreateDdl or UpdateDdl").

- [ ] **Step 4: Update the generic `object_type` handlers (clean rename, no alias)**

In each of `handleLockObject.ts`, `handleUnlockObject.ts`, `handleCheckObject.ts`, `handleValidateObject.ts`, `handleDeleteObject.ts`:
- replace `'view'` with `'ddl'` in the `validTypes` array (do NOT keep `'view'`)
- rename the `case 'view':` label to `case 'ddl':`. Example (`handleLockObject.ts`):
```typescript
        case 'ddl':
          lockHandle = await client.getDdl().lock({ ddlName: objectName });
          break;
```
(For `handleDeleteObject.ts` keep the existing `case 'ddls/df':` ADT-code alias alongside — that is an ADT type code, not the friendly `'view'` value.)

- [ ] **Step 4b: Rename the compact facade (`src/handlers/compact/high/`)**

- `compactObjectTypes.ts`: union member `'VIEW'` → `'DDL'` (both the type union and the runtime array).
- `compactRouter.ts`: update the four `from '../../view/high/handle*View'` imports → `'../../ddl/high/handle*Ddl'` with renamed symbols, and rename the `VIEW: { create/get/update/delete }` routing-map key to `DDL: { ... handle*Ddl ... }`.
- `compactSchemas.ts`: rename the `view_name` property (≈ line 84) → `ddl_name` (update its `description`); rename the `'VIEW'` entry in the validate `object_type` enum (≈ line 480) → `'DDL'`; update the enum `description` string `VIEW`→`DDL`. **Leave the lowercase `view:` profiler-trace field (≈ 361/377/398) untouched.**
- `compactMatrix.ts`: rename the `VIEW` matrix row/key → `DDL` (and any `view_name` in it → `ddl_name`).
- Facade descriptions in `handleHandlerGet.ts`, `handleHandlerCreate.ts`, `handleHandlerUpdate.ts`, `handleHandlerDelete.ts`, `handleHandlerLock.ts`, `handleHandlerUnlock.ts`, `handleHandlerValidate.ts`: replace `VIEW(view_name*)` → `DDL(ddl_name*)`.

- [ ] **Step 5: Rename and update the integration test**

```bash
git mv src/__tests__/integration/low/view src/__tests__/integration/low/ddl
git mv src/__tests__/integration/low/ddl/ViewLowHandlers.test.ts src/__tests__/integration/low/ddl/DdlLowHandlers.test.ts
```
Then inside `DdlLowHandlers.test.ts` (and `CheckHighHandlers.test.ts`): replace tool-name strings (`'CreateViewLow'`→`'CreateDdlLow'`, `'GetView'`→`'GetDdl'`, etc.) and `view_name` request args → `ddl_name`, and any `describe`/test titles mentioning "View" → "Ddl".

- [ ] **Step 6: Update test-config keys**

In `tests/test-config.yaml.template`, under the test_cases of the renamed handlers, rename the param key `view_name:` → `ddl_name:` (lines ~1543, 1578, 1641, 2092 — verify each belongs to a renamed tool). Leave `cds_view_name:` (~1793) and the `views:` shared-object section unchanged.

- [ ] **Step 7: Grep-gate — no stray View identifiers anywhere in the renamed surface**

Run:
```bash
# DDL-CRUD handler symbols / facade calls / case labels — across ddl handlers, groups, common, compact.
# The op-specific alternation deliberately does NOT match handleHandlerProfileView / handleHandlerDumpView.
grep -rnE --include='*.ts' 'handle(Read|Get|Create|Update|Delete|Check|Validate|Lock|Unlock|Activate)View\b|getView\(|ViewLow_Tool|handle[A-Za-z]*ViewLow|case .view.' \
  src/handlers/ddl src/lib/handlers/groups src/handlers/common/low src/handlers/compact ; \
  echo "=== expect empty ==="
# the view_name argument — -w skips the intentional cds_view_name
grep -rwnE --include='*.ts' 'view_name' \
  src/handlers/ddl src/lib/handlers/groups src/handlers/common/low src/handlers/compact ; \
  echo "=== expect empty (cds_view_name is a different arg, excluded by -w) ==="
# no View tool names left
grep -rnE --include='*.ts' "name: '[A-Za-z]*View[A-Za-z]*'" src/handlers/ddl ; echo "=== expect empty ==="
# compact uppercase VIEW object_type (quoted enum/key/desc) — NOT the lowercase profiler view: field
grep -rnE --include='*.ts' "'VIEW'|VIEW\(|VIEW:" src/handlers/compact ; echo "=== expect empty ==="
```
Expected: all four empty.

- [ ] **Step 8: Build green**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Static/registry checks green**

Run: `npm run test:check`
Expected: pass — the registry now exposes the `Ddl` tool names; no duplicate/missing-tool errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat!: rename View tools/handlers/args to Ddl (adt-clients 6.0.0 realign)"
```

---

## Task 3: Version bump, CHANGELOG, user-facing docs, and final gate

**Files:**
- Modify: `package.json` (`version`)
- Modify: `CHANGELOG.md`
- Regenerate (via `npm run docs:tools`): `docs/user-guide/AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`, `AVAILABLE_TOOLS_LOW.md`, `AVAILABLE_TOOLS_COMPACT.md`, `AVAILABLE_TOOLS_LEGACY.md`
- Delete (post-impl, per repo convention): `docs/superpowers/plans/2026-06-25-consumer-ddl-rename.md`

> `docs/user-guide/AVAILABLE_TOOLS*.md` are **auto-generated** from `TOOL_DEFINITION`s by `tools/generate-tools-docs.js` (`npm run docs:tools`). Do NOT hand-edit them — regenerate. Archive roadmaps under `docs/development/roadmaps/archive/` are historical — do NOT edit them.

- [ ] **Step 1: Bump the version**

In `package.json`: `"version": "7.2.1"` → `"version": "8.0.0"`.

- [ ] **Step 2: Add the CHANGELOG entry**

Prepend under the top of `CHANGELOG.md`:
```markdown
## [8.0.0] - 2026-06-25

### Changed (BREAKING)
- **`View` DDL-source tools renamed to `Ddl`.** Migrated to `@mcp-abap-adt/adt-clients@^6.0.0`, whose misnamed `getView()` client became the generic DDL-source client `getDdl()` (`/sap/bc/adt/ddic/ddl/sources/` — CDS views, AMDP table functions, other DDL sources). MCP tools renamed: `GetView`→`GetDdl`, `ReadView`→`ReadDdl`, `CreateView`→`CreateDdl`, `UpdateView`→`UpdateDdl`, `DeleteView`→`DeleteDdl`, `CheckView`→`CheckDdl`, `ActivateView`→`ActivateDdl`, and the `*ViewLow` variants → `*DdlLow`. The tool argument `view_name` is now `ddl_name`.
- **Generic object tools** (`LockObject`/`UnlockObject`/`CheckObject`/`ValidateObject`/`DeleteObject`): the `object_type` value `"view"` is renamed to `"ddl"` (removed, no alias).
- **Compact facade** (`HandlerGet`/`HandlerCreate`/… ): the `object_type` value `VIEW` is renamed to `DDL` and its `view_name` argument to `ddl_name` (removed, no alias).
```

- [ ] **Step 3: Regenerate the tool docs**

Run: `npm run docs:tools`
Expected: rewrites all `docs/user-guide/AVAILABLE_TOOLS*.md` with the `Ddl` tool names, `ddl_name` argument, and `DDL` compact object_type. Verify no `View` tool names remain:
```bash
grep -rnE "(Get|Read|Create|Update|Delete|Check|Activate|Validate|Lock|Unlock)View|VIEW\(" docs/user-guide/AVAILABLE_TOOLS*.md ; echo "=== expect empty ==="
grep -rwnE 'view_name' docs/user-guide/AVAILABLE_TOOLS*.md ; echo "=== expect empty (cds_view_name excluded by -w) ==="
```
Expected: both empty. (If any non-generated user-guide prose elsewhere references the old names, fix it manually — but do NOT hand-edit the generated `AVAILABLE_TOOLS*.md`.)

- [ ] **Step 4: Full grep-gate across the source tree**

Run:
```bash
grep -rnE --include='*.ts' "name: '(Get|Read|Create|Update|Delete|Check|Activate|Validate|Lock|Unlock)View" src ; echo "=== expect empty ==="
grep -rn --include='*.ts' 'getView()' src ; echo "=== expect empty ==="
# op-specific so it ignores handleHandlerProfileView / handleHandlerDumpView
grep -rnE --include='*.ts' 'handle(Read|Get|Create|Update|Delete|Check|Validate|Lock|Unlock|Activate)View\b' src ; echo "=== expect empty ==="
# -w skips the intentional cds_view_name
grep -rwnE --include='*.ts' 'view_name' src ; echo "=== expect empty ==="
grep -rnE --include='*.ts' "case 'view'|'VIEW'|VIEW\(|VIEW:" src/handlers ; echo "=== expect empty (no view/VIEW object_type left) ==="
```
Expected: all empty.

- [ ] **Step 5: Final build + checks**

Run: `npm run build && npm run test:check`
Expected: build exit 0; checks pass.

- [ ] **Step 6: Delete the plan file (work complete)**

```bash
git rm docs/superpowers/plans/2026-06-25-consumer-ddl-rename.md
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: bump to 8.0.0, CHANGELOG + docs for View->Ddl rename"
```

---

## Verification

- `npm run build` exit 0 and `npm run test:check` green after each task.
- Grep-gates in Task 2 Step 7 and Task 3 Step 4 return empty (no stray `View`/`VIEW` tool names, object_type values, `getView()`, `view_name` arg, or DDL-CRUD `handle(Read|Get|Create|Update|Delete|Check|Validate|Lock|Unlock|Activate)View` symbol — anywhere in `src/handlers`, groups, common, or compact). The unrelated `handleHandlerProfileView`/`handleHandlerDumpView` compact tools are intentionally retained and are not matched by the op-specific gates.
- `node -e "require('@mcp-abap-adt/adt-clients/package.json').version"` prints `6.0.0`; lockfile has no `link:`/`file:` for it.
- Tool registry exposes `GetDdl`/`ReadDdl`/`CreateDdl`/… and the `*DdlLow` set; the generic low `object_type` accepts `"ddl"` (not `"view"`); the compact facade accepts `DDL`/`ddl_name` (not `VIEW`/`view_name`). No aliases — old values now error, which surfaces any missed call site immediately.
- **End-to-end on a real system is NOT claimed from this PR.** Per the team workflow, the renamed tools are exercised via cloud-llm-hub after the user publishes `@mcp-abap-adt/core@8.0.0`. Integration tests are config-driven and skip cleanly without SAP.

## Out of scope (separate, tracked)

- Publishing `@mcp-abap-adt/core@8.0.0` — the **user** runs `npm publish`; the agent only opens the PR.
- Any change to `@mcp-abap-adt/interfaces` — mcp-abap-adt does not import its `View*` types; the interfaces `IAdtView.ts` realign (if desired) is a distinct decision in that package.
- Folding `structure`/`table`/`scalarFunction` clients into `Ddl` — different endpoints, unchanged.

# Compact facade schema completeness (issue #123) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the compact facade's `create`/`update`/`delete` JSON schemas expose every argument the routed per-type handlers actually require, and add a runtime guard that fails if they ever drift again. Resolves issue #123 (compact CRUD not callable from schema-driven MCP clients for many object types).

**Architecture:** The compact facade (`src/handlers/compact/high/`) routes `object_type` → a per-type handler via `compactRouterMap`, passing `args` straight through. So a routed handler's required args MUST all be exposed by the corresponding compact schema (`compactCreateSchema`/`compactUpdateSchema`/`compactDeleteSchema`), or a schema-driven client cannot call it. Today many are missing (names like `table_name`/`structure_name`/`service_definition_name`/…, and update payload fields like `ddl_code`/`properties`/`lock_handle`/`implementation_code`/…). The fix adds the missing properties and locks the contract with a guard test driven by the handlers' real `TOOL_DEFINITION.inputSchema.required`.

**Tech Stack:** TypeScript, Jest (ts-jest), the compact router/schemas, `npm run docs:tools` generator.

## Global Constraints

- **Source of truth is the handler, read at RUNTIME.** Do NOT grep `required: [...]` — files have nested `required` arrays (e.g. domain `fixed_values` → `['low','text']`) and duplicate handler names across high/low dirs. The guard and the audit must import each routed handler's `TOOL_DEFINITION` and read `inputSchema.required` (top-level) programmatically.
- **Pass-through semantics:** the compact router calls `handler(context, args)` with the client's args unchanged. Therefore the rule is: for every `(object_type, operation)` in `compactRouterMap`, every entry in the routed handler's top-level `inputSchema.required` MUST be a property of the matching compact schema. `object_type` is compact-only and is exempt.
- **Additive, non-breaking:** only ADD optional properties to the three compact schemas and (if needed) correct wrong facade description text. Do NOT change any routed handler's own `inputSchema`/arg names, and do NOT change the compact schemas' `required` (still just `['object_type']`). No existing tool's contract changes.
- **Do NOT normalize handler arg-name inconsistencies here** (e.g. some handlers use a generic `name` while siblings use `<type>_name`). Expose whatever the handler requires. Arg-name normalization is a separate API decision — note it in issue #123, don't do it.
- **Keep genuine domain wording**; do not touch the profiler `view:` field, `HandlerProfileView`/`HandlerDumpView`, or unrelated schemas (`compactGetSchema` etc. — out of scope; only create/update/delete).
- **Version:** additive feature → **minor bump 8.0.0 → 8.1.0** (+ CHANGELOG + `server.json` both fields + regenerate `AVAILABLE_TOOLS*.md`).
- **Gates:** `npm run build` exit 0 and `npm run test:check` pass after every task; the new guard test passes.

## Task 1: Runtime guard test (handler-truth) + close all create/update/delete gaps

**Files:**
- Create: `src/__tests__/unit/compactSchemaCompleteness.test.ts` (runtime guard)
- Modify: `src/handlers/compact/high/compactSchemas.ts` (add missing optional props to create/update/delete)

**Interfaces:**
- Consumes: `compactRouterMap` (the routing table), each routed handler module's exported `TOOL_DEFINITION`.
- Produces: a green guard the later tasks and CI rely on.

- [ ] **Step 1: Write the guard test (expect RED first).**
  Build a map `{ create, update, delete }` of `object_type → routed handler TOOL_DEFINITION` that MIRRORS `compactRouterMap` (import the `TOOL_DEFINITION` from the same modules `compactRouter.ts` imports the handler functions from). For each operation, for each `(object_type, toolDef)`, read `toolDef.inputSchema.required` (default `[]`), drop `object_type`, and assert every remaining name is a key of the matching compact schema's `properties`. Use `it.each` so each gap is a named failure.

  ```ts
  // shape (fill in the full per-type import map):
  import { compactCreateSchema, compactUpdateSchema, compactDeleteSchema } from '../../handlers/compact/high/compactSchemas';
  import { TOOL_DEFINITION as CreateTable } from '../../handlers/table/high/handleCreateTable';
  // ...one import per routed (op,type)...
  const ROUTED = {
    create: { TABLE: CreateTable, /* ...all create types... */ },
    update: { /* ... */ },
    delete: { /* ... */ },
  } as const;
  const SCHEMA = { create: compactCreateSchema, update: compactUpdateSchema, delete: compactDeleteSchema } as const;
  for (const op of ['create','update','delete'] as const) {
    describe(`compact ${op} schema exposes every routed handler required arg`, () => {
      const props = Object.keys(SCHEMA[op].properties);
      for (const [type, def] of Object.entries(ROUTED[op])) {
        const required = (def.inputSchema?.required ?? []).filter((r: string) => r !== 'object_type');
        it.each(required)(`${type}: %s`, (arg) => expect(props).toContain(arg));
      }
    });
  }
  ```
  Resolve each routed module path from `compactRouter.ts`'s own imports (same files). If a handler exports no `required`, it contributes nothing.

- [ ] **Step 2: Run the guard → RED.** `npx jest compactSchemaCompleteness`. Record the full list of missing `(op, type, arg)`.

- [ ] **Step 3: Add the missing optional properties** to `compactCreateSchema`, `compactUpdateSchema`, `compactDeleteSchema` in `src/handlers/compact/high/compactSchemas.ts`. For every arg the guard reported missing, add a `propname: { type: <string|boolean|number|array|object>, description: '<concise>' }`. Match the JSON type to the routed handler's own schema for that prop (open the handler to copy the right type/shape — e.g. `properties`, `fixed_values` are objects/arrays, `lock_handle`/`*_code`/`*_source` are strings, `super_package` string, `container_class`/`test_class`/`cds_view_name` strings). Do NOT add to `required`. Keep the lowercase profiler `view:` and unrelated props untouched.

- [ ] **Step 4: Run the guard → GREEN.** `npx jest compactSchemaCompleteness` passes.

- [ ] **Step 5: Build + checks.** `npm run build` (0) and `npm run test:check` (pass).

- [ ] **Step 6: Commit.**
  ```bash
  git add src/handlers/compact/high/compactSchemas.ts src/__tests__/unit/compactSchemaCompleteness.test.ts
  git commit -m "fix(compact): expose all routed-handler required args in create/update/delete schemas + guard (#123)"
  ```

## Task 2: Reconcile facade descriptions with the schemas/handlers

**Files:** `src/handlers/compact/high/handleHandlerCreate.ts`, `handleHandlerUpdate.ts`, `handleHandlerDelete.ts`

**Interfaces:** Consumes Task 1's now-complete schemas. Produces descriptions that don't advertise non-existent args.

- [ ] **Step 1: Add a description↔schema guard** to `compactSchemaCompleteness.test.ts`: for each of create/update/delete, parse the facade `TOOL_DEFINITION.description` for `TYPE(arg*[, arg2*])` tokens (regex `/\(([^)]*)\)/g` then keep `^[a-z_]+\*$`), and assert every advertised arg is a property of that operation's compact schema. Run → it will flag wrong advertisements.

- [ ] **Step 2: Fix the wrong descriptions.** Known bug: the CREATE description advertises `UNIT_TEST(run_id*)` and `CDS_UNIT_TEST(run_id*)`, but create needs `UNIT_TEST(container_class*, test_class*)` and `CDS_UNIT_TEST(class_name*, package_name*, cds_view_name*)` (run_id is only update/delete). Correct these (and any others the Step-1 guard flags) to match the routed handlers' real required args.

- [ ] **Step 3: Guard green + build + checks.** `npx jest compactSchemaCompleteness`, `npm run build`, `npm run test:check`.

- [ ] **Step 4: Commit.**
  ```bash
  git add src/handlers/compact/high/handleHandler*.ts src/__tests__/unit/compactSchemaCompleteness.test.ts
  git commit -m "fix(compact): correct create/update/delete facade descriptions to match handler args (#123)"
  ```

## Task 3: Release wiring

**Files:** `package.json`, `package-lock.json`, `server.json`, `CHANGELOG.md`, `docs/user-guide/AVAILABLE_TOOLS*.md`

- [ ] **Step 1: Regenerate docs.** `npm run docs:tools`; confirm compact create/update/delete now list the added params and the corrected descriptions.
- [ ] **Step 2: Version 8.0.0 → 8.1.0** in `package.json`; `npm install --package-lock-only`; bump BOTH `version` fields in `server.json` to 8.1.0.
- [ ] **Step 3: CHANGELOG `## [8.1.0]`** — "Compact facade `create`/`update`/`delete` now expose every routed object type's required arguments (previously many were advertised but unschema'd, so schema-driven clients couldn't call them); added a runtime guard that fails if a routed handler's required arg is missing from its compact schema; corrected create/update/delete facade descriptions. Non-breaking (additive optional properties)."
- [ ] **Step 4: Final gate.** `npm run build` (0), `npm run test:check` (pass), guard green.
- [ ] **Step 5: Delete this plan file** (`git rm docs/superpowers/plans/2026-06-26-compact-schema-completeness.md`) and commit version/CHANGELOG/docs together.

## Verification
- `npx jest compactSchemaCompleteness` green — no routed handler required arg missing from its compact schema, and no description advertises an unschema'd arg.
- `npm run build` exit 0, `npm run test:check` pass.
- `AVAILABLE_TOOLS_COMPACT.md` create/update/delete param lists match the routed handlers.
- Non-breaking: compact schema `required` stays `['object_type']`; no routed handler changed.

## Out of scope (note in issue #123, do NOT do here)
- Normalizing handler arg-name inconsistencies (handlers that use generic `name` vs `<type>_name`). The compact schema simply exposes whatever each handler requires.
- The `compactGetSchema` / read path (already exposes the name args).
- Folding unit-test create's nested `tests[]` shape into a simpler compact form.

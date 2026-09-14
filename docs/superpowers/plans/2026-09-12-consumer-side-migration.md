# Consumer-side migration onto adt-clients 19 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all 326 handlers off the adt-clients 18 envelope onto the 19 contract — injected result strategies, a per-call `analyse`, and handler-owned sequences — with the MCP tool surface unchanged except for a `detail` parameter on JSON-answering tools.

**Architecture:** Every handler answers through one adapter, `answer()`. The value it projects comes from a result strategy this repository injects into the client (`verbatim`, `structured`, `statusOnly`); the verdict on a failure comes from an `analyse` passed per call, taken from `@mcp-abap-adt/adt-strategies`. A handler that needs several endpoint calls owns the order itself — `sequence()` where the last answer is the result, `pair()` where both are, `withLock()` where a lock must be released on every path out.

**Spec:** `docs/superpowers/specs/2026-09-12-consumer-side-migration-design.md` — reviewed and approved 2026-09-13. Read it first; this plan argues from it and does not repeat its reasoning.

**Tech Stack:** TypeScript 5, `@mcp-abap-adt/adt-clients` 19.0.0, `@mcp-abap-adt/adt-strategies` 0.1.0, `@mcp-abap-adt/interfaces` 44.0.0, `fast-xml-parser`, Jest.

## Progress

**This table is the record; the checkboxes below are the detail.** Every row
names the commit that closed the task, so `git show <hash> --stat` answers what
it touched and `git log --oneline` answers the order. A task is done when its
own tests pass and it is committed — not when it is described.

| task | state | commit |
|---|---|---|
| 1. Freeze the tool surface | done | `dc48ffa` |
| 2. `safeFields` | done | `3cc6192` |
| 3. `answer.ts` — the failure payload | done | `c340a77` |
| 4. `pair()`, and `sequence()` at five steps | done | `2b4de6f` |
| 5. `withLock()` | done | `f19ffea` |
| 6. The slot table | done | `8c2a040` |
| 7. `detail` | done | `dfc31ef` |
| 8. Test helpers | done | `47609aa` |
| 9. The reference read | done | `39c19b9` |
| 10. The reference write family | done | `d4978a2` |
| 11. Sixteen two-call reads | done | `9281c35` |
| 12. Single-call reads and listings | done | `141ac27` |
| 13. `common/low`, six generic ops | done | `ef6074c` |
| 14. `low` tier, cluster one | done | `92b0d7c` |
| 15. `low` tier, cluster two | done | `5285a23` |
| 16 – 29 | not started | |

Verify without reading anything above:

```bash
git log --oneline --grep='^Task\|^test(surface)\|^feat(strategies)\|^fix(answer)' -20
npx jest src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/safeFields.test.ts src/__tests__/unit/answer
npx tsc --noEmit 2>&1 | grep -cE '^src/.*error TS'   # 589 at the baseline, and until Task 9
```

## Global Constraints

Every task's requirements implicitly include this section.

- **The tool surface does not change**, except `detail: 'terse' | 'full' | 'raw'` on JSON-answering tools. 362 tools across 6 groups; the snapshot frozen in Task 1 is the check.
- **No handler decides a refusal.** A handler must not read a status code, an `isDeleted`, a `chkrun:status` or an `exc:exception` to decide success. That verdict belongs to the `analyse` strategy.
- **No handler builds a failure sentence.** `answer()` renders the strategy's failure through its allowlist. `return_error(new Error(failure.message))` is a defect, not a migration step.
- **`analyse` on every call whose resolved signature accepts one** — resolved by the compiler, per (class, member). There is no shortcut: `fetchNodeStructure` has an `options` argument and accepts no strategy, and `AdtPackageLegacy.readMetadata<E>()` is generic with no parameters at all. Pass it **in the call, or in a `const` initialized with an object literal in the same file and not mutated afterwards** — that is what makes the check decidable. A `let`, a value assembled at runtime, or one that may be `undefined` is reported so it can be inlined. `const` fixes the binding and not the object, so mutating the literal afterwards defeats the check; the invariant is a guard, not a proof. Passing one where it is not accepted is already a compile error. The omission is caught by `scripts/check-analyse.ts`, written in Task 10 and run by every task that migrates handlers **on the family it just touched**, so a missing strategy is found in the commit that introduced it. Task 26 runs the same check repo-wide as a test.
- **`raw_body` never depends on `detail`.** Whenever the failure carries a non-empty string body it reaches the caller at every level and on every tool; where there is none the field is absent, never invented.
- **Every test's arguments come from its tool's own schema — names, and values from any `enum` or documented set — and every negative test asserts what failed.** Values matter as much as names: `binding_variant` accepts four spellings and `ODATA_V4` is none of them; `object_type` is lowercased and matched against `class` or the ADT code `clas/oc`, so `CLAS` falls through to the default. A handler validates its input before it builds a client, so a call short of a required field never reaches the member under test — and still answers `isError: true`. Asserting only that flag passes such a test while proving nothing. Assert the message, or `origin: 'refusal'`, which a local validation error cannot produce.
- **Nothing reaches a caller except by name.** `request` and `cleanup` are rebuilt field by field in `answer.ts`. The contract's types are not filters, and what sits on a transport config is headers, an Authorization bearer and cookies.
- **A lock chain is `withLock()`, never `sequence()`**, and only where the handler owns the lock's whole lifetime. The fifteen `low`-tier `LockX` tools hand the handle back on purpose and are never wrapped.
- **Legacy is in scope.** `SAP_SYSTEM_TYPE=legacy` selects `AdtClientLegacy`, which serves 144 of the 326 tools through these same handler files. Four `Legacy` classes drop the strategy on seventeen members; Task 18 pins them and Task 19 walks the twenty-three tools that reach them.
- **Never commit to `main`.** Work on `feat/answer-adapter`, PR and merge. Do not rewrite history.
- **The agent never runs `npm publish`.** The user publishes.
- **No live SAP calls.** Every test here runs offline against `tests/fixtures/adt/` — 48 cases, 61 exchanges, 27 endpoints. Integration runs are the user's call, after the compiler is clean.
- **Notes in adt-clients are not evidence.** Its strategies are injected, so its notes describe what it ships. A claim about ADT behaviour cites a fixture in `tests/fixtures/adt/` or says plainly that it is unverified.
- **Do not modify the 29 shared polygon objects** under `ZMCP_SHR_PKG`.
- **The pre-commit hook runs the full build**, which stays red until Task 17. Commit with `--no-verify` until then, and say so in the message.

## The mapping is the migration guide, and the worklist is the compiler

`node_modules/@mcp-abap-adt/adt-clients/docs/usage/MIGRATION-19.md` says what
each removed member became. **Read it before any task that replaces one**, and
prefer it to this plan where the two disagree — several cells here that once
read "establish in Step 1" were answered there all along, and one of them, the
profiling workflow, was guessed wrong in this plan for six drafts.

It also carries three facts that outrank anything derived from the type
declarations alone:

- `update` is a replace **on every type**, not only the six that stopped hiding
  it. For a class, a program, a DDL source or an interface the whole content is
  the full source, and always was.
- 454 input guards were removed, with one exception kept: `packageName` on a
  create, because an object created without a package cannot be deleted through
  ADT at all — the deletion check resolves through the package.
- `activateObjectsGroup` answers the **run id**, not a body, and the wait that
  used to be inside it is now the caller's `getActivationRun` loop.

## The worklist is the compiler

`npx tsc --noEmit` reports **589 errors in 259 files** at the plan's baseline. 499 are TS2339 — a handler reading an envelope property (`readResult`, `metadataResult`, `deleteResult`, `validationResponse`, `activateResult`, `createResult`, `updateResult`, `unlockResult`, `checkResult`) off `IAdtSuccess<string>`, which in 19 carries the strategy's value and nothing else.

Regenerate it at the start of every task, and **record the count in the commit message** so the trend is visible:

```bash
npx tsc --noEmit 2>&1 | grep -E '^src/.*\([0-9]+,[0-9]+\): error' > /tmp/errs.txt
wc -l < /tmp/errs.txt
sed -E 's/\(.*//' /tmp/errs.txt | sort | uniq -c | sort -rn | head -30
```

**Do not treat a predicted count as a target.** A sharp drop usually means a syntax error stopped `tsc` before it reached the rest. The number to trust is the one you measured after the task, against the one you measured before it.

## File structure

**Created:**

| file | responsibility |
|---|---|
| `src/lib/strategies/safeFields.ts` | the two narrowing functions `answer.ts` and `withLock.ts` share |
| `src/lib/strategies/withLock.ts` | calls around a held resource, and the six outcomes |
| `src/lib/strategies/resultSets.ts` | one reading per result-set slot, stamped over any shipped set |
| `src/lib/strategies/detail.ts` | the `detail` schema fragment and the one function that reads it |
| `tests/fixtures/tools/surface.json` | the frozen tool surface |
| `src/__tests__/unit/toolSurface.test.ts` | fails if the surface moves |
| `src/__tests__/unit/safeFields.test.ts` | nothing but `method` and `url` survives |
| `src/__tests__/unit/withLock.test.ts` | the six outcomes, and release exactly once |
| `src/__tests__/unit/resultSets.test.ts` | every slot maps to a reading |
| `src/__tests__/unit/detail.test.ts` | the three levels, and the default |
| `src/lib/audit/analyseOmissions.ts` | the omission check, shared by the script and the test |
| `scripts/check-analyse.ts` | runs it on one family, from Task 10 onward |
| `src/__tests__/unit/handlerInvariants.test.ts` | no envelope read, no handler verdict, no missing `analyse` |
| `src/__tests__/unit/analyseOmissions.test.ts` + twelve fixtures | every verdict the check can reach, held by a committed case |
| `src/__tests__/unit/legacyExposure.test.ts` + `tests/fixtures/legacy-handlers.json` | exactly which handlers legacy is offered, pinned |
| `tests/fixtures/legacy-exposure.json` | which of those still land on a member that decides alone |
| `src/__tests__/unit/legacyContract.test.ts` | the seventeen legacy members that decide alone |

**Modified:** `src/lib/answer.ts`, `src/lib/strategies/sequence.ts`, 253 handler files, and six non-handler files carrying the same envelope reads (`src/lib/utils.ts`, `src/lib/checkRunParser.ts`, `src/lib/search-source/{sourceReader,packageResolver,packageEnumerator}.ts`, `src/embeddable/BaseMcpServer.ts`).

---

## Task 1: Freeze the tool surface

The spec's first success criterion is that 362 tools stay as they are. This ratchet checks that no tool, group or parameter moves, and that the only parameter added anywhere is `detail`.

**It does not check that `detail` went only to the JSON-answering tools.** It would accept `detail` on all 362. That half of the criterion is Task 28's exact-list test, and the two together are what the spec asks for.

**Files:**
- Create: `tests/fixtures/tools/surface.json`, `src/__tests__/unit/toolSurface.test.ts`

**Interfaces:**
- Consumes: `scripts/list-tools.ts`, which enumerates all six groups and already handles both input-schema shapes — plain JSON Schema, and the five handlers that declare a bare zod raw shape.
- Produces: the baseline every later task is measured against.

- [x] **Step 1: Generate the snapshot**

```bash
mkdir -p tests/fixtures/tools
npx tsx scripts/list-tools.ts > tests/fixtures/tools/surface.json
node -e "
const rows = require('./tests/fixtures/tools/surface.json');
const byGroup = {};
for (const r of rows) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
console.log(rows.length, 'tools:', JSON.stringify(byGroup));
"   # expect 362 across six groups
```

- [x] **Step 2: Write the ratchet**

```typescript
// src/__tests__/unit/toolSurface.test.ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tool surface is a contract with callers who never read this repository.
 * `detail` is the one addition this migration may make; anything else moving is
 * a regression, and this is where it is caught.
 */
/**
 * `scripts/list-tools.ts` answers a FLAT ARRAY of `{ group, name, inputs }`,
 * where `inputs` is a formatted string — `"table_name*, max_rows"`, with `*`
 * marking required and the sentinel `"(none)"` for a tool that takes nothing.
 *
 * Not an object keyed by group, and not a `params` array. An earlier draft of
 * this test assumed both and would have failed on an unchanged surface, which
 * would have made the ratchet useless from the first task onward.
 */
describe('the MCP tool surface', () => {
  type Row = { group: string; name: string; inputs: string };

  const read = (rows: Row[]) => new Map(rows.map((r) => [`${r.group}/${r.name}`, r.inputs]));
  const parameters = (inputs: string) => (inputs === '(none)' ? [] : inputs.split(', '));

  const frozen: Row[] = JSON.parse(
    readFileSync(join(__dirname, '../../../tests/fixtures/tools/surface.json'), 'utf8'),
  );
  const current: Row[] = JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/list-tools.ts'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );

  it('has the same tools in the same groups', () => {
    expect([...read(current).keys()].sort()).toEqual([...read(frozen).keys()].sort());
  });

  it('changes no parameter except by adding detail', () => {
    const now = read(current);
    for (const [tool, before] of read(frozen)) {
      const after = now.get(tool);
      if (after === before) continue;
      const had = parameters(before);
      const has = parameters(after ?? '(none)');
      // Nothing may leave, and the only thing that may arrive is `detail` —
      // optional, so it carries no `*`.
      expect(had.filter((p) => !has.includes(p))).toEqual([]);
      expect(has.filter((p) => !had.includes(p))).toEqual(['detail']);
    }
  });
});
```

- [x] **Step 3: Run it, expect PASS**

```bash
npx jest src/__tests__/unit/toolSurface.test.ts
```

This one is written green — it is a ratchet, not a red-green cycle.

- [x] **Step 4: Prove it can fail**

Rename `ReadClass` to `ReadClassX` in `src/handlers/class/readonly/handleReadClass.ts`, run the test, confirm FAIL, revert. A ratchet nobody has seen fail is not known to work.

- [x] **Step 5: Commit**

```bash
git add tests/fixtures/tools/surface.json src/__tests__/unit/toolSurface.test.ts
git commit --no-verify -m "test(surface): freeze the 362 tools before anything moves"
```

---

## Task 2: `safeFields` — nothing reaches a caller except by name

The contract types `request` as `{ method?, url? }`, but a type is not a filter: TypeScript accepts a wider object structurally, and what is actually on it is transport config with an Authorization bearer and cookies. `answer.ts` already narrows its own `request`; `withLock` will build a `cleanup` carrier that needs the same rule, and that carrier rides inside a thrown error where it can be logged long before the adapter sees it. One module, two callers, one rule.

**Files:**
- Create: `src/lib/strategies/safeFields.ts`, `src/__tests__/unit/safeFields.test.ts`

**Interfaces:**
- Produces:
  - `Cleanup` — `{ message, origin?, request? }` from a refusal, or `{ error: 'client_threw', message }` from a throw
  - `safeRequest(value: unknown): Record<string, string> | undefined`
  - `safeCleanup(value: unknown): Record<string, unknown> | undefined`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/safeFields.test.ts
import { safeCleanup, safeRequest } from '../../lib/strategies/safeFields';

const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';

describe('safeRequest', () => {
  it('keeps method and url and drops everything else', () => {
    const out = safeRequest({
      method: 'POST',
      url: '/sap/bc/adt/domains/ZD',
      headers: { authorization: SECRET, cookie: 'SAP_SESSIONID=abc' },
      httpsAgent: { options: { cert: 'PEM' } },
    });
    expect(out).toEqual({ method: 'POST', url: '/sap/bc/adt/domains/ZD' });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('answers undefined when neither field is a string', () => {
    expect(safeRequest(undefined)).toBeUndefined();
    expect(safeRequest({ headers: { authorization: SECRET } })).toBeUndefined();
    expect(safeRequest({ method: 7, url: null })).toBeUndefined();
  });
});

describe('safeCleanup', () => {
  it('narrows a refusal carrier, request included', () => {
    expect(
      safeCleanup({
        message: 'Unlock refused',
        origin: 'refusal',
        request: { method: 'POST', url: '/u', headers: { authorization: SECRET } },
        extra: 'dropped',
      }),
    ).toEqual({
      message: 'Unlock refused',
      origin: 'refusal',
      request: { method: 'POST', url: '/u' },
    });
  });

  it('drops the origin from a throw-shaped carrier', () => {
    // Having no origin is that shape's whole point: `connection` and `refusal`
    // are claims about the server, and neither is true of a local defect.
    expect(safeCleanup({ error: 'client_threw', message: 'no handle', origin: 'refusal' }))
      .toEqual({ error: 'client_threw', message: 'no handle' });
  });

  it('answers undefined for a non-object and for an empty result', () => {
    expect(safeCleanup(null)).toBeUndefined();
    expect(safeCleanup('boom')).toBeUndefined();
    expect(safeCleanup({ unrelated: 1 })).toBeUndefined();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/safeFields.test.ts
```

Expected: FAIL — cannot find module `safeFields`.

- [x] **Step 3: Implement**

```typescript
// src/lib/strategies/safeFields.ts

/**
 * What a failed release adds to a payload — in two shapes, and which one it is
 * carries information of its own.
 *
 * SAP refused the unlock: an origin, from the strategy that judged it.
 * Something in this process threw: `client_threw`, and deliberately no origin.
 */
export type Cleanup =
  | { message: string; origin?: string; request?: unknown }
  | { error: 'client_threw'; message: string };

/**
 * Two fields, copied by name.
 *
 * The contract types `request` as `{ method?, url? }`, but a type is not a
 * filter: TypeScript accepts a wider object structurally, and a strategy that
 * put its transport config here would send headers, an Authorization bearer and
 * cookies straight to the model.
 */
export function safeRequest(value: unknown): Record<string, string> | undefined {
  const method = (value as { method?: unknown } | undefined)?.method;
  const url = (value as { url?: unknown } | undefined)?.url;
  if (typeof method !== 'string' && typeof url !== 'string') return undefined;
  const out: Record<string, string> = {};
  if (typeof method === 'string') out.method = method;
  if (typeof url === 'string') out.url = url;
  return out;
}

/** The cleanup, field by field. Its two shapes are mutually exclusive. */
export function safeCleanup(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const carrier = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof carrier.message === 'string') out.message = carrier.message;
  if (carrier.error === 'client_threw') out.error = 'client_threw';
  else if (typeof carrier.origin === 'string') out.origin = carrier.origin;
  const request = safeRequest(carrier.request);
  if (request !== undefined) out.request = request;
  return Object.keys(out).length > 0 ? out : undefined;
}
```

- [x] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/safeFields.test.ts
```

Expected: PASS, all six.

- [x] **Step 5: Commit**

```bash
git add src/lib/strategies/safeFields.ts src/__tests__/unit/safeFields.test.ts
git commit --no-verify -m "feat(strategies): one narrowing rule, for request and cleanup alike"
```

---

## Task 3: `answer.ts` — the failure payload the spec describes

Three changes, and the first is a bug fix the spec argues at length: `raw_body` is written only when `ctx.detail === 'raw'`, so a text-answering tool that declares no `detail` can never hand back the document SAP refused with. `detail` shapes the result projection, and a failure is not a projection.

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerFailure.test.ts` (exists — extend)

**Interfaces:**
- Consumes: `safeRequest`, `safeCleanup` from Task 2.
- Produces: `AnswerDetail` re-exported from `projections.ts` so there is one definition; a failure payload carrying `cleanup` and `operation` on both the refusal and the `client_threw` path.

- [x] **Step 1: Write the failing tests**

```typescript
// append to src/__tests__/unit/answerFailure.test.ts
import { corpusBody } from '../../lib/adtCorpus';
import { answer, return_answer } from '../../lib/answer';

const refusalWith = (extra: Record<string, unknown>) => ({
  ok: false as const,
  getResult: () => { throw new Error('not a success'); },
  getError: () => ({ message: 'Update refused', origin: 'refusal', ...extra }),
});

describe('the failure payload', () => {
  const document = corpusBody('refusal-object-not-found--01-read-source');

  it.each(['terse', 'full', 'raw'] as const)('carries raw_body at detail=%s', (detail) => {
    const result: any = return_answer(
      refusalWith({ response: { data: document } }) as any,
      () => ({}),
      { tool: 'ReadClass', detail },
    );
    expect(JSON.parse(result.content[0].text).raw_body).toBe(document);
  });

  it.each([
    ['a connection failure', {}],
    ['an empty answer', { response: { data: '' } }],
    ['a parsed body', { response: { data: { a: 1 } } }],
  ])('leaves raw_body absent for %s', (_name, extra) => {
    const result: any = return_answer(refusalWith(extra) as any, () => ({}), {
      tool: 'ReadClass', detail: 'raw',
    });
    expect('raw_body' in JSON.parse(result.content[0].text)).toBe(false);
  });

  it('carries cleanup, narrowed, on a refusal', () => {
    const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';
    const result: any = return_answer(
      refusalWith({
        cleanup: {
          message: 'Unlock refused',
          origin: 'refusal',
          request: { method: 'POST', url: '/u', headers: { authorization: SECRET } },
        },
      }) as any,
      () => ({}),
      { tool: 'UpdateDomain', detail: 'terse' },
    );
    expect(result.content[0].text).not.toContain(SECRET);
    expect(JSON.parse(result.content[0].text).cleanup).toEqual({
      message: 'Unlock refused', origin: 'refusal', request: { method: 'POST', url: '/u' },
    });
  });

  it('carries cleanup and operation on the client_threw payload', async () => {
    // The only report a caller gets when the write landed and the unlock threw.
    const thrown = Object.assign(new Error('unlock called with no handle'), {
      operation: 'succeeded',
      cleanup: { error: 'client_threw', message: 'unlock called with no handle' },
    });
    const result: any = await answer(
      { tool: 'UpdateDomain', detail: 'terse' },
      async () => { throw thrown; },
      () => ({}),
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('client_threw');
    expect(payload.operation).toBe('succeeded');
    expect(payload.cleanup).toEqual({ error: 'client_threw', message: 'unlock called with no handle' });
    expect(payload.origin).toBeUndefined();
  });
});
```

- [x] **Step 2: Run them to verify they fail**

```bash
npx jest src/__tests__/unit/answerFailure.test.ts
```

Expected: FAIL — `raw_body` absent at `terse` and `full`; `cleanup` and `operation` dropped by the allowlist on both paths. The empty-answer case fails too, because `''` passes a bare string check.

- [x] **Step 3: Implement**

```typescript
// src/lib/answer.ts — the three edits

// 1. one definition of the detail type
import type { AnswerDetail } from './strategies/projections';
export type { AnswerDetail };
import { safeCleanup, safeRequest } from './strategies/safeFields';

// 2. in failurePayload(): request through the shared narrowing, raw_body
//    ungated, cleanup and operation rendered.
  const request = safeRequest(error.request);
  if (request !== undefined) payload.request = request;

  const cleanup = safeCleanup((error as { cleanup?: unknown }).cleanup);
  if (cleanup !== undefined) payload.cleanup = cleanup;
  if ((error as { operation?: unknown }).operation === 'succeeded') {
    payload.operation = 'succeeded';
  }

  // Whatever `detail` says. It is a parameter of the RESULT projection, and a
  // failure is not a projection: on this path the consumer wants everything.
  // The empty string is not a document — emitting `raw_body: ""` would read as
  // "SAP sent an empty body" when nothing was sent at all.
  const body = (error.response as { data?: unknown } | undefined)?.data;
  if (typeof body === 'string' && body !== '') payload.raw_body = body;

// 3. in local(): the client_threw payload carries them too, read structurally
//    rather than by instanceof, so a second copy of the module still renders.
function local(kind: string, ctx: AnswerContext, message: string, thrown?: unknown): McpResult {
  const payload: Record<string, unknown> = { error: kind, tool: ctx.tool, detail: ctx.detail, message };
  const cleanup = safeCleanup((thrown as { cleanup?: unknown } | undefined)?.cleanup);
  if (cleanup !== undefined) payload.cleanup = cleanup;
  if ((thrown as { operation?: unknown } | undefined)?.operation === 'succeeded') {
    payload.operation = 'succeeded';
  }
  return json(payload, true);
}
```

Both `catch` blocks in `answer()` pass the thrown value to `local()`.

- [x] **Step 4: Run the tests and the compiler**

```bash
npx jest src/__tests__/unit/answer*.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: tests PASS; the error count is not higher than it was.

- [x] **Step 5: Commit**

```bash
git add src/lib/answer.ts src/__tests__/unit/answerFailure.test.ts
git commit --no-verify -m "fix(answer): a failure carries everything it has, at every detail"
```

---

## Task 4: `pair()`, and a `sequence()` long enough for a lifecycle

Two changes to the same file.

**`pair()`** — `sequence()` returns the last step's value, which serves a read-modify-write. It does not serve `handleReadClass`, which calls `read` and `readMetadata` and answers both. Without a combinator the handler captures the first value in a variable outside the run, which hands the ordering back to the handler one assignment at a time.

**More steps.** `sequence()` is declared for two steps and for three. A lifecycle create is five — validate, create, the locked body write, check, activate — and `handleCreateDomain` is exactly that today. Three overloads are not a design decision, they are where someone stopped; add four and five so Task 19 does not have to nest one `sequence` inside another to express an order the tool already performs.

**Files:**
- Modify: `src/lib/strategies/sequence.ts`
- Test: `src/__tests__/unit/sequence.test.ts` (exists — extend)

**Interfaces:**
- Produces: `pair<A, B>(first, second): Promise<IAdtResponse<[A, B], IAdtError>>`, and `sequence` overloads for four and five steps

- [x] **Step 1: Write the failing test**

```typescript
// append to src/__tests__/unit/sequence.test.ts
import { pair } from '../../lib/strategies/sequence';

const ok = <T>(value: T) => ({
  ok: true as const,
  getResult: () => ({ value }),
  getError: () => { throw new Error('not a failure'); },
});
const failed = (message: string) => ({
  ok: false as const,
  getResult: () => { throw new Error('not a success'); },
  getError: () => ({ message, origin: 'refusal' as const }),
});

describe('pair', () => {
  it('answers both values when both steps succeed', async () => {
    const result = await pair(async () => ok('source') as any, async () => ok('meta') as any);
    expect(result.ok).toBe(true);
    expect(result.getResult().value).toEqual(['source', 'meta']);
  });

  it('hands back the first failure untouched, and never calls the second step', async () => {
    const second = jest.fn();
    const result = await pair(async () => failed('read refused') as any, second as any);
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('read refused');
    expect(second).not.toHaveBeenCalled();
  });

  it('hands back the second failure untouched', async () => {
    const result = await pair(async () => ok('source') as any, async () => failed('meta refused') as any);
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('meta refused');
  });
});

describe('sequence, at five steps', () => {
  it('runs all five in order and answers the last', async () => {
    const order: string[] = [];
    const step = (name: string) => async () => { order.push(name); return ok(name) as any; };
    const result = await sequence(
      step('validate'), step('create'), step('write'), step('check'), step('activate'),
    );
    expect(order).toEqual(['validate', 'create', 'write', 'check', 'activate']);
    expect(result.getResult().value).toBe('activate');
  });

  it('stops at the fourth and never reaches the fifth', async () => {
    const fifth = jest.fn();
    const step = (name: string) => async () => ok(name) as any;
    const result = await sequence(
      step('validate'), step('create'), step('write'),
      async () => failed('Check refused') as any,
      fifth as any,
    );
    expect(result.getError().message).toBe('Check refused');
    expect(fifth).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/sequence.test.ts
```

Expected: FAIL — `pair is not a function`.

- [x] **Step 3: Implement**

```typescript
// src/lib/strategies/sequence.ts

/** Run four. A create that validates, creates, writes its body and activates. */
export async function sequence<A, B, C, D>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: Step<A, B>,
  third: Step<B, C>,
  fourth: Step<C, D>,
): Promise<IAdtResponse<D, IAdtError>>;
/** Run five. The full lifecycle create, with its check between write and activate. */
export async function sequence<A, B, C, D, E>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: Step<A, B>,
  third: Step<B, C>,
  fourth: Step<C, D>,
  fifth: Step<D, E>,
): Promise<IAdtResponse<E, IAdtError>>;
```

The implementation already loops over `...rest`, so it needs no change — only
the overloads, which is what stopped a five-phase handler from compiling.

```typescript
// and, appended

/**
 * Two calls whose BOTH answers are the result.
 *
 * `sequence` answers the last step, which is what a read-modify-write wants. A
 * read that reports a document and its metadata wants both, and capturing the
 * first outside the run would put the ordering back in the handler one
 * assignment at a time. The failure rule is `sequence`'s exactly: the failing
 * step's own answer, untouched, and the second step is never reached when the
 * first refuses.
 */
export async function pair<A, B>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: (a: A) => Promise<IAdtResponse<B, IAdtError>>,
): Promise<IAdtResponse<[A, B], IAdtError>> {
  const a = await first();
  if (!a.ok) return a as unknown as IAdtResponse<[A, B], IAdtError>;
  const valueA = a.getResult().value;
  const b = await second(valueA);
  if (!b.ok) return b as unknown as IAdtResponse<[A, B], IAdtError>;
  const both: [A, B] = [valueA, b.getResult().value];
  return {
    ok: true,
    getResult: () => ({ value: both }),
    getError: () => { throw new Error('pair: asked for the error of a success'); },
  } as unknown as IAdtResponse<[A, B], IAdtError>;
}
```

- [x] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/sequence.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/strategies/sequence.ts src/__tests__/unit/sequence.test.ts
git commit --no-verify -m "feat(strategies): pair — both answers, the same failure rule"
```

---

## Task 5: `withLock()` — the release runs on every path out

A lock chain is not a `sequence()`: a sequence stops at the first failure, so a refused update would skip the unlock and leave the object locked in SAP. Thirteen update handlers already wrap this in `try/finally`, and `LockRegistry` calls itself "a safety net, NOT the primary defense".

Both halves have three outcomes — ok, refused, threw — and the last two must not be collapsed. A refusal was judged by a strategy and carries an origin; a throw came from argument validation or an invariant inside this process and has none. Synthesizing one reports a local defect as a transport problem.

**Files:**
- Create: `src/lib/strategies/withLock.ts`, `src/__tests__/unit/withLock.test.ts`

**Interfaces:**
- Consumes: `Cleanup`, `safeRequest` from Task 2.
- Produces:
  - `withLock<H, T>(acquire, body, release): Promise<IAdtResponse<T, IAdtError>>`
  - `LockNotReleased` — the error rethrown when the body threw and the release failed, or when the release threw after a successful body

The nine combinations, from the spec:

| body | release | the answer |
|---|---|---|
| ok | ok | the body's value |
| ok | refused | a failure carrying the release error, plus `operation: 'succeeded'` |
| ok | threw | the release's throw, rethrown, plus `operation: 'succeeded'` |
| refused | ok | the body failure, untouched |
| refused | refused | the body failure, plus `cleanup` with an origin |
| refused | threw | the body failure, plus `cleanup` marked `client_threw` |
| threw | ok | the body's throw, unchanged |
| threw | refused | the body's throw, plus `cleanup` with an origin |
| threw | threw | the body's throw, plus `cleanup` marked `client_threw` |

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/withLock.test.ts
import { withLock } from '../../lib/strategies/withLock';

const ok = <T>(value: T) => ({
  ok: true as const,
  getResult: () => ({ value }),
  getError: () => { throw new Error('not a failure'); },
});
const failed = (message: string, request?: unknown) => ({
  ok: false as const,
  getResult: () => { throw new Error('not a success'); },
  getError: () => ({ message, origin: 'refusal' as const, request }),
});

describe('withLock', () => {
  it('runs neither body nor release when the lock is refused', async () => {
    const body = jest.fn();
    const release = jest.fn();
    const result = await withLock(
      async () => failed('Object is locked by another user') as any, body as any, release as any,
    );
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('Object is locked by another user');
    expect(body).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('answers the body value, releasing exactly once', async () => {
    const release = jest.fn(async () => ok(undefined) as any);
    const result = await withLock(
      async () => ok('handle-1') as any, async () => ok('written') as any, release,
    );
    expect(result.ok).toBe(true);
    expect(result.getResult().value).toBe('written');
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('handle-1');
  });

  it('releases after a refused body and answers that failure untouched', async () => {
    const release = jest.fn(async () => ok(undefined) as any);
    const result = await withLock(
      async () => ok('handle-1') as any, async () => failed('Update refused') as any, release,
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as any).cleanup).toBeUndefined();
  });

  it('releases after a THROWN body and lets the throw out unchanged', async () => {
    const release = jest.fn(async () => ok(undefined) as any);
    await expect(
      withLock(async () => ok('handle-1') as any, async () => { throw new Error('parser blew up'); }, release),
    ).rejects.toThrow('parser blew up');
    // Exactly once, on the throw path as much as the others. This is the half
    // the code can promise; whether SAP lets go is SAP's answer.
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps the body failure and names the dangling lock when the release is REFUSED', async () => {
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => failed('Update refused') as any,
      async () => failed('Unlock refused') as any,
    );
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as any).cleanup).toMatchObject({ message: 'Unlock refused', origin: 'refusal' });
  });

  it('marks a THROWN release as client_threw, with no origin, after a refused body', async () => {
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => failed('Update refused') as any,
      async () => { throw new Error('unlock called with no handle'); },
    );
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as any).cleanup).toEqual({
      error: 'client_threw', message: 'unlock called with no handle',
    });
  });

  it('reports a succeeded write under a REFUSED unlock as a failure', async () => {
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => ok('written') as any,
      async () => failed('Unlock refused') as any,
    );
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('Unlock refused');
    expect(result.getError().origin).toBe('refusal');
    expect((result.getError() as any).operation).toBe('succeeded');
  });

  it('rethrows a THROWN release after a successful body rather than inventing an origin', async () => {
    expect.assertions(3);
    try {
      await withLock(
        async () => ok('handle-1') as any,
        async () => ok('written') as any,
        async () => { throw new Error('unlock called with no handle'); },
      );
    } catch (thrown: any) {
      expect(thrown.message).toBe('unlock called with no handle');
      expect(thrown.operation).toBe('succeeded');
      expect(thrown.cleanup).toBeUndefined();
    }
  });

  it('carries the dangling lock out with a THROWN body when the release is refused', async () => {
    expect.assertions(3);
    try {
      await withLock(
        async () => ok('handle-1') as any,
        async () => { throw new Error('parser blew up'); },
        async () => failed('Unlock refused') as any,
      );
    } catch (thrown: any) {
      expect(thrown.message).toBe('parser blew up');
      expect(thrown.cause?.message).toBe('parser blew up');
      expect(thrown.cleanup).toMatchObject({ message: 'Unlock refused', origin: 'refusal' });
    }
  });

  it('never puts a transport config in the carrier, even before the boundary', async () => {
    const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => failed('Update refused') as any,
      async () => failed('Unlock refused', {
        method: 'POST', url: '/u', headers: { authorization: SECRET },
      }) as any,
    );
    expect((result.getError() as any).cleanup.request).toEqual({ method: 'POST', url: '/u' });
    expect(JSON.stringify(result.getError())).not.toContain(SECRET);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/withLock.test.ts
```

Expected: FAIL — cannot find module `withLock`.

- [x] **Step 3: Implement**

```typescript
// src/lib/strategies/withLock.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { type Cleanup, safeRequest } from './safeFields';

export interface CleanupCarrier {
  cleanup?: Cleanup;
  operation?: 'succeeded';
}

const failure = <T>(error: IAdtError & CleanupCarrier): IAdtResponse<T, IAdtError> =>
  ({
    ok: false,
    getResult: () => { throw new Error('withLock: asked for the result of a failure'); },
    getError: () => error,
  }) as unknown as IAdtResponse<T, IAdtError>;

/** The release, in its three states. Refused and threw are not the same event. */
type Released =
  | { kind: 'ok' }
  | { kind: 'refused'; error: IAdtError; carrier: Cleanup }
  | { kind: 'threw'; thrown: unknown; carrier: Cleanup };

async function runRelease<H>(
  release: (handle: H) => Promise<IAdtResponse<unknown, IAdtError>>,
  handle: H,
): Promise<Released> {
  let answered: IAdtResponse<unknown, IAdtError>;
  try {
    answered = await release(handle);
  } catch (error) {
    // No origin. `connection` and `refusal` are both claims about the server,
    // and neither is true of an argument-validation defect in this process.
    return {
      kind: 'threw',
      thrown: error,
      carrier: { error: 'client_threw', message: error instanceof Error ? error.message : String(error) },
    };
  }
  if (answered.ok) return { kind: 'ok' };
  const error = answered.getError();
  return {
    kind: 'refused',
    error,
    // Narrowed here as well as at the boundary: this carrier rides inside a
    // thrown error, where it can be logged or rethrown long before `answer()`
    // renders it.
    carrier: { message: error.message, origin: error.origin, request: safeRequest(error.request) },
  };
}

/**
 * Calls around a held resource.
 *
 * NOT a `sequence`. A sequence stops at the first failure, so a refused update
 * in a lock-update-unlock chain would skip the unlock and leave the object
 * locked in SAP. `release` runs after every successful `acquire` — after a
 * refusal from `body` and after a throw from it.
 *
 * Only for a handler that owns the lock's whole lifetime. The fifteen
 * `low`-tier `LockX` tools hand the handle back on purpose; releasing before
 * returning would destroy them, and they are never wrapped in this.
 */
export async function withLock<H, T>(
  acquire: () => Promise<IAdtResponse<H, IAdtError>>,
  body: (handle: H) => Promise<IAdtResponse<T, IAdtError>>,
  release: (handle: H) => Promise<IAdtResponse<unknown, IAdtError>>,
): Promise<IAdtResponse<T, IAdtError>> {
  const acquired = await acquire();
  if (!acquired.ok) return acquired as unknown as IAdtResponse<T, IAdtError>;
  const handle = acquired.getResult().value;

  // Deliberately a catch rather than a `finally`. A `finally` lets the original
  // exception out as soon as the block ends, so a release that ALSO failed has
  // nowhere to go: the caller would hear about a parser defect and never about
  // the lock still held.
  let answered: IAdtResponse<T, IAdtError> | undefined;
  let thrown: unknown;
  let threw = false;
  try {
    answered = await body(handle);
  } catch (error) {
    thrown = error;
    threw = true;
  }

  const released = await runRelease(release, handle);

  if (threw) {
    if (released.kind === 'ok') throw thrown;
    throw new LockNotReleased(thrown, { cleanup: released.carrier });
  }

  const value = answered as IAdtResponse<T, IAdtError>;
  if (!value.ok) {
    if (released.kind === 'ok') return value;
    return failure<T>({ ...value.getError(), cleanup: released.carrier });
  }

  // The body succeeded, so the release's own outcome becomes the answer — in
  // its own channel. A refusal is a failure; a throw stays a throw.
  if (released.kind === 'ok') return value;
  if (released.kind === 'refused') {
    return failure<T>({ ...released.carrier, operation: 'succeeded' } as IAdtError & CleanupCarrier);
  }
  throw new LockNotReleased(released.thrown, { operation: 'succeeded' });
}

/**
 * A throw that left a lock behind, or a release that threw after the work was
 * already done.
 *
 * Keeps the relevant cause as `cause` and borrows its message, so nothing about
 * the primary defect is reworded. Wrapping rather than attaching a property to
 * the thrown value, because a thrown value need not be an object and need not
 * be extensible.
 */
export class LockNotReleased extends Error {
  readonly cleanup?: Cleanup;
  readonly operation?: 'succeeded';
  constructor(cause: unknown, extra: { cleanup?: Cleanup; operation?: 'succeeded' }) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'LockNotReleased';
    this.cleanup = extra.cleanup;
    this.operation = extra.operation;
  }
}
```

- [x] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/withLock.test.ts src/__tests__/unit/answerFailure.test.ts
```

Expected: PASS, all ten plus Task 3's.

- [x] **Step 5: Commit**

```bash
git add src/lib/strategies/withLock.ts src/__tests__/unit/withLock.test.ts
git commit --no-verify -m "feat(strategies): withLock — the release runs on every path out"
```

---

## Task 6: The slot table — one reading per result-set slot

adt-clients 19 exports 31 shipped result sets holding 308 slots, and those 308 carry only 39 distinct names: `metadata` in 30 sets, `created` in 29, `source` in 29, `deletionCheck` in 29, and so on. Which reading a slot wants follows from the slot name, not the object type — a domain's `metadata` and a table's `metadata` are the same question.

**Files:**
- Create: `src/lib/strategies/resultSets.ts`, `src/__tests__/unit/resultSets.test.ts`

**Interfaces:**
- Consumes: `verbatim`, `structured`, `statusOnly` from `reading.ts`; `nodeLevel` from `packageWalk.ts`.
- Produces: `READING_BY_SLOT`, `resultsFor<R>(shipped: R, keep?: ReadonlyArray<keyof R>): R`, `ourUtils`, `ourUnitTest`

**The slot-name premise has two named exceptions, found in review (round 1 of 5).** Which
reading a slot wants is a property of the slot's name for roughly 300 of the 308 slots, and
fails in two ways: where one object type answers a body another does not (`created` — a DDIC
create answers a document, a class create answers zero bytes), and where a shipped reading looks
at something none of `verbatim`, `structured` or `statusOnly` can see (`utilDocuments.activation`
and `unitTestDocuments.run` both read the `Location` header, not the body). The first is fixed by
moving `created` to `verbatim`. The second is fixed by giving `resultsFor` a keep-list: slots
named there are left exactly as the shipped set had them, at the call site, rather than folded
into the table. Do not reintroduce `created: statusOnly`, and do not fold `activation` or `run`
back into the table for the sets where they read headers — see the exceptions documented on
`READING_BY_SLOT` in `resultSets.ts` for the full evidence.

**The second exception is exported, not left to memory (round 2 of 5).** `unitTestDocuments.run`
was, for one review round, kept only at a test call site — nothing in `src` outside
`__tests__` named it, so a later task calling `getUnitTest(resultsFor(unitTestDocuments))` the
way Task 9 calls `getClass(resultsFor(classDocuments))` would silently reintroduce the bug on
modern (non-legacy) systems. `ourUnitTest = resultsFor(unitTestDocuments, ['run'])` is exported
beside `ourUtils` for exactly this reason: a later task imports it instead of re-deriving the
exception.

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/resultSets.test.ts
import {
  classDocuments, domainDocuments, packageDocuments, tableDocuments, utilDocuments,
} from '@mcp-abap-adt/adt-clients';
import { corpusBody } from '../../lib/adtCorpus';
import { READING_BY_SLOT, ourUtils, resultsFor } from '../../lib/strategies/resultSets';

describe('the slot table', () => {
  it('knows a reading for every slot every shipped set declares', () => {
    const m = require('@mcp-abap-adt/adt-clients');
    const unknown: string[] = [];
    for (const key of Object.keys(m).filter((k) => /Documents$/.test(k))) {
      for (const slot of Object.keys(m[key])) {
        if (READING_BY_SLOT[slot] === undefined) unknown.push(`${key}.${slot}`);
      }
    }
    // A slot adt-clients adds arrives here, not as an unshaped answer at a call site.
    expect(unknown).toEqual([]);
  });

  it('keeps the keys of the set it stamps', () => {
    expect(Object.keys(resultsFor(domainDocuments)).sort()).toEqual(Object.keys(domainDocuments).sort());
  });

  it('hands a metadata document through, character for character', () => {
    const document = corpusBody('read-table-metadata-structure--01-tables-zmcpshrrtabl');
    const reading: any = resultsFor(tableDocuments).metadata({ data: document, status: 200 } as any);
    expect(reading.raw).toBe(document);
  });

  it('parses a check document into named structure, keeping the document beside it', () => {
    const document = corpusBody('check-success-verdict--01-checkrun');
    const reading: any = resultsFor(classDocuments).check({ data: document, status: 200 } as any);
    expect(reading.value['chkrun:checkRunReports']).toBeDefined();
    expect(reading.raw).toBe(document);
  });

  it('reads a write as its status, and still carries the document', () => {
    // `created` moved to `verbatim` in review round 1 — `updated` is the slot
    // that is still genuinely `statusOnly`, and the corpus backs it: every
    // write fixture is a zero-byte 200.
    const reading: any = resultsFor(classDocuments).updated({ data: '', status: 200 } as any);
    expect(reading.value).toBeUndefined();
    expect(reading.status).toBe(200);
    expect(reading.raw).toBe('');
  });

  it('gives the walk our own node reading, not the shipped one', () => {
    expect(ourUtils.node).not.toBe(utilDocuments.node);
  });

  it('refuses a set with a slot it does not know', () => {
    expect(() => resultsFor({ ...packageDocuments, invented: (() => {}) as any })).toThrow(/invented/);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/resultSets.test.ts
```

Expected: FAIL — cannot find module `resultSets`.

- [x] **Step 3: Implement**

```typescript
// src/lib/strategies/resultSets.ts
import { unitTestDocuments, utilDocuments } from '@mcp-abap-adt/adt-clients';
import type { IResultStrategy } from '@mcp-abap-adt/interfaces';
import { nodeLevel } from './packageWalk';
import { statusOnly, structured, verbatim } from './reading';

/**
 * Which reading a result-set slot wants — keyed on the slot, because that is
 * what it depends on. 31 sets, 308 slots, 39 distinct names.
 *
 *  - **the document is the answer** → `verbatim`. Source, metadata, a transport
 *    document. The tools carry metadata as a string inside their JSON and have
 *    never parsed it.
 *  - **named fields are promised** → `structured`. A check's messages, an
 *    activation's verdict, a deletion's `isDeleted`, a validation's verdict.
 *  - **there is no body** → `statusOnly`. A successful write answers 200 with
 *    zero bytes. It still carries `raw` and `status`, so `detail: 'raw'` is
 *    answerable and `terseWrite` has a status to read. (`created` is
 *    `verbatim`, not this — see the exceptions paragraph above.)
 */
export const READING_BY_SLOT: Record<string, IResultStrategy<unknown>> = {
  source: verbatim, sourceDocument: verbatim, metadata: verbatim,
  transport: verbatim, include: verbatim, read: verbatim, created: verbatim,

  updated: statusOnly, metadataUpdated: statusOnly, written: statusOnly,

  check: structured, cdsCheck: structured, activation: structured, validation: structured,
  deletion: structured, deleted: structured, deletionCheck: structured,
  classification: structured, generation: structured, publication: structured,
  odata: structured, bindingTypes: structured, list: structured, search: structured,
  whereUsed: structured, whereUsedScope: structured, folders: structured, types: structured,
  node: structured, objectStructure: structured, inactive: structured, results: structured,
  result: structured, run: structured, status: structured, query: structured,
  columns: structured, contents: structured, discovery: structured,
};

/**
 * Stamp the table over a shipped result set, keeping that set's own keys.
 * `keep` names slots to leave exactly as the shipped set has them — for the
 * rare slot whose shipped reading needs a header, not the body.
 */
export function resultsFor<R extends Record<string, unknown>>(
  shipped: R,
  keep: ReadonlyArray<keyof R> = [],
): R {
  const kept = new Set<keyof R>(keep);
  const out: Record<string, unknown> = {};
  for (const slot of Object.keys(shipped)) {
    if (kept.has(slot as keyof R)) {
      out[slot] = shipped[slot];
      continue;
    }
    const reading = READING_BY_SLOT[slot];
    if (reading === undefined) {
      throw new Error(`resultsFor: no reading declared for the slot "${slot}"`);
    }
    out[slot] = reading;
  }
  return out as R;
}

/**
 * The util set, with our own node reading — `nodeLevel` keeps the descriptions
 * the shipped `nodeContents` drops, and a tree without them is a tree a caller
 * has to walk again. `activation` is kept as shipped: it reads the `Location`
 * header a started activation run answers with, which `structured` cannot see.
 */
export const ourUtils = {
  ...resultsFor(utilDocuments, ['activation']),
  node: nodeLevel,
};

/**
 * The unit-test set, kept as shipped. `run` is kept as shipped because
 * `runId` reads the `Location` header a started run answers with, which is
 * not a question any of `verbatim`, `structured` or `statusOnly` can see —
 * the same reason `ourUtils` keeps `activation`. A later task imports this
 * instead of re-deriving the exception.
 */
export const ourUnitTest = resultsFor(unitTestDocuments, ['run']);
```

- [x] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/resultSets.test.ts
```

Expected: PASS. If the first test fails it names the slot — add it with the reading its tool promises. Do not widen the test.

- [x] **Step 5: Commit**

```bash
git add src/lib/strategies/resultSets.ts src/__tests__/unit/resultSets.test.ts
git commit --no-verify -m "feat(strategies): one reading per slot, stamped over the shipped sets"
```

---

## Task 7: `detail`, declared once and read in one place

**Files:**
- Create: `src/lib/strategies/detail.ts`, `src/__tests__/unit/detail.test.ts`

**Interfaces:**
- Produces: `DETAIL_PROPERTY` (the schema fragment), `detailOf(args): AnswerDetail`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/detail.test.ts
import { DETAIL_PROPERTY, detailOf } from '../../lib/strategies/detail';

describe('detailOf', () => {
  it('defaults to terse', () => {
    expect(detailOf({})).toBe('terse');
    expect(detailOf(undefined)).toBe('terse');
  });

  it('takes the three levels the schema declares', () => {
    expect(detailOf({ detail: 'full' })).toBe('full');
    expect(detailOf({ detail: 'raw' })).toBe('raw');
    expect(detailOf({ detail: 'terse' })).toBe('terse');
  });

  it('falls back to terse on anything else rather than throwing', () => {
    expect(detailOf({ detail: 'verbose' })).toBe('terse');
    expect(detailOf({ detail: 7 })).toBe('terse');
  });

  it('declares exactly the three levels it accepts', () => {
    expect(DETAIL_PROPERTY.detail.enum).toEqual(['terse', 'full', 'raw']);
    expect(DETAIL_PROPERTY.detail.default).toBe('terse');
  });
});
```

- [x] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/detail.test.ts`

- [x] **Step 3: Implement**

```typescript
// src/lib/strategies/detail.ts
import type { AnswerDetail } from './projections';
export type { AnswerDetail };

/**
 * The `detail` parameter, for tools whose answer is JSON.
 *
 * Not for the rest: where a tool promised the document — source, metadata —
 * terse, full and raw are the same bytes, and a parameter that cannot change
 * the answer is noise on a surface callers read to decide what to call. It
 * shapes the SUCCESS answer only; a failure carries everything at every level.
 */
export const DETAIL_PROPERTY = {
  detail: {
    type: 'string',
    enum: ['terse', 'full', 'raw'],
    default: 'terse',
    description:
      'How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).',
  },
} as const;

const LEVELS = new Set<AnswerDetail>(['terse', 'full', 'raw']);

/** Read it out of `args`, defaulting to terse. An unknown value is terse too. */
export function detailOf(args: unknown): AnswerDetail {
  const value = (args as { detail?: unknown } | undefined)?.detail;
  return typeof value === 'string' && LEVELS.has(value as AnswerDetail)
    ? (value as AnswerDetail)
    : 'terse';
}
```

- [x] **Step 4: Run the tests** — `npx jest src/__tests__/unit/detail.test.ts`. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/strategies/detail.ts src/__tests__/unit/detail.test.ts
git commit --no-verify -m "feat(strategies): detail, declared once and read in one place"
```

---

## Task 8: The test helpers, written once

Every handler test from here needs the same four things: a success, a refusal, a
fake client that answers them, and a way to see which `analyse` a handler passed.
Written once so no task invents its own and no task refers to a helper that
exists only in prose.

**Files:**
- Create: `src/__tests__/helpers/fakeClient.ts`

**Interfaces:**
- Produces: `okResponse`, `refusedResponse`, `fakeClientOf`, `refusingClient`, `recordAnalyse`

- [x] **Step 1: Write it**

```typescript
// src/__tests__/helpers/fakeClient.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';

/** A success carrying whatever a result strategy would have produced. */
export function okResponse<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => { throw new Error('asked for the error of a success'); },
  } as unknown as IAdtResponse<T, IAdtError>;
}

/** A refusal shaped the way a strategy from the package builds one. */
export function refusedResponse(
  message: string,
  extra: Partial<IAdtError> = {},
): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => { throw new Error('asked for the result of a failure'); },
    getError: () => ({ message, origin: 'refusal', ...extra }),
  } as unknown as IAdtResponse<never, IAdtError>;
}

/** A reading, as `resultsFor` would have built it. */
export const reading = <T>(value: T, raw = String(value ?? ''), status = 200) => ({ value, raw, status });

type Members = Record<string, (...args: unknown[]) => unknown>;

/**
 * A client whose every factory answers the same member table.
 *
 * Handlers reach members through `client.getX(results)`, and a test does not
 * care which X. Anything not named answers a success with `undefined`, so a
 * test says only what it is about.
 */
export function fakeClientOf(members: Members) {
  const object = new Proxy(members, {
    get: (target, name: string) =>
      target[name] ?? (async () => okResponse(undefined)),
  });
  return new Proxy({} as Record<string, unknown>, {
    get: () => () => object,
  });
}

/** A client that refuses whatever it is asked. */
export function refusingClient(message: string, extra: Partial<IAdtError> = {}) {
  return new Proxy({} as Record<string, unknown>, {
    get: () => () => new Proxy({} as Members, {
      get: () => async () => refusedResponse(message, extra),
    }),
  });
}

/**
 * Which `analyse` the handler passed, and how often a member was called.
 *
 * What goes wrong at the scale of a hundred handlers is a handler taking the
 * wrong strategy, and that is visible from the call rather than from the answer.
 */
export function recordAnalyse() {
  const calls: Array<{ member: string; analyse: unknown; args: unknown[] }> = [];
  const client = new Proxy({} as Record<string, unknown>, {
    get: () => () => new Proxy({} as Members, {
      get: (_t, member: string) => async (...args: unknown[]) => {
        const options = args.at(-1) as { analyse?: unknown } | undefined;
        calls.push({ member, analyse: options?.analyse, args });
        return okResponse(reading(undefined, '', 200));
      },
    }),
  });
  return {
    client,
    calls,
    get last() { return calls.at(-1)?.analyse; },
    countOf: (member: string) => calls.filter((c) => c.member === member).length,
  };
}
```

- [x] **Step 2: Prove the recorder records**

```typescript
// src/__tests__/unit/fakeClient.test.ts
it('reports the analyse the caller passed, and counts the calls', async () => {
  const seen = recordAnalyse();
  const marker = () => null;
  await (seen.client as any).getDomain().delete({ domainName: 'ZD' }, { analyse: marker });
  expect(seen.last).toBe(marker);
  expect(seen.countOf('delete')).toBe(1);
});

it('reports undefined when the caller passed none', async () => {
  const seen = recordAnalyse();
  await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
  expect(seen.last).toBeUndefined();
});
```

- [x] **Step 3: Run it** — `npx jest src/__tests__/unit/fakeClient.test.ts`. Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/__tests__/helpers/fakeClient.ts src/__tests__/unit/fakeClient.test.ts
git commit --no-verify -m "test(helpers): one fake client, so no task invents its own"
```

Every later task imports from here. A test needing something this module does
not have adds it here rather than locally, and says in a comment what it is for.

---

## Task 9: The reference read — `handleReadClass`

The template for every read that calls `read` and `readMetadata`. It is also a bug fix: today the handler answers `success: true` with `source_code: null` when the read fails, which is the read-path masking defect.

**Files:**
- Modify: `src/handlers/class/readonly/handleReadClass.ts`
- Create: `src/__tests__/unit/handleReadClass.test.ts`

**Interfaces:**
- Consumes: `answer`, `pair`, `resultsFor`, `analyseException`, `AdtReading`.
- Produces: the shape Task 11 applies sixteen times.

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/handleReadClass.test.ts
import { corpusBody } from '../../lib/adtCorpus';
import { handleReadClass } from '../../handlers/class/readonly/handleReadClass';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };
const ok = (value: unknown) => ({
  ok: true as const, getResult: () => ({ value }),
  getError: () => { throw new Error('not a failure'); },
});
const refused = (message: string) => ({
  ok: false as const,
  getResult: () => { throw new Error('not a success'); },
  getError: () => ({ message, origin: 'refusal' }),
});

describe('handleReadClass', () => {
  it('answers the source and the metadata on success', async () => {
    const source = corpusBody('read-class-source-text--01-read-source');
    const metadata = corpusBody('read-metadata-class--01-classes-zbpmcpshriroot');
    fakeClient = {
      getClass: () => ({
        read: async () => ok({ value: source, raw: source, status: 200 }),
        readMetadata: async () => ok({ value: metadata, raw: metadata, status: 200 }),
      }),
    };

    const result: any = await handleReadClass(context as any, { class_name: 'zcl_x' });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.class_name).toBe('ZCL_X');
    expect(payload.source_code).toBe(source);
    expect(payload.metadata).toBe(metadata);
  });

  it('reports a refused read as an error, not as success with a null body', async () => {
    fakeClient = {
      getClass: () => ({
        read: async () => refused('Resource not found'),
        readMetadata: async () => { throw new Error('must not be reached'); },
      }),
    };

    const result: any = await handleReadClass(context as any, { class_name: 'zcl_missing' });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toBe('Resource not found');
    expect(payload.origin).toBe('refusal');
    expect(result.content[0].text).not.toContain('"success": true');
  });
});
```

Corpus exchange names are `<case>--<NN>-<endpoint>`; `ls tests/fixtures/adt/ | sed 's/\.body\..*//' | sort -u` is the index. Never invent a document: if the case you want is absent, say so in the test name.

- [x] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/handleReadClass.test.ts
```

Expected: FAIL — the handler reads `readResult.readResult.data`, so `source_code` is `null` and both assertions fail.

- [x] **Step 3: Implement**

```typescript
// src/handlers/class/readonly/handleReadClass.ts — the body; TOOL_DEFINITION unchanged
import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export async function handleReadClass(
  context: HandlerContext,
  args: { class_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));

  const className = class_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getClass(resultsFor(classDocuments));

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadClass', detail: 'terse' },
    () =>
      pair(
        () => obj.read({ className }, version, { analyse: analyseException }),
        () => obj.readMetadata({ className }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      class_name: className,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
```

Two things that repeat in every later task. There is no `if (result?.readResult?.data)` — the presence of a body is not the handler's verdict. And `source.raw`, not `source.value` — the tool promised the document, so the document is what it answers.

- [x] **Step 4: Run the tests and measure**

```bash
npx jest src/__tests__/unit/handleReadClass.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

- [x] **Step 5: Commit**, putting the measured count in the message

```bash
git add src/handlers/class/readonly/handleReadClass.ts src/__tests__/unit/handleReadClass.test.ts
git commit --no-verify -m "refactor(class): ReadClass answers through the adapter, and stops masking a refused read

tsc: <before> → <after>"
```

---

## Task 10: The reference write family — `domain/low`

**A live type error waits here.** `promised.ts` exports
`writeProjection: Terse<unknown>`, and `sequence.ts`'s own doc comment shows it
being passed to `answer()`. It cannot be: `Terse<T>` is
`(value, status) => unknown` and `answer()` takes `(value) => unknown`, and
TypeScript lets a function drop a parameter, never gain a required one.
`npx tsc -p tsconfig.test.json` reports it today at
`src/__tests__/unit/sequence.test.ts`. Fix it here, where the first write is
migrated: either type `writeProjection` as the one-parameter shape, or drop it
and use `project(detail, terseWrite)`, which is what this task's table already
prescribes. Update the comment in `sequence.ts` with it.


The template for every `low`-tier family. Seven handlers, covering create, check, activate, validate, delete, lock and unlock, so the per-operation pairing is established in code before it is applied a hundred times.

**Two rows of the table below are not in this family, and that is not an oversight.** `handleUpdateDomain` was migrated already (commit `abd7b19`) as the worked example of a read-modify-write, and Task 22 revisits it to put its lock under `withLock`. And `domain/low` has no standalone deletion-check tool — `checkDeletion` is a member, not a tool, and the families that do expose one pick it up in Tasks 14–17.

**Files:**
- Modify: `src/handlers/domain/low/handleCreateDomain.ts`, `handleCheckDomain.ts`, `handleActivateDomain.ts`, `handleValidateDomain.ts`, `handleDeleteDomain.ts`, `handleLockDomain.ts`, `handleUnlockDomain.ts`
- Create: `src/__tests__/unit/domainLow.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 6, 7; `analyseException`, `analyseCheck`, `analyseActivation`, `analyseValidation`, `analyseDeletion`; `project`, `terseWrite`, `terseCheck`, `terseActivation`, `terseValidation`, `terseDeletion`.
- Produces: the table below, applied unchanged in Tasks 13–16.

| operation | member | `analyse` | slot reading | projection |
|---|---|---|---|---|
| Create | `create` | `analyseException` | `statusOnly` | `terseWrite` |
| Update | `update` / `updateMetadata` | `analyseException` | `statusOnly` | `terseWrite` |
| Lock | `lock` | — none accepted | — | the handle, as the tool already returns it |
| Unlock | `unlock` | — none accepted | — | `terseWrite` |
| Check | `check` | `analyseCheck` | `structured` | `terseCheck` |
| Activate | `activate` | `analyseActivation` | `structured` | `terseActivation` |
| Validate | `validate` | `analyseValidation` | `structured` | `terseValidation` |
| Delete | `delete` | `analyseDeletion` | `structured` | `terseDeletion` |

`lock` and `unlock` accept no strategy on any class in 19. Do not add an argument the signature does not have.

- [x] **Step 1: Write the failing test, from the corpus**

```typescript
// src/__tests__/unit/domainLow.test.ts
import { analyseActivation, analyseDeletion, analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { corpusBody } from '../../lib/adtCorpus';

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.last` needs this wiring.
const seen = recordAnalyse();
let fakeClient: unknown = seen.client;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

it('ValidateDomain reports an inadmissible name as an error', async () => {
  const document = corpusBody('refusal-validation-name-taken-domain--01-domains-validation');
  fakeClient = fakeClientOf({
    validate: async (_c: unknown, o: any) =>
      refusedResponse((o.analyse('adt:no-failure', { data: document, status: 200 }) as any).message),
  });
  const result: any = await handleValidateDomain(context as any, {
    domain_name: 'ZD_TAKEN', package_name: 'ZP', description: 'x',
  });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
});

it('ActivateDomain takes analyseActivation, and DeleteDomain analyseDeletion', async () => {
  fakeClient = seen.client;
  await handleActivateDomain(context as any, { domain_name: 'ZD' });
  expect(seen.last).toBe(analyseActivation);
  await handleDeleteDomain(context as any, { domain_name: 'ZD', lock_handle: 'h' });
  expect(seen.last).toBe(analyseDeletion);
});

it('LockDomain passes no analyse, because lock() accepts none', async () => {
  fakeClient = seen.client;
  await handleLockDomain(context as any, { domain_name: 'ZD' });
  expect(seen.last).toBeUndefined();
});
```

- [x] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/domainLow.test.ts`. Expected: FAIL; no handler passes an `analyse` today.

- [x] **Step 3: Implement, one operation per edit**

```typescript
// the shape, filled in for handleDeleteDomain
const detail = detailOf(args);
return answer(
  { tool: 'DeleteDomainLow', detail },
  () =>
    createAdtClient(connection, logger)
      .getDomain(resultsFor(domainDocuments))
      .delete({ domainName }, { lockHandle: lock_handle, analyse: analyseDeletion }),
  project(detail, terseDeletion),
);
```

- [x] **Step 4: Write the omission check as a script, not only as a final test**

The spec makes "every call whose resolved signature accepts an `analyse` is given one" a repository-wide criterion. A test that lands after every handler has been migrated finds the first omission a hundred commits too late, so the logic goes into a script now and the test in Task 26 calls the same function over the whole tree.

```typescript
// src/lib/audit/analyseOmissions.ts
import { dirname, join } from 'node:path';
import ts from 'typescript';

export function analyseOmissions(handlers: string[]): { offenders: string[]; inspected: number } {
  const program = ts.createProgram(handlers, compilerOptions());
  const checker = program.getTypeChecker();
  const offenders: string[] = [];
  let inspected = 0;
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    for (const call of memberCallsIn(source)) {
      const signature = checker.getResolvedSignature(call);
      // A call the checker cannot resolve tells us nothing. This test is
      // meaningful only on a clean build, which is why it comes after Task 25.
      const options = signature?.parameters.at(-1);
      if (options === undefined) continue;
      const type = checker.getTypeOfSymbolAtLocation(options, call);
      if (!type.getProperties().some((p) => p.name === 'analyse')) continue;
      inspected += 1;
      // Neither the syntax alone nor the type alone answers this.
      //
      // Syntax alone reports a legitimate options variable as an omission.
      // The declared type alone is worse: `IAdtOperationOptions` declares
      // `analyse` OPTIONAL, so `const o: IAdtOperationOptions = {}` satisfies
      // `getProperty('analyse')` while passing no strategy at all. A type says
      // what may be there; only a value says what is.
      //
      // So follow the value to the nearest object literal — the argument
      // itself, or the initializer of the const it names — and look for the
      // property there. Anything further than that is not decidable from the
      // source, and this repository's convention is therefore: pass `analyse`
      // in the call, or in a `const` initialized with an object literal in the
      // same file. A strategy assembled at runtime is reported, with a message
      // saying to inline it rather than a message saying it is missing.
      const passed = call.arguments.at(-1);
      const verdict = carriesAnalyse(passed, checker);
      if (verdict !== 'yes') {
        offenders.push(
          `${file}:${lineOf(source, call)} — ${call.expression.getText()} — ${
            verdict === 'no' ? 'no analyse passed' : 'analyse not provable from the source; inline it'
          }`,
        );
      }
    }
  }
  // The caller guards against a run that measured nothing: a program built with
  // wrong options resolves no signature, finds no member that accepts an
  // `analyse`, and answers an empty offenders list. Roughly 275 call sites
  // across 174 handler files carry one, so a run that inspects a handful did
  // not resolve.
  return { offenders, inspected };
}

/**
 * The project's own compiler options.
 *
 * Not a JSON parse of tsconfig: the compiler API needs `extends` resolved,
 * paths made absolute against the config's directory, and the defaults filled
 * in. `parseJsonConfigFileContent` is what does all three, and a program built
 * with hand-rolled options resolves `@mcp-abap-adt/*` to nothing and reports
 * every signature as unresolved — which this test would then read as "no call
 * accepts an analyse" and pass while checking nothing.
 */
function compilerOptions(): ts.CompilerOptions {
  const root = join(__dirname, '../../..');
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (configPath === undefined) throw new Error('tsconfig.json not found');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath));
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  }
  // `noEmit`, because this program is only ever asked questions.
  return { ...parsed.options, noEmit: true };
}

/**
 * Does this argument actually carry a strategy?
 *
 *  'yes'       — something in it sets `analyse` to a value that cannot be
 *                `undefined`. The type decides that, not the spelling.
 *  'no'        — nothing sets it, or what sets it IS `undefined`.
 *  'unknown'   — it may be set and may be nothing: a spread this file cannot
 *                see into, a value typed `T | undefined`, an `any`. Not
 *                provable here, and reported as such rather than allowed.
 *
 * **Read right to left.** An object literal applies its properties in order and
 * the last writer wins, so `{ analyse: x, ...opts }` does not carry a strategy
 * if `opts` sets `analyse: undefined`, and `{ ...opts, analyse: x }` does carry
 * one whatever `opts` holds. A left-to-right scan answers both backwards.
 *
 * A spread that definitely has no `analyse` overrides nothing, so it does not
 * end the scan — spreading an object without the key leaves the key alone.
 */
function carriesAnalyse(
  argument: ts.Expression | undefined,
  checker: ts.TypeChecker,
): 'yes' | 'no' | 'unknown' {
  if (argument === undefined) return 'no';

  if (ts.isObjectLiteralExpression(argument)) {
    for (let i = argument.properties.length - 1; i >= 0; i -= 1) {
      const property = argument.properties[i];

      if (property.name?.getText() === 'analyse') {
        // The TYPE of the value, not its spelling. `analyse: undefined` is the
        // obvious case, but `const analyse = undefined; { analyse }`,
        // `analyse: maybeStrategy` typed `Strategy | undefined` and
        // `analyse: enabled ? strategy : undefined` all pass a key whose value
        // may be nothing, and the library reads that as no strategy passed.
        const value = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property)
            ? property.name
            : undefined;
        if (value === undefined) return 'unknown';
        return admitsUndefined(checker.getTypeAtLocation(value));
      }

      if (ts.isSpreadAssignment(property)) {
        const spread = carriesAnalyse(property.expression, checker);
        if (spread !== 'no') return spread;   // 'yes' wins here; 'unknown' may override
      }
    }
    return 'no';
  }

  if (ts.isIdentifier(argument)) {
    const symbol = checker.getSymbolAtLocation(argument);
    const declaration = symbol?.declarations?.[0];
    // A `const` binding is the only one whose initializer still describes the
    // value at the call. `let options = { analyse: x }; options = {}` has the
    // same initializer and passes nothing, so following a `let` would prove
    // the opposite of what it looks like.
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstBinding(declaration)
    ) {
      return carriesAnalyse(declaration.initializer, checker);
    }
    return 'unknown';
  }

  return 'unknown';
}

/**
 * Was this declared `const`?
 *
 * The flag lives on the declaration LIST, not on the declaration, so
 * `declaration.flags` answers nothing useful and `declaration.parent` is where
 * to ask.
 *
 * **What this still does not prove.** `const` fixes the binding, not the
 * object: `const o = { analyse: x }; o.analyse = undefined;` would pass. Nothing
 * short of tracking mutation catches that, and this check does not try. It is
 * why the convention is written as it is — pass the strategy in the call, or in
 * a `const` literal left alone — and why the invariant is a guard rather than a
 * proof.
 */
function isConstBinding(declaration: ts.VariableDeclaration): boolean {
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
}

/**
 * Can this value be nothing?
 *
 *  'no'       — it IS `undefined`. A key set to nothing is no strategy.
 *  'unknown'  — it MAY be: a union with `undefined`, or `any`/`unknown`, where
 *               the author may have a runtime guarantee this file cannot see.
 *               Reported as unprovable, with the message to make it provable.
 *  'yes'      — it cannot be.
 */
function admitsUndefined(type: ts.Type): 'yes' | 'no' | 'unknown' {
  const OPAQUE = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
  const NOTHING = ts.TypeFlags.Undefined | ts.TypeFlags.Void;

  if ((type.flags & OPAQUE) !== 0) return 'unknown';
  if (!type.isUnion()) return (type.flags & NOTHING) !== 0 ? 'no' : 'yes';

  const parts = type.types;
  if (parts.every((t) => (t.flags & NOTHING) !== 0)) return 'no';
  if (parts.some((t) => (t.flags & (NOTHING | OPAQUE)) !== 0)) return 'unknown';
  return 'yes';
}

/** Every `x.y(...)` in a file — the shape a client member call takes. */
function memberCallsIn(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** 1-indexed, so the message matches what an editor shows. */
function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}
```

Everything above is one module. The test in Task 26 imports `analyseOmissions`
from it and declares none of this itself; `scripts/check-analyse.ts` imports the
same name. Two callers, one implementation, and the only exported symbol is the
entry point — `compilerOptions`, `memberCallsIn`, `lineOf`, `carriesAnalyse`,
`admitsUndefined` and `isConstBinding` stay private to the module.

And the script over it:

```typescript
// scripts/check-analyse.ts — `npx tsx scripts/check-analyse.ts 'src/handlers/domain/low/**'`
import { globSync } from 'node:fs';
import { analyseOmissions } from '../src/lib/audit/analyseOmissions';

const pattern = process.argv[2] ?? 'src/handlers/**/handle*.ts';
const files = globSync(pattern);
const { offenders, inspected } = analyseOmissions(files);

for (const line of offenders) console.error(line);
console.log(
  `${files.length} files, ${inspected} calls accept an analyse, ${offenders.length} were given none`,
);

// Zero inspected is a FAILURE, not a pass.
//
// This runs from Task 10 onward, while the tree still has hundreds of compiler
// errors, so "the checker resolved nothing" is a live possibility and not a
// theoretical one. A mistyped glob does the same. Both produce zero offenders,
// and a script that exits 0 on them reports a clean family it never looked at —
// which is the shape of every masking defect this migration exists to remove.
if (files.length === 0) {
  console.error(`no files matched ${pattern}`);
  process.exit(2);
}
if (inspected === 0) {
  console.error(
    `${files.length} files matched but no call accepted an analyse — either the family genuinely has none, or the program resolved nothing. Check one signature by hand before believing this.`,
  );
  process.exit(2);
}
process.exit(offenders.length === 0 ? 0 : 1);
```

Task 26's third invariant calls the same `analyseOmissions`, over the whole
tree instead of one family, and its twelve fixtures are what hold each verdict
this module can reach.

**Why the guard is "not zero" rather than a per-family minimum.** A number per
family would have to be maintained by whoever adds a handler, and a maintained
number drifts until someone lowers it to make a run pass. Zero is the only
threshold that needs no upkeep and still catches the failure that matters: a run
that inspected nothing. The printed count is there for the human — a family of
eight handlers reporting two inspected calls is worth stopping over, and no
assertion will tell you that.

- [x] **Step 5: Run the tests, the check and the compiler**

```bash
npx jest src/__tests__/unit/domainLow.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsx scripts/check-analyse.ts 'src/handlers/domain/low/**'   # 0 offenders AND a non-zero count
npx tsc --noEmit 2>&1 | grep "handlers/domain/low" | wc -l      # expect 0
```

- [x] **Step 6: Commit**

```bash
git add src/handlers/domain/low src/__tests__/unit/domainLow.test.ts scripts/check-analyse.ts src/lib/audit/analyseOmissions.ts
git commit --no-verify -m "refactor(domain): the low tier, on strategies — the reference family

tsc: <before> → <after>"
```

---

## Task 11: The sixteen `readonly` reads that call both members

Same shape as Task 9. Measured, not assumed — this is the list of handlers calling `read` and `readMetadata` both, minus `handleReadClass` (Task 9) and `handleGetFunctionModule` (Task 18, a `high` tool):

```bash
grep -lE '\.read\(' $(find src/handlers -name 'handle*.ts') | xargs grep -lE '\.readMetadata\(' | sort
```

**Files (modify, most compiler errors first):**

| file | factory | shipped set | config key |
|---|---|---|---|
| `table/readonly/handleReadTable.ts` | `getTable` | `tableDocuments` | `tableName` |
| `structure/readonly/handleReadStructure.ts` | `getStructure` | `structureDocuments` | `structureName` |
| `service_definition/readonly/handleReadServiceDefinition.ts` | `getServiceDefinition` | `serviceDefinitionDocuments` | `serviceDefinitionName` |
| `service_binding/readonly/handleReadServiceBinding.ts` | `getServiceBinding` | `serviceDocuments` | `serviceBindingName` |
| `program/readonly/handleReadProgram.ts` | `getProgram` | `programDocuments` | `programName` |
| `metadata_extension/readonly/handleReadMetadataExtension.ts` | `getMetadataExtension` | `metadataExtensionDocuments` | `metadataExtensionName` |
| `interface/readonly/handleReadInterface.ts` | `getInterface` | `interfaceDocuments` | `interfaceName` |
| `function_module/readonly/handleReadFunctionModule.ts` | `getFunctionModule` | `functionModuleDocuments` | `functionModuleName` |
| `function_include/readonly/handleReadFunctionInclude.ts` | `getFunctionInclude` | `functionIncludeDocuments` | `includeName` |
| `ddl/readonly/handleReadDdl.ts` | `getDdl` | `ddlDocuments` | `ddlName` |
| `behavior_implementation/readonly/handleReadBehaviorImplementation.ts` | `getBehaviorImplementation` | `classDocuments` | `className` |
| `behavior_definition/readonly/handleReadBehaviorDefinition.ts` | `getBehaviorDefinition` | `behaviorDefinitionDocuments` | `behaviorDefinitionName` |
| `domain/readonly/handleReadDomain.ts` | `getDomain` | `domainDocuments` | `domainName` |
| `data_element/readonly/handleReadDataElement.ts` | `getDataElement` | `dataElementDocuments` | `dataElementName` |
| `package/readonly/handleReadPackage.ts` | `getPackage` | `packageDocuments` | `packageName` |
| `function_group/readonly/handleReadFunctionGroup.ts` | `getFunctionGroup` | `functionGroupDocuments` | `functionGroupName` |

Confirm each config key against the family's `I*Config` before editing; the table above is a starting point, not an authority.

- [x] **Step 1: Extend the existing surface-error test with one row per file**

`src/__tests__/unit/readHandlersSurfaceErrors.test.ts` already asserts that a read handler surfaces an error. Add sixteen rows, each with that handler's own argument name:

```typescript
it.each([
  ['ReadTable', handleReadTable, { table_name: 'ZT' }],
  ['ReadStructure', handleReadStructure, { structure_name: 'ZS' }],
  ['ReadServiceDefinition', handleReadServiceDefinition, { service_definition_name: 'ZSD' }],
  ['ReadServiceBinding', handleReadServiceBinding, { service_binding_name: 'ZSB' }],
  ['ReadProgram', handleReadProgram, { program_name: 'ZP' }],
  ['ReadMetadataExtension', handleReadMetadataExtension, { metadata_extension_name: 'ZME' }],
  ['ReadInterface', handleReadInterface, { interface_name: 'ZIF' }],
  ['ReadFunctionModule', handleReadFunctionModule, { function_module_name: 'ZFM', function_group_name: 'ZFG' }],
  ['ReadFunctionInclude', handleReadFunctionInclude, { include_name: 'ZINC', function_group_name: 'ZFG' }],
  ['ReadDdl', handleReadDdl, { ddl_name: 'ZDDL' }],
  ['ReadBehaviorImplementation', handleReadBehaviorImplementation, { behavior_implementation_name: 'ZBI' }],
  ['ReadBehaviorDefinition', handleReadBehaviorDefinition, { behavior_definition_name: 'ZBD' }],
  ['ReadDomain', handleReadDomain, { domain_name: 'ZD' }],
  ['ReadDataElement', handleReadDataElement, { data_element_name: 'ZDE' }],
  ['ReadPackage', handleReadPackage, { package_name: 'ZPKG' }],
  ['ReadFunctionGroup', handleReadFunctionGroup, { function_group_name: 'ZFG' }],
])('%s reports a refusal as an error', async (_name, handler, args) => {
  fakeClient = refusingClient('Resource not found');
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Resource not found');
});
```

- [x] **Step 2: Run it to verify it fails** — every row fails; each handler answers `isError: false` today.

- [x] **Step 3: Migrate, one file per edit**, applying Task 9's shape and changing four things: the factory, the shipped set, the config key, and the answer's field names, which stay exactly as that tool already returns them. Run the surface test after each file, not at the end.

- [x] **Step 4: Run the tests and measure**

```bash
npx jest src/__tests__/unit/readHandlersSurfaceErrors.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

- [x] **Step 5: Commit**

```bash
git add src/handlers/*/readonly/handleRead*.ts src/__tests__/unit/readHandlersSurfaceErrors.test.ts
git commit --no-verify -m "refactor(readonly): the sixteen two-call reads answer through the adapter

tsc: <before> → <after>"
```

---

## Task 12: The single-call reads, searches and listings

Fifteen `readonly` files that make one call: `handleReadMessageClass`, `handleReadMessageClassMessage`, `handleGetObjectsByType`, `handleGetObjectsList`, `handleSearchObject`, `handleGetAllTypes`, `handleGetInactiveObjects`, `handleGetObjectInfo`, `handleGetObjectStructure`, `handleGetSqlQuery`, `handleGetTableContents`, `handleListTransports`, `handleGetEnhancements`, `handleGetObjectVersionDiff`, `resolveVersionedObject`.

**Files:**
- Modify: the fifteen named above, under `src/handlers/*/readonly/` and `src/handlers/common/readonly/`
- Create: `src/__tests__/unit/readonlySingleCall.test.ts`

Confirm the list before starting: a file that turns out to call `readMetadata` as well belongs to Task 11's shape.

**Interfaces:**
- Consumes: `answer`, `resultsFor`, `ourUtils`, `project`, `detailOf`.
- Note: `search` accepts an `analyse` and gets one. The other utils-backed members here — `getObjectStructure`, `getAllTypes`, `getInactiveObjects`, `getSqlQuery`, `getTableContents` — accept none. Do not add an argument the signature does not have; the rule is written by signature for this reason.

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/readonlySingleCall.test.ts
// Arguments from each tool's own `required` list. A handler validates before
// it builds a client, so a row short of a required field never reaches the
// adapter — and still answers `isError: true`, which is what this test asserts.
// That combination passes while proving nothing, so the message is asserted too.
it.each([
  ['ReadMessageClass', handleReadMessageClass, { message_class_name: 'ZMC' }],
  ['GetObjectStructure', handleGetObjectStructure, { object_name: 'ZCL_X', object_type: 'class' }],
  ['SearchObject', handleSearchObject, { object_name: 'ZCL*' }],
  ['ListTransports', handleListTransports, {}],
  ['GetSqlQuery', handleGetSqlQuery, { sql_query: 'SELECT 1' }],
  // one row per file above
])('%s answers through the adapter and surfaces a refusal', async (_n, handler, args) => {
  fakeClient = refusingClient('Not found');
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Not found');
});
```

- [x] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/readonlySingleCall.test.ts`

- [x] **Step 3: Implement**

```typescript
// the one-call shape, filled in for handleReadMessageClass
return answer(
  { tool: 'ReadMessageClass', detail: 'terse' },
  () =>
    createAdtClient(connection, logger)
      .getMessageClass(resultsFor(messageClassDocuments))
      .readMetadata({ messageClassName }, { analyse: analyseException }),
  (metadata: AdtReading<string>) => ({
    success: true, message_class_name: messageClassName, metadata: metadata.raw,
  }),
);
```

The searches and listings answer JSON built from a parse, so they project `reading.value` through `project(detailOf(args), terse)` rather than reading `raw`. Their terse projection is whatever field set that tool already returns — copy it out of the handler as it stands, do not redesign it here.

- [x] **Step 4: Run the tests and measure**
- [x] **Step 5: Commit** — `refactor(readonly): the single-call reads, searches and listings`

---

## Task 13: `common/low` — the six generic operations, and the one real collision

`handleValidateObject`, `handleLockObject`, `handleUnlockObject`, `handleDeleteObject`, `handleCheckObject`, `handleActivateObject`. These dispatch over object families, so only one branch runs per call; keep each dispatch exactly as it is and change only how the call is made and answered.

**Files:**
- Modify: `src/handlers/common/low/handleValidateObject.ts`, `handleLockObject.ts`, `handleUnlockObject.ts`, `handleDeleteObject.ts`, `handleCheckObject.ts`, `handleActivateObject.ts`
- Create: `src/__tests__/unit/commonLowOperations.test.ts`

**`handleActivateObject` is the one place where the design's rule and the library's surface collide.** It calls `activateObjectsGroup`, which accepts no strategy, and group activation is one of the two masking families this project has already fixed once — ADT answers 200 with the refusal inside.

- [x] **Step 1: Decide `handleActivateObject`, and write the decision down**

The spec names two options and neither of them is "keep the masking quietly":

1. **Call the per-object `activate`**, which does accept an `analyse`, looping over the objects. More requests; the verdict is ours. **This is the default**, and it is what the tool's one-object case — the common one — should do.
2. **Get `activateObjectsGroup` the `<E extends IAdtError>` shape the other twelve members have.** That is a change to adt-clients, raised under issue #200, not something this migration can decide.

If option 1 turns out not to serve a multi-object call, the group member stays **and the limitation is surfaced**: named in the PR description, in the release notes and in the handler's own comment, with the issue number. Accepting a masked refusal without saying so is the defect this repository has removed twice.

- [x] **Step 2: Write the failing test, from the corpus**

```typescript
// src/__tests__/unit/commonLowOperations.test.ts
import { analyseActivation, analyseDeletion, analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { corpusBody } from '../../lib/adtCorpus';
import { fakeClientOf, refusedResponse } from '../helpers/fakeClient';

/**
 * The document ADT actually sent, judged by the strategy the handler passes.
 * These three cases all answer HTTP 200 with the refusal inside, which is why
 * the handler must not read the status.
 */
const refusalFrom = (member: string, caseName: string, analyse: (v: unknown, a: unknown) => unknown) =>
  fakeClientOf({
    [member]: async (_config: unknown, options: any) => {
      const wire = { data: corpusBody(caseName), status: 200 };
      expect(options.analyse).toBe(analyse);
      const verdict = options.analyse('adt:no-failure', wire);
      return refusedResponse((verdict as { message: string }).message);
    },
  });

it('reports a refused deletion as an error, though ADT answered 200', async () => {
  fakeClient = refusalFrom('delete', 'refusal-delete-refused--01-deletion-delete', analyseDeletion);
  const result: any = await handleDeleteObject(context as any, {
    object_type: 'class', object_name: 'ZCL_X', lock_handle: 'h',
  });
  expect(result.isError).toBe(true);
  // What failed, not just that something did. A local validation error
  // answers isError too, and would pass the line below unchanged.
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
  expect(result.content[0].text).not.toContain('"success": true');
});

it('reports an inadmissible name as an error', async () => {
  fakeClient = refusalFrom(
    'validate', 'refusal-validation-name-taken-class--01-validation-objectname', analyseValidation,
  );
  const result: any = await handleValidateObject(context as any, {
    object_type: 'class', object_name: 'ZCL_TAKEN', package_name: 'ZP',
  });
  expect(result.isError).toBe(true);
  // `origin` proves the failure came from the strategy rather than from the
  // handler's own input validation, which answers isError too.
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
});

it('reports a refused activation as an error', async () => {
  fakeClient = refusalFrom('activate', 'refusal-activation-fails--01-activation', analyseActivation);
  // `objects`, an array of `{ name, type }` — this tool activates a set, which
  // is why it reaches `activateObjectsGroup` and why Step 1 above is a decision
  // rather than a mapping.
  const result: any = await handleActivateObject(context as any, {
    objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }],
  });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
});
```

The third test is the one that decides Step 1: it passes under option 1 and fails under option 2. If option 2 is chosen, change the test to assert what is actually true and say in its name that the verdict is adt-clients'.

- [x] **Step 3: Run them to verify they fail** — all three; these handlers mask today.
- [x] **Step 4: Implement**, per Task 10's table.
- [x] **Step 5: Run the tests, the check and the compiler**

```bash
npx jest src/__tests__/unit/commonLowOperations.test.ts
npx tsx scripts/check-analyse.ts 'src/handlers/common/low/**'   # 0 offenders AND a non-zero count
```

- [x] **Step 6: Commit** — `refactor(common): the generic operations, with the strategy deciding`

---

## Tasks 14–17: The `low` tier, in four clusters

112 files, the most mechanical part of the migration. Task 10's per-operation table applies unchanged; what differs per family is the factory, the shipped set and the config key. **Commit per family**, so a reviewer can reject one family while approving its neighbour.

| task | families | files |
|---|---|---|
| **14** | `class` (11), `interface` (8), `behavior_definition` (8), `behavior_implementation` (3) | 30 |
| **15** | `ddl` (8), `ddlx` (8), `structure` (8), `table` (8) | 32 |
| **16** | `program` (8), `function` (14), `function_group`, `function_include` | 22+ |
| **17** | `data_element` (7), `package` (6), `service_binding` (1), `service_definition` (1), `system` (1), `transport` (1) | 17 |

**Files:** every `handle*.ts` under `src/handlers/<family>/low/` for the families in this cluster's row, plus `src/__tests__/unit/lowTierStrategies.test.ts`, created in the first cluster and extended by each of the others.

For each family, in order:

- [ ] **Step 1: Measure** — `npx tsc --noEmit 2>&1 | grep "handlers/<family>/low" | wc -l`
- [ ] **Step 2: Write the family's test row** in `src/__tests__/unit/lowTierStrategies.test.ts`, asserting the pairing rather than the prose: what goes wrong at this scale is a handler taking the wrong `analyse`, and that is visible from the call.

```typescript
// src/__tests__/unit/lowTierStrategies.test.ts
import { analyseActivation, analyseDeletion, analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { recordAnalyse } from '../helpers/fakeClient';
import { handleActivateClass, handleDeleteClass, handleValidateClass } from '...';

// Explicit rows rather than a family lookup: an executor reads one task and
// must not have to reconstruct which handler a family name maps to. Add the
// row for each family as that family is migrated.
const seen = recordAnalyse();
jest.mock('../../lib/clients', () => ({ createAdtClient: () => seen.client }));

it.each([
  ['class', handleActivateClass, handleDeleteClass, handleValidateClass,
    { class_name: 'ZCL_X', package_name: 'ZP', lock_handle: 'h' }],
  ['interface', handleActivateInterface, handleDeleteInterface, handleValidateInterface,
    { interface_name: 'ZIF_X', package_name: 'ZP', lock_handle: 'h' }],
  // one row per family in this cluster
])('%s pairs each operation with its own strategy', async (_family, activate, remove, validate, args) => {
  await (activate as any)(context as any, args);
  expect(seen.last).toBe(analyseActivation);
  await (remove as any)(context as any, args);
  expect(seen.last).toBe(analyseDeletion);
  await (validate as any)(context as any, args);
  expect(seen.last).toBe(analyseValidation);
});
```

- [ ] **Step 3: Run it to verify it fails**
- [ ] **Step 4: Migrate the family**, then `npx tsc --noEmit 2>&1 | grep "handlers/<family>/low" | wc -l` — expect 0
- [ ] **Step 5: Run the omission check on the family just touched**

```bash
npx tsx scripts/check-analyse.ts 'src/handlers/<family>/low/**'   # 0 offenders AND a non-zero count
npx jest src/__tests__/unit/toolSurface.test.ts
```
- [ ] **Step 6: Commit the family** — `refactor(<family>): the low tier, on strategies`

Do not batch two families into one commit.

---

## Task 18: The `high` tier `Get*` handlers

29 files: `handleGetClass`, `handleGetDomain`, `handleGetTable`, `handleGetStructure`, `handleGetProgram`, `handleGetInterface`, `handleGetDdl`, `handleGetDataElement`, `handleGetPackage`, `handleGetMessageClass`, `handleGetMessageClassMessage`, `handleGetFunctionGroup`, `handleGetFunctionModule`, `handleGetServiceBinding`, `handleGetServiceDefinition`, `handleGetMetadataExtension`, `handleGetBehaviorDefinition`, `handleGetBehaviorImplementation`, `handleGetLocalTestClass`, `handleGetLocalTypes`, `handleGetLocalDefinitions`, `handleGetLocalMacros`, `handleGetUnitTest`, `handleGetUnitTestStatus`, `handleGetUnitTestResult`, `handleGetCdsUnitTest`, `handleGetCdsUnitTestStatus`, `handleGetCdsUnitTestResult`, `handleListServiceBindingTypes`.

**Files:**
- Modify: the twenty-nine `handleGet*.ts` and `handleListServiceBindingTypes.ts` named above, under `src/handlers/*/high/`
- Modify: `src/__tests__/unit/readonlySingleCall.test.ts` — one row per handler

Each follows Task 9 (two calls, `pair`) or Task 12 (one call). The six unit-test readers take `analyseUnitTest` and `structured`; note that `AdtUnitTestLegacy` accepts no strategy on `run`, `getStatus` and `getResult`, which Task 26 pins.

- [ ] **Step 1: Extend `readonlySingleCall.test.ts` with one row per `Get*` handler**, asserting a refusal surfaces as `isError: true`
- [ ] **Step 2: Run it to verify it fails**
- [ ] **Step 3: Migrate**
- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit** — `refactor(high): the Get handlers answer through the adapter`

---

## Task 19: The eighteen high-tier writes that hold a lock

Measured, because the shape follows from whether the handler takes a lock and
not from the verb:

```bash
for f in $(find src/handlers -path '*/high/*' -name 'handle[CUD]*.ts'); do
  grep -qE "\.lock\(" "$f" && echo "LOCK ${f#src/handlers/}"
done | sort
```

**Thirteen updates and five creates** hold a lock for the whole call. That is
`withLock`'s shape, and it is what the thirteen `try/finally` handlers are doing
by hand today — those also flatten the strategy's failure into
`return_error(new Error(message))` and log a failed unlock as a warning the
caller never sees.

The five creates are a lifecycle rather than one call: `handleCreateDomain`
validates, creates, locks, updates the body, unlocks, checks and activates. The
create itself takes no lock — the spec's corpus evidence is that a create is a
bare POST — so the lock wraps only the update in the middle, and the whole thing
is a `sequence` with a `withLock` inside it. This is also why a `CreateX` taking
`source_code` must call `update()` after `create()`: `create` writes the shell.

**Files:** the eighteen the command above lists.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/highTierLocking.test.ts
import { fakeClientOf, okResponse, reading, refusedResponse } from '../helpers/fakeClient';

it('releases the lock when the update is refused, and answers the update failure', async () => {
  const unlock = jest.fn(async () => okResponse(undefined));
  fakeClient = fakeClientOf({
    lock: async () => okResponse('handle-1'),
    update: async () => refusedResponse('Update refused'),
    unlock,
  });
  const result: any = await handleUpdateClass(context as any, { class_name: 'ZCL_X', source_code: 'x' });
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Update refused');
});

it('reports a succeeded write under a refused unlock as a failure naming both', async () => {
  fakeClient = fakeClientOf({
    lock: async () => okResponse('handle-1'),
    update: async () => okResponse(reading(undefined, '', 200)),
    unlock: async () => refusedResponse('Unlock refused'),
  });
  const result: any = await handleUpdateClass(context as any, { class_name: 'ZCL_X', source_code: 'x' });
  const payload = JSON.parse(result.content[0].text);
  expect(result.isError).toBe(true);
  expect(payload.message).toBe('Unlock refused');
  expect(payload.operation).toBe('succeeded');
});

const lifecycleArgs = {
  domain_name: 'ZD', package_name: 'ZP', description: 'x', data_type: 'CHAR', length: 10,
};

/** Every phase answering, recording the order it was asked in. */
const recordingLifecycle = (order: string[], overrides: Record<string, unknown> = {}) =>
  fakeClientOf({
    validate: async () => { order.push('validate'); return okResponse(reading({})); },
    create: async () => { order.push('create'); return okResponse(reading(undefined, '', 200)); },
    lock: async () => { order.push('lock'); return okResponse('handle-1'); },
    updateMetadata: async () => { order.push('update'); return okResponse(reading(undefined, '', 200)); },
    unlock: async () => { order.push('unlock'); return okResponse(undefined); },
    check: async () => { order.push('check'); return okResponse(reading({})); },
    activate: async () => { order.push('activate'); return okResponse(reading({})); },
    ...overrides,
  });

it('a lifecycle create runs all five phases, and locks only the body write', async () => {
  const order: string[] = [];
  fakeClient = recordingLifecycle(order);
  const result: any = await handleCreateDomain(context as any, lifecycleArgs);
  expect(result.isError).toBe(false);
  // The order the handler performs today. `check` and `activate` are phases,
  // not a postscript: a create that stops after the body write leaves an
  // inactive object and reports success.
  expect(order).toEqual(['validate', 'create', 'lock', 'update', 'unlock', 'check', 'activate']);
});

it('a refused check stops the lifecycle before activation', async () => {
  const order: string[] = [];
  fakeClient = recordingLifecycle(order, {
    check: async () => { order.push('check'); return refusedResponse('Syntax check failed'); },
  });
  const result: any = await handleCreateDomain(context as any, lifecycleArgs);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Syntax check failed');
  expect(order).not.toContain('activate');
  // The lock was released before the check ran, so a refused check leaves none.
  expect(order.filter((p) => p === 'unlock')).toHaveLength(1);
});

it('a refused activation is answered as the strategy built it', async () => {
  const order: string[] = [];
  fakeClient = recordingLifecycle(order, {
    activate: async (_c: unknown, o: any) => {
      expect(o.analyse).toBe(analyseActivation);
      return refusedResponse('Activation failed');
    },
  });
  const result: any = await handleCreateDomain(context as any, lifecycleArgs);
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0].text);
  expect(payload.message).toBe('Activation failed');
  expect(payload.origin).toBe('refusal');
  // No sentence of the handler's own about which phase it was.
  expect(result.content[0].text).not.toContain('phase');
});
```

- [ ] **Step 2: Run them to verify they fail** — today the unlock failure is a `logger.warn` and the handler answers success.

- [ ] **Step 3: Implement**

```typescript
// an update: the lock is the whole call
return answer(
  { tool: 'UpdateClass', detail: detailOf(args) },
  () =>
    withLock(
      () => obj.lock({ className }),
      (lockHandle) => obj.update({ className }, { sourceCode, lockHandle, analyse: analyseException }),
      (lockHandle) => obj.unlock({ className }, lockHandle),
    ),
  project(detailOf(args), terseWrite),
);

// a lifecycle create: five phases, the lock wrapping only the body write
return answer(
  { tool: 'CreateDomain', detail: detailOf(args) },
  () =>
    sequence(
      () => obj.validate(config, { analyse: analyseValidation }),
      () => obj.create(config, { analyse: analyseException }),
      () =>
        withLock(
          () => obj.lock({ domainName }),
          (lockHandle) =>
            obj.updateMetadata(
              { domainName, document: patched },
              { lockHandle, analyse: analyseException },
            ),
          (lockHandle) => obj.unlock({ domainName }, lockHandle),
        ),
      () => obj.check(config, 'inactive', { analyse: analyseCheck }),
      () => obj.activate(config, { analyse: analyseActivation }),
    ),
  project(detailOf(args), terseWrite),
);
```

**All five phases, in one `sequence`.** Task 4 widened the overloads to five for
this: nesting a second `sequence` inside the first would express the same order
while hiding two of the phases from anyone reading the call.

Each phase carries the strategy its encoding needs — `analyseValidation` for the
name check, `analyseException` for the create and the write, `analyseCheck` for
the syntax check, `analyseActivation` for the activation — and `sequence` hands
back the first failure untouched, so the caller learns which phase refused from
that failure's own `request`.

Confirm the order against the handler before editing; `handleCreateDomain` today
runs validate, create, lock, update, unlock, check, activate, and a second
unlock on its error path that `withLock` replaces.

- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit** — `refactor(high): the writes that hold a lock hold it through withLock`

---

## Task 20: The high-tier creates and updates that hold no lock

**Seventeen creates and ten updates.** A create is a bare POST — the corpus
has `create-class--01-oo-classes` and `create-domain--01-ddic-domains`, one
exchange each, no lock — and these ten updates take the handle as an
argument rather than acquiring one. Both are the single-call shape of Task 9,
with Task 10's pairing: `analyseException`, `statusOnly`, `terseWrite`.

**Files:**
- Modify: the seventeen creates and ten updates the command below lists, under `src/handlers/*/high/` — the command prints eleven updates, and `handleUpdateServiceBinding` is the one Task 23 takes
- Create: `src/__tests__/unit/highTierWrites.test.ts`

**Do not give these a lock lifecycle.** A `withLock` here would acquire a lock
the tool was never asked for and release it under an object the caller may hold
open elsewhere.

```bash
for f in $(find src/handlers -path '*/high/*' -name 'handle[CU]*.ts' | grep -v handleCheck); do
  grep -qE "\.lock\(" "$f" || echo "${f#src/handlers/}"
done | sort
```

**`handleUpdateServiceBinding` is not in this task**, though that command lists
it. It calls `updateServiceBinding(...)`, which does not exist anywhere in
adt-clients 19 — `tsc` says so at line 101 and suggests `generateServiceBinding`
— so it has no `update(config, { lockHandle, analyse })` to mock and no lock
handle to assert. It belongs to Task 23 with the other removed members. The same
goes for `handleValidateServiceBinding` and `validateServiceBinding`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/highTierWrites.test.ts
it.each([
  ['CreateClass', handleCreateClass, { class_name: 'ZCL_X', package_name: 'ZP', description: 'x' }],
  ['CreateInterface', handleCreateInterface, { interface_name: 'ZIF_X', package_name: 'ZP', description: 'x' }],
  // one row per file the command above lists
])('%s reports a refused create as an error', async (_n, handler, args) => {
  fakeClient = fakeClientOf({ create: async () => refusedResponse('Name already taken') });
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Name already taken');
});

// The ten updates are a different call and a different assertion. A row
// for one of them in the table above would mock `create`, which the handler
// never calls, and then assert a refused create that never happened.
it.each([
  ['UpdateLocalTestClass', handleUpdateLocalTestClass, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateLocalTypes', handleUpdateLocalTypes, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateLocalDefinitions', handleUpdateLocalDefinitions, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateLocalMacros', handleUpdateLocalMacros, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateBehaviorImplementation', handleUpdateBehaviorImplementation, { behavior_implementation_name: 'ZBI', source_code: 'x', lock_handle: 'h' }],
  ['UpdateFunctionInclude', handleUpdateFunctionInclude, { include_name: 'ZINC', function_group_name: 'ZFG', source_code: 'x', lock_handle: 'h' }],
  ['UpdateMessageClass', handleUpdateMessageClass, { message_class_name: 'ZMC', lock_handle: 'h' }],
  ['UpdateMessageClassMessage', handleUpdateMessageClassMessage, { message_class_name: 'ZMC', message_number: '001', lock_handle: 'h' }],
  ['UpdateUnitTest', handleUpdateUnitTest, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateCdsUnitTest', handleUpdateCdsUnitTest, { ddl_name: 'ZDDL', source_code: 'x', lock_handle: 'h' }],
])('%s reports a refused update as an error', async (_n, handler, args) => {
  fakeClient = fakeClientOf({ update: async () => refusedResponse('Object is locked by another user') });
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Object is locked by another user');
});

// All ten in this task, not a sample. Two rows would leave eight handlers
// free to acquire a lock nobody asked them for, and this is the assertion
// that stops that.
it.each([
  ['UpdateLocalTestClass', handleUpdateLocalTestClass, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateLocalTypes', handleUpdateLocalTypes, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateLocalDefinitions', handleUpdateLocalDefinitions, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateLocalMacros', handleUpdateLocalMacros, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateBehaviorImplementation', handleUpdateBehaviorImplementation, { behavior_implementation_name: 'ZBI', source_code: 'x', lock_handle: 'h' }],
  ['UpdateFunctionInclude', handleUpdateFunctionInclude, { include_name: 'ZINC', function_group_name: 'ZFG', source_code: 'x', lock_handle: 'h' }],
  ['UpdateMessageClass', handleUpdateMessageClass, { message_class_name: 'ZMC', lock_handle: 'h' }],
  ['UpdateMessageClassMessage', handleUpdateMessageClassMessage, { message_class_name: 'ZMC', message_number: '001', lock_handle: 'h' }],
  ['UpdateUnitTest', handleUpdateUnitTest, { class_name: 'ZCL_X', source_code: 'x', lock_handle: 'h' }],
  ['UpdateCdsUnitTest', handleUpdateCdsUnitTest, { ddl_name: 'ZDDL', source_code: 'x', lock_handle: 'h' }],
])('%s takes the lock handle as an argument and acquires none', async (_n, handler, args) => {
  // These eleven are `high`-tier by name and `low`-tier by shape: the caller
  // already holds the lock. Acquiring one here would take a second lock on an
  // object the caller has open, and releasing it would drop theirs.
  const lock = jest.fn();
  const unlock = jest.fn();
  const update = jest.fn(async () => okResponse(reading(undefined, '', 200)));
  fakeClient = fakeClientOf({ update, lock, unlock });
  await (handler as any)(context as any, args);
  expect(lock).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ lockHandle: 'h', analyse: analyseException }),
  );
});

it('answers SUCCESS and nothing else when a create works', async () => {
  // A class create answers 200 with zero bytes; the status is the whole verdict.
  fakeClient = fakeClientOf({ create: async () => okResponse(reading(undefined, '', 200)) });
  const result: any = await handleCreateClass(context as any, {
    class_name: 'ZCL_X', package_name: 'ZP', description: 'x',
  });
  expect(result.isError).toBe(false);
  expect(result.content[0].text).toContain('SUCCESS');
});

it('never acquires a lock', async () => {
  const lock = jest.fn();
  fakeClient = fakeClientOf({ create: async () => okResponse(reading(undefined, '', 200)), lock });
  await handleCreateClass(context as any, { class_name: 'ZCL_X', package_name: 'ZP', description: 'x' });
  expect(lock).not.toHaveBeenCalled();
});
```

**A refused create is unrecorded in the corpus for every family** — the spec
says so. These tests therefore assert the handler's behaviour given a refusal,
not the shape of the document ADT sends; say that in the file's header.

- [ ] **Step 2: Run them to verify they fail**
- [ ] **Step 3: Implement**, one family per commit, as single-call `answer()`.
- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit per family** — `refactor(<family>): the high-tier create, single call`

---

## Task 21: The high-tier deletes and checks

**Twenty-four deletes and thirteen checks**, none of which locks. A deletion is
a POST to `/sap/bc/adt/deletion/delete` with the object in the body — the corpus
has it as `delete-success--01-deletion-delete`, one exchange — and **a held lock
is what makes a deletion refuse**, which is how `refusal-delete-refused` was
captured. So a delete handler must not take a lock; doing so would make the
operation fail.

**Files:**
- Modify: the twenty-four `handleDelete*.ts` and thirteen `handleCheck*.ts` under `src/handlers/*/high/`
- Create: `src/__tests__/unit/highTierDeletes.test.ts`

| operation | `analyse` | reading | projection |
|---|---|---|---|
| Delete | `analyseDeletion` | `structured` | `terseDeletion` |
| Check | `analyseCheck` | `structured` | `terseCheck` |

**No handler calls `checkDeletion`, and none ever did.** `grep -rl checkDeletion
src/handlers` answers nothing, and `DeleteClassArgs` is `class_name` plus
`transport_request` — there is no check-only mode to reach it with. The member
exists on every object class and no tool exposes it.

That is worth knowing rather than glossing: adt-clients 19 removed
`parseDeletionCheck` and `assertDeletable`, which is where the pre-check used to
happen inside `delete()`. So **nothing performs a deletion check now**, and
this migration does not add one — adding a tool or a mode is a change to the
tool surface, which this work is not allowed to make. Recorded here so the
next person meets the fact rather than the gap.

- [ ] **Step 1: Write the failing test, from the corpus**

```typescript
// src/__tests__/unit/highTierDeletes.test.ts
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { corpusBody } from '../../lib/adtCorpus';
import { fakeClientOf, refusedResponse } from '../helpers/fakeClient';

it('reports a refused deletion as an error, though ADT answered 200', async () => {
  // The masking family this project has already fixed twice: isDeleted=false
  // and a del:message, under a 200. The handler must not read the status.
  const document = corpusBody('refusal-delete-refused--01-deletion-delete');
  fakeClient = fakeClientOf({
    delete: async (_c: unknown, o: any) => {
      expect(o.analyse).toBe(analyseDeletion);
      return refusedResponse((o.analyse('adt:no-failure', { data: document, status: 200 }) as any).message);
    },
  });
  const result: any = await handleDeleteClass(context as any, { class_name: 'ZCL_X' });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
  expect(result.content[0].text).not.toContain('"success": true');
});

// The thirteen checks are the other half of this task and take a different
// strategy, a different reading and a different projection. The omission audit
// proves only that SOME analyse was passed; only this proves it was the right
// one, and picking analyseDeletion for a check run would pass that audit.
it.each([
  ['CheckClass', handleCheckClass, { class_name: 'ZCL_X' }],
  ['CheckDdl', handleCheckDdl, { ddl_name: 'ZDDL' }],
  // one row per check handler in this task
])('%s takes analyseCheck and projects the check report', async (_n, handler, args) => {
  const document = corpusBody('check-success-verdict--01-checkrun');
  const seen: unknown[] = [];
  fakeClient = fakeClientOf({
    check: async (_c: unknown, _status: unknown, o: any) => {
      seen.push(o.analyse);
      return okResponse(reading(parseStructure(document), document, 200));
    },
  });
  const result: any = await (handler as any)(context as any, args);
  expect(seen).toEqual([analyseCheck]);
  // terseCheck's own fields, so a projection swapped for terseDeletion fails
  // here rather than passing as "some JSON came back".
  expect(JSON.parse(result.content[0].text)).toMatchObject({ ran: true });
});

it('never acquires a lock, because a held lock is what makes a deletion refuse', async () => {
  const lock = jest.fn();
  fakeClient = fakeClientOf({ delete: async () => okResponse(reading({})), lock });
  await handleDeleteClass(context as any, { class_name: 'ZCL_X' });
  expect(lock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them to verify they fail**
- [ ] **Step 3: Implement**, one family per commit.
- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit per family** — `refactor(<family>): the high-tier delete, on the deletion strategy`

---

## Task 22: The four remaining read-modify-write families

`domain` is done and is the worked example. The migration guide names **six**
types whose `update` now takes the whole document: `domain`, `package`,
`dataElement`, `tableType`, `functionGroup` and `transport`.

**Five of them are this task; the transport is not, because no tool updates
one.** `grep -rln "getRequest()" src/handlers` finds four handlers — two
creates and two reads — and `src/handlers/transport/` contains no update at all.
The type changed; this repository has nothing on it to change. Recorded so the
next reader meets the reason rather than the gap, and so nobody migrates
`handleCreateTransport` by mistake looking for it.

So four families here, beside the domain already done: `dataElement`, `package`,
`functionGroup`, `tableType`. Their update handlers pass a handful of named
fields and no document, which under a replace is silent data loss.

`functionGroup` carries one more difference the guide names: it used to lock and
unlock around its own update. That is the handler's job now, which makes it a
`withLock` around the read-patch-write rather than a bare `sequence`.

**What the corpus backs.** There is a metadata document for `package` (`read-metadata-package--01-packages-zmcpshrpkg`) and for `functionGroup` (`read-metadata-function-group--01-groups-zmcpshrfgrp`), and **none for `dataElement` or `tabletype`**. Do not write a stand-in. Capture the two that are missing first —

```bash
npx tsx scripts/capture-adt-corpus.ts --env <session> --only read-metadata-data-element,read-metadata-tabletype
```

— which needs a live session and is the user's call, not the agent's. Until then those two get only the half of the test that needs no document, and the test name says so.

**Files:**
- Create: `src/lib/strategies/{packagePatch,functionGroupPatch,dataElementPatch,tableTypePatch}.ts`
- Modify: `data_element/{low,high}/handleUpdateDataElement.ts`, `package/low/handleUpdatePackage.ts`, `function/high/handleUpdateFunctionGroup.ts`, `table/high/handleUpdateTable.ts`
- Test: `src/__tests__/unit/readModifyWrite.test.ts` (exists — extend), one patch test per family

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/packagePatch.test.ts
import { corpusBody } from '../../lib/adtCorpus';
import { patchPackageXml } from '../../lib/strategies/packagePatch';

it('changes the description and keeps everything else', () => {
  const before = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
  const after = patchPackageXml(before, { description: 'New text' });
  expect(after).toContain('adtcore:description="New text"');
  for (const attr of before.match(/\b[\w:]+="[^"]*"/g) ?? []) {
    if (!attr.startsWith('adtcore:description=')) expect(after).toContain(attr);
  }
});

it('throws rather than writing a document it could not patch', () => {
  expect(() => patchPackageXml('', { description: 'x' })).toThrow();
  expect(() => patchPackageXml('<other/>', { description: 'x' })).toThrow();
});
```

```typescript
// src/__tests__/unit/dataElementPatch.test.ts
// Only the half that needs no document: the corpus has no data-element
// metadata, and a stand-in would be this repository asserting against its own
// imagination.
it('throws rather than writing a document it could not patch', () => {
  expect(() => patchDataElementXml('', { description: 'x' })).toThrow();
  expect(() => patchDataElementXml('<other/>', { description: 'x' })).toThrow();
});
it.todo('keeps every unnamed field — unverified: no data-element metadata in the corpus');
```

The empty-input case matters most: ADT answers a read of a not-yet-ready object with 200 and an empty body, so a silent `String.replace` turns a slow read into a malformed write the server blames on the caller.

- [ ] **Step 2: Run them to verify they fail**
- [ ] **Step 3: Implement the patch, then wire the handler inside the lock**

```typescript
// read, patch, write — inside withLock where the handler owns the lock
withLock(
  () => obj.lock({ dataElementName }),
  (lockHandle) =>
    sequence(
      () => obj.readMetadata({ dataElementName }, { analyse: analyseException }),
      (current) =>
        // The document goes in the CONFIG as `document`, not in the options.
        // The guide's own example is
        // `updateMetadata({ domainName, document: edited }, { lockHandle })`.
        //
        // `current` is an `AdtReading` and `raw` is the document as it arrived.
        // Those are the bytes that go back to SAP, which is why the read is
        // `verbatim` and why nothing re-serialises them on the way.
        obj.updateMetadata(
          { dataElementName, document: patchDataElementXml(current.raw, properties) },
          { lockHandle, analyse: analyseException },
        ),
    ),
  (lockHandle) => obj.unlock({ dataElementName }, lockHandle),
)
```

A `low`-tier update takes the handle as an argument and must not acquire or release one — it uses `sequence` alone.

- [ ] **Step 4: Run the tests** — `readModifyWrite.test.ts` must still show both halves: every metadata fixture survives `verbatim` character for character, and rebuilding one from its parse does not reproduce it.
- [ ] **Step 5: Commit** — `feat(update): four more families read, patch and write`

---

## Task 23: The eleven consumers of members 19 removed or renamed

These have no type error to fix — they have no member to call. Each is a fixed
chain: run the steps in order, stop at the first failure. The two class
profiling handlers are **not** here; they take the same shape and Task 24 is
theirs, together with the tool-surface question their dead parameters raise.

**Ask the compiler for this list rather than trusting the table.** An earlier
draft was written by hand and missed four consumers — `searchObjects` twice, and
both service-binding members. The compiler names every one:

```bash
npx tsc --noEmit 2>&1 \
  | grep -E "Property '[a-zA-Z]+' does not exist on type '(Adt|IAdt|ClassExecutor|ProgramExecutor)" \
  | sed -E "s|^([^(]+).*Property '([a-zA-Z]+)'.*|\2  \1|" | sort -u
```

Ignore the envelope properties — `readResult`, `metadataResult`, `deleteResult`
and the rest are Tasks 9 to 22's work. What is left is this:

| consumer | the member it calls | what 19 offers instead |
|---|---|---|
| `system/readonly/handleGetWhereUsed.ts` | `getWhereUsedList` | `getWhereUsedScope`, `modifyWhereUsedScope` (no request), `getWhereUsed` — **three calls** |
| `structure/readonly/handleGetStructuresList.ts` | `getWhereUsedList` | the same three |
| `function_include/readonly/handleListFunctionModules.ts` | `listFunctionModules` | the object's node structure, then the child type's node |
| `function_include/readonly/handleListFunctionGroupIncludes.ts` | `listFunctionGroupIncludes` | the same two |
| `search/readonly/handleSearchObject.ts` | `searchObjects` | `search` |
| `src/lib/search-source/packageResolver.ts` | `searchObjects` | `search` |
| `src/lib/search-source/packageEnumerator.ts` | `getPackageContentsList` | `walkPackage`, already written |
| `service_binding/high/handleUpdateServiceBinding.ts` | `updateServiceBinding` | not in the guide's table — establish in Step 1 |
| `service_binding/high/handleValidateServiceBinding.ts` | `validateServiceBinding` | `validate` |
| `system/readonly/handleRuntimeRunProgram.ts` | `runWithProfiling` | `scheduleTrace`, then `runWithProfiler(target, { profilerId })` |
| `system/readonly/handleRuntimeRunProgramWithProfiling.ts` | `runWithProfiling` | the same two |

Eleven consumers, not seven. The four the hand-written table missed would
otherwise have waited for the final compiler sweep in Task 25, in a task that
has no test for them.

**`runWithProfiling` was split, not deleted.** `ProgramExecutor` says so in its
own comment: *"who wants the old member writes `scheduleTrace`, then
`runWithProfiler` with the id it answered."* Two calls where there was one,
which is this task's shape exactly.

**Files:**
- Modify: the eleven consumers the compiler lists
- Create: `src/__tests__/unit/staticSequences.test.ts`

Most are a rename and stay one call. `handleUpdateServiceBinding` and the two
program profiling handlers are the ones that become sequences.

- [ ] **Step 1: Establish what each removed member did, from the changelog and the corpus**

```bash
# every member the table names, not the four an earlier draft happened to list
for m in runWithProfiling getWhereUsedList listFunctionModules listFunctionGroupIncludes \
         searchObjects updateServiceBinding validateServiceBinding getPackageContentsList; do
  echo "--- $m"
  grep -rn "$m" node_modules/@mcp-abap-adt/adt-clients/CHANGELOG.md 2>/dev/null | head -3
done
git show 57f0645 --stat   # the walk already moved, as the worked example
```

**The guide answers most of this table**, and Step 1 is now a lookup rather
than an investigation for everything except the service binding. Read section 7,
"Sequences are yours", before the changelog.

`updateServiceBinding` is the one member the guide's table does not name.
`AdtServiceBinding` offers `update`, `classifyServiceBinding`,
`generateServiceBinding` and `getServiceGroup`, and which of those the old
composite issued is exactly what this step settles. Do not start that handler
until it is written down.

Write down the endpoint sequence each one issued **before** writing code. A sequence guessed from the old arguments is a guess.

- [ ] **Step 2: Write the failing test**

**Take every test's arguments from the tool's own `required` list.** A handler
validates its input before it builds a client, so a row missing a required field
never reaches the member under test. The negative tests are the trap: a missing
field also answers `isError: true`, so such a row passes while proving nothing.
Assert the message, not just the flag.

Eleven consumers in four shapes, and each shape needs a test. A rename is not
free of risk: `searchObjects` became `search`, which **takes an `analyse` where
the old member took none**, so migrating it as a pure rename hands the verdict
back to the library and nothing says so.

```typescript
// src/__tests__/unit/staticSequences.test.ts

// SHAPE 1 — a rename, still one call.
it.each([
  ['GetWhereUsed', handleGetWhereUsed, { object_type: 'class', object_name: 'ZCL_X' }, 'getWhereUsed'],
  ['GetStructuresList', handleGetStructuresList, { structure_name: 'ZS' }, 'getWhereUsed'],
  // Arguments copied from each tool's own `required` list, not invented. A
  // handler validates its input before it builds a client, so a row missing a
  // required field never reaches the member it is meant to be testing — and
  // fails, or passes, for a reason that has nothing to do with the migration.
  ['SearchObject', handleSearchObject, { object_name: 'ZCL*' }, 'search'],
  ['ValidateServiceBinding', handleValidateServiceBinding,
    { service_binding_name: 'ZSB', service_definition_name: 'ZSD' }, 'validate'],
  ['ListFunctionModules', handleListFunctionModules, { function_group_name: 'ZFG' }, 'fetchNodeStructure'],
  ['ListFunctionGroupIncludes', handleListFunctionGroupIncludes, { function_group_name: 'ZFG' }, 'fetchNodeStructure'],
])('%s calls the member that replaced it and surfaces its refusal', async (_n, handler, args, member) => {
  fakeClient = fakeClientOf({ [member as string]: async () => refusedResponse('Refused') });
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Refused');
  // The failing step's answer, untouched. No "step 2 of 3" sentence beside it.
  expect(result.content[0].text).not.toContain('step');
});

it('SearchObject passes an analyse, which the member it replaced never took', async () => {
  const seen: unknown[] = [];
  fakeClient = fakeClientOf({
    search: async (_c: unknown, o: any) => { seen.push(o?.analyse); return okResponse(reading([])); },
  });
  await handleSearchObject(context as any, { object_name: 'ZCL*' });
  expect(seen).toEqual([analyseException]);
});

// SHAPE 2 — the two lib files. They are not handlers and answer no MCP result,
// and they feed the source search: a walk that answers nothing there is a
// search that finds nothing, with no error to show for it.
it('packageEnumerator walks rather than calling the removed member', async () => {
  const walked: string[] = [];
  const enumerated = await enumeratePackage(
    fakeClientOf({
      fetchNodeStructure: async (_t: unknown, name: unknown) => {
        walked.push(String(name));
        return okResponse(reading({ nodes: [] }));
      },
    }) as any,
    'ZMCP_SHR_PKG',
  );
  expect(walked).toContain('ZMCP_SHR_PKG');
  expect(enumerated).toEqual([]);
});

it('packageResolver searches through the renamed member, with a strategy', async () => {
  const seen: unknown[] = [];
  fakeClient = fakeClientOf({
    search: async (_c: unknown, o: any) => { seen.push(o?.analyse); return okResponse(reading([])); },
  });
  await resolvePackage(fakeClient as any, 'ZMCP*');
  expect(seen).toEqual([analyseException]);
});

// SHAPE 3 — the two program profiling handlers: two calls where there was one.
//
// These two do not go through `createAdtClient`. Each writes
// `new AdtExecutor(connection, logger)` directly and reaches its members
// through `executor.getProgramExecutor()`, so the
// `jest.mock('../../lib/clients')` the rest of this file relies on does nothing
// for them — the handler would build a real executor and the fake would never
// be asked.
//
// CHECK WHICH DOOR BEFORE WRITING ANY HANDLER TEST.
// `grep -rl "new AdtExecutor" src/handlers` names the four that take this one;
// everything else in the plan goes through `createAdtClient`. A test that mocks
// the wrong dependency compiles, runs, and exercises the real one.

// Declared and mocked for real, at the top of the file beside the other mock.
// `programExecutor` is a plain object built per test from `okResponse` and
// `refusedResponse`, the same as `fakeClientOf` builds — a different door, not
// a different kind of fake.
let programExecutor: Record<string, unknown>;
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtExecutor: jest.fn(() => ({ getProgramExecutor: () => programExecutor })),
}));

// Both of them. The compiler catches a handler that still names the removed
// member; it says nothing about one that calls the two replacements in the
// wrong order, or calls only one of them.
// The id `scheduleTrace` answers is a PROFILER REQUEST id, which
// `runWithProfiler` consumes. It is not the id of a completed trace — that one
// appears in the profiler feed later, and Task 24 is where it is searched for.
const PROGRAM_REQUEST = 'profiler-request-1';

const profiling = [
  ['RuntimeRunProgram', handleRuntimeRunProgram, { program_name: 'ZP', profile: true }],
  ['RuntimeRunProgramWithProfiling', handleRuntimeRunProgramWithProfiling, { program_name: 'ZP' }],
] as const;

it.each(profiling)('%s passes the scheduled id to the profiler run', async (_n, handler, args) => {
  const order: string[] = [];
  let passed: unknown;
  programExecutor = {
    scheduleTrace: async () => { order.push('schedule'); return okResponse(PROGRAM_REQUEST); },
    runWithProfiler: async (_target: unknown, options: any) => {
      order.push('run');
      passed = options?.profilerId;
      return okResponse({ done: true });
    },
  };
  await (handler as any)(context as any, args);
  expect(order).toEqual(['schedule', 'run']);
  // The order alone proves nothing about the join. A handler calling
  // `runWithProfiler` with no id, the wrong id, or a constant passes an
  // order check and fails in production, so the id that came back from
  // `scheduleTrace` is what must arrive.
  expect(passed).toBe(PROGRAM_REQUEST);
});

it.each(profiling)('%s stops at the first refused step', async (_n, handler, args) => {
  const run = jest.fn();
  programExecutor = {
    scheduleTrace: async () => refusedResponse('Trace scheduling refused'),
    runWithProfiler: run,
  };
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Trace scheduling refused');
  expect(run).not.toHaveBeenCalled();
});

// SHAPE 4 — the service-binding update. Step 3 replaces this with a real
// test; `it.todo` is a placeholder for one step, not a way to finish.
it.todo('UpdateServiceBinding, once Step 1 has named the members it maps onto');

```

- [ ] **Step 3: Replace the `it.todo` with a failing test**

Step 1 has now named which members `updateServiceBinding` maps onto. Write the
test before the handler, like every other shape in this task, and assert three
things rather than one: the order of the calls, the arguments each receives, and
that a refusal in the first stops the rest.

```typescript
it('UpdateServiceBinding calls the members that replaced the composite, in order', async () => {
  const order: string[] = [];
  const seen: Record<string, unknown> = {};
  fakeClient = fakeClientOf({
    // the member names Step 1 established, not these guesses
    update: async (config: any, o: any) => {
      order.push('update'); seen.update = { config, analyse: o?.analyse };
      return okResponse(undefined, '', 200);
    },
    classifyServiceBinding: async (config: any) => {
      order.push('classify'); seen.classify = config;
      return okResponse({});
    },
  });
  // All four of this tool's required fields: service_binding_name,
  // desired_publication_state, binding_variant and service_name. The handler
  // throws on each of the last three before it reaches a client, so a shorter
  // object leaves `order` empty and the test fails on the wrong thing.
  await handleUpdateServiceBinding(context as any, {
    service_binding_name: 'ZSB',
    desired_publication_state: 'published',
    binding_variant: 'ODATA_V4_UI',
    service_name: 'ZSRV',
  });
  expect(order).toEqual(['update', 'classify']);
  expect((seen.update as any).analyse).toBe(analyseException);
});

it('UpdateServiceBinding stops at the first refused step', async () => {
  const second = jest.fn();
  fakeClient = fakeClientOf({
    update: async () => refusedResponse('Binding is locked'),
    classifyServiceBinding: second,
  });
  const result: any = await handleUpdateServiceBinding(context as any, {
    service_binding_name: 'ZSB',
    desired_publication_state: 'published',
    binding_variant: 'ODATA_V4_UI',
    service_name: 'ZSRV',
  });
  expect(result.isError).toBe(true);
  // And for the right reason. Missing a required field also produces
  // `isError: true`, so a row short of one would pass this line while never
  // calling the member the test is about.
  expect(JSON.parse(result.content[0].text).message).toBe('Binding is locked');
  expect(second).not.toHaveBeenCalled();
});
```

**This task is not done while an `it.todo` remains in it.** Jest passes a todo,
so the suite is green either way — which makes this the one consumer that could
ship with no behavioural test at all, and it is also the least determined one in
the table.

- [ ] **Step 4: Run the tests to verify they fail**
- [ ] **Step 5: Implement** each as `answer(ctx, () => sequence(...), project)`, every step whose member accepts one carrying its own `analyse`.

**Two axes, and only one of them is missing here.** The where-used and node-structure members accept **no per-call `analyse`** — their verdict stays adt-clients'. They do still take **our injected result set**: `client.getUtils(ourUtils)`, never `client.getUtils()`. Omitting it selects the shipped `node` strategy, which drops the descriptions `nodeLevel` keeps, and a tree without descriptions is one a caller has to walk again. Absent strategy and absent injection are different absences; do not read the first as licence for the second.

`packageEnumerator` uses `walkPackage` from `packageWalk.ts`, which already replaced `getPackageContentsList` in `handleGetPackageTree`.
- [ ] **Step 6: Run the tests and measure**
- [ ] **Step 7: Commit** — `refactor(system): the eleven consumers of members 19 removed`

---

## Task 24: The two class profiling handlers, and three parameters that now configure nothing

`RuntimeRunClass` and `RuntimeRunClassWithProfiling` take the same shape as the
two program ones in Task 23: `scheduleTrace`, then
`runWithProfiler(target, { profilerId })`.

**An earlier draft of this task built a `poll()` combinator for them. It was
wrong, and the package says so in its own words.** `IAdtExecutors.d.ts`:

> The three polling options are gone: a run does not wait for a trace, so
> "where to look", "how many times" and "how long between tries" were asking the
> caller to configure a search that no longer happens.

and, on the result:

> `traceId` is gone because a run cannot promise a trace that may not exist yet,
> may never exist, and may be read a week later. Reading a trace is
> `IProfiler.list()` and `read()`, whenever the caller is ready.

So there is no poll, no attempts, no delay, and no `trace_id` to answer. The
combinator is not written, and `poll` appears nowhere in this plan.

**What that leaves is a tool-surface question, and it is the user's.** These two
tools declare `max_trace_attempts`, `trace_retry_delay_ms` and
`trace_lookup_uris`, and answer a `trace_id`. All four now describe a search
that does not happen.

Three options, and the third is the one the package itself describes.

| option | what it means |
|---|---|
| **find the trace on this side** | `CLIENT_API_REFERENCE.md`: *"To find the one your run produced, note the ids before running and look for a new one."* List the profiler feed before scheduling, run, then poll `IProfiler.list()` until an id appears that was not there. `max_trace_attempts` and `trace_retry_delay_ms` keep their meaning and `trace_id` keeps answering. **Recommended**: it is the only option that keeps most of the contract. |
| **keep them as accepted no-ops** | the surface does not change, which is this work's rule, but the schema then advertises three parameters that do nothing and a field that is always null, and every description has to say so. |
| **remove them** | honest, and a change to the tool surface that Task 1's ratchet will refuse. Needs the user's decision and a release note. |

Ask before implementing. Do not quietly leave the parameters reading as though
they work.

**If the first option is chosen**, two warnings from the same reference decide
the implementation, and both are counter-intuitive enough to get wrong:

> Position in the feed is not age. A feed's first entries have been measured
> minutes old while its last were eight days older.

So "the newest trace" is not the first entry, and the id is found by set
difference against the snapshot, never by position. And:

> Comparing `recordedAt` as a string is wrong: `09:00:00Z` is later than
> `10:00:00+02:00` and sorts lower as text. Use the exported
> `compareRecordedAt`.

`src/__tests__/helpers/traceHelpers.ts` in adt-clients is the worked example the
reference points at. Read it before writing the loop.

**These two tools take no `detail`, and their projection is applied directly.**
`project(detail, terse)` reads an `AdtReading` — `reading.raw` at raw,
`reading.value ?? reading.raw` at full, `terse(reading.value, reading.status)`
at terse. What these handlers answer is not a reading: it is a composite this
repository assembles from two or three calls, and the executors give it neither
a document to be `raw` nor a status, since `IAdtResult<T>` is `{ value }` alone.
Passing the composite through `project()` would read `reading.value` as
`undefined`, hand that to the projection, and answer `adapter_threw`.

So the projection goes to `answer()` as itself — `terseClassRun`, not
`project(detail, terseClassRun)` — and the context carries `detail: 'terse'`.

That also settles whether these belong in Task 28's `detail` set: they do not.
The rule is that `detail` goes where the three levels differ, and here there is
no document for them to differ over. `detailWiring` expects a literal from a
tool that declares none, which is what this passes.

**Two output fields cannot survive any option, and that is a third decision.**
`run_status` and `trace_requests_status` come from the transport envelope, and
19 does not expose it to a caller: `ClassExecutor` takes no result strategy in
its constructor, `run` and `runWithProfiler` answer `IAdtResponse<string>`, and
`IAdtResult<T>` is `{ readonly value: T }` — one field, deliberately. There is
nowhere to read a status from.

So both fields are lost whatever Step 1 decides about the polling parameters.
Say so in the release note and in the tool descriptions; do not leave them in a
projection reading `undefined`, which is how a tool ends up answering
`"run_status": null` forever.

**`trace_lookup_uris` does not survive even option one, and that needs its own
answer.** `IProfilerListOptions` is `{ user?: string }` — the whole interface —
so there is nowhere to put a URI. Two ways out, and the first is preferred:

1. **Admit the parameter changed.** The feed is one endpoint now; listing it is
   not addressed by URI. Say so in the tool description and treat the parameter
   as accepted and ignored, with a release note. It is the only one of the four
   that loses its meaning under this option, which is a much smaller admission
   than the whole set.
2. **Issue a raw request per URI**, below `IProfiler`, rebuilding what the old
   member did. More code, in this repository, for a parameter whose value has
   not been measured — no corpus case uses a non-default lookup URI.

Whichever is chosen, it is a second decision and belongs in Step 1 beside the
first, not discovered while implementing.

**Files:**
- Modify: `src/handlers/system/readonly/handleRuntimeRunClass.ts`, `handleRuntimeRunClassWithProfiling.ts`
- Create: `src/__tests__/unit/runtimeProfiling.test.ts`, `src/lib/strategies/runProjections.ts` — the two projections, the `RuntimeRunValue` they read and the one-parameter `RuntimeProjection` they are typed as, which is **not** `Terse`
- Create, if Step 1 chose the first option: `src/lib/strategies/newTrace.ts` and `src/__tests__/unit/newTrace.test.ts`
- Modify, **in every option**: `src/lib/strategies/sequence.ts` — export the one-line `IAdtResponse` builder `pair()` already has, rather than writing a third copy of it. All three options call `succeededWith` to join the class name with what the run answered; only the trace id is particular to the first
- Modify, if Step 1 chose the third option: the two tool definitions and `tests/fixtures/tools/surface.json`

**These two handlers are mocked differently from every other task.** They
construct `new AdtExecutor(connection, logger)` rather than calling
`createAdtClient`, so the test mocks `@mcp-abap-adt/adt-clients` and returns a
stub from `getClassExecutor()`. Mocking `../../lib/clients` here would compile,
run, and test a real executor.

- [ ] **Step 1: Put the surface question to the user**

Show them the table above, and recommend the first option: it is the only one
that keeps the contract the tools already advertise, and the package documents
how to do it.

Write the answer into the test file as a constant — `const OPTION = '...'` — so
the assertions below flip with it rather than being edited by hand into
agreement with whatever was built. Their answer decides whether Step 3 also
edits the tool definitions and whether the feed search is written at all.

- [ ] **Step 2: Write the failing tests**

```typescript
// src/__tests__/unit/runtimeProfiling.test.ts
import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeRunClass } from '../../handlers/system/readonly/handleRuntimeRunClass';
import { handleRuntimeRunClassWithProfiling } from '../../handlers/system/readonly/handleRuntimeRunClassWithProfiling';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

// A new file, so nothing is in scope from anywhere else — unlike the tasks that
// extend an existing test.
const context = { connection: {} as any, logger: undefined };

// The answer Step 1 recorded. Written once, here, so the assertions below
// follow the decision instead of being edited into agreement with whatever
// was built.
const OPTION: 'find-the-trace' | 'accepted-no-ops' | 'removed' = 'find-the-trace';

let classExecutor: Record<string, unknown>;
let profiler: Record<string, unknown>;
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtExecutor: jest.fn(() => ({ getClassExecutor: () => classExecutor })),
  // `AdtRuntimeClient`, which is what the package exports and what
  // `handleRuntimeAnalyzeProfilerTrace` and `handleRuntimeListSystemMessages`
  // already construct. There is no `AdtRuntime`; mocking that name intercepts
  // nothing and the handler reaches the real dependency.
  AdtRuntimeClient: jest.fn(() => ({ getProfiler: () => profiler })),
}));

// Two different ids, deliberately. `scheduleTrace` answers a PROFILER REQUEST
// id, which `runWithProfiler` consumes; the completed trace gets a different id
// and appears in the feed later. A test that names both 'trace-1' passes for an
// implementation that confuses them, which is the easiest mistake here.
const PROFILER_REQUEST = 'profiler-request-1';
const COMPLETED_TRACE = 'completed-trace-7';

const handlers = [
  ['RuntimeRunClass', handleRuntimeRunClass, { class_name: 'ZCL_X', profile: true }],
  ['RuntimeRunClassWithProfiling', handleRuntimeRunClassWithProfiling, { class_name: 'ZCL_X' }],
] as const;

// `RuntimeRunClass` has TWO branches and only one of them profiles. Without
// this, a migration that routes every run through the profiler workflow passes
// every other test in this file — they all pass `profile: true`.
it('RuntimeRunClass without profile runs the class and touches no profiler', async () => {
  const run = jest.fn(async () => okResponse('output'));
  const schedule = jest.fn();
  const withProfiler = jest.fn();
  const list = jest.fn();
  classExecutor = { run, scheduleTrace: schedule, runWithProfiler: withProfiler };
  profiler = { list };
  // The mocked constructor itself, so "does not construct AdtRuntimeClient" is
  // asserted rather than approximated by "did not call list()". A handler that
  // builds the client and asks it nothing passes the weaker check.
  (AdtRuntimeClient as unknown as jest.Mock).mockClear();

  const result: any = await handleRuntimeRunClass(context as any, {
    class_name: 'ZCL_X', profile: false,
  });

  expect(run).toHaveBeenCalledTimes(1);
  expect(schedule).not.toHaveBeenCalled();
  expect(withProfiler).not.toHaveBeenCalled();
  // Not even the snapshot: a plain run must not read the profiler feed, and
  // must not construct AdtRuntimeClient at all.
  expect(list).not.toHaveBeenCalled();
  expect(AdtRuntimeClient as unknown as jest.Mock).not.toHaveBeenCalled();
  const payload = JSON.parse(result.content[0].text);
  expect(payload.output).toBe('output');
  expect(payload.profile).toBeUndefined();
});

it.each(handlers)('%s passes the scheduled id to the profiler run', async (_n, handler, args) => {
  const order: string[] = [];
  let passed: unknown;
  classExecutor = {
    scheduleTrace: async () => { order.push('schedule'); return okResponse(PROFILER_REQUEST); },
    runWithProfiler: async (_target: unknown, options: any) => {
      order.push('run');
      passed = options?.profilerId;
      return okResponse('done');
    },
  };
  profiler = { list: async () => okResponse([]) };
  // One attempt and no delay. Under the recommended option this handler polls,
  // and the defaults are five attempts two seconds apart — eight seconds per
  // parametrised case, against Jest's five-second timeout. This test is about
  // the id travelling, not about the search.
  await (handler as any)(context as any, { ...args, max_trace_attempts: 1, trace_retry_delay_ms: 0 });
  expect(order).toEqual(['schedule', 'run']);
  // The order alone proves nothing about the join: a handler calling
  // `runWithProfiler` with no id, the wrong id or a constant passes an order
  // check and fails in production.
  expect(passed).toBe(PROFILER_REQUEST);
});

it.each(handlers)('%s stops at a refused schedule and never runs', async (_n, handler, args) => {
  const run = jest.fn();
  classExecutor = {
    scheduleTrace: async () => refusedResponse('Trace scheduling refused'),
    runWithProfiler: run,
  };
  profiler = { list: async () => okResponse([]) };
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Trace scheduling refused');
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
  expect(run).not.toHaveBeenCalled();
});

it.each(handlers)('%s finds the trace by difference, not by position', async (_n, handler, args) => {
  if (OPTION !== 'find-the-trace') return;
  // The feed already holds an entry, and it is LAST in document order with the
  // newest `recordedAt`. An implementation that takes the first entry, or the
  // last, or sorts the strings, picks the wrong one — only the difference
  // against the snapshot gives the right answer.
  // The feed is built to fail three wrong implementations at once.
  //
  //  · no snapshot, take the first entry        → picks `older`, which was there
  //  · no snapshot, take the last entry         → picks `decoy`, which was there
  //  · difference, but sort recordedAt as text  → picks `decoy`, see below
  //
  // `COMPLETED_TRACE` sits in the MIDDLE of document order, and its timestamp
  // is 09:00 UTC against the decoy's 10:30+02:00, which is 08:30 UTC. So it is
  // the newer of the two fresh entries while sorting LOWER as a string — the
  // exact trap `compareRecordedAt` exists for.
  const older  = { id: 'completed-trace-1', recordedAt: '2026-09-13T10:00:00+02:00' };
  const stale  = { id: 'completed-trace-2', recordedAt: '2026-09-13T11:00:00+02:00' };
  const produced = { id: COMPLETED_TRACE,   recordedAt: '2026-09-14T09:00:00Z' };
  const decoy  = { id: 'completed-trace-9', recordedAt: '2026-09-14T10:30:00+02:00' };

  // The FIRST call is the snapshot and must not contain either fresh id — an
  // id already in `before` can never be the new one, and a mock that returns
  // it from the start asks the implementation to be wrong.
  let listed = 0;
  classExecutor = {
    scheduleTrace: async () => okResponse(PROFILER_REQUEST),
    runWithProfiler: async () => okResponse('done'),
  };
  profiler = {
    list: async () =>
      okResponse(++listed === 1 ? [older, stale] : [older, produced, stale, decoy]),
  };

  const result: any = await (handler as any)(context as any, {
    ...args, max_trace_attempts: 3, trace_retry_delay_ms: 0,
  });
  const payload = JSON.parse(result.content[0].text);
  expect(payload.profile?.trace_id ?? payload.trace_id).toBe(COMPLETED_TRACE);
  // Snapshot, then at least one more read. One call means no snapshot.
  expect(listed).toBeGreaterThan(1);
});

it.each(handlers)('%s reports a refused feed read rather than an empty feed', async (_n, handler, args) => {
  if (OPTION !== 'find-the-trace') return;
  // Spies, not plain functions: the claim is that nothing runs, and only a
  // call count can say so. A handler that schedules and runs before the
  // snapshot, or carries on after its refusal, returns the same error and
  // would pass a test that only reads the message.
  const schedule = jest.fn(async () => okResponse(PROFILER_REQUEST));
  const run = jest.fn(async () => okResponse('done'));
  classExecutor = { scheduleTrace: schedule, runWithProfiler: run };
  profiler = { list: async () => refusedResponse('Profiler feed not authorised') };

  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Profiler feed not authorised');
  expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
  expect(schedule).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
});

it.each(handlers)('%s reports a refusal during the search, not a missing trace', async (_n, handler, args) => {
  if (OPTION !== 'find-the-trace') return;
  let call = 0;
  classExecutor = {
    scheduleTrace: async () => okResponse(PROFILER_REQUEST),
    runWithProfiler: async () => okResponse('done'),
  };
  // The snapshot succeeds; the poll is refused. Reporting "no trace yet" here
  // would be the masking defect: SAP answered, and it said no.
  profiler = {
    list: async () =>
      ++call === 1 ? okResponse([]) : refusedResponse('Session expired'),
  };
  const result: any = await (handler as any)(context as any, {
    ...args, max_trace_attempts: 3, trace_retry_delay_ms: 0,
  });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Session expired');
});

it.each(handlers)('%s stops after max_trace_attempts and still reports the run', async (_n, handler, args) => {
  if (OPTION !== 'find-the-trace') return;
  let listed = 0;
  classExecutor = {
    scheduleTrace: async () => okResponse(PROFILER_REQUEST),
    runWithProfiler: async () => okResponse('done'),
  };
  profiler = { list: async () => { listed += 1; return okResponse([]); } };

  const result: any = await (handler as any)(context as any, {
    ...args, max_trace_attempts: 2, trace_retry_delay_ms: 0,
  });
  // The snapshot plus two attempts.
  expect(listed).toBe(3);
  // A run that worked with no trace written yet is a SUCCESS with no trace id.
  // SAP writes it asynchronously and it may arrive a week later.
  expect(result.isError).toBe(false);
  const payload = JSON.parse(result.content[0].text);
  expect(payload.profile?.trace_id ?? payload.trace_id).toBeUndefined();
});

// No `reading(...)` anywhere in this file, unlike every other handler test in
// the plan. The executors and the profiler take no injected result strategy, so
// their `IAdtResponse` carries the plain value — a string, an array of entries —
// and wrapping it in an `AdtReading` would hand `sequence` an object where the
// implementation expects an id, and `newTraceAfter` an object where it expects
// an array.

// The two answer the id in DIFFERENT PLACES, so this cannot be parametrised
// on the field: `RuntimeRunClass` nests it under `profile`, and the deprecated
// `RuntimeRunClassWithProfiling` puts it at the top level. A shared assertion
// on the top-level field passes for the first handler without touching it.
it.each([
  ['RuntimeRunClass', handleRuntimeRunClass, { class_name: 'ZCL_X', profile: true },
    (p: any) => p.profile?.trace_id],
  ['RuntimeRunClassWithProfiling', handleRuntimeRunClassWithProfiling, { class_name: 'ZCL_X' },
    (p: any) => p.trace_id],
])('%s answers its trace id where its own schema puts it', async (_n, handler, args, at) => {
  classExecutor = {
    scheduleTrace: async () => okResponse(PROFILER_REQUEST),
    runWithProfiler: async () => okResponse('done'),
  };
  // Empty snapshot, then the produced trace — the same order as a real run.
  let seen = 0;
  profiler = {
    list: async () =>
      okResponse(++seen === 1 ? [] : [{ id: COMPLETED_TRACE, recordedAt: '2026-09-14T09:00:00Z' }]),
  };
  const result: any = await (handler as any)(context as any, args);
  const payload = JSON.parse(result.content[0].text);
  const found = (at as any)(payload);
  // Each tool's own shape, not a shared one: `RuntimeRunClass` answers
  // `output`, and the deprecated handler does not and must not start to.
  expect(payload.success).toBe(true);
  expect(payload.class_name).toBe('ZCL_X');
  expect('output' in payload).toBe(_n === 'RuntimeRunClass');
  // `run_status` and `trace_requests_status` are gone on both — the status is
  // not in the 19 contract. Absent, not null, and looked for WHERE EACH TOOL
  // PUTS IT: `RuntimeRunClass` nests `trace_requests_status` inside `profile`,
  // so checking the top level would have been false before the migration too
  // and proved nothing.
  expect('run_status' in payload).toBe(false);
  if (_n === 'RuntimeRunClass') {
    expect('trace_requests_status' in (payload.profile ?? {})).toBe(false);
  } else {
    expect('trace_requests_status' in payload).toBe(false);
  }

  // Under option one, the id the feed search produced. Under the other two it
  // is absent, and the assertion flips with the decision Step 1 recorded —
  // which is why that decision is a step and not a remark.
  expect(found).toBe(OPTION === 'find-the-trace' ? COMPLETED_TRACE : undefined);
});
```

The corpus holds no profiling exchange, so these run on fakes. Say so in the
file's header rather than implying the behaviour is measured.

- [ ] **Step 3: Write the helper's own tests, if Step 1 chose the first option**

Everything that can go wrong in the search lives in `newTraceAfter`, and the
handler tests exercise it only through two handlers and one happy path. These
are its own.

```typescript
// src/__tests__/unit/newTrace.test.ts
import { newTraceAfter } from '../../lib/strategies/newTrace';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

const entry = (id: string, recordedAt: string) => ({ id, recordedAt });
const feed = (...entries: ReturnType<typeof entry>[]) => okResponse(entries);
const never = async () => { throw new Error('should not have waited'); };

it('answers on the first read when a new id is already there, without waiting', async () => {
  const list = jest.fn(async () => feed(entry('new-1', '2026-09-14T09:00:00Z')));
  const found = await newTraceAfter({ list } as any, new Set(), {
    attempts: 5, delayMs: 2000, sleep: never,
  });
  expect(found.ok).toBe(true);
  expect(found.getResult().value).toBe('new-1');
  expect(list).toHaveBeenCalledTimes(1);
});

it('ignores every id that was already in the snapshot', async () => {
  const before = new Set(['old-1', 'old-2']);
  const found = await newTraceAfter(
    { list: async () => feed(entry('old-1', '2026-09-14T12:00:00Z'), entry('old-2', '2026-09-14T11:00:00Z')) } as any,
    before,
    { attempts: 1, delayMs: 0, sleep: never },
  );
  // Nothing new, so no id — and a SUCCESS, because nothing refused anything.
  expect(found.ok).toBe(true);
  expect(found.getResult().value).toBeUndefined();
});

it('picks the newest of several new ids, by time and not by text', async () => {
  // 09:00Z is 09:00 UTC; 10:30+02:00 is 08:30 UTC. The first is later in time
  // and lower as a string, which is what compareRecordedAt is for.
  const found = await newTraceAfter(
    { list: async () => feed(
      entry('new-late', '2026-09-14T09:00:00Z'),
      entry('new-early', '2026-09-14T10:30:00+02:00'),
    ) } as any,
    new Set(),
    { attempts: 1, delayMs: 0, sleep: never },
  );
  expect(found.getResult().value).toBe('new-late');
});

it('waits between attempts and stops at the count it was given', async () => {
  const slept: number[] = [];
  const list = jest.fn(async () => feed());
  const found = await newTraceAfter({ list } as any, new Set(), {
    attempts: 3, delayMs: 250, sleep: async (ms) => { slept.push(ms); },
  });
  expect(list).toHaveBeenCalledTimes(3);
  // Two waits for three attempts: none after the last.
  expect(slept).toEqual([250, 250]);
  expect(found.ok).toBe(true);
  expect(found.getResult().value).toBeUndefined();
});

it('hands a refused read straight back and stops asking', async () => {
  const list = jest.fn(async () => refusedResponse('Session expired'));
  const found = await newTraceAfter({ list } as any, new Set(), {
    attempts: 5, delayMs: 0, sleep: never,
  });
  expect(found.ok).toBe(false);
  expect(found.getError().message).toBe('Session expired');
  // Once. Retrying past a refusal is asking a question already answered, and
  // exhausting the attempts would turn it into "no trace yet".
  expect(list).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run them all to verify they fail**

- [ ] **Step 5: Implement**

Under options two and three there are two calls rather than three — but **not a
bare `sequence`**, for the same reason option one is not: a sequence answers the
last step's value and nothing else, so the class name and the profiler id are
both gone by the time the projection runs. The tools answer `class_name` and
`profiler_id` today.

```typescript
return answer(
  { tool: 'RuntimeRunClass', detail: 'terse' },
  async () => {
    // `sequence` hands the next step the VALUE — it calls
    // `step(answer.getResult().value)` — so `id` is already the string.
    // `id.value` would read a property a string does not have and pass
    // `undefined` to the run. And it forgets the id afterwards, which is why
    // it is captured here.
    let profilerId = '';
    const ran = await sequence(
      () => executor.scheduleTrace(profilerParameters),
      (id: string) => {
        profilerId = id;
        return executor.runWithProfiler(target, { profilerId: id });
      },
    );
    if (!ran.ok) return ran;

    // No trace id under these options: nothing searched for one.
    return succeededWith({ className, output: ran.getResult().value, profilerId });
  },
  // The projection itself, not `project(...)`: see above — there is no reading
  // here, so `detail` has nothing to select between.
  terseClassRun,
);
```

**Under option one there is a third phase, and it is the whole point of that
option.** Snapshot the feed, run, then look for an id that was not there:

```typescript
// src/lib/strategies/newTrace.ts
import { compareRecordedAt } from '@mcp-abap-adt/adt-clients';
import type { IAdtError, IAdtResponse, ITraceEntry } from '@mcp-abap-adt/interfaces';


/**
 * The id this run produced, found by difference.
 *
 * Not by position: `CLIENT_API_REFERENCE.md` measured a feed whose first
 * entries were minutes old and whose last were eight days older, so "the first
 * id in the document" is a trace chosen at random. Not by `recordedAt` as a
 * string either — `09:00:00Z` sorts below `10:00:00+02:00` while being later —
 * which is what `compareRecordedAt` is exported for.
 */
export async function newTraceAfter(
  profiler: { list: (o?: { user?: string }) => Promise<IAdtResponse<ITraceEntry[], IAdtError>> },
  before: ReadonlySet<string>,
  options: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<IAdtResponse<string | undefined, IAdtError>> {
  const wait = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const listed = await profiler.list();

    // A refused feed read goes back untouched — the rule `sequence` and
    // `withLock` already follow. Looping past it would turn "SAP said no" into
    // "no trace yet", which is this repository's masking defect in another coat.
    if (!listed.ok) return listed as unknown as IAdtResponse<string | undefined, IAdtError>;

    const fresh = listed.getResult().value.filter((entry) => !before.has(entry.id));
    if (fresh.length > 0) {
      return answered([...fresh].sort(compareRecordedAt).at(-1)?.id);
    }
    if (attempt < options.attempts) await wait(options.delayMs);
  }

  // Attempts spent, the feed answering normally every time. A success with no
  // trace id: SAP writes it asynchronously and it may arrive a week later.
  // Nothing refused anything, so there is nothing to report as a failure.
  return answered(undefined);
}

const answered = (value: string | undefined): IAdtResponse<string | undefined, IAdtError> =>
  ({
    ok: true,
    getResult: () => ({ value }),
    getError: () => { throw new Error('newTraceAfter: asked for the error of a success'); },
  }) as unknown as IAdtResponse<string | undefined, IAdtError>;
```

and the handler:

```typescript
// All three phases INSIDE the callback `answer()` runs. Every `return` below
// hands back an `IAdtResponse`, which is what `answer()` renders; returning one
// from the handler itself would hand the caller an internal object instead of
// an MCP result with `content` and `isError`, and the tests parse that result.
const profiler = new AdtRuntimeClient(connection, logger).getProfiler();

return answer(
  { tool: 'RuntimeRunClass', detail: 'terse' },
  async () => {
    // 1. the snapshot. A refused feed read is a refusal, not an empty feed.
    const snapshot = await profiler.list();
    if (!snapshot.ok) return snapshot;
    const before = new Set(snapshot.getResult().value.map((entry) => entry.id));

    // 2. schedule, then run — the same two calls as the program handlers.
    // `sequence` hands the id to the next step and then forgets it, so capture
    // it on the way through — the projection needs it and cannot reach back.
    let profilerId = '';
    const ran = await sequence(
      () => executor.scheduleTrace(profilerParameters),
      (id: string) => {
        profilerId = id;
        return executor.runWithProfiler(target, { profilerId: id });
      },
    );
    if (!ran.ok) return ran;

    // 3. the search. A run that succeeded with no trace written yet is still a
    // successful run: the id is absent, not an error.
    const found = await newTraceAfter(profiler, before, {
      attempts: max_trace_attempts ?? 5,
      delayMs: trace_retry_delay_ms ?? 2000,
    });
    if (!found.ok) return found;

    // The WHOLE value the projection reads, built here. A projection cannot
    // reach the class name, which came from `args`, nor the profiler request
    // id, which `sequence` consumed on its way through.
    return succeededWith({
      className,
      output: ran.getResult().value,
      profilerId,          // captured from the schedule step, see below
      traceId: found.getResult().value,
    });
  },
  // The projection itself, not `project(...)`: see above — there is no reading
  // here, so `detail` has nothing to select between.
  terseClassRun,
);
```

`succeededWith` is the same one-line `IAdtResponse` builder `pair()` uses to
join two values; lift it out of `sequence.ts` rather than writing a third copy.

**Two projections, not one, because the two tools answer differently.** This is
the same fact the trace-id test already parametrises on, and it reaches the
projection too:

```typescript
// src/lib/strategies/runProjections.ts

/**
 * What a runtime handler hands its projection.
 *
 * Assembled here from two or three calls, so there is no document, no parse and
 * no status — `IAdtResult<T>` is `{ value }` alone.
 */
export interface RuntimeRunValue {
  readonly className: string;
  readonly output?: string;
  readonly profilerId?: string;
  readonly traceId?: string;
}

/**
 * **Not `Terse`.** `Terse<T>` is `(value, status) => unknown` and `answer()`
 * takes `(value) => unknown`: TypeScript lets a function drop a parameter, not
 * gain a required one, so a `Terse` cannot be passed where `answer()` wants a
 * projection. Typing these as `Terse` would compile in the file that declares
 * them and fail at the call.
 *
 * There is no status to take here anyway, which is the same reason `project()`
 * is not used on this path.
 */
type RuntimeProjection = (value: RuntimeRunValue) => unknown;


/**
 * `RuntimeRunClass`: profiler fields nested under `profile`, and `output` at the
 * top whether or not it profiled.
 *
 * `run_status` is gone and cannot come back — see the decision above. Do not add
 * it reading `undefined`.
 */
export const terseClassRun: RuntimeProjection = (value) => ({
  success: true,
  class_name: value.className,
  output: value.output ?? '',
  ...(value.traceId !== undefined || value.profilerId
    ? { profile: { profiler_id: value.profilerId, trace_id: value.traceId } }
    : {}),
});

/**
 * The deprecated `RuntimeRunClassWithProfiling`: the profiler fields flat, and
 * **no `output`** — this tool does not answer one today, and this work does not
 * add fields to a deprecated tool.
 */
export const terseProfilingRun: RuntimeProjection = (value) => ({
  success: true,
  class_name: value.className,
  profiler_id: value.profilerId,
  trace_id: value.traceId,
});
```

Copy the field names out of each handler as it stands rather than from here —
this is the shape, and the handler is the authority on the names. Assert **every
field each one answers today**, not only `trace_id`: a projection that keeps the
id and drops `run_status` passes the trace-id test and breaks the tool.

Edit the tool definitions only if Step 1 said to.

- [ ] **Step 6: Run everything and measure**

```bash
# every option
npx jest src/__tests__/unit/runtimeProfiling.test.ts src/__tests__/unit/toolSurface.test.ts

# option one only — the other two never create this file
npx jest src/__tests__/unit/newTrace.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

If Step 1 chose to remove the parameters, `toolSurface.test.ts` fails by design:
regenerate the snapshot in the same commit and say in the message that the
surface changed on the user's instruction.

- [ ] **Step 7: Commit**

**Run only the block for the option Step 1 chose.** The three are alternatives,
not a sequence: the first names files the others never create, and the third
moves a snapshot the others must leave alone.

Option one, find the trace on this side:

```bash
git add src/handlers/system/readonly/handleRuntimeRunClass*.ts \
        src/__tests__/unit/runtimeProfiling.test.ts src/lib/strategies/runProjections.ts \
        src/lib/strategies/newTrace.ts src/lib/strategies/sequence.ts \
        src/__tests__/unit/newTrace.test.ts
git status --short
git commit --no-verify -m "refactor(system): the class profiling handlers schedule, run, then find the trace

tsc: <before> → <after>"
```

Option two, accepted no-ops:

```bash
git add src/handlers/system/readonly/handleRuntimeRunClass*.ts \
        src/__tests__/unit/runtimeProfiling.test.ts src/lib/strategies/runProjections.ts \
        src/lib/strategies/sequence.ts
git status --short
git commit --no-verify -m "refactor(system): the class profiling handlers schedule, then run

The polling parameters are accepted and ignored; the descriptions say so.

tsc: <before> → <after>"
```

Option three, removed — the surface moves, so the snapshot moves with it in the
same commit:

```bash
git add src/handlers/system/readonly/handleRuntimeRunClass*.ts \
        src/__tests__/unit/runtimeProfiling.test.ts src/lib/strategies/runProjections.ts \
        src/lib/strategies/sequence.ts tests/fixtures/tools/surface.json
git status --short
git commit --no-verify -m "refactor(system)!: the class profiling handlers schedule, then run

BREAKING: max_trace_attempts, trace_retry_delay_ms and trace_lookup_uris are
removed and no trace_id is answered, on the user's instruction. A run does not
wait for a trace; read one with the profiler tools when it exists.

tsc: <before> → <after>"
```

---

## Task 25: The library files, and the last of the compiler's list

**Files:** `src/lib/utils.ts`, `src/lib/checkRunParser.ts`, `src/lib/search-source/{sourceReader,packageResolver}.ts`, `src/embeddable/BaseMcpServer.ts`, and whatever the compiler still names.

- [ ] **Step 1: Regenerate the list**

```bash
npx tsc --noEmit 2>&1 | grep -E '^src/.*error' | sed -E 's/\(.*//' | sort | uniq -c | sort -rn
```

- [ ] **Step 2: Write a test for each behaviour about to change**, from the corpus. `checkRunParser.ts` has `normalizeCheckResponse.test.ts` already — extend it rather than starting a new file.
- [ ] **Step 3: Run them to verify they fail**, then fix file by file, most errors first.
- [ ] **Step 4: Run the full check**

```bash
npx tsc --noEmit && echo CLEAN
npx jest
```

Expected: `CLEAN`, and the whole unit suite green. From here the pre-commit hook works, so drop `--no-verify`.

- [ ] **Step 5: Commit** — `refactor(lib): the last of the envelope reads`

---

## Task 26: The invariants, and what the legacy contract decides alone

Three of the spec's success criteria are claims about 326 files. A reviewer cannot check those by reading, and neither can the next person to add a handler.

**Files:**
- Create: `src/__tests__/unit/handlerInvariants.test.ts` — the three invariants
- Create: `src/__tests__/unit/analyseOmissions.test.ts` — the controls, run against the fixtures
- Create: `src/__tests__/fixtures/analyse/` — twelve modules, named for the verdict each must produce: `yes-inline.ts`, `yes-const.ts`, `yes-spread-then-analyse.ts`, `no-absent.ts`, `no-empty-literal.ts`, `no-typed-empty-const.ts`, `no-explicit-undefined.ts`, `no-shorthand-undefined.ts`, `unknown-analyse-then-spread.ts`, `unknown-maybe-undefined.ts`, `unknown-conditional.ts`, `unknown-reassigned-let.ts`
- Create: `src/__tests__/unit/legacyContract.test.ts` — the seventeen legacy members that decide alone
- Consume: `src/lib/audit/analyseOmissions.ts` and `scripts/check-analyse.ts`, both written in Task 10. This task adds no implementation — it adds the fixtures that hold every verdict the module can reach, and the repo-wide run

`tsconfig.json` already excludes `src/__tests__` from the build, so the fixtures typecheck under `tsconfig.test.json` and never reach `dist`. Run `npm run test:check` once they exist: a fixture that does not compile is one whose signature the checker cannot resolve, and the whole test would then pass while inspecting nothing.

- [ ] **Step 1: Write the invariants**

```typescript
// src/__tests__/unit/handlerInvariants.test.ts
import { globSync, readFileSync } from 'node:fs';
import { analyseOmissions } from '../../lib/audit/analyseOmissions';

const handlers = globSync('src/handlers/**/handle*.ts');

/** The envelope is gone; a file still naming it is a file still on 18. */
it('no handler reads an envelope property', () => {
  const ENVELOPE = /\.(readResult|metadataResult|deleteResult|createResult|updateResult|unlockResult|activateResult|validationResponse|checkResult)\b/;
  expect(handlers.filter((f) => ENVELOPE.test(readFileSync(f, 'utf8')))).toEqual([]);
});

/** The verdict belongs to `analyse`. A handler reading the document to decide
 *  is a second opinion beside the strategy's, and the two will disagree. */
it('no handler decides a refusal for itself', () => {
  const VERDICT = /exc:exception|del:isDeleted|activationExecuted|chkrun:status|CHECK_RESULT/;
  expect(handlers.filter((f) => VERDICT.test(readFileSync(f, 'utf8')))).toEqual([]);
});

/**
 * Resolved by the compiler, not matched by a regex over the text.
 *
 * Three earlier drafts of this test used a member-name allowlist and each was
 * wrong: `fetchNodeStructure` has an options parameter and accepts no strategy;
 * `AdtPackageLegacy.readMetadata<E>()` is generic and takes no parameters at
 * all; and `readMetadata` accepts one on thirty classes and not on
 * `AdtPackageLegacy`. A name cannot answer the question, so ask the type.
 *
 * Passing an `analyse` where it is not accepted is already a compile error, so
 * only the omission needs checking here.
 */
it('every client call that accepts an analyse is given one', () => {
  // The same function `scripts/check-analyse.ts` has been running per family
  // since Task 10. Here it runs over the whole tree, which is what the spec
  // makes a success criterion.
  const { offenders, inspected } = analyseOmissions(handlers);
  expect(inspected).toBeGreaterThan(200);
  expect(offenders).toEqual([]);
});
```

Every failure names a file. Fix the file, never the regex. A genuine exception goes in the test with a sentence saying why, so a reviewer sees it.

- [ ] **Step 2: Commit the controls as fixtures, not as a ritual**

Every verdict `carriesAnalyse` reaches has been wrong at least once: it read only
inline literals, then only types, then left to right, then ignored `undefined`,
then followed a `let`. Each fix was checked by hand with a `sed` and a revert,
and **not one of them is protected**. A permanent test over the real tree only
exercises the call shapes that happen to be in it today, so the next change to
this function breaks a shape nobody writes yet and the suite stays green.

So the controls become files. One tiny module per case, named for the verdict it
must produce, under `src/__tests__/fixtures/analyse/`. They import the real
client type so the checker resolves real signatures, and `declare const` keeps
them from needing a connection.

```typescript
// src/__tests__/fixtures/analyse/yes-inline.ts
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
declare const client: AdtClient;
export const call = () =>
  client.getClass().read({ className: 'X' }, 'active', { analyse: analyseException });
```

Twelve of them, and the name is the assertion:

| fixture | the call it makes | verdict |
|---|---|---|
| `yes-inline.ts` | `{ analyse: analyseException }` | yes |
| `yes-const.ts` | `const o = { analyse: analyseException }` | yes |
| `yes-spread-then-analyse.ts` | `{ ...opaque(), analyse: analyseException }` | yes |
| `no-absent.ts` | no options argument at all | no |
| `no-empty-literal.ts` | `{}` | no |
| `no-typed-empty-const.ts` | `const o: IAdtOperationOptions = {}` | no |
| `no-explicit-undefined.ts` | `{ analyse: undefined }` | no |
| `no-shorthand-undefined.ts` | `const analyse = undefined; { analyse }` | no |
| `unknown-analyse-then-spread.ts` | `{ analyse: analyseException, ...opaque() }` | unknown |
| `unknown-maybe-undefined.ts` | `{ analyse: maybe }` typed `T \| undefined` | unknown |
| `unknown-conditional.ts` | `{ analyse: strict ? analyseException : undefined }` | unknown |
| `unknown-reassigned-let.ts` | `let o = { analyse: x }; o = {}` | unknown |

```typescript
// src/__tests__/unit/analyseOmissions.test.ts
import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { basename } from 'node:path';
import { analyseOmissions } from '../../lib/audit/analyseOmissions';

const fixtures = globSync('src/__tests__/fixtures/analyse/*.ts');

it('has a fixture for every verdict, and finds them all', () => {
  // A glob that matched nothing would make every assertion below vacuous.
  expect(fixtures).toHaveLength(12);
});

it('inspects nothing when given nothing, and the script turns that into a failure', () => {
  // The module reports the fact; the script decides it is a failure. Both
  // halves are asserted, because the module answering `inspected: 0` is
  // correct and the script exiting 0 on it would not be.
  expect(analyseOmissions([])).toEqual({ offenders: [], inspected: 0 });

  const run = (pattern: string) =>
    spawnSync('npx', ['tsx', 'scripts/check-analyse.ts', pattern], { encoding: 'utf8' });

  const noMatch = run('src/handlers/**/handleNoSuchThing*.ts');
  expect(noMatch.status).toBe(2);
  expect(noMatch.stderr).toContain('no files matched');

  const noCalls = run('src/__tests__/fixtures/analyse/../../helpers/*.ts');
  expect(noCalls.status).toBe(2);
  expect(noCalls.stderr).toContain('no call accepted an analyse');
});

it.each(fixtures)('%s produces the verdict its name claims', (file) => {
  const expected = basename(file).split('-')[0];           // yes | no | unknown
  const { offenders, inspected } = analyseOmissions([file]);
  expect(inspected).toBe(1);
  if (expected === 'yes') {
    expect(offenders).toEqual([]);
    return;
  }
  expect(offenders).toHaveLength(1);
  // The two failures are reported differently on purpose: one says a strategy
  // is missing, the other says it cannot be proved from the source. A change
  // that collapses them loses the instruction to the author.
  expect(offenders[0]).toContain(
    expected === 'no' ? 'no analyse passed' : 'not provable from the source',
  );
});
```

- [ ] **Step 3: Run them, and make one fail on purpose**

```bash
npx jest src/__tests__/unit/analyseOmissions.test.ts   # 14 assertions, all green
```

Then break `carriesAnalyse` in the one way each round of review already found —
scan the object literal left to right instead of right to left — and confirm
that `yes-spread-then-analyse` and `unknown-analyse-then-spread` both fail. They
are the pair that catches it, and a suite where only one of them exists would
have let that bug through with the offender count unchanged.

- [ ] **Step 4: Check the whole tree, once**

```bash
npx jest src/__tests__/unit/handlerInvariants.test.ts
```

The repo-wide run keeps the `inspected` bound, which guards against a program
that resolved nothing. The fixtures guard the logic; the bound guards the setup.
Neither substitutes for the other.

- [ ] **Step 5: Pin what the legacy contract drops**

`SAP_SYSTEM_TYPE=legacy` is a supported deployment running a subset of the tools through **these same handler files**. `available_in` hides the tools that cannot run on legacy at all, not the 144 that can.

```typescript
// src/__tests__/unit/legacyContract.test.ts
/**
 * Where the legacy contract decides for itself.
 *
 * Passing a strategy these members have no parameter for is harmless —
 * JavaScript drops it — but the verdict is then adt-clients', and a refusal
 * encoded inside a 200 stays masked on a legacy system. Pinned so the set
 * cannot grow without someone saying so, and so the release notes can name it.
 * The real fix is one contract across a class and its Legacy twin: issue #200.
 */
const PINNED = {
  AdtPackageLegacy: ['create', 'read', 'readMetadata', 'updateMetadata', 'delete', 'validate'],
  AdtUnitTestLegacy: ['run', 'getStatus', 'getResult'],
  AdtRequestLegacy: ['delete', 'updateMetadata', 'list'],
  AdtUtilsLegacy: ['activateObjectsGroup', 'getTableContents', 'getTableColumns', 'getSqlQuery'],
};

it('pins the legacy members that take no strategy', () => {
  const found: Record<string, string[]> = {};
  for (const file of globSync('node_modules/@mcp-abap-adt/adt-clients/dist/core/**/*Legacy.d.ts')) {
    const cls = file.split('/').pop()!.replace('.d.ts', '');
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const members = new Set<string>();
    for (const m of src.matchAll(/^ {4}([a-zA-Z]\w*)(<[^>]*>)?\s*\(([\s\S]*?)\)\s*:\s*Promise</gm)) {
      const decl = (m[2] ?? '') + m[3];
      if (!/IAdtOperationOptions|IAdtCreateOptions|analyse/.test(decl) && m[1] !== 'constructor') {
        members.add(m[1]);
      }
    }
    if (members.size > 0) found[cls] = [...members].sort();
  }
  // A new entry means a legacy tool quietly lost its verdict. Decide, then pin.
  expect(found).toEqual(
    Object.fromEntries(Object.entries(PINNED).map(([k, v]) => [k, [...v].sort()])),
  );
});
```

- [ ] **Step 6: Run everything this task added**

```bash
npx jest src/__tests__/unit/analyseOmissions.test.ts \
         src/__tests__/unit/handlerInvariants.test.ts \
         src/__tests__/unit/legacyContract.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/unit/handlerInvariants.test.ts \
        src/__tests__/unit/analyseOmissions.test.ts \
        src/__tests__/unit/legacyContract.test.ts \
        src/__tests__/fixtures/analyse/ \
        src/lib/audit/analyseOmissions.ts
git commit -m "test(handlers): the invariants, their controls, and what legacy decides alone"
```

`git status --short` before committing: twelve fixtures are easy to half-stage, and a control that is not committed is a control that does not exist.

---

## Task 27: The twenty-three tools that reach a legacy contract

```bash
for f in $(grep -rl "available_in" src/handlers --include='handle*.ts' | xargs grep -l "'legacy'"); do
  grep -qE "get(Package|Request|Utils|UnitTest)\(" "$f" && echo "${f#src/handlers/}"
done
```

**Files:**
- Modify: the twenty-three the command above lists, under `src/handlers/`
- Modify: `src/lib/audit/analyseOmissions.ts` — add `legacyExposure()` beside it
- Create: `src/__tests__/unit/legacyExposure.test.ts`, `tests/fixtures/legacy-handlers.json`, `tests/fixtures/legacy-exposure.json`, and four fixtures under `src/__tests__/fixtures/legacy/` — `chain.ts`, `aliased.ts`, `asserted.ts`, `not-on-legacy.ts`

**Task 26's pin does not hold this.** `legacyContract.test.ts` reads the
`*Legacy.d.ts` declarations and knows nothing about which member any handler
calls — all twenty-three could stay exactly as they are and it would still be
green. What holds this is a ledger of the pairs that remain, and it belongs
here, with the task that creates them.

The package tools, the unit-test tools, three listing tools and `handleActivateObject`.

- [ ] **Step 1: Measure what the twenty-three call today**

Add a second function to the audit module — the AST walk is already there, and
this needs the same receiver resolution:

```typescript
// src/lib/audit/analyseOmissions.ts — append
import { globSync, readFileSync } from 'node:fs';

/**
 * Which `(handler, Legacy class, member)` pairs land on a member the legacy
 * contract does not parameterise.
 *
 * A handler reaches a member through `client.getPackage().readMetadata(...)`,
 * so the factory name is the property access one level in. That factory decides
 * which class serves the call on a legacy system, and only four of the ten
 * overridden classes drop the strategy.
 */
const LEGACY_NO_STRATEGY: Record<string, readonly string[]> = {
  getPackage: ['create', 'read', 'readMetadata', 'updateMetadata', 'delete', 'validate'],
  getUnitTest: ['run', 'getStatus', 'getResult'],
  getRequest: ['delete', 'updateMetadata', 'list'],
  getUtils: ['activateObjectsGroup', 'getTableContents', 'getTableColumns', 'getSqlQuery'],
};

/**
 * The handlers a legacy system can actually reach.
 *
 * **The ledger is meaningless without this filter.** 48 handlers call the four
 * factories whose `Legacy` class drops the strategy, and 25 of them are not
 * offered on legacy at all — the package creates, the searches, the transport
 * tools. Recorded unfiltered, the ledger would carry more false entries than
 * real ones and read as a much worse problem than exists.
 *
 * A file with no `available_in` is available everywhere, legacy included. No
 * handler is in that state today; the branch is here because the field is
 * optional by contract, not because something needs it.
 */
export function legacyEnabledHandlers(pattern = 'src/handlers/**/handle*.ts'): string[] {
  const AVAILABLE_IN = /available_in\s*:\s*\[([^\]]*)\]/;
  // Either quote style. The repository writes single quotes today, and a
  // formatter switching them would otherwise empty this list without a word.
  const LEGACY = /['"`]legacy['"`]/;
  return globSync(pattern).filter((file) => {
    const declared = AVAILABLE_IN.exec(readFileSync(file, 'utf8'));
    return declared === null || LEGACY.test(declared[1]);
  });
}

export function legacyExposure(handlers: string[]): string[] {
  const program = ts.createProgram(handlers, compilerOptions());
  const checker = program.getTypeChecker();
  const found = new Set<string>();
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    for (const call of memberCallsIn(source)) {
      const access = call.expression as ts.PropertyAccessExpression;
      const member = access.name.getText();
      const factory = factoryOf(access.expression, checker);
      if (factory !== undefined && LEGACY_NO_STRATEGY[factory]?.includes(member)) {
        found.add(`${file.replace('src/handlers/', '')} → ${factory}().${member}`);
      }
    }
  }
  return [...found].sort();
}

/**
 * Which factory produced this receiver?
 *
 * **Both forms, because handlers use both.** 188 call sites are the direct
 * chain `client.getPackage().read(...)`; 109 hold the object in a local first —
 * `const utils = client.getUtils(); utils.getSqlQuery(...)` — and
 * `handleGetPackageContents` is one of them, which is to say one of the
 * twenty-three this ledger exists for. A walk that recognised only the chain
 * would miss the majority of what it is meant to record, and would do it
 * quietly: a shorter ledger reads like progress.
 *
 * Only a `const` is followed, for the reason `carriesAnalyse` follows only a
 * `const`: a rebound `let` no longer describes what the initializer says.
 */
function factoryOf(receiver: ts.Expression, checker: ts.TypeChecker): string | undefined {
  if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
    return receiver.expression.name.getText();
  }
  if (ts.isIdentifier(receiver)) {
    const declaration = checker.getSymbolAtLocation(receiver)?.declarations?.[0];
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstBinding(declaration)
    ) {
      return factoryOf(declaration.initializer, checker);
    }
  }
  // Everything that wraps an expression without changing which factory made
  // it. `as any` is the one that matters: seven handlers write
  // `const unitTest = client.getUnitTest() as any`, three of them among the
  // twenty-three this ledger is for, and an assertion is invisible to a walk
  // that only knows about calls and identifiers.
  if (
    ts.isAwaitExpression(receiver) ||
    ts.isParenthesizedExpression(receiver) ||
    ts.isAsExpression(receiver) ||
    ts.isTypeAssertionExpression(receiver) ||
    ts.isNonNullExpression(receiver) ||
    ts.isSatisfiesExpression(receiver)
  ) {
    return factoryOf(receiver.expression, checker);
  }
  return undefined;
}
```

```bash
# the set of handlers legacy is offered, pinned
npx tsx -e "
  const { legacyEnabledHandlers } = require('./src/lib/audit/analyseOmissions');
  console.log(JSON.stringify(legacyEnabledHandlers().sort(), null, 2));
" > tests/fixtures/legacy-handlers.json
wc -l tests/fixtures/legacy-handlers.json   # 144 handlers, so ~146 lines

# and which of them land on a member that decides alone
npx tsx -e "
  const { legacyExposure, legacyEnabledHandlers } = require('./src/lib/audit/analyseOmissions');
  console.log(JSON.stringify(legacyExposure(legacyEnabledHandlers()), null, 2));
" > tests/fixtures/legacy-exposure.json
```

**Read the first file before committing it.** 326 handlers exist and 144 are
offered on legacy; a file holding 326 means the filter did not run, and one
holding a handful means it collapsed. Both look like a normal file from the
outside, and this is the only moment anyone looks.

After that the pinned set carries it: Step 4's first test compares
`legacyEnabledHandlers()` against this file exactly, so a filter that later
stops matching even one handler fails rather than shrinking the ledger.

- [ ] **Step 2: Prove the walk sees every call form before trusting the list**

Four fixtures, under `src/__tests__/fixtures/legacy/` — they exercise
`legacyExposure` rather than `analyseOmissions`, so they live apart from Task
26's twelve. Each is a shape counted on the real tree, not an invented one:

```typescript
// src/__tests__/fixtures/legacy/chain.ts — the direct form
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
declare const client: AdtClient;
export const call = () => client.getPackage().readMetadata({ packageName: 'ZP' });
```

```typescript
// src/__tests__/fixtures/legacy/aliased.ts — the form 109 call sites use
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
declare const client: AdtClient;
export const call = () => {
  const pkg = client.getPackage();
  return pkg.readMetadata({ packageName: 'ZP' });
};
```

```typescript
// src/__tests__/fixtures/legacy/asserted.ts — the form seven handlers use
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
declare const client: AdtClient;
export const call = () => {
  // Verbatim from handleGetClassUnitTestStatus, one of the twenty-three.
  const unitTest = client.getUnitTest() as any;
  return unitTest.getStatus({ className: 'ZCL_X' });
};
```

```typescript
// src/__tests__/fixtures/legacy/not-on-legacy.ts — a tool legacy never sees
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
declare const client: AdtClient;
export const TOOL_DEFINITION = {
  name: 'CreatePackage',
  available_in: ['onprem', 'cloud'] as const,
} as const;
export const call = () => client.getPackage().create({ packageName: 'ZP' });
```

```typescript
// in src/__tests__/unit/legacyExposure.test.ts
it('excludes a handler legacy is never offered', () => {
  const kept = legacyEnabledHandlers('src/__tests__/fixtures/legacy/*.ts');
  expect(kept).not.toContain('src/__tests__/fixtures/legacy/not-on-legacy.ts');
  // 25 of the 48 handlers that call these factories are in this position, so
  // an unfiltered ledger would carry more invented entries than real ones.
  expect(kept.length).toBe(3);
});

it.each([
  ['chain.ts', 'getPackage().readMetadata'],
  // 109 call sites take this shape.
  ['aliased.ts', 'getPackage().readMetadata'],
  // 7 take this one, 3 of them among the twenty-three. An assertion hides the
  // factory from a walk that knows only calls and identifiers.
  ['asserted.ts', 'getUnitTest().getStatus'],
])('sees the factory through %s', (fixture, pair) => {
  const found = legacyExposure([`src/__tests__/fixtures/legacy/${fixture}`]);
  // Every one of these must find exactly one, because [] is what a clean
  // result looks like and is therefore the wrong way to be wrong.
  expect(found).toHaveLength(1);
  expect(found[0]).toContain(pair);
});
```

Adjust the path prefix in the expected pair to whatever `legacyExposure`
actually produces; the assertion that matters is the length, because an empty
array is what success looks like here and so is the wrong way to be wrong.

- [ ] **Step 3: Walk the list and shrink it.** Where the handler can reach the same result through a member the `Legacy` class does parameterise, use it. Regenerate `tests/fixtures/legacy-exposure.json` **in the same commit as the change**, and read the diff: the pairs that left should be the ones you fixed, by name. A regeneration that drops pairs you never touched is the walk breaking, not the work landing.

- [ ] **Step 4: Commit what remains as a ledger, and hold it**

```typescript
// src/__tests__/unit/legacyExposure.test.ts
import { readFileSync } from 'node:fs';
import { legacyEnabledHandlers, legacyExposure } from '../../lib/audit/analyseOmissions';

/** Which handlers a legacy system is offered at all — the input to the ledger. */
it('finds exactly the handlers legacy is offered', () => {
  // The ledger below is fail-open without this, and a threshold is not enough.
  // A floor of "most of the tree" still allows the filter to quietly stop
  // matching thirty handlers: their exposures drop out of `actual`, the ledger
  // logs them as "fixed", and losing coverage reads as progress — which is the
  // most dangerous shape a defect can take in this repository.
  //
  // So the set is pinned, not counted. Adding a handler or changing its
  // `available_in` is a deliberate change to what legacy is offered, and
  // recording it here is the same discipline Task 1 applies to the tool
  // surface: the snapshot moves when someone means it to.
  const recorded: string[] = JSON.parse(
    readFileSync('tests/fixtures/legacy-handlers.json', 'utf8'),
  );
  expect(legacyEnabledHandlers().sort()).toEqual(recorded.sort());
});

/**
 * The pairs where a handler still lands on a legacy member that decides for
 * itself. On a legacy system those calls take adt-clients' verdict, so a
 * refusal encoded inside a 200 stays masked there.
 *
 * This is the ledger Task 26's pin cannot be: that one reads the library's
 * declarations, and all twenty-three handlers could sit on the old members
 * with it still green. This one reads the calls.
 *
 * **Exact equality, both directions.** An earlier draft failed only on a new
 * pair and logged a disappeared one, reasoning that failing when a handler is
 * fixed would punish the improvement. That was wrong twice. It made the whole
 * ledger fail-open — a regression in the AST walk stops seeing real calls,
 * every entry reads as "fixed", and losing the analysis looks exactly like
 * finishing the work — and it let this file, and the release notes built from
 * it, drift with nothing ever forcing the update.
 *
 * Regenerating the snapshot is part of making the fix, not a penalty for it.
 * That is the bargain every snapshot test makes, and the one Task 1 already
 * makes for the tool surface.
 */
it('lands on exactly the legacy members recorded, and no others', () => {
  const recorded: string[] = JSON.parse(readFileSync('tests/fixtures/legacy-exposure.json', 'utf8'));
  // Filtered, for the same reason the snapshot is: a tool not offered on
  // legacy never reaches a Legacy class, and recording it as exposure invents
  // a masking defect that cannot happen.
  const actual = legacyExposure(legacyEnabledHandlers());

  // An addition is a handler that moved onto a member which decides alone. A
  // disappearance is either a fix worth recording or a walk that stopped
  // working, and those two are indistinguishable from here — which is exactly
  // why neither may pass in silence.
  expect(actual.sort()).toEqual(recorded.sort());
});
```

- [ ] **Step 5: Run it, and prove it fails on a new entry**

```bash
npx jest src/__tests__/unit/legacyExposure.test.ts
```

Then point one migrated handler back at `getPackage().readMetadata(...)`, run it
again, and confirm the pair is named. Then the other direction: delete a pair
from the fixture without touching any handler, and confirm that fails too. A
ledger that has never refused in both directions is a file, not a check.

- [ ] **Step 6: Put the remainder where people read it** — the PR description and the release notes, with the issue number. A limitation recorded only in a JSON fixture is a limitation nobody outside this repository learns about.

- [ ] **Step 7: Commit** — `refactor(legacy): prefer the members that take our strategy, and record what is left`

---

## Task 28: `detail` on the JSON-answering tools

Last, deliberately: adding a parameter before the handlers honour it puts a lie on the tool surface.

**Files:**
- Modify: the `TOOL_DEFINITION` of every JSON-answering tool, and those handlers' `detail` argument
- Modify: `tests/fixtures/tools/surface.json` — regenerated, with `detail` as the only difference
- Create: `src/__tests__/unit/detailSurface.test.ts`
- Create: four fixtures under `src/__tests__/fixtures/detail/` — `declares-passes-none.ts`, `declares-indirect-context.ts`, `declares-shorthand.ts`, `declares-no-answer-call.ts`
- Modify: `src/lib/audit/analyseOmissions.ts` — add `detailWiring()`

- [ ] **Step 1: Enumerate the JSON-answering tools**

```bash
npx tsx scripts/list-tools.ts | node -e "
const rows = JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const r of rows) console.log(r.group, r.name, '|', r.inputs);
" > /tmp/all-tools.txt
```

**The test is whether an `AdtReading` is behind the answer**, not whether the
answer looks like JSON. `detail` exists to choose between the layers of a
reading — `raw` is the document as it arrived, `value` its parse, `terse` a
selection from that parse. Where no reading produced the answer there are no
layers, and the parameter cannot mean anything.

Three cases, and the rule sorts all three without an exception list:

| the answer | reading behind it | `detail` |
|---|---|---|
| a document handed through whole — `source_code` or `metadata` as the only field | one, but `raw` and the projection are the same bytes | no |
| a JSON object built from a parsed document | yes, with a parse and a document behind it | **yes** |
| a composite this repository assembles from several calls, with no document — the two runtime profiling tools | none: the executors take no result strategy, and `IAdtResult<T>` is `{ value }` | no |

The third row is why Task 24 hands its projection to `answer()` directly and
carries `detail: 'terse'`. That is not an exception granted to those two tools;
it is this rule reaching the same answer as for a pass-through, by the same
argument. A tool later given a reading gains `detail` with it.

- [ ] **Step 2: Write the failing test**

A schema and a behaviour are two claims, and the second needs its own check.
The rule is symmetrical, which makes it self-checking with no list to maintain:
a handler whose tool **declares** `detail` must pass `detailOf(args)`; one whose
tool **does not** must pass a literal.

```typescript
// src/lib/audit/analyseOmissions.ts — append

/**
 * Handlers whose `detail` argument disagrees with their own tool schema.
 *
 * Both directions are defects. A tool that offers `detail` and hardcodes
 * `'terse'` advertises a parameter it ignores. A tool that offers none and
 * calls `detailOf(args)` reads a parameter no caller can set — harmless today,
 * and a lie in the schema the day someone reads the handler to learn the
 * contract.
 */
export function detailWiring(handlers: string[]): string[] {
  const program = ts.createProgram(handlers, compilerOptions());
  const offenders: string[] = [];
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    // `DETAIL_PROPERTY` spread into the schema, or the property written out.
    const declares = /DETAIL_PROPERTY|\bdetail\s*:\s*\{/.test(source.getFullText());

    const calls = answerCallsIn(source);
    // No `answer()` at all is the emptiest way to pass: the loop below never
    // runs, so it can report nothing. A tool that declares `detail` and never
    // reaches the adapter has not wired the parameter — it has nowhere to.
    if (declares && calls.length === 0) {
      offenders.push(`${file} — tool declares detail and the handler never calls answer()`);
    }

    for (const call of calls) {
      const ctx = call.arguments[0];

      // A context this walk cannot read is not a pass. The failure being
      // guarded against is a tool that declares `detail` and never passes it,
      // and `continue` on an unreadable context is exactly how that escapes:
      // no property, no offender, invariant green.
      if (ctx === undefined || !ts.isObjectLiteralExpression(ctx)) {
        if (declares) {
          offenders.push(
            `${file}:${lineOf(source, call)} — tool declares detail, answer() context is not a literal this check can read`,
          );
        }
        continue;
      }

      const detail = ctx.properties.find((p) => p.name?.getText() === 'detail');
      if (detail === undefined) {
        if (declares) {
          offenders.push(
            `${file}:${lineOf(source, call)} — tool declares detail, answer() passes none`,
          );
        }
        continue;
      }

      // Shorthand `{ detail }` and a spread carry a value this walk cannot
      // follow to its source. Reported rather than skipped, for the same
      // reason: silence here reads as compliance.
      if (!ts.isPropertyAssignment(detail)) {
        offenders.push(
          `${file}:${lineOf(source, detail)} — detail passed in a form this check cannot read; write detailOf(args) or a literal`,
        );
        continue;
      }

      const value = detail.initializer;
      const dynamic = ts.isCallExpression(value) && value.expression.getText() === 'detailOf';
      if (declares !== dynamic) {
        offenders.push(
          `${file}:${lineOf(source, value)} — tool ${declares ? 'declares' : 'does not declare'} detail, handler passes ${value.getText()}`,
        );
      }
    }
  }
  return offenders;
}

/** Calls to `answer(...)` — the only place a detail reaches a caller. */
function answerCallsIn(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'answer') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}
```

```typescript
// src/__tests__/unit/detailSurface.test.ts
// The same flat `{ group, name, inputs }` rows Task 1 pins, with `inputs` a
// formatted string rather than a params array.
const surface: Array<{ group: string; name: string; inputs: string }> = JSON.parse(
  execFileSync('npx', ['tsx', 'scripts/list-tools.ts'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
);

/** Every tool whose input schema declares the parameter. */
const toolsDeclaring = (param: string): string[] =>
  surface
    .filter((t) => (t.inputs === '(none)' ? [] : t.inputs.split(', ')).includes(param))
    .map((t) => t.name);

it('declares detail on every JSON-answering tool and on no other', () => {
  expect(toolsDeclaring('detail').sort()).toEqual([...JSON_ANSWERING].sort());
});

// Three fixtures under `src/__tests__/fixtures/detail/`, one per way the
// absence hides: `declares-passes-none.ts` (no detail property at all),
// `declares-indirect-context.ts` (the context built in a variable) and
// `declares-shorthand.ts` (`{ detail }`). Each must produce exactly one
// offender; a walk that skips them produces none, which is what a correct
// repository also produces.
it.each([
  'declares-passes-none',
  'declares-indirect-context',
  'declares-shorthand',
  // The emptiest case, and the last one a loop-based check can miss: no
  // `answer()` in the file, so there is nothing to iterate and nothing to
  // report — indistinguishable from correct.
  'declares-no-answer-call',
])(
  'reports %s rather than skipping it',
  (fixture) => {
    expect(detailWiring([`src/__tests__/fixtures/detail/${fixture}.ts`])).toHaveLength(1);
  },
);

it('wires detail the way each tool schema claims', () => {
  // The test above says the parameter is offered. This one says it is read.
  // A handler can declare `detail` and keep `detail: 'terse'` hardcoded in its
  // `answer()` call — satisfying the schema test while ignoring the parameter
  // — and a behavioural test on one handler would never notice for the other
  // hundred.
  expect(detailWiring(globSync('src/handlers/**/handle*.ts'))).toEqual([]);
});

// One worked example beside the invariant, since `detailWiring` proves the
// argument is wired and not that the projection honours it.
//
// `detail` is a claim about SUCCESSES only — a failure carries raw_body at
// every level, and answerFailure.test.ts is where that is held.
it('answers raw as the document and terse as the summary', async () => {
  const terse: any = await handleCheckClass(context as any, { class_name: 'ZCL_X' });
  const raw: any = await handleCheckClass(context as any, { class_name: 'ZCL_X', detail: 'raw' });
  expect(raw.content[0].text).toContain('<?xml');
  expect(terse.content[0].text).not.toContain('<?xml');
});
```

`JSON_ANSWERING` is the list from Step 1, written into the test as data. The list is a decision, and a decision belongs where a reviewer can see it.

- [ ] **Step 3: Run it to verify it fails**
- [ ] **Step 4: Implement** — spread `DETAIL_PROPERTY` into those tools' `properties`, and replace the hardcoded `detail: 'terse'` in those handlers with `detailOf(args)`.
- [ ] **Step 5: Regenerate the snapshot and check the diff is only `detail`**

```bash
npx tsx scripts/list-tools.ts > tests/fixtures/tools/surface.json
git diff tests/fixtures/tools/surface.json | grep '^[-+]' | grep -v detail | grep -v '^[-+][-+]'
```

Expected: no output. Anything printed is a surface change this work was not allowed to make.

- [ ] **Step 6: Commit** — `feat(tools): detail on the tools whose answer is JSON`

---

## Task 29: Documentation, and the close

Releasing means updating everything the change touches, not only the changelog.

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, and whatever under `docs/` the grep below names
- Delete, after merge: `docs/superpowers/specs/2026-09-12-consumer-side-migration-design.md` and this plan

- [ ] **Step 1: Find the stale prose**

```bash
grep -rln "readResult\|metadataResult\|adt-clients 18\|activationRefusal\|deletionRefusal" README.md docs/ | grep -v superpowers
npm run docs:tools
```

- [ ] **Step 2: Update it**, with a migration note covering every behaviour this work changed:

  - `detail` is new and optional, on the tools Task 28 lists.
  - A read that used to answer `success: true` with a null body now answers an error.
  - A write that succeeded under a failed unlock now answers an error carrying `operation: 'succeeded'`.
  - On a legacy system the pairs in `tests/fixtures/legacy-exposure.json` take adt-clients' verdict. Name them.
  - **`RuntimeRunClass` and `RuntimeRunClassWithProfiling` stop answering `run_status` and `trace_requests_status`.** The status is not in the 19 contract — `IAdtResult<T>` is `{ value }` — so this lands on every Task 24 option, not just one.
  - **Whichever Task 24 decision was taken, in its own words**: `trace_lookup_uris` accepted and ignored under the recommended option; all three polling parameters and `trace_id` removed under the third, which is breaking and must be labelled as such.

  A decision recorded only in a commit message is one no caller ever reads.
  Task 24 asked the user three questions; this is where the answers reach the
  people affected by them.
- [ ] **Step 3: Run everything**

```bash
npx tsc --noEmit && npm run lint:check && npx jest
```

- [ ] **Step 4: Ask the user before any integration run.** Integration tests hit a real SAP system and take 15–25 minutes; whether to run them, and against which session, is the user's call.

```bash
npm run test:integration 2>&1 | tee /tmp/integration-test.log
```

- [ ] **Step 5: Open the PR**, listing every decision this work took rather than only its diffstat:

  - the two behaviour changes above — the masked read and the masked unlock;
  - Task 13's `handleActivateObject` decision, per-object `activate` or the library change under #200;
  - Task 24's three answers: the polling option, `trace_lookup_uris`, and the two status fields that leave on every path;
  - Task 27's leftovers, the `(tool, member)` pairs where a legacy system still takes adt-clients' verdict.
- [ ] **Step 6: After merge, delete the spec and this plan**, per the project's lifecycle rule. History lives in git.

---

## Risks, named

- **The slot table is a judgement**, and Task 6 is where it is reviewable. If a slot wants `verbatim` rather than `structured` in some family, the corpus says so and Task 6's test is where it is recorded.
- **`statusOnly` on `created` changes what a create answers**, from whatever the body held to `'SUCCESS'`. The tool's schema does not change, so Task 1's ratchet stays green, but the answer's content does. It is a deliberate decision from the spec; a reviewer who disagrees should say so before Task 14, which applies it thirty times.
- **A write that succeeded under a failed unlock is now an error.** This is the spec's most arguable decision. It will surface in integration runs as new failures that are not regressions.
- **The corpus does not back every row.** A refused `create` is unrecorded for every family; `where-used` has only ever answered one hit; `transport list` has only ever answered empty; no captured check message carries `chkrun:t100Key`; there is no `dataElement` or `tabletype` metadata. Tests for those say plainly that they are unverified. Issue #200 tracks the gap.
- **A schema outlives its implementation.** `max_trace_attempts` and its
  siblings stayed in the tool surface after 19 removed the member that honoured
  them, and Task 1's ratchet cannot tell the difference — it compares schemas,
  not behaviour. Task 24 is the answer for the two handlers where this was
  found. If another parameter turns out to be promised and unread, it will be
  found the same way: by someone reading the schema against the code.
- **The invariant regexes in Task 26 are blunt** and will catch a comment mentioning `exc:exception`. That is the right direction to be wrong in; move the comment, do not loosen the pattern.

# Consumer-side migration onto adt-clients 19 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all 326 handlers off the adt-clients 18 envelope onto the 19 contract — injected result strategies, a per-call `analyse`, and handler-owned sequences — with the MCP tool surface unchanged except for a `detail` parameter on JSON-answering tools.

**Architecture:** Every handler answers through one adapter, `answer()`. The value it projects comes from a result strategy this repository injects into the client (`verbatim`, `structured`, `statusOnly`); the verdict on a failure comes from an `analyse` passed per call, taken from `@mcp-abap-adt/adt-strategies`. A handler that needs several endpoint calls owns the order itself — `sequence()` where the last answer is the result, `pair()` where both are, `withLock()` where a lock must be released on every path out.

**Spec:** `docs/superpowers/specs/2026-09-12-consumer-side-migration-design.md` — reviewed and approved 2026-09-13. Read it first; this plan argues from it and does not repeat its reasoning.

**Tech Stack:** TypeScript 5, `@mcp-abap-adt/adt-clients` 19.0.0, `@mcp-abap-adt/adt-strategies` 0.1.0, `@mcp-abap-adt/interfaces` 44.0.0, `fast-xml-parser`, Jest.

## Global Constraints

Every task's requirements implicitly include this section.

- **The tool surface does not change**, except `detail: 'terse' | 'full' | 'raw'` on JSON-answering tools. 362 tools across 6 groups; the snapshot frozen in Task 1 is the check.
- **No handler decides a refusal.** A handler must not read a status code, an `isDeleted`, a `chkrun:status` or an `exc:exception` to decide success. That verdict belongs to the `analyse` strategy.
- **No handler builds a failure sentence.** `answer()` renders the strategy's failure through its allowlist. `return_error(new Error(failure.message))` is a defect, not a migration step.
- **`analyse` on every call whose resolved signature accepts one** — resolved by the compiler, per (class, member). There is no shortcut: `fetchNodeStructure` has an `options` argument and accepts no strategy, and `AdtPackageLegacy.readMetadata<E>()` is generic with no parameters at all. Passing one where it is not accepted is already a compile error; the omission is what Task 18 tests.
- **`raw_body` never depends on `detail`.** Whenever the failure carries a non-empty string body it reaches the caller at every level and on every tool; where there is none the field is absent, never invented.
- **Nothing reaches a caller except by name.** `request` and `cleanup` are rebuilt field by field in `answer.ts`. The contract's types are not filters, and what sits on a transport config is headers, an Authorization bearer and cookies.
- **A lock chain is `withLock()`, never `sequence()`**, and only where the handler owns the lock's whole lifetime. The fifteen `low`-tier `LockX` tools hand the handle back on purpose and are never wrapped.
- **Legacy is in scope.** `SAP_SYSTEM_TYPE=legacy` selects `AdtClientLegacy`, which serves 144 of the 326 tools through these same handler files. Four `Legacy` classes drop the strategy on seventeen members; Task 18 pins them and Task 19 walks the twenty-three tools that reach them.
- **Never commit to `main`.** Work on `feat/answer-adapter`, PR and merge. Do not rewrite history.
- **The agent never runs `npm publish`.** The user publishes.
- **No live SAP calls.** Every test here runs offline against `tests/fixtures/adt/` — 48 cases, 61 exchanges, 27 endpoints. Integration runs are the user's call, after the compiler is clean.
- **Notes in adt-clients are not evidence.** Its strategies are injected, so its notes describe what it ships. A claim about ADT behaviour cites a fixture in `tests/fixtures/adt/` or says plainly that it is unverified.
- **Do not modify the 29 shared polygon objects** under `ZMCP_SHR_PKG`.
- **The pre-commit hook runs the full build**, which stays red until Task 17. Commit with `--no-verify` until then, and say so in the message.

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
| `src/__tests__/unit/handlerInvariants.test.ts` | no envelope read, no handler verdict, no missing `analyse` |
| `src/__tests__/unit/legacyContract.test.ts` | the seventeen legacy members that decide alone |

**Modified:** `src/lib/answer.ts`, `src/lib/strategies/sequence.ts`, 253 handler files, and six non-handler files carrying the same envelope reads (`src/lib/utils.ts`, `src/lib/checkRunParser.ts`, `src/lib/search-source/{sourceReader,packageResolver,packageEnumerator}.ts`, `src/embeddable/BaseMcpServer.ts`).

---

## Task 1: Freeze the tool surface

The spec's first success criterion is that 362 tools stay as they are. A test can check that; nothing else in this plan can.

**Files:**
- Create: `tests/fixtures/tools/surface.json`, `src/__tests__/unit/toolSurface.test.ts`

**Interfaces:**
- Consumes: `scripts/list-tools.ts`, which enumerates all six groups and already handles both input-schema shapes — plain JSON Schema, and the five handlers that declare a bare zod raw shape.
- Produces: the baseline every later task is measured against.

- [ ] **Step 1: Generate the snapshot**

```bash
mkdir -p tests/fixtures/tools
npx tsx scripts/list-tools.ts > tests/fixtures/tools/surface.json
node -e "const s=require('./tests/fixtures/tools/surface.json');console.log(Object.entries(s).map(([g,t])=>g+':'+t.length).join(' '))"
```

- [ ] **Step 2: Write the ratchet**

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
describe('the MCP tool surface', () => {
  const frozen = JSON.parse(
    readFileSync(join(__dirname, '../../../tests/fixtures/tools/surface.json'), 'utf8'),
  );
  const current = JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/list-tools.ts'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );

  it('has the same tools in the same groups', () => {
    const names = (surface: any) =>
      Object.fromEntries(
        Object.entries(surface).map(([group, tools]: [string, any]) => [
          group,
          (tools as any[]).map((t) => t.name).sort(),
        ]),
      );
    expect(names(current)).toEqual(names(frozen));
  });

  it('changes no parameter except by adding detail', () => {
    for (const [group, tools] of Object.entries<any>(frozen)) {
      for (const tool of tools as any[]) {
        const now = (current[group] as any[]).find((t) => t.name === tool.name);
        const added = now.params
          .map((p: any) => p.name)
          .filter((n: string) => !tool.params.some((p: any) => p.name === n));
        expect(added.every((n: string) => n === 'detail')).toBe(true);
        for (const before of tool.params) expect(now.params).toContainEqual(before);
      }
    }
  });
});
```

- [ ] **Step 3: Run it, expect PASS**

```bash
npx jest src/__tests__/unit/toolSurface.test.ts
```

This one is written green — it is a ratchet, not a red-green cycle.

- [ ] **Step 4: Prove it can fail**

Rename `ReadClass` to `ReadClassX` in `src/handlers/class/readonly/handleReadClass.ts`, run the test, confirm FAIL, revert. A ratchet nobody has seen fail is not known to work.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/safeFields.test.ts
```

Expected: FAIL — cannot find module `safeFields`.

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/safeFields.test.ts
```

Expected: PASS, all six.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing tests**

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

- [ ] **Step 2: Run them to verify they fail**

```bash
npx jest src/__tests__/unit/answerFailure.test.ts
```

Expected: FAIL — `raw_body` absent at `terse` and `full`; `cleanup` and `operation` dropped by the allowlist on both paths. The empty-answer case fails too, because `''` passes a bare string check.

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run the tests and the compiler**

```bash
npx jest src/__tests__/unit/answer*.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: tests PASS; the error count is not higher than it was.

- [ ] **Step 5: Commit**

```bash
git add src/lib/answer.ts src/__tests__/unit/answerFailure.test.ts
git commit --no-verify -m "fix(answer): a failure carries everything it has, at every detail"
```

---

## Task 4: `pair()` — both answers, the same failure rule

`sequence()` returns the last step's value, which serves a read-modify-write. It does not serve `handleReadClass`, which calls `read` and `readMetadata` and answers both. Without a combinator the handler captures the first value in a variable outside the run, which hands the ordering back to the handler one assignment at a time.

**Files:**
- Modify: `src/lib/strategies/sequence.ts`
- Test: `src/__tests__/unit/sequence.test.ts` (exists — extend)

**Interfaces:**
- Produces: `pair<A, B>(first, second): Promise<IAdtResponse<[A, B], IAdtError>>`

- [ ] **Step 1: Write the failing test**

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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/sequence.test.ts
```

Expected: FAIL — `pair is not a function`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/strategies/sequence.ts — append

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

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/sequence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/withLock.test.ts
```

Expected: FAIL — cannot find module `withLock`.

- [ ] **Step 3: Implement**

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
    return failure<T>({ ...released.error, operation: 'succeeded' } as IAdtError & CleanupCarrier);
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

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/withLock.test.ts src/__tests__/unit/answerFailure.test.ts
```

Expected: PASS, all ten plus Task 3's.

- [ ] **Step 5: Commit**

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
- Produces: `READING_BY_SLOT`, `resultsFor<R>(shipped: R): R`, `ourUtils`

- [ ] **Step 1: Write the failing test**

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
    const reading: any = resultsFor(classDocuments).created({ data: '', status: 200 } as any);
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

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/resultSets.test.ts
```

Expected: FAIL — cannot find module `resultSets`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/strategies/resultSets.ts
import { utilDocuments } from '@mcp-abap-adt/adt-clients';
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
 *  - **there is no body** → `statusOnly`. A create answers 200 with zero bytes,
 *    and so does a successful write. It still carries `raw` and `status`, so
 *    `detail: 'raw'` is answerable and `terseWrite` has a status to read.
 */
export const READING_BY_SLOT: Record<string, IResultStrategy<unknown>> = {
  source: verbatim, sourceDocument: verbatim, metadata: verbatim,
  transport: verbatim, include: verbatim, read: verbatim,

  created: statusOnly, updated: statusOnly, metadataUpdated: statusOnly, written: statusOnly,

  check: structured, cdsCheck: structured, activation: structured, validation: structured,
  deletion: structured, deleted: structured, deletionCheck: structured,
  classification: structured, generation: structured, publication: structured,
  odata: structured, bindingTypes: structured, list: structured, search: structured,
  whereUsed: structured, whereUsedScope: structured, folders: structured, types: structured,
  node: structured, objectStructure: structured, inactive: structured, results: structured,
  result: structured, run: structured, status: structured, query: structured,
  columns: structured, contents: structured, discovery: structured,
};

/** Stamp the table over a shipped result set, keeping that set's own keys. */
export function resultsFor<R extends Record<string, unknown>>(shipped: R): R {
  const out: Record<string, unknown> = {};
  for (const slot of Object.keys(shipped)) {
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
 * has to walk again.
 */
export const ourUtils = { ...resultsFor(utilDocuments), node: nodeLevel };
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/resultSets.test.ts
```

Expected: PASS. If the first test fails it names the slot — add it with the reading its tool promises. Do not widen the test.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/detail.test.ts`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run the tests** — `npx jest src/__tests__/unit/detail.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/strategies/detail.ts src/__tests__/unit/detail.test.ts
git commit --no-verify -m "feat(strategies): detail, declared once and read in one place"
```

---

## Task 8: The reference read — `handleReadClass`

The template for every read that calls `read` and `readMetadata`. It is also a bug fix: today the handler answers `success: true` with `source_code: null` when the read fails, which is the read-path masking defect.

**Files:**
- Modify: `src/handlers/class/readonly/handleReadClass.ts`
- Create: `src/__tests__/unit/handleReadClass.test.ts`

**Interfaces:**
- Consumes: `answer`, `pair`, `resultsFor`, `analyseException`, `AdtReading`.
- Produces: the shape Task 10 applies sixteen times.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/handleReadClass.test.ts
```

Expected: FAIL — the handler reads `readResult.readResult.data`, so `source_code` is `null` and both assertions fail.

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run the tests and measure**

```bash
npx jest src/__tests__/unit/handleReadClass.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

- [ ] **Step 5: Commit**, putting the measured count in the message

```bash
git add src/handlers/class/readonly/handleReadClass.ts src/__tests__/unit/handleReadClass.test.ts
git commit --no-verify -m "refactor(class): ReadClass answers through the adapter, and stops masking a refused read

tsc: <before> → <after>"
```

---

## Task 9: The reference write family — `domain/low`

The template for every `low`-tier family. One family, all seven operations, so the per-operation pairing is established in code before it is applied a hundred times.

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
| Deletion check | `checkDeletion` | `analyseDeletion` | `structured` | `terseDeletion` |

`lock` and `unlock` accept no strategy on any class in 19. Do not add an argument the signature does not have.

- [ ] **Step 1: Write the failing test, from the corpus**

```typescript
// src/__tests__/unit/domainLow.test.ts
import { analyseActivation, analyseDeletion, analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { corpusBody } from '../../lib/adtCorpus';

it('ValidateDomain reports an inadmissible name as an error', async () => {
  const document = corpusBody('refusal-validation-name-taken-domain--01-domains-validation');
  fakeClient = validating({ data: document, status: 200 });
  const result: any = await handleValidateDomain(context as any, {
    domain_name: 'ZD_TAKEN', package_name: 'ZP', description: 'x',
  });
  expect(result.isError).toBe(true);
});

it('ActivateDomain takes analyseActivation, and DeleteDomain analyseDeletion', async () => {
  const seen = recordAnalyse();
  await handleActivateDomain(context as any, { domain_name: 'ZD' });
  expect(seen.last).toBe(analyseActivation);
  await handleDeleteDomain(context as any, { domain_name: 'ZD', lock_handle: 'h' });
  expect(seen.last).toBe(analyseDeletion);
});

it('LockDomain passes no analyse, because lock() accepts none', async () => {
  const seen = recordAnalyse();
  await handleLockDomain(context as any, { domain_name: 'ZD' });
  expect(seen.last).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/domainLow.test.ts`. Expected: FAIL; no handler passes an `analyse` today.

- [ ] **Step 3: Implement, one operation per edit**

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

- [ ] **Step 4: Run the tests and measure**

```bash
npx jest src/__tests__/unit/domainLow.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep "handlers/domain/low" | wc -l   # expect 0
```

- [ ] **Step 5: Commit**

```bash
git add src/handlers/domain/low src/__tests__/unit/domainLow.test.ts
git commit --no-verify -m "refactor(domain): the low tier, on strategies — the reference family

tsc: <before> → <after>"
```

---

## Task 10: The sixteen `readonly` reads that call both members

Same shape as Task 8. Measured, not assumed — this is the list of handlers calling `read` and `readMetadata` both, minus `handleReadClass` (Task 8) and `handleGetFunctionModule` (Task 17, a `high` tool):

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

- [ ] **Step 1: Extend the existing surface-error test with one row per file**

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

- [ ] **Step 2: Run it to verify it fails** — every row fails; each handler answers `isError: false` today.

- [ ] **Step 3: Migrate, one file per edit**, applying Task 8's shape and changing four things: the factory, the shipped set, the config key, and the answer's field names, which stay exactly as that tool already returns them. Run the surface test after each file, not at the end.

- [ ] **Step 4: Run the tests and measure**

```bash
npx jest src/__tests__/unit/readHandlersSurfaceErrors.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

- [ ] **Step 5: Commit**

```bash
git add src/handlers/*/readonly/handleRead*.ts src/__tests__/unit/readHandlersSurfaceErrors.test.ts
git commit --no-verify -m "refactor(readonly): the sixteen two-call reads answer through the adapter

tsc: <before> → <after>"
```

---

## Task 11: The single-call reads, searches and listings

Fifteen `readonly` files that make one call: `handleReadMessageClass`, `handleReadMessageClassMessage`, `handleGetObjectsByType`, `handleGetObjectsList`, `handleSearchObject`, `handleGetAllTypes`, `handleGetInactiveObjects`, `handleGetObjectInfo`, `handleGetObjectStructure`, `handleGetSqlQuery`, `handleGetTableContents`, `handleListTransports`, `handleGetEnhancements`, `handleGetObjectVersionDiff`, `resolveVersionedObject`.

Confirm the list before starting: a file that turns out to call `readMetadata` as well belongs to Task 10's shape.

**Interfaces:**
- Consumes: `answer`, `resultsFor`, `ourUtils`, `project`, `detailOf`.
- Note: `search` accepts an `analyse` and gets one. The other utils-backed members here — `getObjectStructure`, `getAllTypes`, `getInactiveObjects`, `getSqlQuery`, `getTableContents` — accept none. Do not add an argument the signature does not have; the rule is written by signature for this reason.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/readonlySingleCall.test.ts
it.each([
  ['ReadMessageClass', handleReadMessageClass, { message_class_name: 'ZMC' }],
  ['GetObjectStructure', handleGetObjectStructure, { object_name: 'ZCL_X', object_type: 'CLAS' }],
  ['SearchObject', handleSearchObject, { query: 'ZCL*' }],
  ['ListTransports', handleListTransports, {}],
  ['GetSqlQuery', handleGetSqlQuery, { query: 'SELECT 1' }],
  // one row per file above
])('%s answers through the adapter and surfaces a refusal', async (_n, handler, args) => {
  fakeClient = refusingClient('Not found');
  const result: any = await (handler as any)(context as any, args);
  expect(result.isError).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/readonlySingleCall.test.ts`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit** — `refactor(readonly): the single-call reads, searches and listings`

---

## Task 12: `common/low` — the six generic operations, and the one real collision

`handleValidateObject`, `handleLockObject`, `handleUnlockObject`, `handleDeleteObject`, `handleCheckObject`, `handleActivateObject`. These dispatch over object families, so only one branch runs per call; keep each dispatch exactly as it is and change only how the call is made and answered.

**`handleActivateObject` is the one place where the design's rule and the library's surface collide.** It calls `activateObjectsGroup`, which accepts no strategy, and group activation is one of the two masking families this project has already fixed once — ADT answers 200 with the refusal inside.

- [ ] **Step 1: Decide `handleActivateObject`, and write the decision down**

Two options, and the choice belongs in the PR description either way:

1. **Call the per-object `activate`**, which does accept an `analyse`, looping over the objects. More requests; the verdict is ours.
2. **Keep `activateObjectsGroup`** and accept adt-clients' verdict, with a comment naming issue #200 and saying what is masked.

Prefer 1 where the tool takes one object, which is the common case. Do not silently pick 2.

- [ ] **Step 2: Write the failing test, from the corpus**

```typescript
// src/__tests__/unit/commonLowOperations.test.ts
it('reports a refused deletion as an error, though ADT answered 200', async () => {
  const document = corpusBody('refusal-delete-refused--01-deletion-delete');
  fakeClient = deleting({ data: document, status: 200 });
  const result: any = await handleDeleteObject(context as any, {
    object_type: 'CLAS', object_name: 'ZCL_X', lock_handle: 'h',
  });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).not.toContain('"success": true');
});

it('reports an inadmissible name as an error', async () => {
  const document = corpusBody('refusal-validation-name-taken-class--01-validation-objectname');
  fakeClient = validating({ data: document, status: 200 });
  const result: any = await handleValidateObject(context as any, {
    object_type: 'CLAS', object_name: 'ZCL_TAKEN', package_name: 'ZP',
  });
  expect(result.isError).toBe(true);
});

it('reports a refused activation as an error', async () => {
  const document = corpusBody('refusal-activation-fails--01-activation');
  fakeClient = activating({ data: document, status: 200 });
  const result: any = await handleActivateObject(context as any, {
    object_type: 'CLAS', object_name: 'ZCL_X',
  });
  expect(result.isError).toBe(true);
});
```

The third test is the one that decides Step 1: it passes under option 1 and fails under option 2. If option 2 is chosen, change the test to assert what is actually true and say in its name that the verdict is adt-clients'.

- [ ] **Step 3: Run them to verify they fail** — all three; these handlers mask today.
- [ ] **Step 4: Implement**, per Task 9's table.
- [ ] **Step 5: Run the tests and measure**
- [ ] **Step 6: Commit** — `refactor(common): the generic operations, with the strategy deciding`

---

## Tasks 13–16: The `low` tier, in four clusters

112 files, the most mechanical part of the migration. Task 9's per-operation table applies unchanged; what differs per family is the factory, the shipped set and the config key. **Commit per family**, so a reviewer can reject one family while approving its neighbour.

| task | families | files |
|---|---|---|
| **13** | `class` (11), `interface` (8), `behavior_definition` (8), `behavior_implementation` (3) | 30 |
| **14** | `ddl` (8), `ddlx` (8), `structure` (8), `table` (8) | 32 |
| **15** | `program` (8), `function` (14), `function_group`, `function_include` | 22+ |
| **16** | `data_element` (7), `package` (6), `service_binding` (1), `service_definition` (1), `system` (1), `transport` (1) | 17 |

For each family, in order:

- [ ] **Step 1: Measure** — `npx tsc --noEmit 2>&1 | grep "handlers/<family>/low" | wc -l`
- [ ] **Step 2: Write the family's test row** in `src/__tests__/unit/lowTierStrategies.test.ts`, asserting the pairing rather than the prose: what goes wrong at this scale is a handler taking the wrong `analyse`, and that is visible from the call.

```typescript
it.each(['class', 'interface', 'ddl', 'structure', 'table', 'program', 'data_element'])(
  '%s: activate takes analyseActivation, delete takes analyseDeletion, validate takes analyseValidation',
  async (family) => {
    const seen = recordAnalyse();
    await activateOf(family)(context as any, argsOf(family));
    expect(seen.last).toBe(analyseActivation);
    await deleteOf(family)(context as any, argsOf(family));
    expect(seen.last).toBe(analyseDeletion);
    await validateOf(family)(context as any, argsOf(family));
    expect(seen.last).toBe(analyseValidation);
  },
);
```

- [ ] **Step 3: Run it to verify it fails**
- [ ] **Step 4: Migrate the family**, then `npx tsc --noEmit 2>&1 | grep "handlers/<family>/low" | wc -l` — expect 0
- [ ] **Step 5: Run `npx jest src/__tests__/unit/toolSurface.test.ts`**
- [ ] **Step 6: Commit the family** — `refactor(<family>): the low tier, on strategies`

Do not batch two families into one commit.

---

## Task 17: The `high` tier `Get*` handlers

29 files: `handleGetClass`, `handleGetDomain`, `handleGetTable`, `handleGetStructure`, `handleGetProgram`, `handleGetInterface`, `handleGetDdl`, `handleGetDataElement`, `handleGetPackage`, `handleGetMessageClass`, `handleGetMessageClassMessage`, `handleGetFunctionGroup`, `handleGetFunctionModule`, `handleGetServiceBinding`, `handleGetServiceDefinition`, `handleGetMetadataExtension`, `handleGetBehaviorDefinition`, `handleGetBehaviorImplementation`, `handleGetLocalTestClass`, `handleGetLocalTypes`, `handleGetLocalDefinitions`, `handleGetLocalMacros`, `handleGetUnitTest`, `handleGetUnitTestStatus`, `handleGetUnitTestResult`, `handleGetCdsUnitTest`, `handleGetCdsUnitTestStatus`, `handleGetCdsUnitTestResult`, `handleListServiceBindingTypes`.

Each follows Task 8 (two calls, `pair`) or Task 11 (one call). The six unit-test readers take `analyseUnitTest` and `structured`; note that `AdtUnitTestLegacy` accepts no strategy on `run`, `getStatus` and `getResult`, which Task 22 pins.

- [ ] **Step 1: Extend `readonlySingleCall.test.ts` with one row per `Get*` handler**, asserting a refusal surfaces as `isError: true`
- [ ] **Step 2: Run it to verify it fails**
- [ ] **Step 3: Migrate**
- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit** — `refactor(high): the Get handlers answer through the adapter`

---

## Task 18: The `high` tier writes, under `withLock`

Every `high` update holds a lock for the whole call, which is exactly `withLock`'s shape and exactly what the thirteen `try/finally` handlers are doing by hand today. Those thirteen also flatten the strategy's failure into `return_error(new Error(message))` and log a failed unlock as a warning the caller never sees.

**Files:** the `high`-tier `Create*`, `Update*` and `Delete*` handlers — `class`, `interface`, `program`, `ddl`, `ddlx`, `structure`, `table`, `behavior_definition`, `behavior_implementation`, `service_definition`, `service_binding`, `message_class`, `function*`, `package`, `data_element`, `domain`, `transport`, `unit_test`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/highTierLocking.test.ts
it('releases the lock when the update is refused, and answers the update failure', async () => {
  const unlock = jest.fn(async () => okResponse(undefined));
  fakeClient = clientWhere({ update: refused('Update refused'), unlock });
  const result: any = await handleUpdateClass(context as any, {
    class_name: 'ZCL_X', source_code: 'x',
  });
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Update refused');
});

it('reports a succeeded write under a refused unlock as a failure naming both', async () => {
  fakeClient = clientWhere({ update: okResponse(''), unlock: refused('Unlock refused') });
  const result: any = await handleUpdateClass(context as any, {
    class_name: 'ZCL_X', source_code: 'x',
  });
  const payload = JSON.parse(result.content[0].text);
  expect(result.isError).toBe(true);
  expect(payload.message).toBe('Unlock refused');
  expect(payload.operation).toBe('succeeded');
});
```

- [ ] **Step 2: Run it to verify it fails** — today the unlock failure is a `logger.warn` and the handler answers success.
- [ ] **Step 3: Implement**

```typescript
// the shape
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
```

- [ ] **Step 4: Run the tests and measure**
- [ ] **Step 5: Commit** — `refactor(high): the writes hold their lock through withLock`

---

## Task 19: The four remaining read-modify-write families

`domain` is done and is the worked example. Four families take a whole document on 19 and `update` replaces rather than merges: `dataElement`, `package`, `functionGroup`, `tabletype`. Their update handlers pass a handful of named fields and no document, which under a replace is silent data loss.

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
        obj.updateMetadata({ dataElementName }, {
          lockHandle,
          xmlContent: patchDataElementXml(
            extractXmlString(current, `data element ${dataElementName}`), properties,
          ),
          analyse: analyseException,
        }),
    ),
  (lockHandle) => obj.unlock({ dataElementName }, lockHandle),
)
```

A `low`-tier update takes the handle as an argument and must not acquire or release one — it uses `sequence` alone.

- [ ] **Step 4: Run the tests** — `readModifyWrite.test.ts` must still show both halves: every metadata fixture survives `verbatim` character for character, and rebuilding one from its parse does not reproduce it.
- [ ] **Step 5: Commit** — `feat(update): four more families read, patch and write`

---

## Task 20: The eight handlers that called members 19 removed

These have no type error to fix — they have no member to call.

| file | removed member |
|---|---|
| `system/readonly/handleRuntimeRunClass.ts` | `runWithProfiling` |
| `system/readonly/handleRuntimeRunProgram.ts` | `runWithProfiling` |
| `system/readonly/handleRuntimeRunClassWithProfiling.ts` | `runWithProfiling` |
| `system/readonly/handleRuntimeRunProgramWithProfiling.ts` | `runWithProfiling` |
| `system/readonly/handleGetWhereUsed.ts` | `getWhereUsedList` |
| `structure/readonly/handleGetStructuresList.ts` | `getWhereUsedList` |
| `function_include/readonly/handleListFunctionModules.ts` | `listFunctionModules` |
| `function_include/readonly/handleListFunctionGroupIncludes.ts` | `listFunctionGroupIncludes` |
| `src/lib/search-source/packageEnumerator.ts` | `getPackageContentsList` |

- [ ] **Step 1: Establish what each removed member did, from the changelog and the corpus**

```bash
grep -rn "runWithProfiling\|getWhereUsedList\|listFunctionModules\|listFunctionGroupIncludes" \
  node_modules/@mcp-abap-adt/adt-clients/CHANGELOG.md | head -20
git show 57f0645 --stat   # the walk already moved, as the worked example
```

Write down the endpoint sequence each one issued **before** writing code. A sequence guessed from the old arguments is a guess.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/unit/runtimeProfiling.test.ts
it("stops at the first refused step and answers that step's failure", async () => {
  fakeClient = clientRefusingAt(1, 'Trace creation refused');
  const result: any = await handleRuntimeRunClassWithProfiling(context as any, { class_name: 'ZCL_X' });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Trace creation refused');
});
```

- [ ] **Step 3: Run it to verify it fails**
- [ ] **Step 4: Implement** each as `answer(ctx, () => sequence(...), project)`, every step whose member accepts one carrying its own `analyse`. The where-used and node-structure steps run on `AdtUtils` and accept none. `packageEnumerator` uses `walkPackage` from `packageWalk.ts`, which already replaced `getPackageContentsList` in `handleGetPackageTree`.
- [ ] **Step 5: Run the tests and measure**
- [ ] **Step 6: Commit** — `refactor(system): the handlers own the sequences 19 removed`

---

## Task 21: The library files, and the last of the compiler's list

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

## Task 22: The invariants, and what the legacy contract decides alone

Three of the spec's success criteria are claims about 326 files. A reviewer cannot check those by reading, and neither can the next person to add a handler.

**Files:** create `src/__tests__/unit/handlerInvariants.test.ts`, `src/__tests__/unit/legacyContract.test.ts`

- [ ] **Step 1: Write the invariants**

```typescript
// src/__tests__/unit/handlerInvariants.test.ts
import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';

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
      // meaningful only on a clean build, which is why it comes after Task 21.
      const options = signature?.parameters.at(-1);
      if (options === undefined) continue;
      const type = checker.getTypeOfSymbolAtLocation(options, call);
      if (!type.getProperties().some((p) => p.name === 'analyse')) continue;
      inspected += 1;
      const passed = call.arguments.at(-1);
      const given =
        passed !== undefined &&
        ts.isObjectLiteralExpression(passed) &&
        passed.properties.some((p) => p.name?.getText() === 'analyse');
      if (!given) offenders.push(`${file}:${lineOf(source, call)} — ${call.expression.getText()}`);
    }
  }
  // The guard against a test that measures nothing. A program built with wrong
  // options resolves no signature, finds no member that accepts an `analyse`,
  // and passes with an empty offenders list. Roughly 275 call sites across 174
  // handler files carry one, so a run that inspects a handful did not resolve.
  expect(inspected).toBeGreaterThan(200);
  expect(offenders).toEqual([]);
});

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

Every failure names a file. Fix the file, never the regex. A genuine exception goes in the test with a sentence saying why, so a reviewer sees it.

- [ ] **Step 2: Prove the third test can fail, and that it fails for the right reason**

Written after Task 21, this test is green the moment it runs, so it is a ratchet and needs the same proof Task 1's did — with one extra check, because a compiler-API test has a way of passing while measuring nothing.

```bash
# 1. a control call that should be caught: drop the analyse from one handler
sed -i 's/, { analyse: analyseException })/)/' src/handlers/class/readonly/handleReadClass.ts
npx jest src/__tests__/unit/handlerInvariants.test.ts   # expect FAIL naming that file and line
git checkout src/handlers/class/readonly/handleReadClass.ts
npx jest src/__tests__/unit/handlerInvariants.test.ts   # expect PASS again
```

The `inspected` bound in the test is the second half of the proof, and it needs seeing fail too. Break the program on purpose and confirm the bound catches it rather than the test passing quietly:

```bash
# temporarily replace compilerOptions() with `{}` and run
npx jest src/__tests__/unit/handlerInvariants.test.ts
# expect FAIL on `inspected` — a program with no paths resolves no signature,
# so nothing is inspected and the offenders list is empty for the wrong reason.
# Then restore compilerOptions().
```

- [ ] **Step 3: Pin what the legacy contract drops**

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

- [ ] **Step 4: Run both**

```bash
npx jest src/__tests__/unit/handlerInvariants.test.ts src/__tests__/unit/legacyContract.test.ts
```

- [ ] **Step 5: Commit** — `test(handlers): the invariants, and what the legacy contract decides alone`

---

## Task 23: The twenty-three tools that reach a legacy contract

```bash
for f in $(grep -rl "available_in" src/handlers --include='handle*.ts' | xargs grep -l "'legacy'"); do
  grep -qE "get(Package|Request|Utils|UnitTest)\(" "$f" && echo "${f#src/handlers/}"
done
```

The package tools, the unit-test tools, three listing tools and `handleActivateObject`.

- [ ] **Step 1: Walk the list once.** Where the handler can reach the same result through a member the `Legacy` class does parameterise, use it.
- [ ] **Step 2: Write down what is left** — the (tool, member) pairs where the legacy verdict stays adt-clients'. This goes in the PR description and the release notes, not in a comment nobody reads.
- [ ] **Step 3: Run the suite**
- [ ] **Step 4: Commit** — `refactor(legacy): prefer the members that take our strategy`

---

## Task 24: `detail` on the JSON-answering tools

Last, deliberately: adding a parameter before the handlers honour it puts a lie on the tool surface.

- [ ] **Step 1: Enumerate the JSON-answering tools**

```bash
npx tsx scripts/list-tools.ts | node -e "
const groups = JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const [g, tools] of Object.entries(groups)) for (const t of tools) console.log(g, t.name);
" > /tmp/all-tools.txt
```

A tool answers JSON unless it hands a document through as the whole answer. `source_code` or `metadata` as the only field is a pass-through; the same field inside a JSON object with others is JSON.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/unit/detailSurface.test.ts
it('declares detail on every JSON-answering tool and on no other', () => {
  expect(toolsDeclaring('detail').sort()).toEqual(JSON_ANSWERING.sort());
});

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

## Task 25: Documentation, and the close

Releasing means updating everything the change touches, not only the changelog.

- [ ] **Step 1: Find the stale prose**

```bash
grep -rln "readResult\|metadataResult\|adt-clients 18\|activationRefusal\|deletionRefusal" README.md docs/ | grep -v superpowers
npm run docs:tools
```

- [ ] **Step 2: Update it**, with a migration note: `detail` is new and optional; a read that used to answer `success: true` with a null body now answers an error; a write that succeeded under a failed unlock now answers an error carrying `operation: 'succeeded'`; and on a legacy system the tools listed in Task 23 take adt-clients' verdict.
- [ ] **Step 3: Run everything**

```bash
npx tsc --noEmit && npm run lint:check && npx jest
```

- [ ] **Step 4: Ask the user before any integration run.** Integration tests hit a real SAP system and take 15–25 minutes; whether to run them, and against which session, is the user's call.

```bash
npm run test:integration 2>&1 | tee /tmp/integration-test.log
```

- [ ] **Step 5: Open the PR**, listing the two behaviour changes above, the Task 12 decision and the Task 23 leftovers.
- [ ] **Step 6: After merge, delete the spec and this plan**, per the project's lifecycle rule. History lives in git.

---

## Risks, named

- **The slot table is a judgement**, and Task 6 is where it is reviewable. If a slot wants `verbatim` rather than `structured` in some family, the corpus says so and Task 6's test is where it is recorded.
- **`statusOnly` on `created` changes what a create answers**, from whatever the body held to `'SUCCESS'`. The tool's schema does not change, so Task 1's ratchet stays green, but the answer's content does. It is a deliberate decision from the spec; a reviewer who disagrees should say so before Task 13, which applies it thirty times.
- **A write that succeeded under a failed unlock is now an error.** This is the spec's most arguable decision. It will surface in integration runs as new failures that are not regressions.
- **The corpus does not back every row.** A refused `create` is unrecorded for every family; `where-used` has only ever answered one hit; `transport list` has only ever answered empty; no captured check message carries `chkrun:t100Key`; there is no `dataElement` or `tabletype` metadata. Tests for those say plainly that they are unverified. Issue #200 tracks the gap.
- **The invariant regexes in Task 22 are blunt** and will catch a comment mentioning `exc:exception`. That is the right direction to be wrong in; move the comment, do not loosen the pattern.

# Consumer-side migration onto adt-clients 19 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all 326 handlers off the adt-clients 18 envelope onto the 19 contract — injected result strategies, a per-call `analyse`, and handler-owned sequences — with the MCP tool surface unchanged except for a `detail` parameter on JSON-answering tools.

**Architecture:** Every handler answers through one adapter, `answer()`. The value it projects comes from a result strategy this repository injects into the client (`verbatim`, `structured`, `statusOnly`); the verdict on a failure comes from an `analyse` this repository passes per call, taken from `@mcp-abap-adt/adt-strategies`. Handlers that need several endpoint calls own the order themselves — `sequence()` where the last answer is the result, `pair()` where both are — and never compose an error of their own.

**How much of the tree that is:** 131 handlers make exactly one client call site and 113 make more, of which 4 are dispatches over object families where one branch runs and 18 call both `read` and `readMetadata`. Call sites, not calls per run. Tasks 5 to 13 are where each one is actually settled.

**Tech Stack:** TypeScript 5, `@mcp-abap-adt/adt-clients` 19.0.0, `@mcp-abap-adt/adt-strategies` 0.1.0, `@mcp-abap-adt/interfaces` 44.0.0, `fast-xml-parser`, Jest.

**Spec:** `docs/superpowers/specs/2026-09-12-consumer-side-migration-design.md`

## Global Constraints

- **The tool surface does not change**, except `detail: 'terse' | 'full' | 'raw'` added to JSON-answering tools. 362 tools across 6 groups; the frozen snapshot in Task 1 is the check.
- **No handler decides a refusal.** A handler must not read a status code, an `isDeleted`, a `chkrun:status` or an `exc:exception` to decide success. That verdict is the `analyse` strategy's.
- **`raw_body` never depends on `detail`.** Whenever the failure carries a string body it reaches the caller at every level and on every tool; where there is no string — a connection failure, an empty answer, a body the transport already parsed — the field is absent, never invented. `detail` shapes the result projection, and the failure payload is not a projection. Task 4 removes the gate that made this false.
- **Every acquired lock is released on every path out, and a failed release reaches the caller.** A lock chain is `withLock()`, never `sequence()`: a sequence stops at the first failure and would skip the unlock. This holds on the throw path too — a body that throws and a release that then fails must produce both facts, not just the throw. Logging a failed unlock as a warning, which is what the thirteen current update handlers do, is not reaching the caller.
- **Nothing reaches a caller except by name.** `request` and `cleanup` are rebuilt field by field in `answer.ts`, never passed through: the contract's types are not filters, and what is actually on a transport config is headers, an Authorization bearer and cookies. One narrowing function, used by both.
- **No handler builds a failure sentence.** `answer()` renders the strategy's failure through its allowlist. `return_error(new Error(failure.message))` is a defect, not a migration step.
- **`analyse` on every call that accepts one.** A call without one gets adt-clients' default verdict, which is a status-code reading, and that is the masking defect this repository has removed three times. The exception, measured: `lock(config)` and `unlock(config, lockHandle)` declare no options parameter in 19, so their verdict is the library's and cannot be injected. Task 14's invariant test excludes those two by name, with that sentence beside it.
- **Never commit to `main`.** Work on `feat/answer-adapter`, PR and merge. Do not rewrite history.
- **The agent never runs `npm publish`.** The user publishes.
- **No live SAP calls in this plan.** Every test here runs offline against `tests/fixtures/adt/` (48 cases, 61 exchanges, 27 endpoints). Integration runs are the user's call, after the compiler is clean.
- **Notes in adt-clients are not evidence.** Its strategies are injected, so its notes describe what it ships. A claim about ADT behaviour cites a fixture in `tests/fixtures/adt/` or says plainly that it is unverified.
- **Do not modify the 29 shared polygon objects** under `ZMCP_SHR_PKG`.
- Commit after every task. `npx tsc --noEmit` error count must fall monotonically, task to task — a sharp drop usually means a syntax error stopped the compiler, so read the count, not the feeling.

---

## Where the work is

`npx tsc --noEmit` reports **589 errors in 259 files** on `feat/answer-adapter` at commit `b18f4f1`. 499 of them are TS2339 — a handler reading an envelope property (`readResult`, `metadataResult`, `deleteResult`, `validationResponse`, `activateResult`, `createResult`, `updateResult`, `unlockResult`, `checkResult`) off `IAdtSuccess<string>`, which in 19 carries the strategy's value and nothing else.

| tier | files with errors |
|---|---|
| `low` | 112 |
| `high` | 93 |
| `readonly` | 48 |
| `src/lib`, `src/embeddable` | 6 |

The compiler is the worklist. Regenerate it at the start of every task:

```bash
npx tsc --noEmit 2>&1 | grep -E '^src/.*\([0-9]+,[0-9]+\): error' > /tmp/errs.txt
sed -E 's/\(.*//' /tmp/errs.txt | sort | uniq -c | sort -rn | head -30
```

## File structure

**Created:**

| file | responsibility |
|---|---|
| `src/lib/strategies/resultSets.ts` | one table from result-set slot name to reading, and `resultsFor()`, which stamps it over any shipped result set |
| `src/lib/strategies/detail.ts` | the `detail` input-schema fragment and the one function that reads it out of `args` |
| `tests/fixtures/tools/surface.json` | the frozen tool surface — 362 names with their parameter lists |
| `src/__tests__/unit/toolSurface.test.ts` | fails if the surface moves |
| `src/__tests__/unit/resultSets.test.ts` | every slot maps to a reading, and the readings behave as claimed on corpus documents |
| `src/__tests__/unit/handlerInvariants.test.ts` | no handler reads an envelope property, no handler decides a refusal |

**Modified:**

| file | change |
|---|---|
| `src/lib/strategies/sequence.ts` | add `pair()`, for a handler that needs both answers rather than the last |
| `src/lib/answer.ts` | import `AnswerDetail` from `projections.ts` instead of declaring a second copy |
| `src/handlers/**/handle*.ts` | 253 files, migrated family by family |
| `src/lib/search-source/*.ts`, `src/lib/checkRunParser.ts`, `src/lib/utils.ts`, `src/embeddable/BaseMcpServer.ts` | 6 non-handler files carrying the same envelope reads |

**Already deleted**, in the commit that added this plan: `docs/superpowers/specs/2026-09-09-tool-inventory.md`, `2026-09-09-tool-inventory-rows.md`, `2026-09-11-review-handover.md`, `2026-09-11-strategy-selection.md`, and the two plans under `docs/superpowers/plans/` that were finished or were never a plan. The inventory becomes the machine-checked snapshot of Task 1; the rest are superseded by the design doc. History is in git.

---

## Task 1: Freeze the tool surface, and retire the prose inventory

The spec's first success criterion is that 362 tools stay as they are. A 665 KB prose table cannot check that; a snapshot and a test can.

**Files:**
- Create: `tests/fixtures/tools/surface.json`
- Create: `src/__tests__/unit/toolSurface.test.ts`

The four superseded specs were already removed in the commit that added this plan; their cells were script-produced, so nothing is lost that `scripts/list-tools.ts` cannot reproduce.

**Interfaces:**
- Consumes: `scripts/list-tools.ts`, which already enumerates all six groups and handles both input-schema shapes (plain JSON Schema and the five bare zod raw shapes).
- Produces: `tests/fixtures/tools/surface.json` — the baseline every later task is measured against.

- [ ] **Step 1: Generate the snapshot**

```bash
mkdir -p tests/fixtures/tools
npx tsx scripts/list-tools.ts > tests/fixtures/tools/surface.json
node -e "const s=require('./tests/fixtures/tools/surface.json');console.log(Object.keys(s).length,'groups')"
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/unit/toolSurface.test.ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tool surface is a contract with callers who never read this repository.
 * `detail` is the one addition this migration is allowed to make; everything
 * else moving is a regression, and this is where it is caught.
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
        for (const before of tool.params) {
          expect(now.params).toContainEqual(before);
        }
      }
    }
  });
});
```

- [ ] **Step 3: Run it, expect PASS immediately**

```bash
npx jest src/__tests__/unit/toolSurface.test.ts
```

Expected: PASS. This test is a ratchet, not a red-green cycle — it is written green against the surface as it is today, and every later task keeps it green.

- [ ] **Step 4: Prove it fails when the surface moves**

Temporarily rename one tool (e.g. `ReadClass` → `ReadClassX` in `src/handlers/class/readonly/handleReadClass.ts`), run the test, confirm FAIL, then revert the rename. A ratchet nobody has seen fail is not known to work.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/tools/surface.json src/__tests__/unit/toolSurface.test.ts
git commit -m "test(surface): freeze the 362 tools, and retire the prose inventory"
```

---

## Task 2: `pair()` and `withLock()` — what `sequence()` does not cover

`sequence()` returns the last step's value and stops at the first failure. Two shapes it does not cover, and the second is a correctness bug if anyone tries:

**Both answers.** `handleReadClass` calls `read` and `readMetadata` and answers both. Without a combinator the handler captures the first value in a variable outside the sequence, which puts the ordering back in the handler's hands one assignment at a time.

**A held resource.** A lock-update-unlock chain in a `sequence()` would skip the unlock whenever the update is refused, and leave the object locked in SAP. Thirteen update handlers already use `try/finally` for this, and adt-clients' `LockRegistry` says in its own doc comment that it is "a safety net, NOT the primary defense" and that preventing this is the caller's job. Its `unlockAll()` runs at session end, so a dangling lock is recoverable, not permanent — but recovery is not a reason to leak one.

**Files:**
- Modify: `src/lib/strategies/sequence.ts` (add `pair`)
- Create: `src/lib/strategies/withLock.ts`, `src/lib/strategies/safeFields.ts`
- Test: `src/__tests__/unit/sequence.test.ts`, `src/__tests__/unit/withLock.test.ts`, `src/__tests__/unit/safeFields.test.ts`

**Interfaces:**
- Produces:
  - `pair<A, B>(first: () => Promise<IAdtResponse<A, IAdtError>>, second: (a: A) => Promise<IAdtResponse<B, IAdtError>>): Promise<IAdtResponse<[A, B], IAdtError>>`
  - `withLock<H, T>(acquire: () => Promise<IAdtResponse<H, IAdtError>>, body: (handle: H) => Promise<IAdtResponse<T, IAdtError>>, release: (handle: H) => Promise<IAdtResponse<unknown, IAdtError>>): Promise<IAdtResponse<T, IAdtError>>`
  - `safeRequest(value): { method?, url? } | undefined` and `safeCleanup(value): object | undefined` in `src/lib/strategies/safeFields.ts` — the two narrowing functions `answer.ts` and `withLock.ts` share
  - `Cleanup` — the `cleanup` field `answer()` renders, in **two** shapes: `{ message, origin, request? }` when SAP refused the unlock, `{ error: 'client_threw', message }` when something in this process threw. Never a synthesized origin.
  - `LockNotReleased` — the error `withLock` rethrows, carrying the relevant cause as `cause` and either `cleanup` or `operation: 'succeeded'`

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
    const result = await pair(
      async () => ok('source') as any,
      async () => ok('metadata') as any,
    );
    expect(result.ok).toBe(true);
    expect(result.getResult().value).toEqual(['source', 'metadata']);
  });

  it('hands back the first failure untouched, and never calls the second step', async () => {
    const second = jest.fn();
    const result = await pair(
      async () => failed('read refused') as any,
      second as any,
    );
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('read refused');
    expect(second).not.toHaveBeenCalled();
  });

  it('hands back the second failure untouched', async () => {
    const result = await pair(
      async () => ok('source') as any,
      async () => failed('metadata refused') as any,
    );
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('metadata refused');
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
 * `sequence` answers the last step, which is what a read-modify-write wants.
 * A read that reports a document and its metadata wants both, and capturing
 * the first in a variable outside the run would put the ordering back in the
 * handler one assignment at a time. The failure rule is `sequence`'s, exactly:
 * the failing step's own answer, untouched, and the second step is never
 * reached when the first refuses.
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
    getError: () => {
      throw new Error('pair: asked for the error of a success');
    },
  } as unknown as IAdtResponse<[A, B], IAdtError>;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/sequence.test.ts
```

Expected: PASS, all three.

- [ ] **Step 5: Commit `pair`**

```bash
git add src/lib/strategies/sequence.ts src/__tests__/unit/sequence.test.ts
git commit -m "feat(strategies): pair — both answers, the same failure rule"
```

- [ ] **Step 6: Write the failing test for `withLock`**

```typescript
// src/__tests__/unit/withLock.test.ts
import { withLock } from '../../lib/strategies/withLock';

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

describe('withLock', () => {
  it('never acquires nothing: a refused lock runs neither body nor release', async () => {
    const body = jest.fn();
    const release = jest.fn();
    const result = await withLock(
      async () => failed('Object is locked by another user') as any,
      body as any,
      release as any,
    );
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('Object is locked by another user');
    expect(body).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('releases after a refused body, and answers the body failure untouched', async () => {
    const release = jest.fn(async () => ok(undefined) as any);
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => failed('Update refused') as any,
      release,
    );
    expect(release).toHaveBeenCalledWith('handle-1');
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as any).cleanup).toBeUndefined();
  });

  it('releases after a THROWN body, and lets the throw out unchanged', async () => {
    const release = jest.fn(async () => ok(undefined) as any);
    await expect(
      withLock(
        async () => ok('handle-1') as any,
        async () => { throw new Error('parser blew up'); },
        release,
      ),
    ).rejects.toThrow('parser blew up');
    expect(release).toHaveBeenCalledWith('handle-1');
  });

  it('carries the dangling lock out with a THROWN body when the release is REFUSED', async () => {
    expect.assertions(4);
    try {
      await withLock(
        async () => ok('handle-1') as any,
        async () => { throw new Error('parser blew up'); },
        async () => failed('Unlock refused') as any,
      );
    } catch (thrown: any) {
      // The throw is the primary cause and keeps its own message: it is a
      // defect in this process, and `answer()` will name it client_threw.
      expect(thrown.message).toBe('parser blew up');
      expect(thrown.cause?.message).toBe('parser blew up');
      // SAP refused the unlock, so the cleanup has an origin to report.
      expect(thrown.cleanup.message).toBe('Unlock refused');
      expect(thrown.cleanup.origin).toBe('refusal');
    }
  });

  it('marks a THROWN release as client_threw and gives it no origin', async () => {
    expect.assertions(3);
    try {
      await withLock(
        async () => ok('handle-1') as any,
        async () => { throw new Error('parser blew up'); },
        async () => { throw new Error('unlock called with no handle'); },
      );
    } catch (thrown: any) {
      expect(thrown.message).toBe('parser blew up');
      expect(thrown.cleanup).toEqual({
        error: 'client_threw',
        message: 'unlock called with no handle',
      });
      // The point of the whole case: an argument-validation defect must not be
      // reported as a transport problem. A caller told `connection` goes and
      // looks at the network.
      expect(thrown.cleanup.origin).toBeUndefined();
    }
  });

  it('marks a THROWN release as client_threw after a REFUSED body too', async () => {
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => failed('Update refused') as any,
      async () => { throw new Error('unlock called with no handle'); },
    );
    expect(result.ok).toBe(false);
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as any).cleanup).toEqual({
      error: 'client_threw',
      message: 'unlock called with no handle',
    });
  });

  it('rethrows a THROWN release after a SUCCESSFUL body, rather than inventing an origin', async () => {
    expect.assertions(3);
    try {
      await withLock(
        async () => ok('handle-1') as any,
        async () => ok('written') as any,
        async () => { throw new Error('unlock called with no handle'); },
      );
    } catch (thrown: any) {
      // A throw stays a throw. Turning it into an IAdtResponse failure here
      // would mean giving it an AdtFailureOrigin it does not have.
      expect(thrown.message).toBe('unlock called with no handle');
      expect(thrown.operation).toBe('succeeded');
      expect(thrown.cleanup).toBeUndefined();
    }
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

  it('never puts a transport config in the carrier, even before the boundary', async () => {
    const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => failed('Update refused') as any,
      async () => ({
        ok: false as const,
        getResult: () => { throw new Error('not a success'); },
        getError: () => ({
          message: 'Unlock refused',
          origin: 'refusal',
          request: {
            method: 'POST',
            url: '/sap/bc/adt/domains/ZD',
            headers: { authorization: SECRET },
          },
        }),
      }) as any,
    );
    const cleanup = (result.getError() as any).cleanup;
    expect(cleanup.request).toEqual({ method: 'POST', url: '/sap/bc/adt/domains/ZD' });
    expect(JSON.stringify(result.getError())).not.toContain(SECRET);
  });

  it('answers the body value when everything worked', async () => {
    const result = await withLock(
      async () => ok('handle-1') as any,
      async () => ok('written') as any,
      async () => ok(undefined) as any,
    );
    expect(result.ok).toBe(true);
    expect(result.getResult().value).toBe('written');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/withLock.test.ts
```

Expected: FAIL — cannot find module `withLock`.

- [ ] **Step 8: Implement**

Two modules. First the narrowing, which is what the top-level `request` in `answer.ts` already does, moved somewhere both callers can reach it: `answer.ts` renders the payload, and `withLock` builds a carrier that rides inside a thrown error on its way there. Neither should hold its own copy of the rule.

```typescript
// src/lib/strategies/safeFields.ts

/** Two fields, copied by name. The contract types `request` as
 *  `{ method?, url? }`, but a type is not a filter: TypeScript accepts a wider
 *  object structurally, and what is actually on it is transport config. */
export function safeRequest(value: unknown): Record<string, string> | undefined {
  const method = (value as { method?: unknown } | undefined)?.method;
  const url = (value as { url?: unknown } | undefined)?.url;
  if (typeof method !== 'string' && typeof url !== 'string') return undefined;
  const out: Record<string, string> = {};
  if (typeof method === 'string') out.method = method;
  if (typeof url === 'string') out.url = url;
  return out;
}

/** The cleanup, field by field. Its two shapes are mutually exclusive: a
 *  cleanup built from a throw carries no origin even if the object has one,
 *  because having none is that shape's whole point. */
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

Then the combinator itself.

```typescript
// src/lib/strategies/withLock.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { safeRequest } from './safeFields';

/**
 * What a failed release adds to a payload — in two shapes, and which one it is
 * carries information of its own.
 *
 * SAP refused the unlock: an origin, from the strategy that judged it.
 * Something in this process threw: `client_threw`, and deliberately no origin.
 * `connection` and `refusal` are both claims about the server and neither is
 * true of an argument-validation defect.
 */
export type Cleanup =
  | { message: string; origin?: string; request?: unknown }
  | { error: 'client_threw'; message: string };

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

/**
 * Calls around a held resource.
 *
 * NOT a `sequence`. A sequence stops at the first failure, so a refused update
 * in a lock-update-unlock chain would skip the unlock and leave the object
 * locked in SAP. `release` runs after every successful `acquire` — after a
 * refusal from `body` and after a throw from it — which is what the thirteen
 * handlers that already wrap this in `try/finally` are doing by hand.
 *
 * When both halves fail the BODY's failure is the answer: it is what the caller
 * asked about, and losing the cause to a secondary fact is the worse trade. The
 * secondary fact is not dropped — `cleanup` carries it, so a caller learns the
 * object is still held.
 *
 * When the body SUCCEEDED and the release did not, the answer is a failure. The
 * write happened and `operation: 'succeeded'` says so, but a held lock is the
 * caller's next problem, and an answer marked success is one an agent does not
 * read twice. `LockRegistry.unlockAll()` may still release it at session end,
 * which makes this recoverable rather than silent.
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
  // nowhere to go and is lost — the caller would hear about a parser defect and
  // never about the lock still held in SAP.
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

  if (!(answered as IAdtResponse<T, IAdtError>).ok) {
    if (released.kind === 'ok') return answered as IAdtResponse<T, IAdtError>;
    const primary = (answered as IAdtResponse<T, IAdtError>).getError();
    return failure<T>({ ...primary, cleanup: released.carrier });
  }

  // The body succeeded, so the release's own outcome becomes the answer — in
  // its own channel. A refusal is a failure; a throw stays a throw, because
  // turning it into one would mean giving it an origin it does not have.
  if (released.kind === 'ok') return answered as IAdtResponse<T, IAdtError>;
  if (released.kind === 'refused') {
    return failure<T>({ ...released.error, operation: 'succeeded' } as IAdtError & CleanupCarrier);
  }
  throw new LockNotReleased(released.thrown, { operation: 'succeeded' });
}

/**
 * The release, in its three states.
 *
 * Refused and threw are NOT the same event and are not collapsed here. A
 * refusal was judged by a strategy and carries an `AdtFailureOrigin`; a throw
 * came from argument validation, an unsupported-operation check or an invariant
 * inside this process, and has no origin to carry. Synthesizing one — the first
 * draft used `origin: 'connection'` — reports a local defect as a transport
 * problem and sends the caller to look at the network.
 */
type Released<H> =
  | { kind: 'ok' }
  | { kind: 'refused'; error: IAdtError; carrier: Cleanup }
  | { kind: 'threw'; thrown: unknown; carrier: Cleanup };

async function runRelease<H>(
  release: (handle: H) => Promise<IAdtResponse<unknown, IAdtError>>,
  handle: H,
): Promise<Released<H>> {
  let answer: IAdtResponse<unknown, IAdtError>;
  try {
    answer = await release(handle);
  } catch (error) {
    return {
      kind: 'threw',
      thrown: error,
      carrier: {
        error: 'client_threw',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (answer.ok) return { kind: 'ok' };
  const error = answer.getError();
  return {
    kind: 'refused',
    error,
    // Narrowed HERE as well as at the boundary. `answer()` narrows everything
    // it renders, but this carrier rides inside a thrown error on its way
    // there, and a transport config with an Authorization bearer on it should
    // not exist in a value that can be logged, inspected or rethrown. One
    // shared `safeRequest`, so there is no second implementation to drift.
    carrier: {
      message: error.message,
      origin: error.origin,
      request: safeRequest(error.request),
    },
  };
}

/**
 * A throw that left a lock behind, or a release that threw after the work was
 * already done.
 *
 * Keeps the relevant cause as `cause` and borrows its message, so nothing about
 * the primary defect is reworded — `answer()` still reports exactly what threw.
 * Wrapping rather than attaching a property to the thrown value, because a
 * thrown value need not be an object and need not be extensible.
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

- [ ] **Step 9: Run the tests**

```bash
npx jest src/__tests__/unit/withLock.test.ts
```

Expected: PASS, all ten.

- [ ] **Step 10: Render `cleanup` and `operation` on BOTH payloads**

`answer.ts`'s allowlist drops unknown fields, so without this the facts never reach a caller. Two places, not one:

- `failurePayload()` — add `cleanup` and `operation` beside `raw_body`, for the refusal path.
- `local()` — the `client_threw` payload, for the throw path, rendering **both** `cleanup` and `operation`. Read them off the thrown value structurally rather than with `instanceof`, so a `LockNotReleased` built against another copy of the module still renders.

**`cleanup` is rebuilt field by field, exactly like the top-level `request`.** It arrives from the same place, sometimes through a `throw`, and an object that travels through would carry whatever was attached to it — headers, an Authorization bearer, cookies. The narrowing the top-level `request` already does moves into one module that `answer.ts` and `withLock.ts` both import, so there is no second implementation to drift:

The two narrowing functions were written in Task 2, Step 8, where `safeFields.ts` is created. Nothing new here — `failurePayload()` replaces its inline method/url copying with `safeRequest`, and `local()` gains `safeCleanup`.

Three callers, one rule: `failurePayload()`, `local()`, and `withLock`'s `runRelease`.

Extend `answerFailure.test.ts` with four cases: a refusal carrying `cleanup` survives the allowlist; a `client_threw` carrying `cleanup` does too; a `client_threw` carrying `operation: 'succeeded'` does, which is the only report a caller gets when the write landed and the unlock threw; and the leak test:

```typescript
it('never lets a secret out through cleanup.request', () => {
  const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';
  const failure = {
    ok: false as const,
    getResult: () => { throw new Error('not a success'); },
    getError: () => ({
      message: 'Update refused',
      origin: 'refusal',
      cleanup: {
        message: 'Unlock refused',
        origin: 'refusal',
        request: {
          method: 'POST',
          url: '/sap/bc/adt/domains/ZD',
          headers: { authorization: SECRET, cookie: 'SAP_SESSIONID=abc' },
          httpsAgent: { options: { cert: 'PEM' } },
        },
      },
    }),
  };

  const result: any = return_answer(failure as any, () => ({}), { tool: 'UpdateDomain', detail: 'raw' });

  // The whole serialised answer, not just the field we expect it in.
  expect(result.content[0].text).not.toContain(SECRET);
  expect(result.content[0].text).not.toContain('SAP_SESSIONID');
  expect(result.content[0].text).not.toContain('httpsAgent');
  const payload = JSON.parse(result.content[0].text);
  expect(payload.cleanup.request).toEqual({
    method: 'POST',
    url: '/sap/bc/adt/domains/ZD',
  });
});

it('drops the origin from a cleanup that came from a throw', () => {
  const payload = renderCleanup({ error: 'client_threw', message: 'no handle', origin: 'refusal' });
  expect(payload).toEqual({ error: 'client_threw', message: 'no handle' });
});
```

The first two of those are what the criterion "a release that failed reaches the caller" rests on; the leak test is what keeps it from reaching them with a bearer token attached.

- [ ] **Step 11: Commit `withLock`**

```bash
git add src/lib/strategies/withLock.ts src/lib/answer.ts src/__tests__/unit/withLock.test.ts src/__tests__/unit/answerFailure.test.ts
git commit -m "feat(strategies): withLock — the release runs on every path out"
```

---

## Task 3: The slot table — one reading per result-set slot

adt-clients 19 exports 31 shipped result sets holding 308 slots between them, and those 308 slots carry only **39 distinct names**. Measured, not quoted — the spec says 289 across 30, which was counted from the interfaces rather than from the exports:

```bash
node -e "
const m=require('@mcp-abap-adt/adt-clients');
const sets=Object.keys(m).filter(k=>/Documents\$/.test(k));
const slots={};
for(const s of sets) for(const k of Object.keys(m[s])) (slots[k]=slots[k]||[]).push(s);
console.log(sets.length,'sets', Object.keys(slots).length,'distinct slots');
"
```

The names repeat: `metadata` in 30 sets, `created` in 29, `source` in 29, `deletionCheck` in 29, `validation` in 28, `deletion` in 28, `activation` in 26, `check` in 25, `updated` in 21, `transport` in 21, `metadataUpdated` in 11, and 28 more that appear once or twice. Which reading a slot wants is a property of the slot name, not of the object type — a domain's `metadata` and a table's `metadata` are both a document handed through.

So: one table, and a function that stamps it over any shipped result set. Not 30 hand-written objects.

**Files:**
- Create: `src/lib/strategies/resultSets.ts`
- Test: `src/__tests__/unit/resultSets.test.ts`

**Interfaces:**
- Consumes: `verbatim`, `structured`, `statusOnly` from `src/lib/strategies/reading.ts`; `nodeLevel` from `src/lib/strategies/packageWalk.ts`.
- Produces:
  - `READING_BY_SLOT: Record<string, IResultStrategy<unknown>>`
  - `resultsFor<R extends Record<string, unknown>>(shipped: R): R` — same keys, our readings
  - `ourUtils` — `resultsFor(utilDocuments)` with `node` overridden to `nodeLevel`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/resultSets.test.ts
import {
  classDocuments,
  domainDocuments,
  packageDocuments,
  tableDocuments,
  utilDocuments,
} from '@mcp-abap-adt/adt-clients';
import { corpusBody } from '../../lib/adtCorpus';
import { READING_BY_SLOT, ourUtils, resultsFor } from '../../lib/strategies/resultSets';

describe('the slot table', () => {
  const SETS = { classDocuments, domainDocuments, packageDocuments, tableDocuments, utilDocuments };

  it('knows a reading for every slot every shipped set declares', () => {
    const unknown: string[] = [];
    for (const set of Object.values(SETS)) {
      for (const slot of Object.keys(set)) {
        if (READING_BY_SLOT[slot] === undefined) unknown.push(slot);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('keeps the keys of the set it stamps', () => {
    expect(Object.keys(resultsFor(domainDocuments)).sort()).toEqual(
      Object.keys(domainDocuments).sort(),
    );
  });

  it('hands a metadata document through, byte for byte', () => {
    const document = corpusBody('read-table-metadata-structure--01-tables-zmcpshrrtabl');
    const reading: any = resultsFor(tableDocuments).metadata({ data: document, status: 200 } as any);
    expect(reading.raw).toBe(document);
  });

  it('parses a check document into named structure', () => {
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

  it('gives the node walk our own node reading, not the shipped one', () => {
    expect(ourUtils.node).not.toBe(utilDocuments.node);
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
 * what it depends on.
 *
 * adt-clients 19 declares 30 result-set interfaces and 289 slots, and the slot
 * names repeat across them: `metadata` appears in 30, `source` in 29, `created`
 * in 29. A domain's `metadata` and a table's `metadata` are the same question —
 * hand the document through — and writing 30 objects out by hand would be 30
 * chances to answer it differently by accident.
 *
 * Three readings fill it, and which one a slot takes follows from what the tool
 * promised:
 *
 *  - **the document is the answer** → `verbatim`. Source, metadata, a transport
 *    document. The tools carry metadata as a string inside their JSON and have
 *    never parsed it.
 *  - **named fields are promised** → `structured`. A check's messages, an
 *    activation's verdict, a deletion's `isDeleted`, a validation's verdict, a
 *    node walk.
 *  - **there is no body** → `statusOnly`. A create answers 200 with zero bytes,
 *    and so does a successful write. `statusOnly` still carries `raw` and
 *    `status`, so `detail: 'raw'` is answerable and `terseWrite` has a status
 *    to read.
 */
export const READING_BY_SLOT: Record<string, IResultStrategy<unknown>> = {
  // the document is the answer
  source: verbatim,
  sourceDocument: verbatim,
  metadata: verbatim,
  transport: verbatim,
  include: verbatim,

  // a message class message answers its own document
  read: verbatim,

  // there is no body
  created: statusOnly,
  updated: statusOnly,
  metadataUpdated: statusOnly,
  written: statusOnly,

  // named fields are promised
  check: structured,
  cdsCheck: structured,
  activation: structured,
  validation: structured,
  deletion: structured,
  deleted: structured,
  deletionCheck: structured,
  classification: structured,
  generation: structured,
  publication: structured,
  odata: structured,
  bindingTypes: structured,
  list: structured,
  search: structured,
  whereUsed: structured,
  whereUsedScope: structured,
  folders: structured,
  types: structured,
  node: structured,
  objectStructure: structured,
  inactive: structured,
  results: structured,
  result: structured,
  run: structured,
  status: structured,
  query: structured,
  columns: structured,
  contents: structured,
  discovery: structured,
};

/**
 * Stamp the table over a shipped result set.
 *
 * The keys are the shipped set's own, so a slot adt-clients adds in a later
 * version arrives here as a missing-key failure in `resultSets.test.ts` rather
 * than as a silently unshaped answer at a call site.
 */
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
 * The util set, with our own node reading.
 *
 * `nodeLevel` keeps the descriptions the shipped `nodeContents` drops, and the
 * package walk needs them: a tree without descriptions is a tree a caller has
 * to walk again to read.
 */
export const ourUtils = { ...resultsFor(utilDocuments), node: nodeLevel };
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/resultSets.test.ts
```

Expected: PASS. If "knows a reading for every slot" fails, the message names the slot — add it to the table with the reading its tool promises, do not widen the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/strategies/resultSets.ts src/__tests__/unit/resultSets.test.ts
git commit -m "feat(strategies): one reading per slot, stamped over the shipped sets"
```

---

## Task 4: The `detail` parameter, in one place — and off the failure path

`detail` goes on JSON-answering tools only. Where the promised form is text or XML the three levels coincide, and a parameter that cannot change anything is noise on a surface callers read.

That claim is only true once `raw_body` stops depending on it — for the failures that have a body to hand over. `answer.ts` today writes `raw_body` into the failure payload only when `ctx.detail === 'raw'`, so a text-answering tool that hardcodes `'terse'` could never hand back the document SAP refused with. It also contradicts the design's own asymmetry: on a failure the consumer wants everything, and `detail` shapes *successes*. Both are fixed here, before any handler is written against the old behaviour.

**Files:**
- Create: `src/lib/strategies/detail.ts`
- Modify: `src/lib/answer.ts` (drop the duplicate `AnswerDetail`; ungate `raw_body`; narrow `request` and `cleanup` through `safeFields.ts`)
- Test: `src/__tests__/unit/detail.test.ts`, `src/__tests__/unit/answerFailure.test.ts` (exists — extend)

**Interfaces:**
- Produces:
  - `DETAIL_PROPERTY` — the input-schema fragment, spread into a tool's `properties`
  - `detailOf(args: unknown): AnswerDetail` — `'terse'` unless the caller said otherwise
  - `AnswerDetail` re-exported from `projections.ts`, so there is one definition

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

  it('falls back to terse on anything else, rather than throwing', () => {
    expect(detailOf({ detail: 'verbose' })).toBe('terse');
    expect(detailOf({ detail: 7 })).toBe('terse');
  });

  it('declares exactly the three levels it accepts', () => {
    expect(DETAIL_PROPERTY.detail.enum).toEqual(['terse', 'full', 'raw']);
    expect(DETAIL_PROPERTY.detail.default).toBe('terse');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/detail.test.ts
```

Expected: FAIL — cannot find module `detail`.

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
 * the answer is noise on a surface callers read to decide what to call.
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

- [ ] **Step 4: Write the failing test for the failure path**

```typescript
// append to src/__tests__/unit/answerFailure.test.ts
import { corpusBody } from '../../lib/adtCorpus';

describe('raw_body does not depend on detail', () => {
  const document = corpusBody('refusal-object-not-found--01-read-source');
  const failure = {
    ok: false as const,
    getResult: () => { throw new Error('not a success'); },
    getError: () => ({
      message: 'Resource not found',
      origin: 'refusal',
      response: { data: document },
    }),
  };

  it.each(['terse', 'full', 'raw'] as const)('carries the document at detail=%s', (detail) => {
    const result: any = return_answer(failure as any, () => ({}), { tool: 'ReadClass', detail });
    expect(JSON.parse(result.content[0].text).raw_body).toBe(document);
  });

  // The other half of the criterion. A connection failure never reached a
  // server, an empty answer has nothing to hand over, and a body the transport
  // already parsed is an object rather than the bytes. In all three the field
  // is absent — inventing a value there would be this adapter claiming SAP
  // said something it did not.
  it.each([
    ['a connection failure', { message: 'ECONNREFUSED', origin: 'connection' }],
    ['an empty answer', { message: 'Empty', origin: 'refusal', response: { data: '' } }],
    ['a parsed body', { message: 'Parsed', origin: 'refusal', response: { data: { a: 1 } } }],
  ])('leaves raw_body absent for %s', (_name, error) => {
    const none = {
      ok: false as const,
      getResult: () => { throw new Error('not a success'); },
      getError: () => error,
    };
    const result: any = return_answer(none as any, () => ({}), { tool: 'ReadClass', detail: 'raw' });
    expect('raw_body' in JSON.parse(result.content[0].text)).toBe(false);
  });
});
```

The empty-string case is deliberate and worth keeping green: `''` is a string, so a
naive `typeof body === 'string'` would emit `raw_body: ""`, which reads as "SAP sent
an empty document" when what happened is that there was nothing to send.

- [ ] **Step 5: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/answerFailure.test.ts
```

Expected: FAIL on `terse` and `full` for the first three cases; the empty-answer case fails too, because `''` passes a bare string check.

- [ ] **Step 6: Ungate it**

```typescript
// src/lib/answer.ts, in failurePayload — replace the detail check
  // Whatever `detail` says. It is a parameter of the RESULT projection, and a
  // failure is not a projection: on this path the consumer wants everything,
  // and hiding the one field that carries everything behind a parameter that
  // shapes successes hid it exactly where it was the point. A text-answering
  // tool declares no `detail` at all, so gating this made the document SAP
  // refused with unreachable for it.
  const body = (error.response as { data?: unknown } | undefined)?.data;
  if (typeof body === 'string' && body !== '') {
    payload.raw_body = body;
  }
```

- [ ] **Step 7: Remove the second definition of `AnswerDetail`**

In `src/lib/answer.ts`, replace the local declaration with an import, so `answer()` and `project()` cannot drift apart:

```typescript
// src/lib/answer.ts — replace `export type AnswerDetail = 'terse' | 'full' | 'raw';`
import type { AnswerDetail } from './strategies/projections';
export type { AnswerDetail };
```

- [ ] **Step 8: Run the tests and the compiler**

```bash
npx jest src/__tests__/unit/detail.test.ts src/__tests__/unit/answerSuccess.test.ts src/__tests__/unit/answerFailure.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: tests PASS; the error count is 589 or lower, never higher.

- [ ] **Step 9: Commit**

```bash
git add src/lib/strategies/detail.ts src/lib/answer.ts src/__tests__/unit/detail.test.ts src/__tests__/unit/answerFailure.test.ts
git commit -m "fix(answer): a failure carries raw_body at every detail"
```

---

## Task 5: The reference migration — `handleReadClass`

This is the template for 19 read handlers. It is also a bug fix: today the handler answers `success: true` with `source_code: null` when the read fails, which is the read-path masking defect (`project_adt_read_masking_false_success`).

**Files:**
- Modify: `src/handlers/class/readonly/handleReadClass.ts`
- Test: `src/__tests__/unit/handleReadClass.test.ts` (create)

**Interfaces:**
- Consumes: `answer` from `src/lib/answer.ts`; `pair` from `sequence.ts`; `resultsFor` from `resultSets.ts`; `analyseException` from `@mcp-abap-adt/adt-strategies`; `AdtReading` from `reading.ts`.
- Produces: the shape every read handler in Task 6 follows.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/handleReadClass.test.ts
import { corpusBody } from '../../lib/adtCorpus';
import { handleReadClass } from '../../handlers/class/readonly/handleReadClass';

const context = { connection: {} as any, logger: undefined };

jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));
let fakeClient: any;

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

const ok = (value: unknown) => ({
  ok: true as const,
  getResult: () => ({ value }),
  getError: () => { throw new Error('not a failure'); },
});
const refused = (message: string) => ({
  ok: false as const,
  getResult: () => { throw new Error('not a success'); },
  getError: () => ({ message, origin: 'refusal' }),
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/handleReadClass.test.ts
```

Expected: FAIL — the current handler reads `readResult.readResult.data`, which the fake does not have, so `source_code` is `null` and both assertions fail.

Corpus exchange names are `<case>--<NN>-<endpoint>`; `corpusBody` takes the whole name and `corpusCases(prefix)` lists them. `ls tests/fixtures/adt/ | sed 's/\.body\..*//' | sort -u` is the index. Never invent a document — if the case you want is not there, the corpus is the authority and the test says plainly that it is unverified.

- [ ] **Step 3: Implement**

```typescript
// src/handlers/class/readonly/handleReadClass.ts — the body, imports adjusted
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { createAdtClient } from '../../../lib/clients';
import { answer } from '../../../lib/answer';
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
  // are different failures, and whichever comes back is the one the caller sees,
  // built by the strategy rather than summarised here.
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

Two things to notice, because they repeat in every later task. The handler no longer decides anything about the answer: there is no `if (result?.readResult?.data)`, because the presence of a body is not the handler's verdict. And `source.raw` rather than `source.value`: the tool promised the document, so the document is what it answers.

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/handleReadClass.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: tests PASS; error count down by 8 (581).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/class/readonly/handleReadClass.ts src/__tests__/unit/handleReadClass.test.ts
git commit -m "refactor(class): ReadClass answers through the adapter, and stops masking a refused read"
```

---

## Task 6: The remaining `readonly` read handlers

Sixteen files, the same shape as Task 5, each with its own object type and its own config key. All sixteen call both `read` and `readMetadata`, all sixteen carry the same masking defect, and all sixteen lose it here.

Measured, not assumed — this is the `pair` list minus `handleReadClass`, which Task 5 did, and minus `handleGetFunctionModule`, which is a `high` tool and belongs to Task 10:

```bash
grep -lE '\.read\(' $(find src/handlers -name 'handle*.ts') | xargs grep -lE '\.readMetadata\(' | sort
```

**Files (modify, in this order — the compiler's own order, most errors first):**
- `src/handlers/table/readonly/handleReadTable.ts` (`getTable`, `tableDocuments`, `{ tableName }`)
- `src/handlers/structure/readonly/handleReadStructure.ts` (`getStructure`, `structureDocuments`, `{ structureName }`)
- `src/handlers/service_definition/readonly/handleReadServiceDefinition.ts` (`getServiceDefinition`, `serviceDefinitionDocuments`, `{ serviceDefinitionName }`)
- `src/handlers/service_binding/readonly/handleReadServiceBinding.ts` (`getServiceBinding`, `{ serviceBindingName }`)
- `src/handlers/program/readonly/handleReadProgram.ts` (`getProgram`, `programDocuments`, `{ programName }`)
- `src/handlers/metadata_extension/readonly/handleReadMetadataExtension.ts` (`getMetadataExtension`, `metadataExtensionDocuments`)
- `src/handlers/interface/readonly/handleReadInterface.ts` (`getInterface`, `interfaceDocuments`, `{ interfaceName }`)
- `src/handlers/function_module/readonly/handleReadFunctionModule.ts` (`getFunctionModule`, `functionModuleDocuments`)
- `src/handlers/function_include/readonly/handleReadFunctionInclude.ts` (`getFunctionInclude`, `functionIncludeDocuments`)
- `src/handlers/ddl/readonly/handleReadDdl.ts` (`getDdl`, `ddlDocuments`, `{ ddlName }`)
- `src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts` (`getBehaviorImplementation`, `classDocuments`)
- `src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts` (`getBehaviorDefinition`, `behaviorDefinitionDocuments`)
- `src/handlers/domain/readonly/handleReadDomain.ts` (`getDomain`, `domainDocuments`, `{ domainName }`)
- `src/handlers/data_element/readonly/handleReadDataElement.ts` (`getDataElement`, `dataElementDocuments`, `{ dataElementName }`)
- `src/handlers/package/readonly/handleReadPackage.ts` (`getPackage`, `packageDocuments`, `{ packageName }`)
- `src/handlers/function_group/readonly/handleReadFunctionGroup.ts` (`getFunctionGroup`, `functionGroupDocuments`, `{ functionGroupName }`)
- Test: `src/__tests__/unit/readHandlersSurfaceErrors.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: everything Task 5 produced.
- Produces: nothing new. Four of these sixteen were listed in Task 7 as single-call handlers in an earlier draft of this plan. They are not: they call `read` and `readMetadata` both, and the grep above is why they moved here.

- [ ] **Step 1: Extend the existing test so every one of the twelve is covered**

`src/__tests__/unit/readHandlersSurfaceErrors.test.ts` already asserts that a read handler surfaces an error. Add a case per file above with the handler's own argument name, asserting both halves:

```typescript
it.each([
  ['ReadTable', handleReadTable, { table_name: 'ZT' }],
  ['ReadStructure', handleReadStructure, { structure_name: 'ZS' }],
  // ... one row per file in the list above, with that handler's own argument name
])('%s reports a refusal as an error', async (_name, handler, args) => {
  fakeClient = refusingClient('Resource not found');
  const result: any = await handler(context as any, args as any);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Resource not found');
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/readHandlersSurfaceErrors.test.ts
```

Expected: FAIL on every new row — each handler currently answers `isError: false`.

- [ ] **Step 3: Migrate the sixteen, one file per edit**

Apply the Task 5 shape verbatim, changing four things per file: the factory (`getTable`), the shipped set (`tableDocuments`), the config key (`{ tableName }`), and the answer's own field names, which stay exactly as that tool already returns them. Check the surface test after each file rather than at the end — a renamed field is caught in the file that renamed it.

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/readHandlersSurfaceErrors.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: PASS; error count down by roughly 110 (from 581 to about 470).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/*/readonly/handleRead*.ts src/__tests__/unit/readHandlersSurfaceErrors.test.ts
git commit -m "refactor(readonly): the sixteen read handlers answer through the adapter"
```

---

## Task 7: The metadata-only reads, and the search and listing handlers

The remaining `readonly` files that are a single call: `handleReadMessageClass`, `handleReadMessageClassMessage`, `handleGetObjectsByType`, `handleGetObjectsList`, `handleSearchObject`, `handleGetAllTypes`, `handleGetInactiveObjects`, `handleGetObjectInfo`, `handleGetObjectStructure`, `handleGetSqlQuery`, `handleGetTableContents`, `handleListTransports`, `handleGetEnhancements`, `handleGetObjectVersionDiff`, `resolveVersionedObject`.

**Files:** the fifteen above, under `src/handlers/*/readonly/` and `src/handlers/common/readonly/`. Confirm the list before starting — a file that turns out to call `readMetadata` as well belongs to Task 6's shape, not this one.

**Interfaces:**
- Consumes: `answer`, `resultsFor`, `ourUtils`, `analyseException`, `project`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/readonlySingleCall.test.ts
it.each([
  ['ReadMessageClass', handleReadMessageClass, { message_class_name: 'ZMC' }],
  ['GetObjectStructure', handleGetObjectStructure, { object_name: 'ZCL_X', object_type: 'CLAS' }],
  ['ListTransports', handleListTransports, {}],
  // one row per file above
])('%s answers through the adapter and surfaces a refusal', async (_n, handler, args) => {
  fakeClient = refusingClient('Not found');
  const result: any = await handler(context as any, args as any);
  expect(result.isError).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/readonlySingleCall.test.ts
```

Expected: FAIL on every row.

- [ ] **Step 3: Implement — the one-call shape**

```typescript
// the shape, filled in for handleReadMessageClass
return answer(
  { tool: 'ReadMessageClass', detail: 'terse' },
  () =>
    createAdtClient(connection, logger)
      .getMessageClass(resultsFor(messageClassDocuments))
      .readMetadata({ messageClassName }, { analyse: analyseException }),
  (metadata: AdtReading<string>) => ({
    success: true,
    message_class_name: messageClassName,
    metadata: metadata.raw,
  }),
);
```

The search and listing handlers answer JSON built from a parse, so they project `reading.value` through `project(detail, terse)` rather than reading `raw`. Their `terse` is whatever field set that tool already returns — copy it out of the handler as it stands, do not redesign it here.

The utils-backed ones (`handleGetObjectStructure`, `handleGetAllTypes`, `handleGetInactiveObjects`, `handleGetSqlQuery`, `handleGetTableContents`) take `client.getUtils(ourUtils)`.

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/readonlySingleCall.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: PASS; error count down by roughly 40 (to about 430).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/*/readonly src/__tests__/unit/readonlySingleCall.test.ts
git commit -m "refactor(readonly): the single-call reads, searches and listings"
```

---

## Task 8: `common/low` — the five generic operations

`handleValidateObject` (13 errors), `handleLockObject` (13), `handleDeleteObject` (12), `handleActivateObject`. These are the generic tools that take an object type as an argument, and they are the ones where choosing the wrong `analyse` is easiest: each dispatches over object families, and the encoding principle follows the operation, not the family.

**Files:**
- Modify: `src/handlers/common/low/handleValidateObject.ts`, `handleLockObject.ts`, `handleDeleteObject.ts`, `handleActivateObject.ts`
- Test: `src/__tests__/unit/commonLowOperations.test.ts` (create)

**Interfaces:**
- Consumes: `analyseValidation`, `analyseException`, `analyseDeletion`, `analyseActivation` from `@mcp-abap-adt/adt-strategies`; `terseValidation`, `terseDeletion`, `terseActivation`, `terseWrite`, `project` from `projections.ts`.
- Produces: nothing new.

Which `analyse` each one takes, and why — this is the table the spec's error axis names, applied:

| handler | `analyse` | because |
|---|---|---|
| `handleValidateObject` | `analyseValidation` | the verdict is `CHECK_RESULT`, or `SEVERITY` + `SHORT_TEXT`, in a value block |
| `handleLockObject` | `analyseException` | a refused lock is `exc:exception` under a non-2xx status |
| `handleDeleteObject` | `analyseDeletion` | `del:isDeleted` is an attribute under a 200 |
| `handleActivateObject` | `analyseActivation` | `activationExecuted` is an attribute under a 200 |

- [ ] **Step 1: Write the failing test, from the corpus**

```typescript
// src/__tests__/unit/commonLowOperations.test.ts
import { corpusBody } from '../../lib/adtCorpus';

it('reports a refused deletion as an error, though ADT answered 200', async () => {
  const document = corpusBody('refusal-delete-refused--01-deletion-delete');
  fakeClient = deletingClient({ data: document, status: 200 });
  const result: any = await handleDeleteObject(context as any, {
    object_type: 'CLAS', object_name: 'ZCL_X', lock_handle: 'h',
  });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).not.toContain('"success": true');
});

it('reports an inadmissible name as an error', async () => {
  const document = corpusBody('refusal-validation-name-taken-class--01-validation-objectname');
  fakeClient = validatingClient({ data: document, status: 200 });
  const result: any = await handleValidateObject(context as any, {
    object_type: 'CLAS', object_name: 'ZCL_TAKEN', package_name: 'ZP',
  });
  expect(result.isError).toBe(true);
});
```

Use the case names `corpusCases()` actually reports. If the corpus has no refused-validation case for a taken name, say so in the test name and assert on the case that is there — the corpus is the authority, and an invented document is worse than a missing test.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/commonLowOperations.test.ts
```

Expected: FAIL — the handlers answer `success: true` on both documents, which is exactly the masking these four carry today.

- [ ] **Step 3: Implement**

```typescript
// handleDeleteObject, the shape
return answer(
  { tool: 'DeleteObject', detail: detailOf(args) },
  () => obj.delete(config, { lockHandle: lock_handle, analyse: analyseDeletion }),
  project(detailOf(args), terseDeletion),
);
```

Keep each handler's existing family dispatch exactly as it is. The only change is that the call now carries an `analyse`, the result now comes from an injected reading, and the answer now comes from `answer()`.

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/commonLowOperations.test.ts src/__tests__/unit/toolSurface.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: PASS; error count down by about 45 (to about 385).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/common/low src/__tests__/unit/commonLowOperations.test.ts
git commit -m "refactor(common): the four generic operations, with the strategy deciding"
```

---

## Task 9: The `low` tier, family by family

112 files. Each family has the same six to eight handlers — Create, Update, Lock, Unlock, Check, Activate, Validate, Delete — and each of those has a fixed `analyse` and a fixed projection, by the table below. This is the most mechanical part of the migration and the largest.

**Files:** `src/handlers/<family>/low/handle*.ts`, in this order, so the biggest families land while the recipe is freshest:
`class` (11), `ddl` (8), `ddlx` (8), `interface` (8), `structure` (8), `table` (8), `program` (8), `behavior_definition` (8), `function` (14), `domain` (7), `data_element` (7), `package` (6), `behavior_implementation` (3), `service_binding` (1), `service_definition` (1), `system` (1), `transport` (1)

**Interfaces:**
- Consumes: Tasks 3, 4, 5, 8.
- Produces: nothing new.

The per-operation table, applied unchanged in every family:

| operation | member | `analyse` | reading (from the slot table) | projection |
|---|---|---|---|---|
| Create | `create` | `analyseException` | `statusOnly` | `terseWrite` |
| Update | `update` / `updateMetadata` | `analyseException` | `statusOnly` | `terseWrite` |
| Lock | `lock` | `analyseException` | — (answers the handle) | the handle, as the tool already returns it |
| Unlock | `unlock` | `analyseException` | — | `terseWrite` |
| Check | `check` | `analyseCheck` | `structured` | `terseCheck` |
| Activate | `activate` | `analyseActivation` | `structured` | `terseActivation` |
| Validate | `validate` | `analyseValidation` | `structured` | `terseValidation` |
| Delete | `delete` | `analyseDeletion` | `structured` | `terseDeletion` |
| Deletion check | `checkDeletion` | `analyseDeletion` | `structured` | `terseDeletion` |

- [ ] **Step 1: Write the failing test, one per family**

```typescript
// src/__tests__/unit/lowTierStrategies.test.ts
// Asserts the pairing above rather than each handler's prose: what can go wrong
// here at scale is a handler taking the wrong `analyse`, and that is visible
// from the call the handler makes.
it.each(['class', 'ddl', 'domain', 'table', 'interface', 'structure', 'program'])(
  '%s: activate takes analyseActivation and delete takes analyseDeletion',
  async (family) => {
    const seen = recordAnalyse();
    await activateOf(family)(context as any, argsOf(family));
    expect(seen.last).toBe(analyseActivation);
    await deleteOf(family)(context as any, argsOf(family));
    expect(seen.last).toBe(analyseDeletion);
  },
);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/lowTierStrategies.test.ts
```

Expected: FAIL — no handler passes an `analyse` today.

- [ ] **Step 3: Migrate, one family per commit**

For each family, in the order listed: apply the per-operation table, run the compiler, run the surface test, commit. Do not batch two families into one commit — a family is the unit a reviewer can reject on its own.

```bash
npx tsc --noEmit 2>&1 | grep "handlers/<family>/low" | wc -l   # before: expect the family's count
# ... edit ...
npx tsc --noEmit 2>&1 | grep "handlers/<family>/low" | wc -l   # after: expect 0
npx jest src/__tests__/unit/toolSurface.test.ts
git add src/handlers/<family>/low
git commit -m "refactor(<family>): the low tier, on strategies"
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: PASS; error count down by about 230 (to about 155).

- [ ] **Step 5: Commit** — already done per family; nothing left to stage.

---

## Task 10: The `high` tier `Get*` handlers

29 files — `handleGetClass`, `handleGetDomain`, `handleGetTable`, `handleGetStructure`, `handleGetProgram`, `handleGetInterface`, `handleGetDdl`, `handleGetDataElement`, `handleGetPackage`, `handleGetMessageClass`, `handleGetMessageClassMessage`, `handleGetFunctionGroup`, `handleGetFunctionModule`, `handleGetServiceBinding`, `handleGetServiceDefinition`, `handleGetMetadataExtension`, `handleGetBehaviorDefinition`, `handleGetBehaviorImplementation`, `handleGetLocalTestClass`, `handleGetLocalTypes`, `handleGetLocalDefinitions`, `handleGetLocalMacros`, `handleGetUnitTest`, `handleGetUnitTestStatus`, `handleGetUnitTestResult`, `handleGetCdsUnitTest`, `handleGetCdsUnitTestStatus`, `handleGetCdsUnitTestResult`, `handleListServiceBindingTypes`.

**Interfaces:** consumes Tasks 3–7. The unit-test three take `analyseUnitTest` and `structured`; the rest follow Task 5 or Task 7 by whether they make one call or two.

- [ ] **Step 1: Write the failing test** — extend `readonlySingleCall.test.ts` with one row per `Get*` handler, asserting a refusal surfaces as `isError: true`.
- [ ] **Step 2: Run it to verify it fails** — `npx jest src/__tests__/unit/readonlySingleCall.test.ts`
- [ ] **Step 3: Migrate**, following Task 5 (two calls, `pair`) or Task 7 (one call), and `analyseUnitTest` for the six unit-test readers.
- [ ] **Step 4: Run the tests** — `npx jest src/__tests__/unit && npx tsc --noEmit 2>&1 | grep -c 'error TS'`. Expected: about 60 errors left.
- [ ] **Step 5: Commit** — `git commit -m "refactor(high): the Get handlers answer through the adapter"`

---

## Task 11: The four remaining read-modify-write families

`domain` is done (commits `3fd6307`, `abd7b19`) and is the worked example. Four families take a whole document on 19 and `update` replaces rather than merges: `dataElement`, `package`, `functionGroup`, `tabletype`. Their update handlers currently pass a handful of named fields and no document, which under a replace is silent data loss — the datatype, the length, the fixed values, everything SAP holds and nobody here names.

**Files:**
- Modify: `src/handlers/data_element/low/handleUpdateDataElement.ts`, `src/handlers/data_element/high/handleUpdateDataElement.ts`, `src/handlers/package/low/handleUpdatePackage.ts`, `src/handlers/function/high/handleUpdateFunctionGroup.ts`, `src/handlers/table/high/handleUpdateTable.ts`
- Create: `src/lib/strategies/dataElementPatch.ts`, `packagePatch.ts`, `functionGroupPatch.ts`, `tableTypePatch.ts`
- Test: `src/__tests__/unit/readModifyWrite.test.ts` (exists — extend), one patch test per family

**Interfaces:**
- Consumes: `patchXmlAttribute`, `patchXmlElement`, `patchXmlElementAttribute`, `patchXmlBlock`, `patchIf`, `extractXmlString` from `src/lib/strategies/xmlPatch.ts`; `sequence` from `sequence.ts`.
- Produces: `patchDataElementXml(document: string, properties: Record<string, unknown>): string`, and the same signature for the other three.

**What the corpus backs, and what it does not.** `tests/fixtures/adt/` holds a metadata
document for `package` (`read-metadata-package--01-packages-zmcpshrpkg`) and for
`functionGroup` (`read-metadata-function-group--01-groups-zmcpshrfgrp`). It holds **none
for `dataElement` and none for `tabletype`** — the only data-element document captured is
a create body. So two of the four patches can be tested against a real document and two
cannot. Do not write a stand-in document: capture the two that are missing first, with

```bash
npx tsx scripts/capture-adt-corpus.ts --env <session> --only read-metadata-data-element,read-metadata-tabletype
```

which needs a live session and is therefore the user's call, not the agent's. Until those
two exist, `dataElement` and `tabletype` get only the half of the test that needs no
document — that an unpatchable input throws — and the test name says so.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/packagePatch.test.ts
import { corpusBody } from '../../lib/adtCorpus';
import { patchPackageXml } from '../../lib/strategies/packagePatch';

it('changes the description and keeps everything else byte for byte', () => {
  const before = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
  const after = patchPackageXml(before, { description: 'New text' });
  expect(after).toContain('adtcore:description="New text"');
  // every attribute the caller did not name survives
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
// Only the half that needs no document. The corpus has no data-element metadata
// yet, and a stand-in document would be this repository asserting against its own
// imagination.
import { patchDataElementXml } from '../../lib/strategies/dataElementPatch';

it('throws rather than writing a document it could not patch', () => {
  expect(() => patchDataElementXml('', { description: 'x' })).toThrow();
  expect(() => patchDataElementXml('<other/>', { description: 'x' })).toThrow();
});

it.todo('keeps every unnamed field — unverified: no data-element metadata in the corpus');
```

The empty-input case is the one that matters most. ADT answers a read of a not-yet-ready
object with 200 and an empty body, so a silent `String.replace` turns a slow read into a
malformed write that the server then blames on the caller.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/__tests__/unit/packagePatch.test.ts src/__tests__/unit/dataElementPatch.test.ts
```

Expected: FAIL — cannot find module `packagePatch`.

- [ ] **Step 3: Implement the patch, then wire the handler**

Where the handler holds a lock — every `high` update — the read-patch-write goes
inside `withLock`, not beside it. `sequence` is right only for the part that can
stop at the first failure; the unlock cannot.

```typescript
// the handler shape, already proven in handleUpdateDomain
const written = await sequence(
  () => obj.readMetadata({ dataElementName }, { analyse: analyseException }),
  (current) =>
    obj.updateMetadata(
      { dataElementName },
      {
        lockHandle: lock_handle,
        xmlContent: patchDataElementXml(
          extractXmlString(current, `data element ${dataElementName}`),
          properties,
        ),
        analyse: analyseException,
      },
    ),
);
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/__tests__/unit/readModifyWrite.test.ts src/__tests__/unit/*Patch.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: PASS. `readModifyWrite.test.ts` must still show both halves: every metadata fixture survives `verbatim` byte for byte, and rebuilding one from its parse does not reproduce it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/strategies/*Patch.ts src/handlers/*/low/handleUpdate*.ts src/handlers/*/high/handleUpdate*.ts src/__tests__/unit
git commit -m "feat(update): four more families read, patch and write"
```

---

## Task 12: The eight handlers that called members 19 removed

These do not have a type error to fix — they have no member to call. Each becomes a handler-owned sequence.

**Files:**
- `src/handlers/system/readonly/handleRuntimeRunClass.ts`, `handleRuntimeRunProgram.ts`, `handleRuntimeRunClassWithProfiling.ts`, `handleRuntimeRunProgramWithProfiling.ts` — `runWithProfiling` is gone
- `src/handlers/system/readonly/handleGetWhereUsed.ts`, `src/handlers/structure/readonly/handleGetStructuresList.ts` — `getWhereUsedList` is gone
- `src/handlers/function_include/readonly/handleListFunctionModules.ts`, `handleListFunctionGroupIncludes.ts` — `listFunctionModules` and `listFunctionGroupIncludes` are gone
- `src/lib/search-source/packageEnumerator.ts` — `getPackageContentsList` is gone; use `walkPackage` from `src/lib/strategies/packageWalk.ts`, which already replaced it in `handleGetPackageTree`
- Test: `src/__tests__/unit/handleGetWhereUsedFilters.test.ts` (exists), `packageWalk.test.ts` (exists), plus one new test per profiling handler

**Interfaces:**
- Consumes: `sequence`, `pair`, `ourUtils`, `walkPackage`, `assembleList`, `assembleTree`.
- Produces: nothing new.

- [ ] **Step 1: Establish what each removed member did, from the 19 changelog and the corpus**

```bash
grep -rn "runWithProfiling\|getWhereUsedList\|listFunctionModules\|listFunctionGroupIncludes" \
  node_modules/@mcp-abap-adt/adt-clients/CHANGELOG.md | head -20
git show 57f0645 --stat   # the walk we already moved, as the worked example
```

Write down the endpoint sequence each one issued before writing any code. A sequence guessed from a handler's old arguments is a guess; the changelog and the corpus are the evidence.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/unit/runtimeProfiling.test.ts
it('stops at the first refused step and answers that step\'s failure', async () => {
  fakeClient = clientRefusingAt(1, 'Trace creation refused');
  const result: any = await handleRuntimeRunClassWithProfiling(context as any, {
    class_name: 'ZCL_X',
  });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).message).toBe('Trace creation refused');
});
```

- [ ] **Step 3: Run it to verify it fails** — `npx jest src/__tests__/unit/runtimeProfiling.test.ts`. Expected: FAIL, the handler does not compile against 19.

- [ ] **Step 4: Implement** each as `answer(ctx, () => sequence(...), project)`, every step carrying its own `analyse`. `sequence` returns the failing step's answer untouched; the handler adds nothing about which step it was, because the failure's `request` already carries the URL.

- [ ] **Step 5: Run the tests and commit**

```bash
npx jest src/__tests__/unit
npx tsc --noEmit 2>&1 | grep -c 'error TS'
git commit -m "refactor(system): the eight handlers own the sequences 19 removed"
```

Expected: about 25 errors left.

---

## Task 13: The library files, and the last of the compiler's list

**Files:**
- `src/lib/utils.ts` (2 errors, one of them `IAdtResponse` used with no type argument)
- `src/lib/checkRunParser.ts`
- `src/lib/search-source/sourceReader.ts`, `packageResolver.ts`
- `src/embeddable/BaseMcpServer.ts`
- whatever the compiler still names

- [ ] **Step 1: Regenerate the list**

```bash
npx tsc --noEmit 2>&1 | grep -E '^src/.*error' | sed -E 's/\(.*//' | sort | uniq -c | sort -rn
```

- [ ] **Step 2: Write a test for each behaviour you are about to change**, from the corpus. `checkRunParser.ts` has `normalizeCheckResponse.test.ts` already; extend it rather than starting a new file.

- [ ] **Step 3: Run the tests to verify they fail**, then fix file by file, most errors first.

- [ ] **Step 4: Run the full check**

```bash
npx tsc --noEmit && echo CLEAN
npx jest
```

Expected: `CLEAN`, and the whole unit suite green.

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor(lib): the last of the envelope reads"
```

---

## Task 14: The invariants, as tests rather than as intentions

Three of the spec's success criteria are claims about 326 files. A reviewer cannot check those by reading, and neither can the next person to add a handler.

**Files:**
- Create: `src/__tests__/unit/handlerInvariants.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/__tests__/unit/handlerInvariants.test.ts
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const handlers = globSync('src/handlers/**/handle*.ts');

/** The envelope is gone; a file still naming it is a file still on 18. */
it('no handler reads an envelope property', () => {
  const ENVELOPE = /\.(readResult|metadataResult|deleteResult|createResult|updateResult|unlockResult|activateResult|validationResponse|checkResult)\b/;
  const offenders = handlers.filter((f) => ENVELOPE.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});

/** The verdict belongs to `analyse`. A handler reading the document to decide
 *  is a second opinion beside the strategy's, and the two will disagree. */
it('no handler decides a refusal for itself', () => {
  const VERDICT = /exc:exception|del:isDeleted|activationExecuted|chkrun:status|CHECK_RESULT/;
  const offenders = handlers
    .filter((f) => VERDICT.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});

/** Every call carries one. Without it the default verdict is a status-code
 *  reading, and ADT puts refusals inside a 200. */
it('every client call passes an analyse', () => {
  const offenders: string[] = [];
  for (const file of handlers) {
    const source = readFileSync(file, 'utf8');
    // `lock` and `unlock` are absent on purpose: neither declares an options
    // parameter in 19, so neither can be given an `analyse`. See the spec.
    const calls = source.match(/\.(read|readMetadata|create|update|updateMetadata|delete|checkDeletion|activate|check|validate)\(/g) ?? [];
    const analyses = source.match(/analyse:/g) ?? [];
    if (calls.length > analyses.length) offenders.push(`${file}: ${calls.length} calls, ${analyses.length} analyse`);
  }
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run it**

```bash
npx jest src/__tests__/unit/handlerInvariants.test.ts
```

Expected: PASS if Tasks 5–13 are complete. Every failure names a file — fix the file, never the regex. If a file genuinely must be excepted, the exception goes in the test with a sentence saying why, so a reviewer sees it.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/unit/handlerInvariants.test.ts
git commit -m "test(handlers): the three invariants, checked rather than intended"
```

---

## Task 15: `detail` on the JSON-answering tools

Last, deliberately: adding a parameter before the handlers can honour it puts a lie on the tool surface.

**Files:**
- Modify: the `TOOL_DEFINITION` of every tool whose promised form is JSON
- Modify: `tests/fixtures/tools/surface.json` — regenerate, with the added `detail` as the only difference
- Test: `src/__tests__/unit/detailSurface.test.ts` (create)

- [ ] **Step 1: Enumerate the JSON-answering tools**

```bash
npx tsx scripts/list-tools.ts | node -e "
const groups = JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const [g, tools] of Object.entries(groups))
  for (const t of tools) console.log(g, t.name);
" > /tmp/all-tools.txt
```

A tool answers JSON unless it hands a document through — source or metadata as the whole answer. `source_code` or `metadata` as the *only* field is a pass-through; the same field inside a JSON object with others is JSON.

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/unit/detailSurface.test.ts
it('declares detail on every JSON-answering tool and on no other', () => {
  const withDetail = toolsDeclaring('detail');
  expect(withDetail.sort()).toEqual(JSON_ANSWERING.sort());
});

// `detail` is a claim about SUCCESSES only — a failure carries `raw_body` at
// every level, and `answerFailure.test.ts` is where that is held.
it('answers raw as the document and terse as the summary, for one of them', async () => {
  const terse: any = await handleCheckClass(context as any, { class_name: 'ZCL_X' });
  const raw: any = await handleCheckClass(context as any, { class_name: 'ZCL_X', detail: 'raw' });
  expect(raw.content[0].text).toContain('<?xml');
  expect(terse.content[0].text).not.toContain('<?xml');
});
```

`JSON_ANSWERING` is the list from Step 1, written into the test as data. That is the point: the list is a decision, and a decision belongs where a reviewer can see it.

- [ ] **Step 3: Run it to verify it fails** — `npx jest src/__tests__/unit/detailSurface.test.ts`

- [ ] **Step 4: Implement** — spread `DETAIL_PROPERTY` into each tool's `properties`, and replace the hardcoded `detail: 'terse'` in those handlers with `detailOf(args)`.

- [ ] **Step 5: Regenerate the surface snapshot and check the diff is only `detail`**

```bash
npx tsx scripts/list-tools.ts > tests/fixtures/tools/surface.json
git diff tests/fixtures/tools/surface.json | grep '^[-+]' | grep -v detail | grep -v '^[-+][-+]'
```

Expected: no output. Anything printed is a surface change this work was not allowed to make.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tools): detail on the tools whose answer is JSON"
```

---

## Task 16: Documentation, and the close

Releasing means updating everything the change touches, not only the changelog.

**Files:**
- `README.md`, `docs/` — anything describing a handler's answer or the tool parameters
- `CHANGELOG.md`
- Delete: `docs/superpowers/specs/2026-09-12-consumer-side-migration-design.md` and this plan, once the work is merged — specs and plans live in the tree only while active

- [ ] **Step 1: Find the stale prose**

```bash
grep -rln "readResult\|metadataResult\|adt-clients 18\|activationRefusal\|deletionRefusal" README.md docs/ | grep -v superpowers
npm run docs:tools
```

- [ ] **Step 2: Update it**, including a migration note for anyone on the old contract: `detail` is new and optional, and a read that used to answer `success: true` with a null body now answers an error.

- [ ] **Step 3: Run everything**

```bash
npx tsc --noEmit && npm run lint:check && npx jest
```

Expected: clean, clean, green.

- [ ] **Step 4: Ask the user before any integration run.** Integration tests hit a real SAP system and take 15–25 minutes; whether to run them, and against which session, is the user's call.

```bash
# only on the user's word, and never truncated
npm run test:integration 2>&1 | tee /tmp/integration-test.log
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/answer-adapter
gh pr create --title "Migrate onto adt-clients 19" --body "..."
```

- [ ] **Step 6: After merge, delete the spec and this plan**, per the project's lifecycle rule. History lives in git.

---

## Risks, named

- **The slot table is a judgement, and Task 3 is where it is reviewable.** If `deletionCheck` or `validation` wants `verbatim` rather than `structured` in some family, the corpus says so and the test in Task 3 is where it is recorded.
- **`statusOnly` on `created` changes what a create answers**, from whatever the body held to `'SUCCESS'`. The tool's schema does not change, so Task 1's ratchet stays green — but the answer's content does, and that is a deliberate decision from the spec ("a write is made to change something; when it works, 'it worked' is all a caller needs"). A reviewer who disagrees should say so before Task 9, which applies it 30 times.
- **The corpus does not back every row.** A refused `create` is unrecorded for every family, `where-used` has only ever answered one hit, `transport list` has only ever answered empty, and no captured check message carries `chkrun:t100Key`. Tests for those say plainly that they are unverified rather than asserting an invented document. Issue #200 tracks the gap.
- **The invariant regexes in Task 14 are blunt.** They will catch a comment that mentions `exc:exception`. That is the right direction to be wrong in, and the fix is to move the comment, not to loosen the pattern.

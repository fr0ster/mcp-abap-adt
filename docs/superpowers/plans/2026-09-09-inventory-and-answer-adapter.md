# Inventory and the answer adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the stage-1 inventory the design makes a precondition, and build the
adapter every handler will eventually answer through — without moving a single handler
onto it.

**Architecture:** Two independent pieces, in this order. The inventory is a document:
every tool's current inputs, outputs, transformation and error decision, plus the terse
projection proposed for it and every field that would be dropped. The adapter is one
file with no callers yet: it turns an `IAdtResponse` into an MCP result, owns the
exception boundary, and never lets a defect of ours wear a server's `origin`.

**Tech Stack:** TypeScript (strict, CommonJS), Jest with ts-jest, Biome,
`@mcp-abap-adt/adt-clients` 18, `@mcp-abap-adt/interfaces` 39.

**Spec:** `docs/superpowers/specs/2026-09-08-result-error-strategies-design.md`
(approved 2026-09-09).

**Why no handler migration here.** An earlier draft of this plan put a handler group
first, on the premise that a source reader's output is just the source and would
therefore not change. That is false: `ReadClass` answers
`{ success, class_name, version, source_code, metadata }`, and the others answer their
own envelope. Worse, two of them earn their envelope — `ReadProgram` reads the metadata
to reject a `PROG/I` with `invalid_object_type` rather than a misleading
`{ success: true, source_code: null }`, and `ReadFunctionModule` checks that the module
belongs to the group it was asked about. A mechanical move to an identity projection
would have deleted both guarantees and changed every reader's output before the table
that is supposed to authorise such changes existed. So: the table first, every handler
after, in plans written from it.

## Global Constraints

- All repository artifacts — code, comments, commit messages, docs — in **English**.
- Branch from `main`, named `feat/answer-adapter`. Never commit to `main` directly;
  specs and plans are the exception and are already there.
- Stack: `@mcp-abap-adt/adt-clients@^18.0.1`, `@mcp-abap-adt/interfaces@^39.0.1`,
  `@mcp-abap-adt/connection@^8.0.1`, `@mcp-abap-adt/logger@^0.3.1`.
- `npm ls @mcp-abap-adt/interfaces` must print **one** version for the core chain.
  Two structurally identical copies do not compare equal in TypeScript.
- Biome: single quotes, semicolons, 2-space indent. `npm run lint` before every commit.
- After every step that changes code:
  `npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1; grep -c 'TS1128\|TS1005' /tmp/tsc.log`
  must print `0`. A sudden drop in the total error count usually means a parse failure
  stopped the compiler — see `docs/development/TROUBLESHOOTING.md`.
- Unit tests run without SAP: `npx jest src/__tests__/unit`.
- **No handler is modified by this plan.** A task that finds itself editing
  `src/handlers/` has gone outside its scope.

---

### Task 1: The tool inventory

**Files:**
- Create: `docs/superpowers/specs/2026-09-09-tool-inventory.md`

**Interfaces:**
- Consumes: nothing. This task reads `main` and writes a document.
- Produces: the compatibility table every later plan is written from — one row per tool,
  carrying the columns listed in Step 2. Nothing downstream may drop a field or an input
  that does not appear in it.

- [ ] **Step 1: Enumerate the tools**

```bash
grep -rl 'TOOL_DEFINITION' src/handlers --include='*.ts' | sort > /tmp/tools.txt
wc -l /tmp/tools.txt
```

Each file is one row. Read its `TOOL_DEFINITION` for the name and the input schema, and
its handler body for the rest.

- [ ] **Step 2: Fill one row per tool**

| column | what goes in it |
|---|---|
| tool | the `name` from `TOOL_DEFINITION` |
| current inputs | every property of `inputSchema`, and which are required |
| current default output | the exact object the handler returns today, field by field |
| transformation today | how it turns the ADT answer into that output — name the parser it calls, or "returns the document" |
| error decision today | what it treats as a failure — an HTTP status, a thrown error, a field in the document |
| guarantees | any check the handler performs beyond reading, quoted from its own comment where it has one |
| new inputs | after `detail` is added and any removed parameter is gone |
| new terse projection | the fields terse will carry |
| dropped | every field in "current default output" absent from "new terse projection" |
| justification | why each dropped field may go |

The rule for the last two, from the spec: a field the caller needs to make the next call
— an object name it did not already have, a transport number it must quote — stays in
`terse`; a field that only describes what just happened moves to `full`.

The **guarantees** column is not decoration. Two known entries, and the inventory must
find the rest:

- `src/handlers/program/readonly/handleReadProgram.ts` reads the metadata to reject
  anything that is not `PROG/P`, answering `invalid_object_type` — explicitly so that a
  caller does not receive `{ success: true, source_code: null }` and read it as a
  permission problem.
- `src/handlers/function_module/readonly/handleReadFunctionModule.ts` checks that the
  module belongs to the function group it was asked about.

A guarantee that depends on a field is a reason that field stays, or a reason the
guarantee moves somewhere it still holds. Either is a decision, and it goes in the row.

- [ ] **Step 3: Record the traversal bound**

For `GetPackageTree`, `GetPackageContents` and `GetObjectsList`, run each against a real
package on the trial system and record how many objects and how many round trips a full
walk costs:

```bash
npx tsx scripts/probe-transport-list.ts --env trial.env   # pattern for a probe script
```

Write a probe in the same shape for package contents if none exists. Fix the safety bound
from the measurement and write both the number and the measurement down. This is the one
number the design deliberately left to the inventory.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-09-tool-inventory.md
git commit -m "docs(spec): the stage-1 tool inventory

One row per tool: current inputs and output, how it transforms an answer today,
how it decides an error, and what it guarantees beyond reading. Then the
proposed terse projection and every field that would be dropped, each with its
justification.

The guarantees column exists because two readers earn their envelopes —
ReadProgram rejects a PROG/I by reading the metadata, ReadFunctionModule checks
the module belongs to its group — and a migration that did not know that would
delete both.

Includes the traversal bound, measured rather than guessed."
```

- [ ] **Step 5: Stop and ask for review**

The design makes this table a precondition: no handler moves until it is reviewed. Post
the table and wait. Do not begin any migration plan on your own authority.

---

### Task 2: The adapter's success half

**Files:**
- Create: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerSuccess.test.ts`

**Interfaces:**
- Consumes: `IAdtResponse`, `IAdtError` from `@mcp-abap-adt/interfaces`.
- Produces:
  - `type AnswerDetail = 'terse' | 'full' | 'raw'`
  - `interface AnswerContext { tool: string; detail: AnswerDetail }`
  - `interface McpResult { isError: boolean; content: Array<{ type: 'text'; text: string }> }`
  - `function return_answer<T>(answer: IAdtResponse<T, IAdtError>, project: (value: T) => unknown, ctx: AnswerContext): McpResult`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerSuccess.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { return_answer } from '../../lib/answer';

function success<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

const ctx = { tool: 'GetClass', detail: 'terse' as const };

describe('return_answer — success', () => {
  it('passes a string projection through verbatim', () => {
    const result = return_answer(success('CLASS zcl_x.'), (v) => v, ctx);

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('CLASS zcl_x.');
  });

  it('serialises anything else as indented JSON', () => {
    const result = return_answer(success({ a: 1 }), (v) => v, ctx);

    expect(result.content[0].text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('treats an undefined projection as a failure, never as SUCCESS', () => {
    const result = return_answer(success('anything'), () => undefined, ctx);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('projection_failed');
    expect(payload.tool).toBe('GetClass');
    expect(payload.detail).toBe('terse');
    expect(payload.origin).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/answerSuccess.test.ts`
Expected: FAIL — `Cannot find module '../../lib/answer'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/answer.ts
/**
 * How a handler answers.
 *
 * adt-clients 18 hands back `IAdtResponse`, whose two type parameters are the two
 * injected strategies. Turning either half into an MCP result is this file's job, and
 * only this file's: a handler that did it itself would repeat four lines per tool and
 * throw away everything the error contract carries.
 *
 * See docs/superpowers/specs/2026-09-08-result-error-strategies-design.md.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';

export type AnswerDetail = 'terse' | 'full' | 'raw';

export interface AnswerContext {
  /** The tool's own name, so a local failure can say where it happened. */
  tool: string;
  detail: AnswerDetail;
}

export interface McpResult {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

function text(value: string, isError = false): McpResult {
  return { isError, content: [{ type: 'text', text: value }] };
}

function json(payload: unknown, isError = false): McpResult {
  return text(JSON.stringify(payload, null, 2), isError);
}

/**
 * A failure of our own reading, which never borrows an `AdtFailureOrigin`:
 * `connection` and `refusal` are both claims about the server, and neither is true
 * when the defect is in this process.
 */
function local(kind: string, ctx: AnswerContext, message: string): McpResult {
  return json({ error: kind, tool: ctx.tool, detail: ctx.detail, message }, true);
}

export function return_answer<T>(
  answer: IAdtResponse<T, IAdtError>,
  project: (value: T) => unknown,
  ctx: AnswerContext,
): McpResult {
  if (!answer.ok) {
    throw new Error('return_answer: failure half not implemented yet');
  }

  const projected = project(answer.getResult().value);

  if (projected === undefined) {
    return local(
      'projection_failed',
      ctx,
      `the ${ctx.detail} projection produced no value for ${ctx.tool}`,
    );
  }

  return typeof projected === 'string' ? text(projected) : json(projected);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/__tests__/unit/answerSuccess.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerSuccess.test.ts
git add src/lib/answer.ts src/__tests__/unit/answerSuccess.test.ts
git commit -m "feat(answer): the adapter's success half

A string projection goes back verbatim, so source and raw stay themselves;
anything else is indented JSON. An undefined projection is a failure on the
local path, never SUCCESS: the adapter cannot tell a write with nothing to add
from a read that found nothing, and reading the second as success is the
masking defect this repository has removed three times."
```

---

### Task 3: The adapter's failure half

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerFailure.test.ts`

**Interfaces:**
- Consumes: `return_answer`, `AnswerContext`, `McpResult` from Task 2.
- Produces: the failure payload shape — `{ message, origin, code?, adt_type?, namespace?, request?, messages?, raw_body? }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerFailure.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { return_answer } from '../../lib/answer';

function failure(
  error: Partial<IAdtError> & { messages?: unknown },
): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => error,
  } as unknown as IAdtResponse<never, IAdtError>;
}

const project = (v: unknown) => v;

describe('return_answer — failure', () => {
  it('keeps the allowlist and omits what the strategy did not fill', () => {
    const result = return_answer(
      failure({ message: 'Object is locked', origin: 'refusal', code: 'LOCK_FAILED' }),
      project,
      { tool: 'UpdateClass', detail: 'terse' },
    );

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      message: 'Object is locked',
      origin: 'refusal',
      code: 'LOCK_FAILED',
    });
  });

  it('carries the server classification and the request when present', () => {
    const result = return_answer(
      failure({
        message: 'No authorization',
        origin: 'refusal',
        adtType: 'CLAS/OC',
        namespace: '/SAP/',
        request: { method: 'POST', url: '/sap/bc/adt/oo/classes' },
      }),
      project,
      { tool: 'CreateClass', detail: 'terse' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.adt_type).toBe('CLAS/OC');
    expect(payload.namespace).toBe('/SAP/');
    expect(payload.request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/oo/classes',
    });
  });

  it('never serialises the response object', () => {
    const circular: Record<string, unknown> = { headers: { cookie: 'secret' } };
    circular.self = circular;

    const result = return_answer(
      failure({ message: 'boom', origin: 'connection', response: circular as never }),
      project,
      { tool: 'GetClass', detail: 'terse' },
    );

    expect(result.content[0].text).not.toContain('cookie');
    expect(JSON.parse(result.content[0].text).response).toBeUndefined();
  });

  it('includes raw_body only at detail raw and only for a string body', () => {
    const error = {
      message: 'boom',
      origin: 'refusal' as const,
      response: { data: '<exc:exception/>' } as never,
    };

    const raw = return_answer(failure(error), project, {
      tool: 'GetClass',
      detail: 'raw',
    });
    expect(JSON.parse(raw.content[0].text).raw_body).toBe('<exc:exception/>');

    const terse = return_answer(failure(error), project, {
      tool: 'GetClass',
      detail: 'terse',
    });
    expect(JSON.parse(terse.content[0].text).raw_body).toBeUndefined();

    const parsed = return_answer(
      failure({
        message: 'boom',
        origin: 'refusal',
        response: { data: { a: 1 } } as never,
      }),
      project,
      { tool: 'GetClass', detail: 'raw' },
    );
    expect(JSON.parse(parsed.content[0].text).raw_body).toBeUndefined();
  });

  it('passes messages through when the strategy supplied them', () => {
    const result = return_answer(
      failure({
        message: 'Check found errors',
        origin: 'refusal',
        messages: [{ type: 'E', text: 'Syntax error in line 3' }],
      }),
      project,
      { tool: 'CheckClass', detail: 'terse' },
    );

    expect(JSON.parse(result.content[0].text).messages).toEqual([
      { type: 'E', text: 'Syntax error in line 3' },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/answerFailure.test.ts`
Expected: FAIL — `return_answer: failure half not implemented yet`.

- [ ] **Step 3: Add the allowlist and replace the failure branch**

Add above `return_answer` in `src/lib/answer.ts`:

```ts
/** What an error strategy may add beyond `IAdtError`; see the spec's Errors section. */
interface MessageCarrier {
  messages?: ReadonlyArray<{ type: string; text: string }>;
}

/**
 * The allowlist. `response` is never serialised: it holds headers, cookies and possibly
 * circular references, and its body is reachable as `raw_body` at `detail: 'raw'`.
 */
function failurePayload(
  error: IAdtError & MessageCarrier,
  ctx: AnswerContext,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    message: error.message,
    origin: error.origin,
  };

  if (error.code !== undefined) payload.code = error.code;
  if (error.adtType !== undefined) payload.adt_type = error.adtType;
  if (error.namespace !== undefined) payload.namespace = error.namespace;
  if (error.request !== undefined) payload.request = error.request;
  if (error.messages !== undefined) payload.messages = error.messages;

  const body = (error.response as { data?: unknown } | undefined)?.data;
  if (ctx.detail === 'raw' && typeof body === 'string') {
    payload.raw_body = body;
  }

  return payload;
}
```

and replace the `if (!answer.ok)` branch inside `return_answer` with:

```ts
  if (!answer.ok) {
    return json(
      failurePayload(answer.getError() as IAdtError & MessageCarrier, ctx),
      true,
    );
  }
```

- [ ] **Step 4: Run both adapter suites**

Run: `npx jest src/__tests__/unit/answerSuccess.test.ts src/__tests__/unit/answerFailure.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerFailure.test.ts
git add src/lib/answer.ts src/__tests__/unit/answerFailure.test.ts
git commit -m "feat(answer): the failure half, as an allowlist

message and origin always; code, adt_type, namespace, request and messages when
the strategy filled them. The response object is never serialised — headers,
cookies, possibly circular — and its body appears only as raw_body, only at
detail: 'raw', and only when it is a string."
```

---

### Task 4: The exception boundary

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerBoundary.test.ts`

**Interfaces:**
- Consumes: `return_answer`, `AnswerContext`, `McpResult` from Tasks 2-3.
- Produces: `function answer<T>(ctx: AnswerContext, call: () => Promise<IAdtResponse<T, IAdtError>>, project: (value: T) => unknown): Promise<McpResult>` — the single entry point every handler will use.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerBoundary.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../lib/answer';

function success<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

const ctx = { tool: 'GetClass', detail: 'full' as const };

describe('answer — the boundary covers the whole pipeline', () => {
  it('adapts a normal answer', async () => {
    const result = await answer(ctx, async () => success('source'), (v) => v);

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('source');
  });

  it('names a throw from the client member client_threw', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw new Error('unsupported operation');
      },
      (v) => v,
    );

    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toBe('unsupported operation');
    expect(payload.origin).toBeUndefined();
  });

  it('names a throw from our projection projection_threw', async () => {
    const result = await answer(ctx, async () => success('source'), () => {
      throw new Error('unexpected shape');
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('projection_threw');
    expect(payload.message).toBe('unexpected shape');
    expect(payload.origin).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/answerBoundary.test.ts`
Expected: FAIL — `answer is not a function`.

- [ ] **Step 3: Add the boundary**

Append to `src/lib/answer.ts`:

```ts
function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The single entry point a handler uses.
 *
 * `IAdtResponse` covers what the server said; it does not cover a throw. adt-clients
 * throws from more than its readings — argument validation, unsupported-operation
 * checks, its own invariants — and our projection can throw on a shape it did not
 * expect. Both are caught here and named apart, and neither borrows an
 * `AdtFailureOrigin`: a parser defect reported as an expired session sends a caller to
 * reauthenticate over a bug in this process.
 */
export async function answer<T>(
  ctx: AnswerContext,
  call: () => Promise<IAdtResponse<T, IAdtError>>,
  project: (value: T) => unknown,
): Promise<McpResult> {
  let response: IAdtResponse<T, IAdtError>;
  try {
    response = await call();
  } catch (thrown) {
    return local('client_threw', ctx, messageOf(thrown));
  }

  try {
    return return_answer(response, project, ctx);
  } catch (thrown) {
    return local('projection_threw', ctx, messageOf(thrown));
  }
}
```

- [ ] **Step 4: Run all three adapter suites**

Run: `npx jest src/__tests__/unit/answer`
Expected: PASS, 11 tests.

- [ ] **Step 5: Confirm no handler was touched**

```bash
git status --short src/handlers   # must print nothing
```

- [ ] **Step 6: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerBoundary.test.ts
git add src/lib/answer.ts src/__tests__/unit/answerBoundary.test.ts
git commit -m "feat(answer): an exception boundary over the whole pipeline

A handler will have no try. adt-clients throws from more than its readings, and
a projection can throw on a shape it did not expect; both are caught and named
apart — client_threw and projection_threw — with no origin, because connection
and refusal are claims about the server and neither is true here.

Nothing calls this yet: handlers move in the plans written from the inventory."
```

---

## What this plan does not contain

Every handler. The adapter lands unused on purpose: which fields a terse projection
carries, and which of today's outputs may be dropped, is what Task 1's table decides, and
the design makes that table's review a precondition. The migration plans — one per group,
written from the table — come next, and each carries the guarantees the inventory found
rather than assuming a handler only reads.

`src/lib/connectionFactory.ts` is cherry-picked from `chore/bump-current-stack` as
infrastructure before Task 2, since nothing compiles against connection 8 without it.

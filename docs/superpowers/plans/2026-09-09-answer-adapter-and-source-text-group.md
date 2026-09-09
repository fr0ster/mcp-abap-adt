# Answer adapter and the source-text group — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the adapter every handler will answer through, and migrate the one
handler group whose output does not change, so the seam is proven before anything
user-visible moves.

**Architecture:** Handlers stop reading `IAdtResponse` themselves. A single adapter
(`answer`) invokes the client member, applies the projection for the requested `detail`,
and turns either half into an MCP result — including the three failure categories that
are ours rather than SAP's. The source-text group goes first because source is source:
its projection is the identity, so a whole group migrates without touching any tool's
observable output.

**Tech Stack:** TypeScript (strict, CommonJS), Jest with ts-jest, Biome,
`@mcp-abap-adt/adt-clients` 18, `@mcp-abap-adt/interfaces` 39.

**Spec:** `docs/superpowers/specs/2026-09-08-result-error-strategies-design.md`
(approved 2026-09-09). This plan covers the adapter and the source-text group only.
The structured group, the write group and the traversal contracts get their own plans
from the same spec, after the stage-1 inventory this plan ends with.

## Global Constraints

- All repository artifacts — code, comments, commit messages, docs — in **English**.
- Branch from `main`, named `feat/answer-adapter`. Never commit to `main` directly;
  specs and plans are the exception and are already there.
- Stack: `@mcp-abap-adt/adt-clients@^18.0.1`, `@mcp-abap-adt/interfaces@^39.0.1`,
  `@mcp-abap-adt/connection@^8.0.1`, `@mcp-abap-adt/logger@^0.3.1`.
- `npm ls @mcp-abap-adt/interfaces` must print **one** version for the core chain.
  Two structurally identical copies do not compare equal in TypeScript.
- Biome: single quotes, semicolons, 2-space indent. `npm run lint` before every commit.
- After every step that changes code, check syntax errors separately:
  `npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1; grep -c 'TS1128\|TS1005' /tmp/tsc.log`
  must be `0`. A sudden drop in the total error count usually means a parse failure
  stopped the compiler — see `docs/development/TROUBLESHOOTING.md`.
- Unit tests run without SAP: `npx jest src/__tests__/unit`.
- No handler may contain `if (!answer.ok)`, `try` around a client call, or a document
  parse when this plan is done with it.

---

### Task 1: The adapter's success half

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

### Task 2: The adapter's failure half

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerFailure.test.ts`

**Interfaces:**
- Consumes: `return_answer`, `AnswerContext` from Task 1.
- Produces: the failure payload shape — `{ message, origin, code?, adt_type?, namespace?, request?, messages?, raw_body? }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerFailure.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { return_answer } from '../../lib/answer';

function failure(error: Partial<IAdtError> & { messages?: unknown }): IAdtResponse<never, IAdtError> {
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
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual({
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
    expect(payload.request).toEqual({ method: 'POST', url: '/sap/bc/adt/oo/classes' });
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

    const raw = return_answer(failure(error), project, { tool: 'GetClass', detail: 'raw' });
    expect(JSON.parse(raw.content[0].text).raw_body).toBe('<exc:exception/>');

    const terse = return_answer(failure(error), project, { tool: 'GetClass', detail: 'terse' });
    expect(JSON.parse(terse.content[0].text).raw_body).toBeUndefined();

    const parsed = return_answer(
      failure({ message: 'boom', origin: 'refusal', response: { data: { a: 1 } } as never }),
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

- [ ] **Step 3: Replace the failure branch**

In `src/lib/answer.ts`, add above `return_answer`:

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
    return json(failurePayload(answer.getError() as IAdtError & MessageCarrier, ctx), true);
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

### Task 3: The exception boundary

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerBoundary.test.ts`

**Interfaces:**
- Consumes: `return_answer`, `AnswerContext` from Tasks 1-2.
- Produces: `function answer<T>(ctx: AnswerContext, call: () => Promise<IAdtResponse<T, IAdtError>>, project: (value: T) => unknown): Promise<McpResult>` — the single entry point every handler uses.

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

- [ ] **Step 4: Run the three adapter suites**

Run: `npx jest src/__tests__/unit/answer`
Expected: PASS, 11 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerBoundary.test.ts
git add src/lib/answer.ts src/__tests__/unit/answerBoundary.test.ts
git commit -m "feat(answer): an exception boundary over the whole pipeline

A handler now has no try. adt-clients throws from more than its readings, and a
projection can throw on a shape it did not expect; both are caught and named
apart — client_threw and projection_threw — with no origin, because connection
and refusal are claims about the server and neither is true here."
```

---

### Task 4: The source-text strategy set, and one handler on it

**Files:**
- Create: `src/lib/strategies/sourceText.ts`
- Modify: `src/handlers/class/readonly/handleReadClass.ts`
- Test: `src/__tests__/unit/sourceTextStrategy.test.ts`

**Interfaces:**
- Consumes: `answer`, `AnswerDetail` from Tasks 1-3.
- Produces:
  - `const sourceTextProjection: (value: string) => string` — the identity, named so a call site says which group it belongs to.
  - `function sourceDetail(args: { detail?: string }): AnswerDetail` — reads the tool argument, defaulting to `terse`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/sourceTextStrategy.test.ts
import { sourceDetail, sourceTextProjection } from '../../lib/strategies/sourceText';

describe('the source-text group', () => {
  it('projects source to itself at every level', () => {
    expect(sourceTextProjection('CLASS zcl_x.')).toBe('CLASS zcl_x.');
  });

  it('defaults the level to terse', () => {
    expect(sourceDetail({})).toBe('terse');
    expect(sourceDetail({ detail: undefined })).toBe('terse');
  });

  it('accepts the three levels and refuses anything else', () => {
    expect(sourceDetail({ detail: 'full' })).toBe('full');
    expect(sourceDetail({ detail: 'raw' })).toBe('raw');
    expect(() => sourceDetail({ detail: 'verbose' })).toThrow(/detail/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/sourceTextStrategy.test.ts`
Expected: FAIL — `Cannot find module '../../lib/strategies/sourceText'`.

- [ ] **Step 3: Write the group**

```ts
// src/lib/strategies/sourceText.ts
/**
 * The source-text group: text in, text out.
 *
 * Source is source. There is nothing to summarise and nothing to parse, so the three
 * levels coincide and the projection is the identity — named rather than inlined so a
 * call site says which group it belongs to, and so the group has one place to change if
 * that ever stops being true.
 */
import type { AnswerDetail } from '../answer';

export const sourceTextProjection = (value: string): string => value;

const LEVELS: readonly AnswerDetail[] = ['terse', 'full', 'raw'];

export function sourceDetail(args: { detail?: string }): AnswerDetail {
  const requested = args.detail;
  if (requested === undefined) {
    return 'terse';
  }
  if (!LEVELS.includes(requested as AnswerDetail)) {
    throw new Error(
      `detail must be one of ${LEVELS.join(', ')}; received ${requested}`,
    );
  }
  return requested as AnswerDetail;
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest src/__tests__/unit/sourceTextStrategy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Migrate `handleReadClass` onto the adapter**

Replace the body between reading the arguments and the return with:

```ts
    const client = createAdtClient(connection, logger);
    const className = class_name.toUpperCase();

    return answer(
      { tool: 'ReadClass', detail: sourceDetail(args) },
      () =>
        client
          .getClass()
          .read({ className }, version as 'active' | 'inactive'),
      sourceTextProjection,
    );
```

with these imports added at the top:

```ts
import { answer } from '../../../lib/answer';
import {
  sourceDetail,
  sourceTextProjection,
} from '../../../lib/strategies/sourceText';
```

and add `detail` to `TOOL_DEFINITION.inputSchema.properties`:

```ts
      detail: {
        type: 'string',
        enum: ['terse', 'full', 'raw'],
        description:
          'How much of the answer to return. For source there is only the source, so all three are the same; the parameter exists for consistency across tools.',
      },
```

- [ ] **Step 6: Typecheck, including the syntax guard**

```bash
npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1
grep -c 'TS1128\|TS1005' /tmp/tsc.log   # must print 0
grep -c 'handleReadClass' /tmp/tsc.log  # must print 0
```

- [ ] **Step 7: Lint and commit**

```bash
npx biome check --write src/lib/strategies/sourceText.ts src/handlers/class/readonly/handleReadClass.ts src/__tests__/unit/sourceTextStrategy.test.ts
git add src/lib/strategies src/handlers/class/readonly/handleReadClass.ts src/__tests__/unit/sourceTextStrategy.test.ts
git commit -m "feat(strategies): the source-text group, and ReadClass on the adapter

Source is source: the projection is the identity and the three levels coincide.
ReadClass now has no verdict check, no try and no parse — it names its group and
hands the call to the adapter. Its observable output is unchanged, which is why
this group goes first."
```

---

### Task 5: The rest of the source-text readers

**Files:**
- Modify, each the same way as `handleReadClass`:
  - `src/handlers/program/readonly/handleReadProgram.ts` — `client.getProgram().read({ programName }, version)`
  - `src/handlers/interface/readonly/handleReadInterface.ts` — `client.getInterface().read({ interfaceName }, version)`
  - `src/handlers/ddl/readonly/handleReadDdl.ts` — `client.getDdl().read({ ddlName }, version)`
  - `src/handlers/table/readonly/handleReadTable.ts` — `client.getTable().read({ tableName }, version)`
  - `src/handlers/structure/readonly/handleReadStructure.ts` — `client.getStructure().read({ structureName }, version)`
  - `src/handlers/function_module/readonly/handleReadFunctionModule.ts` — `client.getFunctionModule().read({ functionGroupName, functionModuleName }, version)`
  - `src/handlers/function_include/readonly/handleReadFunctionInclude.ts` — `client.getFunctionInclude().read({ functionGroupName, includeName }, version)`
  - `src/handlers/include/readonly/handleGetInclude.ts` — `client.getInclude().read({ includeName })`
- Test: `src/__tests__/unit/sourceTextGroupMembership.test.ts`

**Interfaces:**
- Consumes: `answer`, `sourceDetail`, `sourceTextProjection` from Task 4.
- Produces: nothing new. This task only moves handlers onto the seam Task 4 proved.

> `handleGetInclude` currently issues a raw `makeAdtRequestWithTimeout` because
> adt-clients had no include reader. It has one in 18 — `client.getInclude()`, the full
> contract — so this task removes that direct call rather than porting it.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/sourceTextGroupMembership.test.ts
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * A guard, not a behaviour test: these eight readers belong to one group, and the point
 * of the group is that none of them keeps its own verdict check, its own try around a
 * client call, or its own parse.
 */
const SOURCE_TEXT_READERS = [
  'class/readonly/handleReadClass.ts',
  'program/readonly/handleReadProgram.ts',
  'interface/readonly/handleReadInterface.ts',
  'ddl/readonly/handleReadDdl.ts',
  'table/readonly/handleReadTable.ts',
  'structure/readonly/handleReadStructure.ts',
  'function_module/readonly/handleReadFunctionModule.ts',
  'function_include/readonly/handleReadFunctionInclude.ts',
  'include/readonly/handleGetInclude.ts',
];

describe('the source-text readers answer through the adapter', () => {
  for (const relative of SOURCE_TEXT_READERS) {
    it(`${relative} has no verdict check of its own`, () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../handlers', relative),
        'utf8',
      );

      expect(source).toContain("from '../../../lib/answer'");
      expect(source).toContain('sourceTextProjection');
      expect(source).not.toContain('!answer.ok');
      expect(source).not.toContain('getResult()');
      expect(source).not.toContain('XMLParser');
    });
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/sourceTextGroupMembership.test.ts`
Expected: FAIL — the eight files still read their own answers.

- [ ] **Step 3: Migrate them one at a time**

Each file gets the same three changes. Written out in full for `handleReadProgram`; the
other seven differ only in the tool name, the member and the config keys listed under
**Files** above.

Add the imports:

```ts
import { answer } from '../../../lib/answer';
import {
  sourceDetail,
  sourceTextProjection,
} from '../../../lib/strategies/sourceText';
```

Add `detail` to `TOOL_DEFINITION.inputSchema.properties`:

```ts
      detail: {
        type: 'string',
        enum: ['terse', 'full', 'raw'],
        description:
          'How much of the answer to return. For source there is only the source, so all three are the same; the parameter exists for consistency across tools.',
      },
```

Replace everything between reading the arguments and the return with one call:

```ts
    const client = createAdtClient(connection, logger);
    const programName = program_name.toUpperCase();

    return answer(
      { tool: 'ReadProgram', detail: sourceDetail(args) },
      () =>
        client
          .getProgram()
          .read({ programName }, version as 'active' | 'inactive'),
      sourceTextProjection,
    );
```

Delete what that replaces: the `readResult`/`metadataResult` unwrapping, the
`safeStringify` fallback, the `try`/`catch` around the client call, and any
`return_response` building a JSON envelope by hand. The imports they used go with them.

`handleGetInclude` needs one extra deletion: its `makeAdtRequestWithTimeout` call and
the URL it builds, replaced by `client.getInclude().read({ includeName })`.

Run the guard after each file rather than at the end, so a mistake is attributed to the
file that caused it:

```bash
npx jest src/__tests__/unit/sourceTextGroupMembership.test.ts
```

- [ ] **Step 4: Typecheck with the syntax guard**

```bash
npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1
grep -c 'TS1128\|TS1005' /tmp/tsc.log   # must print 0
```

- [ ] **Step 5: Run the whole non-integration suite**

Run: `npx jest --testPathIgnorePatterns='integration' --testPathIgnorePatterns='admin'`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx biome check --write src/handlers src/__tests__/unit/sourceTextGroupMembership.test.ts
git add -A src/handlers src/__tests__/unit/sourceTextGroupMembership.test.ts
git commit -m "feat(strategies): the rest of the source-text readers

Eight readers on one seam, guarded by a test that fails if any of them grows a
verdict check, a parse or its own try back. GetInclude stops issuing a raw ADT
request: adt-clients 18 has an include contract, which is what issue #116 asked
for."
```

---

### Task 6: The stage-1 inventory

**Files:**
- Create: `docs/superpowers/specs/2026-09-09-tool-inventory.md`

**Interfaces:**
- Consumes: nothing. This task reads `main` and writes a document.
- Produces: the compatibility table the spec makes a precondition for the structured
  and write groups — those plans are written from it.

- [ ] **Step 1: List every tool with its current contract**

For each `TOOL_DEFINITION` under `src/handlers/`, record one row:

| tool | current inputs | current default output | how it transforms the answer today | how it decides an error today |

Enumerate with:

```bash
grep -rl 'TOOL_DEFINITION' src/handlers --include='*.ts' | sort
```

- [ ] **Step 2: Add the two migration columns**

Extend each row with **new inputs**, **new terse projection**, and **dropped**. The rule
from the spec: a field the caller needs to make the next call — an object name it did not
already have, a transport number it must quote — stays in `terse`; a field that only
describes what just happened moves to `full`. Every dropped field carries its
justification in its own row.

- [ ] **Step 3: Record the traversal bound**

For `GetPackageTree`, `GetPackageContents` and `GetObjectsList`, measure a real package
on the trial system and record how many objects and round trips a full walk costs. Fix
the safety bound from that number and write it down. This is the one number the spec
deliberately left to the inventory.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-09-tool-inventory.md
git commit -m "docs(spec): the stage-1 tool inventory

Inputs and outputs per tool, current and proposed, with every dropped field
justified in its own row — the precondition the design sets before the
structured and write groups begin. Includes the traversal bound, measured
rather than guessed."
```

---

## What this plan does not contain

The structured group, the write group, the `detail` parameter on tools whose output
actually changes, and the three traversal contracts. All of them depend on the inventory
Task 6 produces: their terse projections are exactly the "new terse" column, and writing
them before that column exists would mean inventing the fields a caller needs. Each gets
its own plan from the same spec.

`src/lib/connectionFactory.ts` is cherry-picked from `chore/bump-current-stack` as
infrastructure before Task 1, since nothing compiles against connection 8 without it.

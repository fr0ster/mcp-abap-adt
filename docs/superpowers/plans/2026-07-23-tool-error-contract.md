# Unified Tool Error Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every failing MCP tool return `{ isError: true, content }` whose text carries no service prefixes, by removing all five sources of prefix and every `McpError` from `src/`.

**Architecture:** Errors stop being thrown and start being returned. `return_error` becomes the single error exit for handlers and emits the bare message. The two server wrappers (`BaseMcpServer`, `BaseHandlerGroup`) return the normalized `isError` result instead of re-wrapping it in an `McpError`. Handler-level `throw new McpError` is converted to `return return_error(...)`, except inside helpers with their own return contract, where a local `Error` subclass is used instead. The end state is enforced by a static test asserting zero references to the identifier `McpError` under `src/`.

**Tech Stack:** TypeScript 6.0.2, `@modelcontextprotocol/sdk` 1.29.0, Jest + ts-jest (`npm test`), Biome 2.4.10 (`npm run lint`), `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-07-23-tool-error-contract-design.md`
**Issue:** [#155](https://github.com/fr0ster/mcp-abap-adt/issues/155)

## Global Constraints

- Branch: `fix/155-tool-error-contract`. Worktree: `/home/okyslytsia/prj/mcp-abap-adt-155`. Never commit to `main`.
- Forbidden anywhere in a returned error `text`: `Error: `, `ADT error: `, `McpError: `, `MCP error -NNNNN: `. The one permitted exception is the SDK's own argument-validation message, which our code never touches.
- `isError: true` is load-bearing — never remove it from a handler result.
- After Task 9, `src/**` outside `__tests__` must contain zero references to the identifier `McpError`.
- `npm test` must be green at the end of every task. It runs unit tests only (`testPathIgnorePatterns` excludes `__tests__/integration/` and `__tests__/admin/`).
- Commit after every task. One task, one commit.
- Never run `npm publish`.

---

### Task 1: `return_error` emits the bare message

**Files:**
- Modify: `src/lib/utils.ts:269-414`
- Test: `src/__tests__/unit/returnError.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `return_error(error: any): { isError: true; content: [{ type: 'text'; text: string }] }` — the text is now the extracted message with no `Error: ` prefix. Every later task depends on this shape.

**Context:** `return_error` is already used by 271 handlers. It currently returns `` text: `Error: ${errorText}` ``. Its `typeof error === 'string'` branch (line 373) is what lets validation sites pass a plain message; it is moved to the top of the chain so that reads plainly.

- [ ] **Step 1: Install dependencies in the worktree**

The worktree has no `node_modules`; `npx tsx` and `jest` fail without it.

```bash
cd /home/okyslytsia/prj/mcp-abap-adt-155
npm install
```

Expected: completes without error. `ls node_modules/typescript/package.json` exists.

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/unit/returnError.test.ts`:

```typescript
import { AxiosError } from 'axios';
import { return_error } from '../../lib/utils';

const textOf = (r: any): string => r.content[0].text;

describe('return_error emits a bare message (#155)', () => {
  it('returns a string input verbatim, with no prefix', () => {
    const result = return_error('Object name is required');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Object name is required');
  });

  it('returns an Error message with no prefix', () => {
    const result = return_error(new Error('Domain ZD_NOPE not found'));
    expect(textOf(result)).toBe('Domain ZD_NOPE not found');
  });

  it('never emits a service prefix', () => {
    for (const input of ['plain', new Error('boom'), 12345, null]) {
      expect(textOf(return_error(input))).not.toMatch(
        /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /,
      );
    }
  });

  it('extracts the ADT response body from an AxiosError', () => {
    const err = new AxiosError('Request failed with status code 404');
    (err as any).response = {
      status: 404,
      statusText: 'Not Found',
      data: '<exc:exception>Resource not found</exc:exception>',
    };
    expect(textOf(return_error(err))).toContain('Resource not found');
  });

  it('keeps DNS diagnostics for ENOTFOUND', () => {
    const err = new AxiosError('getaddrinfo ENOTFOUND sap.example.com');
    (err as any).code = 'ENOTFOUND';
    const text = textOf(return_error(err));
    expect(text).toContain('DNS resolution failed');
    expect(text).toContain('sap.example.com');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /home/okyslytsia/prj/mcp-abap-adt-155
npx jest src/__tests__/unit/returnError.test.ts
```

Expected: FAIL. The first test reports `Expected: "Object name is required"` / `Received: "Error: Object name is required"`. The prefix test fails on every input.

- [ ] **Step 4: Drop the prefix**

In `src/lib/utils.ts`, at the end of `return_error` (line ~405), change:

```typescript
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error: ${errorText}`,
      },
    ],
  };
```

to:

```typescript
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: errorText,
      },
    ],
  };
```

- [ ] **Step 5: Move the string branch to the top of the chain**

Still in `return_error`, the branch chain currently begins `if (error instanceof AxiosError) { … } else if (error instanceof Error) { … } else if (typeof error === 'string') { errorText = error; } else { … }`.

Move the string test first so the common validation case is the shortest path. Change the opening of the `try` block from:

```typescript
  try {
    if (error instanceof AxiosError) {
```

to:

```typescript
  try {
    if (typeof error === 'string') {
      // Validation sites pass a ready message; this is the shortest path.
      errorText = error;
    } else if (error instanceof AxiosError) {
```

and delete the now-duplicate branch further down:

```typescript
    } else if (typeof error === 'string') {
      errorText = error;
    } else {
```

becomes:

```typescript
    } else {
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx jest src/__tests__/unit/returnError.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Run the full unit suite**

```bash
npm test
```

Expected: PASS. `normalizeCheckResponse.test.ts` uses the string `'Error: Class not found'` only as an opaque fixture and asserts identity pass-through, so it is unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils.ts src/__tests__/unit/returnError.test.ts
git commit -m "fix(errors): return_error emits the bare message

Drops the 'Error: ' prefix and moves the string branch to the head of the
chain. Layer 1 of the #155 error contract."
```

---

### Task 2: `BaseMcpServer` returns the error instead of throwing

**Files:**
- Modify: `src/server/BaseMcpServer.ts:357-443`
- Test: `src/__tests__/unit/toolErrorContract.test.ts` (create)

**Interfaces:**
- Consumes: `return_error` from Task 1.
- Produces: the wire contract every later task is measured against — a failing tool yields `{ isError: true, content }`, never a thrown `McpError`.

**Context:** `wrappedHandler` currently flattens `content` into one string and throws `McpError(InternalError)`. The SDK catches that and turns it into an `isError` result whose text is prefixed `MCP error -32603: `. There is also no `try/catch` around `await handlerPromise`, so an uncaught `AxiosError` surfaces as the terse `Request failed with status code NNN` instead of the ADT response body.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/toolErrorContract.test.ts`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AxiosError } from 'axios';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { BaseMcpServer } from '../../server/BaseMcpServer';

const FORBIDDEN_PREFIX =
  /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /;

const STUBS: HandlerEntry[] = [
  {
    toolDefinition: {
      name: 'StubReturnsIsError',
      description: 'returns an isError result',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => ({
      isError: true,
      content: [{ type: 'text', text: 'Domain ZD_NOPE not found' }],
    }),
  },
  {
    toolDefinition: {
      name: 'StubThrowsPlainError',
      description: 'throws a plain Error',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => {
      throw new Error('Failed to read class: ZZ not found');
    },
  },
  {
    toolDefinition: {
      name: 'StubMultiItem',
      description: 'returns multi-item content',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => ({
      isError: true,
      content: [
        { type: 'text', text: 'first item' },
        { type: 'json', json: { second: 'item' } },
      ],
    }),
  },
  {
    toolDefinition: {
      name: 'StubThrowsAxios',
      description: 'throws an AxiosError with a response body',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const err = new AxiosError('Request failed with status code 404');
      (err as any).response = {
        status: 404,
        statusText: 'Not Found',
        data: '<exc:exception>Resource not found</exc:exception>',
      };
      throw err;
    },
  },
];

class StubGroup {
  getName() {
    return 'stub';
  }
  getHandlers() {
    return STUBS;
  }
  registerHandlers() {
    /* registration goes through BaseMcpServer.registerHandlers */
  }
}

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0' });
    this.registerHandlers(new CompositeHandlersRegistry([new StubGroup() as any]));
  }
  // Stubs never touch SAP; bypass the real connection.
  protected async getConnection(): Promise<any> {
    return {} as any;
  }
}

async function connect() {
  const server = new TestServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => client.close() };
}

describe('tool error wire contract (#155)', () => {
  it('a handler-returned isError arrives as an isError result, not a protocol error', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({
      name: 'StubReturnsIsError',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Domain ZD_NOPE not found');
    await close();
  });

  it('no error text carries a service prefix', async () => {
    const { client, close } = await connect();
    for (const name of [
      'StubReturnsIsError',
      'StubThrowsPlainError',
      'StubMultiItem',
      'StubThrowsAxios',
    ]) {
      const result: any = await client.callTool({ name, arguments: {} });
      expect(result.isError).toBe(true);
      for (const item of result.content) {
        expect(item.text).not.toMatch(FORBIDDEN_PREFIX);
      }
    }
    await close();
  });

  it('multi-item content is preserved, not collapsed into one string', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({ name: 'StubMultiItem', arguments: {} });
    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toBe('first item');
    expect(result.content[1].text).toBe(JSON.stringify({ second: 'item' }));
    await close();
  });

  it('an uncaught AxiosError surfaces the ADT response body', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({ name: 'StubThrowsAxios', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Resource not found');
    await close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/__tests__/unit/toolErrorContract.test.ts
```

Expected: FAIL. Texts arrive as `MCP error -32603: Domain ZD_NOPE not found`; the multi-item test reports `content` of length 1; the Axios test reports `Request failed with status code 404`.

- [ ] **Step 3: Import `return_error` in `BaseMcpServer`**

`src/server/BaseMcpServer.ts` line 16 currently reads:

```typescript
import { registerAuthBroker } from '../lib/utils.js';
```

Change to:

```typescript
import { registerAuthBroker, return_error } from '../lib/utils.js';
```

- [ ] **Step 4: Rewrite the handler wrapper**

Replace the whole body of `wrappedHandler` (lines 357-443) with:

```typescript
          const wrappedHandler = async (args: unknown) => {
            try {
              // Get connection from context (this.connectionContext)
              // Token will be automatically refreshed via AuthBroker if needed
              const context: HandlerContext = {
                connection: await this.getConnection(),
                logger: this.logger,
              };

              // If handler expects context+args (preferred), pass both.
              // Otherwise, update group context and call with args only for backward compatibility.
              // NOTE: Always await the handler result to ensure we get the resolved value for normalization
              let handlerPromise: Promise<unknown>;
              if ((entry.handler as HandlerFnWithContext).length >= 2) {
                handlerPromise = (entry.handler as HandlerFnWithContext)(
                  context,
                  args,
                );
              } else {
                try {
                  const contextAwareGroup = group as Partial<{
                    setContext: (ctx: HandlerContext) => void;
                    context: HandlerContext;
                  }>;
                  if (typeof contextAwareGroup.setContext === 'function') {
                    contextAwareGroup.setContext(context);
                  } else {
                    contextAwareGroup.context = context;
                  }
                } catch {
                  // ignore if group doesn't expose context setter
                }
                handlerPromise = (entry.handler as HandlerFnArgsOnly)(args);
              }

              const result = await handlerPromise;

              type ContentItem = {
                type?: string;
                json?: unknown;
                text?: unknown;
              };
              type ToolResult = {
                isError?: boolean;
                content?: ContentItem[];
              };

              // Normalize content: SDK expects text/image/audio/resource, convert custom json to text
              const content = (
                (result as ToolResult | undefined)?.content || []
              ).map((item) => {
                if (item?.type === 'json' && item.json !== undefined) {
                  return {
                    type: 'text' as const,
                    text: JSON.stringify(item.json),
                  };
                }
                // Ensure all items have proper text type structure
                return {
                  type: 'text' as const,
                  text:
                    item?.text !== undefined
                      ? String(item.text)
                      : String(item || ''),
                };
              });

              // A failed tool returns an isError result — it does not throw.
              // Throwing would make the SDK re-wrap the text with "MCP error -32603: ".
              if ((result as ToolResult | undefined)?.isError) {
                return { content, isError: true };
              }

              return { content };
            } catch (error) {
              // An uncaught throw (connection setup, handler, transport) becomes a
              // structured result. return_error extracts the ADT response body,
              // which the SDK's own error.message would discard.
              return return_error(error) as {
                isError: true;
                content: { type: 'text'; text: string }[];
              };
            }
          };
```

Note the `HandlerFnWithContext` / `HandlerFnArgsOnly` type aliases declared just above `wrappedHandler` (lines 351-355) stay where they are — they are outside the replaced body.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest src/__tests__/unit/toolErrorContract.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Build and run the full suite**

```bash
npm run build && npm test
```

Expected: both succeed. The dynamic `import('@modelcontextprotocol/sdk/types.js')` is gone, so `tsc` no longer needs it here.

- [ ] **Step 7: Commit**

```bash
git add src/server/BaseMcpServer.ts src/__tests__/unit/toolErrorContract.test.ts
git commit -m "fix(server): return isError result instead of throwing McpError

Normalization now runs before the isError check, so multi-item content
survives the error path, and an uncaught throw is routed through
return_error. Layer 4 of the #155 error contract."
```

---

### Task 3: `BaseHandlerGroup` — the duplicated wrapper

**Files:**
- Modify: `src/lib/handlers/base/BaseHandlerGroup.ts:1-111`
- Test: `src/__tests__/unit/toolErrorContract.test.ts` (extend)

**Interfaces:**
- Consumes: `return_error` from Task 1.
- Produces: identical contract on the fallback registration path.

**Context:** `registerToolOnServer` (lines 77-108) is a near-verbatim copy of the block fixed in Task 2, reached through the fallback branch of `BaseMcpServer.registerHandlers` (`handlersRegistry.registerAllTools(this)`). Left alone it silently regresses the contract on that path.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/unit/toolErrorContract.test.ts`:

```typescript
describe('BaseHandlerGroup registration path honours the same contract (#155)', () => {
  it('returns isError with unprefixed, uncollapsed content for all four cases', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { BaseHandlerGroup } = await import(
      '../../lib/handlers/base/BaseHandlerGroup'
    );

    // BaseHandlerGroup declares `protected abstract groupName: string` and takes
    // a HandlerContext in its constructor; both must be satisfied.
    class Group extends BaseHandlerGroup {
      protected groupName = 'stub-group';
      getHandlers() {
        // All four stubs: the fallback path must honour the same contract,
        // including the try/catch that routes throws through return_error.
        return STUBS;
      }
    }

    const server = new McpServer({ name: 'group-test', version: '1.0.0' });
    const group = new Group({ connection: {} as any, logger: undefined as any });
    group.registerHandlers(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const single: any = await client.callTool({
      name: 'StubReturnsIsError',
      arguments: {},
    });
    expect(single.isError).toBe(true);
    expect(single.content[0].text).toBe('Domain ZD_NOPE not found');

    const thrown: any = await client.callTool({
      name: 'StubThrowsPlainError',
      arguments: {},
    });
    expect(thrown.isError).toBe(true);
    expect(thrown.content[0].text).toBe('Failed to read class: ZZ not found');

    const multi: any = await client.callTool({ name: 'StubMultiItem', arguments: {} });
    expect(multi.content).toHaveLength(2);
    expect(multi.content[0].text).toBe('first item');
    expect(multi.content[1].text).toBe(JSON.stringify({ second: 'item' }));

    const axios: any = await client.callTool({ name: 'StubThrowsAxios', arguments: {} });
    expect(axios.isError).toBe(true);
    expect(axios.content[0].text).toContain('Resource not found');

    for (const result of [single, thrown, multi, axios]) {
      for (const item of result.content) {
        expect(item.text).not.toMatch(FORBIDDEN_PREFIX);
      }
    }

    await client.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/__tests__/unit/toolErrorContract.test.ts -t 'BaseHandlerGroup'
```

Expected: FAIL with text `MCP error -32603: Domain ZD_NOPE not found`.

- [ ] **Step 3: Replace the imports**

`src/lib/handlers/base/BaseHandlerGroup.ts` lines 1-9 currently read:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  ToolHandler,
} from '../interfaces.js';
import { jsonSchemaToZod } from '../utils/schemaUtils.js';
```

Change to:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  ToolHandler,
} from '../interfaces.js';
import { return_error } from '../../utils.js';
import { jsonSchemaToZod } from '../utils/schemaUtils.js';
```

- [ ] **Step 4: Rewrite the registered callback**

Replace lines 77-109 (the `async (args: any) => { … }` callback passed to `server.registerTool`) with:

```typescript
      async (args: any) => {
        try {
          const result = await handler(this.context, args);

          // Convert content to MCP format - JSON items become text
          const content = (result.content || []).map((item: any) => {
            if (item?.type === 'json' && item.json !== undefined) {
              return {
                type: 'text' as const,
                text: JSON.stringify(item.json),
              };
            }
            return {
              type: 'text' as const,
              text: item?.text || String(item || ''),
            };
          });

          // A failed tool returns an isError result — it does not throw.
          if (result.isError) {
            return { content, isError: true };
          }

          return { content };
        } catch (error) {
          return return_error(error) as {
            isError: true;
            content: { type: 'text'; text: string }[];
          };
        }
      },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest src/__tests__/unit/toolErrorContract.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Build and run the full suite**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/handlers/base/BaseHandlerGroup.ts src/__tests__/unit/toolErrorContract.test.ts
git commit -m "fix(handlers): same error contract on the fallback registration path

BaseHandlerGroup.registerToolOnServer duplicated the BaseMcpServer throw.
Layer 5 of the #155 error contract."
```

---

### Task 4: Replace the 13 `ADT error:` sites

**Files (13 sites, 12 files):**
- Modify: `src/handlers/table/readonly/handleGetTableContents.ts:77`
- Modify: `src/handlers/search/readonly/handleGetObjectsByType.ts:263`
- Modify: `src/handlers/search/readonly/handleGetObjectsList.ts:229`
- Modify: `src/handlers/search/readonly/handleSearchObject.ts:148`
- Modify: `src/handlers/system/readonly/handleGetAllTypes.ts:104`
- Modify: `src/handlers/system/readonly/handleGetObjectStructure.ts:153`
- Modify: `src/handlers/system/readonly/handleGetWhereUsed.ts:170`
- Modify: `src/handlers/system/readonly/handleGetTypeInfo.ts:184` and `:275`
- Modify: `src/handlers/system/readonly/handleGetSqlQuery.ts:230`
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts:191`
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts:220`
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancements.ts:811`

**Interfaces:**
- Consumes: `return_error` from Task 1.
- Produces: nothing new.

**Context:** These sites hand-build an error result with `String(error)`, which discards Axios response bodies and HTTP status parsing. `return_error` recovers both.

- [ ] **Step 1: Confirm the starting count**

```bash
grep -rn 'text: `ADT error:' src/handlers --include='*.ts' | grep -v ':\s*//' | wc -l
```

Expected: `13`.

- [ ] **Step 2: Apply the transformation at each site**

Each site looks like this (exact shape varies only in surrounding whitespace):

```typescript
    } catch (error) {
      logger?.error(`Failed to …`, error as any);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `ADT error: ${String(error)}`,
          },
        ],
      };
    }
```

Replace the returned object with a `return_error` call, keeping any logging:

```typescript
    } catch (error) {
      logger?.error(`Failed to …`, error as any);
      return return_error(error);
    }
```

- [ ] **Step 3: Add the import where missing**

For each of the 12 files, check whether `return_error` is already imported:

```bash
for f in $(grep -rln 'text: `ADT error:' src/handlers --include='*.ts'); do
  grep -q 'return_error' "$f" || echo "NEEDS IMPORT: $f"
done
```

For each file listed, add `return_error` to the existing `from '../../../lib/utils'` import. Example — `src/handlers/system/readonly/handleGetAllTypes.ts`:

```typescript
import { return_error, return_response } from '../../../lib/utils';
```

- [ ] **Step 4: Verify no site remains**

```bash
grep -rn 'ADT error' src/handlers --include='*.ts' | grep -v ':\s*//'
```

Expected: no output.

- [ ] **Step 5: Build and test**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/handlers
git commit -m "fix(handlers): route ADT error sites through return_error

Drops the 'ADT error: ' prefix and restores AxiosError/HTTP parsing that
String(error) discarded. Layer 2 of the #155 error contract."
```

---

### Task 5: Convert handler-body throws — data_element, domain, include, message_class

**Files (28 sites, 8 files):**
- Modify: `src/handlers/data_element/high/handleCreateDataElement.ts` (4 sites)
- Modify: `src/handlers/data_element/high/handleUpdateDataElement.ts` (5 sites)
- Modify: `src/handlers/domain/high/handleCreateDomain.ts` (4 sites)
- Modify: `src/handlers/domain/high/handleUpdateDomain.ts` (5 sites)
- Modify: `src/handlers/include/readonly/handleGetInclude.ts` (1 site)
- Modify: `src/handlers/include/readonly/handleGetIncludesList.ts` (2 sites)
- Modify: `src/handlers/message_class/high/handleCreateMessageClass.ts` (4 sites)
- Modify: `src/handlers/message_class/high/handleCreateMessageClassMessage.ts` (3 sites)

**Interfaces:**
- Consumes: `return_error` from Task 1.
- Produces: nothing new.

**Context:** All 28 sites sit directly in the exported handler body — confirmed by AST, not by indentation — so `return` exits the tool handler. Do **not** touch `instanceof McpError` blocks here; Task 9 owns those.

- [ ] **Step 1: List the exact sites**

```bash
npx tsx scripts/classify-mcperror-throws.ts --json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{JSON.parse(s).filter(x=>x.kind==='handler'&&/(data_element|domain|include|message_class)\//.test(x.file)).forEach(x=>console.log(x.file+':'+x.line))})"
```

Expected: 28 lines.

- [ ] **Step 2: Apply the transformation at each listed site**

The site shape:

```typescript
    if (!args?.name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }
```

becomes:

```typescript
    if (!args?.name) {
      return return_error('Data element name is required');
    }
```

The message argument is copied verbatim, including template literals. A multi-line form:

```typescript
      throw new McpError(
        ErrorCode.InvalidParams,
        `Domain ${domainName} does not exist`,
      );
```

becomes:

```typescript
      return return_error(`Domain ${domainName} does not exist`);
```

- [ ] **Step 3: Add the import where missing**

```bash
for f in src/handlers/data_element/high/handleCreateDataElement.ts \
         src/handlers/data_element/high/handleUpdateDataElement.ts \
         src/handlers/domain/high/handleCreateDomain.ts \
         src/handlers/domain/high/handleUpdateDomain.ts \
         src/handlers/include/readonly/handleGetInclude.ts \
         src/handlers/include/readonly/handleGetIncludesList.ts \
         src/handlers/message_class/high/handleCreateMessageClass.ts \
         src/handlers/message_class/high/handleCreateMessageClassMessage.ts; do
  grep -q 'return_error' "$f" || echo "NEEDS IMPORT: $f"
done
```

Add `return_error` to the existing `lib/utils` import in each file listed.

- [ ] **Step 4: Verify the count dropped by 28**

```bash
npx tsx scripts/classify-mcperror-throws.ts | head -1
```

Expected: `Total throw-new-McpError sites: 51`.

The arithmetic: the classifier reported 80 before any task (74 handler-body + 5
helper + 1 callback in `BaseHandlerGroup`). Task 3 removed the callback, leaving 79,
so this task takes 79 − 28 = 51.

- [ ] **Step 5: Build and test**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/handlers
git commit -m "fix(handlers): return_error instead of throw in data_element/domain/include/message_class

28 handler-body sites. Layer 3 of the #155 error contract, part 1."
```

---

### Task 6: Convert handler-body throws — package, search, structure, table

**Files (27 sites, 8 files):**
- Modify: `src/handlers/package/high/handleCreatePackage.ts` (6 sites)
- Modify: `src/handlers/package/readonly/handleGetPackageContents.ts` (1 site)
- Modify: `src/handlers/search/readonly/handleGetObjectsByType.ts` (4 sites)
- Modify: `src/handlers/search/readonly/handleGetObjectsList.ts` (3 sites)
- Modify: `src/handlers/search/readonly/handleSearchObject.ts` (1 site)
- Modify: `src/handlers/structure/high/handleCreateStructure.ts` (6 sites)
- Modify: `src/handlers/table/high/handleCreateTable.ts` (4 sites)
- Modify: `src/handlers/table/readonly/handleGetTableContents.ts` (2 sites)

**Interfaces:**
- Consumes: `return_error` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: List the exact sites**

```bash
npx tsx scripts/classify-mcperror-throws.ts --json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{JSON.parse(s).filter(x=>x.kind==='handler'&&/(package|search|structure|table)\//.test(x.file)).forEach(x=>console.log(x.file+':'+x.line))})"
```

Expected: 27 lines.

- [ ] **Step 2: Apply the transformation at each listed site**

Identical rule to Task 5 — `throw new McpError(<code>, <message>)` becomes `return return_error(<message>)`, message copied verbatim:

```typescript
      throw new McpError(
        ErrorCode.InvalidParams,
        `Package ${packageName} already exists`,
      );
```

becomes:

```typescript
      return return_error(`Package ${packageName} already exists`);
```

- [ ] **Step 3: Add the import where missing**

```bash
for f in src/handlers/package/high/handleCreatePackage.ts \
         src/handlers/package/readonly/handleGetPackageContents.ts \
         src/handlers/search/readonly/handleGetObjectsByType.ts \
         src/handlers/search/readonly/handleGetObjectsList.ts \
         src/handlers/search/readonly/handleSearchObject.ts \
         src/handlers/structure/high/handleCreateStructure.ts \
         src/handlers/table/high/handleCreateTable.ts \
         src/handlers/table/readonly/handleGetTableContents.ts; do
  grep -q 'return_error' "$f" || echo "NEEDS IMPORT: $f"
done
```

- [ ] **Step 4: Verify the count dropped by 27**

```bash
npx tsx scripts/classify-mcperror-throws.ts | head -1
```

Expected: `Total throw-new-McpError sites: 24` (51 − 27).

- [ ] **Step 5: Build and test**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/handlers
git commit -m "fix(handlers): return_error instead of throw in package/search/structure/table

27 handler-body sites. Layer 3 of the #155 error contract, part 2."
```

---

### Task 7: Convert handler-body throws — system, enhancement, transport

**Files (19 sites, 12 files):**
- Modify: `src/handlers/system/readonly/handleGetWhereUsed.ts` (3 sites)
- Modify: `src/handlers/system/readonly/handleGetSqlQuery.ts` (2 sites)
- Modify: `src/handlers/system/readonly/handleGetAbapAST.ts` (1 site)
- Modify: `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts` (1 site)
- Modify: `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts` (1 site)
- Modify: `src/handlers/system/readonly/handleGetObjectInfo.ts` (1 site)
- Modify: `src/handlers/system/readonly/handleGetTypeInfo.ts` (1 site)
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts` (3 sites)
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts` (2 sites)
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancements.ts:621` (1 site — handler body only)
- Modify: `src/handlers/transport/high/handleCreateTransport.ts` (2 sites)
- Modify: `src/handlers/transport/readonly/handleGetTransport.ts:187` (1 site — handler body only)

**Interfaces:**
- Consumes: `return_error` from Task 1.
- Produces: nothing new.

**Context:** Two files here are mixed. `handleGetEnhancements.ts` also has 4 throws inside helpers (lines 253, 267, 276, 536) and `handleGetTransport.ts` has 1 (line 83). **Those five are out of scope for this task** — Task 8 owns them. Converting them here would turn an error into a success.

- [ ] **Step 1: List the exact sites**

```bash
npx tsx scripts/classify-mcperror-throws.ts --json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{JSON.parse(s).filter(x=>x.kind==='handler'&&/(system|enhancement|transport)\//.test(x.file)).forEach(x=>console.log(x.file+':'+x.line))})"
```

Expected: 19 lines, including exactly `handleGetEnhancements.ts:621` and `handleGetTransport.ts:187` from the two mixed files.

- [ ] **Step 2: Apply the transformation at each listed site**

Same rule. From `handleGetWhereUsed.ts:73`:

```typescript
    if (!args?.object_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Object name is required');
    }
```

becomes:

```typescript
    if (!args?.object_name) {
      return return_error('Object name is required');
    }
```

- [ ] **Step 3: Add the import where missing**

```bash
for f in $(npx tsx scripts/classify-mcperror-throws.ts --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{[...new Set(JSON.parse(s).filter(x=>x.kind==='handler').map(x=>x.file))].forEach(f=>console.log(f))})"); do
  grep -q 'return_error' "$f" || echo "NEEDS IMPORT: $f"
done
```

- [ ] **Step 4: Verify only the helper sites remain**

```bash
npx tsx scripts/classify-mcperror-throws.ts
```

Expected: `Total throw-new-McpError sites: 5` (24 − 19) — only the helper sites remain:

```
Total throw-new-McpError sites: 5

--- helper: 5 ---
  3x  src/handlers/enhancement/readonly/handleGetEnhancements.ts :: determineObjectTypeAndPath
  1x  src/handlers/enhancement/readonly/handleGetEnhancements.ts :: getEnhancementsForSingleObject
  1x  src/handlers/transport/readonly/handleGetTransport.ts :: parseTransportXml
```

- [ ] **Step 5: Build and test**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/handlers
git commit -m "fix(handlers): return_error instead of throw in system/enhancement/transport

19 handler-body sites; the 5 helper sites are deliberately untouched.
Layer 3 of the #155 error contract, part 3."
```

---

### Task 8: The 5 helper sites — local error classes

**Files:**
- Modify: `src/handlers/enhancement/readonly/handleGetEnhancements.ts:253,267,276,536` and the `catch` at `:271-279`
- Modify: `src/handlers/transport/readonly/handleGetTransport.ts:83`
- Test: `src/__tests__/unit/helperErrorBoundary.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing exported — both classes are file-local.

**Context (why this task is separate):** `parseTransportXml` returns transport data, and `handleGetTransport.ts:232-243` does `const transportData = parseTransportXml(...)` then spreads it into `{ success: true, ...transportData }`. Returning a tool result from the helper would emit `success: true` carrying `isError: true` — an error reported as a success, the #154 class of bug. Helpers therefore keep throwing; only the thrown type changes.

`determineObjectTypeAndPath` additionally uses `if (error instanceof McpError) { throw error; }` to distinguish "an error I raised deliberately" from "an unexpected failure to wrap". A file-local error class preserves that distinction exactly.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/helperErrorBoundary.test.ts`:

```typescript
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';

const payload = (result: any) => {
  const text = result.content?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

describe('helper failures never become success results (#155)', () => {
  it('GetTransport: unparseable XML → isError, never success:true', async () => {
    const context: any = {
      connection: {
        makeAdtRequest: async () => ({
          status: 200,
          statusText: 'OK',
          data: '<nonsense/>',
          headers: {},
          config: {},
        }),
      },
      logger: undefined,
    };

    const result: any = await handleGetTransport(context, {
      transport_number: 'TRLK900001',
    });

    expect(result.isError).toBe(true);
    expect(payload(result).success).not.toBe(true);
    expect(result.content[0].text).not.toMatch(
      /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/__tests__/unit/helperErrorBoundary.test.ts
```

Expected: FAIL — the text still reads `MCP error -32603: Invalid transport XML structure - no tm:root found`, because the helper throws an `McpError` which the handler's `instanceof` branch re-throws.

- [ ] **Step 3: Convert `parseTransportXml`**

In `src/handlers/transport/readonly/handleGetTransport.ts`, replace the throw at line 82-86:

```typescript
  if (!root) {
    throw new McpError(
      ErrorCode.InternalError,
      'Invalid transport XML structure - no tm:root found',
    );
  }
```

with:

```typescript
  if (!root) {
    // A helper must not return a tool result: its value is spread into a
    // success payload at the call site. Throw, and let the handler's catch
    // route it through return_error.
    throw new Error('Invalid transport XML structure - no tm:root found');
  }
```

- [ ] **Step 4: Convert `determineObjectTypeAndPath` and `getEnhancementsForSingleObject`**

In `src/handlers/enhancement/readonly/handleGetEnhancements.ts`, add a file-local error class immediately after the imports:

```typescript
/**
 * Raised deliberately by the enhancement helpers. Distinguishes "I decided this
 * input is unusable" from "something unexpected failed", which the helpers'
 * catch blocks need in order to avoid double-wrapping a message.
 */
class EnhancementInputError extends Error {}
```

Replace the throw at line 253-256:

```typescript
          throw new McpError(
            ErrorCode.InvalidParams,
            `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
          );
```

with:

```typescript
          throw new EnhancementInputError(
            `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
          );
```

Replace the throw at line 267-270:

```typescript
    throw new McpError(
      ErrorCode.InvalidParams,
      `Could not determine object type for: ${objectName}. Object is neither a valid class, program, nor include.`,
    );
```

with:

```typescript
    throw new EnhancementInputError(
      `Could not determine object type for: ${objectName}. Object is neither a valid class, program, nor include.`,
    );
```

Replace the catch block at lines 271-279:

```typescript
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    logger?.error(`Failed to determine object type for ${objectName}:`, error);
    throw new McpError(
      ErrorCode.InvalidParams,
      `Failed to determine object type for: ${objectName}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
```

with:

```typescript
  } catch (error) {
    if (error instanceof EnhancementInputError) {
      throw error;
    }
    logger?.error(`Failed to determine object type for ${objectName}:`, error);
    throw new EnhancementInputError(
      `Failed to determine object type for: ${objectName}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
```

Then convert the remaining helper throw at line 536 in `getEnhancementsForSingleObject` the same way: `throw new McpError(<code>, <message>)` becomes `throw new EnhancementInputError(<message>)`, message copied verbatim.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest src/__tests__/unit/helperErrorBoundary.test.ts
```

Expected: PASS. Note the handler's `if (error instanceof McpError) { throw error; }` at `handleGetTransport.ts:255` is now dead — Task 9 removes it. Until then the test passes because nothing throws an `McpError` any more.

- [ ] **Step 6: Verify zero throw sites remain**

```bash
npx tsx scripts/classify-mcperror-throws.ts | head -1
```

Expected: `Total throw-new-McpError sites: 0`.

- [ ] **Step 7: Build and test**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/handlers src/__tests__/unit/helperErrorBoundary.test.ts
git commit -m "fix(handlers): helpers throw local Error types, never tool results

parseTransportXml feeds { success: true, ...transportData }; returning a
tool result there would report an error as a success. Layer 3 of the #155
error contract, helper boundary."
```

---

### Task 9: Remove the residue — dead branches, dead code, dead imports

**Files:**
- Modify: 12 files with `instanceof McpError` (listed below)
- Modify: `src/handlers/system/readonly/handleGetTransaction.ts` — delete lines 52-72
- Modify: `src/handlers/system/readonly/handleGetObjectInfo.ts:97`
- Modify: `src/lib/utils.ts:12,85`
- Modify: every remaining handler that imports `McpError` / `ErrorCode`

**Interfaces:**
- Consumes: Tasks 5-8 complete.
- Produces: the precondition for Task 10 — no `McpError` anywhere in `src/`.

**Context:** With nothing constructing an `McpError`, `if (error instanceof McpError) { throw error; }` is unreachable, and the imports that keep the symbol alive would defeat the Task 10 guard.

The 12 `instanceof` sites:

```
src/handlers/package/high/handleCreatePackage.ts:320
src/handlers/domain/high/handleCreateDomain.ts:295
src/handlers/message_class/high/handleCreateMessageClass.ts:137
src/handlers/message_class/high/handleCreateMessageClassMessage.ts:118
src/handlers/table/high/handleCreateTable.ts:152
src/handlers/structure/high/handleCreateStructure.ts:346
src/handlers/domain/high/handleUpdateDomain.ts:284
src/handlers/transport/readonly/handleGetTransport.ts:255
src/handlers/transport/high/handleCreateTransport.ts:200
src/handlers/enhancement/readonly/handleGetEnhancements.ts:272
src/handlers/data_element/high/handleUpdateDataElement.ts:352
src/handlers/data_element/high/handleCreateDataElement.ts:323
```

`handleGetEnhancements.ts:272` was already converted in Task 8 — verify it now reads `instanceof EnhancementInputError` and leave it alone.

- [ ] **Step 1: Delete the 11 remaining `instanceof McpError` branches**

Each looks like:

```typescript
  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
```

Delete the `if` block, leaving:

```typescript
  } catch (error: any) {
    return return_error(error);
  }
```

- [ ] **Step 2: Delete the commented-out block in `handleGetTransaction.ts`**

Delete lines 52-72 — the fully commented-out `try/catch` containing `throw new McpError(...)` on line 54 and `` text: `ADT error: ${String(error)}` `` on line 68. It is the only commented-out throw in the repo, and a text-based reader of the codebase would trip on it.

- [ ] **Step 3: Fix the prefix-dependent filter in `handleGetObjectInfo.ts`**

Line 94-98 currently reads:

```typescript
        if (
          'text' in entry &&
          typeof entry.text === 'string' &&
          !entry.text.trim().startsWith('Error: <?xml')
        ) {
```

That condition keys on the `Error: ` prefix removed in Task 1, so it is now always true — a silent behaviour change if left in place. The enclosing `if (!searchResult.isError && …)` at line 87 already gates error results, so the inner check is redundant. Replace with:

```typescript
        // The `Error: <?xml` guard that used to live here keyed on a prefix
        // removed in #155; the `!searchResult.isError` gate above covers it.
        if ('text' in entry && typeof entry.text === 'string') {
```

- [ ] **Step 4: Remove the now-unused imports**

```bash
grep -rn 'McpError\|ErrorCode' src/handlers --include='*.ts'
```

For every hit, remove `McpError` and `ErrorCode` from the import list. Where they were the only named imports, delete the whole import statement. Where other names remain, keep those — e.g.

```typescript
import { ErrorCode, McpError, return_response } from '../../../lib/utils';
```

becomes:

```typescript
import { return_response } from '../../../lib/utils';
```

- [ ] **Step 5: Drop the re-export from `lib/utils.ts`**

Line 12:

```typescript
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
```

Delete it if neither symbol is used elsewhere in the file:

```bash
grep -n 'McpError\|ErrorCode' src/lib/utils.ts
```

Line 85:

```typescript
export { ErrorCode, getTimeout, getTimeoutConfig, logger, McpError };
```

becomes:

```typescript
export { getTimeout, getTimeoutConfig, logger };
```

This re-export is why handlers imported `McpError` from `'../../../lib/utils'` rather than from the SDK.

- [ ] **Step 6: Verify the symbol is gone**

```bash
grep -rn 'McpError' src --include='*.ts' | grep -v '__tests__'
```

Expected: no output.

- [ ] **Step 7: Build and test**

```bash
npm run build && npm test
```

Expected: both succeed. `tsc` catches any import left dangling.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "refactor(errors): remove McpError from src entirely

Deletes the 11 unreachable instanceof re-throw branches, the commented-out
block in handleGetTransaction, the prefix-dependent filter in
handleGetObjectInfo, and the lib/utils re-export that fed them all."
```

---

### Task 10: Static guard — zero `McpError` references in `src/`

**Files:**
- Test: `src/__tests__/unit/noMcpErrorInSrc.test.ts` (create)

**Interfaces:**
- Consumes: Task 9 complete.
- Produces: the regression guard for the whole contract.

**Context:** This guard is what protects the 321 sites that compose messages like `` `Failed to update package: ${error.message}` ``. Nothing sanitizes those strings at runtime; they are safe only because no `McpError` exists to be interpolated into them. Asserting absence of the symbol is stronger than asserting absence of a `throw` shape: an absent symbol cannot be constructed indirectly (`throw makeMcpError()`) or under an alias (`import { McpError as E }`).

- [ ] **Step 1: Write the test**

Create `src/__tests__/unit/noMcpErrorInSrc.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('McpError is absent from src (#155)', () => {
  it('no source file outside __tests__ references the identifier', () => {
    const offenders: string[] = [];

    for (const file of tsFiles(SRC)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('McpError')) continue;

      const sf = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === 'McpError') {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          offenders.push(`${path.relative(SRC, file)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    expect(offenders).toEqual([]);
  });
});
```

The AST walk is deliberate: a text `grep` would also match commented-out code and string literals, and the identifier scan reports only real references.

- [ ] **Step 2: Run the test to verify it passes**

```bash
npx jest src/__tests__/unit/noMcpErrorInSrc.test.ts
```

Expected: PASS. If it fails, the failure message lists the exact `file:line` still referencing the symbol — finish Task 9 for those.

- [ ] **Step 3: Verify the guard actually bites**

Temporarily add `import { McpError } from '@modelcontextprotocol/sdk/types.js';` to `src/lib/utils.ts`, re-run the test, confirm it FAILS and names `lib/utils.ts`, then remove the line.

```bash
npx jest src/__tests__/unit/noMcpErrorInSrc.test.ts
```

Expected: FAIL while the import is present, PASS after removing it. A guard never observed failing is not a guard.

- [ ] **Step 4: Run the full suite**

```bash
npm run build && npm test
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/unit/noMcpErrorInSrc.test.ts
git commit -m "test(errors): assert McpError is absent from src

An absent symbol cannot be constructed indirectly or under an alias, so this
covers the evasions an AST throw-shape check would miss."
```

---

### Task 11: Live verification on the trial system, then close out

**Files:**
- Modify: `CHANGELOG.md`
- Delete: `docs/superpowers/specs/2026-07-23-tool-error-contract-design.md`
- Delete: `docs/superpowers/plans/2026-07-23-tool-error-contract.md`

**Interfaces:**
- Consumes: Tasks 1-10 complete.
- Produces: the evidence the spec requires before this can be called done.

**Context:** Unit tests alone produced the incorrect diagnosis recorded in issue #155; only a live run revealed the double wrapping. Per `CLAUDE.md`, specs and plans live in the tree only while active and are deleted once implemented — history stays in git.

- [ ] **Step 1: Ask before touching SAP**

The probe opens a real session against the `trial` destination. Confirm with the user that the trial system is reachable and the session is current before running it. Do not refresh tokens unattended.

- [ ] **Step 2: Rebuild and run the probe**

```bash
npm run build
MCP_UNSAFE=true npx tsx scripts/probe-tool-error.ts --case all 2>&1 | tee /tmp/probe-after.log
```

- [ ] **Step 3: Compare against the baseline**

The baseline is recorded in the #155 comment thread. Expected after the change:

| Case | Before | After |
|---|---|---|
| `GetWhereUsed` no args | `MCP error -32602: Input validation error: …` | **unchanged** — SDK-owned, per the Goal exception |
| `GetWhereUsed` bogus `enable_only_types` | `MCP error -32603: ADT error: McpError: MCP error -32602: …` | bare message, no prefix |
| `GetInclude` missing | `MCP error -32603: Request failed with status code 404` | ADT response body, no prefix |
| `GetClass` missing | `MCP error -32603: Error: Failed to read class: …` | `Failed to read class: …` |

If case 1 changed, something suppressed the SDK's validation — investigate before proceeding.

- [ ] **Step 4: Confirm `extractErrorMessage` became a no-op**

`src/__tests__/integration/helpers/testHelpers.ts:76` strips `/^Error:\s*/`. With the prefix gone the call no longer changes anything. Verify no integration helper depends on the stripping:

```bash
grep -rn 'extractErrorMessage' src/__tests__ --include='*.ts'
```

Read each call site and confirm it asserts on message content, not on the prefix having been removed.

- [ ] **Step 5: Update the changelog**

Add to the `[Unreleased]` section of `CHANGELOG.md`:

```markdown
### Fixed

- Tool failures now reach the client as a plain message. Previously the text was
  prefixed with `MCP error -32603: `, sometimes stacked with `ADT error: ` and
  `Error: `, and a semantic `-32602` was overwritten with `-32603`. Multi-item
  `content` is no longer collapsed into a single string on the error path. ([#155](https://github.com/fr0ster/mcp-abap-adt/issues/155))
```

- [ ] **Step 6: Delete the spec and this plan**

```bash
git rm docs/superpowers/specs/2026-07-23-tool-error-contract-design.md
git rm docs/superpowers/plans/2026-07-23-tool-error-contract.md
```

- [ ] **Step 7: Final verification**

```bash
npm run build && npm run lint:check && npm test && npx tsx scripts/classify-mcperror-throws.ts | head -1
```

Expected: build clean, lint clean, all unit tests pass, `Total throw-new-McpError sites: 0`.

- [ ] **Step 8: Commit and open the PR**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): unified tool error contract (#155)"
git push -u origin fix/155-tool-error-contract
gh pr create --title "fix: unified tool error contract (#155)" --body "$(cat <<'EOF'
Tool failures reached the model with service prefixes stacked onto the message,
and a semantic `-32602` overwritten with `-32603`. Verified live against a trial
system before and after.

- `return_error` emits the bare message
- `BaseMcpServer` and `BaseHandlerGroup` return the `isError` result instead of
  re-wrapping it in an `McpError`; multi-item `content` survives the error path
- 74 handler-body throws converted; the 5 helper sites keep throwing, because
  returning a tool result there would spread `isError` into a `success: true`
  payload
- `McpError` is now absent from `src/`, guarded by a test

Closes #155

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the implementer

**Do not "improve" messages while converting.** Copy each message argument verbatim. A sweep that also rewords is impossible to review.

**The classifier is the authority on boundaries, not indentation.** An earlier draft of the design guessed from indentation depth and was wrong. Before converting any throw you did not find via `scripts/classify-mcperror-throws.ts`, run the classifier and check its `kind`.

**Never convert a throw inside a helper.** The failure is silent: the tool returns `success: true` with an error inside it.

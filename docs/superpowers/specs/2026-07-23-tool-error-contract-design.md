# Unified tool error contract

Issue: [#155](https://github.com/fr0ster/mcp-abap-adt/issues/155)
Date: 2026-07-23
Status: designed, not implemented

## Problem

A failing tool reaches the model with service prefixes glued onto the message, and
sometimes with several of them stacked. Live probe against the trial system
(BTP, jwt, 193 tools) produced:

| Call | `text` the client received |
|---|---|
| `GetWhereUsed` with no arguments | `MCP error -32602: Input validation error: …` |
| `GetWhereUsed` with a bogus `enable_only_types` | `MCP error -32603: ADT error: McpError: MCP error -32602: …` |
| `GetInclude` on a missing include | `MCP error -32603: Request failed with status code 404` |
| `GetClass` on a missing class | `MCP error -32603: Error: Failed to read class: …` |

Every call returned `isError: true` — no JSON-RPC protocol error escaped. The
original premise of #155 ("the client gets a protocol error instead of a tool
result") does not hold: the SDK catches thrown `McpError`s in its `CallToolRequest`
handler and converts them to `isError` results. What is actually broken is the text.

Row 2 is the worst case. The handler threw `McpError(InvalidParams)` inside its own
`try`, its own `catch` stringified it into `ADT error: McpError: MCP error -32602: …`,
and `BaseMcpServer` wrapped that once more into `McpError(InternalError)`. The
semantic code `-32602` was overwritten with `-32603`, and the prefix appeared twice.

Five sites contribute prefixes:

| Layer | Location | Prefix added | Reach |
|---|---|---|---|
| 1 | `src/lib/utils.ts:409` (`return_error`) | `Error: ` | 271 handlers |
| 2 | 14 sites of `` text: `ADT error: ${String(error)}` `` | `ADT error: McpError: ` | 13 files |
| 3 | 80 sites of `throw new McpError` | `MCP error -3260X: ` | 29 files |
| 4 | `src/server/BaseMcpServer.ts:404-419` | `MCP error -32603: ` | all 193 tools |
| 5 | `src/lib/handlers/base/BaseHandlerGroup.ts:81-91` | `MCP error -32603: ` | fallback registration path |

Layer 5 is a near-verbatim duplicate of layer 4: `registerToolOnServer` (lines 77-108)
mirrors the tail of `wrappedHandler` (lines 391-442), including the same throw. It is
reached through the fallback branch of `registerHandlers`, which calls
`handlersRegistry.registerAllTools(this)`.

Prefixes are not always leading. 321 sites compose messages of the form
`` `Failed to update package: ${error.message || String(error)}` ``, and
`handleCreatePackage.ts:234` embeds one mid-sentence
(`` `Authentication failed: ${error.message}. Please re-authenticate…` ``). When the
caught value is an `McpError`, its `.message` already carries `MCP error -326XX: `,
and `String(mcpError)` yields `McpError: MCP error -326XX: …`. Any check for
leftover prefixes must therefore be position-independent.

## Goal

A failing tool returns exactly this, with no service prefixes:

```jsonc
{ "isError": true, "content": [{ "type": "text", "text": "<message>" }] }
```

Out of scope by decision: propagating semantic error codes to the client. Errors are
plain text; the distinction between "bad arguments" and "operation failed" is not
represented on the wire.

## Decisions

**Schema-validation errors stay as they are.** The SDK's `validateToolInput` throws
`McpError(InvalidParams)` before control reaches our `wrappedHandler`, so those
messages keep the `MCP error -32602:` prefix. This is deliberate: `-32602` is the
code the MCP spec prescribes for invalid arguments, so unlike `-32603` on business
failures, it is truthful. Suppressing it would require either patching the SDK's
private `_requestHandlers` map (its public `setRequestHandler` refuses to overwrite
an existing `tools/call` handler — `mcp.js:61` asserts) or weakening the zod schemas
of all 193 tools. Both cost more than the inconsistency.

**One error helper, not two.** Everything funnels through `return_error`. A separate
`return_invalid_args` would carry no observable difference on the wire, since codes
are not propagated. `return_error` already handles a plain string
(`typeof error === 'string'`), so validation sites pass their message directly.

**Verification includes a live run.** Unit tests alone produced the incorrect
diagnosis in #155; only a live probe revealed the double wrapping. The probe script
stays in the repo.

## Changes

### Layer 4 — `src/server/BaseMcpServer.ts:404-419`

Hoist the `content` normalization (currently lines 423-440) above the `isError`
check, then return `{ content, isError: true }` instead of throwing. The dynamic
`import('@modelcontextprotocol/sdk/types.js')` is removed. SDK output validation is
unaffected: `validateToolOutput` early-returns when `result.isError` is set.

Additionally, wrap `await handlerPromise` (and the preceding `getConnection()`) in
`try/catch` and route the caught value through `return_error`. This is *not* needed
to remove a prefix — a plain `Error` thrown from a handler already reaches the client
clean, because the SDK uses `error.message` and only `McpError` bakes a prefix into
its own message. It is needed for fidelity: an uncaught `AxiosError` currently
surfaces as the terse `Request failed with status code 404`, whereas `return_error`
extracts the ADT response body, which is where the actual diagnosis lives.

One site, effect on all 193 tools.

### Layer 5 — `src/lib/handlers/base/BaseHandlerGroup.ts:81-91`

The same edit as layer 4, applied to the duplicated block. The two blocks should end
up structurally identical; if one is later changed without the other, the fallback
registration path silently regresses.

### Layer 1 — `src/lib/utils.ts:409`

`` text: `Error: ${errorText}` `` becomes `text: errorText`. The string branch
(currently at line 372) moves to the top of the chain so that
`return_error('Object name is required')` reads plainly.

One site, effect on 271 handlers.

### Layer 2 — 14 sites in 13 files

`` return { isError: true, content: [{ text: `ADT error: ${String(error)}` }] } ``
becomes `return return_error(error)`. Besides dropping the prefix this restores
AxiosError and HTTP-status parsing that `String(error)` discards, so SAP failures
become more informative, not merely cleaner.

### Layer 3 — 80 sites in 29 files

`throw new McpError(code, msg)` becomes `return return_error(msg)`. 12 of the 29
files already import `return_error`; 17 need the import added.

Total: 34 files (3 infrastructure + 31 handlers).

## Risk

15 of the 80 throw sites sit at an indentation depth suggesting they are inside
nested callbacks (`.map`, `.forEach`, IIFE), where `return` would exit the callback
rather than the handler. A mechanical replacement there would silently break control
flow. Concentrations: `handleCreatePackage.ts` (3), `handleUpdateDomain.ts` (2),
`handleUpdateDataElement.ts` (2).

Each of those 15 is checked individually. Where `return` does not exit the handler,
the `throw` stays but throws a plain `Error`, which the enclosing `catch` feeds into
`return_error`. The remaining 65 sites are a mechanical replacement.

## Verification

**Wire contract test, runs in CI** — `src/__tests__/unit/toolErrorContract.test.ts`.
Boots `BaseMcpServer` with a stub registry of four handlers and connects a `Client`
over `InMemoryTransport.createLinkedPair()`. No SAP, no subprocess. The stubs:

1. returns `isError` with a plain message;
2. throws a plain `Error`;
3. returns multi-item `content` including a `type:'json'` element;
4. throws an `AxiosError` carrying a `response.data` body, asserting that the new
   `try/catch` surfaces the body rather than `Request failed with status code NNN`.

Asserts:

- `result.isError === true` and the promise does not reject;
- `text` does not match `/\b(?:McpError: )?MCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /`
  — position-independent by design, per the nested-prefix note above;
- multi-item `content` arrives with all items intact rather than collapsed into one
  string — this is the fidelity loss being fixed, and without the assertion it would
  quietly return.

The same four cases run against `BaseHandlerGroup`'s registration path, since layer 5
is a separate code path with an identical contract.

The position-independent regex is deliberate but has a limit worth stating plainly:
nothing in this change *sanitizes* text. The 321 composition sites of the form
`` `Failed to update package: ${error.message}` `` are left untouched, and if an
`McpError` ever reached one of them the prefix would appear mid-string and no runtime
fix would remove it. What makes those sites safe is the absence of any producer:
after layers 2, 3 and 5 there is no `throw new McpError` left in our code, so the only
`McpError` in existence is the SDK's own, raised before a handler is ever entered.

**Static guard** — the same test file asserts that invariant directly: a grep over
`src/**` finds zero occurrences of `throw new McpError` outside `__tests__`. This is
what actually protects the composition sites; the position-independent regex is the
cheap second line of defence for anything that slips through.

**`return_error` unit tests.** String input returns verbatim; `new Error('x')`
returns `x`; an `AxiosError` carrying `response.data` returns the response body, not
`[object Object]`; an `AxiosError` with `code: 'ENOTFOUND'` keeps its DNS
diagnostics. The last two guard behaviour that must survive the edit.

**Live probe on trial.** `scripts/probe-tool-error.ts` reruns the same four cases.
Three must come back clean; case 1 (schema validation) must stay unchanged. The
baseline is recorded in the #155 comment thread.

**Done means:** all three levels green, `npm run build` and lint clean, `npm test`
without regressions, and `extractErrorMessage` (`testHelpers.ts:76`) confirmed to
have become a no-op without breaking the integration tests that use it.

## Out of scope

`hardMode.ts:109` passes `--exposition=readonly,high,low`, which `validateExposition`
rejects as mutually exclusive, so hard mode currently fails to start at all. Found
while probing this issue; unrelated cause. Separate PR, merged independently.

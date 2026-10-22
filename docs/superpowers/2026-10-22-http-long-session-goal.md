# Goal: over Streamable HTTP, the model names held state by an argument, and can hold a long session

Issue #308.

## Problem

Over Streamable HTTP every request gets a new pooled instance — a new SAP connection, a
`systeminformation` lookup and a logoff per tool call — unless it carries the `state_handle` of an
instance that holds state. The model is told to send that handle in the `x-mcp-state-handle`
**header**, which it cannot set. The pool already reads a `state_handle` **argument** of a
`tools/call`, but no lock or batch tool declares it, and every refusal, description and README
names only the header. So a model over HTTP cannot finish Lock → Update → Unlock, and it has no way
to keep one SAP session across calls when it holds nothing.

## Goal

1. **Everything the model must send is a declared argument.** Every tool that works on held state
   over HTTP declares an optional `state_handle` argument in its input schema; the tools that answer
   a `state_handle` say that later calls send it as that argument. Refusals, tool descriptions and
   documentation name the argument. The `x-mcp-state-handle` header stays, as an alternative for
   programmatic clients.
2. **A long session over HTTP, opened and closed by the model.** A tool opens a long session and
   answers its `state_handle`; every tool takes that `state_handle` as an optional argument, and a
   call carrying it runs on the instance that holds the session, on its SAP session — no new
   connection, no `systeminformation` lookup, no logoff per call. A tool closes it: the SAP session
   is logged off and the instance leaves the pool. This imitates over HTTP what stdio and SSE
   already have: one long session per client.
3. **The idle bound ends a forgotten long session.** The existing idle bound
   (`--state-idle-minutes`) applies to the long session as to any held state: when no call reaches
   it for longer than the bound, the server logs the SAP session off properly and drops the
   instance from the pool.

## Invariants

- The `state_handle` stays what it is: opaque, 128 bits from a cryptographic source, a bearer
  secret. No check of the caller and no limit per owner are added.
- stdio and SSE behave as before; the long-session tools exist only on the Streamable HTTP
  binaries.
- A lock, a batch and a debug session keep working as today, with the header or with the argument.
- One instance runs one call at a time; a call on a held instance waits its turn.
- Documentation describes what the code does. Where the HTTP docs say a request with another
  credential retires a held instance, they are brought in line with the code, which keeps the held
  SAP session and its locks and only updates the credential.

## Out of scope

- A long session over stdio or SSE.
- Any change to how credentials reach the server (`x-sap-*` headers).
- Removing the `x-mcp-state-handle` header.

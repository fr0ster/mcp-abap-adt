# Leftover SAP sessions of a killed server process: listed, resumed or logged off by the user

## Goal

When an MCP server process is killed from outside (`SIGKILL`, OOM, a host that kills its child), the
SAP sessions it held — with the locks a compact `HandlerLock` took in them — are not lost to the
user. A later server process, on any transport (stdio, SSE, the HTTP pool), lets the user **see**
those sessions and **choose** for each: resume it (and finish with the `lock_handle` already held) or
log it off. The server decides nothing by itself: it resumes nothing, logs off nothing and picks
nothing unless the user asks.

A clean end (shutdown, a crash's forced close, every end in `tools/connection-ends.json`) writes its
logoffs and deletes its own runtime files, so it leaves nothing behind.

## The runtime file

- **Where:** `<config dir>/runtime/` (`~/.config/mcp-abap-adt/runtime` on Unix,
  `Documents\mcp-abap-adt\runtime` on Windows; `--auth-broker-path` moves it with the rest).
  Directory `0700`, files `0600`.
- **One file per owned HTTP connection that holds a session**: an instance's own connection
  (`built`) and each debugger connection. File name = the session's **handle**: random, 128 bits.
- **Contents:** process id and its start time; the role (`built` / `debugger`); the destination
  identity — URL, client, system kind, wire — and the backend user (no password, no token); the
  session's cookies (`SAP_SESSIONID_*`, `sap-contextid`, the affinity cookies; cloud: the logoff
  link). Never logged, never shown to the model.
- **Written** after `connect()` and after a call whose answer changed those cookies; **deleted** once
  that connection's logoff is written. It survives only a process that died without its logoff.
- RFC connections get no file: an RFC session is its conversation (a socket) and cannot be picked up
  by another process.

## The tools (one set, on every transport)

All three answer only for the caller's own sessions: a file is the caller's when its destination
identity and backend user equal the credential the caller's request resolved. Someone else's file
and an unknown handle get the same answer: not available. A file whose process is still alive is
never listed or touched (it is that process's).

1. **List leftover sessions** — handle, role, destination, backend user, the time it was written.
   No cookie.
2. **Resume a session** (`built` role only) — the caller's instance builds its own connection on that
   session (connection 16.1.0, below) instead of logging on; the file now belongs to this process.
   If SAP answers that the session is gone, the call says so as SAP gave it and the file is deleted.
   If the instance already holds a session, that one is ended as a replaced connection (its logoff,
   after the last call that uses it).
3. **Log off a session** (any role) — the ICF logoff with that session's cookies (no credential
   needed — measured), then the file is deleted.

Nothing is resumed, logged off or deleted except by these tools or by the process's own clean end.
No TTL: the files stay until the user acts; SAP's answer decides whether a session is alive.

## connection 16.1.0 (minor)

A new sentence in its `docs/SCOPE.md`, item 2: *"An instance may instead be built on an existing
session: `createConnection({ …, session })` takes that session's cookies; `connect()` does not log on,
and SAP's answer to the first request says whether the session is alive. The cookies of the
instance's session are readable (`sessionCookies()`), for the caller to keep."* One instance is still
one session; `disconnect()` once, a logoff iff a live `SAP_SESSIONID`.

## Measured (E19, 2026-10-13)

A `$TMP` class locked through adt-clients 31 / connection 16; the lock checked by a fresh session
trying to LOCK it.

| Case | Lock |
|---|---|
| HTTP: the locking process is killed (`SIGKILL`) | held — still after 60 s |
| A new process with the dead one's cookies (`SAP_SESSIONID`, `sap-usercontext`, `sap-contextid`, stateful): CSRF fetch `200`, UNLOCK with the old `lock_handle` `200` | free — before any logoff |
| The ICF logoff with the dead one's cookies (without `sap-contextid`) alone | free |
| RFC: while the process lives | held |
| RFC: the process is killed | free within ~5 s (the gateway ends the session) |

So an HTTP session of a killed process can be resumed by its cookies, or logged off with them, no
credential needed; RFC needs nothing.

## Out of scope

Resuming a debugger session (its listener, breakpoints and poll loop live in memory; SAP-side
breakpoints are the user's and are touched only by the debugger tools the user calls); RFC resume;
sharing one session between two live processes.

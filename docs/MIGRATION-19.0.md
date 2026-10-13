# Migrating to 19.0.0

19.0.0 splits the server by transport into packages, one mode each, and moves it onto the 6.0.0
auth chain. Go through the section that fits how you run the server.

The packages, all at **19.0.0**:

| Package | Directory | Binary | Serves |
|---|---|---|---|
| `@mcp-abap-adt/lib` | `.` | — | the handlers and the embeddable server |
| `@mcp-abap-adt/core` | `server/` | `mcp-abap-adt` | stdio |
| `@mcp-abap-adt/http` | `http/` | `mcp-abap-adt-http` | Streamable HTTP |
| `@mcp-abap-adt/sse` | `sse/` | `mcp-abap-adt-sse` | HTTP+SSE |
| `@mcp-abap-adt/background-runs-memory` | `background-runs-memory/` | — | the in-memory store of background runs (new; core, http and sse depend on it) |
| `@mcp-abap-adt/compact-readonly-entries`, `@mcp-abap-adt/compact-modify` | `compact-readonly-entries/`, `compact-modify/` | — | the compact tool set's halves (`compact-readonly-entries` was `@mcp-abap-adt/compact-readonly`, renamed) |
| `@mcp-abap-adt/compact` | `compact/` | `mcp-abap-adt-compact` | the compact tool set over stdio |
| `@mcp-abap-adt/compact-http` | `compact-http/` | `mcp-abap-adt-compact-http` | the compact tool set over Streamable HTTP |
| `@mcp-abap-adt/compact-sse` | `compact-sse/` | `mcp-abap-adt-compact-sse` | the compact tool set over HTTP+SSE |
| `@mcp-abap-adt/core-ro` | `core-ro/` | `mcp-abap-adt-ro` | the read-only tool set over stdio (new) |
| `@mcp-abap-adt/http-ro` | `http-ro/` | `mcp-abap-adt-http-ro` | the read-only tool set over Streamable HTTP (new) |
| `@mcp-abap-adt/sse-ro` | `sse-ro/` | `mcp-abap-adt-sse-ro` | the read-only tool set over HTTP+SSE (new) |
| `@mcp-abap-adt/compact-ro` | `compact-ro/` | `mcp-abap-adt-compact-ro` | the read-only compact tool set over stdio (new) |
| `@mcp-abap-adt/compact-http-ro` | `compact-http-ro/` | `mcp-abap-adt-compact-http-ro` | the read-only compact tool set over Streamable HTTP (new) |
| `@mcp-abap-adt/compact-sse-ro` | `compact-sse-ro/` | `mcp-abap-adt-compact-sse-ro` | the read-only compact tool set over HTTP+SSE (new) |

## Every binary: `--transport` is gone, and each reads only its own parameters

- **Remove `--transport`** (and `MCP_TRANSPORT`, and the YAML key `transport`) from every command
  line, client configuration, service unit and config file: a binary is its transport. Any value —
  `--transport=stdio` included — stops the start with the binary's sentence, e.g. "`--transport`
  is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP run `mcp-abap-adt-http`, for SSE
  `mcp-abap-adt-sse` (compact: `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`)". For
  Streamable HTTP run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse`.
- **An option of another binary stops the start** in its CLI and YAML forms, naming the binary that
  serves it — 18.x ignored it. Its **environment variable is not read** — ignored, no refusal, no
  warning — so one shell profile or one `EnvironmentFile` can serve several binaries; only
  `MCP_TRANSPORT` is refused everywhere. Per binary:

  | Binary | Refused, with the words |
  |---|---|
  | `mcp-abap-adt` | the SSE options (`--sse-host`, `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`, YAML `sse`): "SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)"; the Streamable HTTP ones (`--host`, `--port`, `--path`, `--http-*`, YAML `http`): "Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)"; `--tls-*`: "TLS is an option of `mcp-abap-adt-http` and `mcp-abap-adt-sse`"; `--allow-destination-header` (gone). Not read: `MCP_SSE_*`, `MCP_HTTP_*`, `MCP_TLS_*` |
  | `mcp-abap-adt-http` | the destination and login options (`--mcp`, `--env`, `--env-path`, `--auth-broker-path`, `--allow-destination-header`, `--unsafe`, `--connection-type`, `--browser*`, `--login-timeout`, `--renewal`, `--auth-debug`, their YAML keys): "destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers"; the SSE options, with the SSE words. Not read: `MCP_SSE_*`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`, `AUTH_BROKER_PATH`, `SAP_CONNECTION_TYPE` |
  | `mcp-abap-adt-sse` | the destination and login options, as for http; the Streamable HTTP options — `--host`, `--port` and `--path` included — with the Streamable HTTP words. Not read: `MCP_HTTP_*`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`, `AUTH_BROKER_PATH`, `SAP_CONNECTION_TYPE` |

  Each refusal names the form you used first: `--sse-port: SSE is served by …`.
- **Each binary's `--help`, `--conf` template and YAML validation come from its own table.** A
  config file written for 18.x that mixes `transport`, `mcp`, `http:` and `sse:` keys is refused by
  every binary: keep one file per binary, or regenerate it with `--conf=<new file>` (the binary
  writes its template there). The `http:` / `sse:` keys keep their 18.x shape (`http.port`,
  `sse.tls.cert`, …).
- **Values are checked in every form**: a port outside 1-65535, a flag that is not `true` /
  `false`, is refused at start (18.x fell back to the default for `--http-port` / `--sse-port`).
  TLS needs `--tls-cert` and `--tls-key` together (18.x served plain HTTP when one was missing).
- `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` / `state-idle-minutes`, `--system-type` and
  `--conf` are in every binary's table, unchanged. `--exposition` is gone: see the next section.

## Every binary: `--exposition` is gone — the binary fixes its tool set

**You choose the tools by the package you install**, not by a flag. `--exposition` (either
spelling) and the YAML key `exposition` — and with them compact's `ro` / `rw` — are removed from
every binary. Four kinds of binary, each on stdio, Streamable HTTP and SSE:

| Kind | Binaries (packages) | Tools |
|---|---|---|
| core | `mcp-abap-adt` (`@mcp-abap-adt/core`), `mcp-abap-adt-http` (`@mcp-abap-adt/http`), `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`) | readonly (with system and search), high, debug, the leftover sessions (list, resume, logoff), background runs |
| core-ro | `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`), `mcp-abap-adt-http-ro` (`@mcp-abap-adt/http-ro`), `mcp-abap-adt-sse-ro` (`@mcp-abap-adt/sse-ro`) | readonly (with system and search), the leftover-session list and logoff |
| compact | `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`), `mcp-abap-adt-compact-http` (`@mcp-abap-adt/compact-http`), `mcp-abap-adt-compact-sse` (`@mcp-abap-adt/compact-sse`) | the 27 compact tools, the four compact debugger verbs, the leftover sessions, background runs |
| compact-ro | `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`), `mcp-abap-adt-compact-http-ro` (`@mcp-abap-adt/compact-http-ro`), `mcp-abap-adt-compact-sse-ro` (`@mcp-abap-adt/compact-sse-ro`) | the 16 compact tools that change nothing, the leftover-session list and logoff |

No `-ro` binary serves the debugger, a background run or the resume. A `-ro` binary takes exactly
the options, credentials and behaviour of its write counterpart (`mcp-abap-adt-ro` is
`mcp-abap-adt`'s launcher, `mcp-abap-adt-http-ro` `mcp-abap-adt-http`'s, and so on).

**What you passed → what to install** (shown for stdio; over Streamable HTTP and SSE take the
`-http` / `-sse` package of the same row):

| You passed | Install | Run |
|---|---|---|
| `mcp-abap-adt` with no `--exposition`, or `--exposition=readonly,high` | `@mcp-abap-adt/core` | `mcp-abap-adt` (it now also serves the debugger) |
| `mcp-abap-adt --exposition=readonly,high,debug` (or `readonly,debug`, `high,debug`, `high`) | `@mcp-abap-adt/core` | `mcp-abap-adt` |
| `mcp-abap-adt --exposition=readonly` | `@mcp-abap-adt/core-ro` | `mcp-abap-adt-ro` |
| `mcp-abap-adt-compact` with no `--exposition`, `rw` or `rw,debug` | `@mcp-abap-adt/compact` | `mcp-abap-adt-compact` (it now also serves the four debugger verbs) |
| `mcp-abap-adt-compact --exposition=ro` (or `ro,debug`) | `@mcp-abap-adt/compact-ro` | `mcp-abap-adt-compact-ro` (no debugger: it is the write binary's) |

**The debugger is no longer opt-in** in the write binaries: a breakpoint or a listener catches every
request of the connected SAP user. Where that must not be possible, install a `-ro` binary.

**Passing it stops the start** — the flag in either spelling, with any value or none, and the
config file's `exposition` — before anything is read, `[MCP] <sentence>`, exit `1`. One sentence
per word, naming the binary of the binary's own transport that serves what the word asked for
(stdio names below; `mcp-abap-adt-http` names `mcp-abap-adt-http-ro`, and so on):

| Word | The sentence |
|---|---|
| `readonly` | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by \`mcp-abap-adt-ro\` (\`@mcp-abap-adt/core-ro\`) |
| `high` | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by \`mcp-abap-adt\` (\`@mcp-abap-adt/core\`) |
| `debug` (in `mcp-abap-adt` / `-ro`) | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the debugger is always served by \`mcp-abap-adt\` (\`@mcp-abap-adt/core\`), and by no -ro binary |
| `debug` (in `mcp-abap-adt-compact` / `-ro`) | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact debugger is always served by \`mcp-abap-adt-compact\` (\`@mcp-abap-adt/compact\`), and by no -ro binary |
| `ro` | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact tools that change nothing are served by \`mcp-abap-adt-compact-ro\` (\`@mcp-abap-adt/compact-ro\`) |
| `rw` | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; all compact tools are served by \`mcp-abap-adt-compact\` (\`@mcp-abap-adt/compact\`) |
| `compact` | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact tools are served by \`mcp-abap-adt-compact\` (\`@mcp-abap-adt/compact\`), those that change nothing by \`mcp-abap-adt-compact-ro\` (\`@mcp-abap-adt/compact-ro\`) |
| `low` (in `mcp-abap-adt` / `-ro`) | the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse) |
| `low` (in `mcp-abap-adt-compact` / `-ro`) | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the low set is gone from mcp-abap-adt / -http / -sse, and this binary serves its analogue, the compact tools |
| any other word, or none (`mcp-abap-adt` / `-ro`) | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; \`mcp-abap-adt\` (\`@mcp-abap-adt/core\`) serves readonly, high and debug, \`mcp-abap-adt-ro\` (\`@mcp-abap-adt/core-ro\`) the readonly tools alone |
| any other word, or none (`mcp-abap-adt-compact` / `-ro`) | --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; \`mcp-abap-adt-compact\` (\`@mcp-abap-adt/compact\`) serves all compact tools, \`mcp-abap-adt-compact-ro\` (\`@mcp-abap-adt/compact-ro\`) those that change nothing |

With several words the one asking for the most answers — `low`, `compact`, `high`, `rw`, `debug`,
`readonly`, `ro`, in that order. From a config file the sentence begins `exposition (config file)
is gone`. **Remove `--exposition` from every command line, client configuration and service unit,
and `exposition` from every config file**; a `--conf` template no longer writes it.

**`@mcp-abap-adt/compact-readonly` is renamed `@mcp-abap-adt/compact-readonly-entries`** (the
library half that changes nothing; no binary), so it is not confused with `@mcp-abap-adt/compact-ro`
(the read-only compact server). An embedder importing it changes the package name; the exports
(`compactReadOnlyEntries`, `CompactReadOnlyHandlersGroup`, `./routes`) are the same.

## Every transport: the long reads take a `timeout`, each on an ABAP session of its own

These reads, approved one by one (`tools/long-handlers.json` in the repository), take an optional
**`timeout`** — seconds, a whole number from 1, **no default**: without it the call waits until
SAP answers, as before. Each runs **stateless on an ABAP session of its own**, logged off when
the call ends; the session your other calls use is not touched:

`GetWhereUsed`, `SearchObject`, `SearchSource`, `GetPackageContents`, `GetPackageTree`,
`GetObjectsList`, `GetStructuresList`, `GetIncludesList`, `RuntimeListFeeds`, `ListTransports`,
`GetSqlQuery`, `GetTableContents`, `GetObjectInfo`, `DescribeByList`, `GetAbapSystemSymbols`,
`GetATCFindings`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`; compact
`HandlerWhereUsed`, `HandlerSearch`, `HandlerDumpList`, `HandlerGetData`, `HandlerProfileView`,
`HandlerGet` (its reads only: `UNIT_TEST` / `CDS_UNIT_TEST` refuse a `timeout` and run on the
session your other calls use).

When the `timeout` passes, **the read is cancelled**: its session is logged off at once, and the
call answers a tool error (`isError: true`) whose JSON carries `timed_out: true`, `timeout` and
"The request was cancelled; nothing was changed." **Set `timeout` below your MCP client's own
request limit** — the TypeScript SDK's client cancels at 60 s — because **a cancel does nothing to
SAP**: no request is recalled, no session is logged off or reopened.

A tool not on the list takes no `timeout` and runs to its end — above all the ones whose work
goes on in SAP whoever waits: the ABAP Unit and ATC runs (`Run*UnitTest`, `RunATC`,
`GetUnitTestResult`, compact `HandlerUnitTestResult` / `HandlerCdsUnitTestResult`), the class and
program runs (`RuntimeRunClass`, `RuntimeRunProgram`, compact `HandlerProfileRun`), activation and
the debugger. A session is stateful only for lock → write → unlock and activation. A class or
program run that may run long is started **in the background** instead (`background: true`, next
section but one): it cannot be cut, so it gets no `timeout`.

- `GetIncludesList` and `GetStructuresList` already had a `timeout`, in milliseconds per request
  (`GetIncludesList` defaulted to 30 s per request; `GetStructuresList` ignored it). It is the call's
  `timeout` now, in **seconds**, with no default.
- No listed tool's request carries a deadline of the server's any more: `SearchSource`'s source
  reads (45 s each) and `HandlerGet`'s preview-URL read (30 s) are gone. `SearchSource` keeps
  `time_budget_ms` (partial hits) beside `timeout`.
- **No read off the list carries a deadline of the server's either.** `GetInclude`,
  `GetTransport`, `GetTypeInfo`, `GetEnhancementSpot`, `GetEnhancementImpl`, `GetEnhancements` and
  `GetObjectNodeFromCache` bounded their requests at 45 s (`SAP_TIMEOUT_DEFAULT`), 15 s or 10 s;
  they now wait for SAP's answer. `GetEnhancements` no longer reads its undeclared `timeout`
  argument (30 s per include): a slow include is no longer skipped. A bound on the wait is the
  client's own.
- On an embedded server given a connection without `freshConnection`, a listed read is refused:
  "This operation needs an ABAP session of its own; the connection was given by the host, which
  supplied no fresh-connection factory (`freshConnection`)".
- **`RuntimeRunClassWithProfiling` and `RuntimeRunProgramWithProfiling` are deleted.** Use
  `RuntimeRunClass` / `RuntimeRunProgram` with `profile: true` (the same trace flags; the profiler
  id and, for a class, the trace id answer under `profile`), and the profiler tools
  (`RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`).
  Compact's `HandlerProfileRun` answers as those two do.
- **`UpdateServiceBinding` sends its publication job with no deadline of the server's** (it was
  11 minutes), and none of the libraries' either: inside a lock window the connection applies no
  deadline at all (its 10-minute ceiling is gone, see below).
- **No request carries a deadline of the libraries' either, and `SAP_TIMEOUT_*` are not read.**
  With `@mcp-abap-adt/connection` 17 and `@mcp-abap-adt/adt-clients` 31.1, nothing reads
  `SAP_TIMEOUT_DEFAULT`, `SAP_TIMEOUT_CSRF`, `SAP_TIMEOUT_LONG` or `SAP_TIMEOUT_CRITICAL`: the CSRF
  fetch and the cloud session preflight carry no 15 s bound, adt-clients' 120 s default for slow
  operations is gone, and inside a lock → write → unlock window a request carries no deadline at
  all. **Remove these variables** from your `.env`, service unit or container environment — setting
  them changes nothing — and `.env.example` no longer lists them. A `connect()` against a host that
  does not answer now waits until the network fails; a bound on it is the client's own. The
  listed long reads' `timeout` above is the one deadline left, and it is the caller's.

## Every transport: leftover SAP sessions of a killed process

A server process killed from outside (`SIGKILL`, out of memory, a host that kills its child)
cannot log off its SAP sessions, and a lock a session holds (`HandlerLock`, `LockClass`, …) stays
until SAP's idle timeout. 19.0.0 keeps a record of every HTTP session the server holds, so that a
later server process — on any transport — lets you **see** the sessions a killed one left and
**choose** for each: resume it, or log it off. The server decides nothing by itself: it resumes
nothing, logs off nothing and picks nothing unless you call one of the tools below.

**The runtime files.** `<config dir>/runtime/`: `~/.config/mcp-abap-adt/runtime` on Unix,
`Documents\mcp-abap-adt\runtime` on Windows; `mcp-abap-adt`'s `--auth-broker-path` moves it with
`sessions/` and `service-keys/`, and `AUTH_BROKER_PATH`'s first entry moves it for every binary. One
file per HTTP connection the server owns and that holds a session — an instance's own connection
(role `built`) and each debugger connection (role `debugger`) — named by a random 128-bit handle.
It holds the process id and its start time, the role, the destination (URL, client, system kind,
wire), the backend user and the session's cookies. It is written once the connection holds a
session and again after a request that changed the session's cookies (a stateful request's
context cookie), and deleted once that connection's logoff is written — at every end: a tool's
end, a replacement, the instance's close, the shutdown, the forced close and a crash's. So a file
survives only a process that died without its logoff, or a logoff that could not be written.
There is no expiry: a file stays until you act, and SAP's answer decides whether its session
still lives.

- **No file over RFC**: an RFC session is its conversation and cannot be picked up by another
  process (and SAP ends it within seconds of the process's death — measured).
- **The backend user.** A file is matched to its caller by the destination and the backend user:
  the one the request states (the destination's `SAP_USERNAME`, or `x-sap-login`), else — for a
  token credential (a service key, a browser login, `x-sap-jwt-token`), which states none — the
  one SAP answers for the session (`systeminformation`'s `userName`, asked once after
  `connect()`, the way the debugger reads its request user). For such a caller the tools ask the
  same of the instance's own connection, logging on first if the instance holds none yet. A
  system that names no user keeps no file, and such a caller owns none.

**Security: the files are bearer secrets.** The cookies in a file act as that SAP user for as long
as the session lives — anyone who can read the file can work in the session, the locks it holds
included. The directory is created `0700` (an existing one is narrowed to `0700`) and each file
`0600`, owner-only; on Windows the directory's own ACL applies — keep it in your profile. Keep the
directory out of backups, synchronised folders and container images, and do not share it between
OS users. The server never logs a file's content and never shows a cookie to the model.

**The tools**, on every transport. The list and the logoff are served by every binary — a
logoff is a system action, not a data change, so the `-ro` binaries serve them too; the resume
only by the write binaries, since a resumed session is for finishing a write or an unlock:

| Full binaries | Compact binaries | What it does |
|---|---|---|
| `ListLeftoverSessions` | `HandlerLeftoverSessionList` | your sessions a killed process left: `handle`, `role`, `destination` (`url`, `client`, `system`), `user`, `written_at` — never a cookie |
| `ResumeLeftoverSession` `{ handle }` | `HandlerLeftoverSessionResume` | role `built` only: this server's connection is built on that session instead of logging on, so its locks and their `lock_handle`s work again; the file is this process's from then on. A session this server held before is logged off once no call uses it. SAP answering that the session is gone (`401`, a redirect, another session) is the answer, as SAP gave it (`state: "gone"`, `sap.status`), and the file is deleted |
| `LogoffLeftoverSession` `{ handle }` | `HandlerLeftoverSessionLogoff` | any role: one request — the platform's ICF logoff with the session's cookies, no credential, no discovery or CSRF fetch before it (connection 17.1's `disconnect()` without `connect()`); every lock of the session is released. It answers `state: "logged_off"` once the logoff is written — SAP's answer is not read, so a session that had already ended is answered the same — and the file is deleted |

- **Only your own.** A file is yours when its destination and backend user equal what your request
  resolved. Someone else's file, an unknown handle and a file whose process still runs (process id
  and start time) all get the same answer: `leftover_session_not_available`. A running process's
  files — this one's included — are never listed or touched.
- **Resuming a debugger session is refused** (`leftover_session_not_resumable`): its listener,
  breakpoints and poll lived in the ended process. Log it off instead.
- **One process at a time.** Before a resume or a logoff, a process claims the file by renaming
  it to a name carrying its own process id (`<handle>.claimed.<pid>.<start>`), an atomic rename:
  of two processes acting on one leftover session at once, one acts and the other answers
  `leftover_session_not_available`. An operation that fails without settling the session gives
  the file back under its handle; a claimed file whose process died is listed and claimable again,
  as any dead process's file.
- **Where a resume is useful: stdio, SSE and a pooled Streamable HTTP instance.** Over Streamable
  HTTP each request is served by an instance of its own (a pooled one too gets a new credential with
  each request, which replaces its connection): a resumed session lives for that one request and is
  logged off when it ends — as a logoff would. Resume on stdio or SSE, where the instance and its
  connection outlive the call.
- **Off Linux, a process's liveness is read by its process id alone.** On Linux the start time in
  the file is compared with `/proc`; elsewhere no start time is read, so a process id the system
  has reused for another process hides the dead process's file until that other process ends — the
  safe side: a live process's file is never touched.

## Every transport: background runs of the class and program runs

A run of ABAP code may write and may run long, and **it cannot be cut**: measured on premise
(2026-10-13), a running synchronous request dies when its socket closes or its session is logged
off, and its write is lost. So instead of a `timeout`, a run may be started **in the background**.

- **`background: true`** on `RuntimeRunClass`, `RuntimeRunProgram` and compact `HandlerProfileRun`
  (both its modes). **No default**: without it — or with `false` — the call waits for the run, as
  before. With it the server opens **an ABAP session of the run's own** (stateless; the session your
  other calls use is not touched), sends the run on it and answers at once, in fixed words: `state:
  "running"`, the `run_handle` (128 random bits), `tool`, `object`, `started_at`. The run's session
  stays open until SAP answers — whoever waits, whatever happens to the call or the request that
  started it — and is logged off right after the answer, which is then kept under the handle.
- **The tools** — served by the write binaries, beside the run tools (`mcp-abap-adt`, `-http`,
  `-sse` beside `RuntimeRunClass`; the compact ones beside `HandlerProfileRun`). The `-ro` binaries
  serve none, and no store: `mcp-abap-adt-ro` keeps `RuntimeRunClass` / `RuntimeRunProgram` (system
  tools; "read-only" means the user cannot change code, and running it is allowed, as in SAP),
  served there without `background` — the parameter is not in their schema and is not read:

| Full binaries | Compact binaries | What it does |
|---|---|---|
| `GetBackgroundRun` `{ run_handle }` | `HandlerBackgroundRunGet` | `running`, or `finished` (with `finished_at`) followed by what the run tool would have answered — SAP's answer as it is, an error included (`isError` as the run tool's). Reading does not remove it |
| `ListBackgroundRuns` | `HandlerBackgroundRunList` | your runs: `run_handle`, `tool`, `object`, `started_at`, `running` / `finished` — no output |
| `DiscardBackgroundRun` `{ run_handle }` | `HandlerBackgroundRunDiscard` | removes a finished run's kept answer. A running one is refused (`background_run_running`): a started run cannot be stopped |

- **Where the answers are kept** is the server's store, `@mcp-abap-adt/background-runs-memory`
  (a package of its own, installed with `@mcp-abap-adt/core`, `http` and `sse`): the process's memory.
- **Only your own.** A run is its caller's: the destination (URL, client) and the backend user the
  request resolved — the one it states (`SAP_USERNAME`, `x-sap-login`), else, for a token
  credential, the one SAP answers for the session (`systeminformation`, as for the leftover
  sessions). Someone else's handle and an unknown one get the same answer:
  `background_run_not_available`. Over Streamable HTTP each request's instance is new; a run is
  found again by any later request with the same caller.
- **16 runs per caller**, running and kept together; a 17th is refused (`background_run_limit`),
  naming the limit and `DiscardBackgroundRun` (compact: `HandlerBackgroundRunDiscard`), before
  anything is sent. No expiry: a kept answer stays until you discard it — or the process ends: the
  answers live in the server's memory and **end with the process**.
- **The ends.** The orderly shutdown and an instance's close (an SSE connection's, stdio's at
  exit) **wait for a running background run** — it may write — as they wait for a running tool; it is
  logged off after its answer. The forced close (a second `SIGTERM` / `SIGINT`,
  `--shutdown-timeout`) logs its session off at once, which cuts it, and names it on stderr
  (`Still running at the forced close: RuntimeRunClass (background)`).
- **No session of its own to be had** — an embedded server given a connection without
  `freshConnection` — refuses the start with the fresh-connection words, as the listed long reads.

## Every transport: a tool's session is stateful only for lock → write → unlock and activation

A tool's ABAP session is stateful only for **lock → write → unlock and activation**; everything
else runs stateless. On the wire that is the `LOCK` and the `UNLOCK` (adt-clients 31.1): the write
under the lock and the activation go stateless, as Eclipse sends them. Nothing a tool does leaves
the connection stateful after its window, so the next call — a read, a search, a run — never runs
inside another call's lock session.

- **`session_id` / `session_state` change nothing any more.** The tools that took them
  (compact `HandlerLock`, `HandlerUnlock`, `HandlerValidate`, `HandlerCheckRun`, the `Activate*`
  and `Check*` tools, `GetNodeStructure`, …) used to switch the shared connection to stateful for
  every request that followed, and left it so. They still accept the arguments and ignore them;
  `HandlerLock` still answers a `session_id` and `HandlerUnlock` still requires one, but it is sent
  on no request. Nothing for you to change: a lock and its unlock meet in the instance's own
  session.
- **Compact `HandlerLock` keeps the lock until `HandlerUnlock`**, your choice: the calls in between
  are stateless, and the instance's end (its logoff) releases a lock you never unlocked.
- **The debugger's sessions are its own**, stateful for their life, and end with the debug session.
- Every site that turns a session type is listed in `tools/stateful-sites.json`.

## The low set leaves the full binaries

**`mcp-abap-adt`, `mcp-abap-adt-http` and `mcp-abap-adt-sse` serve no low set.**
`--exposition=…,low` — alone or beside any other word, in the CLI or the YAML form — stops the start
(as every `--exposition` does, see above), with D56's sentence:

> the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)

The full binaries take `readonly`, `high` and `debug`. The 112 low tools are gone from their tool
list — the `*Low` tools of the low set and the three `*Low` reads of the system group
(`GetVirtualFoldersLow`, `GetNodeStructureLow`, `GetObjectStructureLow`). The binaries no longer
duplicate each other: a full binary carries no low tool and no compact tool, a compact binary none
of the full set's high or low tools; only read-only reads may be in both.

**If you used the low set, run the compact binary of your transport** (`mcp-abap-adt-compact`,
`-compact-http`, `-compact-sse`), which does what the low set did, a step at a time:

- **Lock, write, unlock.** `HandlerLock` answers a `lock_handle` and a `session_id`;
  `HandlerUpdate` with that `lock_handle` sends the write alone under your lock — no lock, unlock,
  check or activation of its own (`activate: true` beside it is refused); `HandlerUnlock`
  releases it. Without `lock_handle`, `HandlerUpdate` locks and unlocks itself, as before.
  **Keeping the lock short is yours:** the server releases nothing on its own clock.
  `HandlerLock` / `HandlerUnlock` also take BEHAVIOR_IMPLEMENTATION: the implementation class's
  own lock and unlock (the same requests as CLASS).
- **Validate, check, activate.** `HandlerValidate` (now with `super_package` for a package,
  `superclass` for a class, `package_name` for a function group, and FUNCTION_MODULE),
  `HandlerCheckRun` (now PACKAGE and FUNCTION_MODULE, and `source_code` to check source that is
  not saved for CLASS, STRUCTURE and DDL), `HandlerActivate`. A function module is named
  `GROUP|MODULE` in the lifecycle tools' `object_name`.
- **A function group create reads the group back.** On SAP's 400 "Interface SAPL… has not been
  created" — a refusal that can come with a create that landed — `HandlerCreate` FUNCTION_GROUP
  **and the full set's `CreateFunctionGroup`** now read the group back; if it is there, the create
  is answered as done (and activated when asked). 18.x's `CreateFunctionGroup` answered that 400
  as a failure.
- **Packages.** `HandlerCreate` PACKAGE takes `super_package` and the package settings (it could
  not create a package before: the parameter was not declared); `HandlerUpdate` PACKAGE writes the
  description — under your `lock_handle`, or without one locking, writing and unlocking itself;
  `HandlerDelete` PACKAGE, with `force_new_connection`; `HandlerCheckRun` PACKAGE.
- **The full binaries gain two package tools** for what `UpdatePackageLow` and `DeletePackageLow`
  did: the high **`UpdatePackage`** (`package_name`, `description`, `transport_request`: lock,
  write, unlock in one tool; over RFC in an ABAP session of its own, as `CreatePackage`) and
  **`DeletePackage`** (`package_name`, `transport_request`, `force_new_connection`: the deletion
  check first, as every high delete — a refusal is answered as it came, and an absent package
  gets no delete). They send the same requests as compact's `HandlerUpdate` PACKAGE without `lock_handle` and `HandlerDelete`
  PACKAGE.
- **Creation parameters.** `HandlerCreate` takes `superclass`, `final`, `abstract`,
  `create_protected` for a class and `master_language`.
- **The repository by address.** `HandlerGet` with `part: object_structure` (`object_adt_type`,
  `object_name`), `part: node_structure` (`object_adt_type`, `object_name`, `node_id`,
  `with_short_descriptions`) and `part: virtual_folders` (`object_search_pattern`, `preselection`,
  `facet_order`, `with_versions`, `ignore_short_descriptions`); these three parts take no
  `object_type`.

Each low tool and the compact call that replaces it — the same ADT requests, tested against a
stand-in (`src/__tests__/unit/lowToCompact.test.ts`) with the low tool's requests captured before it
was removed (`tools/low-to-compact.json`). Three differences are accepted and named in their rows: a
create through `HandlerCreate` of a domain, data element, structure, behavior definition or metadata
extension also validates, locks and checks; a delete through `HandlerDelete` asks the deletion check
first; a function module, service definition or service binding activates through the activation run.

<!-- low-to-compact table: rendered from tools/low-to-compact.json -->
| Low tool | Compact call | Difference / note |
|---|---|---|
| `ActivateBehaviorDefinitionLow` | `HandlerActivate` (object_type: BEHAVIOR_DEFINITION, object_name) | the same requests |
| `ActivateClassLow` | `HandlerActivate` (object_type: CLASS, object_name) | the same requests |
| `ActivateDataElementLow` | `HandlerActivate` (object_type: DATA_ELEMENT, object_name) | the same requests |
| `ActivateDdlLow` | `HandlerActivate` (object_type: DDL, object_name) | the same requests |
| `ActivateDomainLow` | `HandlerActivate` (object_type: DOMAIN, object_name) | the same requests |
| `ActivateFunctionGroupLow` | `HandlerActivate` (object_type: FUNCTION_GROUP, object_name) | the same requests |
| `ActivateFunctionModuleLow` | `HandlerActivate` (objects) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateInterfaceLow` | `HandlerActivate` (object_type: INTERFACE, object_name) | the same requests |
| `ActivateMetadataExtensionLow` | `HandlerActivate` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `ActivateObjectLow` | `HandlerActivate` (objects, preaudit) | the same requests |
| `ActivateProgramLow` | `HandlerActivate` (object_type: PROGRAM, object_name) | the same requests |
| `ActivateServiceBindingLow` | `HandlerActivate` (object_type: SERVICE_BINDING, object_name) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateServiceDefinitionLow` | `HandlerActivate` (object_type: SERVICE_DEFINITION, object_name) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateStructureLow` | `HandlerActivate` (object_type: STRUCTURE, object_name) | the same requests |
| `ActivateTableLow` | `HandlerActivate` (object_type: TABLE, object_name) | the same requests |
| `CheckBdefLow` | `HandlerCheckRun` (object_type: BEHAVIOR_DEFINITION, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckClassLow` | `HandlerCheckRun` (object_type: CLASS, object_name, version, source_code) | The low tool's source_code is HandlerCheckRun's source_code. |
| `CheckDataElementLow` | `HandlerCheckRun` (object_type: DATA_ELEMENT, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckDdlLow` | `HandlerCheckRun` (object_type: DDL, object_name, version, source_code) | The low tool's ddl_source is HandlerCheckRun's source_code. |
| `CheckDomainLow` | `HandlerCheckRun` (object_type: DOMAIN, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckFunctionGroupLow` | `HandlerCheckRun` (object_type: FUNCTION_GROUP, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckFunctionModuleLow` | `HandlerCheckRun` (object_type: FUNCTION_MODULE, object_name, version) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `CheckInterfaceLow` | `HandlerCheckRun` (object_type: INTERFACE, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckMetadataExtensionLow` | `HandlerCheckRun` (object_type: METADATA_EXTENSION, object_name, version) | the same requests |
| `CheckPackageLow` | `HandlerCheckRun` (object_type: PACKAGE, object_name) | the same requests |
| `CheckProgramLow` | `HandlerCheckRun` (object_type: PROGRAM, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckStructureLow` | `HandlerCheckRun` (object_type: STRUCTURE, object_name, version, source_code) | The low tool's ddl_code is HandlerCheckRun's source_code. |
| `CheckTableLow` | `HandlerCheckRun` (object_type: TABLE, object_name, version) | CheckTableLow accepted ddl_code and reporter and sent neither. |
| `CreateBehaviorDefinitionLow` | `HandlerCreate` (object_type: BEHAVIOR_DEFINITION, name, description, package_name, transport_request, root_entity, implementation_type, activate) | **accepted:** HandlerCreate runs the high create, which locks, checks, unlocks and reads back after the create; the low tool's create request is among them, unchanged. |
| `CreateBehaviorImplementationLow` | `HandlerCreate` (object_type: BEHAVIOR_IMPLEMENTATION, class_name, behavior_definition, description, package_name, transport_request), then `HandlerUpdate` (object_type: BEHAVIOR_IMPLEMENTATION, class_name, behavior_definition, implementation_code, transport_request, activate) | With implementation_code, two compact calls: the create, then the update (lock, write the implementations include, unlock). |
| `CreateClassLow` | `HandlerCreate` (object_type: CLASS, class_name, description, package_name, transport_request, superclass, final, abstract, create_protected) | the same requests |
| `CreateDataElementLow` | `HandlerCreate` (object_type: DATA_ELEMENT, data_element_name, description, package_name, transport_request, activate) | **accepted:** HandlerCreate runs the high create, which validates, creates, locks, writes the properties with their defaults, unlocks and checks; the low tool's create request is among them, unchanged. |
| `CreateDdlLow` | `HandlerCreate` (object_type: DDL, ddl_name, description, package_name, transport_request) | the same requests |
| `CreateDomainLow` | `HandlerCreate` (object_type: DOMAIN, domain_name, description, package_name, transport_request, activate) | **accepted:** HandlerCreate runs the high create, which validates, creates, locks, writes the properties with their defaults, unlocks and checks; the low tool's create request is among them, unchanged. |
| `CreateFunctionGroupLow` | `HandlerCreate` (object_type: FUNCTION_GROUP, function_group_name, description, package_name, transport_request, activate) | On the 400 "Interface SAPL… has not been created" both read the group back. |
| `CreateFunctionModuleLow` | `HandlerCreate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, description, transport_request) | the same requests |
| `CreateInterfaceLow` | `HandlerCreate` (object_type: INTERFACE, interface_name, description, package_name, transport_request) | the same requests |
| `CreateMetadataExtensionLow` | `HandlerCreate` (object_type: METADATA_EXTENSION, name, description, package_name, transport_request, master_language, activate) | **accepted:** HandlerCreate runs the high create, which locks, checks and unlocks after the create; the low tool's create request is among them, unchanged. |
| `CreatePackageLow` | `HandlerCreate` (object_type: PACKAGE, package_name, super_package, description, package_type, software_component, transport_layer, transport_request, record_changes, application_component) | the same requests |
| `CreateProgramLow` | `HandlerCreate` (object_type: PROGRAM, program_name, description, package_name, transport_request, program_type, application) | the same requests |
| `CreateStructureLow` | `HandlerCreate` (object_type: STRUCTURE, structure_name, description, package_name, transport_request, fields, activate) | **accepted:** HandlerCreate runs the high create, which validates before and checks after the create; the low tool's create request is among them, unchanged. HandlerCreate STRUCTURE requires fields, which do not reach the create (set them with HandlerUpdate ddl_code). |
| `CreateTableLow` | `HandlerCreate` (object_type: TABLE, table_name, package_name, transport_request) | the same requests |
| `CreateTransportLow` | `HandlerTransportCreate` (description, transport_type) | the same requests |
| `DeleteBehaviorDefinitionLow` | `HandlerDelete` (object_type: BEHAVIOR_DEFINITION, behavior_definition_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteClassLow` | `HandlerDelete` (object_type: CLASS, class_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteDataElementLow` | `HandlerDelete` (object_type: DATA_ELEMENT, data_element_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteDdlLow` | `HandlerDelete` (object_type: DDL, ddl_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteDomainLow` | `HandlerDelete` (object_type: DOMAIN, domain_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteFunctionGroupLow` | `HandlerDelete` (object_type: FUNCTION_GROUP, function_group_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteFunctionModuleLow` | `HandlerDelete` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteInterfaceLow` | `HandlerDelete` (object_type: INTERFACE, interface_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteMetadataExtensionLow` | `HandlerDelete` (object_type: METADATA_EXTENSION, metadata_extension_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeletePackageLow` | `HandlerDelete` (object_type: PACKAGE, package_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. force_new_connection is taken as the low tool took it: the check and the delete are sent from a new connection, closed afterwards. The full set has it too: the high DeletePackage, the same requests. |
| `DeleteProgramLow` | `HandlerDelete` (object_type: PROGRAM, program_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteStructureLow` | `HandlerDelete` (object_type: STRUCTURE, structure_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `DeleteTableLow` | `HandlerDelete` (object_type: TABLE, table_name, transport_request) | **accepted:** HandlerDelete asks POST /sap/bc/adt/deletion/check first and sends no delete when the check reports the object absent; the delete itself is the low tool's request. |
| `GetNodeStructureLow` | `HandlerGet` (part: node_structure, object_adt_type, object_name, node_id, with_short_descriptions) | the same requests |
| `GetObjectStructureLow` | `HandlerGet` (part: object_structure, object_adt_type, object_name) | the same requests |
| `GetVirtualFoldersLow` | `HandlerGet` (part: virtual_folders, object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions) | the same requests |
| `LockBehaviorDefinitionLow` | `HandlerLock` (object_type: BEHAVIOR_DEFINITION, object_name) | the same requests |
| `LockBehaviorImplementationLow` | `HandlerLock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name) | the same requests |
| `LockClassLow` | `HandlerLock` (object_type: CLASS, object_name) | the same requests |
| `LockDataElementLow` | `HandlerLock` (object_type: DATA_ELEMENT, object_name) | the same requests |
| `LockDdlLow` | `HandlerLock` (object_type: DDL, object_name) | the same requests |
| `LockDomainLow` | `HandlerLock` (object_type: DOMAIN, object_name) | the same requests |
| `LockFunctionGroupLow` | `HandlerLock` (object_type: FUNCTION_GROUP, object_name) | the same requests |
| `LockFunctionModuleLow` | `HandlerLock` (object_type: FUNCTION_MODULE, object_name) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `LockInterfaceLow` | `HandlerLock` (object_type: INTERFACE, object_name) | the same requests |
| `LockMetadataExtensionLow` | `HandlerLock` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `LockPackageLow` | `HandlerLock` (object_type: PACKAGE, object_name, super_package) | the same requests |
| `LockProgramLow` | `HandlerLock` (object_type: PROGRAM, object_name) | the same requests |
| `LockStructureLow` | `HandlerLock` (object_type: STRUCTURE, object_name) | the same requests |
| `LockTableLow` | `HandlerLock` (object_type: TABLE, object_name) | the same requests |
| `UnlockBehaviorDefinitionLow` | `HandlerUnlock` (object_type: BEHAVIOR_DEFINITION, object_name, lock_handle, session_id) | the same requests |
| `UnlockClassLow` | `HandlerUnlock` (object_type: CLASS, object_name, lock_handle, session_id) | the same requests |
| `UnlockDataElementLow` | `HandlerUnlock` (object_type: DATA_ELEMENT, object_name, lock_handle, session_id) | the same requests |
| `UnlockDdlLow` | `HandlerUnlock` (object_type: DDL, object_name, lock_handle, session_id) | the same requests |
| `UnlockDomainLow` | `HandlerUnlock` (object_type: DOMAIN, object_name, lock_handle, session_id) | the same requests |
| `UnlockFunctionGroupLow` | `HandlerUnlock` (object_type: FUNCTION_GROUP, object_name, lock_handle, session_id) | the same requests |
| `UnlockFunctionModuleLow` | `HandlerUnlock` (object_type: FUNCTION_MODULE, object_name, lock_handle, session_id) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `UnlockInterfaceLow` | `HandlerUnlock` (object_type: INTERFACE, object_name, lock_handle, session_id) | the same requests |
| `UnlockMetadataExtensionLow` | `HandlerUnlock` (object_type: METADATA_EXTENSION, object_name, lock_handle, session_id) | the same requests |
| `UnlockPackageLow` | `HandlerUnlock` (object_type: PACKAGE, object_name, lock_handle, session_id) | the same requests |
| `UnlockProgramLow` | `HandlerUnlock` (object_type: PROGRAM, object_name, lock_handle, session_id) | the same requests |
| `UnlockStructureLow` | `HandlerUnlock` (object_type: STRUCTURE, object_name, lock_handle, session_id) | the same requests |
| `UnlockTableLow` | `HandlerUnlock` (object_type: TABLE, object_name, lock_handle, session_id) | the same requests |
| `UpdateBehaviorDefinitionLow` | `HandlerUpdate` (object_type: BEHAVIOR_DEFINITION, name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateClassLow` | `HandlerUpdate` (object_type: CLASS, class_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateDataElementLow` | `HandlerUpdate` (object_type: DATA_ELEMENT, data_element_name, description, lock_handle) | The properties go as the compact update names them (description, datatype, length, …) or in properties. |
| `UpdateDdlLow` | `HandlerUpdate` (object_type: DDL, ddl_name, ddl_source, lock_handle, transport_request) | the same requests |
| `UpdateDomainLow` | `HandlerUpdate` (object_type: DOMAIN, domain_name, description, lock_handle) | The properties go as the compact update names them (description, datatype, length, …) or in properties. |
| `UpdateFunctionModuleLow` | `HandlerUpdate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateInterfaceLow` | `HandlerUpdate` (object_type: INTERFACE, interface_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateMetadataExtensionLow` | `HandlerUpdate` (object_type: METADATA_EXTENSION, name, source_code, lock_handle, transport_request) | the same requests |
| `UpdatePackageLow` | `HandlerUpdate` (object_type: PACKAGE, package_name, super_package, description, lock_handle, transport_request) | The full set has it too: the high UpdatePackage (lock, write, unlock in one tool) — compact's HandlerUpdate PACKAGE without lock_handle sends the same. |
| `UpdateProgramLow` | `HandlerUpdate` (object_type: PROGRAM, program_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateStructureLow` | `HandlerUpdate` (object_type: STRUCTURE, structure_name, ddl_code, lock_handle, transport_request) | the same requests |
| `UpdateTableLow` | `HandlerUpdate` (object_type: TABLE, table_name, ddl_code, lock_handle, transport_request) | the same requests |
| `ValidateBehaviorDefinitionLow` | `HandlerValidate` (object_type: BEHAVIOR_DEFINITION, object_name, root_entity, implementation_type, package_name, description) | ValidateBehaviorDefinitionLow validated the root entity's name; object_name carries it. |
| `ValidateBehaviorImplementationLow` | `HandlerValidate` (object_type: BEHAVIOR_IMPLEMENTATION, object_name, behavior_definition, package_name, description) | the same requests |
| `ValidateClassLow` | `HandlerValidate` (object_type: CLASS, object_name, package_name, description, superclass) | the same requests |
| `ValidateDataElementLow` | `HandlerValidate` (object_type: DATA_ELEMENT, object_name, description, package_name) | the same requests |
| `ValidateDdlLow` | `HandlerValidate` (object_type: DDL, object_name, package_name, description) | the same requests |
| `ValidateDomainLow` | `HandlerValidate` (object_type: DOMAIN, object_name, description, package_name) | the same requests |
| `ValidateFunctionGroupLow` | `HandlerValidate` (object_type: FUNCTION_GROUP, object_name, package_name, description) | the same requests |
| `ValidateFunctionModuleLow` | `HandlerValidate` (object_type: FUNCTION_MODULE, object_name, description) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `ValidateInterfaceLow` | `HandlerValidate` (object_type: INTERFACE, object_name, package_name, description) | the same requests |
| `ValidateMetadataExtensionLow` | `HandlerValidate` (object_type: METADATA_EXTENSION, object_name, package_name, description) | the same requests |
| `ValidatePackageLow` | `HandlerValidate` (object_type: PACKAGE, object_name, super_package) | the same requests |
| `ValidateProgramLow` | `HandlerValidate` (object_type: PROGRAM, object_name, package_name, description) | the same requests |
| `ValidateStructureLow` | `HandlerValidate` (object_type: STRUCTURE, object_name, package_name, description) | the same requests |
| `ValidateTableLow` | `HandlerValidate` (object_type: TABLE, object_name, package_name, description) | the same requests |
<!-- end of the low-to-compact table -->

## HTTP users

- **Install `@mcp-abap-adt/http` and run `mcp-abap-adt-http`**, without `--transport` (see
  above). The options keep their names: `--host` / `--http-host` /
  `MCP_HTTP_HOST`, `--port` / `--http-port` / `MCP_HTTP_PORT`, `--path` / `--http-path`,
  `--http-json-response`, `--http-allowed-hosts`, `--http-allowed-origins`,
  `--http-enable-dns-protection` (and their `MCP_HTTP_*`), `--tls-cert` / `--tls-key` / `--tls-ca`
  (`MCP_TLS_*`), `--system-type`, `--state-idle-minutes`, `--conf`. `GET
  /mcp/health` answers as before. `--exposition` is gone (see above): the readonly tools alone are
  `@mcp-abap-adt/http-ro` (`mcp-abap-adt-http-ro`).
- **Credentials come only from each request's headers**: `x-sap-url`, `x-sap-client`, and
  `x-sap-jwt-token`, or `x-sap-login` with `x-sap-password`. A request without them is answered
  `400` — *this server takes credentials only from the request's headers: send x-sap-url with
  x-sap-jwt-token, or with x-sap-login and x-sap-password* (`ping` answers without them). Nothing is
  stored, shared or cached across requests.
- **No destination is served over HTTP.** The default destination (`--mcp`, `--env`,
  `--env-path`), `x-mcp-destination` and `--allow-destination-header` are gone from HTTP: a request
  carrying `x-mcp-destination` is answered `400` — *destinations are served only by mcp-abap-adt
  (stdio); send x-sap-* headers*. There is no broker, no store, no session file and no login, so
  the `service-keys` / `sessions` mounts (`AUTH_BROKER_PATH`) of a container or service running
  HTTP are no longer read: send the credential in the headers instead. A token you hold goes in
  `x-sap-jwt-token`.
- **The debugger works as in 18.0**, always served by `mcp-abap-adt-http` (no `--exposition=...,debug`): the `state_handle` routes a call back
  to the pooled instance that holds the state, the idle bound is `--state-idle-minutes`. Each
  request's own headers give its credential, also on a pooled instance. The debugger's ids come from
  `x-sap-debug-terminal-id` / `x-sap-debug-ide-id`, then `SAP_DEBUG_TERMINAL_ID` /
  `SAP_DEBUG_IDE_ID` of the environment; a destination's `.env` (and its `SAP_DEBUG_*`) is read only
  by `mcp-abap-adt` (stdio).
- **Every ADT session ends with a logoff.** A request's instance logs off its ADT session when it
  leaves the pool: after the request when it holds nothing; for a pooled instance, when its state
  ends (its stop tool or the idle bound). An instance whose undo fails is kept for a retry, its
  sessions open, until a later undo succeeds or shutdown — which logs them off whatever the undo
  answered (the idle bound's stop logs a pooled instance off even when its undo failed).
- **Shutdown waits for the running tools** (no 30-second deadline): `SIGTERM` / `SIGINT` stops new
  requests (`503`), waits for every running tool on every instance — none aborted —, then disposes
  the pool's instances and logs off their sessions; exit `0`, or `1` with one line per instance
  whose state could not be undone (named by its ordinal). A second signal or
  **`--shutdown-timeout=<seconds>`** ends the waiting: every session is still logged off, exit `1`
  naming the requests still running. In a container, set it below the orchestrator's kill grace.

## SSE users

- **Install `@mcp-abap-adt/sse` and run `mcp-abap-adt-sse`**, without `--transport` (see above).
  The SSE options keep their names: `--sse-host` / `MCP_SSE_HOST`,
  `--sse-port` / `MCP_SSE_PORT`, `--sse-path`, `--post-path`, `--sse-allowed-hosts`,
  `--sse-allowed-origins`, `--sse-enable-dns-protection` (and their `MCP_SSE_*`), `--tls-*`
  (`MCP_TLS_*`), `--system-type`, `--state-idle-minutes`, `--conf` (`--exposition` is gone, see
  above: the readonly tools alone are `@mcp-abap-adt/sse-ro`, `mcp-abap-adt-sse-ro`). **`--host`
  and `--port` no longer apply to SSE** (18.x: they beat the SSE ones): they are Streamable HTTP's
  and stop the SSE start; use `--sse-host` / `--sse-port`.
- **Credentials come only from the `x-sap-*` headers of the `GET` that opens each SSE
  connection** (`x-sap-url`, `x-sap-client`, and `x-sap-jwt-token`, or `x-sap-login` with
  `x-sap-password`); that connection's `POST`s are served with them. A `GET` without them is
  answered `400` with the sentence above. A `POST` is routed by its `sessionId` alone: its own
  `x-sap-*` headers are not read. Nothing is shared with another connection, and nothing outlives
  one.
- **No destination is served over SSE**: the default destination, `x-mcp-destination` (a `GET` or a
  `POST` carrying it is answered `400`), `--allow-destination-header` and the `service-keys` /
  `sessions` mounts are gone, as for HTTP.
- **The debugger works as in 18.0**: the debug session lives in the connection's instance until the
  connection closes, its stop tool runs or the idle bound ends it. Its ids come from the opening
  `GET`'s `x-sap-debug-*` headers, then `SAP_DEBUG_*` of the environment; a destination's `.env` is
  read only by `mcp-abap-adt` (stdio).
- **A closed SSE connection's instance is disposed after its tools finished.** Its running tools
  run to their end (18.x undid the state while they ran), then its held state is undone and its
  ADT sessions are logged off — whatever the undo answered —, then its stream is closed. A `POST`
  for a closing connection reaches no tool. A connection that closes, or fails, while it is being
  set up is disposed too (18.x left it).
- **Shutdown waits for the running tools**, as for HTTP: every open connection's instance is closed
  after its tools settled, its sessions logged off, its stream ended; `--shutdown-timeout` and a
  second signal end the waiting the same way.

## compact users

**A package per transport and tool set, and the same tools on each transport.** The compact tool
set is served by three packages, its read-only half by three more, each with one binary and its
transport's options only:

| You ran | Install | Run |
|---|---|---|
| `mcp-abap-adt-compact` (stdio) | `@mcp-abap-adt/compact` | `mcp-abap-adt-compact` |
| `mcp-abap-adt-compact --transport=http` | `@mcp-abap-adt/compact-http` | `mcp-abap-adt-compact-http` |
| `mcp-abap-adt-compact --transport=sse` | `@mcp-abap-adt/compact-sse` | `mcp-abap-adt-compact-sse` |
| `mcp-abap-adt-compact --exposition=ro` (stdio) | `@mcp-abap-adt/compact-ro` | `mcp-abap-adt-compact-ro` |
| `mcp-abap-adt-compact --transport=http --exposition=ro` | `@mcp-abap-adt/compact-http-ro` | `mcp-abap-adt-compact-http-ro` |
| `mcp-abap-adt-compact --transport=sse --exposition=ro` | `@mcp-abap-adt/compact-sse-ro` | `mcp-abap-adt-compact-sse-ro` |

- Each binary is its full counterpart's launcher with the compact tool set, nothing else:
  `mcp-abap-adt-compact` takes `mcp-abap-adt`'s options (the destination, the login),
  `mcp-abap-adt-compact-http` `mcp-abap-adt-http`'s (credentials from each request's `x-sap-*`
  headers), `mcp-abap-adt-compact-sse` `mcp-abap-adt-sse`'s, and each `-ro` one the same as its
  write binary. The sections above apply to each as to its counterpart; only the tool list differs.
- **The binary fixes the tool list** (see "`--exposition` is gone" above): `mcp-abap-adt-compact`
  (and `-http`, `-sse`) serves the 27 tools, the four debugger verbs (`HandlerDebugStart`,
  `…Wait`, `…View`, `…Step`), the three background-run tools and the three leftover-session tools
  — 37; `mcp-abap-adt-compact-ro` (and `-http-ro`, `-sse-ro`) the 16 that change nothing and the
  leftover-session list and logoff — 18. `--exposition`, with `ro`, `rw`, `debug` or any word,
  stops the start.
- **Compact is the low set's analogue.** See "The low set leaves the full binaries" above: the
  write under your `lock_handle`, the package operations, the creation and validation parameters,
  the check of unsaved source, and `HandlerGet`'s three repository parts are new on `rw` / `ro`.
- **A config file's `exposition` stops the start.** 18.x read compact's exposition from the command
  line only, and its `--conf` template wrote the full set's `exposition: readonly,high`, which it
  ignored. Remove the key: the template writes none, and the binary you install chooses the tools.
- **Two transport tools join `rw`** (25 → 27): `HandlerTransportSortAndCompress` (the full set's
  `SortAndCompressTransportTask`) and `HandlerTransportMoveObjects` (`MoveTransportObjects`) — the
  same handlers, the same parameters without `detail`.
- **`HandlerGet` reads a transport** (`object_type: TRANSPORT`, `transport_number`): the full set's
  `ReadTransportObjects`, the objects of a request or task, each with the `position` that
  `HandlerTransportMoveObjects` takes. The two transport writes name it in their answers' `confirm_with`.
- `@mcp-abap-adt/compact-http` and `@mcp-abap-adt/compact-sse` do not depend on
  `@mcp-abap-adt/core`: neither the auth broker nor the stores are installed with them.

## stdio users

- **`mcp-abap-adt` serves stdio only** (`@mcp-abap-adt/core`). **Remove `--transport=stdio`**
  from your MCP client's `args`: it now stops the start (see above). The HTTP, SSE and TLS options
  stop it too, naming `mcp-abap-adt-http` or `mcp-abap-adt-sse`; core no longer depends on
  `@mcp-abap-adt/http` or `@mcp-abap-adt/sse`. `--allow-destination-header` is gone: the process
  serves the one destination it is started with.
- **`jwt` / `none` is no longer served over stdio** (a token you hold: `SAP_AUTH_TYPE=jwt`,
  `SAP_GRANT_TYPE=none`, `SAP_JWT_TOKEN`). Such a destination stops the start with `Destination "X"
  uses jwt / none, which this server does not support` and the hint *a token you hold is sent in the
  x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the session
  with mcp-auth*. Send the token in `x-sap-jwt-token` to `mcp-abap-adt-http` / `mcp-abap-adt-sse`,
  or create the session with `mcp-auth` (a `jwt` / `authorization_code` destination). stdio serves
  three authentications: `basic`, `snc`, `jwt` / `authorization_code`.
- **The connection is kept for the process's life.** A new provider the broker builds (it builds
  one when what it read for the destination changed — a service key, the destination's `.env`)
  no longer reopens the connection: a reopen would leave a lock held in the old session. The kept
  connection is replaced only when SAP already lost its session. To take a changed destination,
  restart the server.
- **The auth chain is 6.0.** The server runs on `@mcp-abap-adt/auth-broker` 5,
  `@mcp-abap-adt/auth-providers` 6 and `@mcp-abap-adt/auth-stores` 5. Service keys keep working
  as they are; a destination's means in a `.env` too.
- **Only the chain's own session format is read** (auth-stores 5). Session records written by
  `mcp-auth` (`@mcp-abap-adt/auth-broker-cli` 3.x) or by the server are read as before. A
  destination with no session record logs in on first use (a `.env` holding only the means is no
  session). An existing record of an older format — a token with no `SAP_ISSUED_FOR` /
  `SAP_ISSUED_BY` beside it (written by auth-stores 2.x–3.0, auth-broker 3.x or by hand), a token
  and cookies both, an expiry that is not epoch milliseconds — **stops the start**, without a login:
  `Destination "X" cannot be used: its session record is not in the store's format`, with the hint
  *regenerate the session with mcp-auth: `mcp-auth --destination <name> --type abap|xsuaa`, or
  `mcp-auth --service-key <file> --output <file> --type abap|xsuaa` (from
  @mcp-abap-adt/auth-broker-cli)*. A tool call answers the same, `destination_refused`. Removing
  `SAP_ISSUED_*` is no longer a remedy: regenerate the session with `mcp-auth`. A session bound to
  another destination's means is not used; the destination logs in afresh.
- **`--browser` is mapped by the platform** to one of auth-providers' browsers:

  | `--browser` | Linux | macOS | Windows | another platform |
  |---|---|---|---|---|
  | `system` (default), `auto` | `xdg-open` | `open` | the default browser | none: a `jwt` / `authorization_code` destination is refused at start (use `--browser=none` or `--browser-program`); other destinations start |
  | `chrome` | `google-chrome` | `Google Chrome` | `chrome` | none (as above) |
  | `edge` | `microsoft-edge` | `Microsoft Edge` | `msedge` | none (as above) |
  | `firefox` | `firefox` | `Firefox` | `firefox` | none (as above) |
  | `none`, `headless` | no browser: the URL on stderr; the login waits | the same | the same | the same |

  A name outside the table now stops the start instead of being passed on. On a platform outside
  the table only a `jwt` / `authorization_code` destination is refused for the missing browser, at
  the startup check. `auto` is new and means
  `system`. `--browser=none` no longer gives up at once: it prints the URL and waits for the
  callback. A browser that is not in the table: `--browser-program=<program>` (`MCP_BROWSER_PROGRAM`,
  YAML `browser-program`), which excludes `--browser`.
- **`--renewal=refresh-then-login|refresh-only`** (`MCP_RENEWAL`, YAML `renewal`) is new. The
  default, `refresh-then-login`, is what 18.x did. `refresh-only` never logs in: a destination that
  would need a login answers `renewal-declined` with "Logins are off (`--renewal=refresh-only`):
  log in with `mcp-auth`, or start without it."
- **A failed write to your `--env` / `--env-path` file fails the request** and refuses the
  destination until a write lands (18.x logged it and went on): the tool answers `unknown`
  (`persisting-tokens`) with "The session could not be written to the destination's file." A
  named destination's failed write (`--unsafe`) lets the request go on and writes one stderr line,
  `[MCP] A session write did not land: …`, **whatever `DEBUG_AUTH_LOG` says** (18.x: only with
  `DEBUG_AUTH_LOG=true`).
- **There is no shutdown deadline** (18.x gave up after 30 seconds). On `SIGTERM`, `SIGINT` or the
  end of stdin the server stops taking calls (a call read from then on is answered "The server is
  shutting down."), **waits for every running tool to finish** — none is aborted, so a write's
  `UNLOCK` still goes out —, undoes its held state, **logs off every ADT session it opened** (the
  logoff is what releases a lock a tool left), then writes the pending session secrets and exits
  `0`, or `1` with one stderr line per fact not done. stdin's `end` and `close` are one trigger.
  No interactive login starts once the shutdown began.
- **Ending the waiting early**: a second `SIGTERM` / `SIGINT`, or **`--shutdown-timeout=<seconds>`**
  (`MCP_SHUTDOWN_TIMEOUT`, YAML `shutdown-timeout`; 1-86400, no default). Either is the forced
  close: no more waiting on a tool, a state undo or a session write; every ADT session is still
  logged off; exit `1` with a line per tool still running and the step that was cut short. The
  forced close does wait for each logoff to be written: a logoff whose write never completes (a
  system that never takes the bytes) keeps the process until it is killed (`SIGKILL`). What it
  costs: a tool cut short mid-write, a session write lost — a discarded refresh token can come
  back on the next start.
- **A crash outside a tool logs off too** (every binary): an uncaught exception or an unhandled
  promise rejection runs the forced close — every ADT session logged off, one stderr line
  `[MCP] The process failed (<ErrorClass>): …`, exit `1` (18.x exited with Node's default and
  logged nothing off). A killed process (`SIGKILL`, out of memory) cannot log off: SAP's own idle
  timeout ends its sessions and their locks.
- **The startup check builds the credential.** A destination the broker refuses (a missing client
  field, say) now stops the start, exit `1`, instead of failing the first tool call.
- **There is no 30-second login timeout.** A login waits until the browser answers, the identity
  provider refuses, or the request is cancelled — a cancelled request (or a client that closed
  its connection) ends the login it started once no other request waits for it. To bound a login,
  set **`--login-timeout=<seconds>`** (`MCP_LOGIN_TIMEOUT`, YAML `login-timeout`; a whole number
  from 1 to 86400, no default): a login still waiting then ends `aborted`, answered with "The
  login was ended by the server's login timeout (`--login-timeout=<n>`)." (the bound named in the
  form you set it).
- **A cancelled request does not reach its tool**, on every transport: once its client cancels
  it (or closes its connection), its waits end — a shared connect or login goes on for the other
  requests waiting for it — and its tool is never called. A tool already running runs to its end,
  and a cancel does nothing to SAP: no logoff, no new session. A connect that completes after
  every request waiting for it was cancelled is kept as the server's connection and used by the
  next request.
- **`npm run auth` is gone.** Write a `.env` with `mcp-auth` from
  `@mcp-abap-adt/auth-broker-cli`: `npm install -g @mcp-abap-adt/auth-broker-cli`, then
  `mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap` (`--type xsuaa` for an
  XSUAA key), or `mcp-auth --destination <name> --type abap|xsuaa` for a destination of the
  destination folder (`mcp-auth --help` lists the rest).
- **`DeletePackage` with `force_new_connection` no longer falls back** to the session you asked
  it to avoid. If no fresh connection can be had, the call answers that failure, and nothing is
  deleted. 18.x logged the failure and deleted on the current session.
- **Editing a destination's files while the server runs is not supported**: it may combine old and
  new values until the next start. Restart after any change.
- **Inspection-only mode** (stdio without a destination) answers a tool call with the server's own
  `inspection_only` refusal, before any connection.
- **A tool call that fails on authentication answers JSON** (`isError: true`): `{ error, kind?,
  message, hint?, cause_kind?, server? }`. `error` is `authentication_failed` for a failure of the
  auth chain (`kind`, `message` and `hint` are the chain's), `destination_refused` for a destination
  the server cannot use, or one of the server's own refusals (`inspection_only`, `fresh_connection_unavailable`, `credentials_required`). The words are
  no longer a plain line of text, and no error's message, diagnostics or facts beyond `kind` are in
  them; the diagnostics go to stderr as auth-errors' `logFields`. See
  [What an MCP client sees](user-guide/AUTHENTICATION.md#what-an-mcp-client-sees-when-a-tool-call-fails-on-authentication).
- **A destination refused for its fields reads `Destination "X" cannot be used: <fields>`**
  (18.x: `lacks: <fields>`); a browser login on a platform with no known browser reads
  `Destination "X" logs in through a browser, and none is known on this platform (<platform>)`.

## Embedders

- **The chain under lib is the removal chain**: `@mcp-abap-adt/connection` **17.1**,
  `@mcp-abap-adt/interfaces-adt-connection` **3**, `@mcp-abap-adt/interfaces-adt` **16**,
  `@mcp-abap-adt/adt-clients` **31.1** (and `@mcp-abap-adt/adt-strategies` 0.11). None of them takes a
  signal: `IAbapRequestOptions.signal` and `IAdtClientOptions.signal` are gone, there is no
  `ADT_REQUEST_ERROR` / `ADT_REQUEST_ABORTED`, and `IAdtError` has no `refusal` — an
  authentication failure inside a tool reaches the model with the connection's own words. A
  connection's `disconnect()` resolves once its logoff is written, not answered; one instance is
  one SAP session, so a second `disconnect()`, or a `connect()` after it, rejects. A connection you
  inject, or return from `freshConnection`, is used on these contracts; move your own connection
  to them when you move to lib 19. The server builds its own connections with connection's
  `createConnection({ system, transport, … })`. Neither library sets a deadline of its own any
  more (see connection's `docs/MIGRATION-17.0.md`): a request carries the `timeout` you pass and
  nothing else, and inside a critical section none at all.
- **`makeAdtRequestWithTimeout`, `getTimeout` and `getTimeoutConfig` are gone from
  `@mcp-abap-adt/lib/utils`.** The last two were connection's, re-exported, and connection 17 no
  longer has them; `makeAdtRequestWithTimeout` turned a name (`'default'`, `'csrf'`, `'long'`) into
  one of their deadlines, so nothing is left for it to mean. Call `makeAdtRequest(connection, url,
  method, timeout, data?, params?, headers?)` with a number of your own — `0` for none.
- **`AuthBrokerFactory` left `@mcp-abap-adt/lib/auth`.** It is now
  `@mcp-abap-adt/core/auth`, with `IAuthBrokerFactoryConfig`: import both from there.
- **`IAuthBrokerFactoryConfig`** takes `browser?: IBrowser` (build it with `browserOf(browserFor(
  { browser, program }, process.platform))` from `@mcp-abap-adt/core/auth`, or pass your own) in
  place of `browser: string`, a `browserStrategy` taking `{ browser?: IBrowser; port?: number }`
  (auth-providers 6's `browserCallbackStrategy` fits), a required `promptLogger`
  (`promptLogger(stderr, diagnostics)`), `renewal?: 'refresh-then-login' | 'refresh-only'`, and
  `loginTimeoutMs?` (`--login-timeout` in milliseconds; absent: no bound).
- **Each tool call has a request signal** (`BaseMcpServer`): aborted when the MCP request's
  `extra.signal` aborts, and when the call ends. The handler runs inside the request
  signal scope — `currentRequestSignal()` reads it; nothing sent to SAP carries it — and a call
  cancelled before its tool starts ends with `RequestAbortedError` without reaching it (there is no
  `request_aborted` answer); the tools a registry
  registers itself (`registerAllTools`) are tracked the same way. A
  `ConnectionSource.resolve(signal)` gets it and should race its own waits against it
  (`raceRequestSignal(work, signal)`). All of these come from `@mcp-abap-adt/lib/embeddable`.
- **Nothing aborts a call that runs.** `activeTools()` (`@mcp-abap-adt/lib/embeddable`) lists the
  calls of every instance; a tool already running runs to its end, and a cancelled call ends only
  its waits. The process's shutdown machinery (the latch, the settlement, the shutdown sequence) is
  the launchers', not the embeddable entry's.
- **Ending an instance has two parts.** `BaseMcpServer.dispose()` stays the state undo — callable
  again, each call retrying what is left — and closes no connection. Beside it,
  **`terminalClose()`** closes every connection the instance owns — the one it built, held
  state's own, package lock sessions, fresh connections still open — each with its one
  `disconnect()` (the logoff, which releases its SAP locks), whatever the undo answered; a
  connection you injected is never closed. To let your own instance go, call
  **`closeInstance(instance)`** (`@mcp-abap-adt/lib/embeddable`): it runs the whole close in order
  (no new call of the instance, its calls settle, the undo, the terminal close, the MCP server's
  close), once per instance, and answers what the undo could not undo.
- **`connectionReleased(connection)`**: a subclass that calls `getConnection` itself calls it
  exactly once per `getConnection` when its work on the connection is done; a connection replaced
  meanwhile is logged off only then.
- **The server replaces its connection only when SAP lost its session** (or, where the
  credential is the request's — http, sse — a new credential arrives): the next call gets a new
  connection instance, the spent one is logged off; the call that met the loss gets the
  connection's error as it is. A built source may say it keeps its connection
  (`{ kind: 'built', source, keepsConnection: true }`, what stdio's `StdioServer` sets): a new
  credential object from `resolve` then does not replace it.
- **`restoreSessionInConnection` is gone from `@mcp-abap-adt/lib/utils`.** It switched the
  connection to stateful and never back; a stateful request is adt-clients' to mark, for the one
  `LOCK` or `UNLOCK`. `sessionUtils`' `makeAdtRequestWithSession` / `makeAdtRequestStateless` (not
  exported) are gone too.
- **`IAuthBrokerFactoryConfig.loginTimeoutStated?`** names the bound in D10's sentence (the
  launcher passes the form the user set, `` `--login-timeout=300` ``); absent, the sentence names
  `` `loginTimeoutMs: <ms>` ``, never a value the CLI would refuse.
- **`IDestinations.getProvider(destination, { signal })`** takes the request's signal.
  `settle({ signal })` takes **no deadline** (18.x: `settle(deadlineMs)`): it closes the gate,
  disposes the logins, waits for the counted calls as long as they take, and hands the signal to
  the broker's `flush`; `SettleReport` is `{ notStored }` — `abandoned` is gone.
  `SettleReport.notStored` lines are `"<destination>": <reason>`, the reason auth-errors'
  classification. `beginShutdown()` (new) refuses every later interactive login with the shutdown
  sentence while the gate stays open for running tools.
- **Leftover sessions: give your instances an owner, or they keep no record.** `BaseMcpServer`
  takes `leftoverSessions?: LeftoverSessions` (`@mcp-abap-adt/lib/embeddable`): one per process,
  created by you — `new LeftoverSessions({ directory: runtimeDirectory() })` — and handed to every
  instance; no module global. With it, each HTTP connection an instance builds and holds a session
  on keeps a runtime file until its logoff is written, and the three leftover-session tools work;
  without it they answer `leftover_sessions_unavailable`, as they do on an instance whose
  connection you injected. `StdioServer`, `StreamableHttpServer` and `SseServer` take the same
  option; the launchers pass one. The server's `resolveCaller(signal)` (protected) is who the tools
  answer for; core overrides it to refuse in inspection-only mode.
- **Background runs: give your instances a strategy, or `background: true` is refused.**
  `EmbeddableMcpServer` and `BaseMcpServer` take `backgroundRuns?: IBackgroundRuns`
  (`@mcp-abap-adt/lib/embeddable`): where runs and their answers are kept — `start(caller, run)` →
  `{ handle }` or `{ refused: 'limit', limit }`, `finish(handle, answer, finishedAt)`, `get`,
  `list`, `discard`, each checked against the caller (`{ url, client, user }`); every method may
  answer a promise. The library runs the request on the run's own connection (your
  `freshConnection` on an injected one), waits for SAP's answer, logs that connection off and hands
  you the answer; your strategy decides only where it is kept and how a handle is found (your store,
  your routing between replicas). Implement it yourself, or take the servers' store:
  `InMemoryBackgroundRuns({ prefix? })` of the separate package
  **`@mcp-abap-adt/background-runs-memory`** — the process's memory, 16 per caller, a handle of 128
  random bits after your `prefix` (an instance id, when you route handles between instances). lib
  exports no implementation, so a consumer with its own store never installs it. Nothing is a default: without a strategy,
  `background: true` and the three background-run tools answer `background_runs_unavailable`.
  `StdioServer`, `StreamableHttpServer` and `SseServer` take the same option; the launchers pass an
  `InMemoryBackgroundRuns` (`@mcp-abap-adt/core`, `http` and `sse` depend on
  `@mcp-abap-adt/background-runs-memory`). `HandlerExporter` and the default registry's `system` add the three
  tools beside the system group. A group registered on an `McpServer` of its own refuses
  `background: true`. `HandlerContext` has `backgroundRuns?` (the tools' port); `ServerRefusalCode`
  / `FailureCode` add `background_runs_unavailable`, `background_run_not_available`,
  `background_run_running`, `background_run_limit` and `background_run_caller_unknown` (a caller
  whose backend user neither the request nor SAP names). `ConnectionRole` adds `background`: the
  run's connection is owned by the strategy, so no instance's terminal close cuts it.
- **`HandlerEntry.connectionless?: true`** marks a tool that works on no connection of the
  instance: the server calls it without building or connecting one, its context's `connection`
  absent. The leftover-session tools are such tools (their resume must not log on). `HandlerContext`
  has `sessionFiles?` (the owner, which keeps a debugger's own connection) and `leftoverSessions?`
  (the tools' port). `ServerRefusalCode` / `FailureCode` add `leftover_sessions_unavailable`,
  `leftover_session_not_available` and `leftover_session_not_resumable`.
- **`createAbapConnection(settings, credential, logger?, sessionId?, session?)`**: `session` builds
  the connection on an existing SAP session (connection 17's `createConnection({ …, session })`):
  `connect()` logs on nowhere and asks SAP, without the credential, whether that session lives.
  HTTP only; over RFC it throws.
- **`inspectionOnlyDestinations()` is gone**: `new StdioServer(registry, undefined)` is
  inspection-only, and a tool call answers lib's `ServerRefusal('inspection_only')`
  (`@mcp-abap-adt/lib/auth`).
- **The closed provider gate answers auth-errors' `interactive-login` `aborted`**, minted, in place
  of `{ reason: 'the server is shutting down' }`.
- **`describeAuthError` is gone; read a failure with `failureOf(thrown)`** from
  `@mcp-abap-adt/lib/auth`: structural (no `instanceof`, no `message`, no `name`), total, it answers
  a `ReadFailure` (`error`, `kind?`, `message`, `hint?`, …) for a chain failure
  (`AuthProviderFailure`, connection's `AuthRefusedError`) or a `ServerRefusal`, else `undefined`.
  `answerFailure(read)` renders the §7.3 JSON, `failureLogLine(where, read)` the stderr line,
  `answerRead(read)` both; `readGuarded(reader, thrown)` answers auth-errors' fixed `unknown`
  words when a reader you do not own throws. The
  destination layer's reader, `DestinationConfigError` first, is core's `destinationFailureOf(thrown,
  { platform?, sentenceFor? })` (`@mcp-abap-adt/core/auth`); a `BaseMcpServer` subclass overrides
  `protected readFailure(thrown)` to read more.
- **Moved to `@mcp-abap-adt/core/auth`:** `UnsupportedAuthenticationError`, `DestinationRefusal`
  (both now a `ServerRefusal` answered `destination_refused`), `vetMeans`, `AuthType`,
  `VettedAuthentication`. `@mcp-abap-adt/lib/auth` no longer re-exports auth-broker's
  `DestinationConfigError`: import it from `@mcp-abap-adt/auth-broker`. `assertDestinationName`
  throws `ServerRefusal('destination_refused', …)`. `ServerRefusal` takes
  `destination_refused` with its words, and `fresh_connection_unavailable` /
  `credentials_required` with fixed ones.
- **`EmbeddableMcpServer` takes `freshConnection?: () => Promise<IAbapConnection>`.** Some operations need an ABAP session of their own: `CreatePackage`
  (high, and compact's `HandlerCreate` PACKAGE) and compact's `HandlerLock` PACKAGE over RFC,
  compact's `HandlerDelete` PACKAGE with `force_new_connection`, a
  debug session's own connections, and every call of a listed long read (see "the long reads take a
  `timeout`" above). On an injected connection, these now take that session from
  your factory, and from nowhere else. 18.x rebuilt one from the injected connection's
  `getConfig()` / `config`.
  - **Without the factory, these operations are refused** with `fresh_connection_unavailable`
    ("This operation needs an ABAP session of its own; the connection was given by the host, which
    supplied no fresh-connection factory (`freshConnection`)"). Nothing is sent. A connection set
    through `setAbapConnectionOverride` gets the same refusal.
  - **Once your factory returns a connection, it is the server's.** The server calls `connect()` on
    it, holds it for the operation (or under the package lock's handle until the unlock), and closes
    it with `disconnect()`. Build the connection with its own credential.
  - **The factory receives no signal.** It is called with no argument: a fresh connection is made
    inside a started tool, which runs to its end. A package lock's connection and a debug session's
    connection outlive the request that opened them.
  - **The latest injection of a connection object decides.** Injecting the same object again
    without `freshConnection` clears the earlier factory.
- **`credentialFromSapConfig` refuses instead of guessing** (`setSapConfigOverride`,
  `getManagedConnection`, `@mcp-abap-adt/lib/auth`):
  - an `authType` other than `basic`, `jwt`, `saml` or `certificate`, or none at all, is refused
    with "The SapConfig `authType` must be basic, jwt, saml or certificate". 18.x built a basic
    credential with an empty user;
  - `snc` is refused with "The SapConfig `authType` snc is served through a destination of
    mcp-abap-adt (stdio)";
  - `kerberos` stays refused;
  - a missing or empty `username`, `password`, `jwtToken` or `sessionCookies` is refused with "The
    SapConfig for <authType> authentication has no `<field>`". 18.x used `''`.

  A refusal names the field, never a value.
- **`ConnectionContext` is the instance's source** (`@mcp-abap-adt/lib/embeddable`):
  `{ kind: 'built', source: ConnectionSource } | { kind: 'injected', connection }`, plus
  `sessionId` and `metadata?`. A `ConnectionSource` answers `resolve(signal)` with `{ settings,
  credential, systemContext? }`. `BaseMcpServer.setConnectionContext(context)` takes it (18.x:
  `(destination, destinations)`); `setConnectionContextFromHeaders` is gone — pass
  `headerContext(headers)` from `@mcp-abap-adt/lib/http-transport`; `getConnection(signal)` takes
  the request's signal. A built connection is kept while the source answers the same credential
  object. `EmbeddableMcpServer`'s `connection` is an injected source, used as given.
- **`IDestinations`, `IAuthBrokerFactory` and `SettleReport` left `@mcp-abap-adt/lib/auth`** for
  `@mcp-abap-adt/core/auth`, beside core's `destinationSource(destination, destinations)`.
  `DestinationSystemContext` stays in `@mcp-abap-adt/lib/auth`.
- **`StreamableHttpServer` and `SseServer` moved** to `@mcp-abap-adt/http` and `@mcp-abap-adt/sse`
  (core no longer re-exports them) and lost their destinations argument:
  `new StreamableHttpServer(handlersRegistry, options)`, `new SseServer(handlersRegistry,
  options)`. Their `defaultDestination`, `allowDestinationHeader` and `readFailure` options are
  gone; a failed tool call is answered by `BaseMcpServer`'s `readFailure`.
- **`@mcp-abap-adt/lib/http-transport`** holds what both transports share: `headerSource`,
  `headerContext`, `refuseDestinationHeader`, `hasHeaderCredentials`, `requestFailureAnswer`,
  `installTransportShutdown`, `CREDENTIALS_REQUIRED_WORDS`, `DESTINATIONS_ONLY_STDIO_WORDS`,
  besides the DNS-rebinding protection and the TLS listener. `destinationFromHeader`,
  `FirstConnectLock`, `destinationFailureAnswer` and `DestinationHeaderError` are gone.
- **The tools a binary serves are its `ToolSet`** (`@mcp-abap-adt/lib/tool-set`), fixed by the
  binary: `kind` (`core`, `core-ro`, `compact`, `compact-ro`), `groups(context)`,
  `toolsHelp(transport)` (the TOOLS section of `--help`), `expositionRemoved(transport)` (the
  removed `--exposition` of the binary's table) and `backgroundRuns` (whether the launcher gives
  the server a background-run store). Four sets: `fullToolSet` (readonly, high, debug, search,
  system, every leftover-session tool, background runs; `low` is gone, see "The low set leaves the
  full binaries"), `fullReadOnlyToolSet` (readonly, search, system, the leftover-session list and
  logoff), `compactToolSetOf({ readOnly, modify })` (the compact halves' entry builders,
  `compactReadOnlyEntries` and `compactModifyEntries`, with the compact debugger verbs, background
  runs and every leftover-session tool) and `compactReadOnlyToolSetOf(readOnly)` (the read-only half,
  the leftover-session list and logoff). `registryOf(toolSet)` builds the registry. core's, http's
  and sse's `main({ toolSet, program, version })` take nothing else of the tools:
  `LauncherOptions`' `extraGroups`, `exposition`, `helpExposition` and `includeSearch` are gone,
  and `main()` without options is a type error; a second, optional argument gives the process's
  edges (`processEdges()` of `@mcp-abap-adt/lib/config` by default). Each binary's table is a
  function of the set (`coreParameters(toolSet)`, `httpParameters(toolSet)`,
  `sseParameters(toolSet)`; the constants are the full set's), and `readCoreConfig` /
  `readHttpConfig` / `readSseConfig` take the set as a fourth argument (default `fullToolSet`).
  `@mcp-abap-adt/compact` no longer exports `CompactHandlersGroup` or `compactExtraGroups`: it
  exports `compactToolSet` and `main`; each `-ro` package exports `readOnlyToolSet`, `main` and
  its version. Gone with `--exposition`: `ToolSet`'s `expositionRow`, `expositionHelp`,
  `expositionExamples` and `exposition()`; `EXPOSITION_ROW`, `toHandlerSets`, `expositionHelp`,
  `COMPACT_BINARIES` (now `BINARIES`, every kind per transport), `expositionProblem` and
  `validateExposition` (`@mcp-abap-adt/lib/config`); `parseCompactExposition`,
  `parseCompactDebug` and `CompactExposition` (`@mcp-abap-adt/lib/tool-set`); `Parameter`'s
  `cliReadByOwner`. A `RemovedParameter`'s `words(form, value)` now also receives the value the
  form carried. `registryForExposition(exposition)` and `expositionGroups(exposition, context)`
  (`@mcp-abap-adt/lib/handlers`) stay for an embedder combining the object-oriented sets; their
  `extraGroups` / `includeSearch` options are gone.
- **The low set is gone from lib's surface too.** `LowLevelHandlersGroup` (and its export from
  `@mcp-abap-adt/lib/handlers`) is deleted; `HandlerExporter` has no `includeLowLevel`;
  `EmbeddableMcpServer`'s `exposition` and the `HandlerSet` type have no `'low'`. The handler
  functions compact delegates to stay exported: `handleLockObject`, `handleUnlockObject`,
  `handleActivateObject` and the new `handleUpdateUnderLock` and `handleDeletePackage`
  (`@mcp-abap-adt/lib/handlers/write`); `handleCheckObject`, `handleValidateObject`,
  `handleGetNodeStructure`, `handleGetVirtualFolders`, `handleGetObjectStructure`
  (`@mcp-abap-adt/lib/handlers/read`). An embedder that composed the low group serves the compact
  halves instead (`compactReadOnlyEntries`, `compactModifyEntries`).
- **`--exposition` stops the start in its words** (see "`--exposition` is gone"; `low` with the
  sentence of "The low set leaves the full binaries"): `[MCP] <sentence>`, exit 1 — 18.x failed
  the launcher with no words on a word it did not serve.
- **Each binary reads its own parameter table** (`@mcp-abap-adt/lib/config` keeps the machinery
  and the shared rows). `ServerConfigManager`, `ArgumentsParser` and `applyYamlConfigToArgs` are
  gone: read a binary's configuration with `readCoreConfig(argv, env, yaml)` / `CORE_PARAMETERS`
  (`@mcp-abap-adt/core`), `readHttpConfig` / `HTTP_PARAMETERS` (`@mcp-abap-adt/http`),
  `readSseConfig` / `SSE_PARAMETERS` (`@mcp-abap-adt/sse`). lib's `readParameters(table, argv,
  env, yaml)`, `parameterSource`, `generateHelp(table, …)`, `readStartupConfig(table, …)` and the
  shared rows (`CONF_ROW`, `SYSTEM_TYPE_ROW`, `STATE_IDLE_ROW`, `tlsRows`) build
  a table of your own; a refusal is a `ParameterRefusal` carrying its `words`.
  `loadYamlConfig(table, path)`, `validateYamlConfig(table, config)`,
  `generateYamlConfigTemplate(table)` and `generateConfigTemplateIfNeeded(table, path)` take the
  table; `parseConfigArg(argv?)` reads `--conf` / `--config`.
- **`IServerConfig` holds the shared fields only** (`configFile`, `systemType`,
  `systemTypeSource`, `stateIdleMinutes`): the destination fields are core's `CoreConfig`, the
  listener fields http's `HttpConfig` and sse's `SseConfig`. `Transport`, `IV2ServerConfig` and
  the legacy `transport`, `transportConfig`, `defaultMcpDestination`, `defaultDestination` and
  `logger` fields are gone.
- **Moved to `@mcp-abap-adt/core`:** `getPlatformPaths` (was also re-exported by
  `@mcp-abap-adt/lib/auth`), `resolveEnvFilePath`, `hydrateSystemContextFromEnvFile`,
  `ENV_FILE_CONTEXT_KEYS`.
- **Gone from `@mcp-abap-adt/lib/utils`:** `showHelp`, `parseTransportConfig`, `TransportConfig`
  (and `ServerOptions.transportConfig`), `getArgValue`, `hasFlag`, `parseBoolean`,
  `resolvePortOption`, `resolveBooleanOption`, `resolveListOption` — the 18.x help and transport
  parsing nothing read.

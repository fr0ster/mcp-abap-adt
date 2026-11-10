# Spec: stdio starts without the SAP system

Goal: `2026-11-10-deferred-logon-goal.md`. This spec says what is built and where, for
fr0ster/mcp-abap-adt#353, part 2. Part 1 (the start line names the network or TLS code) is
on this branch already (commit `db3f3fc1`). Every claim about today's behaviour carries a
label: **Code** (read in the source, file:line), **Measured** (a run) or **Inference**.
Line numbers are those of this branch at its base.

## 1. What the code shows

### The start

- **The start order.** `launchStdio` (`server-runtime/src/stdio/launcher.ts:832-1037`):
  the destination's `.env` joins the environment for two keys only (`:841`); the connection
  and system types are resolved (`:842-857`); the tool registry is built from the command's
  tool set (`:860`); the browser is mapped (`:862-883`); the factory is built (`:889-900`);
  the shutdown is installed with the start's birth (`:908-921`); the startup check and the
  summary run (`:924-953`); the system type is required for a destination (`:961-965`) and
  for inspection mode (`:968-972`); the `StdioServer` is built (`:984-1011`); the connection
  is born (`:1017-1030`); then the transport opens (`:1032-1036`). (Code)
- **The startup check sends nothing to SAP.** `checkAndSummarise`
  (`launcher.ts:733-779`) reads the settings, builds the provider with a signal aborted
  once it is built, and prints the summary from the stores; its comment says "building
  sends nothing" (`:727-731`). (Code; that no provider sends anything while built is the
  comment's claim, not re-read here: Inference)
- **The birth at the start.** `StdioServer.connectAtStart`
  (`server-runtime/src/stdio/StdioServer.ts:142-151`) calls `BaseMcpServer.bornAtStart`
  (`src/embeddable/BaseMcpServer.ts:1400-1447`), which claims the destination's one
  leftover session (`LeftoverSessions.claimTheOne`,
  `src/lib/leftoverSessions/LeftoverSessions.ts:522-527`) and takes it up
  (`resumedSession`, `BaseMcpServer.ts:1316-1385`), or logs on (`logOn`, `:1258-1266`). Its
  result (`StartedConnection`, `:186-193`) is not read by the launcher (`launcher.ts:1019`).
  (Code)
- **A failed birth ends the process.** `startConnectionWords` (`launcher.ts:669-696`) words
  the failure; the launcher logs off what was logged on and exits `1` (`:1020-1028`).
  (Code)
- **The cause the start line names.** `START_NETWORK_CODES` (`launcher.ts:627-635`),
  `START_CAUSE_CODES` (the network codes and interfaces-auth's `TLS_FAILURE_CODES`,
  `:638-641`) and `startCauseCodeOf` (`:649-659`, the `code` read guarded, compared as a
  string) are module-private to the launcher. (Code)
- **Where the system type comes from.** `effectiveSystemType` (`launcher.ts:494-505`) over
  `effectiveFromEnvironment` (`:399-424`): the CLI wins; else the environment (which holds
  the `.env`'s `SAP_SYSTEM_TYPE` by then, never over a value set); else YAML. A word outside
  `onprem`, `cloud`, `legacy` is refused naming the key. (Code)
- **The tool set comes from the declared type.** `src/lib/variantToolSet.ts:1-23`: the
  declared system type names the variant's ADT type table; a tool the table does not serve
  is not registered. `registerHandlers` reads `this.systemType ?? process.env.SAP_SYSTEM_TYPE`
  (`BaseMcpServer.ts:1494-1496`) and lists by it; nothing asks the system. (Code)

### A tool call's connection

- **The first call can already make the connection.** `StdioServer.start`
  (`StdioServer.ts:159-168`) sets the destination as the connection source (`serve`,
  `:171-187`) whether or not `connectAtStart` ran; its doc says "otherwise the first tool
  call makes it" (`:153-158`). (Code)
- **`getConnection` builds on demand and keeps no failure.** `BaseMcpServer.getConnection`
  (`BaseMcpServer.ts:741-791`) resolves the source and, with no connection held, builds one
  with `logOn` (`buildConnection`, `:1190-1255`), its system information made with it. A
  failed build is not kept: "the next call connects again" (`:1245-1250`). It never takes
  up a leftover session. (Code)
- **Calls share one connect.** A tool call takes its connection before it enters the main
  flow, "so concurrent callers still share one connect()" (`BaseMcpServer.ts:1589-1600`);
  then it waits its turn (`enterMainFlow`, `:805-819`). (Code)
- **What a failed connect answers today.** The call's `catch` (`BaseMcpServer.ts:1780-1800`)
  answers through `refusalAnswer` (`:1910-1919`): the failure reader first
  (`StdioServer.readFailure`, `StdioServer.ts:127-132`: the destination layer's failures,
  then lib's `failureOf`), else `return_error` (`src/lib/utils.ts:299-…`). For an
  `AxiosError` with `ECONNREFUSED` or `ETIMEDOUT`, `return_error` appends
  `Original error: <message>`; for `ENOTFOUND` it names the host it could not resolve
  (`utils.ts:325-345`). (Code) Axios's message for a refused connect is
  `connect ECONNREFUSED <ip>:<port>`, so today's answer names the address. (Inference)
- **RFC.** An RFC logon that cannot reach its system is answered by the failure reader with
  the RFC key: the portable smoke check reads the start line
  `the RFC logon failed (RFC_COMMUNICATION_FAILURE)` (`docs/installation/PORTABLE.md:96-101`;
  Measured there, on 19.x). A tool call's failure goes through the same reader
  (`refusalAnswer`), so it answers the same key. (Inference)

### The parameters

- **One table, one precedence.** Every row of a binary's table is read by `readRow`
  (`src/lib/config/authParameters.ts:353-371`): the CLI, then the row's environment
  variable, then the YAML key; the first form that gives a value wins
  (`readParameters`, `:378-391`; the module's doc, `:1-20`). (Code)
- **A flag row.** `kind: 'flag'` (`authParameters.ts:278-292`): a bare `--x` is `true`;
  `--x=true` / `--x=false`, the variable's or YAML's `true` / `false` (any case) are read;
  an empty value is unset (the next form is read); any other word is refused at start,
  naming the form used. So `--x=false` beats `MCP_X=true`, and `MCP_X=false` beats YAML
  `x: true`. (Code)
- **core's rows.** `CORE_ROWS` (`server-runtime/src/stdio/config/coreParameters.ts:49-140`)
  holds `--unsafe` / `MCP_UNSAFE` / `unsafe`, a flag row in all three forms (`:84-92`);
  `readCoreConfig` (`:440-497`) reads it with `flagValue(…) ?? false` (`:484`). The help, the
  YAML validator and the `--conf` template read the same table (`authParameters.ts:4-10`).
  (Code)
- **The destination's `.env` is not a source.** Only `SAP_CONNECTION_TYPE` and
  `SAP_SYSTEM_TYPE` of it join the environment
  (`server-runtime/src/stdio/config/envFileContext.ts:21-24`). (Code)
- **No restore setting exists.** No parameter, variable or key decides whether the start
  takes up a leftover session: the start always tries `claimTheOne` (`BaseMcpServer.ts:1409-1414`),
  and no row of core's table names a restore or a resume (Code, `coreParameters.ts:49-345`).
  `ResumeLeftoverSession` does not exist (CHANGELOG 19.0.0, `CHANGELOG.md:584`). (Code)

## 2. The flag

- **A new row in `CORE_ROWS`**, kind `flag`, in the section `DESTINATION AND LOGIN`:
  - CLI `--deferred-logon`, environment `MCP_DEFERRED_LOGON`, YAML `deferred-logon`
    (names: open point B, §8);
  - help: "Start without contacting the SAP system: the tools are listed at once and the
    first tool call logs on. Default: off — the start logs on and exits 1 when it fails".
- **`CoreConfig.deferredLogon: boolean`**, read in `readCoreConfig` as `--unsafe` is:
  `flagValue(values.deferredLogon) ?? false`.
- **Precedence: nothing new.** The row is read by `readRow`; parameter over variable over
  configuration follows from it (§1, The parameters). No precedence code is written. The
  destination's `.env` is not a source.
- **Help.** `V2_HELP_SECTIONS`' "MCP Server Configuration" list (`launcher.ts:114-120`) gains
  `MCP_DEFERRED_LOGON`. The parameters table of `--help` comes from the row.
- **Inspection mode.** Without a destination nothing is connected anyway
  (`launcher.ts:974-982`); the flag is accepted and changes nothing there.

## 3. The start with the flag

In `launchStdio`, everything up to and including the system-type checks
(`launcher.ts:832-972`) is unchanged: the type resolution, the browser mapping, the
factory, the shutdown, the startup check and summary, the required connection type and
system type. A destination refused there is refused the same way, exit `1`.

Then, with `deferredLogon`:

- the server is built as today (`:984-1011`), with the deferred mode stated in its options
  (§4);
- `connectAtStart` is not called (`:1017-1030` skipped); no logon, no system lookup, no
  leftover claim at the start;
- one stderr line: `[MCP] Destination "<d>": the logon is deferred to the first tool call
  (deferred logon)`; fixed words and the destination's name, nothing else;
- the transport opens (`birth.open()`, `:1032-1036`) and `start` registers the declared
  type's tools (`StdioServer.ts:159-168`).

Without the flag the launcher runs exactly today's path.

## 4. The first call, and every call while there is no connection

### The connection

No new connection path: the first call's `getConnection` builds the connection as it can
today (§1, A tool call's connection). What changes:

- **`StdioServerOptions.deferredLogon?: boolean`** (`StdioServer.ts:32-68`), set by the
  launcher from the flag; absent is `false`.
- **The leftover take-up moves with the birth when restoring is stated.** With the flag
  and the restore setting (§5), the instance's first birth claims and takes up the
  destination's one leftover session as `bornAtStart` does; without the restore setting it
  logs on (`logOn`) and leaves leftovers alone. To do this without a second path,
  `bornAtStart`'s choice between `resumedSession` and `logOn` (`BaseMcpServer.ts:1409-1430`)
  moves into one private method used by both `bornAtStart` and `getConnection`'s first
  build. `getConnection` uses the take-up only while the instance has never had a
  connection born and the instance was told to restore at its first birth; once a birth
  succeeded, a replacement is a `logOn`, as today after a start. A failed take-up gives the
  claimed file back (`owner.release`, `BaseMcpServer.ts:1316-1385`), so the next call claims
  it again.
- **One attempt per call.** A failed build is not kept (`BaseMcpServer.ts:1245-1250`), so
  the next call builds again. Calls that arrive while a build runs share it (§1). Nothing
  waits, retries or polls; no timer is added. How long one attempt lasts is the
  connection's and the operating system's, as for any call today. (Inference: a refused
  port fails at once; an unanswered host waits for the OS's connect timeout.)

### The answer: no connection

- **A new server refusal `no_connection`.** `ServerRefusalCode`
  (`src/lib/auth/serverRefusal.ts:13-42`) and `FailureCode` (`src/lib/auth/failures.ts:30-61`)
  gain `no_connection`. A typed constructor overload takes the cause code, not free words:
  `new ServerRefusal('no_connection', cause)` where `cause` is a `ConnectionCauseCode`
  (below). Its words are built from the code alone:
  `no connection to the SAP system: the connection failed (<CODE>); the next tool call
  tries again`.
- **The cause list moves to lib.** `START_NETWORK_CODES`, `START_CAUSE_CODES` and
  `startCauseCodeOf` (`launcher.ts:627-659`) move to a new
  `src/lib/auth/connectionCause.ts`, exported through `@mcp-abap-adt/lib/auth`, as a
  `const` tuple with its element type `ConnectionCauseCode` and a reader
  `connectionCauseOf(thrown): ConnectionCauseCode | undefined` (guarded, compared as a
  string, no regex). `startConnectionWords` imports them; its words do not change.
- **Where the refusal is made.** `StdioServer` overrides `getConnection`
  (`StdioServer.ts:195-200`). With `deferredLogon`, a throw of `super.getConnection` is
  turned into `no_connection` when all three hold: the failure reader does not read it
  (`this.readFailure(thrown) === undefined`), SAP gave no answer (`sapAnswerOf(thrown) ===
  undefined`), and `connectionCauseOf(thrown)` names a listed code. Anything else is thrown
  as it is and answered as today: a chain failure (a refused credential, an RFC key), SAP's
  answer, a system lookup that failed, an unlisted code. The failure reader then answers
  `no_connection` through `answerRead` (`src/lib/auth/answerFailure.ts:53-56`): the answer's
  `error` is `no_connection`, and the stderr line `[MCP] no_connection`.
- **Every call, not only the first.** With the flag, the refusal applies while the process
  runs: a call after the system went away, whose connection must be built again, answers
  `no_connection` the same way. Without the flag nothing changes.
- **What the answer never holds.** No URL, host, port, user, password, token or error
  message: the words are fixed and the code is a listed one.
- **RFC.** An RFC connection that cannot reach its system fails as a chain failure carrying
  the RFC key (§1), read by the failure reader, so it is not turned into `no_connection`; it
  is answered with the RFC key, as the start line names it. The plan's first RFC unit case
  checks this reading (it is an Inference today); if a tool call's answer does not carry the
  key, that goes to the owner before anything is changed.
- **Not touched.** The debugger's and the long reads' own connections, and the background
  runs: their connects are not the instance's connection and keep their answers.
  `ListLeftoverSessions` and `LogoffLeftoverSession` work without a connection
  (`BaseMcpServer.ts:1523-1538`) and work before the first call as after it.

## 5. The restore setting

No restore setting exists (§1). The goal requires one before a leftover session is taken up
with the flag; until the owner decides (open point A, §8), **nothing of this section is
built**, and with the flag no leftover session is taken up: the first call logs on, and
the leftovers stay for `ListLeftoverSessions` / `LogoffLeftoverSession`.

The proposal, if the owner takes it:

- a flag row `--restore-session` / `MCP_RESTORE_SESSION` / `restore-session`, read by the
  same table and so with the same precedence;
- with `--deferred-logon`: `true` makes the first birth take up the destination's one
  leftover session (§4); `false` or absent does not;
- without `--deferred-logon`: refused at the start in fixed words naming the form used and
  `--deferred-logon`, exit `1` — the start takes up the leftover session on its own then, and
  a stated `false` must not be ignored in silence.

## 6. Tests

All new tests on `node:test` with `node:assert/strict`. Each pins a rule, and each rule is
shown load-bearing: the rule broken on purpose, the test red, the change reverted, recorded
in the commit.

### Unit (`npm test`)

- **Precedence** (`server-runtime/src/stdio/__tests__/config/coreParameters.test.ts`):
  `readCoreConfig` over argv, env and YAML — CLI `false` over env `true`; CLI `true` over env
  `false`; env `true` over YAML `false`; env `false` over YAML `true`; YAML alone; none is
  `false`; an empty env value falls through to YAML; an invalid word is refused naming
  `MCP_DEFERRED_LOGON` (and `--deferred-logon=…`, `deferred-logon (config file)`); a
  `MCP_DEFERRED_LOGON` in the destination's `.env` is not read. The same cases for
  `--restore-session` only if open point A is decided for it.
- **The deferred start** (beside `server-runtime/src/stdio/__tests__/startConnector.test.ts`,
  the whole launcher over an `InMemoryTransport`, the ADT stand-in
  `src/__tests__/helpers/adtStandIn.ts`):
  - with the flag and nothing listening: the transport opens, the process does not exit,
    the stderr line is the deferred one, and `tools/list` equals the list a start without the
    flag gives for the same declared type (taken against a listening stand-in);
  - nothing reaches the address during the start: a listener that counts and resets every
    connection counts `0` until the first call;
  - a call answers `isError` with `error: "no_connection"` and the code (`ECONNRESET` from the
    counting listener; `ECONNREFUSED` from a closed port); the answer holds none of the URL,
    the host, the port, the user, the password;
  - a second call makes one new attempt (the counter goes from `1` to `2`); two calls sent at
    once while there is no connection make one attempt between them;
  - the stand-in then listens on that port: the next call logs on and answers; the call
    after it sends no logon;
  - a refused credential (`401`) is answered as today, not as `no_connection`;
  - without the flag, today's cases of `startConnector.test.ts` keep passing unchanged;
  - with the flag, a leftover session of a killed process
    (`src/__tests__/helpers/leftoverSession.ts`) is not taken up: the first call logs on,
    and `ListLeftoverSessions` still lists it;
  - only after open point A: with the restore setting, the first call takes it up (the
    stand-in sees no logon), a failed take-up gives the file back and the next call takes
    it up; the setting without the flag is refused at start, exit `1`.
- **The cause list** (`src/__tests__/unit/…/connectionCause.test.ts`): the moved reader keeps
  part 1's cases (`startConnector.test.ts`, "the start line names the network cause"):
  each listed code, an unlisted one, a throwing getter.

### Live

- **An unreachable system, no SAP needed.** A new suite
  `src/__tests__/integration/live/deferredLogon.test.ts`, run by its own npm script
  `test:live-deferred-logon` (listed in `LIVE_SCRIPTS`,
  `src/__tests__/integration/helpers/liveScripts.ts:15-23`, `--concurrency 1`). It installs
  the packed release as `liveConnection.test.ts` does (`installPackedRelease`), writes a
  temporary `.env` with `SAP_URL=http://127.0.0.1:<port>` — a port it bound and closed —
  basic credentials that exist nowhere, `SAP_SYSTEM_TYPE=onprem`, `SAP_CONNECTION_TYPE=http`,
  and starts the installed bin with `--deferred-logon`. It asserts: the process stays up;
  `tools/list` is not empty; two calls each answer `no_connection` with `ECONNREFUSED`; the
  shutdown trigger ends the process with exit `0`; every stdout byte is a JSON-RPC frame. It
  reports no path, no `.env` value and no answer text. The plan checks what the live run's
  global setup does for a script that needs no system, and states where the suite runs.
- **The system becomes reachable mid-session (E19).** In the same suite, a case that runs
  only where a variable names one HTTP `.env` of a real system, and skips with its reason
  elsewhere. The server's `.env` copy points at a local port the test owns; the port is
  closed first (a call answers `no_connection`), then the test opens a plain TCP forwarder
  on it to the system's address, and the next call answers from the system; the shutdown
  logs off. HTTP only (a forwarder over TLS would break the host name check). It is run on
  E19 only on the owner's go; this task does not run it.

## 7. Documentation

- `CHANGELOG.md`: a new minor entry (after 24.0.0): the flag, its three forms and
  precedence, `no_connection`, the leftover rule; and the restore setting if built.
- `docs/user-guide/CLI_OPTIONS.md`, "Destination and login" table (`:89-111`): the row (and
  the restore row if built), and a short section on the deferred logon.
- `docs/configuration/YAML_CONFIG.md`: the YAML key.
- `docs/user-guide/README.md:130-150` ("Leftover SAP sessions of a killed process"): with the
  flag, a leftover is not taken up unless restoring is stated.
- `docs/user-guide/HANDLERS_MANAGEMENT.md:16-17`, `:148-155`: "takes up … at its start"
  qualified by the flag.
- `docs/architecture/CONNECTION_ISOLATION.md:21`, `:75` and
  `docs/architecture/ARCHITECTURE.md:342-347`, `:635`: the connection born at the start, or
  at the first call with the flag.
- `docs/development/tests/TESTING_AUTH.md:63`, `:129`: the start's login and the take-up,
  with the flag's exception; the live suite and its script.
- `docs/installation/examples/SERVICE_KEY_SETUP.md:94`: "the server connects at its start",
  with the flag's exception.
- `docs/installation/PORTABLE.md:96-101`: "Since 19.0.0 stdio logs on at its start" stays
  true by default; one clause that the smoke check runs without the flag.
- `docs/user-guide/CLIENT_CONFIGURATION.md`: an example for two systems that are never up
  at once (the issue's case).
- The `--help` text (`launcher.ts:111-228`): `MCP_DEFERRED_LOGON` (and the restore variable
  if built).
- The CHANGELOG entries since 19.0.0 that describe the start logon stay as they are
  (`CHANGELOG.md:578`, `:584`, `:594`, `:660`, and 24.0.0's `:145`): history is not
  rewritten.
- No migration note: the default does not change. This is a minor release.

## 8. Open points for the owner

- **A. The restore setting.** None exists. Options:
  1. a flag `--restore-session` / `MCP_RESTORE_SESSION` / `restore-session` as in §5: with
     the deferred flag it makes the first call take up the one leftover session; without
     the deferred flag it is refused at start;
  2. the same flag, also read without the deferred flag, so `false` stops today's take-up
     at the start (default `true` without the deferred flag, `false` with it);
  3. no setting: with the deferred flag a leftover is never taken up; the list and logoff
     tools handle it.

  Recommendation: 1. It is the smallest change that states restoring explicitly, keeps
  today's default untouched, and refuses a statement that would otherwise be ignored.
- **B. The names.** `--deferred-logon` / `MCP_DEFERRED_LOGON` / `deferred-logon`; or the
  issue's `--connect-at-start=false` (a flag whose default is `true`, so the opt-in is a
  `false`). Recommendation: `--deferred-logon`: an opt-in reads as on when present, and a
  bare flag turns it on.

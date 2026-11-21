# abapGit — plan

Implements [the spec](2026-11-21-abapgit-spec.md) (approved) for [the goal](2026-11-21-abapgit-goal.md).
Steps, not code: each task names its files, its interfaces, its tests (red first) and what to run.
Code is written at implementation, test-first; every rule a test protects is proved load-bearing
by a mutation (break the rule, watch the named test go red, revert).

**§9 open decisions — the spec's recommendation is taken; the owner may overrule each:**

- §9.1 stdio `--deferred-logon`: (a) list no abapGit tool until the logon, then send
  `notifications/tools/list_changed`.
- §9.2 "read one repository": (a) `package_name` / `repository_key` filters on `ListAbapGitRepos`,
  applied by a result strategy over the one R1 answer.
- §9.3 no approved endpoint matches: (a) send without credentials.
- §9.4 onprem long writes: (b) opt-in `background: true` as a code run.

## Global Constraints (verbatim from the spec)

- "No retry, no timeout (`timeout: 0`), no lenient reading, no polling."
- "Every member addressed by a repository builds its path from `key` (URL-encoded segment); no
  member takes a URL to send to, except the existing `pull`/`getErrorLog`."
- "No credential is part of a result, an `IAdtError`, or the request an error describes (`method`,
  `url`)."
- "adt-clients sends both flags on **every abapGit write** (R2, R3, R4, R5, R10, R14, R15), on every
  member called with `credentials`, and on `getRunLog`/`getErrorLog` — whether a credential is
  attached or not."
- "With `noLog`, a line, if any, carries method, the path without query, the integer status and
  the byte count."
- "`noResend: true` — gates every replay of the request; the initial CSRF token fetch before a
  mutation still happens."
- "**every abapGit request goes stateless on the wire, a request after a failure included**".
- "every abapGit tool and action is refused in batch mode before anything is sent and before any
  credential is resolved; no batch entry and no number is taken (`batch_not_recordable`)."
- "**While any `allowed-packages` or `allowed-requests` entry is configured, link and pull are
  refused on both systems** (full tools and compact actions), in fixed words
  (`abapgit_import_not_allowed`: "linking or pulling a repository writes objects that the allowed
  packages and requests cannot bound, so it is refused while access restrictions are
  configured"), nothing sent."
- R1 pre-read: "exactly one request: `GET /sap/bc/adt/abapgit/repos`, Accept
  `application/abapgit.adt.repos.v2+xml`, stateless, no credential, no wire log", "**before
  foreground or background dispatch** … and before any credential is resolved".
- "**Fail closed:** a key R1 does not list, an entry with a blank package or URL, or an unreadable
  R1 refuses the call in fixed words."
- Approved endpoint: "an exact remote URL — scheme (`https`), host (lower-cased), a non-default port
  when there is one, and path … No `.git` or trailing `/` is merged". "when an alias matches, the
  **configured URL** is what SAP is sent"; key-addressed tools use "the `url` of the R1 entry for
  that key, read first — never a URL from the arguments."
- Credential headers (Streamable HTTP / SSE): `x-abapgit-remote`, `x-abapgit-user`, `x-abapgit-token`.
- "Anything not named — raw bodies, headers, status texts, message texts, exception texts, message
  variables and properties — is dropped **before** any log line, the tool answer and the
  background-run record" (§5.3 table is the kept-field list).
- Discovery: "cached **by the system that connection actually reaches** (its system key,
  `adtSystemKey`), never by `state_handle` or instance; kept for the process; no clock expires it."
  Refusal: "abapGit is not served by this system".
- "`background` is declared only on onprem `LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo`
  and, in compact, on the onprem variant of `HandlerAbapGit` (boolean, optional, **no default**)".
  "**`background: true` is refused, never run in the foreground**" when it cannot run.
- Cloud run wait: "poll R1 until the entry shows a **new** log key **and** a terminal `status`
  (`S`, `W`, `E`, `A`); blank (initial) and `R` mean waiting."
- Release gate: "If on a backend SAP forwards the credential to any URL other than the approved
  endpoint — another host or another path alike — every credentialed call on that backend is
  refused in fixed words until that is solved."

The same owner rules bind every package: no retries and no timeouts; static types first;
availability from the system; functional tool descriptions; compact keeps a minimal tool count;
access checks before anything is sent; no redactor, only structure and facts; every handler pinned
by unit tests and live tests on both systems; a live test states where it runs and skips with a
reason elsewhere.

## Release order and gates

Each package is one PR in its repository holding all of that package's tasks; the next package
depends on the **registry** version (no `file:`, `link:` or workspace link to another repository;
after each install the lockfile is checked for `"link": true` and non-registry entries).

| # | Package (repo) | Version | PR |
|---|---|---|---|
| P1 | `@mcp-abap-adt/interfaces-adt-connection` (`~/prj/mcp-abap-adt-interfaces`) | 5.1.0 → 5.2.0 | own PR |
| **G1** | **owner publishes interfaces-adt-connection 5.2.0** | | |
| P2 | `@mcp-abap-adt/interfaces-adt` (same repo) | 30.1.1 → 30.2.0 | own PR |
| **G2** | **owner publishes interfaces-adt 30.2.0** | | |
| P3 | `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`) | 25.0.1 → 25.1.0 | own PR |
| **G3** | **owner publishes connection 25.1.0** | | |
| P4 | `@mcp-abap-adt/adt-strategies` (`~/prj/mcp-abap-adt-clients/packages/adt-strategies`) | 0.26.0 → 0.27.0 | own PR |
| **G4** | **owner publishes adt-strategies 0.27.0** | | |
| P5 | `@mcp-abap-adt/adt-clients` (`~/prj/mcp-abap-adt-clients/packages/adt-clients`) | 46.1.0 → 46.2.0 | own PR |
| **G5** | **owner publishes adt-clients 46.2.0** (after the adt-clients live run and the redirect gate, T5.6) | | |
| P6 | `@mcp-abap-adt/lib` and binaries (this repo, PR #374) | ships in 24.2.0 | #374, then #371 |

Two packages share a repository twice (P1/P2, P4/P5): they still get one PR each, opened after the
previous gate, since each builds on the published predecessor.

## P1 — interfaces-adt-connection

**T1.1 Request flags.** `packages/interfaces-adt-connection/src/IAbapRequestOptions.ts` gains
`noLog?: true | undefined` and `noResend?: true | undefined`, each with a doc comment stating what
it gates (spec §3.4). Test: new `packages/interfaces-adt-connection/src/__typechecks__/requestFlags.ts`:
`{ noLog: true }` and `{ noResend: true }` compile; `noLog: false` and `noResend: 'yes'` are
`@ts-expect-error`; an options object without them still compiles (`wireDefaults.ts` untouched).
Red first: the file fails `test:check` before the fields exist. Run at the repo root:
`npm run build && npm run test:check && npm run check:surface` → green. CHANGELOG entry
(`packages/interfaces-adt-connection/CHANGELOG.md`, 5.2.0, dated).

**T1.2 Review and release prep.** Whole-PR review; `npm run check` green; gate G1.

## P2 — interfaces-adt

**T2.1 abapGit contracts** in `packages/interfaces-adt/src/adt/IAdtAbapGit.ts`:

- `IAbapGitCredentials { readonly user: string; readonly password: string }`.
- `IAbapGitMemberOptions<E> = IAdtAnalyseOptions<E> & { credentials?: IAbapGitCredentials }`.
- Argument types, one per new member: `IAbapGitRepoKeyArgs { key }`, `IAbapGitPullRepoArgs { key;
  branchName; transportRequest?; selection?: IAbapGitPullSelection }`, `IAbapGitPullSelection {
  overwriteObjects; packageWarningObjects }` (entries typed as R6's reading),
  `IAbapGitRunLogArgs { key; appLogKey }`, `IAbapGitStagedObject` (wbkey, version, uri, type, name,
  packageName, files[] { name, path, localState, remoteState }), `IAbapGitCommit { text; author: {
  name; email }; committer: { name; email } }` (all required), `IAbapGitPushArgs { key; staged;
  comment }`, `IAbapGitFileArgs { key; filename; version: 'local' | 'remote' }`,
  `IAbapGitBranchInfoArgs { url; branch; package }`, `IAbapGitSwitchBranchArgs { key; branch;
  create: boolean }`; `IAbapGitLinkArgs` gains `folderLogic?`.
- Credentials in one form only: the deprecated `remoteUser`/`remotePassword` and `credentials` as a
  discriminated union, so giving both is a type error.
- New members as atom interfaces, one per member (`IAdtAbapGitPullRepo<T>`, `IAdtAbapGitStaging<T>`,
  `IAdtAbapGitPush<T>`, … `IAdtAbapGitSwitchBranch<T>`), with the signatures of spec §3.2;
  `IAdtAbapGitClient<…>` is left as it is, so an existing implementer keeps compiling (minor).

Tests (red first: missing exports): `src/__typechecks__/abapGit.ts` extended — both credential
forms at once `@ts-expect-error`; `push` without `comment.committer` `@ts-expect-error`;
`switchBranch` without `create` `@ts-expect-error`; `getFile` with `version: 'head'`
`@ts-expect-error`; an existing four-parameter `IAdtAbapGitClient` implementer compiles unchanged
(`downstreamStillCompiles.ts`). Mutation: make `create` optional → the switch case goes red. Run:
`npm run build && npm run test:check && npm run check:surface && npm run check:graph` → green.
CHANGELOG 30.2.0.

**T2.2 Review and release prep.** Whole-PR review; `npm run check`; gate G2.

## P3 — connection

Depends on interfaces-adt-connection 5.2.0 from the registry.

**T3.1 `noResend`.** `src/connection/AbstractAbapConnection.ts`: the CSRF recovery
(`shouldRetryCsrf` and its resend), the resend after credential renewal (`answerCredentialFailure`)
skip their replay when `noResend`; the initial CSRF fetch before a mutation stays.
`src/connection/HttpTransport.ts` `sendPooled`: no resend on a fresh socket with `noResend`.
Tests, new `src/__tests__/noResend.test.ts`: a 500 whose body holds `CSRF token` and a 403
`CSRF token validation failed` are each sent once with `noResend` and twice without; a 401 to a
mutation without a token: once with, resent without; a renewal answer: no resend with; and in
`pooledResend.test.ts` a dead pooled socket: one send with `noResend`, the resend without. Red
first: the stub counts two sends. Mutation per gate (remove each of the three checks) turns its
case red.

**T3.2 `noLog`.** The refusal preview (`dataPreview` into `errorDetails` and its `error`/`debug`
line), the RFC status-text line and its `logWire` body (`RfcTransport.ts`), and both wire loggers
write, with `noLog`, at most method, path without query, integer status and byte count. The thrown
error keeps its fields for the caller. Tests, new `src/__tests__/noLog.test.ts`, over HTTP and RFC
stubs whose answer carries a canary in body, header and status text: no logger call holds the
canary or any header value; a line, if any, has exactly those four facts; the thrown error still
carries status and body. Mutation: drop the check in one logger → its case goes red.

**T3.3 Docs.** `CHANGELOG.md` 25.1.0 with both options and the CSRF ground of spec §4.7 (SAP checks
CSRF before any resource handler; the connector's own resend is wider); `README.md` request-options
section. Run: `npm run build && npm run lint:check && npm run test:ci && npm run test:shape` → green.

**T3.4 Review and release prep.** Whole-PR review; `prepublishOnly` chain green; gate G3.

## P4 — adt-strategies

Depends on interfaces-adt 30.2.0 and interfaces-adt-connection 5.2.0 from the registry.

**T4.1 Readings** in `src/results/abapGit.ts`, exported from `src/index.ts`: `abapGitStaging`,
`abapGitModifiedObjects`, `abapGitBranchInfo`, `abapGitObjectResults`, each every field SAP sends;
`abapGitRepos` gains `status`, `statusText`, `folderLogic`, the e-mail fields, every link with its
`rel`, and `appLogKey` parsed from the `log_link`/`status_link` path. Tests in
`src/__tests__/abapGitReadings.test.ts` over sanitised captured documents (fixtures named by route,
SAPUSER01 / placeholder names): field by field per reading; cloud `sha` and onprem `sha1` both read
into `sha1`; onprem R1 without status reads `status: undefined` (key present). Red first: readers
missing.

**T4.2 Facts reading `abapGitFacts`** (spec §5.3): one reading per route keeping only the table's
fields, and the error facts `{ status, messageClass?, messageNumber?, gitHttpStatus? }` from
`T100KEY-ID` / `T100KEY-NO` / `http_status`. New `src/__tests__/abapGitFacts.test.ts`: per route the
result's keys are exactly the kept list (deep key-set equality); **canaries** for user, raw token and
base64 password placed in every dropped place (body text, `msgText`, `actionDescription`,
`displayName`, links, `@comment`, exception text, `T100KEY-V1…V4`, `LONGTEXT`) appear nowhere in the
serialised result; a canary in a kept field (name, path, file content) passes through as data.
Mutation: keep `msgText` → red; drop `messageNumber` → red. Run in `packages/adt-strategies`:
`npm test` and at the root `npm run build && npm run test:check && npm run lint:check` → green.
CHANGELOG 0.27.0.

**T4.3 Review and release prep.** Whole-PR review; root `npm run check`; gate G4.

## P5 — adt-clients

Depends on interfaces-adt 30.2.0, interfaces-adt-connection 5.2.0, adt-strategies 0.27.0 from the
registry. Files under `packages/adt-clients/src/clients/abapGit/` (one file per member) and
`src/clients/AdtAbapGitClient.ts`; result slots in `src/clients/abapGit/types.ts`
(`IAbapGitResults`, new slots optional).

**T5.1 Key path builder and the link wrappers.** `abapGit/paths.ts`: `repoPath(key, ...segments)`
(URL-encoded segments). `getErrorLog(logLink)` accepts only exactly
`/sap/bc/adt/abapgit/repos/{key}/log/{id}` and `pull({ pullLink })` only
`/sap/bc/adt/abapgit/repos/{key}/pull`; anything else is refused in fixed words, nothing sent. Unit
test `src/__tests__/unit/clients/abapGit/paths.test.ts`: a key with `/`, `?`, `#` is encoded; an
absolute URL, foreign host, query, fragment, `..`, empty segment and a different path each refused
with zero requests (recording connection). Red first: today's `getErrorLog` sends the absolute URL.
Mutation: accept a scheme → red.

**T5.2 Credentials on the wire and the R13 defect.** `xmlBuilder.ts`: `credentials` (and the
deprecated fields) written exactly where spec §3.1 says — R2/R4/R5 `abapgitrepo:remoteUser` /
`remotePassword`, `pull.req.v1` `abapgitpullrequest:user` / `password`, R13/R14
`abapgitexternalrepo:user` / `password` (the fix), R6/R9–R12/R15 headers `Username` and `Password`
(base64). Unit test `src/__tests__/unit/clients/abapGit/credentialWire.test.ts`: per member the
exact elements/headers carry the values; the values occur in no other header, element, URL, query,
result or `IAdtError` (`method`, `url`). Red first: R13 writes `remoteUser`. Mutation: write the
password also into R13's `remotePassword` → red.

**T5.3 New members** (spec §3.2): `pullRepo`, `pullRepoInDialog`, `getModifiedObjects`, `getStatus`,
`getRunLog`, `getStaging`, `push`, `checkRepo`, `getFile`, `getBranchInfo`, `switchBranch`; `link`
gains `folderLogic`; `link.branchName` default kept, deprecated. Unit test
`src/__tests__/unit/clients/abapGit/members.test.ts`, one case per member: method, path from `key`,
query (`?create=true` only when true; `filename`, `version`), Content-Type and Accept (R6's exact
Accept; R7 sends Content-Type `…repos.v2+xml`), body document (R10's `abapgitstaging` built from
`staged` and `comment`), `timeout: 0`, session type stateless — also on the request after a failed
one. Type test `src/__tests__/typechecks/abapGitResults46.ts`: a 46.x-shaped `results` object
compiles unchanged and a member without its slot answers `abapGitDocuments`' default. Header pairs
for the new routes in `src/__tests__/unit/requestHeaders.test.ts`.

**T5.4 Flags and the structured precedence.** Every write (R2, R3, R4, R5, R10, R14, R15), every
member called with `credentials`, and `getRunLog`/`getErrorLog` send `noLog: true, noResend: true`;
for credentialed members and the run log the shipped default result is `abapGitFacts` and the error
carries status and T100 key only. Unit test `src/__tests__/unit/clients/abapGit/flags.test.ts`: the
recorded options per member (table-driven over the member list, so a new member without flags
fails); a 500 whose body holds a canary and `CSRF token`: thrown error and result carry no canary.
Mutation: drop `noResend` on `push` → red.

**T5.5 Docs.** `docs/usage/ERRATA.md` entries of spec §3.3, each with its Code ground;
`README.md` and `docs/usage/CLIENT_API_REFERENCE.md` (members, credentials, flags); the
`AdtAbapGitClient` paragraph of `CLAUDE.md` is the controller's, with owner approval; `CHANGELOG.md`
46.2.0 with the `checkExternalRepo` defect. Run: `npm run build && npm run lint:check && npm run
test:check && npm run test:unit` → green.

**T5.6 Live (controller runs).** `src/__tests__/helpers/test-config.yaml.template` `abapgit` cases
extended, one per member with `available_in` by route; helper `src/__tests__/helpers/abapGitRemote.ts`
reads `~/.config/mcp-abap-adt/sessions/abapgit-live.env` (`ABAPGIT_REPO_URL`, `ABAPGIT_USER`,
`ABAPGIT_TOKEN`; the token is never printed or logged) and makes the run's two object-empty
branches through GitHub's Git Data API, deleting them at the end. Files:

- `src/__tests__/integration/clients/abapGit/AbapGit.test.ts` — on onprem and cloud, per member on
  the system that serves it: link on the run's branch, R1 lists key/package/URL/branch; staging,
  push, `getFile` remote holds the file; remote change, `pullRepo` (cloud: wait on new log key +
  terminal status), source changed; cloud `pullRepoInDialog`, `getModifiedObjects`, `getRunLog`,
  `getBranchInfo`; onprem `switchBranch` there and back; `checkRepo` and `switchBranch` statuses
  logged, not asserted; **T100 fields:** one SAP error per system (pull of an unknown key) carries
  `messageClass` and `messageNumber`; cleanup and the recovery ledger (gitignored, beside the test
  config). Skips with its reason without the env file, without the branch scope, or on a system
  without `/abapgit/repos` in discovery.
- `src/__tests__/integration/clients/abapGit/AbapGitRedirect.test.ts` — **release gate**, on onprem
  and cloud: credentialed `checkExternalRepo` against a remote that redirects (a) to another host,
  (b) to another path on the same host; asserts whether the credential reached the redirect target.
  Needs, not in the code: one redirecting remote per case, provided by the owner; without them it
  skips with that reason and the gate stays closed. The result per backend goes into ERRATA and
  decides T6.3's per-backend refusal.

Run: `npm test -- integration/clients/abapGit 2>&1 | tee test-run.log` (or `npm run test:detached`).

**T5.7 Review and release prep.** Whole-PR review; root `npm run check`; gate G5.

## P6 — server (this repo, PR #374)

Handlers under `src/handlers/abapgit/{readonly,high}/handle<Tool>.ts`; group
`src/lib/handlers/groups/AbapGitHandlersGroup.ts`; compact `src/lib/compact/abapGit/{group.ts,
handleHandlerAbapGitGet.ts, handleHandlerAbapGit.ts}`; shared logic under `src/lib/abapGit/`. Unit
tests under `src/__tests__/unit/abapGit/`. Run per task: `npm test -- <test path>`, then
`npm test`, `npm run test:check`, `npm run lint:check` → green.

**T6.1 Dependencies from the registry.** `package.json`: interfaces-adt-connection ^5.2.0,
interfaces-adt ^30.2.0, connection ^25.1.0, adt-strategies ^0.27.0, adt-clients ^46.2.0;
`npm install --ignore-scripts`; lockfile has no `"link": true` and every entry `resolved` from the
registry. `npm run build && npm test` green before any new code.

**T6.2 Availability.** `src/lib/abapGit/availability.ts`: `abapGitServed(connection): Promise<boolean>`
reads `GET /sap/bc/adt/discovery` on the request's connection, cached by `adtSystemKey`, dropped by
`registerConnectionResetHook`; a failed read is not cached. The `tools/list` hook installed after
`BaseMcpServer.registerHandlers` filters the abapGit tools (full) / `HandlerAbapGitGet`,
`HandlerAbapGit` (compact); every abapGit call checks first ("abapGit is not served by this system",
nothing else sent). §9.1 (a): stdio `--deferred-logon` lists none until the logon, then sends
`notifications/tools/list_changed`. Tests `availability.test.ts`: listed with discovery, absent
without, absent on a failed read and read again next time, cache key is the system key (two
`state_handle`s on one system: one read; two systems: two), reset hook drops it, per transport
(stdio, SSE, Streamable HTTP under `runWithRequestContext`), call refusal with zero further
requests, deferred-logon notification sent once. Mutation: cache a failed read → red.

**T6.3 Approved endpoints.** `src/lib/abapGit/approvedEndpoints.ts`:
`parseApprovedEndpoints(config)` (start error for userinfo, query, fragment, non-https),
`matchEndpoint(url, endpoints): { sendUrl; credentials } | undefined`; sources: stdio file beside the
session `.env` (location in `CLI_OPTIONS.md`), Streamable HTTP per-call headers, SSE opening-GET
headers held by the instance; the per-backend refusal table `credentialGate.ts` whose values come
from T5.6's measurement. Tests `approvedEndpoints.test.ts`: exact match; alias sends the configured
URL; `.git`, trailing `/`, port, host case and path case near-misses (host lower-cased, path exact);
no match sent anonymously (§9.3 a); userinfo/query/fragment in an argument refused before sending;
key-addressed calls take R1's URL, an argument URL ignored; SSE headers dropped with the stream.
Mutation: strip a trailing `/` → red.

**T6.4 Access checks.** `src/lib/access/abapGitAccessChecks.ts`, called from `accessChecks.ts`
before foreground or background dispatch and before any credential is resolved: the R1 pre-read
(the constraint's exact request) for every key-addressed write, credential-bound call and run-log
read; `abapgit_import_not_allowed` for link and pull under any restriction; package checks per spec
§4.3 table; fail-closed refusals; the run-log pairing (R1's `log_link` must carry `app_log_key`);
batch refusal `batch_not_recordable` with no entry taken. Tests `abapGitAccess.test.ts`: link and
pull refused under `allowed-packages` and under `allowed-requests`, zero requests; served with none;
push/unlink/switch checked against R1's package, the branch-info `package_name`; unknown key, blank
package, blank URL, unreadable R1 each refused; the pre-read is one stateless request with no
credential and `noLog`; order: refusal before any background run starts; a foreign `app_log_key`
refused; batch refusal for every tool and action. Mutation: run the check after dispatch → red.

**T6.5 Full tools** (spec §4.1, 13 tools, `available_in` per row, `-ro` membership per row):
handlers over `AdtAbapGitClient`, arguments in snake_case, no credential argument, functional
descriptions; `ListAbapGitRepos` with §9.2 (a) filters. Tests `abapGitTools.test.ts`: schemas per
variant, `-ro` set contents, deny entries, each handler's request through a recording connection,
answers as the reading's JSON; `toolDescriptionsCarryNoLiterals.test.ts` stays green; the listed
fixtures regenerated by their writers.

**T6.6 Compact** (spec §4.2): `HandlerAbapGitGet` (compact and compact `-ro`) and `HandlerAbapGit`
(compact only), top-level arguments of the full tool, enums per variant, each action deniable
(`HandlerAbapGit.push`). Tests `abapGitCompact.test.ts`: enum per variant holds only what that kind
serves; every action reaches the full handler's path; `compactSchemaCompleteness.test.ts` and
`compactCoversLow.test.ts` updated and green. Mutation: add `switch_branch` to the cloud enum → red.

**T6.7 Background.** `BACKGROUND_TOOLS` (`src/lib/backgroundRuns/tools.ts`) gains onprem
`LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo` and `HandlerAbapGit` (link, pull, push
only); cloud schemas declare none. Tests: the source test keeps schemas and the list equal;
`background` on another action refused; `background: true` without a store or fresh connection
refused, never run in the foreground; the run record holds tool, object and start only.

**T6.8 Structure and facts at the server.** Credentialed calls and R8 answer only §5.3's fields;
`withHttpWireLog` (`src/lib/connectionFactory.ts`) honours `noLog`; R10's comment is in no log line
and no run record. Tests `abapGitCanaries.test.ts` over HTTP and RFC stubs: user, raw token and
base64 password echoed in every dropped place; answer, error, run record and every log line hold
the kept fields only and none of the values; a canary in a kept field passes through. Mutation: log
the request body in `withHttpWireLog` → red.

**T6.9 Live (controller runs)**, each in a `liveSuite` naming where it runs, skipped with its reason
elsewhere (no `abapgit-live.env`, no branch scope, discovery without `/abapgit/repos`); helper
`src/__tests__/integration/helpers/abapGitRemote.ts` (as T5.6), ledger gitignored beside
`tests/test-config.yaml`, run-owned package and objects per spec §7:

- `src/__tests__/integration/coverage/abapGit.live.test.ts` — onprem and cloud, full tools, spec §7
  flow steps 1–8 with the cloud wait and the recovery ledger; step 7 under a configured
  allowed-packages entry: link and pull refused with zero requests, push/unlink/switch checked; T100
  `messageClass`/`messageNumber` on one SAP error per system.
- `src/__tests__/integration/coverage/abapGitCompact.live.test.ts` — onprem and cloud, every action
  of both compact tools once on its system.
- `src/__tests__/integration/coverage/abapGitListing.live.test.ts` — onprem and cloud: `tools/list`
  lists the abapGit tools; a `-ro` binary lists exactly the read set.

Run one file at a time: `npm run test:integration -- src/__tests__/integration/coverage/<file> 2>&1 | tee <log>`.

**T6.10 Docs.** README first screen ("Primary workflows", "Why teams use it") names the git loop
and the Features list gains an abapGit section (per system, approved endpoints, long runs, what an
import writes, link/pull refusal); `docs/README.md` and `docs/user-guide/README.md` indexes;
`npm run docs:tools` regenerates `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`,
`AVAILABLE_TOOLS_HIGH.md`, and `compact/tools/generate-docs.js` regenerates
`compact/docs/AVAILABLE_TOOLS.md`; `ACCESS_RESTRICTIONS.md`: the import refusal with spec §4.3's SAP
code grounds (child tasks included), arguments per tool, the R1 pre-read exception and fail-closed
cases, both compact tools' deny values; `AUTHENTICATION.md` and `CLI_OPTIONS.md`: approved
endpoints per transport; `CHANGELOG.md` 24.2.0 highlights naming the five dependency minors;
`package.json` and every `server*.json` description mention abapGit. Each package's own CHANGELOG
entry is in its own PR (T1.1, T2.1, T3.3, T4.2, T5.5).

**T6.11 Whole-branch review** of #374 (every review of P1–P5 likewise closes its own PR).

**T6.12 Delete the goal, spec and plan** from `docs/superpowers/` once implemented, before the
release; what they still owe goes into #374's description first.

**T6.13 Release.** After #374 merges into `main`, the 24.2.0 release PR #371 merges `main`; the
release gate (redirect measurement on both backends, T5.6) is green or its backend's credentialed
calls are refused (T6.3).

## Review Focus

| Failure mode most likely to bite | Pinned by |
|---|---|
| A credential leaks through a resend, a wire log or an echoed SAP text on one path or member | T3.1, T3.2, T5.4, T6.8 |
| Link or pull reaches SAP under restrictions, or a key check runs after dispatch or after a background run started | T6.4 |
| A credential is attached to a near-miss URL, or a key-addressed call trusts an argument URL | T6.3 |
| abapGit is listed or callable on a system whose discovery lacks it, or a failed discovery is cached | T6.2 |
| `getErrorLog`/`pull` still send an absolute or foreign link | T5.1 |

# abapGit — plan

Implements [the spec](2026-11-21-abapgit-spec.md) (approved) for [the goal](2026-11-21-abapgit-goal.md).
Steps, not code: each task names its files, interfaces, tests (with the first failure each shows)
and what to run. Code is written at implementation, test-first; every rule a test protects is proved
load-bearing by the named mutation (break it, watch the test go red, revert).

**§9 open decisions — the spec's recommendation is taken; the owner may overrule each:**

- §9.1 stdio `--deferred-logon`: superseded by the owner's decision (2026-11-23): the abapGit
  tools are always listed, with no SAP request, and availability is decided at call time; no
  `list_changed`.
- §9.2 "read one repository": (a) `package_name` / `repository_key` filters on `ListAbapGitRepos`,
  a result strategy over the one R1 answer.
- §9.3 no approved endpoint matches: (a) sent without credentials.
- §9.4 onprem long writes: (b) opt-in `background: true` as a code run.

## Global Constraints (verbatim from the spec)

- "No retry, no timeout (`timeout: 0`), no lenient reading, no polling."
- "Every member addressed by a repository builds its path from `key` (URL-encoded segment); no
  member takes a URL to send to, except the existing `pull`/`getErrorLog`."
- "No credential is part of a result, an `IAdtError`, or the request an error describes (`method`,
  `url`)."
- "adt-clients sends both flags on **every new-form write** (R2, R4, R5, R10, R14, R15), on every new
  form called with or without a credential, and on `getRunLog` — never on a legacy form of §3, which
  keeps today's options, and never on the existing `unlink` (R3), which keeps today's behaviour"
- "**`stateless: true`** — the request goes stateless on HTTP and RFC whatever the connection's
  session mode (§2.5); sent on every new form."
- Legacy forms: as spec §3 ("Legacy forms unchanged"); result slots: as spec §3.2 ("new forms get
  new slot names", fallback `abapGitFacts` only); `IAbapGitRepo.status` keeps `''` (spec §3.2).
- "With `noLog`, a line, if any, carries method, the path without query, the integer status and
  the byte count."
- "`noResend: true` — gates every replay of the request; the initial CSRF token fetch before a
  mutation still happens."
- Batch: no abapGit-specific handling; the consumer decides what goes into a batch (owner,
  2026-11-22).
- "**While any `allowed-packages` or `allowed-requests` entry is configured, link and pull are
  refused on both systems** (full tools and compact actions), in fixed words
  (`abapgit_import_not_allowed`: "linking or pulling a repository writes objects that the allowed
  packages and requests cannot bound, so it is refused while access restrictions are
  configured"), nothing sent."
- R1 pre-read: "exactly one request (`listReposQuiet`): `GET /sap/bc/adt/abapgit/repos`, Accept
  `application/abapgit.adt.repos.v2+xml`, stateless, no credential, no wire log", "**before
  foreground or background dispatch** … and before any credential is resolved".
- "**Fail closed:** a key R1 does not list, an entry with a blank package or URL, or an unreadable
  R1 refuses the call in fixed words."
- Approved endpoint: "an exact remote URL — scheme (`https`), host (lower-cased), a non-default port
  when there is one, and path … No `.git` or trailing `/` is merged"; "when an alias matches, the
  **configured URL** is what SAP is sent"; key-addressed tools use "the `url` of the R1 entry for
  that key, read first — never a URL from the arguments." Credential headers: `x-abapgit-remote`,
  `x-abapgit-user`, `x-abapgit-token`.
- "Anything not named … is dropped **before** any log line, the tool answer and the background-run
  record" (spec §5.3's table is the kept-field list).
- Discovery: "cached **by the system that connection actually reaches** (`adtSystemKey`), never by
  `state_handle` or instance; kept for the process; no clock expires it." Refusal: "abapGit is not
  served by this system".
- "`background` is declared only on onprem `LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo`
  and, in compact, on the onprem variant of `HandlerAbapGit` (boolean, optional, **no default**)";
  "**`background: true` is refused, never run in the foreground**" when it cannot run.
- Cloud wait: "poll R1 until the entry shows a **new** log key **and** a terminal `status` (`S`,
  `W`, `E`, `A`); blank (initial) and `R` mean waiting."

Every package: no retries, no timeouts; static types first; availability from the system;
functional tool descriptions; compact keeps a minimal tool count; access checks before anything is
sent; no redactor, only structure and facts; every handler pinned by unit tests and live tests on
both systems; a live test states where it runs and skips with a reason elsewhere.

## Release order, dependencies and gates

One PR per package in its repository, holding all of that package's tasks — except P4 and P5,
which are **one PR** in mcp-abap-adt-clients with **one joint gate** G5 (owner's ruling).
**Lesson (a note, not a redo):** packages of one repository that do not depend on each other's new
API ship in one PR and one publish run; P1 and P2 could have done so (both are already published).

| # | Package (repo, directory) | Version |
|---|---|---|
| P1 | `@mcp-abap-adt/interfaces-adt-connection` (`~/prj/mcp-abap-adt-interfaces`, `packages/interfaces-adt-connection`) | 5.1.0 → 5.2.0 |
| **G1** | **owner publishes interfaces-adt-connection 5.2.0** | |
| P2 | `@mcp-abap-adt/interfaces-adt` (same repo, `packages/interfaces-adt`) | 30.1.1 → 30.2.0 |
| **G2** | **owner publishes interfaces-adt 30.2.0** | |
| P3 | `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`) | 25.0.1 → 25.1.0 |
| **G3** | **owner publishes connection 25.1.0** | |
| P4 | `@mcp-abap-adt/adt-strategies` (`~/prj/mcp-abap-adt-clients`, `packages/adt-strategies`) | 0.26.0 → 0.27.0 |
| P5 | `@mcp-abap-adt/adt-clients` (same repo and **same PR** as P4, `packages/adt-clients`) | 46.1.0 → 46.2.0 |
| **G5** | **joint gate: the owner publishes both tested tarballs, adt-strategies then adt-clients** (T5.7) | |
| P6 | server, this repo, PR #374; ships in 24.2.0 (#371) | |

**Raise floors after each gate** — the first task of every later package that uses the new API:
raise the range, let npm regenerate the lockfile (`npm install --ignore-scripts`, never a hand
edit), fix what changed, build, test, then publish. `^0.26.0` does not accept `0.27.0` (0.x caret):
that floor is raised explicitly. After each step: no `"link": true` in the lockfile except
same-repository siblings (the owner's standing exception for mcp-abap-adt-clients' workspaces), and
every range resolves on the registry (`npm view <name>@<range> version`). Before tagging, no link is
in what is released, the sibling is published first, and a clean install from the registry outside
the repo installs.

| After | Package | Raises | Ground |
|---|---|---|---|
| G1 | interfaces-adt (T2.0) | nothing | its new types reference no new -connection type (`IAdtError`, `AdtNoFailure`, `IAdtHeaders` are its own); `^5.0.0` stays |
| G1 | connection (T3.0) | interfaces-adt-connection `^5.2.0` | implements `noLog`, `noResend`, `stateless` |
| G2 | adt-strategies (T4.0) | interfaces-adt `^30.2.0` | `IAbapGitFactsResponse`, `IAbapGitStructuredError` |
| G2, G3 (the P4/P5 PR waits for G3) | adt-clients (T5.0) | interfaces-adt `^30.2.0`, -connection `^5.2.0` (registry), adt-strategies `^0.27.0` in runtime `dependencies` (the sibling link during development), connection `^25.1.0` (dev) | the atoms, the flags, `abapGitFacts` at runtime, the live wire |
| G5 | server, root `package.json` `@mcp-abap-adt/lib` (T6.1) | all five: -connection `^5.2.0`, -adt `^30.2.0`, connection `^25.1.0`, adt-strategies `^0.27.0`, adt-clients `^46.2.0` | every new form |
| the P4/P5 PR | adt-clients-legacy | dev `adt-strategies ^0.26.0` → `^0.27.0`, no version bump, no publish | its dev range excludes 0.27.0 once the sibling is there; peer `adt-clients ^46.1.0` and interfaces-adt `^30.1.0` already accept the new minors and it uses no new API, so `release:publish` (versions not on the registry only) skips it; its tests run green in the PR |

**Gates per backend.** Four live gates, each recorded on its own at G5 and again at the release:
functional onprem, functional cloud, T100 onprem, T100 cloud (adt-clients' run at G5, the server's
at the release, each log kept with its exit status). A gate closes only on an executed, passing
assertion on that backend; **a skip leaves it open**, and an open gate blocks as a failure does.
**What blocks publishing** (G5) and the release: a red unit, type or build check, or any gate open
or failed.

**Live commands.** Run from the package directory, one backend per run, the exit status kept:
`bash -o pipefail -c '<command> 2>&1 | tee <log>'`. adt-clients: `MCP_ENV_PATH=~/.config/mcp-abap-adt/sessions/<onprem|cloud>.env
MCP_TEST_OVERLAY=<onprem|cloud> ABAPGIT_CLIENT_UNDER_TEST=<isolated install> npm test --
integration/clients/abapGit`. Server: `npm run test:coverage-family -- --env
MCP_TEST_CONFIG=tests/test-config.<onprem|cloud>.yaml src/__tests__/integration/coverage/<file>`.

## P1 — interfaces-adt-connection

**T1.1 Request flags.** `packages/interfaces-adt-connection/src/IAbapRequestOptions.ts` gains
`noLog?: true | undefined`, `noResend?: true | undefined`, `stateless?: true | undefined`, doc
comments naming what each gates (spec §3.4). Test `src/__typechecks__/requestFlags.ts`: each `true`
compiles; `false` and `'yes'` are `@ts-expect-error`; `wireDefaults.ts` compiles unchanged. First
failure: unknown properties. Mutation: widen one to `boolean` → its `false` case red. Run in the
package: `npm run build && npm run test:check`; at the root `npm run check:surface` → green.
CHANGELOG 5.2.0, dated.

**T1.2 Review and release prep.** Whole-PR review; root `npm run check`; gate G1.

## P2 — interfaces-adt (a provable minor)

**T2.0 Floors.** None (table above); `npm ls` shows -connection from the registry.

**T2.1 Contracts in `packages/interfaces-adt/src/adt/IAdtAbapGit.ts`, exported from `src/index.ts`.**
Every existing exported interface and overload stays as it is (`IAbapGitLinkArgs`, `IAbapGitPullArgs`
with its optional `branchName`, `IAbapGitUnlinkArgs`, `IAbapGitExternalRepoCredentials`, both
overloads of every `IAdtAbapGitClient` member), with one additive change: the options parameter of
each legacy overload of `link`, `pull` and `checkExternalRepo` inside `IAdtAbapGitClient` is
intersected with `{ readonly credentials?: never }` (that is where it lives). New exports:

- `IAbapGitCredentials { readonly user: string; readonly password: string }`.
- Facts exchange: `IAbapGitFactsResponse<F> { status: number; facts: F }`; `IAbapGitErrorFacts {
  status; messageClass?; messageNumber?; gitHttpStatus? }`; `IAbapGitStructuredError extends
  IAdtError` with `facts: IAbapGitErrorFacts`, `response?: undefined`, `request?: { method; path }`,
  fixed `message`; `IAbapGitFactsResultStrategy<T, F> = (answer: IAbapGitFactsResponse<F>) => T`;
  `IAbapGitFactsAnalyse<F, E extends IAbapGitStructuredError = IAbapGitStructuredError> = (verdict:
  IAbapGitStructuredError | AdtNoFailure, answer?: IAbapGitFactsResponse<F>) => E | AdtNoFailure`.
- Options, not extending `IAdtAnalyseOptions`: `IAbapGitFactsOptions<F, E extends
  IAbapGitStructuredError = IAbapGitStructuredError> = { readonly analyse?: IAbapGitFactsAnalyse<F,
  E>; readonly credentials?: IAbapGitCredentials }`; `IAbapGitNewFormOptions<F, E> =
  Omit<IAbapGitFactsOptions<F, E>, 'credentials'> & { readonly credentials: IAbapGitCredentials |
  null }`; `IAbapGitHeaderOptions = { readonly headers: IAdtHeaders }` (required).
- Args: `IAbapGitRepoKeyArgs { key }`; `IAbapGitLinkNewArgs { package; url; branchName; transportRequest?;
  folderLogic?: 'FULL' | 'PREFIX'; remoteUser?: never; remotePassword?: never }`;
  `IAbapGitExternalRepoArgs { url; remoteUser?: never; remotePassword?: never }`;
  `IAbapGitPullRepoArgs { key; branchName; transportRequest?; selection?: IAbapGitPullSelection }`;
  `IAbapGitPullSelection { overwriteObjects; packageWarningObjects }` (R6's entries);
  `IAbapGitRunLogArgs { key; appLogKey }`; `IAbapGitStagedObject` with `files[]`; `IAbapGitCommit {
  text; author: { name; email }; committer: { name; email } }` (all required); `IAbapGitPushArgs {
  key; staged; comment }`; `IAbapGitFileArgs { key; filename; version: 'local' | 'remote' }`;
  `IAbapGitBranchInfoArgs { url; branch; package }`; `IAbapGitSwitchBranchArgs { key; branch;
  create: boolean }`.
- **Atoms**, one exported interface each, generic over its slot's result `T` **and** its route's
  facts `F` separately (the analyser gets the reducer's `F`, the caller the reader's `T`), each with
  exactly two facts-typed overloads and no wire-typed one: `<E extends IAbapGitStructuredError>(args,
  options: O<F, E> & { analyse: IAbapGitFactsAnalyse<F, E> }): Promise<IAdtResponse<T, E>>` and
  `(args, options?: O<F>): Promise<IAdtResponse<T, IAbapGitStructuredError>>` (the default keeps
  `.facts`). The table's atoms read `IAdtAbapGit…<T, F>`.
  `O` is `IAbapGitFactsOptions`, or `IAbapGitHeaderOptions & IAbapGitFactsOptions` with `options`
  required on the H members, or `IAbapGitHeaderOptions & IAbapGitNewFormOptions` (required) on the
  new forms:

  | Atom | Member | Args | O |
  |---|---|---|---|
  | `IAdtAbapGitListReposQuiet<T>` | `listReposQuiet` | — | facts |
  | `IAdtAbapGitLinkNewForm<T>` | `link` | `IAbapGitLinkNewArgs` | headers + new form |
  | `IAdtAbapGitCheckExternalRepoNewForm<T>` | `checkExternalRepo` | `IAbapGitExternalRepoArgs` | headers + new form |
  | `IAdtAbapGitPullRepo<T>` | `pullRepo` | `IAbapGitPullRepoArgs` | headers (H) |
  | `IAdtAbapGitPullRepoInDialog<T>` | `pullRepoInDialog` | `IAbapGitPullRepoArgs` | headers (H) |
  | `IAdtAbapGitBranchInfo<T>` | `getBranchInfo` | `IAbapGitBranchInfoArgs` | headers (H) |
  | `IAdtAbapGitModifiedObjects<T>`, `…Status<T>`, `…Staging<T>`, `…CheckRepo<T>` | `getModifiedObjects`, `getStatus`, `getStaging`, `checkRepo` | `IAbapGitRepoKeyArgs` | facts |
  | `IAdtAbapGitRunLog<T>` | `getRunLog` | `IAbapGitRunLogArgs` | facts |
  | `IAdtAbapGitPush<T>`, `…File<T>`, `…SwitchBranch<T>` | `push`, `getFile`, `switchBranch` | their args | facts |

  `IAdtAbapGitClient<TRepos, TErrorLog, TPull, TExternalRepo>` keeps its members; legacy overloads
  gain `@deprecated` naming the replacement (`getRunLog`, the new form, `pullRepo`).
- **The minor's scope:** additions only, plus `credentials?: never` on the legacy options. Every call
  that compiled before compiles, with one stated exception (spec §3): an options variable carrying
  an undeclared `credentials` property is now rejected, or selects the new form when its value is a
  credential or `null`.

Tests, all importing through the package barrel `@mcp-abap-adt/interfaces-adt` (first failure:
missing exports): `src/__typechecks__/abapGitLegacyCalls.ts` — `getErrorLog` and the deprecated
forms of `link`, `pull`, `checkExternalRepo` with no callback, a verdict-only analyser, a
wire-reading analyser and a custom wire reader compile; a four-parameter `IAdtAbapGitClient`
implementer compiles; the exception is pinned (an options variable with an extra `credentials`
object against legacy args is `@ts-expect-error`). `src/__typechecks__/abapGit.ts` — error-subtype
inference through `getRunLog`, `pullRepo`, `push` and the new `link` (`getError()` typed with no
cast); the no-analyser overload keeps `getError().facts`; `@ts-expect-error` for: both forms mixed
(literal and variable), `credentials: undefined` on a new form, `credentials: null` on a legacy call,
an `IAnalyse` on any `pullRepo` call, an `IResultStrategy` as a facts reader, a missing `headers` on
an H member, `push` without `comment.committer`, `switchBranch` without `create`, `getFile` with
`version: 'head'`, `pullRepo` without `branchName`. Call-site mutations, each detected by the
negative test going unused (TS2578): add a wire-typed fallback overload to `IAdtAbapGitPullRepo` →
the `IAnalyse` case red; drop a `never` field → the mixed case red; drop `credentials?: never` from
a legacy overload → the exception case red. Run in the package: `npm run build && npm run
test:check`; root `npm run check:surface && npm run check:graph` → green. CHANGELOG 30.2.0: the new
types and atoms, the legacy members deprecated, `credentials?: never` and its one exception.

**T2.2 Review and release prep.** Whole-PR review; root `npm run check`; gate G2.

## P3 — connection

**T3.0 Floors.** interfaces-adt-connection `^5.2.0`; lockfile regenerated and checked; build and
test green before new code.

**T3.1 `noResend`.** `src/connection/AbstractAbapConnection.ts`: no replay in the CSRF recovery
(`shouldRetryCsrf` and its resend) or `answerCredentialFailure`; `src/connection/HttpTransport.ts`
`sendPooled`: no fresh-socket resend. **SAP-endpoint redirects, part of `noResend`:** the request
goes with `maxRedirects: 0` (not a gate on git hosts), and since `dispatch` forwards a status
predicate only when one is supplied while Axios accepts only 2xx by default (`HttpTransport.ts`
`dispatch`, the `validateStatus` spread near L1412), the `noResend` request also sets
`validateStatus` to accept `2xx` and `3xx`, so the `3xx` resolves as the caller's answer while every
other status keeps today's rejection. Tests `src/__tests__/noResend.test.ts`, `pooledResend.test.ts`:
a mutation with `noResend` runs exactly one CSRF fetch and one send; a `500` holding `CSRF token`, a
`403` `CSRF token validation failed`, a `401` to a mutation without a token: once with, resent once
without; a renewal answer: no resend with; a dead pooled socket: one send with, the resend without;
**a resolved `307` through the shipped HTTP adapter** (a local socket, not a stub): one send, the
`307` returned; an ordinary `404` still rejected. First failure: two sends, or a followed or rejected
`307`. Mutations: remove each gate → its case red; drop the `validateStatus` → the `307` case red.

**T3.2 `noLog`.** Every path writes at most method, path without query, integer status and byte
count. `src/__tests__/noLog.test.ts`, one case per path: ordinary request-URL lines (HTTP, RFC); the
RFC outbound URI, headers and body under `logWire`; the HTTP wire logger; the refusal preview at
`error`, the `404` `debug` line, every other refusal branch; the RFC status-text line and body.
Request-side canaries (query, header, body) and answer-side ones (body, header, status text): no
line holds a canary or a `?`; each line has exactly the four facts; the thrown error keeps status and
body. First failure: the preview holds the body canary. Mutation: drop the check per path → red.

**T3.3 `stateless`.** The request's `stateless: true` sets `stateful: false` for that request in
`AbstractAbapConnection` (where the request config takes `stateful` from `sessionMode`, ~L1536),
without changing the session mode, and wins in the shared verdict: `isStatefulRequest`
(`src/connection/statefulRequest.ts`) answers false for a `stateless` request whatever its headers;
HTTP (`HttpTransport.ts`, where caller headers are spread and the context cookie kept, ~L919) and RFC
(`RfcTransport.ts` ~L638) strip a conflicting `x-sap-adt-sessiontype` header in any letter case and
the session's context cookie from that request. Test `src/__tests__/statelessRequest.test.ts`, HTTP
and RFC: from `setSessionType('stateful')` and with an explicit `X-Sap-Adt-SessionType: Stateful`
header, the request goes stateless (no session header, no context cookie on the wire) and the next
ordinary request is stateful again; after a refusal of a stateless request the next one is stateless
too. The RFC case is seeded with an explicit `sap-contextid` cookie and a mixed-case stateful header,
so the absence assertion exercises the filter before `HEADER_FIELDS` (`RfcTransport.ts` ~L638, ~L974).
First failure: the request goes stateful. Mutations: read the mode first → red; strip the header but
keep the cookie → red.

**T3.4 Docs.** `CHANGELOG.md` 25.1.0: the three options (`noResend` with SAP-endpoint redirects and
`validateStatus`), the CSRF ground of spec §4.7; `README.md` request options. Run in the repo:
`npm run build && npm run lint:check && npm run test:ci && npm run test:shape` → green.

**T3.5 Review and release prep.** Whole-PR review; `prepublishOnly` chain green; gate G3.

## P4 — adt-strategies

**T4.0 Floors.** interfaces-adt `^30.2.0` (interfaces-adt-connection stays `^5.0.0`: no new type
used); lockfile regenerated; build and test green before new code.

**T4.1 Readings** in `src/results/abapGit.ts`, exported from `src/index.ts`: `abapGitStaging`,
`abapGitModifiedObjects`, `abapGitBranchInfo`, `abapGitObjectResults`, every field SAP sends;
`abapGitRepos` gains `folderLogic`, the e-mail fields, every link with its `rel`, and keeps
`status` / `statusText` as `''` when absent; new `abapGitRepoRunStates` (`runStatus`, `statusText`,
`appLogKey` `undefined` when absent; `appLogKey` from `log_link` only). Tests
`src/__tests__/abapGitReadings.test.ts` over sanitised captured documents, field by field; `sha` and
`sha1` both into `sha1`; an absent-status fixture (onprem R1): `abapGitRepos` gives `status: ''`,
`abapGitRepoRunStates` gives `runStatus: undefined`; a `status_link` alone yields no `appLogKey`.
Type test `src/__tests__/typechecks/abapGitRepoContract.ts`: a downstream consumer of
`IAbapGitRepo.status: string` compiles unchanged. First failure: missing readers. Mutations: read
`sha` only → onprem case red; make `status` optional → type test red; take `appLogKey` from
`status_link` → red.

**T4.2 The reducer `abapGitFacts`** (spec §5.3, R1 row included): `abapGitFacts[route](wire):
IAbapGitFactsResponse<F>`; `abapGitErrorFacts(wire)` from `T100KEY-ID` / `T100KEY-NO` /
`http_status`. `src/__tests__/abapGitFacts.test.ts`: per route the key set equals the kept list;
canaries (user, raw token, base64 password) in every dropped place (body text, `msgText`,
`actionDescription`, `displayName`, links, `@comment`, exception text, `T100KEY-V1…V4`, `LONGTEXT`)
appear nowhere; a canary in a kept field passes as data. First failure: missing reducer. Mutations:
keep `msgText` → red; drop `messageNumber` or `gitHttpStatus` → red.

**T4.3 Docs.** `README.md` abapGit reader table (the new readings, `abapGitRepoRunStates`,
`abapGitFacts`); CHANGELOG 0.27.0. Run in the package: `npm test`; root `npm run build && npm run
test:check && npm run lint:check` → green.

**T4.4 Release prep.** None of its own: P4 ships with P5 (T5.7, joint gate G5).

## P5 — adt-clients

Files: one per member under `packages/adt-clients/src/clients/abapGit/`; `src/clients/AdtAbapGitClient.ts`;
slots in `src/clients/abapGit/types.ts`; entry `src/index.abapgit.ts` (`./abapgit`).

**T5.0 Floors, after G3.** Ranges as the floors table; adt-strategies `^0.27.0` moves to runtime
`dependencies` (`abapGitFacts` is imported at runtime) and resolves through the same-repo sibling
link during development (owner's standing exception); npm regenerates the lockfile; no other link.
Nothing here needs adt-strategies on the registry: the pair is proved from its tarballs (T5.7).

**T5.1 Key path builder and link wrappers.** `abapGit/paths.ts`: `repoPath(key, ...segments)` encodes
and validates each segment: empty, `.` and `..` are refused (axios would collapse `/repos/./pull`). The internal `pullRepo(connection, headers, args)`
in `pull.ts` (not exported) becomes `postPullLink`; the new member uses `postPullByKey`. `pull`
keeps its optional `branchName` and accepts only `/sap/bc/adt/abapgit/repos/{key}/pull`;
`getErrorLog` only `/sap/bc/adt/abapgit/repos/{key}/log/{id}`; both decode the segments, rebuild
through `repoPath`, and refuse anything else in fixed words with nothing sent; an accepted link
keeps today's request, callbacks and answer. Test `src/__tests__/unit/clients/abapGit/paths.test.ts`:
keys with `/`, `?`, `#` encoded; a valid encoded href (`…/repos/A%2FB/log/L1`) rebuilt keeps its
destination exactly; an absolute URL, foreign host, query, fragment, `..`, empty segment and another
path each refused with zero requests; **direct key calls** on the new members (`pullRepo`, `push`,
`getRunLog`, `switchBranch`, …) with a key or segment `''`, `.` or `..` refused with zero requests;
`pull` without `branchName` sends. First failure: today's
`getErrorLog` sends the absolute URL. Mutations: accept a scheme → red; skip the re-encoding → the
encoded-href case red.

**T5.2 Credentials on the wire.** `xmlBuilder.ts` writes the new form as spec §3.1 (R13/R14
`abapgitexternalrepo:user` / `password`); the deprecated `remoteUser` form keeps 46.1.0's fields
exactly. Test `credentialWire.test.ts`: per new form, the exact element or header carries the values
and no other header, element, URL, query, result or `IAdtError`; each legacy form's request equals
its 46.1.0 fixture; remote URLs of several hosts, no host parsed, no `.git` added. First failure: the
new R13 writes `remoteUser`. Mutations: also write `remotePassword` on the new R13 → red; switch the
legacy R13 to `user`/`password` → fixture case red.

**T5.3 New members and slots** (spec §3.2). Slots `reposFacts`, `linkedFacts`, `externalRepoFacts`,
`repoPulled`, `repoPulledInDialog`, `runLog`, `modifiedObjects`, `status`, `staging`, `pushed`,
`checked`, `file`, `branchInfo`, `switched`, each `?: IAbapGitFactsResultStrategy<…>`, falling back to
`abapGitFacts` only; legacy slots keep `abapGitDocuments`. **The 46.x class shape is kept:** the
class generic stays the result-values map `T extends AbapGitValues` (default
`ResultValuesOf<typeof abapGitDocuments>` plus the facts defaults' values); `AbapGitValues` gains the
new slots as optional keys; a new member's result is `FactsValue<T, slot>` — `T[slot]` when the map
has it, else the `abapGitFacts` default's value; the constructor keeps `(connection, { logger,
results })`, and `create` keeps its two overloads (the shipped one unchanged; the results one
returning `AdtAbapGitClient<AbapGitValuesOf<R>>`, below).
**Facts-aware mappings:** today `ResultStrategiesOf<T>` rejects a facts reader and `ResultValuesOf<R>`
maps one to `never` (`src/utils/resultStrategy.ts` ~L79; `AdtAbapGitClient.ts` ~L77), so the client uses
`AbapGitStrategiesOf<T>` and `AbapGitValuesOf<R>` (in `abapGit/types.ts`): per slot, a facts slot
(the new names) maps to `IAbapGitFactsResultStrategy<T[slot], F>` and back to its `T`; every legacy
slot maps exactly as `ResultStrategiesOf` / `ResultValuesOf` do (they are reused for those keys).
**Required, optional, omitted** are told apart by the key's optionality (`{} extends Pick<R, K>`),
not by `undefined` in its type, so the result is the same with `exactOptionalPropertyTypes` on and
off: a required override gives its result; an optional one gives its result `|` the default facts
value (it may be absent at run time, then the shipped facts answer); an omitted slot gives the
default facts value. The constructor's `results` is `AbapGitStrategiesOf<T>`; `create<R>` returns
`AdtAbapGitClient<AbapGitValuesOf<R>>`. Test `members.test.ts`, one case per member: method;
path from `key`; query (`?create=true` only when true; `filename`, `version`); Content-Type and
Accept (R6's exact Accept; R7 Content-Type `…repos.v2+xml`); body (R10's `abapgitstaging`); options
`timeout: 0`, `stateless: true`; and named cases: **R6's reading fed as `selection` to `pullRepo` and
`pullRepoInDialog` produces the `pull.req.v1` document with exactly its entries**; **cloud R4/R10
`202` = accepted, one request**; **R5 `202` = finished** (synchronous); onprem R4/R10 `200` =
finished; **strict non-2xx with no analyser** (a `404` and a `500` are each the error, a `2xx`
success); a **custom `reposFacts` reader returning a count** (its `T` differs from R1's facts `F`)
types the result as the count while its analyser still receives the facts; every legacy
member's request and answer equal its 46.1.0 fixture (no new flags). Type tests
`src/__tests__/typechecks/abapGitResultsFacts.ts`, compiled twice (`tsconfig.test.exact.json` with
`exactOptionalPropertyTypes`, and the plain test config): a required count reader infers `number`, an
optional one `number |` the default facts value, an omitted slot the default facts value — each
through `create` and through `new` with its values map; the 46.x explicit generic still compiles.
Mutation: map an optional slot to its reader's result alone → the optional case red; and
`src/__tests__/typechecks/abapGitResults46.ts` (46.x `results`, the `{ logger, results }`
constructor and the explicit `AdtAbapGitClient<ResultValuesOf<typeof results>>` of
`AbapGit.test.ts` compile, both constructor paths) and
`abapGitResultsNew.ts` (a facts slot types the member's result on both paths). **Published entry:**
`src/__tests__/unit/abapGitEntryPacked.test.ts` packs the package and type-checks an old consumer
(46.x `results`, the explicit values-map type argument, the `{ logger, results }` constructor,
legacy calls) and a new one (facts slots, new forms) against `./abapgit` from the tarball. First failure: members absent. Mutations: drop `packageWarningObjects` from the selection
document → red; treat R5 `202` as accepted → red; accept `4xx` without an analyser → red.

**T5.4 The facts exchange** (`src/clients/abapGit/structuredExchange.ts`).
`answeringFactsExchange<T, F, E extends IAbapGitStructuredError>(run, reduce: (wire) =>
IAbapGitFactsResponse<F>, read: IAbapGitFactsResultStrategy<T, F>, analyse?: IAbapGitFactsAnalyse<F,
E>)`
serves every new form, credentialed or anonymous (`credentials: null`); legacy forms untouched; it
never calls `answeringExchange`. An answer is reduced by `abapGitFacts[route]`, a thrown value by
`abapGitErrorFacts(error.response)` into a fresh `IAbapGitStructuredError`, before either callback.
Every new-form write, every new form and `getRunLog` send `noLog`, `noResend`, `stateless`; no legacy
form and not `unlink`. Test `structuredBoundary.test.ts`, its list the table of new forms, on an
answered and a thrown failure (canaries in `message` and `response`): a recording reader and
analyser hold no echoed canary; R11 keeps `gitHttpStatus`; options carry the three flags; `unlink`
sends none; **default log output** (no custom reader or analyser, the client's own logger) holds no
canary on the success and the throw path. Type probe `abapGitFactsExchange.ts`: a raw reader as a
facts slot is `@ts-expect-error`. First failure: the analyser gets `error.response`. Mutations: pass
the thrown response on → red; drop `noResend` on `push` → red; log `error.message` → the
default-log case red.

**T5.4a The batch invariant** (`src/batch/AdtBatchConnection.ts`, this PR). `makeAdtRequest`
refuses any request carrying `noLog` or `noResend` with a **synchronous throw**, before any queueing
or recording and never as a rejected promise (the server's `createRecorder`,
`src/lib/batch/recorder.ts` ~L208, numbers and adds an entry before it sees a rejection), in fixed
words ("this request cannot be recorded into a batch"), whenever the batch is open. Test
`src/__tests__/unit/batch/batchRefusesFlagged.test.ts`: a request with `noLog`, one with `noResend`
and one with both are each refused with zero recorded entries and the envelope unchanged; an
ordinary request is still recorded; the call throws synchronously (no promise returned). First
failure: the flagged request is recorded. Mutations: check after recording → red; return a rejected
promise instead of throwing → red.

**T5.5 Docs.** `docs/usage/ERRATA.md` entries of spec §3.3; `README.md`, `docs/usage/CLIENT_API_REFERENCE.md`;
the `CLAUDE.md` paragraph is the controller's, with the owner's approval of the text; CHANGELOG
46.2.0: new members, slots and facts exchange; legacy forms unchanged and deprecated; the link
validation; the `credentials?: never` exception; `unlink` unchanged; the `checkExternalRepo` defect
fixed in the new form. Run in the package: `npm run build && npm run lint:check && npm run
test:check && npm run test:unit` → green.

**T5.6 Live (controller runs).** `src/__tests__/helpers/test-config.yaml.template` cases per member
(`available_in` by route). `src/__tests__/helpers/abapGitRemote.ts` reads `abapgit-live.env` (the
token never printed or logged), makes and deletes the run's two branches through GitHub's Git Data
API (test-only, the only host-specific code), keeps the ledger (gitignored, beside the test config),
each entry naming its backend and system key. `src/__tests__/helpers/abapGitUnderTest.ts`: loads
adt-clients, adt-strategies and connection **only** from `ABAPGIT_CLIENT_UNDER_TEST` (the isolated
install of T5.7: a temporary directory outside the workspace holding both tarballs plus
`@mcp-abap-adt/connection@25.1.0` and the interfaces from the registry), builds the
SAP connection from that copy, and asserts every resolved path lies inside it. Unit tests:
`abapGitUnderTest.test.ts` (a workspace path refused, client and connection alike);
`abapGitLedger.test.ts` over a stubbed R1 — **the correlation sequence:** terminal status with key
L0 → submit → `R`/L0 → terminal/L0 (still waiting) → terminal/L1: cleanup stays blocked until L1;
the R8 read is paired to L1 from the entry's `log_link`; a cancelled or uncorrelated run keeps its
fixtures and a ledger entry with its backend **and its pre-submit key L0**; a later run (a restart:
a fresh process reading only the ledger) waits for a key other than L0 and a terminal status —
**terminal/L0 after the restart keeps waiting** — then cleans up, verifies and clears the entry.
First failure: missing helpers. Mutations: ignore L0 (accept the first terminal status) → red; drop
L0 from the ledger → the restart case red; clean up while `R` → red.

- `src/__tests__/integration/clients/abapGit/AbapGit.test.ts` — onprem and cloud (Live commands);
  skips with its reason without the env file, the branch scope or discovery's `/abapgit/repos`;
  works the ledger first; every member on its system; on cloud a cancelled-wait case and a recovery
  case; `checkRepo` / `switchBranch` success statuses logged, not asserted. **Functional gate**: every
  member case ran and passed on that backend; **T100 gate**: "a SAP refusal for the run's known key
  (`getFile` of a filename the repository does not hold, credentialed) carries `messageClass` and
  `messageNumber`" ran and passed there. A skip closes neither.

**T5.7 Review, release prep and the published artifacts (P4 and P5 together).** Whole-PR review;
every range on the registry or the pair's own (adt-strategies 0.27.0); root `npm run check`.
**Source binding, in this order:** (1) a clean checkout with the tags `adt-strategies-v0.27.0` and
`adt-clients-v46.2.0` both naming `HEAD` on a clean tree (the check `tools/publish-changed.js`
makes, ~L371); (2) in that same checkout, the clean build (`rm -rf dist` in both packages, then each
package's `npm run build`), the root `npm run check`, and `npm pack --json` in **both** packages;
(3) record both `integrity` values with the tags' commit in the PR — a `dist` built before the tag
check is never packed. **The isolated install:** a temporary directory outside the workspace with
both tarballs, `@mcp-abap-adt/connection@25.1.0` and the interfaces from the registry; the T5.6 runs
on onprem and cloud load only from there, and the four gates close on those tarballs. The owner
publishes the same two files in order, adt-strategies then adt-clients (`npm publish <tarball>`,
not `tools/publish-changed.js`, which rebuilds); after publishing, both `npm view … dist.integrity`
equal the recorded values and a clean install outside the repo installs. The clients repository's `README.md` release section
(~L37) documents this tarball publish path for a package whose gate is a tested artifact. Gate G5.

## P6 — server (this repo, PR #374)

Handlers `src/handlers/abapgit/{readonly,high}/handle<Tool>.ts`; group
`src/lib/handlers/groups/AbapGitHandlersGroup.ts`; compact `src/lib/compact/abapGit/{group.ts,
handleHandlerAbapGitGet.ts, handleHandlerAbapGit.ts}`; shared logic `src/lib/abapGit/`; unit tests
`src/__tests__/unit/abapGit/`. Run per task: `npm test -- <test path>`, then `npm test`,
`npm run test:check`, `npm run lint:check` → green.

**T6.1 Floors.** The root `package.json` (`@mcp-abap-adt/lib`): all five ranges (floors table); `npm install --ignore-scripts`; no `"link": true`,
every entry from the registry; `npm run build && npm test` green before new code.

**T6.2 Availability.** Owner decision (2026-11-23): the abapGit tools are always listed;
availability is decided at call time only. `src/lib/abapGit/availability.ts`:
`abapGitServed(connection): Promise<boolean>` reads discovery on the call's connection, cached by
`adtSystemKey`, dropped by `registerConnectionResetHook`, one read in flight per system key; a
failed read not cached. `tools/list` is the SDK's own reply: no filter, no SAP request, no logon,
no discovery. Admission step 4 refuses a call on an unserved system `abapgit_not_served`, nothing
else sent. **Deferred stdio:** the first `tools/list` lists the abapGit tools and logs on to no
one; the first birth sends no `list_changed`. The plain registration (`HandlerExporter`) registers
no abapGit tool: abapGit tools are served by the MCP server only. Test `availability.test.ts`: per
transport (stdio, SSE, Streamable HTTP), the listing lists the abapGit tool with zero requests and
no connection taken; a served call goes through; an unserved system answers `abapgit_not_served`
and sends nothing else; a failed read refuses the call, is not kept, and is read again next call;
one read per system key across two `state_handle`s; the reset hook drops it; deferred stdio: no
logon on the first listing, no notification after birth. Mutations: the listing filter back →
red; a `list_changed` at birth → red; skip the call-time refusal → red.

**T6.3 Endpoint binding.** `src/lib/abapGit/approvedEndpoints.ts`: `parseApprovedEndpoints(config)`
(start error for userinfo, query, fragment, non-https); `matchEndpoint(url, endpoints): { sendUrl;
credentials } | undefined` — host case-insensitive, path exact; any host and port, no host list.
Sources: stdio file beside the session `.env`; Streamable HTTP headers per call and SSE opening-GET
headers, both read through `requestContextFromHeaders` (`src/lib/requestContext.ts`). Alias-only
match on a key-only route: credential attached, no URL sent (a configured trusted alias authorises
that exact URL as a recipient). Test `endpointBinding.test.ts`: exact match; alias on a URL route
sends the configured URL; alias-only on a key route; `.git`, trailing `/`, port, path case do not
match, host case does; no match sent anonymously (§9.3 a); userinfo/query/fragment in an argument
refused before sending; key routes take R1's URL; several hosts (GitHub, GitLab, Azure DevOps
`…/_git/<repo>`, a self-hosted port) each bind their own; **real dispatch**: the SSE opening GET's
headers held by its instance and dropped with the stream; a second Streamable HTTP call on the same
handle with no git headers sends no credential. `hostAgnostic.test.ts`: no host name in
`src/lib/abapGit/`, `src/handlers/abapgit/`, `src/lib/compact/abapGit/`;
`toolDescriptionsCarryNoLiterals.test.ts` gains a host-name class. First failure: missing module.
Mutations: strip a trailing `/` → red; carry headers over the handle → red.

**T6.4 One admission point.** `src/lib/abapGit/admission.ts`: `admitAbapGitCall(call: { tool;
action?; args: ToolArgs }, signal: AbapGitRestrictionSignal, context): Promise<AbapGitAdmission>`.
`AbapGitRestrictionSignal = { readonly packages: boolean; readonly requests: boolean }` is computed by
the launcher from its configuration (`restrictedStart`, `src/lib/toolSet.ts`, which keeps the lists
private) and handed to `BaseMcpServer` as an option, since `IAccessChecks` exposes only `check`.
The signal passes through every instance factory — stdio's launcher, `SseServer.ts` (~L503) and
`StreamableHttpServer.ts` (~L705) — not only through `accessChecks`. **A pre-validation seam:** the
SDK validates `request.params.arguments` against the schema before our callback (an undeclared
`background` vanishes; a denied compact enum value fails validation before our refusal), so
during registration (~L2311) `BaseMcpServer` captures the `tools/call` callback the SDK's `McpServer`
installed (its handler map, reached through the public `server.setRequestHandler` path the SDK uses,
`mcp.js` ~L140, `protocol.js` ~L909) and installs through `setRequestHandler(CallToolRequestSchema,
…)` a wrapper that runs admission's raw-params steps on the **unvalidated** `request.params`, then
delegates to the captured callback with the original `request` and `extra`; the rest runs before any connection, for every abapGit tool and compact
action, whether or not an `IAccessChecks` is configured. Order: (1) a denied compact
action; (1a) `background` on a call whose schema does not declare it (cloud, or another action),
refused in fixed words; (2) import refusal of link and pull
when either signal is set; (3) blank `package_name` refused for link and branch info; (4)
availability; (5) the R1 pre-read through `listReposQuiet`, once, and the fail-closed refusals; (6)
the package check through `IAccessChecks` when configured; (7) the R8 pairing (`app_log_key` from
R1's `log_link` only; a matching `status_link` alone does not authorise); (8) endpoint binding.
The handoff `AbapGitAdmission { repo?; sendUrl?; credentials? }` goes to the full handler and the
compact action alike, and in memory to a background run on its fresh connection (no second R1;
never in the record). Test `admission.test.ts`: a denied compact action carrying `background` → refused, no run; a
request-only restriction (`requests: true`, `packages: false`) with no transport argument → link and
pull refused; blank `package_name` refused for link and branch info; the import matrix full and
compact × cloud and onprem × each signal: refused with zero requests and zero credential lookups,
served with none set; an admitted call reads exactly one credential-free R1 (through a real
dispatch too; the background run's case is T6.7's); push, unlink, switch checked against R1's package; unknown key, blank package or URL,
unreadable R1 refused; R8 matching pair reads the log, foreign or missing key refused before it.
First failure: with no `IAccessChecks` the step does not run. Mutations: a second R1 at dispatch → red; accept
`status_link` for R8 → red. **Real `tools/call` tests** (`admissionSeam.test.ts`, through the MCP
server, not the function): a denied compact action → refused, nothing run; cloud `PullAbapGitRepo` with `background: true` → refused, nothing sent; an SSE and a
Streamable HTTP instance under a request-only signal refuse link; an admitted call with an
argument of the wrong type still gets the SDK's own validation error (delegation intact). Mutations:
run admission after the SDK's validation → the cloud `background` case red; skip the delegation →
the validation case red. Batch: no abapGit-specific handling; the consumer decides what goes into a
batch (owner, 2026-11-22).

**T6.5 Full tools** (spec §4.1): handlers over `AdtAbapGitClient` taking the handoff; snake_case
arguments, no credential argument, functional descriptions; `ListAbapGitRepos` with §9.2 (a)
filters. Test `abapGitTools.test.ts`: schemas per variant, `-ro` set, deny entries, each handler's
request; answers as the reading's JSON; **R1's branch passed to pull** (`PullAbapGitRepo` sends the
entry's `branchName`; without `overwrite` its request carries no selection — `repo.v3` — and on the cloud with `overwrite` it sends `pull.req.v1`, superseding the earlier "never `pull.req.v1`" (owner, 2026-11-23)); **the server never selects a legacy form** (a recording client stand-in:
only new forms and `unlink`, `link` / `checkExternalRepo` always with a `credentials` key, object or
`null`); cloud pull/push "accepted" after one request, onprem "done" in the call. First failure:
tools absent. Mutations: send a fixed branch → red; add `SwitchAbapGitBranch` to cloud → red.

**T6.6 Compact** (spec §4.2): `HandlerAbapGitGet`, `HandlerAbapGit`, top-level arguments, enums per
variant, each action deniable. Test `abapGitCompact.test.ts`: each enum holds only what that kind
serves; each action reaches the full handler's path with the same handoff;
`compactSchemaCompleteness.test.ts`, `compactCoversLow.test.ts` updated. First failure: tools
absent. Mutation: add `switch_branch` to the cloud enum → red.

**T6.7 Background.** `BACKGROUND_TOOLS` (`src/lib/backgroundRuns/tools.ts`) gains onprem
`LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo` and `HandlerAbapGit` (link, pull, push);
`backgroundObjectOf` gives the abapGit `object` (`package_name` for link, `repository_key` for pull
and push). Test `abapGitBackground.test.ts`: schemas and the list equal, no cloud schema declares
it; `background` on another action refused; `background: true` refused without a store or a fresh
connection; the record's `object` for full and compact; the caller's cancel and
`DiscardBackgroundRun` do not cut a running run; a Streamable HTTP disconnect leaves it going, an
SSE or stdio close logs its connection off; the record holds tool, object, start only. First failure:
`background` not declared. An admitted background run reads exactly one credential-free R1 (the
admission's, handed on in memory) through a real dispatch. Mutations: record the args → red; blank
`object` → red; a second R1 in the background run → red.

**T6.8 Structure and facts at the server.** `withHttpWireLog` (`src/lib/connectionFactory.ts`)
honours `noLog` — built in T6.4's review (`wireLogNoLog.test.ts`); T6.8 adds the RFC side and the
rest below. Test `abapGitCanaries.test.ts` over HTTP and RFC stubs with request-side and echoed
canaries: the wrapper's success and thrown-error branches, the request-URL line and the refusal
lines, each separately, hold no canary and no query; answer, error and run record hold the kept
fields only. First failure: the wrapper logs the params. Mutation: log the body on success → red.

**T6.9 Live (controller runs)**, each a `liveSuite` naming where it runs; helper
`src/__tests__/integration/helpers/abapGitRemote.ts` (as T5.6, ledger with backend, beside
`tests/test-config.yaml`); run-owned fixtures per spec §7; Live commands per backend:

- Onprem R1 carries no `log_link` (measured 2026-11-22, 53 entries; cloud 446, 421 with one): R8
  is a cloud-only path, and onprem admission refuses it in fixed words (`abapgit_run_log_not_served`);
  the live run log cases run on cloud only.
- `src/__tests__/integration/coverage/abapGit.live.test.ts` — full tools, spec §7 steps 1–8; step 7
  under an allowed-packages entry; T100 on `GetAbapGitFile` of a missing filename; the L0 → L1
  correlation and the recovery cases.
- `…/coverage/abapGitCompact.live.test.ts` — every compact action once, the same T100 and recovery
  cases.
- `…/coverage/abapGitListing.live.test.ts` — `tools/list` lists the abapGit tools; `-ro` lists the
  read set.

**T6.10 Docs.** README first screen and a Features section on abapGit (per system, any git host over
HTTPS, approved endpoints, long runs, what an import writes, the link/pull refusal, and **an SSE or
stdio close cutting SAP's dialog mid-import**, spec §4.6); `docs/README.md` and
`docs/user-guide/README.md` indexes; `npm run docs:tools` and `compact/tools/generate-docs.js`
regenerate the tool references; `ACCESS_RESTRICTIONS.md` (the import refusal with spec §4.3's code
grounds, arguments per tool, the R1 pre-read exception, fail-closed cases, compact deny values);
`AUTHENTICATION.md` and `CLI_OPTIONS.md` (any git host over HTTPS with examples, a non-GitHub
credential configured, TLS trust, approved endpoints per transport, the alias rule); CHANGELOG
24.2.0 highlights naming the five minors; `package.json` and every `server*.json` description.

**T6.11 Whole-branch review** of #374 (P1, P2, P3 and the P4/P5 PR each close with their own).

**T6.12 Delete the goal, spec and plan** once implemented, before the release; what they still owe
goes into #374's description first.

**T6.13 Release.** After #374 merges into `main`, #371 merges `main`; the four gates are recorded
again from the server's T6.9 runs; a skipped or failed gate blocks.

## Review Focus

| Failure mode most likely to bite | Pinned by |
|---|---|
| A credential leaks through a resend, an SAP-endpoint redirect, a log line, or the raw response handed to a reader or analyser | T3.1, T3.2, T5.4, T6.8 |
| Access checks: link or pull reaching SAP under any restriction signal; R1 read twice, after `background` was stripped, or after dispatch | T6.4 |
| Endpoint binding: a near-miss or carried-over header binds; an argument URL on a key route; the legacy wrapper sends a foreign or rebuilt-elsewhere link | T5.1, T6.3 |
| abapGit callable where discovery lacks it; a listing that sends a request; a failed discovery cached; deferred stdio logging on to list | T6.2 |
| A cloud run misread: L0 taken for L1, a foreign R8 pairing, cleanup before a terminal state | T5.6, T6.4, T6.9 |

# abapGit — plan

Implements [the spec](2026-11-21-abapgit-spec.md) (approved) for [the goal](2026-11-21-abapgit-goal.md).
Steps, not code: each task names its files, interfaces, tests (with the first failure each shows)
and what to run. Code is written at implementation, test-first; every rule a test protects is proved
load-bearing by the named mutation (break it, watch the test go red, revert).

**§9 open decisions — the spec's recommendation is taken; the owner may overrule each:**

- §9.1 stdio `--deferred-logon`: (a) no abapGit tool listed until the logon, then
  `notifications/tools/list_changed`.
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
- "every abapGit tool and action is refused in batch mode before anything is sent and before any
  credential is resolved; no batch entry and no number is taken (`batch_not_recordable`)."
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

One PR per package in its repository, holding all of that package's tasks.

| # | Package (repo, directory) | Version |
|---|---|---|
| P1 | `@mcp-abap-adt/interfaces-adt-connection` (`~/prj/mcp-abap-adt-interfaces`, `packages/interfaces-adt-connection`) | 5.1.0 → 5.2.0 |
| **G1** | **owner publishes interfaces-adt-connection 5.2.0** | |
| P2 | `@mcp-abap-adt/interfaces-adt` (same repo, `packages/interfaces-adt`) | 30.1.1 → 30.2.0 |
| **G2** | **owner publishes interfaces-adt 30.2.0** | |
| P3 | `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`) | 25.0.1 → 25.1.0 |
| **G3** | **owner publishes connection 25.1.0** | |
| P4 | `@mcp-abap-adt/adt-strategies` (`~/prj/mcp-abap-adt-clients`, `packages/adt-strategies`) | 0.26.0 → 0.27.0 |
| **G4** | **owner publishes adt-strategies 0.27.0** | |
| P5 | `@mcp-abap-adt/adt-clients` (same repo, `packages/adt-clients`) | 46.1.0 → 46.2.0 |
| **G5** | **owner publishes the tested adt-clients 46.2.0 tarball** (T5.7) | |
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
| G3, G4 | adt-clients (T5.0) | interfaces-adt `^30.2.0`, -connection `^5.2.0`, adt-strategies `^0.27.0` (moves to runtime `dependencies`), connection `^25.1.0` (dev) | the atoms, the flags, `abapGitFacts` at runtime, the live wire |
| G5 | server (T6.1) | all five: -connection `^5.2.0`, -adt `^30.2.0`, connection `^25.1.0`, adt-strategies `^0.27.0`, adt-clients `^46.2.0` | every new form |
| G5 | adt-clients-legacy | nothing, no republish | peer `@mcp-abap-adt/adt-clients ^46.1.0` and interfaces-adt `^30.1.0` already accept the new minors; it uses no new API |

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
- **Atoms**, one exported interface each, generic over its result `T`, each with exactly two
  facts-typed overloads and no wire-typed one: `<E extends IAbapGitStructuredError>(args, options:
  O<T, E> & { analyse: IAbapGitFactsAnalyse<T, E> }): Promise<IAdtResponse<T, E>>` and `(args,
  options?: O<T>): Promise<IAdtResponse<T, IAbapGitStructuredError>>` (the default keeps `.facts`).
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
`AbstractAbapConnection` (where the request config takes `stateful` from `sessionMode`, ~L1536) and
on the RFC transport, without changing the session mode. Test `src/__tests__/statelessRequest.test.ts`,
HTTP and RFC: starting from `setSessionType('stateful')`, the request goes stateless and the next
ordinary request is stateful again; after a refusal of a stateless request the next one is
stateless too. First failure: the request goes stateful. Mutation: read the mode first → red.

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

**T4.4 Review and release prep.** Whole-PR review; root `npm run check`; gate G4.

## P5 — adt-clients

Files: one per member under `packages/adt-clients/src/clients/abapGit/`; `src/clients/AdtAbapGitClient.ts`;
slots in `src/clients/abapGit/types.ts`; entry `src/index.abapgit.ts` (`./abapgit`).

**T5.0 Floors, after G3 and G4.** Ranges as the floors table; adt-strategies moves to runtime
`dependencies` (`abapGitFacts` is imported at runtime). **The first build resolves the published
strategy:** a copy of `packages/adt-clients` outside the workspace, `npm install --ignore-scripts`
there, `npm ls @mcp-abap-adt/adt-strategies` shows the registry 0.27.0 path, `npm run build` green.
In the workspace, npm regenerates the lockfile; only the sibling link remains (owner's exception).

**T5.1 Key path builder and link wrappers.** `abapGit/paths.ts`: `repoPath(key, ...segments)` encodes
and validates each segment (non-empty, no `..`). The internal `pullRepo(connection, headers, args)`
in `pull.ts` (not exported) becomes `postPullLink`; the new member uses `postPullByKey`. `pull`
keeps its optional `branchName` and accepts only `/sap/bc/adt/abapgit/repos/{key}/pull`;
`getErrorLog` only `/sap/bc/adt/abapgit/repos/{key}/log/{id}`; both decode the segments, rebuild
through `repoPath`, and refuse anything else in fixed words with nothing sent; an accepted link
keeps today's request, callbacks and answer. Test `src/__tests__/unit/clients/abapGit/paths.test.ts`:
keys with `/`, `?`, `#` encoded; a valid encoded href (`…/repos/A%2FB/log/L1`) rebuilt keeps its
destination exactly; an absolute URL, foreign host, query, fragment, `..`, empty segment and another
path each refused with zero requests; `pull` without `branchName` sends. First failure: today's
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
`abapGitFacts` only; legacy slots keep `abapGitDocuments`. Both constructor paths infer them the
same way: `new AdtAbapGitClient<R extends IAbapGitResults>(…, results?: R)` and
`AdtAbapGitClient.create<R>(…)` type a member's result as `SlotResult<R, slot>` — the given slot's
return type, else the `abapGitFacts` default's. Test `members.test.ts`, one case per member: method;
path from `key`; query (`?create=true` only when true; `filename`, `version`); Content-Type and
Accept (R6's exact Accept; R7 Content-Type `…repos.v2+xml`); body (R10's `abapgitstaging`); options
`timeout: 0`, `stateless: true`; and named cases: **R6's reading fed as `selection` to `pullRepo` and
`pullRepoInDialog` produces the `pull.req.v1` document with exactly its entries**; **cloud R4/R10
`202` = accepted, one request**; **R5 `202` = finished** (synchronous); onprem R4/R10 `200` =
finished; **strict non-2xx with no analyser** (a `500` is the error, a `2xx` success); every legacy
member's request and answer equal its 46.1.0 fixture (no new flags). Type tests
`src/__tests__/typechecks/abapGitResults46.ts` (46.x `results` compiles, both constructor paths) and
`abapGitResultsNew.ts` (a facts slot types the member's result on both paths). **Published entry:**
`src/__tests__/unit/abapGitEntryPacked.test.ts` packs the package and type-checks an old consumer
(46.x `results`, legacy calls) and a new one (facts slots, new forms) against `./abapgit` from the
tarball. First failure: members absent. Mutations: drop `packageWarningObjects` from the selection
document → red; treat R5 `202` as accepted → red; accept `4xx` without an analyser → red.

**T5.4 The facts exchange** (`src/clients/abapGit/structuredExchange.ts`).
`answeringFactsExchange<T, F, E extends IAbapGitStructuredError>(run, reduce, read, analyse?)`
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
install: the packed tarball plus `@mcp-abap-adt/connection@25.1.0` from the registry), builds the
SAP connection from that copy, and asserts every resolved path lies inside it. Unit tests:
`abapGitUnderTest.test.ts` (a workspace path refused, client and connection alike);
`abapGitLedger.test.ts` over a stubbed R1 — **the correlation sequence:** terminal status with key
L0 → submit → `R`/L0 → terminal/L0 (still waiting) → terminal/L1: cleanup stays blocked until L1;
the R8 read is paired to L1 from the entry's `log_link`; a cancelled or uncorrelated run keeps its
fixtures and a ledger entry with its backend; a later run waits while blank or `R`, cleans up,
verifies and clears the entry. First failure: missing helpers. Mutations: ignore L0 (accept the
first terminal status) → red; clean up while `R` → red.

- `src/__tests__/integration/clients/abapGit/AbapGit.test.ts` — onprem and cloud (Live commands);
  skips with its reason without the env file, the branch scope or discovery's `/abapgit/repos`;
  works the ledger first; every member on its system; on cloud a cancelled-wait case and a recovery
  case; `checkRepo` / `switchBranch` success statuses logged, not asserted. **Functional gate**: every
  member case ran and passed on that backend; **T100 gate**: "a SAP refusal for the run's known key
  (`getFile` of a filename the repository does not hold, credentialed) carries `messageClass` and
  `messageNumber`" ran and passed there. A skip closes neither.

**T5.7 Review, release prep and the published artifact.** Whole-PR review; sibling links gone, every
range on the registry; root `npm run check`. Then: `npm pack --json` in the package → record the
tarball's `integrity` in the PR; the T5.6 runs (both backends) use that tarball; the owner publishes
that same file (`npm publish <tarball>`, not `tools/publish-changed.js`, which rebuilds); after
publishing, `npm view @mcp-abap-adt/adt-clients@46.2.0 dist.integrity` equals the recorded value and
a clean install outside the repo installs; gate G5.

## P6 — server (this repo, PR #374)

Handlers `src/handlers/abapgit/{readonly,high}/handle<Tool>.ts`; group
`src/lib/handlers/groups/AbapGitHandlersGroup.ts`; compact `src/lib/compact/abapGit/{group.ts,
handleHandlerAbapGitGet.ts, handleHandlerAbapGit.ts}`; shared logic `src/lib/abapGit/`; unit tests
`src/__tests__/unit/abapGit/`. Run per task: `npm test -- <test path>`, then `npm test`,
`npm run test:check`, `npm run lint:check` → green.

**T6.1 Floors.** All five ranges (floors table); `npm install --ignore-scripts`; no `"link": true`,
every entry from the registry; `npm run build && npm test` green before new code.

**T6.2 Availability.** `src/lib/abapGit/availability.ts`: `abapGitServed(connection): Promise<boolean>`
reads discovery on the request's connection, cached by `adtSystemKey`, dropped by
`registerConnectionResetHook`; a failed read not cached. A `tools/list` hook installed after
`BaseMcpServer.registerHandlers` filters the abapGit tools; an unlisted tool's call is refused.
**Deferred stdio** (§9.1 a): `server-runtime/src/stdio/StdioServer.ts` — the first `tools/list`
lists no abapGit tool and performs no logon; the first connection birth (where the deferred logon
creates the connection, ~L91) triggers one discovery read and exactly one `list_changed`. Test
`availability.test.ts`: listed with `/abapgit/repos`, absent without; absent on a failed read, read
again next time; one read per system key across two `state_handle`s; the reset hook drops it; per
transport (stdio, SSE, Streamable HTTP under `runWithRequestContext`); a real `tools/list` releases
its connection use on success and on a failed discovery; deferred stdio: no logon on the first
listing, one notification after birth. First failure: tools listed without discovery. Mutations:
cache a failed read → red; skip the release on failure → red; send the notification per listing →
red.

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
`BaseMcpServer` calls it with the **original arguments**, before its dispatch strips `background`
(`BaseMcpServer.ts` ~L2025) and before any connection, for every abapGit tool and compact action,
whether or not an `IAccessChecks` is configured. Order: (1) batch refusal (no connection, no
discovery, no entry or number); (2) a denied compact action; (3) import refusal of link and pull
when either signal is set; (4) blank `package_name` refused for link and branch info; (5)
availability; (6) the R1 pre-read through `listReposQuiet`, once, and the fail-closed refusals; (7)
the package check through `IAccessChecks` when configured; (8) the R8 pairing (`app_log_key` from
R1's `log_link` only; a matching `status_link` alone does not authorise); (9) endpoint binding.
The handoff `AbapGitAdmission { repo?; sendUrl?; credentials? }` goes to the full handler and the
compact action alike, and in memory to a background run on its fresh connection (no second R1;
never in the record). Test `admission.test.ts`: batch with `background: true` → batch refusal, no
run, no connection; a denied compact action carrying `background` → refused, no run; a
request-only restriction (`requests: true`, `packages: false`) with no transport argument → link and
pull refused; blank `package_name` refused for link and branch info; the import matrix full and
compact × cloud and onprem × each signal: refused with zero requests and zero credential lookups,
served with none set; an admitted call reads exactly one credential-free R1 (a background run
included); push, unlink, switch checked against R1's package; unknown key, blank package or URL,
unreadable R1 refused; R8 matching pair reads the log, foreign or missing key refused before it.
First failure: with no `IAccessChecks` the step does not run. Mutations: call it after `background`
is stripped → the batch-with-background case red; a second R1 in the background run → red; accept
`status_link` for R8 → red.

**T6.5 Full tools** (spec §4.1): handlers over `AdtAbapGitClient` taking the handoff; snake_case
arguments, no credential argument, functional descriptions; `ListAbapGitRepos` with §9.2 (a)
filters. Test `abapGitTools.test.ts`: schemas per variant, `-ro` set, deny entries, each handler's
request; answers as the reading's JSON; **R1's branch passed to pull** (`PullAbapGitRepo` sends the
entry's `branchName`); **the server never selects a legacy form** (a recording client stand-in:
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
`background` not declared. Mutations: record the args → red; blank `object` → red.

**T6.8 Structure and facts at the server.** `withHttpWireLog` (`src/lib/connectionFactory.ts`)
honours `noLog`. Test `abapGitCanaries.test.ts` over HTTP and RFC stubs with request-side and echoed
canaries: the wrapper's success and thrown-error branches, the request-URL line and the refusal
lines, each separately, hold no canary and no query; answer, error and run record hold the kept
fields only. First failure: the wrapper logs the params. Mutation: log the body on success → red.

**T6.9 Live (controller runs)**, each a `liveSuite` naming where it runs; helper
`src/__tests__/integration/helpers/abapGitRemote.ts` (as T5.6, ledger with backend, beside
`tests/test-config.yaml`); run-owned fixtures per spec §7; Live commands per backend:

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

**T6.11 Whole-branch review** of #374 (P1–P5 each close with their own).

**T6.12 Delete the goal, spec and plan** once implemented, before the release; what they still owe
goes into #374's description first.

**T6.13 Release.** After #374 merges into `main`, #371 merges `main`; the four gates are recorded
again from the server's T6.9 runs; a skipped or failed gate blocks.

## Review Focus

| Failure mode most likely to bite | Pinned by |
|---|---|
| A credential leaks through a resend, an SAP-endpoint redirect, a log line, or the raw response handed to a reader or analyser | T3.1, T3.2, T5.4, T6.8 |
| Access checks: batch not first; link or pull reaching SAP under any restriction signal; R1 read twice, after `background` was stripped, or after dispatch | T6.4 |
| Endpoint binding: a near-miss or carried-over header binds; an argument URL on a key route; the legacy wrapper sends a foreign or rebuilt-elsewhere link | T5.1, T6.3 |
| abapGit listed or callable where discovery lacks it; a failed discovery cached; deferred stdio logging on to list | T6.2 |
| A cloud run misread: L0 taken for L1, a foreign R8 pairing, cleanup before a terminal state | T5.6, T6.4, T6.9 |

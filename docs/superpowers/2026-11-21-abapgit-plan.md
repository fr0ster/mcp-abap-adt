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
- Legacy forms: as spec §3 ("Legacy forms unchanged") — `getErrorLog(logLink)`,
  `pull({ pullLink })` and the `remoteUser`/`remotePassword` forms keep today's behaviour,
  deprecated; the facts exchange and the flags serve the new members.
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
  when there is one, and path … No `.git` or trailing `/` is merged"; "when an alias matches, the
  **configured URL** is what SAP is sent"; key-addressed tools use "the `url` of the R1 entry for
  that key, read first — never a URL from the arguments."
- Credential headers (Streamable HTTP / SSE): `x-abapgit-remote`, `x-abapgit-user`, `x-abapgit-token`.
- "Anything not named — raw bodies, headers, status texts, message texts, exception texts, message
  variables and properties — is dropped **before** any log line, the tool answer and the
  background-run record" (spec §5.3's table is the kept-field list).
- Discovery: "cached **by the system that connection actually reaches** (its system key,
  `adtSystemKey`), never by `state_handle` or instance; kept for the process; no clock expires it."
  Refusal: "abapGit is not served by this system".
- "`background` is declared only on onprem `LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo`
  and, in compact, on the onprem variant of `HandlerAbapGit` (boolean, optional, **no default**)";
  "**`background: true` is refused, never run in the foreground**" when it cannot run.
- Cloud wait: "poll R1 until the entry shows a **new** log key **and** a terminal `status` (`S`,
  `W`, `E`, `A`); blank (initial) and `R` mean waiting."

The same owner rules bind every package: no retries and no timeouts; static types first;
availability from the system; functional tool descriptions; compact keeps a minimal tool count;
access checks before anything is sent; no redactor, only structure and facts; every handler pinned
by unit tests and live tests on both systems; a live test states where it runs and skips with a
reason elsewhere.

## Release order, dependencies and gates

Each package is one PR in its repository holding all of that package's tasks (P1/P2 share
mcp-abap-adt-interfaces, P4/P5 share mcp-abap-adt-clients; still one PR each).

| # | Package (repo) | Version |
|---|---|---|
| P1 | `@mcp-abap-adt/interfaces-adt-connection` (`~/prj/mcp-abap-adt-interfaces`) | 5.1.0 → 5.2.0 |
| **G1** | **owner publishes interfaces-adt-connection 5.2.0** | |
| P2 | `@mcp-abap-adt/interfaces-adt` (same repo) | 30.1.1 → 30.2.0 |
| **G2** | **owner publishes interfaces-adt 30.2.0** | |
| P3 | `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`) | 25.0.1 → 25.1.0 |
| **G3** | **owner publishes connection 25.1.0** | |
| P4 | `@mcp-abap-adt/adt-strategies` (`~/prj/mcp-abap-adt-clients/packages/adt-strategies`) | 0.26.0 → 0.27.0 |
| **G4** | **owner publishes adt-strategies 0.27.0** | |
| P5 | `@mcp-abap-adt/adt-clients` (`…/packages/adt-clients`) | 46.1.0 → 46.2.0 |
| **G5** | **owner publishes adt-clients 46.2.0** — after T5.6's run on the isolated install (T5.0) | |
| P6 | server, this repo, PR #374; ships in 24.2.0 (#371) | |

**Dependencies.** A package depends on another repository's package only as published on the
registry — no `file:`, `link:` or `npm link`; after every install the lockfile is checked for
`"link": true` and anything not resolved from the registry. **Standing owner exception:** siblings
of the same repository and release (adt-strategies and adt-clients in mcp-abap-adt-clients; the two
interfaces packages) may be linked during development. Before tagging every link is gone from what
is released: every range resolves on the registry, the sibling is published first in order, and a
clean install from the registry outside the repo installs.

**Gates per backend.** Four live gates, each recorded on its own at G5 and again at the release:
functional onprem, functional cloud, T100 onprem, T100 cloud (adt-clients' run at G5, the server's
at the release, each log kept). A gate closes only on an executed, passing assertion on that
backend; **a skip leaves it open**, and an open gate blocks exactly as a failure does. **What
blocks publishing** (G5) and the 24.2.0 release: a red unit, type or build check, or any of the four
gates open or failed.

## P1 — interfaces-adt-connection

**T1.1 Request flags.** `packages/interfaces-adt-connection/src/IAbapRequestOptions.ts` gains
`noLog?: true | undefined` and `noResend?: true | undefined`, doc comments naming what each gates
(spec §3.4). Test: new `src/__typechecks__/requestFlags.ts` — `{ noLog: true }` and
`{ noResend: true }` compile; `noLog: false` and `noResend: 'yes'` are `@ts-expect-error`;
`wireDefaults.ts` compiles unchanged. First failure: `test:check` rejects the unknown properties.
Mutation: widen to `boolean` → the `false` case goes red. Run at the root: `npm run build && npm run
test:check && npm run check:surface` → green. CHANGELOG 5.2.0, dated.

**T1.2 Review and release prep.** Whole-PR review; `npm run check` green; gate G1.

## P2 — interfaces-adt (a provable minor)

**T2.1 Contracts in `packages/interfaces-adt/src/adt/IAdtAbapGit.ts`.** Every existing exported
interface and overload stays exactly as it is: `IAbapGitLinkArgs`, `IAbapGitPullArgs` (with its
optional `branchName`), `IAbapGitUnlinkArgs`, `IAbapGitExternalRepoCredentials`, and both overloads
of every `IAdtAbapGitClient` member. New exports:

- `IAbapGitCredentials { readonly user: string; readonly password: string }`.
- **Facts options, not extending `IAdtAnalyseOptions`** (so no wire-typed `analyse` is inherited):
  `IAbapGitFactsOptions<F, E extends IAbapGitStructuredError = IAbapGitStructuredError> = {
  readonly analyse?: IAbapGitFactsAnalyse<F, E>; readonly credentials?: IAbapGitCredentials }`, and
  for the new forms of `link` / `checkExternalRepo` `IAbapGitNewFormOptions<F, E> =
  Omit<IAbapGitFactsOptions<F, E>, 'credentials'> & { readonly credentials: IAbapGitCredentials |
  null }`.
- **A typed facts exchange** (new types only; `IResultStrategy`, `IAnalyse` and `IAdtError` are not
  touched, since they take `IAdtWireResponse`):
  - `IAbapGitFactsResponse<F> { status: number; facts: F }` — no headers, body or status text;
  - `IAbapGitErrorFacts { status; messageClass?; messageNumber?; gitHttpStatus? }`;
  - `IAbapGitStructuredError extends IAdtError` with `facts: IAbapGitErrorFacts`,
    `response?: undefined` (narrowed: no wire response), `request?: { method; path }` without query,
    its required `origin` and `message` (fixed words from status and T100 key, no text of SAP's);
  - `IAbapGitFactsResultStrategy<T, F> = (answer: IAbapGitFactsResponse<F>) => T`;
  - `IAbapGitFactsAnalyse<F, E extends IAbapGitStructuredError = IAbapGitStructuredError> =
    (verdict: IAbapGitStructuredError | AdtNoFailure, answer?: IAbapGitFactsResponse<F>) => E |
    AdtNoFailure` — the error subtype `E` is the callback's return, inferred at the member call
    (each new-form overload is `<E extends IAbapGitStructuredError>(…, options: … & { analyse:
    IAbapGitFactsAnalyse<TFacts, E> }): Promise<IAdtResponse<TFacts, E>>`); the same bound in T5.4.
- Argument types: `IAbapGitRepoKeyArgs { key }`; `IAbapGitPullRepoArgs { key; branchName;
  transportRequest?; selection? }` (`branchName` required); `IAbapGitPullSelection {
  overwriteObjects; packageWarningObjects }`; `IAbapGitRunLogArgs { key; appLogKey }`;
  `IAbapGitStagedObject` with `files[]`; `IAbapGitCommit { text; author: { name; email };
  committer: { name; email } }` (all required); `IAbapGitPushArgs { key; staged; comment }`;
  `IAbapGitFileArgs { key; filename; version: 'local' | 'remote' }`; `IAbapGitBranchInfoArgs { url;
  branch; package }`; `IAbapGitSwitchBranchArgs { key; branch; create: boolean }`.
- **New forms of existing members** through overload atoms `IAdtAbapGitLinkNewForm`,
  `IAdtAbapGitCheckExternalRepoNewForm`: `args` typed `Omit<…Args, 'remoteUser' | 'remotePassword'>
  & { remoteUser?: never; remotePassword?: never }`, options carrying a required
  `credentials: IAbapGitCredentials | null` (`null` = anonymous; at run time the new form is
  `options.credentials !== undefined`) and typed with the facts exchange (`IAbapGitNewFormOptions`,
  result `IAdtResponse<TFacts, E>`). **Exclusivity lives in two places:**
  the `never` fields on the new overloads, and `credentials?: never` added to the options of each
  legacy overload of `link`, `pull` and `checkExternalRepo` (it rejects an object and `null`), so an
  options variable holding `headers` and `credentials` no longer matches the legacy branch and the
  two forms never mix. Pulling with a credential is the new member `pullRepo`. This stays a minor: no existing
  options type declared `credentials`; every caller that compiled before still compiles (pinned
  below) with one edge case, stated in spec §3 and both CHANGELOGs: an options variable carrying an
  extra, undeclared `credentials` property is now rejected, or selects the new form when its value
  is a credential or `null`. The deprecated fields keep working through the legacy overloads.
- **Legacy members unchanged, deprecated** (spec §3): `getErrorLog(logLink)` and the
  `remoteUser`/`remotePassword` forms of `link`, `pull`, `checkExternalRepo` keep their wire-typed
  callbacks (`IAnalyse`, `IResultStrategy`) exactly; each gains a `@deprecated` tag naming its
  replacement (`getRunLog`; the `credentials` overload; the key-based `pullRepo`). The only legacy
  changes are additive and refuse only new misuse: `credentials?: never` on the legacy options, and
  (in adt-clients, T5.1) the link validation of `getErrorLog` and `pull`.
- **Facts-typed callbacks on every new form, in every overload:** each new member (`pullRepo`
  included, credentialed or not) and the new forms of `link` / `checkExternalRepo` take
  `IAbapGitFactsAnalyse` / `IAbapGitFactsResultStrategy` only — no wire-typed overload on a new
  form.
- **New members as atoms**, one exported interface each, generic only over its result `T`, each with
  two facts-typed shapes — `<E extends IAbapGitStructuredError>(args, options:
  IAbapGitFactsOptions<T, E> & { analyse: IAbapGitFactsAnalyse<T, E> }): Promise<IAdtResponse<T,
  E>>` and `(args, options?: IAbapGitFactsOptions<T>): Promise<IAdtResponse<T>>`, with
  `{ headers: IAdtHeaders } &` where the route takes headers (H); `credentials` absent = anonymous
  (these members have no legacy form):

  | Atom | Member | Args |
  |---|---|---|
  | `IAdtAbapGitPullRepo<T>` | `pullRepo` | `IAbapGitPullRepoArgs` (H) |
  | `IAdtAbapGitPullRepoInDialog<T>` | `pullRepoInDialog` | `IAbapGitPullRepoArgs` (H) |
  | `IAdtAbapGitModifiedObjects<T>` | `getModifiedObjects` | `IAbapGitRepoKeyArgs` |
  | `IAdtAbapGitStatus<T>` | `getStatus` | `IAbapGitRepoKeyArgs` |
  | `IAdtAbapGitRunLog<T>` | `getRunLog` | `IAbapGitRunLogArgs` |
  | `IAdtAbapGitStaging<T>` | `getStaging` | `IAbapGitRepoKeyArgs` |
  | `IAdtAbapGitPush<T>` | `push` | `IAbapGitPushArgs` |
  | `IAdtAbapGitCheckRepo<T>` | `checkRepo` | `IAbapGitRepoKeyArgs` |
  | `IAdtAbapGitFile<T>` | `getFile` | `IAbapGitFileArgs` |
  | `IAdtAbapGitBranchInfo<T>` | `getBranchInfo` | `IAbapGitBranchInfoArgs` (H) |
  | `IAdtAbapGitSwitchBranch<T>` | `switchBranch` | `IAbapGitSwitchBranchArgs` |

  `IAdtAbapGitClient<TRepos, TErrorLog, TPull, TExternalRepo>` is unchanged, so implementers compile.

Tests (`src/__typechecks__/abapGit.ts`, `downstreamStillCompiles.ts`; first failure: missing
exports): an existing caller of every old overload compiles, `pull` without `branchName` and with
`remoteUser`/`remotePassword` included; an existing class implementing the four-parameter
`IAdtAbapGitClient` compiles; **no previously compiling call breaks, except the one stated edge
case: an options variable carrying an undeclared `credentials` property** (rejected, or the new
form when its value is a credential or `null`; pinned by its own type test)
(`src/__typechecks__/abapGitLegacyCalls.ts`): `getErrorLog`, and `link`, `pull` and
`checkExternalRepo` with the deprecated fields, called with no callback, a verdict-only analyser, a
wire-reading analyser (`answer?: IAdtWireResponse`) and a custom wire reader, all compile with the
46.x types; **error-subtype inference through the member call** — `getRunLog`, `pullRepo` and
`push` with `credentials`, each given an analyser returning a subtype, type `getError()` as that
subtype with no cast; `credentials` with `remoteUser` (literal and variable), **an options variable
holding `headers` and `credentials` beside args with `remoteUser`** (the legacy-branch case),
an `IResultStrategy` given where an `IAbapGitFactsResultStrategy` is required and the reverse,
`push` without `comment.committer`, `switchBranch` without `create`, `getFile` with
`version: 'head'`, `pullRepo` without `branchName` are each `@ts-expect-error`; an `analyse`
returning an `IAdtError` subtype types `E` through on a legacy call, and an `IAbapGitFactsAnalyse`
returning an `IAbapGitStructuredError` subtype on a new form; an `IAnalyse` on any `pullRepo`
overload (with and without other options — no fallback overload takes it), a new-form `link` with
`credentials: undefined` or with `remoteUser`, and a legacy call with `credentials: null` are each
`@ts-expect-error`; a facts analyser on `pullRepo` compiles and infers `E`; the edge case is pinned
as stated (an options variable with an extra `credentials` object against the legacy args is
`@ts-expect-error`). Mutation: let `IAbapGitFactsOptions` extend `IAdtAnalyseOptions` → the
`IAnalyse` case red. Mutations: drop a `never` field → the both-forms case
red; drop `credentials?: never` from the legacy options → the legacy-branch case red. Run: `npm run build && npm run test:check && npm run check:surface && npm run
check:graph` → green. CHANGELOG 30.2.0: the new members and types; the legacy members unchanged
and deprecated, with their replacements; `credentials?: never` on the legacy options as the one
additive restriction, and its edge case (an options variable with an undeclared `credentials`
property no longer compiles against the legacy form, or selects the new form).

**T2.2 Review and release prep.** Whole-PR review; `npm run check`; gate G2.

## P3 — connection

**T3.0 Dependencies.** interfaces-adt-connection `^5.2.0` from the registry; lockfile check.

**T3.1 `noResend`.** `src/connection/AbstractAbapConnection.ts`: no replay in the CSRF recovery
(`shouldRetryCsrf` and its resend) or `answerCredentialFailure` with `noResend`;
`src/connection/HttpTransport.ts` `sendPooled`: no fresh-socket resend. **SAP-endpoint redirects,
part of `noResend`:** a redirect from SAP's ADT endpoint would replay a request that must not be
replayed, so with `noResend` it is not followed (`maxRedirects: 0`): the `3xx` is the caller's
answer. This is not a gate on git hosts. Tests, new `src/__tests__/noResend.test.ts`
and `pooledResend.test.ts`: a mutation with `noResend` still runs exactly one CSRF fetch before its
one send; a `500` whose body holds `CSRF token`, a `403` `CSRF token validation failed` and a `401`
to a mutation sent without a token are each sent once with `noResend`, resent once without; a
renewal answer: no resend with; a dead pooled socket: one send with, the resend without; a `307` to
another path: returned as `307` with, followed without. First failure: the stub counts two sends or
a followed redirect. Mutations: remove each of the four gates → its case red; skip the CSRF fetch →
the fetch case red.

**T3.2 `noLog`.** With `noLog` every path writes at most method, path without query, integer status
and byte count. New `src/__tests__/noLog.test.ts`, one case per path: the ordinary request-URL
lines (HTTP and RFC); the RFC outbound URI, headers and body under `logWire`; the HTTP wire logger;
the refusal preview at `error`, the `404` `debug` line and every other refusal branch; the RFC
status-text line and its body. Canaries on the request side (in the query string, a header, the
body) and the answer side (body, header, status text): no logger call holds any canary or a `?`;
each written line has exactly the four facts; the thrown error still carries status and body. First
failure: today's preview holds the body canary. Mutation: drop the check in each path → that case red.

**T3.3 Docs.** `CHANGELOG.md` 25.1.0: both options (`noResend` covering SAP-endpoint redirects), the CSRF ground of spec
§4.7 (SAP checks CSRF before any resource handler; the connector's resend is wider); `README.md`
request options. Run: `npm run build && npm run lint:check && npm run test:ci && npm run
test:shape` → green.

**T3.4 Review and release prep.** Whole-PR review; `prepublishOnly` chain green; gate G3.

## P4 — adt-strategies

**T4.0 Dependencies.** interfaces-adt `^30.2.0`, interfaces-adt-connection `^5.2.0` from the
registry; lockfile check.

**T4.1 Readings** in `src/results/abapGit.ts`, exported from `src/index.ts`: `abapGitStaging`,
`abapGitModifiedObjects`, `abapGitBranchInfo`, `abapGitObjectResults`, every field SAP sends;
`abapGitRepos` gains `status`, `statusText`, `folderLogic`, the e-mail fields, every link with its
`rel`, and `appLogKey` parsed from the `log_link`/`status_link` path. Tests in
`src/__tests__/abapGitReadings.test.ts` over sanitised captured documents: field by field; `sha`
and `sha1` both into `sha1`; onprem R1 `status: undefined`, key present. First failure: missing
readers. Mutation: read `sha` only → the onprem case red.

**T4.2 The reducer `abapGitFacts`** (spec §5.3): `abapGitFacts[route](wire):
IAbapGitFactsResponse<F>` with the kept fields per route, and `abapGitErrorFacts(wire): { status;
messageClass?; messageNumber?; gitHttpStatus? }` from `T100KEY-ID` / `T100KEY-NO` / `http_status`.
New `src/__tests__/abapGitFacts.test.ts`: per route the key set equals the kept list exactly;
canaries (user, raw token, base64 password) in every dropped place (body text, `msgText`,
`actionDescription`, `displayName`, links, `@comment`, exception text, `T100KEY-V1…V4`, `LONGTEXT`)
appear nowhere in the serialised result; a canary in a kept field (name, path, file content) passes
through as data. First failure: missing reducer. Mutations: keep `msgText` → red; drop
`messageNumber` or `gitHttpStatus` → red. Run in the package `npm test`; at the root `npm run build
&& npm run test:check && npm run lint:check` → green. CHANGELOG 0.27.0.

**T4.3 Review and release prep.** Whole-PR review; root `npm run check`; gate G4.

## P5 — adt-clients

Files: one per member under `packages/adt-clients/src/clients/abapGit/`, and
`src/clients/AdtAbapGitClient.ts`; result slots in `src/clients/abapGit/types.ts` (`IAbapGitResults`,
new slots optional).

**T5.0 Manifest and lockfile, after G3 and G4.** `package.json` today lists `connection ^24.0.0` and
`adt-strategies ^0.26.0` as dev dependencies. Set interfaces-adt `^30.2.0`,
interfaces-adt-connection `^5.2.0`, connection `^25.1.0` (dev: the tests and the live run);
**adt-strategies moves to `dependencies`, `^0.27.0`**, because `abapGitFacts` is imported at
runtime. `npm install --ignore-scripts` regenerates the lockfile; connection 25.1.0 and
adt-strategies 0.27.0 resolve from the registry; no `"link": true` but the repository's own
development sibling links, which T5.7 removes before tagging. **Isolated install before G5:** `npm
pack` adt-clients into a temporary directory outside the workspace and run there `npm install
--ignore-scripts <tarball>`, every dependency (adt-strategies 0.27.0, connection, the interfaces)
from the registry. The T5.6 suite loads the client under test through one helper,
`src/__tests__/helpers/abapGitUnderTest.ts`: with `ABAPGIT_CLIENT_UNDER_TEST` set to that install it
`require`s from there and asserts the resolved paths (`require.resolve`) of adt-clients,
adt-strategies and connection lie inside it and none inside the workspace — the pre-G5 run sets it.
Since connection is a dev dependency the tarball does not bring it: the temporary directory also
gets `npm install --ignore-scripts @mcp-abap-adt/connection@25.1.0` from the registry, and the
helper builds the suite's SAP connection from that copy (its `createConnection`), not from the
workspace. Unit test of the helper: a path inside the workspace is refused, for the client and for
connection alike.

**T5.1 Key path builder and link wrappers.** `abapGit/paths.ts`: `repoPath(key, ...segments)`,
URL-encoded segments. The existing low-level internal function `pullRepo(connection, headers, args)`
in `pull.ts` (not exported) becomes `postPullLink`, distinct from the new key-based member `pullRepo`
(T5.3, through `postPullByKey`). The `pull` wrapper keeps its optional `branchName` and accepts only
`/sap/bc/adt/abapgit/repos/{key}/pull`; `getErrorLog` accepts only
`/sap/bc/adt/abapgit/repos/{key}/log/{id}` and builds the path with the same key-based builder;
anything else refused in fixed words, nothing sent. For an accepted link both keep today's request,
callbacks and answer (no facts exchange, no new flags). Test `src/__tests__/unit/clients/abapGit/paths.test.ts` (recording
connection): keys with `/`, `?`, `#` encoded; an absolute URL, foreign host, query, fragment, `..`,
empty segment and another path each refused with zero requests; `pull` without `branchName` still
sends. First failure: today's `getErrorLog` sends the absolute URL. Mutation: accept a scheme → red.

**T5.2 Credentials on the wire and the R13 defect.** `xmlBuilder.ts` writes the new form exactly as
spec §3.1 says (R13/R14 `abapgitexternalrepo:user` / `password`); the deprecated `remoteUser` form
keeps 46.1.0's fields exactly (on R13 the ignored `remoteUser`/`remotePassword`, matching its
46.1.0 fixture byte for byte; documented as the reason it is deprecated). Test
`src/__tests__/unit/clients/abapGit/credentialWire.test.ts`: per member, the new form's exact
element or header carries the values and no other header, element, URL or query; the legacy form's
request equals its 46.1.0 fixture; for the
`credentials` form they also occur in no result or `IAdtError` (the deprecated form keeps today's
answer); the remote URLs used are of several hosts (none assumed), and no member parses a host or
adds `.git`. First failure: the new R13 form writes `remoteUser`. Mutations: write the new form's
R13 password also as `remotePassword` → red; switch the legacy R13 to `user`/`password` → the
fixture case red.

**T5.3 New members** (spec §3.2) implementing the T2.1 atoms; `link` gains `folderLogic`, its
`branchName` default kept, deprecated. The legacy members (`getErrorLog`, the deprecated-credential
forms, `pull` by link) keep today's behaviour and answer and gain `@deprecated` pointing to
`getRunLog`, the new form and `pullRepo`; a case per legacy member asserts its request (no `noLog`
or `noResend`),
options and answer equal 46.1.0's (recorded fixtures), apart from the link validation (T5.1). Test `src/__tests__/unit/clients/abapGit/members.test.ts`,
one case per member: method; path from `key`; query (`?create=true` only when true; `filename`,
`version`); Content-Type and Accept (R6's exact Accept; R7 sends Content-Type `…repos.v2+xml`); body
(R10's `abapgitstaging` from `staged` and `comment`); `timeout: 0`; stateless session, also on the
request after a failed one; **cloud R4 and R10 return on `202` as accepted with exactly one request
(no polling); onprem R4 and R10 return on `200` as finished.** Type test
`src/__tests__/typechecks/abapGitResults46.ts`: a 46.x-shaped `results` compiles and a member
without its slot answers `abapGitDocuments`' default. Header pairs for the new routes in
`requestHeaders.test.ts`. First failure: the members do not exist. Mutations: a second request after
`202` → the cloud case red; stateful after a failure → red.

**T5.4 The typed facts exchange** (`src/clients/abapGit/structuredExchange.ts`).
`answeringFactsExchange<T, F, E extends IAbapGitStructuredError>(run, reduce, read:
IAbapGitFactsResultStrategy<T, F>, analyse?: IAbapGitFactsAnalyse<F, E>): Promise<IAdtResponse<T,
E>>` serves every new form, credentialed or anonymous: each new member (`getRunLog`, `pullRepo`, …)
and the new forms of `link` / `checkExternalRepo` (`credentials: null` included); legacy forms are
untouched (T5.3);
these members never call `answeringExchange` (`src/utils/adtResponse.ts`), whose catch hands
`error.response` to `analyse`. **Both paths reduce before either callback:** an answer is reduced
by `abapGitFacts[route]`; a thrown value is reduced by `abapGitErrorFacts(error.response)` into a
fresh `IAbapGitStructuredError` — the thrown object, its `message` and its `response` go no
further. **What injected strategies receive:** the reader `IAbapGitFactsResponse<F>`, `analyse` the
`IAbapGitStructuredError` (R11's `gitHttpStatus` kept); the facts result slots of
`IAbapGitResults` are typed `IAbapGitFactsResultStrategy`, so a raw reader cannot be plugged in.
Shipped default result: `abapGitFacts`. Every new-form call that writes (R2, R4, R5, R10, R14,
R15), every new form with or without a credential, and `getRunLog` send `noLog: true,
noResend: true`; no legacy form does, and `unlink` keeps today's options (a case asserts it sends
neither flag). Test `src/__tests__/unit/clients/abapGit/structuredBoundary.test.ts`, its member
list the table of new forms (a new form without the boundary fails), credentialed and anonymous,
on an answered failure and on a **thrown** one (the
connection throws an error whose `message` and `response` carry the canaries): a recording custom
reader and custom analyser hold no echoed canary (body, headers, status text, `msgText`, `LONGTEXT`,
`T100KEY-V*`, the thrown `message`); R11's error keeps `gitHttpStatus`; the recorded options carry
both flags. Type probe `src/__tests__/typechecks/abapGitFactsExchange.ts`: a raw `IResultStrategy`
as a facts slot and an `IAnalyse` as a credentialed member's `analyse` are `@ts-expect-error`.
First failure: the analyser gets `error.response`. Mutations: pass the thrown response to `analyse`
→ red; drop `noResend` on `push` → red.

**T5.5 Docs.** `docs/usage/ERRATA.md` entries of spec §3.3 with their Code grounds; `README.md` and
`docs/usage/CLIENT_API_REFERENCE.md` (members, credentials, boundary, flags); the `AdtAbapGitClient`
paragraph of `CLAUDE.md` is the controller's, with the owner's approval of the text; `CHANGELOG.md`
46.2.0: the new members and the facts exchange on them; the legacy members unchanged and
deprecated, with their replacements; the link validation of `getErrorLog` and `pull` (an absolute
or foreign link is refused); the `credentials?: never` edge case (an options variable with an
undeclared `credentials` property no longer compiles against the legacy form, or selects the new
form); `unlink` unchanged; the `checkExternalRepo` defect. Run: `npm run build && npm run lint:check && npm run
test:check && npm run test:unit` → green.

**T5.6 Live (controller runs).** `src/__tests__/helpers/test-config.yaml.template` `abapgit` cases,
one per member with `available_in` by route. Helper `src/__tests__/helpers/abapGitRemote.ts`: reads
`~/.config/mcp-abap-adt/sessions/abapgit-live.env` (`ABAPGIT_REPO_URL`, `ABAPGIT_USER`,
`ABAPGIT_TOKEN`; the token never printed or logged), makes and deletes the run's two object-empty
branches through GitHub's Git Data API (the only host-specific code, test-only), keeps the recovery ledger (gitignored, beside the test
config). Unit test `src/__tests__/unit/abapGitLedger.test.ts` over a stubbed R1: a cancelled or
uncorrelated cloud run leaves its fixtures and a ledger entry; a later run waits while an entry is
blank or `R`, cleans up once terminal, verifies the cleanup and removes the entry. First failure:
missing helper. Mutation: clean up while `R` → red.

- `src/__tests__/integration/clients/abapGit/AbapGit.test.ts` — onprem and cloud; skips with its
  reason without the env file, the branch scope, or `/abapgit/repos` in discovery. Works the ledger
  first; every member on the system that serves it; on cloud one cancelled-wait case (must leave a
  ledger entry) and one recovery case (must clear it); `checkRepo` / `switchBranch` success statuses
  logged, not asserted. **The functional gate closes on a backend** when every member case for
  that backend ran and passed; **the T100 gate** when its case "a SAP refusal for the run's known key
  (`getFile` of a filename the repository does not hold, credentialed) carries `messageClass` and
  `messageNumber`" ran and passed there. A skip (no env file, no branch scope, no discovery entry)
  closes neither: the gate stays open and blocks G5.
Run: `bash -o pipefail -c 'npm test -- integration/clients/abapGit 2>&1 | tee test-run.log'` — the
exit status is the run's.

**T5.7 Review and release prep.** Whole-PR review; sibling links removed, every range resolving on
the registry (adt-strategies 0.27.0 already published); root `npm run check`; after publishing, a
clean install of 46.2.0 outside the repo; gate G5 (what blocks it: "Gates per backend" above).

## P6 — server (this repo, PR #374)

Handlers `src/handlers/abapgit/{readonly,high}/handle<Tool>.ts`; group
`src/lib/handlers/groups/AbapGitHandlersGroup.ts`; compact `src/lib/compact/abapGit/{group.ts,
handleHandlerAbapGitGet.ts, handleHandlerAbapGit.ts}`; shared logic `src/lib/abapGit/`; unit tests
`src/__tests__/unit/abapGit/`. Run per task: `npm test -- <test path>`, then `npm test`,
`npm run test:check`, `npm run lint:check` → green.

**T6.1 Registry dependencies.** interfaces-adt-connection `^5.2.0`, interfaces-adt `^30.2.0`,
connection `^25.1.0`, adt-strategies `^0.27.0`, adt-clients `^46.2.0`; `npm install
--ignore-scripts`; lockfile: no `"link": true`, every entry resolved from the registry; `npm run
build && npm test` green before any new code.

**T6.2 Availability.** `src/lib/abapGit/availability.ts`: `abapGitServed(connection):
Promise<boolean>` reads discovery on the request's connection, cached by `adtSystemKey`, dropped by
`registerConnectionResetHook`; a failed read not cached. A `tools/list` hook, installed after
`BaseMcpServer.registerHandlers`, filters the abapGit tools. §9.1 (a): stdio `--deferred-logon`
lists none until the logon, then sends `list_changed`. Test `availability.test.ts`: listed with
`/abapgit/repos`, absent without; absent on a failed read, read again next time; two
`state_handle`s on one system one read, two systems two; the reset hook drops it; per transport
(stdio, SSE, Streamable HTTP under `runWithRequestContext`); **a real `tools/list` releases its
connection use on success and on a failed discovery** (use count back to its value before); an
unlisted tool's call refused with zero further requests; `list_changed` sent once. First failure:
abapGit tools listed without discovery. Mutations: cache a failed read → red; skip the release on
failure → red.

**T6.3 Endpoint binding.** `src/lib/abapGit/approvedEndpoints.ts`: `parseApprovedEndpoints(config)`
(start error for userinfo, query, fragment, non-https); `matchEndpoint(url, endpoints): { sendUrl;
credentials } | undefined` — host compared case-insensitively, path case-sensitively and exactly;
any `https://` host and port, no host list, no host-specific parsing; the credential is a user and a
password or token (spec §5.4).
Sources: stdio file beside the session `.env` (location in `CLI_OPTIONS.md`); Streamable HTTP
headers **per call** (nothing carried over on a `state_handle`); SSE opening-GET headers held by the
instance. **A key-only route whose R1 URL matches only an alias:** the credential is attached (the
alias is the owner's configured equivalent of that endpoint) and no URL is sent, since SAP uses its
stored URL. `CLI_OPTIONS.md` and `AUTHENTICATION.md` state it: a configured trusted alias authorises
that exact URL as a recipient of the credential. Calls with no match are sent anonymously. Test `endpointBinding.test.ts`: exact
match; alias on a URL route sends the configured URL; alias-only match on a key-only route attaches,
sends no URL; `.git`, trailing `/`, port and path case near-misses do not match, host case does; no
match sent anonymously (§9.3 a); userinfo/query/fragment in an argument refused before sending;
key-addressed calls take R1's URL and ignore an argument URL; successive Streamable HTTP calls on
one `state_handle` with another remote, another token or no headers each bind only their own (or
none); SSE headers dropped with the stream; endpoints on several hosts (a GitHub, a GitLab, an Azure
DevOps `…/_git/<repo>` path, a self-hosted host on a non-default port) each match exactly and
attach their own credential. Host agnosticism: `src/__tests__/unit/abapGit/hostAgnostic.test.ts`
finds no host name (`github`, `gitlab`, `bitbucket`, `azure`, `gitea`) in `src/lib/abapGit/`,
`src/handlers/abapgit/` or `src/lib/compact/abapGit/` (plain string search of our own source), and
`toolDescriptionsCarryNoLiterals.test.ts` gains a host-name class. First failure: missing module. Mutations: strip a
trailing `/` → red; carry headers over the `state_handle` → red.

**T6.4 The mandatory pre-dispatch step**, outside the optional `IAccessChecks`.
`src/lib/abapGit/admission.ts`: `admitAbapGitCall(call: AbapGitCall, context):
Promise<AbapGitAdmission>`, run by `BaseMcpServer` for every abapGit tool and compact action before
the call takes a connection for its handler and before foreground or background dispatch, whether
or not an `IAccessChecks` is configured. Order: (1) batch refusal, before any connection acquisition
or discovery, no batch entry or number; (2) import refusal of link and pull from the configured
`allowed-packages` / `allowed-requests`, before any request; (3) availability (T6.2); (4) the R1
pre-read, exactly once, for key-addressed writes, credential-bound calls and R8 — the constraint's
request, with `noLog` — and the fail-closed refusals; (5) the package check through `IAccessChecks`
when configured, with R1's package (key) or `package_name` (branch info); (6) the R8 pairing: R1's
`log_link` must carry `app_log_key`; (7) endpoint binding (T6.3). **The handoff:**
`AbapGitAdmission { repo?: IAbapGitRepo; sendUrl?; credentials? }` is passed to the full handler and
the compact action alike and, in memory, to a background run on its fresh connection, which reads R1
no second time; the run record never holds it. Test `admission.test.ts`: **ordering** — batch
refused with zero connection acquisitions and zero discovery reads; a restriction refusal before R1
with zero requests and zero credential lookups; an admitted call reads exactly one credential-free
R1, a background run included (its fresh connection sends none); **the import matrix** full and
compact × cloud and onprem × `allowed-packages` and `allowed-requests`: link and pull each refused
with zero requests and zero credential lookups, served with no restriction; push, unlink, switch
checked against R1's package, branch info against `package_name`; unknown key, blank package, blank
URL, unreadable R1 each refused; **R8**: a matching repository-and-log pairing reads the log, a
foreign or missing log key is refused before the log request. First failure: with no
`IAccessChecks` the step does not run. Mutations: a second R1 read in the background run → red; the
check after dispatch → red; credentials resolved before the import refusal → red.

**T6.5 Full tools** (spec §4.1, 13 tools, `available_in` and `-ro` membership per row): handlers
over `AdtAbapGitClient` taking the handoff; snake_case arguments, no credential argument, functional
descriptions; `ListAbapGitRepos` with §9.2 (a) filters. Test `abapGitTools.test.ts`: schemas per
variant, `-ro` set contents, deny entries, each handler's request through a recording connection,
answers as the reading's JSON; **the server never selects a legacy form**: a recording
`AdtAbapGitClient` stand-in records every member and options a handler (full and compact, every
action, with and without an endpoint match) calls — only new forms, `listRepos` and `unlink`, and
`link` / `checkExternalRepo` always with a `credentials` key (an object, or `null` when no endpoint
matches); cloud pull and push answer "accepted" after one request, onprem pull
and push "done" in the call; `toolDescriptionsCarryNoLiterals.test.ts` green; listed fixtures
regenerated. First failure: tools absent. Mutation: add `SwitchAbapGitBranch` to cloud → red.

**T6.6 Compact** (spec §4.2): `HandlerAbapGitGet`, `HandlerAbapGit`, top-level arguments, enums per
variant, each action deniable. Test `abapGitCompact.test.ts`: each variant's enum holds only what
that kind serves; each action reaches the full handler's path with the same handoff;
`compactSchemaCompleteness.test.ts` and `compactCoversLow.test.ts` updated. First failure: tools
absent. Mutation: add `switch_branch` to the cloud enum → red.

**T6.7 Background.** `BACKGROUND_TOOLS` (`src/lib/backgroundRuns/tools.ts`) gains onprem
`LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo` and `HandlerAbapGit` (link, pull, push).
Test `abapGitBackground.test.ts`: the source test keeps schemas and the list equal, no cloud schema
declares `background`; `background` on another action refused; `background: true` refused (never
run in the foreground) without a store or a fresh connection; the caller's cancel does not cut a
running run, nor does `DiscardBackgroundRun` a running code run; a Streamable HTTP disconnect leaves
it going, an SSE or stdio close logs its connection off; the record holds tool, object and start
only (no commit text, no credential). First failure: `background` not declared. Mutations: record
the args → red; foreground run on a missing store → red.

**T6.8 Structure and facts at the server.** `withHttpWireLog` (`src/lib/connectionFactory.ts`)
honours `noLog`; answers of credentialed calls and R8 hold §5.3's fields only. Test
`abapGitCanaries.test.ts` over HTTP and RFC stubs, with request-side canaries (query, headers, body,
commit text) and echoed canaries (every dropped place): the wrapper's success branch, its
thrown-error branch (message and body), the connection's request-URL line and the refusal lines,
each asserted separately, hold neither kind of canary and no query; answer, error and run record
hold the kept fields only; a canary in a kept field passes as data. First failure: the wrapper logs
the params. Mutation: log the body in the success branch → red.

**T6.9 Live (controller runs)**, each a `liveSuite` naming where it runs and skipping with its
reason elsewhere; helper `src/__tests__/integration/helpers/abapGitRemote.ts` (as T5.6), ledger
beside `tests/test-config.yaml`, run-owned fixtures per spec §7:

- `src/__tests__/integration/coverage/abapGit.live.test.ts` — onprem and cloud, full tools, spec §7
  steps 1–8; step 7 under an allowed-packages entry (link and pull refused with zero requests; push,
  unlink, switch checked); **T100:** a SAP-generated refusal for the run's known key
  (`GetAbapGitFile` of a filename the repository does not hold) carries `messageClass` and
  `messageNumber`; **recovery:** a cancelled or uncorrelated cloud run must leave a ledger entry, and
  the next run waits for a terminal state, verifies cleanup and must clear it.
- `…/coverage/abapGitCompact.live.test.ts` — onprem and cloud, every action of both compact tools
  once on its system, with the same T100 and recovery cases.
- `…/coverage/abapGitListing.live.test.ts` — onprem and cloud: `tools/list` lists the abapGit tools;
  a `-ro` binary lists exactly the read set.

Run one file at a time: `bash -o pipefail -c 'npm run test:coverage-family --
src/__tests__/integration/coverage/<file> 2>&1 | tee <log>'`.

**T6.10 Docs.** README first screen ("Primary workflows", "Why teams use it") names the git loop; a
Features section on abapGit (per system, approved endpoints, long runs, what an import writes, the
link/pull refusal); `docs/README.md` and `docs/user-guide/README.md` indexes; `npm run docs:tools`
regenerates `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`, and
`compact/tools/generate-docs.js` regenerates `compact/docs/AVAILABLE_TOOLS.md`;
`ACCESS_RESTRICTIONS.md`: the import refusal with spec §4.3's SAP code grounds (child tasks
included), arguments per tool, the R1 pre-read exception and fail-closed cases, both compact tools'
deny values; `AUTHENTICATION.md` and `CLI_OPTIONS.md`: supported hosts as "any git host over HTTPS"
(GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, self-hosted), a worked configuration of a
credential for a non-GitHub remote (stdio file entry and the three HTTP headers), the TLS trust the
SAP system needs (spec §5.4), approved endpoints per transport, the alias
rule on key-only routes; `CHANGELOG.md` 24.2.0 highlights naming the five
dependency minors; `package.json` and every `server*.json` description. Each package's own CHANGELOG
entry is in its own PR (T1.1, T2.1, T3.3, T4.2, T5.5).

**T6.11 Whole-branch review** of #374 (P1–P5 each close with their own whole-PR review).

**T6.12 Delete the goal, spec and plan** once implemented, before the release; what they still owe
goes into #374's description first.

**T6.13 Release.** After #374 merges into `main`, the 24.2.0 release PR #371 merges `main`. The
four gates ("Gates per backend") are recorded again from the server's T6.9 runs — functional and
T100, onprem and cloud, each closed only by an executed passing assertion; a skipped or failed gate
blocks the release.

## Review Focus

| Failure mode most likely to bite | Pinned by |
|---|---|
| A credential leaks through a resend (SAP-endpoint redirects included), a log line, or the raw response handed to an injected reader or analyser | T3.1, T3.2, T5.4, T6.8 |
| Access checks: batch not refused first; link or pull reaching SAP under restrictions; R1 read twice, or after dispatch or a background start | T6.4 |
| Endpoint binding: a near-miss or carried-over header binds; an argument URL trusted on a key route; the legacy `getErrorLog`/`pull` wrapper sends a foreign link | T5.1, T6.3 |
| abapGit listed or callable where discovery lacks it; a failed discovery cached; a listing holding its connection | T6.2 |
| A cloud run misread or its fixtures deleted early: no new log key, a foreign R8 pairing, cleanup before a terminal state | T5.6, T6.4, T6.9 |

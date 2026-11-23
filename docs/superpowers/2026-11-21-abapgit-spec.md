# abapGit — spec

## 1. Intent

Implements [the goal](2026-11-21-abapgit-goal.md): the whole git loop on a package through MCP,
offered exactly where each system's abapGit handler serves it, in the full and compact sets,
reads in `-ro`, every write checked against the access restrictions (link and pull refused
while any are configured), git credentials kept secret, SAP's answer returned as it is — for
credentialed calls and the run log, as structure and facts only (the goal as amended, §2.4). Ships in mcp-abap-adt 24.2.0 on minors of
`@mcp-abap-adt/interfaces-adt`, `@mcp-abap-adt/interfaces-adt-connection`, `@mcp-abap-adt/connection`,
`@mcp-abap-adt/adt-strategies` and `@mcp-abap-adt/adt-clients`.

Grounds used below:

- **Code** — read in the system's own handler (`GetClass`, `GetLocalTypes`, `GetInterface`,
  `SearchObject`, and the simple transformations by a read-only `GET
  /sap/bc/adt/xslt/transformations/<name>/source/main`), 2026-11-21, read-only, in a throwaway
  probe worktree since deleted. Line numbers count from line 1 of the source the read answers
  (`CLASS … DEFINITION`). `on:` is onprem (`ZCL_ABAPGIT_RES_*`, package `ZABAPGIT_ADT`, the
  open-source abapGit ADT backend installed as Z objects), `cl:` is cloud (`CL_ABAPGIT_RES_*`,
  package `A4C_CLM_AGIT_ADT`).
- **Measured** — system, request, status.
- **Inference** — my reading, not checked on a system. Nothing below is built on an Inference
  alone; §10 lists them.

## 2. Routes

### 2.1 Discovery (Measured, `GET /sap/bc/adt/discovery`, 200, both systems, 2026-11-21)

Both list only `/sap/bc/adt/abapgit/repos` and `/sap/bc/adt/abapgit/externalrepoinfo`.
`repos` accepts `'application/abapgit.adt.repo.v3+xml'`, `'…v4+xml'` (onprem) and `v1`–`v4`
(cloud) — the quotes are part of the string SAP writes. `externalrepoinfo` accepts
`application/abapgit.adt.repo.info.ext.request.v2+xml` (both) and `v1` (cloud).
**Discovery does not tell the two route sets apart**: every other route is a plain
`register_resource` (`on: ZCL_ABAPGIT_RES_REPOS_APP->register_resources`, `cl:
CL_ABAPGIT_RES_REPOS_APP->register_resources`, Code). The route set is chosen by system kind;
whether abapGit is there at all, by discovery.

### 2.2 Route table

Every route is under `/sap/bc/adt/abapgit`. "Creds" is where SAP reads git credentials:
**body** = elements of the request document; **hdr** = header `Username` (plain) and header
`Password` (base64; decoded by `cl_http_utility=>decode_base64`, on: in each class, cl:
`CL_ABAPGIT_RES_UTIL->encode_password`).

| # | Route | Method | Request | Response | Creds | Sync | Statuses | Writes | onprem | cloud |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | `/repos` | GET | Accept `application/abapgit.adt.repos.v2+xml` | repos v2 (`abapgitrepo:repositories`) | — | sync | 200; 500 | — | `RES_REPOS->get` L87 (Accept checked by the content handler) | `RES_REPOS->get` L116: any other Accept answers **400** L133 |
| R2 | `/repos` | POST | Content-Type `…repo.v3+xml` (one) or `…repo.v4+xml` (list) | `…repo.object.v2+xml` (`abapObjects:abapObjects`) | body `remoteUser`, `remotePassword` (ST `ZABAPGIT_ST_REPO_POST` / `ABAPGIT_ST_REPO_POST_V3`) | sync | 200 (v3), 201 (v4), 400, 500 | onprem: link **and full pull**; cloud: link only | `post` L193 → `import_repository` → `perform_import` (`GetLocalTypes`, L41–75): `new_online`, then `deserialize` with every overwrite and package warning set to `'Y'` (L65, L69), under `transportRequest` | `post` → `link_repository` L391 → `lcl_abapgit_provider~link_repo` (local types L72): `new_online` only; `folderLogic` (default `FULL`) |
| R3 | `/repos/{key}` | DELETE | — | — | — | sync | 200; **404** for any failure | removes the link | `RES_REPO->delete` L32 | `RES_REPO->delete` L21 |
| R4 | `/repos/{key}/pull` | POST | `…repo.v3+xml` (`abapgitrepo:repository`: `branchName`, `transportRequest`, `remoteUser`, `remotePassword`); cloud also `…repo.pull.req.v1+xml` (selective) | onprem: `…repo.object.v2+xml`, always empty | body | onprem **sync**; cloud **background job** | onprem 200, 500; cloud **202**, 409 (an action runs), 500 | objects of the package; cloud creates a task in the request when the user has none (`TR_INSERT_NEW_COMM`, cl L76) | `RES_REPO_PULL->post` L60–171: `deserialize` L171, every overwrite and package warning `'Y'`; `branchName` is parsed but **never read** (only user, password and request are); result table never filled | `RES_REPO_PULL->post` L150: `schedule_job` L253, 409 L261; without selection pulls `get_all_modified_objects` L239; the job recomputes the decisions (`CL_ABAPGIT_BG_ACTION_PULL`, §4.3) |
| R5 | `/repos/{key}/pull/v2` | POST | as R4 | — | body | **sync** (in the request) | 202, 409, 500 | as R4 | — | `RES_REPO_PULL_V1->post`: `lo_action->execute( )` L270, then 202 L274 |
| R6 | `/repos/{key}/pull/modifiedobjects` | GET | Accept exactly `application/abapgit.adt.repo.pull.modified.objs.v1+xml` | that type (`agitpullmodifiedobjects:abapgitpullmodifiedobjects`: `overwriteObjects`, `packageWarningObjects`) | hdr | sync | 200, 400 (other Accept, L66), 500 | — | — | `RES_PULL_MOD_OBJS->get` L60 |
| R7 | `/repos/{key}/status` | GET | **Content-Type** `…repos.v2+xml` | text `DEMO STATUS` | — | sync | 200, 400 | — | — | `RES_REPO_PULL->get`: answers the fixed text L139 |
| R8 | `/repos/{key}/log/{app_log_key}` | GET | Accept `…repo.object.v2+xml` | object results (type, name, package, status, msgType, msgText) | — | sync | 200, 500 | — | class exists but **not registered**, and its `get` answers an empty table (L58) | `RES_REPO_OBJ_LOG->get` L23 |
| R9 | `/repos/{key}/stage` | GET | Accept `application/abapgit.adt.repo.stage.v1+xml` | that type (`abapgitstaging:abapgitstaging`: `unstaged_objects`, `staged_objects`, `ignored_objects`, `abapgit_comment`) | hdr | sync | 200, 500; cloud **409** plain text while a pull or push runs or waits (L164, L178) | none in SAP or git (refreshes the remote state) | `RES_REPO_STAGE->get` L68 | `RES_REPO_STAGE->get` L103 (adds package and transport links per object) |
| R10 | `/repos/{key}/push` | POST | Content-Type `…repo.stage.v1+xml`: the staging document with `staged_objects` and `abapgit_comment` (comment, author, committer) | none | hdr | onprem **sync**; cloud **background job** | onprem 200, 500; cloud **202**, 409, 500 | a commit in the remote repository | `RES_REPO_PUSH->post` L60: `zcl_abapgit_services_git=>commit` L168 | `RES_REPO_PUSH->post` L29: `schedule_job` L100 |
| R11 | `/repos/{key}/checks` | POST | no body | none | hdr | sync | default status on success (the `set_status( ok )` sits inside the `CATCH`, on L149), 500 | — (an HTTP check `…/info/refs?service=git-upload-pack`, `receive-pack` when credentials are given) | `RES_REPO_CHECKS->post` L77 | `RES_REPO_CHECKS->post` L54; an auth failure is 500 with properties `http_status` (401/403/404) and `LONGTEXT` (`CL_ABAPGIT_REPOSITORY_AUTH`) |
| R12 | `/repos/{key}/files?filename=…&version=local\|remote` | GET | Accept `text/plain` | the file, UTF-8 text | hdr | sync | 200, 500 | — | `RES_REPO_FILES->get` L20 (`filename` mandatory, `version` optional: anything but `remote` reads local) | `RES_REPO_FILES->get` L25 |
| R13 | `/externalrepoinfo` | POST | Content-Type `…repo.info.ext.request.v2+xml` (`abapgitexternalrepo:externalRepoInfoRequest`: `url`, `user`, `password`); Accept `…info.ext.response.v2+xml` | `accessMode`, `branch` list (`sha1`, `name`, `type`, `isHead`, `displayName`) | body `user`, `password` (not `remoteUser`) | sync | 200, 400 (onprem default for any failure, `ZCX_ADT_REST_ABAPGIT->get_http_status` L76), 500 (cloud) | — | `RES_REPO_INFO_EXT->post` L42 | `RES_REPO_INFO_EXT->post` L72 (also reads credentials from the URL) |
| R14 | `/externalrepoinfo/branchinfo` | POST | as R13, plus `branch`, `package` | the one branch, with `folderLogic`, and `accessMode` | body | sync | 200, 500 | **links the repository to `package`, reads `.abapgit`, deletes the link, `COMMIT WORK`** (L184) | — | `RES_REPO_BRANCH_EXT->post` L120 |
| R15 | `/repos/{key}/branches/{branch}?create=true` | POST | no body | none | hdr | sync | default status on success, 500 | the repository's branch; with `create=true` and no such branch, **creates it in the remote** (L58); without `create` and no such branch, **does nothing and answers success** | `RES_REPO_SWITCH->post` L28 | — |

Common to every route (Code, both):

- An error is `ZCX_/CX_ADT_REST_ABAPGIT` (namespace `org.abapgit.adt`) with the T100 message of
  the innermost abapGit exception; its status is the one passed (500 mostly, 404 on R3, 409
  on cloud's running action), else 400.
- Credentials are kept in **static class data** for the ABAP session
  (`ZCL_ABAPGIT_DEFAULT_AUTH_INFO`, `CLASS-DATA gv_user/gv_password` L22–23, on; same use of
  `CL_ABAPGIT_DEFAULT_AUTH_INFO` on cl). A stateful session would keep them for its later
  requests; a stateless request ends its session with them.
- Cloud R2, R13, R14 take credentials out of a URL that carries them (`has_credentials`, cl
  `RES_REPOS` L400); cloud R2's "already linked" message `e002` echoes the URL as given (L522).
- Cloud jobs (R4, R10): the password goes to SAP's secure store keyed by repository, action and
  job count, the user name as a report parameter of the job (`CL_ABAPGIT_BG_ACTION_FACTORY`,
  `cl_abapgit_secstore=>set_password`, L111). That storage is SAP's.
- Run state on cloud lives in R1: `status` (`' '` initial, `R` running, `S`, `W`, `E`, `A`;
  `IF_ABAPGIT_APP_LOG=>c_run_status`), `statusText`, and the `status_link`/`log_link` that R1
  writes once a run has an application log (`cl: RES_REPOS->get_links`). Onprem R1 has no
  status and no log link (its `get_links` has them commented out). Measured 2026-11-22 (GETs
  only): onprem 53 entries, none with a `log_link`, so R8 is cloud-only; cloud 446 entries, 421
  with a `log_link` and a `status_link` ending in the same id; every repository key 12 digits,
  every log key 32 uppercase hex characters, at the end of `/repos/{key}/log/{id}`.

Measured beyond discovery: R1 with Accept v2 → 200 on both (onprem 53 repositories, cloud 446);
with `Accept: */*` → onprem 200, cloud 400 (git-integration research, 2026-11-21).


### 2.3 What each import path can write (Code)

| Path | What it writes |
|---|---|
| onprem link (R2) | creates the repository, then imports the **whole remote**: every `overwrite` and every `warning_package` decision is set to `'Y'` (local types of `ZCL_ABAPGIT_RES_REPOS`, `perform_import` L41–75). Objects go to the root package and the subpackages its folder logic derives (created when absent); an object that already exists in **another package** (`warning_package`) is overwritten too. |
| onprem pull (R4) | the same decisions (`RES_REPO_PULL->post` L60–171), on the branch already linked (`branchName` is not read). Whether onprem's `deserialize` also deletes objects removed from the remote: not read (§10). |
| cloud link (R2) | the repository link only (`link_repo`, local types L72). No object. |
| cloud pull (R4 job, R5 dialog) without selection | the objects R6 would list at submit time (`get_all_modified_objects`, L239), passed to the job. |
| cloud pull with selection (`pull.req.v1`) | the job **recomputes** `deserialize_checks` at run time and sets `'Y'` only for entries whose **name** is in the selection, `'N'` for the rest; a selected entry SAP now plans to delete with another action is `'N'` (`CL_ABAPGIT_BG_ACTION_PULL->…execute`: `deserialize_checks` L113, decisions L123–154, `deserialize` L162). Confirmed delete and delete-add entries are **deleted** (`delete_unnecessary_objects` L39–72). The match is by object name alone, not type. |
| cloud pull with a request | also creates a task under that request for the user when they have none (`TR_INSERT_NEW_COMM`, `RES_REPO_PULL` L76). |
| push (R10), both | a commit in the remote; nothing in SAP. |
| branch switch (R15), onprem | the repository's selected branch; with `create=true` a new remote branch. |
| cloud branch info (R14) | a repository link, deleted and committed in the same request (L184). |

### 2.4 Goal changes (accepted by the owner, written into the goal)

- **Stage is a read, in `-ro`.** R9 is a GET that changes nothing. "Stage" is fulfilled by
  `GetAbapGitStaging` (what changed) plus choosing which of its objects and files go into
  `PushAbapGitRepo`'s `objects` (R10's `staged_objects`): SAP keeps no staging state between them.
- **Cloud branch info is a write, outside `-ro`**, with its package checked (R14 commits a link
  and deletes it).
- **Cloud status comes from the repository list** (R1 `status`, `statusText`, log key). R7, which
  answers a fixed text, stays an adt-clients member with no server tool.
- **Link and pull are refused while any package or request restriction is configured** (§4.3).
- **For credentialed calls and the run log, structure and facts only** (§5.3), not SAP's text.
- Facts that need no goal change: no route reads one repository (R3 is DELETE only); onprem
  serves no error log and no status, and its pull and push answer synchronously.

### 2.5 Session

Every route is stateless: none reads anything but its URI, query, headers and body (Code).
SAP keeps the git credentials in static class data for the ABAP session (§2.2), so a
stateful session would keep them for its later requests. Required: **every abapGit request that
carries credentials or user content, and every new member, goes stateless on the wire, a request
after a failure included** (pinned by test, §7). `unlink` is not among them (owner's ruling): it
carries no credentials, and every credentialed call is stateless, so no credential is ever left in a
stateful session for `unlink` to meet. The
connection takes `stateful` from its session mode, which another caller may have set, so the
request carries its own `stateless: true` (§3.4), which wins over the mode for that request.

## 3. adt-clients additions

Contracts in `@mcp-abap-adt/interfaces-adt` (`src/adt/IAdtAbapGit.ts`), readings in
`@mcp-abap-adt/adt-strategies` (`results/abapGit.ts`), requests and path building in
`AdtAbapGitClient` (`clients/abapGit/*`). One member per endpoint and method; each answers
through the result strategy the client was built with (shipped default: the document as it
arrived) and is judged by the caller's `analyse` (default strict: every non-2xx an error).
**Precedence:** for every **new form** — each new member below, and the new form of `link` and
`checkExternalRepo` (its `credentials` option given: a credential, or `null` for an anonymous call)
— credentialed or anonymous, the structured contract of §5.3 takes precedence over both defaults — the shipped default result is
the facts reading (`abapGitFacts`), not the raw document, and the error carries the status and
the T100 key only, never SAP's text (§3.3's "error with SAP's text" applies to the other
members). **Legacy forms unchanged (owner's ruling, keeping the release a minor):**
`getErrorLog(logLink)`, `pull({ pullLink })` and the `remoteUser`/`remotePassword` forms of `link`,
`pull` and `checkExternalRepo` (and their calls without `credentials`) keep today's wire-typed
callbacks, wire fields, behaviour and answer, marked `@deprecated` with a pointer to `getRunLog`,
the key-based `pullRepo` and the new form.
Their only changes are additive and refuse only new misuse: the link validation of `getErrorLog`
and `pull` below, and `credentials?: never` on their options. Every call that compiled before still
compiles, with one edge case stated plainly: an options **variable** that carried an extra,
undeclared `credentials` property compiled against the legacy form before, and is now rejected (or,
when its value is a credential or `null` and the args fit, selects the new form). It stays a minor
because `credentials` was never a declared field; both CHANGELOGs name it.
The server uses only the new forms and the existing `listRepos` and `unlink`, never a legacy
form (pinned by test). No
retry, no timeout (`timeout: 0`), no lenient reading, no polling. Every member addressed by a
repository builds its path from `key` (URL-encoded segment); no member takes a URL to send to,
except the existing `pull`/`getErrorLog` below.

### 3.1 Credentials and wire fields

`IAbapGitCredentials = { readonly user: string; readonly password: string }`, passed as
`options.credentials`; written exactly where the route reads them and nowhere else:

| Route | Wire fields (ST read, Code) |
|---|---|
| R2 v3/v4 | `abapgitrepo:remoteUser`, `abapgitrepo:remotePassword` |
| R4, R5 `repo.v3` | `abapgitrepo:remoteUser`, `abapgitrepo:remotePassword` (`ABAPGIT_ST_REPO_PULL_V2`, `ZABAPGIT_ST_REPO_PULL`) |
| R4, R5 `pull.req.v1` | `abapgitpullrequest:user`, `abapgitpullrequest:password` (`ABAPGIT_ST_REPO_SELECTIVE_PULL`) |
| R13, R14 | `abapgitexternalrepo:user`, `abapgitexternalrepo:password` (`…INFO_EXT_REQ`, `…RQ_V2`) — the new form only |
| R6, R9–R12, R15 | header `Username`, header `Password` = base64 of the password |

**Defect in the installed client:** `checkExternalRepo` writes `remoteUser`/`remotePassword`
into R13 (`xmlBuilder.js`, `buildExternalRepoInfoBody`); the transformation is
`extensible="deep"` with optional fields, so SAP ignores them and a private repository is
checked anonymously (Code; the effect on a private repository is unmeasured). **Fixed in the new
form only:** the new `checkExternalRepo` form writes `abapgitexternalrepo:user` / `password`. The
deprecated `remoteUser`/`remotePassword` form keeps 46.1.0's wire fields exactly (R2/R4
`remoteUser`/`remotePassword` as before, and on R13 the ignored `remoteUser`/`remotePassword`), so
on R13 it never sent a credential SAP reads — the reason it is deprecated. Giving both forms is a
type error.

No credential is part of a result, an `IAdtError`, or the request an error describes (`method`,
`url`).

### 3.2 Members

| Member | Route | Arguments (options: `IAdtAnalyseOptions<E>`, `credentials?`, and `headers` where noted) | Result slot |
|---|---|---|---|
| `listRepos` | R1 | — | `repos` |
| `link` | R2 v3 | `package`, `url`, `branchName`, `transportRequest?`, `folderLogic?` (cloud); `headers`. New form: `credentials: IAbapGitCredentials \| null` required (`null` = anonymous), args without `remoteUser`/`remotePassword`; the legacy form's options carry `credentials?: never`, so the forms never mix, and at run time the new form is `options.credentials !== undefined` | `linked` (legacy); `linkedFacts` (new form) |
| `unlink` | R3 | `repositoryId`; its `transportRequest` sends a `corrNr` neither handler reads (kept, documented) | `unlinked` |
| `listReposQuiet` (new) | R1 | — ; sends `noLog`, `stateless`, no credential: the server's pre-read (§4.4) | `reposFacts` |
| `pullRepo` (new, key-based) | R4 | `key`, `branchName` (required; the server passes R1's), `transportRequest?`, `selection?` (with it: `pull.req.v1`; the server never sends one, §4.3); `headers` | `repoPulled` |
| `pull` (existing) | R4 by `pullLink` | deprecated; the same wrapper: `pullLink` must be exactly `/sap/bc/adt/abapgit/repos/{key}/pull`, its key goes to `pullRepo`'s path builder, anything else refused; an accepted link keeps today's request, callbacks and answer | `pulled` |
| `pullRepoInDialog` | R5 | as `pullRepo` | `repoPulledInDialog` |
| `getModifiedObjects` | R6 | `key` | `modifiedObjects` |
| `getStatus` | R7 | `key` (sends Content-Type `…repos.v2+xml`) | `status` (text) |
| `getRunLog` (new) | R8 | `key`, `appLogKey` — SAP loads the log by `appLogKey` alone (cl `RES_REPO_OBJ_LOG->get` L23 reads only `app_log_key`), so the pairing is the caller's to check (§4.1) | `runLog` |
| `getErrorLog` (existing) | R8 by link | a wrapper: extracts the `{key}` and `{id}` segments of a `logLink` that is exactly the path `/sap/bc/adt/abapgit/repos/{key}/log/{id}` (no scheme, host, query, fragment, `..` or empty segment), validates them as `getRunLog` does, and calls the same key-based path builder; anything else is **refused** in fixed words, nothing sent. An accepted link keeps today's request, callbacks and answer (deprecated, pointing to `getRunLog`). Kept for existing callers; chosen over deprecation alone, which would leave the absolute-URL hole open. | `errorLog` |
| `getStaging` | R9 | `key` | `staging` |
| `push` | R10 | `key`, `staged: IAbapGitStagedObject[]`, `comment: { text; author: { name; email }; committer: { name; email } }` — all required; the library builds the `abapgitstaging` document | `pushed` (`nothing`) |
| `checkRepo` | R11 | `key` | `checked` (`nothing`) |
| `getFile` | R12 | `key`, `filename`, `version: 'local' \| 'remote'` | `file` (text) |
| `checkExternalRepo` | R13 | `url`; `headers`. New form as `link`'s (`credentials: IAbapGitCredentials \| null`) | `externalRepo` (legacy); `externalRepoFacts` (new form) |
| `getBranchInfo` | R14 | `url`, `branch`, `package`; `headers` | `branchInfo` |
| `switchBranch` | R15 | `key`, `branch`, `create: boolean` (required; `?create=true` only when true) | `switched` (`nothing`) |

- `link.branchName`: **settled** — required in the server tool; the library keeps its
  `refs/heads/master` default for this minor, deprecated, removed in the next adt-clients major.
- `IAbapGitPullSelection = { overwriteObjects; packageWarningObjects }` with the entries R6
  answers, so R6's reading feeds `pullRepo` unchanged.
- **Result slots (owner's ruling): new forms get new slot names.** `repos`, `linked`, `pulled`,
  `errorLog` and `externalRepo` stay as they are, with their `abapGitDocuments` defaults. The new
  slots (`reposFacts`, `linkedFacts`, `externalRepoFacts`, `repoPulled`, `repoPulledInDialog`,
  `runLog`, `modifiedObjects`, `status`, `staging`, `pushed`, `checked`, `file`, `branchInfo`,
  `switched`) are optional, typed `IAbapGitFactsResultStrategy`, and fall back to `abapGitFacts`
  only. A type test pins a 46.x-shaped `results` object compiling unchanged.
- Readings added to adt-strategies (every field SAP sends): `abapGitStaging`,
  `abapGitModifiedObjects`, `abapGitBranchInfo`, `abapGitObjectResults`; `abapGitRepos` gains
  `folderLogic`, the e-mail fields and every link with its `rel`, and keeps its `status` /
  `statusText` contract (`''` when absent, owner's ruling); absence is exposed by a separate new
  reading, `abapGitRepoRunStates` (`runStatus` and `appLogKey` `undefined` when absent; `appLogKey`
  parsed from the `log_link` path only).

### 3.3 Default verdicts and errata entries

Strict: 2xx success, else an error — with SAP's text, except where §3's precedence gives the
structured error. `ERRATA.md` entries, each with its ground:
R4/R10 cloud 202 is accepted, not finished, and R5 202 is finished (Code); R4 onprem 200 says
nothing about objects (Code); R15 with `create: false` on a missing branch changes nothing and
answers success (Code); R9 cloud 409 while a run waits or runs (Code); R3 `corrNr` unread (Code);
R7 answers a fixed text (Code); onprem R4 ignores `branchName` (Code); R11/R15 success status is
**not asserted** until measured (§10).

### 3.4 Request options in `@mcp-abap-adt/interfaces-adt-connection` and `@mcp-abap-adt/connection` (minors)

`IAbapRequestOptions` (interfaces-adt-connection; today `url`, `method`, `timeout`, `data`,
`params`, `headers`) gains two optional flags, implemented by connection (25.0.1 read):

- **`noLog: true`** — nothing of the request or its answer is written anywhere by the connection
  or the server's wrapper. It covers every path that writes today:
  - the refusal preview: `AbstractAbapConnection.ts` L1743–1783 puts `dataPreview(refusal.data)`
    into `errorDetails` and logs it at `error` (or `debug` for 404);
  - the RFC status text: `RfcTransport.ts` L1133 logs `RFC ← <status> <statusText>`, L1135–1137
    the body under `logWire`;
  - both wire loggers (HTTP and RFC `logWire`);
  - the server's `withHttpWireLog` (`connectionFactory.ts` L242–290: params, headers, body, the
    answer's status text and body, the thrown message and body).
  With `noLog`, a line, if any, carries method, the path without query, the integer status and
  the byte count. The error the connection throws keeps its fields for the caller (adt-clients),
  which reduces it to §5.3 before anything else sees it.
- **`stateless: true`** — the request goes stateless on HTTP and RFC whatever the connection's
  session mode (§2.5), and wins over a caller's `x-sap-adt-sessiontype: stateful` header in any
  letter case: the shared stateful verdict (`isStatefulRequest`) answers false for it, and the
  wire strips the conflicting header and the session's context cookie from that request. Sent on
  every new form.
- **`noResend: true`** — gates every replay of the request; the initial CSRF token fetch before a
  mutation still happens. Gated paths:
  - the CSRF recovery (`shouldRetryCsrf`, `AbstractAbapConnection.ts` L1916–1937, resend L1515–1535);
  - the resend after credential renewal (`answerCredentialFailure`, L1866–1901);
  - the dead-pooled-socket resend (`HttpTransport.sendPooled`, L1325–1362) — the owner's named
    exception for ordinary calls (#314); gated here because SAP may already have run an abapGit
    write it read before the socket died.
  - a redirect from SAP's own endpoint: the request goes with `maxRedirects: 0`, so a `3xx` is
    returned, not followed (following would replay the request). This concerns SAP's ADT endpoint
    only; it is not a gate on git hosts.
  The first failure is then the caller's answer.

adt-clients sends both flags on **every new-form write** (R2, R4, R5, R10, R14, R15), on every new
form called with or without a credential, and on `getRunLog` — never on a legacy form of §3, which
keeps today's options, and never on the existing `unlink` (R3), which keeps today's behaviour (no
credential, no user content; a call that succeeds today after CSRF recovery keeps succeeding), since a write carries user-given content (R10's commit message, author and
committer) and may already have run when a replay would start.

## 4. Server tools

Common to all:

- **Availability:** §4.5.
- **Stateless** (§2.5): every call goes through a new form; `ListAbapGitRepos` reads R1 through
  `listReposQuiet` like the pre-read, never through the existing `listRepos`. The one exception is
  `unlink`, unchanged by the owner's ruling: it carries no `stateless` flag and goes stateless only
  as the connection's session mode does (§2.5). **Batch:** no abapGit-specific handling; the consumer decides what goes into
  a batch (owner, 2026-11-22), and what the batch connection answers reaches the consumer as it is.
- **Arguments** never carry a credential. A repository is addressed by `repository_key`.
- **Client forms:** every call goes through a new form of `AdtAbapGitClient` (anonymous ones with
  `credentials: null`) or the existing `listRepos` / `unlink`; never a legacy form (§3).
- **Answer:** the adt-strategies reading as JSON; for a credentialed call and R8, only the
  structured fields of §5.3.

### 4.1 Full set

| Tool | Route | Sys | -ro | Arguments | Result | Package checked | Request checked |
|---|---|---|---|---|---|---|---|
| `ListAbapGitRepos` | R1 (`listReposQuiet`) | both | yes | `package_name?`, `repository_key?` (§9.2) | repositories; on cloud the run state (`status`, `statusText`, log key) | — | — |
| `CheckAbapGitExternalRepo` | R13 | both | yes | `url` | accessMode, branches | — | — |
| `GetAbapGitBranchInfo` | R14 | cloud | no | `url`, `branch`, `package_name` | the branch with folderLogic, accessMode | `package_name` | — |
| `LinkAbapGitRepo` | R2 v3 | both | no | `package_name`, `url`, `branch`, `transport_request?`, `folder_logic?` (cloud) | done (SAP's object list is empty on both, Code) | refused under restrictions (§4.3) | refused under restrictions |
| `UnlinkAbapGitRepo` | R3 | both | no | `repository_key` | done | repository's package (§4.4) | — |
| `PullAbapGitRepo` | R4 | both | no | `repository_key`, `transport_request?` — no branch: the server sends R1's `branchName` (cloud reads it; onprem ignores it, Code) | onprem: done; cloud: accepted | refused under restrictions (§4.3) | refused under restrictions |
| `GetAbapGitModifiedObjects` | R6 | cloud | yes | `repository_key` | overwriteObjects, packageWarningObjects (each with its package) | — | — |
| `GetAbapGitStaging` | R9 | both | yes | `repository_key` | unstaged and ignored objects with files; SAP's proposed author and committer | — | — |
| `PushAbapGitRepo` | R10 | both | no | `repository_key`, `objects` (objects and files chosen from the staging answer), `comment`, `author` {name, email}, `committer` {name, email} — all required, no default | onprem: done; cloud: accepted | repository's package (§4.4) | — |
| `CheckAbapGitRepo` | R11 | both | yes | `repository_key` | SAP's status, or SAP's error (cloud: `http_status`) | — | — |
| `GetAbapGitFile` | R12 | both | yes | `repository_key`, `filename`, `version` (required) | the file text | — | — |
| `SwitchAbapGitBranch` | R15 | onprem | no | `repository_key`, `branch`, `create` (required) | SAP's status | repository's package (§4.4) | — |
| `GetAbapGitErrorLog` | R8 | cloud | yes | `repository_key`, `app_log_key` — never a URL. The server first reads R1 and requires that entry's `log_link` to carry exactly this `app_log_key`; else refused, nothing sent | object results: type, name, package, status, message type (no message text, §5.3) | — | — |

Author and committer are required because R10 takes them from the body only (Code) and the
server keeps no earlier staging answer; the staging answer shows SAP's proposal to copy.

### 4.2 Compact set

- `HandlerAbapGitGet` (compact and compact `-ro`) — `action`: `repos`, `external_repo`,
  `modified_objects` (cloud), `staging`, `checks`, `file`, `error_log` (cloud).
- `HandlerAbapGit` (compact only) — `action`: `link`, `unlink`, `pull`, `push`,
  `switch_branch` (onprem), `branch_info` (cloud, guarded by its `package_name` like `link`).

Arguments are top-level and the full tool's, so the existing hook sees `package_name`,
`transport_request` and `repository_key`. Each action is deniable (`HandlerAbapGit.push`);
schema and description narrowed as `HandlerSystem`'s are; a variant's enum holds only what that
system kind serves.

### 4.3 Restrictions (owner's decision)

**While any `allowed-packages` or `allowed-requests` entry is configured, link and pull are
refused on both systems** (full tools and compact actions), in fixed words
(`abapgit_import_not_allowed`: "linking or pulling a repository writes objects that the allowed
packages and requests cannot bound, so it is refused while access restrictions are
configured"), nothing sent. The grounds, for ACCESS_RESTRICTIONS (all Code, §2.3):

- onprem link (`perform_import`, local types of `ZCL_ABAPGIT_RES_REPOS` L41–75) and onprem pull
  (`ZCL_ABAPGIT_RES_REPO_PULL->post` L60–171) set every overwrite and package-warning decision
  to `'Y'`: they write subpackages and objects held by other packages;
- cloud pull's job recomputes its decisions at run time and matches the selection by object
  name only (`CL_ABAPGIT_BG_ACTION_PULL`, `deserialize_checks` L113, decisions L123–154), and
  deletes confirmed deletions (`delete_unnecessary_objects` L39–72): a selection checked before
  submit does not bound what the job writes. No selective pull is offered;
- cloud pull with a request creates a task under it for the user when they have none
  (`CL_ABAPGIT_RES_REPO_PULL->check_and_create_task`, `TR_INSERT_NEW_COMM` L76), and "an entry
  for a request does not cover its tasks".

With no restriction configured, link and pull are served; SAP's authorization decides.

Push, unlink, branch switch, cloud branch info and the reads stay under restrictions:

| Tool | Package checked | From |
|---|---|---|
| `GetAbapGitBranchInfo` | `package_name` | the argument. Ruling: it is the package SAP links into — R14's temporary link targets `request_data-package` (`CL_ABAPGIT_RES_REPO_BRANCH_EXT->post` L120 → `link_repo` → `new_online( iv_package = package )`, deleted at L184); no repository entry exists yet to read it from. The repository-list rule is for operations on an already linked repository. |
| `PushAbapGitRepo`, `UnlinkAbapGitRepo`, `SwitchAbapGitBranch` | the repository's package | the R1 entry for `repository_key` (§4.4) |
| reads | — | reads are not checked, as for every tool |

### 4.4 Where the key-based checks run

- One step in the access layer (`accessChecks.ts`), for the full tool and the compact action
  alike, **before foreground or background dispatch** (before a background run is started) and
  before any credential is resolved. It reads top-level arguments, which is where every abapGit
  argument is (§4.2).
- For a call addressed by `repository_key`, the server first sends exactly one request
  (`listReposQuiet`):
  `GET /sap/bc/adt/abapgit/repos`, Accept `application/abapgit.adt.repos.v2+xml`, stateless, no
  credential, no wire log. It is sent for every key-addressed call that writes, binds a
  credential (§5.1) or reads the run log (§4.1); its entry supplies the package, the remote URL,
  the branch and the log key. ACCESS_RESTRICTIONS states it as an exception to "makes no call to
  SAP to find an object's package", like the package-tree read: "before anything is sent"
  becomes "before anything but this read is sent".
- **Fail closed:** a key R1 does not list, an entry with a blank package or URL, or an unreadable
  R1 refuses the call in fixed words. A blank `package_name` on `branch_info` or `link` is
  refused, not passed as other tools' blanks are.

### 4.5 Discovery and listing

Owner decision (2026-11-23): the abapGit tools are always listed; whether the system serves
abapGit is decided at call time only.

- **Registration** stays by system kind at instance creation (`BaseMcpServer.registerHandlers`,
  `available_in`): cloud-only `GetAbapGitBranchInfo`, `GetAbapGitModifiedObjects`,
  `GetAbapGitErrorLog`; onprem-only `SwitchAbapGitBranch`; compact enums per variant.
- **Listing:** `tools/list` is the SDK's own reply, untouched: it lists the abapGit tools (full)
  and `HandlerAbapGitGet` / `HandlerAbapGit` (compact) without any SAP request — no logon, no
  discovery — on every transport, stdio's `--deferred-logon` included (its first listing logs on
  to no one, and its first birth sends no `notifications/tools/list_changed`).
- **Calls:** an abapGit call checks availability (admission step 4, §4.4) and, on a system whose
  discovery does not list `/sap/bc/adt/abapgit/repos`, is refused `abapgit_not_served` ("abapGit
  is not served by this system") in fixed words, nothing else sent.
- **Reading and caching:** discovery is read on the call's own connection
  (`GET /sap/bc/adt/discovery`) and cached **by the system that connection actually reaches**
  (its system key, `adtSystemKey`), never by `state_handle` or instance; kept for the process; no clock expires
  it (no timeouts); one read in flight per system key. A failed or unreadable discovery is not
  cached: that call is refused (fail closed) and the next call reads again. The kept answer is
  dropped by the connection-reset hook (`registerConnectionResetHook`).
- **The plain registration** (`HandlerExporter`, an embedder's `McpServer` without
  `BaseMcpServer`) has no admission, so it registers no abapGit tool: abapGit tools are served by
  the MCP server only.

### 4.6 Long runs, pinned

| Action | onprem | cloud |
|---|---|---|
| link | R2 synchronous (full import). In the call; with `background: true` a code run. | R2 synchronous, link only: in the call; no `background`. |
| pull | R4 synchronous: as link. | R4: 202 at once; SAP's job runs; state through `ListAbapGitRepos`, log through `GetAbapGitErrorLog`. **No cancel exists** (no route). No `background`. |
| push | R10 synchronous: as link. | R10: 202 at once, as pull. No cancel. No `background`. |
| switch, unlink, checks, reads | in the call; no `background`. | in the call; no `background`. |

- `background` is declared only on onprem `LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo`
  and, in compact, on the onprem variant of `HandlerAbapGit` (boolean, optional, **no default**,
  described for `link`, `pull`, `push` only; another action given `background` is refused). The
  cloud variants' schemas do not declare it. These join `BACKGROUND_TOOLS`
  (`backgroundRuns/tools.ts`), whose source test keeps schemas and the list equal.
- **`background: true` is refused, never run in the foreground,** when the host has no background
  store or a fresh connection for the run cannot be made (the existing fixed words of
  `contract.ts`); the caller may call again without it.
- Code-run behaviour as it is today (`backgroundRuns/run.ts`): the run detaches from the caller's
  cancel; `DiscardBackgroundRun` cannot cut a running code run; a Streamable HTTP disconnect leaves
  calls and runs going; an SSE stream close or stdio close logs the run's connection off, which
  **cuts SAP's dialog mid-import** (a partly imported package; named in the docs). An in-call
  write is not cut by the client's cancel either: it ends on SAP's answer.
- The background-run record and stored answer of an abapGit run hold only §5.3's fields.

### 4.7 CSRF resend (owner's question, answered from code)

- **SAP refuses a bad CSRF token before any abapGit resource handler runs.** ADT's ICF
  application `CL_ADT_WB_RES_APP` (identical on onprem and cloud): its local class
  `lcl_rfc_request_proxy_abs->handle_request` calls `handle_csrf( )` (L117, which validates by
  `m_server->validate_xsrf_token` L80 and raises `CX_ADT_REST_CSRF_TOKEN`) **before**
  `call_adt_rfc_endpoint` (L125), which reaches the resource handlers. The REST library's own
  `CL_REST_HTTP_HANDLER->if_http_extension~handle_request` does the same: `handle_csrf_token` (L180)
  before `get_root_handler( )->handle( )` (identical on both). Which proxy serves a given request
  (`get_request_proxy`) was not read; both paths check first.
- **But the connector resends on more than SAP's refusal.** `@mcp-abap-adt/connection` 25.0.1
  `AbstractAbapConnection.shouldRetryCsrf` (L1916–1937) resends on a 403 whose text holds `CSRF`,
  on **any status whose text holds `CSRF token`**, and on a 401 to a mutation sent without a token.
  An abapGit handler's own 500 whose message carried those words would be resent after the handler
  ran. That branch is not grounded as "before".
- **Therefore (owner's rule, "after" case):** the credentialed abapGit requests are sent with
  `noResend` (§3.4), which also gates the renewal and pooled-socket resends; a CSRF refusal reaches the model as a structured error
  and the call may be made again. `@mcp-abap-adt/connection` joins the release order. The
  SAP-side "before" is recorded with its ground for every other caller of the resend.
- Over RFC, ADT requests go to `SADT_REST_RFC_ENDPOINT` without the ICF application; whether the
  connector's CSRF path runs at all on RFC: unverified (§10).

## 5. Credentials

No tool argument carries a credential.

### 5.1 Bound to an approved endpoint

- The credential configuration lists **approved endpoints**: each an exact remote URL — scheme
  (`https`), host (lower-cased), a non-default port when there is one, and path — with its
  credential and optional trusted aliases of the same form. Any host and any port: there is no host
  list and no host-specific parsing (§5.4). The credential is what SAP's abapGit takes, a user and a
  password or token (`IAbapGitCredentials`). No `.git` or trailing `/` is merged:
  `…/repo`, `…/repo/` and `…/repo.git` are three endpoints. Userinfo, query or fragment in a
  configured URL or alias is a start error; in a `url` argument a refusal before sending.
- A credential is attached only when the target matches an approved URL or one of its aliases
  exactly:
  - `CheckAbapGitExternalRepo`, `GetAbapGitBranchInfo`, `LinkAbapGitRepo`: the `url` argument;
    when an alias matches, the **configured URL** is what SAP is sent;
  - every key-addressed tool: the `url` of the R1 entry for that key, read first (§4.4) — never a
    URL from the arguments.
- **No match:** sent without credentials (SAP answers as for a public repository; a private one
  fails with SAP's structured error). Recommended over refusing, since the credential never leaves
  for an unbound host either way (§9.3).
- Unverified: whether a key's stored URL can change after linking (no ADT route changes it; R1 is
  read on every call).

### 5.2 Scope per transport

- **stdio:** the destination's configuration (a file beside its session `.env`, its location in
  CLI_OPTIONS), read at start.
- **Streamable HTTP:** per call, headers the client application sets (`x-abapgit-remote`,
  `x-abapgit-user`, `x-abapgit-token`): one approved endpoint for that call only.
- **SSE:** the same headers on the opening GET, held by that stream's instance and dropped with it.

### 5.3 Structure and facts only (owner's decision; no redactor)

For every abapGit request that carries a credential, and for the R8 read, the server keeps only
the fields named below, parsed from SAP's document by the adt-strategies facts reading. Anything
not named — raw bodies, headers, status texts, message texts, exception texts, message variables
and properties — is dropped **before** any log line, the tool answer and the background-run record
(the rule of auth-providers' "No server text reaches anything"). Names, paths, branch names and
author/committer are data the user and the repository supply: they are kept as named fields, and
no attempt is made to detect a credential in them.

| Route | Kept fields ← XML source (ST read, Code) |
|---|---|
| every route | `status` ← HTTP status (integer) |
| R1 (`listReposQuiet`) | `repos[]`: `key`, `package`, `url`, `branchName`, `runStatus`, `statusText`, `appLogKey` (from `log_link`) |
| every error | `messageClass` ← `properties/entry[@key="T100KEY-ID"]`, `messageNumber` ← `entry[@key="T100KEY-NO"]` (three-digit string, as SAP writes it) — the keys `src/lib/debugger/readings.ts` L494 already reads. Code, both systems: `CL_ADT_EXCEPTION_UTILITY->create_exc_response` adds `T100KEY-ID` and `T100KEY-NO` for every exception that `IS INSTANCE OF if_t100_message` (L94–97), and `T100KEY-V1`…`V4` from the message variables (L49, dropped); the abapGit exceptions `ZCX_ADT_REST_ABAPGIT` / `CX_ADT_REST_ABAPGIT` implement `if_t100_dyn_msg` and raise `MESSAGE ID … NUMBER …` (`raise_with_error`). That `if_t100_dyn_msg` includes `if_t100_message` is SAP's standard interface, not read here. Absent → `status` alone |
| R11 cloud auth error | also `gitHttpStatus` ← `properties/entry[@key="http_status"]` as an integer (`CL_ABAPGIT_REPOSITORY_AUTH->handle_auth_exception`); `LONGTEXT` dropped |
| R2, R4 (onprem), R8 | `objects[]` ← `abapObjects:abapObject`: `type` ← `abapObjects:type`, `name` ← `abapObjects:name`, `package` ← `abapObjects:package`, `status` ← `abapObjects:status`, `messageType` ← `abapObjects:msgType` (one of `S`, `I`, `W`, `E`, `A`, documented as SAP's message type); `abapObjects:msgText` dropped (`ZABAPGIT_ST_REPO_POST_RES`, `ABAPGIT_ST_REPO_POST_RES_V2`) |
| R6 | `overwriteObjects[]`, `packageWarningObjects[]` ← `agitpullmodifiedobjects:abapgitobjects`: `uri`, `type`, `name`, `packageName` ← the `adtcore` object-reference attributes (include `sadt_object_reference`, not read: §10), `action` ← `@agitpullmodifiedobjects:action` (integer); `@actionDescription` dropped |
| R9 | `unstaged[]`, `staged[]`, `ignored[]` ← `abapgitstaging:*_objects/abapgitobject`: `wbkey` ← `@wbkey`, `version` ← `@version`, `uri`, `type`, `name`, `packageName` ← the object reference; `files[]` ← `abapgitfile`: `name` ← `@name`, `path` ← `@path`, `localState` ← `@localState`, `remoteState` ← `@remoteState`; `author` / `committer` {`name`, `email`} ← `abapgit_comment/author|committer/@name, @email`; links and `@comment` dropped |
| R13, R14 | `accessMode` ← `abapgitexternalrepo:accessMode`; `branches[]` ← `abapgitexternalrepo:branch`: `sha1` ← `sha1` (onprem) or `sha` (cloud, `ABAPGIT_ST_REPO_INFO_EXT_RS_V2`), `name`, `type`, `isHead`; R14 also keeps `folderLogic` ← `abapgitexternalrepo:folderLogic` (a fixed SAP value, `FULL` or `PREFIX`); `displayName` and links dropped |
| R12 | `content` ← the response text, **only as the content of the named file** (`filename`, `version` echoed from the arguments). Returning the repository's own content is the purpose of the call; it is never logged and never kept as a whole response body elsewhere |
| R10, R15 | `status` alone |

- **R10's commit message** (the user's `comment`) is sent to SAP and excluded from every log line
  and from the background-run record (which keeps tool, object and start only).
- Wire logging is off for these requests (`noLog`, §3.4).
- Answers through the new forms are the facts reading, credentialed or anonymous (R13 for an
  unbound URL included; R7 keeps its fixed text as `text`). R1 and R3 (existing `listRepos`,
  `unlink`) keep the ordinary answer. R1's answer is the repository list SAP keeps (cloud strips credentials from URLs at
  link, Code; userinfo is refused before link).

### 5.4 Hosts (Code, both systems, 2026-11-21, read-only)

The remote can be any git host SAP reaches over HTTPS (GitHub, GitLab, Bitbucket, Azure DevOps,
Gitea, a self-hosted server). Read: `ZCL_ABAPGIT_HTTP`, `ZCL_ABAPGIT_GIT_TRANSPORT`,
`ZCL_ABAPGIT_HTTP_CLIENT`, `ZCL_ABAPGIT_HTTP_AGENT`, `ZCL_ABAPGIT_HTTP_ADT`, `ZCL_ABAPGIT_URL`
(onprem) and their `CL_` twins (cloud; `CL_ABAPGIT_HTTP_ADT` does not exist there). A search of
every source for `github`, `gitlab`, `bitbucket`, `azure`, `visualstudio`, `gitea` and `codecommit`
finds only:

- **User agent, not a branch:** `get_agent` (on `ZCL_ABAPGIT_HTTP` L231–237, cl `CL_ABAPGIT_HTTP`
  L312–318) sends `git/2.0 (abapGit <version>)` to every host; its comment names Bitbucket's need
  for the `git/` prefix.
- **abapGit's own repository:** `is_abapgit_repo` (on `ZCL_ABAPGIT_URL` L74–80, cl `CL_ABAPGIT_URL`
  L134–140) is true for a `github.com` URL ending `/abapGit` or `/abapGit.git`. It is not in the
  transport or authentication path read here; its callers were not read.

No host decides anything else:

- **Authentication** is chosen by the server's `www-authenticate` answer, not by host:
  `acquire_login_details` (on `ZCL_ABAPGIT_HTTP` L86–135, the `CASE` L117–133; cl `CL_ABAPGIT_HTTP`
  L61–110, `CASE` L92–108) runs Digest when the scheme is Digest, else Basic with the user and the
  password (`ii_client->authenticate`). A token goes as the password.
- **URL parsing** takes any host and an optional `.git`: `regex` (on `ZCL_ABAPGIT_URL` L120–132, cl
  `CL_ABAPGIT_URL` L198–210) matches `^(https?://[^/]*)(.*/)(.*)\.git$`, else the same without `.git`.
- `*_GIT_TRANSPORT`, `*_HTTP_CLIENT` and `*_HTTP_AGENT` name no host on either system. The TLS
  identity is fixed, not per host: the abapGit exit's `get_ssl_id` (`*_HTTP_AGENT` L86), `ANONYM`
  in onprem `ZCL_ABAPGIT_HTTP_ADT->determine_access_level` (L41), `<client>_CA` in cloud
  `CL_ABAPGIT_HTTP->determine_access_level` (L236). The host's certificate must be trusted there.

## 6. Errors

- Credentialed calls and R8: the structured error of §5.3. Other abapGit calls: SAP's answer as
  every other ADT tool gives it. No retry, no resolution, no merge; credentialed calls go with `noResend` (§3.4, §4.7).
- Server refusals before sending, fixed words: access codes; `abapgit_import_not_allowed`
  (§4.3); unknown key, blank package or URL, unreadable R1 (§4.4); a run-log key R1 does not show
  for that repository (§4.1); URL with userinfo, query or fragment; abapGit not served (§4.5);
  `background` where it is not declared or cannot run (§4.6).

## 7. Tests

**Unit** (interfaces-adt typechecks, adt-strategies, adt-clients, connection, server):

- per member: method, path built from `key`, query, Content-Type, Accept, body, the wire fields of
  §3.1, credentials in no other header or element; the `getErrorLog`/`pull` wrappers calling the
  key-based builders and refusing absolute, foreign or malformed links; the 46.x `results` type
  test;
- readings and the §5.3 structured contract over sanitised captured documents;
- server: schemas per variant and set (`background` only where §4.6 declares it), `-ro`
  membership, deny entries, the R1 pre-read and fail-closed cases,
  the import refusal under each restriction kind, the run-log pairing, approved-endpoint matching
  (exact, alias sending the configured URL, `.git` / trailing `/` / port / case near-misses, no
  match sent anonymously), userinfo/query/fragment refusal, `tools/list` listing without a request
  and call refusal per transport and on a failed discovery, stateless session type on every abapGit
  request including after an error;
- **canaries** for the user, the raw token and the base64 password, over HTTP and RFC: a stubbed
  SAP echoes each value in every **dropped** place (body text, headers, status text, `msgText`,
  `actionDescription`, `displayName`, exception text, message variables, `LONGTEXT`) and the tests
  assert that the answer, error, run record and log lines hold exactly §5.3's kept fields and none
  of the values; kept fields are exercised field by field, with the canary placed in a kept field
  shown to pass through as data (names, paths, file content are not inspected);
- connection: a 500 whose body holds `CSRF token` and a 403 `CSRF token validation failed` are each
  sent once with `noResend` and resent once without; the renewal and pooled-socket resends are not
  taken with `noResend`; `noLog` writes no body, header or status text on HTTP and RFC.

**Live** (adt-clients integration and server `liveSuite`), each stating where it runs, skipped
elsewhere with the reason, route-specific cases gated by system kind in code:

- **Repository:** the private test repository from `abapgit-live.env` (`ABAPGIT_REPO_URL`,
  `ABAPGIT_USER`, `ABAPGIT_TOKEN`); without it the suite skips with that reason.
- **Run-owned fixtures:** every name carries the run id — the package, the ABAP objects the test
  creates (so parallel runs and SAP's package-warning approval touch only this run's objects), and
  two branches.
- **Object-empty branches:** the run creates its branch through GitHub's REST API with the test
  token as a commit holding only the abapGit settings file (`.abapgit.xml`, starting folder
  `/src/`) and no object (Git Data API: blob, tree, commit, then `POST …/git/refs`), and a second
  branch from it for the switch; both deleted at the end (`DELETE …/git/refs/heads/{name}`).
  Whether the token has the scope: unverified (§10); without it the suite skips with that reason.
- **Package:** onprem: transportable, under the configured super package, in the configured
  software component, recorded in the configured request (a `$` package cannot be transported, so
  the request path would not run). cloud: under the configured super package in `ZLOCAL` (no
  `$TMP` on cloud; no request).
- **Flow and assertions:**
  1. check external repo (the run's branch is listed); cloud: branch info for the run's package;
  2. link on the run's branch; assert R1 lists the key with the package, URL and branch;
  3. create one run-owned object; staging shows it unstaged; push it with explicit author and
     committer; cloud: wait (below); assert the remote branch holds its file (`GetAbapGitFile`
     `version: remote`);
  4. change the file in the remote through GitHub's API; pull; cloud: wait; assert the object's
     source changed in SAP; cloud R5: an adt-clients live case only (the server does not use it);
  5. onprem: switch to the second branch, assert R1's `branchName` changed; switch back, assert;
  6. checks; file local and remote;
  7. under a configured allowed-packages entry: link and pull refused with nothing sent; push,
     unlink and switch checked against the repository's package;
  8. cleanup: only after every cloud run of this repository is terminal; unlink (assert R1 no longer
     lists the key), delete the objects and the package (assert gone), delete the branches.
- **Waiting on a cloud run:** before submitting, note R1's log key for the repository; poll R1
  until the entry shows a **new** log key **and** a terminal `status` (`S`, `W`, `E`, `A`); blank
  (initial) and `R` mean waiting. Read the run log by that key (paired as §4.1) and assert it is
  this run's. That a new log key appears per run is Inference (§10). The poll ends on SAP's answer
  or the test's own cancel; no server timeout.
- **Recovery:** when a poll is cancelled, or a run cannot be correlated (no new log key, or a
  status that never becomes terminal before the test's cancel), the run does **not** unlink or
  delete. It keeps its fixtures, records their names in a gitignored ledger beside the test
  config, and fails naming them. The ledger entry keeps the backend and the pre-submit log key
  L0. Every later run first works the ledger: for each recorded repository it reads R1 and waits
  until the entry shows a log key other than L0 **and** a terminal status — a terminal status
  under L0 is the previous run's and keeps waiting — then cleans up as in step 8 and removes the
  entry.
- R11 and R15 success statuses are logged, not asserted, until measured (§10).

## 8. Docs

- README: first screen ("Primary workflows", "Why teams use it") names the git loop; a Features
  section on abapGit: offered per system, approved endpoints, long-run behaviour, what an import
  writes (§2.3), and that link and pull are refused under access restrictions.
- Tool references: `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`,
  the generated compact page.
- `ACCESS_RESTRICTIONS.md`: the import refusal with §4.3's SAP code grounds (SAP-created child
  tasks included), the arguments per tool, the R1 pre-read and fail-closed cases, both compact
  tools' deny values.
- `AUTHENTICATION.md`, `CLI_OPTIONS.md`: approved endpoints per transport; supported hosts named as
  "any git host over HTTPS" with examples (GitHub, GitLab, Bitbucket, Azure DevOps, Gitea,
  self-hosted), a credential configured for a non-GitHub remote, and the TLS trust SAP needs (§5.4).
- adt-clients README and `ERRATA.md` (§3.3); the `checkExternalRepo` defect in its CHANGELOG;
  connection's two options and the CSRF ground (§4.7) in its CHANGELOG.
- CHANGELOG highlights: 24.2.0, interfaces-adt-connection, interfaces-adt, connection,
  adt-strategies, adt-clients.
- **Release order:** interfaces-adt-connection → interfaces-adt → connection, each published to
  the registry before the next builds on it; then adt-strategies and adt-clients in one PR and one
  publish run (owner's ruling: strategies first, then clients, both tested together from their
  tarballs); then the server from the registry.

## 9. Open decisions

1. **stdio `--deferred-logon`** (no connection at the first listing). Decided by the owner
   (2026-11-23), superseding (a) and (b): the abapGit tools are always listed, with no SAP
   request, and availability is decided at call time (§4.5); no `list_changed` is sent.
2. **"Read one repository".** (a) `package_name` / `repository_key` filters on `ListAbapGitRepos`,
   applied by a result strategy over the one R1 answer; (b) list only. **Recommend (a)** (cloud's
   list: 446 entries, 1 MB).
3. **No approved endpoint matches:** (a) send without credentials; (b) refuse. **Recommend (a)**.
4. **onprem long writes:** (a) in the call only; (b) opt-in `background: true` as a code run (§4.6).
   **Recommend (b)**.

## 10. Not verified

What a decision above rests on is marked ★.

- Every status except R1's and discovery's is from Code, not a live request; R11 and R15 success
  (framework default, Inference) stay out of asserted contracts.
- That an abapGit route's error document actually carries `T100KEY-ID` / `T100KEY-NO`: Code says
  it does (`CL_ADT_EXCEPTION_UTILITY` L94–97, both systems); not measured on these routes. The
  first live run asserts it.
- ★ Whether the connector's CSRF path runs on RFC (§4.7).
- Which `CL_ADT_WB_RES_APP` proxy serves a request (`get_request_proxy`, not read); both check CSRF
  first.
- Whether a key's stored URL can change after linking (§5.1).
- ★ Whether a cloud run always writes a new log key to R1 (live correlation, §7).
- ★ Whether the test token may create and delete branches (live fixtures, §7).
- R15 with a branch name holding `/` — needs a POST; measured in the first live run.
- R10's object reference fields (`sadt_object_reference` include, not read); the live push verifies
  the builder.
- Whether onprem `deserialize` deletes objects removed from the remote (moot under restrictions:
  refused; documented as unknown otherwise).
- The private-repository effect of the `checkExternalRepo` field defect.
- No read-only GET could settle these without a link, so none was sent in this revision.

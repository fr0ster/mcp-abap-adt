# abapGit — spec

## 1. Intent

Implements [the goal](2026-11-21-abapgit-goal.md): the whole git loop on a package through MCP,
offered exactly where each system's abapGit handler serves it, in the full and compact sets,
reads in `-ro`, every write checked against the access restrictions, git credentials kept
secret, SAP's answer returned as it is. Ships in mcp-abap-adt 24.2.0 on minors of
`@mcp-abap-adt/interfaces-adt`, `@mcp-abap-adt/adt-strategies` and `@mcp-abap-adt/adt-clients`.

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
  status and no log link (its `get_links` has them commented out).

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

### 2.4 What this changes in the goal's words (for the owner)

- **Stage is a read.** R9 is a GET that changes nothing. "Stage" in the goal is fulfilled by
  `GetAbapGitStaging` (R9, what changed) plus choosing which of its objects and files go into
  `PushAbapGitRepo`'s `objects` (R10's `staged_objects`): SAP keeps no staging state between
  the two.
- **Cloud branch info writes and undoes a link** (R14).
- **No route reads one repository** (R3 is DELETE only).
- **Onprem serves no error log and no status**; its pull and push answer synchronously.
- **Cloud status** (R7) answers a fixed text; the run state is R1's `status`.

§9.2 and §9.4 propose the goal changes these need.

### 2.5 Session

Every route is stateless: none reads anything but its URI, query, headers and body (Code).
SAP keeps the git credentials in static class data for the ABAP session (§2.2), so a
stateful session would keep them for its later requests. Required: **every abapGit request
goes stateless on the wire, a request after a failure included** (pinned by test, §7).

## 3. adt-clients additions

Contracts in `@mcp-abap-adt/interfaces-adt` (`src/adt/IAdtAbapGit.ts`), readings in
`@mcp-abap-adt/adt-strategies` (`results/abapGit.ts`), requests and path building in
`AdtAbapGitClient` (`clients/abapGit/*`). One member per endpoint and method; each answers
through the result strategy the client was built with (shipped default: the document as it
arrived) and is judged by the caller's `analyse` (default strict: every non-2xx an error). No
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
| R13, R14 | `abapgitexternalrepo:user`, `abapgitexternalrepo:password` (`…INFO_EXT_REQ`, `…RQ_V2`) |
| R6, R9–R12, R15 | header `Username`, header `Password` = base64 of the password |

**Defect in the installed client:** `checkExternalRepo` writes `remoteUser`/`remotePassword`
into R13 (`xmlBuilder.js`, `buildExternalRepoInfoBody`); the transformation is
`extensible="deep"` with optional fields, so SAP ignores them and a private repository is
checked anonymously (Code; the effect on a private repository is unmeasured). Fixed in this
minor. The deprecated `remoteUser`/`remotePassword` argument fields stay (minor) and map to the
same wire fields; giving both forms is a type error.

No credential is part of a result, an `IAdtError`, or the request an error describes (`method`,
`url`).

### 3.2 Members

| Member | Route | Arguments (options: `IAdtAnalyseOptions<E>`, `credentials?`, and `headers` where noted) | Result slot |
|---|---|---|---|
| `listRepos` | R1 | — | `repos` |
| `link` | R2 v3 | `package`, `url`, `branchName`, `transportRequest?`, `folderLogic?` (cloud); `headers` | `linked` |
| `unlink` | R3 | `repositoryId`; its `transportRequest` sends a `corrNr` neither handler reads (kept, documented) | `unlinked` |
| `pullRepo` (new, key-based) | R4 | `key`, `branchName`, `transportRequest?`, `selection?` (with it: `pull.req.v1`); `headers` | `pulled` |
| `pull` (existing) | R4 by `pullLink` | deprecated; `pullLink` refused unless it is a path `/sap/bc/adt/abapgit/repos/{key}/pull` (no scheme, no host) | `pulled` |
| `pullRepoInDialog` | R5 | as `pullRepo` | `pulled` |
| `getModifiedObjects` | R6 | `key` | `modifiedObjects` |
| `getStatus` | R7 | `key` (sends Content-Type `…repos.v2+xml`) | `status` (text) |
| `getRunLog` (new) | R8 | `key`, `appLogKey` | `errorLog` |
| `getErrorLog` (existing) | R8 by link | **refuses** (fixed words, nothing sent) a `logLink` that is not a path `/sap/bc/adt/abapgit/repos/{key}/log/{id}` — an absolute URL, another path, `..`, a query; kept for existing callers. Chosen over deprecation alone, which would leave the absolute-URL hole open. | `errorLog` |
| `getStaging` | R9 | `key` | `staging` |
| `push` | R10 | `key`, `staged: IAbapGitStagedObject[]`, `comment: { text; author: { name; email }; committer: { name; email } }` — all required; the library builds the `abapgitstaging` document | `pushed` (`nothing`) |
| `checkRepo` | R11 | `key` | `checked` (`nothing`) |
| `getFile` | R12 | `key`, `filename`, `version: 'local' \| 'remote'` | `file` (text) |
| `checkExternalRepo` | R13 | `url`; `headers` | `externalRepo` |
| `getBranchInfo` | R14 | `url`, `branch`, `package`; `headers` | `branchInfo` |
| `switchBranch` | R15 | `key`, `branch`, `create: boolean` (required; `?create=true` only when true) | `switched` (`nothing`) |

- `link.branchName`: **settled** — required in the server tool; the library keeps its
  `refs/heads/master` default for this minor, deprecated, removed in the next adt-clients major.
- `IAbapGitPullSelection = { overwriteObjects; packageWarningObjects }` with the entries R6
  answers, so R6's reading feeds `pullRepo` unchanged.
- **Existing custom result strategies keep working:** the new slots of `IAbapGitResults` are
  optional; a member whose slot a caller's `results` does not give answers its shipped default
  (`abapGitDocuments`). A type test pins a 46.x-shaped `results` object compiling unchanged.
- Readings added to adt-strategies (every field SAP sends): `abapGitStaging`,
  `abapGitModifiedObjects`, `abapGitBranchInfo`, `abapGitObjectResults`; `abapGitRepos` gains
  `status`, `statusText`, `folderLogic`, the e-mail fields, every link with its `rel`, and the
  application log key parsed from the `log_link`/`status_link` paths.

### 3.3 Default verdicts and errata entries

Strict: 2xx success, else an error with SAP's text. `ERRATA.md` entries, each with its ground:
R4/R10 cloud 202 is accepted, not finished, and R5 202 is finished (Code); R4 onprem 200 says
nothing about objects (Code); R15 with `create: false` on a missing branch changes nothing and
answers success (Code); R9 cloud 409 while a run waits or runs (Code); R3 `corrNr` unread (Code);
R7 answers a fixed text (Code); onprem R4 ignores `branchName` (Code); R11/R15 success status is
**not asserted** until measured (§10).

## 4. Server tools

Common to all:

- **Availability:** §4.5.
- **Stateless** (§2.5). **Batch:** every abapGit tool and action is refused in batch mode before
  anything is sent and before any credential is resolved; no batch entry and no number is taken
  (`batch_not_recordable`, the existing refusal for calls that cannot be recorded).
- **Arguments** never carry a credential. A repository is addressed by `repository_key`.
- **Answer:** the adt-strategies reading as JSON, credentials removed (§5.3); an error is SAP's
  answer (§6).

### 4.1 Full set

| Tool | Route | Sys | -ro | Arguments | Result | Package checked | Request checked |
|---|---|---|---|---|---|---|---|
| `ListAbapGitRepos` | R1 | both | yes | `package_name?`, `repository_key?` (§9.3) | repositories; on cloud the run state (`status`, `statusText`, log key) | — | — |
| `CheckAbapGitExternalRepo` | R13 | both | yes | `url` | accessMode, branches | — | — |
| `GetAbapGitBranchInfo` | R14 | cloud | no (§9.2) | `url`, `branch`, `package_name` | the branch with folderLogic, accessMode | `package_name` | — |
| `LinkAbapGitRepo` | R2 v3 | both | no | `package_name`, `url`, `branch`, `transport_request?`, `folder_logic?` (cloud) | SAP's answer (empty object list on both, Code) | `package_name` + §4.3 | `transport_request` |
| `UnlinkAbapGitRepo` | R3 | both | no | `repository_key` | done | repository's package (§4.4) | — |
| `PullAbapGitRepo` | R4 | both | no | `repository_key`, `branch` (cloud; onprem has none, Code), `transport_request?`, `objects?` (cloud: the R6 selection) | onprem: done; cloud: accepted, with the run's log key when R1 shows it | repository's package + §4.3 | `transport_request` |
| `GetAbapGitModifiedObjects` | R6 | cloud | yes | `repository_key` | overwriteObjects, packageWarningObjects (each with its package) | — | — |
| `GetAbapGitStaging` | R9 | both | yes (§9.2) | `repository_key` | unstaged and ignored objects with files; SAP's proposed author and committer | — | — |
| `PushAbapGitRepo` | R10 | both | no | `repository_key`, `objects` (objects and files chosen from the staging answer), `comment`, `author` {name, email}, `committer` {name, email} — all required, no default | onprem: done; cloud: accepted | repository's package (§4.4) | — |
| `CheckAbapGitRepo` | R11 | both | yes | `repository_key` | SAP's status, or SAP's error (cloud: `http_status`) | — | — |
| `GetAbapGitFile` | R12 | both | yes | `repository_key`, `filename`, `version` (required) | the file text | — | — |
| `SwitchAbapGitBranch` | R15 | onprem | no | `repository_key`, `branch`, `create` (required) | SAP's status | repository's package (§4.4) | — |
| `GetAbapGitErrorLog` | R8 | cloud | yes | `repository_key`, `app_log_key` (from `ListAbapGitRepos`) — never a URL | object results | — | — |

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

### 4.3 Packages SAP writes beyond the root (P0) — §9.5 decides

The package check of `package_name` or the repository's package cannot bound what §2.3 lists:
onprem link and pull write the whole remote, into subpackages and into objects held by other
packages; cloud pull writes what its job recomputes (by name) and deletes confirmed deletions.
With no package or request restriction configured, nothing changes: SAP's authorization decides.
With one configured, §9.5.

### 4.4 Where the key-based checks run

- One step in the access layer (`accessChecks.ts`), for the full tool and the compact action
  alike, **before foreground or background dispatch** (before a background run is started) and
  before any credential is resolved.
- For a call addressed by `repository_key`, the server first sends exactly one request:
  `GET /sap/bc/adt/abapgit/repos` with Accept `application/abapgit.adt.repos.v2+xml` (stateless,
  no credential). It is sent when a package restriction is configured or a credential would be
  attached (§5.1). ACCESS_RESTRICTIONS states it as an exception to "makes no call to SAP to find
  an object's package", like the package-tree read; "before anything is sent" becomes "before
  anything but this read is sent".
- **Fail closed:** a key R1 does not list, an entry with a blank package, or an unreadable R1
  refuses the call in fixed words. Unlike other tools, a blank `package_name` on `link` or
  `branch_info` is refused, not passed.
- The R1 entry's `url` is the URL the credential binding (§5.1) is matched against.

### 4.5 Discovery and listing

Required by the goal: a system whose discovery does not list `/sap/bc/adt/abapgit/repos` lists
no abapGit tool and no abapGit compact action. Per transport:

- **stdio:** discovery is read once the connection exists, before the tools are listed. With
  `--deferred-logon` no connection exists at listing time: §9.1.
- **SSE:** read on the opening GET's connection, before its instance answers `tools/list`.
- **Streamable HTTP:** each request carries its destination and gets its connection
  (Inference about the per-request wiring, to confirm in the plan); `tools/list` reads discovery
  on that request's connection, cached per system key for the process.
- **Failed discovery** (error, no collection): no abapGit tool is listed (fail closed), and the
  start line / log names the reason.
- Compact enums are built from the same answer and the system kind.
- `available_in`: cloud-only `GetAbapGitBranchInfo`, `GetAbapGitModifiedObjects`,
  `GetAbapGitErrorLog`; onprem-only `SwitchAbapGitBranch`.

### 4.6 Long runs, pinned

| Action | onprem | cloud |
|---|---|---|
| link | R2 synchronous (full import). In the call by default; `background: true` makes it a code run (§9.6). | R2 synchronous, link only: in the call. |
| pull | R4 synchronous: as link. | R4: answers 202 at once; SAP's job runs; state through `ListAbapGitRepos`, log through `GetAbapGitErrorLog`. **No cancel exists** (no route). |
| push | R10 synchronous: as link. | R10: 202 at once, as pull. No cancel. |
| switch, unlink, checks, reads | in the call. | in the call. |

Code-run behaviour as the server has it today (`backgroundRuns/tools.ts`, `run.ts`): the run
detaches from the caller's cancel; `DiscardBackgroundRun` cannot cut a running code run; a
Streamable HTTP disconnect leaves calls and runs going; an SSE stream close or stdio close logs
the run's connection off, which **cuts SAP's dialog mid-import** — a partly imported package,
named in the docs. A host with no background store refuses `background: true` in its fixed
words; the call then runs in the call. An in-call write is not cut by the client's cancel
either (no SAP cancel for a running dialog request): it ends on SAP's answer.

**Existing connector behaviour for the owner (not changed here):** on a CSRF failure the
connection fetches a new token and **resends the request** (`AbstractAbapConnection`, L1515–1527,
`@mcp-abap-adt/connection`). For R2/R4/R10/R15 that is a resend of a credentialed write. SAP
refuses CSRF before the handler runs (Inference), so the first attempt should have done nothing.

## 5. Credentials

No tool argument carries a credential (tool-argument credentials are dropped).

### 5.1 Bound to the remote

- The server's credential configuration maps a **remote URL** to its credential. Key: scheme +
  host (lower-cased, default port dropped) + path (trailing `/` and `.git` normalised), compared
  exactly; userinfo, query or fragment in a configured key is a start error.
- A credential is attached only to a call whose target remote matches its key exactly:
  - `CheckAbapGitExternalRepo`, `GetAbapGitBranchInfo`, `LinkAbapGitRepo`: the `url` argument;
  - every key-addressed tool: the `url` of the R1 entry for that key, read first (§4.4) — never a
    URL from the arguments.
- A `url` argument with userinfo is refused before sending (cloud would take credentials from
  it, onprem would store and echo it; §2.2).
- **No match** (§9.7): (a) sent without credentials (SAP answers as it does for a public repo;
  a private one fails with SAP's error); (b) refused in fixed words. **Recommend (a)**: a public
  repository needs none, and the credential never leaves for an unbound host either way.

### 5.2 Scope per transport

- **stdio:** the destination's configuration (a file beside its session `.env`, its location in
  CLI_OPTIONS), read at start.
- **Streamable HTTP:** per call, request headers the client application sets
  (`x-abapgit-remote`, `x-abapgit-user`, `x-abapgit-token`): one binding per call, used for that
  call only.
- **SSE:** the same headers on the opening GET, held by that stream's instance and dropped with
  it.

### 5.3 Kept out of every output

- **Values:** the user, the raw token and the base64 of the token are the secret values of a
  call. Every text leaving the server for that call — the answer, an error, a background run's
  stored answer (`BackgroundRunAnswer`, which keeps SAP's text), a log line — has each of those
  exact values replaced by `[redacted]` before it is written. This covers SAP echoing a
  credential, R8's message texts included. It changes SAP's text only where it carried the
  secret; a short user name may also mask an identical unrelated word (accepted, documented).
- **Wire logs:** HTTP (`withHttpWireLog`, `connectionFactory.ts`, which prints bodies): the body
  of every request under `/sap/bc/adt/abapgit/` is logged by its size alone; `Username` joins the
  redacted header names (`Password` is already covered by `password`). RFC: the connection
  package prints bodies under `DEBUG_RFC_WIRE` with no per-request switch the server is known to
  have (unverified); until one exists, a credentialed abapGit call is refused while
  `DEBUG_RFC_WIRE` is on.
- **Records:** the background-run record keeps tool, object and start (`BackgroundRunStart`); the
  run's closure holds the credential only until SAP answers.

## 6. Errors

- SAP's answer reaches the model as it is (status, T100 text, cloud's `http_status` and
  `LONGTEXT`, cloud's 409 text), with only §5.3's exact secret values replaced. No retry, no
  resolution, no merge.
- Server refusals before sending, fixed words: access codes; unknown key or blank package
  (§4.4); URL with userinfo; abapGit not served; batch mode; `DEBUG_RFC_WIRE` with a credential;
  a credential with no match only if §9.7 chooses (b).

## 7. Tests

**Unit** (interfaces-adt typechecks, adt-strategies, adt-clients, server):

- per member: method, path built from `key`, query, Content-Type, Accept, body, the wire fields
  of §3.1, credentials in no other header or element; `getErrorLog`/`pull` refusing absolute and
  foreign links; the 46.x `results` type test;
- readings over sanitised captured documents;
- strict verdicts and `analyse` per errata entry;
- server: schemas per variant and set, `-ro` membership, deny entries, batch refusal with no
  entry, the R1 pre-read and fail-closed cases, credential binding (match, near-miss host or path,
  no match), userinfo refusal, discovery listing per transport and on a failed discovery, the
  stateless session type on every abapGit request including after an error;
- **canaries** for the user, the raw token and the base64 password, over HTTP and RFC, through
  success, SAP error (a stubbed SAP echoing each value), refusal, background run, both wire logs:
  none appears in any answer, error, run record or log line.

**Live** (adt-clients integration and server `liveSuite`), each stating where it runs, skipped
elsewhere with the reason, route-specific cases gated by system kind in code:

- **Repository:** the private test repository from `abapgit-live.env` (`ABAPGIT_REPO_URL`,
  `ABAPGIT_USER`, `ABAPGIT_TOKEN`); without it the suite skips with that reason.
- **Isolated branches:** each run creates its own branches from the default branch through
  GitHub's REST API with the test token (`POST /repos/{owner}/{repo}/git/refs`) and deletes them
  at the end (`DELETE …/git/refs/heads/{name}`), including after a failure. Two per run: the
  run's branch and a second one for the switch. Whether the token has the scope: unverified
  (§10); without it the suite skips with that reason.
- **Package:** created and deleted by the suite. onprem: transportable, under the configured super
  package, in the configured software component, recorded in the configured request (a `$`
  package cannot be transported, so the request path would not run). cloud: under the configured
  super package in `ZLOCAL` (no `$TMP` on cloud; no request).
- **Flow and assertions:**
  1. check external repo (branches include the run's branch); cloud: branch info;
  2. link on the run's branch; assert R1 lists the key with the package, URL and branch; onprem:
     assert the remote's objects are in the package (`GetPackageContents`);
  3. create one object in the package; staging shows it unstaged; push it with explicit author and
     committer; cloud: wait for the run (below); assert the remote branch has the file
     (`GetAbapGitFile` `version: remote`);
  4. change the file in the remote through GitHub's API; onprem: pull, assert the object changed;
     cloud: modified objects lists it, selective pull of it, wait, assert the change; cloud R5:
     adt-clients live case only (the server does not use it);
  5. onprem: switch to the second branch, assert R1's `branchName`; switch back;
  6. checks; file local and remote;
  7. cleanup, also after a failure: wait for any cloud run to reach a terminal status first, then
     unlink (assert R1 no longer lists the key), delete the objects and the package (assert gone),
     delete the branches.
- **Waiting on a cloud run:** note R1's log key before submitting; poll R1 until the entry shows
  a **new** log key and a terminal `status` (`S`, `W`, `E`, `A`); blank (`' '`, initial) and `R`
  mean waiting. Read the error log by that key and assert it belongs to this run. That a new log
  key appears per run: Inference (§10). The poll ends on SAP's answer or the test's own cancel;
  no server timeout.
- R11 and R15 success statuses are logged, not asserted, until measured (§10).

## 8. Docs

- README: first screen ("Primary workflows", "Why teams use it") names the git loop; a Features
  section on abapGit: offered per system, credential binding, long-run behaviour, what an import
  can write (§2.3).
- Tool references: `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`,
  the generated compact page.
- `ACCESS_RESTRICTIONS.md`: arguments per tool, the R1 pre-read, fail-closed cases, §9.5's rule,
  the cloud task note, both compact tools' deny values.
- `AUTHENTICATION.md`, `CLI_OPTIONS.md`: the credential binding per transport.
- adt-clients README and `ERRATA.md` (§3.3); the `checkExternalRepo` defect in its CHANGELOG.
- CHANGELOG highlights: 24.2.0, interfaces-adt, adt-strategies, adt-clients.
- Release order: interfaces-adt → adt-strategies → adt-clients, each published before the next
  builds on it; then the server from the registry.

## 9. Open decisions

1. **Listing under stdio `--deferred-logon`** (no connection when tools are listed). (a) list no
   abapGit tool until the logon, then send `notifications/tools/list_changed`; (b) list none for
   the process (a goal change: deferred logon lists no abapGit). The old "list and refuse later"
   option is dropped: it breaks the goal. **Recommend (a)**; whether the supported clients reload
   on that notification is unverified.
2. **Goal change — `-ro` lists.** Proposed: move "stage" into the `-ro` reads (R9 changes
   nothing; staging is the choice of R10's objects) and move "read its branches" on cloud out of
   `-ro` (R14 commits a link and deletes it), with its `package_name` checked as for link.
   **Recommend** accepting it; the spec is written to it.
3. **"Read one repository".** (a) filters on `ListAbapGitRepos` applied by a result strategy over
   the one R1 answer; (b) list only. **Recommend (a)** (cloud's list is 446 entries, 1 MB).
4. **Goal change — status.** Proposed: the cloud status operation is `ListAbapGitRepos`'s run
   state (R1 `status`, `statusText`, log key); R7 stays a client member (`getStatus`, served) with
   no server tool, since it answers a fixed text. **Recommend** accepting it.
5. **abapGit writes under package or request restrictions** (§4.3):
   (a) refused whenever any package or request restriction is configured;
   (b) allowed only when a subtree entry covers the repository's root package, the writes into
   other packages documented as SAP's behaviour that cannot be bounded;
   (c) cloud: read R6 first, check every listed object's package (the warning entries name the
   other package), and send a selective pull of exactly the allowed list — the job only says
   `'Y'` to names in it (Code), though it matches names without type and recomputes at run time;
   onprem offers no such list.
   **Recommend (c) for cloud pull and (a) for onprem link and pull**; push, unlink and switch
   write nothing into packages and keep the plain root-package check.
   Requests: cloud pull may create a task under the checked request; "an entry for a request does
   not cover its tasks" is about the request a call names, and the task is SAP's, not an argument.
   **Recommend** stating that, rather than refusing cloud pull when requests are restricted.
6. **onprem long writes.** (a) in the call only; (b) opt-in `background: true` as a code run
   (§4.6), with its cut-on-stream-close behaviour. **Recommend (b)**, opt-in.
7. **A call whose remote matches no credential:** (a) send anonymously, (b) refuse.
   **Recommend (a)** (§5.1).
8. **The CSRF resend** of credentialed writes (§4.6): leave as connector behaviour, or ask the
   connector for a no-resend option on these calls. Flagged, no recommendation beyond leaving it
   until a refusal-before-handler is measured.

## 10. Not verified

- Every status except R1's and discovery's is from Code, not a live request; R11 and R15 success
  (framework default, Inference) is kept out of asserted contracts.
- R15 with a branch name holding `/` in the `{branch}` segment — needs a POST; to measure in the
  first live run.
- R10's object reference fields come from the `sadt_object_reference` include (not read); the
  live push verifies the builder.
- Whether onprem `deserialize` deletes objects removed from the remote.
- Whether a cloud run always writes a new application log key to R1 (live flow relies on it).
- The private-repository effect of the `checkExternalRepo` field defect.
- Whether the test token can create and delete branches.
- Per-request connection wiring of Streamable HTTP for discovery (§4.5).
- An RFC per-request body switch in the connection package (§5.3).
- Whether CSRF is refused before the abapGit handler runs (§4.6).
- No read-only GET could settle any of these without a link, so none was sent in this revision.

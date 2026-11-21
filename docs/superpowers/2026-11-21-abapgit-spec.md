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
| R2 | `/repos` | POST | Content-Type `…repo.v3+xml` (one) or `…repo.v4+xml` (list) | `…repo.object.v2+xml` (`abapObjects:abapObjects`) | body `remoteUser`, `remotePassword` | sync | 200 (v3), 201 (v4), 400, 500 | onprem: link **and full pull**; cloud: link only | `post` L193 → `import_repository` → `perform_import` (`GetLocalTypes`, L41–75): `new_online`, then `deserialize` with every overwrite and package warning set to `'Y'` (L65, L69), under `transportRequest` | `post` → `link_repository` L391 → `lcl_abapgit_provider~link_repo` (local types L72): `new_online` only; `folderLogic` (default `FULL`) |
| R3 | `/repos/{key}` | DELETE | — | — | — | sync | 200; **404** for any failure | removes the link | `RES_REPO->delete` L32 | `RES_REPO->delete` L21 |
| R4 | `/repos/{key}/pull` | POST | `…repo.v3+xml` (`abapgitrepo:repository`: `branchName`, `transportRequest`, `remoteUser`, `remotePassword`); cloud also `…repo.pull.req.v1+xml` (selective) | onprem: `…repo.object.v2+xml`, always empty | body | onprem **sync**; cloud **background job** | onprem 200, 500; cloud **202**, 409 (an action runs), 500 | objects of the package; cloud creates a task in the request when the user has none (`TR_INSERT_NEW_COMM`, cl L76) | `RES_REPO_PULL->post` L60: `deserialize` L171, all overwrites `'Y'`; result table never filled | `RES_REPO_PULL->post` L150: `schedule_job` L253, 409 L261; without selection pulls `get_all_modified_objects` L239 |
| R5 | `/repos/{key}/pull/v2` | POST | as R4 | — | body | **sync** (in the request) | 202, 409, 500 | as R4 | — | `RES_REPO_PULL_V1->post`: `lo_action->execute( )` L270, then 202 L274 |
| R6 | `/repos/{key}/pull/modifiedobjects` | GET | Accept exactly `application/abapgit.adt.repo.pull.modified.objs.v1+xml` | that type (`agitpullmodifiedobjects:abapgitpullmodifiedobjects`: `overwriteObjects`, `packageWarningObjects`) | hdr | sync | 200, 400 (other Accept, L66), 500 | — | — | `RES_PULL_MOD_OBJS->get` L60 |
| R7 | `/repos/{key}/status` | GET | **Content-Type** `…repos.v2+xml` | text `DEMO STATUS` | — | sync | 200, 400 | — | — | `RES_REPO_PULL->get`: answers the fixed text L139 |
| R8 | `/repos/{key}/log/{app_log_key}` | GET | Accept `…repo.object.v2+xml` | object results (type, name, package, status, msgType, msgText) | — | sync | 200, 500 | — | class exists but **not registered**, and its `get` answers an empty table (L58) | `RES_REPO_OBJ_LOG->get` L23 |
| R9 | `/repos/{key}/stage` | GET | Accept `application/abapgit.adt.repo.stage.v1+xml` | that type (`abapgitstaging:abapgitstaging`: `unstaged_objects`, `staged_objects`, `ignored_objects`, `abapgit_comment`) | hdr | sync | 200, 500; cloud **409** plain text while a pull or push runs or waits (L164, L178) | none in SAP or git (refreshes the remote state) | `RES_REPO_STAGE->get` L68 | `RES_REPO_STAGE->get` L103 (adds package and transport links per object) |
| R10 | `/repos/{key}/push` | POST | Content-Type `…repo.stage.v1+xml`: the staging document with `staged_objects` and `abapgit_comment` (comment, author, committer) | none | hdr | onprem **sync**; cloud **background job** | onprem 200, 500; cloud **202**, 409, 500 | a commit in the remote repository | `RES_REPO_PUSH->post` L60: `zcl_abapgit_services_git=>commit` L168 | `RES_REPO_PUSH->post` L29: `schedule_job` L100 |
| R11 | `/repos/{key}/checks` | POST | no body | none | hdr | sync | default status on success (the `set_status( ok )` sits inside the `CATCH`, on L149), 500 | — (an HTTP check `…/info/refs?service=git-upload-pack`, `receive-pack` when credentials are given) | `RES_REPO_CHECKS->post` L77 | `RES_REPO_CHECKS->post` L54; an auth failure is 500 with properties `http_status` (401/403/404) and `LONGTEXT` (`CL_ABAPGIT_REPOSITORY_AUTH`) |
| R12 | `/repos/{key}/files?filename=…&version=local\|remote` | GET | Accept `text/plain` | the file, UTF-8 text | hdr | sync | 200, 500 | — | `RES_REPO_FILES->get` L20 (`filename` mandatory, `version` optional: anything but `remote` reads local) | `RES_REPO_FILES->get` L25 |
| R13 | `/externalrepoinfo` | POST | Content-Type `…repo.info.ext.request.v2+xml` (`abapgitexternalrepo:externalRepoInfoRequest`: `url`, `user`, `password`); Accept `…info.ext.response.v2+xml` | `accessMode`, `branch` list (`sha1`, `name`, `type`, `isHead`, `displayName`) | body | sync | 200, 400 (onprem default for any failure, `ZCX_ADT_REST_ABAPGIT->get_http_status` L76), 500 (cloud) | — | `RES_REPO_INFO_EXT->post` L42 | `RES_REPO_INFO_EXT->post` L72 (also reads credentials from the URL) |
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

### 2.3 What this changes in the goal's words (for the owner)

- **Stage is a read.** R9 is a GET that changes nothing; "staging" is choosing the objects that
  go into R10's body. The goal lists stage among the writes.
- **Cloud branch info writes and undoes a link** (R14) in one committed request. The goal lists
  it among the `-ro` reads.
- **No route reads one repository**: R3 has only DELETE on both systems. "Read one" is a reading
  of R1.
- **Onprem serves no error log** (R8 unregistered, its body empty anyway) and **no status**.
  Its pull and push are synchronous: their errors come in the answer.
- **Cloud status** (R7) answers a fixed text; the run state is R1's `status`.
- **Onprem link pulls everything and overwrites every local object** (R2); onprem and default
  cloud pull overwrite every modified object (R4); only cloud's selective pull (R4/R5 with
  `pull.req.v1`, fed by R6) lets the caller choose.

These go to §9 where a choice is needed; nothing in the goal is changed here.

### 2.4 Session

Every route runs **stateless**. None needs a lock or a session-bound handle (Code: no route
reads anything but its URI, query, headers and body). Stateless is also what keeps the
credentials of one request out of the next (static class data, §2.2).

## 3. adt-clients additions

Contracts in `@mcp-abap-adt/interfaces-adt` (`src/adt/IAdtAbapGit.ts`), readings in
`@mcp-abap-adt/adt-strategies` (`results/abapGit.ts`), requests in `AdtAbapGitClient`
(`clients/abapGit/*`). One member per endpoint and method; every member answers through the
result strategy the client was built with (shipped default: the document as it arrived) and is
judged by the caller's `analyse` (default: strict, every non-2xx an error). No retry, no
timeout (`timeout: 0` as today), no lenient reading, no polling.

### 3.1 Credentials

```ts
interface IAbapGitCredentials { readonly user: string; readonly password: string }
```

Passed as `options.credentials` on every member whose route reads them (R2, R4, R5, R6, R9–R15).
The member writes them where the route reads them — body elements for R2, R4, R5, R13, R14;
`Username` + base64 `Password` headers for R6, R9–R12, R15 — and nowhere else. They are not
part of a result, of an `IAdtError`, or of the request an error describes (`method` and `url`
only). The existing `remoteUser`/`remotePassword` fields of `IAbapGitLinkArgs`,
`IAbapGitPullArgs`, `IAbapGitExternalRepoCredentials` stay (minor release) and are marked
deprecated; both given is a type error (a union of the two forms).

### 3.2 Members

Existing (unchanged requests unless noted): `listRepos` (R1), `link` (R2; adds `folderLogic?`;
**drops the `'refs/heads/master'` default** — `branchName` becomes required, the library does not
guess a branch: a breaking type change, so it is an open decision, §9.7), `unlink` (R3; its
`transportRequest` sends a `corrNr` neither handler reads — kept, documented as unread),
`pull` (R4), `getErrorLog` (R8), `checkExternalRepo` (R13).

New:

| Member | Route | Signature (options always `IAdtAnalyseOptions<E>` + what is listed) | Result slot |
|---|---|---|---|
| `pull` (extended) | R4 | `args.selection?: IAbapGitPullSelection` — with it, Content-Type `…repo.pull.req.v1+xml` and the `abapgitpullrequest` document; without, as today | `pulled` |
| `pullInDialog` | R5 | `(args: IAbapGitPullArgs, options: { headers; credentials? })` | `pulled` |
| `getModifiedObjects` | R6 | `(args: { key: string }, options: { credentials? })` | `modifiedObjects` |
| `getStatus` | R7 | only if §9.4 says so | `status` |
| `getStaging` | R9 | `(args: { key: string }, options: { credentials? })` | `staging` |
| `push` | R10 | `(args: { key: string; staged: readonly IAbapGitStagedObject[]; comment: IAbapGitComment }, options: { credentials? })` — the library builds the `abapgitstaging` document (`abapgitobject` with `wbkey`, `version`, the `adtcore` object reference, `abapgitfile` with `name`, `path`, `localState`, `remoteState`) | `pushed` (`nothing`) |
| `checkRepo` | R11 | `(args: { key: string }, options: { credentials? })` | `checked` (`nothing`) |
| `getFile` | R12 | `(args: { key: string; filename: string; version: 'local' \| 'remote' }, options: { credentials? })` | `file` (text) |
| `getBranchInfo` | R14 | `(args: { url; branch; package }, options: { headers; credentials? })` | `branchInfo` |
| `switchBranch` | R15 | `(args: { key: string; branch: string; create: boolean }, options: { credentials? })` — `create` required, sent as `?create=true` only when true | `switched` (`nothing`) |

`IAbapGitPullSelection = { overwriteObjects; packageWarningObjects }`, each a list of `{ object:
{ uri?, type, name, packageName? }, action, actionDescription? }` as R6 answers it, so R6's reading
feeds R4 unchanged. `IAbapGitStagedObject` and `IAbapGitComment` are the R9 reading's own types.
`IAbapGitResults` gains the slots above; `abapGitDocuments` maps them to `rawDocument` /
`rawText` / `nothing`.

Readings added to adt-strategies (every field SAP sends, nothing interpreted):
`abapGitStaging`, `abapGitModifiedObjects`, `abapGitBranchInfo`, `abapGitObjectResults` (R2/R4/R8
bodies); `abapGitRepos` gains `status`, `statusText`, `folderLogic`, the e-mail fields and every
link with its `rel`.

### 3.3 Default verdicts (strict) and the errata

The library answers SAP's status: 2xx is success, anything else an error carrying SAP's text.
Entries for `ERRATA.md` (each with its ground):

- R4/R10 cloud **202** is accepted, not finished; R5 **202** is finished (Code).
- R4 onprem 200 with an empty object list says nothing about objects (Code: never filled).
- R15 200 when the branch does not exist and `create` is false: nothing changed (Code). A
  consumer reads R1's `branchName` to know.
- R11, R15 success status is the framework's default (Inference: 200 with no body).
- R9 cloud 409 plain text while a run is pending or running (Code).
- R3 `corrNr` is read by neither handler (Code).

## 4. Server tools

Common to all:

- **Availability:** registered by system kind (`available_in`), and served only where the
  system's discovery lists `/sap/bc/adt/abapgit/repos` (§9.1 decides when that is read).
- **Session:** stateless (§2.4). **Batch:** run outside batch mode (each depends on SAP's own
  repository state); every compact description says so.
- **Arguments** carry no credential (§5). A repository is addressed by `repository_key` as R1
  answers it.
- **Answer:** the adt-strategies reading as JSON; an error is SAP's answer (§6).

### 4.1 Full set

| Tool | Route | Sys | -ro | Arguments | Result | Package checked | Request checked | Long |
|---|---|---|---|---|---|---|---|---|
| `ListAbapGitRepos` | R1 | both | yes | `package_name?`, `repository_key?` (§9.3) | repositories (key, package, url, branch, created/deserialized by/at; cloud also status, statusText, folderLogic, links) | — (read) | — | no |
| `CheckAbapGitExternalRepo` | R13 | both | yes | `url` | accessMode, branches | — | — | no |
| `GetAbapGitBranchInfo` | R14 | cloud | §9.2 | `url`, `branch`, `package_name` | the branch with folderLogic, accessMode | `package_name` (it writes, §9.2) | — | no |
| `LinkAbapGitRepo` | R2 (v3) | both | no | `package_name`, `url`, `branch`, `transport_request?`, `folder_logic?` (cloud) | SAP's answer; its object list is empty on both (Code: onprem's `set_import_response_data` is a TODO, cloud passes it no log) | `package_name` | `transport_request` | onprem: §9.5 |
| `UnlinkAbapGitRepo` | R3 | both | no | `repository_key` | — | the repository's package, read from R1 first (§4.3) | — | no |
| `PullAbapGitRepo` | R4 (onprem); R4 or R5 (cloud, §9.5) | both | no | `repository_key`, `branch`, `transport_request?`, `objects?` (cloud: the R6 selection) | onprem: done (its object list is always empty); cloud: accepted (R4) or finished (R5) | the repository's package (§4.3) | `transport_request` | §9.5 |
| `GetAbapGitModifiedObjects` | R6 | cloud | yes | `repository_key` | overwriteObjects, packageWarningObjects | — | — | no |
| `GetAbapGitStaging` | R9 | both | §9.2 | `repository_key` | unstaged, staged, ignored objects with files; author/committer | per §9.2 | — | no |
| `PushAbapGitRepo` | R10 | both | no | `repository_key`, `objects` (from the staging answer: each object and its files), `comment`, `author?`, `committer?` (name, email; default the staging answer's) | onprem: done; cloud: accepted | the repository's package (§4.3) | — | §9.5 |
| `CheckAbapGitRepo` | R11 | both | yes | `repository_key` | done, or SAP's error (with cloud's `http_status`) | — | — | no |
| `GetAbapGitFile` | R12 | both | yes | `repository_key`, `filename`, `version` (`local`/`remote`, required) | the file text | — | — | no |
| `SwitchAbapGitBranch` | R15 | onprem | no | `repository_key`, `branch`, `create` (required boolean) | done | the repository's package (§4.3) | — | no |
| `GetAbapGitErrorLog` | R8 | cloud | yes | `repository_key` (the server takes R1's `log_link`; §9.3) or `log_link` | object results | — | — | no |

`author`/`committer` default to the staging answer's because SAP fills them there from the
user's abapGit settings (Code, R9); a stated value replaces it.

### 4.2 Compact set

Two tools, as compact splits reads from writes elsewhere:

- `HandlerAbapGitGet` — `action`: `repos`, `external_repo`, `modified_objects` (cloud),
  `staging`, `checks`, `file`, `error_log` (cloud), and `branch_info` (cloud) where §9.2 keeps it a
  read. Served in compact and compact `-ro`.
- `HandlerAbapGit` — `action`: `link`, `unlink`, `pull`, `push`, `switch_branch` (onprem). Not in
  `-ro`.

Arguments per action are the full tool's. Each action is deniable (`HandlerAbapGit.push`,
`HandlerAbapGitGet.file`), its schema and description narrowed as `HandlerSystem`'s are; an
action a system does not serve is not in that variant's enum.

### 4.3 Access checks

Every write is checked before anything is sent, through `checkedArguments.ts`:

- `LinkAbapGitRepo`, `GetAbapGitBranchInfo` (if a write): `package_name` and `transport_request`
  are arguments — the existing rule.
- `UnlinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo`, `SwitchAbapGitBranch` (and
  `GetAbapGitStaging` if a write): the package is the repository's, known only from R1. The tool
  reads R1 first (one GET) and checks that entry's `package` against `allowed-packages`; a key R1
  does not list is refused in fixed words before any write. Justification: what these routes
  change is the repository's package (pull) or the repository bound to it (unlink, push, switch);
  checking only arguments would let every repository through. This is a new, stated exception to
  ACCESS_RESTRICTIONS' "the server makes no call to SAP to find an object's package", like the
  package-tree read. Sends only when restrictions are configured; otherwise no R1 read is made.
- Pull may create or change objects in subpackages (folder logic): the check is on the
  repository's package, as a subtree entry would cover them; an exact entry covers only the root.
  Documented, not analysed further (the checks are formal).
- `transport_request` on pull: the argument. Cloud may create a task under it (Code, R4).

### 4.4 Availability in code

- `available_in`: cloud-only `GetAbapGitBranchInfo`, `GetAbapGitModifiedObjects`,
  `GetAbapGitErrorLog`; onprem-only `SwitchAbapGitBranch`; the rest both. The compact enums
  follow per variant.
- Discovery (§9.1): no `/abapgit/repos` → no abapGit tool.

## 5. Credentials

**How a tool takes them — §9.6.** Recommended: a source the server holds, not an argument —
for stdio the destination's settings (`ABAPGIT_USER`, `ABAPGIT_TOKEN` beside the destination's
session `.env`), for http/sse request headers the client application sets (`x-abapgit-user`,
`x-abapgit-token`), as SAP credentials reach the server today. A tool argument would pass the
token through the model, its context and every transcript.

Kept out of everything but SAP's request:

- **Arguments:** none carries a secret (with the recommendation). With arguments (if chosen):
  schemas mark them, and the background-run record keeps tool, object and start only, as today
  (`BackgroundRunStart`).
- **URL:** a `url` argument with userinfo (`user:pass@`) is refused before sending (user input,
  checked at runtime): cloud would take the credentials out of it, onprem would store it in the
  repository and echo it in messages (§2.2).
- **Logs:** no log line of these tools carries arguments, headers or bodies.
  `DEBUG_HTTP_WIRE` already redacts the `Password` header (word `password`); `Username` is added,
  and the body of every request under `/sap/bc/adt/abapgit/` is logged by its size alone.
- **Errors and answers:** an error carries `method` and `url` only (`answer.ts`); a URL never
  holds credentials (headers and bodies do).
- **Proof:** a canary token through every tool and path (success, SAP error, refusal, background
  run, wire log on) appears in no answer, log line, error or run record.

## 6. Errors

- SAP's answer reaches the model as it is: status, the ADT exception's T100 text and properties
  (cloud's `http_status`, `LONGTEXT`), cloud's 409 plain text. No retry, no resolution, no merge.
- Server-side refusals before sending, in fixed words: access (`package_not_allowed`,
  `request_not_allowed`), a key R1 does not list (on a checked write), a URL with userinfo,
  abapGit not served, credentials missing where a route needs them is **not** refused (SAP
  decides; public repositories need none).
- The §3.3 errata readings are stated in the tool descriptions where they decide what an answer
  means (cloud pull/push accepted, not finished; onprem branch switch with `create: false` on a
  missing branch).

## 7. Tests

**Unit** (adt-clients, interfaces-adt typechecks, adt-strategies, server):

- per member: method, URL, query, Content-Type, Accept, body, credentials placement (body vs.
  `Username`/base64 `Password`), and that no other header or element carries them;
- readings over captured, sanitised documents of each route;
- strict verdicts and `analyse` per errata entry;
- server: schemas per variant and set, `-ro` membership, deny entries, access checks (argument
  and R1-read paths), the userinfo refusal, the canary (§5), discovery gate, background behaviour
  (§9.5).

**Live** (adt-clients integration and server `liveSuite`), each stating where it runs and
skipped elsewhere with the reason; route-specific cases (`SwitchAbapGitBranch` onprem;
branch info, modified objects, error log, selective pull cloud) gated by system kind in code:

- **Repository:** the private test repository, its URL and credentials from
  `abapgit-live.env` in the sessions folder (keys `ABAPGIT_REPO_URL`, `ABAPGIT_USER`,
  `ABAPGIT_TOKEN`); a suite without it skips with that reason. One long-lived branch per system
  kind, so the two systems' objects never meet (a prerequisite, §9.8).
- **Package:** created by the suite and deleted by it.
  - onprem: a **transportable** package under the configured super package, in the configured
    software component, recorded in the configured transport request (a `$` package cannot be
    transported, so link and pull would skip the request path);
  - cloud: a package under the configured super package in `ZLOCAL` (no `$TMP` on cloud; no
    request).
- **Flow:** check external repo → (cloud) branch info → link → list (find key) → (cloud) poll R1
  until the run leaves `R`, with the caller's own cancel → create one object in the package →
  staging (object unstaged) → push it → (cloud) poll, error log → checks → file local and remote
  → (cloud) modified objects, selective pull → (onprem) switch to the system's branch → unlink →
  delete objects and package. Cleanup runs after a failure too: unlink, then delete the package.
- No timeouts of the server's; a poll ends on SAP's answer or the test's own cancel.

## 8. Docs

- README: the first screen's "Primary workflows" and "Why teams use it" name the git loop;
  Features gets an abapGit section (what is offered per system, the credential source, background
  behaviour).
- Tool references: `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`
  and the generated compact page; `tools/long-handlers.json` if §9.5 lists any.
- `ACCESS_RESTRICTIONS.md`: the arguments per tool, the R1 read for key-addressed writes, the
  subpackage note, the deny values of both compact tools.
- `AUTHENTICATION.md` / `CLI_OPTIONS.md`: the git credential source (§9.6).
- adt-clients: README member list, `ERRATA.md` entries (§3.3).
- CHANGELOG highlights for 24.2.0, interfaces-adt, adt-strategies and adt-clients minors.
- Release order: interfaces-adt → adt-strategies → adt-clients, each published before the next
  builds on it; then the server from the registry (no link).

## 9. Open decisions

1. **When discovery is read.** (a) At start, before tools are listed, from the instance's
   connection — a system without `/abapgit/repos` lists no abapGit tool (the goal), but a
   deferred or per-request connection (stdio `--deferred-logon`, http/sse) has none yet;
   (b) at the first call, cached per system: the tool is listed and a system without abapGit
   answers "not served"; (c) (a) where a connection exists at start, else (b).
   **Recommend (c)**: it meets the goal wherever it can be met, and says so where it cannot.
2. **Stage and branch info vs. `-ro`.** Code: staging (R9) changes nothing; branch info (R14)
   commits a link and deletes it. **Recommend** staging in `-ro` (a read) and branch info outside
   it, with its `package_name` checked — the reverse of the goal's lists, so the goal needs your
   word either way.
3. **"Read one repository".** (a) `ListAbapGitRepos` with `package_name` / `repository_key`
   filters applied by a result strategy over the one R1 answer (cloud's list is 446 entries,
   1 MB); (b) list only, the model filters. **Recommend (a).** The same reading gives
   `GetAbapGitErrorLog` its `log_link` from `repository_key`, or it takes `log_link` alone.
4. **Cloud `/status` (R7).** It answers `DEMO STATUS`. (a) offer it as served; (b) leave it out
   and give status through `ListAbapGitRepos` (R1 `status`, `statusText`). **Recommend (b)**,
   stated in the docs as the reason.
5. **How a long pull or push runs.**
   - (A) **In the call, as SAP answers:** onprem R2/R4/R10/R15 and cloud R5 hold the call until
     SAP answers; cloud R10 answers 202 at once. Simple; a long onprem pull can outlast a
     client's own request limit.
   - (B) **Code-run background** for SAP's synchronous routes: `background: true` (opt-in, like
     `RuntimeRunClass`) runs onprem link/pull/push and cloud R5 on a connection of its own;
     `GetBackgroundRun` reads the answer; `DiscardBackgroundRun` drops the answer and cannot
     cut the write (a code run). Credentials never enter the run record.
   - (C) **SAP's own job where SAP has one:** cloud pull through R4 and push through R10 answer
     202 at once; the model follows R1's `status` and reads R8. Nothing long is held by us.
   **Recommend C for cloud plus B for onprem**: cloud keeps SAP's job, status and log (and SAP's
   409 for a second run); onprem's synchronous writes get the existing code-run background,
   opt-in. R5 then stays in adt-clients and is not used by the server.
6. **Git credentials.** (a) tool arguments; (b) a server-held source (§5); (c) both, (b)
   preferred. One credential per destination, or a map by repository URL. **Recommend (b), one
   per destination first**; a URL map when a second repository with another token is needed.
7. **`link` without a branch.** adt-clients defaults `branchName` to `refs/heads/master` — a
   guess. (a) make it required (a breaking type change → major, against the release plan);
   (b) keep the library default deprecated and make the server's `branch` required. **Recommend
   (b)** for this minor, (a) in the next adt-clients major.
8. **Test repository branches.** The suite needs one branch per system kind, created once by
   you (cloud cannot create one; onprem's `create: true` would create it in the remote on every
   run otherwise). **Recommend** two long-lived branches, named in `abapgit-live.env`.

## 10. Not verified

- Anything a live request would show: every status above except R1's and discovery's comes from
  Code, not Measured (no link, pull, push or credential use was allowed in this research).
- R11 and R15 success status (Inference: the framework's default 200, no body).
- R15 with a branch name holding `/` (`refs/heads/x`) in the `{branch}` segment: how the
  template matches an encoded slash.
- R13 cloud with the `v1` request type it lists in discovery: its handler reads only `v2`.
- The `abapgitstaging` object reference's attributes come from the `sadt_object_reference`
  include, not read; the push builder is verified by the live push.
- Whether onprem R2 `v4` (list) answers 201 with a log: it is not used.
- Which pull route Eclipse ADT uses on cloud (R4 or R5): not read; the recommendation does not
  depend on it.
- What onprem abapGit does on `unlink` beyond the link (`zcl_abapgit_repo_srv->delete`, not
  read): objects are expected to stay (Inference); the live test deletes them itself.

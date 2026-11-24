# Access restrictions

An administrator narrows what the model can do through a server with start-time settings. The
binary stays the ceiling: a setting only takes away; it never adds a tool. A setting that is not
given restricts nothing — with none of them, every tool, answer and listed schema is as without
this feature, and SAP's authorization decides what is allowed.

The checks are **formal**: they read the call's own arguments (the tool, its dispatching value,
the package, request and table it names). They do not analyse code or document text; a class
written to read what is denied, or to create objects elsewhere, is a matter for SAP's
authorization, which remains the boundary (see [SECURITY.md](../../SECURITY.md)).

## The settings

| Setting | CLI | Environment | YAML (`--conf`) |
|---|---|---|---|
| Denied actions | `--deny-actions` | `MCP_DENY_ACTIONS` | `restrictions.deny-actions` |
| Allowed packages | `--allowed-packages` | `MCP_ALLOWED_PACKAGES` | `restrictions.allowed-packages` |
| Allowed requests | `--allowed-requests` | `MCP_ALLOWED_REQUESTS` | `restrictions.allowed-requests` |
| Denied tables | `--denied-tables` | `MCP_DENIED_TABLES` | `restrictions.denied-tables` |
| Allowed tables | `--allowed-tables` | `MCP_ALLOWED_TABLES` | `restrictions.allowed-tables` |

- CLI and environment: entries separated by `,`, each trimmed. YAML: a sequence of strings, or
  one string. CLI beats environment beats YAML.
- A form given with nothing (`MCP_DENY_ACTIONS=`, an empty YAML sequence) is absent.
- **A malformed entry stops the start** (`[MCP] <words>`, exit `1`), as do denied tables and
  allowed tables configured together. An empty entry or a stray separator is malformed.
- Every binary accepts every setting: an entry that touches nothing in that binary changes
  nothing, so one configuration fits all twelve. The http and sse servers take them as start
  parameters of the process; every instance of a pooled server gets the same ones.

```yaml
restrictions:
  deny-actions:
    - Delete*
    - HandlerDelete
    - HandlerActivate.CLAS/OC
    - HandlerGetData.sql
  allowed-packages:
    - ZTEAM/**
    - $TMP
  allowed-requests:
    - A4HK9*
```

## Denied actions

Applied once, when the server registers its tools. A denied tool is not registered: the model
does not see it and cannot call it. No call checks a deny list.

| Entry | Denies |
|---|---|
| `Tool` | the tool (`DeleteClass`) |
| `Prefix*` | every tool whose name starts with `Prefix` (`Delete*`) |
| `Tool.value` | one value of a compact tool's dispatching argument: `object_type` (HandlerActivate, HandlerCheckRun, HandlerCreate, HandlerDelete, HandlerDeletionCheck, HandlerGet, HandlerLock (with `action` too), HandlerUpdate, HandlerValidate), `target_type` (HandlerProfileRun), `action` (HandlerAbapGit, HandlerAbapGitGet, HandlerBatch, HandlerDebugBatch, HandlerSession, HandlerSystem), `operation` (HandlerDebugSession, HandlerDebugStep, HandlerDebugBreakpoints, HandlerDebugMaintain); and `HandlerGetData.sql`, the `sql_query` mode |
| `Tool.CODE` | on HandlerActivate and HandlerGet, an ADT type code as the ADT tables write it (`HandlerActivate.CLAS/OC`, `HandlerGet.DDLS/DF`) |
| `Tool.prefix*` | every value (and, on HandlerActivate and HandlerGet, every code) starting with `prefix` (`HandlerDebugSession.get*`; `HandlerActivate.CLAS*` names `CLASS` and `CLAS/OC`) |

- Names match exactly, case included. Malformed: `*` alone, `*` other than at the end, `*.value`,
  more than one `.`, an empty part, a tool part with anything but ASCII letters and digits, a
  value with anything but ASCII letters, digits, `_` and `/`.
- **Each entry denies exactly what it names.** A denied value is removed from the tool's
  schema, its description and its search text; every other value stays, even one that reaches
  the same ADT endpoint (`HandlerActivate.CLASS` leaves `BEHAVIOR_IMPLEMENTATION` and the code
  `CLAS/OC`). An administrator who wants a whole object kind out denies every value that names
  it.
- **An ADT code is a value of its own.** Denying a name leaves its code; `HandlerActivate.CLAS/OC`
  closes the code. While any code of the tool is denied, its code arguments (`objects[].type`
  and `object_adt_type` on HandlerActivate, `object_adt_type` on HandlerGet) take codes as
  written in upper case only; without a denied code they take every spelling as before.
- A compact tool stays while any value of any form is left: HandlerActivate is removed only
  when every name and every code is denied; HandlerGet and HandlerGetData only by their tool
  entry. A tool with every name denied but codes left (HandlerActivate, HandlerGet's address
  parts) loses `object_type`; a variant with nothing left drops out of the tool's
  `available_in`.
- **Denying `Activate*` closes only the activation tools**, not the `activate` argument of a
  write (`UpdateClass` with `activate: true`).
- An entry that matches nothing in this binary is ignored and named in the start line.
- **HandlerSystem is narrowed by `action`** (`HandlerSystem.where_used`, `HandlerSystem.atc_*`):
  a denied action leaves the `action` enum, the description, and every argument only denied
  actions take; an argument another action left takes too stays, in that action's words.
  `where_used` takes no deniable object type: the 23.x entries `HandlerWhereUsed.<TYPE>` match
  nothing and are named in the start line, and nothing replaces them.
- A batch can record only registered tools and values: a denied one cannot be recorded.
- **The prompts follow the deny list.** A prompt lists the `object_type` values whose tools are
  registered: `CreateClass` or `HandlerCreate.CLASS` removes `class` from `create`;
  `HandlerLock.CLASS` removes `class` (and every class include) from compact `update`;
  `HandlerSystem.where_used` removes compact `where_used`; `HandlerSystem.transports` removes
  `list` from compact `transport`. A prompt with no value left is not listed, and `Create*` or
  `HandlerCreate` removes the `create` prompt. No prompt reads a deny entry itself; a value
  outside the served set is refused by `prompts/get`
  ([PROMPTS.md](PROMPTS.md)).

## Allowed packages, allowed requests

Checked once per call, at the handler's start, before the call's own requests are sent (a subtree
entry first reads the package tree, below). A call that names a package (`package_name`; with
`object_type` `PACKAGE`, the `object_name` of a lock or an unlock; on a package create, the parent
`super_package`; the `target.name` of a unit run whose `target.kind` is `package`: `RunAbapUnit`,
compact `HandlerUnitTestRun`; the `name` of each `objects[]` entry an activation reads as a package,
and compact `HandlerActivate`'s `object_name` with `object_type` `PACKAGE` or an `object_adt_type`
read so; the `object_name` of each transport entry of type `DEVC`) or a request (`transport_request`,
`transport_number`, `target_number`) in its arguments runs only when each name matches its own
list. A call that names several is refused whole when one is outside.

- A package is checked by its own name on its lock, unlock, update and delete. A
  `super_package` is checked only on a package create, where it is sent; a lock or a check
  accepts it and sends nothing of it.
- **A package create's `super_package` must be readable.** SAP creates the package with no super
  package when the named one cannot be loaded, so while an allowed-packages list is configured
  the server reads the given parent before the create, and a parent that cannot be read refuses
  the call `package_tree_unreadable`. Without a list nothing is read.

- Only the tools a binary's `-ro` twin does not serve are checked: **reads are not checked**
  (`GetPackage`, `GetTransport`, `HandlerGet`).
- An argument not given, or blank, is not checked: the call runs, and SAP may refuse it. The
  server makes no call to SAP to find an object's package or request — but for the package-tree
  read below, and the abapGit repository list, which an abapGit call addressed by
  `repository_key` reads first ([abapGit](#abapgit)).
- Packages: an exact name (`ZFOO`, `$TMP`), a prefix (`Z*`), or a subtree (`ZFOO/**`: `ZFOO` and
  every package below it; `/ABC/ZFOO/**` in a namespace). Requests: an exact number or a prefix.
  Entries are upper-cased.
- **A task is matched as given**: an entry for a request does not cover its tasks.
- **A unit run's package target is checked by the package it names**: the subpackages a run with
  `include_subpackages` covers are not checked one by one. An object target (a class, a program)
  is not checked.
- **An activation's package entries** (`ActivateObjects`, `ActivateObjectLow`, compact
  `HandlerActivate`): an entry is a package when the activation reads its type as `DEVC/K` — the
  code in either case, the main type `DEVC`, or the name `package`; any other entry is not checked.
- **A transport entry of type `DEVC`** (`MoveTransportObjects` and compact
  `HandlerTransportMoveObjects` for each `objects[]` entry, `AddTransportObject` and
  `RemoveTransportObject` for the one object): the type in any case, whatever the program id
  (`pgmid`). Any other entry is not checked. A remove takes the entry matching the given type,
  name and position together, so the entry removed is the one whose name was checked.
- A subtree entry makes the server read the package tree: a package below an allowed subtree is
  found by reading each super package up to the subtree's root. For a package create the new
  package's parent is the call's `super_package`; a top-level package has none, so its create
  runs when an exact or prefix entry names it. A tree that cannot be read (SAP does not
  answer a package, or a package is met twice) refuses the call.

## Denied tables, allowed tables

Apply to the data tools (`GetTableContents`, compact `HandlerGetData`'s table read), served
only with `--enable-data-tools`. Either a list of tables whose data cannot be read, or a list of
the only tables whose data can be: never both. Entries are exact names or prefixes. While
either list is configured, a table argument must be one table name (ASCII letters, digits, `_`,
`/` and `$`): an alias, a join or a list of tables is refused `table_not_allowed`. A free SQL
query (`GetSqlQuery`, `HandlerGetData`'s `sql_query`) is not analysed: deny it as an action
(`GetSqlQuery`, `HandlerGetData.sql`).

## abapGit

The abapGit tools (full and compact) are checked by the same settings, with one rule of their own
for the two writes whose reach no package or request entry can bound.

### Link and pull are refused under restrictions

While **any** `allowed-packages` or `allowed-requests` entry is configured, `LinkAbapGitRepo`,
`PullAbapGitRepo` and compact `HandlerAbapGit` `link` and `pull` are refused
`abapgit_import_not_allowed`, on premise and on ABAP Cloud, before anything is sent and before any
credential is looked up. With no restriction configured they are served, and SAP's authorization
decides. The grounds, read in SAP's code:

- **On premise, link and pull import with every decision set to yes.** The link imports the whole
  remote right after creating the repository (`ZCL_ABAPGIT_RES_REPOS`, local types,
  `perform_import` L41–75), and the pull does the same on the linked branch
  (`ZCL_ABAPGIT_RES_REPO_PULL->post` L60–171): every overwrite and every package-warning decision
  is `'Y'`, so they write subpackages, overwrite objects changed in the system, and write objects
  held by other packages.
- **On ABAP Cloud, a pull's job decides at run time.** The job recomputes its decisions when it
  runs and matches a selection by object name alone (`CL_ABAPGIT_BG_ACTION_PULL`,
  `deserialize_checks` L113, decisions L123–154), and deletes the objects whose deletion it
  confirmed (`delete_unnecessary_objects` L39–72): a selection checked before the submit does not
  bound what the job writes. Of the unselected entries only a remote-only add or update is
  imported: a deletion runs only for a selected entry (`delete_unnecessary_objects` L39–72), an
  unselected package warning is left out whatever its state (`CL_ABAPGIT_OBJECTS->
  warning_package_adjust` L1858–1897), and an unselected entry changed in the system is left out
  (`warning_overwrite_adjust` L1791). A selective pull (`overwrite`) is a pull, refused the same way.
- **On ABAP Cloud, a pull given a request may create a task in it.** When the user has no task in
  the request, SAP creates one (`CL_ABAPGIT_RES_REPO_PULL->check_and_create_task`,
  `TR_INSERT_NEW_COMM` L76) — and an entry for a request does not cover its tasks.

### What each tool is checked by

| Tool (compact action) | Checked | From |
|---|---|---|
| `LinkAbapGitRepo` (`link`), `PullAbapGitRepo` (`pull`) | refused while any entry is configured | — |
| `GetAbapGitBranchInfo` (`branch_info`, cloud) | `package_name` against the allowed packages | the argument: the package SAP links into to answer (`CL_ABAPGIT_RES_REPO_BRANCH_EXT->post` L120, the link removed at L184) |
| `PushAbapGitRepo` (`push`), `UnlinkAbapGitRepo` (`unlink`), `SwitchAbapGitBranch` (`switch_branch`, on premise) | the repository's package against the allowed packages | the repository list's entry for `repository_key` |
| the reads (`ListAbapGitRepos`, `CheckAbapGitExternalRepo`, `GetAbapGitModifiedObjects`, `GetAbapGitStaging`, `CheckAbapGitRepo`, `GetAbapGitFile`, `GetAbapGitErrorLog`; `HandlerAbapGitGet`) | not checked, as every read | — |

No abapGit tool takes a git credential as an argument; a repository is addressed by
`repository_key`.

### The repository-list read first

A call addressed by `repository_key` that writes, binds a git credential or reads the run log
sends one request before anything else: `GET /sap/bc/adt/abapgit/repos`, stateless, with no git
credential and no wire log. Its entry for the key gives the package checked above, the remote URL
the credential is bound to, the branch a pull is sent, and the run log's key. This is the one
exception, beside the package-tree read, to "the server makes no call to SAP to find an object's
package": for these calls, "before anything is sent" reads "before anything but this list is
sent". The list is read once per call; a background run gets the call's entry and reads none.

### Fail closed

Each of these refuses the call in fixed words; nothing is sent but the reads its row names — the repository list where it was read, and for the last two `overwrite` rows the modified-objects list as well:

| Case | Code |
|---|---|
| link or pull while any `allowed-packages` or `allowed-requests` entry is configured | `abapgit_import_not_allowed` |
| a blank `package_name` on link or branch info | `abapgit_package_required` |
| a key the list does not show with a package and a URL, or a list that cannot be read | `abapgit_repository_unknown` |
| an `app_log_key` that is not the run log the list shows for that repository | `abapgit_run_log_not_paired` |
| an entry showing more than one run log | `abapgit_run_log_ambiguous` |
| the run log asked of an on-premise system (its list carries no run log) | `abapgit_run_log_not_served` |
| a pull's `overwrite` naming one object twice | `abapgit_overwrite_duplicate` |
| a pull's `overwrite` on premise, whose pull takes no selection | `abapgit_overwrite_not_declared` |
| a pull's `overwrite` naming an object the modified-objects list does not hold (the repository list and the modified-objects list read, no pull) | `abapgit_overwrite_not_listed` |
| a pull's `overwrite` naming a name the modified-objects list holds under two types, in one of its two lists or across both: SAP selects by name within each list (the repository list and the modified-objects list read, no pull) | `abapgit_overwrite_ambiguous` |
| a `url` that is no URL written as the URL parser writes it, or carries a user, a password, a query, a fragment or a dot segment | `abapgit_url_refused` |
| `x-abapgit-*` headers that state no approved endpoint | `abapgit_endpoint_refused` |
| a system whose discovery does not list abapGit, or cannot be read | `abapgit_not_served` |
| `background` on a call that does not take it (cloud, or another action) | `abapgit_background_not_declared` |

### Denied actions

Each full tool is denied by its name (`PushAbapGitRepo`). The compact tools are narrowed by `action`: `HandlerAbapGitGet.repos`,
`.external_repo`, `.modified_objects`, `.staging`, `.checks`, `.file`, `.error_log`;
`HandlerAbapGit.link`, `.unlink`, `.pull`, `.push`, `.switch_branch`, `.branch_info`. A denied
action leaves the tool's `action` enum and its description; a denied action given with
`background` is refused before anything, as any denied action.

## Refusals

A refused call runs no handler, sends nothing of its own and takes no batch number. The model
gets an error answer with a code:

| Code | Words |
|---|---|
| `package_not_allowed` | `<argument> names a package outside the allowed packages: <value>` |
| `package_tree_unreadable` | `the package tree above <value> could not be read, so <argument> is not checked against the allowed packages` |
| `request_not_allowed` | `<argument> names a request outside the allowed requests: <value>` |
| `table_not_allowed` | `the data of <value> is not readable through this server` |

## The start line

Each server writes one line on stderr at start (a pooled http server once):

```
[MCP] Access restrictions: none
[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2
```

It names counts, the package-tree read when a subtree entry is configured, and the deny
entries that match nothing in this binary.

## Embedding

`BaseMcpServer` / `EmbeddableMcpServer` and `HandlerExporter` take an optional `accessChecks`
(`IAccessChecks`): `listedAccessChecks(lists)` matches names and prefixes and makes one read, a
package create's given `super_package`; `packageTreeAccessChecks(lists)` also matches subtree
entries. Both read through the `IPackageReader` they are handed; a reader that throws refuses the
call `package_tree_unreadable`. The server's own reader throws unless SAP's document names the
package read. A reader an embedder gives must throw for a missing, empty or mismatched
document: a resolved `undefined` reads as a top-level package — a create's parent counts as
read, and a subtree walk ends there, refused `package_not_allowed` when no allowed root was
reached. An embedder may
give its own strategy. `HandlerExporter` takes `deniedActions` (parsed with
`parseDeniedEntry`); `withoutDenied(groups, denied)` and `registryOf(…, denied)` narrow groups.
Handlers an embedder takes into its own hands (a registry of its own, its own parsing of the
exported entries' arguments) are its own. See
[HANDLERS_MANAGEMENT.md](HANDLERS_MANAGEMENT.md).

## GetObjectDraft and HandlerGet `part: 'draft'`

Not a restriction: a read in every binary that tells whether an object holds an unactivated
change and whose. The model calls it when it wants to know and decides what to do; SAP lets the
first writer win, and a released lock does not protect a draft.

It reads the active, inactive and working versions of each part of the object and compares
their ETags. It answers `{ object_type, object_name, has_draft, parts }`; each part carries
`draft` — `none`, `own` (the caller's), `other` (another user's) or `undetermined` — with
`changed_at` (the change's last write, UTC) and `age_seconds` (by the server's clock: a skewed
server clock skews the age), and the three ETags. `has_draft` is true when any part holds a
draft. Another user's lock is not visible to it.

| Type | Parts read |
|---|---|
| PROGRAM, INCLUDE (on premise) | the source |
| INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, TABLE, STRUCTURE, DDL | the source |
| CLASS, BEHAVIOR_IMPLEMENTATION | on premise the includes implementations, definitions, testclasses, macros (the main source's ETag there is the same for every version); on ABAP cloud the main source and the includes implementations, definitions, testclasses |
| FUNCTION_GROUP, DOMAIN, DATA_ELEMENT, TABLE_TYPE | the metadata |
| METADATA_EXTENSION, SERVICE_DEFINITION | the source; `changed_at` and `age_seconds` are `null`: their ETag carries no time |

An include that does not exist has no entry. Every type the draft tool reads is also in
`HandlerGet`'s `object_type`, so `part: 'draft'` serves the same types.

**Not offered:** a package and a message class (their ETags do not follow the version), and a
service binding (its change is a publication, not an unactivated write).

In batch mode both are recorded: their reads go into the batch envelope.

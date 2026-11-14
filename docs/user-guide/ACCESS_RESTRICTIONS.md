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
| `Tool.value` | one value of a compact tool's dispatching argument: `object_type` (HandlerActivate, HandlerCheckRun, HandlerCreate, HandlerDelete, HandlerDeletionCheck, HandlerGet, HandlerLock, HandlerUnlock, HandlerUpdate, HandlerValidate, HandlerWhereUsed), `target_type` (HandlerProfileRun), `action` (HandlerBatch, HandlerDebugBatch, HandlerSession), `operation` (HandlerDebugSession, HandlerDebugStep, HandlerDebugBreakpoints, HandlerDebugMaintain); and `HandlerGetData.sql`, the `sql_query` mode |
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
- A batch can record only registered tools and values: a denied one cannot be recorded.

## Allowed packages, allowed requests

Checked once per call, at the handler's start, before anything is sent. A call that names a
package (`package_name`, `super_package`) or a request (`transport_request`, `transport_number`,
`target_number`) in its arguments runs only when each name matches its own list.

- Only the tools a binary's `-ro` twin does not serve are checked: **reads are not checked**
  (`GetPackage`, `GetTransport`, `HandlerGet`).
- An argument not given, or blank, is not checked: the call runs, and SAP may refuse it. The
  server makes no call to SAP to find an object's package or request.
- Packages: an exact name (`ZFOO`, `$TMP`), a prefix (`Z*`), or a subtree (`ZFOO/**`: `ZFOO` and
  every package below it; `/ABC/ZFOO/**` in a namespace). Requests: an exact number or a prefix.
  Entries are upper-cased.
- **A task is matched as given**: an entry for a request does not cover its tasks.
- A subtree entry makes the server read the package tree: a package below an allowed subtree is
  found by reading each super package up to the subtree's root. For a package create the new
  package's parent is the call's `super_package`. A tree that cannot be read (SAP does not
  answer a package, or a package is met twice) refuses the call.

## Denied tables, allowed tables

Apply to the data tools (`GetTableContents`, compact `HandlerGetData`'s table read), served
only with `--enable-data-tools`. Either a list of tables whose data cannot be read, or a list of
the only tables whose data can be: never both. Entries are exact names or prefixes. While
either list is configured, a table argument must be one table name (ASCII letters, digits, `_`,
`/` and `$`): an alias, a join or a list of tables is refused `table_not_allowed`. A free SQL
query (`GetSqlQuery`, `HandlerGetData`'s `sql_query`) is not analysed: deny it as an action
(`GetSqlQuery`, `HandlerGetData.sql`).

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
(`IAccessChecks`): `listedAccessChecks(lists)` matches names and prefixes and reads nothing;
`packageTreeAccessChecks(lists)` also matches subtree entries through the `IPackageReader` it is
handed; an embedder may give its own. `HandlerExporter` takes `deniedActions` (parsed with
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

# Migrating to 22.0.0

22.0.0 takes what each tool offers and accepts from the ADT type tables of the declared system type
([#329](https://github.com/fr0ster/mcp-abap-adt/pull/329)): the tool set, each enum, each type
argument and each description are those of `onprem` or `cloud`, and the server never defaults the
system type. Go through the section that fits how you use the server; the
[CHANGELOG](../CHANGELOG.md) has every item.

The packages are the eighteen of 21.0.0, all at **22.0.0**. Their ADT dependencies change:

| Package | Was | Now |
|---|---|---|
| `@mcp-abap-adt/interfaces-adt` (`lib`, `compact-modify`) | `^20.1.0` | `^24.0.1` — the ADT type tables per system type, each code's main type, the search names |
| `@mcp-abap-adt/adt-clients` (`lib`) | `^37.2.0` | `^39.0.0` — a client per system type; friendly names are no longer read; the search takes search names |
| `@mcp-abap-adt/adt-strategies` (`lib`) | `^0.15.0` | `^0.17.0` — answered types read against the tables |

## Every start: state the system type, inspection included

A destination already needed `--system-type` (or `SAP_SYSTEM_TYPE`, or YAML `system-type`). Now a
stdio start with **no destination** (inspection: the tool list) needs it too, and lists the tools
of that system type's table. Without it the start stops (exit `1`) before the transport opens:

```bash
mcp-abap-adt --system-type=onprem          # inspection of the on-premise tool set
mcp-proxy -- mcp-abap-adt --system-type=cloud   # behind mcp-proxy: the flag after its --
```

The Glama inspection image is two images, `docker/Dockerfile.inspect.onprem` and
`docker/Dockerfile.inspect.cloud`; `docker-compose.inspect.yml` has the services `inspect-onprem`
and `inspect-cloud`. A copy of the old `docker/Dockerfile.inspect` (Glama's admin page keeps one)
needs the same split.

## Embedders: state `systemType`

`EmbeddableMcpServer`, `HandlerExporter` and a host of your own state the system type: the
`systemType` option, or `SAP_SYSTEM_TYPE`. Without it the tools are listed, and every call that
would reach the system is refused `system_type_required`. A member the cloud table does not serve
(a program's create, for example), called on a connection declared `cloud`, is refused
`variant_not_served` before anything is sent.

For code that imports `@mcp-abap-adt/lib`:

- `createAdtClient()` / `getAdtClient()` answer `IServerAdtClient`, typed by the tables;
  `createOnPremAdtClient()` the on-premise client, for the members on premise only. Its
  `getUtils().search` takes a search name of the system type (`IAdtSearchObjectsParamsOf<V>`:
  `DEVC`, `STRU`, not `DEVC/K`), and its group members take references that name a function
  module's group in `parentName` (`IAdtTypedGroupLifecycle`).
- `ActivationPlan`'s group is `{ variant, references }` (`GroupActivation`), typed by the system
  type it is sent on: build it with `activationPlan(objects, variant)` from the write barrel.
- `TYPE_TO_FAMILY` (`@mcp-abap-adt/lib/handlers/write`), `toLowObjectType`, `toLockObjectType` and
  `LowObjectType` (`compact-shared`) are gone: route by `SINGLE_ACTIVATION_ROUTES`,
  `COMPACT_ACTIVATE_ROUTES` and the `COMPACT_*_KINDS` maps of `compact-shared`.
- `RunATC`, `GetATCRunStatus` and `GetATCFindings` are in `SystemHandlersGroup` (they were in
  `HighLevelHandlersGroup`): include it (`includeSystem: true`, the default) to keep them.
- `RuntimeRunClass`, `RuntimeRunProgram` and `RuntimeCreateProfilerTraceParameters` are in the
  new `RuntimeRunHandlersGroup` (they were in `SystemHandlersGroup`): add it to a hand-listed
  composition to keep them. `HandlerExporter` and `EmbeddableMcpServer` add it beside the system
  group. `expositionGroups(['readonly'])` serves neither them, their background runs nor the
  leftover-session logoff: add `high`. `SystemHandlersGroup` takes no second argument.

## The read-only binaries: nothing in them changes the system

`mcp-abap-adt-ro`, `-http-ro` and `-sse-ro` no longer serve `RuntimeRunClass`, `RuntimeRunProgram`,
`RuntimeCreateProfilerTraceParameters` or (stdio) `LogoffLeftoverSession`, and
`mcp-abap-adt-compact-ro` no longer serves `HandlerLeftoverSessionLogoff`: a run's code can change
data, a trace parameter set is created, and a logoff releases the session's locks. `RunATC` and its
readers stay. Use a full binary (`mcp-abap-adt`, `-http`, `-sse`, or `mcp-abap-adt-compact`) for
them; nothing else about the tools changed.

## Callers: the object types each argument accepts

Every argument that names an object type takes the codes its operation accepts on the declared
system type. A value outside them is refused before anything is sent, naming the list:

```text
objects[].type "DOMA/DM" is not one of: CLAS/OC, INTF/OI, …; nothing was sent
```

What changes for a caller on 21.x:

| You sent | 21.x read it as | 22.0 |
|---|---|---|
| `function`, `func` | the function group | the function module (`FUGR/FF`); on where-used name it `GROUP\|FM` |
| `functiongroup` | the function group | unchanged (`FUGR/F`) |
| `tabl`, `TABL` | `TABL/DT` | refused, naming `TABL/DT, TABL/DS`: send `table` / `TABL/DT` or `structure` / `stru` / `TABL/DS` |
| `prog`, `PROG` | `PROG/P` | refused, naming `PROG/P, PROG/I`: send `program` / `PROG/P` or `include` / `PROG/I` |
| `fugr`, `FUGR` | `FUGR/F` | refused, naming the function codes (on `GetIncludesList`, `FUGR` is `FUGR/F`) |
| `clas`, `intf`, `ddls`, `dtel`, `doma`, `ttyp`, `srvd`, `srvb`, `ddlx`, `bdef`, `dcls`, `xslt`, `devc` (any case) | its code | unchanged: read as the one code with that main type |
| `stru/ds`, `doma/dm`, `bdef/bd`, `ttyp/st`, `intf/if`, `stru/dt` | an old map's route, or a guessed address | refused: `stru`, `DOMA/DD`, `BDEF/BDO`, `TTYP/DA`, `INTF/OI`, `TABL/DS` |
| `PROGRAM`, `INCLUDE`, `CLASS`, `FUNCTION_GROUP` to `GetIncludesList` | the parent | refused: `PROG/P`, `PROG/I`, `CLAS/OC` / `CLAS`, `FUGR/F` / `FUGR` |
| a compact `object_type` the tool only refused (`HandlerActivate` `UNIT_TEST`, …) | refused by the handler | not in the enum |

A main type (the part of a code before its slash) stands for its code where exactly one accepted
code has it; where several share it, the refusal names them. A group activation of a function
module (`FUGR/FF`) or a function include (`FUGR/I`) names its group in `parentName`, or is refused.
`VIEW/DV`, a dictionary view, is a where-used and a group-activation code; the new friendly name
`dbview` stands for it (`view` stays a CDS view, `DDLS/DF`).

A value's case says what it is: in lower case a friendly name, in upper case a code, a main type or
a search name. `view` (and `View`) is a CDS view, `DDLS/DF`; `VIEW` is the dictionary views, the
search name whose list item is `VIEW/DV` — where-used and the activation tools read it as
`VIEW/DV`, the structure tools refuse it. Send `view` or `DDLS/DF` for a DDL source, `VIEW`,
`dbview` or `VIEW/DV` for a dictionary view. An upper-case value that is no word of the tables
(`CLASS`, `TABLE`) is still read as its name.

## Callers: the search filter is a search name

`SearchObject` and `HandlerSearch` `object_type` take the names of the system type's object types
list, the quick search's own filter: a main type (`CLAS`, `DEVC`, `TABL`), an alias of one subtype
(`STRU`, `DTAB`, `FUNC`, `INCL`) or a group (`ABAP_TEST_COCKPIT`). An ADT type code is still taken,
and sent as the name the search reads it as (`TABL/DS` as `STRU`, `CLAS/OC` as `CLAS`, `ENHO/XHH` as
`ENHO`): it selects what it selected. A friendly name (`class`, `table`, `view`, …) is read as its
code, and that code as its name. Anything else is refused before anything is sent:

```text
object_type "NOPE" is neither a name of this system's object types list nor an ADT type code or a name standing for one: it takes the search names (e.g. CLAS, DEVC, STRU), an ADT type code (e.g. TABL/DS) or a name standing for a code (e.g. class, structure); nothing was sent
```

| You sent | 21.x | 22.0 |
|---|---|---|
| a search name (`CLAS`, `STRU`, `ABAP_TEST_COCKPIT`, …) | sent as given | sent upper-cased |
| a code (`CLAS/OC`, `TABL/DS`, `FUGR/FF`, `ENHO/XHH`, …) | sent as given | sent as its name (`CLAS`, `STRU`, `FUNC`, `ENHO`) |
| `class`, `program`, `include`, `function`, `functiongroup`, `interface`, `package`, `table`, `structure`, `domain`, `dataelement`, `functionmodule`, `function_module` | sent as given | read as its code, sent as that code's name: `CLAS`, `PROG`, `INCL`, `FUNC`, `FUGR`, `INTF`, `DEVC`, `DTAB`, `STRU`, `DOMA`, `DTEL`, `FUNC`, `FUNC` |
| `view`, `View` | sent as given | a CDS view, `DDLS/DF`, sent as `DDLS` |
| `VIEW`, `dbview`, `VIEW/DV` | sent as given | the dictionary views, sent as `VIEW` |
| a code no list or table holds (`NOPE/XX`) | sent; the system answered no hits | refused |

## Callers on cloud

- `PROGRAM` is not offered by the compact writes (`HandlerCreate`, `HandlerUpdate`,
  `HandlerDelete`, `HandlerActivate`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate`), and
  `HandlerProfileRun`'s `target_type` is `CLASS`. A program is read, checked, compared and
  unit-tested on cloud: `GetProgram`, `CheckProgram`, the program version tools,
  `RunProgramUnitTest` and `HandlerGet` `PROGRAM` serve it.
- `RunATC` does not offer `program` or `program_include`: check the class, function group or
  package that holds the code.

## Callers: arguments now required

- `ValidateServiceBinding` `package_name` (also `HandlerValidate` `SERVICE_BINDING`, and compact `HandlerServiceBindingValidate`, whose schema now marks it required).
- `HandlerLock` `PACKAGE`: `super_package`.
- `HandlerValidate` `BEHAVIOR_DEFINITION`: `package_name`, `description`, `root_entity`,
  `implementation_type`; `BEHAVIOR_IMPLEMENTATION`: `package_name`; `METADATA_EXTENSION`:
  `description`, `package_name`.

Each was needed before; a call without it is now refused naming it, before anything is sent.

## Callers: activation answers

One object of `functiongroup`, `dataelement`, `view` or `stru` (or a main type such as `DTEL`) is
activated through its type's own activation and answers the activation verdict, as its code does;
in 21.x it started an activation run and answered `{ run_id }`. A caller that read `run_id` for
these reads the verdict instead.

## Callers: an ABAP Unit run read unfinished

`GetUnitTestResult` (and the library's `GetUnitTest`, `GetCdsUnitTest`, `GetCdsUnitTestResult`)
reads the run's status once, by long polling: ADT holds the read until the run has finished, so
the call lasts as long as the run. A run SAP answers `FINISHED` answers its result as before; a run
SAP answers with another status answers `{ success: true, run_id, status }`, with no result; a status
document with no `aunit:progress` status is a failure at the step `read status` carrying the
document. 21.x read the status at most 5 times and answered `finished: false` with `run_status` and
`message`. The run tools waiting for their run (`wait: true`, the default) answer an unfinished run
the same way.

- Start a long run with `wait: false` (the run tools: `RunUnitTest`, `RunCdsUnitTest`,
  `RunProgramUnitTest`, `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest`, `RunAbapUnit`) and
  read it by `run_id` with `GetUnitTestResult`, or `GetUnitTestStatus` for the status alone.
- Read an unfinished run from `status` (SAP's status value) in place of `finished: false`, and read
  on by `run_id`.

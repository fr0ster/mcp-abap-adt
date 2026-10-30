# Migrating to 22.0.0

22.0.0 takes what each tool offers and accepts from the ADT type tables of the declared system type
([#329](https://github.com/fr0ster/mcp-abap-adt/pull/329)): the tool set, each enum, each type
argument and each description are those of `onprem` or `cloud`, and the server never defaults the
system type. Go through the section that fits how you use the server; the
[CHANGELOG](../CHANGELOG.md) has every item.

The packages are the eighteen of 21.0.0, all at **22.0.0**. Their ADT dependencies change:

| Package | Was | Now |
|---|---|---|
| `@mcp-abap-adt/interfaces-adt` (`lib`, `compact-modify`) | `^20.1.0` | `^23.1.1` — the ADT type tables per system type |
| `@mcp-abap-adt/adt-clients` (`lib`) | `^37.2.0` | `^38.0.0` — a client per system type; friendly names are no longer read |
| `@mcp-abap-adt/adt-strategies` (`lib`) | `^0.15.0` | `^0.16.0` — answered types read against the tables |

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
  `createOnPremAdtClient()` the on-premise client, for the members on premise only.
- `TYPE_TO_FAMILY` (`@mcp-abap-adt/lib/handlers/write`), `toLowObjectType`, `toLockObjectType` and
  `LowObjectType` (`compact-shared`) are gone: route by `SINGLE_ACTIVATION_ROUTES`,
  `COMPACT_ACTIVATE_ROUTES` and the `COMPACT_*_KINDS` maps of `compact-shared`.
- `RunATC`, `GetATCRunStatus` and `GetATCFindings` are in `SystemHandlersGroup` (they were in
  `HighLevelHandlersGroup`): include it (`includeSystem: true`, the default) to keep them.

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
code has it; where several share it, the refusal names them.

## Callers on cloud

- `PROGRAM` is not offered by the compact writes (`HandlerCreate`, `HandlerUpdate`,
  `HandlerDelete`, `HandlerActivate`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate`), and
  `HandlerProfileRun`'s `target_type` is `CLASS`. A program is read, checked, compared and
  unit-tested on cloud: `GetProgram`, `CheckProgram`, the program version tools,
  `RunProgramUnitTest` and `HandlerGet` `PROGRAM` serve it.
- `RunATC` does not offer `program` or `program_include`: check the class, function group or
  package that holds the code.

## Callers: arguments now required

- `ValidateServiceBinding` `package_name` (also `HandlerValidate` `SERVICE_BINDING`).
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

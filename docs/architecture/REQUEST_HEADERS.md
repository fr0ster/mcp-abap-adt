# Request headers

adt-clients 36 takes the `Accept` and `Content-Type` of 32 members from the caller: each takes
`options.headers: IAdtHeaders` (`{ accept, contentType }`, both required) and sends exactly that
pair. The library (`@mcp-abap-adt/lib`) owns the pairs its handlers send: a default pair per
operation, and the pair a system named in a `406` / `415`, kept for that system. This document
describes the members, the default pairs, how the library sends and corrects them, and what an
embedder and a direct adt-clients consumer do.

Versions: `@mcp-abap-adt/adt-clients` `^36.0.2`, `@mcp-abap-adt/interfaces-adt` `^20.0.0`,
`@mcp-abap-adt/adt-strategies` `^0.13.0`, `@mcp-abap-adt/lib` 19.0.0. The source of every pair
below is adt-clients' `docs/usage/MIGRATION-36.md` (shipped in the package,
`node_modules/@mcp-abap-adt/adt-clients/docs/usage/MIGRATION-36.md`): its tables "The pairs 35.0.0 sent", "The completed pairs,
measured" and "The corrected pairs, measured".

## The members that take a header pair

| Contract | Members |
|---|---|
| `IAdtAbapGitClient` (`AdtAbapGitClient`) | `link`, `pull`, `checkExternalRepo` |
| `IAdtCreatable` | `create` |
| `IAdtUpdatable` | `update` |
| `IAdtMetadataUpdatable` | `updateMetadata` |
| `IAdtDeletable` | `delete`, `checkDeletion` |
| `IAdtCheckable` | `check` |
| `IAdtActivatable` | `activate` |
| `IFeatureToggleObject` | `checkState` |
| `IAdtTransportObjectActions` | `removeObject`, `addObject`, `createTask`, `changeTaskType` |
| `IAdtTransportMoveObjects` | `moveObjects` |
| `IAdtWhereUsed` | `getWhereUsed`, `getWhereUsedScope` |
| `IAdtVirtualFolders` | `getVirtualFoldersContents` |
| `IAdtRepositoryStructure` | `fetchNodeStructure` |
| `IAdtGroupLifecycle` | `activateObjectsGroup`, `checkDeletionGroup`, `deleteObjectsGroup` |
| `IAdtDataPreview` | `getSqlQuery`, `getTableContents` |
| `ITraceScheduling` (class and program executors) | `scheduleTrace` |
| `IAbapDebugger` | `setBreakpoints`, `getChildVariables`, `getVariables`, `syncBreakpoints`, `setDebuggerSettings` |
| `IAmdpDebugger` | `getDataPreview` |

Every other member keeps its own types; a read takes an optional `accept`.

## The default pairs

One pair per operation: the member and the object type it is called on, named
`<object>.<member>` (`class.create`, `utils.getWhereUsed`, `debugger.setBreakpoints`). They live in
one module, `src/lib/adtHeaders/defaultPairs.ts` (`DEFAULT_ADT_HEADERS`).

- **The defaults are the pairs of adt-clients' modern client** (`AdtClient`, no `contentTypes`
  option) — the newer media type versions where an object type has several. The "Source" column
  says `35.0.0` where the default is the pair that client sent.
- **Where 35.0.0 sent one header or none**, the default is the completed pair MIGRATION-36
  lists, sent to an on-premise system and accepted ("measured"); the column shows what 35.0.0
  sent. The feature toggle's `update` is completed but not measured (the system refused to create
  a toggle).
- **Where SAP refuses the pair 35.0.0 sent**, the default is the corrected pair MIGRATION-36
  lists ("The corrected pairs, measured"): the enhancement's `check`, whose
  `application/vnd.sap.adt.checkrun.v1+xml` pair is refused `415`. It goes with the request document
  adt-clients 36.0.2 sends, so the server requires `^36.0.2`.
- **Members with no pair** keep the headers adt-clients hard-codes, and have no entry here. Since
  36.0.2 the feature toggle's `validate` (`POST /sap/bc/adt/sfw/featuretoggles/validation`,
  `IAdtValidatable`, which takes no headers) sends Accept `application/vnd.sap.as+xml`, and the
  application log's `getObject` / `getSource` (`GET /sap/bc/adt/applicationlog/objects/{name}`,
  `…/source/main`) send Accept `application/vnd.sap.adt.blues.v1+xml` / `application/json`;
  `application/xml` was refused `406`. The server calls none of the three.
- **The older pairs** of the legacy client (`AdtClientLegacy`, `AdtContentTypesBase`, not
  Unicode — `application/vnd.sap.adt.oo.classes+xml`, `application/vnd.sap.adt.programs.programs+xml`,
  `application/vnd.sap.adt.functions.groups+xml`, `text/plain`, …) are not defaults: the library
  builds the modern client only. MIGRATION-36 lists them ("legacy" rows).

### Per object type

#### `abapGit`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `checkExternalRepo` | `application/abapgit.adt.repo.info.ext.response.v2+xml` | `application/abapgit.adt.repo.info.ext.request.v2+xml` | 35.0.0 |
| `link` | `application/abapgit.adt.repo.v3+xml` | `application/abapgit.adt.repo.v3+xml` | 35.0.0 |
| `pull` | `application/abapgit.adt.repo.v3+xml` | `application/abapgit.adt.repo.v3+xml` | 35.0.0 |

#### `accessControl`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.dclSource+xml` | `application/vnd.sap.adt.dclSource+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `amdpDebugger`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `getDataPreview` | `application/xml, application/vnd.sap.adt.datapreview.table.v1+xml` | `text/plain` | 35.0.0 |

#### `appendStructure`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.structures.v2+xml` | `application/vnd.sap.adt.structures.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `authorizationField`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml` | `application/vnd.sap.adt.blues.v1+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.blues.v1+xml` | `application/vnd.sap.adt.blues.v1+xml` | 35.0.0 |

#### `behaviorDefinition`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml` | `application/vnd.sap.adt.blues.v1+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `behaviorImplementation`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.oo.classes.v4+xml` | `application/vnd.sap.adt.oo.classes.v4+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `class`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.oo.classes.v4+xml` | `application/vnd.sap.adt.oo.classes.v4+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `classExecutor`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `scheduleTrace` | `application/xml` | `application/xml` | 35.0.0 |

#### `dataElement`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml` | `application/vnd.sap.adt.dataelements.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml` | `application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8` | 35.0.0 |

#### `ddl`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.ddlSource.v2+xml, application/vnd.sap.adt.ddlSource+xml` | `application/vnd.sap.adt.ddlSource+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `debugger`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `getChildVariables` | `application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables` | `application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables` | 35.0.0 |
| `getVariables` | `application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables` | `application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables` | 35.0.0 |
| `setBreakpoints` | `application/xml` | `application/xml` | 35.0.0 |
| `setDebuggerSettings` | `application/xml` | `application/xml` | 35.0.0 |
| `syncBreakpoints` | `application/xml` | `application/xml` | 35.0.0 |

#### `domain`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml` | `application/vnd.sap.adt.domains.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml` | `application/vnd.sap.adt.domains.v2+xml; charset=utf-8` | 35.0.0 |

#### `enhancement`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | corrected, measured (35.0.0 sent `application/vnd.sap.adt.checkrun.v1+xml` as both, refused `415`; adt-clients 36.0.2 sends the `chkrun:checkObjectList` document under this pair) |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.enh.enhoxhh.v3+xml` | `application/vnd.sap.adt.enh.enhoxhh.v3+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.enh.enhoxhh.v3+xml` | `application/vnd.sap.adt.enh.enhoxhh.v3+xml` | 35.0.0 |

#### `featureToggle`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `checkState` | `application/vnd.sap.adt.toggle.check.result.v1+asjson` | `application/vnd.sap.adt.toggle.check.parameters.v1+asjson` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml` | `application/vnd.sap.adt.blues.v1+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `application/vnd.sap.adt.toggle.content.v2+json` | `application/vnd.sap.adt.toggle.content.v2+json` | completed, not measured (35.0.0 sent Accept *(none)*, Content-Type `application/vnd.sap.adt.toggle.content.v2+json`) |
| `updateMetadata` | `application/vnd.sap.adt.blues.v1+xml` | `application/vnd.sap.adt.blues.v1+xml` | 35.0.0 |

#### `functionGroup`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.functions.groups.v3+xml` | `application/vnd.sap.adt.functions.groups.v3+xml` | measured (35.0.0 sent Accept *(none)*, Content-Type `application/vnd.sap.adt.functions.groups.v3+xml`) |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.functions.groups.v3+xml` | `application/vnd.sap.adt.functions.groups.v3+xml; charset=utf-8` | 35.0.0 |

#### `functionInclude`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.functions.fincludes.v2+xml, application/vnd.sap.adt.functions.fincludes+xml` | `application/vnd.sap.adt.functions.fincludes.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.functions.fincludes.v2+xml, application/vnd.sap.adt.functions.fincludes+xml` | `application/vnd.sap.adt.functions.fincludes.v2+xml` | 35.0.0 |

#### `functionModule`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.functions.fmodules+xml` | `application/vnd.sap.adt.functions.fmodules+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `include`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.programs.includes.v2+xml` | `application/vnd.sap.adt.programs.includes.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `interface`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.oo.interfaces.v5+xml` | `application/vnd.sap.adt.oo.interfaces.v5+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `localDefinitions`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `delete` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `localMacros`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `delete` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `localTestClass`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `delete` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `localTypes`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `delete` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `messageClass`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/xml` | `application/xml` | measured (35.0.0 sent Accept *(none)*, Content-Type `application/xml`) |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.mc.messageclass+xml` | `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8` | measured (35.0.0 sent Accept *(none)*, Content-Type `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8`) |

#### `messageClassMessage`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `create` | `application/vnd.sap.adt.mc.messageclass+xml` | `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8` | measured (35.0.0 sent Accept *(none)*, Content-Type `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8`) |
| `delete` | `application/vnd.sap.adt.mc.messageclass+xml` | `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8` | measured (35.0.0 sent Accept *(none)*, Content-Type `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8`) |
| `update` | `application/vnd.sap.adt.mc.messageclass+xml` | `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8` | measured (35.0.0 sent Accept *(none)*, Content-Type `application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8`) |

#### `metadataExtension`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.ddic.ddlx.v1+xml` | `application/vnd.sap.adt.ddic.ddlx.v1+xml` | 35.0.0 |
| `delete` | `application/xml` | `application/xml` | measured (35.0.0 sent Accept `application/xml`, Content-Type *(none)*) |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `package`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml` | `application/vnd.sap.adt.packages.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml` | `application/vnd.sap.adt.packages.v2+xml` | 35.0.0 |

#### `program`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.programs.programs.v2+xml` | `application/vnd.sap.adt.programs.programs.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `programExecutor`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `scheduleTrace` | `application/xml` | `application/xml` | 35.0.0 |

#### `request`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `addObject` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `text/plain` | 35.0.0 |
| `changeTaskType` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `text/plain` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `application/vnd.sap.adt.transportorganizer.v1+xml` | measured (35.0.0 sent Accept *(none)*, Content-Type *(none)*) |
| `create` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `text/plain` | 35.0.0 |
| `createTask` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `text/plain` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `application/vnd.sap.adt.transportorganizer.v1+xml` | measured (35.0.0 sent Accept `application/vnd.sap.adt.transportorganizer.v1+xml`, Content-Type *(none)*) |
| `moveObjects` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `text/plain` | 35.0.0 |
| `removeObject` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `text/plain` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.transportorganizer.v1+xml` | `application/vnd.sap.adt.transportorganizer.v1+xml` | 35.0.0 |

#### `scalarFunction`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml` | `application/vnd.sap.adt.blues.v1+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `scalarFunctionImplementation`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.blues.v2+xml` | `application/vnd.sap.adt.blues.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `application/json` | `application/json` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.blues.v2+xml` | `application/vnd.sap.adt.blues.v2+xml; charset=utf-8` | 35.0.0 |

#### `serviceBinding`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml` | `application/vnd.sap.adt.businessservices.servicebinding.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `application/xml, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage` | `application/xml` | 35.0.0 |

#### `serviceDefinition`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.ddic.srvd.v1+xml` | `application/vnd.sap.adt.ddic.srvd.v1+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `structure`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.structures.v2+xml` | `application/vnd.sap.adt.structures.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `application/xml, application/json, text/plain, */*` | `text/plain; charset=utf-8` | 35.0.0 |

#### `table`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml` | `application/vnd.sap.adt.tables.v2+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `tableType`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/vnd.sap.adt.activation+xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.tabletype.v1+xml` | `application/vnd.sap.adt.tabletype.v1+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `updateMetadata` | `application/vnd.sap.adt.tabletype.v1+xml` | `application/vnd.sap.adt.tabletype.v1+xml` | 35.0.0 |

#### `transformation`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activate` | `application/xml` | `application/xml` | 35.0.0 |
| `check` | `application/vnd.sap.adt.checkmessages+xml` | `application/vnd.sap.adt.checkobjects+xml` | 35.0.0 |
| `checkDeletion` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `create` | `application/vnd.sap.adt.transformations+xml` | `application/vnd.sap.adt.transformations+xml` | 35.0.0 |
| `delete` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `update` | `text/plain` | `text/plain; charset=utf-8` | 35.0.0 |

#### `utils`

| Member | Accept | Content-Type | Source |
|---|---|---|---|
| `activateObjectsGroup` | `application/xml` | `application/xml` | 35.0.0 |
| `checkDeletionGroup` | `application/vnd.sap.adt.deletion.check.response.v1+xml` | `application/vnd.sap.adt.deletion.check.request.v1+xml` | 35.0.0 |
| `deleteObjectsGroup` | `application/vnd.sap.adt.deletion.response.v1+xml` | `application/vnd.sap.adt.deletion.request.v1+xml` | 35.0.0 |
| `fetchNodeStructure` | `application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml` | `application/vnd.sap.as+xml; charset=UTF-8; dataname=null` | 35.0.0 |
| `getSqlQuery` | `application/xml, application/vnd.sap.adt.datapreview.table.v1+xml` | `text/plain; charset=utf-8` | 35.0.0 |
| `getTableContents` | `application/xml, application/vnd.sap.adt.datapreview.table.v1+xml` | `text/plain; charset=utf-8` | 35.0.0 |
| `getVirtualFoldersContents` | `application/vnd.sap.adt.repository.virtualfolders.result.v1+xml` | `application/vnd.sap.adt.repository.virtualfolders.request.v1+xml` | 35.0.0 |
| `getWhereUsed` | `application/vnd.sap.adt.repository.usagereferences.result.v1+xml` | `application/vnd.sap.adt.repository.usagereferences.request.v1+xml` | 35.0.0 |
| `getWhereUsedScope` | `application/vnd.sap.adt.repository.usagereferences.scope.response.v1+xml` | `application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml` | 35.0.0 |


## How the library sends them

- **One wrapper.** Every call the library makes to one of those members goes through
  `withAdtHeaders(context, operation, (headers) => member(…, { headers, … }))`
  (`src/lib/adtHeaders/withAdtHeaders.ts`): `headers` is the system's kept pair for `operation`,
  else its default. Structural sources over the members (the deletion check and delete, the
  where-used reads, the node structure reads, the class includes' writes) go through it too. A
  scan holds every call site to it (`scripts/lib/headerCallSites.ts`,
  `src/__tests__/unit/adtHeaders/headerCallSites.test.ts`).
- **The kept pairs** (`AdtHeaderPairs`, `src/lib/adtHeaders/AdtHeaderPairs.ts`): key = the system
  and the operation. The system is the target the call's destination points at — its URL, client
  and connection type — never the credentials: two destinations to the same system share their
  pairs. A connection without a destination (a host's injected one) is its own key. The value is
  the corrected pair. In memory; nothing expires; a later `406` / `415` on a kept pair corrects it
  again and overwrites it.
- **`406`**: the types SAP names in its body (`extractSupportedAccept(error)`, joined with `, `)
  become the `Accept`, the `Content-Type` as sent. **`415`**: the first type
  `extractSupportedContentType(error)` names becomes the `Content-Type`, the `Accept` as sent —
  SAP's list after `Supported Media Types:` in its exception document; a bare `Unsupported Media
  Type` names nothing, and the document's own `application/xml` is never read as a type. The
  same member call is made once more with the corrected pair, and the pair is kept. A `406` /
  `415` that names nothing, or names what was sent, is the call's answer; the second call's
  answer is the call's answer, whatever it is.
- **Internal batches** (`runPhase`, the reads sent in ADT batch envelopes): each part goes in
  with the kept pair, else the default. Right after a phase's envelope answers, before any answer
  is read, the parts SAP answered `406` / `415` go in one envelope of their own — only those
  parts, each recorded again by the same member call with the corrected pair, which is kept. One
  round: what that envelope answers is the call's answer.
- **`BatchEnd`** is unchanged: a call recorded in batch mode is made once, and its part's `406` /
  `415` is that call's answer.
- A member without a header pair (a search, a source or metadata read) is sent as it is; its
  `406` is its answer.

## When SAP checks the headers

SAP's ADT REST framework has no central header check. This was read from its ABAP sources through ADT on an on-premise system on 2026-10-18, and checked against an error corpus measured there the same day. adt-clients' `docs/usage/SAP_HEADER_CHECKS.md` has the classes, the methods and a source tag for each claim.

- **Before any header is read:** the logon (`401`), the authorization and CSRF checks (`403`), the routing (`404`, or `500` when the routed class cannot be created) and the method dispatch (`405`).
- **`415`:** raised when the resource reads its request body through the checking content handler. That is usually before any change.
- **`406`:** raised when the resource writes its response body through that handler. For a write, that is usually **after** the change.
  - Some resources check `Accept` first: the deletion endpoint and the `LOCK` action.
  - Many never check either header: activation, class create and the deletes of the generic object framework.
- **`500`:** a router failure or a dump. It says nothing about the headers.

For the correction above, this means:

- **A `415`:** the resend repeats a request whose body SAP refused before using it.
- **A `406` on a read:** the resend repeats the read.
- **A `406` on a write:** this usually means the write already ran and only its answer was refused. Making the same member call again makes the write a second time. The likely results are:
  - an object that already exists;
  - a second transport entry;
  - a lock that is already held.

  The corrected pair is still kept, so the next call of that operation sends it from the start.

## Embedders

An embedder that imports the library (`EmbeddableMcpServer`, `BaseMcpServer`, the handler
exports) gets the default pairs and the correction with every tool call, whatever connection it
passes in: the correction wraps the member calls, not the connection.

The kept pairs live in an `AdtHeaderPairs` owner the host creates and hands to its instances
(`adtHeaderPairs` option of `EmbeddableMcpServer` and `BaseMcpServer`, exported from
`@mcp-abap-adt/lib/embeddable` with its port type `AdtHeaderPort`). Pass every instance the same
`new AdtHeaderPairs()` to share what one learned; without it each instance keeps its own. The
library's Streamable HTTP and SSE servers create one per process and share it between their
instances; the stdio server's one instance keeps its own.

adt-clients' `enableAcceptCorrection` is gone (interfaces-adt 20): drop it.

### Using the header machinery directly: `@mcp-abap-adt/lib/adt-headers`

An embedder that calls adt-clients members itself — outside the library's tools — sends the same
pairs and applies the same correction through `@mcp-abap-adt/lib/adt-headers`:

- `DEFAULT_ADT_HEADERS` (with `AdtOperation`, `adtOperation`) — the starting pairs, one per
  operation. They were measured on one SAP version; what another version serves differently is
  learned by the correction below.
- `AdtHeaderPairs` / `AdtHeaderPort` — the corrected pairs, kept per system and operation, one
  owner per process; `adtSystemKey(settings)` — the system key the server uses (the URL without
  trailing slashes, the client, the connection type): two destinations to one system share it.
- `withAdtHeaders(context, operation, call)` — the call with the system's pair, sent once more
  with the type SAP named on a `406` / `415`, the corrected pair kept for the system.

```typescript
import {
  AdtHeaderPairs,
  adtSystemKey,
  withAdtHeaders,
} from '@mcp-abap-adt/lib/adt-headers';

const pairs = new AdtHeaderPairs(); // one per process
const port = pairs.forSystem(adtSystemKey({ url, client, connectionType: 'http' }));
const answer = await withAdtHeaders({ adtHeaders: port }, 'class.check', (headers) =>
  cls.check({ className }, undefined, { headers }),
);
```

What the correction can and cannot do:

- **It needs SAP to name the type**: a `406` with T100 `SADT_RESOURCE` 044 and its list of
  accepted types (`Accepted content types: …`), or a `415` with `Supported Media Types: …`.
- **A `406` with T100 `SADT_RESOURCE` 037 names nothing** and is not corrected: the refusal
  reaches the caller as SAP gave it. 037 is the not-acceptable exception's generic default
  text. Known places, from the endpoint corpus and the handlers' code: the GETs of the plugin
  ("blue") resources with a wrong Accept — behaviour definitions, service bindings, data
  elements, metadata extensions, domains, service definitions, structures, tables, table types,
  BAdI implementations, authorization fields, CDS scalar function definitions and
  implementation references, packages, feature toggles, the application log's objects (their
  properties and their `/source/main`) — and the runtime dump.
  The same 037 also answers a bad parameter value on some reads (an unknown object type in a
  search), so 037 is never read as an Accept mismatch.
- **The first call per system and operation may cost one refusal and one resend**; the kept pair
  is sent from the start after it.
- Seeding the kept pairs from a per-system header corpus (`header:discovery`) is planned after
  this release.

Left internal: the batch-mode scope (`adtCallScope`, `asRecordedCall`), the correction's own
reader (`correctedPair`) and the server's context reader (`adtHeadersOf`).

## Direct adt-clients consumers

adt-clients never retries: a `406` / `415` is the call's answer, nothing is sent again or
remembered. A consumer that calls the members itself passes the pair in every call:

```typescript
const headers = {
  accept: 'application/vnd.sap.adt.checkmessages+xml',
  contentType: 'application/vnd.sap.adt.checkobjects+xml',
};
const first = await cls.check({ className }, undefined, { headers });
```

To correct a request, read what SAP named and call the member again with the corrected pair:

```typescript
import {
  extractSupportedAccept,
  extractSupportedContentType,
} from '@mcp-abap-adt/adt-clients';

let answer = first;
if (!answer.ok) {
  const error = answer.getError();
  const status = error.response?.status;
  if (status === 406) {
    const types = extractSupportedAccept(error);
    if (types.length > 0) {
      answer = await cls.check({ className }, undefined, {
        headers: { ...headers, accept: types.join(', ') },
      });
    }
  } else if (status === 415) {
    const [contentType] = extractSupportedContentType(error);
    if (contentType !== undefined) {
      answer = await cls.check({ className }, undefined, {
        headers: { ...headers, contentType },
      });
    }
  }
}
```

`extractSupportedAccept` reads only SAP's list after `Accepted content types:` in the `406`
body (often empty); `extractSupportedContentType` reads only SAP's list after `Supported Media Types:` in the `415`
body (a bare `Unsupported Media Type` names nothing; the response's own `content-type`, the
exception document's `application/xml`, is not read). Keeping the
corrected pair is the consumer's.

## Exports

- `AdtHeaderPairs`, `AdtHeaderPort` — `@mcp-abap-adt/lib/embeddable`.
- `@mcp-abap-adt/lib/adt-headers` — `DEFAULT_ADT_HEADERS`, `AdtOperation`, `AdtObjectWith`,
  `adtOperation`, `AdtHeaderPairs`, `AdtHeaderPort`, `adtSystemKey`, `withAdtHeaders`,
  `AdtHeadersContext` (above).

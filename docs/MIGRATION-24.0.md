# Migrating to 24.0.0

24.0.0 lets the compiler check what it can ([#346](https://github.com/fr0ster/mcp-abap-adt/pull/346)):
a tool's arguments are a zod schema — their type and the one check of a call — and an entry carries
its call, typed by that schema. A client over MCP sees the tools as in 23.1.0, except the two
arguments that become required (below) and the arguments some tools now declare because their
handlers read them. An embedder that defines, registers or calls tools in TypeScript changes its
code. Go through the section that fits how you use the server; the [CHANGELOG](../CHANGELOG.md) has
every item.

The packages are the eighteen of 23.1.x, all at **24.0.0**, every sibling range at `^24.0.0`. The
ADT dependencies move to `@mcp-abap-adt/adt-clients` 43.0.1, `@mcp-abap-adt/adt-strategies` 0.19.1 and
`@mcp-abap-adt/interfaces-adt` 26 (`@mcp-abap-adt/compact-modify` too): what that changes for a
caller is under "Creates, validations, checks and requests: what adt-clients 43 sends" below. `@types/express` 5 is a dependency of `@mcp-abap-adt/lib` and
`@mcp-abap-adt/server-runtime` now.

## Embedders: a tool's `inputSchema` is a zod object

`ToolDefinition<S extends z.ZodObject>` (`@mcp-abap-adt/lib/handlers`) takes a `z.object({ … })`
as `inputSchema` — and so does `VariantToolDefinition.inputSchema`; 23.x typed it `any`, and the
server's own definitions held a JSON Schema. The JSON Schema a client lists is derived from the zod
schema (`z.toJSONSchema`), so a description goes on the field with `.describe`.

**What you do:** write your tools' schemas in zod (`zod` 4).

| 23.x | 24.0 |
|---|---|
| `inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name.' } }, required: ['name'] }` | `inputSchema: z.object({ name: z.string().describe('The name.') })` |
| an optional property with a default: `{ type: 'boolean', default: false, description: '…' }` | `z.boolean().default(false).optional().describe('…')` |
| `DETAIL_PROPERTY` (`@mcp-abap-adt/lib/compact-shared`) in `properties` | `...DETAIL_SHAPE` in the `z.object` |

## Embedders: an entry carries its call

`HandlerEntry<R>` is `{ toolDefinition, call(context, args), connectionless? }`; `handler` is
gone. `defineTool(definition, handler)` builds one, checked by the compiler: the handler takes the
call's `HandlerContext` and `z.output<typeof definition.inputSchema>`, and the entry answers what
the handler answers. Its `call` parses the arguments with the definition's schema and runs the
handler on the result; arguments that do not parse are refused — an `Error` whose message is
`Input validation error: Invalid arguments for tool <Tool>: <issue> at <path>`, one line per issue
— and the handler does not run. Over MCP the SDK has already parsed with the same schema, so
nothing changes there; a direct call (yours, or one of `HandlerExporter.getHandlerEntries()`) that
23.x ran on whatever it was given is refused now when its arguments do not parse, and a schema
default reaches the handler as if given.

`connectionless`, when a function, takes `ToolArgs` (`Readonly<Record<string, unknown>>`).

**What you do:**

| 23.x | 24.0 |
|---|---|
| `{ toolDefinition, handler: (context, args) => handleX(context, args) }` | `defineTool(toolDefinition, handleX)` — or `defineTool(toolDefinition, (context, args) => handleX(context, args))` |
| `{ toolDefinition, handler: (args) => handleX(this.context, args) }` (args-only) | `defineTool(toolDefinition, (context, args) => handleX(context, args))`: every handler takes the call's context |
| `entry.handler(context, args)`, `callInItsForm(entry.handler, context, args, inGroupContext)` | `await entry.call(context, args)` |
| `isArgsOnly(handler)` | nothing: there is one form |
| `registry.registerTool(server, name, definition, handler)` | `registry.registerTool(server, defineTool(definition, handler))` |

Removed from `@mcp-abap-adt/lib` and `@mcp-abap-adt/lib/handlers`: `ContextHandler`,
`ArgsOnlyHandler`, `ToolHandler`, `isArgsOnly`, `callInItsForm`, `InGroupContext`, `ArgsOf`. New:
`ToolArgs`, `invalidArgumentsWords` (the refusal's words, for a path of your own).

`registerTool` still registers only a tool one of the registry's groups holds, now found by the
entry's definition name.

## Embedders: the exported handlers take typed arguments

`handleGetTypeInfo`, `handleDescribeByList`, `handleGetAbapAST`, `handleGetAbapSemanticAnalysis`,
`handleGetAbapSystemSymbols`, `handleGetObjectNodeFromCache`, `handleGetEnhancements`,
`handleGetEnhancementImpl`, `handleGetEnhancementSpot` and `handleGetIncludesList` took
`args: any`; each takes its schema's output or its declared interface now, as the other handlers
did. A tool's handler type is `Parameters<typeof handleX>[1]`.

**What you do:** a direct call with an argument the tool does not declare, or of another type, no
longer compiles — pass what the schema declares (the tool's listed schema, or its
`TOOL_DEFINITION.inputSchema`). Calling through the tool's entry (`entry.call`) parses the
arguments first.

## Embedders: the answer helpers and the HTTP interfaces

- `return_error` (`@mcp-abap-adt/lib/utils`, it takes `unknown`) and `answerFailure`
  (`@mcp-abap-adt/lib/auth`) answer `FailureAnswer` (`isError: true`), a subtype of `McpResult`;
  `FailureAnswer` is a `type` now, not an interface. **What you do:** nothing to read it as an
  `McpResult`; code that extended the interface intersects the type instead.
- `return_response` takes `ResponseText` (`{ readonly data: string }`) and answers `McpResult`;
  it took an `AxiosResponse`. **What you do:** pass an answer whose `data` is the text.
- `IHttpApplication.use` is two overloads, `use(handler)` and `use(path, handler)`, as Express
  states it, so an Express application is an `IHttpApplication` without a cast; `RouteHandler`
  and `IHttpApplication` are typed by `@types/express` 5 (their express types read as `any` in
  23.x, which declared no `@types/express`). **What you do:** an application of your own whose
  `use` has another signature implements the two forms.
- The logger adapters take `unknown` beside the message, as `ILogger` does.

## Embedders: `isCloudConnection` is removed from `@mcp-abap-adt/lib/utils`

**Removed: `isCloudConnection`.** It reported an on-premise system with JWT authentication as
cloud: it read the credential type as the system kind. Keeping it would keep that wrong answer, so
it is removed although that is breaking. The program create, update and activate tools, which
refused on its answer, now run wherever they are offered.

**What you use instead:** the system kind you declared — `--system-type`, `SAP_SYSTEM_TYPE`, or
your own configuration.

**The rule:** nothing is derived from the authorization — not from the credential type, the token
or its claims; only the connection settings count. The one exception is the responsible user and
the system id, read from the system when its information is available, otherwise from the
settings.

## Callers of `CreateDomain`: `package_name` is required

`CreateDomain`'s schema requires `package_name` ("Package the domain is created in."); 23.x listed
it optional while its handler refused every call without it ("Package name is required"). A call
without it is refused by the schema now, naming the argument, and nothing is sent.

**What you do:** nothing for a call that worked — it passed `package_name`.

## compact callers: refusals in the target tool's words

A compact route calls its target tool's entry, so its arguments are parsed with the target's own
schema before anything is sent: `HandlerGet` (every read and part), `HandlerSearch`,
`HandlerWhereUsed`, `HandlerGetData`, and the creates and updates `HandlerCreate` and
`HandlerUpdate` delegate. An argument the target requires that the compact call left out (an
object's name, `run_id`), or a value outside a list the target declares (`package_type`), is
refused in the target schema's words, naming the target, where 23.x ran the
target's handler and refused in its words. `HandlerGet` part `virtual_folders` now sends
`with_versions` and `ignore_short_descriptions` as `false` where it sent none (`GetVirtualFolders`'
schema defaults).

**What you do:** nothing for a call that worked; a client that matched a refusal's words reads the
new ones.


## compact users: `HandlerCreate` `BEHAVIOR_IMPLEMENTATION` takes `behavior_definition`

A behavior implementation is created for a behavior definition, and adt-clients' create requires
it. `HandlerCreate` with `object_type: BEHAVIOR_IMPLEMENTATION` now takes `behavior_definition`, and
requires it with `class_name` and `package_name`: a call without it, or with an empty one, is
refused before any request is sent (`behavior_definition is required`). The create request on the
wire is the same as in 23.x.

**What you do:** pass the behavior definition's name.

| You sent | 24.0 |
|---|---|
| `HandlerCreate` `{ object_type: 'BEHAVIOR_IMPLEMENTATION', class_name, package_name, … }` | `HandlerCreate` `{ object_type: 'BEHAVIOR_IMPLEMENTATION', class_name, behavior_definition, package_name, … }` |

## Callers of `CreateClass`, `CreateProgram` and compact `HandlerCreate`: `abstract` and `program_type` are removed

`abstract` (CreateClass) and `program_type` (CreateProgram, HandlerCreate PROGRAM) are removed: SAP
ignores both on create; set them afterwards. Measured on premise: a class created with
`abstract="true"` is not abstract (the same body's `final` is taken), and a program created as a
module pool, a subroutine pool, `M` or `F` is an executable program. A class is abstract by its
source's `ABSTRACT`; a program's type is the program's attribute, changed after the create.

A call that still names `abstract` or `program_type` is refused before any request, as any
argument a create tool does not declare (below).

## Callers of the create tools: an argument the schema does not declare is refused

Compact `HandlerCreate` and every full `Create*` tool refuse an argument their schema does not
declare, before any request: `Input validation error: Invalid arguments for tool <Tool>:
<argument> is not an argument of <Tool>`. 23.x dropped such an argument without a word, so a
misspelt or removed option (`abstract`, `program_type`) went unnoticed. `HandlerCreate` hands a
type it delegates (`CLASS`, `PROGRAM`, `PACKAGE`, …) only the arguments the target tool declares.
The other tools keep dropping an undeclared argument.

**What you do:** pass only the arguments the create tool lists.

**What you do:** leave both out of the create; make the class abstract in its source (`UpdateClass`)
and change the program's type after it is created.

| You sent | 24.0 |
|---|---|
| `CreateClass` `{ class_name, package_name, abstract: true, … }` | `CreateClass` `{ class_name, package_name, … }`, then `UpdateClass` with a source declaring the class `ABSTRACT` |
| `CreateProgram` `{ program_name, package_name, program_type, … }` | `CreateProgram` `{ program_name, package_name, … }` (an executable program, as SAP made it before) |
| `HandlerCreate` `{ object_type: 'PROGRAM', program_name, program_type, … }` | `HandlerCreate` `{ object_type: 'PROGRAM', program_name, … }` |

## Creates, validations, checks and requests: what adt-clients 43 sends

- **A created object's original language (#348).** SAP takes it from the request's logon language
  and ignores the language written into the create body (measured on ABAP cloud). A create given
  `master_language` sends it as the request's `sap-language` beside the body's
  `adtcore:language` / `adtcore:masterLanguage`; given none, the session's language
  (`SAP_LANGUAGE`, or `x-sap-language` over HTTP) is sent the same way; with neither, the create
  states no language and SAP uses its logon language. 23.x wrote `EN` into the body when nothing
  was given, and SAP took the logon language anyway. The language must be one the system
  offers for logon: on an on-premise system offering only `EN` for logon, a create sent with `DE` was
  created in `EN`, and a logon in `ES` was refused as not an installed language (measured).
  **What you do:** to create in a given language, pass `master_language` or state the session's;
  a caller that counted on `EN` passes `master_language: 'EN'`.
- **A function module's validation takes a description.** `HandlerValidate` `FUNCTION_MODULE`
  without `description` is refused before anything is sent ("Function module validation requires
  description"): SAP answers `400` without one (measured). The other validations no longer send
  `description=undefined` when no description is given.
  **What you do:** pass the description the module will be created with.
- **`CreateTransport` `transport_type: 'customizing'` creates a Customizing Request** (`W`); it sent
  `T`, a Transport of Copies, which SAP refuses without a real target. `workbench` stays `K`.
  **What you do:** nothing; a caller that wanted a Transport of Copies creates it in the Transport
  Organizer.
- **`CheckTable` / `CheckTableLow` check `ddl_code`** when it is given: the source goes with the
  check run, as `CheckStructure`'s does; it was accepted and not sent.
- **`RuntimeGetProfilerTraceData` `statements` sends `auto_drill_down_threshold` as given**
  (`0.1` was sent as `0`).
- **A create's description, name, package and references are escaped** in the create body: a
  description holding `&`, `<` or `"` makes a well-formed request now.

## Former users of the low set: each low tool and its compact call today

The low set left the full binaries in 19.0.0 ([MIGRATION-19.0](MIGRATION-19.0.md), "The low set
leaves the full binaries", whose table shows the mapping as it was released). The table below is
the mapping as it stands now, tested against a stand-in (`src/__tests__/unit/lowToCompact.test.ts`)
with the low tool's requests captured before it was removed (`tools/low-to-compact.json`): the same
ADT requests, except where a row names an accepted difference.

<!-- low-to-compact table: rendered from tools/low-to-compact.json -->
| Low tool | Compact call | Difference / note |
|---|---|---|
| `ActivateBehaviorDefinitionLow` | `HandlerActivate` (object_type: BEHAVIOR_DEFINITION, object_name) | the same requests |
| `ActivateClassLow` | `HandlerActivate` (object_type: CLASS, object_name) | the same requests |
| `ActivateDataElementLow` | `HandlerActivate` (object_type: DATA_ELEMENT, object_name) | the same requests |
| `ActivateDdlLow` | `HandlerActivate` (object_type: DDL, object_name) | the same requests |
| `ActivateDomainLow` | `HandlerActivate` (object_type: DOMAIN, object_name) | the same requests |
| `ActivateFunctionGroupLow` | `HandlerActivate` (object_type: FUNCTION_GROUP, object_name) | the same requests |
| `ActivateFunctionModuleLow` | `HandlerActivate` (objects) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateInterfaceLow` | `HandlerActivate` (object_type: INTERFACE, object_name) | the same requests |
| `ActivateMetadataExtensionLow` | `HandlerActivate` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `ActivateObjectLow` | `HandlerActivate` (objects, preaudit) | the same requests |
| `ActivateProgramLow` | `HandlerActivate` (object_type: PROGRAM, object_name) | the same requests |
| `ActivateServiceBindingLow` | `HandlerActivate` (object_type: SERVICE_BINDING, object_name) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateServiceDefinitionLow` | `HandlerActivate` (object_type: SERVICE_DEFINITION, object_name) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateStructureLow` | `HandlerActivate` (object_type: STRUCTURE, object_name) | the same requests |
| `ActivateTableLow` | `HandlerActivate` (object_type: TABLE, object_name) | the same requests |
| `CheckBdefLow` | `HandlerCheckRun` (object_type: BEHAVIOR_DEFINITION, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckClassLow` | `HandlerCheckRun` (object_type: CLASS, object_name, version, source_code) | The low tool's source_code is HandlerCheckRun's source_code. |
| `CheckDataElementLow` | `HandlerCheckRun` (object_type: DATA_ELEMENT, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckDdlLow` | `HandlerCheckRun` (object_type: DDL, object_name, version, source_code) | The low tool's ddl_source is HandlerCheckRun's source_code. |
| `CheckDomainLow` | `HandlerCheckRun` (object_type: DOMAIN, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckFunctionGroupLow` | `HandlerCheckRun` (object_type: FUNCTION_GROUP, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckFunctionModuleLow` | `HandlerCheckRun` (object_type: FUNCTION_MODULE, object_name, version) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `CheckInterfaceLow` | `HandlerCheckRun` (object_type: INTERFACE, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckMetadataExtensionLow` | `HandlerCheckRun` (object_type: METADATA_EXTENSION, object_name, version) | the same requests |
| `CheckPackageLow` | `HandlerCheckRun` (object_type: PACKAGE, object_name) | the same requests |
| `CheckProgramLow` | `HandlerCheckRun` (object_type: PROGRAM, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckStructureLow` | `HandlerCheckRun` (object_type: STRUCTURE, object_name, version, source_code) | The low tool's ddl_code is HandlerCheckRun's source_code. |
| `CheckTableLow` | `HandlerCheckRun` (object_type: TABLE, object_name, version) | CheckTableLow accepted ddl_code and reporter and sent neither when this row was captured; since 24.0.0 (#9) CheckTable sends ddl_code with the check run. HandlerCheckRun TABLE takes no source_code: it checks the saved version. |
| `CreateBehaviorDefinitionLow` | `HandlerCreate` (object_type: BEHAVIOR_DEFINITION, name, description, package_name, transport_request, implementation_type) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateBehaviorImplementationLow` | `HandlerCreate` (object_type: BEHAVIOR_IMPLEMENTATION, class_name, behavior_definition, description, package_name, transport_request), then `HandlerLock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name), then `HandlerUpdate` (object_type: BEHAVIOR_IMPLEMENTATION, class_name, implementation_code, transport_request, lock_handle), then `HandlerUnlock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name, lock_handle) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. With implementation_code, four compact calls, one request each: the create, the lock, the write of the implementations include under the lock_handle the lock answered, the unlock. |
| `CreateClassLow` | `HandlerCreate` (object_type: CLASS, class_name, description, package_name, transport_request, superclass, final, create_protected) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateDataElementLow` | `HandlerCreate` (object_type: DATA_ELEMENT, data_element_name, description, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateDdlLow` | `HandlerCreate` (object_type: DDL, ddl_name, description, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateDomainLow` | `HandlerCreate` (object_type: DOMAIN, domain_name, description, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateFunctionGroupLow` | `HandlerCreate` (object_type: FUNCTION_GROUP, function_group_name, description, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. On the 400 "Interface SAPL… has not been created" the low tool read the group back; HandlerCreate answers the 400 as it came — read the group with HandlerGet part metadata to see whether it landed. |
| `CreateFunctionModuleLow` | `HandlerCreate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, description, transport_request) | the same requests |
| `CreateInterfaceLow` | `HandlerCreate` (object_type: INTERFACE, interface_name, description, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateMetadataExtensionLow` | `HandlerCreate` (object_type: METADATA_EXTENSION, name, description, package_name, transport_request, master_language) | **accepted:** 24.0.0 (#348): a create given a language sends it as `sap-language` too — SAP takes the original language from the logon language, not from the body; the body writes `adtcore:language` and `adtcore:masterLanguage` together, after the description. |
| `CreatePackageLow` | `HandlerCreate` (object_type: PACKAGE, package_name, super_package, description, package_type, software_component, transport_layer, transport_request, record_changes, application_component) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateProgramLow` | `HandlerCreate` (object_type: PROGRAM, program_name, description, package_name, transport_request, application) | **accepted:** 24.0.0: the create takes no program type, which SAP ignores on create (measured), and given no language states none (#348) — the low create wrote `program:programType`, and `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes none of them. |
| `CreateStructureLow` | `HandlerCreate` (object_type: STRUCTURE, structure_name, description, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. HandlerCreate STRUCTURE sends the create alone; the fields reach the structure through a later write (HandlerLock, HandlerUpdate with the lock_handle, HandlerUnlock). |
| `CreateTableLow` | `HandlerCreate` (object_type: TABLE, table_name, package_name, transport_request) | **accepted:** 24.0.0 (#348): a create given no language states none — the low create wrote `adtcore:language` and `adtcore:masterLanguage` as `EN`; the compact create writes neither, and SAP takes its logon language. |
| `CreateTransportLow` | `HandlerTransportCreate` (description, transport_type) | the same requests |
| `DeleteBehaviorDefinitionLow` | `HandlerDelete` (object_type: BEHAVIOR_DEFINITION, behavior_definition_name, transport_request) | the same requests |
| `DeleteClassLow` | `HandlerDelete` (object_type: CLASS, class_name, transport_request) | the same requests |
| `DeleteDataElementLow` | `HandlerDelete` (object_type: DATA_ELEMENT, data_element_name, transport_request) | the same requests |
| `DeleteDdlLow` | `HandlerDelete` (object_type: DDL, ddl_name, transport_request) | the same requests |
| `DeleteDomainLow` | `HandlerDelete` (object_type: DOMAIN, domain_name, transport_request) | the same requests |
| `DeleteFunctionGroupLow` | `HandlerDelete` (object_type: FUNCTION_GROUP, function_group_name, transport_request) | the same requests |
| `DeleteFunctionModuleLow` | `HandlerDelete` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, transport_request) | the same requests |
| `DeleteInterfaceLow` | `HandlerDelete` (object_type: INTERFACE, interface_name, transport_request) | the same requests |
| `DeleteMetadataExtensionLow` | `HandlerDelete` (object_type: METADATA_EXTENSION, metadata_extension_name, transport_request) | the same requests |
| `DeletePackageLow` | `HandlerDelete` (object_type: PACKAGE, package_name, transport_request) | The deletion request alone, as the low tool sent it, on the call's connection. The low tool's force_new_connection has no compact counterpart: compact locks and writes a package in an ABAP session of its own, so the call's session never holds a saved package; the full set's DeletePackage keeps force_new_connection. |
| `DeleteProgramLow` | `HandlerDelete` (object_type: PROGRAM, program_name, transport_request) | the same requests |
| `DeleteStructureLow` | `HandlerDelete` (object_type: STRUCTURE, structure_name, transport_request) | the same requests |
| `DeleteTableLow` | `HandlerDelete` (object_type: TABLE, table_name, transport_request) | the same requests |
| `GetNodeStructureLow` | `HandlerGet` (part: node_structure, object_adt_type, object_name, node_id, with_short_descriptions) | A package's (DEVC/K) blank body: the low tool read the package's metadata to tell an empty package from an absent one; HandlerGet answers the empty listing with blank stating both readings, one request — read the package with HandlerGet part metadata to know which holds. |
| `GetObjectStructureLow` | `HandlerGet` (part: object_structure, object_adt_type, object_name) | the same requests |
| `GetVirtualFoldersLow` | `HandlerGet` (part: virtual_folders, object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions) | the same requests |
| `LockBehaviorDefinitionLow` | `HandlerLock` (object_type: BEHAVIOR_DEFINITION, object_name) | the same requests |
| `LockBehaviorImplementationLow` | `HandlerLock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name) | the same requests |
| `LockClassLow` | `HandlerLock` (object_type: CLASS, object_name) | the same requests |
| `LockDataElementLow` | `HandlerLock` (object_type: DATA_ELEMENT, object_name) | the same requests |
| `LockDdlLow` | `HandlerLock` (object_type: DDL, object_name) | the same requests |
| `LockDomainLow` | `HandlerLock` (object_type: DOMAIN, object_name) | the same requests |
| `LockFunctionGroupLow` | `HandlerLock` (object_type: FUNCTION_GROUP, object_name) | the same requests |
| `LockFunctionModuleLow` | `HandlerLock` (object_type: FUNCTION_MODULE, object_name) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `LockInterfaceLow` | `HandlerLock` (object_type: INTERFACE, object_name) | the same requests |
| `LockMetadataExtensionLow` | `HandlerLock` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `LockPackageLow` | `HandlerLock` (object_type: PACKAGE, object_name, super_package) | the same requests |
| `LockProgramLow` | `HandlerLock` (object_type: PROGRAM, object_name) | the same requests |
| `LockStructureLow` | `HandlerLock` (object_type: STRUCTURE, object_name) | the same requests |
| `LockTableLow` | `HandlerLock` (object_type: TABLE, object_name) | the same requests |
| `UnlockBehaviorDefinitionLow` | `HandlerUnlock` (object_type: BEHAVIOR_DEFINITION, object_name, lock_handle) | the same requests |
| `UnlockClassLow` | `HandlerUnlock` (object_type: CLASS, object_name, lock_handle) | the same requests |
| `UnlockDataElementLow` | `HandlerUnlock` (object_type: DATA_ELEMENT, object_name, lock_handle) | the same requests |
| `UnlockDdlLow` | `HandlerUnlock` (object_type: DDL, object_name, lock_handle) | the same requests |
| `UnlockDomainLow` | `HandlerUnlock` (object_type: DOMAIN, object_name, lock_handle) | the same requests |
| `UnlockFunctionGroupLow` | `HandlerUnlock` (object_type: FUNCTION_GROUP, object_name, lock_handle) | the same requests |
| `UnlockFunctionModuleLow` | `HandlerUnlock` (object_type: FUNCTION_MODULE, object_name, lock_handle) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `UnlockInterfaceLow` | `HandlerUnlock` (object_type: INTERFACE, object_name, lock_handle) | the same requests |
| `UnlockMetadataExtensionLow` | `HandlerUnlock` (object_type: METADATA_EXTENSION, object_name, lock_handle) | the same requests |
| `UnlockPackageLow` | `HandlerUnlock` (object_type: PACKAGE, object_name, lock_handle) | the same requests |
| `UnlockProgramLow` | `HandlerUnlock` (object_type: PROGRAM, object_name, lock_handle) | the same requests |
| `UnlockStructureLow` | `HandlerUnlock` (object_type: STRUCTURE, object_name, lock_handle) | the same requests |
| `UnlockTableLow` | `HandlerUnlock` (object_type: TABLE, object_name, lock_handle) | the same requests |
| `UpdateBehaviorDefinitionLow` | `HandlerUpdate` (object_type: BEHAVIOR_DEFINITION, name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateClassLow` | `HandlerUpdate` (object_type: CLASS, class_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateDataElementLow` | `HandlerGet` (object_type: DATA_ELEMENT, data_element_name, part: metadata), then `HandlerUpdate` (object_type: DATA_ELEMENT, data_element_name, source_code, lock_handle) | **accepted:** Since 23.0.0 every read names its version: the compact HandlerGet part metadata reads /sap/bc/adt/ddic/dataelements/dtel_a?version=active (its default); the low tool's read sent no version, which ADT answers from the working area. Two compact calls, one request each: HandlerGet part metadata reads the document; HandlerUpdate writes the changed document, whole, under the lock_handle. |
| `UpdateDdlLow` | `HandlerUpdate` (object_type: DDL, ddl_name, ddl_source, lock_handle, transport_request) | the same requests |
| `UpdateDomainLow` | `HandlerGet` (object_type: DOMAIN, domain_name, part: metadata), then `HandlerUpdate` (object_type: DOMAIN, domain_name, source_code, lock_handle) | **accepted:** Since 23.0.0 every read names its version: the compact HandlerGet part metadata reads /sap/bc/adt/ddic/domains/dom_a?version=active (its default); the low tool's read sent no version, which ADT answers from the working area. Two compact calls, one request each: HandlerGet part metadata reads the document; HandlerUpdate writes the changed document, whole, under the lock_handle. |
| `UpdateFunctionModuleLow` | `HandlerUpdate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateInterfaceLow` | `HandlerUpdate` (object_type: INTERFACE, interface_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateMetadataExtensionLow` | `HandlerUpdate` (object_type: METADATA_EXTENSION, name, source_code, lock_handle, transport_request) | the same requests |
| `UpdatePackageLow` | `HandlerGet` (object_type: PACKAGE, package_name, part: metadata), then `HandlerUpdate` (object_type: PACKAGE, package_name, source_code, lock_handle, transport_request) | Two compact calls, one request each: HandlerGet part metadata reads the document; HandlerUpdate writes the changed document, whole, under the lock_handle. |
| `UpdateProgramLow` | `HandlerUpdate` (object_type: PROGRAM, program_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateStructureLow` | `HandlerUpdate` (object_type: STRUCTURE, structure_name, ddl_code, lock_handle, transport_request) | the same requests |
| `UpdateTableLow` | `HandlerUpdate` (object_type: TABLE, table_name, ddl_code, lock_handle, transport_request) | the same requests |
| `ValidateBehaviorDefinitionLow` | `HandlerValidate` (object_type: BEHAVIOR_DEFINITION, object_name, root_entity, implementation_type, package_name, description) | ValidateBehaviorDefinitionLow validated the root entity's name; object_name carries it. |
| `ValidateBehaviorImplementationLow` | `HandlerValidate` (object_type: BEHAVIOR_IMPLEMENTATION, object_name, behavior_definition, package_name, description) | the same requests |
| `ValidateClassLow` | `HandlerValidate` (object_type: CLASS, object_name, package_name, description, superclass) | the same requests |
| `ValidateDataElementLow` | `HandlerValidate` (object_type: DATA_ELEMENT, object_name, description, package_name) | the same requests |
| `ValidateDdlLow` | `HandlerValidate` (object_type: DDL, object_name, package_name, description) | the same requests |
| `ValidateDomainLow` | `HandlerValidate` (object_type: DOMAIN, object_name, description, package_name) | the same requests |
| `ValidateFunctionGroupLow` | `HandlerValidate` (object_type: FUNCTION_GROUP, object_name, package_name, description) | the same requests |
| `ValidateFunctionModuleLow` | `HandlerValidate` (object_type: FUNCTION_MODULE, object_name, description) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `ValidateInterfaceLow` | `HandlerValidate` (object_type: INTERFACE, object_name, package_name, description) | the same requests |
| `ValidateMetadataExtensionLow` | `HandlerValidate` (object_type: METADATA_EXTENSION, object_name, package_name, description) | the same requests |
| `ValidatePackageLow` | `HandlerValidate` (object_type: PACKAGE, object_name, super_package) | the same requests |
| `ValidateProgramLow` | `HandlerValidate` (object_type: PROGRAM, object_name, package_name, description) | the same requests |
| `ValidateStructureLow` | `HandlerValidate` (object_type: STRUCTURE, object_name, package_name, description) | the same requests |
| `ValidateTableLow` | `HandlerValidate` (object_type: TABLE, object_name, package_name, description) | the same requests |
<!-- end of the low-to-compact table -->

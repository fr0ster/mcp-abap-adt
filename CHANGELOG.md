# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [24.0.0] - 2026-11-12

A major ([#346](https://github.com/fr0ster/mcp-abap-adt/pull/346)): what the compiler can check is checked by the compiler. A tool's arguments are a zod schema, which is both their type and the one check of a call; an entry carries its call, typed by that schema; every production source is free of type assertions, `any`, non-null `!` and suppression comments, and a gate keeps it so. Over MCP the tools list as in 23.1.0, except the arguments named below and the data tools, off unless enabled (below); what changes is the TypeScript surface an embedder compiles against, and the answers to arguments that never reached a handler as declared. Every breaking item has its **Migrating:** note, and [the 24.0 migration note](docs/MIGRATION-24.0.md) collects them. The eighteen packages are all at 24.0.0, every sibling range at `^24.0.0`; the ADT dependencies move to `@mcp-abap-adt/adt-clients` 45, `@mcp-abap-adt/adt-strategies` 0.22 and `@mcp-abap-adt/interfaces-adt` 27, the connection to `@mcp-abap-adt/connection` 22 with `@mcp-abap-adt/interfaces-auth-sap` 4, `@mcp-abap-adt/interfaces-adt-connection` 4.1 and the optional `@mcp-abap-adt/sap-rfc-lite` 0.4, and the destination path to `@mcp-abap-adt/auth-broker` 5.1, `@mcp-abap-adt/auth-stores` 5.1 and `@mcp-abap-adt/interfaces-auth-broker` 1.4 (below). An RFC destination states its own address: see "Changed — breaking for an RFC destination".

### Changed — breaking for a caller of `GetSqlQuery`, `GetTableContents` and compact `HandlerGetData`: off by default

- **The data tools are off unless enabled.** `GetSqlQuery` (a freestyle ABAP SQL `SELECT`), `GetTableContents` (a table's or CDS view's rows) and their compact form `HandlerGetData` read business data through ADT's data preview. Every binary — full, `-ro`, compact and compact `-ro`, over stdio, Streamable HTTP and SSE — leaves them out unless it is started with `--enable-data-tools`, `MCP_ENABLE_DATA_TOOLS=true` or `enable-data-tools: true` in its `--conf` file: one shared row in every binary's table, read CLI over the environment over YAML, default `false`, a value other than empty, null, `true` or `false` refused at startup (an empty value or YAML null counts as not given, as for every row, and the next source decides), a destination's `.env` not read for it. On Streamable HTTP and SSE it is a start parameter of the server; no request header turns it on. Without it the tools are absent: not in `tools/list`, and a call is answered as an unknown tool. The reason is SAP's API Policy FAQ v1.3 (June 2026), Q33, informational and non-binding ([PDF](https://d.dam.sap.com/x/UL9AiqH/SAP_API_Policy_FAQ_v1.3_June.pdf)): ADT APIs are not intended for reading application tables, exporting business data or running SQL against SAP systems. Whether to enable them is the customer's decision. Other tools that can reach business data (the debugger's variable reads and AMDP table preview, memory snapshots, dumps, the gateway error log, traces, the class and program runs) are served as before; the README names them. **Migrating:** start each binary that must serve them with the flag in one of its forms (MIGRATION-24.0, "Callers of `GetSqlQuery`, `GetTableContents` and `HandlerGetData`: off unless enabled").
- **Every binary's help** names the data tools in its TOOLS section and the flag under `DATA TOOLS`, with the FAQ and the customer's decision; the tool pages list the three tools marked opt-in, and the twelve registry manifests name `MCP_ENABLE_DATA_TOOLS`.
- **Hard mode** (the live tests) starts every binary with `--enable-data-tools`; a run against an HTTP server already running serves the data tools only if that server was started with it.

### Changed — breaking for an embedder of the handler groups and the tool sets: the data tools are opt-in

- **The data tools have groups of their own.** `GetSqlQuery` leaves `SystemHandlersGroup` and `GetTableContents` leaves `ReadOnlyHandlersGroup` for the new `DataHandlersGroup` (`@mcp-abap-adt/lib/handlers`); `HandlerGetData` leaves `compactReadOnlyEntries` and so `CompactReadOnlyHandlersGroup` for the new `compactDataEntries` and `CompactDataHandlersGroup` (`@mcp-abap-adt/compact-readonly-entries`). The handlers and `READ_DEFINITIONS` are exported as before. **Migrating:** add `DataHandlersGroup` or `CompactDataHandlersGroup` where you serve the data tools.
- **`EmbeddableMcpServer`** takes `data` in `exposition`, not in the default `['readonly', 'high']`; **`HandlerExporter`** takes `includeData`, read as `=== true` (its other `include…` options stay on unless `false`). `HandlerSet` and `registryForExposition` / `expositionGroups` take `data`. **Migrating:** `exposition: [..., 'data']` or `includeData: true` to serve them.
- **The tool sets take what is served.** `ToolSet.groups(context, transport, served)`, `registryOf(toolSet, transport, served)` and `streamableHttpSurface(toolSet, served)` take a required `ServedTools` (`{ dataTools: boolean }`, `@mcp-abap-adt/lib/tool-set`); `CompactHalves` gains `data` and `compactReadOnlyToolSetOf` takes `{ readOnly, data }` (`CompactReadOnlyHalf`). `IServerConfig` gains `enableDataTools`; `@mcp-abap-adt/lib/config` exports `ENABLE_DATA_TOOLS_ROW` and its three names. **Migrating:** pass `{ dataTools: config.enableDataTools === true }` where you build a set's registry, and the compact sets' `data` builder.

### Changed — breaking for an RFC destination

- **An RFC destination states its address, its client and its logon language, and no URL.** The address is an application server (`SAP_ASHOST` and `SAP_SYSNR`) or a message server (`SAP_MSHOST` with `SAP_MSSERV` or `SAP_SYSID`, or both, and `SAP_GROUP`); `SAP_SAPROUTER` goes with either; `SAP_CLIENT` and `SAP_LANGUAGE` are required. Nothing is derived from a URL — no host from `SAP_URL`, no system number from its port (`80NN` → `NN` is gone), and `SAP_SYSNR` is read from the `.env` like the rest — and nothing has a default: no client `000`, no language `EN`, no group `PUBLIC`. **Migrating:** remove `SAP_URL`; add `SAP_ASHOST` (the host of the URL), `SAP_SYSNR` (the two digits of its port, or the `SAP_SYSNR` you had in the environment), `SAP_CLIENT` and `SAP_LANGUAGE` if you relied on the defaults, `SAP_GROUP` if you relied on `PUBLIC` (MIGRATION-24.0, "RFC destinations: the address is stated").
- **Every source, one precedence.** Each of the nine keys — `ashost`, `sysnr`, `mshost`, `msserv`, `sysid`, `group`, `saprouter`, `client`, `language` — is a CLI option (`--ashost`, …, `--client`, `--language` are new), an environment variable and a YAML key, read in one order: the CLI, then the process's own environment, then the destination's `.env` (then a service key's fallback), then YAML; trimmed, a blank value unset.
- **A destination's `.env` no longer feeds the process environment** for the client, the language or the RFC address: only `SAP_CONNECTION_TYPE` and `SAP_SYSTEM_TYPE` join it. The master language of created objects is the destination's `SAP_LANGUAGE` in effect, and two destinations in one process keep their own values.
- **An object created in another master language over RFC gets that language** (`@mcp-abap-adt/connection` 20.1): a create whose `master_language` differs from the destination's `SAP_LANGUAGE` runs on an RFC conversation of its own, logged on in that language, and the object is created in it, as over HTTP. The language must be one the system offers for logon.
- **Refused at startup, before any connection opens, naming keys and never a value:** an HTTP destination stating an RFC address key (`SAP_SAPROUTER` included); an RFC destination stating `SAP_URL` (or `XSUAA_MCP_URL`) in its own `.env` — a service key's URL is not read over RFC, and the process environment's `SAP_URL` never; keys of both addresses; no address; an incomplete one; no `SAP_CLIENT` or `SAP_LANGUAGE`; ABAP Cloud over RFC; a client certificate over RFC. The first failing step answers, naming every faulty key of it. The connection type is decided before the settings are read.
- **The HTTP and SSE binaries** refuse `--ashost`, `--sysnr`, `--client`, `--language` and their YAML keys as stdio-only, beside the message-server options.
- **Over RFC the start summary shows the address** where it shows the URL over HTTP.

### Changed — breaking for an embedder: the RFC address and `getBaseUrl()`

- **`ISapConfig` (`SapConfig`) is a union by `connectionType`** (`@mcp-abap-adt/interfaces-auth-sap` 4, `@mcp-abap-adt/connection` 20): `ISapHttpConfig` carries the `url` (an absent `connectionType` is HTTP), `ISapRfcConfig` one address, `client` and `language`, and no `url`. **Migrating:** narrow on `connectionType` before reading `url`; build a config inside the branch that narrowed it, as a literal of its shape, omitting a key that does not belong — never setting it to `undefined` —, with no cast and no spread of the other shape. An embedder that reads its configuration from outside the type system validates it before it builds one.
- **`IAbapConnection.getBaseUrl()` answers `string | undefined`** (`@mcp-abap-adt/interfaces-adt-connection` 4): `undefined` over RFC. The server's forwarders pass it through, typed. **Migrating:** a caller narrows.
- **`BackgroundRunCaller` is `{ system, client, user }`** (`url` is gone): a destination's system is its system key; an injected connection that answers a URL is `["http", <URL>, ""]`, one that answers none takes the new `EmbeddableMcpServerOptions.system`, and without it background runs are refused (`background_runs_unavailable`, fixed words naming `system`). A run on a fresh connection keeps the identity computed from the injected one. **Migrating:** a store keyed by the caller keys by `system`; an embedder with an RFC connection states `system`.
- **The system key is per wire:** HTTP `["http", <URL>, <client>]`, RFC `["rfc", ashost, sysnr, mshost, msserv, sysid, group, saprouter, client]`; it keys the header pairs, the system information and the background runs.
- **`GetServiceBindingPreviewUrl` over RFC** answers `service_url`, `metadata_url` and `preview_url` as paths and query (a service URL the system answered absolute is kept), with `origin: 'unknown'` and a note to prefix the system's HTTP origin.
- **`credentialFromSapConfig` refuses a client certificate on an RFC config** before any provider is built; `credentialFromHeaders` answers an `ISapHttpConfig`.
- **`@mcp-abap-adt/lib/config`:** `applyMessageServerFields`, `MESSAGE_SERVER_ENV`, `MESSAGE_SERVER_FIELDS`, `MessageServerField` and `rfcAddressRefusalOf` are removed (`RfcAddressRefusal` and `rfcAddressRefusalFor` with them); `DESTINATION_KEYS`, `DESTINATION_KEY_ENV`, `RFC_ADDRESS_KEYS`, `checkDestinationStatement`, `rfcConfigOf`, `destinationAddressWords` and `destinationAddressHint` are new. `@mcp-abap-adt/core` keeps 19.1.0's `MESSAGE_SERVER_ROWS` (the message server's five rows) and `effectiveMessageServer`, which the launcher no longer calls. **Migrating:** read the keys with the new list; check a destination with `checkDestinationStatement`.
- **`IAuthBrokerFactoryConfig`** takes `destinationKeys` (`{ overMeans, underMeans }`) and `systemType` where it took `mshost`, …, `saprouter`; `DestinationSystemContext` carries `masterLanguage`.

### Changed — breaking for an embedder that defines, registers or calls tools (`@mcp-abap-adt/lib/handlers`)

- **A tool definition's `inputSchema` is a zod object.** `ToolDefinition<S extends z.ZodObject>` (and `VariantToolDefinition.inputSchema`) take a `z.object({ … })`, its descriptions written with `.describe`; 23.x typed it `any` and its tools held a JSON Schema. The listed JSON Schema is derived from it (`z.toJSONSchema`), and a test compares every tool's listing with a fixture captured before the change: identical, except the arguments named under Fixed. **Migrating:** write your definitions' schemas in zod (`zod` 4, already a dependency).
- **An entry carries its call.** `HandlerEntry<R>` is `{ toolDefinition, call(context, args), connectionless? }`; `handler` is gone. `call` takes the call's context and its arguments (`ToolArgs`, `Readonly<Record<string, unknown>>`), parses them with the definition's schema and runs the handler on the typed result. `connectionless`, when a function, takes `ToolArgs`. **Migrating:** call `entry.call(context, args)` where you called `entry.handler(context, args)` or `callInItsForm(…)`.
- **`defineTool(definition, handler)` types the handler by the schema:** the handler takes `(context, z.output<typeof definition.inputSchema>)`, and the entry answers what the handler answers (`HandlerEntry<R>`). Arguments that do not parse are refused — `Input validation error: Invalid arguments for tool <Tool>: <issue> at <path>`, the SDK's words, thrown as an `Error` — and the handler does not run. Over MCP the SDK has refused them already with the same schema; a direct `entry.call` (an embedder's, `HandlerExporter.getHandlerEntries()`) is refused now where 23.x ran the handler on whatever it was given. **Migrating:** build entries with `defineTool`; pass a direct call the arguments the schema declares.
- **`registerTool(server, entry)`.** `IHandlersRegistry.registerTool` (and `CompositeHandlersRegistry`) takes the entry, where it took `(server, toolName, toolDefinition, handler)`. **Migrating:** `registry.registerTool(server, defineTool(definition, handler))`.
- **Removed:** `ContextHandler`, `ArgsOnlyHandler`, `ToolHandler`, `isArgsOnly`, `callInItsForm`, `InGroupContext` and `ArgsOf` (from `@mcp-abap-adt/lib` and `@mcp-abap-adt/lib/handlers`); the args-only handler form and the group-context swap with them. Every handler takes `(context, args)`. **Migrating:** an args-only handler `(args) => handleX(ctx, args)` becomes `(context, args) => handleX(context, args)`.
- **The exported handlers take typed arguments.** `handleGetTypeInfo`, `handleDescribeByList`, `handleGetObjectNodeFromCache`, `handleGetEnhancements`, `handleGetEnhancementImpl`, `handleGetEnhancementSpot` and `handleGetIncludesList` took `args: any`; each takes its schema's output or its declared interface now, as every other handler did. **Migrating:** a direct call with an argument the tool does not declare, or of another type, no longer compiles — pass what the schema declares.
- **`@mcp-abap-adt/lib/compact-shared` exports `DETAIL_SHAPE`** (a zod field) where it exported `DETAIL_PROPERTY` (a JSON Schema property). **Migrating:** spread `DETAIL_SHAPE` into a `z.object`.

### Changed — breaking for an embedder of the answer helpers and the HTTP interfaces

- **`return_error` (`@mcp-abap-adt/lib/utils`) and `answerFailure` (`@mcp-abap-adt/lib/auth`) answer `FailureAnswer`** (`isError: true`), a subtype of `McpResult`; `FailureAnswer` is a `type` now (was an interface), so it fits the SDK's result with its index signature. `return_error` takes `unknown`. **Migrating:** nothing for a reader of `McpResult`; code that extended the `FailureAnswer` interface intersects the type instead.
- **`return_response(response: ResponseText)`** (`{ readonly data: string }`, exported from `@mcp-abap-adt/lib/utils`) answers `McpResult`; it took an `AxiosResponse`. **Migrating:** an answer whose `data` is not text does not compile — pass the text.
- **`IHttpApplication.use` is two overloads,** `use(handler)` and `use(path, handler)`, as Express states it, so an Express application is an `IHttpApplication` without a cast; `RouteHandler` and `IHttpApplication` are typed by `@types/express` 5, a dependency of `@mcp-abap-adt/lib` and `@mcp-abap-adt/server-runtime` now (it was absent, so their express types read as `any`). **Migrating:** an application whose `use` takes a different signature implements the two forms.
- **The logger adapters take `unknown`** beside the message, as `ILogger` does (they took `any`).

### Changed — for an embedder of `@mcp-abap-adt/lib/config`

- **A copy of `lib` registers its version and a label, not a path.** From 24.0.0 each copy pushes `{ version, label }` (`label` `bundled` inside a Node SEA executable, `dist` otherwise) onto the process-wide registry; `LibInstance` is `LibCopy | EarlierLibCopy`, the second being an earlier copy's `{ file }`, which is kept and counted. The two-copies refusal names each copy by its version and label, and an older copy as `a copy before 24.0.0` — no path. **Migrating:** a reader of `libInstances()` tells the two shapes apart (`'file' in entry`); an older copy's runtime prints `undefined` for a 24.0.0 entry and still refuses to start.
- **`ShutdownProcess` is now `{ on, stdin?, stdout? }`** (`@mcp-abap-adt/lib/state`), and every `processLike` option (`LauncherEdges`, the HTTP and SSE launchers' and `installTransportShutdown`'s) takes it; `processEdges()` hands the process's `on`, `stdin` and `stdout`, not `process` itself. **Migrating:** nothing — an object that is structurally wider, `process` or an `EventEmitter` included, still fits.
- **`parseConfigArg()` without an argument reads the program's arguments** (`process.argv.slice(2)`); it read the whole `process.argv`, so a script path starting with `--conf` was taken for the option. **Migrating:** nothing, unless you relied on that; a call that passes `argv` reads what it is given, as before.

### Removed — breaking for an embedder of `@mcp-abap-adt/lib/utils`

- **`isCloudConnection`** is removed. It read the credential type as the system kind, so it reported an on-premise system with JWT authentication as cloud; nothing is derived from the authorization now. **Migrating:** use the system kind you declared — `--system-type`, `SAP_SYSTEM_TYPE`, or your own configuration (MIGRATION-24.0).
- **`isAlreadyCheckedError` and `safeCheckOperation`** are removed. They read an error's words for "has been checked"; SAP sends those words as a check run's status text, `processed`, a success, and no error carries them, so there was no key to read them by. **Migrating:** read the check run's answer — its status and its messages' types (MIGRATION-24.0).
- **`isAlreadyExistsError` and `parseValidationResponse` judge by T100 key, or by the exception type where SAP gives no key — not by words.** A taken name is SAP's `exc:exception` with `OO 002` (a class validation), `SWB_TOOL 016` (a domain or table validation), `SADT_RESOURCE 001` (creating a class that exists) or `XI 001` (creating a program that exists, `500` `ExceptionResourceCreationFailure`), in any logon language; an `exc:exception` with no key counts by its type, `ExceptionResourceAlreadyExists` (an inference: the answers measured carry a key); the words "already exists" under another key or type no longer count (that type under another key, e.g. `PAK 058` for a held package, does not either), and `isAlreadyExistsError` reads the error's body (`response.data`), not a message string. A refusal SAP sends without a key (the DDL and function group validations' `SEVERITY` `ERROR`) is relayed with `exists` not stated. **Migrating:** pass the error carrying SAP's answer; a refusal without a key is relayed, its text yours to read (MIGRATION-24.0).

### Changed — breaking for a caller of `CreateDomain` and compact `HandlerCreate`

- **`CreateDomain` requires `package_name` in its schema** and describes it ("Package the domain is created in."). It was listed optional, while the handler refused every call without it ("Package name is required") and SAP creates no domain without its package. A call without it is refused by the schema now, naming the argument, and nothing is sent. **Migrating:** nothing for a call that worked; pass `package_name`.
- **Compact `HandlerCreate` `BEHAVIOR_IMPLEMENTATION` takes `behavior_definition`, required** with `class_name` and `package_name`: refused before any request when absent or empty (`behavior_definition is required`). adt-clients' create requires it; the create request on the wire is unchanged. **Migrating:** pass the behavior definition's name (MIGRATION-24.0 has the table).

### Removed — breaking for a caller of `CreateClass`, `CreateProgram` and compact `HandlerCreate`

- **`abstract` (CreateClass) and `program_type` (CreateProgram, HandlerCreate PROGRAM) are removed: SAP ignores both on create** (measured on premise — a class created `abstract="true"` is not abstract, and a module pool, a subroutine pool, `M` and `F` each gave an executable program). **Migrating:** leave them out; make a class abstract in its source, change a program's type after the create (MIGRATION-24.0).

### Changed — breaking for a caller of the create tools: an undeclared argument is refused

- **The create tools refuse an argument their schema does not declare** (the owner): compact `HandlerCreate` and every full `Create*` tool parse with a strict schema, so such an argument — `abstract` and `program_type` among them — is refused before any request: `<argument> is not an argument of <Tool>`. It was dropped without a word. `HandlerCreate` hands a delegated type only the arguments its target declares. Other tools are unchanged. **Migrating:** pass only the arguments the tool lists.

### Removed — breaking for a caller of `UpdateBehaviorDefinition` and `UpdateMetadataExtension`

- **`lock_handle` is removed from `UpdateBehaviorDefinition` and `UpdateMetadataExtension`** (#4): no tool of the full set issues a lock handle, and a handle the instance did not issue is refused, so the argument could only be refused. Both lock, write and unlock themselves, as the other full updates do; a call that still sends `lock_handle` has it dropped by the parse (only the create tools are strict), so the update takes its own lock and the handle is not used. A write under a held lock is compact `HandlerUpdate`'s. Migrating: `docs/MIGRATION-24.0.md`, "Callers of the lock tools".

### Removed — breaking for a caller of `GetAbapAST`, `GetAbapSemanticAnalysis` and `GetAbapSystemSymbols`

- **`GetAbapAST`, `GetAbapSemanticAnalysis` and `GetAbapSystemSymbols` are removed** (the owner): they parsed ABAP in this process with regular expressions, and SAP states an object's structure itself. The handlers (`handleGetAbapAST`, `handleGetAbapSemanticAnalysis`, `handleGetAbapSystemSymbols`) go with them. **Migrating:** for an object's structure, `GetObjectOutline` (Added) with the source reads, which take a line range now; for what an object defines and uses, `GetObjectOutline` and `GetWhereUsed` (MIGRATION-24.0).

### Changed — breaking for a caller of `SearchSource`: every source, hits only, complete masks, one run

- **`SearchSource` scans every source-bearing object a package lists.** `object_types` takes `PROG`, `FUGR`, `CLAS`, `INTF`, `DDLS`, `BDEF`, `DDLX` and `SRVD`, all of them by default (it took `PROG`, `FUGR` and `CLAS`): program includes (`PROG/I`, main type `PROG`), a class's four local includes (`definitions`, `implementations`, `macros`, `testclasses` — the hit's `include`), interfaces, CDS data definitions, behavior definitions, metadata extensions and service definitions are read, each through its adt-clients reader. A function group's include SAP addresses under the group (`objecturi` `…/functions/groups/<g>/includes/<i>`), or lists as `FUGR/I` without an address, is read through the function include reader; one addressed under `/programs/includes/` through the include reader. **Migrating:** pass `object_types: ['PROG', 'FUGR', 'CLAS']` for the old scan (MIGRATION-24.0).
- **Only hits are answered; what cannot be read is skipped** (the owner, DO15, DO17). The answer is `results` (each hit: `devclass`, `object_type`, `object_name`, `include`, `line`, `snippet` up to 255 characters), `scanned` and `truncated.by_object_cap`. `scanned` counts only what was done: `objects` the objects read (at least one source), `sources` the sources read (each once, however many objects name it), and `objects_with_hits`. A source or object that cannot be read, a mask search SAP refuses and a package whose root is refused (`404` included) are skipped with no entry and not counted; a named package that does not exist yields no hit — SAP answers it as an empty package, and no package is counted (`scanned.packages` is removed; DO26); a readable source of an object is still searched when another failed; a credential failure still ends the call. `emit_no_hits`, its `no_hits` answer and the `failures` list are removed — a call that still sends `emit_no_hits` has it dropped (`SearchSource` is not a strict tool). **Migrating:** read the objects with hits from `results`; an object without a hit is no longer listed (MIGRATION-24.0).
- **A package mask is `*` / `?`** (the owner, DO12): `*` zero or more characters, `?` one; `+`, `_`, `%` and `#` are characters of the name, so an entry with `+` and neither `*` nor `?` is an exact package name (`+` was a wildcard, `?` was not). **Migrating:** write `*` where `+` was meant as a wildcard (MIGRATION-24.0).
- **One run reads every target** (the owner, DO20): `max_objects`, `start_at`, `next_start_at`, `total_targets` and `truncated.by_max_objects` are removed — a call that still sends `max_objects` or `start_at` has them dropped. `max_hits_per_object` has no default (it was 100): absent, an object's hits are not limited; given, each object is limited to it and `truncated.by_object_cap` is set when one was cut. **Migrating:** run a large scan in the background (the default) and read its `run_handle` with `GetBackgroundRun`; pass `max_hits_per_object` for the old cap (MIGRATION-24.0).
- **A read that fails before SAP answers ends `SearchSource` as an error** (the owner, DO22): what is skipped is SAP's answer — a failure carrying a response with an HTTP status, whatever its `origin`, or an ADT refusal; a failure with no answer (an unreachable host, a network failure), a defect, and a failed batch envelope (other than the outer `404`, which falls back to single requests) end the call with the failure, as a credential refusal does. **Migrating:** nothing to do for SAP's refusals; an error that a 24.0.0 development build skipped is now the call's answer (MIGRATION-24.0).
- **A hit in a function module names the module** (the owner, DO18): `object_type` `FUGR/FF` (the ADT code SAP answers for a module, measured on premise), `object_name` the module, `function_group_name` its group and no `include` — what `GetFunctionModule` takes; it was the group's hit with the module in `include`. Each module is a separate object: counted apart from its group in `scanned.objects` and `scanned.objects_with_hits`, with its own `max_hits_per_object`. **Migrating:** read a module's hit with `GetFunctionModule` (`function_module_name` = `object_name`, `function_group_name`) (MIGRATION-24.0).
- **A hit's type is its ADT code where the main type was ambiguous** (the owner, DO27): a program include's hit is `object_type` `PROG/I` (read with `GetInclude`, `include_name` = `object_name`), a program's stays `PROG` (`GetProgram`); a hit in an include a function group addresses under itself (or lists as `FUGR/I` without an address) is `FUGR/I`, `object_name` the include, `function_group_name` its group and no `include` — what `GetFunctionInclude` takes —, and one in an include the group lists under `/programs/includes/` is `PROG/I`. A group include is its own object, like a module: counted apart from its group in `scanned.objects` and `scanned.objects_with_hits`, with its own `max_hits_per_object` allowance and capped flag (it was the group's hit, `FUGR` with `include`, sharing the group's). `object_types` keeps its family values: `PROG` and `FUGR` select as before. **Migrating:** read a hit by its `object_type` alone — `PROG/I` with `GetInclude`, `FUGR/I` with `GetFunctionInclude` (`function_group_name`, `include_name` = `object_name`) (MIGRATION-24.0).
- **A program include listed by several function groups is one object** (the owner, DO28): an include two groups list under `/programs/includes/`, or that a group lists and its package holds as its own `PROG/I`, is answered and counted once — its hits once, once in `scanned.objects` and `scanned.objects_with_hits`, one `max_hits_per_object` allowance and capped flag, from the first listing in the scan order (its `devclass` that listing's); a later listing adds nothing and takes no room of `max_hits`. 23.x answered it under each group that listed it, as that group's hit (MIGRATION-24.0).
- **The line match is a strategy** (the owner, DO14). `runSearchSource` takes it in `OrchestratorDeps.lineMatch` (`LineMatchStrategy`: a source's lines and the scan input in, its hits and `capped` out), and `runSearchSourceWithContext` in its third argument (`{ lineMatch, sapAnswers }`, beside the SAP-answer strategy, `OrchestratorDeps.sapAnswers`), with no default inside the orchestrator; the shipped `substringLineMatch` keeps the match as it was, `skipSapAnswers` skips every SAP answer. **Migrating:** an embedder of the orchestrator passes `{ lineMatch: substringLineMatch, sapAnswers: skipSapAnswers }` (MIGRATION-24.0).
- **The description says what the tool does, its arguments and its answer;** the advice lines (one call per destination at a time, combining terms, concrete package names) are gone.

### Removed — breaking for a caller of `SearchSource`: `time_budget_ms` and `timeout`

- **`SearchSource` takes neither `time_budget_ms` nor `timeout`** (the owner, DO11): no deadline of the server's ends a scan; the call ends on its result, and `truncated.by_timeout` is gone. It runs as every long tool runs (below). **Migrating:** run a large scan in the background (the default) and read its `run_handle` with `GetBackgroundRun`; end a running scan with `DiscardBackgroundRun` (MIGRATION-24.0).

### Changed — breaking for a caller of the long tools: background by default, no `timeout`

- **A long tool answers a `run_handle` by default** (the owner, D24). Every listed long tool (`GetWhereUsed`, `SearchObject`, `SearchSource`, `GetPackageContents`, `GetPackageTree`, `GetObjectsList`, `GetStructuresList`, `GetIncludesList`, `RuntimeListFeeds`, `ListTransports`, `GetSqlQuery`, `GetTableContents`, `GetObjectInfo`, `DescribeByList`, `GetATCFindings`, `ListATCResults`, `GetATCResult`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`; compact `HandlerWhereUsed`, `HandlerSearch`, `HandlerDumpList`, `HandlerGetData`, `HandlerProfileView`, `HandlerGet`) runs on an ABAP session of its own and takes `background`, default `true`: a call without it answers at once with a `run_handle`, and the result is read with `GetBackgroundRun` (compact `HandlerBackgroundRunGet`); `background: false` answers the result in the call, on a session of its own, as 23.x answered it. Every binary serves the background-run tools, the `-ro` ones included (`GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`; compact `HandlerBackgroundRunGet`, `HandlerBackgroundRunList`, `HandlerBackgroundRunDiscard`): a long tool only reads, so a `-ro` binary's runs are reads alone (the owner, D24). A server without a background-run strategy, or one serving no tool that reads the runs (an embedder without `backgroundRuns`, `HandlerExporter`, a group registered on its own `McpServer`), lists a long tool without `background` and answers it in the call. A server instance given a strategy serves the background-run tools beside any long tool its registry carries — the full ones beside a full long tool, compact's beside a compact one, whatever the exposition or registry (the owner, D24); without a strategy no background-run tool is listed, also where the registry carries them (before: listed, answering `background_runs_unavailable`), and a plain registration lists none. In batch mode a long read is recorded; `background: true` there is refused `batch_no_background` (was `batch_no_timeout`). `HandlerGet`'s run-reading parts (`UNIT_TEST` / `CDS_UNIT_TEST`, `activation_status`, `activation_results`) are read in the call on the instance's connection; a `background` on them is refused before anything is sent. **Migrating:** pass `background: false` for the result in the call, or read the `run_handle` with `GetBackgroundRun` (MIGRATION-24.0).
- **`DiscardBackgroundRun` cancels a running read** (and compact `HandlerBackgroundRunDiscard`): the caller's run is checked first (an unknown handle and someone else's answer alike, "not available", nothing sent), the read's own session is logged off, SAP ends the read, and the run reads `cancelled` (answer `{ run_handle, state: 'cancelled' }`). A finished run's answer is removed, as before; a running code run (`RuntimeRunClass`, `RuntimeRunProgram`, `HandlerProfileRun`) is refused, as before. The cancel is final: a late answer or the read's rejection after it changes nothing, and the store's `finish` is called once per run.
- **A read run is answered once.** `GetBackgroundRun` (compact `HandlerBackgroundRunGet`) answering a finished or cancelled read removes it, so the 16-per-caller limit does not fill up. Once Get answers a finished or cancelled read, that read is gone: a Get response lost on the way cannot be recovered, `ListBackgroundRuns` no longer shows it, and the read must be started again. A code run's answer is kept until `DiscardBackgroundRun`, as before.
- **`SearchSource` is a long tool again:** it runs on an ABAP session of its own, in the background by default, and leaves the instance's main flow free while it scans.

### Removed — breaking for a caller of the long tools: `timeout`

- **`timeout` is removed from every long tool** (the owner, D24): no deadline of the server's ends a read; a read ends when SAP answers, or when `DiscardBackgroundRun` cancels it. The timed-out answer (`timed_out`) is gone. **Migrating:** drop `timeout`; to end a running read, call `DiscardBackgroundRun` with its `run_handle` (MIGRATION-24.0).

### Changed — breaking for an embedder's background-run strategy (`IBackgroundRuns`)

- **`BackgroundRunAnswer` gains `cancelled?: true`,** and `BackgroundRunListing['state']` / `BackgroundRunRecord['state']` gain `'cancelled'` (`BackgroundRunState`, exported from `@mcp-abap-adt/lib/embeddable`). The library hands a cancelled read's answer to `finish` with `cancelled: true`; a strategy keeps it as any answer and answers `state: 'cancelled'` for it (`@mcp-abap-adt/background-runs-memory` does). No method is added. The library calls `discard` right after `get` answered a read run's finished or cancelled answer. The running runs' controls are held by a `BackgroundRunOwner` (exported from `@mcp-abap-adt/lib/embeddable`): an instance creates its own unless its host hands it one (`backgroundRunOwner`); the HTTP and SSE servers hand every instance theirs. `StartBackgroundRunOptions` takes `kind` (`'code' | 'read'`) and `register` (the instance's control of a running run); `runLongCall` takes no `timeoutSeconds`. **Migrating:** answer `'cancelled'` for a kept answer with `cancelled: true` (MIGRATION-24.0).
- **`LONG_TOOL_ADVICE` has new words; `TIMEOUT_FIELD`, `timeoutField`, `TIMEOUT_DESCRIPTION`, `timedOutAnswer`, `timedOutWords`, `TimedOutAnswer`, `readTimeout`, `withoutTimeout`, `TIMEOUT_INVALID_WORDS`, `TIMEOUT_NOT_FOR_RUN_WORDS`, `MAX_TIMEOUT_SECONDS` and `BATCH_NO_TIMEOUT_WORDS` are removed;** `LONG_BACKGROUND_FIELD`, `COMPACT_LONG_BACKGROUND_FIELD`, `BACKGROUND_NOT_FOR_RUN_WORDS` and `BATCH_NO_BACKGROUND_WORDS` are added.

### Changed — breaking for a caller of the activation tools: an activation SAP did not carry out is an error ([#351](https://github.com/fr0ster/mcp-abap-adt/issues/351))

- **An activation answered with the objects still inactive is an error, naming them in `still_inactive`.** With `preauditRequested=true` SAP_BASIS 751 answers `POST /sap/bc/adt/activation` with `ioc:inactiveObjects` and activates nothing (measured); S/4HANA 2025 answers a checklist saying no activation ran, with no message, both when there was nothing to activate and when objects stayed inactive (measured). adt-clients 45 reads the inactive list once after such a checklist, and adt-strategies 0.22's `analyseActivation` judges both answers. Every tool that activates — the `Activate*` tools, `ActivateObjects`, `ActivateObjectLow`, compact `HandlerActivate`, and every create or update with an activate step — answers `isError` with `still_inactive: [{ name, type, uri, parent_uri? }]`, the objects SAP lists; a silent checklist whose objects the inactive list no longer names stays a success with `nothing_to_activate: true`. The success answer's `activation_not_stated` (with its `objects`) is gone: such an answer is that error now. **Migrating:** read `isError` and `still_inactive`; send the objects again with `preaudit: false` (MIGRATION-24.0).
- **`ActivateObjects` and `ActivateObjectLow` send `preaudit` on both paths.** One object of a type with a family (the codes the description lists) was activated with `preauditRequested=true` whatever `preaudit` said; it is sent as given now, default `true`, as on the group path.
- **A group activation takes the endpoint the system offers.** `ActivateObjects` and `ActivateObjectLow` with more than one object, or one of a type with no family, read the system's discovery (`GET /sap/bc/adt/discovery`) first: where it offers the activation runs, the run as before (start, status, results); where it does not (SAP_BASIS 751 with a partial discovery, 7.40), one `POST /sap/bc/adt/activation` for every object, answered and judged as a single-object activation. A discovery that cannot be read is an error at step `discovery`, and nothing is activated. `CreateFunctionGroupUnitTest` and `UpdateFunctionGroupUnitTest` activate the test include, the group and its main program the same way. Compact `HandlerActivate` is unchanged: one request, the run started.
- **A run whose results say no activation ran and give no message is checked against the inactive list.** After such results, `ActivateObjects` and `ActivateObjectLow` read `GET /sap/bc/adt/activation/inactiveobjects` once: the run's objects still listed are an error with `still_inactive`; none listed is `nothing_to_activate: true`; a read that fails, or answers no list, is an error at step `inactiveObjects` ("the activation's outcome could not be decided"). Other results are read as before, and a run with an error message stays a refusal.

### Changed — the ADT dependencies: adt-clients 45, adt-strategies 0.22, interfaces-adt 27

- **A create states its language once (#348).** Given `master_language`, or else a session language (`SAP_LANGUAGE`, `x-sap-language`), a create writes it as the body's language attributes and sends it as `sap-language`; given neither, it writes no language and sends no header, and SAP takes its logon language. 23.x wrote `EN` when nothing was given. **Migrating:** pass `master_language: 'EN'` where `EN` was counted on (MIGRATION-24.0).
- **`HandlerValidate` `FUNCTION_MODULE` requires `description`**, refused before anything is sent when absent: SAP answers `400` without one (measured), and adt-clients 43 types the validation so. **Migrating:** pass the module's description.
- **`CreateTransport` `transport_type: 'customizing'` creates a Customizing Request (`W`)**, where it sent a Transport of Copies (`T`) that SAP refused without a real target; `workbench` stays `K`.
- **One `@mcp-abap-adt/interfaces-adt`, 27.** `@mcp-abap-adt/adt-clients` `^45.3.0` and `@mcp-abap-adt/adt-strategies` `^0.22.2` depend on `interfaces-adt` `^27.2.0`, as the server does (`@mcp-abap-adt/server-runtime` and `@mcp-abap-adt/compact-modify` too), so an install has one copy of the contract types.
- **RFC on `@mcp-abap-adt/connection` 22 and `@mcp-abap-adt/sap-rfc-lite` 0.4** (`@mcp-abap-adt/lib` and `server-runtime`: connection `^22.0.0`, `interfaces-adt-connection` `^4.1.0`; `lib`: the optional sap-rfc-lite `^0.4.0`, the one connection 22 loads, so the tree holds one copy). Over RFC an error that ends the stateful conversation ends the connection's session: nothing reopens it on its own (sap-rfc-lite 0.3.x opened a new ABAP session without a word), the request fails `ADT_SESSION_REPLACED` and the connection is spent; a failure names the RFC SDK's error by fields, which adt-clients 45.3 carries on the verdict as `getError().rfc` (`interfaces-adt` 27.2). A request carries its passport as the RFC call's passport, no longer as a header field. An embedder holding a connection: connection's MIGRATION-22.0.
- **One `fast-xml-parser`, 5.12** (`@mcp-abap-adt/lib`: `^5.12.0`, from `^5.11.2`): the tree holds one copy, the one adt-clients 45.3 and adt-strategies 0.22.2 take, and 5.11.2's low advisory (GHSA-474x-hrwr-fgx4, quadratic CPU scanning an unterminated stop-node tag) is gone from `npm audit`.
- **A metadata document is patched by adt-clients** (`@mcp-abap-adt/adt-clients` 45.2.0, `patch<Type>Document`): the domain, data element, table type, function group, package and message class writes — `CreateDomain`, `UpdateDomain`, `UpdateDomainLow`, `CreateDataElement`, `UpdateDataElement`, `UpdateDataElementLow`, `CreateTableType`, `UpdateTableType`, `UpdateFunctionGroup`, `UpdatePackage`, `UpdatePackageLow`, `UpdateMessageClass` and the compact routes to them — read the document, have the library write the fields given (each found by its path from the root, the description on the root and added when absent; every other byte as SAP stored it) and write it back. The server's own patchers are gone (`src/lib/strategies/xmlPatch.ts` and the five `*Patch.ts`); the values stay the server's: the create defaults, upper-casing, a data element's `type_name` fallback and label lengths. **The description is passed as given**, no longer cut at 60 characters (40 for a function group): SAP's answer to a longer one reaches the model as it is — `400` `SWB_TOOL/018` for a domain, data element, table type or package, `400` `FUNC_ADT/103` for a function group, nothing stored; a message class stores the first 60 (measured on premise and on ABAP cloud). **A read that cannot be patched is the step's failure:** an empty or not well-formed read (ADT's `200` with no body for an object not ready yet), another type's document, or a field with no place in the document is answered `isError` with `step: "patch"`, `code: "DOCUMENT_NOT_PATCHED"` and words naming the field; nothing is written, and a lock taken is released. `UpdateDomainLow` and `UpdateDataElementLow` read a length or a count from `properties` as a number or its digits, a flag as a boolean or `true` / `false` (anything else is left out, as a value of no known kind was), and `UpdateDataElementLow` refuses a `type_kind` other than the five SAP knows before anything is sent. **Migrating:** keep a description within SAP's limit, or read SAP's refusal (MIGRATION-24.0).
- **A logon asks for its CSRF token once** (`@mcp-abap-adt/connection` 21): one request per endpoint, no retry and no delay, so a logon against a closed port fails at once with its own error, where it made four requests about a second apart. The fallback to `/sap/bc/adt/discovery` after a `404` or `501` is still asked once, and the named resends (a pooled socket that ended before any answer byte; one resend after a refusal over the CSRF token; one more attempt after the credential's renewal) are unchanged. Nothing in the server named the removed names (`CSRF_CONFIG.RETRY_COUNT` / `RETRY_DELAY`, the establish context's `retries`, `retryDelayMs`, `isFatal`).

### Changed — compact routes parse with their target's schema

- **Each compact read and part route is the target tool's entry:** `HandlerGet` (the source and metadata reads of every type, the `urls`, `contents` and `main_programs` parts, the address parts, the unit-test results), `HandlerSearch`, `HandlerWhereUsed` and `HandlerGetData` call their target's `call`, so the arguments are parsed with the target's own schema before its handler runs. An argument the target requires and the compact tool does not (an object's name, `run_id`) is refused in the target schema's words, naming the target and the argument, before any request; 23.x ran the target's handler and refused in its own words. A target's schema defaults now reach its handler: the same values the handlers applied when absent, except `HandlerGet` part `virtual_folders`'s `with_versions` and `ignore_short_descriptions`, which adt-clients now sends as `false` where it sent none (`GetVirtualFolders`' schema defaults). `GetObjectStructure` is called with its own arguments (`objecttype`, `objectname`).
- **The compact writes are typed and delegate through the target's entry.** `HandlerCreate`, `HandlerUpdate` and `HandlerDelete` parse their arguments with the compact schema they serve, and a delegated create or update is parsed with the target's schema: a create delegated to `Create<Type>` (`PACKAGE`, `TRANSPORT`, `TABLE`, `DDL`, `CLASS`, `PROGRAM`, `INCLUDE`, `INTERFACE`, `FUNCTION_MODULE`) without a field the target requires, or with a value outside a list it declares (`package_type` among them), and an update delegated to `Update<Type>Low` without the name it requires, are refused in that schema's words, naming the target, before any request. Called through the route maps directly (not over MCP, where the tool's schema parsed them first), a key the compact schema does not declare is dropped, and a listed value outside its list or an absent `lock_handle` is refused in the schema's words.

### Changed — the gate

- **`noImplicitAny` is on** in every `tsconfig` (`strict` governs); Biome is pinned to `2.5.15`, with `noExplicitAny`, `noImplicitAnyLet` and `nursery/noUnsafeTypeAssertion` as errors over every package's `src` and `scripts`; `lint:check`, `lint` and the build's check cover the same directories.
- **A source scan** (`src/__tests__/unit/sources/staticTypes.test.ts`) reads the syntax tree of every production source and refuses every type assertion but `as const`, every `any`, every non-null or definite-assignment `!`, and the `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` and `biome-ignore` comments; a fixture proves each refusal. Three assertions remain, each listed by file and text, because `IAbapConnection.makeAdtRequest<T>` (`@mcp-abap-adt/interfaces-adt-connection`) lets its caller choose `T`; the list can only shrink.
- **Removed debug branches:** `canRefreshToken` and `__debugId` in `src/lib/utils.ts`.
- **No regular expression in production code.** A scan (`src/__tests__/unit/sources/noRegexOverInput.test.ts`) reads the syntax tree of every production source of every package — `src`, `scripts`, `tools` and each package's sources, `.ts`, `.js`, `.mjs` and `.cjs` — and refuses a regular-expression literal, any reference to `RegExp` (by name or string key) and a `match` / `matchAll` / `search` call on a receiver the type checker reads as a string (or untyped), or given a string; there is no allowlist, and a fixture proves each refusal. Names, URIs, timestamps, paths, tool output and the source lines the server still scans are read with plain string code (`src/lib/plainText.ts`), the portable build bundles without an esbuild plugin (`node-gyp-build` aliased to the embedded-addon loader, the version modules written into the stage).
- **The live tests carry no configured bound, delay or poll limit.** `tests/test-config.yaml` has no time key left: `test_settings.timeout`, `test_settings.timeouts.*`, `test_settings.operation_delays.*` and every case's `params.operation_delays.*`, the ATC case's `poll_interval_ms` and `poll_timeout_ms`, the runtime case's `trace_read_retries` and `trace_read_retry_delay_ms`, and the unread `test_settings.retry_on_failure` and `max_retries` are gone, with the helpers that read them (`getTimeout`, `getOperationDelay`). Each step goes on the answer of the one before it: the ATC case polls the run until its status says finished; the debugger suite awaits a listener's long poll as the `listen` it sends, not a pause. A wait that does not end is ended with Ctrl-C (`src/__tests__/integration/README.md`, "Interrupting a run"). **Migrating:** delete those keys from your `tests/test-config.yaml`; nothing reads them (MIGRATION-24.0, "Contributors: `test-config.yaml` carries no time key").
- **The live tests' destination is the session `environment.env` names.** `tests/test-config.yaml`'s `auth_broker.abap.destination` is not read any more: the auth broker's destination — the one the live coverage suites and the live run's setup log on with — is `environment.env`'s file name without `.env`, on premise as on the cloud (`testDestinationName`, `src/__tests__/integration/helpers/configuredSystemKind.ts`). The template called the field cloud-only, while the coverage suites refused an on-premise run without it ("the test config names no destination"). **Migrating** (a contributor): delete `auth_broker.abap.destination` from your copy; a copy that named a destination only there sets `environment.env` to its session file name (MIGRATION-24.0, "Contributors: the test destination is `environment.env`'s name").
- **The tests move to `node:test`, a first wave (D27).** `npm test` (`tools/npm-test.mjs`) runs Jest over its files, then the `node:test` build (`npm run test:build`, into `.test-build/`) and the runner (`tools/run-tests.mjs`) over the files of `tools/node-test-files.json`; both run even when the first fails, and the run fails when either does. The runner takes a concurrency and has no default: `npm test` passes `2`, CI passes its own per runner kind (`npm test -- --concurrency <N>`; measured, `docs/development/tests/TESTING_GUIDE.md`). Jest runs the files still on it with 4 workers, each restarted once idle above 512 MB (`jest.config.js`; measured on a developer machine and every CI runner kind, one setting for all). The live suites (`src/__tests__/integration`, `src/__tests__/admin`) are on `node:test` and run only under the live scripts — `test:integration`, `test:coverage-family`, `test:high`, `test:live-connection`, `shared:setup`, `shared:teardown`, `shared:check` — through the runner, one file at a time, a file named by its source path: no `--runInBand`, no `--forceExit`, no `--testPathPatterns`, no Jest reporter (`build:test-reporter` and `check:test-reporter` are gone; the coverage ledger reads `node:test`'s own outcomes). A first Ctrl-C lets the running case and its cleanup finish and skips the rest; a second ends the run. New runs of their own: `npm run test:install` (the install matrix and the bin smoke test: pack, install, the npm registry; CI's `Run install tests` step) and `npm run test:retrieval` (vector retrieval through a local Ollama; not in CI) — the unit run reaches no outside service. **Migrating** (a contributor): run a live file as `npm run test:integration -- <source path>`, not `npm test -- --testPathPatterns=…`; run the install suites with `npm run test:install` (MIGRATION-24.0, "Contributors: the test scripts").
### Added

- **Access restrictions set at start** ([#349](https://github.com/fr0ster/mcp-abap-adt/pull/349)): five optional rows in every binary, each a CLI option, an `MCP_*` variable and a `restrictions.*` YAML key, none with a default — `--deny-actions` (a tool, a prefix of tools, one value of a compact tool's dispatching argument, an ADT code on `HandlerActivate` / `HandlerGet`, `HandlerGetData.sql`; left out at registration, from the listed schema, its description and its search text), `--allowed-packages` (`ZFOO`, `Z*`, `ZFOO/**`), `--allowed-requests`, and `--denied-tables` or `--allowed-tables` (the data tools only, when served). A malformed entry, or both table lists, stops the start. Nothing configured, nothing changes. See [Access restrictions](docs/user-guide/ACCESS_RESTRICTIONS.md).
- **The checks are a strategy:** `IAccessChecks`, `IPackageReader`, `AccessCall`, `AccessVerdict`; `listedAccessChecks` (names and prefixes, reads nothing) and `packageTreeAccessChecks` (also `/**`, reading each super package on the call's connection); `accessChecksFor`; `accessChecks` on `BaseMcpServer` / `EmbeddableMcpServer` and `HandlerExporter`, checked once per call before its connection is taken, on every registered path. A refused call runs no handler, sends nothing of its own and takes no batch number.
- **Four refusal codes**, only when configured: `package_not_allowed`, `package_tree_unreadable`, `request_not_allowed`, `table_not_allowed`.
- **`HandlerExporter`'s `deniedActions`**, `withoutDenied`, `unmatchedEntries`, `parseDeniedEntry`, `registryOf(…, denied)`, `ACCESS_RESTRICTION_ROWS`, `readAccessRestrictions`, `accessStartLine`.
- **The start line** `[MCP] Access restrictions: none` (or the rows read, their counts, `(package tree read)` and the deny entries that match nothing in the binary), once per process.
- **`GetObjectDraft`** (read-only, every binary but legacy) and **`HandlerGet` `part: 'draft'`**: whether an object holds an unactivated change and whose — per part (the source or metadata; a class's includes) `none`, `own`, `other` or `undetermined`, with `changed_at`, `age_seconds` and the three ETags, and `has_draft`. Recorded in batch mode. Types read and not offered: [Access restrictions](docs/user-guide/ACCESS_RESTRICTIONS.md#getobjectdraft-and-handlerget-part-draft).
- **Streamable HTTP and SSE listen on a port the system chooses: `--port=0` / `--sse-port=0`** (`MCP_HTTP_PORT`, `MCP_SSE_PORT`, YAML `http.port`, `sse.port`): `0` was refused (1-65535); it now binds a free port, and the listening line names the port bound (`[StreamableHttpServer] Server started on <host>:<port>`, `[SseServer] …`), where it named the configured one. An embedder reads it from `StreamableHttpServer.listeningPort()` / `SseServer.listeningPort()` (new; undefined before the start, after the stop and on an external app). The login callback port (`--browser-auth-port`) stays 1-65535: an identity provider registers it. The tests launch every HTTP and SSE server on port 0 and read the port it announces, so no test binds a port it chose before the server did.
- **stdio can start without its SAP system: `--deferred-logon`** ([#353](https://github.com/fr0ster/mcp-abap-adt/issues/353)): `--deferred-logon` / `MCP_DEFERRED_LOGON` / YAML `deferred-logon` (opt-in; the parameter beats the variable, the variable the configuration file; the destination's `.env` is not read for it). The start checks the configuration as before — the connection type and the system type are still required — but contacts no SAP system and logs on nowhere: it writes `[MCP] Destination "<d>": the logon is deferred to the first tool call (deferred logon)`, opens the transport and lists the tools of the declared system type. The first tool call that needs the connection makes it. Every failed build of the instance's connection — the first call, every call while there is none, every rebuild — whose thrown value the failure reader does not read, carries no SAP answer and has a listed code is answered `{ "error": "no_connection", "message": "no connection to the SAP system: the connection failed (<CODE>); the next tool call tries again" }`, the code one of the start line's (Node's network codes, interfaces-auth's TLS failure codes; `src/lib/auth/connectionCause.ts`), never the URL, host, port or a credential. One attempt per call, shared by calls that arrive while it runs: no retry, no polling, no timer. A refused credential, an answer of SAP and an RFC logon failure (named by its RFC key) are answered as before. A request on a connection already made that reaches no answer — a handler's failure carrying no response and a cause code `IAdtError.connectionCause` names (`@mcp-abap-adt/interfaces-adt` 27.1, kept by `@mcp-abap-adt/adt-clients` 45.1: Node's seven network codes, no TLS code) — answers `no_connection` the same way, read from that code, never from the message; one attempt, no resend (`StdioServer.readAdtFailure`, read by `answerFailure` inside the call's scope, `src/lib/adtFailureReading.ts`). Without the flag nothing changes: the start logs on and exits `1` when it fails (`server-runtime/src/stdio/launcher.ts`, `StdioServer.ts`).
- **`--restore-session`** (`MCP_RESTORE_SESSION`, YAML `restore-session`): with `--deferred-logon` the destination's leftover session is no longer taken up on its own — the first call logs on and the leftover stays for `ListLeftoverSessions` / `LogoffLeftoverSession` — unless `--restore-session` is stated: then the first tool call takes it up as a start does (a failed take-up gives the file back for the next call; `BaseMcpServer`'s new `restoreAtFirstBirth` option, `birthEntry`). Stated, `true` or `false`, without `--deferred-logon`, it stops the start, exit `1`: `<form> needs --deferred-logon: a start without it takes up the destination's leftover session on its own`. The `--conf` template leaves it unstated (`Parameter.unstatedInTemplate`, `src/lib/config/authParameters.ts`).
- **The stdio start line names the network or TLS cause** ([#353](https://github.com/fr0ster/mcp-abap-adt/issues/353)): `Destination "<d>" could not be connected at start: <class>` adds the thrown value's `code` in parentheses when it is one of Node's network codes (`ECONNREFUSED`, `ECONNRESET`, `EPIPE`, `ENOTFOUND`, `EAI_AGAIN`, `ETIMEDOUT`, `EHOSTUNREACH`, `ENETUNREACH`; `EPIPE` is the system cutting the connection while the request was written — measured on macOS, where a connection reset at accept fails the write so) or a TLS failure code of `@mcp-abap-adt/interfaces-auth`'s `TLS_FAILURE_CODES` — so a stopped system, a wrong host and a certificate problem no longer read the same. Any other code adds nothing; the code is read guarded (a throwing getter reads as absent) and compared as a string; the error's message, the URL and the host never appear (`server-runtime/src/stdio/launcher.ts`, `startConnectionWords`).
- **`SearchSource`'s `scanned.objects_with_hits`:** the objects with at least one hit in `results` (DO17).
- **`SearchSource`'s strategies are the embedder's** (the owner, DO22, DO24): `sapAnswerStrategy` — what a SAP answer to a failed read leads to (`'skip' | 'end' | 'throw'`, asked once per SAP answer with its place; only SAP answers reach it) — and `lineMatchStrategy` — which lines of a source are hits — are optional options of `EmbeddableMcpServer` (and of `StdioServer`, `StreamableHttpServer` and `SseServer`) and of `HandlerExporter` (on `getHandlerEntries()` and `registerOnServer`; on `createRegistry()` the hosting server's apply). Their contracts (`SapAnswerStrategy`, `SapAnswerPlace`, `SapAnswerDecision`, `LineMatchStrategy`, `ScanInput`, `ScanHit`, `ScanResult`) and the shipped `skipSapAnswers` and `substringLineMatch` are exported from `@mcp-abap-adt/lib/embeddable`; the launchers pass the shipped ones, and without the options the search behaves as shipped.
- **`SearchSource`'s `answer`, `max_hits` and `truncated.by_max_hits`** (the owner, DO23): `answer` sets what each hit is answered as — `snippets` (the default: line and snippet), `lines` (the line, no snippet) or `objects` (one entry per object and include, with `hits`, the number answered). `max_hits` limits the hits of the whole answer, counted in the scan's order after `max_hits_per_object`: reached, the scan stops reading, and `truncated.by_max_hits` (present when `max_hits` is given) is true when anything was left. Where the reads go in ADT batch envelopes the stop takes effect at a batch of 300 targets, and `scanned.sources` counts that batch's sources, those read past the stop included.
- **Public surface:** `ToolArgs`, `invalidArgumentsWords` (`@mcp-abap-adt/lib`, `@mcp-abap-adt/lib/handlers`); `READ_DEFINITIONS` (`@mcp-abap-adt/lib/handlers/read`); `ResponseText`, `child`, `childAt`, `isElement`, `isList`, `Element` (`@mcp-abap-adt/lib/utils`); `jsonOf`, `child`, `isElement`, `isList`, `Element` (`@mcp-abap-adt/lib/compact-shared`); `packageManifestOf`, `PackageManifest`, `textValue`, `numberValue`, `flagValue`, `listValue`, `wordValue` (`@mcp-abap-adt/lib/config`); `debugState`, `PlacedBreakpoint`, `BREAKPOINT_ITEM`, `BREAKPOINTS_WORDS`, `LINE_WORDS`, `SETTINGS_OBJECT` (`@mcp-abap-adt/lib/debugger`); `SYSTEM_TYPES` (`@mcp-abap-adt/responsible-rules`).
- **`GetObjectOutline`** (read-only, on premise and on ABAP cloud): the components of a class, an interface, a function group and, on premise, a program, as SAP's object structure states them — one `GET <object uri>/objectstructure`, Accept `application/vnd.sap.adt.objectstructure.v2+xml`, at the `version` asked (active by default), read by adt-strategies' `readObjectOutline`. Each component answers its name, kind, visibility and level where SAP states them, and its links: the source each points into and, for a class and an interface, its start and end line and column (lines from 1, columns from 0, end exclusive; measured against every source read back). A program's links name their target (`type=…;name=…`), a function group's only a source. SAP states no signature: a method's is the source its definition block spans. Answers `detail` terse (the tree), full (the whole reading) or raw (the document).
- **The source reads take a line range** (the owner): `GetClass`, `GetInterface`, `GetProgram`, `GetInclude`, `GetFunctionModule`, `GetFunctionInclude`, `GetDdl`, `GetMetadataExtension`, `GetBehaviorDefinition`, `GetBehaviorImplementation`, `GetServiceDefinition`, `GetStructure`, `GetTable`, and a class's include reads `GetLocalDefinitions`, `GetLocalTypes`, `GetLocalMacros` and `GetLocalTestClass` (where the outline's local components point), take `start_line` and `end_line`, each optional; `GetServiceBinding`, whose source is the parsed service document, takes none. ADT serves no part of a source (measured on premise: `Range` headers, query parameters and a fragment all answer the whole text), so the read sends its one GET as before and answers only those lines — joined as SAP joined them (CRLF stays CRLF between them), with no line end after the last — with `start_line`, `end_line` and the source's `line_count` beside them. A line that is not a whole number from 1, `end_line` before `start_line`, or a range with `part` `metadata` is refused before any request; a range outside the source is refused after the GET, naming the source's line count.
- **`HandlerGet`'s `activation_status` part can wait for the run to end** (`with_long_polling`, optional): when `true`, the status read is a long poll (`?withLongPolling=true`) that SAP holds until the activation run ends, and it answers the final status (measured on premise and on ABAP cloud). Omitted, the read answers at once, as before.

### Fixed

- **An HTTP session SAP's ICM ended is a lost session, not a request error ([#355](https://github.com/fr0ster/mcp-abap-adt/issues/355)).** `@mcp-abap-adt/connection` `^22.0.1` (`@mcp-abap-adt/lib` and `server-runtime`): ICM's `400` "Session Timed Out or Not Found" and "Session no longer exists" end the session as "Session not found" does, and the request fails `ADT_SESSION_REPLACED`, LOCK included; nothing is retried and no session is reopened. Any other `400` is unchanged.
- **`DebugStep` `release_debugger` over RFC frees the debugger and listens on** (compact `HandlerDebugStep` likewise). Over RFC the session the debugger frees closes the RFC conversation, which connection 22 reports as the RFC SDK's `RFC_CLOSED`; read as a failure, release answered `isError` with step `terminate debugger` and kept a stop whose connection was spent, so the following `DebugStop` failed `ADT_NOT_CONNECTED` (measured on premise over RFC, with connection 22 and without this reading). `RFC_CLOSED`, read from the verdict's `rfc` field (`@mcp-abap-adt/adt-clients` 45.3) and never from its message, is now the freed answer, as HTTP's plain ICF 500 is: the stop is dropped with no further request and the session listens on. Every other failure, RFC or HTTP, stays a failure (`src/lib/debugger/DebugSession.ts`, `releaseDebugger`).
- **`CreateDomain` and `UpdateDomain` write the description on the domain, never on its package.** On ABAP Cloud the read-back of a freshly created domain carries no `adtcore:description` on `doma:domain` (measured), and the patch set the first attribute of that name in the document: the `adtcore:packageRef`'s. The domain's own was never sent, SAP refused the PUT with `SWB_TOOL 019` ("The description is missing for …"), and the domain stayed without type and length, so a data element on it could not be activated. The description is now set on the root `doma:domain` and added when it is missing — by adt-clients' `patchDomainDocument` (see "Changed — the ADT dependencies").
- **A failed write's `request.url` names no lock handle.** The url of a request sent under a lock carries the handle as its `lockHandle` query parameter, and the failure's `request` was rendered with it into the answer and from there into logs; the parameter is now left out (any case, any position), the rest of the url as it was sent. A handle the caller needs is still named where it is the answer's subject (`left_locked`'s `lock_handle`).
- **An activation SAP answered with an empty `200` is answered as activated, at every detail and on both paths** (measured on SAP_BASIS 7.40 over RFC: `ActivateObjects` on two programs activated them and answered `projection_failed`, "the terse projection produced no value for ActivateObjectLow"). An empty `200` is an activation (fr0ster/mcp-abap-adt#351, owner's Q1 (a)), as `analyseActivation` already read it; the projection now does too: an activation's answer is a union of its two success forms, the checklist and the empty `200` (`ActivationAnswer`, `projectActivation` in `src/lib/strategies/projections.ts`), each with its terse answer — `{ "activated": true }` for the empty one — and a form without one fails the type check. `full` answers the same for an empty `200` (there is no parse), `raw` the empty body. Every per-object activation tool and the group path use it. An answer of the shared activation handler names the tool that was called (`ActivateObjects`, `ActivateObjectLow`, `HandlerActivate`), not `ActivateObjectLow` for all three.
- **#2 — the function-module tools refuse a function group that does not hold the module.** SAP ignores the group segment of a function module's address: through another group's address the module was read, locked, written, activated and deleted (measured on premise). Every tool that addresses an existing module through a group now reads the module's metadata first (one `GET`, the working area) and refuses a group other than the one its `adtcore:containerRef` names (`code: "FUNCTION_GROUP_MISMATCH"`, step `check function group`), with nothing else sent: `GetFunctionModule` (part `metadata`: that read is the answer), `UpdateFunctionModule`, `ActivateFunctionModule`, `DeleteFunctionModule`, `CheckFunctionModule`, `GetFunctionModuleVersions`, `GetObjectVersions` (`function_module`), `RunFunctionModuleUnitTest` (runner `sync`; runner `async` when `function_group_name` is given), `ActivateObjects` (every `FUGR/FF` entry), `GetWhereUsed` (every `GROUP|FM_NAME`, before any scope, reference or batch request), and compact `HandlerGet`, `HandlerUpdate`, `HandlerActivate`, `HandlerDelete`, `HandlerDeletionCheck`, `HandlerCheckRun`, `HandlerLock`, `HandlerUnlock` and `HandlerWhereUsed` for `FUNCTION_MODULE`. A failed metadata read is SAP's answer as it came, with that step and its T100 key (a module that does not exist: `404` keyed `FL 110`, measured on premise and on the cloud). A create names a module that does not exist yet and is not checked. Those calls leave batch mode (their request waits on the metadata answer); an empty `objects` list counts as `HandlerActivate`'s single form there too. Migrating: `docs/MIGRATION-24.0.md`, "Callers of the function-module tools".
- **#3 — `GetUnitTestResult` answers a run SAP does not know at once, and the run tools read a run's status before they wait.** `GetUnitTestResult` and the waiting run tools (`RunAbapUnit`, `RunUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest`, `RunCdsUnitTest`, with `wait` true or left out) long-polled the run's status from the first read, and SAP holds a long poll for a run id it does not know about 307 s before it answers `NOT_STARTED` (measured on premise), so the call lasted that long. The status is now read first without long polling (`GET /abapunit/runs/{id}`, answered at once), and only a run SAP answers `RUNNING` is long-polled (`?withLongPolling=true`), read again after each answer until SAP answers otherwise, with no limit and no timer of ours. `FINISHED` reads the result; `NOT_STARTED` (SAP's answer for an unknown run id, measured on premise and on the cloud) is answered with the run id at once; any other status, or none, is an error at step `read status` stating the status document SAP sent — it was answered as `{ success: true, run_id, status }`. Compact `HandlerUnitTestResult` still reads only the result. Migrating: `docs/MIGRATION-24.0.md`, "Callers of `GetUnitTestResult` and the run tools".
- **#4 — a write, a delete or an unlock under a `lock_handle` is sent only under a handle this instance's `HandlerLock` issued, on every transport.** SAP releases the locking session's lock on an `UNLOCK` whatever handle it names (an `UNLOCK` with an invented handle answered `200` and released the lock, measured on premise), so the check is the server's. Only the Streamable HTTP instances kept the handles their locks issued; on stdio and SSE every handle passed. Now the stdio instance and each SSE connection's instance own their held locks as each Streamable HTTP instance does: `HandlerLock` keeps the handle it answered (and answers the instance's `state_handle`), and compact `HandlerUnlock`, `HandlerUpdate` and `HandlerDelete` (the emptied includes) refuse a handle the instance does not hold, sending nothing — an unknown handle and another instance's in the same words: on Streamable HTTP they name the `state_handle` that routes a call to its instance; on stdio and SSE, which route nothing by it, they say a lock handle works only in the server instance whose `HandlerLock` issued it. `HandlerUnlock` releases the handle, so a second unlock with it is refused. When the idle bound ends the state of an instance that holds a lock (SSE), the instance's SAP session is logged off with it — the logoff releases the lock (measured), which otherwise outlived its handle until the stream closed — and the next call logs on afresh; a package lock's own session goes the same way. Every `BaseMcpServer` instance owns its held locks (`heldLocks`, else its own; `EmbeddableMcpServer` takes the option too); a handler group registered on a plain `McpServer` has none, and there `HandlerLock` is refused, sending nothing, and so is every call under a `lock_handle`. Migrating: `docs/MIGRATION-24.0.md`, "Callers of the lock tools: a lock_handle is checked on every transport".
- **#348 — a created object's original language is the one given (or the session's), sent as the logon language SAP takes it from.** Every create that takes `master_language` describes it as it works: "Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies." It said the language defaulted to `EN`.
- **#8 — a create body escapes what it writes into an attribute** (description, name, package, references, responsible): a description holding `&`, `<`, `>`, `"` or `'` makes a well-formed create, read back whole.
- **#22 — a validation sends no `description` it was not given** (domain, data element, …): it sent `description=undefined`.
- **#9 — `CheckTable` and `CheckTableLow` check the `ddl_code` given:** the source goes with the check run as the structure check's does; it was accepted and dropped, and its description said so.
- **`RuntimeGetProfilerTraceData` `statements` sends `auto_drill_down_threshold` as given:** `0.1` went out as `0`.
- **#3 — an ABAP Unit run id is one path segment:** `HandlerUnitTestStatus` and `HandlerUnitTestResult` (and the run tools that read a run) percent-encode it in `/abapunit/runs/{id}` and `/abapunit/results/{id}`; an id holding `/`, `?`, `#` or `%` was sent raw.
- **A run id of exactly `.` or `..` is refused before anything is sent** — it is a path step, not a run — and the tool answers the refusal (`An ABAP Unit run id of "…" is a path step, not a run: nothing was sent.`).
- **`GetUnitTestResult` takes `with_navigation_uris` and `format`**, as `GetCdsUnitTestResult` declares them; the handler read both and the schema dropped them, so neither could be asked for over MCP. Both optional.
- **Compact `HandlerUnitTestResult`, `HandlerCdsUnitTestResult` and `HandlerCreate` take `detail`.** Their handlers read it and the schemas did not declare it, so a call over MCP always got the terse answer; `HandlerCreate` takes it for every type.
- **`GetEnhancements` takes `program`, `include_nested`, `detailed` and `max_includes`.** The handler read them and the tool's schema did not declare them, so its parse dropped them and a call over MCP never reached them: an include's main program could not be given, and the nested read and the detailed answer could not be asked for. Each is declared now, optional, as the handler reads it (`max_includes` an integer, 50 by default).
- **`GetEnhancements` with `include_nested`: the partial answer** after the walk of the includes threw carries `isError: false`, as every other answer does; it carried no `isError`.
- **`UpdateDomainLow` and `UpdateDataElementLow` read their `properties` member by member.** Each change is written as the patch writes it — text, a length or a count as a number or text, a domain flag as a boolean or text, `null` clearing a domain's conversion exit or value table, a domain's fixed values as a list. A member given as `null` that names no clearing (a domain flag, say) was written into the document as the text `null`, and a type name given as a number failed the call; a member of no such kind is left out now.
- **Compact `HandlerGet` refuses a `part` it does not read.** A part outside its list — reaching the handler past the schema, as an embedder's direct call can — was read as `urls`, so a service binding answered its URLs for any such part. It is refused now, in words naming the parts, and nothing is sent. A call over MCP is unchanged: the schema refused such a part already.
- **Batched reads keep the connection's system kind.** A read in an ADT batch envelope (`ListTransports`, `DescribeByList`, `GetWhereUsed`, the package walks and the other batched reads) and a call recorded in a communication batch run on a view of the call's connection, and the view carried no kind: on a connection whose system kind is declared — a server's `systemType`, an embedder's — and not taken from the environment, they were refused with `system_type_required`. The view now has the connection's kind, and none when the connection has none.
- **On-premise systems with JWT authentication were refused program create, update and activate:** the server took the credential type for the system kind. The declared system kind decides what is offered.
- **A group activation waits for its run until SAP ends it** (`ActivateObjectLow`'s group path, `ActivateObjects`, and the test include a unit-test write activates with its group). The run's status is re-read with long polling — a read SAP holds until the run ends — with no attempt limit and no interval; it stopped after six reads with a second between them, and a run still going was answered `activated: null` ("has not settled yet") or, for the unit-test write, as a failure on our side.
- **An activation wait ends on a status it cannot read.** Only `running` (the status measured while a run goes on) is read again; `finished`, `error` and `failed` end the wait as before. Any other answer — no status, an empty one, or one not known to mean either — ends it as a failure that names the status as SAP sent it ("no status" when there is none), and the run's results are not read. Such an answer used to be read as "still running" and read again.
- **DeleteFunctionModule, DeleteFunctionInclude, DeleteServiceDefinition and DeleteServiceBinding left an existing object in place and answered success when SAP's deletion check worded it 'does not exist'; the delete is now sent whenever the check permits it.** Measured on premise: the check answers `isDeletable="true"` with W "<name> does not exist" for an existing function module, function include, inactive service definition and inactive service binding, and the delete then sent deletes it. The delete's own answer is relayed; a delete SAP refuses is named by its T100 key (e.g. `SWB_TOOL 029`).
- **Every checked delete sends the delete once the deletion check permits it** — `DeleteBehaviorDefinition`, `DeleteBehaviorImplementation`, `DeleteCdsUnitTest`, `DeleteClass`, `DeleteDataElement`, `DeleteDdl`, `DeleteDomain`, `DeleteFunctionGroup`, `DeleteFunctionInclude`, `DeleteFunctionModule`, `DeleteInclude`, `DeleteInterface`, `DeleteMessageClass`, `DeleteMetadataExtension`, `DeletePackage`, `DeleteProgram`, `DeleteServiceBinding`, `DeleteServiceDefinition`, `DeleteStructure`, `DeleteTable`, `DeleteTableType` — and answers the delete's document (`deleted`, `object`, SAP's message). A permitted check that worded the object "does not exist" used to end the call as a success, `deleted: false` with `deletable: true`; an object already gone (deleted earlier, its directory entry waiting on an open request) now gets SAP's answer to the delete — a refusal such as `SWB_TOOL 029`, or W "Release transport … to remove the object directory entry". A check that refuses (`isDeletable="false"`, or a typed `E` beside `isDeletable="true"`, as for a missing function module) still ends the call with only the check sent. A delete's answer no longer carries `deletable` (MIGRATION-24.0).
- **SAP's answers are judged by key, not by words.** `CreateFunctionGroup` reads the group back after its interface `400` when SAP names it by its T100 key (`EC 304` or `EC 408`), in any logon language; another `400` worded alike is the answer. The dump reader (`RuntimeGetDumpById`) takes the termination link by its exact relation (`http://www.sap.com/adt/relations/runtime/dump/termination`). A network failure is told by the error's code (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`) and the host by the `hostname` Node's resolver error carries, not by the message's words. An SDK `McpError` from an external handler group answers its own words, cut by its code's prefix; any other message is answered as it came. The start's words for connection's refusal of an RFC address it cannot dial are recognised by asking connection about the configuration, not by comparing messages. A gate (`noProseMatching`) refuses a string search or an equality comparison on SAP's error text and on the text a reader extracted (an error's message or body, a message's text, a parsed document's text node), recognised by type and flow in the production sources. Its reach: a successful answer's body is read as a document and is not checked, and a value reaching the call through a path the scan does not follow — another module's object, an untyped (JavaScript) value — is left to review.
- **SAP's XML answers are read with the XML parser, not searched as text.** Every reader that searched a document with a pattern reads it through fast-xml-parser (the server's `parseStructure`, or adt-strategies' `readSearchHits` for the enhancement search): the lock handle (where adt-clients reads it, `asx:abap/asx:values/DATA/LOCK_HANDLE`), an activation run's status, messages and `activationExecuted`, the dumps feed's next page and the feeds' query variants, a service binding's facts and its service URLs, the AMDP debugger's HANA session and event bodies, a class's include types (`GetIncludesList`), the types a where-used scope offers (`GetWhereUsed` `enable_only_types`), a report's package (the unit-test include), an include's main program, and the enhancement readers (`GetEnhancementSpot`, `GetEnhancementImpl`, `GetEnhancements`). The recorded answers read as before; an attribute quoted with apostrophes, an entity or character reference (`&amp;`, `&#39;`, `&#x26;`), CDATA, a comment or a `>` inside an attribute value now reads as XML says (a CDATA source reads with LF line ends, as XML reads them). The readers match names by prefix, as SAP spells each document, not by namespace URI. `GetEnhancements` names a source outside any `enh:enhancementImplementations` by the element it sits in; it was named after the first tag before it mentioning "enhancement" with a `name=`, typically the root through its `xmlns:enh` (two such sources under a root named `ROOT` were `ROOT`, `ROOT`; they are their own `A`, `B`). The AMDP debugger's event body (`readAmdpEvents`, public through `@mcp-abap-adt/lib/debugger`, and `AmdpDebugWait`'s raw answer) is the `mainResponse` element built back from the parse: the same XML, with an apostrophe in an attribute value written `&apos;` and an empty element written `<a/>`. The read-modify-write updates (domain, data element, package, table type, function group, message class) patch the parsed document and build it back with fast-xml-parser's builder: the document comes back as it came but for the values changed, an apostrophe in an attribute value written `&apos;` (the same XML), and a patch that finds no target still refuses before anything is sent. A read that is not well-formed XML — one cut short, which the parser alone would close into a complete-looking document — is refused (`XmlPatchError`, checked with fast-xml-parser's validator) before anything is patched, and so is a block's new content that is not a well-formed element. A domain's fixed values are built with the XML builder, so `&` and `<` in a value are written as `&amp;` and `&lt;` (they went out raw).
- **`SearchSource` reads every source at the asked `version`.** A function group's includes and modules were read `active` whatever was asked; every read passes the call's `version` now, and the description no longer says they are active only.
- **`SearchSource` loses no readable source.** A function group's child that failed ended the group's reads; the group's later sources are read now and their hits answered (the failed one is skipped, DO17). Past `max_hits_per_object` an object's sources are still read — only the hits are capped. Function modules named `VIEW…` are scanned (they were skipped by name).
- **`SearchSource` reads each source once per call.** A source two objects name (an include two function groups list) is sent once, on the sequential path too, and answers both objects.
- **A `SearchSource` package mask is resolved completely** (the owner, DO12). One quick search of up to 1000 packages cut a larger mask without a word; the quick search's `maxResults` is doubled now until the answer holds fewer packages than asked for, on the batched path (a search phase per round) and the sequential path alike. `?` is a wildcard and `+` a literal character.
- **A refused or missing type node or subpackage excludes only its branch** in `SearchSource` (the owner, DO19): the package's other type nodes, subpackages and objects are walked and searched (it ended the package's whole walk). The other walking tools keep their answer.
- **A lone CR ends a source line.** The source lines the server reads — the `INCLUDE` statements `GetIncludesList` follows, the includes `GetStructuresList` embeds and the lines `SearchSource` numbers — end at CR LF, LF and a lone CR; a lone CR used to join two lines into one, so the second statement was not read (and a hit's line number counted them as one). The `expose` and association statements `GetServiceBindingPreviewUrl` reads are read word by word, any case, across line ends, as before. Keywords are compared in ASCII case only: a Unicode letter that case-maps onto an ASCII one (the Kelvin sign, `ı`, `ſ`) is not read as one.
- **`CreateProgramUnitTest` reads the report statement by statement** to see whether it already pulls the test include in: statements split at the period outside comments and literals, so `INCLUDE ztest.` over several lines (`INCLUDE` / `ztest.`, `INCLUDE ztest` / `.`) is found, and so is `INCLUDE ztest IF FOUND.`, which the old check did not count — such a report now gets no second `INCLUDE`. A period, `INCLUDE` or `"` inside a text, string or template literal is not read as a statement.
- **The AMDP debugger's documents decode character references** (`&#39;`, `&#x26;`) as the other readers do (`parseStructure`): a data preview value or a variable holding one read it as written.
- **A failed request answers SAP's answer only when it carries one.** A thrown request's `response` is read by its shape: an integer `status` and an object of `headers` make it SAP's answer (`statusText` may be absent); a `response` without them — a status given as text, no headers, a value that is no object — no longer reaches the answer as SAP's (no `status`, no `raw_body`).

## [23.1.0] - 2026-11-03

A minor: the stored ATC results. The eighteen packages are at 23.1.0, every sibling range at `^23.1.0`; `@mcp-abap-adt/adt-clients` `^42.1.0`, `@mcp-abap-adt/adt-strategies` `^0.18.2`, `@mcp-abap-adt/interfaces-adt` `^25.1.0`.

### Added

- **`ListATCResults`** (core and core-ro, every transport; on premise and ABAP cloud): lists the ATC results the system holds, newest first (`GET …/atc/results`). `created_by` is required — a user name, or `*` for every user (SAP refuses a list without it, `400`); `central_only: true` lists central results only; `age_min` / `age_max` bound the age in days. Without ages SAP applies a window of its own, which moved between two days on premise (26 central results on 2026-11-02, none on 2026-11-03, while ages 0–3650 listed 159), so a list to rely on states its ages. Answers `results`, each with `display_id`, `title`, `check_variant`, `run_series` (absent when empty), `created_at`, `by_priority` and `failures`. SAP takes no count; the ages bound the list.
- **`GetATCResult`** (the same binaries and systems): reads one stored result by its `display_id` (`GET …/atc/results/{displayId}`) and answers its `title`, `check_variant`, `created_at`, `objects_checked`, `by_priority` and `findings`, each finding as `GetATCFindings` reads a worklist's (`detail` terse, full or raw). The counts are the findings': the result's own aggregates read zero while it holds findings (measured). An unknown Display ID answers SAP's `404`.

## [23.0.2] - 2026-11-02

A patch. The eighteen packages are at 23.0.2, every sibling range at `^23.0.2`; `@mcp-abap-adt/adt-clients` `^42.0.0`.

### Changed

- **`@mcp-abap-adt/adt-clients` `^42.0.0`**: a create takes its package in the type, and an absent package no longer reaches SAP as the text `undefined` (read in SAP's handlers on premise, 2026-11-02: SAP creates nothing without a package; program and include name validation refuses an empty one). The server already passed a package to every create; no request it sends with a package changes.
- **`ValidateObjectLow` and compact `HandlerValidate` `PROGRAM` require `package_name`**, refused before anything is sent (`Program validation requires package_name`), as an include already did: SAP's program validation refuses an empty package (SEDI_ADT 003). `HandlerValidate`'s description names it, `PROGRAM(object_name*, package_name*)`; `ValidateObjectLow`'s `package_name` description says where it is required and that elsewhere it serves a name in a namespace.

## [23.0.1] - 2026-11-02

A patch: an include's main programs, on premise. The eighteen packages are at 23.0.1, every sibling range at `^23.0.1`; `@mcp-abap-adt/adt-clients` `^41.0.0` (its handlers typed by the values their slots answer, no casts — no request or answer of the server changes), `@mcp-abap-adt/adt-strategies` `^0.18.1`, `@mcp-abap-adt/interfaces-adt` `^25.0.2`.

### Added

- **`GetMainPrograms`** (full set, on premise): reads the main programs of the include named by `include_name` in one request (`GET …/programs/includes/{name}/mainprograms`) and answers `main_programs`, a list of `{ name, type, uri }` — a program (`PROG/P`), or for an include of a function group the group (`FUGR/F`: `LSVIMTOP` answered `SVIM`); an include no program includes directly answers an empty list (measured on premise, 2026-11-02). The ABAP cloud table lists no `mainPrograms`, so the tool is not offered there.
- **Compact `HandlerGet` INCLUDE `part: 'main_programs'`**, the same read, on premise. `HandlerGet`'s `part` now lists `main_programs` only on premise; on ABAP cloud its schema and the parts a refusal names leave it out. `compactGetSchemaFor` (`@mcp-abap-adt/lib/compact-shared`) takes, as an optional second argument, the members whose `main_programs` part is served (`COMPACT_MAIN_PROGRAMS`, new).

## [23.0.0] - 2026-11-02

A major ([#336](https://github.com/fr0ster/mcp-abap-adt/pull/336)): the server writes program includes (on premise) and table types (on premise and on ABAP cloud) — twelve full-set tools (five for the include, seven for the table type), the compact members `INCLUDE` and `TABLE_TYPE` — and the include leaves `CreateProgram`. Beside it, an embedder that registers the `./handlers` groups on an `McpServer` of its own gets the variant its groups state, for the listing and for every call, and `HandlerExporter` registers its tools on such a server with a connection per call. Every breaking item has its **Migrating:** note, and [the 23.0 migration note](docs/MIGRATION-23.0.md) collects them. The eighteen packages are all at 23.0.0, every sibling range at `^23.0.0`; the ADT dependencies move to `@mcp-abap-adt/interfaces-adt` `^25.0.0`, `@mcp-abap-adt/adt-clients` `^40.0.1` and `@mcp-abap-adt/adt-strategies` `^0.18.0`, and every read the server sends states which version it reads.

### Changed — breaking for a reader of an object's document or source: every read states its version

- **Every read the server sends names its version** (`active`, `inactive` or `workingArea`); none is left to a default. adt-clients 40 sends exactly the version it is given and none when none is given, and ADT answers a read without a version from the working area — the inactive version where one exists (measured on premise, 2026-11-01). The server's client contract requires the version on every read, so a read without one does not compile, and a test runs every served tool and requires a version on every object read it sends.
- **A `Get<Type>` with `version` reads its metadata part at that version too, `active` by default, as the schema declares.** For a class, interface, program, include, table, structure, CDS view, behavior implementation, function module, metadata extension, domain, data element and function group (`GetClass`, `GetInterface`, `GetProgram`, `GetInclude`, `GetTable`, `GetStructure`, `GetDdl`, `GetBehaviorImplementation`, `GetFunctionModule`, `GetMetadataExtension`, `GetDomain`, `GetDataElement`, `GetFunctionGroup`, and compact `HandlerGet` for the same members) 22.0.x sent the metadata read without a version — adt-clients 39 sent none for these — so an object with an inactive version answered its inactive document. `GetServiceDefinition`, `GetBehaviorDefinition` and `GetFunctionInclude` (adt-clients 39 sent `active` for a metadata read without a version) and `GetPackage` (it passed its own) send what they sent. Two source reads change the same way: `GetMetadataExtension`'s (adt-clients 39 sent `active` as no version) and `GetInclude`'s without a `version` (22.0.x passed none). **Migrating:** pass `version: 'workingArea'` (or `'inactive'`) for the document being edited.
- **A read tool without `version` reads the active version, and its description says so.** Where 22.0.x sent no version, this is a change: `GetMessageClass`, `GetMessageClassMessage`, `GetServiceBinding` (both parts), `GetServiceBindingPreviewUrl` (the binding), `GetEnhancementSpot`, `GetEnhancements` (the probes of a host whose type is not given), `GetIncludesList`, `ListFunctionModules`, `ListFunctionGroupIncludes`, `GetObjectNodeFromCache` (the cached `OBJECT_URI`), and `SearchSource`'s reads of a function group's includes and modules (as its description always said). `GetEnhancementImpl`, `GetPackageTree`'s package metadata and `GetServiceBindingPreviewUrl`'s service definition read active as before.
- **The listing reads keep 22.0.x's request, now stated:** `GetTypeInfo`'s lookups and the descriptions the walks read (`GetObjectInfo` with descriptions) read the working area — an object that exists only inactive keeps its description and is still found — and `active` for a service definition, behavior definition, function group include, package and access control, as adt-clients 39 sent for those.
- **The writes name the versions they read:** the document a write patches is read from the working area (`workingArea`, what a read without a version answered; a package's `active`, as before); the long-polling wait after a write reads `inactive`. No request is added or removed, except the one read of the table-type writes after a successful activation (below).

### Changed — breaking for a reader of a walk's descriptions: a description only when asked for

- **Without `include_descriptions`, no walk answers an object's description, on either path.** `GetObjectInfo`'s leaves and the objects of `GetPackageContents`, `GetPackageTree` and compact `HandlerGet` `PACKAGE` part `contents`: the batched path never took one (inside an envelope a node structure part can carry another part's description), but the sequential path — a system without the communication batch — passed on the description SAP sends in a node structure unasked, so the same call answered differently by path (measured on premise and on ABAP cloud, 2026-11-02, also at 22.0.1). Now neither does. With `include_descriptions: true` nothing changes: the descriptions are read — from each object's metadata in ADT batch envelopes (`GetObjectInfo`), or as node structure requests sent alone, several at a time (the package walks); for `GetObjectInfo` both paths answer the same descriptions (measured on premise and on ABAP cloud, 2026-11-02). `GetObjectInfo`'s `enrich` (the description and package of every node, from a repository search) is unchanged. **Migrating:** pass `include_descriptions: true` where the descriptions are needed.

### Changed — breaking for a caller of `CreateProgram`

- **`CreateProgram`'s `program_type` no longer offers `include`.** The enum and the description name `executable`, `module_pool`, `function_group`, `class_pool` and `interface_pool`; `include` is refused by the schema before the handler runs. It never created an include: adt-clients 39 refused it before any request (`programType 'include' is not a program`). Compact `HandlerCreate` `PROGRAM` takes `program_type` as a free string (no enum), so `include` passes its schema and reaches adt-clients, whose guard refuses it before any request: the call answers that refusal, nothing sent, and a test holds it. **Migrating:** create an include with `CreateInclude` (or compact `HandlerCreate` `INCLUDE`), then write its source with `UpdateInclude`.

### Changed — breaking for an embedder that registers the `./handlers` groups on its own `McpServer`

- **A plain registration lists and calls on its groups' stated system type only.** `registry.registerAllTools(mcpServer)` and `registry.registerTool(…)` (`@mcp-abap-adt/lib/handlers`) list the variant the groups state (`systemType` of their `HandlerContext`, `HandlerExporter`'s `systemType` option) — its tool set, descriptions, schemas and search `_meta` naming only the members it offers, as a server instance lists them — and every call runs on that variant. `SAP_SYSTEM_TYPE` is not read on this path, for the listing or for a call. With none stated every definition is listed as it is, and every call that would reach a system is refused `system_type_required` before anything is sent, whatever `SAP_SYSTEM_TYPE` says. 22.0.x listed the on-premise definitions on every path and read `SAP_SYSTEM_TYPE` at call time. The binaries and `EmbeddableMcpServer` still read `SAP_SYSTEM_TYPE` when no `systemType` option is given. **Migrating:** state the system type — `new HandlerExporter({ systemType: 'onprem' | 'cloud' | 'legacy' })`, or `systemType` in your own groups' `HandlerContext`.
- **Groups that state different system types are refused when they are registered**, before anything is registered — a system type stated beside none as well (`registerAllTools` and `registerTool`): `The handler groups state different system types: <Group> states <cloud|onprem|legacy|none>, …; one registration lists one variant`. **Migrating:** state the same `systemType` in every group of one registration, or none in any.
- **`HandlerExporter.getHandlerEntries()` calls on the exporter's stated system kind only.** Each handler it hands out states the exporter's `systemType` on the call's connection before it runs — none when the exporter states none, so a call that would reach a system is refused `system_type_required`; `SAP_SYSTEM_TYPE` is not read for it. A connection you hold (built by `createConnection` from `@mcp-abap-adt/connection`) keeps the kind it was built for. **Migrating:** `new HandlerExporter({ systemType })`.
- **`ToolHandler` (`HandlerEntry.handler`) is the union of both call forms**, `ContextHandler` `(context, args) => Promise<any>` and `ArgsOnlyHandler` `(args) => Promise<any>`: code that holds a handler as two-parameter, or calls it `handler(context, args)`, no longer compiles. **Migrating:** narrow with `isArgsOnly(handler)` or call through `callInItsForm(handler, context, args, inGroupContext)` (both new in `@mcp-abap-adt/lib/handlers`).
- **`HandlerExporter` hands out no background-run tool, no debugger tool and no `background` parameter**, on `getHandlerEntries()`, `getToolNames()`, `createRegistry()` and `registerOnServer`: `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`, the `background` parameter of `RuntimeRunClass` / `RuntimeRunProgram`, and the debugger tools left it. `HandlerExporterOptions` has no `includeDebug`. A background run and a debug session keep state between calls, which a server instance holds. **Migrating:** serve them with `EmbeddableMcpServer` (its `backgroundRuns` option for the store), adding `BackgroundRunHandlersGroup` and `DebugHandlersGroup` (and `RuntimeRunHandlersGroup` for the run tools with `background`) from `@mcp-abap-adt/lib/handlers` to its registry; drop `includeDebug` from the options.

### Changed — breaking for a compact caller on ABAP cloud

- **A compact write handler's schema offers on cloud only the properties its cloud members take.** On cloud, `HandlerCreate` no longer lists `program_name`, `program_type` or `application`; `HandlerUpdate`, `HandlerDelete` and `HandlerProfileRun` no longer list `program_name`. The properties this release adds for the include — `include_name` (`HandlerCreate`, `HandlerUpdate`, `HandlerDelete`) and `HandlerUpdate`'s `part` — are offered on premise only. On premise nothing else changes, and the `-ro` tools are unchanged. Each property is tied to the members that take it (the create's per-type arguments, the delete's name fields, each handler's own reads), so the schema and the refusals cannot drift. **Migrating:** none of these was taken on cloud (the members that read them are on premise only); a client that sends them anyway gets them dropped or refused by the schema.

### Changed — breaking for a caller of `@mcp-abap-adt/lib/compact-shared`

- **`compact<Tool>SchemaFor<M>` takes the tool's own members.** The twelve schema builders (`compactCreateSchemaFor`, `compactGetSchemaFor`, `compactUpdateSchemaFor`, `compactDeleteSchemaFor`, `compactProfileRunSchemaFor`, `compactValidateSchemaFor`, `compactDeletionCheckSchemaFor`, `compactLockSchemaFor`, `compactUnlockSchemaFor`, `compactCheckRunSchemaFor`, `compactActivateSchemaFor`, `compactWhereUsedSchemaFor`) constrain `M` to a readonly array of that tool's members (`COMPACT_CREATE.onprem[number]`, …) where 22.0.x took `readonly string[]`: a plain string array, or a name the tool does not offer, no longer compiles. Each builder ties every property to the members that take it, so the schema it returns lists only those properties. **Migrating:** pass the projection itself (`compactCreateSchemaFor(COMPACT_CREATE.cloud)`) or an `as const` array of its members.
- **The projection tables gain the include and the table type:** `INCLUDE` and `TABLE_TYPE` in the compact member tables, `table_type` in `VERSIONED_KINDS` and `VERSIONED_ROUTES` (the version list; the version source and diff take `VERSION_SOURCE_KINDS`, new, which has no `table_type`), and `COMPACT_WHERE_USED_ROUTES` maps `TABLE_TYPE` to the where-used code `TTYP/DA`, not a name of `TYPE_NAMES`. **Migrating:** a `switch` or a `Record` exhaustive over one of these tables handles the new members; a reader of `COMPACT_WHERE_USED_ROUTES` takes a value as a name of `TYPE_NAMES` or a where-used code.

### Changed — breaking for a reader of `tools/tool-search.json`

- **The shipped search table's compact entries group their keywords per member, and some `semantic` values are objects.** A compact tool whose `object_type` (or `target_type`) picks the object carries `members` (per member, the keywords that name it); `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerGet`, `HandlerCheckRun` and `HandlerProfileRun` write `semantic` as `{ before, items: [{ member, text }], join, after }`. `tools/list` carries the texts of the members the tool offers on the declared system type: on cloud `HandlerCreate` has no `program` or `report` keyword and no `program` in its sentence. `toolSearchText(name, offered?)` (`@mcp-abap-adt/lib/tool-search`) answers the texts for the members offered; `toolSearchText(name)` and `toolSearchTexts()` answer the table's own, every word kept (the sentence built from the items). Six search words that named nothing the tool handles were removed: `transport` from `HandlerActivate`, `HandlerDelete` and `HandlerUpdate`, and `transport`, `service definition` and `service binding` from `HandlerCheckRun`. See [Tool search](docs/user-guide/TOOL_SEARCH.md#texts-per-system-type). **Migrating:** read the texts through `toolSearchText` / `toolSearchTexts`; a reader of the JSON file itself reads `semantic` as a string or as the object above.

### Added

- **`version` takes `workingArea` beside `active` and `inactive`** on every read tool that has it (one shared definition), compact `HandlerGet` and `SearchSource` included: the version in the working area, as ADT answers it.
- **`GetTableType` takes `version`** (`active`, the default, `inactive` or `workingArea`) and answers it; compact `HandlerGet` `TABLE_TYPE` takes it too.
- **Program includes, on premise** (the full binaries, high group): `CreateInclude` (the create alone, in `package_name`; the include is created inactive, holding the comment header SAP writes into a new include), `UpdateInclude` (`source_code` as the whole source: lock, write, unlock, and the activation when `activate` is true), `UpdateIncludeMetadata` (a metadata document as the include's whole stored metadata, under the lock), `DeleteInclude` (the deletion check, then the deletion) and `ActivateInclude`. On ABAP cloud the include is read only (`GetInclude`, compact `HandlerGet` / `HandlerDeletionCheck` / `HandlerWhereUsed` `INCLUDE`).
- **`GetInclude` reads the include's metadata too:** `part` (`source`, the default, or `metadata`) and `version` (`active`, the default, `inactive` or `workingArea`, for either part). One request each: the source as before, or the metadata document, answered `{ success, include_name, part: 'metadata', metadata }`, as `GetProgram` answers its metadata.
- **Table types, on premise and on ABAP cloud:** `GetTableType` (the metadata document, in core-ro too), `CreateTableType`, `UpdateTableType`, `DeleteTableType`, `CheckTableType` (the active version, or `version: 'inactive'`), `ActivateTableType`, and the version list `GetTableTypeVersions`; `GetObjectVersions` takes `object_type` `table_type`. Version sources are not offered for table types: SAP lists a table type's versions but answers every version source `403` "Request version for TTYP is not supported" (measured on premise 2026-11-01 and on ABAP cloud 2026-11-02), so `GetObjectVersionSource` and `GetObjectVersionDiff` do not take `table_type`. `CreateTableType` runs as `CreateDomain` does — name check, create, lock, read the document SAP created, write the given definition into it under the lock, unlock, wait for the stored document, check, and activate when `activate` is true (the default); `UpdateTableType` locks, reads, writes the given properties into the document it holds, checks, unlocks, waits and activates (default true). The definition properties are `row_type_kind`, `row_type_name`, `data_type`, `length`, `decimals`, `access_type`, `key_definition` and `key_kind`; each closed one takes only the values SAP takes, measured on premise (2026-11-01): SAP answered any other value with success and stored another, so the enum is the guard (`key_definition` takes no `keyComponents`: SAP refuses to activate it without key components, which these tools cannot set). A property left out keeps SAP's value; no definition property declares a schema default.
- **`CreateTableType` and `UpdateTableType` answer the definition SAP stored, and the version it was read at:** `stored_definition` with the eight properties as SAP wrote them, and `stored_version`. After a successful activation it is read once more, at `active` (one GET after the activation). Otherwise it is the `inactive` version the wait after the write read: `CreateTableType` with `activate: false`, a refused check or a refused activation (its check runs after the wait); `UpdateTableType` with `activate: false` or a refused activation — its check runs under the lock, before the wait, so a refused check is answered without a stored definition. The terse answer of a success is `{ result, stored_definition, stored_version }`; where the read failed, `stored_definition_not_read` carries SAP's answer to it, beside `stored_version`.
- **Compact members `INCLUDE` and `TABLE_TYPE`**, one request per call as every member: `HandlerCreate` `INCLUDE(include_name*, package_name*)` (on premise) and `TABLE_TYPE(table_type_name*, package_name*)`; `HandlerGet` `INCLUDE(include_name*)` parts `source` and `metadata` (on cloud too), `TABLE_TYPE(table_type_name*)` part `metadata` only; `HandlerUpdate` under the caller's `lock_handle`: `INCLUDE(include_name*, source_code*, part, transport_request)` and `TABLE_TYPE(table_type_name*, source_code*, transport_request)`, a table type's `source_code` the whole metadata document as given; `HandlerDelete`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate` (`INCLUDE` with `package_name`, else refused `Include validation requires package_name; missing: package_name` before anything is sent), `HandlerDeletionCheck` (`INCLUDE` on cloud too), `HandlerActivate`; `HandlerCheckRun` `TABLE_TYPE` (an include has no check run); `HandlerWhereUsed` `TABLE_TYPE`, routed by its code `TTYP/DA`. One include or table type alone goes to an activation run (`{ run_id }`), as `ActivateObjects` sends it. On cloud the include's writes are not offered. Each new member is recorded in batch mode where its call is one request (`tools/batch-handlers.json`, [Batch Mode](docs/user-guide/BATCH_MODE.md)).
- **`HandlerUpdate` takes `part`** (no schema default): `source` (when absent) writes an include's source, `metadata` its metadata document, sent as given. It is taken by `INCLUDE` alone; any other type given one is refused before anything is sent (`part is taken only by INCLUDE (source or metadata); leave it out for <type>`).
- **Tool counts**, stdio / Streamable HTTP / SSE, on premise: core 269 / 269 / 267 (was 257 / 257 / 255), core-ro 71 / 72 / 70 (was 70 / 71 / 69); on cloud, stdio: core 256 (was 249), core-ro 70. Compact and compact-ro are unchanged (members only).
- **`HandlerExporter.registerOnServer(mcpServer, connectionProvider)`** (documented before, missing until now): registers the exporter's tools on an embedder's own `McpServer`, listed as a plain registration lists them for the stated `systemType`; each call awaits the provider (sync or async) and runs on the connection it returns — an already-connected connection the embedder holds; its lifetime is the embedder's — with the exporter's system kind, resolver and rules. A provider that fails is the call's answer — a credential failure as it came, else the new refusal `connection_provider_failed`, in fixed words — and the tool does not run. The [Handler Exporter guide](docs/architecture/HANDLER_EXPORTER.md) is rewritten to the real API.
- **Public surface** (`@mcp-abap-adt/lib/handlers`, unless named otherwise): `isArgsOnly`, `callInItsForm`, `InGroupContext`, `CallContext`, `ContextHandler`, `ArgsOnlyHandler`, `ConnectionProvider`, `BaseHandlerGroup.registerHandlersOnCall` and `statedSystemType()`, `CompositeHandlersRegistry.registerAllToolsOnCall` (the registry generic over its group type, default `IHandlerGroup`); `VariantToolDefinition.members`; `toolSearchText(name, offered?)` (`@mcp-abap-adt/lib/tool-search`); in `@mcp-abap-adt/lib/compact-shared`, the include and table-type members of the projections, `VERSION_SOURCE_KINDS`, `VERSION_SOURCE_ROUTES`, `VersionSourceKind` and the type `ReadVersion`.

### Fixed

- **Each system type's tools carry that system type's description.** A server registered the variant's schema but the definition's own (on-premise) description: on cloud, compact `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerActivate`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate`, `HandlerProfileRun` (and compact-ro `HandlerValidate`) described `PROGRAM(…)` members their enum did not offer, and `RunATC` named `program` and `program_include`.
- **A patched XML value holding `$&`, `$1`, `$$`, `` $` `` or `$'` is written as given.** The metadata patches inserted the value as a `String.replace` replacement string, so such a sequence was expanded (`$&` became the matched text). Every metadata patch was affected: `CreateDomain`, `UpdateDomain`, `CreateDataElement`, `UpdateDataElement`, `UpdatePackage`, `UpdateFunctionGroup`, `UpdateMessageClass` (and the compact low updates of domain, data element and package), and the new table-type writes.
- **A plain `./handlers` registration calls each handler in the form it takes.** It called every handler `(context, args)`, so an args-only handler (compact, read-only, high tools) received the context as its arguments and failed (`Cannot read properties of undefined`). Every path — the server instance and both plain paths — calls through `callInItsForm` now.
- **`CompositeHandlersRegistry.registerTool` calls a tool as `registerAllTools` does.** It handed the handler to the SDK as it was, so a `(context, args)` handler received the arguments as its context, and an args-only one ran on `SAP_SYSTEM_TYPE` instead of the groups' stated system type. It now registers through the path of the group that holds a tool of that name (`BaseHandlerGroup.registerOneTool`): the handler's call form, the group's context, the stated system type. **Migrating:** a name no group of the registry holds is refused at registration — add the tool to one of the registry's groups.
- **`CompositeHandlersRegistry.registerTool` registers a JSON-Schema definition** (on the current MCP SDK it threw `inputSchema must be a Zod schema or raw shape` for every one), converted as the group registration converts it; **`getRegisteredTools()` names only the tools a registration listed**, not the ones its variant left out.
- **The tool reference lists what the server registers** (`docs/user-guide/AVAILABLE_TOOLS.md`, `_HIGH`, `_READONLY`). Its generator parsed the handler sources as text: it missed every spread-in or shared property (`detail`, a table type's definition properties), the per-type activation tools served from `low` modules (`ActivateClass` and fifteen more) and `GetProgramVersions` / `-Source` / `-Diff`, listed five tools no binary serves (`GetUnitTest`, `GetUnitTestStatus`, `GetCdsUnitTest`, `GetCdsUnitTestStatus`, `GetCdsUnitTestResult`), and showed no parameters for the four tools with a Zod schema (`CreatePackage`, `GetPackageContents`, `GetTableContents`, `SearchSource`). It now reads the built tool sets — each tool's description, input schema (enums listed) and `available_in` as registered — and files each by the built module that holds it.
- **On a registration through `./handlers`, a `timeout` the tool refuses** (on a run mode, or an invalid one on a long read) **is refused before the call's connection is asked for**: with `registerOnServer` the provider is not called for it.

## [22.0.1] - 2026-11-01

### Fixed

- **A sync ABAP Unit run without `wait` is no longer refused** (regression in 22.0.0). `RunUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest` and `RunFunctionModuleUnitTest` with `runner: 'sync'` and no `wait` answered `wait goes with runner async … nothing was sent`. The `wait` schema declared `default: true`; the server builds each tool's zod shape from its schema, the MCP SDK hands the handler the parsed arguments, and so every call reached the handler with `wait: true`, as if the client had sent it. `wait` now declares no schema default; absent, it is still `true` for an async run, and a `wait` the client sends with `runner: 'sync'` is still refused before anything is sent. A test calls the four tools through the MCP SDK with the server's own schema conversion. `RunAbapUnit` and `RunCdsUnitTest` take no runner and answered as before.

## [22.0.0] - 2026-10-31

A major ([#329](https://github.com/fr0ster/mcp-abap-adt/pull/329)): the server takes what each tool offers and accepts from the ADT type tables of the declared system type (`@mcp-abap-adt/interfaces-adt` 24, `@mcp-abap-adt/adt-clients` 39, `@mcp-abap-adt/adt-strategies` 0.17), and fixes the gaps a user reported in 20.1.0 (ATC object types and findings, ATC in the read-only binaries, the activation descriptions). Every breaking item has its **Migrating:** note, and [the 22.0 migration note](docs/MIGRATION-22.0.md) collects them.

### Changed — breaking for every start and every embedder: the system type is declared, and it decides the tools

- **Every ADT client is the declared system type's, and nothing defaults it.** The server builds adt-clients' on-premise client (`AdtClientOnPrem`) for `onprem` (and `legacy`, which still connects as on premise) and the cloud client (`AdtClientCloud`) for `cloud`, from the kind the process declares: the kind a connection was built for, else the server's `systemType` option, else `SAP_SYSTEM_TYPE` (`--system-type`, the environment, the `--env` file, YAML `system-type`). With none declared, a tool call that would reach the system is refused `system_type_required`; an on-premise-only member called on a `cloud` connection is refused `variant_not_served`, before anything is sent. An embedder's `systemType` option is recorded for the connection it hands a tool, so `SAP_SYSTEM_TYPE` need not be set beside it. **Migrating:** an embedder (`EmbeddableMcpServer`, `HandlerExporter`, a host of its own) states `systemType` (or `SAP_SYSTEM_TYPE`); the binaries already required it for a destination.
- **stdio inspection (no destination) needs the system type too**, and lists the tools of that system type's table. A start with no destination and no system type stops before the transport opens (exit `1`): `[MCP] Inspection-only mode (no destination): the SAP system type is required, because the tools listed are those of its ADT type table — set --system-type, SAP_SYSTEM_TYPE (the environment) or system-type (YAML) to onprem, cloud or legacy; the server did not start`. **Migrating:** add `--system-type=onprem` (or `cloud`) to an inspection start, e.g. `mcp-abap-adt --system-type=onprem`; behind `mcp-proxy`, after its `--`: `mcp-proxy -- mcp-abap-adt --system-type=onprem`.
- **The Glama inspection image is two images, one per system type:** `docker/Dockerfile.inspect` is replaced by `docker/Dockerfile.inspect.onprem` and `docker/Dockerfile.inspect.cloud` (`mcp-proxy -- mcp-abap-adt --system-type=…`), and `docker-compose.inspect.yml` has the services `inspect-onprem` and `inspect-cloud`. **Migrating:** build the image of the system type you inspect; Glama's admin page keeps its own copy of the Dockerfile, which needs the same split.
- **A tool is registered only where its system type's table serves what it needs** (beside `available_in`). Compact on cloud: `PROGRAM` leaves the `object_type` enum of `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerActivate`, `HandlerLock`, `HandlerUnlock` and `HandlerValidate` (compact-ro: `HandlerValidate`), and `HandlerProfileRun`'s `target_type` is `CLASS` alone; `PROGRAM` stays in `HandlerGet`, `HandlerCheckRun` and `HandlerDeletionCheck`. Tool counts per system type (stdio): core 257 on premise / 249 cloud, core-ro 74 / 72, compact 40 / 40, compact-ro 20 / 20. **Migrating:** on cloud, a program is read, checked, compared and unit-tested; it is created and changed on premise.
- **Each tool description and enum is its system type's.** A tool that differs per system type states, for each, the values that system type serves (`ToolDefinition.variants`); the server registers the declared one. The `[onprem only]` marks are gone: a cloud description names only what cloud serves.

### Changed — breaking for a caller that names an object type: the codes each argument accepts

Every argument that names an ADT object type is checked once, at the tool's boundary, against the codes its operation accepts on the declared system type (a projection of the type tables), and a value outside them is refused naming the list, before anything is sent: `<argument> "<value>" is not one of: <list>; nothing was sent`. The arguments and what each accepts:

- **`ActivateObjects` / `ActivateObjectLow` `objects[].type`, `HandlerActivate` `object_adt_type`:** a group activation takes the activation codes (on premise 28: `CLAS/OC`, `INTF/OI`, `PROG/P`, `PROG/I`, `FUGR/F`, `FUGR/FF`, `FUGR/I`, `DEVC/K`, `DDLS/DF`, `VIEW/DV`, `TABL/DT`, `TABL/DS`, `TTYP/DA`, `DOMA/DD`, `DTEL/DE`, `DCLS/DL`, `BDEF/BDO`, `DDLX/EX`, `SRVD/SRV`, `SRVB/SVB`, `DSFD/SCF`, `DSFI/SFI`, `XSLT/VT`, `FTG2/FT`, `AUTH`, `ENHO/XHH`, `ENHO/XHB`, `ENHS/XSB`; cloud 25, without `PROG/P`, `PROG/I` and `FTG2/FT`) or a name standing for one; a function module (`FUGR/FF`) and a function include (`FUGR/I`) name their function group in `parentName`, and without it are refused `objects[].parentName is required for <name> (<code>): the name of the object it belongs to; nothing was sent` (adt-clients threw before any request); one object alone also the kinds `function_group`, `ddl`, `data_element`, `behavior_definition`, `metadata_extension`. The description lists each code with the names standing for it.
- **`GetWhereUsed` `object_type` (single and `objects[]`):** the 28 where-used codes (`VIEW/DV` among them), each listed with its names, on both system types; its description no longer lists twelve kinds (among them `intf/if` and `stru/dt`, which no table holds).
- **`GetIncludesList` `object_type` and `objects[].object_type`:** `PROG/P`, `PROG/I`, `FUGR/F`, `CLAS/OC`, and the main types `FUGR` and `CLAS`; the enum's `FUGR` is now read as `FUGR/F`. The friendly names it read by hand (`PROGRAM`, `INCLUDE`, `CLASS`, `FUNCTION_GROUP`, `FUNCTIONGROUP`) are refused.
- **`GetObjectStructure`, `GetNodeStructure`, `GetObjectsByType`, `GetObjectsList` (both forms), `GetObjectInfo` (both forms), `HandlerGet` `object_adt_type` (`object_structure`, `node_structure`):** a code of the system type's table (29), a name, or a main type that names one code.
- **`SearchObject` and `HandlerSearch` `object_type`** take the search names of the system type's object types list ([see below](#changed--breaking-for-a-searchobject-or-handlersearch-caller-the-filter-takes-search-names)).
- **`GetObjectVersions`, `GetObjectVersionSource`, `GetObjectVersionDiff` `object_type`:** the kinds the tables list versions for; a refusal names them.
- **The compact tools' `object_type`** (`HandlerCreate`, `HandlerGet`, `HandlerUpdate`, `HandlerDelete`, `HandlerDeletionCheck`, `HandlerCheckRun`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate`, `HandlerActivate`, `HandlerWhereUsed`) and `HandlerProfileRun` `target_type`: the members the system type's table serves; a refusal adds `Supported: …`. Members each one routed only to refuse leave its enum: `HandlerActivate` loses `CDS_UNIT_TEST`, `LOCAL_DEFINITIONS`, `LOCAL_MACROS`, `LOCAL_TEST_CLASS`, `LOCAL_TYPES`, `RUNTIME_DUMP`, `RUNTIME_PROFILE`, `TRANSPORT` and `UNIT_TEST`; `HandlerCreate` loses `CDS_UNIT_TEST`, `UNIT_TEST`, the four `LOCAL_*`, `RUNTIME_DUMP` and `RUNTIME_PROFILE`; `HandlerGet` loses `RUNTIME_DUMP` and `RUNTIME_PROFILE`; `HandlerUpdate` loses `RUNTIME_DUMP`, `RUNTIME_PROFILE` and `TRANSPORT`.
- **`RunATC` `objects[].type` is the system type's** ([see below](#changed--breaking-for-a-runatc-or-validateservicebinding-caller)).

**Migrating:** send a code the list names: the refusal names them, and so does the tool's description on the system type.

### Changed — breaking for a caller that names a type by a friendly name or a main type

- **A main type** (the part of a code before its slash, the TADIR type: `CLAS`, `DTEL`, `DSFD`, …) **stands for its code where exactly one accepted code has it**, in either case: the call goes on exactly as that code. Where two or more codes share it, it is refused naming them: `"<value>" is the main type of <codes>: name one of these codes; nothing was sent` — `TABL` (`TABL/DT`, `TABL/DS`), `PROG` (`PROG/P`, `PROG/I`), `FUGR` (`FUGR/F`, `FUGR/FF`, `FUGR/I`; on where-used `FUGR/F`, `FUGR/FF`), `MSAG` (on the structure tools), `ENHO`. The main type is the one the code's entry in the tables states (`main`, interfaces-adt 24); a group-only code (`VIEW/DV`) has none.
- **The main-type-shaped names are gone:** `clas`, `prog`, `fugr`, `tabl`, `ddls`, `dtel`, `doma`, `intf`, `ttyp`, `srvd`, `srvb`, `ddlx`, `bdef`, `dcls`, `xslt`, `ftg2`, `devc` are main types now, read by the rule above. So `TABL` / `tabl` and `PROG` / `prog` are refused as ambiguous where they used to mean `TABL/DT` and `PROG/P`, and `FUGR` where it meant `FUGR/F`; `CLAS`, `INTF`, `DEVC`, `DDLS`, `DTEL`, `DOMA`, `TTYP`, `SRVD`, `SRVB`, `DDLX`, `BDEF`, `DCLS`, `XSLT` (and `FTG2` where `FTG2/FT` is served) reach the same code as before.
- **`function` and `func` are the function module (`FUGR/FF`)**, as `functionmodule` and `function_module` are; **`functiongroup` is the function group (`FUGR/F`)**. `function` and `func` used to mean the group. On where-used a function module is named `GROUP|FM` in `object_name`.
- **The names that stay:** `class`, `program`, `include`, `function`, `functiongroup`, `interface`, `package`, `table`, `structure`, `domain`, `dataelement`, `view`, `functionmodule`, `function_module`, `func`, `stru`; and the new `dbview` (below).
- **A value's case says what it is** (2026-10-31, the owner's rule; measured on S/4HANA, where `VIEW` was answered as a DDL source): a value in lower case is a friendly name, a value in upper case a code, a main type or a search name of the system type's object types list. So **`VIEW` is the dictionary view**, the search name `VIEW` whose list item is `VIEW/DV`: `GetWhereUsed` (single and `objects[]`), `ActivateObjects`, `ActivateObjectLow` and `HandlerActivate` (`objects[].type`, `object_adt_type`) read it as `VIEW/DV`, where they read it as `view` (`DDLS/DF`); `SearchObject`, `HandlerSearch`, `DescribeByList` and `GetObjectInfo`'s enrichment send it as `VIEW`, where they sent `DDLS`; the structure tools (`GetObjectStructure`, `GetNodeStructure`, `GetObjectsByType`, `GetObjectsList`, `GetObjectInfo`, `HandlerGet` `object_structure` / `node_structure`), which take no `VIEW/DV`, refuse it naming their list, where they read it as `DDLS/DF`. `view` stays the CDS view (`DDLS/DF`), and so does `View`: a value in mixed case, and a value in upper case that is no code, main type or search name (`CLASS`, `TABLE`, `DBVIEW`), is read as the friendly name, as before. Of the friendly names, `view`, `func` and `stru` are words of the tables in upper case; `FUNC` and `STRU` are search names listing the code `func` and `stru` stand for (`FUGR/FF`, `TABL/DS`), so their reading is unchanged. With it, an upper-case search name stands for the code its list item has where the argument takes that code and no main type names it: `DTAB` (`TABL/DT`), `INCL` (`PROG/I`) and `REPO` (`PROG/P`) are newly taken by where-used, the activation tools and the structure tools, `INCL` and `REPO` by `GetIncludesList` (on cloud, where no program is activated, the activation tools take `DTAB` only). The descriptions say which values are names (lower case) and which are codes, main types and search names. **Migrating:** send `view` (or `DDLS/DF`) for a CDS view (DDL source); `VIEW`, `dbview` or `VIEW/DV` for a dictionary view.
- **Codes no release lists are refused:** `stru/ds` (`stru` is the structure), `doma/dm` and `bdef/bd` (the domain is `DOMA/DD`, the behaviour definition `BDEF/BDO`), `ttyp/st`, `intf/if`, `stru/dt`, and bare main types no table holds as a code.

**Migrating:** for a function group send `functiongroup` or `FUGR/F`, for a function module `function`, `func`, `FUGR/FF` (with its group); for a table `TABL/DT` or `table`, a structure `TABL/DS`, `structure` or `stru`, a program `PROG/P` or `program`, an include `PROG/I` or `include`.

### Changed — breaking for a `SearchObject` or `HandlerSearch` caller: the filter takes search names

- **`object_type` is a name of the declared system type's object types list** (the quick search's own filter vocabulary, interfaces-adt 24's `ADT_SEARCH_TYPES_ONPREM`, 385 names, and `ADT_SEARCH_TYPES_CLOUD`, 372): a main type (`CLAS`, `DEVC`, `TABL` — tables and structures), an alias of one subtype (`STRU` structures, `DTAB` database tables, `FUNC` function modules, `INCL` includes, `REPO` programs) or a group (`ABAP_TEST_COCKPIT`), either case; it is sent upper-cased. A name only the other system type's list holds is refused.
- **An ADT type code stands for the name the search reads it as:** the list item whose type it is (`CLAS/OC` → `CLAS`, `DEVC/K` → `DEVC`, `TABL/DS` → `STRU`, `TABL/DT` → `DTAB`, `FUGR/FF` → `FUNC`, `PROG/I` → `INCL`; `PROG/P`, the type of `PROG` and `REPO`, → `PROG`), else the main type its entry in the tables states (`ENHO/XHH` → `ENHO`, `FUGR/I` → `FUGR`, `MSAG/NN` → `MSAG`). The search selects the same objects it selected for the code (measured: a code equal to an item's type selects as that item, any other code as the text before its `/`); the request carries the name instead of the code. `DescribeByList` and `GetObjectInfo`'s enrichment search send their types through it too.
- **A name standing for a code** (the friendly names the tools take: `class`, `program`, `include`, `function`, `functiongroup`, `interface`, `package`, `table`, `structure`, `domain`, `dataelement`, `view`, `functionmodule`, `function_module`, `func`, `stru`, `dbview`), in lower case — in upper case only where it is no search name, so `VIEW` is the search name (above) —, **is read as its code**, once, and that code as above: `class` → `CLAS`, `program` → `PROG`, `include` → `INCL`, `function` / `functionmodule` / `function_module` / `func` → `FUNC`, `functiongroup` → `FUGR`, `interface` → `INTF`, `package` → `DEVC`, `table` → `DTAB` (database tables, `TABL/DT`), `structure` / `stru` → `STRU`, `domain` → `DOMA`, `dataelement` → `DTEL`, `view` → `DDLS` (a CDS view, `DDLS/DF`, as `view` means on every other tool), `dbview` → `VIEW` (the dictionary views, `VIEW/DV`). 21.x sent a friendly name as given.
- **Anything else is refused before anything is sent:** `object_type "<value>" is neither a name of this system's object types list nor an ADT type code or a name standing for one: it takes the search names (e.g. CLAS, DEVC, STRU), an ADT type code (e.g. TABL/DS) or a name standing for a code (e.g. class, structure); nothing was sent` — a code no list item and no table holds (`NOPE/XX`, which the system answered with no hits, silently), an unknown name, a name only the other system type's list holds.
- **`DescribeByList`** sends an object's type the same way; a type the search does not take is not sent, and the object is searched without one, as a type the system refused was. Its description names the search names, codes and friendly names it takes, and that an object of any other type is searched by its name alone.

**Migrating:** a search name (`CLAS`, `STRU`, `DTAB`, `FUNC`, …), an ADT type code or a friendly name is taken; friendly names are mapped to their code's search name (`table` → `DTAB`, `view` → `DDLS`); a value 21.x sent for a type the system serves is still taken. For the dictionary views send `dbview` or `VIEW/DV` (`view` and `VIEW` are a CDS view); a value the refusal names is sent as a search name, a code or a friendly name instead.

### Changed — breaking for a `RunATC`, `ValidateServiceBinding` or `HandlerServiceBindingValidate` caller

- **`RunATC` offers the object types of the declared system type.** On premise: `class`, `interface`, `function_group`, `package`, `ddl_source`, `table`, `behavior_definition`, `program`, `program_include`, `function_include`, `class_include`. On cloud the same without `program` and `program_include`: ABAP cloud holds no program or program include of the caller's (the cloud table lists neither with `create`). The `objects[].type` enum and the description of each system type list exactly its types; a type outside them is refused naming the list before any call. **Migrating:** on cloud, check the class, function group or package that holds the code.
- **`ValidateServiceBinding` and compact `HandlerServiceBindingValidate` require `package_name`** (2026-10-31): the transport check they run names the binding's package. Without it, adt-clients failed with a `TypeError`; now the call is refused `package_name is required` before anything is sent, and both schemas mark it required (`HandlerServiceBindingValidate`'s listed it as optional in 21.x). **Migrating:** pass the package of the binding.

### Changed — breaking for a caller that reads an ABAP Unit run unfinished

- **`GetUnitTestResult` (and the library's `GetUnitTest`, `GetCdsUnitTest`, `GetCdsUnitTestResult`) reads the run's status once, by long polling, and SAP's answer ends the call** (2026-10-31). ADT holds the read until the run has finished (measured on premise), so the call lasts as long as the run. `FINISHED` answers the result as before (`{ success: true, run_id, finished: true, run_result }`; `GetUnitTest` and `GetCdsUnitTest` also `run_status`); another status answers `{ success: true, run_id, status }`, SAP's status as it named it, with no result read; a status document with no `aunit:progress` status is a failure at the step `read status` whose message carries the document as SAP sent it. 21.x read the status at most 5 times and answered a run unfinished after them `{ success: true, run_id, finished: false, run_status, message }`; that answer is gone. A run tool waiting for its run (`wait`, under Added) answers an unfinished run the same way, where 21.x answered it `finished: false` with `run_status` and `message`. **Migrating:** start a long run with `wait: false` and read it by `run_id` (`GetUnitTestResult`, or `GetUnitTestStatus` for the status alone); read an unfinished run from `status` (SAP's status value) in place of `finished: false`, and read on by `run_id`.

### Changed

- **One object named by a friendly name is activated exactly as one object of its code** (`ActivateObjects`, `ActivateObjectLow`, `HandlerActivate` `objects[]` and `object_adt_type`): the name is read as its code once at the boundary, and the code is routed. `functiongroup`, `dataelement`, `view` and `stru` are now activated through their type's own activation and answer the activation verdict, as `FUGR/F`, `DTEL/DE`, `DDLS/DF` and `TABL/DS` are; they used to start an activation run and answer `{ run_id }`. A main type standing for a single-activation code (`CLAS`, `DTEL`, …) is activated the same way.
- **`preaudit` (`ActivateObjects`, `ActivateObjectLow`) names what takes single-object activation:** the codes, the kinds, the names standing for those codes, and a main type standing for one of them; their activation always sends `preauditRequested=true`, and a group activation sends `preaudit` as given.
- **The compact tools name the arguments a type needs, and refuse a call without one before anything is sent:**
  - `HandlerLock` `PACKAGE(object_name*, super_package*)` — `super_package is required for package locking.`;
  - `HandlerValidate` `BEHAVIOR_DEFINITION(object_name*, package_name*, description*, root_entity*, implementation_type*)`, `BEHAVIOR_IMPLEMENTATION(object_name*, package_name*, behavior_definition)`, `METADATA_EXTENSION(object_name*, description*, package_name*)`, `SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*, package_name*)`. The refusals name the tool's arguments and the ones missing (`… requires package_name, description, root_entity and implementation_type; missing: root_entity`), where they named `packageName`, `rootEntity`, … ; `SERVICE_BINDING` without `package_name` is refused, where adt-clients threw a `TypeError`.
  - The parameter descriptions say which types need them: `HandlerValidate` `package_name`, `description`, `root_entity`, `implementation_type`, `behavior_definition`; `HandlerLock` `super_package`.
- **The package listings read each answered type against the tables.** `TTYP/DA` gets the kind `tableType` (its real code had none); a code no table holds (`STRU/DT`, `TTYP/DF`, `TTYP/TT`, `INTF/IF`, bare `FUGR`, `BIMP/BIM`) gets no kind and no `codeFormat`. `PROG/I` keeps `program`.
- **`GetNodeStructure` on a package** handles a blank answer as a package's for `package` and `DEVC` too, which the boundary reads as `DEVC/K`.
- **`GetIncludesList`'s reads are analysed by `analyseException`**: an include that is not there is answered absent, where a failed read could be read as refused.
- **The internal searches send the search name of their code's main type, read from the tables' `main`:** the package search `objectType=DEVC`, the enhancement subtype search `ENHO` / `ENHS` — the requests 21.x sent, now typed by the tables.
- **`DescribeByList`'s description** names `FUGR/F` and `FUGR/FF` (it named `FUGR/FC`, which no release lists, and the bare `FUGR`).
- **The debugger's breakpoint `object_type`** takes the label (`CLAS`, `PROG`, `INCL`, `FUNC`) or its code (`CLAS/OC`, `PROG/P`, `PROG/I`, `FUGR/FF`), either case, as before; `FUNC` is a function module.
- **Answered types:** a type code from an ADT answer is read against the tables (adt-strategies 0.16's `type` / `unknownType`); the server's answers carry the type as ADT sent it, and a code no table holds keeps no derived kind (above).

### Changed — breaking for a caller of a `-ro` binary: a read-only set changes nothing in the system

- **The read-only binaries serve no tool that runs code or otherwise changes the system** (the owner's decision, 2026-10-31: a read-only set guarantees that nothing in the system changes; of the tools that run something, only the ATC run stays). `mcp-abap-adt-ro`, `-http-ro` and `-sse-ro` no longer serve `RuntimeRunClass` and `RuntimeRunProgram` (the code they run can change data), `RuntimeCreateProfilerTraceParameters` (it creates a profiler trace parameter set) or, on stdio, `LogoffLeftoverSession` (a logoff releases every lock the session holds); `mcp-abap-adt-compact-ro` no longer serves `HandlerLeftoverSessionLogoff`. `RunATC`, `GetATCRunStatus` and `GetATCFindings` stay. The full binaries serve every one of them as before, on every transport and system type they did; no tool's arguments or requests changed. Tool counts, stdio / Streamable HTTP / SSE: core-ro 70 / 71 / 69 (was 74 / 74 / 72), compact-ro 19 / 19 / 18 (was 20 / 19 / 18); core and compact unchanged. The `-ro` helps and the docs say so. With the run tools now in the write collection of tool retrieval, the search sentences (`_meta`) of `RuntimeRunProgram` and `ActivateProgram` were reworded so that "execute a report" and "fix a report and activate it" still find each in that collection's top five. **Migrating:** to run a class or a program, schedule a profiler trace or log a leftover session off, use a full binary (`mcp-abap-adt`, `-http`, `-sse`; `mcp-abap-adt-compact` for `HandlerLeftoverSessionLogoff`).
- **`[read-only]` marks only what changes nothing in the system.** Dropped from the tools above and from every other tool that changes the system without changing a repository object (none is served by a read-only binary): compact `HandlerProfileRun` and `HandlerProfileSchedule`; the debugger tools that open, change or end a debug session or move a debuggee — `DebugStartListener`, `DebugTakeOverListener`, `DebugStep`, `DebugStepToLine`, `DebugTerminate`, `DebugStop`, `DebugSetBreakpoints`, `DebugDeleteBreakpoint`, `DebugCreateWatchpoint`, `DebugDeleteWatchpoint`, `DebugSetVariable`, `DebugSetSettings`, `DebugSetStackPosition`, `DebugCreateMemorySnapshot`, `DebugBatchEnd`, `AmdpDebugStart`, `AmdpDebugStop`, `AmdpDebugStep`, `AmdpDebugCancel`, `AmdpDebugSetBreakpoints`, and compact `HandlerDebugBreakpoints`, `HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugMaintain`, `HandlerDebugBatch`. The debugger's reads (`DebugGetStack`, `DebugGetVariables`, `DebugListBreakpoints`, `DebugWait`, the memory snapshot reads, …), `DebugBatchBegin`, the batch tools, the background-run reads and the leftover-session list keep it. Only the descriptions' leading marker changed.

### Changed — breaking for an embedder that composes the handler groups of `@mcp-abap-adt/lib/handlers`

- **`RunATC`, `GetATCRunStatus` and `GetATCFindings` moved from `HighLevelHandlersGroup` to `SystemHandlersGroup`** (beside the run tools), which is how the read-only binaries serve them. A composition with `HighLevelHandlersGroup` and without `SystemHandlersGroup` — `HandlerExporter` with `includeSystem: false`, or the groups listed by hand — no longer has the ATC tools; one with `SystemHandlersGroup` and without the high group — `includeHighLevel: false` — now has them. **Migrating:** to keep the ATC tools, include `SystemHandlersGroup` (`includeSystem: true`, the default); to leave them out where the system group is wanted, filter the three names out of its entries.
- **`RuntimeRunClass`, `RuntimeRunProgram` and `RuntimeCreateProfilerTraceParameters` left `SystemHandlersGroup` for the new `RuntimeRunHandlersGroup`** (`@mcp-abap-adt/lib/handlers`); `SystemHandlersGroup` takes no options (`SystemHandlersOptions`, its `background` switch, and `withoutBackgroundParameter` are gone: no set serves a run tool without `background`). `HandlerExporter` (`includeSystem`) and `EmbeddableMcpServer` (`system`) add the new group beside the system group, so their tool lists are unchanged. `expositionGroups` / `registryForExposition` serve the run tools and their background-run tools with `high`, no longer with `readonly`, and the leftover-session logoff with `high` only (every exposition keeps the list). The new `LeftoverSessionListHandlersGroup` and compact `CompactLeftoverSessionListHandlersGroup` serve the list alone, as the read-only sets do. **Migrating:** a composition listing the groups by hand adds `RuntimeRunHandlersGroup` to keep the run tools; one built from `['readonly']` adds `high` for them and for the logoff; drop the second argument of `new SystemHandlersGroup(context, …)`.

### Changed — breaking for code that imports `@mcp-abap-adt/lib`

- **The server's ADT client is typed per system type** (`IServerAdtClient<V>`, `src/lib/adtClientContract.ts`, composed from interfaces-adt's tables): `createAdtClient()` / `getAdtClient()` answer it, `createOnPremAdtClient()` the on-premise one, `createOnPremExecutor()` `AdtExecutor<'onprem'>`; a member a system type's table does not serve does not compile on that type. Its `getUtils()` is interfaces-adt's typed atoms of the system type (adt-clients 39): `search` takes `IAdtSearchObjectsParamsOf<V>` (`IServerObjectSearch`), where-used `IAdtTypedWhereUsed`, the group members `IAdtTypedGroupLifecycle` — a search filter is a search name, a group reference to `FUGR/FF` or `FUGR/I` names its `parentName`, `VIEW/DV` is taken. **Migrating:** call the client through these types; for a member on premise only, take `createOnPremAdtClient()`; pass a search name to `search`, and a function module's group in `parentName`.
- **`ActivationPlan`'s group is typed by the system type it is sent on** (`GroupActivation`: `{ variant: 'onprem' | 'cloud', references }`, `@mcp-abap-adt/lib/handlers/write`), where it was an `IObjectReference[]`; `activationPlan(objects, variant)` builds one from a tool's `objects[]` (`ActivationObject`). **Migrating:** build the plan with `activationPlan` rather than by hand.
- **Removed exports:** `TYPE_TO_FAMILY` (`@mcp-abap-adt/lib/handlers/write`), `toLowObjectType`, `toLockObjectType` and `LowObjectType` (`compact-shared`). **Migrating:** route by `SINGLE_ACTIVATION_ROUTES`, `COMPACT_ACTIVATE_ROUTES` and the `COMPACT_*_KINDS` maps.
- **Dependencies:** `@mcp-abap-adt/interfaces-adt` `^24.0.1` (was `^20.1.0`; `lib` and `compact-modify`), `@mcp-abap-adt/adt-clients` `^39.0.0` (was `^37.2.0`), `@mcp-abap-adt/adt-strategies` `^0.17.0` (was `^0.15.0`), from the registry.

### Added

- **`HandlerActivate` activates a `FUNCTION_MODULE`** (named `GROUP|MODULE` in `object_name`, or with the new `function_group_name`; without the group, or with two groups, the call is refused before anything is sent) **and a `BEHAVIOR_IMPLEMENTATION`** (activated as its class). Both are recorded in batch mode, each one request: a behaviour implementation its class's activation, a function module one activation run under its group (`tools/batch-handlers.json`, [Batch Mode](docs/user-guide/BATCH_MODE.md)).
- **`VIEW/DV` (a dictionary view) is a where-used and a group-activation code** (`GetWhereUsed` `object_type`, `ActivateObjects` / `ActivateObjectLow` / `HandlerActivate` `objects[].type`, on premise and on cloud): adt-clients 39 addresses it under `/sap/bc/adt/ddic/views`. Each description lists it. **`dbview`** is a new friendly name for it, either case, wherever a name is taken for a code that argument serves (there, and the search's `VIEW`); `view` stays the CDS view (`DDLS/DF`). The structure tools (`GetObjectStructure`, `GetNodeStructure`, …) take no `VIEW/DV`, so they refuse `dbview` naming their list.
- **On cloud, the program reads:** `GetProgram` (core and core-ro), `CheckProgram`, `GetProgramVersions`, `GetProgramVersionSource`, `GetProgramVersionDiff` and `RunProgramUnitTest` are served on cloud too, and compact `HandlerGet` `PROGRAM` works there; their descriptions say that on cloud the programs are SAP's. `CheckProgramLow` no longer refuses a cloud connection. The program writes stay on premise.
- **`RunATC` checks programs, program includes, function includes and class includes.** `objects[].type` also takes `program` and `program_include` (on premise), `function_include` (with the new `function_group`, the include's function group) and `class_include` (with the new `include_kind`: `definitions`, `implementations`, `macros` or `testclasses`; `name` is the class). An include is checked as the object that owns it. A function include without `function_group`, a class include without `include_kind`, and either field on a type that does not read it are refused before any call, naming the field and the type. The answer's `objects` names `function_group` / `include_kind` beside the name and type.
- **`GetATCFindings` with `detail: 'full'` answers more of each finding.** Beside the terse fields: `column` (from the location's `start=LINE,COLUMN`; the fragment's parts are `;`-separated, and a line is read from `#type=…;name=…;start=29` too), `check_id`, `check_class`, `message_id`, `documentation_uri` (the finding's link to its ATC documentation), `exemption_approval` and `exemption_kind` as the worklist gives them, and `quickfixes` (the `manual`, `automatic`, `pseudo`, `ai_based` and `ai_enabled` flags of the finding's quick fixes). `full` used to answer the same as `terse`; `terse` is unchanged. Exempted findings are still not in the worklist: adt-clients reads it with `includeExemptedFindings=false`.
- **`RunAbapUnit` runs ABAP Unit by a run target** (high group, beside `RunUnitTest` and the other per-object run tools: the full binaries `mcp-abap-adt`, `mcp-abap-adt-http` and `mcp-abap-adt-sse`, on premise and cloud; no `-ro` binary serves it, since the tests a run executes can change data in the system). `target` names an object, `{ kind: 'object', name, type }`, `type` one of the 28 ABAP Unit run object types (the keys of interfaces-adt 24's `ABAP_UNIT_RUN_TYPES`: `CLAS/OC`, `CLAS/OCL`, `PROG/P`, `FUGR/F`, `FUNC`, `DDLS/DF`, …), or a package, `{ kind: 'package', name, include_subpackages }` (`include_subpackages` required there). It runs through adt-clients 39's generic runner (`getAbapUnitTestRunner`): an object goes as an `osl:flatObjectSet` with one `osl:object`, a package as an `osl:packageSet` with one `osl:package`; with `wait` (below) its status is read by long polling until SAP answers it finished and the run answered as `RunUnitTest`'s, or its `run_id` is answered right after the start. `scope`, `risk_level` and `duration` take the names compact `HandlerUnitTestRun` takes; left out, the library's defaults are sent (own tests, assigned tests as a preview; every risk level and duration). A CDS view's tests are assigned tests: they execute with `scope.foreign_tests: true`, and with the default scope the result lists them as a preview, unexecuted, with no alert. The endpoint answers a type it does not run with an empty result, so a type outside the registry, an object without `type`, a package without `include_subpackages`, a field of the other kind or a flag that is not a boolean is refused before anything is sent. The per-object run tools are unchanged. `legacy` is left out (`available_in`: SAP_BASIS 7.40 has no `/abapunit/runs`). Compact `HandlerUnitTestRun` takes the same `target` (below).
- **Compact `HandlerUnitTestRun` runs by a run target too** (2026-10-31): beside `tests` (chosen test classes of global classes, unchanged, with either runner), it takes `target`, `RunAbapUnit`'s own schema piece and mapping — all tests of one object of any of the 28 run object types (a report `PROG/P`, a function group `FUGR/F`, a CDS view `DDLS/DF` with `scope.foreign_tests: true`, …) or of a package, `{ kind: 'package', name, include_subpackages }`. Exactly one of `tests` and `target` per call; both or neither is refused naming the two, before anything is sent, and so is a target `RunAbapUnit` refuses. A target run is started through adt-clients 39's generic runner (`getAbapUnitTestRunner().run`) and answered `{ success, run_id }`, its status and result read by run_id with `HandlerUnitTestStatus` and `HandlerUnitTestResult`; `title`, `context`, `scope`, `risk_level` and `duration` are sent with it. The generic runner starts a target asynchronously only (its `runSync` takes ADT URIs), so `target` with `runner: 'sync'` is refused before anything is sent. `tests` is no longer required by the schema.
- **`wait`: whether a tool that starts an ABAP Unit run waits for it** (2026-10-31). `RunUnitTest`, `RunCdsUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest` and `RunAbapUnit` take `wait`, a boolean, default `true`. `true`: the run is started and its status read once by long polling — the call lasts as long as the run (measured on premise: ADT holds one status long poll until the run has finished, 97 s for a 90 s test, 207 s for a 200 s one, and returns on no progress step). SAP's answer ends the call: `FINISHED` answers the result (`{ success: true, run_id, finished: true, run_result }`, as before); another status answers `{ success: true, run_id, status }`, SAP's status as it named it, and the result is not read — the run is read on by `run_id`; a status document with no `aunit:progress` status is a failure at the step `read status` whose message carries the document as SAP sent it. One status read per call, nothing repeated. `false`: the call answers `{ success: true, run_id }` right after the start, and the status and result are read by `run_id` (`GetUnitTestResult`, `GetUnitTestStatus`). A long run under a client with a request time limit is started with `wait: false`: with the MCP TypeScript SDK's default 60 s limit, a 200 s waiting call was cut by the client and its `run_id` lost (measured). A `wait` that is not a boolean is refused before anything is sent, and so is a `wait` with `runner: 'sync'` (one request answered with the finished result). The readers read the status the same way ([see above](#changed--breaking-for-a-caller-that-reads-an-abap-unit-run-unfinished)).
- **Public surface** (`@mcp-abap-adt/lib/compact-shared`, unless named otherwise): the projections module (`adtProjections`: `projected`, `ACTIVATION_CODES`, `ACTIVATION_NAMES`, `SINGLE_ACTIVATION`, `SINGLE_ACTIVATION_NAMES`, `SINGLE_ACTIVATION_ROUTES`, `WHERE_USED_CODES`, `WHERE_USED_NAMES`, `INCLUDES_PARENTS`, `INCLUDES_PARENT_MAIN_TYPES`, `VERSIONED_KINDS`, `TABLE_CODES`, `TYPE_NAMES`, `TYPE_NAME_LIST`, `TYPE_NAME_VALUES`, `ATC_OBJECT_TYPES`, `ATC_OBJECT_CODES`, the `COMPACT_*` lists, routes and `*_KINDS`, the `*_KIND_ROUTES`, `AtcKindOn`, `AdtCodes`, `TableMainOf`, `MainTypeCodes`, `KindsOf`, `VersionedKind`, `CheckKind`, `LockKind`, `UnlockKind`, `ValidateKind`), the boundary (`acceptedOf`, `acceptedCodeOf`, `mainTypeCodeOf`, `sharedMainType`, `notAccepted`), `ToolDefinition.variants` and `byVariant`, `variantOf` (`@mcp-abap-adt/lib/handlers`), `checkObject` and `validateObject` (read barrel), `activatePlanOnce`, `activationPlan`, `ActivationPlan`, `ActivationObject`, `GroupActivation`, `lockObject`, `unlockObject` and `chainCreateRefusal` (write barrel), and the debugger's `BREAKPOINT_OBJECT_CODES`, `BreakpointLabel`, `breakpointLabelOf`, `RUN_KIND_ROUTES`, `RunKind`, `RUN_KINDS`.

### Fixed

- **`ActivateObjects` activates a structure named `TABL/DS` and a domain named `DOMA/DD` through their own activation.** The map from type code to family named `ttyp/st` (a code ADT never sends) for the structure, so a `TABL/DS` went to group activation and a call naming `TTYP/ST` activated a structure of that name; `DOMA/DD`, the domain's code, was not in the map. A table type (`TTYP/DA`, or `TTYP`) goes to group activation.
- **`ActivateObjects`' `preaudit` says what is sent, and for which types** (see Changed). It said the single-object path had "no preaudit parameter at all", and `ActivateObjects` said only "Default: true".
- **The read-only binaries serve `RunATC`, `GetATCRunStatus` and `GetATCFindings`.** Each says "[read-only]", and none of `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro` served them. No compact binary has an ATC route. `CreateClass` gained the search keyword "class on a transport", which keeps it in the write collection's top five for "create a class and add it to a transport" with the ATC tools gone from that collection.
- **The ABAP Unit run tools no longer say `[read-only]`.** `RunUnitTest`, `RunCdsUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest` and compact `HandlerUnitTestRun` started their descriptions with `[read-only]`, though the tests a run executes can change data in the system and no read-only binary serves them. The marker is dropped; nothing else of their contracts changed. The tools that read a run's status or result (`GetUnitTest`, `GetUnitTestStatus`, `GetUnitTestResult`, `GetCdsUnitTest`, `GetCdsUnitTestStatus`, `GetCdsUnitTestResult`, compact `HandlerUnitTestStatus`, `HandlerUnitTestResult`, `HandlerCdsUnitTestStatus`, `HandlerCdsUnitTestResult`) keep it.
- **`HandlerValidate` `SERVICE_BINDING` and `ValidateServiceBinding` without `package_name`** are refused naming it, where adt-clients failed with a `TypeError`.
- **`HandlerServiceBindingValidate`'s description names `package_name`, the binding's package, as required** (2026-10-31): the check it runs names the binding's package, and a call without it is refused `package_name is required` before anything is sent; the description listed it as optional. Its parameter description says it is the binding's package. Its schema marks it required (see the breaking change above).
- **Every activation code a tool offers can be sent through its schema** (2026-10-31, measured on S/4HANA): `ActivateObjects`' `objects[]` declared only `name` and `type`, so the `parentName` a function module (`FUGR/FF`, and `function`, `functionmodule`, `function_module`, `func`) or a function include (`FUGR/I`) needs was dropped by the schema and every such call was refused `objects[].parentName is required for …`; it declares `parentName` now. Compact `HandlerActivate`'s single form with `object_adt_type` takes `parentName` beside it (it named no parent, so `FUGR/I` there was refused the same way). The `parentName` of `ActivateObjects`, `ActivateObjectLow` and `HandlerActivate` (single and list form) says it is required for those codes and names: the function group the object belongs to.
- **A group activation SAP cancelled is no longer answered as activated** (2026-10-31, measured on S/4HANA: `ActivateObjects` of a `VIEW/DV` answered `activated: true` over SAP's W "Activation was cancelled." and `activationExecuted="false"`; present in 21.0.0). `ActivateObjects` and `ActivateObjectLow`'s group path read SAP's own verdict: the run's results' `activationExecuted` and the messages' severity. A run whose results say `activationExecuted="false"` answers `activated: false` with its messages, its `message` naming it, and `nothing_to_activate: true` where no message explains it (as the single-object answer says it); results that state no `activationExecuted` are judged by their messages' severity, as before. Compact `HandlerGet` `part: activation_results` answers `activated` beside the messages: SAP's verdict as the results state it, `null` where they state none.
- **`ValidateServiceBinding`, `HandlerValidate` `SERVICE_BINDING` and `HandlerServiceBindingValidate` answer the transport check's verdict** (2026-10-31, measured on ABAP Cloud and S/4HANA: `admissible: false` with an empty message for every name, a free one included; present in 21.0.0). The check they run (`POST /sap/bc/adt/cts/transportchecks`) states its verdict in `RESULT`, which was not read: `S` answers `admissible: true`, `E` `admissible: false`, each with SAP's messages beside it (`messages: [{ type, text }]`, from each `CTS_MESSAGE`'s `SEVERITY` and `TEXT`); any other value is answered as `result`, exactly as SAP sent it, with its messages and no `admissible`. Their descriptions say so, and that creating the binding checks the name, the package and the service definition itself: SAP answered `S` for an existing binding's name and for a package that does not exist (measured). The type validations (`ValidateObjectLow`, `HandlerValidate` for the other types) are unchanged.

### Repository (nothing in the published packages)

- **`npm audit --audit-level=moderate` passes again.** The lockfile takes `follow-redirects` 1.16.2 (GHSA-mrwp-f3q8-3g9p, through axios) and `babel-plugin-istanbul` 8.0.2 (`npm audit fix`); the root `package.json` overrides `minimatch` with `^11.0.3` (GHSA-g3hv-75wg-m249) and `glob` with `^14.0.3` (GHSA-3g3m-2fjr-6pw4), every copy of which is in jest's tree, the lockfile regenerated by npm. `deepmerge` (low, GHSA-gcqx-w48m-w2h4, inside jest-config) has no fixed release yet.
- **The debugger suite and `CheckPackage`'s case take the shared package on cloud too** (2026-10-31, measured on ABAP Cloud: the template's debugger probe package `$TMP` was refused `403 ExceptionResourceNoAccess`, so every debugger case failed, and `CheckPackage` checked `ZMCP_SHARED`, which a system whose shared package has another name does not hold). The template names neither package any more: the debugger probe goes into `debugger_handlers`' `package` when one is given, else into `shared_dependencies.package` — the package `npm run shared:setup` creates on premise and on cloud, recording no changes as the template configures it, so the probe needs no transport ($TMP is refused on cloud, and `ZLOCAL` is a structure package there) — and `check_package_high` checks its `package_name` when one is given, else `shared_dependencies.package`.
- **`SearchSource`'s case scans the shared package by default** (2026-10-31). The template no longer sets `search_source_readonly.scan_package` to a fixed name that had to equal `shared_dependencies.package`: `SearchSourceHandler.test.ts` scans the case's `scan_package` when one is given, else `shared_dependencies.package` — the package `npm run shared:setup` creates and seeds with the objects the queries look for — as the debugger probe and `CheckPackage`'s case do. The test's own fallback to a package of one system's name is gone.
- **The test-config template's cases skip a legacy system while legacy support is parked.** The template lists `legacy` in no case's `available_in` (`run_atc`'s case names `onprem` and `cloud`); a case skipped for its system runs no cleanup, so it sends no delete for an object it never created; the debugger suite writes its probe only on a system its case names; the batched-reads timing skips a legacy configuration. Measured against SAP_BASIS 7.40 SP04: 32 failing tests before, none after.

## [21.0.0] - 2026-10-30

A major for two breaking changes: `getConfig()` is gone and a stdio destination states its connection type ([#320](https://github.com/fr0ster/mcp-abap-adt/issues/320)), and `GetTypeInfo` answers every DDIC type a name is ([#321](https://github.com/fr0ster/mcp-abap-adt/issues/321)). Each has its migration note below. 21.0.0 also brings 20.1.1 to npm: 20.1.1 is tagged (`v20.1.1`) but not published, so a consumer on 20.1.0 gets its changes (stdio has no idle bound; the body-parser and fast-uri lockfile versions) with 21.0.0; its entry below says what they are. The eighteen packages are all at 21.0.0, every sibling range at `^21.0.0`.

### Removed — breaking for code that imports `@mcp-abap-adt/lib/utils`

- **`getConfig()` is gone from `@mcp-abap-adt/lib/utils`**, and so are its private twin in `src/lib/config.ts`, `parseAuthType` and the certificate/Kerberos field reader ([#320](https://github.com/fr0ster/mcp-abap-adt/issues/320)). `getConfig()` built a `SapConfig` from `process.env` by guessing: an absent or unknown `SAP_AUTH_TYPE` became `basic`, `snc` became `basic` too, and an absent `SAP_CONNECTION_TYPE` became `http`. No binary called it: the stdio launcher reads the `.env` itself and refuses a missing or unknown authentication, and the HTTP and SSE servers read only the request's headers. **Migrating:** build the `SapConfig` yourself from what you know, and state every field; or hand the server a connection (`setAbapConnectionOverride`) or a config (`setSapConfigOverride`, still exported).
- **stdio: a destination states its connection type.** With no `--connection-type`, `SAP_CONNECTION_TYPE` (the environment or the destination's `.env`) or `connection-type` (YAML), the start is refused, naming the three places, as for the system type. It used to mean HTTP. **Migrating:** add `SAP_CONNECTION_TYPE=http` (or `rfc`) to the destination's `.env`, or pass `--connection-type`; a `--mcp` destination read from a service key, which carries no connection type, needs `--connection-type`, the environment or YAML.
- **stdio: `--mcp=<name>` reads the connection type and the system type from the destination's own `.env`** (`<auth-broker-path>/sessions/<name>.env`), as `--env` does, below the CLI and the process environment and above YAML. They used to be read only from an `--env` file, so an RFC destination named with `--mcp` ran over HTTP unless `--connection-type=rfc` was passed.
- The integration tests' `getSapConfigFromEnv` guesses nothing either. `SAP_AUTH_TYPE` must be `basic` or `jwt`; `basic` needs `SAP_USERNAME` and `SAP_PASSWORD`, and `jwt` needs `SAP_JWT_TOKEN`. `SAP_CONNECTION_TYPE` must be stated, `http` or `rfc`. Anything else is refused, naming what is wrong.

### Changed

- **A portable archive may be shared inside the organization that licensed the SAP NW RFC SDK**, as its SAP administrators share the SDK itself; it is still never published. [Portable Build](docs/installation/PORTABLE.md), [Installation](docs/installation/INSTALLATION.md) and the archive's README say so, and the README tells a colleague how to start it: on Windows SmartScreen may ask once for the unsigned executable (More info → Run anyway, or the organization's IT allows it where policy removes that); on macOS an archive received through a browser or a messenger needs its quarantine flag cleared (`xattr -dr com.apple.quarantine <folder>`).

- **Four tools no longer build ADT URLs of their own; they call adt-clients' members** ([#235](https://github.com/fr0ster/mcp-abap-adt/issues/235)). What each answers is unchanged, checked against E19 beside the previous build:
  - `GetTransport` reads the request through `getRequest().readObjects()`. The `includeObjects`/`includeTasks` query parameters are gone: the request's document carries its objects and tasks either way (measured on E19 with all four combinations), and `include_objects`/`include_tasks` still choose what the answer carries.
  - `GetTypeInfo` tries a data element, a table type, a domain's object properties and a structure, through their members. The first lookup it used to send, a domain's `/source/main`, answered `404` for every domain and is gone; a domain is found through its object properties, as before.
  - `GetServiceBindingPreviewUrl` reads the service URLs through `getServiceBinding().getServiceGroup()`, which sends adt-clients' `Accept` for the protocol.
  - `GetEnhancementImpl` and `GetEnhancementSpot` look an enhancement's subtype up through `getUtils().search()`.

### Changed — breaking for a consumer of `GetTypeInfo`'s answer

- **`GetTypeInfo` answers every DDIC type a name is, not the first one found** ([#321](https://github.com/fr0ster/mcp-abap-adt/issues/321)). One name can be several types; MANDT, for example, is a data element and a domain. The name is read as a data element, a domain, a structure (unless `include_structure_fallback` is `false`) and a table type, and the answer is `{ name, types: [...] }`, with `types` in alphabetical order of `objectType` (`data_element`, `domain`, `structure`, `table_type`). Each entry is read from its own document:
  - a data element: its type, length, decimals, domain and labels;
  - a domain, now read in full (`doma:domain`): its type, length, decimals, output format, value table and fixed values. A fixed value's `low` and `high` are kept as written: blank is `""` (XFELD's `Nein`), and spaces are kept;
  - a structure: its name, description and package. It used to be read from a root element it does not have, so it answered empty fields.
  - a table type: its row type, access type and primary key, where it used to be answered raw.

  A successful answer that is not the type's document ends the call naming the read, instead of being read as the type absent. The object-properties lookup is gone. It answered a domain by name and text only, and its `422` for a non-domain such as SYST ended the call before the structure was read. Measured on E19 (2026-10-24): each read answers `404` for a type the name is not. **Migrating:** read `types[]` instead of the single object, and pick the `objectType` you need.

### Repository (nothing in the published packages)

- **`MCP_TEST_CONFIG` set but blank, or naming a file that is not there, is refused by every reader.** A blank value used to mean the default `tests/test-config.yaml`, and Jest's global setup answered a named file it could not read with "no config" — no auth session — while the tests refused the same name. `testConfigPathFromEnv` now refuses both, so the global setup, the tests and `shared:check` fail alike, naming the variable.
- **Every TypeScript file under `scripts/` is type-checked**: `tsconfig.test.json` includes `scripts/**/*.ts`, so `test:check` and CI refuse a script that no longer compiles ([#234](https://github.com/fr0ster/mcp-abap-adt/issues/234)). The 18 scripts that did not compile, or were one-off measurements whose results are recorded, are gone: the `probe-*` scripts, `debug-profiling`, `get-dump`, `list-dumps`, `list-traces`, `read-fm`, `classify-mcperror-throws`, `tool-provenance` and `capture-adt-corpus` (69 type errors between them, 48 in the last). The ADT corpus stays as recorded, and its README says where the capture script is in history. `tools/` holds no TypeScript.

## [20.1.1] - 2026-10-30

stdio has no idle bound: the stdio server's life and its held state are the client's.

### Fixed

- **stdio: held state no longer ends after an idle bound; the stdio server's life is the client's.** The stdio server (`mcp-abap-adt` and its compact and `-ro` variants) ended held state — a debug session, an open batch, its connections — after 30 minutes without a tool call, and logged off its SAP connections. On stdio nothing now expires on the server's clock: held state ends by its stop tool, the client closing stdin (the server then shuts down and logs off), the backend's answer, or the process's shutdown. `StdioServer` states `NO_IDLE_BOUND` and its `InstanceState` never arms a timer. Streamable HTTP and SSE keep their idle bound unchanged (`--state-idle-minutes`, default and minimum 30).

### Removed — from the stdio binaries only

- **`--state-idle-minutes` and the YAML key `state-idle-minutes` are gone from `mcp-abap-adt`** (and `-ro`, `-compact`, `-compact-ro`): the row left core's parameter table and its help, and either one stated to stdio stops the start as a removed parameter, naming the form used (`--state-idle-minutes was removed from \`mcp-abap-adt\` in 20.1.1: stdio has no idle bound — …`), so a configuration that states a bound is never silently ignored. Remove it from a stdio configuration; the HTTP and SSE binaries keep it. `MCP_STATE_IDLE_MINUTES` is the HTTP and SSE binaries' variable and is not read by stdio: an inherited one changes nothing, and stdio starts with no bound.
- **`@mcp-abap-adt/server-runtime` types:** `StdioServerOptions.stateIdleMinutes` and `CoreConfig.stateIdleMinutes` are removed (`CoreConfig` extends `Omit<IServerConfig, 'stateIdleMinutes'>`); a TypeScript caller that passed or read them no longer compiles and drops them.

### Added

- **`NO_IDLE_BOUND` and `StateIdleBound`** (`@mcp-abap-adt/lib/state`): an instance's idle bound is whole minutes or `NO_IDLE_BOUND`, "no bound", stated by type. `InstanceState`'s `idleMinutes` option and `BaseMcpServer`'s `stateIdleMinutes` take it; absent is still the default 30, so an embedder that passes nothing (`EmbeddableMcpServer`) keeps its bound.

### Changed

- **Sibling ranges at `^20.1.1`** in every manifest — `dependencies`, `peerDependencies` and `devDependencies`: server-runtime's stdio server reads lib's `NO_IDLE_BOUND`, and every binary takes the server-runtime that states it.

### Security

- **The lockfile takes body-parser 2.4.0 (under express) and fast-uri 3.1.9 (under the MCP SDK's ajv)**, for GHSA advisories published against 2.3.0 (a denial of service through trailing bytes after a compressed body) and 3.1.8 (URI scheme, path and host confusion). No dependency range changed.

## [20.1.0] - 2026-10-23

Both ABAP Unit runners, chosen per call with `runner: 'async' | 'sync'` ([#286](https://github.com/fr0ster/mcp-abap-adt/issues/286), [#313](https://github.com/fr0ster/mcp-abap-adt/pull/313)); a write whose cleanup UNLOCK fails says the object may be left locked, and a save refused by `CTS_WBO_API` 019 / 020 names the request that holds the object ([#314](https://github.com/fr0ster/mcp-abap-adt/issues/314), [#316](https://github.com/fr0ster/mcp-abap-adt/pull/316)); on `@mcp-abap-adt/connection` 19.1.0, which resends a request lost on a dead kept-alive socket once on a new connection (#314's `socket hang up`); the 7-day release age dropped ([#315](https://github.com/fr0ster/mcp-abap-adt/pull/315)). The eighteen packages are all at 20.1.0, every sibling range at `^20.1.0` — `@mcp-abap-adt/compact-modify` needs `@mcp-abap-adt/lib` 20.1.0 for `runner` on `HandlerUnitTestRun`.

### Added

- **Both ABAP Unit runners, chosen per call: `runner: 'async' | 'sync'`, default `'async'`** ([#286](https://github.com/fr0ster/mcp-abap-adt/issues/286)) — a system may serve only one of the two endpoints (an on-premise system was reported with `/sap/bc/adt/abapunit/testruns` alone, without `/abapunit/runs`). On `RunUnitTest` (class), `RunProgramUnitTest` (report), `RunFunctionGroupUnitTest` and `RunFunctionModuleUnitTest` in the full sets, and on compact `HandlerUnitTestRun`. `async` is what each did before: the full-set tools start the run, wait for it within a bound and answer the result or the `run_id` of a run that outlasts the bound (read on with `GetUnitTestStatus` / `GetUnitTestResult`); `HandlerUnitTestRun` answers `{ success, run_id }` (read on with `HandlerUnitTestStatus` / `HandlerUnitTestResult`). `sync` is one `POST /sap/bc/adt/abapunit/testruns`, answered `{ success, runner: 'sync', finished: true, run_result }` with the finished result; a failing test is an alert in it, not an error. Another value is refused before any request. Recordable in batch mode with `runner: 'sync'` (one request each). `RunCdsUnitTest` is unchanged: there is no synchronous runner for a CDS unit test.
  - **A function module's synchronous run addresses the module under its group**, so `RunFunctionModuleUnitTest` takes `function_group_name`, optional, required with `runner: 'sync'` (refused before any request without it). The run covers every test of the module's function group — nothing filters it to the module's own tests (measured by adt-clients on premise, BASIS 816, 2026-10-23; the asynchronous run answered the same there).
  - **The four full-set start tools take `scope`** (`own_tests`, `foreign_tests`, `add_foreign_tests_as_preview`; the shape compact `HandlerUnitTestRun` takes), optional, sent to either runner; without it adt-clients' defaults apply (own tests run, foreign tests listed as a preview). Foreign tests are test classes linked to the object by an ABAP Doc `"! @testing` relation. Measured on premise (BASIS 816, 2026-10-23) with a function group whose test class carries `"! @testing FUNC:<module>`, the module's run: `runner: 'sync'` with the defaults answered both test methods as a preview (`isForeign="true"`, unexecuted), and with `scope: { foreign_tests: true }` executed them (one passed, one failed); `runner: 'async'` executed them with the defaults and with `foreign_tests: true` alike. The `scope` description says so.
  - **`HandlerUnitTestRun` with `runner: 'sync'` runs every test class of each `container_class` named**: the endpoint addresses whole classes, so a `test_class` does not narrow it; `title` and `context` are not sent. It runs class tests only, as before.
  - Measured through the stdio binaries from this branch's packed packages (2026-10-23), each object with one passing and one failing test: on premise (BASIS 816) the class, a report, a function group and its module, and on an SAP BTP ABAP trial the class, a function group and its module (no reports on ABAP Cloud). Both runners answered the same two methods, one passed and one failed, for every tool; `sync` took 150–340 ms against `async`'s 530–640 ms on premise, and 0.73–0.98 s against 1.97–2.37 s on the trial.

### Changed

- **The generated tool pages show a parameter written as a reference with its type and default** (`tools/generate-tools-docs.js`): `part`, `timeout`, `runner` and the like were listed as `any`; the type and default now come from the build, as the description already did.
- **Dependency: `@mcp-abap-adt/adt-clients` `^37.2.0`** (`@mcp-abap-adt/lib`): `runSync` on the class, report, function group and function module test runners.
- **Dependency: `@mcp-abap-adt/connection` `^19.1.0`** (`@mcp-abap-adt/lib`, `server-runtime`; was `^19.0.0`): a request lost on a dead kept-alive socket — one taken from the pool whose socket ended with no byte of an answer read (`ECONNRESET`, `EPIPE`) — is sent once more on a new connection with the same cookies, session headers, CSRF token and body, so the cleanup UNLOCK of [#314](https://github.com/fr0ster/mcp-abap-adt/issues/314), which failed with `socket hang up` and left the enqueue lock with the session, now reaches SAP; `https:` keeps its sockets alive too (an idle pooled socket closed after 5 s); the logoff goes out on a connection of its own. Never resent: a request that read any byte of an answer, one on a socket opened for it, the logoff, the resend itself. The tree still holds one `@mcp-abap-adt/sap-rfc-lite`, 0.3.2.
- **Sibling ranges at `^20.1.0`** in every manifest — `dependencies`, `peerDependencies` and `devDependencies`; `@mcp-abap-adt/compact-modify`'s peer `@mcp-abap-adt/lib` included: `HandlerUnitTestRun`'s `runner` is read by lib 20.1.0, and against lib 20.0.0 it would be ignored.
- **The 7-day release age is dropped.** `.npmrc` no longer sets `min-release-age=7` or `min-release-age-exclude[]=@mcp-abap-adt/*`. The age gate conflicted with the gating `npm audit`: a security fix younger than the gate could not be installed while the audit blocked CI (seen 2026-10-22 with markdown-it 14.3.3). The defences that stay: `allowScripts` with `strict-allow-scripts=true` (no dependency install script runs), lockfile hashes, `npm ci --ignore-scripts` in CI and the images, and the gating `npm audit`. Dependabot's own cooldown is unchanged. The 20.0.0 entry below describes the rule as it was then.

### Fixed

- `docs/architecture/REQUEST_HEADERS.md` names the versions this release depends on (it still named adt-clients `^36.0.2` and lib 19.0.0).
- **A write whose cleanup UNLOCK fails says the object may be left locked** ([#314](https://github.com/fr0ster/mcp-abap-adt/issues/314)). When the UNLOCK after a write is refused by SAP or throws in the client (`socket hang up`), `cleanup` keeps its fields (`message`, `origin` or `error: "client_threw"`, `request`, `failures`) and adds `left_locked: true`, `lock_handle`, the locked `object` (`{ type, name }`; a class include names its class) and `warning`: "the object may be left locked: the unlock failed (<the unlock's message>); it is released when the SAP session ends (logoff) or by its owner" — on a failed write, on a thrown one and beside a write that landed. Every handler that locks, writes and unlocks in one call names its object; the compact update writes under the caller's own lock and has no cleanup. The failure renderer copies the four fields by their types only (`true`, a non-empty string, `{ type, name }` of two non-empty strings, a string); nothing else passes. An unlock that answers adds none. Documented in [AUTHENTICATION.md](docs/user-guide/AUTHENTICATION.md#a-tool-failure-the-methods-error-as-it-is-plus-the-step).
- **A save refused as "already locked in request …" names that request** ([#314](https://github.com/fr0ster/mcp-abap-adt/issues/314)). A tool failure whose T100 messages hold `CTS_WBO_API` 019 (already locked in a request) or 020 (a task was passed; SAP names the request that holds the object) carries `hint: { transport_request, text }`: the request number, taken from the message's values by its shape (system id, `K`, six digits), and fixed words for each number saying to pass that request as `transport_request` — only when the call sent no request or another one — the call's own `transport_request` argument, which every way a handler is invoked keeps for the call's whole run (the server's tool calls, batched and background calls, a handler group registered on its own, `HandlerExporter.getHandlerEntries()` — which now wraps every handler, with or without a resolver), and the `corrNr` of the failed request's URL, since some writes send it as query parameters the request trace does not keep. When SAP names the very request the call sent — a deleted object's entry still recorded there refuses its re-create with 019 even so — the hint is `{ text }` alone, with no `transport_request`: the entry is still in that request, passing it again does not help, and the entry is dealt with first (removed from the request with the request's tools). This holds for full and compact tools alike, since every failure is rendered in one place. Nothing is resent. A message with no value of that shape, or any other message, gives no hint. The tool descriptions are unchanged.

## [20.0.0] - 2026-10-22

The RFC transport on `@mcp-abap-adt/connection` 19 and `@mcp-abap-adt/sap-rfc-lite` 0.3.2, which compiles nothing on install: a platform without a prebuilt RFC binding no longer gets one from `npm install`. Migration: [`docs/MIGRATION-20.0.md`](docs/MIGRATION-20.0.md). Over Streamable HTTP, `state_handle` is a declared argument of every tool, and a long session keeps one server instance and its SAP session across calls ([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308)).

### BREAKING

- **Dependencies: `@mcp-abap-adt/connection` `^19.0.0` (`@mcp-abap-adt/lib`, `server-runtime`) and `@mcp-abap-adt/sap-rfc-lite` `^0.3.2`** (optional, `lib`). connection 19 changes no API: it moves its own RFC dependency to sap-rfc-lite `^0.3.2`, so the tree holds one sap-rfc-lite, 0.3.2 — the one connection loads. sap-rfc-lite 0.3 has no install script and, from 0.3.2, ships no `binding.gyp`: `npm install` and `npm ci` compile and download nothing for it, also under `--ignore-scripts` and an npm that runs no unapproved install script. It carries a prebuilt binding for Linux x64 (glibc), Windows x64 and macOS ARM64, loaded at run time; its prebuilt bindings carry no path of the machine they were built on, so the RFC library is found by the operating system's loader. Windows with SAP GUI's 64-bit `sapnwrfc.dll` in `System32` needs no SDK. **On any other platform — Linux on ARM, an Intel Mac, Linux with musl (Alpine) — installing no longer builds the RFC binding** (0.2.x compiled it with the SDK and a C++ toolchain): the server installs and serves HTTP as before, and RFC is refused with `@mcp-abap-adt/sap-rfc-lite is not available` until you build a binding from sap-rfc-lite's repository and install the package you built (its README, "Installation"; [`docs/MIGRATION-20.0.md`](docs/MIGRATION-20.0.md)). The documentation says so where it stated RFC's prerequisites — [RFC Setup](docs/installation/RFC_SETUP.md), [Installation](docs/installation/INSTALLATION.md), the three platform guides, the package READMEs, Docker, the CLI options, the `--help` text and the package descriptions: no C++ toolchain and no `SAPNWRFC_HOME` before `npm install`; at run time the RFC library — SAP GUI's on Windows, else the SDK, its `lib` directory on `PATH`, `LD_LIBRARY_PATH` or `DYLD_LIBRARY_PATH` of the server process.

### Added

- **Streamable HTTP: `state_handle` is a declared argument of every tool** ([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308)) on `mcp-abap-adt-http`, `-http-ro`, `-compact-http` and `-compact-http-ro`: an optional string, "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." The pool already routed by a `tools/call`'s `state_handle` argument, but only the debugger tools declared it, so a model, which sets no header, could not reach a lock taken with `HandlerLock` or an open batch. The debugger tools keep their own declaration, required where it was; a tool that does not use the argument gets it taken out of its arguments before its handler. The `x-mcp-state-handle` header still works and still wins when both are sent; a JSON-RPC batch carrying `state_handle` is still answered `400`. The held-lock refusal and the descriptions of `HandlerLock`, `HandlerUpdate`, `HandlerDelete`, `HandlerUnlock`, `HandlerBatch`, `BatchBegin`, `DebugBatchBegin` and the compact debugger batch name the argument first, the header as the alternative. stdio and SSE register the schemas they registered before.
- **Streamable HTTP: the long session** ([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308)). `SessionOpen` / `SessionClose` (`mcp-abap-adt-http`, `-http-ro`) and `HandlerSession` with `action: 'open' | 'close'` (`-compact-http`, `-compact-http-ro`), read-only, served by no stdio or SSE binary. Open keeps an instance and its SAP connection and answers `{ state_handle }`: every call carrying it runs on that instance, on its held SAP session — no new connection, no `systeminformation` lookup, no logoff between the calls; opened with the handle of an instance that already holds state, or of an open session, it answers that same handle and keeps what is held. Close answers `{ closed: true, held: { locks, batch, debug_session } }`; once that answer is written the pool takes the instance out of its index and runs the instance close on it: every connection it owns logged off — which releases the locks taken in it — awaited to each logoff's write and its answer with no timer of the server's; an open batch and its answers dropped with nothing sent; the MCP server closed. From then on the handle answers `state is not available` at once; the shutdown awaits a close still running. Close without a handle or with an unknown one answers `state is not available`. A session never closed ends at the idle bound (`--state-idle-minutes`, default 30). In batch mode — a communication batch or a debugger batch — the session tools run at once and are never recorded: open leaves the batch open, close drops it. No list tool: the model keeps its handles; the handle is a bearer secret and the server does not identify the caller. Tool counts: `mcp-abap-adt-http` 256, `-http-ro` 71, `-compact-http` 39, `-compact-http-ro` 19 (on premise).
- **The tool pages render the Streamable HTTP surface**: `docs/user-guide/AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md` and `compact/docs/AVAILABLE_TOOLS.md` carry a "Streamable HTTP Binaries" section — the declared `state_handle` and the session tools, from the registration the HTTP server uses — listed in each page's navigation.
- **[MIGRATION-20.0](docs/MIGRATION-20.0.md#streamable-http-held-state-by-argument-and-the-long-session), section "Streamable HTTP: held state by argument, and the long session"**: what a 19.x Streamable HTTP user sees change, and how to adopt the argument and the long session (nothing is required).

### Changed

- **The portable build takes sap-rfc-lite 0.3's binding as it is** (`npm run portable:build`; [PORTABLE.md](docs/installation/PORTABLE.md)). 0.3 reads its own `package.json` through a literal `require`, which the bundle inlines, so the bundle-time replacement of 0.2's run-time read, and the check that failed the build when that replacement did not happen, are gone. In their place the build refuses a stage holding any copy of sap-rfc-lite older than 0.3.0, naming each: such a copy cannot load inside an executable, and a package that pins an older range loads its own — so a version published before 20.0.0 (`--version`) is refused. On Linux the prebuilt binding carries no `RUNPATH`, and nothing beside it found the SDK (measured: `ldd` finds neither `libsapnwrfc.so` nor `libsapucum.so` in its folder): it now gets a `RUNPATH` of `$ORIGIN` in place of its `SONAME` entry, whose string becomes `$ORIGIN` — the binding is loaded by its path, never by that name, and an image whose `SONAME` string is shared with any other name is refused; a binding that does carry a `RUNPATH` has it rewritten as before. `--build-from-source` is gone: npm compiles nothing for sap-rfc-lite whatever it is told. Measured on Linux x64 with these packages packed before their release and staged together (one sap-rfc-lite, 0.3.2): both executables built, and `npm run portable:smoke` passes all 18 checks. Not run on Windows or macOS.
- **Handles are unique among those the pool holds** ([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308)): an instance's handle (128 bits from `randomBytes`) is drawn again when the value drawn is already held, at its creation and at every rotation, so two long sessions never share a handle or an instance.

### Fixed

- **The `http` and `compact-http` READMEs said another credential "retires" a held instance; it never did.** A request carrying a handle with another credential (a renewed token, a new user and password) works on the held instance: its SAP session and its locks are kept and the new credential is put in force for its next sends (`BaseMcpServer.getConnection`); the connection is replaced only when SAP ended its session. The docs and a code comment now say so.

### Security

The repository's own install, lockfile, workflows and image build; the packages' code and dependency ranges are unchanged by this section.

- **The lockfile is refreshed within the declared ranges**, under the 7-day release age below: among others `@modelcontextprotocol/sdk` 1.32.1, `express` 5.3.0, `zod` 4.6.7, `dotenv` 18.0.8, `ws` 8.22.0, `undici` 8.12.1, `qs` 6.16.1, `xml-crypto` 6.4.0, `ts-jest` 29.4.15; a few transitive packages resolve one release back (`@napi-rs/keyring` 2.1.1, `jose` 6.2.12, `postcss` 8.5.30), because their newest releases are younger than 7 days. `npm audit` finds nothing, dev dependencies included.
- **`overrides`: `js-yaml@^3` gets `argparse` `^2.0.1`.** Jest reaches `js-yaml` 3 through `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config`, and `js-yaml` 3's `argparse` 1 brought `sprintf-js` (GHSA-hp3w-g68c-fv3c, moderate, no fixed release). `js-yaml` 3 uses `argparse` only in its command-line `bin/js-yaml.js`, which nothing here runs; `load-nyc-config` calls only `.load()`. The override replaces `argparse` 1 under `js-yaml` 3, and `sprintf-js` leaves the tree.
- **`@modelcontextprotocol/inspector` is no longer a dev dependency**, and with it the 131 packages only it pulled (`vite` among them). It served one `.vscode/launch.json` configuration, now removed; [TESTING_AUTH](docs/development/tests/TESTING_AUTH.md) runs the Inspector as the user's own command (`npx @modelcontextprotocol/inspector …`), outside the checkout.
- **No dependency runs an install script.** `allowScripts` in `package.json` denies the four that have one: `esbuild` (its `postinstall` checks or fetches the binary that its platform package, an optional dependency, already installs — the portable build's suites pass without it), `@parcel/watcher` (it compiles only when asked to build from source; its binary comes from its platform package), `unrs-resolver` (its `postinstall` fetches a binding only when the platform package is missing), and `fsevents` (macOS, its `install` runs `node-gyp rebuild` though the package ships its binary). `.npmrc` sets `strict-allow-scripts=true`, so a new dependency with an unreviewed install script fails the install instead of running it (measured: with `esbuild` left out of `allowScripts`, `npm ci` stops with `ESTRICTALLOWSCRIPTS`). npm reads these settings in full from 11.19.0; npm 10, bundled with Node.js 22, reads none — so CI and the release workflow install with `npm ci --ignore-scripts` — and install the packed tarballs, outside the checkout and its `.npmrc`, with `--ignore-scripts` too — and the from-source instructions ([Installation](docs/installation/INSTALLATION.md#from-source-development) and the three platform guides) say the same. `.npmrc` does not set `ignore-scripts=true`: it would also skip the packages' own `prepublishOnly` gate. `docker/Dockerfile` and `docker/Dockerfile.inspect` (the Glama reference image) install with `--ignore-scripts` too, and the portable build's two installs as well: no package of the production tree needs an install script, and the Glama image's one (`tldjs`, under `mcp-proxy`, which would refresh its public-suffix list from the network) is not needed — measured: the image built from `core` 19.2.0 answers `--version`, and `mcp-proxy` starts.
- **New versions age before they are resolved** (npm 11.19.0 and later): `.npmrc` sets `min-release-age=7`, except for the project's own `@mcp-abap-adt/*` scope, whose packages are released to each other the same day (`min-release-age-exclude`); their dependencies still wait the 7 days.
- **Nothing calls `npx`**, which fetches from the registry what it does not find installed: the scripts of the root and of the seventeen packages call `biome` and `tsc` from the installed dependencies, the pre-commit hook calls `lint-staged`, the workflows lint through `npm run lint:check`, and the suites that run a script through `tsx` start this Node with tsx's own CLI resolved from `node_modules`.
- **CI and the release workflow gate on `npm audit --audit-level=moderate`**: any known advisory of moderate severity or above fails the run, dev dependencies included — they run in CI and on every developer's machine. **Every job has a `timeout-minutes`** (45 for the test jobs, whose slowest cell takes about 21 minutes; 10 for the release job). `src/__tests__/unit/ci/workflowInventory.test.ts` holds the workflows, the package scripts, the git hook, `allowScripts` (one entry per dependency with an install script, each denied) and `.npmrc` to all of this; [GitHub Actions](docs/deployment/GITHUB_ACTIONS.md) says so.
- **The release guide and the migration note say the same**: [RELEASE.md](docs/deployment/RELEASE.md) installs with `npm ci --ignore-scripts` (then `npm run prepare` for the hook) and its "What the workflows check" names the whole-tree audit at moderate, the `--ignore-scripts` installs, the job timeouts and the Glama reference image; [MIGRATION-20.0](docs/MIGRATION-20.0.md#building-from-a-checkout-no-install-script-runs), "Building from a checkout", says what a contributor installing this repository does now.

## [19.2.0] - 2026-10-21

### Changed

- **Package listings with `include_descriptions: true` read the walk as single requests, several at a time, instead of ADT batch envelopes plus a metadata read per object** — `GetPackageContents`, `GetPackageTree` and compact `HandlerGet` part `contents`, on any system. Inside one envelope SAP answers the node structure parts after the first with other parts' `DESCRIPTION` texts, so the batched walk could not use them and read every object's metadata instead; a node structure sent alone carries its own. Each description is now the node structure's own short description, the one the sequential path always answered — in the logon language; the metadata read answered `adtcore:description` in the object's master language, so on a system whose objects are mastered in another language the text changes language (measured: 1 057 of the 1 251 objects both describe). Measured on an on-premise system: a flat package of 2 033 objects 24.3 s → 1.2 s, a three-level package of 2 282 objects 36.2 s → 6.3 s; every description equal to the sequential read's, and objects of types the metadata read did not cover (about a third of that flat package) now carry theirs. Without descriptions nothing changes: one envelope per phase of each level.
- **Dependencies: `@mcp-abap-adt/adt-clients` `^37.0.0`, `@mcp-abap-adt/adt-strategies` `^0.15.0`, `@mcp-abap-adt/interfaces-adt` `^20.1.0`** (`@mcp-abap-adt/lib`; `compact-modify` for `interfaces-adt`). adt-clients 37's `getSystemInformation` answers present, absent (`404` only) or failed; `GetServiceBindingPreviewUrl` reads it so: a `404` gives a URL without a client or language, as before, and any other status is reported beside the URL as `system_information_failure` (a `401` ends the call). A `405`, a `501` or a `2xx` that is not the record were read as absent before and are now reported as that failure. adt-strategies 0.14.0 refuses an answer to a message read that is no message class document (`ADT_OBJECT_NOT_FOUND`); `GetMessageClassMessage` answers that verdict. adt-strategies 0.15.0 adds `analyseObjectProperties`, which `GetTransaction` passes.
- **A failure a reading raised on a `2xx` answer carries `raw_body` only with `detail: 'raw'`**, for every tool. SAP did not refuse there: its body is an ordinary document, and the failure's message, code and messages already say what is wrong with it — measured: `GetMessageClassMessage` for a number its class does not hold answered 613,386 bytes, now 312. A refusal SAP made (any other status) carries `raw_body` at every `detail`, as before; nothing else in a failure changes. A tool without a `detail` parameter answers such a failure without the body.
- **A new package, `@mcp-abap-adt/server-runtime`: the launch code of every server** ([#303](https://github.com/fr0ster/mcp-abap-adt/issues/303)). The stdio launcher, `StdioServer` and the destination layer (`/stdio`, `/stdio/server`, `/auth`), the Streamable HTTP launcher and server (`/http`, `/http/server`) and the HTTP+SSE launcher and server (`/sse`, `/sse/server`) moved there from `@mcp-abap-adt/core`, `http` and `sse`, unchanged. It has no command, and you never install it yourself: every server package depends on it and installs it. The release is eighteen packages; the twelve binaries, their names, options, tool sets and versions are unchanged.
- **No server package depends on another** ([#303](https://github.com/fr0ster/mcp-abap-adt/issues/303)). The nine wrappers (`compact`, `compact-ro`, `core-ro`, `compact-http`, `compact-http-ro`, `http-ro`, `compact-sse`, `compact-sse-ro`, `sse-ro`) no longer depend on `core`, `http` or `sse`: each of the twelve binary packages depends on `server-runtime`, `@mcp-abap-adt/lib`, `background-runs-memory`, `responsible-rules` and its own compact halves. `lib` is in `dependencies` of the twelve binary packages only; `server-runtime`, `compact-readonly-entries`, `compact-modify`, `background-runs-memory` and `responsible-rules` take it as a peer dependency (and `server-runtime` takes `background-runs-memory` and `responsible-rules` the same way). An embedder that installs `compact-readonly-entries` (with or without `lib`) gets one `lib` as before: npm installs a missing peer.
- **The eight Streamable HTTP and SSE server packages — `http`, `compact-http`, `http-ro`, `compact-http-ro`, `sse`, `compact-sse`, `sse-ro`, `compact-sse-ro` — now install `@mcp-abap-adt/auth-broker`, `@mcp-abap-adt/auth-stores` and `@mcp-abap-adt/interfaces-auth-broker`**, through `server-runtime`, whose dependencies they are, for the stdio destination layer. None of them loads them: only the runtime's stdio paths reach them (`dependencyRule.test.ts`).
- **`@mcp-abap-adt/core` (`.`, `/launcher`, `/auth`), `@mcp-abap-adt/http` and `@mcp-abap-adt/sse` (`.`, `/launcher`) keep their exports, as re-exports of `server-runtime`'s paths.** Their `StdioServer`, `StreamableHttpServer` and `SseServer` still answer their own package's version when constructed without one. Their launcher paths (`@mcp-abap-adt/core/launcher`, `@mcp-abap-adt/http/launcher`, `@mcp-abap-adt/sse/launcher`) take 19.1.0's options: `main({ toolSet, program, version })` and `launch(config, { toolSet, program, version }, deps)` compile and run as before — `packageName`, the package a second copy of `lib` asks to reinstall, is optional there and defaults to that path's own package; a value given passes through. On `server-runtime`'s own paths (`/stdio`, `/http`, `/sse`) `packageName` is required.

### Fixed

- **`GetTableContents` (and compact `HandlerGetData` with `object_name`) answers the rows asked for and the table's true row count** ([#302](https://github.com/fr0ster/mcp-abap-adt/issues/302)). It read `/sap/bc/adt/datapreview/ddic?rowNumber=N`, which, measured on an on-premise system (BASIS 816), answers N+1 rows and `totalRows` 0 — a table of four rows asked for two answered three and `total_rows: 0`. It now reads the freestyle preview (`/sap/bc/adt/datapreview/freestyle?rowNumber=N`, as `GetSqlQuery` does) with `SELECT * FROM <table>`, which answers at most N rows and the true `total_rows` (measured: the same table, two asked → two rows, `total_rows` 4). The answer's shape and `detail` levels are unchanged; `row_number` is the `max_rows` asked.
- **`GetMessageClassMessage` answers the one message, not the whole class** ([#302](https://github.com/fr0ster/mcp-abap-adt/issues/302)). ADT answers a message read with the class document, every message in it (measured: 613,165 bytes for one message of a class of 900), and the tool handed that document on under `metadata`. It now reads the message numbered `msgno` out of that one answer and answers its fields under `message` — `msgno`, `msgtext`, `selfexplainatory`, `documented`, `lastchangedby`, `lastmodified`, `name` and any other the system gives the message (measured: 280 bytes). New `detail` parameter: `full` adds the message element as parsed, its links included; `raw` answers the class document as SAP sent it. A number absent from the class is still refused (`ADT_OBJECT_NOT_FOUND`). **The answer's shape changed:** `message` replaces `metadata` and `part`, and `detail: 'raw'` gives the class document as SAP sent it.
- **`GetTransaction` reads the transaction** ([#302](https://github.com/fr0ster/mcp-abap-adt/issues/302)): it answered `{"message":"Not implemented"}` as a success. It now reads the transaction's object properties in one request (`getUtils().getObjectProperties` of `/sap/bc/adt/vit/wb/object_type/trant/object_name/<name>`) and answers the transaction under `object` (`name`, `text`, `type`, `package`, …) and its facets under `properties` in the system's order — application component chain, package chain, type, owner, language, creation and the rest, each with `facet`, `name`, `displayName` and, where given, `text` (measured on premise: 200, 22 facets). New `detail` parameter: `full` adds the document's parse, `raw` the document. The read passes `analyseObjectProperties` (adt-strategies 0.15.0): a `200` that is no object properties document holding the object (an empty body, a sign-in page, a truncated document) is refused `ADT_OBJECT_NOT_FOUND`. A name the system does not know is SAP's refusal as it came (measured: `422`, `ExceptionUnprocessableEntity`). It no longer promises the program, screen or authorization object.
- **A wrapper installed together with its former base loaded two copies of `@mcp-abap-adt/lib`, and its tool calls were refused** ([#303](https://github.com/fr0ster/mcp-abap-adt/issues/303)). With 19.1.0, installing a wrapper and its base globally in one command (`npm install -g @mcp-abap-adt/core @mcp-abap-adt/compact`, likewise `http` with `http-ro`, `sse` with `compact-sse-ro`, …) put the base at the global root with its own `lib`: the server entered a request in one copy and the handlers read the other, so no request state was shared (measured for compact + core, http-ro + http, compact-sse-ro + sse), and a compact create was refused with `system_context_missing`. What made the second copy was one binary package depending on another; 19.2.0 has no such dependency. Measured with the packed release, every layout loads one copy and shares the request state: global, a wrapper with its base in one command or in two (either order); local, hoisted and `--install-strategy=nested`; a runtime at a later patch than the binary; an embedder's `compact-readonly-entries` with `lib`. **A second copy now stops the start**, before any parameter is read — `--version` and `--help` included — with exit `1` and one line on stderr: `Two copies of @mcp-abap-adt/lib are loaded in this process (<file>, <file>): reinstall <package> (npm install -g <package>).` (`lib` itself refuses nothing, so an embedder sees no change.) **If you installed a wrapper and its base in one command before 19.2.0,** update both to 19.2.0 — in one command (`npm install -g @mcp-abap-adt/core @mcp-abap-adt/compact`) or each on its own: measured, both layouts load one copy on 19.2.0.
- **The portable build builds again, and its smoke check checks what it exists to check** (`npm run portable:build`, `npm run portable:smoke`; [PORTABLE.md](docs/installation/PORTABLE.md)). With `@mcp-abap-adt/sap-rfc-lite` 0.2.3 and later the build stopped at `the RFC addon was not built`: the package installs a prebuilt binding under `prebuilds/<platform>-<arch>/` and compiles nothing, and the build looked only for a compiled `build/Release/sapnwrfc.node`. It now takes the binding the package's own loader resolves (a compiled one first, else the prebuilt), rewrites whatever library search path it carries to its own folder, and keeps `--build-from-source` for a compile against your SDK; no C++ toolchain is needed otherwise. Inside the executable sap-rfc-lite's run-time read of its own `package.json` failed, so no RFC call could load the stack; its version is now fixed at build time, as core's is. The smoke's MCP and RFC checks failed since 19.0.0, whose stdio logs on at its start: MCP `initialize` and `tools/list` now run in inspection-only mode (no destination, nothing connected; the compact server's count is no longer a fixed 25), and the RFC check reads the start against a host that does not resolve, which must stop at the RFC logon naming its key (`RFC_COMMUNICATION_FAILURE`) — a module or SDK that does not load reads `could not be connected at start: Error`. Measured on Linux x64 with the published 19.1.0 (`--version=19.1.0`; 19.2.0 is not on npm yet): both executables built from the prebuilt binding and every check passed; with the SDK library taken out of `nwrfcsdk/lib` the RFC check failed. Not run on Windows or macOS.

## [19.1.0] - 2026-10-21

### Changed

- **Package listings answer no descriptions unless asked: `include_descriptions` defaults to `false`** in `GetPackageContents`, `GetPackageTree` and compact `HandlerGet` part `contents`, which takes the parameter now ([#300](https://github.com/fr0ster/mcp-abap-adt/issues/300)). **`GetObjectInfo` takes `include_descriptions` too** (default `false`): its leaves carry a description only when `true`, on the batched path from each leaf's metadata as before; `enrich` (the search for each node's description and package) is unchanged. Whether to pay for the descriptions is the consumer's choice; by default the server answers the fastest listing. With `include_descriptions: true`, on a destination that serves ADT batch, each description is read from the object's metadata, one read per object, in one more envelope after the walk: measured on an on-premise system, about 23 s for a flat package of 2 033 objects whose walk alone takes about 1.5 s. Without a communication batch the node structures are asked with descriptions only when `true`. Migration: a consumer that relied on the descriptions — of package objects or of `GetObjectInfo`'s leaves — passes `include_descriptions: true`.

### Fixed

- **`include_descriptions: false` no longer reads object metadata on the batched path** of `GetPackageContents` and `GetPackageTree`: the metadata pass ran for descriptions the answer did not carry. Inside one envelope SAP answers almost every node structure part after the first with other parts' `DESCRIPTION` texts (measured: 2 023 of 2 033 objects of one package), so those parts' descriptions stay unused and the descriptions come from the metadata.

## [19.0.0] - 2026-10-21

The server split by transport and tool set into packages of their own — seventeen packages, twelve binaries — on the 6.0 auth chain (`auth-broker` 5, `auth-providers` 6, `auth-stores` 5) and the removal chain (`connection` 18, `interfaces-adt-connection` 3, `interfaces-adt` 20, `adt-clients` 36): the system type required, the low set gone, a logoff at every session end, no cancellation of a started tool. Migration: [`docs/MIGRATION-19.0.md`](docs/MIGRATION-19.0.md).

### BREAKING

- **A package per transport and tool set; the binary fixes both.** `@mcp-abap-adt/core` (`mcp-abap-adt`) serves stdio only; Streamable HTTP is `@mcp-abap-adt/http` (`mcp-abap-adt-http`), HTTP+SSE `@mcp-abap-adt/sse` (`mcp-abap-adt-sse`); the compact tool set is `@mcp-abap-adt/compact`, `compact-http` and `compact-sse`; the read-only sets are `@mcp-abap-adt/core-ro`, `http-ro`, `sse-ro`, `compact-ro`, `compact-http-ro` and `compact-sse-ro` (bins `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`, `-compact-ro`, `-compact-http-ro`, `-compact-sse-ro`). Publish order: `RELEASE.md`.
- **`--transport` is gone** (and `MCP_TRANSPORT`, YAML `transport`): any value stops every binary at start, naming the binary to run. **`--exposition` is gone** (either spelling, YAML `exposition`, compact's `ro` / `rw`): passing it stops the start with one sentence per word naming the package that serves what was asked. The debugger is no longer opt-in: every write binary serves it; the `-ro` binaries serve no debugger, no background run and no high tool.
- **Each binary reads only its own parameters**: another binary's option stops the start in its CLI and YAML forms, naming the binary that serves it; its environment variable is not read. Values are checked in every form (a bad port or flag is refused at start; TLS needs `--tls-cert` and `--tls-key` together). A config file that mixes `transport`, `mcp`, `http:` and `sse:` keys is refused by every binary.
- **The system type is required** (`--system-type`, `SAP_SYSTEM_TYPE`, YAML `system-type`: `onprem`, `cloud`, `legacy`): no default, never guessed from the credential (a `jwt` destination is no longer taken for cloud) or the URL. A stdio destination does not start without it, nor does a Streamable HTTP or SSE binary (exit `1` before anything listens). Inspection-only stdio needs none and filters no tool. `system_type_required` is new.
- **The low set is gone from `mcp-abap-adt`, `-http` and `-sse`** (112 tools, the `*Low` reads of the system group included): use the compact binary of the transport, which does what the low set did, a step at a time; the migration note maps every low tool to its compact call. `LowLevelHandlersGroup`, `HandlerExporter`'s `includeLowLevel` and the `'low'` handler set are gone from lib.
- **HTTP and SSE take credentials only from the `x-sap-*` headers** — of each request (Streamable HTTP), of the `GET` that opens each SSE connection (SSE). No destination, no broker, no store, no login over HTTP or SSE: `x-mcp-destination` is answered `400`, `--allow-destination-header` and the default destination are gone, and the `service-keys` / `sessions` mounts are not read.
- **stdio no longer serves `jwt` / `none`** (a token you hold): such a destination stops the start, with the hint to send the token in `x-sap-jwt-token` to `mcp-abap-adt-http` / `-sse`, or to create the session with `mcp-auth`. stdio serves `basic`, `snc` and `jwt` / `authorization_code`.
- **Only the chain's own session format is read** (auth-stores 5): a session record of an older format stops the start, naming the destination, with the `mcp-auth` command that regenerates it. Removing `SAP_ISSUED_*` is no longer a remedy.
- **stdio connects at its start**, before the MCP transport opens — the startup check builds the credential, the interactive login happens then, the system information is asked — and any start failure ends the process with exit `1`. A shutdown during the start exits `1`.
- **The responsible person, the user and the system** are asked of the system (`systeminformation`) once per destination, when its connection is created, on-premise and on ABAP Cloud alike, and the system's answer wins over anything configured. On-premise, when the system gives no information, the responsible if stated, else the login, else `system_user_unknown`; on ABAP Cloud no information is an error (`cloud_without_systeminformation` for a `404`, else `system_lookup_failed`). A `401` is answered as it came. These rules are `@mcp-abap-adt/responsible-rules`, which the servers pass; **lib applies none**: an embedder looks nothing up and requires no system kind unless it passes the resolver and the rules.
- **A tool call cannot be cancelled.** A client's cancel aborts nothing: the call runs to its end, its tool once. **The client's close (stdio's stdin, an SSE stream) and the process shutdown log off every ADT session at once** and interrupt the running tools — nothing waits for a running tool, no state undo is sent — then exit; 18.x waited up to 30 s. Over Streamable HTTP a dropped request closes nothing: the instance ends after its work, or at its state's stop or the idle bound. A crash outside a tool runs the forced close too.
- **An instance's calls on its connection run one at a time**, and **only `LOCK` and `UNLOCK` are sent stateful**: writes under a lock and activation go stateless. The `session_id` / `session_state` parameters and `GetSession` are gone; `HandlerLock` answers no `session_id`.
- **A tool's failure is the method's error as it is, plus the step** where it arose; a method's own throw is `client_threw`, never SAP's answer; a SAP refusal is no longer turned into an empty result, `null` or "not found"; tools reading several items carry each item's failure, and a `401` ends the whole call.
- **No deadline of the server's or the libraries'**: `SAP_TIMEOUT_*` are not read; no login timeout (it was 30 s; `--login-timeout` is the opt-in bound) and no shutdown deadline (`--shutdown-timeout`, no default).
- `RuntimeRunClassWithProfiling` and `RuntimeRunProgramWithProfiling` are deleted: `RuntimeRunClass` / `RuntimeRunProgram` with `profile: true`. `ResumeLeftoverSession` does not exist: a stdio process takes up its destination's one leftover session at its start.
- `@mcp-abap-adt/compact-readonly` is renamed `@mcp-abap-adt/compact-readonly-entries` (the same exports).
- **Docker: one image per binary** (`docker/Dockerfile`, build argument `VARIANT`, context `docker/`); the 18.x image (`--allow-destination-header` over HTTP) is gone. Destinations are served by a stdio image only; every image needs the system type; compose publishes the listener ports on the host's loopback only.
- **Embedders**: lib's chain takes no request signal (`IAbapRequestOptions.signal`, `IAdtClientOptions.signal`, `ADT_REQUEST_ABORTED` and `IAdtError.refusal` are gone); `AbapConnection` answers `unknown` by default; on an injected connection an operation that needs an ABAP session of its own takes it only from `freshConnection` (called with no argument), and is refused without it; `ConnectionContext` replaces the destinations argument; `AuthBrokerFactory`, `IDestinations` and the destination layer moved to `@mcp-abap-adt/core/auth`; `StreamableHttpServer` and `SseServer` moved to `@mcp-abap-adt/http` / `@mcp-abap-adt/sse`; `ServerConfigManager`, `ArgumentsParser`, `showHelp` and the transport parsing left lib; `makeAdtRequestWithTimeout`, `getTimeout`, `getTimeoutConfig`, `restoreSessionInConnection`, `describeAuthError` and `maskSensitiveValue` are gone. The note lists every change of the public surface.

### Added

- **Tool search texts beside each description** (#270, #271): every tool of every set carries `keywords` (for lexical search, BM25: the terms, synonyms and object kinds users ask with) and `semantic` (for vector search: what a user wants when the tool is the answer), from one table, `tools/tool-search.json`, shipped and bundled. `tools/list` carries them on each tool as `_meta["mcp-abap-adt/search"]`; lib exports them as `@mcp-abap-adt/lib/tool-search` (`toolSearchText(name)`, `toolSearchTexts()`). A client that knows none of it reads `description` as before. Two labelled query sets, for a reader and a developer, are run by BM25 over name, parameters and keywords in every test run, and by vectors over `semantic` through a local Ollama where one answers: the tuning set (the #270 and #271 cases among them) finds every required tool within the top 10 read and top 5 write tools — a regression guard on those queries —, and the held-out set, never used to tune the texts, gets no worse than its recorded baseline. See [`docs/user-guide/TOOL_SEARCH.md`](docs/user-guide/TOOL_SEARCH.md).
- **`@mcp-abap-adt/lib/adt-headers`**: the server's ADT request-header machinery for embedders that call adt-clients members themselves — `DEFAULT_ADT_HEADERS` (the starting pair per operation, with `AdtOperation` / `adtOperation`), `AdtHeaderPairs` / `AdtHeaderPort` (the pairs a system named in a `406` / `415`, kept per system and operation), `adtSystemKey` (the system key the server uses) and `withAdtHeaders` (a call with the system's pair, sent once more with the type SAP named). A `406` with T100 `SADT_RESOURCE` 037 names nothing and is not corrected. See [`docs/architecture/REQUEST_HEADERS.md`](docs/architecture/REQUEST_HEADERS.md).
- **Background runs**: `background: true` on `RuntimeRunClass`, `RuntimeRunProgram` and compact `HandlerProfileRun` — the run goes on an ABAP session of its own and the call answers a `run_handle` at once; `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun` (compact `HandlerBackgroundRun*`). Kept by `@mcp-abap-adt/background-runs-memory` (new), 16 per caller, in the process's memory; an embedder passes an `IBackgroundRuns` of its own.
- **Leftover SAP sessions (stdio)**: a runtime file per HTTP session the server holds, deleted only once its logoff completed — written, and its `flushGoodbye()` settled (SAP answered it or its connection failed), never on the write alone; `LogoffLeftoverSession` deletes its file the same way — so a process killed from outside, or one the forced close ended before its logoffs were answered, leaves a record: the next start takes up the destination's one leftover session, and `ListLeftoverSessions` / `LogoffLeftoverSession` (compact `HandlerLeftoverSession*`) list and log off the rest, sending nothing to SAP to learn who calls. The files are bearer secrets (owner-only on Linux and macOS).
- **A `timeout` on the approved long reads** (`GetWhereUsed`, `SearchObject`, `SearchSource`, `GetPackageContents`, … — the list in the note; compact `HandlerWhereUsed`, `HandlerSearch`, …): seconds, no default; each runs stateless on an ABAP session of its own, logged off when it ends; when the `timeout` passes its session is logged off and the call answers `timed_out: true`.
- `UpdatePackage` and `DeletePackage` (high) for what `UpdatePackageLow` / `DeletePackageLow` did; `DeletePackage` asks the deletion check first.
- Compact as the low set's analogue: `HandlerUpdate` under a `lock_handle`, `HandlerLock` / `HandlerUnlock` for `BEHAVIOR_IMPLEMENTATION`, package create / update / delete / check, `HandlerValidate` and `HandlerCheckRun` for packages and function modules, `source_code` to check unsaved source, the creation parameters of a class (`superclass`, `final`, `create_protected`), `HandlerGet`'s `object_structure`, `node_structure` and `virtual_folders` parts; `HandlerTransportSortAndCompress`, `HandlerTransportMoveObjects` and `HandlerGet` of a `TRANSPORT`; `HandlerDeletionCheck` (`object_type`, `object_name`), the one deletion-check request, SAP's verdict as it came (29 compact tools, 17 that change nothing).
- `--renewal=refresh-then-login|refresh-only`, `--browser` mapped by the platform (`system`, `auto`, `chrome`, `edge`, `firefox`, `none`, `headless`) and `--browser-program`, `--login-timeout`, `--shutdown-timeout`, `--auth-debug` (stdio, command line or YAML only).
- `@mcp-abap-adt/responsible-rules` (new): the servers' rules for the responsible, the user and the system, and the system type row.
- **RFC through a message server and a logon group** (stdio): `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`, `SAP_SAPROUTER` — also `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter` and YAML `mshost`, `msserv`, `sysid`, `group`, `saprouter`, with `--connection-type`'s precedence (the `--env` / `--env-path` `.env` joins the environment) — reach connection 18's `SapConfig` as configured. The server adds no default (`group`'s `PUBLIC` is connection's) and checks nothing: `mshost` with neither `msserv` nor `sysid` is connection's refusal, naming both, as it came (a stdio start stops with its words). With `mshost` no RFC host or system number comes from the URL and `SAP_SYSNR` is not read. lib's `getConfig()` reads the five from the environment; the HTTP and SSE binaries refuse their CLI and YAML forms like every destination option. Implemented and unit-tested, not yet measured on a live system (as of 2026-10-20).
- Twelve MCP Registry entries, one per server package.
- Compact `HandlerProfileSchedule`: one `POST /sap/bc/adt/runtime/traces/abaptraces/parameters` with the profiling flags (all optional), answering `{ success, profiler_id }`; a `2xx` without a `Location` header is a failure with `step: "schedule trace"`. Recorded in batch mode.
- **Batch mode**, in every binary (the `-ro` ones included) on every transport: `BatchBegin`, `BatchEnd`, `BatchAnswers` (compact: `HandlerBatch` with `action: 'begin' | 'end' | 'answers'`). While a batch is open each call none of whose requests depends on another's answer is recorded instead of sent, answers nothing and takes the next number (from 1, in the order made; one number per call, whatever it put into the batch); every other call is refused (`batch_not_recordable`, `batch_no_timeout`) and takes no number. A batch holds one kind of request — LOCK, UNLOCK or stateless, as its first recorded call decides — and a call of another kind is refused `batch_other_kind` ("<tool> is a <kind> request; this batch holds <kind> requests — record it in the next batch"), no number: each phase (create, lock, write, unlock, read back, activate; a unit-test run's start, status, result; a trace's schedule, then the run under it) is its own batch. `BatchEnd` (and `HandlerBatch` `end`) sends the recorded calls in one ADT batch envelope on the instance's connection with the credential in force then, holds that connection for the whole send, leaves batch mode whatever happens, splits SAP's answer by number into the map and answers `{ recorded, sent, received }` — or its own error, with no map: the envelope's failure as it came, `batch_parts_mismatch` ("<received> of <sent> parts came; the answers cannot be matched to the calls") or `batch_unsplit` ("the envelope's answer could not be split into the calls' parts"), every number of the batch then answering that error; nothing is retried or sent twice (a part answered `401`, `406` or `415` is that call's answer). `BatchAnswers` (`number` or `numbers`) reads the map by number: a number's answer — the answer the tool gives outside batch mode for what SAP answered — is built by its handler when the number is first read (the numbers of one call in parallel) and kept, until the next `BatchEnd` replaces the map; a request the handler would send then is refused `batch_ended`. Only LOCK and UNLOCK go stateful, as adt-clients sends them. `BatchBegin` answers the instance's `state_handle`; over Streamable HTTP it travels in the `x-mcp-state-handle` request header on every call of the batch (the header first, else a `tools/call`'s `state_handle` argument, as the debugger tools send it). Which calls are recorded is `tools/batch-handlers.json` (170 entries, listed in [`docs/user-guide/BATCH_MODE.md`](docs/user-guide/BATCH_MODE.md)), and every tool's description ends with one sentence saying how it behaves in batch mode: recordable, recordable for the arguments it names, or run outside batch mode. `--batch-keep-raw-parts` (`MCP_BATCH_KEEP_RAW_PARTS`, YAML `batch.keepRawParts`, default off) keeps SAP's raw parts beside each answer. The instance's end (its client's close, the pool letting it go, the process shutdown) or the held state's idle bound drops an open batch: nothing recorded is sent, the map goes with it. An embedder gives each instance its owner (`batch: new InstanceBatch({ keepRawParts })`); without one the batch tools answer `batch_mode_unavailable`. New refusals: `batch_mode_unavailable`, `batch_mode_on`, `batch_mode_other`, `batch_mode_off`, `batch_not_recordable`, `batch_other_kind`, `batch_no_timeout`, `batch_ended`, `batch_parts_mismatch`, `batch_unsplit`.
- **The debugger batch** (full set `DebugBatchBegin`, `DebugBatchEnd`; compact `HandlerDebugBatch` with `action: 'begin' | 'end' | 'answers'`; no `-ro` binary): at an ABAP stop, step, step to line, stack, variables, child variables, stack position and setting a variable are recorded — one request each, a full-set step with no stack read after it — and the end sends them in one debugger batch envelope on the stop's connection, splits the answer into the map (its numbers read with `BatchAnswers` or `HandlerDebugBatch` `answers`, each built when read), ends the batch whatever happens and answers `{ recorded, sent, received }` or its own error, as `BatchEnd`; the debug session's stop and view stay as they were. At an AMDP break the same batch records step over, continue and the data preview of a table variable — full set `AmdpDebugStep`, `AmdpDebugGetTable`; compact `HandlerDebugStep` / `HandlerDebugMaintain` of `kind: 'amdp'` — and the end sends them on the AMDP session's command connection; begin works on the ABAP stop when one is held, else on the AMDP break, and a batch records at its own stop only. Every other tool is refused while it is open. Begin needs an ABAP stop or an AMDP break; one batch of either kind at a time (`batch_mode_on`, `batch_mode_other`). See [`docs/user-guide/DEBUGGER.md`](docs/user-guide/DEBUGGER.md).

### Changed

- **`BatchEnd` (and `DebugBatchEnd`, `HandlerBatch` / `HandlerDebugBatch` `end`) only sends, receives and splits; a number's answer is built when it is read.** `BatchEnd` answers `{ recorded, sent, received }` or its own error — the envelope's failure as it came, `batch_parts_mismatch`, `batch_unsplit` — and with its error there is no map: every number of that batch read answers the same error, a credential refusal and a failure before the envelope included. `BatchAnswers` resumes each asked number's handler with its parts, the numbers of one call in parallel, and keeps the answer, so a handler runs once; a handler never read is awaited by nothing and goes with its map. Over Streamable HTTP a `HandlerLock` read by number is held by the instance only while the SAP session its envelope went out on is still the instance's; a lock never read, or one of a lock batch whose `BatchEnd` failed, stays in SAP until that session's logoff, and an unlock never read leaves its handle in the instance's held locks after SAP unlocked it (a later write under it is sent and SAP refuses it; over Streamable HTTP the pooled instance stays held until it ends) — read every lock number and every unlock number before the next phase's `BatchEnd`.
- Tool descriptions state only what each tool does, its parameters and its result, in every set (full, `-ro`, compact, batch, debugger); the sentence appended for batch mode is one of "Recordable: …", "When …, recordable: …" or "Runs outside batch mode.", and `descriptionsFunctional.test.ts` holds every served description to the rule.
- **Tool descriptions name the function on what the parameters name** (#270, #271): "Reads the CDS view (or classic DDL view) named by ddl_name …", "Lists where the object named by object_name and object_type is used — a class, …, function module (BAPI included), … CDS DDL source …", "Removes the entry of the object named by object_name and object_type from the transport task named by transport_number …"; `RuntimeListFeeds` leads with the short dumps of a program, a user and a time range; the unit-test writers lead with the carrier and its ABAP Unit test classes. `[read-only]` means the tool changes no repository object (source, metadata, transports), as in the `-ro` binaries. Every such tool carries it (every `Get<Type>`, the `Check<Type>` syntax checks, the ATC status and findings, the local includes, compact's reads; the runtime reads, the background-run and leftover-session lists beside their `[runtime]` or `[session]`, every debugger tool beside its `[debug]`, the runs of code and tests (`RuntimeRunClass`, `RuntimeRunProgram`, `Run…UnitTest`, `RunATC`, compact's `HandlerUnitTestRun` and `HandlerProfileRun`), the trace scheduling, the background-run discard, the leftover-session logoff and the batch tools; only a tool that creates, updates, deletes, activates, locks, unlocks or edits a transport lacks it; `GetPackageTree` was `[high-level]`), no description names another tool (the `Activate<Type>`, version, transport, ATC, message-class and background-run tools did), and no first sentence is built around "an ABAP object". `descriptionsFunctional.test.ts` now also refuses another tool's name, a tool that changes no repository object, or a debugger tool, without `[read-only]`, a first sentence two tools of a set share, and a vague subject in it.
- The auth chain: `@mcp-abap-adt/auth-broker` `^5.0.6`, `@mcp-abap-adt/auth-providers` `^6.0.2`, `@mcp-abap-adt/auth-stores` `^5.0.1`, `@mcp-abap-adt/auth-errors` `^2.2.1`, `@mcp-abap-adt/interfaces-auth` `^7.5.0`, `@mcp-abap-adt/interfaces-auth-sap` `^3.4.0`; only core depends on the broker and the stores. The ADT chain: `@mcp-abap-adt/connection` `^18.0.1`, `@mcp-abap-adt/interfaces-adt-connection` `^3.0.0`, `@mcp-abap-adt/interfaces-adt` `^20.0.0` (root and `compact-modify`), `@mcp-abap-adt/adt-clients` `^36.0.2`, `@mcp-abap-adt/adt-strategies` `^0.13.0`. adt-clients 32's two new result slots of the class, program, function group and include sets, `enhancementElements` and `enhancementOptions`, are read `verbatim`.
- `@mcp-abap-adt/adt-clients` `^36.0.2` (a credential refusal rethrown by every member; a batch corrects and resends nothing; an envelope that fails as a whole rejects every part with its one error, whose `request` is the envelope's own; the `Accept` and `Content-Type` of 32 members — create, update, delete, check, activate, the deletion check, the where-used, node structure and virtual folder reads, the data previews, the transport actions, the debugger's requests, the trace scheduling, abapGit's link and pull — are the caller's `options.headers`, and no request is negotiated, corrected or remembered; `extractSupportedAccept` / `extractSupportedContentType` read the types a `406` / `415` names — only SAP's list after `Accepted content types:` / `Supported Media Types:`, never the refusal's own `content-type`; since 36.0.2 three requests SAP refused are fixed, measured on premise: the enhancement's `check` sends the `chkrun:checkObjectList` document under Accept `application/vnd.sap.adt.checkmessages+xml`, Content-Type `application/vnd.sap.adt.checkobjects+xml` — `application/vnd.sap.adt.checkrun.v1+xml` as both was refused `415`, and the server's default pair for it is the new one —, the feature toggle's `validate` sends Accept `application/vnd.sap.as+xml`, and the application log's `getObject` / `getSource` send Accept `application/vnd.sap.adt.blues.v1+xml` / `application/json`, where `application/xml` was refused `406`), `@mcp-abap-adt/connection` `^18.0.1` (a session SAP replaced logs off the session that replaced it before its cookies are dropped), `@mcp-abap-adt/sap-rfc-lite` `^0.2.3` (prebuilds for Linux glibc and win32-x64), `@mcp-abap-adt/interfaces-auth-sap` `^3.4.0`.
- A tool call that fails on authentication answers JSON (`authentication_failed`, `destination_refused` or one of the server's own refusals); no error's message reaches an answer or a log line, and the startup summary shows a secret by its presence only.
- A failed write to the `--env` / `--env-path` file fails the request; a named destination's failed write logs one stderr line whatever `DEBUG_AUTH_LOG` says.
- A function group create that SAP refuses `400` "Interface SAPL… has not been created" reads the group back and answers done when it is there (`CreateFunctionGroup`; compact `HandlerCreate` answers the `400` as it came — read the group with `HandlerGet` part `metadata`).
- **Breaking for compact: `HandlerCreate` is one request** — the `POST` of the type's adt-clients `create()` alone, for every type; no flag, no mode. It no longer validates, locks, writes, checks or activates, sends no service-group read for a service binding and no read-back after a function group's `400`; the object is created inactive with what the create carries. Chain the rest as calls of their own: `HandlerLock`, `HandlerUpdate` with the `lock_handle`, `HandlerUnlock`, `HandlerActivate`. The schema lists only what some type's create sends: `activate`, `fields`, `source_code`, `fixed_values` and the other domain properties, `test_class_source`, `cds_view_name`, a class's `abstract`, a behavior definition's `root_entity` and a behavior implementation's `behavior_definition` are gone from it — their content goes in through `HandlerUpdate` under a lock, the activation through `HandlerActivate`; the schema now names the transport's `transport_type`, `target_system`, `owner` and the binding's `service_name`, `service_version`, `binding_variant`, which the create sends. `UNIT_TEST` and `CDS_UNIT_TEST`, whose create is a chain, are refused before sending: "HandlerCreate does not create <type>: its create is a chain of requests, not one — use CreateUnitTest / CreateCdsUnitTest of the full set". Recorded in batch mode for every other type (a `PACKAGE` over HTTP only). The full sets' `Create<Type>` are unchanged.
- **Breaking for compact: `HandlerUpdate` is one request under the caller's `lock_handle`**, now required — the type's write alone: the `PUT` of the source, of the class include or of the metadata document, and for `SERVICE_BINDING` its publication request; no lock or unlock, check, activation, read before or after the write. PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP take the whole metadata document in `source_code` and send it as given (read it with `HandlerGet` part `metadata`). `activate`, `properties`, `super_package`, `description`, the domain properties (`datatype`, `length`, `decimals`, `conversion_exit`, `lowercase`, `sign_exists`, `value_table`, `fixed_values`) and `behavior_definition` leave its schema; `service_version` joins it. Chain the rest as calls of their own: `HandlerLock`, `HandlerUpdate`, `HandlerUnlock`, `HandlerActivate`. `HandlerLock` and `HandlerUnlock` take `SERVICE_DEFINITION` and `SERVICE_BINDING`; a binding open in an editing session (its LOCK's `403`) is a lock with an empty `lock_handle`, under which `HandlerUpdate` SERVICE_BINDING sends the publication. Over Streamable HTTP `HandlerLock` holds the lock as the pooled instance's state and answers its `state_handle`; `HandlerUpdate` and `HandlerUnlock` are refused, sending nothing, under a lock the instance they reach does not hold, and a request on the handle works on the instance's held connection with its own credential — a renewed token or a new basic pair is the same user, in the same SAP session, the locks kept; the connection is replaced only when SAP ended its session. Recorded in batch mode for every type (a `PACKAGE` over HTTP only). The full sets' `Update<Type>` are unchanged.
- **Breaking for compact: `HandlerDelete` is one request** — the deletion request alone, as adt-clients' `delete()` sends it, for every type it removes: no lock (a lock held on the object is what makes ADT refuse its deletion) and no deletion check, which is `HandlerDeletionCheck` now; the answer is SAP's, as it came. The class includes `LOCAL_TEST_CLASS`, `LOCAL_TYPES`, `LOCAL_DEFINITIONS`, `LOCAL_MACROS` and `UNIT_TEST` (a `DELETE` on an include answers `405`, measured on premise) are written empty by one `PUT` under the caller's `lock_handle`, the class's lock (`HandlerLock` `object_type: CLASS`; over Streamable HTTP with its `state_handle`), with no lock or unlock of their own and no activation. `CDS_UNIT_TEST` deletes its test class. `force_new_connection` leaves its schema (compact locks and writes a package in an ABAP session of its own, so the call's session holds no saved package); `lock_handle` joins it. Chain the rest as calls of their own: `HandlerDeletionCheck`, then `HandlerDelete`; for an include `HandlerLock`, `HandlerDelete`, `HandlerUnlock`, `HandlerActivate`. Recorded in batch mode for every type (an include with its `lock_handle`), and `HandlerDeletionCheck` too. The full sets' `Delete<Type>` are unchanged.
- **Breaking for compact: `HandlerGet` is one request per part** — `part: source` (the default) the source alone, `part: metadata` the metadata document alone, each answered `{ part: "source", source }` / `{ part: "metadata", metadata }` beside the object's name, the class includes too (`GetLocalTestClass`, `GetLocalTypes`, `GetLocalDefinitions`, `GetLocalMacros` of the full binaries answer the same shape; their `test_class_code`, `local_types_code`, `definitions_code`, `macros_code` keys are gone). PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP have no source: `part: source`, and a call with no `part`, is refused before anything is sent, naming the type's parts — read them with `part: metadata`. A FUNCTION_MODULE is read at the group its arguments name: `function_module_name` as `GROUP|MODULE`, or with `function_group_name`; two groups, none, or more than one `|` are refused before sending. `node_structure` of a package (`DEVC/K`) is one request: SAP's blank body (an empty package and a package that does not exist answer alike) is the empty listing with `blank` stating both readings — `HandlerGet` `part: metadata` of the package tells them apart; 18.x read the package itself. `urls` and `contents` are unchanged. Batch mode records `node_structure` of a package too, and no longer lists `source` for the four types without one.
- **Breaking for compact: `HandlerActivate` starts a run and answers its id; `HandlerGet` reads the run.** One object of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION or METADATA_EXTENSION is activated as before, one request answering the verdict. Such an object is named by `object_type`, by its ADT code in `object_adt_type`, or as a one-entry `objects[]`. Every other call — `objects[]` of several objects or of a type the per-object activation does not map (a function module at its group), an `object_adt_type` of such a code, PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING — is the one `POST /sap/bc/adt/activation/runs`, answered `{ run_id }`: the run was accepted and has no verdict yet; a start SAP answers without a run id (no `Location`) is a failure with `step: "start activation run"`, and nothing more is sent. 18.x then polled the run and read its results, answering `accepted`, `run_status`, `activated` and `messages` — up to six long-polling status reads a second apart, as read from 18.x's code, not measured. `HandlerGet` gains `part: activation_status` (`GET /sap/bc/adt/activation/runs/{run_id}`, answered `{ run_id, part, status, document }`) and `part: activation_results` (`GET /sap/bc/adt/activation/results/{run_id}`, answered `{ run_id, part, messages, document }`), by `run_id`, one request each, SAP's document as it came, on the instance's session and with no `timeout` (refused, like `UNIT_TEST`'s); how often to ask is the caller's. All three are recorded in batch mode. The full sets' `ActivateObjects` is unchanged.
- **Breaking for compact: `HandlerProfileRun` is one run request, under a `profiler_id` or plain.** With `profiler_id` it sends the one `POST /sap/bc/adt/oo/classrun/{name}?profilerId=…` (a program: `/sap/bc/adt/programs/programrun/{name}?profilerId=…`) and answers `{ success, class_name | program_name, output, profile: { profiler_id } }`; without it, the one plain run request, answered without `profile`; an empty `profiler_id` is refused before any request; a failure is the method's error with `step: "run with profiler"` (plain: `"run class"` / `"run program"`). `profiling` and the profiling flags (now `HandlerProfileSchedule`'s) are gone from it, and `trace_id` from its answer. 18.x scheduled the trace and ran under it inside the call, and for a class read the trace feed before and searched it after — up to five reads, 2 s apart, as read from 18.x's code, not measured. The caller schedules (`HandlerProfileSchedule`), runs, and finds the trace with `HandlerProfileList`; see MIGRATION-19.0. Recorded in batch mode.
- **Breaking for compact: a unit-test run's result is read once.** `HandlerUnitTestResult`, `HandlerCdsUnitTestResult` and `HandlerGet` with `object_type: UNIT_TEST` / `CDS_UNIT_TEST` send the one `GET /sap/bc/adt/abapunit/results/{run_id}` and answer `{ success, run_id, run_result }`, the result document SAP answered, parsed (`detail: "raw"`: the document) — whatever SAP answers, a run that has not finished included; a finished run's result carries `executionTime` on each test method; a failure is the method's error with `step: "read unit test result"` (CDS: `"read CDS unit test result"`). Their descriptions say so: "Valid once the status is FINISHED; a finished run's result carries executionTime." 18.x read the status first inside the call — up to five long-polling status reads, back to back, the result only once one said `FINISHED`, as read from 18.x's code, not measured — and answered `finished` (with `run_status` and a `message` when the run had not finished; `HandlerGet` also `run_status` when it had); `finished`, `message` and `HandlerGet`'s `run_status` are gone. The status is the caller's to read, as often as it chooses: `HandlerUnitTestStatus` / `HandlerCdsUnitTestStatus`, one status read, with long polling by default as before. All three are recorded in batch mode; `HandlerGet` with `UNIT_TEST` / `CDS_UNIT_TEST` still takes no `timeout` and runs on the instance's session. The full sets' `GetUnitTestResult`, `GetCdsUnitTestResult`, `GetUnitTest` and `GetCdsUnitTest` are unchanged.
- **Breaking for compact: `HandlerDumpList` reads one page.** It sends the one `GET /sap/bc/adt/runtime/dumps` (`feed_type` `system_messages` / `gateway_errors`: their feeds) with `$top` = `top` (1 to 100; `top` 101 is refused before any request, naming the cap) and `to`, and answers `{ success, feed_type, count, entries, next_to }`, `next_to` the `to` of SAP's next link as it came. A failure is the method's error with `step: "read dumps"` (`"read system messages"`, `"read gateway errors"`). The description says: "The next link's page starts at the boundary second, inclusive: entries of that second may repeat; match them by dump_id." (measured: the feed answers 100 at most, the next page starts at the boundary second and answered 11 entries for `$top` 10). 18.x took a `top` up to 1000 and read the pages inside the call, as read from 18.x's code, not measured; `incomplete_second` is gone. The consumer follows `next_to` as `to` and matches by `dump_id`. Recorded in batch mode. The full set's `RuntimeListFeeds` still reads the pages inside the call.
- **Breaking for compact: the compact debugger is four tools, one request per call.** `HandlerDebugBreakpoints` (ABAP `setBreakpoints`, `syncBreakpoints`, `deleteBreakpoint`, `createWatchpoint`, `listWatchpoints`, `deleteWatchpoint`; AMDP `syncBreakpoints`), `HandlerDebugSession` (ABAP `checkListener`, `listen` for exactly the caller's `hold_seconds`, `stopListener`, `attach`, `detachDebugger` — sent with no debuggee id on the attaching session, which releases the debuggee (measured 2026-10-17: with an id SAP answers `200` and releases nothing) —, `terminateDebuggee`, `terminateDebugger`, `setDebuggerSettings`; AMDP `start`, `getEvents`, `stop`, `deleteDebuggee`), `HandlerDebugStep` (ABAP `stepInto`, `stepOver`, `stepReturn`, `stepContinue`, `stepRunToLine` / `stepJumpToLine` with the line's address, now required, `setStackPosition`; AMDP `stepOver`, `stepContinue`) and `HandlerDebugMaintain` (ABAP `getStack`, `getVariables`, `getChildVariables`, `getMemorySizes`, `createMemorySnapshot`, `setVariableValue`; AMDP `getDataPreview`): `kind` and `operation` pick the one `AbapDebugger` / `AmdpDebugger` method each call sends; a failure is the method's error with the operation's step. `HandlerDebugStart`, `HandlerDebugWait` and `HandlerDebugView` are gone, and `HandlerDebugStep`'s `action` with them. No listener polls in the background, no catch is attached for the caller, a step reads no stack (the step answer carries no position, measured 2026-10-17: read it with `getStack`), and only `HandlerDebugSession` `end` logs off: it takes the `state_handle`, logs off each connection the debug state opened and sends nothing else (measured 2026-10-17: an attached debuggee runs on, the AMDP debug session ends, the user's breakpoints stay set until removed with `deleteBreakpoint` or `stopListener`), and the state and its handle end with it, so a debug state of either kind and any identity can open after it. The full set's debugger tools are unchanged. Migration: one row per old tool.
- **Breaking for the full binaries: one `Get<Type>` per type, with `part`; the `Read<Type>` tools are gone.** A type with a source (class, interface, program, table, structure, DDL, service definition, service binding, behavior definition and implementation, metadata extension, function module, function include) is read by `Get<Type>` with `part: "source" | "metadata"` (default `"source"`): one ADT request per call, the answer carrying only the part asked for, in one shape for every type: `{ part: "source", source }` or `{ part: "metadata", metadata }` beside the name fields (the per-type keys `source_code`, `<type>_data`, `payload`, `package`, `message_class`, `message` are gone; compact `HandlerGet` answers the same). The metadata-only types (domain, data element, function group, package, message class and its message) keep `Get<Type>` without `part` and answer `{ part: "metadata", metadata }`. `GetFunctionModule` reads at the `function_group_name` given, one request (it no longer reads the metadata first to check the group); `GetProgram` reads any program (`ReadProgram`'s `invalid_object_type` refusal is gone); `ReadFunctionInclude` is `GetFunctionInclude`. The `-ro` binaries serve the `Get<Type>` tools, the same tools as `mcp-abap-adt`. Every `Get<Type>` call, both parts, and compact `HandlerGet` `part: source | metadata` of a `FUNCTION_MODULE`, is recorded in batch mode. `ReadVsGetDedupStrategy` is gone; `EmbeddableMcpServer`'s `readOnlyDedupStrategy` defaults to `NoDedupStrategy`. Compact `HandlerGet` `part: metadata` reads the metadata document alone, one request. The note maps every removed `Read<Type>`.
- `DeletePackage` with `force_new_connection` no longer falls back to the current session.
- **The enhancement reads go through adt-clients 32** (`EnhancementType` `enhoxhb | enhoxhh | enhsxsb`, SAP's codes `ENHO/XHB`, `ENHO/XHH`, `ENHS/XSB`, each subtype its own media type). `GetEnhancements` reads a host's elements with `readEnhancementElements` on the class, program, function group or include (an include's read names its main program, from its `contextRef` or `program`; a function group's `SAPL<fg>`), no longer a request of its own. `GetEnhancementSpot` reads with `getEnhancement().readMetadata` under `enhsxsb`'s own `application/vnd.sap.adt.enh.enhs.v2+xml` — the shared `application/vnd.sap.adt.enhancements.v1+xml` it sent answered `406` (measured by adt-clients 32). `GetEnhancementImpl` reads a source code plugin with `getEnhancement().read` (`enhancement_spot: "enhoxhh"`, Accept `text/plain`) and answers `not_found` when SAP answers no source; a BAdI spot (`enhsxsb`) is refused before any request, like a BAdI implementation, and a collection name that is none of these is refused without a request, after the repository search names what the object is when it can. A failed read is the method's error as it is with its step (`read enhancements`, `read enhancement spot`, `read enhancement source`); a `401` ends the call as it came, with no search.
- **Since `@mcp-abap-adt/adt-clients` 33, a credential refused before SAP was asked rejects.** Every member now rejects with connection's `AuthRefusedError` as it came, where it answered `ok: false` with the refusal's words (a credential SAP refused is a failure carrying SAP's `401`). The server ends the call with it as `authentication_failed` wherever it read many objects or held a lock: nothing after it is requested — not the next include of `GetEnhancements` (nor an empty includes list for a refused walk), not the next `SearchSource` object, not the activation after a write's best-effort wait or its unlock; a locked write still tries its unlock, and a credential failure on the write, the unlock or the activation is the answer itself, never a `cleanup` entry or the held-lock wrapper. `GetServiceBindingPreviewUrl` ends on it in its system lookup instead of reporting the lookup failed and reading on.
- **Every catchable end runs the orderly shutdown.** Besides `SIGTERM` and `SIGINT`: `SIGHUP` (the terminal closed, an SSH session dropped; on Windows the console closed), `SIGQUIT`, on Windows `SIGBREAK`; on stdio a broken pipe (`EPIPE`) on stdin or stdout, taken as the client's end of input (exit `0`); an emptied event loop (`beforeExit`). A crash outside a tool (an uncaught exception, an unhandled rejection) now runs the orderly shutdown too — every logoff let finish — and exits `1` (it ran the forced close before); a crash during a shutdown lets it finish. A second signal and `--shutdown-timeout` still force the end. `SIGKILL`, a crash of the runtime and a power loss cannot be handled: their sessions live until SAP's security-session timeout.
- **The orderly end lets every logoff finish.** The process's shutdown (stdio's end of input, a signal), a stdio start that fails after its logon (its exit `1`, and a launch that rejects, which the binary's exit follows) and an instance's terminal close (the HTTP pool's eviction, an SSE close) follow every logoff written — at the end and by any site before — until SAP answered it or its transport failed (`flushGoodbye()`, no timer, the answer not read) before they resolve: SAP ends a security session and its user sessions only once it has received the logoff whole (measured 2026-10-19: logoffs sent right before the process ended left the sessions in SM05 until their timeout). The forced close still stops at the writes, so its sessions keep their runtime files, listed by `ListLeftoverSessions` of the next stdio process.
- **A debug stop deletes the breakpoints before it lets a held debuggee run on, and a debugger's run goes on a stateless session.** The ABAP stop sends the listener's stop — which deletes the breakpoints — first, then releases a held debuggee and any release an earlier stop left owed, so a continue from a breakpoint inside a loop runs to the end instead of stopping there again. When the listener's stop fails and a breakpoint's delete by id fails too, no held debuggee is released: each stays held for the next stop, a failure with its step (`release the debuggee`, `release <what>`) in fixed words. While a debuggee stays held (or owed a release, ABAP and AMDP alike), the run's connection stays open with it — its logoff would end the session held at the breakpoint — and the stop that releases the debuggee closes it after the release; the instance's close and the process's shutdown log it off whatever is held. The program run of `DebugStartListener` / `AmdpDebugStart` opens a stateless connection (measured 2026-10-17: a run on a stateless connection is caught and held as on a stateful one); the listener, the attach, the breakpoints' connection and the AMDP events and commands connections stay stateful, each request on them in its one ABAP session, each logged off by its own `SAP_SESSIONID`.
- **Streamable HTTP: a tool call with an unknown or ended state handle is answered by the pool.** `state is not available`, the same answer for every such handle, before any instance is made — no logon, no system-information read (measured 2026-10-19: such a call made a new instance that logged on and off). A JSON-RPC array holding a tool call with such a handle is answered the same, one answer per request in it with an `id` (`202` and nothing when none has one). A request without a handle, or a protocol request (`initialize`, a list) carrying one, gets a new instance as before.
- **A complete debugger stop ends the debugger batch's kept answers with the state.** `DebugStop`, and an `AmdpDebugStop` that ends the whole debug state, let the answers of the last batch go when a debugger batch gave them, so the state's handle ends with the stop (`state is not available` afterwards, as for an unknown handle); a refused or incomplete stop keeps them, and a communication batch's answers keep their lifetime.
- **An AMDP stop waits for the cancelled debuggee to end before it stops the session.** `AmdpDebugStop` (and `DebugStop`'s AMDP part) cancels a debuggee standing at a break, waits until the event read reports `ON_WARNING`, `ON_EXECUTION_END` or `STOP` and the run that called it has returned, then sends the stop and logs off (measured 2026-10-19: sent while the cancel was under way, the AMDP debugger's ABAP sessions and RFCs stayed until their timeout; sent after it, nothing stayed). No clock of its own, and it holds no other call: a second stop, the debug state's end (dispose, the instance's close, the shutdown) or the stop call's cancellation ends the wait, and the answer then names the debuggee that had not ended. A cancel SAP refuses sends no stop — the stop answers the refusal and the session stays for the next stop — except at the debug state's end.
- **An AMDP stop that SAP accepted logs off every connection of the session, even when the breakpoint clear was refused.** The refused clear is answered with its step as before; the clear is not sent again and nothing is kept open for it (SAP removes a breakpoint left behind on its own). A clear refused before a refused stop still stays for the next stop, with the stop.
- **A credential failure ends a cleanup too, and a `401` SAP answered is one.** The debugger's stop (and a start's cleanup, and the AMDP debugger's) sends no request after the credential was refused — no further breakpoint delete, release or stop: the refusal is the answer as it came with its step, and `not_attempted` names the steps left in fixed words; they stay for the next stop. A start whose reconciling `stopListener` the credential refused ends with it, nothing armed. A `401` on a locked write's unlock, or on `CreateTransportTask`'s task type change, is the call's failure with its step, not a `cleanup` entry. `GetInclude`, `GetObjectNodeFromCache` and the enhancement type search (`GetEnhancementImpl`, `GetEnhancementSpot`) answer a refused credential as the credential failure instead of rewording it or reading on.
- **The read tools that still answered a failure in words answer it in the shape of every other.** `GetInclude` reads through adt-clients (`getInclude`, `analyseException`): SAP's refusal is the method's error as it is, no longer its message as text. `GetTypeInfo`, `GetTransport` and `GetObjectNodeFromCache`, which send a request no client method makes, read its failure as adt-clients reads one — `status`, `adt_type`, T100 `messages`, `raw_body` and the `request` sent — with the step (`read domain` … `read structure`, `read transport request`, `read OBJECT_URI`), no longer SAP's body or the error's message as text; `GetObjectNodeFromCache` fails the call with it instead of answering the node with `"ERROR: …"` as its `object_uri_response`. `GetPackageContents` answers a thrown credential refusal as `authentication_failed` (it was answered in its words) and a throw of its own as `client_threw`, as do `GetIncludesList`, `GetAbapAST` (`step: "parse"`), `GetAbapSemanticAnalysis` (`step: "analyse"`) and `GetAbapSystemSymbols` outside its walk. A throw while `GetAbapSystemSymbols` resolves a symbol is that symbol's `error` (`client_threw` with its step), not `systemInfo.error` text, and a thrown credential failure ends the call. `GetEnhancements`' partial answer after a failed nested walk carries the failure as an entry (`step: "list includes"`). `GetServiceBindingPreviewUrl` carries its system lookup's failure as `system_information_failure` beside the URL (its note says so in fixed words; a `401` there ends the call), no longer its message inside a sentence; a `401` SAP answers to its service URL lookup ends the call with that lookup's error (`step: "read service URL"`) instead of the composed URL answering. A credential failure ends the call before any further request: a `401` SAP answered to one of `GetIncludesList`'s includes (it was listed in `unreadable` and the walk read on), `DescribeByList`'s typed search (it searched again without the type), `GetObjectInfo`'s enrichment search (the tree was read on).
- Every ADT session the server opens ends with a logoff — a request's instance, a pooled one at its state's end, a debugger's, a long read's, a background run's, a lock session's.
- **Every flag row of the YAML configuration refuses a list or a map**: `[true]` (or `{ … }`) was accepted for a boolean option and is now refused at start like any other bad value.
- **The paired reads send their two requests at once**: `GetObjectVersionDiff` sends its two version reads together, neither waiting for the other — the second is sent even when the first fails. The answer is unchanged.
- **An SAP user id a transport tool names is sent in upper case, trimmed**: `CreateTransport` `owner` (compact `HandlerCreate` `TRANSPORT` too) and `CreateTransportTask` `target_user`; `ListTransports` matches its `user` filter in upper case. SAP stores user ids in upper case: a lower-case owner was refused `400` "User … does not exist in the system (or locked)" (measured).
- **The package walks read in ADT batch envelopes, and take several roots.** `GetPackageContents` (and compact `HandlerGet` part `contents`), `GetPackageTree`, `GetObjectsList` and `GetObjectInfo` send each level's independent requests in one envelope (`POST /sap/bc/adt/communication/batch`, inside the one call): per level the root node structures of its packages or nodes, then their type nodes (`GetPackageTree` reads the package metadata with the first; `GetObjectsList` every node of the level; `GetObjectInfo` with `enrich` one search per node in a last envelope). The descriptions in the answer come from each object's metadata, read in one more envelope after the walk (each object's read sent as that type's `Get<Type>` metadata read sends it — the same URL and Accept, a package's `/sap/bc/adt/packages/<name>`; its `adtcore:description`), not from the node structure parts: measured on the system, a node structure part after the first in an envelope can carry another part's `DESCRIPTION`, while metadata reads in one envelope answer as they do alone. An access control (`DCLS/DL`), which has no `Get<Type>` tool, is read as adt-clients reads its metadata (`GET /sap/bc/adt/acm/dcl/sources/<name>?version=active`, Accept `application/vnd.sap.adt.dclSource+xml`). An object whose metadata read fails, or of a type with no metadata read, has no description in the batched answer; otherwise the answer is the sequential version's. Each takes a list beside its single argument, exactly one of them given, read in the same envelopes and answered one entry per root in the order asked, a root's failure (the method's error with its `step`) its own entry: `package_names` (`GetPackageContents`, `GetPackageTree`, `HandlerGet` part `contents`), `objects: [{ parent_type, parent_name }]` (`GetObjectsList`), `objects: [{ object_type, object_name }]` (`GetObjectInfo`); the single arguments stop being required. A credential refusal — a `401` SAP answered to any root's read included — ends the call as it came, and nothing is read after it. A destination whose first envelope is answered `404` has no communication batch: that call and later ones run the tool's sequential reads as before, one root after another.
- **`SearchSource` reads in ADT batch envelopes, answers a cursor; `concurrency` is removed.** Inside the one call: the quickSearch of every package mask, one envelope; each level of the package walk (as the package walks above), one envelope each; the source reads of the scanned objects, up to `max_objects`, in chunks of 300 objects, each chunk's rounds — the main sources and function group structures, then the function groups' includes and function modules — in envelopes of at most 300 reads (fixed, no parameter). The scan targets are ordered by (package, type, name), and the answer carries `total_targets`, the targets of the walk; a new `start_at` (default 0) starts the slice `[start_at, start_at + max_objects)`, and a scan that stops before its last target answers `next_start_at`, to pass as `start_at` to go on. The hits, `no_hits`, `failures` and `truncated` flags are the sequential version's. `time_budget_ms` is checked before every envelope: once it has passed nothing further is sent, and the answer holds whole objects only — those of the chunks read to the end — with `truncated.by_timeout` and `next_start_at` at the first object not answered (`start_at` itself when none was); a deadline during the package walk answers `next_start_at: start_at` and no `total_targets`, the targets never having been enumerated. After a cut, `scanned.objects` and `scanned.sources` count only the objects answered. When `next_start_at` equals `start_at`, `time_budget_ms` passed before the first object was answered: raise `time_budget_ms` or lower `max_objects`. Before, a deadline answered the objects read part-way. The sequential version answers whole objects too: those finished before the first one the deadline cut. Closes #89. A credential refusal — a `401` SAP answered to any read included — ends the call as it came, and nothing is read after it. `concurrency` (parallel source fetches) leaves the schema: an envelope carries a phase's reads at once. A destination with no communication batch runs the sequential reads as before (eight fetches at a time over HTTP, one over RFC).
- **`SearchSource` is available on cloud systems too.** It was declared for on premise only, on the grounds that cloud has no indexed source search; it never used one: it walks the packages and reads the sources, and both answer on an SAP BTP ABAP trial (measured 2026-10-21). ADT's own text search (`/sap/bc/adt/repository/informationsystem/textsearch`) answers "Source Search is not supported" on both the on-premise test system and the trial, so `SearchSource` does not call it.
- **The include, structure and enhancement trees read in ADT batch envelopes, and take several objects.** One envelope per phase, inside the one call, one level at a time: `GetIncludesList` — every object's first read (a program's or include's source, a function group's node structure, then its includes node), then per depth up to 20 the source of every include first reached there; `GetStructuresList` — per level of the tree the structure source of every node, then the table source of the nodes not found as structures, and with `include_extensions` the where-used scope pair (structure, table) of every node read, the scoped where-used of every scope that answered, and the source of every append candidate; `GetEnhancements` — the type probes (class, then program, then include, one per phase), the enhancements of every object with `include_nested` beside its root node structure, the includes node, the metadata of every include up to `max_includes`, then their enhancements. Each name is read once for the call; the trees, the `cyclic` and `duplicate` marks, `unreadable`, `appends_unavailable`, `append_candidates_unread` and `includes_unread` are the sequential version's. A phase can carry a read the sequential version does not send: the table where-used beside an answered structure where-used, the root node structure beside enhancements that fail, an include the depth-first walk does not expand. A call that is one request — a class's includes, a named object's enhancements without `include_nested` — sends it as before. Each takes a list beside its single argument, exactly one of them given, read in the same envelopes and answered one entry per object in the order asked, a failed one `{ object_name, object_type, error }` (`{ structure_name, error }`): `objects: [{ object_name, object_type }]` (`GetIncludesList`, `GetEnhancements`), `structure_names` (`GetStructuresList`); the single arguments stop being required. A credential refusal — a `401` SAP answered included — ends the call as it came, and nothing is read after it; on such an extra read too (on the extra table where-used, only a refusal the connection throws). A destination with no communication batch runs the sequential reads as before, one object after another.
- **`ListTransports`, `DescribeByList` and `GetAbapSystemSymbols` read in ADT batch envelopes.** One envelope per phase, inside the one call: `ListTransports` — the search configurations, then the search of every saved configuration (up to 5); `DescribeByList` — the quickSearch of every object, then the quickSearch without its type of every object whose first answer was empty or failed; `GetAbapSystemSymbols` — the source of every class and interface symbol found in the code, in one envelope. The answers are the sequential version's. A phase can carry a read the sequential version does not send: `ListTransports` sends every configuration's search where the sequential version stops at the first that fails, and the first failed one in the order of the configurations is the answer, as before; `DescribeByList` and `GetAbapSystemSymbols` read every object or symbol of the phase beside one whose read is refused for the credential. A credential refusal — a `401` SAP answered included — ends the call as it came, the first in the order of the objects or symbols, and nothing is read after it (`DescribeByList` sends no typeless search). A destination with no communication batch runs the sequential reads as before, one request after another.
- **`GetWhereUsed` and `RuntimeListFeeds` read in ADT batch envelopes, and take several objects or feeds.** `GetWhereUsed` with a type filter sends two envelopes for any number of objects: the where-used scope of every object, then the scoped where-used request of every object whose scope answered (and, with `enable_only_types`, offers every type asked). Each scope is read once, where the sequential version reads it twice with `enable_only_types` (once to check the types, once to search). Without a filter, several objects are one envelope; one object without a filter is its one request, sent as before (compact `HandlerWhereUsed` too). `RuntimeListFeeds` reads the paged feeds (`dumps`, `system_messages`, `gateway_errors`) in rounds, one envelope each: the first page of every feed, then the next page of every feed still paging; `descriptors` and `variants` alone are their one request, sent as before (compact `HandlerDumpList` still reads one page per call). The answers are the sequential version's, with one exception measured on premise (2026-10-18): in a where-used answer without a type filter, the `usage_information` of a few references (Web Dynpro and BSP objects) depends on the requests the ABAP session ran before — over RFC two identical requests sent one after the other answer it differently, and over HTTP a request's part in an envelope answers it differently from the request sent alone; every other field is the same. Each takes a list beside its single argument, exactly one of them given, read in the same envelopes and answered one entry per object or feed in the order asked, a failed one `{ object_name, object_type, error }` (`{ feed_type, error }`): `objects: [{ object_name, object_type }]` (`GetWhereUsed`, the type filters applying to every object; `object_name` / `object_type` stop being required), `feed_types` (`RuntimeListFeeds`, the filters applying to every feed). A list is recorded in batch mode by neither tool. A phase can carry a read the sequential version does not send: every object's or feed's read of the envelope beside one refused for the credential. A credential refusal — a `401` SAP answered included — ends the call as it came, the first in the order of the objects or feeds, and nothing is read after it; a refusal the connection throws to the scope read that checks `enable_only_types` is thrown, as the sequential version throws it. A destination with no communication batch runs the sequential reads as before, one object or feed after another.
- **A read in an envelope that fails as a whole names the envelope's request.** In the tools above that read in ADT batch envelopes, every read of an envelope SAP answers with a failure as a whole is that failure, and its `request` is the envelope's own (`POST /sap/bc/adt/communication/batch`) where the sequential version names the read's own request; the rest of the failure is the sequential version's.
- **The server sends the request header pairs, and corrects a `406` / `415` once.** Every call of an adt-clients member that takes a header pair goes with the server's pair: one default per member and object type — the pair adt-clients 35 sent, completed where it sent one header or none and corrected where SAP refuses it (the enhancement's `check`) (`src/lib/adtHeaders/defaultPairs.ts`) — or the pair corrected for the system. A request SAP answers `406` naming the types it serves is sent once more with them as the `Accept`, one answered `415` naming a type once more with it as the `Content-Type`; the corrected pair is kept in memory for the system the destination points at and that member — not for the credentials: two destinations to the same system share it — and sent from then on, until a later `406` / `415` corrects it again. A `406` / `415` naming nothing, or what was sent, is the call's answer; the second request's answer is the call's answer. In the tools that read in ADT batch envelopes, right after a phase's envelope answers, the requests SAP answered `406` / `415` go in one more envelope — only those, each sent again by its member with the corrected pair; one round. A read without a header pair (a search, a source or metadata read) is sent as it is and its `406` is its answer: `DescribeByList` answers an object whose typed search is refused `406` with that search's error and sends no typeless search for it. `BatchEnd` is unchanged: a recorded call's `406` / `415` is its answer. The correction is the server's, around the member calls, so it applies on any connection — an embedder's injected one included. An embedder shares the corrected pairs between its instances with `adtHeaderPairs: new AdtHeaderPairs()` (`@mcp-abap-adt/lib/embeddable`); without it each instance keeps its own. Anything an embedder did with adt-clients' `enableAcceptCorrection` is gone with it.

### Fixed

- **`SearchSource` reads only the sources of a function group, each once.** It read every `FUGR/*` node of the group's object structure as an include: a screen answered `500` (`SADT_RESOURCE` 028) and ended the group as a failure, a GUI status or title answered `404`, and an include was read and scanned once for every field, module or class listed inside it. The structure is now read through an `objectStructure` strategy, and a node is read only when its `objecturi` names a function module (`/fmodules/`) or an include (`/includes/`); a node without one is read by its type, `FUGR/FF` or `FUGR/I`.
- **A check runs on the active version unless `version` is `inactive`** (#181). `CheckProgram`, `CheckFunctionGroup`, `CheckInterface`, `CheckBehaviorDefinition`, `CheckDomain`, `CheckDataElement`, `CheckDdl`, `CheckStructure`, `CheckTable` and `CheckPackage` (high and low tiers; `CheckObject` for the same types) passed no status, and adt-clients reads a missing status as `inactive`, so a sound object with no inactive version reported syntax errors that were not there. `CheckTable`'s `new` still checks the inactive version.
- **`ReadTransportObjects` on a request answers each task entry once, with its `task` number** (compact `HandlerGet` `TRANSPORT` too). A request's document also carries `tm:all_objects`, the request's aggregate list, and it was collected beside the tasks' entries, so every object came twice (measured: 684 rows for 342 entries). A task read is unchanged.
- **stdio logs on again after SAP ended its session** (#295). In 18.1.0 the connection the start made was reused after a `SESSION_REPLACED`, so every later call answered `NOT_CONNECTED`. Now the call that meets the replaced session still answers `SESSION_REPLACED` (nothing is retried); the next call ends the spent connection, logs on again and runs on the new session. The session SAP opened for the call that met the replacement is logged off at once (connection 18.0.1), so no session of the spent connection stays in SM05 until its idle timeout.

### Measured

- Live measurements of 19.0.0 (2026-10-15; on premise BASIS 816 and an SAP BTP ABAP trial; Linux, Node.js 26.7.0; SNC on Windows): every transport and binary kind answered with basic, a token and SNC; a token refused by the system was renewed with the refresh token and written back; a logoff released the locks on a shutdown and on an SSE stream close; a long read's `timeout` left the instance's session and its lock in place; the stdio start took up its leftover session. A shutdown during the start's browser login hung and is fixed (exit `1`, the callback port freed). Details: [`docs/development/tests/TESTING_AUTH.md`](docs/development/tests/TESTING_AUTH.md#live-measurements-of-1900-2026-10-15).

## [18.1.0] - 2026-10-12

Two transport organizer actions on `@mcp-abap-adt/adt-clients` 30.

### Added

- `SortAndCompressTransportTask` (`transport_number`, the task): the organizer's *Sort and compress* — sorts a task's object list and merges its duplicate entries. A task holding the same entry twice refuses `RemoveTransportObject` with `SCTS_ADT_MSG 009` (long text TR292) until it has run. Measured on premise (BASIS 816, 2026-10-12): `200` with an empty body; a task of 161 entries with four held twice re-read as 157.
- `MoveTransportObjects` (`transport_number`, the source task; `target_number`; `objects`, at least one, each `object_name`, `object_type`, `position` in the source and an optional `pgmid`): the organizer's *Move Objects*. Measured on premise (same day): one and two entries per call answered `200` echoing them, and both tasks read back with them moved.
- Neither answer is evidence of the change, so neither says `success` (as `RemoveTransportObject`): the terse answer is `accepted: true`, what was asked, and `confirm_with` naming `ReadTransportObjects` on the task — both tasks for a move. A missing argument or an empty `objects` is refused in fixed words naming the field before anything is sent. Both run under the critical section the other transport object writes have. 159 high-level tools.

### Changed

- `@mcp-abap-adt/adt-clients` `^30.0.0`, `@mcp-abap-adt/adt-strategies` `^0.10.2`, `@mcp-abap-adt/interfaces-adt` `^15.3.0` (root and `compact-modify`). adt-clients 30's two new result slots, `sortedAndCompressed` and `movedObjects`, are read `statusOnly` and `structured`. `@mcp-abap-adt/core`, `@mcp-abap-adt/compact` and the two compact halves require `@mcp-abap-adt/lib` `^18.1.0`.

## [18.0.0] - 2026-10-12

The debugger on `@mcp-abap-adt/adt-clients` 29 (`interfaces-adt` 15, `adt-strategies` 0.10): another user's runs, terminal mode, leaving a debuggee running, the debugger settings — and breakpoints armed as one set. Migration: [`docs/MIGRATION-18.0.md`](docs/MIGRATION-18.0.md).

### Added

- `DebugStartListener` and `DebugTakeOverListener` (compact `HandlerDebugStart`, `kind: abap`) take `request_user` (whose requests are caught; needs the debug authorization on that user), `debugging_mode` (`user` | `terminal`) and `settings` (applied after each attach). Terminal mode catches the requests that carry the session's terminal id and IDE id; the run the server starts carries them in its `SAP-PASSPORT`, so it needs no configured id (measured on premise, 2026-10-12). The start answers the identity in force.
- `DebugStep` (compact `HandlerDebugStep`): `detach` and `release_debugger`, ABAP only — the program runs on, the session listens on.
- `DebugSetSettings`: the debugger settings at the current stop; answers the settings in force. 30 debugger tools.
- `SAP_DEBUG_BREAKPOINT_CONFLICT` (`replace` | `refuse-if-held`): whether a take-over and every later breakpoint change first ask if another debugger listens for the user. The header `x-sap-debug-breakpoint-conflict`, a destination's `.env`, the environment, `createDebuggerInstance`'s `breakpointConflict`.

### Fixed

- A second `DebugSetBreakpoints` removed the breakpoints of the first, and an ambiguous refusal re-asked with `validationOnly` removed the whole set: the system replaces the key's set on every request (measured on premise (2026-10-11), BASIS 816). The session sends its whole set every time, each breakpoint tagged with a `clientId` the system echoes, and pairs the answer rows by that tag without re-asking.
- A refuse start (`DebugStartListener`, compact without `take_over`) meeting another IDE's listener of the same SAP user replaced that IDE's breakpoints before its listen was refused `409`: the user-mode set is the SAP user's with the request user, whatever the IDE id (measured on premise, 2026-10-12). It now asks the system first (`checkListener`) and is refused before anything is changed; every later `DebugSetBreakpoints` of that session asks the same way. The check is not atomic; the remaining race is documented.

- `CreateFunctionGroupUnitTest` and `UpdateFunctionGroupUnitTest` left the group's main program inactive, so ABAP Unit found no test class and answered an empty run result. Writing the test include regenerates `SAPL<group>` with the `INCLUDE` added; the group was then activated alone with the pre-audit, which is answered `200` with the inactive list instead of an activation, and that passed as a success (measured on premise, BASIS 816, 2026-10-12). The include, the group and its main program are now activated in one run without the pre-audit, and a refused or unfinished run is a failure.

### Changed

- **`CreateFunctionGroupUnitTest` / `UpdateFunctionGroupUnitTest` with `detail: full`** answer the activation run (`run_id`, `status`) instead of the parsed activation checklist; `detail: raw` carries the run's results document. `terse` is unchanged.
- **`DebugStartListener` and `DebugTakeOverListener` require `breakpoints`, at least one**; a start without them is refused by the schema, and by the session before anything is sent.
- The breakpoints answer is the whole set: `placed`, `refused` (this call's, each with its definition), `lost`, `unexpected`. A delete by an id the session does not hold is refused before the wire.
- A condition on a non-line breakpoint is refused, naming it.
- `DebugStop` stops the listener first, which deletes the key's breakpoints, and deletes by id only when that fails; a start that failed after a change does the same. While the listener's open poll has not answered, the stop sends one more stop, which narrows a race of the system's without closing it (documented in `DEBUGGER.md`). The identity and the settings stay until a stop undid everything, and a new start is refused until then — except when the system refuses the listener's stop for the user (`403` `notAuthorized`, `404` `invalidUser`): the breakpoints are let go, not deleted, the stop answers a note naming those left on the system, and the session ends when nothing else failed.
- A listener conflict (`409`) names the holder: the system's conflict text and the IDE user.
- `@mcp-abap-adt/adt-clients` `^29.1.0`, `@mcp-abap-adt/adt-strategies` `^0.10.1`, `@mcp-abap-adt/interfaces-adt` `^15.1.0` (the breakpoint types lose `skipCount` and gain `clientId`; a run takes the debuggee's ids); `@mcp-abap-adt/compact-modify` declares `interfaces-adt`, which it imports. `@mcp-abap-adt/core`, `@mcp-abap-adt/compact` and the two compact halves require `@mcp-abap-adt/lib` `^18.0.0`.
- `DEBUGGER.md`: another user, terminal mode, the breakpoint set and its key, leaving a debuggee running, the settings, what ADT cannot do.

## [17.2.2] - 2026-10-11

### Changed

- **A terse stop keeps up to 50 frames, not 5** — the ABAP stop (`DebugWait`,
  the step answers, compact's `HandlerDebugWait`) and an AMDP break alike. Real
  stacks run to some 20–25 frames, and five cut most of an ordinary one. A
  deeper stack is cut at 50 from the top, and `stack_depth` then gives the full
  depth, so a model knows to ask for `detail: full`.
- **The AMDP stack under `terse` keeps no lines for a caller not compiled for
  debugging.** Measured on premise with nested procedures: the system sends the
  innermost frame first (so the frames kept are the top ones), and for a caller
  not compiled for debugging it answers the method's first line and native line
  `0` rather than where the call stands. Such a frame now answers its procedure
  and object with `not_debug_compiled`, without `line` or `native_line`. `full`
  and `raw` are unchanged.
- **Measured: a catch during a stop.** An attach after the listener was stopped
  still succeeds, so `DebugStop` releases such a debuggee as it does; a caught
  debuggee nobody attaches is held about 30 seconds and then runs on.
  `DEBUGGER.md` says so.

## [17.2.1] - 2026-10-11

### Changed

- **Memory sizes under `terse`** (`DebugGetMemorySizes`, and `HandlerDebugView`
  with `what: memory` in compact) answer three numbers in bytes —
  `abap_objects_used`, `internal_used`, `internal_peak_used` — instead of the
  parsed document; `full` is the parsed document and `raw` SAP's, as before. The
  library reads the whole document as `readMemorySizes` (numbers, named after its
  elements) and projects it with `terseMemorySizes`.
- **An AMDP break carries its call stack.** `AmdpEvent.stack` reads the frames
  of an `ON_BREAK` (procedure, ABAP position and line, schema and native line,
  whether the frame is compiled for debugging); the terse event of
  `AmdpDebugWait` and compact's `HandlerDebugWait` keeps the first five, in the
  order the system sends them, as
  `procedure`, `address` and `native_line`, marking a frame not compiled for
  debugging.
- `@mcp-abap-adt/core` and `@mcp-abap-adt/compact` require
  `@mcp-abap-adt/lib` `^17.2.1`.

## [17.2.0] - 2026-10-11

The debugger: ABAP and AMDP debugging as an opt-in tool set, a debug session that
lives between tool calls on every transport, and the instance state that holds it.
Five schemas now refuse values their handlers used to bend (see Changed).

### Added

- **The `debug` set** (`--exposition=…,debug`; opt-in, never part of the default,
  because a breakpoint catches every request of the connected SAP user), 29 tools:
  - ABAP: `DebugStartListener` and `DebugTakeOverListener` (arm breakpoints, listen,
    attach the first program caught, optionally run a class or report in the
    background; refuse, or displace, another debugger of the same user),
    `DebugWait`, `DebugSetBreakpoints`, `DebugDeleteBreakpoint`,
    `DebugListBreakpoints`, `DebugGetStack`, `DebugSetStackPosition`,
    `DebugGetVariables`, `DebugSetVariable`, `DebugStep`, `DebugStepToLine`,
    `DebugTerminate`, `DebugCreateWatchpoint`, `DebugListWatchpoints`,
    `DebugDeleteWatchpoint`, `DebugGetMemorySizes`, `DebugCreateMemorySnapshot`,
    `DebugStop`;
  - AMDP: `AmdpDebugStart` (a background run starts once the system confirmed the
    breakpoints), `AmdpDebugSetBreakpoints`, `AmdpDebugWait`, `AmdpDebugStep`,
    `AmdpDebugGetTable`, `AmdpDebugCancel`, `AmdpDebugStop` (releases a suspended
    debuggee first);
  - memory snapshots: `MemorySnapshotList`, `MemorySnapshotGet`,
    `MemorySnapshotDelta` (need the memory snapshot authorization; the list is
    empty without it).

  It debugs what it starts itself, in the system's user mode; terminal debugging,
  other users' requests and attaching to a process it did not start are not
  offered. Every answer takes `detail` (`terse`, `full`, `raw`). See
  `docs/user-guide/DEBUGGER.md`.
- **A debug session is named by a `state_handle`** (128 random bits) that the
  starting tool answers and every other session tool takes; an unknown handle and an
  ended session's get the same answer, `state is not available`. The handle is a
  bearer secret: keeping it safe is the deployer's (`SECURITY.md`, new). The state
  lives in the server instance: stdio keeps it in the process, SSE in its session,
  and Streamable HTTP in a pool of instances that routes each `tools/call` by its
  `state_handle` (one request at a time per instance; a batch carrying a handle is
  refused). Every host stops what an instance holds before letting it go.
- **The idle bound on held state**: `--state-idle-minutes`, env
  `MCP_STATE_IDLE_MINUTES`, YAML `state-idle-minutes` — default 30, at least 30, at
  most 35791. Held state ends after that many minutes without a tool call on its
  instance; a call in flight pauses it, a listener's own re-poll does not count. The
  end is a complete stop, logged on stderr without the handle.
- **The debugger's SAP ids** can be stated: headers `x-sap-debug-terminal-id` and
  `x-sap-debug-ide-id`, `SAP_DEBUG_TERMINAL_ID` and `SAP_DEBUG_IDE_ID` in the
  destination's `.env` or the environment; otherwise random per instance. The
  system keys its listener conflict by the IDE id, so sharing one is a deliberate
  choice; with stated ids, a restarted server's first start ends the listener its
  predecessor left.
- **Library** (`@mcp-abap-adt/lib`): subpaths `./debugger` (the debug sessions,
  their readings and schemas) and `./state` (`InstanceState`, the idle bound);
  `DebugHandlersGroup`, `defineTool` and the `ArgsOf` type from `./handlers`;
  `HandlerExporter` option `includeDebug` (default `false`); `EmbeddableMcpServer`
  options `stateIdleMinutes` and `stateLogger` (default: the logger passed, else
  stderr), and its `state`, `stateHandle`, `holdsState()`, `dispose()`,
  `shutdownState()` and `idle()`; `requestContextFromHeaders` reads the two debug
  headers; `readStateIdleMinutes` and its names from `./config`.
- **Compact**: `--exposition=ro,debug` or `rw,debug` adds four verbs —
  `HandlerDebugStart` (`kind: abap|amdp`, `take_over`, `run`), `HandlerDebugWait`,
  `HandlerDebugView`, `HandlerDebugStep` (`stop` ends the session) — 29 tools in all.
  `debug` alone is refused.
- `docs/user-guide/DEBUGGER.md`; the generated tool reference has a Debug group.

### Changed

- **Tool arguments are checked at any depth, with their ranges.** The JSON schema
  of a tool becomes one zod schema recursively — nested objects and arrays included —
  with `integer` as a whole number, and `minimum` and `minItems` enforced. What that
  changes for callers:
  - **a fraction is refused where an integer is declared** on five tools, whose
    handlers used to truncate it: `RunATC` (`max_findings`), `RuntimeRunClass` and
    `RuntimeRunClassWithProfiling` (`max_trace_attempts`, `trace_retry_delay_ms`),
    `GetObjectInfo` (`maxDepth`), `GetPackageTree` (`max_depth`);
  - **`RuntimeRunClass` and `RuntimeRunClassWithProfiling` refuse an out-of-range
    `max_trace_attempts` (under 1) or `trace_retry_delay_ms` (under 0)**, which their
    handlers silently replaced with the defaults; the schema always declared these
    minimums;
  - **nested values are validated**: `GetVirtualFoldersLow`'s
    `preselection[].values` must be an array of strings, as its handler already
    assumed.
- **Versions**: `@mcp-abap-adt/core` and the three compact packages require
  `@mcp-abap-adt/lib` `^17.2.0`, and `@mcp-abap-adt/compact` requires
  `@mcp-abap-adt/core` `^17.2.0` — the releases that ship `lib/debugger` and
  `lib/state`.
- **On `@mcp-abap-adt/adt-clients` 27.0.0** (with `adt-strategies` 0.8.1,
  `interfaces-adt` 13.2.0 and `interfaces-adt-connection` 2.0.0). Every factory
  of the client now answers a contract; what that changed here:
  - **`CreateServiceBinding`'s last step reads the service group.** It called
    `generateServiceBinding`, which sent that very read and generated nothing;
    27 removed the name. The step stays — after an activation, a binding whose
    service group cannot be read is reported as the refusal it is — and the
    `activate` parameter now says what it does: activate, then read the group.
  - **A class and a behavior implementation create carry no responsible
    person** (adt-clients 26.0.1): SAP stores that attribute on them as the
    creator. The responsible person still travels on every other create; the
    system-context tests now drive a message class, and pin that a class
    create sends none and is not refused.
  - The result-set table gives the new slots (ATC check variants, the ABAP and
    AMDP debuggers, memory snapshots) a reading.

## [17.1.0] - 2026-10-06

A personal portable build of both servers; no change to what the servers do.

### Added

- **A personal portable build**: one executable per server (`mcp-abap-adt`, `mcp-abap-adt-compact`) and platform
  (Windows x64 and macOS arm64: HTTP, RFC, SNC; Linux x64: HTTP, RFC) — Node.js 24 inside as a single executable
  application, the builder's SAP NW RFC SDK and the RFC module beside it in `nwrfcsdk/lib`. Unpack and run: no
  Node.js, npm, compiler or `SAPNWRFC_HOME` on the machine. Built from this repository for the platform it runs on with
  `npm run portable:build`, `portable:build:full` or `portable:build:compact`, from the published packages of the
  version; checked with `npm run portable:smoke`. It carries the SDK, so it is never published or handed on. Verified on
  Linux in a clean container, on Windows 11 with SNC and on macOS arm64 (SNC not verified there). See
  `docs/installation/PORTABLE.md`. The build needs only the repository's production dependencies
  (`npm ci --omit=dev --ignore-scripts`): it installs esbuild and postject, at the versions the repository
  declares, into its own cache.
- **`@mcp-abap-adt/sap-rfc-lite` 0.2.2**, picked up by the existing `^0.2.1` range, builds the RFC module on a
  current macOS (its minimum was 10.15, which current Xcode's libc++ refuses) and under `FORCE_COLOR` (its
  `binding.gyp` read the N-API version through `node -p`, which colours numbers). The portable build still runs its
  nested `npm install` with colour off.

### Removed

- **`@mcp-abap-adt/core` no longer declares `dotenv`.** The server never imports it; `.env` files are
  read by `@mcp-abap-adt/lib`, which keeps its own dependency, so an install of core carries `dotenv`
  once, through lib.

## [17.0.1] - 2026-10-05

Documentation and release metadata; no change to what the servers do.

### Changed

- **The registry and Glama metadata is part of a release.** `releaseMetadata.test.ts` fails until
  `server.json`, `server-compact.json` and the Glama image (`docker/Dockerfile.inspect`) name the version
  the manifests carry, the registry entries name their package and `mcpName`, their descriptions stay
  within the MCP Registry's 100 characters, and every sibling range is on the current major. The Glama
  image is pinned to the release of `@mcp-abap-adt/core` (it installed `latest`). `glama.json` names the variants.
  `docs/deployment/RELEASE.md` makes these a step of the release PR and gives `mcp-publisher` one command
  per registry entry.
- **The compact tool counts are the ones the server lists**: 25 tools, 16 that change nothing
  (`@mcp-abap-adt/compact-readonly`, `--exposition=ro`) and 9 that write (`compact-modify`). The READMEs and
  the package description said 22 and 13; the generated tool page takes its count from the tool list.

## [17.0.0] - 2026-10-05

The dependency update to `@mcp-abap-adt/adt-clients` 25 and `@mcp-abap-adt/connection` 11, which verifies the
HTTPS certificate of the SAP system. The installation documentation is rebuilt around the variants — the full
or the compact server, over HTTP, RFC or SNC — and the Docker image installs the published server from npm.
All five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) are 17.0.0.

Migration: [`docs/MIGRATION-17.0.md`](docs/MIGRATION-17.0.md).

### Breaking

- **The HTTPS server certificate is verified** (`@mcp-abap-adt/connection` 11). Up to 16.0.x the server
  accepted any certificate unless `TLS_REJECT_UNAUTHORIZED` or `NODE_TLS_REJECT_UNAUTHORIZED` was `1`; a
  system with a self-signed or company-CA certificate is now refused at its first request. Trust the CA
  with `NODE_EXTRA_CA_CERTS`, or opt out with `TLS_REJECT_UNAUTHORIZED=0` — both in the process
  environment: a destination's `.env` is not copied into it, so a line there is not read (it was not
  on 16.x either). RFC, SNC and plain `http://` are unaffected.
- **`CreateMessageClass` and `CreateProgramUnitTest` need a responsible person**, like every other create
  since 16.0.0. `@mcp-abap-adt/adt-clients` 25.0.1 sends `adtcore:responsible` from the system context for
  a message class and for an include, where 24.x sent none and the system filled its own default; with
  no responsible found (SNC or a token you hold, no `SAP_RESPONSIBLE`) both are now refused with
  `system_context_missing` before the create is sent.

### Changed

- **`@mcp-abap-adt/adt-clients` `~25.0.1`** (was `~24.1.0`; still pinned to a minor, for the same
  reason), **`@mcp-abap-adt/adt-strategies` `^0.7.0`** and **`@mcp-abap-adt/interfaces-adt` `^12.0.1`**,
  which move together — one copy of the contract in the tree. From adt-clients 25: `getVersions()` reaches
  the history of DDL sources, access controls, function includes and table types (it asked an address
  SAP answers `404`); a namespaced enhancement is no longer encoded twice; a function module reference
  without its group is refused by the client too, before any request. `RunATC` takes the same seven
  object types: interfaces-adt 12's program and include kinds are not offered by the tool yet.
- **`@mcp-abap-adt/auth-broker` `^4.1.0`, `auth-providers` `^5.4.0`, `auth-stores` `^3.3.0`,
  `interfaces-auth` `^3.2.0`, `interfaces-auth-broker` `^1.2.0`.** Nothing the server serves changes. A
  malformed service key file no longer puts its bytes — a client secret, a private key — into the
  thrown error and the log (Node's `JSON.parse` quotes its input); a log line about a failed SNC library
  lookup or a failed probe carries fixed words instead of the error's message. The x509 service keys
  these releases add are not served yet.
- `@mcp-abap-adt/interfaces-adt-connection` `^1.0.1`, `interfaces-network` `^2.0.1`, `interfaces-utils`
  `^1.1.1` (built from the registry, contract unchanged); `@modelcontextprotocol/sdk` `^1.32.0`,
  `dotenv` `^18.0.5`, `fast-xml-parser` `^5.11.2`, `pino` `^10.4.0`, `pino-pretty` `^13.2.0`; dev:
  `@biomejs/biome` `^2.5.15`, `@modelcontextprotocol/inspector` `^2.9.0`, `@types/node` `^22.20.5`.
  TypeScript stays on 6.x and `@types/node` on 22, as SAP's toolchain does.

### Documentation

- **Installation variants, in one place**: `docs/installation/INSTALLATION.md` opens with the full
  (`@mcp-abap-adt/core`) and the compact (`@mcp-abap-adt/compact`) server, and with what HTTP, RFC and
  SNC each need on the machine; the README, the platform guides, the compact READMEs and the package
  descriptions point at it.
- **RFC: the SDK, a C++ toolchain and `SAPNWRFC_HOME` come before `npm install`.** `@mcp-abap-adt/sap-rfc-lite`
  ships no prebuilt binary and is compiled during the install; when it cannot be, npm leaves the optional
  dependency out and reports success, and the server refuses only the first RFC call. Measured
  2026-10-05 on clean installs from the registry. `RFC_SETUP.md` now gives the toolchain per platform,
  the check (`npm ls -g @mcp-abap-adt/sap-rfc-lite`), the runtime `PATH` on Windows, `SAP_SYSNR` for a
  port that does not say the system number, how the SNC library is found, and a troubleshooting entry
  per failure. It installed `sap-rfc-lite` locally for a global server and checked it with a `require`
  that resolves from the working directory; both are gone.
- The platform guides no longer put `TLS_REJECT_UNAUTHORIZED=0` in their sample `.env` (it was never
  read from there), no longer install from a `.tgz` or through git submodules, and no longer advise
  `--no-optional`. The README's development commands (`npm start`, `npm run start:http`) named scripts
  that do not exist; running a build from a checkout is described instead.
- **Client configuration examples** (`docs/installation/examples/`, the Cline and client guides) use
  `--env-path` for a path (`--env` takes a sessions-store name), and cover the variants: full and compact
  server, RFC/SNC with the process-level `env` block, a company CA. Checkout-based configs
  (`dist/index.js`, `bin/mcp-abap-adt.js`) and duplicate npx variants are gone; the HTTP and SSE examples
  carry their paths (`/mcp/stream/http`, `/sse`).
- **Docker and release docs** match the files: the image has no RFC SDK, so RFC and SNC are not
  available in it; `NODE_EXTRA_CA_CERTS` / `TLS_REJECT_UNAUTHORIZED` are container environment; npm
  publishing is `npm run release:publish` of the five packages in dependency order; `MCP_REGISTRY.md`
  covers `server.json` and `server-compact.json`.

### Fixed

- **`@mcp-abap-adt/compact` can be registered in the MCP Registry**: it had no `mcpName`, and
  `server-compact.json` still named 14.0.1 with a description over the registry's 100 characters.
- `server.json` / `server-compact.json` described a `.env` in the working directory as a fallback; nothing
  has been read from there since 16.0.0.
- **The Docker image starts again, and installs the server from npm.** `docker/Dockerfile` built only
  the library (`build:fast`) and ran `dist/server/launcher.js`, which no build produces, so
  `docker-compose.yml` and `docker-compose.headerless.yml` could not start. Nothing is built now: stage 1
  installs the published `@mcp-abap-adt/core` and `@mcp-abap-adt/compact` with `npm install -g` into
  their own prefix (build argument `MCP_ABAP_ADT_VERSION`, default `latest`), stage 2 copies that
  installation into a clean runtime image and runs `mcp-abap-adt` as the `node` user. The Node inspector
  is no longer open on `0.0.0.0:9229` by default. The build context is `docker/`, and its
  `.dockerignore` sends only the Dockerfiles — never `service-keys/`, `sessions/` or a `.env`.
  `Dockerfile.inspect` installs the published `core` behind a pinned `mcp-proxy` instead of building a
  fixed commit from 2025. `Dockerfile.package` and `docker-compose.package.yml`, a second way to the same
  npm package, are removed. Built and run on 2026-10-05: HTTP `initialize` and the tool list answer,
  the health check reports healthy.
- **`npm run docker:*` and `npm run smoke:mcp:*` run from the repository root.** They were declared in
  `server/package.json` with paths relative to `server/`, where neither `docker/` nor `tools/` is; so were
  `start`, `start:http`, `start:sse`, `dev`, `dev:http`, `dev:sse` and `kill-ports`, which ran a checkout
  that cannot run and are removed, with the `tools/dev-*.js` launchers they called.
  `tools/mcp-crud-smoke.js` spawns the installed `mcp-abap-adt` for stdio by default.
- **CI packs and installs all five packages** and checks that no package took a sibling from the
  registry instead of this build; it packed only `lib` and `core`. It also builds the Docker image
  and runs both commands in it.
- `--help`: a message class is no longer described as the exception to the responsible rule, and the RFC
  requirement says the module is compiled by `npm install`.
- The compose health checks asked `/health`; the server answers `/mcp/health`.
- **The integration tests read no `.env` from the working directory or the repository root.** `environment.env`
  in `tests/test-config.yaml` is a sessions-store name, as the docs said, resolved exactly as
  `--env=<name>` (under `auth_broker.paths.service_keys_dir`, else the platform directory); it was
  resolved against the repository root, and a missing destination fell back to a `.env` in the working
  directory or the root — the lookup the server dropped in 16.0.0. Hard mode passes the same file to the
  server (`--env` / `--env-path`, with `--auth-broker-path`) and refuses to start without a destination
  instead of defaulting to `./.env`. `ClassCrudClientDirect`, which builds its own connection, primes the system
  context itself; it passed only through what an auth-broker setup left in the process, and failed the
  responsible guard with a destination read from `environment.env`.
- **A test that creates and deletes its own object never touches a shared one.** `assertNotSharedDependency`
  refuses, before any request, a name listed in `shared_dependencies`: the function-include suite was
  configured onto the shared function group, which it would have created and deleted, and the views a
  BDEF suite creates are checked the same way. `deleteView` runs in cleanup whether or not the run created
  the view, so it no longer deletes a shared one — it reports it, and the run fails naming it. A BDEF suite
  whose test case lacks `root_view_name` / `root_view_source` says so, instead of `view undefined`; the
  profiling suite requires its class to be the shared, runnable one and shows the answer when no trace id
  comes back.
- **`npm run shared:setup` and `shared:teardown` fail when they cannot reach the system** or the config has
  no `shared_dependencies`. They passed, having done nothing — a green run that read as "set up".
- The release notes linked `doc/installation/…`; the workflows checked out submodules the repository
  no longer has (the empty `.gitmodules` is removed).

## [16.0.1] - 2026-10-04

### Fixed

- **`initialize` reports the installed version in `serverInfo.version`.** Every transport read
  `npm_package_version`, which npm sets only for a process it starts itself (`npm run`, `npx`);
  started by an MCP client, by `node`, or by `mcp-proxy` (as Glama's image does), the server
  answered `1.0.0` whatever was installed. `mcp-abap-adt` now reads `@mcp-abap-adt/core`'s own
  manifest, and `mcp-abap-adt-compact` reports its own version, as `--version` already did. The
  bin smoke test now checks `initialize` from an installed tarball as well.
- **`@mcp-abap-adt/core` carries `mcpName` again, so the MCP Registry can take it.** `mcpName` stayed
  in the root manifest — `@mcp-abap-adt/lib` — when the server moved to `server/`, and the registry
  reads it from the package `server.json` names. No `core` from 10.0.1 to 16.0.0 had it, and the
  registry entry stopped at 8.8.1. `docs/deployment/MCP_REGISTRY.md` now says where it lives and
  that `npm publish` precedes `mcp-publisher publish`.

## [16.0.0] - 2026-10-03

Migration: [`docs/MIGRATION-16.0.md`](docs/MIGRATION-16.0.md).

### Breaking

- **Authentication runs on `@mcp-abap-adt/auth-broker` 4, `connection` 10, `auth-providers` 5 and
  `auth-stores` 3, and the server serves exactly four authentications**: basic (HTTP or RFC), SNC
  (RFC only, no user and no password), `jwt` / `authorization_code` (browser login; an ABAP or XSUAA
  service key) and `jwt` / `none` (a token you hold). A destination that states anything else —
  `certificate`, `kerberos`, `saml` or another `jwt` grant — is refused at startup, naming the
  authentication (a `saml` destination with no grant is refused with `lacks: grantType`).
- **A `.env` states its authentication.** `SAP_AUTH_TYPE` has no default, and a `jwt` `.env` states
  `SAP_GRANT_TYPE`; without them the destination is refused (`Destination "X" lacks: authType` /
  `grantType`, with a hint to regenerate it with `mcp-auth generate-env --grant`). The `mcp-auth`
  command comes from `@mcp-abap-adt/auth-broker-cli`.
- **An XSUAA service key needs `XSUAA_MCP_URL`** in `sessions/<destination>.env`: the key carries the UAA,
  not the system.
- **An `--env` / `--env-path` `.env` is read and written back** with a renewed token,
  whatever `--unsafe` says. A destination is read once per process: a changed `.env` takes effect on
  restart. A named destination's session is read from `sessions/<destination>.env` only with
  `--unsafe`: a `jwt` / `none` token there is refused without it (`lacks: authorizationToken`, with a
  hint).
- **Nothing is looked up in the working directory.** Finding configuration where the process happens to
  start is a vulnerability: a server started inside someone else's project took their settings and
  credentials. A `.env` there is no longer read — pass `--env-path=./.env` (or `--env=<name>`, `--mcp`,
  YAML); without one there is no default destination (stdio: inspection-only). The working directory is
  gone from `getPlatformPaths` too.
- **`--auth-broker`, `MCP_USE_AUTH_BROKER` and YAML `auth-broker` are removed**; their only purpose was to
  switch the working-directory `.env` off. A leftover form stops the start, naming the form used ("was
  removed in 16.0.0 — remove it from the configuration") — drop it from client configs.
- **The master system is determined from configuration, or by a request in the cloud.** The setup-time
  master-system lookup is gone (setting a destination's context up builds no connection), and cloud versus
  on-premise is the kind the connection was built for (`SAP_SYSTEM_TYPE`, else `jwt` is cloud), never a
  guess from the URL. On-premise nothing is asked: the master system is `SAP_MASTER_SYSTEM`, or left out
  of the request when none is set. A cloud destination without
  `SAP_CLIENT` uses the system's default client.
- **A created object always carries a responsible person; the master system only when known.** The
  responsible comes from, first found: the tool's own argument (`CreateTransport`'s `owner`); the
  `x-sap-responsible` header; `SAP_RESPONSIBLE` in the destination's own `.env` (the `--env` /
  `--env-path` file or `sessions/<destination>.env`), then in the process environment; else the login —
  on-premise the destination's `SAP_USERNAME`, the `x-sap-login` of an `x-sap-url` connection (not of a
  destination request), the process `SAP_USERNAME`; on a cloud system only `systeminformation`'s user. A create (or a transport without an owner) that finds none
  (SNC or a token you hold, with no `SAP_RESPONSIBLE`) is refused before any request —
  `"error": "system_context_missing"`, naming `SAP_RESPONSIBLE`, the header and the login (or, when a
  cloud system could not be reached, saying to retry when it is available) — where it used
  to be sent with an empty or missing responsible. `CreateBehaviorImplementation`, whose adt-clients class
  is built with an empty system context, now passes the responsible and master system itself. The one
  exception is a message class: it is created with the system's own default responsible (adt-clients'
  message class create takes none, as in 15.x). The master system comes from `x-sap-master-system` (no
  tool takes it as an argument), `SAP_MASTER_SYSTEM` (destination `.env`, then process), else a cloud system's
  id; otherwise it is left out of the request, as before — never refused. Reads are unaffected. On a
  cloud connection an empty value is filled from `systeminformation` even when a host's request scope
  carries its key as `undefined`. `SAP_RESPONSIBLE` from any source now wins over every login, outside a request scope that carries
  `responsible`. The process environment is read once: a change while the server runs is not picked up. The
  `--env` file's `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` and `SAP_USERNAME` are no longer copied into the
  process environment: they are that destination's own, and over HTTP/SSE they had become every other
  destination's fallback. `getSystemContext()` no longer reports `SAP_USERNAME` as `responsible`.
- **`@mcp-abap-adt/adt-clients` is pinned to `~24.1.0`**: the refusal relies on its `protected
  systemContext` being read where a value is sent, which a minor release could change. Its service
  definition, transformation and access control builders write `adtcore:responsible=""` when the value is
  empty; the refusal is what keeps that from being sent.
- **An embedder's own cloud connection is no longer recognised by its URL.** A connection the factory did
  not build is cloud only when the server's `systemType` option or `SAP_SYSTEM_TYPE` says so; otherwise
  nothing is asked of the system, and a create without configured values is refused.
- **The browser callback port is `61001`** unless `--browser-auth-port` says otherwise (it was `5000`,
  `4000` and `4001` by transport).
- **`x-sap-destination`, `x-sap-auth-type` and `x-sap-refresh-token` are no longer read**; a direct
  connection is `x-sap-url` with `x-sap-jwt-token`, or with `x-sap-login` and `x-sap-password`.
- **`AUTH_BROKER_PATH` is one base directory** (the value is not split).
- **`DeletePackageLow` lost `connection_config`**; a connection comes from the destination alone.
- **`@mcp-abap-adt/lib` public API**: `registerAuthBroker`, `getAuthBroker`, `ConfigLoader`,
  `buildRuntimeConfig` and `AuthBrokerConfig` are gone; `AuthBrokerFactory` has a new surface
  (`defaultDestination`, `getBroker`, `settingsFor`, `getProvider`, `settle`) and needs a
  `browserStrategy`; `ConnectionContext` carries `credential: IAuthProvider`;
  `BaseMcpServer.setConnectionContext` and the three transport servers take `IDestinations`.
  `@mcp-abap-adt/core` no longer depends on `@mcp-abap-adt/auth-broker`.

### Added

- **SNC logon over RFC** (`SAP_AUTH_TYPE=snc`, `SAP_SNC_PARTNERNAME`, optional `SAP_SNC_QOP`,
  `SAP_SNC_LIB`, `SAP_SNC_MYNAME`): passwordless, through an installed SNC product such as a Secure Login
  Client. `@mcp-abap-adt/sap-rfc-lite` stays an optional dependency.
- **Every authentication and connection parameter in three forms, in one table**: CLI, YAML and, for seven
  of them, an environment variable (`--browser`, `--browser-auth-port`, `--allow-destination-header`,
  `--system-type` and the rest); precedence CLI, environment, YAML. An invalid port, enum or flag value is
  refused at startup, naming the parameter. YAML holds configuration only: a key that looks like a secret
  is refused, naming the key.
- **One connector construction, three credential sources**: a destination's provider, the request's
  headers, or a credential an embedder hands over.
- **`requestContextFromHeaders`** (`@mcp-abap-adt/lib/request-context`) and the optional
  **`IDestinations.systemContextFor`**: the request scope a request's headers state, and the responsible,
  login and master system a destination's own `.env` states. `RequestContext` gains `login` (the
  destination's `SAP_USERNAME`, or an `x-sap-url` basic connection's `x-sap-login`): the responsible when
  none is stated, on a connection that is not cloud. A resolver's `{}` means a cloud system that gave
  nothing; `null` means not asked.
- **`ListTransports`** filters by the effective responsible alone, no longer by a raw `SAP_USERNAME`.
- **Shutdown that settles**: on `SIGTERM`, `SIGINT` or the end of stdin the server stops accepting, waits
  up to 30 s for logins and refreshes in flight, and flushes every session; a secret that could not be
  stored, a login or refresh still running at the deadline, a server that did not close, or a failed settle
  exits `1` with one stderr line per fact (the destination and the error class, never a secret).
- **Destination names are vetted** before any file is read (letters, digits, `_`, `.`, `-`), and an env file
  named with `--env` / `--env-path` that does not exist is refused naming the parameter and the path.
- **Errors in the server's own words**: `Destination "X" lacks: <fields>` with a hint, and
  `Destination "X" uses <type> / <grant>, which this server does not support`; never a value read from a
  file. Under HTTP and SSE a refused credential is answered with the provider's own fixed words (status
  `500`) instead of `Internal Server Error`.

### Changed

- **The docker files documented `MCP_DESTINATION`, which no code ever read.** They now show the real ways:
  `--mcp=<name>` in the container command, YAML `mcp` through `--config`, or `x-mcp-destination` with
  `--allow-destination-header`; the compose files set `AUTH_BROKER_PATH=/app`.
- **The documentation describes the four authentications**, the parameter table, the `.env` write-back and
  the restart rule; the stale `npm install -g @mcp-abap-adt/auth-broker` and the 5000/4000/4001 port
  defaults are gone, in the help text as well.
- **The npm tarball carries no working documents**: `docs/superpowers/` is excluded from `files`.
- **The tests are type-checked in CI and in the release workflow** (#268). `npm run test:check` ran
  nowhere, so a test that used a type it did not import ran green while the type check failed; both
  workflows now run it after the build.
- **`MCP_TEST_CONFIG` names the integration-test config a run reads** (#266), so one checkout carries a
  config per system; a named file that does not exist fails the run instead of falling back to the
  template.

### Fixed

- **`x-sap-responsible` and `x-sap-master-system` are read.** They were written to the connection's
  metadata and read by nothing; they now enter the request scope over HTTP and SSE, for destination and
  `x-sap-*` connection requests alike, and a request with `x-sap-*` connection headers reads the process
  configuration too.
- **`SAP_LANGUAGE` from `--env-path` reaches the objects it creates** (#182).
  The env file goes to the auth broker's session store, which never fills
  `process.env`; the launcher bridged six system-context keys from it and not
  the language, so every object created through such a session took the
  library's default language. The bridge now lives in `@mcp-abap-adt/lib/config`
  (`hydrateSystemContextFromEnvFile`, `ENV_FILE_CONTEXT_KEYS`) and carries
  `SAP_LANGUAGE`; a value already in the process environment still wins. The
  responsible and master system are no longer among its keys: they are read
  as the file's destination's own (see Breaking).
- **`SAP_SYSTEM_TYPE` in the `--env` / `--env-path` file beats YAML `system-type`.** The argument
  parser wrote the YAML (or CLI) system type into the process environment before the env file was
  read, and the file's value, which never replaces one already set, was lost: YAML `cloud` beside
  `SAP_SYSTEM_TYPE=onprem` in the file built the cloud connector. The precedence is now resolved after
  the file joins the environment, as for the connection type: the CLI, then the environment (the file's
  value included, never over one set before), then YAML. A word in the environment that is not
  `onprem`, `cloud` or `legacy` stops the start, naming the key without quoting it.
  `ArgumentsParser.parse()` and `ServerConfigManager` (`@mcp-abap-adt/lib/config`) no longer write
  `SAP_SYSTEM_TYPE` into `process.env`: an embedder that parses the configuration itself reads
  `systemType` / `systemTypeSource` from the parsed config.
- **The login URL reaches stderr without `DEBUG_AUTH_LOG`.** The browser strategy prints the URL to
  open (`--browser=none` / `headless`, or `auto` when it could not open one) through the broker's
  logger, which is silent unless `DEBUG_AUTH_LOG=true`: the user never saw it and the login timed out.
  The strategy now gets a logger whose prompts are lines on stderr always; its warnings, errors and
  debug lines stay behind `DEBUG_AUTH_LOG`. Nothing goes to stdout.
- **`GetInactiveObjects` reads the older document and keeps a function module's group** (#266).
  BASIS 7.40 answers `adtcore:objectReferences`, which the reader did not know: it answered `count: 0`
  over inactive objects. It now reads that document, refuses a root it does not know instead of
  answering an empty list, and gives each entry its `parentName` (the group of a function module, from
  `adtcore:parentUri`), so the entry can be handed to `ActivateObjectLow` as it is.
- **The shared test setup activates a function module through its group** (#266). The module's own name
  stood in the group's place in the address, and the whole activation batch answered
  `500 invalidFunctionGroup`.
- **Enhancement types ADT does not expose are named as such** (#267). `GetEnhancementSpot` on a plain
  enhancement spot, and `GetEnhancementImpl` on a class enhancement, answer that the object is not
  available through ADT (Eclipse opens it in SAP GUI) instead of passing a raw `500` on; a BAdI
  implementation is answered as having no source, and a source code plugin asked under a spot name
  gets the hint to read it with `enhancement_spot "enhoxhh"`. A plugin read under `enhoxhh` that
  fails keeps its own failure. What worked keeps one request and its answer.

## [15.1.0] - 2026-10-01

### Added

- **Compact reads: search, where-used, data and a package's contents** (#259).
  Compact serves a host without a pipeline of its own, and these are ordinary
  investigation steps it could not take at all: the command launches without the
  search group, and nothing routed where-used or data.
  - `HandlerSearch` — objects by name or mask, optionally by type, capped.
  - `HandlerWhereUsed` — the objects that use one object, capped with the total
    kept (on premise, a standard class answered 107,141 references); a function
    module is addressed under its group.
  - `HandlerGetData` — rows of a table or CDS view, or what an ABAP SQL
    `SELECT` names with its columns, conditions and order.
  - `HandlerGet` `part: contents` for a `PACKAGE` — its members, one line each:
    name, type, description, capped by `max_results` (default 100) with the
    total said (a package of 257 members on premise: 11,260 characters, against
    45,705 as the core reader's JSON; the trial's top-level local package lists
    11,619 entries and answers 100 of them in 3,491 characters).

  All four read, so they live in `compact-readonly` and serve `--exposition=ro`
  as well: compact is 25 tools, 16 of them read-only.
- **Dumps filtered by what they are about** (#261). `RuntimeListFeeds` with
  `feed_type: dumps` and compact `HandlerDumpList` take `runtime_error`,
  `exception`, `object_name`, `package` and `component` (each `contains`)
  beside `user` (`equals`), `from` and `to` — sent as one `$query` on the
  attributes the dumps feed's descriptor declares. `contains` ignores case: on
  the BTP ABAP environment (2026-10-01) three spellings of one runtime error
  matched the same dumps, 66 of 200, and an unknown one none. A value with a blank, a
  comma or a parenthesis is refused before the request, and a dumps filter on
  another feed is refused rather than dropped. Needs `@mcp-abap-adt/adt-clients`
  24.1.0.
- **Every dump entry carries its `dump_id`**, the id `RuntimeGetDumpById`
  takes; that tool accepts the entry's URI as well.
- **`GetUnitTestResult` in the `readonly` group too.** Fetching an ABAP Unit
  run's result by its `run_id` only reads, so a read-only caller may do it. It
  is a copy of the `high` tool — the same name, schema and handler — and stays
  in `high`.

### Changed

- **A feed list follows SAP's pages** (#261). SAP answers at most 100 entries
  per feed request whatever `$top` asks (the descriptor declares `paging
  max="100"`; `$skip` is ignored) and offers the next page as a `rel="next"`
  link bounded by `to`. `max_results` (compact: `top`) now reads page after
  page up to the count asked, at most 1000, and answers `next_to` when more
  remain — pass it back as `to` to read on. Without a count it reads 50, the
  feed's own page size, the same way. `to` is inclusive: a page starts
  with the entries of the previous page's last second again (four on one
  boundary on the BTP ABAP environment, 2026-10-01), so an entry is answered
  once, and a page asks for its repeats as well as the entries still wanted.
  Nothing is remembered between calls, so an answer never ends inside a
  second: it holds entries newer than `next_to`, and reading on from it starts
  with that second whole — nothing repeats, nothing is skipped. An answer may
  therefore hold a few entries fewer than asked. A second holding more entries
  than asked is answered whole instead, more than asked, and reading on starts
  from the second before it; SAP pages by time alone, so a second holding more
  than one request's 100 is answered as far as SAP gives it and named in
  `incomplete_second`.
- **A dump's summary is the dump's own root** (#261). `RuntimeGetDumpById`'s
  `summary` is read from the default view's `dump:dump` attributes — runtime
  error, exception, title, terminated program, time, user — and the source
  position where it terminated, from the `…/runtime/dump/termination` link,
  whose `adt://<system>` prefix is dropped so the URI is the ADT path. It picked keys by name out of the whole
  document before, and answered chapter titles. Compact `HandlerDumpView`
  `view: summary` answers that summary alone; ADT's own summary view answered
  a document without the root.
- **`GetPackage` and `ReadPackage` answer a summary of the package** — name,
  description, type, super-package, software and application component,
  transport layer, ABAP language version, responsible, and the number of
  sub-packages; with `detail: full` every sub-package by name and description
  as well; and the metadata document itself with `detail: raw`. The
  document carries every sub-package: a top-level package answered about
  950,000 characters on the cloud trial (5,815 sub-packages, no member object),
  which an MCP client refused, and `ReadPackage` sent it twice. The same package
  now answers 327 characters (`sub_package_count: 5813`); on premise a
  structure package with 1,222 sub-packages answers 351.
- **A tool present in two groups is exposed once, from `high`.** When a
  readonly tool shares its exact name with a tool of an exposed `high`/`low`
  group, `ReadOnlyHandlersGroup` withholds its own copy, whatever dedup
  strategy is passed — one server cannot register two tools under one name.
  `readonly` alone → from `readonly`; `readonly` + `high` → once, from `high`.
  `HandlerExporter` now hands the read-only group the high/low names as well
  (with `NoDedupStrategy`, so it still lists `Read<X>` beside `Get<X>`), and
  `tools/generate-tools-docs.js` documents such a copy under Read-Only.

## [15.0.0] - 2026-09-30

### Changed — BREAKING

- **ABAP Unit tools are one simple operation per test carrier.** A tool does one
  thing to one kind of object, with the fewest parameters that say which; a
  general tool with an object type and a dozen optional parameters is harder for
  a model to call right and for a tool search to find. On adt-clients 24, which
  runs tests per object type.

  | carrier | write the tests | run them |
  |---|---|---|
  | class | `CreateUnitTest`, `UpdateUnitTest`, `DeleteUnitTest` (`class_name`, `test_class_source`) | `RunUnitTest` (`class_name`) |
  | CDS view | `CreateCdsUnitTest` (view check, test class, tests — one call), `UpdateCdsUnitTest`, `DeleteCdsUnitTest` | `RunCdsUnitTest` (`class_name`) |
  | report | `CreateProgramUnitTest`, `UpdateProgramUnitTest` (`program_name`, `test_class_source`) | `RunProgramUnitTest` (`program_name`) |
  | function group | `CreateFunctionGroupUnitTest`, `UpdateFunctionGroupUnitTest` (`function_group_name`, `test_class_source`) | `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest` |

  Every `Run*` starts the run, waits for it within a bound and answers the
  result; a run that outlasts the bound answers its `run_id`, and
  `GetUnitTestResult` fetches the result later. Every write locks, writes,
  unlocks and activates. A report's tests go into a test include the tool
  creates in the report's package and pulls into the report; a function
  group's into a test include whose `INCLUDE` ADT adds to the group itself.
  Measured on premise (2026-09-30) through all four integration suites, soft
  and hard mode.

### Removed — BREAKING

- **`GetUnitTest`, `GetUnitTestStatus`, `GetCdsUnitTest`,
  `GetCdsUnitTestStatus`, `GetCdsUnitTestResult`.** A `Run*` tool answers the
  result itself; `GetUnitTestResult` answers about any run by its id, whatever
  started it. The functions stay exported from `@mcp-abap-adt/lib` for the
  compact facade, which keeps its granular status and result tools.
- **The low-tier unit-test tools** — `RunClassUnitTestsLow`,
  `GetClassUnitTestStatusLow`, `GetClassUnitTestResultLow`,
  `LockClassTestClassesLow`, `UnlockClassTestClassesLow`,
  `UpdateClassTestClassesLow`, `ActivateClassTestClassesLow`. The lock pair
  addressed members adt-clients 24 no longer has.

### Migration

- `CreateUnitTest` used to **start a run** (`tests[]`); it now writes a class's
  tests. To run them call `RunUnitTest` with `class_name`.
- `RunUnitTest` takes `class_name` instead of `tests[]` and answers the result,
  not a run id to poll.
- `UpdateUnitTest` and `DeleteUnitTest` took a `run_id` and always failed; they
  now take `class_name` (and `test_class_source` for the update).
- `CreateCdsUnitTest` now also writes the tests (`test_class_source`) and
  activates the class; `description` is gone.
- Instead of `GetUnitTest`/`GetUnitTestStatus`/`GetCdsUnitTest*`, read the
  `Run*` answer; for a run that had not finished, `GetUnitTestResult` with its
  `run_id`.
- `GetUnitTestResult` takes `run_id` alone: `with_navigation_uris` and `format`
  left the tool (the compact result facade still takes them).
- Compact: `HandlerCreate`/`HandlerUpdate` for `UNIT_TEST` take `class_name`
  and `test_class_source`, and `HandlerDelete` takes `class_name` (they took
  `tests[]` and `run_id`); `HandlerUnitTestRun` and the status and result
  facades are unchanged.
- Integration config: the unit-test cases changed and two were added
  (`program_unit_test`, `function_group_unit_test`) — copy them from
  `tests/test-config.yaml.template`.

### Changed

- **Eleven tool descriptions say what the tool does, and nothing else** — no
  denials, no other tools' names, no protocol notes. A description is read by a
  model and indexed by a tool search, and every word it carries pulls the tool
  toward queries with that word. `GetWhereUsed`, `ReadFunctionModule`,
  `GetFunctionModule`, `RuntimeListFeeds`, `CreateServiceBinding`,
  `CreateServiceDefinition`, `GetLocalTestClass`, `UpdateLocalTestClass`,
  `DeleteLocalTestClass`, `AddTransportObject`, `RemoveTransportObject`; and the
  `transport_number`, `object_name` and `position` parameters of the two
  transport tools. The `…LocalTestClass` tools describe the include they read
  and write; "the unit tests of a class" belongs to the ABAP Unit test tools.
  No name, schema or behaviour changed.

## [14.1.2] - 2026-09-30

### Fixed

- **Publishing an OData V2 service binding could not succeed.** `UpdateServiceBinding`
  took `service_name` and `service_version` — `service_name` is required on the tool
  surface — and dropped both, because the library had nowhere to put them. A V2
  publication job resolves the service from them, so the job answered `200` with
  `SEVERITY ERROR` naming an EMPTY service and version `0000`: *"Activating Local
  Service Endpoint of service ␠ with version 0000 failed"*. The binding was active and
  `srvb:allowedAction` named the very action asked for.

  `@mcp-abap-adt/adt-clients` `^23.0.5` (was `^23.0.4`) takes them per protocol, so
  this handler now passes them for `odatav2` and not for `odatav4`, where the request
  names its target on its own. Measured there on **all four binding variants**: both
  V2 ones refuse without the fields and succeed with them, both V4 ones succeed
  without them — so the axis is the protocol, not the UI/Web API category. See that
  package's ERRATA, *"A V2 publication job resolves the service by name and version"*.

  The two parameter descriptions said the job "no longer carries" these fields. It
  carries them again for V2, and they now say which protocol uses them and that V4
  ignores them.

  Found while removing the probe objects from #248: two V4 bindings unpublished
  through this tool and the V2 one did not, which made the comparison single-variable.

- **A binding anybody had open could not be published or unpublished at all.**
  `UpdateServiceBinding` passed `analyseLock` to its LOCK, so the `403` that means
  *an editing session holds this binding* was a refusal: *"User … is currently
  editing ZMCP_E2E_V2"*. adt-clients' ERRATA is explicit that this one `403` is to
  be ignored — the publication job needs no lock of the caller's, and Eclipse posts
  it after its own LOCK's `403` — and names the strategy for it,
  `analysePublicationLock`, which answers a lock without a handle instead.

  **But `analysePublicationLock` alone would have opened a second hole**, found in
  review: it forgives by STATUS — `403` — and is built on `analyseException`, which
  sees only documents. A `200` naming no lock handle is therefore no failure to it
  either, and the caller is handed the same empty handle as for the `403`. A login
  page on an expired session is a `200`, so "publish when there is no handle" would
  publish after a lock that never happened — exactly the check `analyseLock` had
  been doing.

  So the handler passes its own composed strategy, `analysePublicationLockAnswer`:
  `analyseLock` first, so a `2xx` without a handle stays a refusal, and the `403`
  forgiveness after it. An empty handle then means one thing only, which is what
  lets the handler publish without a handle and send no UNLOCK — there is nothing to
  release. `withLock` is untouched.

  Measured the hard way. A publication whose client gave up at 120 s — the job takes
  ~133 s — left the lock behind, and the unpublish that followed was refused. With
  the two changes the same call went through, and the wire shows both fixes at once:

      POST …/bindings/zmcp_e2e_v2?_action=LOCK&accessMode=MODIFY  -> threw 403
      POST …/businessservices/odatav2/unpublishjobs
      params {"servicename":"ZMCP_E2E_V2","serviceversion":"0001"}

## [14.1.1] - 2026-09-29

### Fixed

- **The documented way to generate a `.env` from a service key did not run.** Four
  places told a reader to install `@mcp-abap-adt/connection` and then invoke
  `mcp-auth auth -k <service-key>` — a command from a different package, with flags
  it does not have. Measured: `mcp-auth auth -k …` answers `Unknown command: auth`.
  Two more places, the runtime help in `utils.ts` and the launcher's, named
  `sap-abap-auth` instead, which is coherent — `@mcp-abap-adt/connection` really does
  ship that bin, and it really does still work — but it is the superseded path: token
  handling moved to `@mcp-abap-adt/auth-broker`, which is a direct dependency here and
  ships `mcp-auth` and `mcp-sso`.

  All six now say the same measured thing:

      npm install -g @mcp-abap-adt/auth-broker
      mcp-auth --service-key path/to/service-key.json --output .env

  Worth naming because half of this was in the RUNTIME help — what a user reads when
  the connection failed, which is the worst moment to hand them a command that does
  not exist. Reported from the README; both halves were wrong, in different ways, and
  neither would have been found by fixing only the name.

## [14.1.0] - 2026-09-29

### Added

- **`GetServiceBindingPreviewUrl` — the browser URL for a published service binding,
  which no document carries.** ADT's Preview button does not ask the server for a
  URL: it builds one, and the path segment after `feap/` is not a token but a
  `##`-joined descriptor of the service, shifted by 20 (0x14) and percent-encoded as
  UTF-8 — which is why bytes above 0x7F arrive as `%C2%XX`. The rule was derived from
  a URL Eclipse produced for an on-premise V2 binding and **verified by re-encoding
  it byte for byte**; that pair is the fixture in `feapDescriptor.test.ts`, and the
  handler test asserts the tool reproduces that exact URL.

  What it reads, and why each one is needed, all of it measured rather than assumed:

  | descriptor part | where it lives |
  |---|---|
  | service | `srvb:services/@srvb:name` — **not** the service definition: a trial binding answered `services="ZUI_TRAVEL"` with definition `ZTRAVEL_SD` |
  | version | `srvb:content/@srvb:version` (`minorVersion`/`patchVersion` belong to neither URL) |
  | protocol | `srvb:binding/@srvb:version`: `V2` → `odatav2`, `V4` → `odatav4` |
  | entity set, target | `expose … as <alias>` in the service definition — the ALIAS is the entity set |
  | navigation | an association or composition of the exposed root view |
  | annotation service | `<service>_VAN`, the generated Gateway Vocabulary Annotation (object type `IWVB`) |

  **Of the segments, the server reads two — and that was measured, not assumed.** The
  page at `…/feap/<segment>/flp.html` is static; the resource that decodes the
  descriptor is `<segment>/manifest.json`, reachable with the ordinary ADT token,
  which is how every claim below was settled without a browser. Asking one descriptor
  after another on a trial (OData V2): the **service** becomes the manifest's service
  `uri`; the **entity set** becomes `ListReport|<entitySet>`, and a bogus one answers
  a list report with no page under it. The navigation, the target entity set and the
  `_VAN` segment are **not read** — empty, bogus and plain wrong values all answered
  the same nested page, because the server derives the navigation from the service's
  metadata, and it normalises the CDS name while doing so (`_children` came back as
  `to_children`). So only the entity set is required; the other segments are still
  filled, because that is the shape Eclipse produces.

  **It still refuses to invent what it cannot read.** Without an entity set there is
  no `preview_url` — the answer carries `missing`, the entity sets to choose from, the
  service and `$metadata` URLs, and, when the binding is unpublished, a note saying
  nothing answers until it is. A URL with one guessed segment is indistinguishable
  from a working one until it opens nothing.

  **OData V4 is a different descriptor**, and the first version of this shipped the V2
  one for both. Seven parts, the service's URL PATH first and the BINDING last:

      /sap/opu/odata4/sap/<binding>/srvd/sap/<service>/<version>/##Root##_children##Child##<service>##<version>##<binding>

  Decoded from two URLs Eclipse produced for one binding — its root entity set and its
  child — and both are byte-exact fixtures. Part 5 is the service (a wrong one answers
  `200` with the nested pages gone), part 7 the binding (the service there answers
  `401`, the authorisation check reads it); the navigation is not read here either. A
  V4 binding has no `_VAN` object at all: publication creates a service group
  (`SCO2`/`SIA6`), no `IWVB`.

  **On BTP the preview opens on the browser host.** `<id>.abap.<region>.hana.ondemand.com`
  serves ADT and answers a browser `401 WWW-Authenticate: Basic` — unanswerable, since
  the credential is a propagated token and the bearer header a pasted URL cannot carry;
  `<id>.abap-web.<region>.hana.ondemand.com` serves the BTP logon and then the page.
  So `preview_url` carries the `abap-web` host and the service URLs keep the ADT one.
  On premise there is no such split and nothing changes.

  **`client` and `language` are not the caller's to supply.** They come from
  `/sap/bc/adt/core/http/systeminformation`, which this server already reads for a
  request's system context, so the URL ends `…&sap-ui-language=EN&sap-client=100` by
  itself. The parameters remain as overrides and an empty `client` suppresses it. The
  lookup cannot fail the tool: that endpoint answers `null` where absent but THROWS
  otherwise, so a failure is reported in `note` beside a URL that is still answered.

  **The service URL is read from ADT when ADT names one.**
  `…/businessservices/<protocol>/<BINDING>?servicename=…&serviceversion=…` is what the
  Service Binding editor reads for its own "Service URL" field; when it answers, that
  answer wins and `service_url_source` says `system`, otherwise the composed URL
  stays and says `composed`. Measured on a trial it answers empty even for a service
  whose `$metadata` answers `200`, so it only adds information.

  **A Web API binding has no preview at all** — `srvb:binding/@srvb:category` is `0`
  for UI and `1` for Web API — and says so, with the service and `$metadata` URLs,
  instead of carrying a FEAP URL that opens nothing.

  The exposed root view is read only when a navigation is wanted and none was given,
  so the usual cost is two requests. A projection spells its navigation a third way —
  `_children : redirected to composition child X` — which the first version did not
  read, and answered `associations: []` for a view that has one.

- **`part` on the compact `HandlerGet`: `source`, `metadata` or `urls`.** Compact is
  one tool per OPERATION, so "which aspect of this object" is an argument of the read
  rather than a twenty-third tool — and it is the same parameter the object-oriented
  tiers still lack, where eight `Get*` tools fetch a metadata document and discard it
  while the `Read*` that would answer it is hidden by the Read-vs-Get dedup.

  `metadata` routes to the readers that actually return the document (sixteen object
  types have one); `urls` routes to `GetServiceBindingPreviewUrl` and therefore exists
  for a service binding alone, which is the honest size of it.

  **A part the type does not offer is refused by name, never substituted.** Asking for
  `urls` on a class answers `part=urls is not available for object_type=CLASS. It
  offers: source, metadata.` — the refusal carries what to ask instead, and answering
  the source would be a success meaning something other than the question. The refusal
  is returned the way the router returns an unsupported operation, so both paths
  through the surface have one shape. A missing `object_type` stays the router's own
  refusal rather than gaining a second voice.

  `@mcp-abap-adt/lib/handlers/read` grew from 35 to 54 exports for this: the metadata
  readers and the preview tool. The read-only half still reaches no write route —
  `compactCapabilitySplit` checks that against the import graph, not the intention.


### Fixed

- **Hard mode could not start the server at all.** The integration harness spawned it
  with `--exposition=readonly,high,low`, and `high` and `low` are mutually exclusive —
  correctly so — which `validateExposition` refuses, so the launcher exited before
  serving anything: `Invalid exposition: 'high' and 'low' are mutually exclusive`. Hard
  mode is the only mode that proves the server starts and registers its tools, so it
  was the one check that could not run. It went unnoticed because it is opt-in: soft
  mode, the default for mass regression, calls handlers in-process and never spawns
  MCP. The exposition is now a config key, `integration_hard_mode.exposition`,
  defaulting to `readonly,high`; one run covers one tier and `readonly,low` serves the
  other. Asking for both was never a test of anything.

- **The `--exposition` help advertised a combination the launcher refuses.** The
  examples listed `readonly,high,low (all handlers)`, so a reader who followed the
  documentation got a startup error. They now list `readonly,low` and say in one line
  that no value serves every handler at once.


## [14.0.1] - 2026-09-28

### Fixed

- **The help text described a surface neither command has, and the compact command
  had no exposition of its own.** 14.0.0 moved the facade out and taught
  `validateExposition` to refuse `compact`, but `--help` still listed it among the
  sets — `--exposition=compact        (compact facade only)` — and
  `mcp-abap-adt-compact` printed that same help, offering `readonly`/`high`/`low`,
  which it does not serve, under a USAGE line naming the other command.

  - `mcp-abap-adt --help` lists `readonly, high, low`, and says in its place that the
    compact facade is its own command with its own default.
  - `mcp-abap-adt-compact --help` names itself in USAGE and documents **its** sets.
  - **`mcp-abap-adt-compact --exposition=ro|rw`**: `rw` is the default — all 22
    tools, every access, which is what a local server gives — and `ro` serves the 13
    that change nothing. `ro` is not a filter over one list: no create, update,
    delete, activate, lock, unlock, unit-test run or profiler run is IN the list, so
    a client cannot call one (verified from installed tarballs: 22 tools with 9
    writes against 13 with 0). A set of the object-oriented surface is refused by
    name, pointing at `mcp-abap-adt`.
  - `ServerConfigManager.generateHelp` takes `program` and `expositionSection`, so a
    sibling command documents its own vocabulary instead of inheriting one that does
    not apply.

  - **An empty value is refused, not defaulted.** The first version treated "no
    flag" and "flag with nothing in it" alike, so `--exposition="$MODE"` with an
    unset variable opened all 22 tools — writes included — and
    `--exposition=ro --exposition=` overrode a deliberate `ro` the same way (found in
    review). The default belongs to an ABSENT flag; a flag that is present but says
    nothing is a caller who meant something and lost it in a shell, so it fails at
    startup. `--exposition` with a following flag rather than a value counts as empty
    too.

  Two mistakes of mine while writing this, both caught before release: the first
  version REFUSED `--exposition` on the compact command instead of giving it `ro`/`rw`
  (the user's correction), and the `ro` branch first wrapped the entries in an object
  literal, which closes over the startup context — the P1 from PR #240 review, in a
  new place. It builds a real `CompactReadOnlyHandlersGroup` now, so the per-request
  context reaches the handlers.


## [14.0.0] - 2026-09-28

Migration: [`docs/MIGRATION-14.0.md`](docs/MIGRATION-14.0.md).

### Changed

- **The compact facade left `lib` for three packages of its own.** It exists for a
  host that cannot build a retrieval pipeline — a small context, no tool-RAG, no way
  to select tools per request — and must still drive ABAP through MCP. Such a host
  needs a tool list short by construction, and a package whose default IS that list
  cannot be misconfigured into something else.

  | package | carries | bin | licence |
  |---|---|---|---|
  | `@mcp-abap-adt/lib` | handlers, registries, embeddable — **minus** the compact tools | no | Apache-2.0 |
  | `@mcp-abap-adt/compact-readonly` | the 13 compact tools that change nothing | no | Apache-2.0 |
  | `@mcp-abap-adt/compact-modify` | the 9 that write, lock, activate or execute | no | Apache-2.0 |
  | `@mcp-abap-adt/core` | transports, launcher, `mcp-abap-adt` | yes | AGPL-3.0-only |
  | `@mcp-abap-adt/compact` | the compact server, `mcp-abap-adt-compact` | yes | AGPL-3.0-only |

  Versions move in lockstep: the compact packages are one decomposition of the same
  `lib`, and independent numbers would create combinations nobody has run.

- **`core` no longer serves `--exposition=compact`.** The value is recognised and
  refused, naming the package that serves it — a configuration asking for a tool
  list it will not get should fail at startup rather than start with tools missing.
  This breaks nobody in practice: the consumer that drives this repo indexes all the
  tools itself and never wanted the facade, and whoever does want it installs the
  command.

- **One launcher, two commands.** `main()` in `@mcp-abap-adt/core/launcher` is
  exported and takes `extraGroups`, `exposition` and `includeSearch`, so
  `mcp-abap-adt-compact` is a twenty-line bin over the same configuration,
  transports and auth rather than a second copy of four hundred lines. It self-starts
  only when it is the program, so an import does not start a server, and each bin
  calls `main()` itself. `--version` on the compact command answers the compact
  package's version, not core's.

### Added

- **`@mcp-abap-adt/lib/handlers/read` and `/write`** — the 35 and 69 handler
  functions the facade routes to, in halves, because one barrel of all 104 would
  relink every write route into `compact-readonly` and defeat its own split.
  `@mcp-abap-adt/lib/compact-shared` exports the facade's kernel: object types, the
  CRUD matrix, the schemas, the lifecycle helpers and `dispatchCompact` — data and
  dispatch, no handler, which is what makes it shareable by both halves.

- **The capability split is asserted against the module graph, across packages.**
  `compactCapabilitySplit.test.ts` walks the imports from each package's entry —
  relative files AND bare specifiers — and holds that `compact-readonly` never names
  `@mcp-abap-adt/lib/handlers/write` or the modifying package, that its manifest
  declares only `lib` as a dependency, that the modifying half DOES reach the write
  routes (so a split that lost them fails too), and that each of the 22 tool files
  belongs to exactly one half.

- **The compact surface has its own frozen fixture and its own generated page.**
  `lib`'s `surface.json` lost 22 rows; they moved to `compact/tests/fixtures/`, where
  `compactSurface.test.ts` freezes them from the packages' entry builders — a ratchet
  that loses its subject silently is worse than no ratchet. `compact/docs/AVAILABLE_TOOLS.md`
  is generated from the BUILT packages (`npm run docs:tools` in `compact/`), refusing
  a stale build, and `lib`'s generator no longer writes a compact page.

- **`binSmoke` covers the third bin.** It packs all five packages, installs the
  tarballs into an empty directory and runs both commands: `mcp-abap-adt --version`
  answers core's version and `mcp-abap-adt-compact --version` answers compact's.


## [13.1.0] - 2026-09-28

### Changed

- **No parameter description names a transport request, and nothing in the tree
  names the system it was measured on.** The rule is the user's and it is about
  agnosticism, not retrieval: *we do not know who will use this, where, or how, so
  we state only what we know.* A tool's text says what the tool does and what its
  parameters mean; a request number from somebody's landscape is not part of that.

  - **78 transport-number literals removed from parameter descriptions**, across 78
    files — one real request 73 times, four more once or twice each. `Transport
    request number (e.g., …). Required for transportable objects.` now reads
    `Transport request number. Required for transportable objects.`, and the three
    transport tools whose text turns on the request/task distinction keep the
    distinction and lose the example. The worst case was not retrieval: an example
    request number is a value a model can copy into a write, and it addressed a
    real transport.
  - **The system id is gone from the whole tree** — descriptions, code comments,
    test comments, test data, captured fixtures, the installation guides, the test
    template and this changelog's own history. What a measurement note knows is the
    platform and the date, so `on E19 (2026-09-26)` reads `on premise
    (2026-09-26)`, and `Measured on E19 (BASIS 816) and E98 (BASIS 756)` reads
    `Measured on BASIS 816 and on BASIS 756` — the release is the fact that
    mattered. `--env=…/e19.env` reads `--env=…/your-system.env`; a `SAP_MASTER_SYSTEM`
    example reads *the three-character SID*; captured fixtures carry `SID`, beside
    the `SAPUSER01` they already carried. Test data keeps its numbers under a
    placeholder prefix (`SIDK9…`), so every assertion still pairs with its input.
  - One of these was a live defect rather than a wording problem:
    `GetNodeStructureLow`'s `node_id` description explained `"0000"` by naming the
    system that answered an empty body for it.
  - **And then every other name went with them: 255 of 370 tools, 350 parameter
    descriptions, 169 distinct strings.** `Class name (e.g., ZCL_MY_CLASS).` reads
    `Class name.`; `Package name (e.g., ZOK_LOCAL, $TMP for local objects).` reads
    `Package name.`; `Optional for local objects ($TMP).` reads `Optional for local
    objects.` — ABAP Cloud has no `$TMP` anyway. Constraints that change the call
    stay word for word ("must already exist", "required for validation", "start
    with Z or Y", the REQUEST/TASK distinction). What goes is only the example.
    A couple needed a sentence rather than a deletion: the software component no
    longer names two components, and the search pattern explains `"*"` as a prefix
    match instead of listing masks.
  - **Naming rules left with the names, and so did the CTS lesson.** A tool works
    with any object the caller is authorised for, whatever it is called, so "must
    follow SAP naming conventions", "start with Z or Y", "for the customer
    namespace", a behaviour pool's conventional name and the worked ABAP snippet in
    the function-module source parameter are all gone (28 descriptions). The
    consumer's skill carries the naming rules and answers for the validity of what
    it sends. The same cut trimmed 104 `transport_request` descriptions: `request`
    is a word a description may use, a number never is, so the text keeps `not a
    task` — the one fact that decides whether this call succeeds — and drops how CTS
    works, which tool to call after it, and `CTS_WBO_API 020` / `SADT_RESOURCE 017`.
    What stays is a limit that says what fits in the parameter ("up to 26
    characters", the field-label lengths) and the transport tools' own text, where
    request against task IS the subject of the tool.

### Fixed

- **The tool docs now show the text the model receives, not the text a regex could
  parse out of the source.** Three reviewer findings on PR #244 were one defect in
  three costumes: a Zod `.description` is a prototype getter and was invisible; a
  description built as `'…' + '…'` was cut at the first literal; a template literal
  printed `${commonObjectTypeSchema.description}` verbatim, because no regex
  evaluates an interpolation. `generate-tools-docs.js` keeps the source parse for
  structure — which tools exist, their files, tiers and schema shape — and takes
  every description from the BUILT definitions through `HandlerExporter`, the same
  strings a consumer's RAG indexes. Beside the interpolation, this filled in five
  compact parameters that were documented as empty because their schema is a
  shared constant the regex could not follow.

  **And reading `dist` is only correct while `dist` is current, so that is checked
  rather than assumed.** A reviewer edited `DeleteClass`'s description, ran
  `docs:tools` and got success with the previous text in the documents, because the
  script did not build. `docs:tools` now builds first, and the generator refuses to
  run when `dist` is missing or older than any source file, saying how far behind it
  is and what to do. The check throws rather than exiting: a unit test requires this
  module, and a generator that kills the process from inside a test run is its own
  defect. The "fall back to the parsed text" path is gone — it was the mechanism
  that let wrong text look like success.

- **The generator dropped everything after the first string literal of a
  concatenated description.** It reads source with regexes rather than importing
  the built definitions, and the pattern stopped at one literal — so five tools
  lost a whole sentence each from the generated docs: the legacy refusal notes on
  `GetCdsUnitTest`, `GetCdsUnitTestStatus`, `CreateCdsUnitTest` and
  `GetStructuresList`, and the polling bound on `GetCdsUnitTestResult`. What made
  it visible was cosmetic — `git diff --check` flagged two trailing spaces, which
  were the seam where the text had been cut (found by a reviewer on PR #244). The
  generator reads the whole `+` chain now, in the tool description and in every
  parameter description.

### Added

- **The description ratchet covers parameter descriptions too, in every class.**
  `toolDescriptionsCarryNoLiterals.test.ts` checks every `description` anywhere in
  an input schema, not only the tool's own text: three classes (a package, a
  customer-namespace object, a transport number) over both, six assertions. The
  transport class carries two shapes — `<SID>K9…` and a plain letters-and-digits
  number like `ER121235`, named by the user — and a message number, a release and a
  short SAP code (`CTS_WBO_API 020`, `BASIS 816`, `TK127`) sit in the self-check as
  text that must stay allowed. Two more refinements came out of running it:
  - **A format placeholder is not a name.** `YYYYMMDDHHMMSS` matched the
    customer-object pattern on its leading `Y`; a token built only from the letters
    of a date is allowed by rule, and the self-check states it.
  - **The generated prefixes count.** A function group's includes are `L<group>…`
    and its main program `SAPL<group>`, so the customer name starts one character
    in. The first pattern missed `LZOK_FG_MCP01F01` in five descriptions and the
    widened one found them — the ratchet caught what the sweep did not.

  **And it read one shape of schema only, which a reviewer found.** Eight tools
  declare a flat map of Zod fields rather than JSON Schema — no `properties`
  wrapper, and in Zod 4 `.description` is a getter on the prototype, so
  `Object.entries` never saw it. `CreatePackage` and seven others were not checked
  at all: the literal was put back into `CreatePackage`'s `transport_request` and
  every assertion stayed green. The walker now reads `description` by access
  instead of by enumeration and recurses through Zod's wrappers, and the coverage
  guard asserts PER TOOL — the only tools with no parameter text are the two that
  take no parameters (`TAKES_NO_PARAMETERS`), because a total of ">500" hid a whole
  shape reading as zero. Two things the fix immediately caught: `SearchSource`'s
  `packages` named a package and a prefix mask in its examples, and
  `ListServiceBindingTypes`' `response_format` was a bare enum with no description
  at all.

## [13.0.2] - 2026-09-28

### Fixed

- **A tool description is search text, and an incidental literal in it retrieves
  the wrong tools in bulk** (#241). *"Transport request optional for `$TMP`
  objects"* sat in 30 `Delete*` descriptions, so any request mentioning `$TMP`
  pulled the delete tools into the top of a consumer's tool-RAG. Measured in
  cloud-llm-hub's retrieval — two collections, 0.7/0.3 fusion, translation, k=15,
  developer role:

  | query | `Delete*` in the top 15, before | after |
  |---|---|---|
  | "Які пакети в $TMP маємо?" | 12 | 1 |
  | "Create class … in package $TMP" | 3, `CreateClass` third | 1, `CreateClass` second |
  | create CDS / program / update in `$TMP` | 3–4 | 1–2 |

  The wording without the literal was never worse on any query.

  `$TMP objects` reads `local objects` now, which is also the more accurate
  sentence: ABAP Cloud has no `$TMP` at all. The other incidental literals went
  with it — a sample mask in `SearchObject`, a message class in
  `ReadMessageClassMessage`, a namespace example in `SearchSource`. Parameter
  descriptions are untouched here: the calling model reads them, retrieval does
  not index them, and the literals in them are a larger replacement of their own
  (254 of 370 tools, 464 occurrences — the follow-up).

### Added

- **`toolDescriptionsCarryNoLiterals.test.ts` — the rule is kept by a test.** No
  tool description names anything concrete: a package (`$TMP`, `$ANY`), a
  customer-namespace object or prefix (`ZCL_DEMO`, `ZOK*`, `YFOO_BAR`), or a
  transport number. A bare mask names nothing and stays allowed — `Z*`, `Y*`,
  `/NS/Z*`, any-namespace — and the test's own self-check pins both lists, so
  neither a new literal nor a regex tightened against a legitimate mask passes
  silently.

  Ranking is not what it measures: that is measured by loading the descriptions
  into a RAG and querying it, which is where the table above comes from. The test
  keeps the rule in the repository where descriptions are authored and where no
  RAG runs — without it the next `$TMP` returns and nothing here notices until a
  consumer's retrieval degrades. Green on arrival: 370 descriptions, none naming
  anything concrete.

### Changed

- `docs/user-guide/AVAILABLE_TOOLS*.md` regenerated, which also picks up the
  `CheckPackage` wording 13.0.1 changed and did not regenerate.

## [13.0.1] - 2026-09-28

### Fixed

- **`mcp-abap-adt --version` died on every installed copy.** The launcher read
  `path.join(__dirname, '..', '..', 'package.json')`: from `server/dist/` that
  reaches the repo root in a checkout — whose manifest is `@mcp-abap-adt/lib`, so
  it answered the LIBRARY's version — and from an installed package it reaches
  `node_modules/@mcp-abap-adt/`, the scope directory, which never has a manifest.
  So the CLI the MCP registry points at answered
  `[MCP] launcher failed: ENOENT … node_modules/@mcp-abap-adt/package.json`
  for anyone who installed 13.0.0. One level up is `server/` in a checkout and
  the package root when installed, and in both it is `@mcp-abap-adt/core`'s own
  manifest, which is what this CLI should state.

  Found by installing the published 13.0.0 tarball into an empty directory and
  running each bin — which is how `@mcp-abap-adt/auth-broker` 3.0.4 had found the
  same class of defect one release earlier, and 13.0.0 took that fix without
  performing that check. `release:dry` reporting `Published: 2  Skipped: 0` does
  not cover it: packing proves a tarball builds, not that anything inside it runs.
  The three other bins in the installed tree were healthy — `mcp-auth` and
  `mcp-sso` 3.0.4, `sap-abap-auth` 9.4.2.

### Added

- **`binSmoke.test.ts` — a bin that does not start is now a failing test.** It
  packs both packages, installs the two tarballs into a temporary directory and
  runs `mcp-abap-adt --version` from there, asserting it answers `core`'s own
  version. Verified in both directions: it fails with the old path (the same
  `ENOENT`) and passes with the fix. `SKIP_BIN_SMOKE=true` skips it where packing
  is not available, and says so.

## [13.0.0] - 2026-09-27

Migration: [`docs/MIGRATION-13.0.md`](docs/MIGRATION-13.0.md).

**No MCP tool changed** — not a name, not a parameter, not an answer shape; the
generated tool docs moved only their date, which is the check for that. What
changed is what a refusal does: a number of them now arrive as refusals where
they arrived as success.

### Changed

- **`@mcp-abap-adt/adt-clients` 22 → 23.0.4, and the release interprets nothing.**
  Every member takes an `options.analyse`; no member applies a verdict of its own;
  the readings four of them had built in now ship as named strategies in
  `@mcp-abap-adt/adt-strategies`. 79 members grew the parameter in the same
  release.

  Here that took the call sites accepting an `analyse` from 275 to **513** in
  `src/handlers` alone, and every one of them carries a strategy now.
  `handlerInvariants.test.ts` resolves them from the type checker, so a call added
  without one fails the build; its exception list is gone, because all four
  entries were members whose tailored default 23 removed — the reason to pass
  nothing inverted into a reason to pass exactly `analysePublication`,
  `analysePublicationLock`, `analyseMessageClassMessage(msgno)` and
  `analyseUnitTestStart`.

  A call with no strategy has no verdict at all: whatever HTTP accepted is a
  success, including the refusals ADT embeds in a `200`. That is the class of
  defect this repository has been closing since 8.10.0, and 23 moved the
  responsibility for it from the library to us.

- **Every reading 22 applied by default is injected now** — ATC, the profiler,
  the feeds, the executors, transports, object versions, run ids, and the
  read-edit-write of a message class. Most of those defaults are typed `unknown`,
  so the compiler flagged none of them: a result set left to its default answers
  the document, and a projection that reads `.length` or walks an array runs over
  a string without complaint.

- **`analyseLock` refuses a `2xx` that names no lock handle** and returns SAP's
  answer as `raw_body`, on every lock including the LockX tools.

- **A high-level delete runs `checkDeletion` first** and sends no delete for an
  object the check reports as absent.

- **The rest of the contract**: `interfaces-adt` 9 → 11, the new
  `interfaces-adt-connection` 1.0.0 (`IAbapConnection` and `IAdtWireResponse`
  moved there), `interfaces-network` 2.0.0 as a direct dependency,
  `interfaces-auth` 1 → 2, `auth-broker` 2 → 3.0.4 (one options object, the token
  provider inside it as `provider`, and it requires `refreshTokens`),
  `auth-providers` 2 → 4.2.1, `auth-stores` 1.2.4, `connection` 9.2.1 → 9.4.2,
  `adt-strategies` 0.6.0, `logger` 0.4.1.

  The last two of those are packaging fixes in the family's own CLIs rather than
  anything this project calls differently: `auth-broker` 3.0.4 made
  `@mcp-abap-adt/logger` a runtime dependency, because `mcp-sso` imported it while
  it was only a dev dependency and died on `Cannot find module` from an installed
  tarball; `logger` 0.4.1 stopped printing `PinoLogger initialization error` at
  import, building its `PinoLogger` on first call instead. Both are worth taking
  here so this project's tree holds one copy of each at the fixed version.

- **`sap-rfc-lite` ^0.1.0 → ^0.2.1 is load-bearing on RFC.** It is the range
  `connection` itself declares, and adt-clients' `ERRATA.md` says why: a package
  can be saved only once per ABAP session (`PAK/058` — the message says *locked*,
  but it is `CL_PACKAGE`'s in-memory instance buffer, not an enqueue), and the
  connector is what keeps a non-stateful request out of the stateful context —
  over HTTP from 9.3.1, over RFC from 9.3.2, and from 9.3.4 on a reused
  conversation whose server context is reset after each call.

  **`0.2.1`, not `0.2.0`, and the difference is invisible at run time.** 0.2.0 was
  packed from a stale `lib/`, so its JS client has no `resetServerContext`: the
  connector found no reset and fell back to a new RFC connection per stateless
  call — correct, and about 1010 s for a full RFC run instead of about 684 s.
  `connection` 9.4.2 raises its own minimum for exactly that, which also makes npm
  replace a 0.2.0 already in a lockfile. Declaring `^0.1.0` at the root, as this
  project did, put 0.1.x there for an RFC consumer to load; the root range has to
  move with the connector's.

- **Third-party, in range**: `@modelcontextprotocol/sdk` 1.30.1, `axios` 1.20.0,
  `express` 5.2.1, `fast-xml-parser` 5.11.1, `pino` 10.3.1, `zod` 4.6.5, `dotenv`
  18.0.4, `biome` 2.5.14, `jest` 30.5.2, `ts-jest` 29.4.14, `tsx` 4.23.15.

  Not taken, and not an oversight: **`typescript` 7** and **`@types/node` 26** (on
  versions we follow SAP — `ts-jest` 29.4.14 still declares
  `peerDependencies.typescript: ">=4.3 <7"`), and **`lint-staged` 17**, which
  wants `node >=22.22.1`, above the floor this project declares. Node 26 is
  supported by `auth-broker` 3.0.2 and `auth-providers` 4.2.1 as an *install* fix
  — under Node 26 npm skips a release whose `engines` excludes it and silently
  takes an older major — and this project's open `>=22.0.0` was never subject to
  that. It is still not a deployment target: the CF buildpack lists 20, 22 and 24.

### Fixed

- **`GetInactiveObjects` dropped every entry** it was meant to list.
- **`GetObjectVersions` answered `{"ok":true}`** instead of the versions.
- **`--browser` and `--browser-auth-port` had stopped reaching the login** —
  ignored since auth-providers 2.0. `AuthorizationCodeProviderConfig` replaced
  both fields with an `authorization` strategy, and TypeScript runs no
  excess-property check on a `const` passed to a constructor, so every OAuth
  callback landed on the package default (61001) rather than the port the IdP has
  registered.
- **An untyped deletion message is not an error**, and every `del:message` of a
  deletion answer is read.
- **`LockClassTestClasses` answered a response object as the lock handle** —
  `lockTestClasses` answers an `IAdtResponse` in 23 where it answered the bare
  handle, and the call goes through an `as any`. `UnlockClassTestClasses` had the
  other half: a refused release reported as success.
- **`RuntimeListFeeds` lists feed variants**, read out of the feed list, and the
  profiler no longer wipes its own defaults for options a caller did not give.
- **A package is saved once per ABAP session**, and over RFC each save gets its
  own.
- **The polygon and the suites that build their own fixtures stop reporting
  success over a refusal.** 69 calls in `src/__tests__` and
  `src/lib/search-source` had no strategy; 25 `await`s dropped an `IAdtResponse`
  entirely, so `ensureSharedPackage` logged "Created" over a refused create and
  `safeDelete` — which classified a *thrown* message — reported `deleted` for
  every object a teardown failed to remove. Two unlocks in a `finally` ignored a
  refused release, the shape that left an enqueue on `ZMCP_SHR_I_BDFL` and locked
  every later run out; they report it by name now.

- **A group activation is three requests, and only the third says what
  happened.** `POST /activation/runs` answers `202` with the run id in
  `Location` and an empty body — which parses to zero messages and reads exactly
  like "no errors". So `shared:setup` logged *"Group activation completed
  successfully"* over eleven objects that stayed inactive, with not one SAP
  message to say why, and `ActivateObjectLow`'s group path answered
  `activated: null` for every call. `lib/strategies/activationRun.ts` waits on
  `getActivationRun` (long-polling, bounded) until `runs:status` settles and then
  reads `getActivationResults`, where the `chkl:messages` are. The tool answers
  `run_status`, `messages` and a real `activated` now — `null` only for a run that
  has not settled — and the setup's retry is driven by the inactive list rather
  than by the accept. Re-run on a BTP trial 2026-09-28: `runs:status finished,
  8 message(s)`, all eight warnings (`Key must have the type Inverted Individual
  on the database`), `Confirmed active: all 30 object(s)`.

- **`CheckPackage`/`CheckPackageLow` required a `super_package` they never
  sent.** The guard refused before any request, so a package with no parent —
  `super_package: ""`, which is what a top-level package has — could not be
  checked at all: measured on a BTP trial 2026-09-28, the suite's own
  `ZMCP_SHR_PKG` answered `isError: true` with nothing on the wire while the
  other nine check tools passed. The member takes
  `check({ packageName }, status?, options?)`, and the parameter's own
  description had said it does not reach the endpoint all along. It stays
  accepted and is no longer required; the surface ratchet records the relaxation
  rather than having its fixture edited.

- **`DEBUG_HTTP_WIRE` — there was no HTTP wire log at all.**
  `@mcp-abap-adt/connection` logs the session, the CSRF token and the critical
  section and nothing about a request, and `logWire` is an RFC transport option
  the HTTP transports do not take, so `DEBUG_CONNECTORS` answered nothing when
  the question was *what did we send and what came back*. Finding the
  `CheckPackage` cause needed a throwaway script that wrapped `makeAdtRequest` by
  hand. The switch lives in `connectionFactory` now, symmetric with
  `DEBUG_RFC_WIRE`: method, URL, params, headers with their values redacted by
  name, and bodies clipped at `DEBUG_HTTP_BODY_CHARS`, on stderr.

- **A refused check says what it refused.**
  `expect(response.isError).toBe(false)` printed `Expected: false / Received:
  true` and nothing else, so the `CheckPackage` refusal was invisible from the
  suite; all fifteen assertions in that file raise the handler's own payload now.


### Removed

- **`fetchNodeStructure` from `@mcp-abap-adt/lib/utils`** — a deprecated stub that
  threw `fetchNodeStructure not implemented in AdtClient yet` on every call, for a
  member that has existed for several majors.
- **`src/lib/strategies/atcRun.ts`** — its `answering()` turned the `AdtSAPError`
  that `resolveCheckVariant` and `createWorklist` threw back into a response; both
  answer an `IAdtResponse` in 23, so it had no callers left.

### Verified

- **On premise, soft mode** (PR #230): HTTP **47/47 suites, 105/105 tests**;
  RFC **43/47, 100/105**, the four failures all one finding — `RfcTransport` keeps
  one ABAP session for the connection's lifetime, so a stateless read after a
  create on the same connection answers `400 SADT_RESOURCE 007` while a fresh
  connection answers `200`. That is the connector's decision to make, and
  `connection` 9.4.x with sap-rfc-lite 0.2.0 is where it is made.
- **On a BTP trial, cloud, on this branch's own versions**: the full soft-mode
  sweep, **48/48 suites and 108/108 tests**, nothing left on the system. Two
  skips remain and both are the platform saying no — programs do not exist on
  ABAP Cloud. Within it: the auth-broker path (`Session ready`, every suite on a
  connection from the broker), the class unit-test workflow including the
  test-classes lock and its release, the feed descriptors and dump entries
  parsed, the group activation read from its run's results, and the BDEF+BIMPL
  suites creating, activating and deleting their own views.

- **The dumps test reads the feed rather than one user's dumps.** It required
  `params.dumps_user` and skipped without it, so on a machine whose config named
  no user it never ran; a user filter is not what it is about. It lists what the
  system shows, picks a dump and reads it — measured on the trial: `5 dump(s) in
  the feed`. The only skip left there is a system with no dumps at all.
- Unit: **111 suites / 1704 tests**. `tsc --noEmit` clean on all three projects,
  `biome check` clean, `release:dry` reports `Published: 2  Skipped: 0`.

## [12.0.0] - 2026-09-24

Migration: [`docs/MIGRATION-12.0.md`](docs/MIGRATION-12.0.md).

### Added

- **Five tools for a transport request's object list**, which is what
  fr0ster/mcp-abap-adt#221 asked for: `ReadTransportObjects`,
  `RemoveTransportObject`, `AddTransportObject`, `CreateTransportTask` and
  `ReadTransportActionLog`.

  The problem they answer: **deleting an ABAP object does not free its name.**
  The CTS object-directory entry stays on the request that carried it — on
  purpose, so that transporting the request deletes the object in the target
  system too — and until it is detached, creating the same name again is
  refused with `CTS_WBO_API 019`, *even passing that same request as the
  transport*. The ways out were releasing the whole request, shipping
  everything else in it, or SE09 by hand. It was found the hard way: two
  shared function groups in an on-premise integration polygon became
  permanently unusable.

  Two things the tools cannot soften, both measured against an on-premise
  system on 2026-09-21:

  - **`position` is required for a removal, and is what makes it do
    anything.** Twenty-two objects asked for by `pgmid`/`type`/`name` alone
    each answered `200` with the usual echo document, and a re-read found all
    twenty-two still on the task. `ReadTransportObjects` is where the number
    comes from — there is nowhere else.
  - **`target_user` is required for a task.** Without `tm:targetuser` the
    server resolves an empty owner and refuses with `400 SCTS_ADT_MSG 009`,
    *"User  does not exist in the system (or locked)"* — two spaces where the
    name should be.

  And one thing the answers say rather than hide: **a `200` from a user action
  is not evidence.** The endpoint echoes whatever it was asked about, for an
  entry that exists and for one that never did, so `RemoveTransportObject` and
  `AddTransportObject` answer `accepted: true`, `removed`/`added: "unknown"`
  and the reading that would settle it — `ReadTransportActionLog`, or a
  re-read of the objects.

  **Neither carries `success`**, though every other write in this repository
  does. There it means the write happened; here it would contradict the field
  beside it, and a reader who stopped at `success` would skip the re-read that
  is the only thing establishing the outcome.

  Objects live on **tasks**: a request displays its tasks' entries and refuses
  to detach one, saying the entry "does not exist in request/task". Every tool
  says so where a caller will read it.

### Changed

- **BREAKING: the contract comes from the packages that declare it.**
  `@mcp-abap-adt/interfaces` is gone from this project's dependencies. It last
  shipped 51.0.0 and nothing further will: `adt-clients` 22.0.0, `connection`
  9.2.1 and `adt-strategies` 0.4.0 all take `interfaces-adt@^9` directly, while
  the facade carries `^7`. Keeping it would have put two majors of the contract
  in one tree, and they differ — 9's `IAdtWireResponse` extends
  `IHttpWireResponse` from `interfaces-network@2`, 7's does not.

  111 import statements in 108 files under `src/`, plus
  `server/src/AuthBrokerConfig.ts`, now name the package the contract lives in:

  | package | names taken |
  |---|---|
  | `@mcp-abap-adt/interfaces-adt@^9.0.0` | 18, from `IAdtError` and `IAdtResponse` down to `TRANSPORT_SEARCH_CONFIGURATIONS_URL` |
  | `@mcp-abap-adt/interfaces-utils@^1.1.0` | `ILogger`, `LogLevel` |
  | `@mcp-abap-adt/interfaces-auth@^1.2.0` | `ITokenRefresher`, `ITokenProvider`, `ITokenResult` |
  | `@mcp-abap-adt/interfaces-auth-sap@^1.0.0` | `SapAuthType`, `IServiceKeyStore`, `ISessionStore`, `IAuthorizationConfig`, `IConnectionConfig` |

  Nothing was renamed, so **a consumer of this library changes an import path
  and installs the packages it names.** `interfaces-network` is not among them
  because nothing here imports from it.

  **`@mcp-abap-adt/lib/utils` no longer re-exports the contract.** The star
  export was described as re-exporting the header constants; those live in
  `interfaces-network` now, and measured before removing it, nothing in this
  repository imported one through there. A consumer who did takes them from
  `@mcp-abap-adt/interfaces-network` directly — which is also where
  cloud-llm-hub already takes them from.

- **BREAKING: a write's body has one channel, `options.source`.**
  `interfaces-adt@9` merged what used to be `options.sourceCode` (ABAP text),
  `config.document` (an XML metadata document), `config.ddlCode`,
  `config.ddlSource`, `config.testClassCode` and an `options.xmlContent` that
  nothing ever read. Every member in adt-clients 22 reads `options?.source`.

  ```diff
  - await domain.updateMetadata({ domainName, document: patched }, { lockHandle });
  + await domain.updateMetadata({ domainName }, { source: patched, lockHandle });
  ```

  This reaches a caller of the MCP tools not at all — no tool parameter
  changed — and a caller of `@mcp-abap-adt/lib`'s handlers not at all either.
  It is recorded because of how it was found: **the compiler flagged 8 of the
  ~38 call sites**, the ones whose member has two overloads. The rest would have
  compiled and silently sent no body, so they were found by reading the
  contract instead of the error list.

- **`@mcp-abap-adt/adt-clients` `^22.0.0`, `connection` `^9.2.1`, `logger`
  `^0.4.0`, `adt-strategies` `^0.4.0`.** The adt-clients major is what carries
  the five transport members above, with the two required arguments their first
  run against a server measured. `connection` 9.2.1 also drops its optional
  `kerberos` dependency, so an install no longer builds a native module for a
  code path nothing reached.

  `taskTypeChanged` joins `READING_BY_SLOT` for `changeTaskType`, new in
  adt-clients 22. `resultSets.test.ts` is what found it — `resultsFor` throws on
  a slot with no reading, and every transport tool failed until it was declared.

- **Dependencies removed that nothing imports**, measured over every `.ts`,
  `.js`, `.mjs` and `.cjs` outside `node_modules`, plus the npm scripts and the
  husky hooks: `xml-js` and `@mcp-abap-adt/header-validator` (both **runtime**,
  so both shipped in the tarball), `cors`, `express-rate-limit`,
  `serve-handler`, `commander` and `open`, and the `@types/diff` and
  `@types/js-yaml` stubs that duplicate declarations those packages now ship
  themselves. `pino`/`pino-pretty` lose their duplicate dev entries and stay as
  runtime dependencies, because `@mcp-abap-adt/logger` declares them as peers
  and this repository's `.npmrc` sets `legacy-peer-deps=true`.

  `jest-util` looked like the same case and is not: with
  `install-strategy=nested` in `.npmrc`, `ts-jest` cannot find it unless this
  package declares it, and `npm test` fails before a suite runs. It stays, with
  that reason written beside it.

- **Third-party majors: `js-yaml` 5, `diff` 9, `dotenv` 18,
  `@modelcontextprotocol/inspector` 2.** All three runtime majors keep a
  CommonJS entry, which this build needs.

- **Node and TypeScript versions follow SAP, and `CLAUDE.md` now says so.**
  `@types/node` moves **down** to `^22`, matching `engines.node` rather than the
  newest release, and the CI and release matrices run **22 and 24** instead of
  22/25 and 22/24/25: SAP BTP Cloud Foundry supports 22 and 24, 20 was removed
  on 2026-04-30, and odd-numbered releases are not on the platform. `typescript`
  stays on `^6.x` — no CAP package declares a `typescript` peer, but `cds-typer`
  and `cds-types` are developed on `^6.0.3`, `ts-jest` 29.4.13 declares
  `typescript: ">=4.3 <7"`, and cloud-llm-hub type-checks against this project's
  declarations on 6.

- **`overrides` is gone.** It pinned `@hono/node-server` to `^2.0.5` against an
  sdk that declared `^1.19.9`; sdk 1.30.1 declares `^1.19.9 || ^2.0.5` itself,
  and a clean resolve of the sdk alone lands 2.1.1 with no help.

- The earlier statement of this release's dependency set — `adt-clients
  ^20.0.0`, `adt-strategies ^0.3.0`, `interfaces ^46.0.1` — is superseded by
  the rows above; it was written when the five transport tools landed, before
  the contract split reached this repository.

  `adt-strategies` 0.3.0 brings `analyseActivation` reading
  `activationExecuted` as three states, so an activation with nothing to do is
  no longer answered as a refusal.

  Five slots arrive with the client — `removedObject`, `addedObject`,
  `createdTask`, `actionLog`, `objects` — and each gets a reading in
  `READING_BY_SLOT`, which is what `resultSets.test.ts` insists on: a slot
  adt-clients adds arrives at the table, not as an unshaped answer at a call
  site.


### Added

- **`DEBUG_RFC_WIRE` and `DEBUG_RFC_BODY_CHARS`** — the RFC wire can be asked
  what it carried: the request headers and both bodies on the debug channel,
  off unless asked for.

  It exists because an investigation stopped for want of it. #222 reports
  `CreatePackage` losing `superPackage` over RFC while the identical call
  succeeds over HTTP, and the connector logged `RFC → POST
  /sap/bc/adt/packages` and a status — nothing about the document, so whether
  what this repository builds reaches `SADT_REST_RFC_ENDPOINT` intact could
  not be answered at all.

  Setting the variable is enough. `RfcTransport` writes only when it has both
  the option and a logger, and the server's own path builds its connection
  with none — so asking for the wire brings one at `debug` where nothing else
  supplied it. It writes to **stderr**: in stdio transport stdout carries
  JSON-RPC, and a debug switch that interleaves `RFC HEADERS: …` with the
  protocol would take the session down, which is worse than printing nothing.
  A logger the caller already has is used as it is and never redirected.

  An environment variable rather than an argument: the question is asked by
  whoever is sitting in front of a misbehaving on-premise system, not by code,
  and an argument would have to be threaded through every call site for a
  switch nobody sets in production. `DEBUG_CONNECTORS` already works this way.

  `@mcp-abap-adt/connection` `^8.1.0` is what makes it possible, and is also
  why the output is safe to paste into an issue: it replaces the values of
  `Authorization`, `Cookie` and anything matching `token`, `secret`,
  `password`, `credential` or an API key with `[redacted]`, keeping the names.
  **Bodies are clipped, not redacted** — `DEBUG_RFC_BODY_CHARS` sets the
  ceiling, default 2000, `0` for the size alone and `Infinity` for all of it —
  so a body carrying a credential would still be logged. This is for a payload
  under suspicion, not for routine logging.


## [11.0.0] - 2026-09-21

### Added

- **ABAP Test Cockpit, as three tools.** `RunATC` composes the three calls an
  ATC run is — the check variant, a worklist for it, then the run — because
  `AdtAtc` deliberately stopped being `IAdtRunnable` in 19.0.0 and left the
  composing to whoever calls it. `GetATCRunStatus` answers the server's own
  word for the state and the one flag the client derives from it;
  `GetATCFindings` reads the worklist into findings a caller can act on —
  object, source position, priority, which check ran and what it said — with
  the counts per priority beside them. `wait` decides only whether the server
  holds the request: the findings are written into the worklist either way,
  so `worklist_id` is in every answer and `run_id` only when there is a run to
  poll. A worklist a run has not filled yet says so, rather than reading as a
  clean check.

- **`CheckMetadataExtension` and `CheckMetadataExtensionLow` take `version`**
  (`active` | `inactive`, default `active`). The DDLX checkruns endpoint does
  not fall back to whichever version exists, unlike the DDLS one: measured on
  a live system, an activated extension answers `processed` for `active` and
  `notProcessed` — "Error while reading the object … from the database" — for
  `inactive`, and an extension that was never activated answers the mirror
  image. The shipped default is `inactive`, so every activated extension was
  unanswerable through these tools. Reported by @eseuve in #178.

### Fixed

- **A blank cell no longer moves every value below it up a row.** ADT sends an
  empty cell in a data preview as a self-closing `<dataPreview:data/>`, which
  the regular expression reading the document could not match. The cell was
  dropped, its column came back short, and every value below the first blank
  attached itself to the wrong record — silently, with nothing in the answer
  to say so. `GetSqlQuery` and `GetTableContents` both carried it. The reading
  is a parser now, injected on the `query` and `contents` slots rather than
  called from inside the handler, so entities are decoded as well and a short
  column is padded instead of shortening the rows after it. Found by
  @mpauspor (#179) and @anggakharisma (#180), each on their own system.

- **The answers that had become refusals.** Five behaviours turned into
  failures during the migration, each because something an adt-clients method
  used to do inside itself became this repository's job. A check reports its
  findings again instead of refusing on them (27 `CheckX` tools — and
  `CheckFunctionGroup`, which could not answer at all, since SAP reports
  `MESSAGE(G46)` for every function group); a pre-write check informs a write
  rather than being turned into a false failure by the wrong reading; a write
  that landed is a success even when the unlock afterwards was refused; a
  create that worked is confirmed by reading the object back; and a name that
  is not free is an answer rather than an error. Reported as #183 by
  @azzarabe for the function-group half.

- **A lock nobody released now reaches the caller.** When an unlock fails, the
  write still succeeded — and the note about the held lock travels on the
  answer that is actually returned, across the activation that follows, across
  the steps of a `sequence`, and out on an exception when the next call throws
  rather than answers. Previously it was reported instead of the result, then
  dropped on every path that answered something afterwards.

- **The installation guides no longer recommend a 45-second deadline.**
  `.env.example` shipped `SAP_TIMEOUT_DEFAULT=45000` uncommented and the three
  platform guides told readers to copy it. `@mcp-abap-adt/adt-clients` removed
  that default deliberately: an aborted request is retried into a new session
  while the ABAP session underneath keeps the enqueue locks, leaving the object
  locked and inactive. Nothing in the code was cutting anything at 45 s — only
  our own documentation could arm it.

- **Three development-scope advisories resolved in range** — js-yaml (high),
  browserslist (high) and baseline-browser-mapping (moderate), all transitive
  under `jest`. One lock update rather than three separate bumps, and no
  `overrides` entry: an override pins a version the tree never asked for and
  keeps pinning it long after the advisory is history.

- **`AUTH_BROKER_PATH` survives a Windows drive letter.** The value was split
  on both `:` and `;`, which tears `D:\tools\project` in two. Quiet on the
  same drive, invisible from another. Contributed by @mpauspor (#185).

### Changed

- **Legacy support (BASIS < 7.50) is parked**, on `parked/legacy-support`,
  until it can be tried against a live system. `available_in` declared
  `legacy` on 142 tools and nothing here had ever run against such a system —
  an environment nobody has verified is a claim rather than a fact. The
  documentation page regenerates itself the moment any tool declares it again.

- **`detail: 'full'` on a data preview answers the whole document's parse**,
  not a chosen few of its fields, so nothing a caller could reach through the
  generic parse before is missing from it.

- **The corpus gained the documents these changes are written against**: an
  ATC worklist with findings in it, a data preview carrying both cell shapes,
  a transport listing with `?targets=true` (where ADT inserts a `tm:target`
  level the flat listing has no sign of), and a DDLX checkrun in each version.
  A reading designed without one is a guess about a shape.

- **Two patterns run through the whole migration and are worth stating once,
  in general, rather than only inside each task's own entry below.**

  **A read that used to answer `success: true` with a null body now answers
  an error.** Every migrated read-modify-write handler — a domain, a data
  element, a package, a table's metadata, and the rest — goes through
  `sequence()`, whose whole discipline is stopping at the first failed step
  and handing back that step's own answer, untouched. A failed read used to
  mean "nothing to patch, so write whatever came back" on more than one
  pre-migration handler, which is the shape `null`/empty `success: true`
  answers came from; a read step that fails now stops the chain before any
  write is attempted, and the caller sees the read's own failure — origin,
  message, and (where the strategy fills it in) the server's own T100 key —
  instead of a write silently confirming nothing happened.

  **A write that succeeded under a failed unlock now answers an error
  carrying `operation: 'succeeded'`.** Every migrated high-tier write holds
  its lock through the shared `withLock` (see the eighteen-writes entry
  below): the body runs, and the release always runs after it, on every path
  out — a refusal from the body, a throw from it, or neither. When the body
  itself succeeded but the *unlock* is refused or throws, the object's
  change is real and on the server, but the call now answers a failure
  rather than the write's own success — with `operation: 'succeeded'` on the
  error payload, and a `cleanup` field carrying what the release actually
  said, so a caller does not read "failed" and conclude nothing happened.
  This is the most arguable decision in the spec this migration implements:
  a lock left behind on an object whose new content the caller can no longer
  see as a success. Surfaces in integration runs as new failures that are
  not regressions — see the pull request for a fuller account.

- **Six unit-test tools gained the `detail` parameter, and what they answer
  changed with it.** `GetUnitTestStatus`, `GetCdsUnitTestStatus`, `GetUnitTest`,
  `GetCdsUnitTest`, `GetUnitTestResult` and `GetCdsUnitTestResult` answer a JSON
  object built from a parsed document, which is the shape `detail` exists for —
  but they had been left without it, each hardcoding a level, so an audit keyed
  on the shared projection helper could not see them.

  They split two ways, and the change is not the same for both.

  The two **status** tools read the run's status directly. They used to answer
  `success`, the run id, a finished flag, and the whole parse as `run_status`,
  at every level. Now `terse` answers the run id, the finished flag and
  `run_status` as the status string itself — `"FINISHED"` rather than the parsed
  document; `full` answers the bare parse, without the surrounding envelope; and
  `raw` answers the wire document.

  The four **polling** tools go through the shared run poller. They used to
  answer the parse as `run_status` and, as `run_result`, the reading object
  itself with the wire document inside it. Now `terse` and `full` answer the
  parse in both fields and `raw` answers the wire text.

  **Named fields did move**, so a caller reading one is not automatically safe:
  `success` is gone from both status tools at every level, `run_status` is a
  string rather than an object at `terse`, and at `full` and `raw` the status
  tools answer a document with no named fields at all.

  No test pinned the old shapes, which is why this is recorded here rather than
  discovered by one.

- **A compiler-pinned ledger of the eighteen `adt-clients` legacy-class
  members that ignore what a caller passes them, and what it found (#207,
  #208).**

  `AdtClientLegacy` (BASIS < 7.50) substitutes four classes —
  `AdtPackageLegacy`, `AdtUnitTestLegacy`, `AdtRequestLegacy`,
  `AdtUtilsLegacy` — whose overridden members ignore arguments a caller
  passes them, because the factory that returns them is typed as the modern
  class: the compiler cannot see the mismatch, so nothing before this caught
  it. Not all eighteen drop the same thing, and calling all of it "the
  failure strategy" overstates nine of them: nine genuinely drop `analyse`,
  the caller-supplied failure verdict modern accepts and legacy ignores
  (five of `AdtPackageLegacy`'s six members — `create`/`readMetadata`/
  `validate`/`updateMetadata`/`delete`; four of `AdtRequestLegacy`'s five —
  `create`/`readMetadata`/`updateMetadata`/`delete`). The other nine never
  accepted `analyse` on modern either: `AdtPackage` has no public `read`
  member at all (it implements metadata-readable, not readable, so legacy's
  `read` override is dead code from the type's perspective, not a dropped
  strategy); `AdtRequest`'s `list` takes `IListTransportsOptions`, one
  `configUri` field and never an `analyse`; `AdtUnitTest`'s `run`/
  `getStatus`/`getResult` (three) and `AdtUtils`'s `activateObjectsGroup`/
  `getTableColumns`/`getTableContents`/`getSqlQuery` (four) never declared
  one either. What legacy drops on those nine is something else instead — a
  positional argument, a run identifier, a table name — a different failure
  mode.
  `legacyExposure()`/`legacyEnabledHandlers()` (`scripts/lib/analyseOmissions.ts`)
  resolve every handler legacy is offered (144 of 326) through the
  compiler's own type checker — not a syntax walk of specific call shapes,
  so a receiver reached through a shared helper, a destructured binding, or
  an awaited factory is seen the same as a direct chain — and name the exact
  `(handler, factory, member)` pairs that land on one, pinned by
  `tests/fixtures/legacy-handlers.json` and
  `tests/fixtures/legacy-exposure.json` and asserted in
  `src/__tests__/unit/legacyExposure.test.ts`.

  Sixteen pairs across thirteen files remain, and none can be moved to a
  sibling member that does accept a strategy: `AdtPackageLegacy` refuses
  every package operation (`create`/`read`/`readMetadata`/`validate`/
  `updateMetadata`/`delete`) unconditionally, before any request is made, so
  `GetPackage`, `ReadPackage`, `UpdatePackageLow` and `DeletePackageLow`
  always answer a clean `UNSUPPORTED_OPERATION` refusal on legacy — no
  masking risk, but the operation reaches nothing, and their descriptions now
  say so. `getUtils().activateObjectsGroup` (`ActivateObjectLow`'s
  multi-object path) never accepted a strategy on modern either — tracked
  already in #200, now cross-referenced from #207. Each affected tool's
  description states the limitation and the tracking issue.

  A second, separate ledger — `legacyThrows()`, pinned by
  `tests/fixtures/legacy-throws.json` — names every handler that reaches a
  factory `AdtClientLegacy` declares *never available*
  (`getDomain`/`getDataElement`/`getStructure`/`getTable`/`getCdsUnitTest`/…):
  the no-arg overload throws synchronously there, rather than answering a
  failure. Five tools declared `legacy` in `available_in` and reached one of
  these with no disclosure and no guard — `CreateCdsUnitTest`,
  `GetCdsUnitTest`, `GetCdsUnitTestResult`, `GetCdsUnitTestStatus`
  (`getCdsUnitTest()`) and `GetStructuresList` (`getStructure()`/`getTable()`)
  — and in three of the four CDS handlers the call sat before `answer()`'s
  callback with nothing catching it, so the throw would have escaped as an
  unhandled rejection rather than a tool error. All five now guard with a new
  `isLegacyConnection()` (`src/lib/utils.ts`) and refuse with a message
  before making any call, tested the way the program family's cloud guard
  is (`src/__tests__/unit/legacyThrowingFactoryGuards.test.ts`): refuses and
  never reaches the factory on legacy, reaches it on every other system.
  `ActivateObjectLow`/`DeleteObjectLow` also reach several of these factories
  for specific object types (`getDomain`/`getDataElement`/`getStructure`/
  `getTable`/`getBehaviorDefinition`/`getMetadataExtension`), but only when a
  caller names that type through the generic dispatcher; recorded in
  `legacy-throws.json`, not guarded here.

  Building the ledger surfaced a third, more severe defect (#208, not fixed
  here — out of this ledger's scope): on a legacy system, `RunUnitTest`,
  `CreateUnitTest` and `RunClassUnitTestsLow` answer their run's result
  *synchronously*, but `AdtClientLegacy.getUnitTest()` returns a **new
  instance every time it is called — even on the same client** — and the
  synchronous result is cached on that instance, not on the client or the
  connection. So the client that answers `GetUnitTest`, `GetUnitTestStatus`,
  `GetUnitTestResult`, `GetClassUnitTestStatusLow` and
  `GetClassUnitTestResultLow` afterwards has no memory of the run and always
  refuses, regardless of whether it passed, failed, or errored — reusing the
  client across calls would not fix this; the factory call itself would
  still need to be the same one. Verified by construction against the
  installed `@mcp-abap-adt/adt-clients` package with a stub connection, no
  live SAP system needed: the *same* `AdtClientLegacy` instance, asked for
  `getUnitTest()` twice, answers the refusal from the second call even
  though nothing about the client changed. All eight affected tool
  descriptions (the five named above plus `RunUnitTest`, `CreateUnitTest`
  and `RunClassUnitTestsLow` themselves) now disclose this; the fix itself
  needs a design decision (embed the full result in the run tools' own
  answer on legacy, or cache the factory's own returned instance rather than
  the client) tracked in #208.

- **The eighteen high-tier writes that hold a lock now release it through one
  shared `withLock`, and three genuine behaviour changes survive that
  migration.**

  `CreateStructure`'s syntax check now gates the answer; before, a genuine
  check failure was `logger.warn`'d only — the create still answered success
  and still went on to activate a structure with a known syntax problem. A
  refused check now fails the call, the same as every other check in this
  migration (`analyseCheck`, same as `CreateDomain`/`CreateDataElement`/
  `CreateBehaviorDefinition`/`CreateMetadataExtension` already had).

  `UpdateDdl`, `UpdateInterface`, `UpdateProgram`, `UpdateServiceDefinition`,
  `UpdateStructure` and `UpdateTable` no longer carry an `activation_warnings`
  array in their terse (default) answer — the `chkl:messages` parse that array
  came from still happens, but only `detail: 'full'` or `detail: 'raw'` on the
  activation reads it now. Terse writes answer the literal string `SUCCESS`
  or a failure payload uniformly across every write tool in this migration;
  keeping one family's warnings in the terse channel while every other write
  tool's terse answer carries none would have been the inconsistency, not the
  fix.

  Everything else that changed shape during the underlying `withLock`
  migration and still holds after review: the long-polling wait for write
  visibility is restored, in its pre-migration position, on every handler
  that had one. The pre-write syntax check on `UpdateClass`, `UpdateDdl`,
  `UpdateInterface`, `UpdateProgram`, `UpdateStructure` and `UpdateTable` is
  restored too, gated by `activate` exactly as before — it runs only when
  `activate` is set, and a refusal there stops the write. No handler
  restores a *post*-unlock check: the pre-migration one existed only on
  these same six, its own `catch` never rethrew, and it is dropped rather
  than restored — every check in this migration now carries the check
  strategy, so a refusal is reported the way every other refusal is, and a
  check that could never have changed the answer is not worth the round
  trip. `config.packageName` is no longer sent on `UpdateDomain`/
  `CreateDomain`/`UpdateDataElement`/`CreateDataElement`'s metadata write —
  the shipped wire function never read it. `CreateStructure` no longer
  holds a lock while it creates — nothing between `create` and `check` ever
  wrote through it.

- **`ActivateObjectLow` (multi-object activation) now answers acceptance, not
  a verdict.** Activating a single object still reads a real pass/fail
  straight from ADT. Activating more than one object at once — or one object
  of a type this tool has no dedicated family for — goes through group
  activation, and ADT's answer there has always meant "the request was
  accepted and a run was queued," not "activation finished." The tool now
  says so explicitly: `accepted` (from whether a run id came back), `run_id`,
  and `activated: null` (there is no verdict on this path — acceptance is
  not completion). It does not wait for the run. To learn what actually
  happened, call `GetInactiveObjects` afterwards — an object still listed
  there did not activate — keeping in mind that a check made immediately
  after acceptance can still show an object as inactive that goes on to
  activate a moment later, since the run has not necessarily finished yet.

  Separately, and left open: group activation cannot judge a refusal the way
  every other write path in this migration now does — `activateObjectsGroup`
  accepts no error strategy at all, so a refusal ADT embeds in its answer is
  not caught on this path. Tracked as issue #200 in
  `@mcp-abap-adt/adt-clients` (giving the member the `<E extends IAdtError>`
  shape every sibling member already has); not fixed by this change.

- **`RuntimeRunClass` and `RuntimeRunClassWithProfiling` now find a profiled
  run's trace themselves, and two fields they used to answer are gone.**
  adt-clients 19 split the old composite `runWithProfiling` into
  `scheduleTrace` + `runWithProfiler`, neither of which waits for a trace or
  answers a `traceId` — a run only schedules and executes, and reading a
  trace is `IProfiler.list()`/`read()`, whenever the caller is ready. Both
  tools still advertise `trace_id`, `max_trace_attempts` and
  `trace_retry_delay_ms`, so this repository now composes what the library
  no longer does: it snapshots the profiler feed before scheduling, runs,
  then polls the feed for an id that was not in the snapshot — by set
  difference, ordered by the library's own `compareRecordedAt` (never by
  feed position, and never by sorting `recordedAt` as a string, both of
  which pick the wrong trace on a real feed). `max_trace_attempts` and
  `trace_retry_delay_ms` keep bounding that search exactly as before. A run
  that finishes before its trace is written still answers success, with
  `trace_id` absent rather than fabricated — poll `RuntimeListProfilerTraceFiles`
  or `RuntimeAnalyzeProfilerTrace` afterwards in that case.

  `trace_lookup_uris` is now accepted and ignored: adt-clients 19's
  `IProfilerListOptions` is `{ user?: string }`, the whole interface, so
  there is nowhere left to put a URI — the profiler feed is one endpoint,
  not one per lookup URI.

  `run_status` and `trace_requests_status` are gone from both tools' answers
  and cannot come back under any of the three options considered: `run` and
  `runWithProfiler` answer `IAdtResponse<string>` and `ClassExecutor` takes
  no result strategy in its constructor, so there is no transport envelope
  left to read a status from.

- **`RuntimeRunProgram` and `RuntimeRunProgramWithProfiling` (Task 23) no
  longer answer `run_status`, and `RuntimeRunProgramWithProfiling` gained an
  `output` field it never had before — neither was documented at the time.**
  `ProgramExecutor.run()`/`runWithProfiler()` answer `IAdtResponse<string>`
  with no transport envelope to read a status from, the same reason the class
  tools above lost it; `run_status` is gone from `RuntimeRunProgram`'s
  non-profiled answer, its profiled answer, and
  `RuntimeRunProgramWithProfiling`'s answer — three answers across the two
  tools. Unlike the class tools, the program tools never had
  `max_trace_attempts`, `trace_retry_delay_ms`, `trace_lookup_uris` or a
  `trace_id` to begin with (program execution has always been
  fire-and-forget; a trace is located afterwards via
  `RuntimeListProfilerTraceFiles`), so none of those were removed.
  `RuntimeRunProgramWithProfiling` is deprecated and, by the rule this
  repository otherwise follows (a deprecated tool gains no field — applied
  correctly to `RuntimeRunClassWithProfiling` above), should not have started
  answering `output`. Recorded here rather than fixed by this entry.

- **The rest of the profiler/dump/feed readers (Task 25) lose the same
  transport fields the class/program runners above lost, and two of them
  answer a genuinely different shape.**

  `RuntimeListProfilerTraceFiles` used to hand `response.data` — the raw feed
  XML — to a hand-rolled parser and answer `{success, status, payload:
  <whatever that parse produced>}`. `IProfiler.list()` answers
  `IAdtResponse<IAbapTraceEntry[]>` now — already the parsed entries, with
  named fields (`id`, `recordedAt`, `user`, `objectName`, `state`,
  `expiresAt`, `system`, `client`, `host`, `size`, `runtime`/`runtimeABAP`/
  `runtimeSystem`/`runtimeDatabase`, `isAggregated`, `amdpFileSize`) — so the
  tool now answers `{success, count, entries: IAbapTraceEntry[]}` instead,
  and drops the `status` field along with it (see below — it is not only the
  three tools originally named here). **What that costs a caller:** the old
  hand-rolled parse of the raw Atom feed carried whatever the document had —
  each entry's own `<atom:title>` and its `<atom:link>` navigation hrefs (to
  the trace's hitlist/statements/dbAccesses views and its delete link), and
  the feed's own metadata. `IAbapTraceEntry` is a curated, measured field
  list and carries none of that; a consumer that read those fields off the
  old freeform payload has nothing left to read them from.

  `RuntimeGetProfilerTraceData` and `RuntimeAnalyzeProfilerTrace` read the
  same view differently too: `Profiler.getHitList`/`getStatements`/
  `getDbAccesses` are gone (`IProfiler` composes `ITraceReading` since
  31.0.0 — one `read(traceId, view, options)` over three named views
  instead), and each view already answers its own typed, parsed shape
  (`IAbapTraceHitList`'s `entries`, `IAbapTraceStatements`'s `statements`,
  `IAbapTraceDbAccesses`'s `accesses`) rather than the free-form
  attribute-prefixed object the old hand-rolled XML parser produced. Both
  tools' `payload` field now carries that typed shape. **What that costs a
  caller, same as `RuntimeListProfilerTraceFiles` above:** the old
  hand-rolled parse turned every attribute and element the raw XML document
  carried into JSON; `IAbapTraceHitList`/`IAbapTraceStatements`/
  `IAbapTraceDbAccesses` are curated, measured field lists too (each one
  says so in its own doc in `adt-clients`' `runtime/traces/types.d.ts`), not
  the whole document — a consumer reading a field the old freeform payload
  had that one of these three types does not name has nothing left to read
  it from. `RuntimeAnalyzeProfilerTrace`'s `summary` (`total_records`/
  `top_records`) now reads the view's own named collection and ranks by
  that collection's real numeric field (`grossTime.time` for
  `hitlist`/`statements`, `accessTime.total` for `db_accesses`) — a
  fix-round-1 correction: the first pass walked the whole typed document for
  "anything with a number on it", which counted each row's own timing
  sub-object as a second row and ranked against a fixed list of key names
  (`'runtime'`, `'calls'`, `'hits'`, …) that do not exist on any of the
  three typed shapes, so `top_records` was document order with roughly half
  its slots taken by timing objects rather than real entries.

  `RuntimeListProfilerTraceFiles`, `RuntimeGetDumpById`,
  `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace` and
  `RuntimeCreateProfilerTraceParameters` all drop the `status` field they
  used to answer (the HTTP status of the underlying request) —
  `IAdtResponse` carries no transport envelope to read it from any more, the
  same reason the class/program runners above lost `run_status`.

  `RuntimeCreateProfilerTraceParameters` also changes mechanism:
  `Profiler.createParameters()` is gone (`IProfiler` no longer composes
  `ITraceScheduling` as of 19.0.0 — scheduling a measurement moved onto
  `IClassExecutor`/`IProgramExecutor`, the same `scheduleTrace` member
  `RuntimeRunClassWithProfiling` already calls), now reached through
  `AdtExecutor.getClassExecutor().scheduleTrace(...)`. `profiler_id` is
  still answered; `status` is not (see the paragraph above — this is one of
  the five, not an exception to it).

  `RuntimeGetGatewayErrorLog`'s `error_url` branch was silently wrong before
  this task touched it: the pre-19 code handed the whole envelope object to
  `error:` with nothing unwrapping it, which — once `gatewayErrorDetail()`
  started answering `IAdtResponse<T>` instead of `T` directly — would have
  serialised as `{"ok":true}` (its `getResult`/`getError` methods dropped by
  `JSON.stringify`) rather than the actual detail document. No `tsc` error
  ever named this, because nothing in the old code read a field off the
  envelope that `IAdtResponse` didn't have. Fixed as part of this task's
  pass over the same file for its one genuine compile error
  (`errors.length`).

  `RuntimeListFeeds`'s `variants` `feed_type` now refuses locally rather than
  calling the library at all: `IFeedRepository.variants()` gained a required
  `category` argument as of 19.0.0 (ADT's own endpoint always required one on
  the wire; the type simply did not say so before), and the frozen tool
  surface has no parameter this branch could take a real category from. A
  fix-round-1 correction: the first pass sent `category=''`, reasoning that
  an empty category reaches "the same refusal" a categoryless call always
  did — but the pre-19 wire sent no `category` parameter at all, and the
  19.0.0 wire always appends one, so `category=''` is a request nobody has
  measured, not a preserved behaviour. This `feed_type` now answers a local
  error explaining why, instead of guessing at what an unmeasured request
  would do.

  `GetPackageTree` (Task 25) wording: its pre-check for whether the target
  package can be read now says "could not be read" rather than "not found"
  for every refusal — a fix-round-1 correction. The pre-migration code
  branched on the wire status (404 said "not found"; anything else rethrew
  the original error unworded); `readMetadata`'s default error strategy
  carries no status/code to branch on the same way, and the first pass here
  said "not found" for every refusal regardless of cause (a lock, a
  permission failure, a connection error), which is wrong for all but one of
  them.

  `handleGetClassUnitTestResult`/`handleGetClassUnitTestStatus` — a
  fix-round-1 correction, not a shape change: the first pass at these two
  Task-14-carve-out files cast the answer `as AxiosResponse`, believing
  `getUnitTest()`'s members still answered the pre-19 transport frame. They
  do not — `ITestRunInformation` already declares them `IAdtResponse<T>`, and
  the shipped class implements exactly that. `IAdtResponse` has no `.data`,
  so both tools answered success with empty content regardless of `.ok` —
  a refusal reported as success. Both now unwrap through `answer()`; neither
  tool's answer shape changes for a caller once the masking is removed. A
  fix-round-2 correction on top of that: fix round 1 dropped the outer
  `try`/`catch` both handlers had before it, so a thrown error from
  `createAdtClient`/`restoreSessionInConnection` (unreachable through the
  server, which always calls a handler inside its own guard, but reachable
  from a direct caller — a soft-mode integration test, or an embedder) would
  reject the returned promise instead of answering an error result. Restored.

- **`ListTransports` asks which saved search to run.** A transport listing is
  a saved search: `list()` takes a `configUri`, and when it is not given one
  it resolves a configuration itself — a second request, behind a `protected`
  member, whose answer no strategy of ours could read. On a system holding
  several saved searches that resolver throws, telling the caller to pass a
  `configUri` — which this tool has no parameter for and is not getting one.

  Fixed where it belonged: `adt-clients` **19.1.0** answers
  `getRequest().searchConfigurations(options)`, one request with the caller's
  `analyse` over it. This handler asks, then lists with what it was given. The
  request count is unchanged for the ordinary one-configuration system; what
  changed is that both requests carry a strategy, and that a system with
  several is **searched rather than refused** — each of them, merged, capped
  at five, reported as `searched_configurations` and `configurations_capped`.
  A system with no saved search at all gets a sentence naming the endpoint
  that answered none, instead of a resolver's internal error.

  A new `searchConfigurations` slot came with that release, and
  `READING_BY_SLOT` declares a reading for it — the ratchet that exists so a
  slot adt-clients adds arrives in the table rather than unshaped at a call
  site is what caught it.

- **An activation with nothing to activate is a success, and says so.** SAP
  answers `POST /activation` with `activationExecuted="false"`,
  `generationExecuted="true"` and no `msg` at all when the object is already
  active — activating a class twice, or a function group straight after
  creating one, since a function group is created active
  (`adtcore:version="active"` before anything is activated). Every such call
  used to answer an error.

  The verdict was wrong in `@mcp-abap-adt/adt-strategies`, and it was fixed
  there: **0.2.0** carries the reading and the corpus case that proves it
  (`activation-nothing-to-activate`). This repository ran its own narrowing
  strategy in the meantime, with a test asserting that the package still
  disagreed so the day it stopped would be a red test rather than a
  discovery — that test went red on the upgrade, and the local module is
  gone. All 46 handlers are back on the package's `analyseActivation`.

  What stays here is the consumer's half: a caller sees `activated: false`
  with `nothing_to_activate: true` beside it, rather than a bare `false`
  under a success.

- **`GetNodeStructureLow` no longer reports an error for a node that is
  simply empty.** The migration added a guard for the one ambiguity the
  corpus captures: `/repository/nodestructure` answers HTTP 200 with zero
  bytes both for a package that does not exist and for one that exists and
  holds nothing, and the two fixtures are byte-for-byte identical. For a
  `DEVC/K` parent the handler still pays one extra `readMetadata` round trip
  to tell those apart, and still forwards the package's own refusal when the
  package is gone. For every other parent type it used to throw, on the
  grounds that no fixture settled the question — which made an ordinary
  request answer `client_threw`. It is settled now: `CL_ABAP_CHAR_UTILITIES`,
  a standard SAP class, answers `CLAS/OC` node `0000` with zero bytes on a
  live system, so outside the package case a blank body is an empty node and
  is answered as one.

## [10.2.0] - 2026-09-15

### Added

- **On ABAP Cloud, a request without a responsible person or master system
  gets them from the system.** 10.1.0 let a host scope both per request, but a
  host that does not know them for a cloud destination had to look them up
  itself — a second adt-clients import and a second connection type to keep in
  step. The library now does it.

  Every tool call — through `EmbeddableMcpServer`/`BaseMcpServer`, a handler
  group registered on a server, or the handlers `HandlerExporter.getHandlerEntries()`
  returns — runs inside the new `withResolvedSystemContext`. When the call's
  effective context lacks `responsible` or `masterSystem` and the connection is
  to ABAP Cloud, it asks the system (`systeminformation`) and fills only what
  is missing: the user name as responsible, the system id as master system.
  On-premise it does nothing. There is one lookup per connection, and only when
  a request actually lacks a value; concurrent calls share it, and a lookup
  that throws never fails the call.

  "Lacks a value" means the key is absent. A request scope that carries
  `responsible` as `undefined` has said this request has no responsible, and
  that answer stands — the same rule 10.1.0 established.

  A lookup that answers nothing is cached as nothing for that connection: the
  system-information call swallows its own errors and answers null, so a
  timeout and a system with nothing to give are indistinguishable from here.
  Only a lookup that throws outright is retried.

  Opt out with `systemContextResolver: null` on `EmbeddableMcpServer` or
  `HandlerExporter`, or pass your own resolver. A handler group registering
  itself directly uses the default resolver and has no opt-out yet. `withResolvedSystemContext`,
  `defaultSystemContextResolver` and the `SystemContextResolver` type are
  exported from `@mcp-abap-adt/lib/request-context`.

  Not breaking: a value the request scope or the process context carries still
  wins, and the wrapped handlers keep their arity, so an embedder that picks
  `handler(context, args)` or `handler(args)` by `handler.length` is unaffected.
  `@mcp-abap-adt/core` is unchanged and stays at 10.0.1.

## [10.1.0] - 2026-09-15

### Added

- **The responsible person and master system can be set per request.** Until
  now only the master language was request-scoped (#110). `responsible` and
  `masterSystem` lived in the process-wide system context, which is right for
  one MCP session per process and wrong for a host that serves several SAP
  users side by side: every concurrent create used whichever user wrote the
  cache last.

  `RequestContext` now carries both. Inside `runWithRequestContext`, a key the
  scope carries — even as `undefined` — decides for that request; a key it does
  not carry leaves the process value in charge. `createAdtClient`,
  `ListTransports`' default user and `getSystemInformation()` all read through
  the new `getEffectiveSystemContext()`, so they agree.

  ```typescript
  import { runWithRequestContext } from '@mcp-abap-adt/lib/request-context';

  await runWithRequestContext({ responsible: 'JSMITH' }, () => handle());
  ```

  Not breaking: outside a scope nothing changes, and a scope that carries only
  the language keeps the responsible resolved from the environment or the
  system, exactly as before. `@mcp-abap-adt/core` is unchanged and stays at
  10.0.1.

## [10.0.1] - 2026-09-11

### Fixed

- **Types resolve for every exported subpath, not just two of them.** The split
  renamed `./server` to `./embeddable` and added `/config`, `/auth`, `/logger`
  and `/request-context`. `exports` was updated; `typesVersions` was not, so it
  still pointed `server` at a `dist/server` the build no longer produces and
  named none of the new entries.

  This is invisible on modern resolution, where TypeScript reads `exports`. On
  the classic `moduleResolution: "node"` — which a great deal of CAP and Node
  tooling still uses — TypeScript reads `typesVersions` instead, so 10.0.0
  offered types for `handlers` and `utils` and for nothing else. A consumer
  importing `EmbeddableMcpServer`, the entry point the release was about, had to
  add a `paths` override to see its types. Runtime was never affected.

  `typesVersions` is now generated from `exports` and matches it entry for
  entry, in both packages.

- **A test holds the two maps together.** Nothing here would have caught the
  drift, because everything in this repository imports by relative path.
  `src/__tests__/unit/packageEntryPoints.test.ts` asserts that every exported
  subpath is named in `typesVersions`, that both point at the same file, and
  that every declared entry point exists after a build. Confirmed to fail
  against the 10.0.0 manifest before being committed alongside the fix.


## [10.0.0] - 2026-09-11

### Licence

- **Two packages now, under two licences.** The project ships a library and a
  server, and licensing them together forced the stricter of the two onto both.
  A network service embedding the ADT tools took on AGPL-style obligations
  because the same tarball also carried a launcher it never ran.

  | Package | Licence | What it is |
  |---|---|---|
  | `@mcp-abap-adt/lib` | `Apache-2.0` | handlers, registries and the embeddable MCP server — no transport |
  | `@mcp-abap-adt/core` | `AGPL-3.0-only` | stdio, SSE and streamable HTTP, the launcher, TLS and the `mcp-abap-adt` CLI |

  Installing the library never puts the server in your dependency tree. That is
  the whole point of the split.

  9.x was `GPL-3.0-only` and 8.13.0 and earlier were MIT; both stay as published,
  because a licence change is not retroactive. `CONTRIBUTORS.md` carries the full
  account of why each change was lawful.

  **Other terms remain possible.** Apache-2.0 is what the library is offered
  under publicly, not the only way it may be offered. Every inbound contribution
  so far arrived under MIT or Apache-2.0, both of which grant the right to
  sublicense, so the copyright holder can still offer the same code separately
  to a party who needs different terms. Nobody loses what they already received.
  `CONTRIBUTORS.md` records the three conditions that keep that open — chiefly
  that no code from the LGPL packages underneath is ever pasted into this tree.

  **The four libraries underneath stay `LGPL-3.0-only`** — `adt-clients`,
  `connection`, `interfaces` and `logger` — and the library links all four at
  runtime. Their terms travel with any distribution regardless of the notice on
  this repository, so plan against those, not against this line.

### Changed

- **BREAKING: `@mcp-abap-adt/core` is the standalone server and nothing else.**
  Everything a consumer imported from it moved to `@mcp-abap-adt/lib`. The CLI,
  the transports and `npm install -g @mcp-abap-adt/core` are unchanged.

  | Before | After |
  |---|---|
  | `@mcp-abap-adt/core/handlers` | `@mcp-abap-adt/lib/handlers` |
  | `@mcp-abap-adt/core/utils` | `@mcp-abap-adt/lib/utils` |
  | `@mcp-abap-adt/core/server` | `@mcp-abap-adt/lib/embeddable` |

  Four subpaths are new, for what the server needed and a consumer may want:
  `/config`, `/auth`, `/logger` and `/request-context`. The library's root entry
  works for the first time (see Fixed).

- **No MCP tool changed.** No tool was added, removed or renamed, no schema
  moved, and no handler behaviour is different. This release is the licence
  boundary and the packaging that expresses it.

- **`src/server` is `src/embeddable`**, so the source tree says which licence a
  file is under. Internal only; nothing importable moved because of it.

- **The library's version line continues at 10.0.0** rather than restarting at
  1.0.0. It is the same codebase under a new name, and a continuous line is
  easier to reason about than two.

### Fixed

- **The package's own root entry resolves.** `main` pointed at `dist/index.js`
  and no `src/index.ts` existed, so `require('@mcp-abap-adt/core')` had never
  worked — only the subpaths did. `@mcp-abap-adt/lib` has a barrel.

- **`express` and `dotenv` are real dependencies of the server.** Both are
  imported at the top of `SseServer`, `StreamableHttpServer` and `launcher`, and
  both were listed only under `devDependencies`, so a published install had
  nothing to start an HTTP or SSE transport with.

### Migration

A consumer on 9.x that only ran the server has nothing to do: install
`@mcp-abap-adt/core@10` and the CLI behaves as before.

A consumer that imported from the package changes two things — the dependency
and the specifiers:

```diff
-  "@mcp-abap-adt/core": "^9.0.0"
+  "@mcp-abap-adt/lib": "^10.0.0"
```
```diff
-import { HandlerExporter } from '@mcp-abap-adt/core/handlers';
-import { setSystemContext } from '@mcp-abap-adt/core/utils';
-import { EmbeddableMcpServer } from '@mcp-abap-adt/core/server';
+import { HandlerExporter } from '@mcp-abap-adt/lib/handlers';
+import { setSystemContext } from '@mcp-abap-adt/lib/utils';
+import { EmbeddableMcpServer } from '@mcp-abap-adt/lib/embeddable';
```

Nothing else changes: the exported names, their signatures and their behaviour
are the same objects from the same code. If you were embedding, dropping
`@mcp-abap-adt/core` is the point — it is what takes the AGPL server out of your
dependency tree.


## [9.0.0] - 2026-09-03

### Licence

- **This tool is now `GPL-3.0-only`.** It was MIT up to and including 8.13.0, and
  those versions stay MIT — a licence change is not retroactive.

  A finished tool rather than a library to build on, so it takes the full GPL
  rather than the LGPL its own dependencies carry: running it and using it on your
  own data carries no conditions, while distributing it — or a modified version —
  means passing on the same freedoms, source included.

  Copyright © 2025–2026 Oleksii Kyslytsia.


### Changed
- **Migrated to `@mcp-abap-adt/adt-clients` `^10.1.0` and `@mcp-abap-adt/interfaces` `^13.1.0`** (from `^8.0.0` / `^11.3.0`), plus `auth-providers` `^1.2.0`, `auth-broker` `^1.0.8` and `connection` `^1.10.2`. Two adt-clients majors are crossed; no MCP tool was added, removed or renamed, and no tool schema changed.
  - **Config, state and shared types are imported from `interfaces` instead of `adt-clients`**, which stopped re-exporting them — 22 handler modules. Two were also renamed: `ObjectReference` → `IObjectReference`, `SearchObjectsParams` → `ISearchObjectsParams`.
  - **A package contents item exposes `type`, not `adtType`** (interfaces 13 unified the shape as `IAdtObjectHit`). `PackageContentItem` in `lib/search-source/packageEnumerator.ts` is now an alias of `IPackageContentItem` rather than a hand-maintained copy, so it cannot drift again.
  - **`UpdateUnitTest` and `DeleteUnitTest` refuse locally instead of asking the server.** ADT exposes no resource for updating or deleting a *test run*; the client method these handlers called threw that refusal from the inside, and adt-clients 9.0.0 dropped it from the declared contract. The tools are unchanged in name, schema and outcome — their descriptions already said "will return an error" — they simply no longer make a round trip to be told no.
  - **`UpdateCdsUnitTest` and `DeleteCdsUnitTest` keep working through a narrow, documented cast.** These are real operations — update writes the local test class source, delete removes the global class, both implemented by `AdtCdsUnitTest` — but `getCdsUnitTest()` now returns a capability set that omits them, and the class is not exported. `CdsUnitTestWrites` describes exactly the two methods the class declares; it should be deleted once the accessor's type covers them.

### Fixed
- **Removed two NUL bytes committed inside a template literal** in `lib/search-source/packageEnumerator.ts`, where the dedup key's separators were `\0` instead of spaces. Harmless at runtime — a NUL separates as well as a space — but it made the file register as binary, so `grep` reported "binary file matches" and skipped it instead of showing the line.
- **`ListTransports` no longer reports an empty list while the user owns transport requests.** The tool returned `{"success": true, "count": 0, "transports": []}` for every input — any user, any `modifiable_only` — on a system where the queried user owned 55 modifiable requests, while `GetSqlQuery` against `E070` and `GetTransport` on the same connection both returned the data. The endpoint negotiates `application/vnd.sap.adt.transportorganizertree.v1+xml`, a *tree*: requests sit under status containers one level below the category (`tm:root > tm:workbench > tm:modifiable > tm:request`), `tm:workbench` repeats once per transport target, and there is a parallel `tm:customizing` branch. The parser looked for `tm:request` only directly under the root or directly under `tm:workbench`, so every lookup missed and the list came back empty — silently, with `success: true`. Requests are now collected from anywhere in the tree (the flatter shapes keep working), deduplicated by request number, and a request with no `tm:status` inherits the status of its container. `modifiable_only` is additionally enforced client-side, because the tree carries released requests too and it is not established that the endpoint honours the `status` query parameter. Unit-tested against a reconstructed tree payload; `scripts/probe-transport-list.ts` dumps the raw payload from a real system so the fixture can be replaced with a capture. ([#168](https://github.com/fr0ster/mcp-abap-adt/issues/168))

### Added
- **Diagnostic script `scripts/probe-transport-list.ts`** — dumps the raw `/sap/bc/adt/cts/transportrequests` payload for a given user and env file, so the transport-list parser can be checked against the shape a system actually returns.

### Security
- **`npm audit` is back to 0.** Four advisories had accumulated in production dependencies since 8.12.1 — `js-yaml` (GHSA-5p4m-2wfm-xmqj, high), `ip-address` via `express-rate-limit` (high), `fast-uri` via the MCP SDK's `ajv` (high) and `hono` via the MCP SDK (moderate) — enough to fail CI's `npm audit --omit=dev --audit-level=high` gate on `main` as well, independently of this migration. All four resolved in-range: `npm audit fix` without `--force`, touching only `package-lock.json`. No `overrides` entry and no direct-dependency range change was needed.

### Notes
- adt-clients 10.1.0 changes one path that used to "succeed": an update passing `super_package` for a root package changed nothing and reported success, and now actually moves the package. A caller of `UpdatePackage` relying on the old no-op will see a real move.

## [8.13.0] - 2026-07-24

### Fixed
- **Tool failures now reach the client as a plain message, with no service prefixes.** Previously a failed tool call arrived prefixed with `MCP error -32603: ` — and in the worst case double-wrapped as `MCP error -32603: ADT error: McpError: MCP error -32602: …`, with the truthful `-32602` (invalid arguments) overwritten by a generic `-32603`. Multi-item `content` was also collapsed into a single string on the error path. Root causes removed across five layers: `return_error` no longer prepends `Error: `; `BaseMcpServer` and `BaseHandlerGroup` return the `{ isError: true, content }` result instead of throwing `McpError` (which the SDK re-prefixes); 87 handler-level `throw new McpError` and `ADT error:` sites were routed through `return_error` (74 + 13); and the `McpError` symbol is now barred from `src/` except a single backward-compatibility re-export in `lib/utils.ts`, enforced by a static AST test that forbids every import and use of it elsewhere. Helper functions that feed a success payload keep throwing (a local `Error` type) so an error can never surface as `{ success: true }`. A custom/external handler group that throws the SDK's `McpError` is also handled: `return_error` strips the `MCP error -N: ` prefix at the boundary. Argument-validation errors keep their `MCP error -32602: ` prefix by design — the SDK raises those before our code runs, that code is correct, and they never reach `return_error`. Verified end to end against a live trial system. ([#155](https://github.com/fr0ster/mcp-abap-adt/issues/155))

## [8.12.1] - 2026-07-22

### Security
- **Cleared the two remaining moderate `@hono/node-server` advisories (GHSA-frvp-7c67-39w9) via an npm `override`.** `@hono/node-server` is a transitive dependency of `@modelcontextprotocol/sdk` (pulled in by the Streamable HTTP transport); even the latest SDK (1.29.0) still pins `^1.19.9`, so there is no in-range fix and `npm audit fix --force` would *downgrade* the SDK to 1.24.3. Pinning `@hono/node-server` to `^2.0.5` via `overrides` resolves 2.0.11 and takes `npm audit` to **0 vulnerabilities**. Safe because the SDK's `streamableHttp` uses only `getRequestListener` from the package (verified present and unchanged in 2.0.11); the vulnerable `serve-static` sub-path is never imported. This deliberately reintroduces a single override (all overrides were removed in #141) — justified here because in-range resolution is impossible until the MCP SDK bumps its own hono dependency. Build, `test:check`, and the SAP-free server/transport unit tests pass unchanged.

## [8.12.0] - 2026-07-22

### Removed
- **Version-history tools are no longer advertised for non-versioned object types.** `function_group`, `domain`, `data_element` and `package` were exposed by the version tools but their adt-clients handlers' `getVersions`/`getVersionSource` have always thrown "not supported" — the calls were dead on arrival. Removed from:
  - the `object_type` enum of the generic `GetObjectVersions` / `GetObjectVersionSource` / `GetObjectVersionDiff` (they now accept only the 9 genuinely versioned types: class, program, interface, function_module, table, structure, ddl, behavior_definition, metadata_extension);
  - the per-type high-level surface — the 12 tools `Get{FunctionGroup,Domain,DataElement,Package}{Versions,VersionSource,VersionDiff}` are gone (39 → 27 per-type version tools, total tool count 365 → 353).

  Those object types remain fully supported by `LockObject` and every other tool — they are lockable, just not versioned. This surfaced from the adt-clients 8.0.0 migration below: the honest capability types turned an always-failing runtime call into a compile error. **Breaking to the tool surface** (removed enum values + removed tools) — a client that requested version history for these types received a runtime error before and now gets a schema/`Unsupported object_type` error instead.

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^8.0.0` and `@mcp-abap-adt/interfaces@^11.3.0`** (from `^7.6.0` / `^11.2.0`). adt-clients 8.0.0 is a breaking major that narrows every `AdtClient.getXxx()` return type from the fat `IAdtObject` to the honest capability composite each handler actually implements (`IAdtSourceObject`, `IAdtNonVersionedObject`, or an inline intersection); interfaces 11.3.0 adds those composites. Calling a capability a handler does not implement is now a compile error instead of a silent runtime throw — which is exactly what caught the version-tools defect above. Our direct interfaces range is bumped to `^11.3.0` to keep a single top-level interfaces version aligned with the client and re-export the current type surface.

### Security
- **Cleared two high-severity production advisories (#164).** `fast-xml-parser` 5.9.3–5.10.0 → 5.10.1 (GHSA-8r6m-32jq-jx6q, DOCTYPE entity-expansion reset) and `fast-uri` 3.0.0–3.1.3 → 3.1.4 (GHSA-v2hh-gcrm-f6hx, host confusion via backslash authority delimiter; transitive via `@modelcontextprotocol/sdk` → ajv), via `npm audit fix` (lockfile only, no `package.json` dependency edits). The CI `Security audit (production deps, high+)` gate now passes. Two remaining moderate `@hono/node-server` advisories require a breaking MCP SDK major and are tracked separately.

## [8.11.0] - 2026-07-22

### Fixed
- **Read handlers no longer mask a failed read as `success:true` + null (#159).** 17 readonly handlers (`ReadDomain`, `ReadClass`, `ReadInterface`, `ReadProgram`, `ReadTable`, `ReadStructure`, `ReadDdl`, `ReadDataElement`, `ReadFunctionGroup`, `ReadFunctionModule`, `ReadFunctionInclude`, `ReadPackage`, `ReadServiceDefinition`, `ReadServiceBinding`, `ReadMetadataExtension`, `ReadBehaviorDefinition`, `ReadBehaviorImplementation`) wrapped their `read`/`readMetadata` calls in inner `try/catch` blocks that only logged a `warn` and swallowed the error, then returned `success:true` with `source_code:null`/`metadata:null` regardless. A hard failure — expired token, network error, HTTP 5xx — or a genuinely non-existent object was thus delivered to the caller as a successful (but empty) read. The inner swallows are removed; read errors now propagate to the existing outer `catch → return_error`, so a failed read returns a structured failure (tool result `isError:true`). This is the READ-path sibling of the activation/deletion masking fixes. `GetStructuresList` was not affected — it already surfaces a root read failure via `return_error` and flags partial append issues explicitly.

## [8.10.0] - 2026-07-21

### Fixed
- **Locked/failed activations no longer report a false `success:true`.** Migrated to `@mcp-abap-adt/adt-clients@^7.6.0`, which fixes the activation-masking bug (adt-clients #79): ADT's `/sap/bc/adt/activation` returns HTTP 200 even when activation fails (object locked in another session, syntax errors), and the shared `activateObjectInSession` helper previously returned that response unchecked. Every high-level `Update*`/`Activate*` tool built on it (`UpdateDomain`, and the whole family across domain, program, table, structure, class, interface, ddl, tabletype, functionModule, functionInclude, metadataExtension, behaviorDefinition, enhancement, unitTest) therefore returned `{"success":true,"...":"updated and activated successfully"}` on a locked object. With 7.6.0 the client now throws on an explicit activation-failure signal; the handler's catch maps it to a structured `McpError` (tool result `isError:true`), so consumers can finally tell the operation failed. Fixes #154.

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.6.0` and `@mcp-abap-adt/interfaces@^11.2.0`** (from `^7.4.4` / `^10.0.0`). adt-clients 7.6.0 sources its public types from interfaces `^11.2.0`; bumping our direct interfaces range keeps a single top-level interfaces version aligned with the client. No handler API change.

## [8.9.0] - 2026-07-17

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.4.4` and `@mcp-abap-adt/interfaces@^10.0.0`** (from `^7.4.2` / `^9.2.0`). interfaces 10.0.0 is a major bump whose only breaking change is removing the no-op `source_code` field from the low-level create-params (`ICreateAccessControl/ServiceDefinition/EnhancementParams`) — source is written via the update flow. This does **not** affect us: our handlers use the high-level config types (`IServiceDefinitionConfig.sourceCode`, unchanged), not the low-level create-params. adt-clients 7.4.3 dropped the matching dead create() pass-through.
- **`CreateServiceDefinition`:** removed the now-dead `sourceCode` from the `create()` config (create makes the shell only; the body is still written by the follow-up `update()` from 8.7.1). No behavior change.

## [8.8.1] - 2026-07-16

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.4.2`** (from `^7.4.0`). Two correctness fixes to `update()`'s read-back: the post-update readiness poll and the final returned read now target the **inactive** version — the one the write just produced — instead of `'active'` (which 404s for a never-activated object and returns stale content for an existing one). So reading back the result of an `update()` (including the `CreateServiceDefinition` `create → update → activate` flow) now returns the freshly written source. `@mcp-abap-adt/interfaces` stays `^9.2.0`. Non-breaking; no tool contract changed.

## [8.8.0] - 2026-07-16

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.4.0`** (from `^7.3.1`). 7.4.0 adds a session-scoped lock registry with an `unlockAll()` safety net, which complements the uninterruptible critical sections from 8.7.0 by making orphaned locks recoverable. `@mcp-abap-adt/interfaces` stays `^9.2.0`. Non-breaking; no tool contract changed.

## [8.7.1] - 2026-07-16

### Fixed
- **`CreateServiceDefinition` created the object with an empty body.** The service-definition `create()` POST only registers the shell (metadata: name/description/package) — it does **not** persist the `define service … { … }` source, and the handler had no follow-up write step (a regression in the underlying `@mcp-abap-adt/adt-clients` create flow, which used to run create → lock → update → unlock). The handler now runs an explicit high-level `update()` (lock → write source → unlock) right after create whenever `source_code` is provided, then activates — so the service definition is created with its real body. (Root cause is in adt-clients' `AdtServiceDefinition.create()`; this handler-side fix restores correct behavior immediately.)

## [8.7.0] - 2026-07-16

### Fixed
- **Timeouts no longer leave objects locked and inactive.** A mutating tool (Create/Update/Delete) runs a stateful lock → modify → unlock chain as several separate ADT requests. On a slow system a short per-request timeout would abort one of them mid-flight; aborting the socket drops the stateful ADT session and orphans the lock handle, so the follow-up unlock has nothing to release — the object was left **locked and inactive** (whereas a normal error keeps the session alive, so unlock worked). Every high-level Create/Update/Delete handler (70 tools) is now wrapped in an **uninterruptible critical section**: `beginCriticalSection()` before it runs and `endCriticalSection()` in a `finally`, via `@mcp-abap-adt/connection` 1.10.0. While active, the connection raises the request timeout to a large ceiling (`SAP_TIMEOUT_CRITICAL`, default 600000 ms) so slow write requests run to completion instead of being interrupted. Feature-detected, so it degrades to a no-op on older connections.

### Changed
- **Migrated to `@mcp-abap-adt/connection@^1.10.0`** (from `^1.9.1`), which adds the reference-counted `beginCriticalSection()` / `endCriticalSection()` primitives used above. Non-breaking.

## [8.6.1] - 2026-07-05

### Changed
- **Declared the SAP connection environment variables in `server.json` (#142 follow-up).** The MCP Registry entry carried no `environmentVariables`, so registry-based installers (e.g. FLUJO) launched the server with no configuration — it then ran in tool-inspection-only mode and the client timed out waiting for a usable connection. `server.json` now declares the connection variables (`SAP_URL` required; `SAP_AUTH_TYPE`, `SAP_SYSTEM_TYPE` with choices/defaults; `SAP_CLIENT`, `SAP_JWT_TOKEN` (secret), `SAP_USERNAME`, `SAP_PASSWORD` (secret), `SAP_LANGUAGE`, `SAP_MASTER_SYSTEM`, `SAP_RESPONSIBLE`), so registry clients can prompt for and inject them. No code change — the server already completes the MCP handshake without env vars (verified); this only surfaces the required configuration to installers. Republished to the MCP Registry via `mcp-publisher`.

## [8.6.0] - 2026-07-05

### Added
- **Message Class (MSAG / T100) CRUD tools.** Exposes the new message-class client from `@mcp-abap-adt/adt-clients` 7.3.x as MCP tools:
  - **ReadOnly group:** `ReadMessageClass` (class header + all messages), `ReadMessageClassMessage` (one message by number).
  - **HighLevel group:** `GetMessageClass`, `CreateMessageClass`, `UpdateMessageClass`, `DeleteMessageClass`, and per-message `GetMessageClassMessage`, `CreateMessageClassMessage`, `UpdateMessageClassMessage`, `DeleteMessageClassMessage`.
  - Message classes are not activatable/versioned, so there are no Check/Activate/Versions tools for them. Transport handling matches the other CRUD objects (`transport_request` sent as `corrNr`; required for transportable packages). `available_in: ['onprem', 'cloud']`.

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.3.1` and `@mcp-abap-adt/interfaces@^9.2.0`** (from `^7.2.1` / `^9.1.0`). 7.3.0 adds the Message Class client (`getMessageClass()` / `getMessageClassMessage()`); 7.3.1 wires `transport_request` (`corrNr`) from config. Non-breaking for existing tools.

## [8.5.2] - 2026-07-05

### Fixed
- **`npx -y @mcp-abap-adt/core` (and any fresh install) crashed with `Cannot find module 'yaml'` (#143).** The runtime config loader (`src/lib/config/yamlConfig.ts`) imported the `yaml` package, but `yaml` was declared only in `devDependencies` — so it was absent from the published tarball and every consumer install failed at startup. Consolidated all runtime YAML parsing onto `js-yaml` (already a runtime `dependency`, via `load()`), migrated the two integration-test helpers off `yaml` as well, and **removed the `yaml` package entirely** — one YAML library instead of two, and the runtime import now resolves from a declared dependency. Added `yamlConfig` unit tests to guard it.

### Security
- **Removed all dependency `overrides` — `npm audit` is 0 without any of them.** The overrides added in 8.5.1 turned out to be crutches: a clean lockfile resolution already reaches patched versions within each maintainer's declared semver range, so forcing transitive versions (an untested parent/child combination) was both unnecessary and a maintenance liability. Dropped the entire `overrides` block (11 entries) and let the tree resolve in-range. The single dep that stayed stuck — `esbuild` (low, dev-only, pinned by `tsx@4.21` to `~0.27.0`) — was fixed the right way: by bumping the direct dev dependency we own, `tsx ^4.21.0 → ^4.22.4`, whose maintainer moved the pin to `esbuild ~0.28.0` (includes the patched `0.28.1`). No overrides remain; every fix now comes from a direct-dependency bump or in-range resolution. Verified: `npm audit` 0, `build` + `test:check` + 348 unit tests green. Dev-tooling only, not in the published tarball — no republish required.

## [8.5.1] - 2026-07-01

### Security
- **Supply-chain dependency remediation (0 shipped high/critical).** Fixed the runtime vulnerabilities at their root by migrating to `@mcp-abap-adt/adt-clients@^7.2.1` (its security release bumping `axios ^1.18.1` + `fast-xml-parser ^5.9.3`), and bumping this package's own direct deps to match: `axios ^1.14.0 → ^1.18.1`, `fast-xml-parser ^5.5.10 → ^5.9.3`, `js-yaml ^4.1.1 → ^4.3.0`. Added `overrides` to pull patched transitive deps still on vulnerable versions: `form-data ^4.0.6`, `hono ^4.12.27`, `@hono/node-server ^1.19.14`, `fast-uri ^3.1.3`, `ws ^8.21.0`, `ip-address ^10.2.0`, `qs ^6.15.3` (all within the same major — no breaking bumps). `npm audit` dropped from 57→5; the production (`--omit=dev`) tree carries no high/critical. The 5 residual advisories are dev-tooling only (MCP Inspector → `shell-quote`/`concurrently`, Jest → `js-yaml@3`, `tsx` → `esbuild`, `@babel/core`) and are not in the published tarball; `shell-quote` has no upstream patch yet (tracked).
- **Supply-chain hardening (low-noise).** Added a CI security gate — `npm audit --omit=dev --audit-level=high` — that fails the build only on shipped high+/critical vulnerabilities, keeping signal high without nagging on dev/low/moderate noise. Post-install scripts intentionally left enabled (no dep in the tree ships install/postinstall scripts; local scripts and CI actions must keep working).

## [8.5.0] - 2026-06-30

### Added
- **Version history now surfaces the transport request (#30).** `GetObjectVersions` / `Get<Object>Versions` now include `transportRequest` (e.g. `DS4K901917`) and `transportDescription` per version when the SAP version feed carries them — so an agent can map an object's versions to the transports that produced them, which is the "transports of an object" piece of #30. Comes from `@mcp-abap-adt/adt-clients` 7.2.0; no tool/argument change (the new fields are additive on each version entry).

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.2.0` and `@mcp-abap-adt/interfaces@^9.1.0`** (from `^7.1.0` / `^9.0.0`). 7.2.0 parses the per-version transport-request link into the new optional `IObjectVersion.transportRequest`/`transportDescription` (requires interfaces ^9.1.0). Non-breaking.

## [8.4.0] - 2026-06-29

### Added
- **Version diff tools (#30).** `GetObjectVersionDiff` (generic, ReadOnly) and per-object `Get<Object>VersionDiff` (HighLevel, 13 types — e.g. `GetClassVersionDiff`, `GetProgramVersionDiff`) return a unified diff between two object versions, given the two `content_uri`s from a `…Versions` call. Each fetches both version sources and diffs them (jsdiff, 3 lines of context); the response includes `identical` and the unified `diff`. Per-object `available_in` mirrors the type's `Get<Object>` tool. Completes #30's "diff between two versions" (2b) alongside the version-history (8.2.0) and per-object high-level (8.3.0) tools.

## [8.3.0] - 2026-06-29

### Added
- **Per-object high-level version tools (#30).** Added `Get<Object>Versions` and `Get<Object>VersionSource` for the 13 versioned object types (class, program, interface, function_group, function_module, table, structure, ddl, domain, data_element, package, behavior_definition, metadata_extension) to the **HighLevel** group — e.g. `GetProgramVersions`/`GetProgramVersionSource`, `GetClassVersions`/`GetClassVersionSource`. These mirror the per-object `Get<Object>` read tools (the way `GetProgram` coexists with the read-only `ReadProgram`), so development clients that run with the ReadOnly analytics group disabled still get object version history. Each tool's `available_in` matches its `Get<Object>` counterpart (e.g. `GetProgramVersions` is onprem/legacy only). The generic `GetObjectVersions`/`GetObjectVersionSource` in the ReadOnly group are unchanged.

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.1.0`** (from `^7.0.1`). 7.1.0 makes where-used result parsing namespace-prefix agnostic (`usagereferences:` vs `usageReferences:`), further hardening append detection in `GetStructuresList` (#128) on systems that emit the other prefix; it also adds per-group subpath exports (`/core`, `/runtime`, …) — not yet adopted here. Non-breaking; no tool contract changed.

## [8.2.0] - 2026-06-28

### Added
- **Object history tools (#30).** Two read-only tools backed by `@mcp-abap-adt/adt-clients` 7.0.0's version-history API: `GetObjectVersions` (lists an object's SAP version history — `versionId`, `author`, `updatedAt`, `title`, and an opaque `contentUri` per entry) and `GetObjectVersionSource` (fetches the source of a specific version by its `contentUri`). Both dispatch by `object_type` across the same 13 object types as the generic object tools (class, program, interface, function_group, function_module, table, structure, ddl, domain, data_element, package, behavior_definition, metadata_extension); object types without a version endpoint return a clear `UNSUPPORTED_OPERATION` error rather than raw HTTP.

### Changed
- **Migrated to `@mcp-abap-adt/adt-clients@^7.0.1` and `@mcp-abap-adt/interfaces@^9.0.0`** (from `^6.1.0` / `^7.2.0`). 7.0.1 also makes where-used resilient on S/4 systems whose `/usageReferences/scope` sub-resource returns 404 — the library now falls back to an unscoped search with client-side type narrowing, hardening the append detection in `GetStructuresList` (#128) at the library level. No mcp-abap-adt tool contract changed by the migration.

## [8.1.1] - 2026-06-27

### Fixed
- **`GetStructuresList` no longer loses append structures on heavily-used objects (#128).** The append (where-used) search now scopes to append structures only (`enableOnlyTypes: ['TABL/DS']`) instead of searching all types: where-used caps the number of returned records, so on a widely-referenced base (e.g. a standard S/4 table) the append records were crowded out by other reference types and dropped, yielding `0` appends. It also resolves the base `object_type` itself (try `structure`, fall back to `table`) so a table base no longer 404s on a structures URI, and it sets `appends_unavailable: true` when the where-used lookup fails for every object_type — so callers can tell "could not determine appends" apart from "no appends" instead of getting a silent `0`.

## [8.1.0] - 2026-06-26

### Added
- **Per-call `master_language` parameter on the high-level `Create*` tools** (#105). Optional; lets a caller set the master/original language of a single created object (e.g. `"DE"`, `"ZH"`), overriding the session default. Threaded into the ADT client as `config.masterLanguage`. Covers class, program, interface, ddl, domain, structure, table, table type, data element, function group, service definition, service binding, behavior definition, metadata extension, package. When omitted, resolution falls back to the session language (`SAP_LANGUAGE`) then `EN`.
- **`x-sap-language` HTTP/SSE request header** (#105). Per-request/per-session master-language override for created objects (precedence: tool parameter → `x-sap-language` header → `SAP_LANGUAGE` → `EN`). Carried in a request-scoped context (`AsyncLocalStorage`), not the process-global system-context cache, so it cannot leak across requests, sessions, or connection modes.
- **Compact facade `create`/`update`/`delete` now expose every routed object type's required arguments.** Previously many type-specific args (e.g. `table_name`, `structure_name`, `service_definition_name`, `ddl_code`, `lock_handle`, `implementation_code`, `properties`, `container_class`, `test_class`, `cds_view_name`, …) were absent from the compact schemas, so schema-driven MCP clients could not construct valid calls for most object types. All missing properties have been added as optional properties to `compactCreateSchema`, `compactUpdateSchema`, and `compactDeleteSchema`. Non-breaking (additive optional properties; compact schema `required` stays `['object_type']`; no routed handler changed).
- **Runtime guard `compactSchemaCompleteness.test.ts`** — fails CI if any routed handler's top-level required arg is not present in the corresponding compact schema, preventing future drift.
- **Corrected compact facade descriptions** for `HandlerCreate`: `UNIT_TEST` now advertises `container_class*/test_class*` and `CDS_UNIT_TEST` now advertises `class_name*/package_name*/cds_view_name*` (previously both incorrectly showed `run_id*`, which is an update/delete arg).

## [8.0.0] - 2026-06-26

### Changed (BREAKING)
- **`View` DDL-source tools renamed to `Ddl`.** Migrated to `@mcp-abap-adt/adt-clients@^6.0.0`, whose misnamed `getView()` client became the generic DDL-source client `getDdl()` (`/sap/bc/adt/ddic/ddl/sources/` — CDS views, AMDP table functions, other DDL sources). MCP tools renamed: `GetView`→`GetDdl`, `ReadView`→`ReadDdl`, `CreateView`→`CreateDdl`, `UpdateView`→`UpdateDdl`, `DeleteView`→`DeleteDdl`, `CheckView`→`CheckDdl`, `ActivateView`→`ActivateDdl`, and the `*ViewLow` variants → `*DdlLow`. The tool argument `view_name` is now `ddl_name`.
- **Generic object tools** (`LockObject`/`UnlockObject`/`CheckObject`/`ValidateObject`/`DeleteObject`): the `object_type` value `"view"` is renamed to `"ddl"` (removed, no alias).
- **Compact facade** (`HandlerGet`/`HandlerCreate`/… ): the `object_type` value `VIEW` is renamed to `DDL` and its `view_name` argument to `ddl_name` (removed, no alias).

## [7.2.1] - 2026-06-23

### Fixed
- **`GetStructuresList` now returns extension (append) structures in the tree.** Calling it with just a structure name (e.g. `ZMCP_SHR_STRU`) returns a hierarchy containing both the included structure (`kind: include`) and the appending structure that `extend type <this> with …` (`kind: append`). Previously appends were missed: the where-used lookup used the default scope (some object types unselected, so the extension's type was excluded) and a fragile `displayName`/`globalType` regex. It now uses `getWhereUsedList({ enableAllTypes: true })` and the parsed references. Also removed dead `.APPEND` source-parsing (ADT never emits `.APPEND` in a structure's source — appends are separate `extend type` objects). Verified end-to-end on a real system.

## [7.2.0] - 2026-06-22

### Added
- **DNS-rebinding protection for the HTTP/SSE transports.** `--http-allowed-hosts`/`--sse-allowed-hosts`, `--http-allowed-origins`/`--sse-allowed-origins`, and `--http-enable-dns-protection`/`--sse-enable-dns-protection` (plus the matching `MCP_HTTP_*`/`MCP_SSE_*` env vars and the `http`/`sse` `allowed-hosts`/`allowed-origins`/`enable-dns-protection` YAML keys) now take effect: when enabled with an allowlist, requests with a non-allowlisted `Host`/`Origin` header are rejected with HTTP 403. Transport-aware (http uses `http*`, sse uses `sse*`); applied in `registerRoutes` so both standalone and embedded modes are protected; `/mcp/health` is ungated. Defaults off (no-op). This is Host/Origin allowlist validation, NOT browser CORS. Values are matched exactly (Host includes port, e.g. `localhost:3000`). Implemented as own Express middleware rather than the now-deprecated SDK transport options.

## [7.1.3] - 2026-06-20

> Fixes the SSE transport host/port resolution, removes a broken CLI bin entry,
> and corrects the install documentation (`README.md`/`docs/` ship in `files`,
> so the doc fixes reach npm users with this release).

### Fixed
- **SSE transport now honours its own host/port.** `--transport=sse` resolved the final host/port from the HTTP defaults/flags (`httpHost`/`httpPort`, so it listened on `3000`), ignoring `--sse-host`/`--sse-port` and `MCP_SSE_HOST`/`MCP_SSE_PORT`. Host/port resolution is now transport-aware: SSE falls back to the SSE defaults (host `127.0.0.1`, port `3001`) and its `--sse-*` flags / `MCP_SSE_*` env vars take effect; the generic `--host`/`--port` still win when provided. (`src/lib/config/ServerConfigManager.ts`.)
- **Removed the dangling `mcp-abap-adt-v2` bin entry.** `package.json`/`package-lock.json` still mapped `mcp-abap-adt-v2` → `bin/mcp-abap-adt-v2.js`, a file removed in an earlier release, so a global install created a broken `mcp-abap-adt-v2` symlink. The only binary is `mcp-abap-adt`. Also fixed a stale `mcp-abap-adt-v2` example in `tools/show-storage-paths.js` help output.
- **Documentation accuracy sweep:**
  - Install docs/README used the wrong npm scope `@fr0ster/mcp-abap-adt`; corrected to `@mcp-abap-adt/core` (the GitHub repo path and the `io.github.fr0ster/…` registry id are unchanged).
  - Stale local-pack tarball names / version pins (`…-1.1.0/1.2.0.tgz`) → version-independent `mcp-abap-adt-core-<version>.tgz` (so they no longer drift); Node requirement `18` → `22+` (matches `engines`); removed the non-existent `npm run start:legacy` / `dev:stdio` references and the `bin/mcp-abap-adt-v2.js` run examples.
  - Corrected narrative drift: default transport is `stdio` (not HTTP); HTTP/SSE host default is `127.0.0.1` (not `0.0.0.0`); removed non-existent `--http`/`--sse` CLI shortcuts; refreshed handler-group tool counts and the `src/handlers/` directory list; the `system` handler group rides with `readonly` (it is not always included).
  - Regenerated `docs/user-guide/AVAILABLE_TOOLS*.md` from the current `TOOL_DEFINITION`s (function-include tools, `GetStructuresList`, `GetIncludesList` tree, `GetProgFullCode` removal, refreshed counts).
  - Removed documentation for the CORS / allowed-hosts / DNS-rebinding-protection options (`--http`/`--sse-allowed-origins`/`-allowed-hosts`/`-enable-dns-protection`, the matching `MCP_*` env vars, and the `http`/`sse` `allowed-origins`/`allowed-hosts`/`enable-dns-protection` YAML keys): they are parsed but not wired to the servers, so documenting them overstated capability. Actually implementing these is planned for a follow-up release.

## [7.1.2] - 2026-06-20

> **Test infrastructure only.** The published runtime (`dist/`) is unchanged from
> 7.1.1 — no tool, handler, or library behaviour changed for consumers. This
> release bundles integration-test reliability fixes and a stale-metadata fix.

### Fixed
- **`shared:setup` resilient to the cloud activation-run timeout.** Bulk-activating the ~24 shared objects in one activation run can exceed adt-clients' fixed ~45s request timeout; on a timeout the setup now skips the doomed full-group retries and falls back to batched activation (chunks of 5, with a second pass retrying only the leftovers) instead of failing.
- **Runtime profiling test produces a trace.** The runnable class now does measurable CPU work so the profiler arms and a trace is written; a trivial single-statement class finished before tracing engaged, so the trace never resolved (`Failed to resolve traceId`).
- **Runtime dump test actually creates and reads a dump** (was silently skipping or hitting a `400 session` error). It activates the division-by-zero class, triggers the dump on a separate connection (so the dumping run's server-side context loss does not poison the connection used to read the dump), fixes dump-id extraction from the feed entry (`id` field, plural `/runtime/dumps/<id>` path, URL-encoded, no decode), binds the read dump to the uniquely-named generated class, and fails (instead of skipping) when no dump is produced. `params.dump_id` remains the explicit opt-out for read-only environments.
- **`server.json` version** was stale at `7.0.3`; bumped to match the package version.

## [7.1.1] - 2026-06-19

### Fixed
- **`UpdateFunctionInclude` now supports an `activate` parameter** (default `false`) — when `true`, the include is activated after the source update so the new source becomes the active version, mirroring `UpdateFunctionModule`. Previously the tool always left the updated source inactive.
- Integration-test + `test-config.yaml.template` fixes for the new function-include / structure tools (verified end-to-end on a real system): the FUGR-include lifecycle update source is now a valid declaration (a bare executable statement in an include caused "Statement is not accessible"); the `ListFunctionGroupIncludes` test no longer asserts the generated `L<FUGR>UXX` collector is absent (the tool faithfully returns ALL `FUGR/I` includes — collector filtering is a backup-tool concern); the template seeds the shared `ZMCP_SHR_FGRP` / `Z_MCP_SHR_FM` the function-include tests reference.

## [7.1.0] - 2026-06-18

### Added
- **Function-group include tools.** Six new MCP tools expose ADT function-group include operations:
  - Read-only: `ReadFunctionInclude` (source + metadata), `ListFunctionGroupIncludes` (a FUGR's includes — TOP + custom), `ListFunctionModules` (a FUGR's function modules).
  - High-level: `CreateFunctionInclude`, `UpdateFunctionInclude`, `DeleteFunctionInclude`.
  - The list tools surface the new adt-clients `getUtils().listFunctionGroupIncludes()` / `listFunctionModules()` (nodestructure drill-down). `DeleteFunctionInclude` surfaces SAP's refusal message when an include can only be deleted via the Function Builder.
- Integration tests (`FunctionIncludeReadOnlyHandlers`, `FunctionIncludeHighHandlers`) and `tests/test-config.yaml.template` cases for the new tools.
- **Structure embedding tools (tree output).** New read-only `GetStructuresList` — recursively lists the structures embedded in an ABAP structure (or table) as a TREE. Each node records the embedded structure name, the `attribute` it is embedded under (named include `attr : include X;` vs anonymous `include X;` → `null`), and `kind`: `include` (from the source) or `append` (an extension found via where-used whose source is `extend type <this> with …`). Includes come from the DDL/classic source (`include X;`, `.INCLUDE`/`.APPEND`); appends are resolved via where-used (toggle with `include_extensions`, default true). Cycle-guarded. `GetIncludesList` reworked from a flat list to a recursive TREE (each include may have child includes; cycle-guarded, depth-capped). Integration test `GetStructuresListHandler` + `tests/test-config.yaml.template` case (shared structures `ZMCP_SHR_STRU` / `ZMCP_SHR_STRU_INC`).

### Changed
- Bumped `@mcp-abap-adt/adt-clients` from `^5.6.0` to `^5.8.0` (adds `listFunctionModules`/`listFunctionGroupIncludes`; `getFunctionInclude().read()` returns source; `delete()` surfaces server-refused deletions). Clean registry install (no `link:true`/`file:`).

## [7.0.3] - 2026-06-13

### Changed
- Bumped `@mcp-abap-adt/adt-clients` from `^5.5.0` to `^5.6.0`. Picks up: `package` create now honours the configurable master language (so `CreatePackage` stamps the session `SAP_LANGUAGE` like the other object types — #105), and the behaviorDefinition namespace URL-encoding fix (namespaced `/NSP/…` behavior definitions can now be read/locked/updated/activated/checked/unlocked/deleted). Clean registry install (no `link:true`/`file:` in the lockfile).

### Note
- Per-call `master_language` tool parameter on `Create*` and the inbound `X-SAP-Language` header override are a planned follow-up; this release wires the session-language default to package as well.

## [7.0.2] - 2026-06-13

### Added
- **Created objects now adopt the logon language as their master/original language.** `getSystemContext()` reads `SAP_LANGUAGE` into `masterLanguage`, and `createAdtClient()` forwards it to the ADT client, so every `Create*` tool stamps `adtcore:masterLanguage`/`adtcore:language` with the session language instead of always `EN`. When `SAP_LANGUAGE` is unset the client still defaults to `EN`. Requires the configured language to be installed on the target system (otherwise SAP normalizes it to the system default). (#105)

### Changed
- Bumped `@mcp-abap-adt/adt-clients` from `^5.4.4` to `^5.5.0` for the configurable-master-language support. Clean registry install (no `link:true`/`file:` in the lockfile).

### Note
- A per-call `master_language` parameter on the high-level `Create*` tool schemas (to override the session language per object) is planned as a follow-up; the underlying client already supports `config.masterLanguage`.

## [7.0.1] - 2026-06-11

### Fixed
- Bumped `@mcp-abap-adt/adt-clients` from `^5.4.2` to `^5.4.4` to pick up the stateful-lock-chain fix. Object writes (e.g. `UpdateClass`) no longer fail with HTTP `423 — not locked (invalid lock handle)` on older ABAP kernels (e.g. BASIS 7.55) over HTTP: the client now keeps the connection stateful for the whole `lock → check → update → unlock` chain across all object types, instead of switching back to stateless before the lock-bound PUT. Newer kernels (758/816) already tolerated the stateless write. No server-side API or tool-schema change. (#106)

## [7.0.0] - 2026-05-30

### Changed
- **BREAKING: `EmbeddableMcpServer` now applies `ReadVsGetDedupStrategy` by default.** Previously the embeddable server defaulted to `NoDedupStrategy`, so exposing `readonly` + `high` together surfaced both `Read<X>` and `Get<X>` for the same operation (e.g. `ReadProgram` + `GetProgram`), leaving tool selection up to the client. Embedders (e.g. cloud-llm-hub) now get the same single-tool-per-operation view as the standalone launcher. Consumers that relied on both variants being exposed must opt out by passing `readOnlyDedupStrategy: new NoDedupStrategy()`. No code-level API change — the difference is the set of tools exposed to clients.

## [6.11.3] - 2026-05-30

### Removed
- **`GetProgFullCode` removed as a redundant read path.** A program or function group with includes can already be read through one canonical path — `ReadProgram` / `ReadFunctionGroup` (main) → `GetIncludesList` → `GetInclude` per include — and an explicit `GetInclude` is required anyway (includes can live outside any single object's tree). Two overlapping strategies made LLM and RAG-based tool selection non-deterministic. The piecemeal path covers function groups as well (`GetIncludesList` accepts `FUGR`), so no capability is lost. (#100)

### Changed
- **Sharpened source-read tool descriptions for clearer LLM / semantic tool selection.** `ReadProgram` now reads as "Read a MAIN ABAP program … NOT for includes — use `GetInclude`" (dropping the misleading "Create, Update" lead-in on a read-only tool), and `GetInclude` now reads as "Read ANY single ABAP include source by name, from anywhere in the repository … the correct tool for include names (PROG/I)". `GetIncludesList` is unchanged. (#100)

## [6.11.2] - 2026-05-29

### Fixed
- **`ReadProgram` could still return a silent `{ success: true, source_code: null }` for non-main-program names.** The 6.11.1 heuristic only fired when *both* source and metadata came back empty; when the `programs` endpoint returned metadata for a non-`PROG/P` object (e.g. an include) the response slipped through to a misleading `success: true` with `source_code: null`. `ReadProgram` now parses `adtcore:type` from the metadata and rejects anything other than a main program (`PROG/P`) with a structured `{ success: false, error: "invalid_object_type", object_type, message }`. No tool redirect is emitted — choosing the right tool is the consumer's decision. The tool description now states it works only for main programs (`PROG/P`). (#91)

## [6.11.1] - 2026-05-29

### Fixed
- **`ReadProgram` returned a silent `{ success: true, source_code: null }` for include names.** LLM agents loading a report's full source call `ReadProgram` on the include names returned by `GetIncludesList`, get `null`, read it as a permission/inactive-object problem rather than "wrong tool", and stall. A readable main program (`PROG/P`) always returns source; when both source and metadata come back empty the name is an include (`PROG/I`). `ReadProgram` now returns a structured `{ success: false, error: "include_name_passed", suggestion: "GetInclude(\"<name>\")" }` so the caller gets an actionable signal at the point of failure. (#91)
- **`GetProgFullCode` read include source via the wrong content key.** `handleGetInclude` returns `{ type: 'text', text }`, but two call sites read `c.data`: the recursive `collectIncludes` helper (so nested includes were never discovered) and the `FUGR` branch (so every function-group include came back as `code: null`). All sites now read `c.text`. (#91)

## [6.11.0] - 2026-05-28

### Added
- **`LockObjectLow` / `UnlockObjectLow` now support `function_module`.** The schema already advertised `function_module` with `GROUP|FM_NAME` name format, but the handlers returned an unsupported-operation error. Both now parse the compound name and delegate to `client.getFunctionModule().lock()/unlock()`. (#90)

### Changed
- **Tool descriptions aligned with implementation.** `GetWhereUsed` now lists the closed set of supported `object_type` values, documents the `GROUP|FM_NAME` format for function modules, clarifies that `view = CDS DDL source` (classic DDIC views unsupported), and warns about the cost of `enable_all_types`. `DeleteObjectLow` and the four compact `Handler{Create,Delete,Get,Update}` tools annotate `PROGRAM` as `[onprem/legacy only]` in their descriptions (no `available_in` change — the rest of the supported types are still valid on cloud). `GetIncludesList` spells out the four supported `object_type` enum values. (#90)
- **`server.json` version synced to package.json.** It had drifted to `6.8.0`; now follows the package version.

### Removed
- **Dead `filePath` / `writeResultToFile` plumbing.** A side-channel `filePath` argument was accepted (often without being declared in `inputSchema`) by ten read-only handlers — `GetInclude`, `GetIncludesList`, `GetSqlQuery`, `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl`, `GetPackageContents`, `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`. The lib comment claimed it sandboxed writes to `./output`, but did no validation — any absolute path the process could write to was accepted. The feature was no longer relied on, so it has been removed along with `src/lib/writeResultToFile.ts`. (#90)

### Fixed
- **`tools/generate-tools-docs.js` truncated descriptions at the first inner quote.** Both the per-property and the top-level extractor used `/description\s*:\s*['"]([^'"]+)['"]/`, which stops the capture at the first `'` or `"` of any kind. New descriptions added in this release would have rendered as `Answers:`, `form`, `Supported values:` etc. in `AVAILABLE_TOOLS*.md`. Switched to a quote-balanced pattern with an unescape pass. (#90)

## [6.10.0] - 2026-05-24

### Added
- **`SearchSource` time budget → partial results.** New `time_budget_ms` argument: when the internal scan deadline is exceeded, the tool returns the hits gathered so far instead of nothing, with a new `truncated.by_timeout: true` flag. Set it below your client/transport timeout (e.g. `540000` for a 600s client). Addresses the "no partial result after 600s" failure in #89.

### Changed
- **`SearchSource` default `max_hits_per_object` raised `1` → `100`.** The old default of 1 silently capped per-object hits and tripped `truncated.by_object_cap` on any object with ≥2 matches. (#89)
- **`SearchSource` tool description clarified:** `by_object_cap` means a per-object hit cap was reached (raise `max_hits_per_object`), NOT a limit on the number of objects scanned (that is `max_objects` / `by_max_objects`). Added concurrency guidance — `concurrency` is capped at 16 per call; run only ONE `SearchSource` per destination at a time (parallel calls saturate the SAP scan backend). (#89)

### Notes
- The remaining #89 item — pushing the substring filter to a server-side ADT source-search endpoint (the only change that makes large-package scans *fast* rather than just *interruptible*) — is deferred pending live-system research into the ADT API.

## [6.9.2] - 2026-05-24

### Documentation
- README: document the NTLM hard-reject behavior in the Kerberos auth section (carries the connection `1.9.1` change to the published package).

## [6.9.1] - 2026-05-24

### Changed
- Bump `@mcp-abap-adt/connection` to `^1.9.1`, which adds **NTLM hard-reject** for Kerberos auth: a Kerberos connection now fails with a clear error if the SAP system offers NTLM (instead of silently swallowing the 401). Only Kerberos/SPNEGO is accepted.

## [6.9.0] - 2026-05-24

### Added
- **Certificate (mTLS) and Kerberos (SPNEGO) authentication** for on-prem HTTP connections. Select via `SAP_AUTH_TYPE=certificate` or `SAP_AUTH_TYPE=kerberos`.
  - Certificate: PEM (`SAP_CERT_PATH` + `SAP_CERT_KEY_PATH`) or PKCS#12 (`SAP_CERT_PFX_PATH` + optional `SAP_CERT_PASSPHRASE`). mTLS — no `SAP_USERNAME`/`SAP_PASSWORD` needed.
  - Kerberos: single-leg Negotiate via the optional `kerberos` native package; SPN from `SAP_KERBEROS_SPN` (or derived `HTTP@<host>`, service class via `SAP_KERBEROS_SERVICE`). Requires a valid TGT (`kinit`) or keytab on the host.
  - Both bypass the auth-broker (no browser/OAuth flow). Requires `@mcp-abap-adt/interfaces@^7.2.0`, `@mcp-abap-adt/connection@^1.9.0`.

### ⚠️ Help wanted — not yet validated on a live system
These two auth paths pass full unit coverage but have **not** been exercised against a real SAP system. If you have an on-prem system with **client-certificate** or **Kerberos/SPNEGO** SSO, please try `SAP_AUTH_TYPE=certificate`/`kerberos` and report results — especially whether Kerberos works with a single-leg Negotiate token or your system requires mutual-auth continuation. Please open an issue with what you see; feedback will confirm or refine these flows.

## [6.8.0] - 2026-05-16

### Changed
- `SearchSource.packages` now accepts ABAP `*` masks (e.g. `Z*`, `ZFI_*`, `/NS/Z*`) alongside exact dev-class names. Mask resolution reuses the same ADT informationsystem/search path that `SearchObject` uses for `objectType=DEVC`. Mask resolution is best-effort and capped at the ADT result window (1000 references); for certainty, pass concrete package names. The tool description carries the no-guarantees disclosure so an LLM caller sees it.
- `SearchSource.scanned.packages` now reports the resolved-and-deduplicated starting-package count (post-mask resolution, post-dedup) instead of raw input length. Closes #87.

### Notes
- `+` (single-char) wildcard probed against an on-premise system and found unsupported by the ADT `informationsystem/search` endpoint (despite SAP CP-pattern docs). Dropped from public examples; the resolver still detects `+` for forward-compat with backends that may honor it.

## [6.7.0] - 2026-05-14

### Added
- `SearchSource` (onprem + legacy) — source-text search across ABAP repository objects without invoking `SUBMIT AFX_CODE_SCANNER`. Scans programs (`PROG/P`), function groups (`FUGR/F`, including FMs and FUGR/PU/PD/PT/PY auto-includes), and classes (`CLAS/OC`, main include only in v1). Supports AND-query, up to three exclusion substrings, per-object hit cap, comment-line skip, subpackage recursion, object-name glob filter, bounded parallelism (default 8, max 16), and a deterministic `truncated` signal (`by_object_cap` / `by_max_objects`). Cloud is explicitly out of scope (no indexed source-search endpoint; see fr0ster/mcp-abap-adt-clients#36). Closes #79.

### Notes
- Comments are **searched by default**. Set `exclude_comments=true` to drop col-1 `*` and full-line `"` comment lines (AFX-strict semantics; whitespace-prefixed `*` is not a comment in ABAP and is never skipped).
- The `version` parameter affects PROG and CLAS main include reads only — FUGR subincludes are always read against the active version because the include endpoint exposes no version selector.
- Class subincludes (CCDEF / CCMAC / CCAU / CCIMP / CCPUBLIC) are not yet enumerable through the MCP surface and are out of scope for v1; tracked as a follow-up.

## [6.6.0] - 2026-05-14

### Added
- `RuntimeRunClass` (onprem + cloud) — execute an ABAP class implementing `if_oo_adt_classrun` and return its stdout text. Optional `profile=true` runs through the profiler and additionally surfaces `profile.profiler_id` / `profile.trace_id` (same retry tunables as the previous tool).
- `RuntimeRunProgram` (onprem only) — execute an ABAP report and return its stdout text. Optional `profile=true` starts a profiler trace; trace must be located afterwards via `RuntimeListProfilerTraceFiles` (program execution is fire-and-forget).

### Deprecated
- `RuntimeRunClassWithProfiling` and `RuntimeRunProgramWithProfiling` are now marked deprecated in their tool descriptions. They remain functional. Prefer the unified `RuntimeRunClass` / `RuntimeRunProgram` with `profile=true`. Scheduled for removal in a future major release.

## [6.5.3] - 2026-05-13

### Added
- `RuntimeRunClassWithProfiling` now accepts optional `max_trace_attempts`, `trace_retry_delay_ms`, and `trace_lookup_uris` so callers can tune trace-resolution polling. Defaults remain 5 attempts × 2000 ms; raise on slow systems (e.g. SAP trial cloud) where the trace file is written with extra delay. Closes #82.

## [6.5.2] - 2026-05-13

### Fixed
- Bump `@mcp-abap-adt/adt-clients` to `^5.4.2` and `@mcp-abap-adt/connection` to `^1.8.1` to pick up the stale-CSRF 401 recovery fix (fr0ster/mcp-abap-connection#7, originally reported as #78). On on-prem SAP with basic auth, a cached-but-stale CSRF token caused POST/PUT/DELETE to fail permanently with `401 + login HTML`; the connection layer now detects this case, clears the token/cookies, and retries.

## [6.5.1] - 2026-04-24

### Documentation
- README: mention optional `readOnlyDedupStrategy` in the `EmbeddableMcpServer` example and link to the dedup strategies section in `HANDLERS_MANAGEMENT.md`.

## [6.5.0] - 2026-04-24

### Added
- `EmbeddableMcpServer` accepts optional `readOnlyDedupStrategy: IReadOnlyDedupStrategy` to hide duplicate `Read<X>` readonly handlers when another group (HighLevel / LowLevel / Compact) contributes an equivalent. Ships two implementations: `NoDedupStrategy` (default — no behavior change for existing consumers) and `ReadVsGetDedupStrategy` (hides `Read<X>` when `Get<X>` is exposed). Consumers can also plug custom strategies for role-based rules. Exported from `@mcp-abap-adt/core/handlers` and `@mcp-abap-adt/core/server`.
- CLI launcher validates `--exposition` — `compact` must be exposed alone, `high` and `low` are mutually exclusive. Fails fast at startup with a clear error on misconfiguration.
- Diagnostic scripts `scripts/read-fm.ts` and `scripts/probe-fm.ts` for reproducing function-module endpoint quirks against an arbitrary env file.

### Changed
- CLI launcher opts into `ReadVsGetDedupStrategy` by default, so running the shipped server no longer exposes duplicate pairs like `ReadFunctionModule` + `GetFunctionModule` when both `readonly` and `high` are enabled.

### Fixed
- `ReadFunctionModule` / `GetFunctionModule`: ADT resolves function modules by name regardless of the group segment in the URL, so passing a wrong group silently returned the correct FM's source and echoed the wrong group back in the response. Both handlers now read metadata first, verify the owning group via `<adtcore:containerRef/>`, and reject mismatches with an explicit error (`Function module X belongs to group Y, not Z.`). The response now echoes the real group from metadata rather than the input.

### Backward compatibility
- `EmbeddableMcpServer` default dedup is `NoDedupStrategy` — existing consumers see no change in exposed tool sets until they explicitly pass a strategy.
- Invalid `--exposition` combinations previously silently produced duplicate-tool errors at runtime or exposed overlapping handlers; they now fail at startup with an explicit message.

## [6.4.1] - 2026-04-21

### Fixed
- `docker/Dockerfile`: switch default `MCP_TRANSPORT` from `stdio` to `http` so the image runs as an HTTP MCP server out of the box
- `docker/Dockerfile`: correct launcher path (`dist/server/v2/launcher.js` → `dist/server/launcher.js`) — previous path did not exist and prevented the container from starting
- `docker/Dockerfile`: pass `--allow-destination-header` so callers can supply SAP connection parameters via request headers (no default SAP connection baked into the image)
- `docker/Dockerfile`: fix healthcheck endpoint (`/health` → `/mcp/health`) to match the actual route exposed by `StreamableHttpServer`
- `docker/Dockerfile`: use `npm run build:fast` in the builder stage — the full `build` runs Biome which requires `.gitignore`, but `.dockerignore` excludes it

## [6.4.0] - 2026-04-20

### Added
- `EmbeddableMcpServer` accepts a new optional `systemType: 'onprem' | 'cloud' | 'legacy'` option. When set, it overrides the process-global `SAP_SYSTEM_TYPE` env var for the `available_in` tool filter of that server instance only. Enables hosts that serve multiple SAP systems per request (e.g., proxies routing to a mix of on-premise Cloud Connector and cloud-hosted destinations) to register the correct tool set per instance without mutating `process.env`. (#69)
- `BaseMcpServer` constructor accepts the same `systemType` option for subclasses.

### Changed
- Filter-skip debug log now reports whether the resolved system type came from the per-instance option or the env var (`source=option` / `source=env`).

### Backward compatibility
- `systemType` is optional; omitting it preserves the previous behavior (env var fallback, default `cloud`). No consumer changes required.

## [6.3.1] - 2026-04-19

### Changed
- Bumped `@mcp-abap-adt/adt-clients` to ^5.2.1 to drop transitive `node-rfc` dependency in favor of `@mcp-abap-adt/sap-rfc-lite`

## [6.3.0] - 2026-04-18

### Changed
- Enriched all CRUD tool descriptions (Create, Read, Update, Activate) with structured Operation/Subject context for improved RAG-based tool selection (#66)
- Unified description format across all 13 object types: Class, Program, Table, View, Domain, DataElement, Interface, FunctionModule, BehaviorDefinition, MetadataExtension, ServiceDefinition, ServiceBinding, Structure

## [6.2.2] - 2026-04-17

### Added
- Debug and tracing scripts: `debug-profiling`, `get-dump`, `list-dumps`, `list-traces`
- All scripts accept CLI parameters (`--class`, `--user`, `--id`, etc.) and support `--help`

## [6.2.1] - 2026-04-17

### Fixed
- `SAP_SYSTEM_TYPE` was commented out in `.env.example` — users on on-premise systems silently lost access to Program tools because the default is `cloud`

### Documentation
- Added `SAP_SYSTEM_TYPE` to all `.env` examples in installation and CLI docs
- Added `SAP_SYSTEM_TYPE` to SAP Connection environment variables reference

## [6.2.0] - 2026-04-16

### Changed
- Updated `@mcp-abap-adt/connection` to ^1.8.0
- Updated `@mcp-abap-adt/adt-clients` to ^5.1.0

## [6.1.0] - 2026-04-16

### Changed
- RFC connection is no longer tied to legacy systems — it is now a general-purpose connection transport for any on-prem system with SAP NW RFC SDK (closes #63)

## [6.0.0] - 2026-04-16

### Breaking Changes
- **Removed** `RuntimeListDumps` tool — use `RuntimeListFeeds(feed_type='dumps')` instead, which uses the same ADT feed API as Eclipse and avoids timezone issues
- **Removed** `datetime` and `user` parameters from `RuntimeGetDumpById` — `dump_id` is now the only required parameter; get dump IDs from `RuntimeListFeeds` first

### Fixed
- `UpdateInterface` fails with "Parameter corrNr could not be found" on SAP BTP ABAP Cloud — added missing `transportRequest` parameter to interface update call (closes #61)

### Changed
- `RuntimeGetDumpById` simplified: only accepts `dump_id` (from `RuntimeListFeeds`), no more datetime+user search with ±60s window (closes #62)
- Compact `HandlerDumpList` now delegates to `RuntimeListFeeds` instead of removed `RuntimeListDumps`

## [5.2.0] - 2026-04-15

### Added
- `ActivateServiceDefinition` handler (high + low level) for standalone activation of ABAP service definitions (closes #60)
- `ActivateServiceBinding` handler (high + low level) for standalone activation of ABAP service bindings (closes #60)
- Integration test for ServiceBinding high-level handlers (create with variant, activate, delete)
- Shared service definition `ZMCP_SHR_SRVD01` in shared_dependencies for binding tests
- Service definitions support in shared:setup and shared:teardown

### Changed
- `CreateServiceBinding`: replaced `binding_type` (ODataV2/ODataV4) with `binding_variant` using `ServiceBindingVariant` type — supports ODATA_V2_UI, ODATA_V2_WEB_API, ODATA_V4_UI, ODATA_V4_WEB_API; default changed to ODATA_V4_UI (Fiori Elements) (closes #59, #60)
- `UpdateServiceBinding`: replaced `service_type` with `binding_variant` for consistent API
- Upgraded `@mcp-abap-adt/interfaces` to ^7.0.0, `@mcp-abap-adt/adt-clients` to ^5.0.0
- Long test timeout increased from 400s to 600s

## [5.1.1] - 2026-04-13

### Fixed
- Update handlers must unlock objects in finally block on failure — `UpdateBehaviorDefinition` and `UpdateMetadataExtension` now wrap lock/update/unlock in try/finally to prevent stale locks when update fails (closes #57)

### Changed
- Upgraded `@mcp-abap-adt/adt-clients` to 4.0.5

## [5.1.0] - 2026-04-13

### Added
- 13 high-level Check tools for standalone syntax/semantic validation of ABAP objects (closes #54): CheckBehaviorDefinition, CheckClass, CheckDataElement, CheckDomain, CheckFunctionGroup, CheckFunctionModule, CheckInterface, CheckMetadataExtension, CheckPackage, CheckProgram, CheckStructure, CheckTable, CheckView
- Normalized response contract for Check tools: shared `object_name` field, `session_id`/`session_state` stripped from output
- `normalizeCheckResponse` utility for consistent Check tool response normalization
- Integration tests for all 13 Check handlers with step-by-step logging

## [5.0.11] - 2026-04-13

### Fixed
- `IAbapConnection.connect()` is now part of the interface contract — CSRF token and session cookies are established before any ADT requests, removing unsafe `as any` cast (relates to #53)

### Changed
- Upgraded `@mcp-abap-adt/interfaces` to ^6.1.0, `@mcp-abap-adt/connection` to ^1.6.0

## [5.0.10] - 2026-04-13

### Changed
- Dropped Node 20 support, minimum is now Node 22

## [5.0.9] - 2026-04-13

### Fixed
- Skip syntax check when saving without activation (`activate=false`) — allows uploading source code with unresolved dependencies (e.g., CDS views with circular references) for later mass activation via `ActivateObjects` (closes #52)

## [5.0.8] - 2026-04-13

### Added
- `ActivateObjects` tool for group/mass activation of any ABAP object types (closes #49)
- Per-type Activate tools in high-level group: ActivateDomain, ActivateDataElement, ActivateTable, ActivateStructure, ActivateView, ActivateClass, ActivateInterface, ActivateProgram, ActivateFunctionModule, ActivateFunctionGroup, ActivateBehaviorDefinition, ActivateMetadataExtension
- Uncommented `ActivateObjectLow` in low-level group
- Known Limitations section in architecture docs — parallel write tool calls are not supported

### Fixed
- Objects not activating after creation — added long polling wait between unlock and activate in 10 high-level handlers (closes #47)

## [5.0.6] - 2026-04-13

### Fixed
- Stdio mode: log output no longer leaks into stdout (reserved for JSON-RPC protocol) — all logger fallbacks now use stderr or noop (closes #46)
- CSRF token errors on write operations — `resolveSystemContext` was making HTTP requests on the handler connection, invalidating cookies/CSRF token (closes #45)

### Changed
- **Breaking:** Removed `resolveSystemContext` and `resetSystemContextCache` from public API — these were internal functions that mutated connection state. Use `getSystemContext()` (read-only) and `setSystemContext()` instead.
- `EmbeddableMcpServer` now accepts `systemContext` option to set system info without HTTP calls
- `BaseMcpServer` no longer calls `resolveSystemContext` on the handler connection — system context is resolved once at startup on a temporary connection

## [5.0.4] - 2026-04-13

### Added
- Export `resolveSystemContext`, `getSystemContext`, `resetSystemContextCache` and `IAdtSystemContext` from `@mcp-abap-adt/core/utils` for consumers that bypass `BaseMcpServer` (closes #44)

### Changed
- Updated `@mcp-abap-adt/adt-clients` to 4.0.4 — validates responsible person before create to prevent cryptic SAP error

## [5.0.3] - 2026-04-12

### Changed
- Updated `@mcp-abap-adt/adt-clients` to 4.0.3 — fixes `$TMP` and similar local package handling

## [5.0.2] - 2026-04-11

### Changed
- Improved tool descriptions for RAG search quality — front-loaded action verbs, added "Answers:" trigger phrases for GetWhereUsed, SearchObject, and all Read* handlers (closes #42)

## [5.0.1] - 2026-04-11

### Removed
- Compact wrappers `HandlerFeedList`, `HandlerSystemMessageList`, `HandlerGatewayErrorList` — duplicated system-level tools, causing LLM tool selection confusion

## [5.0.0] - 2026-04-11

### Changed
- Migrated to `@mcp-abap-adt/adt-clients` 4.0.0 factory API (`getProfiler()`, `getDumps()`, `getFeeds()`)

### Added
- `RuntimeListFeeds` — unified ADT feed reader (descriptors, variants, dumps, system messages, gateway errors)
- `RuntimeListSystemMessages` — SM02 system messages
- `RuntimeGetGatewayErrorLog` — SAP Gateway error log (/IWFND/ERROR_LOG) with detail view
- Compact wrappers: `HandlerFeedList`, `HandlerSystemMessageList`, `HandlerGatewayErrorList`

## [4.9.0] - 2026-04-08

### Changed
- Merged `RuntimeAnalyzeDump` into `RuntimeGetDumpById` — one tool with `response_mode` parameter (`payload`, `summary`, `both`) instead of two overlapping tools

### Removed
- `RuntimeAnalyzeDump` tool (use `RuntimeGetDumpById` with `response_mode: "summary"` instead)

## [4.8.9] - 2026-04-07

### Changed
- `SearchObject` now returns compact TSV (tab-separated) format instead of JSON, further reducing payload size

## [4.8.8] - 2026-04-07

### Fixed
- `SearchObject` now returns compact JSON instead of raw XML, reducing payload size significantly (fixes #39)

## [4.8.7] - 2026-04-06

### Fixed
- `GetPackageTree` now returns an error for non-existent packages instead of an empty tree (fixes #38)

## [4.8.6] - 2026-04-05

### Fixed
- Skip SAP auth flow for MCP ping requests (protocol-level check, no SAP connection needed)
- Serialize concurrent OAuth token acquisition per destination to prevent port conflicts

### Changed
- Disable `x-mcp-destination` header processing by default; opt-in via `--allow-destination-header` flag (HTTP/SSE)

## [4.8.5] - 2026-04-05

### Fixed
- Pass logger to `createAdtClient()` in all 150 handlers for proper adt-clients logging
- Retry on transient SAP errors (SWB_TOOL019) in HighTester after delete+create
- Update `@mcp-abap-adt/adt-clients` to 3.14.5

## [4.8.4] - 2026-04-05

### Fixed
- BDEF low-level test: wrap unlock in try-catch to prevent lock leak on failure
- shared:setup: retry group activation up to 3 times to resolve circular dependencies

## [4.8.3] - 2026-04-04

### Fixed
- Domain/DataElement create handlers: use lock + read-modify-write update pattern instead of full chain (fixes intermittent "description is missing" errors)
- Update `@mcp-abap-adt/adt-clients` to 3.14.4 (fixes DataElement create XML)

### Changed
- Add `shared:setup` prerequisite step to testing documentation

## [4.8.2] - 2026-04-04

### Changed
- Update all dependencies to latest versions (except express)
- Migrate to TypeScript 6, add `rootDir` to tsconfig.json
- Fix test type errors for TypeScript 6 compatibility

## [4.8.1] - 2026-04-02

### Changed
- Add build (tsc) step to pre-commit hook to catch type errors before commit

## [4.8.0] - 2026-04-02

### Added
- `RuntimeListDumps`: new `from` / `to` parameters (YYYYMMDDHHMMSS system local time) for server-side time-range filtering. Response is now a structured `dumps` array with `dump_id`, `datetime`, `error`, `title`, and `user` fields — replaces the raw atom feed payload.
- `RuntimeGetDumpById`: dump lookup by `datetime` + `user` without knowing the dump ID. Pass `datetime` (ISO or `"YYYY-MM-DD HH:MM:SS"`) and `user` to resolve the dump automatically using a ±2-minute server-side window and ±60-second client-side match. `dump_id` is now optional.

### Changed
- `RuntimeGetDumpById`: `dump_id` parameter is no longer required — provide either `dump_id` or `datetime` + `user`.

## [4.7.1] - 2026-04-01

### Fixed
- Update server.json version to match package version

## [4.7.0] - 2026-04-01

### Changed
- Replace archived `node-rfc` with `@mcp-abap-adt/sap-rfc-lite` — a lightweight maintained fork with the same API surface. This change only affects RFC connections to legacy SAP systems (BASIS < 7.50). HTTP connections are not affected. If you experience issues with legacy RFC connections, please open an issue and downgrade to v4.6.0.

## [4.6.0] - 2026-03-31

### Added
- HTTPS/TLS support for HTTP and SSE server transports. Configure via CLI (`--tls-cert`, `--tls-key`, `--tls-ca`), environment variables (`MCP_TLS_CERT`, `MCP_TLS_KEY`, `MCP_TLS_CA`), or YAML config (`tls:` section). Protocol is auto-detected from cert + key presence.

## [4.5.2] - 2026-03-27

### Added
- Pre-commit hook via husky + lint-staged — auto-fixes formatting and lint issues before commit so CI stays green.

## [4.5.1] - 2026-03-26

### Changed
- Rewrite `ListTransports` handler to use `AdtClient.getRequest().list()` with proper Accept negotiation instead of direct `connection.makeAdtRequest()`. Update `@mcp-abap-adt/adt-clients` to 3.13.0.
- Add integration tests for `ListTransports` handler.

## [4.5.0] - 2026-03-26

### Fixed
- Give `SAP_AUTH_TYPE` priority over `SAP_JWT_TOKEN` in test helpers — fixes onprem basic-auth tests failing when OS has stale BTP JWT token (#24).

### Changed
- Update `@mcp-abap-adt/adt-clients` to 3.12.0 — adds 415 Content-Type negotiation with auto-retry and caching. Accept correction enabled by default (#22, #23).

## [4.4.2] - 2026-03-26

### Fixed
- Guarantee unlock via `try-finally` in all update handlers — prevents locked objects when errors occur between lock and unlock (#22). Affected: UpdateProgram, UpdateClass, UpdateInterface, UpdateView, UpdateTable, UpdateStructure, UpdateDomain, UpdateServiceDefinition, UpdateDataElement.

## [4.4.1] - 2026-03-26

### Improved
- Rewrite `SearchObject` tool description with operation-first approach for better RAG discoverability (#21). Description now leads with action verbs (find, search, locate, check exists) instead of object type lists, so embedding vectors match user intent queries like "is there a program named X?".

## [4.4.0] - 2026-03-22

### Improved
- Enrich 15 tool descriptions with domain-specific keywords for better vector RAG discoverability (#20). Tools like `SearchObject`, `GetTypeInfo`, `GetTransaction`, `GetTableContents`, and others now include ABAP object type names (DEVC, CLAS, TABL, DDLS, BDEF, DDLX, etc.) so embedding-based tool discovery returns correct results.

## [4.3.2] - 2026-03-20

### Improved
- Suppress `ping` request logging in StreamableHttpServer and SseServer — ping is now silent unless debug logging is enabled, reducing log noise.

## [4.3.1] - 2026-03-20

### Improved
- StreamableHttpServer request logging now includes MCP method, tool name, destination, and completion status. Helps diagnose issues like #19 where health polls generate excessive `tools/list` noise.

## [4.3.0] - 2026-03-19

### Added
- `GET /mcp/health` endpoint for HTTP and SSE transports — lightweight health check without MCP protocol overhead. Returns `status`, `uptime`, `version`, `transport`, and `activeSessions` (SSE only). Resolves #18.
- Unit tests for health endpoint (both transports).

## [4.2.1] - 2026-03-15

### Fixed
- Shorten `server.json` description to fit MCP registry 100-character limit.

## [4.2.0] - 2026-03-15

### Added
- **16 new Read\* tools** — read source code and metadata for all object types with CRUD handlers:
  ReadClass, ReadInterface, ReadProgram, ReadTable, ReadStructure, ReadView, ReadDomain,
  ReadDataElement, ReadFunctionModule, ReadFunctionGroup, ReadPackage, ReadServiceDefinition,
  ReadServiceBinding, ReadMetadataExtension, ReadBehaviorDefinition, ReadBehaviorImplementation.
- `transport_request` parameter for UpdateBehaviorDefinition (low), UpdateMetadataExtension (high).
- `record_changes` parameter for CreatePackage (high + low).
- Transported Object CRUD integration test reproducing GitHub #11 (transport lock issue on legacy systems).

### Fixed
- `SAP_SYSTEM_TYPE` now propagated from test config to `process.env`, so `createAdtClient` correctly selects `AdtClientLegacy` on legacy systems.
- `transport_request` passed in class update tests for transportable packages.
- UpdateDataElement now passes `transportRequest` to adt-clients.
- BDEF low test resilience: guaranteed BIMPL unlock via try/finally, delay after delete in cleanup, skip create if BDEF already exists (transport re-create limitation).
- Removed duplicate GetFunction handler (delegates to GetFunctionModule).
- Auto-detect JWT auth for `--env-path`, SAP_CLIENT auto-resolve.

## [4.1.1] - 2026-03-13

### Fixed
- Unit test `systemContext.test.ts` updated to match `SAP_SYSTEM_TYPE` env var approach (removed obsolete `isModernAdtSystem` mock).

## [4.1.0] - 2026-03-13

### Added
- `SAP_SYSTEM_TYPE` environment variable (`cloud` | `onprem` | `legacy`) to explicitly control SAP system type. Default: `cloud`.
- `--system-type` CLI argument as alternative to the env var.
- Eager HTTP session initialization — `connect()` is now called for all connection types (not just RFC), establishing CSRF token and cookies before the first request.

### Changed
- Removed unreliable auto-detection via `/sap/bc/adt/core/discovery`. System type is now determined solely by `SAP_SYSTEM_TYPE`.
- **Migration note:** on-premise users must set `SAP_SYSTEM_TYPE=onprem` in `.env` to access on-premise-only tools (e.g., Programs).

### Fixed
- 403 errors on first request to SAP systems (e.g., E96) that require pre-established session cookies.
- Inconsistent legacy detection across different shell environments, proxy configs, and ICM sessions.

## [4.0.0] - 2026-03-13

### Added
- **Legacy system support (BASIS < 7.50)**: automatic detection of legacy systems, `AdtClientLegacy` factory, RFC connection transport via `SADT_REST_RFC_ENDPOINT`.
- **RFC connection type**: `--connection-type=rfc` CLI flag and `SAP_CONNECTION_TYPE=rfc` env var for legacy systems requiring SAP NW RFC SDK.
- **`available_in` mechanism**: each handler's `TOOL_DEFINITION` declares supported environments (`onprem`, `cloud`, `legacy`). Unsupported tools are hidden from clients at registration time.
- **Legacy `available_in` on 102 handlers**: Class, Interface, View, Program, Function Group/Module, Package (read/update/delete), Include, Unit Test, and common utilities.
- **FunctionGroup/FunctionModule on cloud**: previously restricted to on-premise only.
- **Runtime profiling and dumps on cloud**: class-based profiling now works on ABAP Cloud.
- **Shared dependencies management**: `npm run shared:setup` / `shared:teardown` / `shared:check` for test objects.
- **Test infrastructure**: `test:init` / `test:reinit` scripts, explicit connection config (`env`, `system_type`, `connection_type`) in `test-config.yaml`, `available_in` support in test cases for system-aware skipping.
- **AVAILABLE_TOOLS_LEGACY.md**: generated documentation listing 115 legacy-compatible tools.

### Changed
- **BREAKING: Node 18 dropped** — minimum Node.js version is now 20.0.0.
- **BREAKING: `@mcp-abap-adt/adt-clients` upgraded** from 2.x to 3.11.2 (major API changes).
- **BREAKING: `@mcp-abap-adt/connection` upgraded** to 1.5.3.
- **CI matrix**: Node 20 + 25 on 3 OS for push/PR; Node 20/22/24/25 for release.
- **Guaranteed unlock**: force-release DDIC locks, unlock-on-error in CreateDataElement/CreateDomain.
- **TADIR conflict retry**: automatic retry on 409 TADIR conflict during create operations.

### Fixed
- Circular reference in CDS unit test handlers.
- i18n check handling (adt-clients 3.8.7).
- MetadataExtension high/low test object conflicts (separate config keys).
- Function test lock conflicts (separate high/low test objects).
- Package tests use `update()` for lock/unlock.
- Jest 30 deprecated `--testPathPattern` migrated to `--testPathPatterns`.
- `SAP_USER` → `SAP_USERNAME` in configuration examples.

## [3.2.1] - 2026-03-07

### Fixed
- **Integration test cleanup**: close MCP connections, reuse auth session, random ports.

## [3.2.0] - 2026-03-05

### Added
- **GetTableContents handler**: fully implemented — was a stub returning "temporarily unavailable", now reads table data via ADT Data Preview API with field extraction and SQL query generation.

### Changed
- **parseSqlQueryXml**: exported from `handleGetSqlQuery` for reuse in `GetTableContents`.

## [3.1.0] - 2026-03-04

### Added
- **BehaviorImplementation low-level MCP tools**: registered `ValidateBehaviorImplementationLow`, `CreateBehaviorImplementationLow`, `LockBehaviorImplementationLow` in LowLevelHandlersGroup.

### Fixed
- **System context not passed to AdtClient**: `createAdtClient()` now forwards `responsible` and `masterSystem` from resolved system context to `AdtClient` options. Fixes package creation on BTP Cloud failing with "Enter a valid user, not , as the person responsible".
- **ValidatePackageLow schema**: added missing `super_package` property to `inputSchema.properties` (was in `required` but not declared — MCP SDK rejected the parameter in hard mode).
- **CreatePackageLow handler**: removed incorrect `createResult` check — `AdtPackage.create()` returns `{ errors: [] }` without `createResult` (packages are containers with no response body).

## [3.0.0] - 2026-03-04

### Changed
- **BREAKING: Separate Create and Update** — Create handlers no longer accept source code. Use Update after Create to set source code.

## [2.7.5] - 2026-03-03

### Fixed
- **MCP Registry publish**: sync `server.json` version with npm package version (`2.5.2` → `2.7.5`).

## [2.7.4] - 2026-03-03

### Added
- **System context HTTP headers for HTTP/SSE transport**:
  - `x-sap-master-system` and `x-sap-responsible` headers allow per-request system context override.
  - Priority: HTTP headers → `process.env` → cloud `getSystemInformation()` API.
  - Enables on-prem transport request binding for HTTP/SSE connections without `.env` file.
- **System context cache isolation**: cache is reset before each non-stdio request to prevent stale values leaking between requests targeting different SAP systems.

## [2.7.3] - 2026-03-03

### Fixed
- **Release workflow lint gate** for `v2.7.2`:
  - Applied Biome formatting/import ordering fixes in updated hard-mode test infrastructure and integration suites.
  - Kept hard-mode behavior unchanged; this patch is focused on CI/release pipeline stability.

## [2.7.2] - 2026-03-03

### Added
- **YAML-driven MCP hard mode test infrastructure**:
  - Added `environment.integration_hard_mode` support for integration tests.
  - Added real MCP client execution path for `stdio`, `sse`, and `http` transports.
  - Added MCP CRUD smoke/matrix scripts in `tools/`.

### Fixed
- **Real MCP integration gaps in tests**:
  - Lambda-based integration suites now support hard mode via real MCP tool calls.
  - `LowTester` hard mode now bootstraps MCP session (`GetSession`) so low-level lock/unlock flows receive required `session_id`.
  - Hard mode test object names now include per-run suffix to prevent object name collisions between runs.
- **System context bootstrap on server startup**:
  - Launcher now hydrates on-prem system context env values earlier so real MCP runs consistently resolve context.

## [2.7.1] - 2026-03-01

### Added
- **`SAP_MASTER_SYSTEM` and `SAP_RESPONSIBLE`** documented in CLI help (`--help`) and `.env.example`.

## [2.7.0] - 2026-03-01

### Added
- **System context support for on-premise systems** (issue #11):
  - `masterSystem` and `responsible` are now passed to all ADT create/update XML requests via `IAdtSystemContext`.
  - On-prem resolution: `SAP_MASTER_SYSTEM` env var → `getSystemInformation()` API fallback (cloud).
  - Responsible resolution: `SAP_RESPONSIBLE` env var → `SAP_USERNAME` fallback → API.
  - Ensures correct transport request binding on on-premise systems.
- **New `.env` variables for on-premise configuration**:
  - `SAP_MASTER_SYSTEM` — SAP system ID (the three-character SID). Required for on-prem create/update operations.
  - `SAP_RESPONSIBLE` — Responsible user (optional, falls back to `SAP_USERNAME`).
- **Test infrastructure**: `resolveTestSystemContext()` resolves system context from YAML config for integration tests.

### Changed
- **Upgraded `@mcp-abap-adt/adt-clients`** from `^2.0.0` to `^2.2.0`.
- Renamed `default_system` → `default_master_system` in test config template.

## [2.6.1] - 2026-02-27

### Fixed
- **`UpdateProgram` missing `transport_request`**: Added `transport_request` to schema, interface, and `.update()` call — same fix as other handlers in 2.6.0.

### Changed
- **Upgraded `@mcp-abap-adt/adt-clients`** to `1.2.2`.

## [2.6.0] - 2026-02-27

### Added
- **`ListTransports` tool** (read-only):
  - Lists transport requests for the current or specified user.
  - Filters by modifiable status (default: modifiable only).
  - Use before create/update to find the correct transport request.

### Fixed
- **`transportRequest` forwarding in all high-level handlers** (issue #11):
  - Create handlers now forward `transportRequest` to the internal update (PUT) step: `CreateFunctionModule`, `CreateTable`, `CreateInterface`, `CreateView`, `CreateProgram`, `CreateDomain`, `CreateDataElement`.
  - Standalone update handlers now forward `transportRequest`: `UpdateStructure`, `UpdateDomain`, `UpdateServiceDefinition`.
  - Added `transport_request` to tool schemas where it was missing: `UpdateClass`, `UpdateView`, `UpdateBehaviorDefinition`.

### Changed
- **Upgraded `@mcp-abap-adt/adt-clients`** from `0.3.22` to `1.2.1`.

### Documentation
- Regenerated tools documentation:
  - `docs/user-guide/AVAILABLE_TOOLS.md`
  - `docs/user-guide/AVAILABLE_TOOLS_HIGH.md`
  - `docs/user-guide/AVAILABLE_TOOLS_LOW.md`
  - `docs/user-guide/AVAILABLE_TOOLS_COMPACT.md`
  - `docs/user-guide/AVAILABLE_TOOLS_READONLY.md`

## [2.5.2] - 2026-02-23
### Fixed
- **`--mcp` precedence over local `.env`**:
  - Fixed CLI fallback logic so `.env` from current working directory is no longer auto-loaded when `--mcp=<destination>` is provided.
  - Startup auth source display now correctly prioritizes `service-key: <destination>` over `.env`.
- **JWT auth error diagnostics**:
  - Improved HTTP/SSE request-time error reporting for missing JWT tokens by surfacing token provider failure reason in `BaseMcpServer`.
- **Auth broker runtime behavior**:
  - Fixed v2 auth-broker config to respect `--unsafe` instead of always forcing safe in-memory stores.

### Added
- **Browser OAuth callback port override**:
  - Added `--browser-auth-port=<port>` and `MCP_BROWSER_AUTH_PORT` to override auth callback server port (useful when default ports are occupied).
- **Inspector runtime dependency safety**:
  - Added explicit `express-rate-limit` dev dependency to avoid missing transitive package issues during `dev:http` inspector startup.

### Documentation
- Updated auth and CLI docs for `--mcp` behavior and browser auth callback port override:
  - `README.md`
  - `docs/user-guide/AUTHENTICATION.md`
  - CLI help text via `ServerConfigManager`.

## [2.5.1] - 2026-02-21
### Changed
- **Compact handler descriptions**:
  - Reworked compact handler descriptions to be explicit and deterministic for tool routing.
  - Added per-`object_type` required parameter mapping directly in handler descriptions (`TYPE(param*)` format).
  - Clarified read vs validate intent to avoid `HandlerGet` / `HandlerValidate` confusion.
- **Compact schemas metadata**:
  - Added missing parameter descriptions in compact schemas to remove `No description` in generated tool docs.

### Documentation
- Regenerated tools documentation:
  - `docs/user-guide/AVAILABLE_TOOLS.md`
  - `docs/user-guide/AVAILABLE_TOOLS_HIGH.md`
  - `docs/user-guide/AVAILABLE_TOOLS_COMPACT.md`

## [2.5.0] - 2026-02-21
### Added
- **Compact facade CRUD routing**:
  - Added compact facade CRUD operations routed by `object_type`.
  - Added compact router/matrix coverage for supported object/action combinations.
- **Compact lifecycle and test handlers**:
  - Added compact handlers for validation, unlock, and unit test workflows.

### Changed
- **Compact routing architecture**:
  - Removed legacy `HandlerAction` path and standardized on dedicated compact handlers.

## [2.4.2] - 2026-02-20
### Added
- **Service Binding high-level tools**:
  - Added `CreateServiceBinding`, `GetServiceBinding`, `UpdateServiceBinding`, `DeleteServiceBinding`, `ListServiceBindingTypes`, `ValidateServiceBinding`.
  - Added `serviceBindingPayloadUtils` for response parsing/format normalization.
- **Runtime profiling tools**:
  - Added `RuntimeAnalyzeProfilerTrace`, `RuntimeRunClassWithProfiling`, `RuntimeRunProgramWithProfiling`.

### Changed
- **System read-only handlers**:
  - Migrated `GetAllTypes`, `GetObjectStructure`, and `GetSqlQuery` to `AdtClient` flow.
- **Lint/type hygiene**:
  - Removed explicit `any` usage in new service binding/runtime handlers and high-level handler registrations.

## [2.4.1] - 2026-02-17
### Fixed
- **Dev HTTP/SSE launch scripts**:
  - Fixed dist entry path to `dist/server/launcher.js` in `tools/dev-http-v2.js` and `tools/dev-sse-v2.js`.
  - Fixed `dev:http` transport argument to `--transport=http`.
- **HTTP/SSE server startup reliability**:
  - Updated standalone server startup flow to listen on `listening`/`error` events, preventing false "started" logs followed by silent exits.
  - Kept strong server references in launcher to avoid premature process shutdown.

### Changed
- **Runtime profiling + dumps explorer**:
  - Refocused tool workflow to class-based profiling run flow.
  - Improved ABAP user resolution/validation and diagnostics for dumps/traces filtering.
  - Improved object validation/update flow and trace feed handling in interactive tool.
- **Tools documentation**:
  - Updated `tools/README.md` to reflect class-focused profiling flow and ABAP user resolution behavior.

## [2.4.0] - 2026-02-15
### Added
- **Runtime diagnostics tools**:
  - Added runtime profiling tools: `RuntimeCreateProfilerTraceParameters`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`.
  - Added runtime dump tools: `RuntimeListDumps`, `RuntimeGetDumpById`.
- **Architecture documentation**:
  - Added comprehensive architecture document: `docs/architecture/ARCHITECTURE.md`.

### Changed
- **Runtime payload format**:
  - Runtime profiling and dump handlers now return parsed JSON payloads (instead of raw XML strings in `payload`).
  - Runtime dump read uses `dump_id` input (`RuntimeGetDumpById`) instead of URI-based input.
- **Dependencies**:
  - Updated `@mcp-abap-adt/adt-clients` to `^0.3.16`.

### Documentation
- Regenerated tools docs (`docs/user-guide/AVAILABLE_TOOLS*.md`) with runtime diagnostics tools.
- Updated `README.md` feature list with runtime diagnostics capabilities.

## [2.3.1] - 2026-02-13
### Fixed
- **YAML config flag compatibility**:
  - Added `--conf` support as an alias for `--config` in argument parsing.
  - Fixed YAML template flow: when config file is missing, template generation now exits cleanly instead of continuing into inspection-only mode.
- **YAML env config clarity**:
  - Added `env-path` YAML option to map directly to `--env-path`.
  - Clarified `env` as destination name and removed duplicate `allowed-origins` entry in template.
- **HTTP/SSE connection context resolution**:
  - Enforced priority: `x-mcp-destination` header -> server default destination (`--mcp` / `--env-path`) -> `400` error.
  - HTTP default-destination broker initialization now uses the resolved destination key.

## [2.3.0] - 2026-02-13
### Changed
- **.env parsing policy**:
  - Inline comments are no longer parsed from values.
  - `#` is treated as a comment only when it starts the line.
  - This avoids accidental truncation of secrets containing `#` (for example passwords/tokens).
- **Update tool error handling**:
  - Added unified ADT/SAP error extraction for update handlers to improve `409` conflict diagnostics.
  - XML exception payloads (`exc:exception`) are now surfaced as detailed user-facing errors in previously generic update flows.
- **GetTypeInfo structure fallback**:
  - Added optional structure lookup fallback (`include_structure_fallback`, default: `true`).
  - Fallback is executed only when type lookups return `404` or empty result.
  - Non-`404` errors no longer silently fall through to unrelated lookups.

### Documentation
- Updated `.env` comments guidance in:
  - `README.md`
  - `docs/user-guide/AUTHENTICATION.md`

## [2.2.7] - 2026-02-12
### Fixed
- **CI (Biome)**: Applied formatting fixes required by `npx biome check src --diagnostic-level=error`.
  - `src/handlers/function_module/high/handleGetFunctionModule.ts`
  - `src/lib/config/envResolver.ts`

## [2.2.6] - 2026-02-12
### Changed
- **Function Module handlers**: Fixed parameter propagation for function module operations:
  - `GetFunctionModule` and `DeleteFunctionModule` now require and pass `function_group_name`.
  - `GetFunction` (read-only) now requires and passes `function_group`.
  - `UpdateFunctionModule` (high/low) now forwards `transport_request` to ADT update calls.
- **CLI env resolution**: Updated env argument behavior:
  - `--env=<name>` now resolves to platform sessions path: `{sessions}/<name>.env`.
  - Added `--env-path=<path|file>` for explicit `.env` file usage.
  - `MCP_ENV_PATH` now maps to explicit env file path behavior (same as `--env-path`).
- **Errors**: Improved function module update error messages for transport-related `400` responses and XML SAP errors.

## [2.2.5] - 2026-02-11
### Changed
- **Tools docs generator**: Reworked `tools/generate-tools-docs.js` to scan only handler code in `src/handlers/**`.
- **Tools docs structure**: Updated `docs/user-guide/AVAILABLE_TOOLS.md` hierarchy to `Group (level) → Object (folder) → Tools`.
- **Coverage fix**: Ensured BDEF and other handler folders are included consistently in generated tools documentation.

## [2.2.4] - 2026-02-11
### Changed
- **Discoverability metadata**: Updated npm keywords and package metadata to improve MCP search relevance for ABAP, ABAP Cloud, JWT/XSUAA, and service-key flows.
- **Registry description**: Shortened `server.json` description to meet the MCP publisher 100-character constraint.
- **README positioning**: Clarified first-screen value proposition around full CRUD, On-Premise + ABAP Cloud support, and auth options.

## [2.2.3] - 2026-02-10
### Added
- **Docs**: Added dedicated Terminology and Authentication guides, with links from README.

### Changed
- **README**: Reworked first-screen content and links to emphasize configurator usage and destinations.
- **Docs structure**: Moved GitHub configuration README into deployment docs and fixed internal links.
- **Client configuration docs**: Linked to the configurator repo and usage guide.

## [2.2.2] - 2026-02-10
### Added
- **Client support**: Added OpenCode and Copilot configuration support.
- **Claude config**: Added `.mcp.json` project configuration and docs.
- **Configurator options**: Added URL, headers, and timeout options in `mcp-abap-adt-configure`.

### Changed
- **Configurator split**: Removed `mcp-abap-adt-configure` from core. Use `@mcp-abap-adt/configurator` (repo: `mcp-abap-adt-conf`) with `mcp-conf` instead.
- **Codex/Goose handling**: Improved transport handling and timeout defaults for non-stdio transports.
- **Default-disabled entries**: Updated JSON config handling and docs to keep new entries disabled by default.
- **Streamable HTTP**: Refactored server handling for per-request connections.

### Fixed
- **Goose config**: Corrected enabled state handling in `writeGooseConfig`.

## [2.2.0] - 2026-02-09
### Added
- **MCP Registry metadata**: Added `server.json` and `mcpName` for registry publishing.
- **Client configurator**: Added `mcp-abap-adt-configure` to add/enable/disable/remove MCP entries across clients.
- **Auto-config docs**: Added `docs/installation/CLIENT_INSTALLERS.md` with usage and common tasks.

### Changed
- **Default logger loading**: Lazy-load logger to avoid bundler issues with optional transports.
- **Claude config**: Write MCP settings under `projects.<full_path>.mcpServers` for Claude CLI on Linux.
- **Config defaults**: New entries for Cline/Codex/Windsurf/Goose are disabled by default; enable explicitly.

## [2.1.7] - 2026-01-29
### Fixed
- **UpdateLocalTestClass**: Added detailed SAP error information for 409 conflict errors to improve troubleshooting (#6)

## [2.1.6] - 2026-01-29
### Fixed
- **GetIncludesList, GetObjectsList, GetObjectsByType, GetEnhancements, GetObjectInfo**: Migrate from deprecated `fetchNodeStructure` stub to `AdtClient.getUtils().fetchNodeStructure()` - fixes "not implemented" errors

### Changed
- **LowTester logging**: Unified to compact format with emojis, matching LambdaTester output style

## [2.1.5] - 2026-01-28
### Added
- **Startup diagnostics**: Display SAP connection configuration at server startup when using `--env` parameter
  - Shows source file, SAP URL, client, auth type, and UAA URL
  - Tokens and secrets are safely masked (first/last 4 chars for long values, full mask for short)
  - Helps diagnose auth issues by showing which config is actually used

## [2.1.4] - 2026-01-21
### Fixed
- **CreateLocalTestClass**: Return full SAP error details on failure (including the original response payload).

## [2.1.3] - 2026-01-02
### Changed
- **Documentation**: Restored the stateful ADT flow guide without file-based session persistence references.
- **Available tools**: Regenerated `docs/user-guide/AVAILABLE_TOOLS.md` and restored links across docs.

### Removed
- **Lock/session persistence**: Removed filesystem lock registry and session persistence helpers/config from core and tests.
- **CLI commands**: `adt-lock-object`, `adt-unlock-object`, `adt-manage-locks`, `adt-manage-sessions`, and `adt-unlock-objects` removed from package bins.
- **User guides**: Removed usage/scenario docs tied to legacy session flows.

## [2.1.2] - 2026-01-02
### Changed
- **Lock registry types**: `LockState.objectType` now uses `AdtObjectType` with normalization for legacy entries.
- **adt-lock-object**: No longer registers lock handles in `.locks/active-locks.json`; session save only.

### Removed
- **CLI commands**: `adt-unlock-object`, `adt-manage-locks`, `adt-manage-sessions`, and `adt-unlock-objects` removed from package bins.

## [2.1.1] - 2025-12-31
### Changed
- **@mcp-abap-adt/auth-broker**: bumped to `^0.3.0` - auto-detect service key format, credentials wrapper support, debug logging
- **@mcp-abap-adt/auth-stores**: bumped to `^0.3.0`

## [2.1.0] - 2025-12-31
### Fixed
- Updated `@mcp-abap-adt/auth-broker` so installs now pull `0.2.17` instead of the stale `0.2.14` release that was hiding upstream fixes.
- Removed the accidental `@mcp-abap-adt/core` dependency that caused consumers to download the old `1.4.1` tarball.

## [2.0.3] - 2025-12-31
### Changed
- **@mcp-abap-adt/auth-broker**: bumped to `0.2.15` so the locked dependency pulls in the latest fixes referenced by the release.

### Fixed
- **CI workflow package install**: `.github/workflows/ci.yml` now looks for `mcp-abap-adt-core-*.tgz`, matching the actual npm pack output before testing global install.

## [2.0.2] - 2025-12-30
### Changed
- **GetWhereUsed handler**: Now uses `getWhereUsedList()` from adt-clients and returns parsed JSON with structured references instead of raw XML

### Fixed
- **Release workflow**: Simplified to use npm registry instead of uploading tgz artifacts

## [2.0.1] - 2025-12-30
### Documentation
- Added glama.ai badge with security/license/quality grades
- Updated README example to use `EmbeddableMcpServer` instead of deprecated `HandlerExporter.registerOnServer()`

## [2.0.0] - 2025-12-30
### Added
- **EmbeddableMcpServer**: New server class for external integration (e.g., cloud-llm-hub)
  - Accepts injected `AbapConnection` from consumer
  - Extends `BaseMcpServer` with proper handler registration
  - Configurable exposition levels: `readonly`, `high`, `low`, `system`, `search`
  - Export via `@mcp-abap-adt/core/server`

### Changed
- **HandlerExporter**: Now serves only as registry factory
  - Use `createRegistry()` to get `IHandlersRegistry` for custom scenarios
  - `getHandlerEntries()` and `getToolNames()` still available for inspection

### Removed
- **BREAKING**: `HandlerExporter.registerOnServer()` method removed
  - Had bug with handler signature (passed context twice)
  - Replace with `EmbeddableMcpServer` for cleaner architecture

### Migration Guide
```typescript
// Before (v1.x - broken)
import { HandlerExporter } from '@mcp-abap-adt/core/handlers';
const exporter = new HandlerExporter({ includeReadOnly: true, includeHighLevel: true });
const mcpServer = new McpServer({ name: 'mcp-abap-adt', version: '1.0.0' });
exporter.registerOnServer(mcpServer, () => connection, logger);

// After (v2.x)
import { EmbeddableMcpServer } from '@mcp-abap-adt/core/server';
const server = new EmbeddableMcpServer({
  connection,
  logger,
  exposition: ['readonly', 'high'],
});
await server.connect(transport);
```

## [1.4.3] - 2025-12-29
### Documentation
- **CLI Help**: Extended `--help` output with comprehensive environment variables documentation
  - Added MCP Server Configuration section (`MCP_TRANSPORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_SSE_HOST`, `MCP_SSE_PORT`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_USE_AUTH_BROKER`, `MCP_BROWSER`)
  - Added Debug Options section (`DEBUG_HANDLERS`, `DEBUG_CONNECTORS`, `DEBUG_CONNECTION_MANAGER`, `HANDLER_LOG_SILENT`)
  - Extended SAP Connection section with JWT/OAuth2 variables (`SAP_REFRESH_TOKEN`, `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID`, `SAP_UAA_CLIENT_SECRET`, `SAP_LANGUAGE`)
- **CLI_OPTIONS.md**: Added missing environment variables documentation
  - Added `MCP_UNSAFE`, `MCP_USE_AUTH_BROKER`, `MCP_BROWSER` to General section
  - Added JWT/OAuth2 authentication variables to SAP Connection section
  - New Auth-Broker section with `AUTH_BROKER_PATH` and debug variables
  - New Debug section with handler and connector logging options
- **INSTALLATION.md**: Expanded Environment Variables section with full reference and link to CLI_OPTIONS.md

## [1.4.2] - 2025-12-29
### Fixed
- **Version path**: Fixed incorrect path to package.json in `--version` command

## [1.4.1] - 2025-12-29
### Changed
- **Package renamed**: Changed from `@fr0ster/mcp-abap-adt` to `@mcp-abap-adt/core` for npm publishing
- **Package now public**: Removed `private: true` flag to allow npm publishing

### Added
- **Inspection-only mode**: Server can now start in stdio mode without connection parameters for tool inspection (used by glama.ai)
- **MockAbapConnection**: Added mock connection class for inspection-only mode that returns descriptive error when tools are executed
- **Docker inspection support**: Added `Dockerfile.inspect` and `docker-compose.inspect.yml` for local testing of inspection mode
- **CLAUDE.md**: Added project documentation for Claude Code assistance

## [1.3.0] - 2025-12-29
### Added
- **glama.json**: Added configuration for compatibility with the Glama platform.
- **Node.js Debugging**: Added `--inspect` support to Docker container and exposed port 9229.
- **MCP_TRANSPORT Environment Variable**: Added support for selecting transport mode via environment variable.

### Changed
- **@mcp-abap-adt/adt-clients Updated**: Upgraded to version 0.3.13, bringing fixes for recursion and 406 Accept errors.
- **GetPackageTree Optimized**: Simplified implementation by using the library's `getPackageHierarchy` method, ensuring correct recursive traversal of subpackages.
- **GetPackageContents Enhanced**: Added support for `include_subpackages`, `max_depth`, and `include_descriptions` parameters.
- **Docker Defaults**: Changed default transport to `stdio` in Docker and updated healthcheck logic.

## [1.2.9] - 2025-12-29
### Changed
- **v1 McpHandlers Refactoring**: Rewrote `McpHandlers` to use `HandlerExporter` internally. This ensures the legacy embeddable server (v1) stays in sync with all tools available in v2 while reducing code duplication.
- **Shared Schema Utilities**: Replaced duplicated `jsonSchemaToZod` logic in `v1` with a central implementation from `src/lib/handlers/utils/schemaUtils.ts`.
- **Documentation Generator**: Updated `tools/generate-tools-docs.js` category mapping to support the standardized `GetBehaviorDefinition` naming.

### Removed
- **GetBdef compatibility adapter**: Removed the manual adapter for `GetBdef` in v1 server. All tools now use standard names (e.g., `GetBehaviorDefinition`).

### Added
- **tsx** added to `devDependencies` for improved TypeScript execution and testing.

## [1.2.8] - 2025-12-29
### Added
- **GetPackageContents** tool: New read-only tool to retrieve objects inside an ABAP package (moved from legacy `GetPackage`).

### Changed
- **GetPackage** tool: Migrated to high-level API (`AdtClient.getPackage().read()`). Now returns package metadata and supports `version` parameter (`active`/`inactive`).
- **GetFunction** tool: Updated to support `version` parameter and migrated to new `adt-clients` signature.
- **High-level handlers**: Improved parameter handling and consistency with new `adt-clients` versioning requirements.
- Test cleanup documentation updated to clarify `afterEach` behavior and multi-object cleanup requirements.
- Test runners (`LowTester`/`HighTester`) now emit step-level flow logs for validate/create/lock/update/unlock/activate.
- Package cleanup can use a fresh connection with optional `connection_config` for locked session cases.

### Fixed
- Package create now treats ADT "import" 404 as success when the package is readable.
- Function group/module low-level create handles transient 400/empty responses with read verification.
- Table create now validates and creates with explicit descriptions to satisfy ADT requirements.
- Package low-level tests avoid double-unlock during cleanup.

## [1.2.7] - 2025-12-27
### Changed
- GetPackageTree now builds the tree from node-structure traversal to preserve package/subpackage hierarchy and ordering.
- Package tree nodes now include `adtType`, normalized `type`, `codeFormat`, and `restoreStatus` for parity with backup tooling.
- Migrated handler usage to `AdtClient` now that `CrudClient`/`ReadOnlyClient` are removed in `@mcp-abap-adt/adt-clients`.

### Fixed
- Updated handler typings to match `@mcp-abap-adt/adt-clients@0.3.2` (I* config/state interfaces).
- SearchObject now uses `AdtUtils.searchObjects` instead of the removed `SharedBuilder` export.
- Restored `encodeSapObjectName` helper in `utils` to avoid relying on unstable client exports.

## [1.2.6] - 2025-12-23
### Fixed
- Fixed LICENSE file - corrected copyright attribution (removed incorrect fork author)
- Fixed TypeScript compilation errors in test files:
  - Updated `handlers.test.ts` to use high-level handlers instead of removed readonly handlers
  - Removed non-existent `getAuthHeaders` import from `utils.test.ts`
  - Fixed `sessionHelpers.ts` - added type assertions for connection methods not in `IAbapConnection` interface (`getConfig`, `connect`)
  - Fixed `ClassCrudClientDirect.test.ts` - added type assertions for `connect()` and `reset()` methods
  - Fixed `BehaviorImplementationLowHandlers.test.ts` - removed invalid `session_id` and `session_state` parameters from `UnlockClassArgs`

## [1.2.5] - 2025-12-23
### Removed
- **Removed duplicate readonly handlers that duplicate high-level CRUD operations**
  - Deleted `handleGetClass.ts` (replaced by high-level `GetClass`)
  - Deleted `handleGetDomain.ts` (replaced by high-level `GetDomain`)
  - Deleted `handleGetDataElement.ts` (replaced by high-level `GetDataElement`)
  - Deleted `handleGetTable.ts` (replaced by high-level `GetTable`)
  - Deleted `handleGetStructure.ts` (replaced by high-level `GetStructure`)
  - Deleted `handleGetView.ts` (replaced by high-level `GetView`)
  - Deleted `handleGetServiceDefinition.ts` (replaced by high-level `GetServiceDefinition`)
  - Deleted `handleGetProgram.ts` (replaced by high-level `GetProgram`)
  - Deleted `handleGetInterface.ts` (replaced by high-level `GetInterface`)
  - Deleted `handleGetFunctionGroup.ts` (replaced by high-level `GetFunctionGroup`)
  - Deleted `handleGetBdef.ts` (replaced by high-level `GetBehaviorDefinition`)

### Changed
- **v1 server now uses high-level handlers instead of readonly duplicates**
  - `GetClass`, `GetDomain`, `GetDataElement`, `GetTable`, `GetStructure`, `GetView`, `GetServiceDefinition`, `GetProgram`, `GetInterface`, `GetFunctionGroup` now use high-level handlers internally
  - `GetBdef` now uses `GetBehaviorDefinition` high-level handler with parameter adapter for backward compatibility
  - All high-level handlers support `version` parameter (active/inactive) for better flexibility

### Fixed
- Fixed TypeScript type errors in `handleGetAbapSystemSymbols.ts`
  - Added proper JSON parsing for `GetClass` and `GetInterface` responses
  - Fixed type assertions for class and interface data
- Fixed TypeScript type error in `utils.ts`
  - Added type assertion for `makeAdtRequest` return type
- Fixed documentation generator (`tools/generate-tools-docs.js`)
  - Updated regex pattern to support multi-line imports in handler groups
  - Now correctly detects all handlers including system and search handlers
  - Documentation now includes all 219 tools (76 high-level, 116 low-level, 27 read-only)

## [1.2.4] - 2025-12-22
### Changed
- **Migrated from ESLint+Prettier to Biome**
  - Removed ESLint and Prettier dependencies
  - Added @biomejs/biome for faster linting and formatting
  - Configured Biome with strict rules for production code
  - Relaxed rules for test files (noImplicitAnyLet, noExplicitAny)
  - Updated package.json scripts: `lint`, `lint:check`, `format`
  - Updated `npm run build` to include Biome check before TypeScript compilation

### Fixed
- Fixed TypeScript errors in production code:
  - `handleGetAbapAST.ts` - Fixed regex match types and while loop patterns in 4 methods
  - `handleGetObjectInfo.ts` - Added type annotation for `packageName`
  - `handleDescribeByList.ts` - Added type annotation for `parsed`
  - `handleValidateDataElement.ts` - Added type assertion for `AxiosResponse`
  - `handleCreateClass.ts` - Added `ClassBuilderState` type import
  - `handleDeleteObject.ts` - Changed `any` to `unknown` for response
  - `handleGetEnhancementSpot.ts` - Fixed array types and while loops
  - `handleGetProgFullCode.ts` - Fixed 3 while loops with regex.exec() pattern
- All production code now passes strict Biome rules (no implicit any, no assignments in expressions)

### Added
- Added Biome check to CI workflow (`.github/workflows/ci.yml`)
- Added Biome check to Release workflow (`.github/workflows/release.yml`)

### Dependencies
- Updated `@mcp-abap-adt/adt-clients` to ^0.2.6
- Updated `@mcp-abap-adt/adt-interfaces` to ^0.2.6
- Added `@biomejs/biome` ^2.3.10 as devDependency
- Removed `eslint` and `prettier` dependencies

## [1.2.3] - 2025-12-22
### Fixed
- Removed unused import of `IAbapConnectionExtended` from `@mcp-abap-adt/interfaces`
  - Interface was removed in interfaces package v1.1.0

## [1.2.2] - 2025-12-22
### Changed
- **BREAKING: Removed legacy-server.ts**
  - Full removal of 3000+ line legacy server with CLI, AuthBroker, .env parsing, etc.
  - v1 module now exports only lightweight `EmbeddableMcpServer` class

### Added
- **EmbeddableMcpServer** - lightweight MCP server for embedding
  - Minimal class (~100 lines) for external HTTP server integration
  - Constructor takes `context: HandlerContext` with connection and logger
  - Handlers registered immediately in constructor - no `run()` method needed
  - Access underlying `McpServer` via `.mcpServer` getter
  - Configurable `exposition` levels: `readonly`, `high`, `low`, `system`
  
### Removed
- `mcp_abap_adt_server` class (was 3000+ lines with CLI, transports, AuthBroker)
- `setAbapConnectionOverride()` function
- `ServerOptions` interface
- All CLI argument parsing
- All transport management (stdio, SSE, streamable-http)
- AuthBroker integration
- .env file loading logic

### Migration Guide
**For embedding in external servers (cloud-llm-hub, etc.):**
```typescript
// Before (1.2.x)
import { mcp_abap_adt_server } from '@fr0ster/mcp-abap-adt/server/v1';
const server = new mcp_abap_adt_server({ connection, allowProcessExit: false });
server.registerHandlers({ connection, logger });

// After (1.2.2)
import { EmbeddableMcpServer } from '@fr0ster/mcp-abap-adt/server/v1';
const server = new EmbeddableMcpServer({
  context: { connection, logger },
  exposition: ['readonly', 'high']
});
const mcpServer = server.mcpServer; // Use with transport
```

## [1.2.1] - 2025-12-22
### Added
- **Subpath export `./utils`** for internal utilities access
  - `@fr0ster/mcp-abap-adt/utils` - exports `sessionContext`, `getManagedConnection`, and other utilities
  - Required for cloud-llm-hub integration to access session context

## [1.2.0] - 2025-12-21
### Changed
- **BREAKING: v2 is now the default server**
  - `mcp-abap-adt` command now runs v2 server (was v1)
  - v1 server moved to `legacy-server.ts`, accessible via `npm run start:legacy`
  - Removed separate `mcp-abap-adt-v2` binary

- **v1 becomes Handler Exporter**
  - v1/index.ts now exports `HandlerExporter` class for external server integration
  - Allows registering ABAP ADT handlers on any McpServer instance
  - Designed for embedding into existing Express/CDS/CAP servers (e.g., cloud-llm-hub)

### Added
- **Subpath exports** for modular imports
  - `@fr0ster/mcp-abap-adt` - main package (unchanged)
  - `@fr0ster/mcp-abap-adt/handlers` - HandlerExporter and handler groups
  - `@fr0ster/mcp-abap-adt/server/v1` - v1 module (exporter + legacy server)
  - v2 server is internal, not exported as subpath

- **HandlerExporter class** for programmatic handler registration
  - `new HandlerExporter(options?)` - create exporter with configurable handler groups
  - `registerOnServer(mcpServer, connectionProvider)` - register handlers with connection injection
  - `getHandlerEntries()` - get raw handler entries for custom registration
  - `getToolNames()` - list all available tool names
  - `createRegistry()` - create IHandlersRegistry for v2 servers

- **Handler Groups** - modular handler organization
  - `ReadOnlyHandlersGroup` - read-only handlers (getProgram, getClass, etc.)
  - `HighLevelHandlersGroup` - high-level operations
  - `LowLevelHandlersGroup` - low-level operations
  - `SystemHandlersGroup` - system handlers
  - `SearchHandlersGroup` - search handlers

### Migration Guide
**For CLI users:**
- No changes needed - `mcp-abap-adt` command works the same
- To use legacy v1 server: `npm run start:legacy`

**For library users (cloud-llm-hub, etc.):**
```typescript
// Old way (v1 server class) - still works via legacy import
import { mcp_abap_adt_server } from '@fr0ster/mcp-abap-adt';

// New way (handler exporter) - recommended
import { HandlerExporter } from '@fr0ster/mcp-abap-adt/handlers';

const exporter = new HandlerExporter();
exporter.registerOnServer(mcpServer, () => getConnection());
```

**For CAP/CDS projects with file: dependency:**
Add path mapping to tsconfig.json:
```json
{
  "paths": {
    "@fr0ster/mcp-abap-adt/handlers": ["./submodules/mcp-abap-adt/dist/lib/handlers/index"]
  }
}
```

## [1.1.32] - 2025-12-21
### Added
- **v2 HTTP Server Injection**: Added support for external HTTP application injection in v2 servers
  - New `IHttpApplication` interface for Express-like HTTP applications
  - `StreamableHttpServer` and `SseServer` now support `app` option in constructor
  - New `registerRoutes(app, options?)` method for embedding into existing Express/CDS/CAP servers
  - Enables integration with cloud-llm-hub and other CAP-based applications
  - Helper methods: `getPath()`, `getSsePath()`, `getPostPath()`

## [1.1.31] - 2025-12-21
### Fixed
- **CLI `--version` flag**: Fixed package.json path resolution for both v1 and v2 servers
  - Path now correctly resolves from `dist/server/v1/` and `dist/server/v2/` to root `package.json`

## [1.1.30] - 2025-12-21
### Added
- **MCP Server v2 Architecture**:
  - New modular server architecture with `BaseMcpServer`, `StdioServer`, `StreamableHttpServer`
  - Handler registration system with Dependency Injection pattern
  - `HandlerContext` for unified connection and logging access in handlers
  - `ServerConfigManager` for centralized configuration management
  - `AuthBrokerConfig` for V2 server configuration
  - `StdioLogger` for minimal logging in stdio transport
  - Transport-specific server implementations (stdio, SSE, HTTP)

- **Headless Browser Mode**: Added `--browser` CLI parameter for SSH and remote sessions
  - `--browser=headless`: Logs authentication URL and waits for manual callback
  - `--browser=none`: Logs URL and rejects immediately (for automated tests)
  - `--browser=system`: Opens system default browser (default)
  - `--browser=chrome|edge|firefox`: Opens specific browser
  - Environment variable: `MCP_BROWSER`
  - Ideal for SSH sessions, Docker containers, and CI/CD environments

- **YAML Configuration Support**:
  - Load server configuration from YAML files
  - Enhanced command-line transport handling
  - Improved configuration validation

- **Structured Logging**:
  - Handler logging with configurable options and integration
  - Structured logging for handler functions
  - Logger cleanup and enhanced handler implementations

- **Testing Improvements**:
  - Jest configuration and enhanced testing framework
  - Unified test refactoring roadmap with base tester classes
  - Integration tests for low-level view handlers
  - Read-only handler tests for WhereUsed analysis
  - `AuthBrokerFactory` for test configuration

- **Infrastructure & Handlers**:
  - Added `tabletypes` to integrated terminal profiles
  - Handler migration to infrastructure module
  - Basic auth support in MCP destination handling

### Changed
- **Token Refresh Architecture (Breaking)**:
  - Removed legacy `createDestinationAwareConnection()` wrapper (~150 lines)
  - Token refresh now handled internally by `JwtAbapConnection` via DI `ITokenRefresher`
  - `getConnectionForSession()` creates `tokenRefresher` from `AuthBroker` and passes to `createAbapConnection()`
  - Removed all `reset()` calls from 23+ handler files (no longer needed)
  - Removed unused `disposeConnection()` and `getAuthHeaders()` functions
  - Simplified `HandlerContext` to use `IAbapConnection` instead of deprecated `IAbapConnectionExtended`

- **Handler Refactoring**:
  - All handlers updated to utilize `HandlerContext` for connection and logging
  - Standardized import statements across handlers
  - Enhanced error handling and logging across all handlers
  - Replaced direct connection creation with managed connection

- **Configuration Module**:
  - Extracted configuration logic into dedicated module
  - Improved YAML configuration loading and command line parsing
  - Enhanced connection handling and configuration validation

### Fixed
- Network error handling in `createDestinationAwareConnection`
- Handler results properly awaited and errors handled in `BaseMcpServer`
- Basic auth support in MCP destination handling
### Removed
- Legacy test files and deprecated test scripts (85 files)
- Obsolete v2 components from earlier iterations
- Deprecated tools: `update-crudclient-api.js`, `update-handlers-with-tool-definitions.js`, etc.

### Documentation
- Comprehensive documentation for various components and usage scenarios
- MCP Server architecture and implementation roadmap
- Handler refactoring roadmap
- YAML configuration support documentation
- Issue roadmap system for structured issue tracking
- Updated development guidelines

### Dependencies
- `@mcp-abap-adt/interfaces`: `^0.2.3` → `^0.2.6`
  - Removed deprecated `IAbapConnectionExtended` interface
  - Added `ITokenRefresher` interface for DI
- `@mcp-abap-adt/connection`: `^0.2.3` → `^0.2.5`
  - `createAbapConnection()` now accepts 4th parameter `tokenRefresher`
  - `JwtAbapConnection` handles token refresh internally
- `@mcp-abap-adt/auth-providers`: `^0.2.1` → `^0.2.3` (headless mode, cross-platform fixes)
- `@mcp-abap-adt/auth-broker`: `^0.2.4` → `^0.2.9`
  - Added `createTokenRefresher()` factory method
  - Headless mode passthrough
- `@mcp-abap-adt/auth-stores`: `^0.2.5` → `^0.2.8` (EnvFileSessionStore with JWT persistence)
- `@mcp-abap-adt/clients`: `^0.2.4` → `^0.2.5`

## [1.1.29] - 2025-12-08

### Added
- **Parameter Passing Unit Tests Roadmap**: Added comprehensive roadmap for unit tests to verify parameter passing
  - Created `doc/roadmaps/parameter_passing_unit_tests_roadmap.md`
  - Detailed test strategy for verifying all parameters pass correctly from MCP handlers through CrudClient to Builder classes and finally to low-level functions
  - Test implementation plan with 4 phases covering infrastructure, individual object types, and integration tests
  - Test examples for ViewBuilder, CrudClient, and low-level functions
  - Coverage goals (100% for parameter passing) and success criteria
  - Addresses issue where parameters like `transportRequest` can be lost during the call chain

### Documentation
- **Roadmap Documentation**: Added roadmap for future unit test development
  - Comprehensive plan for preventing parameter loss regression
  - Test file structure and organization guidelines
  - Maintenance and CI/CD integration recommendations

## [1.1.28] - 2025-01-XX

### Changed
- **Header Constants Migration**: Replaced all hardcoded header strings with constants from `@mcp-abap-adt/interfaces`
  - All header references now use constants (e.g., `HEADER_SAP_URL`, `HEADER_SAP_AUTH_TYPE`, `HEADER_MCP_DESTINATION`, etc.)
  - Improved type safety and consistency across packages
  - Updated error messages and hints to use header constants
- **Updated dependencies**:
  - `@mcp-abap-adt/header-validator`: `^0.1.6` → `^0.1.7`
    - Added comprehensive header sets documentation
    - Enhanced validation for Basic Auth and UAA refresh token sets
    - All header references migrated to constants from `@mcp-abap-adt/interfaces`
  - `@mcp-abap-adt/interfaces`: `^0.1.1` → `^0.1.2`
    - Added HTTP header constants for all headers used across packages
    - Added header groups and authentication type constants

### Technical
- **Code Quality**: Improved maintainability by centralizing header name definitions
- **Type Safety**: Better compile-time checking for header names

## [1.1.27] - 2025-12-07

### Changed
- **Updated dependencies**:
  - `@mcp-abap-adt/auth-broker`: `^0.1.9` → `^0.1.10`
    - Added constructor validation for stores and tokenProvider parameters
    - Ensures required dependencies are present upon AuthBroker instantiation

## [1.1.26] - 2025-12-06

### Added
- **Comprehensive usage documentation** – Added complete MCP function call documentation:
  - Created `doc/user-guide/usage/` directory with structured documentation
  - **Simple Objects** (22 files): High-level and low-level handlers for 11 object types:
    - Classes, Interfaces, Programs, Function Groups, Function Modules
    - Tables, Structures, CDS Views, Domains, Data Elements, Service Definitions
    - Each object has separate `-high.md` and `-low.md` files with exact MCP call examples
  - **RAP Business Objects** documentation:
    - Complete workflow for creating RAP BO with all components
    - Deferred group activation guide
    - Step-by-step examples with exact MCP function calls
  - All documentation uses compact, laconic format with only exact MCP calls and parameters
  - No unnecessary descriptions, maximum clarity
- **Test syntax checking** – Added `npm run test:check` command:
  - Performs TypeScript syntax check on test files without running tests
  - Uses `tsc --noEmit -p tsconfig.test.json`
  - Helps catch type errors before running tests

### Changed
- **Updated dependencies to latest versions**:
  - `@mcp-abap-adt/adt-clients`: `^0.1.35` → `^0.1.36`
  - `@mcp-abap-adt/auth-broker`: `^0.1.8` → `^0.1.9`
  - `@mcp-abap-adt/auth-providers`: `^0.1.1` → `^0.1.2`
  - `@mcp-abap-adt/auth-stores`: `^0.1.3` → `^0.1.4`
  - `@mcp-abap-adt/connection`: `^0.1.14` → `^0.1.15`
  - `@mcp-abap-adt/header-validator`: `^0.1.4` → `^0.1.6`
  - `@mcp-abap-adt/interfaces`: `^0.1.1` (unchanged)
  - `@mcp-abap-adt/logger`: `^0.1.0` → `^0.1.1`

### Fixed
- **TypeScript type errors in TableLowHandlers.test.ts** – Fixed type inference issues:
  - Corrected `lockSessionForCleanup` variable declaration and usage
  - Fixed type narrowing in catch and finally blocks

## [1.1.25] - 2025-12-12

### Added
- **`--mcp=<destination>` parameter** – Default MCP destination name for auth-broker:
  - Allows using auth-broker (service keys) with stdio and SSE transports
  - When specified, this destination is used when `x-mcp-destination` header is not provided in requests
  - For stdio transport: Server initializes auth-broker with the specified destination at startup
  - For SSE transport: Server uses the specified destination as fallback when header is missing
  - For HTTP transport: Server uses the specified destination as fallback when header is missing
  - Example: `mcp-abap-adt --transport=stdio --mcp=TRIAL`
  - This enables auth-broker usage with stdio and SSE transports, which previously required `.env` file configuration

### Changed
- **Auth-broker support for stdio and SSE transports** – Extended `getOrCreateAuthBroker()` to support stdio and SSE transports:
  - Previously, auth-broker was only available for HTTP/streamable-http transport
  - Now works with all transport types when `--mcp` parameter is specified
  - For stdio: Auth-broker is initialized at server startup with the destination from `--mcp` parameter
  - For SSE: Auth-broker works the same way as HTTP transport (via headers or `--mcp` fallback)

### Fixed
- **`--mcp` parameter now skips `.env` file loading** – When `--mcp` is specified:
  - `.env` file is not automatically loaded (even if it exists in current directory)
  - `.env` file is not considered mandatory for stdio and SSE transports
  - Auth-broker configuration takes precedence over `.env` file
  - This ensures that `--mcp` parameter works correctly without conflicts from `.env` file settings
- **SSE transport with `--mcp` parameter** – Fixed issue where SSE transport was using `.env` configuration instead of auth-broker when `--mcp` was specified:
  - Server now initializes auth-broker at startup for SSE transport when `--mcp` is provided
  - `applyAuthHeaders()` now handles empty headers correctly when `defaultMcpDestination` is set
  - Configuration from auth-broker takes precedence over `.env` file

### Documentation
- Updated `CLI_OPTIONS.md` with `--mcp` parameter documentation and examples
- Updated `CLIENT_CONFIGURATION.md` with information about using `--mcp` parameter for stdio and SSE transports
- Added examples for Cline configuration with stdio transport and `--mcp` parameter
- Updated help text in both `src/index.ts` and `bin/mcp-abap-adt.js` with `--mcp` parameter information

## [1.1.24] - 2025-12-02

### Changed
- **Safe session storage by default** – Session data is now stored in-memory using `SafeSessionStore` by default:
  - Session tokens are no longer persisted to disk by default (secure by default)
  - Session data is lost after server restart (requires re-authentication)
  - Use `--unsafe` flag to enable file-based session storage (legacy behavior)
  - File-based storage (`UnixFileSessionStore`/`WindowsFileSessionStore`) is only used when `--unsafe` is specified

### Added
- **`--unsafe` flag** – Enables file-based session storage (persists tokens to disk):
  - When specified, session data is saved to platform-specific locations:
    - Unix: `~/.config/mcp-abap-adt/sessions/{destination}.env`
    - Windows: `%USERPROFILE%\Documents\mcp-abap-adt\sessions\{destination}.env`
  - Can be set via environment variable: `MCP_UNSAFE=true`
  - Use this flag if you need session persistence across server restarts

### Dependencies
- Updated `@mcp-abap-adt/auth-broker` to `^0.1.5`:
  - Benefits from new `SafeSessionStore` implementation (in-memory, secure)
  - Updated to use new `ISessionStore` interface (replaces `SessionStore`)

## [1.1.23] - 2025-12-02

### Fixed
- **Help text correction** – fixed incorrect help message for `x-mcp-destination` header:
  - Removed incorrect statement that `x-mcp-destination` requires `x-sap-url` header
  - Updated help text to correctly state that URL is automatically derived from service key (same as `x-sap-destination`)
  - Help text now accurately reflects that `x-sap-url` is not required and will be ignored if provided

## [1.1.22] - 2025-12-01

### Dependencies
- Updated `@mcp-abap-adt/adt-clients` to `^0.1.33`:
  - Benefits from optimized CSRF token endpoint (`/sap/bc/adt/core/discovery`)
  - Faster connection initialization for all CRUD operations
- Updated `@mcp-abap-adt/auth-broker` to `^0.1.4`:
  - Benefits from optimized CSRF token endpoint in connection layer
  - Faster authentication flows when managing JWT tokens

### Added
- **ABAP Unit class test tools**: Added `[low-level]` handlers to cover the new CrudClient APIs for class test includes and ABAP Unit orchestration:
  - `LockClassTestClassesLow`, `UpdateClassTestClassesLow`, `UnlockClassTestClassesLow`, `ActivateClassTestClassesLow`
  - `RunClassUnitTestsLow`, `GetClassUnitTestStatusLow`, `GetClassUnitTestResultLow`
  - All new tools live in `class/low/` and are registered with the server and documentation generator.
- **Package creation options**: `CreatePackage` (high- and low-level) now accepts optional `package_type`, `software_component`, `transport_layer`, `application_component`, and `responsible` parameters and forwards them directly to `CrudClient`, enabling Cloud systems to pass values such as `ZLOCAL` while keeping the transport layer empty.

## [1.1.21] - 2025-12-01

### Fixed
- **x-mcp-destination validation** – fixed issue where `x-mcp-destination` header was incorrectly requiring `x-sap-url`:
  - `x-mcp-destination` now works identically to `x-sap-destination` - URL is automatically derived from service key
  - `x-sap-url` is now optional for `x-mcp-destination` (and will be ignored with a warning if provided)
  - Fixed issue on Windows where `x-mcp-destination` was being ignored
  - Updated header validator to check headers in both lowercase and original case for better compatibility

### Added
- **Custom auth-broker path** – added `--auth-broker-path` command-line option:
  - Allows specifying custom base path for service keys and sessions
  - Automatically creates `service-keys` and `sessions` subdirectories in the specified path
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
  - Directories are created automatically if they don't exist
  - Can be used together with `--auth-broker` flag

- **Automatic directory creation** – service keys and sessions directories are now created automatically:
  - Directories are created at server startup if they don't exist
  - Prevents errors when saving sessions for the first time
  - Works for both default platform paths and custom `--auth-broker-path`

- **Enhanced startup information** – improved auth-broker path display at server startup:
  - Shows all search paths for service keys (in order of priority)
  - Shows all save paths for sessions
  - Formatted with clear visual separators for better readability
  - Only displayed when `--auth-broker` flag is used

- **Diagnostic logging** – added platform-aware logging for better debugging:
  - Logs platform information when processing authentication headers
  - Logs all header keys that start with `x-sap` or `x-mcp`
  - Logs search paths when creating AuthBroker instances
  - Helps diagnose issues on different platforms (especially Windows)

### Changed
- **Header validation logic** – improved validation order and case handling:
  - `x-mcp-destination` is now checked immediately after `x-sap-destination`, regardless of `x-sap-url` presence
  - Added case-insensitive header checking for better compatibility
  - Both `x-sap-destination` and `x-mcp-destination` now check headers in both lowercase and original case

- **Documentation updates** – comprehensive documentation improvements:
  - Added `--auth-broker-path` parameter documentation in help text
  - Updated `CLIENT_CONFIGURATION.md` with custom path examples
  - Updated `INSTALLATION.md` with new command-line option
  - Updated `SERVICE_KEY_SETUP.md` with custom path usage examples
  - Added Cline configuration example in help text

### Dependencies
- **Updated `@mcp-abap-adt/auth-broker` to `^0.1.3`** – upgraded to latest version
- **Updated `@mcp-abap-adt/header-validator` to `^0.1.3`** – upgraded to latest version

## [1.1.20] - 2025-12-01

### Changed
- **Help documentation improvements** – updated help messages with detailed instructions for saving service keys:
  - Added platform-specific instructions for Linux, macOS, and Windows
  - Replaced example JSON structure with instructions to copy service key from SAP BTP
  - Fixed backslash escaping in Windows PowerShell commands
  - Updated both launcher help (`bin/mcp-abap-adt.js`) and server help (`src/index.ts`)
  - Updated documentation files: `SERVICE_KEY_SETUP.md` and `CLIENT_CONFIGURATION.md`

## [1.1.19] - 2025-11-30

### Changed
- **Handler refactoring** – migrated handlers to use `CrudClient` and `SharedBuilder` from `@mcp-abap-adt/adt-clients`:
  - `handleSearchObject` now uses `SharedBuilder.search()` instead of manual URL construction
  - Eliminates redundant URL concatenation and potential duplication errors
  - Better code reuse and consistency across handlers

- **URL handling simplification** – removed unnecessary URL cleaning logic:
  - URLs from `.env` files and service keys are expected to be clean
  - Removed aggressive URL cleaning that was causing issues
  - Only basic trimming is performed where needed

- **Transport-specific auth-broker handling** – `auth-broker` is now ignored for `stdio` and `sse` transports:
  - AuthBroker initialization is skipped for non-HTTP transports
  - Prevents unnecessary errors and resource usage
  - `.env` file is used directly for `stdio` and `sse` transports

### Fixed
- **URL duplication in stdio transport** – fixed incorrect URL formation when using `stdio` transport:
  - Resolved `getaddrinfo ENOTFOUND ...comhttps` errors
  - Proper URL handling in connection initialization
  - Correct `.env` file parsing for `stdio` mode

### Added
- **Lazy AuthBroker initialization** – AuthBroker instances are now created on-demand per destination:
  - AuthBroker is only created when a destination is actually needed (not at server startup)
  - Each destination gets its own AuthBroker instance, cached in a map for reuse
  - Reduces memory usage and startup time when auth-broker is not needed
  - Default AuthBroker instance for non-destination requests

- **Improved method filtering** – only `tools/call` requires SAP configuration:
  - All other MCP methods (`tools/list`, `tools/get`, `initialize`, `ping`, `notifications/initialized`, etc.) work without SAP config
  - Prevents unnecessary authentication errors for metadata requests
  - Better separation between metadata operations and actual tool execution

### Changed
- **AuthBroker instance management** – switched from single instance to per-destination map:
  - `authBrokers` map stores AuthBroker instances keyed by destination name
  - `defaultAuthBroker` for requests without specific destination
  - Lazy initialization via `getOrCreateAuthBroker()` method
  - Better isolation between different destinations

- **Platform store imports** – fixed ES module compatibility:
  - Replaced `require()` with static imports in `getPlatformStores()`
  - Fixes "UnixFileSessionStore is not a constructor" error
  - Proper ES module support for platform-specific stores

### Fixed
- **ES module compatibility** – fixed "UnixFileSessionStore is not a constructor" error:
  - Changed `getPlatformStores()` to use static imports instead of `require()`
  - Properly handles ES module exports for Unix/Windows store implementations
  - AuthBroker now correctly initializes on Unix systems

- **Request processing logic** – improved handling of requests that don't require SAP connection:
  - Only `tools/call` method triggers SAP configuration validation
  - All other methods bypass authentication checks
  - Prevents false errors for metadata and initialization requests

## [1.1.17] - 2025-11-28

### Added
- **Cross-platform session storage** – optional persistent session management:
  - Session storage now disabled by default (stateless mode)
  - Enable via `MCP_ENABLE_SESSION_STORAGE=true` environment variable
  - Custom session directory via `MCP_SESSION_DIR=/path/to/sessions`
  - Platform-specific defaults: Windows temp dir, `/tmp` on Linux, `/var/folders` on macOS
  - Prevents `ENOENT` errors when running from different working directories

- **Cline configuration documentation** – comprehensive setup guide:
  - Created `doc/installation/CLINE_CONFIGURATION.md` with detailed configuration for all transport types
  - Added example configs in `doc/installation/examples/` for NPX, global install, and local development
  - Platform-specific notes for macOS, Linux, and Windows
  - Session storage configuration examples and best practices
  - Troubleshooting guide for common connection issues

- **Cross-platform fixes documentation** – created `doc/development/CROSS_PLATFORM_FIXES.md`:
  - Documented dotenv removal and stdio transport fixes
  - Cross-platform path handling with `os.tmpdir()` and `path.join()`
  - Platform-specific session storage locations
  - Testing instructions for all three transports (stdio, HTTP, SSE)

### Changed
- **Session storage architecture** – improved reliability and cross-platform support:
  - Moved from relative `.sessions` path to absolute paths using `os.tmpdir()`
  - Session storage now optional and controlled by environment variables
  - Removed `FileSessionStorage` usage from individual handlers (e.g., `handleDeletePackage`)
  - All session management now centralized in connection manager (`utils.ts`)

- **Environment variable documentation** – comprehensive env var reference:
  - Added table of all available environment variables in Cline configuration docs
  - Documented `MCP_ENABLE_SESSION_STORAGE` and `MCP_SESSION_DIR` usage
  - Platform-specific default values and examples
  - Guidance on when to enable/disable session storage

### Fixed
- **Session directory creation errors** – fixed `ENOENT: no such file or directory, mkdir '/.sessions'`:
  - Replaced relative `.sessions` path with absolute paths
  - Session directory now uses OS-specific temp directory by default
  - Works correctly when running as global npm package or via npx
  - No longer depends on current working directory

- **Handler session management** – simplified connection handling:
  - Removed custom `FileSessionStorage` creation in `handleDeletePackage`
  - Deprecated `force_new_connection` parameter (now ignored)
  - All connections use centralized session management
  - Restart server to force new session instead of per-handler sessions

### Dependencies
- No dependency changes in this release

## [1.1.16] - 2025-01-XX

### Removed
- **dotenv dependency** – completely removed `dotenv` package from dependencies:
  - Eliminated `dotenv` as a dependency to prevent stdout pollution in stdio mode
  - Resolved `"[dotenv@17."... is not valid JSON` error that was breaking stdio transport
  - Server now uses manual `.env` file parsing for all transport modes

### Changed
- **.env file parsing** – replaced `dotenv` library with manual parsing:
  - Manual `.env` file parsing for all transport modes (stdio, http, sse)
  - Supports both Unix (`\n`) and Windows (`\r\n`) line endings
  - Handles comments, quoted values, and empty lines correctly
  - Cross-platform compatible (works on Linux, Windows, macOS)
  - No external dependencies for environment variable loading

- **stdio mode auto-detection** – improved stdio mode detection:
  - Auto-detects stdio mode when `stdin` is not a TTY (piped by MCP Inspector or other tools)
  - Checks `!process.stdin.isTTY` in addition to command-line arguments and environment variables
  - Allows seamless connection from MCP Inspector and other stdio-based clients without explicit `--transport=stdio` flag

- **stderr handling in stdio mode** – restored stderr for error logging:
  - Following reference implementation pattern, stderr is now available for error logging in stdio mode
  - stdout remains reserved exclusively for MCP JSON-RPC protocol
  - console.error() and console.warn() now work correctly in stdio mode (write to stderr)

### Fixed
- **stdio transport connection** – fixed issue where server was not connecting properly in stdio mode:
  - Server now correctly detects stdio mode when launched by MCP Inspector
  - Tools are properly registered and available when connecting via stdio
  - Resolved connection issues that prevented tools from being listed

### Dependencies
- Updated `@mcp-abap-adt/connection` to `^0.1.12`:
  - Connection package no longer reads `.env` files or depends on `dotenv`
  - Consumers must pass `SapConfig` directly to connection constructors
- Updated `@mcp-abap-adt/adt-clients` to `^0.1.27`:
  - Updated to work with connection@0.1.12
  - Fixed example scripts to use manual `.env` parsing

## [1.1.15] - 2025-01-27

### Fixed
- **Git tag management** – fixed issues with release tag creation and management:
  - Corrected tag placement on the latest commit with CHANGELOG updates
  - Ensured proper tag synchronization between local and remote repositories
  - Fixed tag deletion and recreation workflow for release management

## [1.1.14] - 2025-01-27

### Added
- **Command-line flags --version/-v and --help/-h** – added support for standard command-line flags:
  - `--version` or `-v` – displays package version and exits
  - `--help` or `-h` – displays help message and exits
  - Flags are processed before any other initialization, allowing quick version/help checks

### Changed
- **.env file search logic** – improved .env file discovery and loading:
  - **Search location:** Now searches for `.env` file only in the current working directory (where the command is executed)
  - **No recursive search:** Removed fallback searches in parent directories or project root
  - **Explicit path support:** Still supports `--env=/path/to/.env` or `MCP_ENV_PATH` environment variable for custom locations
  - **Cross-platform paths:** Uses `path.resolve()` and `path.join()` for proper path handling on Windows, Linux, and macOS

- **Transport mode and .env file relationship** – refined logic for transport mode selection and .env file requirements:
  - **Default behavior:** If transport is not explicitly specified and no `.env` file is found, server starts in HTTP mode (no .env required)
  - **Explicit transport with .env:** If transport is explicitly set to `stdio` or `sse` but `.env` file is missing, server exits with clear error message
  - **Explicit transport without .env:** If transport is explicitly set to `http` or `streamable-http`, server starts without .env file (as expected)
  - **Error messages:** Improved error messages that clearly indicate what transport mode requires .env file and how to specify custom .env location

### Fixed
- **Cross-platform compatibility** – ensured all file path operations work correctly on Windows, Linux, and macOS:
  - All path operations use Node.js `path` module methods (`path.join()`, `path.resolve()`, `path.isAbsolute()`)
  - Proper handling of Windows path separators (`\`) vs Unix path separators (`/`)
  - Version reading from `package.json` uses cross-platform path resolution

## [1.1.13] - 2025-01-27

### Fixed
- **Handler parameter schemas alignment with CrudClient** – comprehensive fix to ensure all handler input schemas match actual CrudClient method parameters:
  - **Data Element handlers:**
    - Added `type_name` parameter to `handleCreateDataElement` schema (was missing but used in code)
    - Added `search_help`, `search_help_parameter`, `set_get_parameter` to `handleUpdateDataElement` schema (now properly passed to builder)
    - Updated field label descriptions to clarify they are applied during update step after creation
  - **Domain handlers:**
    - Removed unsupported parameters from `handleCreateDomain` low-level handler: `domain_type`, `application`, `master_system`, `responsible`
  - **Program handlers:**
    - Removed `master_system` and `responsible` from both high and low-level handlers (these are set automatically by system)
  - **Class handlers:**
    - Removed `master_system` and `responsible` from high-level handler schema (set automatically by system)
    - Removed `master_system` and `responsible` from low-level handler schema and code
  - **Interface handlers:**
    - Removed `master_system` and `responsible` from both high and low-level handlers (set automatically by system)
  - **Structure, View, Table handlers:**
    - Removed `master_system` and `responsible` from low-level create handlers (set automatically by system)
  - **Behavior Definition, Metadata Extension handlers:**
    - Removed `master_system` and `responsible` from low-level create handlers (set automatically by system)
  - **Impact:** All handler schemas now accurately reflect what parameters are actually supported and used by CrudClient methods, preventing confusion and ensuring correct API usage

### Changed
- **Data Element handlers – search help support** – enhanced data element handlers to support search help configuration:
  - `handleCreateDataElement` now accepts `search_help`, `search_help_parameter`, `set_get_parameter` parameters
  - `handleUpdateDataElement` now accepts `search_help`, `search_help_parameter`, `set_get_parameter` parameters
  - These parameters are properly passed through to `DataElementBuilder` and included in update operations
  - Enables full configuration of search help and parameter settings for data elements

### Dependencies
- **Updated `@mcp-abap-adt/adt-clients` to `^0.1.26`** – upgraded to latest version which includes:
  - Added `searchHelp`, `searchHelpParameter`, `setGetParameter` to `DataElementBuilderConfig`
  - Updated `DataElementBuilder.update()` to pass search help parameters to `UpdateDataElementParams`
  - Full support for search help configuration in data element operations

## [1.1.11] - 2025-11-28

### Fixed
- **DomainHighHandlers - Update workflow detection bug** – fixed critical issue where domain update operations were incorrectly using CREATE workflow instead of UPDATE workflow:
  - **Root cause:** `DomainBuilder.update()` method determines which workflow to use (CREATE vs UPDATE) by checking if `this.state.createResult` exists. When `CrudClient.getDomainBuilder()` reuses a builder instance from a previous `createDomain()` call, the builder still has `createResult` in its state, causing `update()` to incorrectly use CREATE workflow (`upload()` function) instead of UPDATE workflow (`updateDomain()` function).
  - **Solution:** Modified `handleUpdateDomain` to pass `packageName` directly to `lockDomain()` call, ensuring the builder is created with correct configuration from the start. This prevents builder reuse issues and ensures proper workflow detection.
  - **Additional fix:** Removed redundant validation step from `handleUpdateDomain` handler. The validation was checking if domain exists, but `lockDomain()` will fail if domain doesn't exist anyway, making the validation step unnecessary and potentially causing confusion.
  - **Impact:** Domain update operations now correctly use UPDATE workflow for existing domains, preventing "Domain already exists" errors that were occurring when the system tried to create an already-existing domain.

### Changed
- **DomainHighHandlers test logging** – completely refactored test logging system for better information density and clarity:
  - **Removed verbose `debugLog()` system** – eliminated all `debugLog()` calls that were cluttering test output with verbose JSON structures and nested data objects
  - **Introduced concise logging** – replaced with simple, informative `console.log()` statements that provide clear, actionable information:
    - Clear operation names (e.g., "High Create: Creating domain...", "High Update: Updating domain...")
    - Success/failure status with object names
    - Skip reasons when tests are skipped
    - Visual infographics (emojis) for quick visual scanning of test output
  - **Simplified error handling** – removed redundant try-catch blocks and verbose error logging, now relies on Jest's native error handling which provides better stack traces
  - **More informative output** – each log statement now provides essential information (operation type, object name, status) without JSON noise
  - **Consistent with other tests** – matches logging patterns used in BehaviorDefinitionHighHandlers, PackageHighHandlers, and other high-level handler tests
  - **Better maintainability** – removed ~50 lines of verbose debug logging code, making tests easier to read and maintain
  - **Improved debugging** – concise logs make it easier to identify which operation failed and why, without scrolling through JSON dumps

### Dependencies
- **Updated `@mcp-abap-adt/adt-clients` to `^0.1.25`** – upgraded to latest version which includes:
  - Improved `DomainBuilder.update()` workflow detection logic
  - Better handling of CREATE vs UPDATE workflow selection based on builder state
  - Enhanced error messages for domain operations

### Documentation
- **Test Issues Roadmap** – comprehensive update to development roadmap:
  - **Issue #10 (DomainHighHandlers)** – changed status from "Expected Skip" to "Fixed" with detailed explanation
  - **Updated statistics:** 8 fixed issues (was 7), 1 expected skip (was 3)
  - **Added detailed problem analysis:** Documented root cause, solution approach, and code changes
  - **Improved issue tracking:** Better categorization of issues vs expected skips vs cloud limitations

### Development Process
- **Issue Roadmap System** – introduced systematic problem analysis and resolution tracking:
  - **New workflow:** Test failures are now systematically analyzed and documented in `doc/development/TEST_ISSUES_ROADMAP_*.md`
  - **Issue classification:** Problems are categorized as Simple (⚡) or Complex (🔍), with clear distinction between real issues and expected skips
  - **Problem analysis:** Each issue includes detailed error messages, root cause analysis, solution approach, and code references
  - **Progress tracking:** Roadmap maintains statistics on fixed vs pending vs expected issues, providing clear visibility into test suite health
  - **Solution documentation:** All fixes are documented with code references, making it easier to understand what was changed and why
  - **Continuous improvement:** Roadmap is updated after each test run, ensuring it reflects current state and helps prioritize future work
  - **Benefits:** Enables faster problem resolution, prevents duplicate work, and provides historical context for similar issues

## [1.1.10] - 2025-11-27

### Added
- **Behavior Implementation integration tests** – added comprehensive integration tests for Behavior Implementation handlers:
  - `BehaviorImplementationLowHandlers.test.ts` – full workflow test: Validate → Create → Check → Lock → Update → Unlock → Activate
  - `BehaviorImplementationHighHandlers.test.ts` – high-level handler test: CreateClass → Update implementations include → DeleteClass
  - Both tests include detailed step-by-step logging for better visibility and debugging
  - Tests use `implementationCode` parameter for custom implementations include code
  - Proper cleanup logic ensures test objects are deleted only if successfully created
- **Test configuration parameter for Behavior Implementation** – added `implementation_code` parameter:
  - Separate parameter for updating implementations include (local handler class) in low-level handler tests
  - `update_source_code` parameter for high-level handler tests
  - Updated test templates with correct implementation code structure
  - Improved test configuration clarity and maintainability

### Changed
- **Behavior Implementation HighHandlers test** – simplified test implementation:
  - Removed manual session state management (save/restore) – CrudClient now manages session internally
  - Removed low-level handler imports (`handleLockClass`, `handleUnlockClass`, `handleActivateClass`)
  - Test now uses only CrudClient methods for lock → update → unlock → activate workflow
  - Aligns with high-level handler pattern where each handler manages its own session and lock/unlock operations
- **Behavior Implementation handlers** – updated to use types from `@mcp-abap-adt/adt-clients`:
  - All handler parameter types now imported from `adt-clients` package
  - Ensures type consistency across handlers and client library
  - `handleCreateBehaviorImplementation` now correctly uses `BehaviorImplementationBuilderConfig` type

### Fixed
- **Behavior Implementation test configuration** – fixed test configuration for managed behavior definitions:
  - Removed `read FOR READ` method from implementation code examples in `test-config.yaml` and `test-config.yaml.template`
  - For managed behavior definitions, `read` method is auto-generated and should not be included in custom implementation code
  - Updated both low-level and high-level test configurations with correct implementation code structure
  - Tests now correctly handle managed behavior implementation classes without superfluous `read` method errors

## [1.1.10] - 2025-11-26

### Added
- **Client Connection Isolation**: Implemented per-session connection isolation to prevent data mixing between different clients
  - Each client session now maintains its own isolated SAP connection based on `sessionId` and configuration hash
  - Connections are cached per unique combination of `sessionId` + `sapUrl` + authentication parameters
  - Uses `AsyncLocalStorage` to pass session context to handlers, ensuring each request uses the correct connection
  - Prevents race conditions where concurrent requests from different clients could overwrite each other's connection settings
  - Backward compatible: falls back to global connection cache for non-HTTP transports (stdio)

- **Non-Local Connection Restrictions**: Added security restrictions for non-local connections
  - **SSE Transport**: Always restricted to localhost connections only (127.0.0.1, ::1, localhost)
  - **HTTP Transport**: Non-local connections are restricted when:
    - `.env` file exists (was found at startup)
    - AND request does not include SAP connection headers (`x-sap-url`, `x-sap-auth-type`)
  - Non-local connections with SAP headers are allowed (enables multi-tenant scenarios)
  - Local connections are always allowed regardless of `.env` file presence
  - Clear error messages guide users when connections are rejected

### Changed
- **Connection Management**: Refactored `getManagedConnection()` to support session-based connection caching
  - Added `generateConnectionCacheKey()` function to create unique cache keys from sessionId and config signature
  - Implemented `getConnectionForSession()` to retrieve or create session-specific connections
  - Added automatic cleanup of old connection cache entries (older than 1 hour)
  - Each session uses unique `sessionId` for its `AbapConnection` to prevent session mixing

- **Session Tracking**: Enhanced `streamableHttpSessions` to store SAP configuration per session
  - Added `sapConfig` field to session objects to track configuration per client
  - `applyAuthHeaders()` now stores configuration in session object
  - Session cleanup automatically removes associated connection from cache

### Security
- **Connection Isolation**: Prevents one client from receiving another client's data when multiple clients connect to different SAP systems
- **Access Control**: Restricts non-local access when `.env` file is present, requiring explicit SAP headers for remote connections

## [1.1.9] - 2025-11-24

### Added
- **DDLX (Metadata Extension) Management Tools**:
  - `CreateMetadataExtension`: Create new ABAP Metadata Extensions (DDLX) with automatic activation
  - `UpdateMetadataExtension`: Update source code of existing Metadata Extensions
  - Full CRUD workflow: Create → Lock → Check → Unlock → Activate
  - Support for transport request validation
  - Integrated with CrudClient API for consistent behavior

- **BDEF (Behavior Definition) Management Tools**:
  - `CreateBehaviorDefinition`: Create new ABAP Behavior Definitions (BDEF) with support for Managed, Unmanaged, Abstract, and Projection implementation types
  - `UpdateBehaviorDefinition`: Update source code of existing Behavior Definitions
  - Full CRUD workflow: Create → Lock → Check → Unlock → Activate
  - Support for root entity specification and implementation type selection
  - Transport request validation integrated
- **Full Low-Level CRUD Coverage**:
  - Added dedicated `create`, `lock`, `unlock`, `check`, `validate`, `delete`, and `update` handlers for classes, programs, interfaces, function groups/modules, domains, data elements, packages, tables, views, structures, transports, and more to cover every `CrudClient` method.
  - Each handler now has a consistent naming scheme (`CreateX`, `UpdateX`, etc.) to match the high-level counterparts.

- **System Management Tools**:
  - `GetInactiveObjects`: Retrieve list of inactive ABAP objects (objects that have been modified but not activated)
  - Provides count and detailed list of objects waiting for activation
  - Useful for monitoring development progress and identifying objects requiring attention

### Changed
- **Handler Organization Refactoring**: All handlers reorganized into categorized subdirectories with explicit `high/`, `low/`, and `readonly/` layers for better maintainability. Each low-level handler description now starts with `[low-level]`, and every read handler was moved to the new `readonly/` folders and tagged `[read-only]`. This improves discoverability, enforces single-responsibility boundaries, and makes it clear which tools mutate SAP data.
  - `bdef/` - Behavior Definition handlers (GetBdef, CreateBehaviorDefinition, UpdateBehaviorDefinition)
  - `class/` - Class handlers (GetClass, CreateClass, UpdateClass, ValidateClass, CheckClass)
  - `common/` - Common handlers (ActivateObject, DeleteObject, CheckObject, LockObject, UnlockObject, ValidateObject)
  - `data_element/` - Data Element handlers (GetDataElement, CreateDataElement, UpdateDataElement)
  - `ddlx/` - Metadata Extension handlers (CreateMetadataExtension, UpdateMetadataExtension)
  - `domain/` - Domain handlers (GetDomain, CreateDomain, UpdateDomain)
  - `enhancement/` - Enhancement handlers (GetEnhancements, GetEnhancementImpl, GetEnhancementSpot)
  - `function/` - Function handlers (GetFunction, GetFunctionGroup, CreateFunctionGroup, CreateFunctionModule, UpdateFunctionModule, ValidateFunctionModule, CheckFunctionModule)
  - `include/` - Include handlers (GetInclude, GetIncludesList)
  - `interface/` - Interface handlers (GetInterface, CreateInterface, UpdateInterface)
  - `package/` - Package handlers (GetPackage, CreatePackage)
  - `program/` - Program handlers (GetProgram, CreateProgram, UpdateProgram)
  - `search/` - Search handlers (SearchObject, GetObjectsByType, GetObjectsList)
  - `structure/` - Structure handlers (GetStructure, CreateStructure)
  - `system/` - System handlers (GetTypeInfo, GetTransaction, GetSqlQuery, GetWhereUsed, GetObjectInfo, GetSession, GetAbapAST, GetAbapSemanticAnalysis, GetAbapSystemSymbols, GetAllTypes, GetObjectStructure, GetObjectNodeFromCache, GetInactiveObjects)
  - `table/` - Table handlers (GetTable, GetTableContents, CreateTable, ValidateTable, CheckTable)
  - `transport/` - Transport handlers (GetTransport, CreateTransport)
  - `view/` - View handlers (GetView, CreateView, UpdateView)
  - This reorganization improves code navigation, reduces merge conflicts, and makes the codebase more maintainable

- **Dependencies Updated**:
  - `@mcp-abap-adt/adt-clients`: ^0.1.9 → ^0.1.12
  - `@mcp-abap-adt/connection`: ^0.1.4 → ^0.1.9
  - Updated to leverage new CrudClient methods for DDLX and BDEF operations

- **Index and Tools Registry Updates**:
  - `src/index.ts`: Updated all handler imports to reflect new subdirectory structure
  - `src/lib/toolsRegistry.ts`: Updated tool definitions imports to match new handler locations
  - All 81 handler files moved and imports updated consistently
- **Tooling Improvements**:
  - `tools/generate-tools-docs.js` now outputs a navigation tree that mirrors the document structure, separates high-/low-/read-only tools, and adds summary counts for each level.
  - `doc/user-guide/AVAILABLE_TOOLS.md` regenerated to include the new navigation, level-specific anchors, and the `[read-only]` marker.
  - Test suite, configs, and helper scripts updated to follow the new directory layout and renamed high-level handlers (`UpdateClass`, `UpdateProgram`, etc.).
- **Low-Level Tool Names**:
  - Every low-level handler now advertises a unique MCP tool name suffixed with `Low` (e.g., `CreateClassLow`, `UpdateDomainLow`, `LockPackageLow`). This prevents `Tool <name> is already registered` errors when both low/high versions exist and keeps the server compatible with clients that look up tools by name.

### Documentation
- Added `implementation_plan.md`: Plan for future refactoring of read handlers to `src/readers` directory
- Removed `roadmap.md`: Work items are complete, so the standalone roadmap is no longer required

## [1.1.8] - 2025-11-24

_Documentation for this tag is intentionally minimal; see the Git tag `v1.1.8` for its exact contents._

## [1.1.6] - 2025-11-21

### Documentation
- **Comprehensive CLI documentation**: Added detailed documentation for all command line options and configuration
  - Updated README.md with global installation guide and CLI usage examples
  - Enhanced INSTALLATION.md with complete CLI options reference
  - Created new CLI_OPTIONS.md with comprehensive command line reference
  - Documented environment file priority and auto-discovery behavior
  - Added troubleshooting section for common CLI issues

## [1.1.5] - 2025-11-21

### Added
- **--help flag**: Added comprehensive help message showing all CLI options, environment variables, and usage examples
  - Shows transport options (stdio, http, sse)
  - Lists all HTTP and SSE configuration options
  - Documents SAP connection environment variables
  - Includes practical usage examples

### Fixed
- **Global installation .env loading**: Fixed .env file discovery for globally installed packages
  - Now correctly prioritizes `process.cwd()/.env` (user's working directory) over package directory
  - Works correctly when installed via `npm install -g`
  - Better error messages showing current directory and suggesting --env flag
- **--env argument parsing**: Fixed custom .env file path support
  - Both `--env=/path/to/.env` and `--env /path/to/.env` formats now work correctly
  - Relative paths are resolved from current working directory
  - Clear feedback messages showing which .env file is being used
- **Runtime dependencies**: Moved `dotenv` from devDependencies to dependencies
  - Fixes "Cannot find module 'dotenv'" error when installed globally
  - Ensures all runtime dependencies are available in production

### Changed
- **All handlers refactored to use CrudClient** – replaced Builder pattern with unified CrudClient API
  - **18 handlers converted**: Create (Program, DataElement, Domain, FunctionGroup, FunctionModule, Package, Structure, Table, Transport, View), Update (ClassSource, DataElement, InterfaceSource), Check (Class, FunctionModule, Table, Object), Validate (Class, Object), Lock/Unlock (Object)
  - Removed direct Builder instantiation from all handlers
  - All CRUD operations now use CrudClient methods (createProgram, lockClass, updateInterface, etc.)
  - Session ID no longer exposed - internal to CrudClient implementation
  - Simplified error handling with try-catch around lock/update/unlock sequences

### Fixed
- **utils.ts deprecated methods** – added TODO comments for missing ReadOnlyClient methods
  - `fetchNodeStructure()` - marked for future implementation
  - `getSystemInformation()` - marked for future implementation
  - Both throw errors with clear TODO messages instead of attempting non-existent method calls

## [1.1.3] - 2025-11-21

### Added
- **Parameter Optionality Sync Tool**: Created `tools/sync-optional-from-interfaces.js` to extract optional parameter information from TypeScript interfaces
  - Extracts required vs optional fields from `@mcp-abap-adt/adt-clients` builder interfaces
  - Provides single source of truth for parameter optionality
  - Prevents drift between TypeScript interfaces and MCP tool definitions
  - Documentation added in `doc/development/SYNC_OPTIONAL_PARAMS.md`

### Changed
- **CreateDomain Handler**: Synced parameter optionality with `DomainBuilderConfig` interface
  - Only `domain_name` is required (was incorrectly requiring `package_name`)
  - Marked all optional parameters with `(optional)` prefix in descriptions
  - Ensures consistency with TypeScript interface definitions

## [1.1.2] - 2025-11-21

### Fixed
- **STDIO Transport**: Fixed STDIO transport broken by mixing old `Server` and new `McpServer` APIs
  - Removed legacy `Server` class and `setupHandlers()` method
  - Unified all transports (STDIO, HTTP, SSE) to use single `McpServer` instance
  - Fixed STDIO connection to use `mcpServer.server.connect(transport)` pattern
  - Removed unused imports: `Server`, `CallToolRequestSchema`, `ListToolsRequestSchema`

### Added
- **SSE Development Tool**: Created `tools/dev-sse.js` for proper SSE server development workflow
  - Launches SSE server on port 3001 (default)
  - Automatically starts MCP Inspector with correct SSE endpoint (`http://localhost:3001/sse`)
  - Mirrors `dev-http.js` functionality for consistent development experience
  - Updated `npm run dev:sse` to use new development script

## Legacy history (pre-fork upstream: mario-andreschak/mcp-abap-adt)

> The entries below predate this fork's version renumbering and were never assigned release numbers under `fr0ster/mcp-abap-adt`. They are retained verbatim for provenance. Version numbers here (1.4.0 and below) belong to the original project and intentionally overlap with the renumbered releases above.

> Package-specific changes (e.g., `@mcp-abap-adt/adt-clients`) are tracked in their respective repositories and npm packages.

### Changed
- **Dependencies**: Project now uses published npm packages instead of local workspace dependencies:
  - `@mcp-abap-adt/adt-clients` and `@mcp-abap-adt/connection` are now installed from npm
  - Removed workspace configuration and git submodules
  - Updated documentation to reflect npm package usage

### Added
- **Documentation Restructure**:
  - New platform-specific installation guides: `INSTALL_WINDOWS.md`, `INSTALL_MACOS.md`, `INSTALL_LINUX.md`
  - Main entry point: `INSTALLATION.md` with quick links to platform guides
  - SSE/HTTP transport mode documentation for web-based clients
  - nvm (Node Version Manager) as recommended installation method for all platforms
  - Server transport modes documentation: stdio (default for Cline/Cursor) and SSE/HTTP (for web interfaces)
  - SSE server options: `--sse-port`, `--sse-host`, `--sse-allowed-origins`, `--sse-enable-dns-protection`
  - Examples for running server in SSE mode: `npm run start:sse`, `npm run start:http`
- **Transport Request Validation**:
  - New utility function `validateTransportRequest()` for consistent validation across all Create handlers
  - Transport request is now optional for `$TMP` (local) package only
  - Transport request is required for all transportable (non-`$TMP`) packages
  - Clear error messages guide users to use `package_name: "$TMP"` for local development
  - Test configuration updated with `$TMP` example in `test-config.yaml.template`
  - Note: `$TMP` is the only local package in SAP - each user has their own `$TMP`
- **Domain Management Tools**:
  - `GetDomain`: Retrieve ABAP domain structure and properties
  - `CreateDomain`: Create new ABAP domains with automatic activation
  - Simplified workflow: POST with all properties + Activate + Verify
  - SAP handles locking automatically on transport
  - Full test coverage with `test-create-domain.js` and `test-get-domain.js`
- **Data Element Management Tools**:
  - `GetDataElement`: Retrieve ABAP data element information including type definition, field labels, and metadata
  - `CreateDataElement`: Create new ABAP data elements with domain references and field labels
  - Simplified workflow: POST with full body + Activate + Verify (similar to CreateDomain)
  - Support for all field labels: short (10), medium (20), long (40), heading (55)
  - Support for search help, change document, and other data element properties
  - Full test coverage with `test-create-data-element.js` and `test-get-data-element.js`
- **Transport Management Tools**:
  - `CreateTransport`: Create new ABAP transport requests with automatic task creation
  - `GetTransport`: Retrieve comprehensive transport information with objects and tasks
  - Eclipse-compatible XML structure with proper Content-Type headers
  - Support for workbench (K) and customizing (T) transport types
  - Complete transport metadata parsing and validation
  - Full test coverage with `test-create-transport.js` and `test-get-transport.js`
- **Dictionary Objects Management Tools**:
  - `CreateTable`: Create new ABAP tables with fields, keys, and technical settings
  - `CreateStructure`: Create new ABAP structures with fields and type references
  - `GetView`: Retrieve ABAP database view definition including tables, fields, joins, and selection conditions
  - Comprehensive field definitions with data types, lengths, decimals, key flags, NOT NULL constraints
  - Support for domain and data element references in field definitions
  - Table delivery classes (A/C/L/G) and data categories (APPL0/APPL1/APPL2) configuration
  - Structure includes and field type references (domains, data elements, structures, tables)
  - View analysis with tables, joins, selection conditions, and optional data retrieval
  - Full test coverage with `test-create-table.js`, `test-create-structure.js`, and `test-get-view.js`
- Domain creation creates and activates domain in one operation (3 steps vs Eclipse's 7 steps)
- Data element creation follows same simplified approach (3 steps vs Eclipse's multiple LOCK/UNLOCK operations)
- All domain properties (datatype, length, decimals, lowercase, sign, conversion exit, value table) supported
- All data element properties (domain reference, field labels, type info, search help) supported

### Changed
- `CreateTable` handler now mirrors Eclipse ADT workflow: status check, `abapCheckRun`, lock cleanup, activation retry, and post-activation ident checks matching SAP behaviour.
- `BaseAbapConnection` merges session cookies across responses to keep SAP ADT sequences authenticated and clears them on reset.
- Added dedicated `jest.setup.js` to skip automatic MCP server bootstrap during Jest runs, eliminating TDZ errors in the test environment.
- Narrowed Jest `testMatch` patterns to `*.test.[tj]s` and removed legacy CLI scripts from the suite to prevent false negatives.
- Updated `tests/integration/handleGetFunction.int.test.js` to accept either JSON or plain-text payloads and perform case-insensitive source assertions.
- Translated legacy inline comments and documentation references to English for consistency with project guidelines.
- MCP protocol compliance: All handler responses now strictly follow the MCP protocol.
- Removed all `mimeType` and `data` fields from handler responses.
- For type `"text"` in `content`, only the `text` field is used.
- For type `"json"` in `content`, only the `json` field is used.
- Unified response format for all handlers: `{ isError, content: [{ type: "text", text: ... }] }` or `{ isError, content: [{ type: "json", json: ... }] }`.
- Fixed all MCP client errors related to invalid response format.
- Updated documentation and handler tables to reflect new response format.
- Added two new tools for batch ABAP object type detection:
  - DetectObjectTypeListArray: accepts array of objects via 'objects' parameter.
  - DetectObjectTypeListJson: accepts JSON payload with 'objects' array via 'payload' parameter.
- Added documentation for both tools: see [DetectObjectTypeListTools.md](docs/development/DetectObjectTypeListTools.md).
- Repository URL changed from `mario-andreschak/mcp-abap-adt` to `fr0ster/mcp-abap-adt`
- Added acknowledgment to original project in README.md
- **All Create handlers updated**:
  - `CreateDomain`, `CreateDataElement`, `CreateClass`, `CreateProgram`, `CreateInterface`
  - `CreateFunctionGroup`, `CreateTable`, `CreateStructure`, `CreateView`
  - All now validate transport_request based on package type ($TMP vs transportable)
  - `transport_request` parameter removed from `required` fields in tool schemas where applicable

### Removed
- **Deprecated Documentation Files**:
  - Removed `INSTALLATION_GUIDE_EN.md`, `INSTALLATION_GUIDE_UA.md`, `INSTALLATION_GUIDE_BY.md` (replaced by platform-specific guides)
  - Removed Smithery automatic installation instructions (not supported)
  - Removed Smithery badge from README.md
  - Removed all references to `@mario-andreschak/mcp-abap-adt` package

### Added
- New MCP tool: `DetectObjectTypeList`
  - Batch detection of ABAP object types by a list of names.
  - Input: `{ global: [{ name: string, type?: string }] }`
  - Output: `{ isError: boolean, content: Array<{ name, detectedType, description, shortText, longText, text, package, uri }> }`
  - Available via MCP API and web interface.
  - All comments and documentation in English.

### Changed
- All handler modules now use a unified in-memory caching mechanism via `objectsListCache`. This provides consistent, easily swappable cache logic across the codebase.
- The `filePath` parameter and all file write logic have been removed from all handlers. Handler results are now only cached in memory, not written to disk.
- This refactor improves maintainability, testability, and performance by eliminating redundant file operations and centralizing cache management.

## [1.4.0] - 2025-07-08

### Added
- All MCP handler functions now support an optional `filePath` parameter. If provided, the handler will save the result to the specified file path (any absolute or relative path, with any extension).
- All CLI test scripts now accept the `--filePath=...` argument to save the result to a file.
- The result written to file is exactly what is returned to the user (no extra formatting or caching).
- Improved error logging and debug output for file writing operations.
- Updated documentation and usage examples in README.md to reflect new file output support.
- Implemented utility `writeResultToFile` for safe file writing with directory restriction and logging.

## [1.3.0] - 2025-07-08

### Added
- Added integration test `tests/integration/handleGetFunction.int.test.js` for handleGetFunction.
- Significantly expanded integration test coverage in `src/index.test.ts` for all main tools (GetProgram, GetClass, GetFunctionGroup, GetFunction, GetTable, GetStructure, GetTableContents, GetPackage, GetInclude, GetTypeInfo, GetInterface, GetTransaction, GetEnhancements, GetSqlQuery, SearchObject).
- Added new checks for advanced scenarios (e.g., SQL generation, error handling, enhancement XML parsing).

### Changed
- Updated documentation regarding testing and integration scenarios.

## [1.2.0] - 2025-07-02

### Changed
- `GetWhereUsed` now supports any ADT object type (e.g. table/TABL, bdef/BDEF, etc.), not just class, program, include, function, interface, package.
- Updated documentation in README.md and jsdoc for supported object types and usage examples.

## [1.1.0] - 2025-02-19

### Added
- New `GetTransaction` tool to retrieve ABAP transaction details.
  - Allows fetching transaction details using the ADT endpoint `/sap/bc/adt/repository/informationsystem/objectproperties/values`.
  - Added documentation in README.md.

## [0.1.2] - 2025-02-18

### Changed
- Added Jest Test Script `index.test.ts` available through `npm test`
- Enhanced `makeAdtRequest` method to support:
  - Custom headers through an optional parameter
  - Query parameters through an optional `params` parameter
- Improved `handleGetPackage` method to use ADT's nodeContent API
  - Now uses POST request with proper XML payload
  - Added specific content type headers for nodeContent endpoint
  - Added filtering to return only objects with URI 
- Improved CSRF token handling in utils.ts
  - Added automatic CSRF token fetching for POST/PUT requests
  - Enhanced token extraction to work with error responses
  - Added cookie management for better session handling
  - Implemented singleton axios instance for consistent state
  - Added proper cleanup for test environments

## [0.1.1] - 2025-02-13

### Added
- New `GetInterface` tool to retrieve ABAP interface source code
  - Allows fetching source code of ABAP interfaces using the ADT endpoint `/sap/bc/adt/oo/interfaces/`
  - Similar functionality to GetClass but for interfaces
  - Added documentation in README.md

## [0.1.0] - Initial Release

### Added
- Initial release of the MCP ABAP ADT server
- Basic ABAP object retrieval functionality
- Support for programs, classes, function modules, and more
- Documentation and setup instructions

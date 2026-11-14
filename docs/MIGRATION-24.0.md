# Migrating to 24.0.0

24.0.0 lets the compiler check what it can ([#346](https://github.com/fr0ster/mcp-abap-adt/pull/346)):
a tool's arguments are a zod schema — their type and the one check of a call — and an entry carries
its call, typed by that schema. A client over MCP sees the tools as in 23.1.0, except the data tools, off unless enabled
("Callers of `GetSqlQuery`, `GetTableContents` and `HandlerGetData`", below), the two
arguments that become required (below) and the arguments some tools now declare because their
handlers read them. An embedder that defines, registers or calls tools in TypeScript changes its
code. Go through the section that fits how you use the server; the [CHANGELOG](../CHANGELOG.md) has
every item.

The packages are the eighteen of 23.1.x, all at **24.0.0**, every sibling range at `^24.0.0`. The
ADT dependencies move to `@mcp-abap-adt/adt-clients` 45.5, `@mcp-abap-adt/adt-strategies` 0.23 and
`@mcp-abap-adt/interfaces-adt` 27.4 (`@mcp-abap-adt/compact-modify` too): what that changes for a
caller is under "Creates, validations, checks and requests: what adt-clients 43 sends" and
"Callers of the activation tools: an activation SAP did not carry out is an error" below (44
adds `getBaseUrl()` answering `undefined`). The connection moves to `@mcp-abap-adt/connection` 25
("Embedders: `@mcp-abap-adt/connection` 25", below),
`@mcp-abap-adt/interfaces-auth-sap` 4, `@mcp-abap-adt/interfaces-adt-connection` 5 ("Embedders:
`IAbapConnection` 5", below) and the
optional `@mcp-abap-adt/sap-rfc-lite` 0.4, the
destination path to `@mcp-abap-adt/auth-broker` 5.1, `@mcp-abap-adt/auth-stores` 5.1 and
`@mcp-abap-adt/interfaces-auth-broker` 1.4: what that changes is under "RFC destinations: the
address is stated" below. `@types/express` 5 is a dependency of `@mcp-abap-adt/lib` and
`@mcp-abap-adt/server-runtime` now.
Connection 23 keeps the answer of a stateless request whose session SAP replaced, marked
`sessionLost`, where 22 rejected it `ADT_SESSION_REPLACED`: a tool call that reads in such a
session answers SAP's answer, and the next call logs on again as before (a stateful request
still rejects).
Connection 21 asks for the CSRF token once per endpoint, with no retry and no delay, so a
logon against a closed port fails at once; an embedder that calls `createConnection`, a
connector or `makeAdtRequest` changes nothing (a wire or subclass of its own: connection's
MIGRATION-21.0).
Connection 22, with sap-rfc-lite 0.4, reopens nothing over RFC: an error that ends the stateful
RFC conversation ends that connection's SAP session, the request fails `ADT_SESSION_REPLACED`
with the RFC SDK's error as fields (`IAdtError.rfc`, interfaces-adt 27.2), and every later request
on that connection fails `ADT_NOT_CONNECTED` with nothing sent; 0.3.x went on, silently, on a new
ABAP session without the old one's locks. An embedder that kept using a connection after such an
error creates a new connection instead (connection's MIGRATION-22.0).

## RFC destinations: the address is stated

An RFC destination states its own address, its client and its logon language.
No URL is part of it, and nothing about the RFC address is derived from one:
no host from `SAP_URL`, no system number from its port, no default client,
language or logon group.

**What an existing RFC destination changes** (its `.env`, the environment, the
CLI or YAML):

- remove `SAP_URL`; an RFC destination that states one is refused;
- add `SAP_ASHOST` — the host of the `SAP_URL` it had — and `SAP_SYSNR` — the
  two digits of its port (`80NN` → `NN`, so `:8000` is `00`), or the
  `SAP_SYSNR` it had in the process environment;
- add `SAP_CLIENT` if it relied on the client `000`, and `SAP_LANGUAGE` if it
  relied on `EN`: both are required over RFC;
- through a message server: `SAP_MSHOST` with `SAP_MSSERV` or `SAP_SYSID` (or
  both) and `SAP_GROUP` — add `SAP_GROUP` if it relied on `PUBLIC`;
- `SAP_SAPROUTER` goes with either address.

```env
SAP_ASHOST=your-application-server.example
SAP_SYSNR=00
SAP_CLIENT=100
SAP_LANGUAGE=EN
SAP_AUTH_TYPE=basic
SAP_USERNAME=<user>
SAP_PASSWORD=<password>
SAP_CONNECTION_TYPE=rfc
```

**An HTTP destination** that states an RFC address key (`SAP_ASHOST`,
`SAP_SYSNR`, `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`,
`SAP_SAPROUTER`) removes it: it is refused naming the key. `SAP_CLIENT` stays
an HTTP key.

**The keys and their precedence.** Each of `ashost`, `sysnr`, `mshost`,
`msserv`, `sysid`, `group`, `saprouter`, `client` and `language` is read from
every source in one order: the CLI (`--ashost`, …, `--client`, `--language`),
then the process's own environment (`SAP_ASHOST`, …), then the destination's
own `.env` (or a service key's fallback), then YAML (`ashost`, …). Values are
trimmed; a blank one is unset. The system number is read from the `.env` like
the rest of the address.

**The destination's `.env` no longer feeds the process environment** for the
client, the language or the address: only `SAP_CONNECTION_TYPE` and
`SAP_SYSTEM_TYPE` join it. The master language of created objects is the
destination's `SAP_LANGUAGE` in effect, not a process value the file set.

**The connection type is decided first**: a destination that states none is
refused before its settings are read.

**The refusals**, before any connection opens, each naming keys and never a
value; the first failing step answers, and a step names every faulty key:

1. HTTP stating an RFC address key — names each;
2. HTTP without a URL — names `SAP_URL` (or `XSUAA_MCP_URL`), as before;
3. RFC stating a URL — the destination's own `SAP_URL`, or `XSUAA_MCP_URL`
   for an XSUAA key; a service key's URL is not read over RFC, and the
   process environment's `SAP_URL` is never read;
4. RFC with keys of both addresses — names every stated key of both;
5. RFC with no address key;
6. an incomplete address — names what it lacks;
7. RFC without `SAP_CLIENT` or `SAP_LANGUAGE`;
8. ABAP Cloud over RFC — names `SAP_SYSTEM_TYPE`, `SAP_CONNECTION_TYPE`;
9. a client certificate over RFC — names `SAP_AUTH_TYPE`,
   `SAP_CONNECTION_TYPE` (`credentialFromSapConfig` refuses it too).

The HTTP and SSE binaries refuse `--ashost`, `--sysnr`, `--client`,
`--language` and their YAML keys, as they refuse the message-server options:
RFC is stdio only.

**Embedders.**

- `@mcp-abap-adt/interfaces-auth-sap` 4: `ISapConfig` (and `SapConfig`) is a
  union by `connectionType` — `ISapHttpConfig` (its `url`; absent
  `connectionType` is HTTP) or `ISapRfcConfig` (an application server or a
  message server, `client` and `language` required, no `url`). Narrow on
  `connectionType` before reading `url`; build a config inside the branch that
  narrowed it, as a literal of its shape, omitting a key that does not belong
  (never setting it to `undefined`), with no cast and no spread of the other
  shape.
- `@mcp-abap-adt/connection` 20: the RFC address is read as stated; no
  defaults.
- `IAbapConnection.getBaseUrl()` answers `string | undefined` (`undefined`
  over RFC).
- `BackgroundRunCaller` is `{ system, client, user }`. An injected connection
  that answers a URL is the system `["http", <URL>, ""]`; one that answers
  none takes `EmbeddableMcpServerOptions.system`, and without it background
  runs are refused (`background_runs_unavailable`).
- `GetServiceBindingPreviewUrl` over RFC answers its URLs as paths and query
  (a service URL the system answered absolute is kept), with
  `origin: 'unknown'` and a note to prefix the system's HTTP origin.
- `@mcp-abap-adt/lib/config`: `applyMessageServerFields`,
  `MESSAGE_SERVER_ENV`, `MESSAGE_SERVER_FIELDS`, `MessageServerField`,
  `rfcAddressRefusalOf` are gone; `DESTINATION_KEYS`, `DESTINATION_KEY_ENV`,
  `RFC_ADDRESS_KEYS`, `checkDestinationStatement`, `rfcConfigOf` and the
  refusal words are there.
- An embedder that reads configuration from outside the type system (an env
  file, the environment, YAML) validates it before it builds an `ISapConfig`;
  a typed `SapConfig` handed to the server is used as typed.

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

`handleGetTypeInfo`, `handleDescribeByList`, `handleGetObjectNodeFromCache`, `handleGetEnhancements`,
`handleGetEnhancementImpl`, `handleGetEnhancementSpot` and `handleGetIncludesList` took
`args: any`; each takes its schema's output or its declared interface now, as the other handlers
did. A tool's handler type is `Parameters<typeof handleX>[1]`.

**What you do:** a direct call with an argument the tool does not declare, or of another type, no
longer compiles — pass what the schema declares (the tool's listed schema, or its
`TOOL_DEFINITION.inputSchema`). Calling through the tool's entry (`entry.call`) parses the
arguments first.

## Embedders: a handler takes its schema's output

Every handler that `@mcp-abap-adt/lib/handlers`, `/handlers/read` and `/handlers/write` export
takes `z.output<typeof TOOL_DEFINITION.inputSchema>` — the arguments as the tool's schema parses
them — and `ScheduleProfilerTraceArgs` (`/handlers/write`) is that type. An optional field is
`?: T | undefined`, so passing `undefined` compiles. Two things no longer compile on a direct
call:

- a field the schema defaults is present in the output, so the call gives it
  (`CreatePackage`'s `package_type` and `detail`, `GetTableContents`' `detail`);
- a field the schema types as an enum takes one of its values where the hand-written type took
  any `string` (the check wrappers' `version`, the codes of `object_type`).

A handler no longer answers values its schema refuses: the fallbacks and re-checks for them are
gone (`GetObjectStructure`'s `object_type` / `object_name` fallback, `HandlerGet`'s unknown
parts, the `IncludesListArgs` widening). Through the tool's entry such a value is refused before
anything is sent.

**What you do:** an embedder that calls an exported handler with raw arguments (from a model, a
file, a request) parses them with the tool's schema first —
`TOOL_DEFINITION.inputSchema.parse(raw)` — or calls the tool's entry,
`defineTool(TOOL_DEFINITION, handleX).call(context, raw)`, which parses and refuses in the SDK's
words. A call with typed literals adds the defaulted fields and uses the enum values.

## Embedders: a handler answers a tool result

`HandlerEntry<R extends ToolResultLike = ToolResultLike>` and `defineTool`'s `R` are constrained
to `ToolResultLike` (`{ isError?: boolean; content?: ToolContentItem[] }`), new exports of
`@mcp-abap-adt/lib` and `/handlers`. `dispatchCompact` (`/compact-shared`), `handleCreateOnly`,
`handleUpdateUnderLock`, `handleDeleteOnly` (`/handlers/write`) and `handleDeletionCheck`
(`/handlers/read`) answer `Promise<ToolResultLike>` where they answered `Promise<unknown>`.

**What you do:** a handler of your own passed to `defineTool` answers a tool result; a caller of
those functions reads `isError` and `content` without narrowing.

## Embedders: optional fields read `?: T | undefined`

The server compiles with `exactOptionalPropertyTypes`. The exported contracts a caller fills
from a possibly absent value declare their optional fields `?: T | undefined`: `HandlerContext`,
`BatchAnswer`, `HandlerExporterOptions`, the `BaseMcpServer` options, `IServerConfig`, the
debugger's `BreakpointTarget`, `StopView`, `DebugStartOptions` and `PlaceReading`,
`IAdtSystemContext`, `AuthDisplayConfig`, `RequestContext`, `ResolvedSystemContext`,
`InstanceStateOptions`, and server-runtime's `CoreConfig`, `HttpConfig`,
`StreamableHttpServerOptions`, `SseConfig`, `SseServerOptions` and `DestinationFailureOptions`
(the CHANGELOG lists each field).

**What you do:** nothing — this widens. A caller that compiles with
`exactOptionalPropertyTypes` itself may now pass `undefined` where it had to leave a key out. An
embedder's own `DebugSessionPorts` / `AmdpSessionPorts` may add the optional `headersOf(origin)`
to have a debug session send the header pairs of its origin's system.

## Embedders: `AmdpSessionPorts` takes `dropConnection`

`AmdpSessionPorts` (`@mcp-abap-adt/lib/debugger`) has a required
`dropConnection(c: IAbapConnection): void`, as `DebugSessionPorts` already had. An AMDP stop
whose commands connection is spent (its SAP session gone) takes both connections out through it
instead of closing them: no AMDP request follows on either.

**What you do:** an embedder's own `AmdpSessionPorts` adds `dropConnection`, taking the
connection out of whatever holds it; it must send nothing for a session that ended. The shipped
ports (`src/lib/debugger/ports.ts`) end it with its one `disconnect()`, which sends a logoff only
for a session the connection still holds.

## Embedders: `IAbapConnection` 5

The server takes `@mcp-abap-adt/interfaces-adt-connection` 5 and `@mcp-abap-adt/connection` 24
(25 since this release's last step: next section).
`IAbapConnection.makeAdtRequest(options)` takes no type parameter and answers
`Promise<IAdtWireResponse>`, whose `data` is `unknown`. Every exported signature of the server
that names `IAbapConnection` names version 5's. Nothing changes at run time.

**What you do:**

- A call that passes type arguments — `connection.makeAdtRequest<string>(…)` — drops them and
  narrows `data` (`typeof data === 'string'`).
- A connection of your own that keeps a generic `makeAdtRequest<T, D>` still conforms, and so
  does one that answers `IAdtWireResponse` without type parameters; a wrapper that forwards a
  request no longer needs to assert the answer's type.
- connection 24 changes none of the types the server's signatures name from it (`SapConfig`,
  `SapHttpConfig`, `ILogger`, `CreatedConnection`); its own migration note is connection's
  MIGRATION-24.0.

## Embedders: `@mcp-abap-adt/connection` 25

The server takes `@mcp-abap-adt/connection` `^25.0.0`. No error the connection hands out, and
no line it logs, carries a thrown value's text or a request's config:

- **An RFC call's failure** is `RFC call to SADT_REST_RFC_ENDPOINT failed: <codeString>` (or
  `… failed: the SDK did not name the failure`), with `rfc` (`key`, `group`, `code`,
  `codeString`) and `code`. The NW RFC SDK's own text — the gateway's address, the time, the
  kernel's source module — is no longer in the message, so it no longer reaches a tool's answer.
- **An HTTP failure** is an `Error` with SAP's answer as `response` (`status`, `statusText`,
  `headers`, `data`), `status` and `code`; with no answer, `code` and the words
  `The request failed: <code>`. It has no `config`, `request`, `isAxiosError` or `cause`:
  `axios.isAxiosError(error)` and `instanceof AxiosError` are `false`.
- **`AuthRefusedError.cause`** is a `WireFailure` copy (`code`, `status`, `rfc`, `response`);
  `cause === original` no longer holds.

The server's `return_error` and `logErrorSafely` (`@mcp-abap-adt/lib/utils`) read SAP's answer,
a refused connection, a timeout and a DNS failure from such an `Error` by its `code` and
`response`, as they did from axios's error.

**What you do:**

- Code that read `config`, `request` or `isAxiosError` off a connection's error, or tested
  `instanceof AxiosError`, reads `code`, `status`, `response` and `rfc` instead.
- Code that compared `AuthRefusedError.cause` with the error it expected reads the copy's facts.
- connection's own migration note is its MIGRATION-25.0.

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

## Embedders: values the unknown audit found typed are typed

- `ConnectionContext.metadata` (`@mcp-abap-adt/lib`, `/embeddable`) is `Record<string, string>`.
  **What you do:** pass the metadata as strings (`String(value)` for a number or a flag).
- `Parameter.parse` (`/config`) and `parseStateIdleMinutes` (`/state`) take the configured value
  as `JsonValue`, checked once where the YAML was read. **What you do:** a parameter of your own
  reads a `JsonValue`; a YAML value is read as JSON writes it, so a timestamp (which YAML parses to
  a `Date`) reaches it as its ISO text (`"2026-11-14T07:00:00.000Z"`).
- `failurePayload` (`/auth`) answers a JSON object (`AnswerObject`), not `Record<string, unknown>`.
  **What you do:** read its members as JSON values.
- `/debugger`: `heldStateHandle` and `startedExtra` answer `DebugExtra` (string members);
  `debugAnswer` is `debugAnswer<T, P, F = T>(args, work, terse, full?, extraOf?,
  failureExtraOf?)`, `P` the terse answer's type and `F` the full one's, and `debugStateAnswer`
  takes its extras as `() => DebugExtra`. **What you do:** a call that named `debugAnswer<T>`
  names its terse type too (`debugAnswer<T, P>`), or lets both be inferred.

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

## Embedders: `@mcp-abap-adt/lib/utils` judges SAP's answers by key

**Removed: `isAlreadyCheckedError` and `safeCheckOperation`.** They searched an error's message
for "has been checked". SAP sends those words as a check run's status text — `processed`, a
success — and no error carries them, so there is no key to read them by. **What you use
instead:** the check run's answer: its status and its messages' types.

**Changed: `isAlreadyExistsError(error)` and `parseValidationResponse(response)`.** A taken name
is SAP's `exc:exception` carrying the T100 key `OO 002` (a class validation), `SWB_TOOL 016` (a
domain or table validation), `SADT_RESOURCE 001` (creating a class that exists) or `XI 001`
(creating a program that exists, `500` `ExceptionResourceCreationFailure`); it is recognised
in any logon language. Where SAP gives no key, the exception type decides: a keyless
`exc:exception` of type `ExceptionResourceAlreadyExists` counts (an inference: every answer measured
carries a key). The words "already
exists" under another key or type no longer count, and neither does that type under another key
(`PAK 058`, a package held by the session, is no taken name). `isAlreadyExistsError` reads the body of the error you pass
(`error.response.data`): a message string alone is no longer recognised. The DDL and function
group validations refuse a taken name with `SEVERITY` `ERROR` and a sentence, without a key:
`parseValidationResponse` answers `valid: false` with SAP's text, and states no `exists`.

**The rule:** SAP's answers and errors are judged by their T100 key (message class and number)
and message type; where SAP gives no key, by the structured verdict, its text relayed as it came.

## Embedders: a copy of `lib` registers its version and a label, not a path

`libInstances()` answers `LibInstance` = `LibCopy` (`{ version, label }`, from 24.0.0) | `EarlierLibCopy` (`{ file }`, a copy before 24.0.0); tell them apart with `'file' in entry`. The two-copies refusal names an earlier copy `a copy before 24.0.0`; an earlier copy's runtime prints `undefined` for a 24.0.0 entry and still refuses to start.

## Embedders: `ShutdownProcess` is `{ on, stdin?, stdout? }`

`ShutdownProcess` (`@mcp-abap-adt/lib/state`), which every `processLike` option takes, is now `{ on, stdin?, stdout? }`; an object that is structurally wider, `process` included, still fits.

## Embedders: `parseConfigArg()` reads the program arguments

`parseConfigArg()` (`@mcp-abap-adt/lib/config`) without an argument reads `process.argv.slice(2)`, no longer the executable and the script path; pass `argv` to read anything else.

## Callers of the checked deletes: the delete is sent once the check permits it

**Changed:** `DeleteBehaviorDefinition`, `DeleteBehaviorImplementation`, `DeleteCdsUnitTest`,
`DeleteClass`, `DeleteDataElement`, `DeleteDdl`, `DeleteDomain`, `DeleteFunctionGroup`,
`DeleteFunctionInclude`, `DeleteFunctionModule`, `DeleteInclude`, `DeleteInterface`,
`DeleteMessageClass`, `DeleteMetadataExtension`, `DeletePackage`, `DeleteProgram`,
`DeleteServiceBinding`, `DeleteServiceDefinition`, `DeleteStructure`, `DeleteTable` and
`DeleteTableType` run SAP's deletion check, then send the delete whenever the check permits it,
and answer the delete's document: `deleted`, `object` and SAP's message.

**What changes for you:**
- A permitted check whose message worded the object "does not exist" no longer ends the call. On
  premise SAP words existing function modules, function includes and inactive service
  definitions and bindings so; 23.x left them in place and answered success (`deleted: false`,
  `deletable: true`).
- An object already gone whose check still permits the delete (deleted earlier, its directory
  entry waiting on an open request) now gets SAP's answer to the delete: a refusal such as
  `SWB_TOOL 029` ("Error while deleting object … from the database"), or W "Release transport … to
  remove the object directory entry". 23.x answered it as a success, `deleted: false`.
- A delete's answer no longer carries `deletable`: read `deleted`. A refused check (an
  `isDeletable="false"`, or a typed `E` beside `isDeletable="true"`) is answered as the failure it
  is, with SAP's messages and their T100 keys, and nothing but the check is sent.

## Callers of the function-module tools: the function group is checked (#2)

**Changed:** every tool that addresses an existing function module through a function group reads
the module's metadata first and goes on only when the group the metadata names
(`adtcore:containerRef`) is the group given: `GetFunctionModule`, `UpdateFunctionModule`,
`ActivateFunctionModule`, `DeleteFunctionModule`, `CheckFunctionModule`,
`GetFunctionModuleVersions`, `GetObjectVersions` (`function_module`),
`RunFunctionModuleUnitTest` (runner `sync`, and runner `async` with `function_group_name`),
`ActivateObjects` (every `FUGR/FF` entry), `GetWhereUsed` (every `GROUP|FM_NAME`), and compact
`HandlerGet`, `HandlerUpdate`, `HandlerActivate`, `HandlerDelete`, `HandlerDeletionCheck`,
`HandlerCheckRun`, `HandlerLock`, `HandlerUnlock` and `HandlerWhereUsed` for `FUNCTION_MODULE`.
SAP ignores the group in a module's address, so 23.x read, locked, wrote, activated and deleted
the module whichever group the call named.

**What changes for you:**
- A group that does not hold the module is refused with `code: "FUNCTION_GROUP_MISMATCH"` and
  `step: "check function group"`; the message names the group SAP states. Nothing else is sent:
  call again with that group. A module that does not exist is SAP's refusal of the metadata read,
  as it came (`404`, T100 `FL 110`), at the same step.
- Each such call sends the metadata read before its own request: a compact call for a function
  module is two requests.
- These calls are no longer recorded in batch mode, because their request waits on the metadata
  answer: send them outside a batch. `GetFunctionModule` and `HandlerGet` with part `metadata`
  stay recordable (the read is the answer, checked locally); `docs/user-guide/BATCH_MODE.md` lists
  what is.
- `HandlerUnlock` through a group that does not hold the module is refused and the lock stays
  held: call it again with the module's group and the same `lock_handle`.

## Callers of `GetUnitTestResult` and the run tools: a run's status is read before any wait (#3)

**Changed:** `GetUnitTestResult` and the run tools that wait for their run (`RunAbapUnit`,
`RunUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest`,
`RunCdsUnitTest`, with `wait` true or left out) read the run's status first without long
polling, and long-poll only a run SAP answers `RUNNING`, again after each answer until SAP
answers otherwise. 23.x long-polled from the first read, so a run id SAP does not know held the
call for about 307 s before it answered `NOT_STARTED`.

**What changes for you:**
- A run id SAP does not know is answered at once: `{ success: true, run_id, status: "NOT_STARTED" }`.
- A run that is running is waited for until SAP answers it finished, however many long polls
  that takes; a long run under a client with a request time limit is still started with
  `wait: false` and read by its `run_id`.
- A status other than `RUNNING`, `FINISHED` and `NOT_STARTED`, or none, is an error at step
  `read status` whose message states the status document SAP sent. 23.x answered any status
  other than `FINISHED` as `{ success: true, run_id, status }`.
- Compact `HandlerUnitTestResult` and `HandlerCdsUnitTestResult` are unchanged: they read only
  the result.

## Callers of the lock tools: a lock_handle is checked on every transport (#4)

**Changed:** SAP releases the locking session's lock on an `UNLOCK` whatever handle it names, so
the server checks the handle. Every transport's instance now keeps the handles its own
`HandlerLock` issued — stdio's one instance and each SSE connection's instance, as each
Streamable HTTP instance did in 23.x — and sends a write, a delete or an unlock under a
`lock_handle` only under one of them. 23.x checked only on Streamable HTTP.

**What changes for you:**
- Compact `HandlerUnlock`, `HandlerUpdate` and `HandlerDelete` (the emptied includes) refuse a
  `lock_handle` the instance did not issue, sending nothing — an unknown handle and another
  instance's in the same words. Streamable HTTP: `lock_handle is not held by this instance: send
  the state_handle HandlerLock answered as the state_handle argument (or in the
  x-mcp-state-handle header)`. stdio and SSE: `lock_handle is not held by this instance: a lock
  handle works only in the server instance whose HandlerLock issued it`. Take the lock with
  `HandlerLock` on the same instance (stdio: the server; SSE: the same connection; Streamable
  HTTP: the `state_handle` the lock answered) and pass the handle it answered.
- A handle is released by its `HandlerUnlock`: a second unlock with it is refused. A
  `HandlerUnlock` refused for another reason (`FUNCTION_GROUP_MISMATCH`) keeps the handle; unlock
  again with the module's group and the same handle.
- **`lock_handle` is removed from `UpdateBehaviorDefinition` and `UpdateMetadataExtension`.** No
  tool of the full set issues a lock handle. Both lock, write and unlock themselves; drop the
  argument (a call that still sends it has it dropped: these tools are not strict, so the update
  takes its own lock and the handle is not used). To write under a lock you hold, use
  compact `HandlerLock` and `HandlerUpdate` (`BEHAVIOR_DEFINITION`, `METADATA_EXTENSION`) with
  the handle it answered.
- **SSE: the idle bound logs a lock's session off.** When the idle bound (`stateIdleMinutes`)
  ends the state of an SSE instance that holds a lock, its handle is let go and the instance's
  SAP session is logged off, which releases the lock; the next call logs on afresh. Lock again
  after a pause longer than the bound.
- `HandlerLock` answers the instance's `state_handle` on every transport; only Streamable HTTP
  routes by it.
- **Embedders:** every `BaseMcpServer` / `EmbeddableMcpServer` instance owns its held locks: the
  `heldLocks` option (`new HeldLocks()` from `@mcp-abap-adt/lib/state`), else one of its own. A
  host that makes an instance per request and keeps a lock across requests hands each request's
  instance the `HeldLocks` it keeps for that caller; with a new owner per request, the write and
  the unlock under a lock taken in an earlier request are refused. A handler group registered
  on a plain `McpServer` has no held locks: there `HandlerLock` is refused, sending nothing
  (`locks are not kept by this server instance: …`), and so is every call under a `lock_handle`.

## Callers of `SearchSource`: every source, hits only, complete masks, one run, no deadline

**Changed:** `SearchSource` scans every source-bearing object SAP lists, each source at the
call's `version`, each once per call; it resolves a package mask completely, reads every target
in one run, answers only the hits with counters of what it did, and skips what it cannot read.

**What changes for you:**
- **`object_types` is wider, and so is the default.** It takes `PROG` (programs and program
  includes), `FUGR`, `CLAS`, `INTF`, `DDLS`, `BDEF`, `DDLX` and `SRVD`; left out, all of them
  are scanned. A class is read with its four local includes, whose hits name them in `include`
  (`definitions`, `implementations`, `macros`, `testclasses`). For the 23.x scan, pass
  `object_types: ['PROG', 'FUGR', 'CLAS']` — program includes and local class includes are
  still read then.
- **`version` applies to every source**, a function group's includes and modules included
  (they were read active).
- **Function modules named `VIEW…` are scanned** (they were skipped by name).
- **A mask is `*` / `?`.** `*` stands for zero or more characters and `?` for one; `+`, `_`,
  `%` and `#` are characters of the name. An entry holding neither `*` nor `?` is an exact
  package name — so an entry with `+` is an exact name now: write `*` where `+` was meant as a
  wildcard. A mask answers every matching package (it was cut at 1000 without a word).
- **Only hits are answered.** Drop `emit_no_hits` (a call that still sends it has it dropped)
  and read the objects with hits from `results`: an object without a hit is no longer listed,
  and `no_hits` is gone.
- **The `failures` list is gone, both kinds.** A source or object that cannot be read, a mask
  search SAP refuses and a package whose root SAP refuses (`404` included) are skipped with no
  entry; a package that does not exist yields no hit (SAP answers it as an empty package). Below the root, a refused or missing type node or subpackage excludes only its
  branch: the package's other type nodes, subpackages and objects are walked and searched. A
  readable source of an object is still searched when another of its sources failed. A
  credential failure still ends the call.
- **What is skipped is SAP's answer** (DO22): a failure carrying a response with an HTTP status,
  whatever its `origin`, or an ADT refusal. A read that fails before SAP answers (an unreachable
  host, a network failure), a defect of the server, and a failed batch envelope end the call as
  an error, as a credential refusal does; the outer `404` of a batch envelope falls back to
  single requests.
- **The counters count only what was done.** `scanned.packages` is gone: no package is
  counted, since SAP answers a package that does not exist as an empty one — such a package
  yields no hit (DO26). `scanned.objects` counts the objects read (at least one source),
  `scanned.sources` the sources read (each once, however many objects name it), and the new `scanned.objects_with_hits` the objects with
  a hit in `results`.
- **No paging.** Drop `max_objects` and `start_at` (a call that still sends them has them
  dropped); `total_targets`, `next_start_at` and `truncated.by_max_objects` are gone. Every
  target is read in one run — run it in the background (the default) and read the
  `run_handle` with `GetBackgroundRun`, or end it with `DiscardBackgroundRun`.
- **A hit in a function module is the module's own object.** It names the module: `object_type`
  `FUGR/FF`, `object_name` the module, `function_group_name` its group, and no `include` — read
  it with `GetFunctionModule` (`function_module_name` = `object_name`, `function_group_name`),
  where 23.x answered it as the group's hit with the module in `include`. Each module is counted
  apart from its group, with its own `max_hits_per_object`.
- **A hit's `object_type` names its read tool** (DO27). A program include's hit is `PROG/I` —
  read it with `GetInclude` (`include_name` = `object_name`); a program's stays `PROG`
  (`GetProgram`). A function group's include is its own object: a hit in an include the group
  addresses under itself (or lists as `FUGR/I` without an address) is `FUGR/I`, `object_name`
  the include, `function_group_name` its group and no `include` — read it with
  `GetFunctionInclude` (`function_group_name`, `include_name` = `object_name`); a hit in an
  include the group lists under `/programs/includes/` is `PROG/I`. 23.x answered both as the
  group's hit (`FUGR`, the include in `include`). A group include is counted apart from its group
  in `scanned.objects` / `scanned.objects_with_hits`, with its own `max_hits_per_object`
  allowance and capped flag (it shared the group's). `object_types: ['PROG']` and `['FUGR']`
  select as before.
- **A program include is one object, however many function groups list it** (DO28). An
  include two groups list under `/programs/includes/`, or one a group lists and its package
  also holds as its own `PROG/I`, is answered and counted once: its hits once in `results`,
  once in `scanned.objects` / `scanned.objects_with_hits`, one `max_hits_per_object` allowance
  and capped flag; the first listing in the scan order (the packages', then the group's
  members') answers, with its `devclass`. A later listing adds nothing, and takes no room of
  `max_hits`.
- **New, nothing to do:** without them the answer is the hits with lines and snippets. To keep a
  large answer small, pass `answer: 'objects'` (one entry per object and include with its number
  of hits) or `'lines'` (no snippets), `max_hits` (the scan stops once the answer holds that many;
  `truncated.by_max_hits` says anything was left), or `max_hits_per_object`.
- **`max_hits_per_object` limits each object only when given** (it was 100 by default).
  `truncated.by_object_cap` is set when a given limit cut an object's hits.
- **`time_budget_ms` and `timeout` are removed.** No deadline of the server's ends a scan;
  `truncated.by_timeout` is gone. To bound a call in time, run it in the background and end it
  with `DiscardBackgroundRun`, which is what ends a background run: it logs off the run's ABAP
  session. `SearchSource` runs as every long
  tool runs: on an ABAP session of its own, in the background by default — see "Callers of the
  long tools" below.
- **Embedders of the server: `SearchSource`'s strategies are options.**
  `EmbeddableMcpServer` and `HandlerExporter` take `sapAnswerStrategy` and
  `lineMatchStrategy`, optional; without them the search behaves as shipped
  (`skipSapAnswers`, `substringLineMatch`, exported from
  `@mcp-abap-adt/lib/embeddable` with the contracts). Only SAP answers reach the
  SAP-answer strategy; a credential refusal ends the call and a failure with no
  SAP answer is an error, whatever the strategy. Pass them as options — a
  context you build is no way in. On `createRegistry()` the hosting server's
  options apply.
- **Embedders of `runSearchSource` / `runSearchSourceWithContext` pass both strategies:**
  `OrchestratorDeps.lineMatch` and `OrchestratorDeps.sapAnswers`, and the third argument of
  `runSearchSourceWithContext`, `{ lineMatch, sapAnswers }`. The shipped `substringLineMatch`
  keeps the match as it was; the shipped `skipSapAnswers` skips every SAP answer. A
  `PackageContentsFetcher` answers `{ items, walked }` (the packages whose own level was read)
  where it answered the items alone.

## Callers of the long tools: background by default, no timeout

**Changed, breaking:** until 23.x a call to a long tool answered its result directly. From
24.0.0 a call **without** `background` answers a `run_handle` at once, and the result is read with
`GetBackgroundRun` (compact `HandlerBackgroundRunGet`). A caller that wants the result in the call
passes `background: false`. `timeout` and `time_budget_ms` are gone. A running read is ended with
`DiscardBackgroundRun` (compact `HandlerBackgroundRunDiscard`). The code-running tools'
`background` (`RuntimeRunClass`, `RuntimeRunProgram`, `HandlerProfileRun`) is unchanged: no
default, without it the call waits.

The long tools: `GetWhereUsed`, `SearchObject`, `SearchSource`, `GetPackageContents`, `GetPackageTree`, `GetObjectsList`, `GetStructuresList`, `GetIncludesList`, `RuntimeListFeeds`, `ListTransports`, `GetSqlQuery`, `GetTableContents`, `GetObjectInfo`, `DescribeByList`, `GetATCFindings`, `ListATCResults`, `GetATCResult`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`; compact `HandlerWhereUsed`, `HandlerSearch`, `HandlerDumpList`, `HandlerGetData`, `HandlerProfileView`, `HandlerGet` (`tools/long-handlers.json`). Each runs on an ABAP session of
its own, logged off after SAP's answer.

**What changes for you:**
- **Read the `run_handle`.** The start answers `{ run_handle, state: 'running', tool, object,
  started_at, message }`. `GetBackgroundRun { run_handle }` answers `running`; `finished` and,
  after its header, what the tool would have answered in the call; or `cancelled`.
  `ListBackgroundRuns` lists your runs with that state.
- **A read is answered once.** Once Get answers a finished or cancelled read, that read is gone:
  a Get response lost on the way cannot be recovered, `ListBackgroundRuns` no longer shows it,
  and the read must be started again. A second Get answers "not available". A code run's answer
  is kept until `DiscardBackgroundRun`, as before.
- **Cancel a running read with `DiscardBackgroundRun`.** It answers `{ run_handle, state:
  'cancelled' }`: the read's session is logged off, SAP ends the read, nothing was changed, and
  the run reads `cancelled` until Get answers it. On a finished run it removes the answer, as
  before; on a running code run it is refused, as before. An unknown handle and someone else's
  answer alike, "not available". A server's instances share the owner of the running runs, so
  over Streamable HTTP a discard sent in a later request cancels the read.
- **Drop `timeout`.** No long tool takes it, and nothing answers `timed_out`.
- **`HandlerGet`'s run-reading parts** (`UNIT_TEST` / `CDS_UNIT_TEST`, `activation_status`,
  `activation_results`) are read in the call on the instance's connection, as before; a
  `background` on them is refused before anything is sent.
- **Batch mode** records a long read without `background`; `background: true` there is refused
  `batch_no_background` (the refusal was `batch_no_timeout`).
- **The 16 runs per caller** count reads too; a read that was answered no longer counts.
- **Every binary serves background runs, the `-ro` ones included** (`GetBackgroundRun`,
  `ListBackgroundRuns`, `DiscardBackgroundRun`; compact `HandlerBackgroundRunGet`, `…List`,
  `…Discard`): a long tool only reads, so a `-ro` binary's runs are reads alone, and its
  discard cancels or removes reads only. The `-ro` tool counts grow by three.
- **A server without background runs** — an embedder without `backgroundRuns`, or one that serves
  no tool reading the runs — lists a long tool without `background` and answers it in the call.

## Embedders: `IBackgroundRuns` knows `cancelled`; a long tool runs synchronously without a strategy

- **`BackgroundRunAnswer.cancelled?: true`** and the state `'cancelled'`
  (`BackgroundRunState`, in `BackgroundRunListing['state']` and `BackgroundRunRecord['state']`).
  A custom strategy keeps the answer `finish` gives it, as before, and answers
  `state: 'cancelled'` for a kept answer with `cancelled: true`; nothing else changes for it, and
  no method is added. `@mcp-abap-adt/background-runs-memory` does so.
- **`finish` is called once per run:** for a cancelled read with the cancelled answer, right after
  its session was logged off; the read's own end that comes later is dropped.
- **`discard` follows a read's Get:** the library calls the strategy's `discard` right after `get`
  answered a read run's finished or cancelled answer. A code run's answer is kept until
  `DiscardBackgroundRun`.
- **The owner of the running runs** (`BackgroundRunOwner`, from `@mcp-abap-adt/lib/embeddable`)
  holds each running run's control, by `run_handle`. An instance creates its own; a host that
  serves one client through several instances (one per request, one per stream) creates one and
  hands it to every instance (`backgroundRunOwner`), as the HTTP and SSE servers do, so a discard
  reaching any of them cancels a running read. Without it, a discard reaching an instance that
  did not start the read is refused while the read runs.
- **With no strategy** (`backgroundRuns` not given), or without the tool that reads its runs
  among the instance's tools (`GetBackgroundRun`; compact `HandlerBackgroundRunGet`), a long tool
  is listed without `background` and runs synchronously, as with `background: false`; a code run's
  `background: true` is refused, as before. `HandlerExporter` (every path: `getHandlerEntries()`,
  `createRegistry()`, `registerOnServer`) and a group registered on its own `McpServer` keep no
  background runs: they hand out the long tools without `background`, as they hand out the run
  tools. To serve long reads in the background, register the groups on a server instance with a
  strategy and the background-run tools (`BackgroundRunHandlersGroup`), as the binaries do.
- **A set with a long tool serves the background-run tools — given a strategy.** A server
  instance (`BaseMcpServer`, `EmbeddableMcpServer`) given `backgroundRuns` serves
  `GetBackgroundRun`, `ListBackgroundRuns` and `DiscardBackgroundRun` beside any full long tool its
  registry carries, and compact's `HandlerBackgroundRunGet`, `…List`, `…Discard` beside any compact
  one — whatever the registry or exposition (`readonly`, `search`, `debug`, a group of your own),
  added when the registry does not carry them. Its long tools then list `background` and run in
  the background, as in the binaries. **Without a strategy no background-run tool is listed** —
  also when the registry carries them (`registryForExposition(['high'])`, before 24.0.0 listed
  and answering `background_runs_unavailable`) — and a plain registration on your own `McpServer`
  lists none either; the long tools answer in the call.
- **Removed from `@mcp-abap-adt/lib`'s modules:** `TIMEOUT_FIELD`, `timeoutField`,
  `TIMEOUT_DESCRIPTION`, `timedOutAnswer`, `timedOutWords`, `TimedOutAnswer`, `readTimeout`,
  `withoutTimeout`, `TIMEOUT_INVALID_WORDS`, `TIMEOUT_NOT_FOR_RUN_WORDS`, `MAX_TIMEOUT_SECONDS`,
  `BATCH_NO_TIMEOUT_WORDS`; `runLongCall` takes no `timeoutSeconds`. `LONG_TOOL_ADVICE` has new
  words. A tool of your own that declared `timeout: TIMEOUT_FIELD` declares
  `background: LONG_BACKGROUND_FIELD` (compact: `COMPACT_LONG_BACKGROUND_FIELD`), if it is a listed
  long tool.

## Callers of `CreateDomain`: `package_name` is required

`CreateDomain`'s schema requires `package_name` ("Package the domain is created in."); 23.x listed
it optional while its handler refused every call without it ("Package name is required"). A call
without it is refused by the schema now, naming the argument, and nothing is sent.

**What you do:** nothing for a call that worked — it passed `package_name`.

## Callers of the DDIC metadata writes: the description as given, a refused patch as the step's failure

The domain, data element, table type, function group, package and message class writes
(`CreateDomain`, `UpdateDomain`, `UpdateDomainLow`, `CreateDataElement`, `UpdateDataElement`,
`UpdateDataElementLow`, `CreateTableType`, `UpdateTableType`, `UpdateFunctionGroup`,
`UpdatePackage`, `UpdatePackageLow`, `UpdateMessageClass`, and compact `HandlerCreate` /
`HandlerUpdate` for those types) have the object's document patched by
`@mcp-abap-adt/adt-clients` 45.2.0.

- **The description is sent as given.** 23.x cut it at 60 characters (40 for a function group).
  SAP refuses a longer one with `400` (`SWB_TOOL/018` for a domain, data element, table type or
  package; `FUNC_ADT/103` for a function group) and stores nothing; a message class stores the
  first 60 characters.
- **A read that cannot be patched** (an empty or broken read, another type's document, a field
  with no place in the document) is answered `isError` with `step: "patch"` and
  `code: "DOCUMENT_NOT_PATCHED"`, its words naming the field; nothing is written.
- **`UpdateDomainLow` / `UpdateDataElementLow` `properties`:** a length or a count is a number or
  its digits, a flag a boolean or `true` / `false`; anything else is left out.
  `UpdateDataElementLow` refuses a `type_kind` other than `domain`, `predefinedAbapType`,
  `refToPredefinedAbapType`, `refToDictionaryType` and `refToClifType`.

**What you do:** keep a description within SAP's limit (60, 40 for a function group), or read
SAP's refusal; on `DOCUMENT_NOT_PATCHED`, read the object again and repeat the call.

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
  offers for logon (measured on an on-premise system): `RU`, which it offers, was taken, and a
  program created with `RU` was created in `RU`; `DE` and `ES` fell back to `EN` over HTTP
  without a refusal, and the object got `EN` (a GUI logon in `ES` is refused as not an installed
  language).
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

## Callers of the activation tools: an activation SAP did not carry out is an error

SAP_BASIS 751 answers an activation sent with `preauditRequested=true` with the objects still
inactive (`ioc:inactiveObjects`) and activates nothing; S/4HANA 2025 answers a checklist saying no
activation ran, with no message, both when there was nothing to do and when objects stayed
inactive (both measured, [#351](https://github.com/fr0ster/mcp-abap-adt/issues/351)). 23.x answered
the first as a success with `activation_not_stated: true` and the second as `nothing_to_activate`;
a group activation on the activation runs answered a run whose results carry an error-severity
message as a success with `activated: false`.

| 23.x answered | 24.0 answers |
|---|---|
| success, `activation_not_stated: true`, `objects` | `isError`, `still_inactive: [{ name, type, uri, parent_uri? }]` |
| success, `nothing_to_activate: true`, objects still inactive | `isError`, `still_inactive` (the inactive list is read once after such an answer) |
| success, `nothing_to_activate: true`, nothing left inactive | the same |
| a run whose results carry an error-severity message: success, `activated: false`, the refusal in `message` (`ActivateObjects`, `ActivateObjectLow`) | `isError`, `origin: "refusal"`, `message` naming each refused object, `messages: [{ type, text, objectName }]` |

This holds for every tool that activates: the `Activate*` tools, `ActivateObjects`,
`ActivateObjectLow`, compact `HandlerActivate`, and every create or update with an activate step.

- **What you do:** read `isError`, then `still_inactive` or `messages`. To activate what is listed, send the
  objects again with `preaudit: false` (`ActivateObjects`, `ActivateObjectLow`, `HandlerActivate`);
  one object of a type with a family now takes `preaudit` as given, where it always sent
  `preauditRequested=true`.
- **A group activation reads discovery first.** `ActivateObjects` and `ActivateObjectLow` with more
  than one object, or one of a type with no family, send `GET /sap/bc/adt/discovery` before the
  activation: the activation runs where the system offers them, else one
  `POST /sap/bc/adt/activation` for all the objects. A discovery that cannot be read is an error at
  step `discovery`, with nothing activated. A run whose results say no activation ran and give no
  message is followed by one `GET /sap/bc/adt/activation/inactiveobjects`: the run's objects still
  listed are the error above; a read that fails is an error at step `inactiveObjects`.
- **Compact `HandlerActivate` is one request and reads no discovery.** Its group form always sends
  `POST /sap/bc/adt/activation/runs`. On a system whose discovery offers no activation runs
  (SAP_BASIS 751, 7.40), it answers SAP's refusal; a group activation there is `ActivateObjects` (the
  full set) or `ActivateObjectLow` (the low handlers group).

## Callers of `GetAbapAST`, `GetAbapSemanticAnalysis` and `GetAbapSystemSymbols`: removed

The three tools parsed ABAP in this process with regular expressions; SAP states an object's
structure itself, so they are removed, with their handlers (`handleGetAbapAST`,
`handleGetAbapSemanticAnalysis`, `handleGetAbapSystemSymbols`). Read what SAP states instead:

| Removed | Use |
| --- | --- |
| `GetAbapAST`, `GetAbapSemanticAnalysis` | `GetObjectOutline` for the structure — the components of a class, an interface, a function group or (on premise) a program, each with its kind, visibility and level, and for a class or an interface the lines and columns it occupies — plus the source reads (`GetClass`, `GetInterface`, `GetProgram`, …) for the text |
| `GetAbapSystemSymbols` | `GetObjectOutline` for what an object defines, `GetWhereUsed` for what uses it |

Each takes an object in the system, not a piece of code: save the code first, then read it. SAP
states no signature in the outline; a method's signature is the source its definition block spans,
and the source reads answer just those lines with `start_line` and `end_line`:

```json
{ "object_type": "CLAS/OC", "object_name": "ZCL_ORDERS" }
```

answered with each method's `definitionBlock` link, e.g. `start: { line: 12, column: 4 }`,
`end: { line: 16, column: 32 }`; then

```json
{ "class_name": "ZCL_ORDERS", "start_line": 12, "end_line": 16 }
```

to `GetClass` answers those five lines. A local component's links point into the class's local
includes, read with `GetLocalDefinitions` / `GetLocalTypes` the same way. A line range is new on
`GetClass`, `GetInterface`, `GetProgram`, `GetInclude`, `GetFunctionModule`, `GetFunctionInclude`,
`GetDdl`, `GetMetadataExtension`, `GetBehaviorDefinition`, `GetBehaviorImplementation`,
`GetServiceDefinition`, `GetStructure`, `GetTable`, `GetLocalDefinitions`, `GetLocalTypes`,
`GetLocalMacros` and `GetLocalTestClass`; a call without one answers the whole source as before.

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
| `ActivateFunctionModuleLow` | `HandlerActivate` (objects) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. The module's metadata is read first, and the run starts only when the function group the metadata names is the group given (#2). |
| `ActivateInterfaceLow` | `HandlerActivate` (object_type: INTERFACE, object_name) | the same requests |
| `ActivateMetadataExtensionLow` | `HandlerActivate` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `ActivateObjectLow` | `HandlerActivate` (objects, preaudit) | **accepted:** 24.0.0 (#351): the low tool reads the system's discovery first (GET /sap/bc/adt/discovery) and starts the activation run (POST /sap/bc/adt/activation/runs) only where the discovery offers it, else sends one POST /sap/bc/adt/activation for the objects; compact HandlerActivate reads no discovery and always sends POST /sap/bc/adt/activation/runs. |
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
| `CheckFunctionModuleLow` | `HandlerCheckRun` (object_type: FUNCTION_MODULE, object_name, version) | **accepted:** The compact call reads the module's metadata first (GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}?version=workingArea) and sends the low tool's requests only when the function group the metadata names is the group given (#2): SAP ignores the group of a module's address. The lifecycle tools name a function module GROUP\|MODULE in object_name. |
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
| `DeleteFunctionModuleLow` | `HandlerDelete` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, transport_request) | **accepted:** The compact call reads the module's metadata first (GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}?version=workingArea) and sends the low tool's requests only when the function group the metadata names is the group given (#2): SAP ignores the group of a module's address. |
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
| `LockFunctionModuleLow` | `HandlerLock` (object_type: FUNCTION_MODULE, object_name) | **accepted:** The compact call reads the module's metadata first (GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}?version=workingArea) and sends the low tool's requests only when the function group the metadata names is the group given (#2): SAP ignores the group of a module's address. The lifecycle tools name a function module GROUP\|MODULE in object_name. |
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
| `UnlockFunctionModuleLow` | `HandlerUnlock` (object_type: FUNCTION_MODULE, object_name, lock_handle) | **accepted:** The compact call reads the module's metadata first (GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}?version=workingArea) and sends the low tool's requests only when the function group the metadata names is the group given (#2): SAP ignores the group of a module's address. The lifecycle tools name a function module GROUP\|MODULE in object_name. |
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
| `UpdateFunctionModuleLow` | `HandlerUpdate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, source_code, lock_handle, transport_request) | **accepted:** The compact call reads the module's metadata first (GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}?version=workingArea) and sends the low tool's requests only when the function group the metadata names is the group given (#2): SAP ignores the group of a module's address. |
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

## Callers of `GetSqlQuery`, `GetTableContents` and `HandlerGetData`: off unless enabled

The data tools — `GetSqlQuery`, `GetTableContents` and the compact `HandlerGetData` — are off by
default in every binary (full, `-ro`, compact, compact `-ro`; stdio, Streamable HTTP and SSE) and
for embedders. SAP's API Policy FAQ v1.3 (June 2026), Q33 — informational and non-binding
([PDF](https://d.dam.sap.com/x/UL9AiqH/SAP_API_Policy_FAQ_v1.3_June.pdf)) — says ADT APIs are not intended for reading application tables, exporting
business data or running SQL against SAP systems. Whether to enable them is the customer's
decision.

What a consumer that used one of them does now:

- **Start the binary with the flag**, in any form: `--enable-data-tools`,
  `MCP_ENABLE_DATA_TOOLS=true`, or `enable-data-tools: true` in the `--conf` file. The CLI wins over
  the environment, which wins over the file; `false` in a higher form turns them off again. A value
  other than empty, null, `true` or `false` stops the start; an empty value or YAML null counts as
  not given, as for every parameter, and the next form decides. A destination's `.env` does not
  turn it on.
- **On Streamable HTTP and SSE** it is a start parameter of the server: set it where the server is
  started (a container's `-e MCP_ENABLE_DATA_TOOLS=true`, for instance). No request header turns it
  on.
- **A client of a server started without it** does not see the tools in `tools/list`, and a call of
  one is answered as an unknown tool (`Tool GetSqlQuery not found`, an `isError` answer).
- **Embedders:** `EmbeddableMcpServer` lists them only with `exposition: [..., 'data']` (the default
  `['readonly', 'high']` leaves them out); `HandlerExporter` hands them out only with
  `includeData: true`. `ReadOnlyHandlersGroup` no longer serves `GetTableContents`,
  `SystemHandlersGroup` no longer serves `GetSqlQuery`: both are `DataHandlersGroup`'s.
  `CompactReadOnlyHandlersGroup` and `compactReadOnlyEntries` no longer serve `HandlerGetData`: it is
  `CompactDataHandlersGroup`'s and `compactDataEntries`'s (`@mcp-abap-adt/compact-readonly-entries`).
  `ToolSet.groups(context, transport, served)`, `registryOf(toolSet, transport, served)` and
  `streamableHttpSurface(toolSet, served)` take a required `ServedTools` (`{ dataTools: boolean }`);
  `CompactHalves` gains `data` and `compactReadOnlyToolSetOf` takes `{ readOnly, data }`.

The handlers themselves (`handleGetSqlQuery`, `handleGetTableContents`) and their definitions
(`READ_DEFINITIONS`) are exported as before.

## New, optional: access restrictions and the draft tool

Nothing a consumer of 23.x must change. Every binary takes five optional start-time rows —
`--deny-actions`, `--allowed-packages`, `--allowed-requests`, `--denied-tables`,
`--allowed-tables` (each also an `MCP_*` variable and a `restrictions.*` key) — and an embedder
may give `accessChecks` (`BaseMcpServer`, `EmbeddableMcpServer`, `HandlerExporter`) and
`deniedActions` (`HandlerExporter`). With none of them configured nothing changes: every tool,
answer and listed schema is as without them. The one addition every binary lists is the read
`GetObjectDraft` (compact: `HandlerGet` `part: 'draft'`); a `HandlerGet` refusal of a part now
names `draft` among the parts a type offers. See
[Access restrictions](user-guide/ACCESS_RESTRICTIONS.md).

## Contributors: `test-config.yaml` carries no time key

The live tests no longer read a bound, a delay or a poll limit from `tests/test-config.yaml`.
Delete these keys from your copy; nothing reads them, and the template no longer lists them:

- `test_settings.timeout`, `test_settings.timeouts.*` (`default`, `long`, `create`, `test`,
  `delay`), `test_settings.retry_on_failure`, `test_settings.max_retries`;
- `test_settings.operation_delays.*` and every case's `params.operation_delays.*`;
- the `run_atc` case's `poll_interval_ms` and `poll_timeout_ms`;
- the runtime case's `trace_read_retries` and `trace_read_retry_delay_ms`.

A test helper of your own that called `getTimeout` or `getOperationDelay`
(`src/__tests__/integration/helpers/configHelpers.ts`) goes on the answer it waits for instead. A
live run that waits for ever is ended with Ctrl-C: once lets the running case and its cleanup
finish, twice stops the run (`src/__tests__/integration/README.md`, "Interrupting a run").

## Contributors: the test destination is `environment.env`'s name

`auth_broker.abap.destination` in `tests/test-config.yaml` is no longer read, and the template
no longer lists it. The test destination — the auth broker's, which the live coverage suites
and the live run's setup log on with, on premise and on the cloud alike — is the name of the
session file `environment.env` names, without `.env`: `env: "your-system.env"` is the
destination `your-system`, read from `sessions/your-system.env` (and, for a cloud destination,
`service-keys/your-system.json`) under `auth_broker.paths.service_keys_dir`. A copy whose
`environment.env` and `auth_broker.abap.destination` named the same session (`"your-system.env"`
and `"your-system"`) changes nothing; delete the field. A copy that named a destination there and no
`environment.env` sets `environment.env` to that destination's session file name instead. An
`environment.env` that is a path outside that sessions folder names no destination: the suites
that need one are refused, naming it.

## Contributors: the test scripts

The tests are moving from Jest to `node:test` (a first wave in 24.0.0; the rest stay on Jest
for now). What a contributor on 23.x runs differently:

- `npm test` runs both runners, Jest then `node:test`, and reaches no SAP system and no outside
  service. It passes the runner's concurrency itself (`2`); another value is
  `npm test -- --concurrency <N>`.
- A live suite runs only under a live script, one file at a time, a file named by its source
  path: `npm run test:integration -- src/__tests__/integration/high/class/ClassHighHandlers.test.ts`
  instead of `npm test -- --testPathPatterns=integration/high/class`. `test:high`,
  `test:coverage-family`, `test:live-connection` and `shared:setup` / `shared:teardown` /
  `shared:check` keep their names; their Jest flags (`--runInBand`, `--forceExit`,
  `--testPathPatterns`, the coverage reporter) are gone.
- The install suites (`installMatrix`, `binSmoke`) run with `npm run test:install`, the vector
  retrieval suite with `npm run test:retrieval`; `SKIP_INSTALL_MATRIX` belongs to the former.
- `build:test-reporter` and `check:test-reporter` are removed: the coverage ledger reads
  `node:test`'s outcomes through its own reporter.
- A variable for a run, on every platform: `npm run <script> -- --env NAME=VALUE <file>`.

## Contributors: the test config is parsed, the testers take typed parameters

`tests/test-config.yaml` (or the file `MCP_TEST_CONFIG` names) is read through a zod schema
(`src/__tests__/integration/helpers/testConfigSchema.ts`): every object is loose, so a key the
harness does not read is kept, a key written with no value reads as absent, and a value of the
wrong type for a key the harness reads is refused at load, naming the file and the key's path. A
test reads its case's `params` through a schema of what it reads (`readCaseParams`), and a
`HighTester` drives the tools' entries (`defineTool(TOOL_DEFINITION, handleX)`), so its
arguments go through the tool's schema as a model's call does.

**What you do:** if a run is refused with `… is not a test config: <path>: …`, fix the value at
that path in your copy (the template states each key's type). A new live test reads its params
with `readCaseParams(context.params, Schema, '<case>')` and passes entries, not bare handlers,
to `HighTester`.

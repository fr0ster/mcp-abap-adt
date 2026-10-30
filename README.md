# <img src="logo.png" alt="mcp-abap-adt logo" width="36" align="absmiddle" /> mcp-abap-adt: Your Gateway to ABAP Development Tools (ADT)
[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://stand-with-ukraine.pp.ua)

`mcp-abap-adt` is an MCP server for ABAP ADT in SAP ECC/S/4HANA (on-premise) and SAP BTP ABAP Cloud systems. It gives agents controlled access to real ABAP repositories through ADT, so analysis and changes are grounded in system data instead of assumptions. It is built for AI-assisted pair programming (AIPNV: AI Pairing, Not Vibing), not autopilot vibe coding.

**Primary workflows:**
- **Deep ABAP analysis**: where-used, object metadata, repository navigation, object structure, semantic analysis, dependency and impact exploration.
- **High-level ABAP development**: rapid CRUD and iterative updates for RAP and classic ABAP artifacts (classes, interfaces, function groups/modules, programs, DDIC, CDS/view/service artifacts), validated through ADT flows.

**Why teams use it:**
- **Full CRUD** (not read-only): create, read, update, and delete ABAP artifacts
- Works with **On-Premise (ECC/S/4HANA)** and **ABAP Cloud (BTP)** systems
- Legacy systems (BASIS < 7.50) are **not supported at present**: that support is parked on the `parked/legacy-support` branch until it can be tried against a live legacy system
- Three authentications over stdio: **basic** (HTTP or RFC), **SNC** (passwordless, RFC), **JWT with browser login** (service key, ABAP or XSUAA); a **JWT you already hold** goes in the `x-sap-jwt-token` header of `mcp-abap-adt-http` / `mcp-abap-adt-sse`
- Multiple transports: **stdio**, **HTTP**, **SSE**
- Several installation variants: the **full** server (`@mcp-abap-adt/core`) or the **compact** one (`@mcp-abap-adt/compact`), each connecting to the system over **HTTP**, **RFC** or **SNC** — see [Installation variants](docs/installation/INSTALLATION.md#installation-variants)
- Rich tool surface for ABAP objects, metadata, transports, and search

**Authorization & Destinations (Important):** A *destination* is the filename of a service key stored locally. You place service keys in the service-keys directory, and use `--mcp=<destination>` to select which one to use. This is the primary auth model for on‑prem and BTP systems. See [Authentication & Destinations](docs/user-guide/AUTHENTICATION.md).

You can configure MCP clients either manually (JSON/TOML) or via the configurator CLI (`@mcp-abap-adt/configurator`, repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf)).

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Use Cases](#use-cases)
5. [Target Users](#target-users)
6. [Capabilities (High-Level Focus)](#capabilities-high-level-focus)
7. [Terminology](#terminology)
8. [Authorization & Destinations](#authorization--destinations)
9. [Registries](#registries)
10. [Features](#features)
11. [Documentation](#documentation)
12. [Dependencies](#dependencies)
13. [Running the Server](#running-the-server)

## Getting Started

Pick a variant first — full or compact server, and HTTP, RFC or SNC to the system. HTTP needs nothing but Node.js 22 or 24; **RFC and SNC need the SAP NW RFC library when the server runs** — SAP GUI's 64-bit `sapnwrfc.dll` on Windows, else the SAP NW RFC SDK; the RFC module comes prebuilt for Linux x64 (glibc), Windows x64 and macOS ARM64, and `npm install` compiles nothing. [Installation variants](docs/installation/INSTALLATION.md#installation-variants) has the table and the commands; [RFC Setup](docs/installation/RFC_SETUP.md) the steps. To run without Node.js on a machine, build your own [portable executable](docs/installation/PORTABLE.md) — Node.js and your SAP NW RFC SDK inside.

Install the server and configure your client using the configurator:

```bash
npm install -g @mcp-abap-adt/core
npm install -g @mcp-abap-adt/configurator

# stdio (destination)
mcp-conf --client cline --name abap --mcp TRIAL

# HTTP (streamable HTTP)
mcp-conf --client copilot --name abap --transport http --url http://localhost:3000/mcp/stream/http
```

Full configurator usage (separate repo): [CLIENT_INSTALLERS.md](https://github.com/fr0ster/mcp-abap-adt-conf/tree/main/docs/CLIENT_INSTALLERS.md).

## Terminology

**Destination**: a local service key filename. You store service keys in the standard `service-keys` directory, and pass the filename (without extension) via `--mcp=<destination>` to select which system to use.

See [docs/user-guide/TERMINOLOGY.md](docs/user-guide/TERMINOLOGY.md) for the full list.

## Authorization & Destinations

Destination-based auth is the default. Drop service keys into the standard platform folder and use the filename as your destination:

```bash
mcp-abap-adt --mcp=TRIAL --system-type=cloud
```

Standard service key paths:
- Unix (Linux/macOS): `~/.config/mcp-abap-adt/service-keys/<destination>.json`
- Windows: `%USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\<destination>.json`

`mcp-abap-adt` (stdio) supports exactly three authentications, each a destination stated in a service key, a `.env`, or both; a JWT you hold is sent in headers to the HTTP or SSE server:

| Authentication | `.env` keys |
|----------------|-------------|
| Basic (HTTP or RFC) | `SAP_AUTH_TYPE=basic`, `SAP_USERNAME`, `SAP_PASSWORD` |
| SNC (RFC only, passwordless) | `SAP_AUTH_TYPE=snc`, `SAP_SNC_PARTNERNAME`, optional `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` — no user, no password |
| JWT, browser login | `SAP_AUTH_TYPE=jwt`, `SAP_GRANT_TYPE=authorization_code`, a service key (ABAP or XSUAA) or `SAP_UAA_*` |
| JWT you hold | the `x-sap-jwt-token` header of `mcp-abap-adt-http` / `mcp-abap-adt-sse` (stdio serves none) |

A `jwt` `.env` must state `SAP_GRANT_TYPE`. The `mcp-auth` command that writes such a `.env` comes from
`@mcp-abap-adt/auth-broker-cli`. The browser login listens on port `61001` unless `--browser-auth-port` says otherwise.

A created object always carries its responsible person and, where known, its master system. The
servers name them once per destination — its credentials and its ABAP system — when its connection
is created, by the rules of `@mcp-abap-adt/responsible-rules`: the system's `systeminformation`
answer (its user, its system id) wins, on-premise and on ABAP Cloud alike; a tool argument that
names the value (a transport's `owner`, say) still states it for that call. When the system gives
no information, ABAP Cloud is an error (`cloud_without_systeminformation` for a `404`, else
`system_lookup_failed`); on-premise the responsible is `SAP_RESPONSIBLE` / `x-sap-responsible` if
stated, else the login (`SAP_USERNAME`, `x-sap-login`), and the master system
`SAP_MASTER_SYSTEM` / `x-sap-master-system` when stated; with no user at all the call is refused
`system_user_unknown`, and a stdio start ends with exit `1`. A `401` is answered as it came. The
library applies no rules unless an embedder passes them. See
[Authentication & Destinations](docs/user-guide/AUTHENTICATION.md).
Coming from 21.x? See the [22.0 migration note](docs/MIGRATION-22.0.md) — the tools, their enums and the object types each argument accepts are the declared system type's (onprem or cloud), inspection needs `--system-type` too, `function` / `func` are the function module, main types stand for their one code, `RunATC` on cloud offers no program, and `ValidateServiceBinding` requires `package_name`.
Coming from 19.x? See the [20.0 migration note](docs/MIGRATION-20.0.md) — RFC on connection 19 and sap-rfc-lite 0.3.2: nothing compiled on install, a prebuilt binding for Linux x64, Windows x64 and macOS ARM64 only; over Streamable HTTP `state_handle` is an argument of every tool, and a long session keeps one SAP session across calls.
Coming from 18.x? See the [19.0 migration note](docs/MIGRATION-19.0.md) — the server split into a
package per transport and tool set, the system type required, the low set gone, the auth chain on
6.0. Coming from 17.x? See the [18.0 migration note](docs/MIGRATION-18.0.md) — the debugger's embedder surface moved to adt-clients 29, and a debugger start needs at least one breakpoint. From 16.x, the [17.0 note](docs/MIGRATION-17.0.md) first.

For full details (paths, `.env`, direct headers), see [Authentication & Destinations](docs/user-guide/AUTHENTICATION.md).

## Architecture

The project ships a **library and the servers** — and a compact variant of each server — because the two usage patterns want
different licences. Embedding the tools in a network service should not drag in
the obligations of a server that service never runs.

| Package | Licence | What it is |
|---|---|---|
| [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) | Apache-2.0 | The ADT tool handlers and the embeddable MCP server. No transport: the host supplies one. |
| [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core) | AGPL-3.0-only | The standalone stdio server, `mcp-abap-adt`: one destination through the auth broker. Depends on the library. |
| [`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http) | AGPL-3.0-only | The Streamable HTTP server, `mcp-abap-adt-http`: credentials from each request's `x-sap-*` headers. |
| [`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse) | AGPL-3.0-only | The HTTP+SSE server, `mcp-abap-adt-sse`: credentials from the `x-sap-*` headers of each SSE connection's `GET`. |
| [`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact) | AGPL-3.0-only | The compact server over stdio, `mcp-abap-adt-compact`: one tool per operation, the object type in the arguments. `core`'s launcher and configuration (from `server-runtime`) with the compact tool set. |
| [`@mcp-abap-adt/compact-http`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http) | AGPL-3.0-only | The compact server over Streamable HTTP, `mcp-abap-adt-compact-http`: `http`'s launcher and configuration (from `server-runtime`) with the compact tool set. |
| [`@mcp-abap-adt/compact-sse`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse) | AGPL-3.0-only | The compact server over HTTP+SSE, `mcp-abap-adt-compact-sse`: `sse`'s launcher and configuration (from `server-runtime`) with the compact tool set. |
| [`@mcp-abap-adt/server-runtime`](https://www.npmjs.com/package/@mcp-abap-adt/server-runtime) | AGPL-3.0-only | The launch code of every server: the stdio, Streamable HTTP and SSE launchers and servers, and the destination layer. **No command of its own**: every server package depends on it, so it is installed with each server; you never install it yourself. |
| [`@mcp-abap-adt/background-runs-memory`](https://www.npmjs.com/package/@mcp-abap-adt/background-runs-memory) | Apache-2.0 | The in-memory store of background runs (`IBackgroundRuns` of the library): the servers' store, for an embedder that keeps runs in its process. Every server package depends on it. |
| [`@mcp-abap-adt/responsible-rules`](https://www.npmjs.com/package/@mcp-abap-adt/responsible-rules) | Apache-2.0 | The rules that name a call's responsible, user and system from `systeminformation` (`SystemContextRules` of the library), and the system type the binaries require. Every server package passes them; the library applies none, so an embedder opts in. |
| [`@mcp-abap-adt/core-ro`](https://www.npmjs.com/package/@mcp-abap-adt/core-ro), [`http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/http-ro), [`sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/sse-ro) | AGPL-3.0-only | The read-only servers, `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`: `core`'s, `http`'s and `sse`'s launcher with the readonly tools (with system and search), batch mode and, on stdio, the leftover-session list and logoff — no high, debugger, background-run or resume tool. |
| [`@mcp-abap-adt/compact-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-ro), [`compact-http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http-ro), [`compact-sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse-ro) | AGPL-3.0-only | The read-only compact servers, `mcp-abap-adt-compact-ro`, `-compact-http-ro`, `-compact-sse-ro`: the 17 compact tools that change nothing, `HandlerBatch` and, on stdio, the leftover-session list and logoff. |
| [`@mcp-abap-adt/compact-readonly-entries`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly-entries), [`compact-modify`](https://www.npmjs.com/package/@mcp-abap-adt/compact-modify) | Apache-2.0 | The compact tools as libraries, split into the half that changes nothing and the half that writes (`compact-readonly-entries` was `compact-readonly` before 19.0.0). |

Eighteen packages, twelve binaries: four kinds of binary — core, core-ro, compact, compact-ro — on
each transport. **The binary fixes the tool set** (19.0.0; there is no `--exposition`): install the
one for your transport and the tools you want to run a server — `@mcp-abap-adt/core`, `http` or
`sse` (readonly, high, the debugger), their `-ro` packages (the readonly tools alone), `compact`,
`compact-http`, `compact-sse`, or their `-ro` packages (the compact tools that change nothing).
Install `@mcp-abap-adt/lib` to embed the tools in your own application. Every binary and its
tools: [Handler sets](docs/user-guide/HANDLERS_MANAGEMENT.md).

**Each server is installed on its own** (`npm install -g @mcp-abap-adt/compact`): a server
package brings everything it runs on — `server-runtime`, `lib` and the rest — and depends on
no other server package, so installing two servers, in one command or in two, is fine and
neither needs the other. Since 19.2.0 a process that loads two copies of `@mcp-abap-adt/lib`
anyway does not start: it prints `Two copies of @mcp-abap-adt/lib are loaded in this process
(…): reinstall <package> (npm install -g <package>).` and exits `1` — see
[One `lib` per server process](docs/architecture/README.md#one-lib-per-server-process-1920).

### 1. Standalone MCP Server (Default)
Run as a standalone MCP server; a binary is its transport (there is no `--transport` option):
```bash
mcp-abap-adt --mcp=TRIAL --system-type=cloud # stdio (@mcp-abap-adt/core): one destination
mcp-abap-adt-http --system-type=<onprem|cloud> # Streamable HTTP (@mcp-abap-adt/http): x-sap-* headers per request
mcp-abap-adt-sse --system-type=<onprem|cloud> # SSE (@mcp-abap-adt/sse): x-sap-* headers per SSE connection
mcp-abap-adt-compact --mcp=TRIAL --system-type=cloud # the compact tool set over stdio (@mcp-abap-adt/compact)
mcp-abap-adt-compact-http --system-type=<onprem|cloud> # ... over Streamable HTTP (@mcp-abap-adt/compact-http)
mcp-abap-adt-compact-sse --system-type=<onprem|cloud> # ... over SSE (@mcp-abap-adt/compact-sse)
mcp-abap-adt-ro --mcp=TRIAL --system-type=cloud # the readonly tools alone over stdio (@mcp-abap-adt/core-ro)
mcp-abap-adt-compact-ro --mcp=TRIAL --system-type=cloud # the compact tools that change nothing (@mcp-abap-adt/compact-ro)
                                       # (and -http-ro, -sse-ro, -compact-http-ro, -compact-sse-ro)
```

### 2. Embeddable Server (For Integration)
Embed MCP server into existing applications (e.g., SAP CAP/CDS, Express).
This needs `@mcp-abap-adt/lib` only — not the AGPL server:
```bash
npm install @mcp-abap-adt/lib
```
```typescript
import { EmbeddableMcpServer } from '@mcp-abap-adt/lib/embeddable';

const server = new EmbeddableMcpServer({
  connection,              // Your AbapConnection instance
  logger,                  // Optional logger
  exposition: ['readonly', 'high'],  // Handler groups to expose
  // A tool both groups serve under one name (Get<Type>) is listed once.
  // readOnlyDedupStrategy: a custom IReadOnlyDedupStrategy hides more.
});
await server.connect(transport);
```

See [Handlers Management → EmbeddableMcpServer dedup strategies](docs/user-guide/HANDLERS_MANAGEMENT.md#embeddablemcpserver-dedup-strategies) for how readonly tools are deduped against high and how to plug a custom `IReadOnlyDedupStrategy` for role-based rules.

## Quick Start

1. **Install server**: pick the [installation variant](docs/installation/INSTALLATION.md#installation-variants) — full or compact, HTTP, RFC or SNC — and follow the [Installation Guide](docs/installation/INSTALLATION.md)
2. **Configure client (auto)**: Use `mcp-conf` from `@mcp-abap-adt/configurator` (repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf), docs: [CLIENT_INSTALLERS.md](https://github.com/fr0ster/mcp-abap-adt-conf/tree/main/docs/CLIENT_INSTALLERS.md))
3. **Configure client (manual)**: See [Client Configuration](docs/user-guide/CLIENT_CONFIGURATION.md)
4. **Use**:
   - [Read-Only Tools](docs/user-guide/AVAILABLE_TOOLS_READONLY.md)
   - [High-Level Tools](docs/user-guide/AVAILABLE_TOOLS_HIGH.md)
   - [Compact Tools](compact/docs/AVAILABLE_TOOLS.md) — the single-step operations (lock, write under the lock, unlock, check, activate) the low set had; the low set left `mcp-abap-adt` / `-http` / `-sse` in 19.0.0 ([MIGRATION-19.0](docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries))

## Use Cases

- **Impact analysis / where-used before changes**: map object usage and probable blast radius.
- **Dependency audit**: inspect links across classes, interfaces, DDIC, CDS/views, and RAP artifacts.
- **Migration and cleanup prep**: extract repository facts to plan refactoring or cloud-readiness work.
- **RAP and ABAP iterative development**: create/update artifacts quickly with ADT-backed operations.
- **Automated documentation and RAG ingestion**: pull structured facts from ABAP systems for downstream tooling.

## Target Users

- ABAP developers and ABAP architects
- RAP developers
- Team leads and tech leads who need fast repository visibility
- Teams building RAG/agent workflows for SAP landscapes

## Capabilities (High-Level Focus)

Key examples of high-value workflows and tools:

- **Repository and impact analysis**: `GetWhereUsed`, `DescribeByList`, `GetObjectStructure`, `GetObjectInfo`, `SearchObject`, `GetPackageTree`, `GetPackageContents`
- **Code and semantic introspection**: `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetIncludesList`
- **RAP development**: `CreateBehaviorDefinition`, `UpdateBehaviorDefinition`, `CreateBehaviorImplementation`, `UpdateBehaviorImplementation`, `CreateServiceDefinition`, `UpdateServiceDefinition`, `CreateMetadataExtension`, `UpdateMetadataExtension`
- **CDS/View development**: `CreateView`, `UpdateView`, `GetView`, `DeleteView`
- **ABAP OO CRUD**: `CreateClass`, `UpdateClass`, `GetClass`, `DeleteClass`, `CreateInterface`, `UpdateInterface`, `GetInterface`, `DeleteInterface`
- **Function module/group CRUD**: `CreateFunctionGroup`, `UpdateFunctionGroup`, `GetFunctionGroup`, `DeleteFunctionGroup`, `CreateFunctionModule`, `UpdateFunctionModule`, `GetFunctionModule`, `DeleteFunctionModule`
- **Transport and activation support**: `CreateTransport`, `GetTransport`, `ActivateObject`
- **Quality and testing**: `RunATC`, `GetATCRunStatus`, `GetATCFindings` (ABAP Test Cockpit — one run over several objects, findings read back by worklist), ABAP Unit per test carrier — `CreateUnitTest`/`UpdateUnitTest`/`DeleteUnitTest`/`RunUnitTest` for a class, `CreateCdsUnitTest`/`RunCdsUnitTest` for a CDS view, `CreateProgramUnitTest`/`RunProgramUnitTest` for a report, `CreateFunctionGroupUnitTest`/`RunFunctionGroupUnitTest`/`RunFunctionModuleUnitTest` for a function group (`runner: 'async'`, the default, waits for the run within a bound, and `GetUnitTestResult` reads one that outlasts the wait; `runner: 'sync'` is one request to `/abapunit/testruns` answering the finished result — for a system that has that endpoint alone; a function module's synchronous run takes `function_group_name` and covers every test of its group) — `CheckClass` and the rest of the `Check*` family

### Long reads take a `timeout`

The long reads on an approved list (where-used and search, package walks, data preview, the
dump feed, profiler traces, … — the list in
[MIGRATION-19.0](docs/MIGRATION-19.0.md#every-transport-the-long-reads-take-a-timeout-each-on-an-abap-session-of-its-own))
run on an ABAP session of their own and take an optional `timeout` in seconds, with no default.
When it passes the read is cancelled — its session logged off — and nothing was changed. Set it
below your MCP client's request limit (the TypeScript SDK's client cancels at 60 s): **a tool call
cannot be cancelled** — a client's cancel aborts nothing, the call runs to its end. No other tool takes a `timeout`: a unit test, ATC, class or program run
goes on to its end.

### Batch mode

Calls none of whose requests depends on another's answer can be recorded and sent together, in
one ADT batch envelope, instead of one request each: `BatchBegin` switches the server into batch
mode, every such call is then recorded, answers nothing and takes the next number (from 1, in the
order made), `BatchEnd` sends them all and leaves batch mode whatever happens, and
`BatchAnswers` reads each call's answer by its number — the answer the tool gives outside batch
mode for what SAP answered. The compact binaries serve the same as one tool, `HandlerBatch`
(`action: 'begin' | 'end' | 'answers'`). Every binary serves it, the `-ro` ones included, on every
transport.

A tool that builds a request from an earlier answer is refused in batch mode — a high-level
create or update, a fallback after a `404`, a poll. Run such work as phases, each its own batch,
with the single-step tools: create (compact `HandlerCreate`, one request), lock (`HandlerLock`;
the handles read with `BatchAnswers`), write (`HandlerUpdate` with `lock_handle`, one request;
the whole metadata document in `source_code` for PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP), unlock
(`HandlerUnlock`), read back (`HandlerGet`, one request per part: `source` or `metadata`), activate (`HandlerActivate`, one request; a list, an `object_adt_type` and the types the per-object activation leaves to a run answer `{ run_id }`), and the run's state (`HandlerGet` `part: activation_status`, then `activation_results`, by `run_id`, as often as you choose); a unit-test run is one request with the synchronous runner (`HandlerUnitTestRun` with `runner: 'sync'`, answering the finished result) or, with the asynchronous runner (`runner: 'async'`, the default), its start (`HandlerUnitTestRun`, answering `run_id`), its status (`HandlerUnitTestStatus`, as often as you choose, until `FINISHED`) and its result (`HandlerUnitTestResult`, one request); a profiled run is its schedule (`HandlerProfileSchedule`, answering `profiler_id`), the run under it (`HandlerProfileRun` with that `profiler_id`) and its trace (`HandlerProfileList`, as often as you choose, then `HandlerProfileView`); a deletion is a deletion check (`HandlerDeletionCheck`, one request) and then
the delete (`HandlerDelete`, the deletion request alone). A batch holds one kind of request — LOCK, UNLOCK or stateless, as its first
recorded call decides — so each batch end sends one envelope; a call of another kind is refused
`batch_other_kind`: record it in the next batch. Every tool's description ends with
one sentence saying how it behaves in batch mode: recordable, recordable for the arguments it
names, or run outside batch mode. Over Streamable HTTP, send the `state_handle` `BatchBegin` answers as the
`state_handle` argument (or in the `x-mcp-state-handle` request header) on every call of the batch. See
[Batch Mode](docs/user-guide/BATCH_MODE.md), with the list of every recordable call.

## Registries

Published in the official MCP Registry and listed on Glama.ai.

- MCP Registry: [docs/deployment/MCP_REGISTRY.md](docs/deployment/MCP_REGISTRY.md)
- Glama.ai:
  <a href="https://glama.ai/mcp/servers/@fr0ster/mcp-abap-adt">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/@fr0ster/mcp-abap-adt/badge" />
  </a>

## Features

- **🏗️ Domain Management**: `GetDomain`, `CreateDomain`, `UpdateDomain` - Create, retrieve, and update ABAP domains
- **📊 Data Element Management**: `GetDataElement`, `CreateDataElement`, `UpdateDataElement` - Create, retrieve, and update ABAP data elements
- **📦 Table Management**: `GetTable`, `CreateTable`, `GetTableContents` - Create and retrieve ABAP database tables with data preview
- **🏛️ Structure Management**: `GetStructure`, `CreateStructure` - Create and retrieve ABAP structures
- **👁️ View Management**: `GetView`, `CreateView`, `UpdateView` - Create and manage CDS Views and Classic Views
- **🎓 Class Management**: `GetClass`, `CreateClass`, `UpdateClass` - Create, retrieve, and update ABAP classes
- **📝 Program Management**: `GetProgram`, `CreateProgram`, `UpdateProgram` - Create, retrieve, and update ABAP programs
- **🔧 Behavior Definition (BDEF) Management**: `GetBehaviorDefinition`, `CreateBehaviorDefinition`, `UpdateBehaviorDefinition` - Create and manage ABAP Behavior Definitions with support for Managed, Unmanaged, Abstract, and Projection types
- **📋 Metadata Extension (DDLX) Management**: `CreateMetadataExtension`, `UpdateMetadataExtension` - Create and manage ABAP Metadata Extensions
- **⚡ Activation**: `ActivateObject` - Universal activation for any ABAP object
- **🚚 Transport Management**: `CreateTransport`, `GetTransport` - Create and retrieve transport requests
- **🔍 Enhancement Analysis**: `GetEnhancements`, `GetEnhancementImpl`, `GetEnhancementSpot` - Enhancement discovery and analysis
- **📋 Include Management**: `GetIncludesList` - Recursive include discovery
- **🔍 System Tools**: `GetInactiveObjects` - Monitor inactive objects waiting for activation
- **🌐 Service Binding Preview**: `GetServiceBindingPreviewUrl` - The browser URL that opens a published service binding's Fiori preview, beside its OData service and `$metadata` URLs. Composed from the binding, its service definition and the exposed root view — no document carries it. OData V2 and V4; a Web API binding has no preview and says so. On SAP BTP the preview URL carries the browser host (`abap-web`), where the BTP logon answers, while the service URLs keep the ADT host
- **🧪 Runtime Diagnostics**: `RuntimeCreateProfilerTraceParameters`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeGetDumpById` - Profiling and dump analysis with JSON payloads
- **📡 Runtime Feeds**: `RuntimeListFeeds`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog` - Feed reader (dumps — filtered by user, runtime error, exception, object, package or component, and read past SAP's 100 entries per request — system messages, gateway errors), SM02 system messages, Gateway error log
- **🐞 Debugger** (in `mcp-abap-adt`, `-http`, `-sse` and the compact write binaries; in no `-ro` binary): ABAP and AMDP — breakpoints (line, exception, statement, message; a line breakpoint may carry a condition), a background run of a class or report caught at them, another user's requests and terminal mode, stack, variables, watchpoints, steps, leaving a debuggee running, the debugger settings, memory sizes and snapshots. A debug session is named by a `state_handle` and survives between tool calls on every transport. In user mode a breakpoint catches every request of the request user (the connected SAP user unless another is named): where that must not be possible, install a `-ro` binary. See [Debugger](docs/user-guide/DEBUGGER.md)
- **🔗 Long session over Streamable HTTP** (`mcp-abap-adt-http`, `-compact-http` and their `-ro`): every tool takes an optional `state_handle` argument that routes the call to the instance holding that state (a lock, a batch, a debug session); `SessionOpen` / `SessionClose` (compact: `HandlerSession`) keep one instance and its SAP session for a run of calls and log it off at the close, or at the idle bound. See [`@mcp-abap-adt/http`](http/README.md#held-state-and-the-long-session)
- **🚀 SAP BTP Support**: JWT/XSUAA authentication with browser-based token helper
- **🔑 Destination-Based Authentication**: Service key-based authentication with automatic token management (see [Client Configuration](docs/user-guide/CLIENT_CONFIGURATION.md#destinations))
- **💾 Freestyle SQL**: `GetSqlQuery` - Execute custom SQL queries via ADT Data Preview API

> ℹ️ **ABAP Cloud limitation**: Direct ADT data preview of database tables is blocked by SAP BTP backend policies. The server returns a descriptive error when attempting such operations. On-premise systems continue to support data preview.

## Documentation

### For Users
- **[Docs Index](docs/README.md)** - Full documentation index
- **[Installation Guide](docs/installation/README.md)** - Installation variants (full or compact; HTTP, RFC or SNC) and platform guides
- **[RFC Setup](docs/installation/RFC_SETUP.md)** - RFC and SNC: the SAP NW RFC library at run time, the prebuilt RFC module and where to build one
- **[User Guide](docs/user-guide/README.md)** - End-user docs (auth, config, tools)
- **[Authentication & Destinations](docs/user-guide/AUTHENTICATION.md)** - Destination-based auth and service keys
- **[Batch Mode](docs/user-guide/BATCH_MODE.md)** - Record independent calls, send them together in batch envelopes at `BatchEnd`, read their answers by number; which calls are recorded
- **[Tool Search](docs/user-guide/TOOL_SEARCH.md)** - The three texts each listed tool carries — `description` for the model, `keywords` for BM25, `semantic` for vector search — and where a client reads them
- **[Debugger](docs/user-guide/DEBUGGER.md)** - The `debug` set of the write binaries: debug sessions and their handle, the SAP ids, what keeps a session alive on each transport, what ends it
- **[Handlers Management](docs/user-guide/HANDLERS_MANAGEMENT.md)** - The twelve binaries and the tools each serves
- **Configurator**: `@mcp-abap-adt/configurator` (repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf)) provides the `mcp-conf` CLI to auto-configure clients
- **Tools by level**
  - [Read-Only Tools](docs/user-guide/AVAILABLE_TOOLS_READONLY.md)
  - [High-Level Tools](docs/user-guide/AVAILABLE_TOOLS_HIGH.md)
  - [Compact Tools](compact/docs/AVAILABLE_TOOLS.md) (the low set's analogue since 19.0.0)

### For Administrators
- **[Security](SECURITY.md)** - Never more secure than its host: who may call the server, HTTPS, TLS to SAP, credentials and state handles, a deployment checklist
- **[Deployment Docs](docs/deployment/README.md)** - MCP Registry, Docker, release notes
- **[Server Configuration](docs/configuration/YAML_CONFIG.md)** - YAML config reference

### For Developers
- **[Architecture Documentation](docs/architecture/README.md)** - System architecture and design decisions
- **[Development Documentation](docs/development/README.md)** - Testing guides and development resources
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[docs/MIGRATION-22.0.md](docs/MIGRATION-22.0.md)** - The system type decides the tools and the object types each argument accepts (the ADT type tables of interfaces-adt 23.1, adt-clients 38); inspection needs the system type; friendly names and main types; RunATC per system type; arguments now required
- **[docs/MIGRATION-20.0.md](docs/MIGRATION-20.0.md)** - RFC on connection 19 and sap-rfc-lite 0.3.2: nothing compiled on install, prebuilt bindings for three platforms, the RFC library at run time, the portable build on 0.3 only; Streamable HTTP: held state by the `state_handle` argument, and the long session
- **[docs/MIGRATION-19.0.md](docs/MIGRATION-19.0.md)** - A package per transport and tool set (seventeen packages, twelve binaries), the system type required, the low set gone, the auth chain on 6.0, logoff at every session end
- **[docs/MIGRATION-18.0.md](docs/MIGRATION-18.0.md)** - The debugger on adt-clients 29: what an embedder of lib/debugger changes; a start needs a breakpoint
- **[docs/MIGRATION-17.0.md](docs/MIGRATION-17.0.md)** - The HTTPS certificate is verified; a message class needs a responsible
- **[docs/MIGRATION-16.0.md](docs/MIGRATION-16.0.md)** - Authentication on auth-broker 4: four authentications, destinations
- **[docs/MIGRATION-14.0.md](docs/MIGRATION-14.0.md)** - The compact facade moved to its own
  packages and `--exposition=compact` became the `mcp-abap-adt-compact` command
- **[docs/MIGRATION-13.0.md](docs/MIGRATION-13.0.md)** - What a consumer on the 12.x contract changes
- **[docs/MIGRATION-12.0.md](docs/MIGRATION-12.0.md)** - What a consumer on the 11.x contract changes

## Dependencies

Two packages do the work:

- **[@mcp-abap-adt/connection](https://www.npmjs.com/package/@mcp-abap-adt/connection)** – connection/auth/session layer
- **[@mcp-abap-adt/adt-clients](https://www.npmjs.com/package/@mcp-abap-adt/adt-clients)** – Builder-first ADT clients

and six packages declare the contracts both of them and this project are written against — `@mcp-abap-adt/interfaces-adt`, `-adt-connection` (where `IAbapConnection` and `IAdtWireResponse` live), `-network`, `-auth`, `-auth-sap` and `-utils`. They replace the single `@mcp-abap-adt/interfaces` umbrella, which is no longer published: a consumer naming a contract package directly gets one copy of it in the tree and takes its majors one domain at a time.

The verdict on an ADT answer is a strategy, not a default: since `adt-clients` 23 no member judges its own answer, and **[@mcp-abap-adt/adt-strategies](https://www.npmjs.com/package/@mcp-abap-adt/adt-strategies)** holds the readings this project passes to every call. That is what keeps a refusal ADT embeds in an HTTP `200` — an activation that did not activate, a delete that was refused — from reaching a caller as success.

Everything above is installed by `npm install` and published to npm. `@mcp-abap-adt/sap-rfc-lite` is optional and only needed for the RFC transport (and so for SNC). It has no install script: it carries a prebuilt binding for Linux x64 (glibc), Windows x64 and macOS ARM64 and compiles nothing on install; elsewhere a binding is built by hand. At run time it needs the SAP NW RFC library — SAP GUI's 64-bit `sapnwrfc.dll` in `System32` on Windows, else the SAP NW RFC SDK. Check it is installed with `npm ls -g @mcp-abap-adt/sap-rfc-lite`. See [RFC Setup](docs/installation/RFC_SETUP.md).

---


## Running the Server

### Global Installation (Recommended)
After installing globally with `npm install -g`, you can run from any directory:

```bash
# Show help
mcp-abap-adt --help

# Default stdio mode (for MCP clients; the destination comes from --mcp, or from a .env file named with --env or --env-path: a .env in the working directory is read only when named)
mcp-abap-adt --system-type=<onprem|cloud>

# Streamable HTTP on a custom port (@mcp-abap-adt/http; credentials from x-sap-* headers)
mcp-abap-adt-http --port=8080 --system-type=<onprem|cloud>

# Use stdio mode with auth-broker (--mcp parameter)
mcp-abap-adt --mcp=TRIAL --system-type=cloud

# Use env destination from platform sessions store
mcp-abap-adt --env=trial --system-type=cloud

# Use explicit .env file path
mcp-abap-adt --env-path=/path/to/my.env --system-type=<onprem|cloud>

# SSE (@mcp-abap-adt/sse; credentials from the opening GET's x-sap-* headers)
mcp-abap-adt-sse --sse-port=3001 --system-type=<onprem|cloud>

# The compact servers take their full counterpart's options; the binary fixes the tools
mcp-abap-adt-compact --env-path=/path/to/my.env --system-type=<onprem|cloud> # npm install -g @mcp-abap-adt/compact
mcp-abap-adt-compact-http --port=8080 --system-type=<onprem|cloud> # npm install -g @mcp-abap-adt/compact-http
mcp-abap-adt-compact-sse --sse-port=3001 --system-type=<onprem|cloud> # npm install -g @mcp-abap-adt/compact-sse

# The read-only servers: the same options, the tools that change nothing
mcp-abap-adt-ro --env-path=/path/to/my.env --system-type=<onprem|cloud> # npm install -g @mcp-abap-adt/core-ro
mcp-abap-adt-compact-http-ro --port=8080 --system-type=<onprem|cloud> # npm install -g @mcp-abap-adt/compact-http-ro
```

### Development Mode
```bash
npm install
npm run build
npm test
```

The checkout is not runnable as a server by itself: `server/` takes `@mcp-abap-adt/lib` as a package. To run a build, pack both and install the tarballs together — see [From source](docs/installation/INSTALLATION.md#from-source-development).

### Environment Configuration

Env resolution:
1. `--env-path=<path|file>` (or `MCP_ENV_PATH`) for explicit `.env` file.
   - Absolute path: used as-is.
   - Relative path or file name only (e.g. `my.env`): resolved from current working directory.
2. `--env=<destination>` for destination file in standard sessions store:
   - Unix: `~/.config/mcp-abap-adt/sessions/<destination>.env`
   - Windows: `%USERPROFILE%\\Documents\\mcp-abap-adt\\sessions\\<destination>.env`

Nothing is looked up in the working directory: a server started inside someone else's project must not
take their settings. A `.env` there is read only when you name it (`--env-path=./.env`).

Whichever file is chosen is read **and written back** with a renewed token, whatever `--unsafe` says. A destination is read once per process: a change to its `.env` from outside takes effect on restart. `.env` and environment variables hold secrets and the session; a YAML config file holds configuration only and refuses a secret-looking key.

**Example .env file:**
```bash
SAP_URL=https://your-sap-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_CONNECTION_TYPE=http
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
```

A destination states its connection type: `SAP_CONNECTION_TYPE` (`http` or `rfc`) in its `.env`, `--connection-type`, the process environment or YAML `connection-type`. There is no default; a destination that states none is refused at startup, naming the places it can be set. A service key carries none, so a `--mcp` destination read from one takes it from the command line, the environment or YAML.

A JWT you already hold is not served over stdio: send it in the `x-sap-jwt-token` header to
`mcp-abap-adt-http` or `mcp-abap-adt-sse` (`@mcp-abap-adt/http`, `@mcp-abap-adt/sse`), or create
the session with `mcp-auth`.

For RFC connection:
```bash
SAP_URL=http://your-onprem-system.example:8000
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CONNECTION_TYPE=rfc
```

`SAP_CONNECTION_TYPE=rfc` in the destination's `.env` (the `--env` / `--env-path` file, or `<auth-broker-path>/sessions/<name>.env` for `--mcp=<name>`) selects RFC, as do `--connection-type=rfc`, the process environment and YAML `connection-type: rfc`. Precedence: CLI, then the process environment (which the `.env` value joins, never over one already set), then YAML. Over RFC the host comes from `SAP_URL` and the system number from its port (`80NN` → `NN`); a port that follows no such rule needs `SAP_SYSNR` in the process environment. See [RFC Setup Guide](docs/installation/RFC_SETUP.md) for prerequisites (SAP NW RFC SDK, a C++ toolchain, `SAPNWRFC_HOME` before the install).

**Through a message server and a logon group** (load-balanced logon): add `SAP_MSHOST` with `SAP_MSSERV` or `SAP_SYSID` (one of the two is required; `SAP_MSHOST` with neither is refused by `@mcp-abap-adt/connection`, naming both), and optionally `SAP_GROUP` (the logon group; `PUBLIC` when absent — connection's default, not the server's) and `SAP_SAPROUTER` (works with either addressing). Each is also `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter`, or the YAML key of that name, with the same precedence as the connection type; in the `.env` they belong to the `--env` / `--env-path` file. With `SAP_MSHOST` the RFC wire takes no host and no system number from `SAP_URL`, and `SAP_SYSNR` is not read; `SAP_URL` is still the system's URL. The server passes the five fields as configured and adds nothing. Logon through a message server is implemented and unit-tested, but not yet measured on a live system (as of 2026-10-20): if the SDK refuses `SAP_MSSERV` without `SAP_SYSID`, add `SAP_SYSID`.

```bash
SAP_URL=http://your-onprem-system.example:8000
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CONNECTION_TYPE=rfc
SAP_MSHOST=your-message-server.example
SAP_SYSID=ABC
SAP_GROUP=PUBLIC
# Optional: SAP_MSSERV=sapmsABC, SAP_SAPROUTER=/H/your-router.example/S/3299/H/
```

For SNC (passwordless logon over RFC, no user or password):
```bash
SAP_URL=http://your-onprem-system.example:8000
SAP_CLIENT=100
SAP_CONNECTION_TYPE=rfc
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME='p:CN=<system>, O=<org>, C=<country>'
# Creates need a responsible person; over SNC no login is known
SAP_RESPONSIBLE=<your ABAP user>
# Optional: SAP_SNC_QOP, SAP_SNC_LIB, SAP_SNC_MYNAME
```
The credential of the installed SNC product (for example a Secure Login Client) is mapped to an ABAP user by its SNC name. `SAP_CONNECTION_TYPE=rfc` (or `--connection-type=rfc`) is required: SNC logs on over RFC only, and an SNC destination with HTTP is refused. SNC needs the SAP NW RFC library (SAP GUI's on Windows, else the SDK) and `@mcp-abap-adt/sap-rfc-lite`, an optional dependency — see [RFC Setup](docs/installation/RFC_SETUP.md).

> **Not supported since 16.0:** `SAP_AUTH_TYPE=certificate` and `kerberos`, `saml`, and a `jwt` grant other than `authorization_code` and `none`, in a `.env` or service key are refused at startup, naming the authentication (a `saml` destination with no grant: `cannot be used: grantType`). See the [migration note](docs/MIGRATION-16.0.md) for what to do instead.

**Generate a `.env` (JWT):**
```bash
# Install the CLI globally (one-time setup) — it ships mcp-auth
npm install -g @mcp-abap-adt/auth-broker-cli

# Log in and write a .env that states its authentication and grant (--type xsuaa for an XSUAA key)
mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap
# or a destination: mcp-auth --destination TRIAL --type abap   (`mcp-auth --help` lists the rest)
```

The `.env` states `SAP_AUTH_TYPE` and `SAP_GRANT_TYPE`; a `jwt` `.env` without a grant is refused at startup.

**.env comments rule:** only full-line comments are supported (lines that start with `#`).  
Inline comments are not parsed, so keep comments on separate lines.

**Claude recommendation:** place the service key in the service-keys directory and use `--mcp=<destination>` (avoid manual JWT tokens).

### Command-Line Options

**Authentication:**
- `--mcp=<destination>` - Named destination: `service-keys/<destination>.json` and `sessions/<destination>.env`, field by field
- `--auth-broker-path=<path>` - Custom path for auth-broker service keys and sessions
- `--browser=<name>` - Browser for a login: `system` (default), `auto`, `chrome`, `edge`, `firefox`, `none`, `headless` — mapped by the platform; `none` / `headless`: the URL on stderr ([Authentication](docs/user-guide/AUTHENTICATION.md))
- `--browser-program=<program>` - The program that opens the login URL instead (excludes `--browser`)
- `--renewal=<mode>` - `refresh-then-login` (default) or `refresh-only` (never a login)
- `--browser-auth-port=<port>` - Browser login callback port, 1-65535 (default: `61001`); an invalid value is refused at startup
- `--login-timeout=<seconds>` - Ends a browser login not finished after this many seconds, 1-86400; no default (a login ends on its answer, the IdP's refusal or the end of its session; a cancel ends nothing)
- `--connection-type=<http|rfc>` - SAP connection transport: `http` or `rfc`; required for a destination unless its `.env`, the environment or YAML states it (no default)
- `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter` - RFC through a message server and a logon group (`SAP_MSHOST`, … — see above)
- `--unsafe` - Write named destinations' sessions to disk. By default they are kept in memory (one login per process). A `.env` you name is written back either way

When `--mcp=<destination>` is specified, automatic fallback loading of `./.env` is skipped.

**Examples:**
```bash
# Named destination, session kept in memory (default)
mcp-abap-adt --mcp=TRIAL --system-type=cloud

# Named destination, session persisted to sessions/TRIAL.env
mcp-abap-adt --mcp=TRIAL --unsafe --system-type=cloud

# Custom base directory for service-keys/ and sessions/
mcp-abap-adt --mcp=TRIAL --auth-broker-path=~/prj/tmp/ --unsafe --system-type=cloud

# Browser login on another callback port
mcp-abap-adt --mcp=TRIAL --browser-auth-port=61005 --system-type=cloud
```

See [Client Configuration](docs/user-guide/CLIENT_CONFIGURATION.md) for complete configuration options.

### Handler logging switches
- `AUTH_LOG_LEVEL=error|warn|info|debug` — sets base log level for handler logger; `DEBUG_AUTH_LOG=true` also enables `debug`.
- `HANDLER_LOG_SILENT=true` — fully disables handler logging.
- `DEBUG_CONNECTORS=true` — verbose connection logging in high-level handlers.
- `DEBUG_HANDLERS=true` — enables verbose logs for selected read-only/system handlers.

## Development

### Testing
```bash
npm test
```

#### Test logging switches
- `TEST_LOG_LEVEL=error|warn|info|debug` — controls test logger verbosity (DEBUG_TESTS/DEBUG_ADT_TESTS/DEBUG_CONNECTORS force `debug`).
- `TEST_LOG_FILE=/tmp/adt-tests.log` — writes test logs to a file (best-effort).
- `TEST_LOG_SILENT=true` — disables test logging pipeline (console output muted).
- `TEST_LOG_COLOR=true` — adds colored/prefixed tags to test log lines.
- All `console.*` in tests are routed through the test logger with a `[test]` prefix.

### Building
```bash
npm run build
```

### Developer Tools
```bash
# Generate tool documentation
npm run docs:tools

# See tools/README.md for more developer utilities
```

## Contributors

Thank you to all contributors! See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the complete list.

---

**Acknowledgment**: This project was originally inspired by [mario-andreschak/mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt). We started with the core concept and then evolved it into an independent project with our own architecture and features.

## License

**Two licences: the libraries Apache-2.0, the servers AGPL.** Which one applies depends on which
package you install.

| Packages | Licence | |
|---|---|---|
| `@mcp-abap-adt/lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`, `compact-modify` | Apache-2.0 | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE); each package's own `LICENSE` |
| `@mcp-abap-adt/server-runtime`, `core`, `http`, `sse`, `compact`, `compact-http`, `compact-sse` and the six `-ro` packages | AGPL-3.0-only | [`server/LICENSE`](server/LICENSE); each package's own `LICENSE` |

All eighteen are published from this repository with one command, in dependency
order ([Release](docs/deployment/RELEASE.md)):

```bash
npm run release:dry        # rehearses every package, touches nothing
npm run release:publish    # @mcp-abap-adt/lib first, then the packages that depend on it
```

`release:publish` skips a version already on the registry, so re-running after
a failure resumes rather than starting over. It aborts on the first failure
instead of publishing a package on top of one that is not there.

Note that `npm publish` and `npm run` are different commands. `npm publish
release` asks npm to publish a package *named* `release`, which is somebody
else's package on the registry.

Copyright © 2025–2026 Oleksii Kyslytsia

All are distributed in the hope that they will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.

**What this means.** Running any of them, on your own data, carries no conditions.

Embedding the library in your own application carries no obligation to open your
application: Apache-2.0 asks for the notice and the licence text to travel with
it, and nothing more.

Distributing the standalone server, or running a modified version of it as a
network service, means passing on the same freedoms under AGPL section 13 —
including the source. That is why the two are separate packages: installing the
library never puts the server in your dependency tree.

**The packages underneath are LGPL-3.0-only** — `@mcp-abap-adt/adt-clients`,
`adt-strategies`, `connection`, `logger`, `auth-broker`, `auth-providers`,
`auth-stores` and the contract packages `interfaces-adt`,
`interfaces-adt-connection`, `interfaces-network`, `interfaces-auth`,
`interfaces-auth-sap` and `interfaces-utils` — and the library links them at
runtime. It was four of them when this paragraph was written; the rule is the
whole scope now, libraries LGPL and servers AGPL or GPL, and the MIT that a few
of the auth packages still carried was an oversight rather than an offer. LGPL
does not reach your own code, but its terms do travel with those packages
whatever this project is licensed as. Plan for that, not for the notice on this
repository.

**Other terms are possible.** Apache-2.0 is what the library is offered under
publicly, not the only way it can be offered. The copyright holder may license
the same code separately to a party who needs different terms; that takes
nothing away from anyone who received it under Apache-2.0, which is permanent.
[`CONTRIBUTORS.md`](CONTRIBUTORS.md#licensing) records what keeps that option
open, including the rule that no LGPL code from the packages underneath is ever
copied into this tree.

**History.** Releases through 8.13.0 were MIT and stay MIT; 9.x was
`GPL-3.0-only`. A licence change is not retroactive — anyone may still take an
earlier release under the licence it carried. See [`CONTRIBUTORS.md`](CONTRIBUTORS.md#licensing)
for the full account of how the relicensing was lawful.

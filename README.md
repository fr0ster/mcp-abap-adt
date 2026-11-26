# <img src="logo.png" alt="mcp-abap-adt logo" width="36" align="absmiddle" /> mcp-abap-adt: Your Gateway to ABAP Development Tools (ADT)
[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://stand-with-ukraine.pp.ua)

`mcp-abap-adt` is an MCP server for ABAP ADT in SAP ECC/S/4HANA (on-premise) and SAP BTP ABAP Cloud systems. It gives agents controlled access to real ABAP repositories through ADT, so analysis and changes are grounded in system data instead of assumptions. It is built for AI-assisted pair programming (AIPNV: AI Pairing, Not Vibing), not autopilot vibe coding.

## What it does

What you can do, grouped by what you want; each item links to its page. Where it matters, an item
names its binaries and systems: `-ro` is a read-only binary, compact a binary of the compact tool
set, onprem an ECC or S/4HANA system, cloud SAP BTP ABAP Cloud. **New in 24.2.0** is marked.

**Analyse code and its impact**
- **Where-used and impact analysis**: find every object that uses a class, table, CDS view, function module or text element before you change it — [GetWhereUsed](docs/user-guide/AVAILABLE_TOOLS.md#read-only-system).
- **Search objects and source text**: find objects by name and type, and search ABAP source inside packages — `SearchObject`, `SearchSource`, [Read-only tools](docs/user-guide/AVAILABLE_TOOLS_READONLY.md).
- **Read any repository object**: source and metadata of classes, interfaces, programs, includes, function groups and modules, DDIC, CDS, RAP behavior, service definitions and bindings, message classes, enhancements (implementations onprem only) — [Read-only tools](docs/user-guide/AVAILABLE_TOOLS_READONLY.md).
- **Structure and outline**: an object's components with the source lines each occupies, package trees and contents, includes and main programs — `GetObjectOutline`, `GetObjectStructure`, `GetPackageTree`.
- **Versions and diffs**: list an object's versions, read an old version, compare two — [Common tools](docs/user-guide/AVAILABLE_TOOLS.md#high-level-common).
- **Draft detection**: see whether an object holds an unactivated change, and whose — `GetObjectDraft` (compact `HandlerGet` `part: 'draft'`), [Access restrictions](docs/user-guide/ACCESS_RESTRICTIONS.md#getobjectdraft-and-handlerget-part-draft).

**Develop and change**
- **Full CRUD**: create, read, update, delete, check and activate classes (with their local includes), interfaces, programs and includes (onprem), function groups and modules, packages, domains, data elements, tables, structures, table types, CDS views, RAP behavior definitions and implementations, metadata extensions, service definitions and bindings, message classes — [High-level tools](docs/user-guide/AVAILABLE_TOOLS_HIGH.md), compact `HandlerCreate` / `HandlerUpdate` / `HandlerDelete`.
- **Activation**: activate one object or a list together — `ActivateObjects`, compact `HandlerActivate`.
- **Table settings and text elements**: read and write a table's technical settings, and the text symbols, selection texts and headings of a program, function group or class (onprem and cloud) — [Text elements](docs/user-guide/AVAILABLE_TOOLS.md#high-level-text-elements).
- **Packages with no super package** (**new in 24.2.0**): a structure package or a local (LOCAL) package can be created, locked and unlocked with no super package — `CreatePackage`, compact `HandlerCreate` `PACKAGE`.
- **abapGit** (**new in 24.2.0**): find a package's repository, link it, pull, see what changed, stage, commit and push, switch branches and read the run log — on premise and on ABAP Cloud, full and compact, with any git host over HTTPS, the git credential bound to approved endpoints and kept out of every argument, log line and answer — [abapGit](#abapgit-the-git-loop-on-a-package).

**Test and quality**
- **ATC**: run the ABAP Test Cockpit over several objects, read its findings, and list and read the stored ATC results — [ATC tools](docs/user-guide/AVAILABLE_TOOLS.md#high-level-atc).
- **ABAP Unit**: create, update and run the tests of a class, program (onprem), function group, function module or CDS view, or run every test of a package — [Unit test tools](docs/user-guide/AVAILABLE_TOOLS.md#high-level-unit-test).
- **Syntax checks**: check an object before activation — the `Check*` tools, compact `HandlerCheckRun`.

**Transports**
- **Transport requests**: create requests and tasks, list a user's requests, read a request's objects and action log, add, remove and move objects, sort and compress a task — [Transport tools](docs/user-guide/AVAILABLE_TOOLS.md#high-level-transport); the read half in every binary, `-ro` included.

**Debug and runtime**
- **ABAP and AMDP debugger**: breakpoints, stack, variables, watchpoints, steps and memory snapshots, a session kept between calls — [Debugger](docs/user-guide/DEBUGGER.md); the full and compact write binaries, no `-ro` one.
- **Run and profile**: run a class (and a program, onprem), with a profiler trace if asked, and read the traces — `RuntimeRunClass`, `RuntimeRunProgram`, the `Runtime*Profiler*` tools.
- **Dumps and feeds**: read short dumps, system messages and (onprem) the gateway error log — `RuntimeListFeeds`, `RuntimeGetDumpById`.

**Govern and secure**
- **Access restrictions**: deny tools or values (`--deny-actions`), and allow only listed packages, transport requests or tables (`--allowed-packages`, `--allowed-requests`, `--allowed-tables` / `--denied-tables`), set at start in every binary — [Access restrictions](docs/user-guide/ACCESS_RESTRICTIONS.md).
- **Read-only binaries**: `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro` and the compact `-ro` three serve nothing that changes the system — [Handler sets](docs/user-guide/HANDLERS_MANAGEMENT.md).
- **Data tools off by default**: freestyle SQL and table preview (`GetSqlQuery`, `GetTableContents`, compact `HandlerGetData`) are not listed unless the server is started with `--enable-data-tools` — [The data tools](#the-data-tools-off-unless-enabled).
- **SAP authorization stays the boundary**: every call runs as the connected SAP user, and the restrictions only take away — [Security](SECURITY.md).

**Work with agents**
- **MCP prompts** (**new in 24.2.0**): nine ready-made requests — `create`, `get`, `update`, `delete`, `activate`, `check`, `unit_test`, `where_used`, `transport` — that a client shows as slash commands, each answering the tools to call in order; every binary on onprem and cloud (the `-ro` ones `get`, `where_used`, `transport`, compact `-ro` also `check`) — [MCP Prompts](docs/user-guide/PROMPTS.md).
- **Terse answers** (**new in 24.2.0**): every tool answers what the next call needs — TSV for a list, every row answered — and `detail` (`terse`, `medium`, `full`, `raw`) chooses the reading before the call — [Answers](#answers).
- **Batch mode**: record independent calls and send them to SAP together in one ADT batch request (compact binaries, `-ro` included) — [Batch Mode](docs/user-guide/BATCH_MODE.md).
- **Background long reads**: where-used, search, package walks and other long reads answer a handle at once and are read or cancelled later, in every binary — [Background runs](docs/user-guide/README.md#background-runs-of-the-long-reads).
- **Tool search texts**: every tool carries keywords for BM25 and a sentence for vector search beside its description — [Tool Search](docs/user-guide/TOOL_SEARCH.md).
- **Long session by `state_handle`**: keep one SAP session across a run of calls over Streamable HTTP — `SessionOpen` / `SessionClose` (compact `HandlerSession`), the `-http` binaries — [Held state and the long session](http/README.md#held-state-and-the-long-session).
- **Full or compact**: the full set has one tool per action and object type; the compact set has one tool per operation with the object type in the arguments — [Compact tools](compact/docs/AVAILABLE_TOOLS.md).
- **Embeddable**: the tools and an MCP server as a library, `@mcp-abap-adt/lib` (Apache-2.0) — [Embeddable server](#2-embeddable-server-for-integration).

**Connect and run**
- Works with **On-Premise (ECC/S/4HANA)** and **ABAP Cloud (BTP)** systems; legacy systems (BASIS < 7.50) are **not supported at present**: that support is parked on the `parked/legacy-support` branch until it can be tried against a live legacy system
- Three authentications over stdio: **basic** (HTTP or RFC), **SNC** (passwordless, RFC), **JWT with browser login** (service key, ABAP or XSUAA); a **JWT you already hold** goes in the `x-sap-jwt-token` header of `mcp-abap-adt-http` / `mcp-abap-adt-sse`
- Multiple transports: **stdio**, **HTTP**, **SSE**
- Several installation variants: the **full** server (`@mcp-abap-adt/core`) or the **compact** one (`@mcp-abap-adt/compact`), each connecting to the system over **HTTP**, **RFC** or **SNC** — see [Installation variants](docs/installation/INSTALLATION.md#installation-variants)

**Authorization & Destinations (Important):** A *destination* is the filename of a service key stored locally. You place service keys in the service-keys directory, and use `--mcp=<destination>` to select which one to use. This is the primary auth model for on‑prem and BTP systems. See [Authentication & Destinations](docs/user-guide/AUTHENTICATION.md).

You can configure MCP clients either manually (JSON/TOML) or via the configurator CLI (`@mcp-abap-adt/configurator`, repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf)).

## Table of Contents

1. [What it does](#what-it-does)
2. [Getting Started](#getting-started)
3. [Architecture](#architecture)
4. [Quick Start](#quick-start)
5. [Use Cases](#use-cases)
6. [Target Users](#target-users)
7. [Capabilities (High-Level Focus)](#capabilities-high-level-focus)
8. [Terminology](#terminology)
9. [Authorization & Destinations](#authorization--destinations)
10. [Registries](#registries)
11. [Features](#features) — [abapGit](#abapgit-the-git-loop-on-a-package)
12. [Documentation](#documentation)
13. [Dependencies](#dependencies)
14. [Running the Server](#running-the-server)

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

On supported SAP HTTP connections, 24.1.1 can retry a standalone syntax check
such as `CheckClass` in the same MCP call after SAP returns a CSRF 403 and the
connector detects session replacement. See
[Syntax checks after session loss](docs/user-guide/AUTHENTICATION.md#syntax-checks-after-session-loss).

Coming from 23.x? See the [24.0 migration note](docs/MIGRATION-24.0.md) — an RFC destination states its address (`SAP_ASHOST` and `SAP_SYSNR`, or the message-server keys), `SAP_CLIENT` and `SAP_LANGUAGE`, and no `SAP_URL`; over MCP two arguments become required (`CreateDomain`'s `package_name`, compact `HandlerCreate` `BEHAVIOR_IMPLEMENTATION`'s `behavior_definition`) and a few tools declare arguments their handlers already read; compact `HandlerSearch` and `HandlerWhereUsed` became `HandlerSystem`'s `search_object` and `where_used`, beside six reads compact did not have; an embedder writes a tool's `inputSchema` in zod, builds an entry with `defineTool`, calls it as `entry.call(context, args)` and registers it with `registerTool(server, entry)`.
Coming from 22.x? See the [23.0 migration note](docs/MIGRATION-23.0.md) — `CreateProgram` no longer offers `include` (create an include with `CreateInclude`); an embedder registering the `./handlers` groups on its own `McpServer` states `systemType` (`SAP_SYSTEM_TYPE` is not read there), and `HandlerExporter` serves no background run and no debugger.
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
| [`@mcp-abap-adt/core-ro`](https://www.npmjs.com/package/@mcp-abap-adt/core-ro), [`http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/http-ro), [`sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/sse-ro) | AGPL-3.0-only | The read-only servers, `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`: `core`'s, `http`'s and `sse`'s launcher with the readonly tools (with system and search), the background runs of the long reads, batch mode and, on stdio, the leftover-session list — nothing that changes the system: no high, run, trace-schedule, debugger, leftover-session logoff or resume tool. |
| [`@mcp-abap-adt/compact-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-ro), [`compact-http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http-ro), [`compact-sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse-ro) | AGPL-3.0-only | The read-only compact servers, `mcp-abap-adt-compact-ro`, `-compact-http-ro`, `-compact-sse-ro`: the 17 compact tools that change nothing, the background runs of the long reads, `HandlerBatch` and, on stdio, the leftover-session list. |
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
(<copy>, <copy>): reinstall <package> (npm install -g <package>).` — each copy by its version
and label, an earlier one as `a copy before 24.0.0` — and exits `1` — see
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
- **Code structure, as SAP states it**: `GetObjectOutline` (an object's components with the source lines each occupies), the `Get<Type>` source reads with `start_line`/`end_line` for just those lines, `GetIncludesList`
- **RAP development**: `CreateBehaviorDefinition`, `UpdateBehaviorDefinition`, `CreateBehaviorImplementation`, `UpdateBehaviorImplementation`, `CreateServiceDefinition`, `UpdateServiceDefinition`, `CreateMetadataExtension`, `UpdateMetadataExtension`
- **CDS development**: `CreateDdl`, `UpdateDdl`, `GetDdl`, `DeleteDdl`, `CheckDdl`, `ActivateDdl`
- **ABAP OO CRUD**: `CreateClass`, `UpdateClass`, `GetClass`, `DeleteClass`, `CreateInterface`, `UpdateInterface`, `GetInterface`, `DeleteInterface`
- **Function module/group CRUD**: `CreateFunctionGroup`, `UpdateFunctionGroup`, `GetFunctionGroup`, `DeleteFunctionGroup`, `CreateFunctionModule`, `UpdateFunctionModule`, `GetFunctionModule`, `DeleteFunctionModule`
- **Transport and activation support**: `CreateTransport`, `CreateTransportTask`, `GetTransport` (a transport request or a task, by its number: a request's header and tasks, a task's header, parent request and objects with their positions), `ListTransports`, `ReadTransportObjects`, `AddTransportObject`, `MoveTransportObjects`, `ActivateObjects`
- **Quality and testing**: `RunATC`, `GetATCRunStatus`, `GetATCFindings` (ABAP Test Cockpit — one run over several objects, findings read back by worklist), `ListATCResults`, `GetATCResult` (the stored ATC results — central and users' runs — listed by user, kind and age, one read by its Display ID), ABAP Unit per test carrier — `CreateUnitTest`/`UpdateUnitTest`/`DeleteUnitTest`/`RunUnitTest` for a class, `CreateCdsUnitTest`/`RunCdsUnitTest` for a CDS view, `CreateProgramUnitTest`/`RunProgramUnitTest` for a report, `CreateFunctionGroupUnitTest`/`RunFunctionGroupUnitTest`/`RunFunctionModuleUnitTest` for a function group (`runner: 'async'`, the default, starts the run; with `wait: true`, the default, the call reads the run's status at once and long-polls it while SAP answers it running, and once more when SAP answers that first read `NOT_STARTED` (the run it just started may not have begun yet), and answers the result of a run SAP answers finished, lasting as long as the run, or the `run_id` and `NOT_STARTED` when the long-polled read still answers it; `GetUnitTestResult`, given a `run_id`, answers `NOT_STARTED` at once; with `wait: false` it answers the `run_id` right after the start, which `GetUnitTestResult` reads — the way to start a long run under a client with a request time limit; `runner: 'sync'` is one request to `/abapunit/testruns` answering the finished result — for a system that has that endpoint alone; a function module's synchronous run takes `function_group_name` and covers every test of its group), and `RunAbapUnit` (with the same `wait`) for any ABAP Unit run target: an object of any type of the run registry (`CLAS/OCL`, `DDLS/DF`, …) or a package, with or without its subpackages; a CDS view's tests are assigned tests and execute with `scope.foreign_tests: true` — `CheckClass` and the rest of the `Check*` family

### Long reads run in the background

The long reads on an approved list (where-used and search, `SearchSource`, package walks, data
preview, the dump feed, profiler traces, … — `tools/long-handlers.json`) run on an ABAP session
of their own. Since 24.0.0 a call **without** `background` answers a `run_handle` at once, and the
result is read with `GetBackgroundRun` (compact `HandlerBackgroundRunGet`); `background: false`
answers the result in the call. `DiscardBackgroundRun` (compact `HandlerBackgroundRunDiscard`) on a
running read cancels it: its session is logged off, and nothing was changed. No tool takes a
`timeout`: a read ends when SAP answers or when you cancel it. Once Get answers a finished or cancelled read, that read is gone: a Get response lost on the way cannot be recovered, `ListBackgroundRuns` no longer shows it, and the read must be started again. Every binary serves the background-run tools, the `-ro` ones included (their runs are reads
alone). A server without background runs (an embedder without a store) lists a long tool without
`background` and answers its read in the call.
See [MIGRATION-24.0](docs/MIGRATION-24.0.md#callers-of-the-long-tools-background-by-default-no-timeout).

### Answers

A tool answers what the next call needs. What it answers is the reading the tool hands to its
adt-clients call, chosen by `detail` before the request is sent; the answer is never cut — every
row SAP answered is answered. `detail` has four levels:

- `terse` (the default): compact, what the next call needs. A list answers TSV: one header line,
  one row per item, and a `# <field> <value>` line where a value would repeat on every row (a
  package, a task, an object). An item's details come from that item's own tool.
- `medium`: every field the reading read, without the document's leftovers (URIs, namespaces).
- `full`: the whole parse, the answer as it was before `detail` where a tool did not take it.
- `raw`: what ADT sent. The shape is the tool's, not the call's, and each tool's `detail`
  description names it. A tool that reads one document answers that document as is. A tool that
  assembles reads — package contents and tree, the other repository walks (`GetObjectInfo`,
  `GetNodeStructureLow` included), `SearchSource`,
  `DescribeByList`, the include, structure and function group lists, `GetEnhancements`,
  `GetWhereUsed`, `GetUnitTest`, `GetCdsUnitTest`, `GetUnitTestResult`, `GetCdsUnitTestResult`, the
  unit-test runs, `RuntimeListFeeds`, `CreateTransport`, `CreateTransportTask`, `CreateTableType`,
  `UpdateTableType`, `ActivateObjectLow` — always answers a JSON array of every response the call got, in read order, each as
  `{ "status", "body" }` as ADT sent it, an array even when the call read one: no parse, no
  projection, nothing of ours mixed in. A body the connection hands over as an object is its JSON
  text, bytes their UTF-8 text. When `full` is an error, or reports a read that failed or could not
  be read — an `error` member, a non-empty `failures`, `unreadable`, `append_candidates_unread` or
  `includes_unread`, or `appends_unavailable: true` — `raw` answers `full`'s answer as an error. A
  parse failure is the one exception: `full` an error while every exchange was answered `2xx` (every
  part of a batch envelope included) and our reading refused what came — then `raw` still gives the
  documents. `CreateTransport` answers a read-back that failed — with SAP's response or with none —
  as `{ "responses", "read_back" }`, the responses beside the same note `full` gives. Otherwise `raw`
  is the documents, and a failed exchange `full` neither refuses nor reports (the probe of a batch
  endpoint a destination does not serve) is there as its failed response, never as a gap.

An answer is the complete result or an error, never a partial one. A terse or medium list is
written from the reading's own lists, by construction: each tool states a column schema for every
list its reading holds — a list without one does not compile — and the writer takes the lists from
the reading itself and writes one row (or line, or entry) per item, every cell from that item, so no
formatter chooses its items. A kind of item the approved answer leaves out by definition (the
package and container nodes of a where-used tree, a separator line of an action log, a branch
repeating a transport request already listed, a component's links in an outline) is named with its
reason in the tool's schemas, every item still visited. What a reading cannot show — a node SAP
could not load, an include or a probe SAP refused, a read that failed — is a typed list of the
reading and is written like any other. Every value is escaped: a tab or any line terminator in SAP's
text adds no column and no line. Terse
lists what SAP returned: no row says that something asked for is absent — a consumer reads that with
its own call, or asks `medium` or `full` where a tool states it — while what SAP itself returned stays,
incomplete objects and nodes SAP could not load included (a node SAP could not load is its
`not loaded by SAP` row at terse, medium and full; at raw, SAP's XML carries it).

JSON answers are minified. A compact tool answers as the full tool it reads through, at every
level.

**Migration (24.2.0):** a caller that parsed a tool's default JSON asks for `detail: 'full'`,
which gives the former shape where the tool had no `detail` before; where it had one, the former
terse JSON is `detail: 'medium'`. See the [CHANGELOG](CHANGELOG.md).
The same holds for the tools that moved after it (`GetObjectInfo`, `GetNodeStructureLow`,
`ListATCResults`; `GetSqlQuery`, `GetTableContents` and `HandlerGetData`, whose former terse JSON
is `detail: 'medium'`).

### Batch mode

Calls none of whose requests depends on another's answer can be recorded and sent together, in
one ADT batch envelope, instead of one request each. Batch mode is the compact binaries' (the
`-ro` ones included, on every transport), one tool, `HandlerBatch`: `action: 'begin'` switches
the server into batch mode, every such call is then recorded, answers nothing and takes the next
number (from 1, in the order made), `action: 'end'` sends them all and leaves batch mode whatever
happens, and `action: 'answers'` reads each call's answer by its number — the answer the tool
gives outside batch mode for what SAP answered. The full binaries serve no batch mode; their
debugger batch reads its answers with `DebugBatchAnswers`.

A tool that builds a request from an earlier answer is refused in batch mode — a high-level
create or update, a fallback after a `404`, a poll. Run such work as phases, each its own batch,
with the single-step tools: create (compact `HandlerCreate`, one request), lock (`HandlerLock`;
the handles read with `HandlerBatch` `action: 'answers'`), write (`HandlerUpdate` with `lock_handle`, one request;
the whole metadata document in `source_code` for PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP and TABLE_TYPE, and for INCLUDE with `part: 'metadata'`), unlock
(`HandlerLock` `action: unlock`), read back (`HandlerGet`, one request per part: `source` or `metadata`), activate (`HandlerActivate`, one request; a list, an `object_adt_type` and the types the per-object activation leaves to a run answer `{ run_id }`), and the run's state (`HandlerGet` `part: activation_status`, then `activation_results`, by `run_id`; with `with_long_polling: true` the status read is one request SAP holds until the run ends, without it a read answered at once, as often as you choose); a unit-test run is one request with the synchronous runner (`HandlerUnitTestRun` with `runner: 'sync'`, answering the finished result) or, with the asynchronous runner (`runner: 'async'`, the default), its start (`HandlerUnitTestRun`, answering `run_id`; by `tests`, or by a run `target` — an object of any run type or a package — which takes this runner), its status (`HandlerUnitTestStatus`, as often as you choose, until `FINISHED`) and its result (`HandlerUnitTestResult`, one request); a profiled run is its schedule (`HandlerProfileSchedule`, answering `profiler_id`), the run under it (`HandlerProfileRun` with that `profiler_id`) and its trace (`HandlerProfileList`, as often as you choose, then `HandlerProfileView`); a deletion is a deletion check (`HandlerDeletionCheck`, one request) and then
the delete (`HandlerDelete`, the deletion request alone). A batch holds one kind of request — LOCK, UNLOCK or stateless, as its first
recorded call decides — so each batch end sends one envelope; a call of another kind is refused
`batch_other_kind`: record it in the next batch. A transport create (`HandlerTransportCreate`,
`HandlerCreate` `object_type: 'TRANSPORT'`) types the new request's task from the create's answer
and is not recorded. Every tool's description in a compact binary ends with one sentence saying
how it behaves in batch mode: recordable, recordable for the arguments it names, or run outside
batch mode. Over Streamable HTTP, send the `state_handle` `HandlerBatch` `action: 'begin'` answers as the
`state_handle` argument (or in the `x-mcp-state-handle` request header) on every call of the batch. See
[Batch Mode](docs/user-guide/BATCH_MODE.md), with the list of every recordable call.

## Prompts

Every binary lists MCP prompts beside its tools: ready-made requests an MCP client offers the
user. In [Claude Code's words](https://code.claude.com/docs/en/mcp.md#use-mcp-prompts-as-commands), "Claude Code lists each MCP prompt as
`/servername:promptname (MCP)`. Typing `/mcp__servername__promptname` also runs it." For a
server named `abap`: `/abap:get (MCP)` in the list, `/mcp__abap__get class ZCL_DEMO` typed.
Other clients show prompts in their own pickers. A prompt answers with an
instruction that names the tools to call, in order, with the user's values filled in; the model
follows it with the tools of the same binary. Nine prompts, plain names:

| Prompt | Arguments | Asks the model to |
|---|---|---|
| `create` | `object_type`, `name`, `package_name`, `description`, `transport_request` | create the object |
| `get` | `object_type`, `name` | read the object |
| `update` | `object_type`, `name`, `change`, `transport_request` | read the object, write it with the change described in words (compact: lock, write, unlock) |
| `delete` | `object_type`, `name`, `transport_request` | delete the object |
| `activate` | `object_type`, `name` | activate the object |
| `check` | `object_type`, `name` | check the object |
| `unit_test` | `object_type`, `name`, `include_subpackages` | run the unit tests of a class, program, function group, function module (its whole function group's), CDS view or package |
| `where_used` | `object_type`, `name`, `container` | list the objects that use the object |
| `transport` | `action`, `number`, `description`, `user`, `object_type`, `name`, `target_number` | work with transport requests: create, create a task, list, get a request or a task, list objects, read the log, add, remove or move an object, sort and compress |

`object_type`, `transport`'s `action` and `where_used`'s `container` complete in lower case and
are accepted in any case. A function module also takes `function_group` (not in `unit_test`: a
run names the module alone and covers the ABAP Unit tests of its whole function group); given
for another type, it is refused, not dropped. Each binary lists the prompts its tools serve, with the `object_type` values
its tools serve on the system kind: the read-only binaries list `get`, `where_used` and
`transport` (and, compact, `check`); a denied tool or value removes its `object_type` values,
and a prompt with none left is not listed. [PROMPTS.md](docs/user-guide/PROMPTS.md) lists the
prompts and values per binary and kind.

One example per family. `/get class ZCL_DEMO` on a full binary answers:

```
Get the CLASS "ZCL_DEMO".
1. Call GetClass with class_name: "ZCL_DEMO".
```

On a compact binary the same prompt answers:

```
Get the CLASS "ZCL_DEMO".
1. Call HandlerGet with object_type: "CLASS", class_name: "ZCL_DEMO", background: false.
CLASS takes CLASS(class_name*); * marks a required argument.
```

A value of several words does not fit a slash command, whose arguments Claude Code splits on
whitespace; a client that asks for the arguments in a form, or a `prompts/get`, takes it whole.
`update` with these arguments on a compact binary:

```json
{
  "name": "update",
  "arguments": {
    "object_type": "class",
    "name": "ZCL_DEMO",
    "change": "add a method that returns the current date"
  }
}
```

answers a four-step instruction: read with `HandlerGet`, lock with `HandlerLock`, write with
`HandlerUpdate` (`lock_handle` from the lock), unlock with `HandlerLock` `action: unlock`. A value the user did
not give is listed in the instruction as still to fill.

A `prompts/get` with an `object_type` the binary does not serve is refused with the protocol's
invalid-params error and names the types it serves. `BaseMcpServer` and `EmbeddableMcpServer`
register the prompts after the tools; the option `prompts: false` registers none. A plain
registration on an SDK `McpServer` registers none of its own accord;
`registerAbapPrompts(server, registry)` adds them
([HANDLER_EXPORTER.md](docs/architecture/HANDLER_EXPORTER.md)).

## Registries

Published in the official MCP Registry and listed on Glama.ai.

- MCP Registry: [docs/deployment/MCP_REGISTRY.md](docs/deployment/MCP_REGISTRY.md)
- Glama.ai:
  <a href="https://glama.ai/mcp/servers/@fr0ster/mcp-abap-adt">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/@fr0ster/mcp-abap-adt/badge" />
  </a>

## Features

The tools of the full binaries (`mcp-abap-adt`, `-http`, `-sse`) by family, as the generated
[tool reference](docs/user-guide/AVAILABLE_TOOLS.md) lists them; the compact binaries serve the
same operations with the object type in the arguments ([Compact tools](compact/docs/AVAILABLE_TOOLS.md)).
A family on one system kind says so; the rest are onprem and cloud.

**Repository objects** — each with `Get`, `Create`, `Update`, `Delete`, and where SAP has them `Check` and `Activate`:
- **🎓 Classes**: `GetClass`, `CreateClass`, `UpdateClass`, `DeleteClass`, `CheckClass`, `ActivateClass`, and the local includes: `Get`/`Update`/`Delete` of `LocalDefinitions`, `LocalTypes`, `LocalMacros`, `LocalTestClass`
- **🔌 Interfaces**: `GetInterface`, `CreateInterface`, `UpdateInterface`, `DeleteInterface`, `CheckInterface`, `ActivateInterface`
- **📝 Programs** (onprem): `GetProgram`, `CreateProgram`, `UpdateProgram`, `DeleteProgram`, `CheckProgram`, `ActivateProgram`
- **📋 Includes**: `GetInclude` (source or metadata), `GetIncludesList` (recursive), `GetMainPrograms` (onprem); writes onprem: `CreateInclude`, `UpdateInclude`, `UpdateIncludeMetadata`, `DeleteInclude`, `ActivateInclude`
- **🧩 Function groups and modules**: `GetFunctionGroup`, `CreateFunctionGroup`, `UpdateFunctionGroup`, `DeleteFunctionGroup`, `CheckFunctionGroup`, `ActivateFunctionGroup`; `GetFunctionModule`, `CreateFunctionModule`, `UpdateFunctionModule`, `DeleteFunctionModule`, `CheckFunctionModule`, `ActivateFunctionModule`; function includes: `GetFunctionInclude`, `CreateFunctionInclude`, `UpdateFunctionInclude`, `DeleteFunctionInclude`, `ListFunctionGroupIncludes`, `ListFunctionModules`
- **📦 Packages**: `GetPackage`, `GetPackageContents`, `GetPackageTree`, `CreatePackage` (a structure package or a local (LOCAL) package needs no `super_package`, new in 24.2.0), `UpdatePackage`, `DeletePackage`, `CheckPackage`
- **🏗️ Domains and data elements**: `GetDomain`, `CreateDomain`, `UpdateDomain`, `DeleteDomain`, `CheckDomain`, `ActivateDomain`; `GetDataElement`, `CreateDataElement`, `UpdateDataElement`, `DeleteDataElement`, `CheckDataElement`, `ActivateDataElement`
- **🗄️ Tables and structures**: `GetTable`, `CreateTable`, `UpdateTable`, `DeleteTable`, `CheckTable`, `ActivateTable`; `GetStructure`, `GetStructuresList`, `CreateStructure`, `UpdateStructure`, `DeleteStructure`, `CheckStructure`, `ActivateStructure`
- **🧾 Table types**: `GetTableType`, `CreateTableType`, `UpdateTableType`, `DeleteTableType`, `CheckTableType`, `ActivateTableType` — the create and the update take the definition (row type, access, key) and answer the definition SAP stored
- **⚙️ Table technical settings**: `GetTableSettings`, `UpdateTableSettings` — the settings given are written, the rest kept as stored; the update activates the table when asked
- **🔤 Text elements**: `GetTextElements`, `UpdateTextElements` — the text symbols, selection texts and headings of a program, a function group or a class; each part given is written as its whole list (on the cloud a function group's and a class's)
- **👁️ CDS data definitions**: `GetDdl`, `CreateDdl`, `UpdateDdl`, `DeleteDdl`, `CheckDdl`, `ActivateDdl`
- **🔧 RAP behavior**: `GetBehaviorDefinition`, `CreateBehaviorDefinition`, `UpdateBehaviorDefinition`, `DeleteBehaviorDefinition`, `CheckBehaviorDefinition`, `ActivateBehaviorDefinition`; `GetBehaviorImplementation`, `CreateBehaviorImplementation`, `UpdateBehaviorImplementation`, `DeleteBehaviorImplementation`
- **📋 Metadata extensions**: `GetMetadataExtension`, `CreateMetadataExtension`, `UpdateMetadataExtension`, `DeleteMetadataExtension`, `CheckMetadataExtension`, `ActivateMetadataExtension`
- **🌐 Service definitions and bindings**: `GetServiceDefinition`, `CreateServiceDefinition`, `UpdateServiceDefinition`, `DeleteServiceDefinition`, `ActivateServiceDefinition`; `GetServiceBinding`, `CreateServiceBinding`, `UpdateServiceBinding`, `DeleteServiceBinding`, `ActivateServiceBinding`, `ValidateServiceBinding`, `ListServiceBindingTypes`; `GetServiceBindingPreviewUrl` — the browser URL of a published binding's Fiori preview, beside its OData service and `$metadata` URLs (OData V2 and V4)
- **✉️ Message classes**: `GetMessageClass`, `CreateMessageClass`, `UpdateMessageClass`, `DeleteMessageClass`, and one message: `GetMessageClassMessage`, `CreateMessageClassMessage`, `UpdateMessageClassMessage`, `DeleteMessageClassMessage`
- **🔍 Enhancements**: `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` (onprem)
- **⚡ Activation**: `ActivateObjects` — one object or a list, together, text elements included; `GetInactiveObjects` lists what waits for activation
- **🕓 Versions and drafts**: `GetObjectVersions`, `GetObjectVersionSource`, `GetObjectVersionDiff`, and per type (`Get<Type>Versions`, `…VersionSource`, `…VersionDiff`); `GetObjectDraft` — whether an object holds an unactivated change, and whose

**Analysis and search**:
- **🔎 Where-used and search**: `GetWhereUsed`, `SearchObject`, `SearchSource` (ABAP source text inside packages), `GetObjectsByType`, `GetObjectsList`
- **🧭 Structure and metadata**: `GetObjectOutline` (components with their source lines), `GetObjectStructure`, `GetObjectInfo`, `DescribeByList`, `GetObjectNodeFromCache`, `GetTypeInfo`, `GetAdtTypes`, `GetTransaction`

**Test and quality**:
- **✅ ATC**: `RunATC`, `GetATCRunStatus`, `GetATCFindings` — one run over several objects, findings read back by worklist; `ListATCResults`, `GetATCResult` — the stored ATC results, central and users' runs
- **🧪 ABAP Unit**: per test carrier — `CreateUnitTest` / `UpdateUnitTest` / `DeleteUnitTest` / `RunUnitTest` for a class, `CreateCdsUnitTest` / `UpdateCdsUnitTest` / `DeleteCdsUnitTest` / `RunCdsUnitTest` for a CDS view, `CreateProgramUnitTest` / `UpdateProgramUnitTest` (onprem) / `RunProgramUnitTest` for a report, `CreateFunctionGroupUnitTest` / `UpdateFunctionGroupUnitTest` / `RunFunctionGroupUnitTest` / `RunFunctionModuleUnitTest` for a function group; `RunAbapUnit` for any run target, a package with or without its subpackages; `GetUnitTestResult` reads a run by its `run_id`. A run waits for its result by default (`wait`), or answers the `run_id` at once with `wait: false`

**🚚 Transports**: `CreateTransport`, `CreateTransportTask`, `GetTransport`, `ListTransports` (a user's requests), `ReadTransportObjects`, `ReadTransportActionLog`, `AddTransportObject`, `RemoveTransportObject`, `MoveTransportObjects`, `SortAndCompressTransportTask`

**Debug and runtime**:
- **🐞 Debugger** (in `mcp-abap-adt`, `-http`, `-sse` and the compact write binaries; in no `-ro` binary): ABAP and AMDP — breakpoints (line, exception, statement, message; a line breakpoint may carry a condition), a background run of a class or report caught at them, another user's requests and terminal mode, stack, variables, watchpoints, steps, leaving a debuggee running, the debugger settings, memory sizes and snapshots (`Debug*`, `AmdpDebug*`, `MemorySnapshot*`). A debug session is named by a `state_handle` and survives between tool calls on every transport. In user mode a breakpoint catches every request of the request user (the connected SAP user unless another is named): where that must not be possible, install a `-ro` binary. See [Debugger](docs/user-guide/DEBUGGER.md)
- **▶️ Runs and profiling**: `RuntimeRunClass`, `RuntimeRunProgram` (onprem), each optionally under a profiler trace, and `RuntimeCreateProfilerTraceParameters` (none of the three in a `-ro` binary); the trace reads `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`
- **📡 Dumps and feeds**: `RuntimeListFeeds` (dumps — filtered by user, runtime error, exception, object, package or component, and read past SAP's 100 entries per request — system messages, gateway errors), `RuntimeGetDumpById`, `RuntimeListSystemMessages` (SM02), `RuntimeGetGatewayErrorLog` (onprem)

**Server and sessions**:
- **⏳ Background runs**: `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun` — the long reads answer a `run_handle` at once (see [Long reads run in the background](#long-reads-run-in-the-background)); a class or program run may go on in the background too
- **🔗 Long session over Streamable HTTP** (`mcp-abap-adt-http`, `-compact-http` and their `-ro`): every tool takes an optional `state_handle` argument that routes the call to the instance holding that state (a lock, a batch, a debug session); `SessionOpen` / `SessionClose` (compact: `HandlerSession`) keep one instance and its SAP session for a run of calls and log it off at the close, or at the idle bound. See [`@mcp-abap-adt/http`](http/README.md#held-state-and-the-long-session)
- **🧹 Leftover sessions** (stdio binaries): `ListLeftoverSessions`, and in the write binaries `LogoffLeftoverSession` — the SAP sessions an ended process left
- **📦 Batch mode** (compact binaries): `HandlerBatch` — see [Batch mode](#batch-mode)
- **💬 MCP prompts** (new in 24.2.0): nine prompts beside the tools — see [Prompts](#prompts)
- **🛡️ Access restrictions**: `--deny-actions`, `--allowed-packages`, `--allowed-requests`, `--denied-tables` / `--allowed-tables` — see [Access restrictions](#access-restrictions)
- **🚀 SAP BTP Support**: JWT/XSUAA authentication with browser-based token helper
- **🔑 Destination-Based Authentication**: Service key-based authentication with automatic token management (see [Client Configuration](docs/user-guide/CLIENT_CONFIGURATION.md#destinations))
- **💾 Data tools, off unless enabled**: `GetSqlQuery` (freestyle ABAP SQL), `GetTableContents` (the data preview), compact `HandlerGetData` — see [The data tools](#the-data-tools-off-unless-enabled)

- **🌿 abapGit**: `ListAbapGitRepos`, `CheckAbapGitExternalRepo`, `GetAbapGitBranchInfo`, `LinkAbapGitRepo`, `UnlinkAbapGitRepo`, `PullAbapGitRepo`, `GetAbapGitModifiedObjects`, `GetAbapGitStaging`, `PushAbapGitRepo`, `CheckAbapGitRepo`, `GetAbapGitFile`, `SwitchAbapGitBranch`, `GetAbapGitErrorLog`; compact `HandlerAbapGitGet` and `HandlerAbapGit` - The git loop on a package, see [abapGit](#abapgit-the-git-loop-on-a-package)

### abapGit: the git loop on a package

The abapGit tools drive the abapGit service SAP serves through ADT (`/sap/bc/adt/abapgit/…`): on
ABAP Cloud SAP's own, on premise the open-source abapGit ADT backend installed in the system. Each
operation is offered where that system's abapGit serves it:

| Operation | Full tool | Compact | On premise | ABAP Cloud | In `-ro` |
|---|---|---|---|---|---|
| List the linked repositories (key, package, branch, remote URL; on cloud the run state and its log key) | `ListAbapGitRepos` | `HandlerAbapGitGet` `repos` | yes | yes | yes |
| Check a remote before linking: access mode and branches | `CheckAbapGitExternalRepo` | `HandlerAbapGitGet` `external_repo` | yes | yes | yes |
| Read one remote branch for a package (SAP links the repository and removes the link to answer it) | `GetAbapGitBranchInfo` | `HandlerAbapGit` `branch_info` | — | yes | no |
| Link a package to a remote | `LinkAbapGitRepo` | `HandlerAbapGit` `link` | yes, and imports the branch | yes, the link only | no |
| Unlink (the objects stay) | `UnlinkAbapGitRepo` | `HandlerAbapGit` `unlink` | yes | yes | no |
| Pull | `PullAbapGitRepo` | `HandlerAbapGit` `pull` | yes, in the call | yes, as SAP's job | no |
| The objects a pull would change, with SAP's action for each | `GetAbapGitModifiedObjects` | `HandlerAbapGitGet` `modified_objects` | — | yes | yes |
| Stage: what changed, with its files, and the proposed author and committer | `GetAbapGitStaging` | `HandlerAbapGitGet` `staging` | yes | yes | yes |
| Commit and push the chosen objects | `PushAbapGitRepo` | `HandlerAbapGit` `push` | yes, in the call | yes, as SAP's job | no |
| Check that the system reaches the remote | `CheckAbapGitRepo` | `HandlerAbapGitGet` `checks` | yes (see below) | yes | yes |
| Read one file, local or remote | `GetAbapGitFile` | `HandlerAbapGitGet` `file` | yes | yes | yes |
| Switch the branch, or create it in the remote | `SwitchAbapGitBranch` | `HandlerAbapGit` `switch_branch` | yes | — | no |
| Read a pull's or a push's run log | `GetAbapGitErrorLog` | `HandlerAbapGitGet` `error_log` | — | yes | yes |

- **Always listed; served where the system serves abapGit.** `tools/list` lists the abapGit tools
  without any request to SAP (no logon, no discovery; `--deferred-logon` included). Whether the
  system serves abapGit is decided when a tool is called: a system whose discovery does not list
  `/sap/bc/adt/abapgit/repos` (an on-premise system without the abapGit ADT backend, say) answers
  the call `abapgit_not_served` and nothing else is sent. Discovery is read once per system and
  kept for the process; a failed read is not kept, and the next call reads it again.
- **Any git host over HTTPS** — GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, a self-hosted
  server on a port of its own. SAP's abapGit connects to the host, not this server: it chooses
  Basic or Digest from the host's answer and sends a token as the password, and the host's
  certificate must be trusted in the system.
- **Git credentials come from approved endpoints, never from a tool argument.** An approved
  endpoint is an exact remote URL with its user and token, and its optional aliases: over stdio
  the destination's `<name>.abapgit.yaml` beside its `<name>.env`; over Streamable HTTP the
  request's `x-abapgit-remote`, `x-abapgit-user` and `x-abapgit-token` headers, for that request
  only; over SSE the same headers on the stream's opening `GET`, for that stream. A credential is
  attached only to the remote that matches exactly; any other remote is sent without one. The
  credential reaches SAP's abapGit request and nothing else: no log line, no answer, no error, no
  background-run record. See
  [Authentication: abapGit remotes](docs/user-guide/AUTHENTICATION.md#abapgit-remotes-approved-endpoints).
- **Answers are facts only.** A tool answers the facts SAP's document states — statuses, object
  lists, SAP's message class and number — never SAP's message texts, bodies or headers, and
  nothing is cut. The tools that answer lists (`ListAbapGitRepos`, `CheckAbapGitExternalRepo`,
  `GetAbapGitBranchInfo`, `GetAbapGitModifiedObjects`, `GetAbapGitStaging`,
  `GetAbapGitErrorLog`; the compact actions alike) take `detail`: `terse` (the default: TSV of
  the identifiers and a short description), `medium` (TSV of every fact field) or `full` (the
  whole facts object as JSON); there is no `raw`. A refusal from SAP is its fixed words and its
  facts (`status`, `messageClass`, `messageNumber`, on cloud `CheckAbapGitRepo`'s
  `gitHttpStatus`) as JSON.
- **Long runs end on SAP's answer; nothing runs on the server's clock.** No abapGit tool takes a
  timeout. On premise, link, pull and push are SAP's synchronous writes: the call ends on SAP's
  answer, and the caller's cancel does not cut it; with `background: true` (on premise only; full
  `LinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo`, compact `HandlerAbapGit` `link`, `pull`,
  `push`) it runs as a [background run](docs/user-guide/README.md#background-runs-of-a-class-or-a-program)
  on an ABAP session of its own, which `DiscardBackgroundRun` cannot cut; without a background-run
  store or a fresh connection `background: true` is refused, never run in the call. On ABAP Cloud,
  pull and push are SAP's own job: the call answers `accepted` at once, no route cancels the job,
  `ListAbapGitRepos` shows its run state and `GetAbapGitErrorLog` its log.
- **A cloud pull can overwrite only the objects it names.** `GetAbapGitModifiedObjects` (compact
  `modified_objects`) lists what a pull would change: every changed object of the repository, its
  own package left out, with SAP's action — `2` update (changed only in the remote), `3` overwrite
  (changed in the system), and add, delete, re-create, package move — and as package warnings the
  objects whose package in the system differs from the one their path maps to. On ABAP Cloud a pull
  without a selection hands SAP's job the whole list, and the job brings each object to its remote
  version, a package warning with action `5` excepted (SAP sets it to not imported whatever is
  selected). `PullAbapGitRepo` (compact `pull`) takes `overwrite`, on the cloud only: the listed
  objects to overwrite, each once, by its type and name as the list answers them. The server reads
  the list and sends the named entries as it answered them. SAP's job then recomputes the list when
  it runs and selects by **name** alone. Of the objects not named, a remote-only add or update is
  imported, and every other one keeps its system state: a change in the system, a remote deletion
  (SAP deletes only selected entries) and an object of another package (SAP leaves every unselected
  package warning out). A package warning with action `5` (delete and re-create) cannot be selected:
  SAP sets it to not imported. A change made between the read and the job is judged by SAP the same
  way, unseen by the server. Refused: `overwrite` on premise (`abapgit_overwrite_not_declared`,
  nothing sent; SAP's on-premise pull takes no selection and overwrites them all), an object named
  twice (`abapgit_overwrite_duplicate`, nothing sent), and after the repository list and the
  modified-objects read, an object the list does not hold (`abapgit_overwrite_not_listed`) or a
  name it holds under two types, in one list or across both (`abapgit_overwrite_ambiguous`: SAP
  selects by name within each list, the server refuses any collision).
- **An on-premise import whose SAP request is lost: unverified.** Closing an SSE stream or a stdio
  server logs its connections off, a running background run's included. When that loses an
  on-premise link's or pull's SAP request or its response, what SAP does is **unverified**: it has
  been neither read in SAP's code nor measured, and the server does not learn the outcome. Do not
  assume the import finished or was rolled back: read the repository's staging with the tool's own
  read, `GetAbapGitStaging` (compact `HandlerAbapGitGet` `staging`); it shows the current
  differences and cannot tell which writes came from the interrupted pull (on ABAP Cloud also
  `GetAbapGitModifiedObjects` and the run log, `GetAbapGitErrorLog`). On ABAP Cloud a pull or push
  is SAP's job, accepted before the call answers: closing the connection does not stop it. A
  Streamable HTTP disconnect leaves calls and runs going.
- **What an import writes** (read in SAP's code): an on-premise link imports the whole remote
  branch, and an on-premise pull the branch the repository is linked on, both with every overwrite
  and every "object of another package" decision set to yes — objects changed in the system are
  overwritten, subpackages are created as the folder logic derives them, and objects held by other
  packages are written too. A cloud link writes the link only. A cloud pull imports as inactive objects, and, given a transport request, creates a task in it
  for the user who has none. A push writes a commit in the remote and nothing in the system;
  `SwitchAbapGitBranch` with `create: true` creates the branch in the remote. A cloud pull given
  `overwrite` imports, of the listed objects outside the selection, the remote-only adds and updates
  only (measured for an update; the rest read in SAP's code); see the entry above.
- **Link and pull are refused under access restrictions.** While any `allowed-packages` or
  `allowed-requests` entry is configured, link and pull (full and compact) are refused
  `abapgit_import_not_allowed`, nothing sent: what they write is not bounded by the packages and
  requests they name. Push, unlink, branch switch and cloud branch info are checked against the
  repository's package, read from SAP's repository list first. See
  [Access restrictions: abapGit](docs/user-guide/ACCESS_RESTRICTIONS.md#abapgit).
- **The run log is cloud's.** On-premise abapGit keeps no run log in its repository list, so
  `GetAbapGitErrorLog` (compact `error_log`) is cloud only; its `app_log_key` must be the one the
  repository list shows for that repository.
- **On premise, `CheckAbapGitRepo` meets SAP's fault.** The on-premise backend answers the check
  with SAP's runtime error `SYNTAX_ERROR` (measured); the call returns SAP's answer as it is.
- **Reads in `-ro`, writes outside it.** `GetAbapGitBranchInfo` is a write: SAP links the
  repository, reads the branch and removes the link, and commits. Each tool and each compact
  action can be denied with `--deny-actions` (`HandlerAbapGit.push`).
- The abapGit tools need the MCP server's admission (the repository-list read, the endpoint
  binding): an embedder's plain registration (`HandlerExporter`) registers none of them.

> ℹ️ **ABAP Cloud limitation**: Direct ADT data preview of database tables is blocked by SAP BTP backend policies. The server returns a descriptive error when attempting such operations. On-premise systems continue to support data preview.

## Documentation

### For Users
- **[Docs Index](docs/README.md)** - Full documentation index
- **[Installation Guide](docs/installation/README.md)** - Installation variants (full or compact; HTTP, RFC or SNC) and platform guides
- **[RFC Setup](docs/installation/RFC_SETUP.md)** - RFC and SNC: the SAP NW RFC library at run time, the prebuilt RFC module and where to build one
- **[User Guide](docs/user-guide/README.md)** - End-user docs (auth, config, tools)
- **[Authentication & Destinations](docs/user-guide/AUTHENTICATION.md)** - Destination-based auth and service keys
- **[Batch Mode](docs/user-guide/BATCH_MODE.md)** - The compact binaries' `HandlerBatch`: record independent calls, send them together in batch envelopes at the batch's end, read their answers by number; which calls are recorded
- **[MCP Prompts](docs/user-guide/PROMPTS.md)** - The nine prompts (`create`, `get`, `update`, `delete`, `activate`, `check`, `unit_test`, `where_used`, `transport`) per binary and kind, their `object_type` values, how a client shows them, the refusal
- **[Tool Search](docs/user-guide/TOOL_SEARCH.md)** - The three texts each listed tool carries — `description` for the model, `keywords` for BM25, `semantic` for vector search — and where a client reads them
- **[abapGit](#abapgit-the-git-loop-on-a-package)** - The git loop on a package: the tools per system, any git host over HTTPS, approved endpoints per transport ([credentials](docs/user-guide/AUTHENTICATION.md#abapgit-remotes-approved-endpoints)), long runs, what an import writes, the refusal under [access restrictions](docs/user-guide/ACCESS_RESTRICTIONS.md#abapgit)
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
- **[docs/MIGRATION-24.0.md](docs/MIGRATION-24.0.md)** - Static types: a tool's schema is zod, an entry carries its typed `call`, `registerTool` takes the entry, the args-only form and its helpers are gone, typed handler arguments; `CreateDomain` requires `package_name`, compact `HandlerCreate` `BEHAVIOR_IMPLEMENTATION` `behavior_definition`; the low-to-compact table as it stands
- **[docs/MIGRATION-23.0.md](docs/MIGRATION-23.0.md)** - Includes are created by `CreateInclude`, not `CreateProgram`; the include and table-type tools; a plain `./handlers` registration lists and calls on its stated system type; `ToolHandler` is either call form; `HandlerExporter` without background runs and the debugger; compact cloud schemas; the search table's shape
- **[docs/MIGRATION-22.0.md](docs/MIGRATION-22.0.md)** - The system type decides the tools and the object types each argument accepts (the ADT type tables of interfaces-adt 24, adt-clients 39); inspection needs the system type; friendly names and main types; the search filter's names; RunATC per system type; arguments now required
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

For RFC connection — the destination states its address, its client and its logon language, and no `SAP_URL`:
```bash
SAP_ASHOST=your-application-server.example
SAP_SYSNR=00
SAP_CLIENT=100
SAP_LANGUAGE=EN
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CONNECTION_TYPE=rfc
```

`SAP_CONNECTION_TYPE=rfc` in the destination's `.env` (the `--env` / `--env-path` file, or `<auth-broker-path>/sessions/<name>.env` for `--mcp=<name>`) selects RFC, as do `--connection-type=rfc`, the process environment and YAML `connection-type: rfc`; the connection type is decided before anything else of the destination is read. An RFC destination states exactly one address — an application server (`SAP_ASHOST` and `SAP_SYSNR`, its two-digit system number) or a message server (below) — and `SAP_CLIENT` and `SAP_LANGUAGE`. Nothing is derived from a URL and nothing has a default. Each key is also a CLI option and a YAML key of its name (`--ashost`, `--sysnr`, `--client`, `--language`, …, YAML `ashost`, …), read in one order: the CLI, then the process environment, then the destination's own `.env` (or a service key's fallback), then YAML. The destination's `.env` does not feed the process environment for them. A destination that states a URL over RFC, two addresses, none, an incomplete one, or no client or language is refused at startup, naming the keys. See [RFC Setup Guide](docs/installation/RFC_SETUP.md) for prerequisites (the SAP NW RFC library at run time).

**Through a message server and a logon group** (load-balanced logon): instead of `SAP_ASHOST` and `SAP_SYSNR`, state `SAP_MSHOST` with `SAP_MSSERV` or `SAP_SYSID` (or both) and `SAP_GROUP` (the logon group). `SAP_SAPROUTER` goes with either address. Each is also `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter`, or the YAML key of that name, in the order above. The server passes the fields as stated and adds nothing. Logon through a message server is implemented and unit-tested, but not yet measured on a live system (as of 2026-10-20): if the SDK refuses `SAP_MSSERV` without `SAP_SYSID`, add `SAP_SYSID`.

```bash
SAP_MSHOST=your-message-server.example
SAP_SYSID=ABC
SAP_GROUP=<logon group>
SAP_CLIENT=100
SAP_LANGUAGE=EN
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CONNECTION_TYPE=rfc
# Optional: SAP_MSSERV=sapmsABC, SAP_SAPROUTER=/H/your-router.example/S/3299/H/
```

An embedder of `@mcp-abap-adt/lib` that reads a configuration from outside the type system (an env file, the environment, YAML) validates it before it builds an `ISapConfig` — the union of `ISapHttpConfig` and `ISapRfcConfig`, narrowed on `connectionType`; a typed `SapConfig` it hands to the server is used as typed. Over RFC `getBaseUrl()` answers `undefined`: `GetServiceBindingPreviewUrl` answers paths, and an injected connection's background runs need `EmbeddableMcpServerOptions.system`.

For SNC (passwordless logon over RFC, no user or password):
```bash
SAP_ASHOST=your-application-server.example
SAP_SYSNR=00
SAP_CLIENT=100
SAP_LANGUAGE=EN
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
- `--stdio-message-limit=<bytes>` - The server's assumption about the most bytes the MCP client buffers for one stdio message (`MCP_STDIO_MESSAGE_LIMIT`, YAML `stdio-message-limit`), a whole number from 2097152; not given or blank: the MCP SDK client's default, 10 MiB. Raising it changes nothing in the client: above the client's real buffer the disconnect comes back. No message longer than this less 1 MiB (one client read: verified for Node, Python MCP and the TS SDK on Bun) is written; a longer answer is answered an error naming both sizes
- `--connection-type=<http|rfc>` - SAP connection transport: `http` or `rfc`; required for a destination unless its `.env`, the environment or YAML states it (no default)
- `--ashost`, `--sysnr` - RFC to an application server (`SAP_ASHOST`, `SAP_SYSNR` — see above)
- `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter` - RFC through a message server and a logon group (`SAP_MSHOST`, … — see above)
- `--client`, `--language` - The client and the logon language (`SAP_CLIENT`, `SAP_LANGUAGE`); both required over RFC
- `--unsafe` - Write named destinations' sessions to disk. By default they are kept in memory (one login per process). A `.env` you name is written back either way

When `--mcp=<destination>` is specified, automatic fallback loading of `./.env` is skipped.

#### Access restrictions

Every binary takes optional start-time restrictions: `--deny-actions` (tools and values not
registered), `--allowed-packages`, `--allowed-requests`, `--denied-tables` / `--allowed-tables`
(each also an `MCP_*` variable and a `restrictions.*` key of the `--conf` file). None is set by
default, and with none the server behaves as without them. They are formal checks of a call's
arguments; SAP's authorization remains the boundary. The server names what it read in one start
line (`[MCP] Access restrictions: …`). See
[Access restrictions](docs/user-guide/ACCESS_RESTRICTIONS.md), which also describes
`GetObjectDraft` (compact: `HandlerGet` `part: 'draft'`): whether an object holds an
unactivated change, and whose.

#### The data tools: off unless enabled

`GetSqlQuery` (a freestyle ABAP SQL `SELECT`) and `GetTableContents` (the rows of a table or CDS
view), and their compact form `HandlerGetData`, read business data through ADT's data preview.
From 24.0.0 every binary — full, `-ro`, compact and compact `-ro`, over stdio, Streamable HTTP
and SSE — leaves them out unless it is started with the flag, in any of its three forms (the CLI
wins over the environment, which wins over the configuration file):

- `--enable-data-tools` (or `--enable-data-tools=false`),
- `MCP_ENABLE_DATA_TOOLS=true`,
- `enable-data-tools: true` in the `--conf` YAML file.

`false` in a higher form turns them off again. A value other than empty, null, `true` or `false`
stops the start; an empty value or YAML null counts as not given, as for every parameter, and the
next form decides.

On Streamable HTTP and SSE it is a start parameter of the server; no request header turns it on.
Without it the tools are not listed, and a call of one is answered that the tool is not found.
An embedder states it too: `exposition: [..., 'data']` (`EmbeddableMcpServer`),
`includeData: true` (`HandlerExporter`), or `DataHandlersGroup` / `CompactDataHandlersGroup`.

The reason is SAP's API Policy FAQ, version 1.3 (June 2026), question 33, which SAP marks as
informational and non-binding ([PDF](https://d.dam.sap.com/x/UL9AiqH/SAP_API_Policy_FAQ_v1.3_June.pdf)): "ADT APIs are not intended for programmatic reading of application tables or export of business data, SQL execution against SAP backend systems, business data integration or runtime orchestration, agentic AI workflows operating on business data, or substitution for business APIs."
**Whether to enable the data tools is the customer's decision**; the server leaves them off
until the customer makes it.

Other tools can reach business data too and are served as before; reviewing them is a separate,
later task: the debugger's variable reads and its AMDP table preview (`DebugGetVariables`,
`AmdpDebugGetTable`, compact `HandlerDebugMaintain` `getVariables` / `getDataPreview`), memory
snapshots, short dumps (`RuntimeGetDumpById`, `HandlerDumpView`), the gateway error log, profiler
traces, and the runs of a class or a program (not in any `-ro` binary).

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
npm test                  # the unit run on node:test — no SAP system, no outside service
npm run test:install      # packs and installs the release (the npm registry): the install suites
npm run test:retrieval    # vector tool retrieval through a local Ollama
npm run test:integration  # the live suites, against the system tests/test-config.yaml names
```

How each run selects, skips and is interrupted: [the testing guide](docs/development/tests/TESTING_GUIDE.md) and [the integration tests' README](src/__tests__/integration/README.md).

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
npm run release:verify     # the published release: registry, clean install, every bin's --version
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

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
- Four authentications: **basic** (HTTP or RFC), **SNC** (passwordless, RFC), **JWT with browser login** (service key, ABAP or XSUAA) and **JWT you already hold**
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

Pick a variant first — full or compact server, and HTTP, RFC or SNC to the system. HTTP needs nothing but Node.js 22 or 24; **RFC and SNC need the SAP NW RFC SDK and a C++ toolchain on the machine before `npm install`**, because the RFC module is compiled during the install and silently left out when it cannot be. [Installation variants](docs/installation/INSTALLATION.md#installation-variants) has the table and the commands; [RFC Setup](docs/installation/RFC_SETUP.md) the steps. To run without Node.js on a machine, build your own [portable executable](docs/installation/PORTABLE.md) — Node.js and your SAP NW RFC SDK inside.

Install the server and configure your client using the configurator:

```bash
npm install -g @mcp-abap-adt/core
npm install -g @mcp-abap-adt/configurator

# stdio (destination)
mcp-conf --client cline --name abap --mcp TRIAL

# HTTP (streamable HTTP)
mcp-conf --client copilot --name abap --transport http --url http://localhost:3000/mcp/stream/http --mcp trial
```

Full configurator usage (separate repo): [CLIENT_INSTALLERS.md](https://github.com/fr0ster/mcp-abap-adt-conf/tree/main/docs/CLIENT_INSTALLERS.md).

## Terminology

**Destination**: a local service key filename. You store service keys in the standard `service-keys` directory, and pass the filename (without extension) via `--mcp=<destination>` to select which system to use.

See [docs/user-guide/TERMINOLOGY.md](docs/user-guide/TERMINOLOGY.md) for the full list.

## Authorization & Destinations

Destination-based auth is the default. Drop service keys into the standard platform folder and use the filename as your destination:

```bash
mcp-abap-adt --transport=stdio --mcp=TRIAL
```

Standard service key paths:
- Unix (Linux/macOS): `~/.config/mcp-abap-adt/service-keys/<destination>.json`
- Windows: `%USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\<destination>.json`

The server supports exactly four authentications; each is a destination stated in a service key, a `.env`, or both:

| Authentication | `.env` keys |
|----------------|-------------|
| Basic (HTTP or RFC) | `SAP_AUTH_TYPE=basic`, `SAP_USERNAME`, `SAP_PASSWORD` |
| SNC (RFC only, passwordless) | `SAP_AUTH_TYPE=snc`, `SAP_SNC_PARTNERNAME`, optional `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` — no user, no password |
| JWT, browser login | `SAP_AUTH_TYPE=jwt`, `SAP_GRANT_TYPE=authorization_code`, a service key (ABAP or XSUAA) or `SAP_UAA_*` |
| JWT you hold | `SAP_AUTH_TYPE=jwt`, `SAP_GRANT_TYPE=none`, `SAP_JWT_TOKEN` (or the `x-sap-jwt-token` header) |

A `jwt` `.env` must state `SAP_GRANT_TYPE`. The `mcp-auth` command that writes such a `.env` comes from
`@mcp-abap-adt/auth-broker-cli`. The browser login listens on port `61001` unless `--browser-auth-port` says otherwise.

A created object always carries its responsible person: the first stated of the tool's own argument,
the `x-sap-responsible` header, `SAP_RESPONSIBLE` in the destination's own `.env`, then in the process
environment — else the login: on-premise the destination's `SAP_USERNAME`, the `x-sap-login` of an
`x-sap-url` connection, the process `SAP_USERNAME`; on a cloud system only the system's user. A create
that finds none (SNC, a token you hold) is refused naming `SAP_RESPONSIBLE`; nothing is sent — a message class included, from 17.0.0. The master system
comes from `x-sap-master-system` or `SAP_MASTER_SYSTEM` (destination `.env`, then process) — no tool
takes it as an argument — else from a cloud system itself; otherwise it is left out and the system
applies itself — never refused. Reads are unaffected. The process environment is read once: a change
made to it while the server runs is not picked up. See [Authentication & Destinations](docs/user-guide/AUTHENTICATION.md).
Coming from 16.x? See the [17.0 migration note](docs/MIGRATION-17.0.md) — the HTTPS certificate is now verified. From 15.x, the [16.0 note](docs/MIGRATION-16.0.md) first.

For full details (paths, `.env`, direct headers), see [Authentication & Destinations](docs/user-guide/AUTHENTICATION.md).

## Architecture

The project ships as **two packages** — and a compact variant of each — because the two usage patterns want
different licences. Embedding the tools in a network service should not drag in
the obligations of a server that service never runs.

| Package | Licence | What it is |
|---|---|---|
| [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) | Apache-2.0 | The ADT tool handlers and the embeddable MCP server. No transport: the host supplies one. |
| [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core) | AGPL-3.0-only | The standalone server — stdio, SSE and streamable HTTP, the launcher and the `mcp-abap-adt` CLI. Depends on the library. |
| [`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact) | AGPL-3.0-only | The compact standalone server, `mcp-abap-adt-compact`: one tool per operation, the object type in the arguments. Same launcher and configuration as `core`. |
| [`@mcp-abap-adt/compact-readonly`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly), [`compact-modify`](https://www.npmjs.com/package/@mcp-abap-adt/compact-modify) | Apache-2.0 | The compact tools as libraries, split into the half that changes nothing and the half that writes. |

Install `@mcp-abap-adt/core` (or `@mcp-abap-adt/compact`) to run a server. Install `@mcp-abap-adt/lib` to
embed the tools in your own application.

### 1. Standalone MCP Server (Default)
Run as a standalone MCP server with stdio, HTTP, or SSE transport:
```bash
mcp-abap-adt                           # stdio (default)
mcp-abap-adt --transport=http          # HTTP mode
mcp-abap-adt --transport=sse           # SSE mode
```

### 2. Embeddable Server (For Integration)
Embed MCP server into existing applications (e.g., SAP CAP/CDS, Express).
This needs `@mcp-abap-adt/lib` only — not the AGPL server:
```bash
npm install @mcp-abap-adt/lib
```
```typescript
import {
  EmbeddableMcpServer,
  NoDedupStrategy, // optional: expose both Read<X> and Get<X>
} from '@mcp-abap-adt/lib/embeddable';

const server = new EmbeddableMcpServer({
  connection,              // Your AbapConnection instance
  logger,                  // Optional logger
  exposition: ['readonly', 'high'],  // Handler groups to expose
  // Default hides Read<X> when Get<X> is exposed (ReadVsGetDedupStrategy).
  // Pass NoDedupStrategy to expose both variants instead.
  // readOnlyDedupStrategy: new NoDedupStrategy(),
});
await server.connect(transport);
```

See [Handlers Management → EmbeddableMcpServer dedup strategies](docs/user-guide/HANDLERS_MANAGEMENT.md#embeddablemcpserver-dedup-strategies) for how readonly tools are deduped against high/low, how to opt out with `NoDedupStrategy`, and how to plug a custom `IReadOnlyDedupStrategy` for role-based rules.

## Quick Start

1. **Install server**: pick the [installation variant](docs/installation/INSTALLATION.md#installation-variants) — full or compact, HTTP, RFC or SNC — and follow the [Installation Guide](docs/installation/INSTALLATION.md)
2. **Configure client (auto)**: Use `mcp-conf` from `@mcp-abap-adt/configurator` (repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf), docs: [CLIENT_INSTALLERS.md](https://github.com/fr0ster/mcp-abap-adt-conf/tree/main/docs/CLIENT_INSTALLERS.md))
3. **Configure client (manual)**: See [Client Configuration](docs/user-guide/CLIENT_CONFIGURATION.md)
4. **Use**:
   - [Read-Only Tools](docs/user-guide/AVAILABLE_TOOLS_READONLY.md)
   - [High-Level Tools](docs/user-guide/AVAILABLE_TOOLS_HIGH.md)
   - [Low-Level Tools](docs/user-guide/AVAILABLE_TOOLS_LOW.md)

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
- **Quality and testing**: `RunATC`, `GetATCRunStatus`, `GetATCFindings` (ABAP Test Cockpit — one run over several objects, findings read back by worklist), ABAP Unit per test carrier — `CreateUnitTest`/`UpdateUnitTest`/`DeleteUnitTest`/`RunUnitTest` for a class, `CreateCdsUnitTest`/`RunCdsUnitTest` for a CDS view, `CreateProgramUnitTest`/`RunProgramUnitTest` for a report, `CreateFunctionGroupUnitTest`/`RunFunctionGroupUnitTest`/`RunFunctionModuleUnitTest` for a function group (a run waits for its result; `GetUnitTestResult` for one that outlasts the wait) — `CheckClass` and the rest of the `Check*` family

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
- **🚀 SAP BTP Support**: JWT/XSUAA authentication with browser-based token helper
- **🔑 Destination-Based Authentication**: Service key-based authentication with automatic token management (see [Client Configuration](docs/user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication))
- **💾 Freestyle SQL**: `GetSqlQuery` - Execute custom SQL queries via ADT Data Preview API

> ℹ️ **ABAP Cloud limitation**: Direct ADT data preview of database tables is blocked by SAP BTP backend policies. The server returns a descriptive error when attempting such operations. On-premise systems continue to support data preview.

## Documentation

### For Users
- **[Docs Index](docs/README.md)** - Full documentation index
- **[Installation Guide](docs/installation/README.md)** - Installation variants (full or compact; HTTP, RFC or SNC) and platform guides
- **[RFC Setup](docs/installation/RFC_SETUP.md)** - RFC and SNC: the SAP NW RFC SDK and a C++ toolchain before the install
- **[User Guide](docs/user-guide/README.md)** - End-user docs (auth, config, tools)
- **[Authentication & Destinations](docs/user-guide/AUTHENTICATION.md)** - Destination-based auth and service keys
- **[Handlers Management](docs/user-guide/HANDLERS_MANAGEMENT.md)** - Enable/disable handler groups
- **Configurator**: `@mcp-abap-adt/configurator` (repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf)) provides the `mcp-conf` CLI to auto-configure clients
- **Tools by level**
  - [Read-Only Tools](docs/user-guide/AVAILABLE_TOOLS_READONLY.md)
  - [High-Level Tools](docs/user-guide/AVAILABLE_TOOLS_HIGH.md)
  - [Low-Level Tools](docs/user-guide/AVAILABLE_TOOLS_LOW.md)

### For Administrators
- **[Deployment Docs](docs/deployment/README.md)** - MCP Registry, Docker, release notes
- **[Server Configuration](docs/configuration/YAML_CONFIG.md)** - YAML config reference

### For Developers
- **[Architecture Documentation](docs/architecture/README.md)** - System architecture and design decisions
- **[Development Documentation](docs/development/README.md)** - Testing guides and development resources
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
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

Everything above is installed by `npm install` and published to npm. `@mcp-abap-adt/sap-rfc-lite` is optional and only needed for the RFC transport (and so for SNC). It is compiled during `npm install` against the SAP NW RFC SDK that `SAPNWRFC_HOME` names, and npm leaves it out without an error when it cannot be — check with `npm ls -g @mcp-abap-adt/sap-rfc-lite`. See [RFC Setup](docs/installation/RFC_SETUP.md).

---


## Running the Server

### Global Installation (Recommended)
After installing globally with `npm install -g`, you can run from any directory:

```bash
# Show help
mcp-abap-adt --help

# Default stdio mode (for MCP clients; requires .env file or --mcp parameter)
mcp-abap-adt

# stdio mode (explicit; default when --transport is omitted)
mcp-abap-adt --transport=stdio

# HTTP mode on custom port (HTTP requires --transport=http)
mcp-abap-adt --transport=http --port=8080

# Use stdio mode with auth-broker (--mcp parameter)
mcp-abap-adt --transport=stdio --mcp=TRIAL

# Use env destination from platform sessions store
mcp-abap-adt --env=trial

# Use explicit .env file path
mcp-abap-adt --env-path=/path/to/my.env

# SSE mode (requires .env file or --mcp parameter)
mcp-abap-adt --transport=sse --port=3001

# SSE mode with auth-broker (--mcp parameter)
mcp-abap-adt --transport=sse --mcp=TRIAL

# The compact server takes the same options (npm install -g @mcp-abap-adt/compact)
mcp-abap-adt-compact --env-path=/path/to/my.env
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
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
```

For a JWT you already hold (SAP BTP):
```bash
SAP_URL=https://your-btp-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=none
SAP_JWT_TOKEN=your-jwt-token
```

For RFC connection:
```bash
SAP_URL=http://your-onprem-system.example:8000
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CONNECTION_TYPE=rfc
```

`SAP_CONNECTION_TYPE=rfc` in the `--env` / `--env-path` `.env` selects RFC, as do `--connection-type=rfc`, the process environment and YAML `connection-type: rfc`. Precedence: CLI, then the process environment (which the `.env` value joins, never over one already set), then YAML. Over RFC the host comes from `SAP_URL` and the system number from its port (`80NN` → `NN`); a port that follows no such rule needs `SAP_SYSNR` in the process environment. See [RFC Setup Guide](docs/installation/RFC_SETUP.md) for prerequisites (SAP NW RFC SDK, a C++ toolchain, `SAPNWRFC_HOME` before the install).

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
The credential of the installed SNC product (for example a Secure Login Client) is mapped to an ABAP user by its SNC name. `SAP_CONNECTION_TYPE=rfc` (or `--connection-type=rfc`) is required: SNC logs on over RFC only, and an SNC destination with HTTP is refused. SNC needs the SAP NW RFC SDK and `@mcp-abap-adt/sap-rfc-lite`, an optional dependency — see [RFC Setup](docs/installation/RFC_SETUP.md).

> **Not supported since 16.0:** `SAP_AUTH_TYPE=certificate` and `kerberos`, `saml`, and a `jwt` grant other than `authorization_code` and `none`, in a `.env` or service key are refused at startup, naming the authentication (a `saml` destination with no grant: `lacks: grantType`). See the [migration note](docs/MIGRATION-16.0.md) for what to do instead.

**Generate a `.env` (JWT):**
```bash
# Install the CLI globally (one-time setup) — it ships mcp-auth and mcp-sso
npm install -g @mcp-abap-adt/auth-broker-cli

# Write a .env that states its authentication and grant
mcp-auth generate-env --grant authorization_code   # `mcp-auth --help` lists the other flags
```

The `.env` states `SAP_AUTH_TYPE` and `SAP_GRANT_TYPE`; a `jwt` `.env` without a grant is refused at startup.

**.env comments rule:** only full-line comments are supported (lines that start with `#`).  
Inline comments are not parsed, so keep comments on separate lines.

**Claude recommendation:** place the service key in the service-keys directory and use `--mcp=<destination>` (avoid manual JWT tokens).

### Command-Line Options

**Authentication:**
- `--mcp=<destination>` - Named destination: `service-keys/<destination>.json` and `sessions/<destination>.env`, field by field
- `--auth-broker-path=<path>` - Custom path for auth-broker service keys and sessions
- `--browser=<name>` - Browser for a login: `chrome`, `edge`, `firefox`, `system` (default), `headless`, `none`
- `--browser-auth-port=<port>` - Browser login callback port, 1-65535 (default: `61001`); an invalid value is refused at startup
- `--allow-destination-header` - Honour the `x-mcp-destination` header (HTTP/SSE only, off by default)
- `--connection-type=<http|rfc>` - SAP connection transport: `http` (default) or `rfc`
- `--unsafe` - Write named destinations' sessions to disk. By default they are kept in memory (one login per process). A `.env` you name is written back either way

When `--mcp=<destination>` is specified, automatic fallback loading of `./.env` is skipped.

**Examples:**
```bash
# Named destination, session kept in memory (default)
mcp-abap-adt --mcp=TRIAL

# Named destination, session persisted to sessions/TRIAL.env
mcp-abap-adt --mcp=TRIAL --unsafe

# Custom base directory for service-keys/ and sessions/
mcp-abap-adt --mcp=TRIAL --auth-broker-path=~/prj/tmp/ --unsafe

# Browser login on another callback port
mcp-abap-adt --mcp=TRIAL --browser-auth-port=61005
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

**Two packages, two licences.** Which one applies depends on which you install.

| Package | Licence | |
|---|---|---|
| `@mcp-abap-adt/lib` | Apache-2.0 | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE) |
| `@mcp-abap-adt/core` | AGPL-3.0-only | [`server/LICENSE`](server/LICENSE) |

Both are published from this repository with one command, in the order the
dependency requires:

```bash
npm run release:dry        # rehearses both, touches nothing
npm run release:publish    # @mcp-abap-adt/lib, then @mcp-abap-adt/core
```

`release:publish` skips a version already on the registry, so re-running after
a failure resumes rather than starting over. It aborts on the first failure
instead of publishing the server on top of a library that is not there.

Note that `npm publish` and `npm run` are different commands. `npm publish
release` asks npm to publish a package *named* `release`, which is somebody
else's package on the registry.

Copyright © 2025–2026 Oleksii Kyslytsia

Both are distributed in the hope that they will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.

**What this means.** Running either, on your own data, carries no conditions.

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

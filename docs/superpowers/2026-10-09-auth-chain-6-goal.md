# The server on the 6.0.0 auth chain — goal

The spec and the plan answer this file. If either needs to depart from
anything under *Holds throughout*, this file changes first.

## Goal

The server `mcp-abap-adt` stands on the auth chain as it is published now:

| Package | Version |
|---|---|
| auth-broker | 5.0.x |
| auth-providers | 6.0.x |
| auth-stores | 4.0.x |
| connection | 15.0.x — a major on interfaces-adt-connection 2, with a per-request signal (below) |
| interfaces-auth | 7.5.x |
| auth-errors | 2.2.x |

Everything 6.0.0 guarantees a holder of a provider, and everything broker
5.0.0 guarantees its consumer, reaches the server's users intact through the
server.

**The server is split by transport into packages, one mode each:**

| Mode | Package | Who uses it | Where credentials come from | Who owns them |
|---|---|---|---|---|
| **stdio** | `@mcp-abap-adt/core` (bin `mcp-abap-adt`) | one user, who owns the process | the default destination (`--mcp` / `--env` / `--env-path`), service keys included — through the broker, with its session files and an interactive (browser) login when one is needed | the server: cancellation, session writes, renewal |
| **Streamable HTTP** | a new package with its own bin | many users | **only the credentials the user sends in the request's headers** (`x-sap-*`: a user and password, or a token), through providers built directly from auth-providers 6.0.0 — nothing else: no destination, no server-side token, no credential the server holds of any kind | the request that carries them; the server keeps none |
| **SSE** (HTTP+SSE) | a new package with its own bin | many users | **only the credentials the user sends in the headers of the request that opens the SSE connection** (`x-sap-*`), exactly as Streamable HTTP — nothing else | that connection; the server keeps none beyond it |
| **embedded** | `@mcp-abap-adt/lib` (`EmbeddableMcpServer`) | the consumer's application | the consumer: its injected connection, or the credentials it gives per request | the consumer: authentication, cancellation, persistence; the server keeps none |

- **`@mcp-abap-adt/core`** is stdio only. It holds the default destination,
  service keys, `--unsafe` and the browser login, and it is the only package
  that depends on auth-broker and auth-stores: that code leaves
  `@mcp-abap-adt/lib`.
- **The HTTP package** serves Streamable HTTP only. It depends on
  `@mcp-abap-adt/lib` and auth-providers, never on auth-broker or
  auth-stores.
- **The SSE package** serves HTTP+SSE only, by the same rules as the HTTP
  package: credentials only from the user's headers, per connection; no
  default destination, no broker, no stores. It depends on
  `@mcp-abap-adt/lib` and auth-providers only. The HTTP and SSE packages do
  not depend on each other.
- **`@mcp-abap-adt/lib`** keeps the tools, the embeddable server, and
  building providers from header credentials.
- **SSE stays.** Some clients still speak only SSE; it keeps working, in a
  package of its own.
- **The compact server is one package per transport** — stdio, Streamable
  HTTP and SSE — by the same principle: each carries only its transport's
  options and dependencies, so compact over HTTP or SSE never pulls in the
  broker or the stores. On each transport it behaves exactly as the full
  server; only the tool set, and the principle its sets are formed by,
  differ.
- **An SSE connection's server instance is disposed when the connection
  closes**, as the server disposes everything it owns, and SSE connections
  take part in shutdown exactly as Streamable HTTP requests do.

Some decisions the chain leaves to its consumer: how long an interactive login
may wait, what cancels it, and what a failure looks like to the user. The
server takes each of these in the open, in its own configuration or code. It
never hides one and never guesses one.

**Success:**
- **Each package has only its own options and its own credentials.**
  - **No compatibility checks between modes.** Each binary accepts only the
    options of its own mode; an option of another mode is unknown to it.
  - **The HTTP and SSE packages, and compact over them,** have no default
    destination, no `x-mcp-destination`, no `--allow-destination-header`, no
    session file and no interactive login. None of them has a dependency on
    auth-broker or auth-stores, and the HTTP and SSE packages none on each
    other — checked by a test reading each `package.json` and its import
    graph.
  - **`@mcp-abap-adt/core`** serves its default destination through the
    broker; its interactive login shows its URL where the one user can act on
    it.
  - **`@mcp-abap-adt/lib`** has no dependency on auth-broker or auth-stores.
  - **Embedded** uses what the consumer gives and keeps nothing.
- **Failures reach the user as the chain made them.** A failure the broker, a
  provider or the connection produces reaches the MCP client in the chain's
  own facts and words: its `kind`, its `reason` and `hint`. The server reads
  failures only through auth-errors (`readFailure`, `kind`). Nothing in the
  server:
  - matches on an error's words or message;
  - uses `instanceof` on an error class of the chain;
  - parses the text of an `AggregateError` entry.
- **A connection derived from an injected one stays the consumer's.** Some
  operations need a fresh connection of their own: every caller of
  `openFreshConnection` (`src/lib/packageSessions.ts`), which today is RFC
  `CreatePackage` and `LockPackage`, and `DeletePackage`'s fallback. Today,
  on an injected connection, that path rebuilds credentials from the
  connection's configuration.
  - **Instead:** the server never rebuilds a credential from an injected
    connection's configuration. It asks the consumer for a fresh connection
    through a factory the consumer supplies explicitly.
  - **Without that factory**, the operation is refused, naming what is
    missing. Nothing is guessed.
  - **Ownership:** that connection's authentication, cancellation and
    persistence are the consumer's.
  - **Tests:** each of those callers on an injected connection, with a
    factory and without one, where the configuration holds no usable
    credential.
- **A request ends when its client ends it, in every mode.**
  - **A cancelled request does not reach its tool**, in every mode.
  - **A cancelled request is not sent, on a connection the server builds.**
    When an MCP request is cancelled, or its client goes away, nothing more of
    it reaches the SAP system — not a first send, not a resend after a
    renewal, not after a connection's logon, over HTTP or RFC. A request
    already sent is not recalled.
  - **On a connection the consumer gives** — injected, or returned by its
    fresh-connection factory — the server passes each request's signal: in
    every request's options, and to the factory. That is all it does there:
    honouring the signal is the consumer's contract, stated in the embedding
    docs and the migration note. Nothing more is promised for a consumer's
    connection that ignores it.
  - **Tests:** the signal reaches an injected connection's request options
    and the consumer's factory; a cancelled request never reaches the tool.
  - **Its waits end.** Every wait the request started ends when it is
    cancelled — a broker call, a login, a renewal, a fresh connection — and
    only that request's wait ends: another request's wait on the same work
    goes on.
  - **stdio's interactive login** ends when the request that needs it is
    cancelled, or when the client leaves; the callback port is free
    afterwards, and a later request can log in.
  - **Any bound is the server's, and visible.** The server sets an upper bound
    on a login, or on anything else, only as its own stated, configurable
    choice. The chain sets none.
- **Session writes are the server's stated choice.**
  - **Where they happen:** stdio only — the `--env` / `--env-path` file the
    server serves, and session files under `--unsafe`.
  - **`--unsafe` is a development mode.** In it a session write that fails
    warns and the request goes on.
  - **Shutdown.** The server flushes pending writes when it shuts down.
  - **Discarded refresh tokens.** A refresh token the renewal discarded does
    not come back after a restart, unless a write that failed was reported.
- **Renewal is the server's stated choice.** The server passes the broker a
  renewal strategy it names, or lets its user choose one, and documents it.
- **Debug output is opt-in and safe.** The providers' debug line comes on only
  through the server's own explicit option. It never comes on from the
  environment. Without it, no log line, MCP response or error the server
  emits carries a secret, server text, an authorization URL or `state`.
- **What works today keeps working, or the migration note says what to do.**
  - stdio (`mcp-abap-adt`): `--mcp`, `--env`, `--env-path`, the destination
    folder and service keys; basic, `jwt` / `authorization_code`, `jwt` /
    `none`, SNC; the browser choice and the callback port.
  - HTTP: `x-sap-*` headers keep working, served by the HTTP package and its
    bin. The migration note says where HTTP moved, and that the default
    destination and `x-mcp-destination` are gone: pass `x-sap-*` headers.
  - SSE: `x-sap-*` headers keep working, served by the SSE package and its
    bin. The migration note says where SSE moved, and that the default
    destination and `x-mcp-destination` are gone: pass `x-sap-*` headers.
  - Compact: over stdio as today, over Streamable HTTP and over SSE, each
    from its own package.
  - Embedded consumers: the migration note names every change they meet.
- **The Docker images and the release artifacts follow the split.**
  - **`docker/Dockerfile`** (today: HTTP with `--allow-destination-header`,
    `/mcp/health`, mounted `service-keys/` and `sessions/`) installs and runs
    the HTTP package: no destination routing, no credential mounts. Its
    health endpoint and a tool call carrying only `x-sap-*` headers are
    verified on the built image.
  - **`docker/Dockerfile.inspect`** (Glama: stdio core behind `mcp-proxy`)
    keeps working on core, or is migrated explicitly.
  - **The compose files** (`docker/docker-compose*.yml`) match the images
    they run.
  - **Build, publish and smoke** (`.github/workflows/ci.yml`,
    `release.yml`, the bin smoke test) include every new package — HTTP,
    SSE, and compact over each; `docs/deployment/RELEASE.md`'s table and
    publish order name them;
    `server.json`, `server-compact.json`, `glama.json` and the registry
    metadata say which package serves which transport.
- **One release.** Every package, the new ones included, is released as one
  major, 18, from one pull request.
- **Measured on real systems before release.** These are run against real
  systems, each recorded with its date:
  - stdio, `jwt` / `authorization_code` on the BTP trial, the browser login
    included;
  - HTTP with `x-sap-*` headers;
  - SSE with `x-sap-*` headers;
  - basic over HTTP and RFC;
  - SNC over RFC on Windows, over stdio.

## Why

- **The server is behind the chain.** It still builds on:
  - auth-broker 4.1;
  - auth-providers 5.4;
  - auth-stores 3.3;
  - connection 11;
  - interfaces-auth 3.2.

  The current chain no longer accepts these. Until the server moves, none of
  the chain's guarantees reach its users.
- **What the current code does:**
  - It reads `AuthRefusedError.message` instead of the refusal's `kind`
    (`src/lib/auth/errors.ts`).
  - It matches the broker's `AggregateError` entries with a regular
    expression (`src/lib/auth/brokerFactory.ts`).
  - It passes no cancellation signal to any login or request.
  - It cannot choose renewal or what a failed write means.
- **Destinations over HTTP cost more than they give.** A destination served to
  many users shares one person's credential, session files and browser login
  across them; nobody uses it, and every rule above would have to hold for it
  too.
- **One binary for every transport mixes their options.** A package per
  transport carries only its own options and dependencies, so no check is
  needed to keep them apart.
- **SSE is a compatibility choice, not a technical one.** MCP deprecates
  HTTP+SSE, but some clients still speak only SSE, and there is no data on
  who uses it; removing it would break them for no technical need. A package
  of its own keeps its options and dependencies apart, as for every other
  transport.

## Holds throughout

1. **The consumer composes; nobody guesses.** The server is a consumer of the
   broker. Each choice it makes for the broker is made explicitly, in its own
   configuration or code, never as a hidden default or a heuristic. A choice
   that belongs to the server's user stays the user's.
2. **Nothing goes out that should not.**
   - **Not in tool results, logs or errors.** No secret, server text,
     authorization URL or `state` appears in an MCP tool result, a log line or
     an error.
   - **Stdout:** the server writes nothing to stdout that a stdio transport
     would read as protocol.
   - **One exception: the login itself.** An interactive login shows its
     authorization URL only where the user can act on it, never in a log line
     or a tool result.
3. **A credential stays bound to what it was obtained for.** The broker's
   bindings hold through the server.
   - **Not across destinations or means.** The server never reuses a
     credential for another destination, or for means it was not obtained
     for.
   - **Per-request credentials are never stored or shared.** Credentials from
     headers serve only the request that carried them.
4. **The modes are separated by package.** The default destination, the
   broker, auth-stores, session files and interactive login exist in
   `@mcp-abap-adt/core` (stdio) only. The HTTP and SSE packages work only
   with the credentials the user sends in the headers — per request, or per
   SSE connection — nothing else: no destination, no server-side token, no
   credential the server holds of any kind — and they, and compact over
   them, depend on neither auth-broker nor auth-stores. An embedding
   consumer's credentials and connections stay the consumer's: the server
   hands them each request's signal and does not wrap them.
5. **No built-in timeouts of the chain's making.** A wait ends with a result,
   an explicit error, a cancellation, or a bound the server states as its own
   choice.
6. **One implementation of each rule.** What the chain already ships, the
   server uses rather than re-implements:
   - reading a failure;
   - sharing a build;
   - the refresh state;
   - the browsers;
   - cancelling a request at the connection's boundaries.
7. **Registry only.** Released packages declare only semver ranges that
   resolve on npm. A change the server needs in a chain package is released
   there first, and the server waits for it.
8. **No regular expressions over untrusted input.** Error text, server text
   and configuration values are read by plain code or the platform's parser.

## Out of scope

- The proxy (`mcp-abap-adt-proxy`) and the calm server. Each migrates in its
  own change afterwards.
- Changes to the chain's packages, beyond those the server needs and waits for,
  each released on the current line after the debugger releases
  (interfaces-adt 13.1.0, adt-clients with the debugger):
  - `@mcp-abap-adt/interfaces-adt-connection` 2.1.0 — a per-request signal in
    the request options, and the code of an aborted request;
  - `@mcp-abap-adt/interfaces-adt` 13.2.0 — the signal in the client's options,
    and the authentication refusal kept on a failure;
  - `@mcp-abap-adt/connection` 15.0.0 — a major on interfaces-adt-connection 2,
    with the signal honoured at every send boundary, HTTP and RFC;
  - `@mcp-abap-adt/adt-clients` 26.1.0 — the signal on every request, releases
    never cancelled, the refusal kept;
  - `@mcp-abap-adt/auth-broker` 5.1.0 — a handed-over token without a binding
    bound by the broker itself.

  Any other defect found there goes to its own repository, and the server waits
  for the fix to be published.
- New grants, client certificates for the server, and passwordless HTTP
  login.
- `mcp-auth snc`, which is the CLI's own change (3.1.0).
- A pool of MCP server instances for the HTTP package (state that outlives
  one request, such as a debugger session named by a handle). It follows
  this change, once the split has landed.

## Open — for the spec

1. The HTTP and SSE packages, and compact over each transport: their names,
   their bins' names, and their options; where the helpers both HTTP
   transports share live.
2. What `@mcp-abap-adt/lib` exports once the destination code moves to
   `@mcp-abap-adt/core`, and what moves with it.
3. Where the server's login bound lives (stdio):
   - a command-line option, a configuration field or both;
   - its default: none, or a stated value.
4. How a request's cancellation reaches the broker, the providers and the
   connection:
   - which signal each broker call gets;
   - what the connection must offer, and in which release, so that a
     cancelled request is not sent;
   - what the server's `LoginLock` becomes in stdio.
5. Renewal, and what a failed session write means outside `--unsafe` (the
   `--env` / `--env-path` file stdio writes back):
   - the server's choice;
   - whether the user can change it, and where.
6. What an MCP client sees for each failure `kind`: words, hint and
   diagnostics, and what stays out.
7. The browser choice: how today's options map to the providers' `IBrowser`
   factories, and the migration note for any option that goes.
8. The release of every package as one major, and the migration note for
   users of each mode — stdio, Streamable HTTP, SSE, compact over each — and
   for embedding consumers.

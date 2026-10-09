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
| connection | 14.x, with a per-request signal (below) |
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
| **embedded** | `@mcp-abap-adt/lib` (`EmbeddableMcpServer`) | the consumer's application | the consumer: its injected connection, or the credentials it gives per request | the consumer: authentication, cancellation, persistence; the server keeps none |

- **`@mcp-abap-adt/core`** is stdio only. It holds the default destination,
  service keys, `--unsafe` and the browser login, and it is the only package
  that depends on auth-broker and auth-stores: that code leaves
  `@mcp-abap-adt/lib`.
- **The HTTP package** serves Streamable HTTP only. It depends on
  `@mcp-abap-adt/lib` and auth-providers, never on auth-broker or
  auth-stores.
- **`@mcp-abap-adt/lib`** keeps the tools, the embeddable server, and
  building providers from header credentials.
- **SSE is removed.** It has no advantage over Streamable HTTP and is
  deprecated in MCP.
- **The compact packages** keep wrapping `@mcp-abap-adt/core` (stdio) as
  today.

Some decisions the chain leaves to its consumer: how long an interactive login
may wait, what cancels it, and what a failure looks like to the user. The
server takes each of these in the open, in its own configuration or code. It
never hides one and never guesses one.

**Success:**
- **Each package has only its own options and its own credentials.**
  - **No compatibility checks between modes.** Each binary accepts only the
    options of its own mode; an option of another mode is unknown to it.
  - **The HTTP package** has no default destination, no `x-mcp-destination`,
    no `--allow-destination-header`, no session file and no interactive
    login. It has no dependency on auth-broker or auth-stores — checked by a
    test reading its `package.json` and its import graph.
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
  - **A cancelled request is not sent.** When an MCP request is cancelled, or
    its client goes away, nothing more of it reaches the SAP system — not a
    first send, not a resend after a renewal, not after a connection's logon,
    over HTTP or RFC. A request already sent is not recalled.
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
  - SSE: removed. The migration note says to use Streamable HTTP.
  - Compact: as today, over stdio.
  - Embedded consumers: the migration note names every change they meet.
- **One release.** Every package, the new HTTP package included, is released
  as one major, 18, from one pull request.
- **Measured on real systems before release.** These are run against real
  systems, each recorded with its date:
  - stdio, `jwt` / `authorization_code` on the BTP trial, the browser login
    included;
  - HTTP with `x-sap-*` headers;
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
- **SSE adds nothing.** Streamable HTTP covers it, and MCP deprecates it.

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
   `@mcp-abap-adt/core` (stdio) only. The HTTP package works only with the
   credentials the user sends in the request's headers — nothing else: no
   destination, no server-side token, no credential the server holds of any
   kind — and depends on neither auth-broker nor auth-stores. An embedding
   consumer's credentials stay the consumer's.
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
- Changes to the chain's packages, beyond the per-request signal the server
  needs from connection. A defect found there goes to its own repository, and
  the server waits for the fix to be published.
- New grants, client certificates for the server, and passwordless HTTP
  login.
- `mcp-auth snc`, which is the CLI's own change (3.1.0).

## Open — for the spec

1. The HTTP package: its name, its bin's name, and its options.
2. What `@mcp-abap-adt/lib` exports once the destination code moves to
   `@mcp-abap-adt/core`, and what moves with it.
3. Whether a compact server over HTTP is wanted; the default is none.
4. Where the server's login bound lives (stdio):
   - a command-line option, a configuration field or both;
   - its default: none, or a stated value.
5. How a request's cancellation reaches the broker, the providers and the
   connection:
   - which signal each broker call gets;
   - what the connection must offer, and in which release, so that a
     cancelled request is not sent;
   - what the server's `LoginLock` becomes in stdio.
6. Renewal, and what a failed session write means outside `--unsafe` (the
   `--env` / `--env-path` file stdio writes back):
   - the server's choice;
   - whether the user can change it, and where.
7. What an MCP client sees for each failure `kind`: words, hint and
   diagnostics, and what stays out.
8. The browser choice: how today's options map to the providers' `IBrowser`
   factories, and the migration note for any option that goes.
9. The release of every package as one major, and the migration note for
   users of each mode, for users of SSE, and for embedding consumers.

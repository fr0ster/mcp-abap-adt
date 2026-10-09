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
| connection | 14.0.x |
| interfaces-auth | 7.5.x |
| auth-errors | 2.2.x |

Everything 6.0.0 guarantees a holder of a provider, and everything broker
5.0.0 guarantees its consumer, reaches the server's users intact through the
server.

**The server has three credential sources:**

| Source | How it authenticates | Who owns it |
|---|---|---|
| A destination the server manages: `--env`, the destination folder, service keys | through the broker | the server owns its cancellation, session writes and renewal choice |
| Credentials given per request or per instance: `x-sap-*` headers, a `SapConfig` | through providers the server builds directly from auth-providers 6.0.0, not through the broker, since nothing is stored | the server; these follow the same failure, cancellation and no-secret rules |
| A connection an embedding consumer injects into `EmbeddableMcpServer` | by the consumer | the consumer owns its authentication, cancellation and persistence; the server uses it as given and never re-authenticates or wraps it | Some
decisions the chain leaves to its consumer: how long an interactive login may
wait, what cancels it, and what a failure looks like to the user. The server
takes each of these in the open, in its own configuration or code. It never
hides one and never guesses one.

**Success:**
- **Failures reach the user as the chain made them.** A failure the broker, a
  provider or the connection produces reaches the MCP client in the chain's
  own facts and words: its `kind`, its `reason` and `hint`. The server reads
  failures only through auth-errors (`readFailure`, `kind`). Nothing in the
  server:
  - matches on an error's words or message;
  - uses `instanceof` on an error class of the chain;
  - parses the text of an `AggregateError` entry.
- **A login ends when someone ends it.**
  - **Before any MCP request exists.** The HTTP and SSE transports log in
    while a client connects (`StreamableHttpServer`'s first connect,
    `SseServer`'s `init`), before an MCP transport or request exists.
    - The client's disconnect cancels that login; its listener is installed
      before setup begins.
    - A client waiting in the queue for the first connect (`FirstConnectLock`)
      leaves the queue when it disconnects.
    - The callback port is free afterwards, and the next client can log in.
  - **Cancellation follows the MCP client.** An interactive login the server
    starts is cancelled when the MCP request that needs it is cancelled. Every
    broker call a request makes takes that request's signal.
  - **Closing a session cancels its waits.** When an MCP session closes, the
    waits its `getProvider` signal covers are cancelled.
  - **Any bound is the server's, and visible.** The server sets an upper bound
    on a login only as its own stated, configurable choice. The chain sets
    none.
  - **Nothing keeps waiting for a client that left.** A login started for a
    request whose client has gone does not keep running.
  - **One waiter leaving ends only its own wait.**
    - **Sharing.** Credentials are shared per destination: one provider per
      destination's means, as the broker caches it, across MCP sessions.
    - **"Session"** means an MCP session.
    - **A request's cancellation, or a session's close, ends only that
      caller's wait.** A concurrent request on the same destination still gets
      its token. A later request after a cancellation starts afresh and
      succeeds. A login on another destination is untouched.
    - **Tests** cover each of these, one at a time.
- **Session writes are the server's stated choice.**
  - **Failed writes.** The server chooses what a failed session write means
    (`onWriteFailure`) and says so in its configuration docs.
  - **Shutdown.** It flushes pending writes when it shuts down.
  - **Discarded refresh tokens.** A refresh token the renewal discarded does
    not come back after a restart.
- **Renewal is the server's stated choice.** The server passes the broker a
  renewal strategy it names, or lets its user choose one, and documents it.
- **Debug output is opt-in and safe.** The providers' debug line comes on only
  through the server's own explicit option. It never comes on from the
  environment. Without it, no log line, MCP response or error the server
  emits carries a secret, server text, an authorization URL or `state`.
- **What works today keeps working, or the migration note says what to do.**
  Every way a user configures a destination today keeps working, or the
  migration note names its replacement:
  - `--env`, the destination folder and service keys;
  - basic, `jwt` / `authorization_code`, SNC and the rest;
  - the browser choice and the callback port.

  This holds for consumers that embed the server (`EmbeddableMcpServer`) too.
- **Measured on real systems before release.** These are run against real
  systems, each recorded with its date:
  - basic over HTTP and RFC;
  - `jwt` / `authorization_code` on the BTP trial, the browser login included;
  - SNC over RFC on Windows.

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
  - It passes no cancellation signal to any login.
  - It cannot choose renewal or what a failed write means.

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
   - **Across sessions, as the broker shares it.** MCP sessions on the same
     destination share it as the broker does.
   - **Per-request credentials are never stored or shared.** Credentials from
     headers or a `SapConfig` serve only the request or instance that gave
     them.
4. **No built-in timeouts of the chain's making.** A wait ends with a result,
   an explicit error, a cancellation, or a bound the server states as its own
   choice.
5. **One implementation of each rule.** What the chain already ships, the
   server uses rather than re-implements:
   - reading a failure;
   - sharing a build;
   - the refresh state;
   - the browsers.
6. **Registry only.** Released packages declare only semver ranges that
   resolve on npm.
7. **No regular expressions over untrusted input.** Error text, server text
   and configuration values are read by plain code or the platform's parser.

## Out of scope

- The proxy (`mcp-abap-adt-proxy`) and the calm server. Each migrates in its
  own change afterwards.
- Changes to the chain's packages. A defect found there goes to its own
  repository, and the server waits for the fix to be published.
- New grants, client certificates for the server, and passwordless HTTP
  login.
- `mcp-auth snc`, which is the CLI's own change (3.1.0).

## Open — for the spec

1. Where the server's login bound lives:
   - a command-line option, a configuration field or both;
   - its default: none, or a stated value;
   - how an `EmbeddableMcpServer` consumer sets it for the paths the server
     owns.
2. How a client's disconnect before dispatch, an MCP request's cancellation
   and a session's close reach the broker and the direct providers:
   - which signal each broker call gets;
   - what the server's `LoginLock` becomes, now that the providers' strategies
     own the port.
3. The renewal strategy and `onWriteFailure`:
   - the server's choice;
   - whether the user can change it, and where.
4. What an MCP client sees for each failure `kind`: words, hint and
   diagnostics, and what stays out.
5. The browser choice: how today's options map to the providers' `IBrowser`
   factories, and the migration note for any option that goes.
6. The version, the release (a major), and the migration note for users and
   for embedding consumers.

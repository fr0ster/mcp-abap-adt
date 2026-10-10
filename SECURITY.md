# Security

## The rule

**mcp-abap-adt is never more secure than the machine it runs on and the
network between it and its client.** It reaches an SAP system with real
credentials. Whoever controls the process, its files, its environment, or
the traffic to it, can do whatever those credentials allow. The server does not
pretend otherwise and does not promise what only the deployment can provide.

## What travels, and where it is kept

- **Credentials.**
  - A destination's credentials live in its `.env` or service key on the
    machine, and in the session files the broker writes.
  - Over HTTP, `x-sap-*` headers carry a user and password, or a token, on
    every request.
- **State handles.**
  - A tool that creates state that outlives one call, such as a debug session,
    returns a `state_handle`, and later calls send it back.
  - The server checks every call that carries a handle against the caller:
    - an `x-sap-*` request must present the same credentials (a keyed hash of
      user and password) or a token of the same SAP user (asked of SAP itself);
    - a destination request must name the same destination.
  - A handle is therefore no key on its own. But it travels in tool arguments,
    so it ends up in the model's context and in chat transcripts.
- **SAP sessions.** The server holds them in its process. Their cookies never
  leave it.

## What follows for a deployment

- **stdio:** the process belongs to one user, on that user's machine. Protect
  the machine and the files the destination uses.
- **HTTP / SSE:** bind to `127.0.0.1` (the default) unless the server must be
  reached from elsewhere.
  - If it must, serve HTTPS (`--tls-cert` / `--tls-key`), because credentials and
    state handles are in every request.
  - Restrict who can reach the port: `--http-allowed-hosts`,
    `--http-allowed-origins` and DNS-rebinding protection, plus a firewall or
    a reverse proxy.
- **Destinations over HTTP:** anyone who can reach the server can act as that
  destination's SAP user. A destination is the operator's grant, not a
  per-caller one. Expose a destination-backed server only to the people
  entitled to that user.
- **Isolation** — a container, a dedicated OS user, read-only mounts for keys —
  is the deployer's choice and responsibility.
- **Logs** are written not to carry credentials: the wire trace
  (`DEBUG_HTTP_WIRE`) redacts header values by name, and failures are logged
  by class rather than by message where a message could quote a file. They
  do carry object names, URLs and state handles. Treat logs as internal, and
  do not enable the wire trace on a shared machine.

## Reporting a vulnerability

Open a [GitHub security advisory](https://github.com/fr0ster/mcp-abap-adt/security/advisories/new)
rather than a public issue.

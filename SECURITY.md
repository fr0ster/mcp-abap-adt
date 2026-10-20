# Security

## The rule

**mcp-abap-adt is never more secure than the machine it runs on and the
network between it and its client.** It reaches an SAP system with real
credentials and holds live SAP sessions. Whoever controls the process, its
files, its environment or the traffic to it can do whatever those credentials
allow. The server does not pretend otherwise and promises nothing that only
the deployment can provide.

## Who may call the server

**The server does not authenticate its MCP clients.** It has no user list,
API key or client login of its own. Whoever can reach it is served:

- **stdio:** the client that started the process. Nothing is exposed on a
  network.
- **HTTP / SSE:** anyone who can open a connection to the port. Each request
  is served with the SAP credentials that request carries (`x-sap-*` headers),
  or with a configured destination's.

Access is therefore controlled where the server is reached:
- **Bind address.** The default is `127.0.0.1`, which serves this machine only. `--host=0.0.0.0` opens all interfaces; do that only behind the measures below.
- **Host and Origin allowlists** with DNS-rebinding protection: `--http-enable-dns-protection` with `--http-allowed-hosts` / `--http-allowed-origins` (and their `--sse-*` and YAML forms; see `docs/user-guide/CLI_OPTIONS.md`). These check the `Host` and `Origin` headers; they are not authentication.
- **A firewall, a reverse proxy with authentication, or a private network**, chosen by the deployer.

**A destination is the operator's grant.** Over HTTP, anyone who can reach a
destination-backed server acts as that destination's SAP user. Expose such a
server only to the people entitled to that user.

## HTTPS between the client and the server

Credentials (`x-sap-*` headers) and state handles travel in every request, so
**anything beyond `127.0.0.1` must be HTTPS.**

The server serves HTTPS when it is given a certificate and its key:

```bash
mcp-abap-adt-http --host=0.0.0.0 --port=3000 --system-type=<onprem|cloud> \
  --tls-cert=/path/server.crt --tls-key=/path/server.key [--tls-ca=/path/ca.crt]
# HTTP+SSE: mcp-abap-adt-sse takes the same --tls-* options
```

```yaml
http:            # or sse:
  tls:
    cert: /path/server.crt
    key: /path/server.key
    ca: /path/ca.crt   # optional
```

- Both files are PEM, and both are required: the server refuses a cert
  without a key and the other way round, and a missing file stops the start.
- `ca` adds the CA chain the server presents. It does **not** turn on client
  certificates: the server does not request one, so there is no mutual TLS.
  Authenticate clients in front of the server if you need it.
- Plain HTTP is served when no certificate is configured. On `127.0.0.1` that
  is acceptable for a single user; beyond it, it exposes credentials.

## TLS between the server and SAP

- The SAP system's certificate is verified by default.
- `TLS_REJECT_UNAUTHORIZED=0` (or Node's `NODE_TLS_REJECT_UNAUTHORIZED=0`)
  turns verification off. Use it only against a test system you trust, never
  in production.
- To trust a private CA, give Node the CA (`NODE_EXTRA_CA_CERTS=/path/ca.pem`)
  rather than turning verification off.

## Credentials, sessions and state handles

- **Destination credentials** live on the machine: a destination's `.env` or
  service key, and the session files the broker writes. Protect them with file
  permissions, and with read-only mounts in a container.
- **`x-sap-*` credentials** arrive with each request. The server keeps none of
  them.
- **SAP sessions** are held in the server process. Their cookies never reach
  the model, an answer or a log line. On stdio one copy leaves the process on
  purpose: the **runtime files** in `<config dir>/runtime/`, one per SAP
  session the server holds, so that a killed process's session can be taken up
  by the next stdio process of the same destination at its start, or logged
  off later by their user (the leftover-session tools). Each file is
  deleted only once its session's logoff completed (written, and SAP answered
  it or its connection failed); a forced close exits before that, so its
  sessions keep their files. An HTTP or SSE server writes
  none and serves no leftover-session tool: it holds the sessions of many users.
  - **A runtime file is a bearer secret.** Its cookies act as that SAP user for
    as long as the session lives, locks included. On Linux and macOS the
    directory is created `0700` and each file `0600`, owner-only. On Windows
    Node cannot set these modes (`chmod` changes only the read-only flag): the
    files get the ACL the directory inherits, so keep it in your own profile
    (the default `Documents\mcp-abap-adt`) and do not move it to a folder
    other accounts can read. Everywhere: keep the directory out of backups,
    synchronised folders and images, and do not share it between OS users.
  - A file holds the writing process (pid, start time), the role, the
    destination's name and where it points (URL, client, system kind), the
    SAP user the destination states (none for a token credential), the
    system information the session was looked up with (on ABAP Cloud the
    session user and the system id) and the session's cookies — no password,
    token or other credential.
  - The tools act only on files of the destination the process serves (its
    name, pointing where it points): on stdio the user and the credential
    are fixed for the process, so whoever controls the computer controls
    them. They ask SAP nothing to decide it; any other handle is answered as
    unknown.
- **State handles.** A tool that creates state outliving one call, such as a
  debug session, returns a `state_handle`, and later calls send it back. The
  handle identifies an LLM session's state.
  - **A handle is a bearer secret.** Whoever holds it acts with the SAP
    session behind it, like a session cookie: the server does not check who
    sends it. Keeping it safe is the deployer's job.
  - It travels in tool arguments, so it ends up in the model's context, chat
    transcripts and logs. Protect it like a session cookie: HTTPS for anything
    beyond `127.0.0.1`, callers isolated from one another, and no wire trace
    on a shared machine.

## Logs

The wire trace (`DEBUG_HTTP_WIRE`) redacts header values by name. Failures are
logged by class where a message could quote a file. Logs still carry object
names, URLs and state handles: treat them as internal, and do not enable the
wire trace on a shared machine.

Without `--auth-debug` no line holds a secret, and the startup summary shows one
by its presence only (`Password: set`). `--auth-debug` (the stdio binaries, the
command line or YAML only — no environment variable turns it on) routes the auth
chain's lines to stderr and names each secret a refused token request carried by
its first and last four characters: use it on your own machine only, and keep
that stderr out of shared logs.

## Deployment checklist

- **stdio:** protect the machine and the destination's files.
- **HTTP / SSE on one machine:** keep `127.0.0.1`.
- **HTTP / SSE reachable from elsewhere:**
  - HTTPS (`--tls-cert`/`--tls-key`);
  - DNS-rebinding protection with allowlists;
  - access restricted by a firewall or an authenticating proxy;
  - each caller sends its own credential in the `x-sap-*` headers: the server
    holds no destination to share.
- **Isolation:** a container, a dedicated OS user, and read-only key mounts are
  the deployer's choice and responsibility.
- **Runtime files (stdio):** keep `<config dir>/runtime/` owner-only and off
  shared or backed-up storage.
- **SAP TLS verification:** keep it on.

## Reporting a vulnerability

Open a [GitHub security advisory](https://github.com/fr0ster/mcp-abap-adt/security/advisories/new)
rather than a public issue.

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
mcp-abap-adt --transport=http --host=0.0.0.0 --port=3000 \
  --tls-cert=/path/server.crt --tls-key=/path/server.key [--tls-ca=/path/ca.crt]
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
- **SAP sessions** are held in the server process. Their cookies never leave
  it.
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

## Deployment checklist

- **stdio:** protect the machine and the destination's files.
- **HTTP / SSE on one machine:** keep `127.0.0.1`.
- **HTTP / SSE reachable from elsewhere:**
  - HTTPS (`--tls-cert`/`--tls-key`);
  - DNS-rebinding protection with allowlists;
  - access restricted by a firewall or an authenticating proxy;
  - only the destinations those callers are entitled to.
- **Isolation:** a container, a dedicated OS user, and read-only key mounts are
  the deployer's choice and responsibility.
- **SAP TLS verification:** keep it on.

## Reporting a vulnerability

Open a [GitHub security advisory](https://github.com/fr0ster/mcp-abap-adt/security/advisories/new)
rather than a public issue.

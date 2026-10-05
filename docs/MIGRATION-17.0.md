# Migrating to 17.0.0

Two changes can stop something that worked on 16.0.x. Everything else in this release is a
dependency update with nothing to do.

All five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) are **17.0.0**.

## 1. The HTTPS server certificate is verified

**Who is affected:** a destination whose `SAP_URL` is `https://…` and whose system presents a
certificate Node.js does not trust — self-signed, or issued by a company CA. RFC and SNC are not
affected; plain `http://` is not affected.

Up to 16.0.x (`@mcp-abap-adt/connection` 10) the server accepted **any** server certificate unless
`TLS_REJECT_UNAUTHORIZED=1` or `NODE_TLS_REJECT_UNAUTHORIZED=1` was set. From 17.0.0
(`@mcp-abap-adt/connection` 11) it verifies the certificate the way Node.js does, and such a system is
refused at its first request.

What to do, best first:

1. **Trust the CA.** Point `NODE_EXTRA_CA_CERTS` at a PEM file holding the company or system CA, in
   the environment of the server process (an MCP client's `env` block, or the shell that starts it):

   ```bash
   NODE_EXTRA_CA_CERTS=/path/to/company-ca.pem
   ```

   It is read when Node.js starts, so it belongs in the process environment, not in the destination's
   `.env`.

2. **Opt out, knowingly.** `TLS_REJECT_UNAUTHORIZED=0` (or `NODE_TLS_REJECT_UNAUTHORIZED=0`) turns
   verification off again. Any other value — `1`, `false`, `no`, empty — verifies. Use it only for a
   system you reach over a network you trust: without verification, anyone in between can read the
   credentials the server sends.

**Both variables belong to the process environment, not to the destination's `.env`.** The server
copies only `SAP_CLIENT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE` and `SAP_LANGUAGE` from an `--env` /
`--env-path` file into the process; a `TLS_REJECT_UNAUTHORIZED=0` line in that file is not read, and was
not read on 16.x either — there it made no difference, because nothing was verified. If an older guide
had you put it in the `.env`, move it to the MCP client's `env` block or the shell that starts the
server. It applies to every destination the process serves.

## 2. A message class and a program's test include need a responsible person

**Who is affected:** `CreateMessageClass` and `CreateProgramUnitTest` on a destination where no
responsible person is found — typically SNC or a token you hold, with no `SAP_RESPONSIBLE`.

16.0.0 refused every create that found no responsible person, with one exception: a message class,
whose create in `@mcp-abap-adt/adt-clients` 24 took no responsible, so the system filled in its own
default. A program's test include was created the same way. In `@mcp-abap-adt/adt-clients` 25.0.1
both creates send the responsible from the system context, so both are now refused like every other
create: `"error": "system_context_missing"`, naming `SAP_RESPONSIBLE`.

What to do: state `SAP_RESPONSIBLE` in the destination's `.env` (or the process environment), or send
the `x-sap-responsible` header — the same as for any other create since 16.0.0.

## Nothing to do

- **ATC** (`RunATC`) takes the same seven object types as before. `@mcp-abap-adt/interfaces-adt` 12
  adds program and include kinds; the tool does not offer them yet.
- **Activating a function module** already needed its group in `parentName`; the client now refuses
  the reference itself as well, before any request.
- **`@mcp-abap-adt/lib` consumers** who import `@mcp-abap-adt/interfaces-adt` themselves move to
  `^12.0.0` together with this release, or the tree holds two copies of the contract and TypeScript
  sees two types. `IAtcObjectRef` became a union; a reference with one of the earlier seven kinds
  still compiles.

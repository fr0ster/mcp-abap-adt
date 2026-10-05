# @mcp-abap-adt/core

The standalone MCP server for SAP ABAP ADT: stdio, SSE and streamable HTTP
transports, the launcher, TLS, the DNS-rebinding guard and the `mcp-abap-adt`
CLI.

```bash
npm install -g @mcp-abap-adt/core
mcp-abap-adt                    # stdio (default)
mcp-abap-adt --transport=http
```

It connects to the ABAP system over **HTTP** (basic or JWT), **RFC** (basic) or **SNC**
(passwordless, over RFC). HTTP needs nothing more. **RFC and SNC need the SAP NW RFC SDK, a C++
toolchain and `SAPNWRFC_HOME` set before `npm install`**: the RFC module is compiled during the
install and silently left out when it cannot be — check with `npm ls -g @mcp-abap-adt/sap-rfc-lite`.
The compact variant of this server is
[`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact). Every variant:
[Installation variants](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/INSTALLATION.md#installation-variants);
RFC and SNC: [RFC Setup](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/RFC_SETUP.md).
From 17.0.0 the HTTPS server certificate is verified — see the
[migration note](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-17.0.md).

The tools themselves are not here. They live in
[`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib), which
this package depends on.

## Licence

**AGPL-3.0-only.** See [`LICENSE`](LICENSE).

Running it on your own data carries no conditions. Distributing it, or offering
a modified version to users over a network, means passing on the same freedoms
under section 13 — including the source.

**If you are embedding ADT tools in your own application, you do not want this
package.** Install `@mcp-abap-adt/lib` instead: same handlers, same embeddable
server, Apache-2.0, and no transport to drag AGPL into your dependency tree.
That separation is the reason these are two packages.

Full documentation lives in the [repository](https://github.com/fr0ster/mcp-abap-adt#readme).

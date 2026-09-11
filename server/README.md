# @mcp-abap-adt/core

The standalone MCP server for SAP ABAP ADT: stdio, SSE and streamable HTTP
transports, the launcher, TLS, the DNS-rebinding guard and the `mcp-abap-adt`
CLI.

```bash
npm install -g @mcp-abap-adt/core
mcp-abap-adt                    # stdio (default)
mcp-abap-adt --transport=http
```

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

Full documentation lives in the [repository root](../README.md).

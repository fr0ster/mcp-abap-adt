# @mcp-abap-adt/core

The standalone MCP server for SAP ABAP ADT over **stdio**: the `mcp-abap-adt` CLI, one
destination per process through the auth broker — a service key, a session, an `--env` file, the
browser login — and the launcher.

```bash
npm install -g @mcp-abap-adt/core
mcp-abap-adt --mcp=TRIAL --system-type=cloud   # a destination from the service-keys folder
mcp-abap-adt --env-path=./mcp.env              # a .env written by mcp-auth, SAP_SYSTEM_TYPE in it
```

**The system type is required (19.0.0)** — `--system-type`, `SAP_SYSTEM_TYPE` (the environment or
the `--env` file) or YAML `system-type`: `onprem`, `cloud` or `legacy`; a destination does not
start without it. **The server connects at its start**, before the MCP transport opens — the
browser login included, and the destination's one leftover session of a killed process taken
up —; any failure ends it with exit `1`. Coming from 18.x:
[MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md).

Streamable HTTP and HTTP+SSE are packages of their own, serving credentials from each request's
`x-sap-*` headers: [`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http)
(`mcp-abap-adt-http`) and [`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse)
(`mcp-abap-adt-sse`). There is no `--transport` option: it, and any option of those binaries, stops
this one naming the binary to run. Only this package depends on `@mcp-abap-adt/auth-broker` and `@mcp-abap-adt/auth-stores`.

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

**The binary fixes the tool set (19.0.0).** `mcp-abap-adt` serves readonly (with system and search),
high, the debugger, the leftover sessions (list, logoff) and background runs; the readonly
tools alone are [`@mcp-abap-adt/core-ro`](https://www.npmjs.com/package/@mcp-abap-adt/core-ro) (`mcp-abap-adt-ro`). There is no
`--exposition`: passing it, or a config file's `exposition`, stops the start with a sentence naming
the binary to install instead.

**No low set (19.0.0).** `--exposition=…,low` stops the start with D56's sentence: *"the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)"*. Its single-step operations are compact's — see [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

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

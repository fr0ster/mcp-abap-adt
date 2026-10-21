# @mcp-abap-adt/server-runtime

The launch code of the MCP ABAP ADT servers. **It has no command of its own and you never install
it yourself**: every server package depends on it and brings it with it — over stdio
[`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core) (`mcp-abap-adt`),
[`core-ro`](https://www.npmjs.com/package/@mcp-abap-adt/core-ro),
[`compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact),
[`compact-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-ro); over Streamable HTTP
[`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http) (`mcp-abap-adt-http`),
[`http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/http-ro),
[`compact-http`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http),
[`compact-http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http-ro); over HTTP+SSE
[`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse) (`mcp-abap-adt-sse`),
[`sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/sse-ro),
[`compact-sse`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse),
[`compact-sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse-ro).

```bash
npm install -g @mcp-abap-adt/compact   # installs server-runtime with it
```

Each server is installed on its own; no server package depends on another, so installing two of
them, in one command or in two, still gives each process one copy of `@mcp-abap-adt/lib`.

## What it holds

| Path | What | Re-exported by |
|---|---|---|
| `@mcp-abap-adt/server-runtime/stdio` | the stdio launcher: `main`, `launcherFailedLine`, `StdioLauncherEdges`, `LauncherOptions`, `coreHelp`, … | `@mcp-abap-adt/core/launcher` |
| `@mcp-abap-adt/server-runtime/stdio/server` | `StdioServer`, core's parameter table, the env-file resolution, the destination source | `@mcp-abap-adt/core` |
| `@mcp-abap-adt/server-runtime/auth` | the destination layer: one auth broker per destination, its stores, the browser of a login | `@mcp-abap-adt/core/auth` |
| `@mcp-abap-adt/server-runtime/http` | the Streamable HTTP launcher: `main`, `HttpLauncherOptions`, `httpHelp`, … | `@mcp-abap-adt/http/launcher` |
| `@mcp-abap-adt/server-runtime/http/server` | `StreamableHttpServer`, http's parameter table | `@mcp-abap-adt/http` |
| `@mcp-abap-adt/server-runtime/sse` | the HTTP+SSE launcher: `main`, `SseLauncherOptions`, `sseHelp`, … | `@mcp-abap-adt/sse/launcher` |
| `@mcp-abap-adt/server-runtime/sse/server` | `SseServer`, sse's parameter table | `@mcp-abap-adt/sse` |

A server package calls its transport's `main` with its tool set, its program name, its own
version and its own package name, so `--version` and `serverInfo.version` are the server
package's. `StdioServer`, `StreamableHttpServer` and `SseServer` constructed without a version
answer this package's version; the ones `@mcp-abap-adt/core`, `http` and `sse` export answer
their own package's.

## One copy of `lib`

Each transport's `main` first counts the copies of `@mcp-abap-adt/lib` loaded in the process
(`libInstances()` of `lib`). With more than one it reads nothing — not even `--version` or
`--help` — starts nothing, and exits `1` with one line on stderr:

```
Two copies of @mcp-abap-adt/lib are loaded in this process (<file>, <file>): reinstall <package> (npm install -g <package>).
```

The files are the first two registered copies (inside a Node SEA executable, the executable's
path); `<package>` is the server package that started. No install layout measured for 19.2.0
gets there; if you see the line, reinstall each server on its own command.

## Dependencies

`@mcp-abap-adt/lib`, `@mcp-abap-adt/background-runs-memory` and `@mcp-abap-adt/responsible-rules`
are **peer dependencies**: the server package installs them, so the runtime uses the server's
copy. The auth chain (`@mcp-abap-adt/auth-broker`, `auth-stores`, `auth-providers`, …),
`@mcp-abap-adt/connection`, `@mcp-abap-adt/logger`, `@modelcontextprotocol/sdk`, `express` and
`dotenv` are its own dependencies. Every server installs the auth broker and the stores with it;
only the stdio paths (`/stdio`, `/stdio/server`, `/auth`) load them — an HTTP or SSE server never
does.

If you are embedding ADT tools in your own application, you want `@mcp-abap-adt/lib` instead: it
carries the handlers and the embeddable server under Apache-2.0, and no transport.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE).

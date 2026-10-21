# @mcp-abap-adt/server-runtime

The launch code of the MCP ABAP ADT servers. **It has no command of its own**: you install a
server package — [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)
(`mcp-abap-adt`), [`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact),
[`@mcp-abap-adt/core-ro`](https://www.npmjs.com/package/@mcp-abap-adt/core-ro),
[`@mcp-abap-adt/compact-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-ro) — and it
brings this package with it.

```bash
npm install -g @mcp-abap-adt/core   # installs server-runtime with it
```

## What it holds

| Path | What |
|---|---|
| `@mcp-abap-adt/server-runtime/stdio` | the stdio launcher: `main`, `launcherFailedLine`, `StdioLauncherEdges`, `LauncherOptions`, `coreHelp`, … |
| `@mcp-abap-adt/server-runtime/stdio/server` | `StdioServer`, core's parameter table, the env-file resolution, the destination source |
| `@mcp-abap-adt/server-runtime/auth` | the destination layer: one auth broker per destination, its stores, the browser of a login |

A server package calls the launcher's `main` with its tool set, its program name, its own
version and its own package name, so `--version` and `serverInfo.version` are the server package's.
Each transport's `main` first counts the copies of `@mcp-abap-adt/lib` loaded in the process
(`libInstances()`); with more than one it reads nothing, starts nothing, and exits `1` with one
line on stderr naming the first two copies' files and the package to reinstall. `StdioServer`
constructed without a version answers this package's version; `@mcp-abap-adt/core`'s
`StdioServer` answers core's.

`@mcp-abap-adt/core`, `@mcp-abap-adt/core/launcher` and `@mcp-abap-adt/core/auth` re-export these
paths, so an importer of core's paths sees no change.

## Dependencies

`@mcp-abap-adt/lib`, `@mcp-abap-adt/background-runs-memory` and `@mcp-abap-adt/responsible-rules`
are **peer dependencies**: the server package installs them, so one process loads one copy of
each. The auth chain (`@mcp-abap-adt/auth-broker`, `auth-stores`, `auth-providers`, …),
`@mcp-abap-adt/connection`, `@mcp-abap-adt/logger`, `@modelcontextprotocol/sdk` and `dotenv` are
its own dependencies.

If you are embedding ADT tools in your own application, you want `@mcp-abap-adt/lib` instead: it
carries the handlers and the embeddable server under Apache-2.0, and no transport.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE).

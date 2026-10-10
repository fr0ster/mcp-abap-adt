# @mcp-abap-adt/http

The HTTP transports of the MCP ABAP ADT server: `StreamableHttpServer` (and, until it is removed,
`SseServer`) serve the ADT tools of [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib)
over MCP's HTTP transports on an Express app, with DNS rebinding protection and optional TLS. The
standalone server that starts them is [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core).
Licensed AGPL-3.0-only.

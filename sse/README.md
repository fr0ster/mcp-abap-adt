# @mcp-abap-adt/sse

The HTTP+SSE transport of the MCP ABAP ADT server: `SseServer` serves the ADT tools of
[`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) over MCP's HTTP+SSE
transport on an Express app — a `GET` on the SSE path opens a connection, and that connection's
`POST`s are routed to it by `sessionId` — with DNS rebinding protection and optional TLS. The
standalone server that starts it is [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core).
Licensed AGPL-3.0-only.

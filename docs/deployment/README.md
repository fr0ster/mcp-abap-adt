# Deployment Documentation

How the server is run in a container and how a release is made.

## Files

- **[DOCKER.md](./DOCKER.md)** — running the server in Docker: the images in `docker/`, what works
  in them (HTTP, TLS) and what does not (RFC, SNC, browser login).
- **[RELEASE.md](./RELEASE.md)** — the five npm packages, `npm run release:publish`, the tag and
  the GitHub Release.
- **[GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)** — what `ci.yml` and `release.yml` run.
- **[MCP_REGISTRY.md](./MCP_REGISTRY.md)** — `server.json` (`@mcp-abap-adt/core`) and
  `server-compact.json` (`@mcp-abap-adt/compact`), `mcpName`, `mcp-publisher`.

## Related Documentation

- [Installation Guide](../installation/INSTALLATION.md) — installing from npm, the full and the
  compact server, connections, certificates
- [RFC and SNC](../installation/RFC_SETUP.md)
- [CLI Options](../user-guide/CLI_OPTIONS.md)
- [User Guide](../user-guide/README.md)

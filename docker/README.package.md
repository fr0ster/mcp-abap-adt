# Package-Based Docker Deployment

`Dockerfile.package` installs the npm tarballs in `docker/packages/` with `npm install -g`, together;
whatever they depend on and is not there comes from the registry.
Full guide: [docs/deployment/DOCKER.md](../docs/deployment/DOCKER.md).

## Preparing the tarballs

The published server (from the repository root):

```bash
npm run docker:pack                                              # the latest @mcp-abap-adt/core
npm pack @mcp-abap-adt/core@<version> --pack-destination docker/packages   # or a pinned one
```

Or a build of the checkout — pack `lib` with `core`, so `core`'s `lib` range is met by this build
rather than the registry (and the compact packages too, for `mcp-abap-adt-compact`):

```bash
npm run build
npm pack --pack-destination docker/packages
npm pack ./server --pack-destination docker/packages
# optional: npm pack ./compact-readonly ./compact-modify ./compact --pack-destination docker/packages
```

`docker/Dockerfile` does exactly this in its first stage; use it to build from a checkout.

GitHub Releases carry no tarballs.

## Building and running

```bash
mkdir -p docker/service-keys
cp /path/to/service-key.json docker/service-keys/<destination>.json
npm run docker:build:package
npm run docker:up:package
curl http://localhost:3000/mcp/health
```

The compose command is `mcp-abap-adt --transport=http --allow-destination-header`; add
`--mcp=<destination>` for a default destination. The build uses `RUN --mount`, which needs BuildKit
(the default builder of current Docker).

## Updating

```bash
npm run docker:down:package
npm run docker:pack          # empties docker/packages/ first
npm run docker:build:package
npm run docker:up:package
```

## Checking the tarballs

```bash
for f in docker/packages/*.tgz; do tar -xOzf "$f" package/package.json | grep -E '"(name|version)"'; done
```

## Limits

HTTP connections work; RFC and SNC do not (no SAP NW RFC SDK, no compiler, `--omit=optional`). TLS
settings (`NODE_EXTRA_CA_CERTS`, `TLS_REJECT_UNAUTHORIZED`) go into the compose file's
`environment:`. See [DOCKER.md](../docs/deployment/DOCKER.md#rfc-and-snc).

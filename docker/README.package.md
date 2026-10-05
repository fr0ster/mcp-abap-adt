# Package-Based Docker Deployment

`Dockerfile.package` installs a `@mcp-abap-adt/core` npm tarball instead of building from source.
Full guide: [docs/deployment/DOCKER.md](../docs/deployment/DOCKER.md).

## Preparing the tarball

`docker/packages/` must hold **exactly one** `.tgz`: the image extracts `/packages/*.tgz` into
`/app` and runs `npm install --omit=dev` there.

From the npm registry (from the repository root):

```bash
mkdir -p docker/packages
npm pack @mcp-abap-adt/core@<version> --pack-destination docker/packages
```

Or from the checkout:

```bash
npm run build
npm pack ./server --pack-destination docker/packages   # mcp-abap-adt-core-<version>.tgz
```

The tarball depends on `@mcp-abap-adt/lib` by range, and the install inside the image takes it
from npm — a tarball whose `lib` range is not yet published does not install.

GitHub Releases carry no tarballs.

## Building and running

```bash
mkdir -p docker/service-keys
cp /path/to/service-key.json docker/service-keys/<destination>.json
# edit --mcp=<destination> in docker-compose.package.yml's command
cd docker
docker compose -f docker-compose.package.yml up -d --build
docker compose -f docker-compose.package.yml logs -f
curl http://localhost:3000/mcp/health
```

The build uses `RUN --mount`, which needs BuildKit (the default builder of current Docker).

## Updating

```bash
cd docker
docker compose -f docker-compose.package.yml down
rm packages/*.tgz
npm pack @mcp-abap-adt/core@<new version> --pack-destination packages
docker compose -f docker-compose.package.yml up -d --build
```

## Checking the tarball

```bash
tar -xOzf docker/packages/*.tgz package/package.json | grep -E '"(name|version)"'
```

## Limits

The image is `node:22-bookworm-slim` with production dependencies only: HTTP connections work, RFC
and SNC do not (no SAP NW RFC SDK, no compiler). TLS settings (`NODE_EXTRA_CA_CERTS`,
`TLS_REJECT_UNAUTHORIZED`) go into the compose file's `environment:`. See
[DOCKER.md](../docs/deployment/DOCKER.md#rfc-and-snc).

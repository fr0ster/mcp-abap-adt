# GitHub Actions

The repository has two workflows, both in `.github/workflows/`. Neither publishes to npm or to
the MCP Registry, and neither needs a secret beyond the built-in `GITHUB_TOKEN`.

## CI (`ci.yml`)

**Trigger:** push to `main` or `develop`; pull requests to `main` or `develop`.

**Matrix:** `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 22 and 24.

**Steps, on every combination:**
1. `npm ci`
2. Biome lint: `npx biome check src --diagnostic-level=error`, then each package's `lint:check`
   (`server`, `http`, `sse`, `background-runs-memory`, `responsible-rules`, `compact-http`, `compact-sse` and the six
   `-ro` packages)
3. `npm run build`
4. Test type-check: `npm run test:check`
5. `npm test` (its Jest roots hold the compact and `-ro` packages' suites)
6. The server, http, sse, background-runs-memory and responsible-rules tests: `npm --prefix <dir> run test:check`,
   `npm --prefix <dir> test`

Every step gates the run; none is `continue-on-error`.

**On Ubuntu / Node 22 only:**
- `npm audit --omit=dev --audit-level=high`
- `npm pack` of all seventeen packages (`lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`,
  `compact-modify`, `http`, `sse`, `core`, `compact`, `compact-http`, `compact-sse`, `core-ro`,
  `http-ro`, `sse-ro`, `compact-ro`, `compact-http-ro`, `compact-sse-ro`)
- an install of the seventeen tarballs into an empty directory, a check that no package resolved a
  sibling other than the one built in that run (a nested copy is one the registry supplied), and
  `--version` and `--help` of each of the twelve bins
- the twelve Docker images, built from those tarballs and checked
  (`node scripts/ci/check-images.mjs --tarballs <dir>`): `docker/Dockerfile` with `VARIANT=<variant>`
  and `PACKAGE_SOURCE=tarballs`, so each image is this run's code. Each binary answers `--version`
  with its package's version and a `tools/list`; a Streamable HTTP or SSE image also answers
  `/mcp/health` with `200`, passes its own `HEALTHCHECK`, and a `tools/call` with `x-sap-*` basic
  credentials reaches an ADT stand-in (`scripts/ci/adt-stand-in.mjs`, a container on the check's own
  Docker network) with exactly that credential. A `-ro` image lists no write tool, and its write
  sibling does. The images and containers are removed at the end.
- `docker/Dockerfile.inspect` (the Glama reference) built and its `mcp-abap-adt --version` run — when
  its pinned `core` version is on npm; before the release is published the step says so and builds
  nothing.

## Release (`release.yml`)

**Trigger:** a pushed tag matching `v*.*.*`.

**Permissions:** `contents: write` (to create the release).

**Jobs:**
1. `test` — Ubuntu × Node 22 and 24: `npm ci`, Biome lint (root and each package's
   `lint:check`), build, test type-check, tests, the server, http, sse, background-runs-memory and
   responsible-rules tests; on Node 22 also what CI runs on Ubuntu / Node 22 alone: `npm pack` of the
   seventeen packages, the install of the tarballs and the twelve bins, the twelve Docker images
   built from the tarballs and checked, and the Glama reference image when its version is on npm.
2. `release` — after `test` passes: creates a GitHub Release for the tag with
   `softprops/action-gh-release` and generated release notes. No package or other file is
   attached.

npm publishing is a manual step — see [RELEASE.md](./RELEASE.md).

## Troubleshooting

- **Release workflow did not trigger**: the tag must start with `v` and match `v*.*.*`, and it
  must be pushed (`git push origin v<version>`).
- **Release failed**: read the `test` job's log — a failing lint, build or test stops the release.

## Status badges

```markdown
[![Release](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/release.yml/badge.svg)](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/release.yml)
[![CI](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/ci.yml/badge.svg)](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/ci.yml)
```

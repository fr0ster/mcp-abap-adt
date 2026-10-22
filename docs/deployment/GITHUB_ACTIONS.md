# GitHub Actions

The repository has two workflows, both in `.github/workflows/`. Neither publishes to npm or to
the MCP Registry, and neither needs a secret beyond the built-in `GITHUB_TOKEN`.

## CI (`ci.yml`)

**Trigger:** push to `main` or `develop`; pull requests to `main` or `develop`.

**Matrix:** `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 22 and 24.

**Every job is capped by `timeout-minutes`** (45 for a test job, 10 for the release job), so a
hung test ends the run instead of GitHub's 6-hour default.

**Steps, on every combination:**
1. `npm ci --ignore-scripts` — no dependency's install script runs (see "Install scripts" below)
2. Biome lint: `npm run lint:check -- --diagnostic-level=error`, then each package's `lint:check`
   (`server`, `http`, `sse`, `compact`, `compact-readonly-entries`, `compact-modify`, `background-runs-memory`,
   `responsible-rules`, `server-runtime`, `compact-http`, `compact-sse` and the six `-ro` packages)
3. `npm run build`
4. Test type-check: `npm run test:check`
5. `npm test` — every package's suites, once: the root `package.json` holds the one Jest configuration, and its roots
   name the root `src` and every package's `src`
6. The server-runtime, server, http, sse, background-runs-memory and responsible-rules test type-check:
   `npm --prefix <dir> run test:check` (since 19.2.0 the transports' launch code and its suites live in `server-runtime`;
   `server`, `http` and `sse` keep the test of their own entry points)

Every step gates the run; none is `continue-on-error` — except the whole-tree audit below, until the
Jest follow-up.

**On Ubuntu / Node 22 only:**
- `npm audit --omit=dev --audit-level=moderate` — what the packages ship, at moderate and above; gates
- `npm audit --audit-level=moderate` — the whole tree, dev dependencies included, printed and **not
  gating** (`continue-on-error`): its one remaining advisory, `sprintf-js` (no fixed release), is
  reached only through Jest, and moving the suites off Jest is the follow-up after 20.0.0 (see the
  20.0.0 changelog). It is the one step that does not gate.
- `npm pack` of all eighteen packages (`lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`,
  `compact-modify`, `server-runtime`, `http`, `sse`, `core`, `compact`, `compact-http`, `compact-sse`, `core-ro`,
  `http-ro`, `sse-ro`, `compact-ro`, `compact-http-ro`, `compact-sse-ro`)
- an install of the eighteen tarballs into an empty directory (`--ignore-scripts`: it is outside the
  checkout and its `.npmrc`), a check that no package resolved a
  sibling — a dependency or a peer — other than the one built in that run (a nested copy is one the
  registry supplied), and
  `--version` and `--help` of each of the twelve bins
- the twelve Docker images, built from those tarballs and checked
  (`node scripts/ci/check-images.mjs --tarballs <dir>`): `docker/Dockerfile` with `VARIANT=<variant>`
  and `PACKAGE_SOURCE=tarballs`, so each image is this run's code: every package of the release in the
  image (`server-runtime` always among them) was installed from its tarball, none from the registry. Each
  binary answers `--version`
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
1. `test` — Ubuntu × Node 22 and 24: `npm ci --ignore-scripts`, the two audits CI runs (the whole-tree one not gating), Biome lint (root and each package's
   `lint:check`), build, test type-check, tests (every package's, in the one root `npm test`), the
   server-runtime, server, http, sse, background-runs-memory and responsible-rules test type-check; on Node 22 also what CI runs on Ubuntu / Node 22 alone: `npm pack` of the
   eighteen packages, the install of the tarballs and the twelve bins, the twelve Docker images
   built from the tarballs and checked, and the Glama reference image when its version is on npm.
2. `release` — after `test` passes: creates a GitHub Release for the tag with
   `softprops/action-gh-release` and generated release notes. No package or other file is
   attached.

npm publishing is a manual step — see [RELEASE.md](./RELEASE.md).

## Install scripts

No workflow runs a dependency's install script, and nothing calls `npx`. `package.json`
`allowScripts` names every dependency that has one and denies it, and `.npmrc` sets
`strict-allow-scripts=true`, so a new dependency with an unreviewed install script fails the install
instead of running it; `.npmrc` also sets `min-release-age=7` (the `@mcp-abap-adt/*` scope excluded).
npm reads those settings in full from 11.19.0; the Node 22 runner's npm 10 reads none of them, so
the workflows install with `--ignore-scripts`. `src/__tests__/unit/ci/workflowInventory.test.ts`
holds both workflows, the package scripts and the git hook to this.

## Troubleshooting

- **Release workflow did not trigger**: the tag must start with `v` and match `v*.*.*`, and it
  must be pushed (`git push origin v<version>`).
- **Release failed**: read the `test` job's log — a failing lint, build or test stops the release.

## Status badges

```markdown
[![Release](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/release.yml/badge.svg)](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/release.yml)
[![CI](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/ci.yml/badge.svg)](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/ci.yml)
```

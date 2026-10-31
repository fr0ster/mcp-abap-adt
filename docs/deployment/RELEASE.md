# Release Process

How a release of this repository is made. Two things happen, and only one of them is automated:

- **npm publishing is manual**, from a maintainer's machine: `npm run release:publish`
  (`scripts/publish-all.sh`). No workflow publishes to npm.
- **The GitHub Release is automated**: pushing a `v*.*.*` tag runs `.github/workflows/release.yml`,
  which tests the tag and creates a GitHub Release with generated notes. It attaches no files.

## The eighteen packages

In publish order (`scripts/publish-all.sh`), which is dependency order. "Peers" are
`peerDependencies` (each also in `devDependencies`, for its own build and tests):

| Directory | Package | Depends on (siblings) | Peers |
|---|---|---|---|
| `.` | `@mcp-abap-adt/lib` | — | — |
| `background-runs-memory/` | `@mcp-abap-adt/background-runs-memory` | — | `lib` |
| `responsible-rules/` | `@mcp-abap-adt/responsible-rules` | — | `lib` |
| `compact-readonly-entries/` | `@mcp-abap-adt/compact-readonly-entries` | — | `lib` |
| `compact-modify/` | `@mcp-abap-adt/compact-modify` | — | `lib` |
| `server-runtime/` | `@mcp-abap-adt/server-runtime` (no bin) | — (the auth chain, `connection`, `logger`, `@modelcontextprotocol/sdk`, `express`, `dotenv`) | `lib`, `background-runs-memory`, `responsible-rules` |
| `server/` | `@mcp-abap-adt/core` (bin `mcp-abap-adt`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` | — |
| `http/` | `@mcp-abap-adt/http` (bin `mcp-abap-adt-http`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` | — |
| `sse/` | `@mcp-abap-adt/sse` (bin `mcp-abap-adt-sse`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` | — |
| `compact/` | `@mcp-abap-adt/compact` (bin `mcp-abap-adt-compact`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`, `compact-modify` | — |
| `compact-http/` | `@mcp-abap-adt/compact-http` (bin `mcp-abap-adt-compact-http`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`, `compact-modify` | — |
| `compact-sse/` | `@mcp-abap-adt/compact-sse` (bin `mcp-abap-adt-compact-sse`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`, `compact-modify` | — |
| `core-ro/` | `@mcp-abap-adt/core-ro` (bin `mcp-abap-adt-ro`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` | — |
| `http-ro/` | `@mcp-abap-adt/http-ro` (bin `mcp-abap-adt-http-ro`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` | — |
| `sse-ro/` | `@mcp-abap-adt/sse-ro` (bin `mcp-abap-adt-sse-ro`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` | — |
| `compact-ro/` | `@mcp-abap-adt/compact-ro` (bin `mcp-abap-adt-compact-ro`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries` | — |
| `compact-http-ro/` | `@mcp-abap-adt/compact-http-ro` (bin `mcp-abap-adt-compact-http-ro`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries` | — |
| `compact-sse-ro/` | `@mcp-abap-adt/compact-sse-ro` (bin `mcp-abap-adt-compact-sse-ro`) | `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries` | — |

**No binary package depends on another binary package**, and `lib` is in `dependencies` of the
twelve binary packages only: every package below them takes it as a peer, so one install tree
holds the binary's one copy (see
[One `lib` per server process](../architecture/README.md#one-lib-per-server-process-1920)).
`src/__tests__/unit/packages/packageSet.test.ts` and `dependencyRule.test.ts` hold the rule. The
twelve binary packages depend on no other one, so their order among themselves does not matter;
`server-runtime` and the packages below it must be on npm first.

They are **not** npm workspaces: each is published by path. `scripts/publish-all.sh` publishes
them in the order above, skips any `name@version` already on npm, and aborts on the first failure
so that no package goes out on top of a dependency that is missing.
`src/__tests__/unit/packages/packageSet.test.ts` keeps every range a registry range (no `file:`,
`link:`, `workspace:`) and the lockfile free of links.

## Steps

1. **Bump every manifest** — the eighteen above — and in each, the ranges on sibling packages
   (`@mcp-abap-adt/lib`, `background-runs-memory`, `responsible-rules`, `server-runtime`,
   `compact-readonly-entries`, `compact-modify`), in `dependencies`, `peerDependencies` and
   `devDependencies` alike, so they accept the new versions. A manifest left at an old version is silently skipped by the
   publish script ("already on npm"). Then refresh the lockfile:
   ```bash
   npm install --package-lock-only
   ```
   Every range must be a semver range that resolves on the registry (no `file:`, `link:` or
   `workspace:`).
2. **Bump the registry and Glama metadata** — part of the release, in the same PR:
   - the twelve registry entries — `server.json`, `server-compact.json`, `server-ro.json`,
     `server-compact-ro.json`, `server-http.json`, `server-compact-http.json`, `server-http-ro.json`,
     `server-compact-http-ro.json`, `server-sse.json`, `server-compact-sse.json`,
     `server-sse-ro.json`, `server-compact-sse-ro.json`: both version fields each, at the version of
     the package the entry names, and a description of at most 100 characters (see
     [MCP_REGISTRY.md](./MCP_REGISTRY.md));
   - `docker/Dockerfile.inspect.onprem` and `docker/Dockerfile.inspect.cloud`: `ARG CORE_VERSION=<version>` — the images Glama builds, pinned so a
     rebuild cannot put a newer package under an older release number;
   - `glama.json`: the description, when what the server does changed.

   `src/__tests__/unit/releaseMetadata.test.ts` fails until the versions agree with the manifests,
   and also when a server package has no entry, an entry names another package or transport, or
   `docker/Dockerfile` has no stage for a variant.
   Glama picks the release up by itself from npm and the repository; nothing is set there by hand.
3. **Update `CHANGELOG.md` and the documentation** the change touches; for a breaking release, a
   migration note (`docs/MIGRATION-<major>.0.md`). If tools changed, regenerate the tool lists with
   `npm run docs:tools`.
4. **Build and test**:
   ```bash
   npm ci --ignore-scripts   # as the workflows do: no dependency's install script runs
   npm run prepare           # only to install this checkout's git hook (husky)
   npm run build          # all eighteen packages
   npm run test:check
   npm test               # every package's suites, once; includes binSmoke (packs all eighteen, installs them, runs the twelve bins)
                          # and the install matrix (one lib per process in every layout)
   npm --prefix server-runtime run test:check
   npm --prefix server run test:check
   npm --prefix http run test:check
   npm --prefix sse run test:check
   npm --prefix background-runs-memory run test:check
   npm --prefix responsible-rules run test:check
   ```
   With Docker, the images as CI builds them — every package packed into one directory, then:
   ```bash
   node scripts/ci/check-images.mjs --tarballs <directory>
   ```
5. **Rehearse the publish**:
   ```bash
   npm run release:dry    # must end with "Published: 18  Skipped: 0"
   ```
6. **Merge**, then tag the merge commit and push the tag:
   ```bash
   git tag v<version>
   git push origin v<version>
   ```
   `release.yml` runs the tests on Node 22 and 24 and, if they pass, creates the GitHub Release.
7. **Publish to npm**:
   ```bash
   npm run release:publish
   ```
   On the first package a browser window may open for 2FA. If a publish fails (often a dropped
   login: `npm whoami`, `npm login`), re-run: packages already on npm are skipped.
8. **Publish the registry entries** — twelve commands, one per server package
   (`mcp-publisher publish` alone takes `./server.json` only):
   ```bash
   mcp-publisher login github      # once per session
   for entry in server.json server-compact.json server-ro.json server-compact-ro.json \
     server-http.json server-compact-http.json server-http-ro.json server-compact-http-ro.json \
     server-sse.json server-compact-sse.json server-sse-ro.json server-compact-sse-ro.json; do
     mcp-publisher publish "$entry"
   done
   ```
   See [MCP_REGISTRY.md](./MCP_REGISTRY.md). npm may answer the new version only a few minutes after
   the publish; install with `--prefer-online` if it still says `ETARGET`.
9. **Check an installed copy**, outside the repository, from the registry: each wrapper
   installed globally **in one command with its former base** — the layout that loaded two
   copies of `lib` in 19.1.0 — starts, and each of the two binaries answers `--version` with
   exactly `<version>` (and so with no `Two copies of @mcp-abap-adt/lib` line, which exits `1`).
   A fresh prefix per pair keeps the global tree clean. The block runs unchanged in bash and in
   zsh: it splits each entry with parameter expansion (no `set --`, no word splitting) and names
   every binary itself (no glob). It runs in a subshell, so its `exit 1` on a failure ends the
   block, not your terminal, and leaves the failure in `$?`:
   ```bash
   (
     version=<version>          # e.g. 22.0.0
     bindir=bin; suffix=        # Windows (Git Bash): bindir=.; suffix=.cmd
     failed=
     for pair in "core:mcp-abap-adt compact:mcp-abap-adt-compact" \
       "core:mcp-abap-adt core-ro:mcp-abap-adt-ro" \
       "core:mcp-abap-adt compact-ro:mcp-abap-adt-compact-ro" \
       "http:mcp-abap-adt-http compact-http:mcp-abap-adt-compact-http" \
       "http:mcp-abap-adt-http http-ro:mcp-abap-adt-http-ro" \
       "http:mcp-abap-adt-http compact-http-ro:mcp-abap-adt-compact-http-ro" \
       "sse:mcp-abap-adt-sse compact-sse:mcp-abap-adt-compact-sse" \
       "sse:mcp-abap-adt-sse sse-ro:mcp-abap-adt-sse-ro" \
       "sse:mcp-abap-adt-sse compact-sse-ro:mcp-abap-adt-compact-sse-ro"; do
       base=${pair%% *}; wrapper=${pair#* }
       prefix=$(mktemp -d)
       if npm install -g --prefix "$prefix" --prefer-online \
         "@mcp-abap-adt/${base%%:*}@$version" "@mcp-abap-adt/${wrapper%%:*}@$version"; then
         for entry in "$base" "$wrapper"; do
           bin="$prefix/$bindir/${entry#*:}$suffix"
           got=$("$bin" --version 2>&1)
           [ "$got" = "$version" ] || failed="$failed ${entry#*:}[$got]"
         done
       else
         failed="$failed install[${base%%:*}+${wrapper%%:*}]"
       fi
       rm -rf "$prefix"
     done
     if [ -n "$failed" ]; then echo "FAILED:$failed"; exit 1; fi
     echo "OK: nine wrapper+base pairs, every binary answers $version"
   )
   ```
   On Windows a global prefix puts each binary in the prefix itself with three shims
   (`<name>`, `<name>.cmd`, `<name>.ps1`); the block runs the `.cmd` one alone.

## What the workflows check

- `ci.yml` (push and pull request to `main` / `develop`): Ubuntu, macOS and Windows × Node 22 and
  24 — install with `npm ci --ignore-scripts`, Biome lint (root and each package's `lint:check`),
  build, test type-check, tests, the server-runtime, server, http, sse, background-runs-memory and
  responsible-rules test type-check; on Ubuntu / Node 22 also `npm audit --audit-level=moderate`
  (the whole tree, dev dependencies included), `npm pack` of all eighteen packages, an install of
  the tarballs (`--ignore-scripts`) that runs each of the twelve bins' `--version` and `--help`,
  the twelve Docker images built from those tarballs and checked (`scripts/ci/check-images.mjs`),
  and the Glama reference images (`docker/Dockerfile.inspect.onprem`, `docker/Dockerfile.inspect.cloud`) once their pinned `core` is on npm.
- `release.yml` (tag `v*.*.*`): Ubuntu × Node 22 and 24 — the same install and
  `npm audit --audit-level=moderate`, lint, build and tests — on Node 22 also the packing, the
  install, the bins, the twelve images and the Glama reference image —, then a GitHub Release
  (`softprops/action-gh-release`, generated notes).

Every job is capped by `timeout-minutes` (45 for a test job, 10 for the release job), and every
step gates the run.

No workflow publishes an image: the images are built by whoever runs them, from
[`docker/Dockerfile`](../../docker/Dockerfile) (see [DOCKER.md](./DOCKER.md)).

See [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md).

## Version numbering

[Semantic Versioning](https://semver.org/): MAJOR for breaking changes, MINOR for compatible
features, PATCH for fixes.

## Troubleshooting

- **The release workflow did not run**: the tag must match `v*.*.*` and be pushed
  (`git push origin v<version>`).
- **`release:dry` reports `Skipped`** for a package: its manifest still names a version that is
  already on npm.
- **A publish aborted halfway**: fix the cause and run `npm run release:publish` again; it resumes
  after the packages already published.

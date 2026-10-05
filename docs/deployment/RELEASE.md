# Release Process

How a release of this repository is made. Two things happen, and only one of them is automated:

- **npm publishing is manual**, from a maintainer's machine: `npm run release:publish`
  (`scripts/publish-all.sh`). No workflow publishes to npm.
- **The GitHub Release is automated**: pushing a `v*.*.*` tag runs `.github/workflows/release.yml`,
  which tests the tag and creates a GitHub Release with generated notes. It attaches no files.

## The five packages

| Directory | Package | Depends on |
|---|---|---|
| `.` | `@mcp-abap-adt/lib` | — |
| `compact-readonly/` | `@mcp-abap-adt/compact-readonly` | `lib` |
| `compact-modify/` | `@mcp-abap-adt/compact-modify` | `lib` |
| `server/` | `@mcp-abap-adt/core` (bin `mcp-abap-adt`) | `lib` |
| `compact/` | `@mcp-abap-adt/compact` (bin `mcp-abap-adt-compact`) | `lib`, `core`, `compact-readonly`, `compact-modify` |

They are **not** npm workspaces: each is published by path. `scripts/publish-all.sh` publishes
them in the order above (dependency order), skips any `name@version` already on npm, and aborts on
the first failure so that no package goes out on top of a dependency that is missing.

## Steps

1. **Bump every manifest.** `package.json`, `compact-readonly/package.json`,
   `compact-modify/package.json`, `server/package.json`, `compact/package.json` — and in each, the
   ranges on sibling packages (`@mcp-abap-adt/lib`, `core`, `compact-readonly`, `compact-modify`)
   so they accept the new versions. A manifest left at an old version is silently skipped by the
   publish script ("already on npm"). Then refresh the lockfile:
   ```bash
   npm install --package-lock-only
   ```
   Every range must be a semver range that resolves on the registry (no `file:`, `link:` or
   `workspace:`).
2. **Bump the registry metadata**: both version fields in `server.json` and in
   `server-compact.json` (see [MCP_REGISTRY.md](./MCP_REGISTRY.md)).
3. **Update `CHANGELOG.md` and the documentation** the change touches; for a breaking release, a
   migration note (`docs/MIGRATION-<major>.0.md`). If tools changed, regenerate the tool lists with
   `npm run docs:tools`.
4. **Build and test**:
   ```bash
   npm ci
   npm run build          # lib, server, compact-readonly, compact-modify, compact
   npm run test:check
   npm test               # includes binSmoke: packs, installs and runs both commands
   npm --prefix server run test:check
   npm --prefix server test
   ```
5. **Rehearse the publish**:
   ```bash
   npm run release:dry    # must end with "Published: 5  Skipped: 0"
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
8. **Publish the registry entries** (`server.json`, `server-compact.json`) with `mcp-publisher` —
   see [MCP_REGISTRY.md](./MCP_REGISTRY.md).
9. **Check an installed copy**, outside the repository:
   ```bash
   npm install -g @mcp-abap-adt/core@<version>
   mcp-abap-adt --version
   ```

## What the workflows check

- `ci.yml` (push and pull request to `main` / `develop`): Ubuntu, macOS and Windows × Node 22 and
  24 — Biome lint, build, test type-check, tests, server tests; on Ubuntu / Node 22 also
  `npm audit --omit=dev --audit-level=high`, `npm pack` of `lib` and `core`, and an install of both
  tarballs that runs `mcp-abap-adt --help`.
- `release.yml` (tag `v*.*.*`): the same lint, build and tests on Ubuntu × Node 22 and 24, then a
  GitHub Release (`softprops/action-gh-release`, generated notes).

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

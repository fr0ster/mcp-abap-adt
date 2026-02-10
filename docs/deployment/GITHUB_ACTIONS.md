# GitHub Configuration

This directory contains GitHub-specific configuration files.

## Workflows

### 🚀 Release Workflow (`workflows/release.yml`)

Automatically creates GitHub releases when you push a version tag.

**Trigger:** Push tags matching `v*.*.*` (e.g., `v1.1.0`, `v2.0.0`)

**What it does:**
1. Checks out code with submodules
2. Sets up Node.js 18
3. Installs dependencies
4. Builds the project
5. Runs tests (non-blocking)
6. Creates npm package (.tgz)
7. Creates GitHub Release
8. Uploads package as release asset
9. Generates release notes

**Usage:**
```bash
# Bump version
npm version patch  # 1.1.0 -> 1.1.1

# Create and push tag
git tag v1.1.1
git push origin main
git push origin v1.1.1
```

### ✅ CI Workflow (`workflows/ci.yml`)

Runs continuous integration tests on every push and PR.

**Trigger:** 
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

**What it does:**
1. Tests on multiple OS (Ubuntu, macOS, Windows)
2. Tests on multiple Node.js versions (18, 20)
3. Builds and tests the project
4. Verifies package creation
5. Tests package installation

### 📦 Publish to npm (`workflows/publish-npm.yml`)

Optional workflow for publishing to npm registry.

**Trigger:** Manual (workflow_dispatch)

**Setup required:**
1. Set `private: false` in package.json
2. Add NPM_TOKEN to repository secrets
3. Get token from https://www.npmjs.com/settings/[username]/tokens

## Release Process

See [docs/deployment/RELEASE.md](../docs/deployment/RELEASE.md) for detailed release instructions.

### Quick Release

```bash
# 1. Bump version
npm version minor  # or patch, major

# 2. Commit
git add package.json package-lock.json
git commit -m "chore: release v1.2.0"

# 3. Tag and push
git tag v1.2.0
git push origin main --tags
```

## Secrets Configuration

Currently no secrets are required for basic releases.

**Optional (for npm publishing):**
- `NPM_TOKEN` - npm authentication token

**Built-in secrets used:**
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## Permissions

Workflows use these permissions:
- `contents: write` - Required for creating releases
- `GITHUB_TOKEN` - Automatically scoped by GitHub

## Troubleshooting

**Release workflow didn't trigger:**
- Ensure tag starts with `v` (e.g., `v1.0.0`)
- Check tag was pushed: `git push origin v1.0.0`
- Verify workflow file is in `main` branch

**Release failed:**
- Check GitHub Actions logs
- Common issues:
  - Build errors
  - Test failures (should be non-blocking)
  - Permission errors (check GITHUB_TOKEN)

**CI tests failing:**
- Check specific OS/Node.js version matrix
- Tests are allowed to fail without blocking
- Package creation must succeed

## Workflow Status Badges

Add to README.md:

```markdown
[![Release](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/release.yml/badge.svg)](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/release.yml)
[![CI](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/ci.yml/badge.svg)](https://github.com/fr0ster/mcp-abap-adt/actions/workflows/ci.yml)
```

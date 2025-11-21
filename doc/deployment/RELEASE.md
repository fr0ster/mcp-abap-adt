# Release Process

This document describes how to create a new release of MCP ABAP ADT Server.

## Automated Release via GitHub Actions

Releases are automatically created when you push a version tag.

### Steps to Create a Release

1. **Update version in package.json**
   ```bash
   # Edit package.json and update version
   npm version patch  # for 1.1.0 -> 1.1.1
   # or
   npm version minor  # for 1.1.0 -> 1.2.0
   # or
   npm version major  # for 1.1.0 -> 2.0.0
   ```

2. **Commit changes**
   ```bash
   git add package.json
   git commit -m "chore: bump version to 1.2.0"
   ```

3. **Create and push tag**
   ```bash
   # Tag format: v{major}.{minor}.{patch}
   git tag v1.2.0
   git push origin main
   git push origin v1.2.0
   ```

4. **GitHub Actions will automatically:**
   - Checkout code with submodules
   - Install dependencies
   - Build the project
   - Run tests
   - Create npm package (.tgz)
   - Create GitHub Release
   - Upload package as release asset
   - Generate release notes

5. **Download the package**
   - Go to https://github.com/fr0ster/mcp-abap-adt/releases
   - Download the `.tgz` file from the latest release
   - Share with users or install globally

## Manual Release (Alternative)

If you prefer to create releases manually:

```bash
# 1. Build and create package
npm run build
npm pack

# 2. Create release on GitHub UI
# Go to https://github.com/fr0ster/mcp-abap-adt/releases/new
# - Tag version: v1.2.0
# - Release title: MCP ABAP ADT Server v1.2.0
# - Upload the .tgz file
# - Write release notes
# - Publish release
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version (1.x.x -> 2.x.x): Breaking changes
- **MINOR** version (1.1.x -> 1.2.x): New features, backward compatible
- **PATCH** version (1.1.1 -> 1.1.2): Bug fixes, backward compatible

## Release Checklist

Before creating a release:

- [ ] All tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated
- [ ] Version bumped in package.json
- [ ] Submodules are at correct versions
- [ ] README.md installation instructions tested

## CI/CD Pipeline

### Continuous Integration (CI)
- Runs on every push to `main` and `develop` branches
- Runs on every pull request
- Tests on multiple OS (Ubuntu, macOS, Windows)
- Tests on multiple Node.js versions (18, 20)

### Release Workflow
- Triggers only on version tags (`v*.*.*`)
- Builds and packages the project
- Creates GitHub Release with package attached
- Generates release notes automatically

## Troubleshooting

**Release failed to create:**
- Check GitHub Actions logs
- Ensure tag follows `v*.*.*` format
- Verify GITHUB_TOKEN permissions

**Package not attached:**
- Check that `npm pack` succeeded
- Verify package filename matches pattern
- Check workflow file permissions

## Example Release

```bash
# Update version
npm version minor  # 1.1.0 -> 1.2.0

# Commit and push
git add package.json package-lock.json
git commit -m "chore: release v1.2.0"
git push origin main

# Create and push tag
git tag v1.2.0
git push origin v1.2.0

# Wait for GitHub Actions to complete
# Release will be available at:
# https://github.com/fr0ster/mcp-abap-adt/releases/tag/v1.2.0
```

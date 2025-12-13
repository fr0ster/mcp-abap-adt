# Deployment Documentation

This directory contains documentation for deploying and releasing MCP ABAP ADT Server.

## Files

- **[DOCKER.md](./DOCKER.md)** - Complete Docker deployment guide
  - Docker run commands
  - Docker Compose setup
  - nginx reverse proxy configuration
  - Multi-stage builds
  - Production best practices

- **[RELEASE.md](./RELEASE.md)** - Release process documentation
  - Automated releases via GitHub Actions
  - Manual release process
  - Version numbering guidelines
  - Release checklist

## Quick Links

### Docker Deployment

```bash
# Using Docker Compose (recommended)
docker-compose up -d

# Using Docker run
docker run -d -p 3000:3000 --env-file .env mcp-abap-adt
```

See [DOCKER.md](./DOCKER.md) for detailed instructions.

### Creating a Release

```bash
# Bump version
npm version patch  # or minor, major

# Create and push tag
git tag v1.2.0
git push origin main --tags
```

See [RELEASE.md](./RELEASE.md) for detailed instructions.

## Related Documentation

- [Installation Guide](../installation/INSTALLATION.md) - Installation for development
- [CI/CD Configuration](../../.github/README.md) - GitHub Actions workflows
- [User Guide](../user-guide/README.md) - Using the server

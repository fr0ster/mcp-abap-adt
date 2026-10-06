# Development Documentation

Documentation for developers: testing guides, development artifacts, and internal documentation.
Building and running a checkout: [Installation — from source](../installation/INSTALLATION.md#from-source-development).
Releasing: [docs/deployment/RELEASE.md](../deployment/RELEASE.md).

## Files

- **[ASSISTANT_GUIDELINES.md](ASSISTANT_GUIDELINES.md)** - Guidelines for AI assistants working on this project
- **[TEST_CONFIG_YAML_GUIDE.md](TEST_CONFIG_YAML_GUIDE.md)** - Test configuration reference
- **[TEST_SYSTEM_SETUP.md](TEST_SYSTEM_SETUP.md)** - Guide for setting up test systems

## Roadmaps

Work planned but not started or not finished, in [`roadmaps/`](roadmaps/):

- `PORTABLE_CROSS_BUILD_ROADMAP.md` — a portable executable built for another platform

A roadmap that is done or abandoned is deleted; its history is in git.

## Test Documentation

The **[tests/](tests/)** subdirectory contains:

- `README.md` - Test documentation index
- `TESTING_GUIDE.md` - Testing guide
- `TEST_INFRASTRUCTURE.md` - Test infrastructure documentation
- `ORGANIZATION.md` - Test organization
- `TESTING_AUTH.md` - Testing the platform-specific auth stores
- `DEBUGGING.md` - Debugging integration tests
- `CREATE_DOMAIN_TOOL.md` - The CreateDomain tool
- `test-config.yaml.template` - Test configuration template

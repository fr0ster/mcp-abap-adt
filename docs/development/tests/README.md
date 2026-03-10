# Test Documentation

This folder contains all documentation related to testing MCP ABAP ADT handlers.

## 📚 Documentation Files

### [TESTING_GUIDE.md](TESTING_GUIDE.md)
Complete guide for running tests:
- Quick start instructions
- YAML-based test configuration
- Test helper utilities
- Running tests (single, multiple, all)
- Adding new tests
- Troubleshooting

### [TEST_INFRASTRUCTURE.md](TEST_INFRASTRUCTURE.md)
Technical overview of the test infrastructure:
- What was implemented (YAML config, test-helper, test runner)
- File structure
- Usage examples
- Benefits and advantages
- Migration path for legacy tests
- Test coverage status

### [CREATE_DOMAIN_TOOL.md](CREATE_DOMAIN_TOOL.md)
Documentation for the CreateDomain MCP tool:
- Complete API reference
- Workflow steps (lock → create → check → unlock → activate → verify)
- Session management architecture
- Input parameters and response format
- Error handling
- Testing examples

### [DEBUGGING.md](DEBUGGING.md)
Guide for debugging integration tests:
- Environment variables for debugging (DEBUG_TESTS, DEBUG_HANDLERS, etc.)
- Session management debugging
- Lock/Update/Unlock workflow debugging
- Common issues and solutions
- Example debug output

### [test-config.yaml.template](test-config.yaml.template)
Template for test configuration:
- Copy to `tests/test-config.yaml` before running tests
- Update transport requests and system-specific values
- Enable/disable test cases as needed

## Quick Start

1. **Create test configuration**:
   ```bash
   cp tests/test-config.yaml.template tests/test-config.yaml
   ```

2. **Edit only the lines marked `# <- CHANGE`** (3-4 parameters):
   - `environment.default_package` — your dev package
   - `environment.default_transport` — transport request or `""`
   - `shared_dependencies.package` — package for shared objects
   - `shared_dependencies.software_component` — e.g. `LOCAL`

3. **Run tests**:
   ```bash
   npm run build
   npm run test:integration              # All tests
   npm test -- --testPathPatterns=class   # Specific object
   ```

## 📁 Related Files

Test scripts are located in: `tests/`
- `test-helper.js` - Common utilities
- `run-all-tests.js` - Universal test runner
- `test-*.js` - Individual handler tests
- `test-config.yaml` - Your local config (not in git)
- `test-config.yaml.template` - Template for config

## ⚠️ Important Notes

- **Never commit** `tests/test-config.yaml` (contains transport requests)
- **Always use template** to create new test config
- **Update transport requests** before running write operations
- **Build before testing**: `npm run build`

## 🔗 See Also

- [Main README](../../../README.md) - Project overview
- [CHANGELOG](../../../CHANGELOG.md) - Version history
- [Architecture Documentation](../../architecture/) - System architecture and design

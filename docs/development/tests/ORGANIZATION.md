# Test Organization Summary

## 📁 Structure

```
tests/
├── test-config.yaml.template   # Template for test configuration
├── test-config.yaml           # Your local config (NOT IN GIT)
├── test-helper.js             # Common test utilities
├── run-all-tests.js           # Universal test runner
├── test-*.js                  # Individual test scripts
└── README.md                  # Quick reference

doc/tests/
├── README.md                      # Documentation index
├── TESTING_GUIDE.md              # Complete testing guide
├── TEST_INFRASTRUCTURE.md        # Technical overview
├── CREATE_DOMAIN_TOOL.md         # CreateDomain handler docs
└── test-config.yaml.template     # Template reference copy
```

## 🎯 Key Points

### Test Scripts Location: `tests/`
- All executable test files
- Test helper utilities
- Test runner
- Template for configuration

### Documentation Location: `doc/tests/`
- Complete testing guides
- Tool documentation
- Infrastructure overview
- Configuration templates

### Git Tracking
✅ **Tracked in Git**:
- `tests/test-config.yaml.template` - Template only
- `tests/test-helper.js`, `tests/run-all-tests.js`
- `tests/test-*.js` - All test scripts
- `doc/tests/*.md` - All documentation

❌ **NOT Tracked** (in .gitignore):
- `tests/test-config.yaml` - Contains real transport requests

## 🚀 Workflow

1. **First Time Setup**:
   ```bash
   # Copy template to create your local config
   cp tests/test-config.yaml.template tests/test-config.yaml
   
   # Edit with real values
   # - Update transport_request
   # - Update package_name if needed
   # - Enable test cases you want to run
   ```

2. **Run Tests**:
   ```bash
   npm run build
   node tests/run-all-tests.js --list  # See available tests
   node tests/test-create-domain.js    # Run specific test
   node tests/run-all-tests.js         # Run all enabled
   ```

3. **Add New Test**:
   - Add test case to `tests/test-config.yaml.template`
   - Create `tests/test-new-handler.js` using test-helper
   - Update `tests/run-all-tests.js` HANDLER_MAP
   - Document in `doc/tests/` if needed

## 📖 Documentation Reference

- **Quick Start**: `tests/README.md`
- **Full Guide**: `doc/tests/TESTING_GUIDE.md`
- **Technical Details**: `doc/tests/TEST_INFRASTRUCTURE.md`
- **CreateDomain Tool**: `doc/tests/CREATE_DOMAIN_TOOL.md`

## ⚠️ Important

- Never commit `tests/test-config.yaml` (gitignored)
- Always use template as starting point
- Update transport requests before write operations
- Build before testing: `npm run build`

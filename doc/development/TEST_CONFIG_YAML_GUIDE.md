# Test Configuration YAML Guide

**Purpose:** Guidelines for preparing `test-config.yaml` to avoid common testing issues.

## Common Issues and Solutions

### 1. Missing Required Parameters

**Problem:** Test fails with error like `"parameter_name is required in test configuration"`

**Solution:** Ensure all required parameters are present in test case `params` section:
- Check test file for required parameters (usually validated with `if (!testCase.params.paramName)`)
- Refer to `test-config.yaml.template` for complete parameter list
- High-level handler tests may require additional parameters (e.g., `update_source_code` for update step)

**Example:**
```yaml
create_behavior_definition_low:
  test_cases:
    - name: "full_workflow"
      params:
        name: "ZOK_I_CDS_TEST"           # ✅ Required
        description: "Test description"   # ✅ Required
        root_entity: "ZOK_I_CDS_TEST"     # ✅ Required
        implementation_type: "managed"     # ✅ Required
        source_code: |                     # ✅ Required
          # ... source code ...
        update_source_code: |              # ✅ Required for HighHandlers test
          # ... updated source code ...
```

### 2. Placeholder Values Not Replaced

**Problem:** Test fails with error like `"Package name contains placeholder value: <YOUR_PACKAGE_NAME>"`

**Solution:** Replace all placeholder values with actual values:
- `<YOUR_PACKAGE_NAME>` → actual package name (e.g., `ZOK_LOCAL`)
- `<YOUR_TRANSPORT_REQUEST>` → actual transport request (or remove if not needed)
- `<YOUR_OBJECT_NAME>` → actual object name
- Check for placeholders in all string parameters

**Validation:** `resolvePackageName()` and `resolveTransportRequest()` functions validate for placeholders and throw errors if found.

### 3. Missing Parameters for High-Level Handler Tests

**Problem:** High-level handler test fails because it uses low-level test case configuration that lacks high-level specific parameters.

**Example Issue:**
- `BehaviorDefinitionHighHandlers.test.ts` uses `create_behavior_definition_low.full_workflow` test case
- High-level test requires `update_source_code` for update step
- If `update_source_code` is missing, test fails

**Solution:** 
- Add `update_source_code` parameter to test case configuration
- Ensure all parameters needed by high-level handlers are present
- Check test file comments for required parameters

### 4. Incorrect Parameter Names

**Problem:** Parameter exists but with wrong name (e.g., `packageName` instead of `package_name`)

**Solution:** Use exact parameter names as defined in test configuration:
- Use `snake_case` for parameter names (e.g., `package_name`, `transport_request`, `root_entity`)
- Check test file for exact parameter names used in validation
- Refer to `test-config.yaml.template` for correct naming

### 5. Empty or Undefined Values

**Problem:** Parameter exists but is empty string or undefined, causing validation to fail

**Solution:**
- For optional parameters, either provide value or omit parameter entirely
- For required parameters, always provide non-empty value
- Use `default_package` from `environment` section if `package_name` not specified
- Use `default_transport` from `environment` section if `transport_request` not specified

**Example:**
```yaml
params:
  package_name: "ZOK_LOCAL"        # ✅ Explicit value
  # package_name: ""                # ❌ Empty string - may cause issues
  # (omit if using default_package)  # ✅ Omit to use default
```

### 6. Source Code Parameters

**Problem:** `source_code` or `update_source_code` missing or malformed

**Solution:**
- Always use YAML multiline string syntax (`|` or `>-`)
- Ensure proper indentation (source code should be indented under parameter name)
- For behavior definitions, ensure `root_entity` matches actual CDS view name
- For update operations, provide `update_source_code` that differs from initial `source_code`

**Example:**
```yaml
source_code: |
  managed implementation in class zbp_ok_i_cds_test unique;
  strict ( 2 );
  define behavior for ZOK_I_CDS_TEST
  # ... rest of code ...
```

## Quick Checklist

Before running tests, verify:

- [ ] All required parameters are present (check test file for validation)
- [ ] No placeholder values (`<YOUR_*>` patterns) remain
- [ ] Parameter names use correct `snake_case` format
- [ ] `source_code` and `update_source_code` (if needed) are properly formatted
- [ ] `root_entity` refers to existing CDS view (for behavior definitions)
- [ ] `package_name` is set or `default_package` is configured
- [ ] `transport_request` is set or `default_transport` is configured (for non-local packages)
- [ ] High-level handler tests have all required parameters (including `update_source_code` if update step is tested)

## Reference Files

- **Template:** `tests/test-config.yaml.template` - Complete parameter reference
- **Active Config:** `tests/test-config.yaml` - Your test configuration
- **Test Files:** `src/__tests__/integration/*/` - Check for required parameters

## Common Parameter Patterns

### Low-Level Handler Tests
```yaml
params:
  name: "OBJECT_NAME"
  description: "Description"
  package_name: "PACKAGE_NAME"
  transport_request: "TRANSPORT"  # Optional for local packages
  source_code: |
    # ... source code ...
```

### High-Level Handler Tests
```yaml
params:
  name: "OBJECT_NAME"
  description: "Description"
  package_name: "PACKAGE_NAME"
  transport_request: "TRANSPORT"  # Optional for local packages
  source_code: |
    # ... initial source code ...
  update_source_code: |           # Required for update step
    # ... updated source code ...
```

---

**Last Updated:** 2025-01-27


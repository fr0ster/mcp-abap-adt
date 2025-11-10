# Group Activation - Quick Summary

## Purpose
Group activation allows activating **2-3 related ABAP objects together** in a single request.

## Key Points

✅ **Not for mass activation** - Designed for 2-3 related objects only  
✅ **Different endpoint** - Uses `/sap/bc/adt/activation/runs` (not `/activation`)  
✅ **Typical use cases**:
- Class + Test Program
- 2-3 Related CDS Views  
- Table + Structure

## Configuration Example

```yaml
# tests/test-config.yaml
activate_object:
  objects:
    - name: "ZCL_TEST_MCP_01"
      uri: "/sap/bc/adt/oo/classes/zcl_test_mcp_01"
      type: "CLAS/OC"
    - name: "Z_TEST_PROGRAM_01"
      uri: "/sap/bc/adt/programs/programs/z_test_program_01"
      type: "PROG/P"
  preaudit: false
```

## Quick Start

```bash
# 1. Copy template
cp tests/test-config.yaml.template tests/test-config.yaml

# 2. Edit test-config.yaml (add 2-3 objects)

# 3. Build
npm run build

# 4. Test
node tests/test-activate-object.js
```

## Documentation

- 📖 **[tests/README_GROUP_ACTIVATION.md](tests/README_GROUP_ACTIVATION.md)** - Complete guide
- 📋 **[tests/test-config.yaml.template](tests/test-config.yaml.template)** - Template
- 🔧 **[ACTIVATION_ENDPOINT_UPDATE.md](ACTIVATION_ENDPOINT_UPDATE.md)** - Technical details

## Important Notes

⚠️ **Group activation is for 2-3 objects** - not for activating many objects at once  
⚠️ **Use for related objects** - objects that logically belong together  
⚠️ **Individual activation** - Update/Create handlers use different endpoint (`/activation`)

## Endpoints Comparison

| Type | Endpoint | Usage |
|------|----------|-------|
| **Group** | `/sap/bc/adt/activation/runs` | 2-3 related objects |
| **Individual** | `/sap/bc/adt/activation` | Single object in session |

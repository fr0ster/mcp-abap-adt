# Group Activation Testing Guide

## Overview

The `test-activate-object.js` script tests the **group activation** functionality, which allows activating 2-3 ABAP objects together in a single request using the Eclipse ADT API.

## Key Features

- ✅ **Group Activation**: Activate 2-3 objects together (not for mass activation)
- ✅ **Multiple Object Types**: Classes, programs, views, tables, structures, etc.
- ✅ **Pre-audit Option**: Optional pre-activation check
- ✅ **Detailed Results**: Activation status, warnings, and errors

## Endpoint Used

```
POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=false
```

This is different from individual activation (used in Update/Create handlers):
```
POST /sap/bc/adt/activation?method=activate&preauditRequested=true
```

## Configuration

### 1. Copy Template
```bash
cp test-config.yaml.template test-config.yaml
```

### 2. Configure Objects in `test-config.yaml`

#### Example: Activate 2-3 Related Objects
```yaml
activate_object:
  objects:
    - name: "ZCL_TEST_MCP_01"
      type: "CLAS/OC"
    - name: "Z_TEST_PROGRAM_01"
      type: "PROG/P"
  preaudit: false
```

**Note**: 
- URI is **auto-generated** from `name` and `type` - no need to specify it!
- Group activation is designed for 2-3 related objects, not for mass activation of many objects.

## Supported Object Types

| Object Type | Type Code | URI Pattern |
|-------------|-----------|-------------|
| Class | `CLAS/OC` | `/sap/bc/adt/oo/classes/{name}` |
| Program | `PROG/P` | `/sap/bc/adt/programs/programs/{name}` |
| CDS View | `DDLS/DF` | `/sap/bc/adt/ddic/ddl/sources/{name}` |
| Table | `TABL/DT` | `/sap/bc/adt/ddic/tables/{name}` |
| Structure | `STRU/DS` | `/sap/bc/adt/ddic/structures/{name}` |
| Interface | `INTF/OI` | `/sap/bc/adt/oo/interfaces/{name}` |
| Function Group | `FUGR` | `/sap/bc/adt/functions/groups/{name}` |
| Domain | `DOMA/DD` | `/sap/bc/adt/ddic/domains/{name}` |
| Data Element | `DTEL/DE` | `/sap/bc/adt/ddic/dataelements/{name}` |

## Running the Test

### Build First
```bash
npm run build
```

### Run Test
```bash
node tests/test-activate-object.js
```

### Expected Output
```
================================================================================
ActivateObject Handler Test (Universal Object Activation)
================================================================================

📋 Test Parameters:
   Objects Count: 2
   1. ZCL_TEST_MCP_01 (CLAS/OC)
      URI: /sap/bc/adt/oo/classes/zcl_test_mcp_01
   2. Z_TEST_PROGRAM_01 (PROG/P)
      URI: /sap/bc/adt/programs/programs/z_test_program_01
   Pre-audit: false

🚀 Activating objects...

✅ Activation completed!
{
  "success": true,
  "objects_count": 2,
  "objects": [
    {
      "name": "ZCL_TEST_MCP_01",
      "uri": "/sap/bc/adt/oo/classes/zcl_test_mcp_01",
      "type": "CLAS/OC"
    },
    {
      "name": "Z_TEST_PROGRAM_01",
      "uri": "/sap/bc/adt/programs/programs/z_test_program_01",
      "type": "PROG/P"
    }
  ],
  "activation": {
    "activated": true,
    "checked": true,
    "generated": false
  },
  "messages": [],
  "warnings": [],
  "errors": [],
  "message": "Successfully activated 2 object(s)"
}
```

## Parameters

### `objects` (required)
Array of objects to activate. Each object must have:
- **`name`** (required): Object name in uppercase
- **`type`** (required): Object type code (e.g., `CLAS/OC`, `PROG/P`, `DDLS/DF`)
- **`uri`** (optional): Full ADT URI. **Auto-generated** from name and type if not provided

### `preaudit` (optional)
- **Type**: boolean
- **Default**: `true`
- **Description**: Request pre-audit check before activation
- Set to `false` to skip pre-activation checks (faster)

## Response Structure

```typescript
{
  success: boolean,              // Overall success status
  objects_count: number,         // Number of objects activated
  objects: Array<{               // List of activated objects
    name: string,
    uri: string,
    type?: string
  }>,
  activation: {
    activated: boolean,          // Activation executed
    checked: boolean,            // Syntax check executed
    generated: boolean           // Generation executed
  },
  messages: Array<{              // All messages
    type: string,                // 'error', 'warning', 'info'
    text: string,
    line?: number,
    column?: number
  }>,
  warnings: Array<...>,          // Filtered warnings
  errors: Array<...>,            // Filtered errors
  message: string                // Summary message
}
```

## Common Use Cases

### 1. Activate Class and Test Program Together
```yaml
activate_object:
  objects:
    - name: "ZCL_MY_CLASS"
      type: "CLAS/OC"
    - name: "Z_TEST_MY_CLASS"
      type: "PROG/P"
  preaudit: false
```

### 2. Activate Related CDS Views (2-3 views)
```yaml
activate_object:
  objects:
    - name: "ZI_BASIC_VIEW"
      type: "DDLS/DF"
    - name: "ZI_COMPOSITE_VIEW"
      type: "DDLS/DF"
  preaudit: false
```

### 3. Activate Table and Structure
```yaml
activate_object:
  objects:
    - name: "ZZ_TABLE_01"
      type: "TABL/DT"
    - name: "ZZ_STRUCT_01"
      type: "STRU/DS"
  preaudit: true
```

## Troubleshooting

### Error: "Missing activate_object configuration"
**Solution**: Add `activate_object` section to your `test-config.yaml`

### Error: "Object not found"
**Solution**: 
- Verify object exists in SAP system
- Check URI format is correct
- Ensure object name is in uppercase

### Warning: Activation with errors
**Solution**: 
- Check the `errors` array in response
- Fix syntax errors in object source code
- Verify dependencies are activated

### Timeout Issues
**Solution**:
- Reduce number of objects per batch
- Set `preaudit: false` for faster activation
- Check network connectivity

## Best Practices

1. **Group Size**: Use for 2-3 related objects only (not for mass activation)
2. **Pre-audit**: Use `preaudit: true` for production, `false` for development
3. **Dependencies**: Activate objects in dependency order (base → dependent)
4. **Error Handling**: Always check `success` flag and `errors` array
5. **Related Objects**: Group objects that are logically related (e.g., class + test program)

## Related Documentation

- [Testing Guide](../docs/development/tests/TESTING_GUIDE.md) - End-to-end testing steps
- [activationUtils.ts](../src/lib/activationUtils.ts) - Implementation
- [handleActivateObject.ts](../src/handlers/common/low/handleActivateObject.ts) - Handler code

## See Also

- Individual activation (Update/Create handlers) uses different endpoint
- Check [test-config.yaml.template](test-config.yaml.template) for more examples
- Run `node tests/run-all-tests.js --list` to see all available tests

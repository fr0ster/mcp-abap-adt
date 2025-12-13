# Deferred Group Activation

## Overview

Deferred group activation allows activating multiple related objects together in a single request, ensuring consistency and proper dependency resolution.

## Why Deferred Activation?

- Related objects have dependencies (domains → data elements → tables)
- Activating individually can cause errors
- Group activation ensures consistency
- Better error handling

## How to Use

### Step 1: Create All Objects Without Activation

Create all related objects with `activate: false`:

**Example:**
```json
{"domain_name":"ZDOMAIN_001","package_name":"ZOK_LAB","activate":false}
{"data_element_name":"ZDTEL_001","type_name":"ZDOMAIN_001","package_name":"ZOK_LAB","activate":false}
{"table_name":"ZT_TEST_001","ddl_code":"...","package_name":"ZOK_LAB","activate":false}
```

### Step 2: Collect Object References

Collect all object names and types:

```json
{
  "objects": [
    {"name": "ZDOMAIN_001", "type": "DOMA/DD"},
    {"name": "ZDTEL_001", "type": "DTEL/DE"},
    {"name": "ZT_TEST_001", "type": "TABL/DT"},
    {"name": "ZCDS_TEST_001", "type": "DDLS/DF"}
  ]
}
```

### Step 3: Activate as Group

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZDOMAIN_001","type":"DOMA/DD"},{"name":"ZDTEL_001","type":"DTEL/DE"},{"name":"ZT_TEST_001","type":"TABL/DT"},{"name":"ZCDS_TEST_001","type":"DDLS/DF"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":4,"objects":[{"name":"ZDOMAIN_001","type":"DOMA/DD","uri":"/sap/bc/adt/ddic/domains/zdomain_001"},{"name":"ZDTEL_001","type":"DTEL/DE","uri":"/sap/bc/adt/ddic/dataelements/zdtel_001"},{"name":"ZT_TEST_001","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_test_001"},{"name":"ZCDS_TEST_001","type":"DDLS/DF","uri":"/sap/bc/adt/ddic/ddl/sources/zcds_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 4 object(s)"}
```

## Object Type Codes

| Object Type | Type Code |
|------------|-----------|
| Domain | `DOMA/DD` |
| Data Element | `DTEL/DE` |
| Table | `TABL/DT` |
| Structure | `STRU/DS` |
| CDS View | `DDLS/DF` |
| Behavior Definition | `BDEF/BD` |
| Behavior Implementation | `BDEF/BDO` |
| Metadata Extension | `DDLX/EX` |
| Service Definition | `SRVD/SRVD` |
| Class | `CLAS/OC` |
| Interface | `INTF/OI` |
| Program | `PROG/P` |
| Function Group | `FUGR` |
| Function Module | `FUGR/FF` |

## Best Practices

1. **Create without activation**: Always set `activate: false` when creating related objects
2. **Collect references**: Maintain list of all objects to activate
3. **Activate together**: Use single `ActivateObjectLow` call for all related objects
4. **Handle errors**: Check activation response for errors and warnings
5. **Order matters**: Activate in dependency order (domains → data elements → tables → views)


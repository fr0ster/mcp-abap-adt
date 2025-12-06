# Creating and Updating ABAP Function Groups (High-Level)

## Create Function Group

**Tool**: `CreateFunctionGroup`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","description":"Test function group","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":true}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","uri":"/sap/bc/adt/functions/groups/ztest_fg_001","message":"Function group ZTEST_FG_001 created and activated successfully"}
```

---

## Update Function Group

**Tool**: `UpdateFunctionGroup`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","description":"Updated test function group"}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","uri":"/sap/bc/adt/functions/groups/ztest_fg_001","message":"Function group ZTEST_FG_001 metadata updated successfully"}
```


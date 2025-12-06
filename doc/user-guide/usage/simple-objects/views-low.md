# Creating and Updating ABAP CDS Views (Low-Level)

## Step 1: Get Session

**Tool**: `GetSession`

**Request**:
```json
{"force_new":false}
```

**Response**:
```json
{"success":true,"session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

---

## Step 2: Validate View

**Tool**: `ValidateViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"View name ZCDS_TEST_001 is valid and available"}
```

---

## Step 3: Create View

**Tool**: `CreateViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","description":"Test CDS view","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","uri":"/sap/bc/adt/ddic/ddl/sources/zcds_test_001","message":"View created successfully"}
```

---

## Step 4: Lock View

**Tool**: `LockViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"View locked successfully"}
```

---

## Step 5: Check DDL Code BEFORE Update (CRITICAL)

**Tool**: `CheckViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","ddl_code":"@AbapCatalog.sqlViewName: 'ZCDS_TEST_001'\n@AbapCatalog.compiler.compareFilter: true\n@AccessControl.authorizationCheck: #CHECK\n@EndUserText.label: 'Test CDS View'\ndefine view ZCDS_TEST_001 as select from zt_test_001 {\n  key client,\n  key id,\n  name,\n  description\n}","version":"new","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update View (Only if Check Passed)

**Tool**: `UpdateViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","ddl_code":"@AbapCatalog.sqlViewName: 'ZCDS_TEST_001'\n@AbapCatalog.compiler.compareFilter: true\n@AccessControl.authorizationCheck: #CHECK\n@EndUserText.label: 'Test CDS View'\ndefine view ZCDS_TEST_001 as select from zt_test_001 {\n  key client,\n  key id,\n  name,\n  description\n}","lock_handle":"LOCK_HANDLE_123456789","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","message":"View updated successfully"}
```

---

## Step 7: Unlock View

**Tool**: `UnlockViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","message":"View unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate View

**Option A: Individual**

**Tool**: `ActivateViewLow`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"View activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZCDS_TEST_001","type":"DDLS/DF"},{"name":"ZT_TEST_001","type":"TABL/DT"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZCDS_TEST_001","type":"DDLS/DF","uri":"/sap/bc/adt/ddic/ddl/sources/zcds_test_001"},{"name":"ZT_TEST_001","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


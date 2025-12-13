# Creating and Updating ABAP Structures (Low-Level)

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

## Step 2: Validate Structure

**Tool**: `ValidateStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Structure name ZS_TEST_001 is valid and available"}
```

---

## Step 3: Create Structure

**Tool**: `CreateStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","description":"Test structure","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","uri":"/sap/bc/adt/ddic/structures/zs_test_001","message":"Structure created successfully"}
```

---

## Step 4: Lock Structure

**Tool**: `LockStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Structure locked successfully"}
```

---

## Step 5: Check DDL Code BEFORE Update (CRITICAL)

**Tool**: `CheckStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","ddl_code":"@EndUserText.label: 'Test Structure'\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\ndefine structure zs_test_001 {\n  client : abap.clnt;\n  id : abap.char(10);\n  name : abap.char(255);\n}","version":"new","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Structure (Only if Check Passed)

**Tool**: `UpdateStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","ddl_code":"@EndUserText.label: 'Test Structure'\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\ndefine structure zs_test_001 {\n  client : abap.clnt;\n  id : abap.char(10);\n  name : abap.char(255);\n}","lock_handle":"LOCK_HANDLE_123456789","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","message":"Structure updated successfully"}
```

---

## Step 7: Unlock Structure

**Tool**: `UnlockStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","message":"Structure unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Structure

**Option A: Individual**

**Tool**: `ActivateStructureLow`

**Request**:
```json
{"structure_name":"ZS_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Structure activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZS_TEST_001","type":"STRU/DS"},{"name":"ZT_TEST_001","type":"TABL/DT"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZS_TEST_001","type":"STRU/DS","uri":"/sap/bc/adt/ddic/structures/zs_test_001"},{"name":"ZT_TEST_001","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


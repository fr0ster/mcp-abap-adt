# Creating and Updating ABAP Tables (Low-Level)

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

## Step 2: Validate Table

**Tool**: `ValidateTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Table name ZT_TEST_001 is valid and available"}
```

---

## Step 3: Create Table

**Tool**: `CreateTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","description":"Test table","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","uri":"/sap/bc/adt/ddic/tables/zt_test_001","message":"Table created successfully"}
```

---

## Step 4: Lock Table

**Tool**: `LockTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Table locked successfully"}
```

---

## Step 5: Check DDL Code BEFORE Update (CRITICAL)

**Tool**: `CheckTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","ddl_code":"@EndUserText.label : 'Test Table'\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED\ndefine table zt_test_001 {\n  key client : abap.clnt not null;\n  key id : abap.char(10) not null;\n  name : abap.char(255);\n  description : abap.char(500);\n  created_at : abap.dats;\n  created_by : abap.char(12);\n}","version":"new","reporter":"abapCheckRun","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

**Response** (Failed):
```json
{"success":true,"checked":false,"messages":[{"type":"error","text":"Field 'invalid_field' is not defined","line":8,"column":3}],"errors":[{"type":"error","text":"Field 'invalid_field' is not defined","line":8,"column":3}],"warnings":[],"message":"Syntax check failed: 1 error(s)"}
```

---

## Step 6: Update Table (Only if Check Passed)

**Tool**: `UpdateTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","ddl_code":"@EndUserText.label : 'Test Table'\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED\ndefine table zt_test_001 {\n  key client : abap.clnt not null;\n  key id : abap.char(10) not null;\n  name : abap.char(255);\n  description : abap.char(500);\n  created_at : abap.dats;\n  created_by : abap.char(12);\n}","lock_handle":"LOCK_HANDLE_123456789","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","message":"Table updated successfully"}
```

---

## Step 7: Unlock Table

**Tool**: `UnlockTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","message":"Table unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","version":"inactive","reporter":"abapCheckRun","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Table

**Option A: Individual**

**Tool**: `ActivateTableLow`

**Request**:
```json
{"table_name":"ZT_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Table activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZDOMAIN_001","type":"DOMA/DD"},{"name":"ZDTEL_001","type":"DTEL/DE"},{"name":"ZT_TEST_001","type":"TABL/DT"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":3,"objects":[{"name":"ZDOMAIN_001","type":"DOMA/DD","uri":"/sap/bc/adt/ddic/domains/zdomain_001"},{"name":"ZDTEL_001","type":"DTEL/DE","uri":"/sap/bc/adt/ddic/dataelements/zdtel_001"},{"name":"ZT_TEST_001","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 3 object(s)"}
```


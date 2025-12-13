# Creating and Updating ABAP Data Elements (Low-Level)

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

## Step 2: Validate Data Element

**Tool**: `ValidateDataElementLow`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Data element name ZDTEL_TEST_001 is valid and available"}
```

---

## Step 3: Create Data Element

**Tool**: `CreateDataElementLow`

**Request** (Domain-based):
```json
{"data_element_name":"ZDTEL_TEST_001","description":"Test data element","package_name":"ZOK_LAB","transport_request":"E19K905635","type_kind":"E","type_name":"ZDOMAIN_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","uri":"/sap/bc/adt/ddic/dataelements/zdtel_test_001","message":"Data element created successfully"}
```

---

## Step 4: Lock Data Element

**Tool**: `LockDataElementLow`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Data element locked successfully"}
```

---

## Step 5: Check Data Element BEFORE Update (CRITICAL)

**Tool**: `CheckDataElementLow`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Data Element (Only if Check Passed)

**Tool**: `UpdateDataElementLow`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","properties":{"description":"Updated test data element","short_label":"Updated DE","medium_label":"Updated Data Element","long_label":"Updated Data Element Label"},"lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","message":"Data element updated successfully"}
```

---

## Step 7: Unlock Data Element

**Tool**: `UnlockDataElementLow`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","message":"Data element unlocked successfully"}
```

---

## Step 8: Activate Data Element

**Option A: Individual**

**Tool**: `ActivateDataElementLow`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Data element activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZDOMAIN_TEST_001","type":"DOMA/DD"},{"name":"ZDTEL_TEST_001","type":"DTEL/DE"},{"name":"ZT_TEST_TABLE_001","type":"TABL/DT"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":3,"objects":[{"name":"ZDOMAIN_TEST_001","type":"DOMA/DD","uri":"/sap/bc/adt/ddic/domains/zdomain_test_001"},{"name":"ZDTEL_TEST_001","type":"DTEL/DE","uri":"/sap/bc/adt/ddic/dataelements/zdtel_test_001"},{"name":"ZT_TEST_TABLE_001","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_test_table_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 3 object(s)"}
```


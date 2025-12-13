# Creating and Updating ABAP Interfaces (Low-Level)

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

## Step 2: Validate Interface

**Tool**: `ValidateInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Interface name ZIF_TEST_001 is valid and available"}
```

---

## Step 3: Create Interface

**Tool**: `CreateInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","description":"Test interface","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","uri":"/sap/bc/adt/oo/interfaces/zif_test_001","message":"Interface created successfully"}
```

---

## Step 4: Lock Interface

**Tool**: `LockInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Interface locked successfully"}
```

---

## Step 5: Check Code BEFORE Update (CRITICAL)

**Tool**: `CheckInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","source_code":"INTERFACE zif_test_001\n  PUBLIC.\n\n  METHODS: get_value\n    RETURNING VALUE(rv_result) TYPE string,\n           set_value\n    IMPORTING iv_value TYPE string.\n\nENDINTERFACE.","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Interface (Only if Check Passed)

**Tool**: `UpdateInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","source_code":"INTERFACE zif_test_001\n  PUBLIC.\n\n  METHODS: get_value\n    RETURNING VALUE(rv_result) TYPE string,\n           set_value\n    IMPORTING iv_value TYPE string.\n\nENDINTERFACE.","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","message":"Interface updated successfully"}
```

---

## Step 7: Unlock Interface

**Tool**: `UnlockInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","message":"Interface unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Interface

**Option A: Individual**

**Tool**: `ActivateInterfaceLow`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Interface activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZIF_TEST_001","type":"INTF/OI"},{"name":"ZCL_TEST_001","type":"CLAS/OC"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZIF_TEST_001","type":"INTF/OI","uri":"/sap/bc/adt/oo/interfaces/zif_test_001"},{"name":"ZCL_TEST_001","type":"CLAS/OC","uri":"/sap/bc/adt/oo/classes/zcl_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


# Creating and Updating ABAP Classes (Low-Level)

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

## Step 2: Validate Class

**Tool**: `ValidateClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Class name ZCL_TEST_001 is valid and available"}
```

---

## Step 3: Create Class

**Tool**: `CreateClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","description":"Test class","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","uri":"/sap/bc/adt/oo/classes/zcl_test_001","message":"Class created successfully"}
```

---

## Step 4: Lock Class

**Tool**: `LockClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Class locked successfully"}
```

---

## Step 5: Check Code BEFORE Update (CRITICAL)

**Tool**: `CheckClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","source_code":"CLASS zcl_test_001 DEFINITION\n  PUBLIC\n  FINAL\n  CREATE PUBLIC .\n\n  PUBLIC SECTION.\n    METHODS: constructor,\n             get_data RETURNING VALUE(result) TYPE string.\n  PROTECTED SECTION.\n  PRIVATE SECTION.\n    DATA: mv_data TYPE string.\nENDCLASS.\n\nCLASS zcl_test_001 IMPLEMENTATION.\n  METHOD constructor.\n    mv_data = 'Initialized'.\n  ENDMETHOD.\n\n  METHOD get_data.\n    result = mv_data.\n  ENDMETHOD.\nENDCLASS.","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

**Response** (Failed):
```json
{"success":true,"checked":false,"messages":[{"type":"error","text":"Method 'GET_DATA' is not defined in class definition","line":15,"column":5}],"errors":[{"type":"error","text":"Method 'GET_DATA' is not defined in class definition","line":15,"column":5}],"warnings":[],"message":"Syntax check failed: 1 error(s)"}
```

---

## Step 6: Update Class (Only if Check Passed)

**Tool**: `UpdateClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","source_code":"CLASS zcl_test_001 DEFINITION\n  PUBLIC\n  FINAL\n  CREATE PUBLIC .\n\n  PUBLIC SECTION.\n    METHODS: constructor,\n             get_data RETURNING VALUE(result) TYPE string.\n  PROTECTED SECTION.\n  PRIVATE SECTION.\n    DATA: mv_data TYPE string.\nENDCLASS.\n\nCLASS zcl_test_001 IMPLEMENTATION.\n  METHOD constructor.\n    mv_data = 'Initialized'.\n  ENDMETHOD.\n\n  METHOD get_data.\n    result = mv_data.\n  ENDMETHOD.\nENDCLASS.","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","message":"Class updated successfully"}
```

---

## Step 7: Unlock Class

**Tool**: `UnlockClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","message":"Class unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Class

**Option A: Individual**

**Tool**: `ActivateClassLow`

**Request**:
```json
{"class_name":"ZCL_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Class activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZCL_TEST_001","type":"CLAS/OC"},{"name":"ZCL_TEST_002","type":"CLAS/OC"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZCL_TEST_001","type":"CLAS/OC","uri":"/sap/bc/adt/oo/classes/zcl_test_001"},{"name":"ZCL_TEST_002","type":"CLAS/OC","uri":"/sap/bc/adt/oo/classes/zcl_test_002"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


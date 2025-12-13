# Creating and Updating ABAP Function Modules (Low-Level)

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

## Step 2: Validate Function Module

**Tool**: `ValidateFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Function module name Z_TEST_FM_001 is valid and available"}
```

---

## Step 3: Create Function Module

**Tool**: `CreateFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","description":"Test function module","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","uri":"/sap/bc/adt/functions/groups/ztest_fg_001/functions/z_test_fm_001","message":"Function module created successfully"}
```

---

## Step 4: Lock Function Module

**Tool**: `LockFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","lock_handle":"LOCK_HANDLE_123456789","message":"Function module locked successfully"}
```

---

## Step 5: Check Code BEFORE Update (CRITICAL)

**Tool**: `CheckFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","source_code":"FUNCTION z_test_fm_001.\n*\"----------------------------------------------------------------------\n*\"*\"Local Interface:\n*\"  IMPORTING\n*\"     VALUE(IV_INPUT) TYPE STRING\n*\"  EXPORTING\n*\"     VALUE(EV_OUTPUT) TYPE STRING\n*\"----------------------------------------------------------------------\n  ev_output = iv_input.\nENDFUNCTION.","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Function Module (Only if Check Passed)

**Tool**: `UpdateFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","source_code":"FUNCTION z_test_fm_001.\n*\"----------------------------------------------------------------------\n*\"*\"Local Interface:\n*\"  IMPORTING\n*\"     VALUE(IV_INPUT) TYPE STRING\n*\"  EXPORTING\n*\"     VALUE(EV_OUTPUT) TYPE STRING\n*\"----------------------------------------------------------------------\n  ev_output = iv_input.\nENDFUNCTION.","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","message":"Function module updated successfully"}
```

---

## Step 7: Unlock Function Module

**Tool**: `UnlockFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","message":"Function module unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Function Module

**Option A: Individual**

**Tool**: `ActivateFunctionModuleLow`

**Request**:
```json
{"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Function module activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZTEST_FG_001","type":"FUGR"},{"name":"Z_TEST_FM_001","type":"FUGR/FF"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZTEST_FG_001","type":"FUGR","uri":"/sap/bc/adt/functions/groups/ztest_fg_001"},{"name":"Z_TEST_FM_001","type":"FUGR/FF","uri":"/sap/bc/adt/functions/groups/ztest_fg_001/functions/z_test_fm_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


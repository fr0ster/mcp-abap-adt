# Creating and Updating ABAP Function Groups (Low-Level)

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

## Step 2: Validate Function Group

**Tool**: `ValidateFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Function group name ZTEST_FG_001 is valid and available"}
```

---

## Step 3: Create Function Group

**Tool**: `CreateFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","description":"Test function group","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","uri":"/sap/bc/adt/functions/groups/ztest_fg_001","message":"Function group created successfully"}
```

---

## Step 4: Lock Function Group

**Tool**: `LockFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","lock_handle":"LOCK_HANDLE_123456789","message":"Function group locked successfully"}
```

---

## Step 5: Check Function Group BEFORE Update (CRITICAL)

**Tool**: `CheckFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Function Group (Only if Check Passed)

**Tool**: `UpdateFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","description":"Updated test function group","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","message":"Function group updated successfully"}
```

---

## Step 7: Unlock Function Group

**Tool**: `UnlockFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","message":"Function group unlocked successfully"}
```

---

## Step 8: Activate Function Group

**Option A: Individual**

**Tool**: `ActivateFunctionGroupLow`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"function_group_name":"ZTEST_FG_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Function group activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZTEST_FG_001","type":"FUGR"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":1,"objects":[{"name":"ZTEST_FG_001","type":"FUGR","uri":"/sap/bc/adt/functions/groups/ztest_fg_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 1 object(s)"}
```


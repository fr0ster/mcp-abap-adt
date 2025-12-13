# Creating and Updating ABAP Programs (Low-Level)

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

## Step 2: Validate Program

**Tool**: `ValidateProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Program name Z_TEST_PROG_001 is valid and available"}
```

---

## Step 3: Create Program

**Tool**: `CreateProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","description":"Test program","package_name":"ZOK_LAB","transport_request":"E19K905635","program_type":"executable","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","uri":"/sap/bc/adt/programs/programs/z_test_prog_001","message":"Program created successfully"}
```

---

## Step 4: Lock Program

**Tool**: `LockProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","lock_handle":"LOCK_HANDLE_123456789","message":"Program locked successfully"}
```

---

## Step 5: Check Code BEFORE Update (CRITICAL)

**Tool**: `CheckProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","source_code":"REPORT z_test_prog_001.\n\nDATA: lv_message TYPE string VALUE 'Hello World'.\n\nSTART-OF-SELECTION.\n  WRITE: / lv_message.","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Program (Only if Check Passed)

**Tool**: `UpdateProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","source_code":"REPORT z_test_prog_001.\n\nDATA: lv_message TYPE string VALUE 'Hello World'.\n\nSTART-OF-SELECTION.\n  WRITE: / lv_message.","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","message":"Program updated successfully"}
```

---

## Step 7: Unlock Program

**Tool**: `UnlockProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","message":"Program unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Program

**Option A: Individual**

**Tool**: `ActivateProgramLow`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Program activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"Z_TEST_PROG_001","type":"PROG/P"},{"name":"Z_TEST_PROG_002","type":"PROG/P"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"Z_TEST_PROG_001","type":"PROG/P","uri":"/sap/bc/adt/programs/programs/z_test_prog_001"},{"name":"Z_TEST_PROG_002","type":"PROG/P","uri":"/sap/bc/adt/programs/programs/z_test_prog_002"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


# Creating and Updating ABAP Service Definitions (Low-Level)

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

## Step 2: Validate Service Definition

**Tool**: `ValidateServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Service definition name ZSD_TEST_001 is valid and available"}
```

---

## Step 3: Create Service Definition

**Tool**: `CreateServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","description":"Test service definition","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","uri":"/sap/bc/adt/core/srvb/srvbdefinitions/zsd_test_001","message":"Service definition created successfully"}
```

---

## Step 4: Lock Service Definition

**Tool**: `LockServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Service definition locked successfully"}
```

---

## Step 5: Check Code BEFORE Update (CRITICAL)

**Tool**: `CheckServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","source_code":"@EndUserText.label: 'Test Service Definition'\ndefine service ZSD_TEST_001 {\n  expose ZCDS_TEST_001 as TestView;\n}","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response** (Passed):
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Service Definition (Only if Check Passed)

**Tool**: `UpdateServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","source_code":"@EndUserText.label: 'Test Service Definition'\ndefine service ZSD_TEST_001 {\n  expose ZCDS_TEST_001 as TestView;\n}","lock_handle":"LOCK_HANDLE_123456789","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","message":"Service definition updated successfully"}
```

---

## Step 7: Unlock Service Definition

**Tool**: `UnlockServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","message":"Service definition unlocked successfully"}
```

---

## Step 8: Check Inactive Version

**Tool**: `CheckServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","version":"inactive","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 9: Activate Service Definition

**Option A: Individual**

**Tool**: `ActivateServiceDefinitionLow`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Service definition activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZCDS_TEST_001","type":"DDLS/DF"},{"name":"ZSD_TEST_001","type":"SRVD/SRVD"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZCDS_TEST_001","type":"DDLS/DF","uri":"/sap/bc/adt/ddic/ddl/sources/zcds_test_001"},{"name":"ZSD_TEST_001","type":"SRVD/SRVD","uri":"/sap/bc/adt/core/srvb/srvbdefinitions/zsd_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


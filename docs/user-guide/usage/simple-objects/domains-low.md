# Creating and Updating ABAP Domains (Low-Level)

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

## Step 2: Validate Domain

**Tool**: `ValidateDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","package_name":"ZOK_LAB","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"valid":true,"message":"Domain name ZDOMAIN_TEST_001 is valid and available"}
```

---

## Step 3: Create Domain

**Tool**: `CreateDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","description":"Test domain","package_name":"ZOK_LAB","transport_request":"E19K905635","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","uri":"/sap/bc/adt/ddic/domains/zdomain_test_001","message":"Domain created successfully"}
```

---

## Step 4: Lock Domain

**Tool**: `LockDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","lock_handle":"LOCK_HANDLE_123456789","message":"Domain locked successfully"}
```

---

## Step 5: Check Domain BEFORE Update (CRITICAL)

**Tool**: `CheckDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"checked":true,"messages":[],"errors":[],"warnings":[],"message":"Syntax check passed"}
```

---

## Step 6: Update Domain (Only if Check Passed)

**Tool**: `UpdateDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","properties":{"description":"Updated test domain","datatype":"CHAR","length":20,"decimals":0},"lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","message":"Domain updated successfully"}
```

---

## Step 7: Unlock Domain

**Tool**: `UnlockDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","lock_handle":"LOCK_HANDLE_123456789","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","message":"Domain unlocked successfully"}
```

---

## Step 8: Activate Domain

**Option A: Individual**

**Tool**: `ActivateDomainLow`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","session_id":"a1b2c3d4e5f6789012345678901234567890abcd","session_state":{"cookies":"SAP_SESSIONID_E19_100=xyz123abc; Path=/; HttpOnly","csrf_token":"AbCdEf123456","cookie_store":{}}}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Domain activated successfully"}
```

**Option B: Group Activation**

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZDOMAIN_TEST_001","type":"DOMA/DD"},{"name":"ZDTEL_TEST_001","type":"DTEL/DE"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":2,"objects":[{"name":"ZDOMAIN_TEST_001","type":"DOMA/DD","uri":"/sap/bc/adt/ddic/domains/zdomain_test_001"},{"name":"ZDTEL_TEST_001","type":"DTEL/DE","uri":"/sap/bc/adt/ddic/dataelements/zdtel_test_001"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 2 object(s)"}
```


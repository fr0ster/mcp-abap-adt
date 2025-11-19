# Stateful Session Management in SAP ADT API

## Overview

This guide (root/server perspective) explains how MCP handlers coordinate **stateful ADT sessions**.  
Proper session management is **critical** for operations that modify ABAP objects (update source code, create/modify dictionary objects, etc.).

### Related Guides

| View | File |
|------|------|
| Server / MCP handlers (this file) | `doc/STATEFUL_SESSION_GUIDE.md` |
| ADT clients / Builders | `packages/adt-clients/docs/STATEFUL_SESSION_GUIDE.md` |
| Connection layer / HTTP session | `packages/connection/docs/STATEFUL_SESSION_GUIDE.md` |

Use all three when you need the full picture (HTTP session ↔ ADT session ↔ handler workflow).

---

## Table of Contents

1. [Stateful Sessions](#stateful-sessions)
2. [Lock Mechanism](#lock-mechanism)
3. [Cookie Management](#cookie-management)
4. [Complete Workflow Examples](#complete-workflow-examples)
5. [Common Pitfalls](#common-pitfalls)
6. [Troubleshooting](#troubleshooting)

---

## Stateful Sessions

### What is a Stateful Session?

A stateful session in SAP ADT API ensures that multiple related requests (LOCK → PUT → UNLOCK) are executed within the same SAP session context. This is required for:
- Lock acquisition and release
- Modifying ABAP objects
- Transport request handling
- Consistent transaction context

### How to Create a Stateful Session

#### 1. Generate Session ID

Each stateful session requires a unique `sap-adt-connection-id`:

```typescript
import * as crypto from 'crypto';

function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
```

Example: `a1b2c3d4e5f6789012345678901234567890abcd`

#### 2. Generate Request ID

Each individual request within a session needs a unique `sap-adt-request-id`:

```typescript
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
```

#### 3. Required Headers for Stateful Requests

Every request in a stateful session MUST include these headers:

```typescript
const headers = {
  'sap-adt-connection-id': sessionId,        // Same for all requests in session
  'sap-adt-request-id': requestId,           // Unique for each request
  'x-sap-adt-sessiontype': 'stateful',       // Declares stateful session
  'X-sap-adt-profiling': 'server-time',      // Optional: performance profiling
  // + any operation-specific headers
};
```

**CRITICAL**: 
- `sap-adt-connection-id` MUST be the **same** for all requests (LOCK, PUT, UNLOCK) in one operation
- `sap-adt-request-id` MUST be **different** for each request
- Cookies MUST be preserved between requests (handled automatically by BaseAbapConnection)

---

## Lock Mechanism

### Lock Workflow

All modify operations follow this pattern:

```
1. LOCK   - Acquire exclusive lock on object
2. PUT    - Modify object (upload source, change metadata, etc.)
3. UNLOCK - Release lock
```

**CRITICAL**: If lock is not released (due to error or crash), object remains locked until:
- Session timeout
- Manual unlock via transaction SM12
- System restart

### Step 1: Lock Object

> 🆕 Prefer using `new LockClient(connection).lock({ objectType: 'class', objectName: 'ZCL_TEST' })`.  
> It wraps the workflow below, logs `[LOCK] ...` lines, and records lock handles in `.locks/active-locks.json` for recovery.

#### LOCK Request

**Method**: `POST`

**URL Pattern**: 
```
/sap/bc/adt/<object-path>?_action=LOCK&accessMode=MODIFY
```

Examples:
- Class: `/sap/bc/adt/oo/classes/zcl_test?_action=LOCK&accessMode=MODIFY`
- Program: `/sap/bc/adt/programs/programs/z_test?_action=LOCK&accessMode=MODIFY`
- Table: `/sap/bc/adt/ddic/tables/ztable?_action=LOCK&accessMode=MODIFY`

**Headers**:
```http
sap-adt-connection-id: <sessionId>
sap-adt-request-id: <requestId>
x-sap-adt-sessiontype: stateful
Accept: application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9
```

**Response**: XML with lock information

```xml
<?xml version="1.0" encoding="utf-8"?>
<asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">
  <asx:values>
    <DATA>
      <LOCK_HANDLE>BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32</LOCK_HANDLE>
      <CORRNR>E19K905635</CORRNR>
      <CORRUSER>OKYSLYTSIA</CORRUSER>
      <CORRTEXT>Transport description</CORRTEXT>
      <IS_LOCAL/>
      <IS_LINK_UP/>
      <MODIFICATION_SUPPORT>NoModification</MODIFICATION_SUPPORT>
      <LINK_UP_MODE/>
      <CORR_LOCKS/>
      <CORR_CONTENTS/>
      <SCOPE_MESSAGES/>
    </DATA>
  </asx:values>
</asx:abap>
```

**Extract Lock Information**:

```typescript
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const result = parser.parse(response.data);

const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
```

**CRITICAL**: 
- `LOCK_HANDLE` is required for PUT and UNLOCK operations
- `CORRNR` (transport number) is required for PUT operation
- If `LOCK_HANDLE` is empty/null, throw error immediately - don't proceed!

### Step 2: Modify Object (PUT)

#### PUT Request

**Method**: `PUT`

**URL Pattern** (with lock parameters):
```
/sap/bc/adt/<object-path>?lockHandle=<LOCK_HANDLE>&corrNr=<CORRNR>
```

Example:
```
PUT /sap/bc/adt/oo/classes/zcl_test/source/main?lockHandle=BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32&corrNr=E19K905635
```

**Headers**:
```http
sap-adt-connection-id: <sessionId>          # SAME as in LOCK request
sap-adt-request-id: <requestId>             # NEW unique ID
x-sap-adt-sessiontype: stateful
Content-Type: text/plain; charset=utf-8
Accept: text/plain
```

**Body**: New source code (plain text)

```abap
CLASS zcl_test DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS: constructor.
ENDCLASS.

CLASS zcl_test IMPLEMENTATION.
  METHOD constructor.
    WRITE: / 'Hello from updated class'.
  ENDMETHOD.
ENDCLASS.
```

**CRITICAL**:
- Lock handle and transport number are passed as **URL parameters**, NOT headers
- `sap-adt-connection-id` MUST be the same as in LOCK request
- Content-Type MUST be `text/plain; charset=utf-8`

### Step 3: Unlock Object

#### UNLOCK Request

**Method**: `POST`

**URL Pattern**:
```
/sap/bc/adt/<object-path>?_action=UNLOCK&lockHandle=<LOCK_HANDLE>
```

Example:
```
POST /sap/bc/adt/oo/classes/zcl_test?_action=UNLOCK&lockHandle=BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32
```

**Headers**:
```http
sap-adt-connection-id: <sessionId>          # SAME as in LOCK and PUT
sap-adt-request-id: <requestId>             # NEW unique ID
x-sap-adt-sessiontype: stateful
```

**CRITICAL**:
- Always unlock in `finally` block or error handler
- If unlock fails, object remains locked
- Lock handle is passed as URL parameter

---

## Cookie Management

### Why Cookies Matter

SAP ADT API uses cookies for:
- Session authentication (SAP_SESSIONID)
- Client context (sap-usercontext)
- Context ID for stateful operations (sap-contextid)

**CRITICAL**: Cookies MUST be preserved and sent with every request in a stateful session.

### How Cookies Work in Our Implementation

#### BaseAbapConnection handles cookies automatically:

1. **CSRF Token Request** - First request creates SAP session and receives cookies:
```typescript
// In BaseAbapConnection.ts
const response = await axios.head(url, { headers: { 'x-csrf-token': 'fetch' } });

// Extract cookies from response
const cookies = response.headers['set-cookie'];
// Store in this.csrfToken and this.cookies
```

2. **Subsequent Requests** - Cookies are automatically added:
```typescript
// In BaseAbapConnection.makeAdtRequest()
const headers = {
  'x-csrf-token': this.csrfToken,
  'Cookie': this.cookies,  // Automatically added
  ...userHeaders
};
```

### Cookie Flow Example

```
Request 1 (CSRF fetch):
→ HEAD /sap/bc/adt/discovery
  Headers: x-csrf-token: fetch
← Response:
  x-csrf-token: AbCdEf123456
  Set-Cookie: SAP_SESSIONID_E19_100=xyz...; sap-usercontext=...

Request 2 (LOCK):
→ POST /sap/bc/adt/oo/classes/zcl_test?_action=LOCK
  Headers: 
    x-csrf-token: AbCdEf123456
    Cookie: SAP_SESSIONID_E19_100=xyz...; sap-usercontext=...
    sap-adt-connection-id: session123
← Response: Lock acquired

Request 3 (PUT):
→ PUT /sap/bc/adt/oo/classes/zcl_test/source/main?lockHandle=...
  Headers:
    x-csrf-token: AbCdEf123456
    Cookie: SAP_SESSIONID_E19_100=xyz...; sap-usercontext=...
    sap-adt-connection-id: session123  # SAME as Request 2
← Response: Source updated

Request 4 (UNLOCK):
→ POST /sap/bc/adt/oo/classes/zcl_test?_action=UNLOCK
  Headers:
    x-csrf-token: AbCdEf123456
    Cookie: SAP_SESSIONID_E19_100=xyz...; sap-usercontext=...
    sap-adt-connection-id: session123  # SAME as Request 2 and 3
← Response: Lock released
```

### Manual Cookie Management (if needed)

If you need to manage cookies manually:

```typescript
// Extract cookies from response
const setCookieHeader = response.headers['set-cookie'];
if (setCookieHeader) {
  const cookies = Array.isArray(setCookieHeader) 
    ? setCookieHeader.join('; ')
    : setCookieHeader;
  
  // Store and reuse in subsequent requests
  this.cookies = cookies;
}

// Add cookies to next request
const headers = {
  'Cookie': this.cookies,
  // ... other headers
};
```

**CRITICAL**: Never mix cookies from different SAP sessions!

---

## Complete Workflow Examples

### Example 1: Update Class Source Code

```typescript
import * as crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';

async function updateClassSource(className: string, newSourceCode: string) {
  // Generate session ID - SAME for all requests
  const sessionId = crypto.randomUUID().replace(/-/g, '');
  let lockHandle: string | null = null;
  
  try {
    // Step 1: LOCK
    const lockUrl = `/sap/bc/adt/oo/classes/${className.toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
    const lockHeaders = {
      'sap-adt-connection-id': sessionId,
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
      'x-sap-adt-sessiontype': 'stateful',
      'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
    };
    
    const lockResponse = await makeAdtRequest(lockUrl, 'POST', lockHeaders);
    
    // Parse lock handle and transport number
    const parser = new XMLParser({ ignoreAttributes: false });
    const result = parser.parse(lockResponse.data);
    lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
    const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
    
    if (!lockHandle) {
      throw new Error('Failed to obtain lock handle');
    }
    
    console.log(`✓ Lock acquired: ${lockHandle}`);
    
    // Step 2: PUT (upload source)
    let putUrl = `/sap/bc/adt/oo/classes/${className.toLowerCase()}/source/main?lockHandle=${lockHandle}`;
    if (corrNr) {
      putUrl += `&corrNr=${corrNr}`;
    }
    
    const putHeaders = {
      'sap-adt-connection-id': sessionId,  // SAME session ID!
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
      'x-sap-adt-sessiontype': 'stateful',
      'Content-Type': 'text/plain; charset=utf-8',
      'Accept': 'text/plain'
    };
    
    await makeAdtRequest(putUrl, 'PUT', putHeaders, newSourceCode);
    console.log(`✓ Source code updated`);
    
    // Step 3: UNLOCK
    const unlockUrl = `/sap/bc/adt/oo/classes/${className.toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
    const unlockHeaders = {
      'sap-adt-connection-id': sessionId,  // SAME session ID!
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
      'x-sap-adt-sessiontype': 'stateful'
    };
    
    await makeAdtRequest(unlockUrl, 'POST', unlockHeaders);
    lockHandle = null;
    console.log(`✓ Lock released`);
    
  } catch (error) {
    // CRITICAL: Always unlock on error
    if (lockHandle) {
      try {
        const unlockUrl = `/sap/bc/adt/oo/classes/${className.toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
        await makeAdtRequest(unlockUrl, 'POST', {
          'sap-adt-connection-id': sessionId,
          'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
          'x-sap-adt-sessiontype': 'stateful'
        });
        console.log('Lock released after error');
      } catch (unlockError) {
        console.error('Failed to unlock after error:', unlockError);
      }
    }
    throw error;
  }
}
```

### Example 2: Update Program Source Code

```typescript
async function updateProgramSource(programName: string, newSourceCode: string) {
  const sessionId = crypto.randomUUID().replace(/-/g, '');
  let lockHandle: string | null = null;
  
  try {
    // Step 1: LOCK
    const lockUrl = `/sap/bc/adt/programs/programs/${programName.toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
    const lockResponse = await makeAdtRequest(lockUrl, 'POST', {
      'sap-adt-connection-id': sessionId,
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
      'x-sap-adt-sessiontype': 'stateful',
      'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
    });
    
    const parser = new XMLParser({ ignoreAttributes: false });
    const result = parser.parse(lockResponse.data);
    lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
    const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
    
    if (!lockHandle) {
      throw new Error('Failed to obtain lock handle');
    }
    
    // Step 2: PUT
    let putUrl = `/sap/bc/adt/programs/programs/${programName.toLowerCase()}/source/main?lockHandle=${lockHandle}`;
    if (corrNr) {
      putUrl += `&corrNr=${corrNr}`;
    }
    
    await makeAdtRequest(putUrl, 'PUT', {
      'sap-adt-connection-id': sessionId,
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
      'x-sap-adt-sessiontype': 'stateful',
      'Content-Type': 'text/plain; charset=utf-8',
      'Accept': 'text/plain'
    }, newSourceCode);
    
    // Step 3: UNLOCK
    const unlockUrl = `/sap/bc/adt/programs/programs/${programName.toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
    await makeAdtRequest(unlockUrl, 'POST', {
      'sap-adt-connection-id': sessionId,
      'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
      'x-sap-adt-sessiontype': 'stateful'
    });
    lockHandle = null;
    
  } catch (error) {
    if (lockHandle) {
      try {
        const unlockUrl = `/sap/bc/adt/programs/programs/${programName.toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
        await makeAdtRequest(unlockUrl, 'POST', {
          'sap-adt-connection-id': sessionId,
          'sap-adt-request-id': crypto.randomUUID().replace(/-/g, ''),
          'x-sap-adt-sessiontype': 'stateful'
        });
      } catch (unlockError) {
        console.error('Failed to unlock:', unlockError);
      }
    }
    throw error;
  }
}
```

---

## Common Pitfalls

### 1. ❌ Different Session IDs for LOCK/PUT/UNLOCK

```typescript
// WRONG - Different session IDs
const lockSessionId = generateSessionId();
await lock(lockSessionId);

const putSessionId = generateSessionId();  // ❌ NEW ID!
await put(putSessionId);  // Will fail with "invalid lock handle"
```

```typescript
// CORRECT - Same session ID
const sessionId = generateSessionId();
await lock(sessionId);
await put(sessionId);   // ✓ Same ID
await unlock(sessionId); // ✓ Same ID
```

### 2. ❌ Lock Handle in Headers Instead of URL

```typescript
// WRONG
const headers = {
  'sap-adt-lockhandle': lockHandle  // ❌ Wrong place!
};
await put('/sap/bc/adt/oo/classes/zcl_test/source/main', headers);
```

```typescript
// CORRECT
const url = `/sap/bc/adt/oo/classes/zcl_test/source/main?lockHandle=${lockHandle}&corrNr=${corrNr}`;
await put(url);  // ✓ In URL
```

### 3. ❌ Not Unlocking on Error

```typescript
// WRONG
try {
  await lock();
  await put();
  await unlock();
} catch (error) {
  throw error;  // ❌ Object stays locked!
}
```

```typescript
// CORRECT
let lockHandle = null;
try {
  lockHandle = await lock();
  await put();
  await unlock();
  lockHandle = null;
} catch (error) {
  if (lockHandle) {
    await unlock();  // ✓ Always unlock
  }
  throw error;
}
```

### 4. ❌ Missing Transport Number in PUT

```typescript
// WRONG
const url = `/sap/bc/adt/oo/classes/zcl_test/source/main?lockHandle=${lockHandle}`;
// ❌ Missing corrNr!
```

```typescript
// CORRECT
const url = `/sap/bc/adt/oo/classes/zcl_test/source/main?lockHandle=${lockHandle}&corrNr=${corrNr}`;
// ✓ Both parameters
```

### 5. ❌ Not Checking Lock Handle

```typescript
// WRONG
const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
await put(lockHandle);  // ❌ May be null/undefined!
```

```typescript
// CORRECT
const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
if (!lockHandle) {
  throw new Error('Failed to obtain lock handle');
}
await put(lockHandle);  // ✓ Validated
```

### 6. ❌ Mixing Cookies from Different Sessions

```typescript
// WRONG - Using global connection for stateful operations
const connection1 = new Connection();
await connection1.lock();

const connection2 = new Connection();  // ❌ Different cookies!
await connection2.put();  // Will fail
```

```typescript
// CORRECT - Use same connection instance
const connection = new Connection();
await connection.lock();
await connection.put();   // ✓ Same cookies
await connection.unlock();
```

---

## Troubleshooting

### Error: "Resource is not locked (invalid lock handle)"

**Symptoms**: HTTP 423, `ExceptionResourceInvalidLockHandle`

**Causes**:
1. Lock handle not passed correctly in PUT URL
2. Different `sap-adt-connection-id` between LOCK and PUT
3. Cookies not preserved between requests
4. Lock handle is null/empty

**Solutions**:
- ✓ Verify lock handle is in URL: `?lockHandle=...&corrNr=...`
- ✓ Check same `sap-adt-connection-id` in all requests
- ✓ Enable DEBUG logging to see actual requests
- ✓ Verify lock handle extracted from XML response

### Error: "User X is currently editing object Y"

**Symptoms**: HTTP error, `ExceptionResourceNoAccess`

**Causes**:
1. Object is locked by another user or session
2. Previous lock was not released (crash, error)

**Solutions**:
- ✓ Check SM12 transaction in SAP for active locks
- ✓ Release stale locks manually via SM12
- ✓ Wait for session timeout (usually 15-30 minutes)
- ✓ Always use try/finally for unlock

### Error: "Session terminated" or "CSRF token invalid"

**Symptoms**: HTTP 403, CSRF token errors

**Causes**:
1. SAP session expired
2. CSRF token not refreshed
3. Cookies lost between requests

**Solutions**:
- ✓ Fetch new CSRF token before operations
- ✓ Verify cookies are preserved in connection
- ✓ Check SAP session timeout settings

### Debugging Tips

#### Enable Debug Logging

```bash
export DEBUG=true  # Linux/Mac
$env:DEBUG = "true"  # PowerShell
```

#### Inspect Requests

```typescript
logger.info(`LOCK URL: ${lockUrl}`);
logger.info(`Session ID: ${sessionId}`);
logger.info(`Lock response: ${JSON.stringify(lockResponse.data)}`);
logger.info(`Lock handle: ${lockHandle}`);
logger.info(`PUT URL: ${putUrl}`);
```

#### Check Parsed XML

```typescript
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const result = parser.parse(response.data);
console.log('Parsed XML:', JSON.stringify(result, null, 2));
```

#### Verify Headers

```typescript
console.log('Request headers:', JSON.stringify(headers, null, 2));
console.log('Response headers:', JSON.stringify(response.headers, null, 2));
```

---

## Summary Checklist

When implementing stateful operations:

- [ ] Generate **one** session ID for entire operation
- [ ] Generate **unique** request ID for each request
- [ ] Add stateful headers to all requests:
  - [ ] `sap-adt-connection-id`
  - [ ] `sap-adt-request-id`
  - [ ] `x-sap-adt-sessiontype: stateful`
- [ ] LOCK: Extract `LOCK_HANDLE` and `CORRNR` from XML response
- [ ] LOCK: Verify lock handle is not null/empty
- [ ] PUT: Pass `lockHandle` and `corrNr` as **URL parameters**
- [ ] PUT: Use correct Content-Type (`text/plain; charset=utf-8`)
- [ ] UNLOCK: Always execute in finally/error handler
- [ ] UNLOCK: Pass `lockHandle` as **URL parameter**
- [ ] Cookies: Preserved automatically by BaseAbapConnection
- [ ] Error handling: Always unlock on errors
- [ ] Logging: Enable DEBUG for troubleshooting

---

## References

- Eclipse ADT API Documentation
- SAP Note: ABAP Development Tools (ADT)
- Transaction SM12: Lock Management
- BaseAbapConnection.ts - Cookie and CSRF management
- handleUpdateClassSource.ts - Complete implementation example

---

**Last Updated**: 2025-11-08  
**Author**: MCP ABAP ADT Development Team  
**Version**: 1.0

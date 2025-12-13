# CreateDomain Tool Documentation

## Overview

The `CreateDomain` tool creates a new ABAP domain in the SAP system through ADT (ABAP Development Tools) API. It executes the complete workflow: lock, create, syntax check, unlock, activate, and verify.

## Architecture Highlights

### Session Management
- **Session ID**: Generated once at the handler level using `crypto.randomUUID()`
- **Scope**: All ADT requests within a single MCP call share the same `sap-adt-connection-id`
- **Request ID**: Each individual ADT request gets a unique `sap-adt-request-id`

### Workflow Steps

```
1. Lock & Create  → PUT /sap/bc/adt/ddic/domains/{name}?lockHandle={handle}&corrNr={transport}
2. Check Syntax   → POST /sap/bc/adt/checkruns
3. Unlock         → POST /sap/bc/adt/ddic/domains/{name}?_action=UNLOCK&lockHandle={handle}
4. Activate       → POST /sap/bc/adt/activation?method=activate&preauditRequested=true
5. Verify         → GET /sap/bc/adt/ddic/domains/{name}?version=workingArea
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domain_name` | string | ✅ | - | Domain name (e.g., `ZZ_TEST_0001`). Must follow SAP naming conventions |
| `description` | string | ❌ | domain_name | Domain description |
| `package_name` | string | ✅ | - | Package name (e.g., `ZOK_LOCAL`, `$TMP`) |
| `transport_request` | string | ✅ | - | Transport request number (e.g., `E19K905635`) |
| `datatype` | string | ❌ | `CHAR` | Data type: `CHAR`, `NUMC`, `DATS`, `TIMS`, `DEC`, `INT1`, `INT2`, `INT4`, `INT8`, `CURR`, `QUAN` |
| `length` | number | ❌ | 100 | Field length (max depends on datatype) |
| `decimals` | number | ❌ | 0 | Decimal places (for `DEC`, `CURR`, `QUAN` types) |
| `conversion_exit` | string | ❌ | - | Conversion exit routine name (without `CONVERSION_EXIT_` prefix) |
| `lowercase` | boolean | ❌ | false | Allow lowercase input |
| `sign_exists` | boolean | ❌ | false | Field has sign (+/-) |
| `value_table` | string | ❌ | - | Value table name for foreign key relationship |

## Example Usage

### Minimal Request
```json
{
  "domain_name": "ZZ_TEST_0001",
  "package_name": "ZOK_LOCAL",
  "transport_request": "E19K905635"
}
```

### Full Request
```json
{
  "domain_name": "ZZ_CUSTOMER_ID",
  "description": "Customer ID Domain",
  "package_name": "ZCUSTOMER",
  "transport_request": "E19K905635",
  "datatype": "CHAR",
  "length": 10,
  "decimals": 0,
  "conversion_exit": "ALPHA",
  "lowercase": false,
  "sign_exists": false,
  "value_table": "ZCUSTOMERS"
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "domain_name": "ZZ_TEST_0001",
  "package": "ZOK_LOCAL",
  "transport_request": "E19K905635",
  "status": "active",
  "session_id": "9887bcfa3a564460843569a9efc55981",
  "message": "Domain ZZ_TEST_0001 created and activated successfully",
  "domain_details": {
    "adtcore:name": "ZZ_TEST_0001",
    "adtcore:type": "DOMA/DD",
    "adtcore:version": "active",
    "adtcore:description": "ZZ_TEST_0001",
    "doma:content": {
      "doma:typeInformation": {
        "doma:datatype": "CHAR",
        "doma:length": "000100",
        "doma:decimals": "000000"
      }
    }
  }
}
```

### Error Response
```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Error: Domain check failed: Syntax error in domain definition"
    }
  ]
}
```

## Error Handling

The tool implements automatic cleanup on errors:

1. **Lock Cleanup**: If any step fails after obtaining a lock, the tool attempts to unlock the domain
2. **Validation**: Required parameters are validated before ADT requests
3. **Syntax Check**: Domain definition is verified before activation
4. **Activation Verification**: Confirms successful activation before returning

## Technical Implementation

### Key Functions

#### `generateSessionId()`
Generates a UUID for the entire MCP call, removing hyphens to match SAP ADT format.

#### `buildDomainXml(args, username)`
Constructs the XML payload for domain creation according to SAP ADT schema `http://www.sap.com/dictionary/domain`.

#### `lockAndCreateDomain(args, sessionId, username)`
Sends PUT request with lock handle and transport request to create the domain.

#### `checkDomainSyntax(domainName, sessionId)`
Validates domain definition using ADT checkrun API.

#### `unlockDomain(domainName, lockHandle, sessionId)`
Releases the lock on the domain object.

#### `activateDomain(domainName, sessionId)`
Activates the domain and performs pre-audit checks.

#### `getDomainForVerification(domainName, sessionId)`
Retrieves the final domain definition to verify successful creation.

## Testing

Run the test script:
```bash
node tests/test-create-domain.js
```

Test parameters can be modified in the script to test different scenarios:
- Different datatypes (CHAR, NUMC, DATS)
- Various lengths and decimals
- Conversion exits
- Value table references

## Known Limitations

1. **Lock Handle**: Currently generates a UUID for lock handle. In production, this should be obtained from an initial GET request to the domain endpoint.
2. **Headers**: The `makeAdtRequestWithTimeout` function needs to be extended to accept custom headers for session/request IDs.
3. **Rollback**: Failed activations leave inactive objects in the system. Consider implementing full rollback (delete) on critical failures.

## Future Enhancements

- [ ] Extend `AbapConnection` to manage session-id automatically
- [ ] Add support for fixed values in domain definition
- [ ] Implement domain modification (update existing domains)
- [ ] Add domain deletion tool
- [ ] Support for append structures in domains
- [ ] Batch domain creation from JSON/CSV

## Related Tools

- `GetTable` - Retrieve table structure (uses domains)
- `GetStructure` - Retrieve structure definition
- `GetTypeInfo` - Get ABAP type information
- `SearchObject` - Find existing domains

## References

- ADT API Research: `doc/ADT_API_RESEARCH.md`
- Domain Creation Flow: `doc/mcp_domain_create.txt`
- SAP ADT Documentation: https://help.sap.com/docs/ABAP_PLATFORM_NEW/

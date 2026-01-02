# Stateful ADT Session Flow

This guide describes the **stateful ADT request flow** required for write operations
(lock/update/unlock) against ABAP via ADT. It is about **protocol behavior**, not
file-based session persistence.

## Why Stateful Matters

Write operations must share:
- the same `sap-adt-connection-id` across LOCK/PUT/UNLOCK
- preserved cookies/CSRF tokens between requests

If these are not consistent, SAP rejects the lock handle or returns CSRF errors.

## Required Headers

Each request in the flow must include:

```
sap-adt-connection-id: <session-id>    # same for all requests
sap-adt-request-id:    <request-id>    # unique per request
x-sap-adt-sessiontype: stateful
```

## Standard Flow

1) **LOCK**  
`POST /sap/bc/adt/<object-path>?_action=LOCK&accessMode=MODIFY`

Response includes `LOCK_HANDLE` and `CORRNR` (transport).

2) **PUT / UPDATE**  
`PUT /sap/bc/adt/<object-path>?lockHandle=<LOCK_HANDLE>&corrNr=<CORRNR>`

3) **UNLOCK**  
`POST /sap/bc/adt/<object-path>?_action=UNLOCK&lockHandle=<LOCK_HANDLE>`

## Common Pitfalls

- **Different session IDs** between LOCK/PUT/UNLOCK
- **New cookies/CSRF** (missing carry-over between requests)
- **Missing lockHandle or corrNr** in update call

## Notes

- Session state may be managed in-memory or by external stores (auth-broker/stores),
  but the ADT flow always requires the same `sap-adt-connection-id` and cookies
  across the stateful sequence.

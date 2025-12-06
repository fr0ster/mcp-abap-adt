# Creating and Updating ABAP Interfaces (High-Level)

## Create Interface

**Tool**: `CreateInterface`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","description":"Test interface","package_name":"ZOK_LAB","transport_request":"E19K905635","source_code":"INTERFACE zif_test_001\n  PUBLIC.\n\n  METHODS: get_value\n    RETURNING VALUE(rv_result) TYPE string.\n\nENDINTERFACE.","activate":true}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","uri":"/sap/bc/adt/oo/interfaces/zif_test_001","message":"Interface ZIF_TEST_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update Interface

**Tool**: `UpdateInterface`

**Request**:
```json
{"interface_name":"ZIF_TEST_001","source_code":"INTERFACE zif_test_001\n  PUBLIC.\n\n  METHODS: get_value\n    RETURNING VALUE(rv_result) TYPE string,\n           set_value\n    IMPORTING iv_value TYPE string.\n\nENDINTERFACE.","activate":true}
```

**Response**:
```json
{"success":true,"interface_name":"ZIF_TEST_001","uri":"/sap/bc/adt/oo/interfaces/zif_test_001","message":"Interface ZIF_TEST_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```


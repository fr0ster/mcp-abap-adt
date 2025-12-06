# Creating and Updating ABAP Classes (High-Level)

## Create Class

**Tool**: `CreateClass`

**Request**:
```json
{"class_name":"ZCL_TEST_001","description":"Test class","package_name":"ZOK_LAB","transport_request":"E19K905635","source_code":"CLASS zcl_test_001 DEFINITION\n  PUBLIC\n  FINAL\n  CREATE PUBLIC .\n\n  PUBLIC SECTION.\n    METHODS: constructor.\n  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\nCLASS zcl_test_001 IMPLEMENTATION.\n  METHOD constructor.\n  ENDMETHOD.\nENDCLASS.","activate":true}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","uri":"/sap/bc/adt/oo/classes/zcl_test_001","message":"Class ZCL_TEST_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update Class

**Tool**: `UpdateClass`

**Request**:
```json
{"class_name":"ZCL_TEST_001","source_code":"CLASS zcl_test_001 DEFINITION\n  PUBLIC\n  FINAL\n  CREATE PUBLIC .\n\n  PUBLIC SECTION.\n    METHODS: constructor,\n             get_data RETURNING VALUE(result) TYPE string.\n  PROTECTED SECTION.\n  PRIVATE SECTION.\n    DATA: mv_data TYPE string.\nENDCLASS.\n\nCLASS zcl_test_001 IMPLEMENTATION.\n  METHOD constructor.\n    mv_data = 'Initialized'.\n  ENDMETHOD.\n\n  METHOD get_data.\n    result = mv_data.\n  ENDMETHOD.\nENDCLASS.","activate":true}
```

**Response**:
```json
{"success":true,"class_name":"ZCL_TEST_001","uri":"/sap/bc/adt/oo/classes/zcl_test_001","message":"Class ZCL_TEST_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```


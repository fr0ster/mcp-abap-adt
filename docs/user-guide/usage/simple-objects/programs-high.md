# Creating and Updating ABAP Programs (High-Level)

## Create Program

**Tool**: `CreateProgram`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","description":"Test program","package_name":"ZOK_LAB","transport_request":"E19K905635","program_type":"executable","source_code":"REPORT z_test_prog_001.\n\nSTART-OF-SELECTION.\n  WRITE: / 'Hello World'.","activate":true}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","uri":"/sap/bc/adt/programs/programs/z_test_prog_001","message":"Program Z_TEST_PROG_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update Program

**Tool**: `UpdateProgram`

**Request**:
```json
{"program_name":"Z_TEST_PROG_001","source_code":"REPORT z_test_prog_001.\n\nDATA: lv_message TYPE string VALUE 'Hello World'.\n\nSTART-OF-SELECTION.\n  WRITE: / lv_message.","activate":true}
```

**Response**:
```json
{"success":true,"program_name":"Z_TEST_PROG_001","uri":"/sap/bc/adt/programs/programs/z_test_prog_001","message":"Program Z_TEST_PROG_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

